import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { digest } from './fingerprint.js';
import { loadActive } from './state.js';
import { inside } from './storage.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseIndexNumber(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error('--numberには正の安全な整数を指定してください');
  return Number(value);
}

function compactItem(item: unknown, owner: string, repo: string): unknown {
  if (!isRecord(item) || !isRecord(item.pull_request)) return item;
  const number = item.number;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) return item;
  const url = `https://github.com/${owner}/${repo}/pull/${number}`;
  const redundant: Record<string, string> = {
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    html_url: url,
    diff_url: `${url}.diff`,
    patch_url: `${url}.patch`,
  };
  const request = { ...item.pull_request };
  for (const [key, expected] of Object.entries(redundant)) {
    if (request[key] === expected) delete request[key];
  }
  return { ...item, pull_request: request };
}

export function indexView(planFile: string, number?: number): unknown {
  if (number !== undefined && (!Number.isSafeInteger(number) || number <= 0))
    throw new Error('--numberには正の安全な整数を指定してください');
  const { plan } = loadActive(planFile);
  if (plan.approved !== true) throw new Error('分析方針が未承認です');
  const directory = realpathSync(path.dirname(planFile));
  const expected = path.join(directory, 'github-index.json');
  const declared = path.join(path.resolve(path.dirname(planFile)), 'github-index.json');
  if (path.resolve(plan.github_index) !== declared || lstatSync(declared).isSymbolicLink())
    throw new Error('索引はPLANと同じフォルダの通常ファイルを使ってください');
  const filename = inside(directory, 'github-index.json');
  if (filename !== expected || !lstatSync(filename).isFile())
    throw new Error('索引の実体がPLANのフォルダ内にありません');
  const raw = readFileSync(filename);
  const index: unknown = JSON.parse(raw.toString('utf8'));
  if (
    !isRecord(index) ||
    !['available', 'unavailable'].includes(String(index.status)) ||
    !Array.isArray(index.items)
  )
    throw new Error('GitHubの索引形式が不正です');
  if (digest({ status: index.status, items: index.items }) !== plan.index_hash)
    throw new Error('索引がPLANの固定内容と一致しません');
  const items =
    number === undefined
      ? index.items
      : index.items.filter((item: unknown) => isRecord(item) && item.number === number);
  return {
    absence_inference: false,
    index: {
      ...index,
      items: items.map((item: unknown) => compactItem(item, plan.owner, plan.repo)),
    },
    snapshot: {
      commit: plan.commit,
      index_hash: plan.index_hash,
      raw_index: filename,
      raw_sha256: createHash('sha256').update(raw).digest('hex'),
    },
    ...(number === undefined ? {} : { requested_number: number, matches: items.length }),
  };
}
