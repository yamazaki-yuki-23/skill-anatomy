import path from 'node:path';
import { createHash } from 'node:crypto';
import { git } from './repository.js';
import type { Files } from './types.js';
export function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
export function sorted(values: Iterable<string>): string[] {
  return [...values].sort(compareUtf8);
}

// Match serde_json's sorted map serialization, including integer-looking keys.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('ハッシュ対象に未定義の値があります');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${sorted(Object.keys(record))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function belongs(filename: string, parent: string): boolean {
  return parent === '.' || filename.startsWith(`${parent}/`);
}
export function createSourceSigner(
  cache: string,
  commit: string,
  files: Files,
  allSkills: string[],
): (skill: string, dependencies: string[]) => string {
  const roots = allSkills.map((skill) => path.posix.dirname(skill)).filter((p) => p !== '.');
  const shared = new Set(Object.keys(files).filter((p) => !roots.some((root) => belongs(p, root))));
  return (skill, dependencies) => {
    const parent = path.posix.dirname(skill);
    const selected = Object.fromEntries(
      Object.entries(files).filter(
        ([p]) => belongs(p, parent) || shared.has(p) || dependencies.includes(p),
      ),
    );
    const historyPaths = sorted(new Set([...shared, ...dependencies, parent]));
    const history = git(cache, ['log', commit, '--format=%H', '--', ...historyPaths]);
    return digest({ files: selected, history });
  };
}
export function sourceSignature(
  cache: string,
  commit: string,
  files: Files,
  skill: string,
  allSkills: string[],
  dependencies: string[],
): string {
  return createSourceSigner(cache, commit, files, allSkills)(skill, dependencies);
}
