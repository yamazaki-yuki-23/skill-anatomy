import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { inside } from './storage.js';
import type { DiscussionItem, Files, GithubIndex, Target } from './types.js';
export function run(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${program}を起動できません: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(
      `${program}の実行に失敗: ${result.stderr?.toString('utf8').trim() || result.signal || result.status}`,
    );
  return new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
}
export function git(cache: string, args: string[]): string {
  return run('git', ['-c', 'core.hooksPath=/dev/null', '--git-dir', cache, ...args]);
}
export function gitBuffer(cache: string, args: string[], input: string): Buffer {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '--git-dir', cache, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    input,
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`gitを起動できません: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(
      `gitの実行に失敗: ${result.stderr?.toString('utf8').trim() || result.signal || result.status}`,
    );
  return result.stdout;
}
export function parseUrl(input: string): Target {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('GitHubのURLが不正です');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new Error('https://github.com/OWNER/REPO 形式のURLを指定してください');
  }
  // URL normalizes dot segments, so validate the original decoded path first.
  const rawPath = /^https:\/\/[^/]+(?:\/([^?#]*))?/i.exec(input)?.[1] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error('URLのエンコードが不正です');
  }
  const parts = decoded.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2 || parts.some((p) => ['', '.', '..'].includes(p) || /[\p{Cc}\\]/u.test(p))) {
    throw new Error('URLのパスが不正です');
  }
  const owner = parts.shift()!.toLowerCase();
  const repo = parts
    .shift()!
    .replace(/\.git$/, '')
    .toLowerCase();
  if (!/^[a-z0-9-]+$/.test(owner) || !/^[a-z0-9_.-]+$/.test(repo) || ['.', '..'].includes(repo)) {
    throw new Error('所有者名またはリポジトリ名が不正です');
  }
  if (parts.length && (parts.length < 2 || !['tree', 'blob'].includes(parts[0]!))) {
    throw new Error('リポジトリ、tree、blobのURLに対応しています');
  }
  return { owner, repo, tail: parts };
}

export function acquire(target: Target, root: string): { cache: string; defaultRef: string } {
  const cache = inside(root, `.cache/repos/${target.owner}/${target.repo}.git`);
  const remote = `https://github.com/${target.owner}/${target.repo}.git`;
  if (!existsSync(cache)) {
    mkdirSync(path.dirname(cache), { recursive: true });
    run('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--bare', '--', remote, cache]);
  } else {
    git(cache, [
      'fetch',
      '--prune',
      remote,
      '+refs/heads/*:refs/heads/*',
      '+refs/tags/*:refs/tags/*',
    ]);
  }
  const refs = run('git', ['ls-remote', '--symref', remote, 'HEAD']);
  const defaultRef = /^ref: (refs\/heads\/[^\t]+)\tHEAD$/m.exec(refs)?.[1];
  if (!defaultRef)
    throw new Error('デフォルトブランチを取得できません。空のリポジトリか確認してください');
  return { cache, defaultRef };
}

export function resolveTarget(
  cache: string,
  defaultRef: string,
  tail: string[],
): { commit: string; target: string; kind: string } {
  if (!tail.length)
    return {
      commit: git(cache, ['rev-parse', '--verify', `${defaultRef}^{commit}`]).trim(),
      target: '',
      kind: 'repository',
    };
  const [kind, ...segments] = tail;
  const first = segments[0];
  if (
    first &&
    /^[a-f0-9]{40}$/i.test(first) &&
    segments.every((part) => /^[a-z0-9_.-]+$/i.test(part) && !part.includes('..'))
  ) {
    let unshadowed = false;
    try {
      // Keep literal symbolic-ref names so SHA-shaped aliases still shadow objects.
      const refs = git(cache, ['rev-parse', '--symbolic', '--all']);
      unshadowed = !refs.toLowerCase().includes(first.toLowerCase());
    } catch {}
    if (unshadowed) {
      try {
        return {
          commit: git(cache, ['rev-parse', '--verify', `${first}^{commit}`]).trim(),
          target: segments.slice(1).join('/'),
          kind: kind!,
        };
      } catch {
        throw new Error('URLのブランチ・タグ・コミットを解決できません');
      }
    }
  }
  for (let size = segments.length; size > 0; size--) {
    const ref = segments.slice(0, size).join('/');
    const candidates = [`refs/heads/${ref}`, `refs/tags/${ref}`];
    if (/^[a-f0-9]{7,40}$/i.test(ref)) candidates.push(ref);
    for (const candidate of candidates) {
      try {
        const commit = git(cache, ['rev-parse', '--verify', `${candidate}^{commit}`]).trim();
        return { commit, target: segments.slice(size).join('/'), kind: kind! };
      } catch {}
    }
  }
  throw new Error('URLのブランチ・タグ・コミットを解決できません');
}

export function fileInventory(cache: string, commit: string): Files {
  const files: Files = Object.create(null) as Files;
  for (const record of git(cache, ['ls-tree', '-rz', '--full-tree', commit])
    .split('\0')
    .filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Gitのファイル一覧が不正です');
    const [mode, kind, sha] = record.slice(0, tab).split(' ');
    if (['100644', '100755'].includes(mode!) && kind === 'blob' && sha)
      files[record.slice(tab + 1)] = sha;
  }
  return files;
}
export function fetchIndex(target: Target): GithubIndex {
  try {
    const endpoint = `repos/${target.owner}/${target.repo}/issues?state=all&per_page=100`;
    const pages = JSON.parse(
      run('gh', ['api', '--hostname', 'github.com', '--paginate', '--slurp', endpoint]),
    ) as Record<string, unknown>[][];
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new Error('GitHubの索引形式が不正です');
    const keys = ['number', 'title', 'updated_at', 'comments', 'html_url', 'pull_request'];
    const items = pages
      .flat()
      .map((item) => Object.fromEntries(keys.map((key) => [key, item[key] ?? null])));
    items.sort((a, b) => Number(a.number) - Number(b.number));
    return { status: 'available', items };
  } catch (error) {
    return { status: 'unavailable', items: [], error: (error as Error).message };
  }
}
function api(endpoint: string, paginate: boolean): unknown {
  const args = paginate ? ['--paginate', '--slurp'] : [];
  const parsed: unknown = JSON.parse(
    run('gh', ['api', '--hostname', 'github.com', ...args, endpoint]),
  );
  if (!paginate) return parsed;
  if (!Array.isArray(parsed) || parsed.some((page) => !Array.isArray(page)))
    throw new Error('GitHubの応答形式が不正です');
  return parsed.flat();
}
type Picked = Record<string, unknown>;
function pick(value: unknown, keys: string[]): Picked | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const picked: Picked = {};
  for (const key of keys) {
    const item = record[key];
    if (key === 'user') {
      const user = typeof item === 'object' && item !== null ? (item as Picked) : null;
      picked.user = user?.login ?? null;
      picked.bot = user?.type === 'Bot';
    } else if (key === 'labels')
      picked.labels = Array.isArray(item)
        ? item.map((label) =>
            typeof label === 'object' && label !== null && 'name' in label ? label.name : label,
          )
        : [];
    else if (key === 'head' || key === 'base')
      picked[key] =
        typeof item === 'object' && item !== null
          ? { ref: (item as Picked).ref ?? null, sha: (item as Picked).sha ?? null }
          : null;
    else picked[key] = item ?? null;
  }
  return picked;
}
function pickAll(value: unknown, keys: string[]): Picked[] | null {
  return Array.isArray(value) ? value.map((item) => pick(item, keys) ?? {}) : null;
}
const issueKeys = [
  'number',
  'title',
  'state',
  'user',
  'labels',
  'created_at',
  'updated_at',
  'closed_at',
  'comments',
  'html_url',
  'body',
];
const commentKeys = ['id', 'user', 'created_at', 'html_url', 'body'];
const pullKeys = [
  'number',
  'state',
  'draft',
  'merged_at',
  'merge_commit_sha',
  'head',
  'base',
  'commits',
  'additions',
  'deletions',
  'changed_files',
  'html_url',
];
const reviewKeys = ['id', 'user', 'state', 'commit_id', 'submitted_at', 'html_url', 'body'];
const reviewCommentKeys = [
  'id',
  'user',
  'path',
  'line',
  'original_line',
  'in_reply_to_id',
  'created_at',
  'html_url',
  'body',
];
const fileKeys = [
  'filename',
  'previous_filename',
  'status',
  'additions',
  'deletions',
  'changes',
  'patch',
];
// Keeps the fields the analysis cites; avatars, reaction counts and API links are dropped.
export function fetchDiscussion(target: Target, numbers: number[]): DiscussionItem[] {
  const base = `repos/${target.owner}/${target.repo}`;
  return numbers.map((number) => {
    const item: DiscussionItem = {
      number,
      kind: 'unknown',
      issue: null,
      comments: null,
      pull: null,
      reviews: null,
      review_comments: null,
      files: null,
      errors: [],
    };
    const fetch = (endpoint: string, paginate: boolean): unknown => {
      try {
        return api(`${base}/${endpoint}`, paginate);
      } catch (error) {
        item.errors.push({ endpoint, error: (error as Error).message });
        return null;
      }
    };
    const issue = fetch(`issues/${number}`, false);
    if (issue === null) return item;
    item.issue = pick(issue, issueKeys);
    item.comments = pickAll(fetch(`issues/${number}/comments`, true), commentKeys);
    const isPull = typeof issue === 'object' && 'pull_request' in issue;
    item.kind = isPull ? 'pull' : 'issue';
    if (!isPull) return item;
    item.pull = pick(fetch(`pulls/${number}`, false), pullKeys);
    item.reviews = pickAll(fetch(`pulls/${number}/reviews`, true), reviewKeys);
    item.review_comments = pickAll(fetch(`pulls/${number}/comments`, true), reviewCommentKeys);
    item.files = pickAll(fetch(`pulls/${number}/files`, true), fileKeys);
    return item;
  });
}
