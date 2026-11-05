import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitBuffer } from './repository.js';
import { inside, readJson, writeJson } from './storage.js';
import type { Files, SourceIndex, SourceIndexEntry, Target } from './types.js';
export const SOURCE_FILE_LIMIT = 1024 * 1024;
function countLines(content: Buffer): number | null {
  if (content.subarray(0, 8000).includes(0)) return null;
  let lines = 0;
  for (const byte of content) if (byte === 10) lines++;
  if (content.length && content[content.length - 1] !== 10) lines++;
  return lines;
}
function blobSizes(cache: string, shas: string[]): Map<string, number | null> {
  const sizes = new Map<string, number | null>();
  if (!shas.length) return sizes;
  const output = gitBuffer(cache, ['cat-file', '--batch-check'], `${shas.join('\n')}\n`)
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  if (output.length !== shas.length) throw new Error('Gitのオブジェクト一覧が不正です');
  output.forEach((line, i) => {
    const [name, kind, size] = line.split(' ');
    const sha = shas[i]!;
    if (name !== sha) throw new Error('Gitのオブジェクト一覧が不正です');
    sizes.set(sha, kind === 'blob' && size !== undefined ? Number(size) : null);
  });
  return sizes;
}
// Reads only blobs within the size limit, in one git invocation.
function readBlobs(cache: string, shas: string[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  if (!shas.length) return blobs;
  const output = gitBuffer(cache, ['cat-file', '--batch'], `${shas.join('\n')}\n`);
  let offset = 0;
  for (const sha of shas) {
    const end = output.indexOf(10, offset);
    if (end < 0) throw new Error('Gitのオブジェクト出力が不正です');
    const [name, kind, size] = output.subarray(offset, end).toString('utf8').split(' ');
    if (name !== sha || kind !== 'blob' || size === undefined)
      throw new Error('Gitのオブジェクト出力が不正です');
    offset = end + 1;
    const length = Number(size);
    blobs.set(sha, output.subarray(offset, offset + length));
    offset += length + 1;
  }
  return blobs;
}
export function materializeSource(
  root: string,
  target: Target,
  cache: string,
  commit: string,
  files: Files,
): { directory: string; index: string; expanded: number; skipped: number } {
  const parent = inside(root, `.cache/sources/${target.owner}/${target.repo}`);
  const directory = inside(parent, commit);
  const indexFile = inside(parent, `${commit}.json`);
  if (existsSync(indexFile)) {
    const previous = readJson<SourceIndex>(indexFile);
    const intact = (entry: SourceIndexEntry) => {
      try {
        return lstatSync(path.join(directory, ...entry.path.split('/'))).isFile();
      } catch {
        return false;
      }
    };
    // Reuse only while every expanded file is still there; otherwise expand again below.
    if (
      previous.commit === commit &&
      previous.directory === directory &&
      previous.files.every((entry) => !entry.expanded || intact(entry))
    )
      return {
        directory,
        index: indexFile,
        expanded: previous.files.filter((entry) => entry.expanded).length,
        skipped: previous.files.filter((entry) => !entry.expanded).length,
      };
  }
  mkdirSync(directory, { recursive: true });
  const paths = Object.keys(files).sort();
  const sizes = blobSizes(cache, [...new Set(paths.map((file) => files[file]!))]);
  const blobs = readBlobs(
    cache,
    [...sizes].filter(([, size]) => size !== null && size <= SOURCE_FILE_LIMIT).map(([sha]) => sha),
  );
  // Paths that differ only by case or Unicode normalization would overwrite each other on
  // macOS and Windows, so none of them is expanded and research falls back to Git for them.
  const folded = new Map<string, number>();
  for (const file of paths) {
    const key = file.normalize('NFC').toLowerCase();
    folded.set(key, (folded.get(key) ?? 0) + 1);
  }
  const entries: SourceIndexEntry[] = [];
  for (const file of paths) {
    const sha = files[file]!;
    const size = sizes.get(sha) ?? null;
    if (size === null) {
      entries.push({ path: file, bytes: 0, lines: null, expanded: false, reason: 'missing' });
      continue;
    }
    if (size > SOURCE_FILE_LIMIT) {
      entries.push({ path: file, bytes: size, lines: null, expanded: false, reason: 'too-large' });
      continue;
    }
    if ((folded.get(file.normalize('NFC').toLowerCase()) ?? 0) > 1) {
      entries.push({
        path: file,
        bytes: size,
        lines: null,
        expanded: false,
        reason: 'path-collision',
      });
      continue;
    }
    const content = blobs.get(sha);
    if (content === undefined) throw new Error('Gitのオブジェクト出力が不正です');
    const entry: SourceIndexEntry = {
      path: file,
      bytes: content.length,
      lines: countLines(content),
      expanded: false,
    };
    try {
      const output = inside(directory, file);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, content, { mode: 0o644 });
      chmodSync(output, 0o644);
      entry.expanded = true;
    } catch (error) {
      entry.reason = (error as Error).message;
    }
    entries.push(entry);
  }
  writeJson(indexFile, { commit, directory, files: entries } satisfies SourceIndex);
  return {
    directory,
    index: indexFile,
    expanded: entries.filter((entry) => entry.expanded).length,
    skipped: entries.filter((entry) => !entry.expanded).length,
  };
}
