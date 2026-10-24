import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { inside } from './storage.js';
import type { Files, GithubIndex, Target } from './types.js';
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
