import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gitBuffer } from "./repository.js";
import { inside, readJson, writeJson } from "./storage.js";
export const SOURCE_FILE_LIMIT = 1024 * 1024;
function countLines(content) {
  if (content.subarray(0, 8000).includes(0))
    return null;
  let lines = 0;
  for (const byte of content)
    if (byte === 10)
      lines++;
  if (content.length && content[content.length - 1] !== 10)
    lines++;
  return lines;
}
function blobSizes(cache, shas) {
  const sizes = new Map;
  if (!shas.length)
    return sizes;
  const output = gitBuffer(cache, ["cat-file", "--batch-check"], `${shas.join(`
`)}
`).toString("utf8").split(`
`).filter(Boolean);
  if (output.length !== shas.length)
    throw new Error("Gitのオブジェクト一覧が不正です");
  output.forEach((line, i) => {
    const [name, kind, size] = line.split(" ");
    const sha = shas[i];
    if (name !== sha)
      throw new Error("Gitのオブジェクト一覧が不正です");
    sizes.set(sha, kind === "blob" && size !== undefined ? Number(size) : null);
  });
  return sizes;
}
function readBlobs(cache, shas) {
  const blobs = new Map;
  if (!shas.length)
    return blobs;
  const output = gitBuffer(cache, ["cat-file", "--batch"], `${shas.join(`
`)}
`);
  let offset = 0;
  for (const sha of shas) {
    const end = output.indexOf(10, offset);
    if (end < 0)
      throw new Error("Gitのオブジェクト出力が不正です");
    const [name, kind, size] = output.subarray(offset, end).toString("utf8").split(" ");
    if (name !== sha || kind !== "blob" || size === undefined)
      throw new Error("Gitのオブジェクト出力が不正です");
    offset = end + 1;
    const length = Number(size);
    blobs.set(sha, output.subarray(offset, offset + length));
    offset += length + 1;
  }
  return blobs;
}
export function materializeSource(root, target, cache, commit, files) {
  const parent = inside(root, `.cache/sources/${target.owner}/${target.repo}`);
  const directory = inside(parent, commit);
  const indexFile = inside(parent, `${commit}.json`);
  if (existsSync(indexFile)) {
    const previous = readJson(indexFile);
    const intact = (entry) => {
      try {
        return lstatSync(path.join(directory, ...entry.path.split("/"))).isFile();
      } catch {
        return false;
      }
    };
    if (previous.commit === commit && previous.directory === directory && previous.files.every((entry) => !entry.expanded || intact(entry)))
      return {
        directory,
        index: indexFile,
        expanded: previous.files.filter((entry) => entry.expanded).length,
        skipped: previous.files.filter((entry) => !entry.expanded).length
      };
  }
  mkdirSync(directory, { recursive: true });
  const paths = Object.keys(files).sort();
  const sizes = blobSizes(cache, [...new Set(paths.map((file) => files[file]))]);
  const blobs = readBlobs(cache, [...sizes].filter(([, size]) => size !== null && size <= SOURCE_FILE_LIMIT).map(([sha]) => sha));
  const folded = new Map;
  for (const file of paths) {
    const key = file.normalize("NFC").toLowerCase();
    folded.set(key, (folded.get(key) ?? 0) + 1);
  }
  const entries = [];
  for (const file of paths) {
    const sha = files[file];
    const size = sizes.get(sha) ?? null;
    if (size === null) {
      entries.push({ path: file, bytes: 0, lines: null, expanded: false, reason: "missing" });
      continue;
    }
    if (size > SOURCE_FILE_LIMIT) {
      entries.push({ path: file, bytes: size, lines: null, expanded: false, reason: "too-large" });
      continue;
    }
    if ((folded.get(file.normalize("NFC").toLowerCase()) ?? 0) > 1) {
      entries.push({
        path: file,
        bytes: size,
        lines: null,
        expanded: false,
        reason: "path-collision"
      });
      continue;
    }
    const content = blobs.get(sha);
    if (content === undefined)
      throw new Error("Gitのオブジェクト出力が不正です");
    const entry = {
      path: file,
      bytes: content.length,
      lines: countLines(content),
      expanded: false
    };
    try {
      const output = inside(directory, file);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, content, { mode: 420 });
      chmodSync(output, 420);
      entry.expanded = true;
    } catch (error) {
      entry.reason = error.message;
    }
    entries.push(entry);
  }
  writeJson(indexFile, { commit, directory, files: entries });
  return {
    directory,
    index: indexFile,
    expanded: entries.filter((entry) => entry.expanded).length,
    skipped: entries.filter((entry) => !entry.expanded).length
  };
}
