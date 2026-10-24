import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface Snapshot {
  commit: string;
  diff: string;
  files: Record<string, string>;
  excluded: string[];
  deleted: string[];
}

function git(root: string, args: string[]): string {
  const result = spawnSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '--literal-pathspecs', '-C', root, ...args],
    {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || 'Git snapshot failed');
  return result.stdout;
}

export function createSnapshot(root: string): Snapshot {
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  const tracked = [
    ...new Set(
      [
        ...git(root, ['ls-files', '-z']).split('\0'),
        ...git(root, ['ls-tree', '-rz', '--name-only', commit]).split('\0'),
      ].filter(Boolean),
    ),
  ];
  const files: Record<string, string> = Object.create(null);
  const excluded: string[] = [];
  const deleted: string[] = [];
  let bytes = 0;
  for (const name of tracked) {
    const absolute = path.resolve(root, name);
    const relative = path.relative(root, absolute);
    if (
      path.isAbsolute(relative) ||
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      /(^|\/)(\.env(?:\..*)?|\.npmrc|\.git|\.cache)(\/|$)|\.(?:pem|key)$/i.test(name) ||
      /^(?:assets|examples)\//.test(name) ||
      name.includes('/dist/') ||
      name === 'bun.lock'
    ) {
      excluded.push(name);
      continue;
    }
    try {
      let cursor = root;
      for (const part of name.split('/')) {
        cursor = path.join(cursor, part);
        if (lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink is outside the snapshot');
      }
      const stat = lstatSync(absolute);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 128 * 1024 ||
        bytes + stat.size > 1024 * 1024
      ) {
        excluded.push(name);
        continue;
      }
      const text = readFileSync(absolute, 'utf8');
      if (text.includes('\0')) {
        excluded.push(name);
        continue;
      }
      files[name] = text;
      bytes += stat.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          const previous = git(root, ['show', `${commit}:${name}`]);
          const size = Buffer.byteLength(previous);
          if (!previous.includes('\0') && size <= 128 * 1024 && bytes + size <= 1024 * 1024) {
            files[name] = previous;
            deleted.push(name);
            bytes += size;
            continue;
          }
        } catch {}
      }
      excluded.push(name);
    }
  }
  if (!Object.keys(files).length) throw new Error('No reviewable files in the snapshot');
  const diff = git(root, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    'HEAD',
    '--',
    ...Object.keys(files),
  ]);
  return { commit, diff, files, excluded, deleted };
}

export interface ReviewFinding {
  severity: 'high' | 'medium' | 'low';
  path: string;
  line: number;
  message: string;
  fix: string;
}
export interface Review {
  summary: string;
  findings: ReviewFinding[];
}

export function validateReviewEvents(events: string, snapshot: Snapshot): Set<string> {
  const parsed = events
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (
    parsed.some(
      (event) =>
        ['command_execution', 'file_change', 'web_search'].includes(event.item?.type) ||
        (event.item?.type === 'mcp_tool_call' && event.item.server !== 'repository'),
    )
  )
    throw new Error('Review attempted a tool outside the snapshot');
  const read = new Set<string>(
    parsed
      .filter(
        (event) =>
          event.type === 'item.completed' &&
          event.item?.type === 'mcp_tool_call' &&
          event.item.server === 'repository' &&
          event.item.tool === 'read_file' &&
          event.item.status === 'completed' &&
          !event.item.error &&
          Object.hasOwn(snapshot.files, event.item.arguments?.path),
      )
      .map((event) => event.item.arguments.path),
  );
  for (const file of ['AGENTS.md', 'package.json', 'skills/skill-anatomy/SKILL.md', 'src/cli.ts']) {
    if (!Object.hasOwn(snapshot.files, file) || !read.has(file))
      throw new Error(`Review did not read required evidence: ${file}`);
  }
  if (!read.size) throw new Error('Review did not read repository evidence');
  return read;
}

export function validateReview(value: unknown, snapshot: Snapshot): Review {
  if (!value || typeof value !== 'object') throw new Error('Review is not an object');
  const review = value as Review;
  if (
    typeof review.summary !== 'string' ||
    !review.summary.trim() ||
    !Array.isArray(review.findings)
  )
    throw new Error('Incomplete review response');
  for (const finding of review.findings) {
    if (
      !finding ||
      !['high', 'medium', 'low'].includes(finding.severity) ||
      typeof finding.path !== 'string' ||
      !Object.hasOwn(snapshot.files, finding.path) ||
      !Number.isInteger(finding.line) ||
      finding.line < 1 ||
      finding.line > snapshot.files[finding.path]!.split('\n').length ||
      typeof finding.message !== 'string' ||
      !finding.message.trim() ||
      typeof finding.fix !== 'string' ||
      !finding.fix.trim()
    )
      throw new Error('Review finding has invalid source evidence');
  }
  return review;
}
