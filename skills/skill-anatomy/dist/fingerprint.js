import path from "node:path";
import { createHash } from "node:crypto";
import { git } from "./repository.js";
export function compareUtf8(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
export function sorted(values) {
  return [...values].sort(compareUtf8);
}
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("ハッシュ対象に未定義の値があります");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(",")}]`;
  const record = value;
  return `{${sorted(Object.keys(record)).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
export function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function belongs(filename, parent) {
  return parent === "." || filename.startsWith(`${parent}/`);
}
export function createSourceSigner(cache, commit, files, allSkills) {
  const roots = allSkills.map((skill) => path.posix.dirname(skill)).filter((p) => p !== ".");
  const shared = new Set(Object.keys(files).filter((p) => !roots.some((root) => belongs(p, root))));
  return (skill, dependencies) => {
    const parent = path.posix.dirname(skill);
    const selected = Object.fromEntries(Object.entries(files).filter(([p]) => belongs(p, parent) || shared.has(p) || dependencies.includes(p)));
    const historyPaths = sorted(new Set([...shared, ...dependencies, parent]));
    const history = git(cache, ["log", commit, "--format=%H", "--", ...historyPaths]);
    return digest({ files: selected, history });
  };
}
export function sourceSignature(cache, commit, files, skill, allSkills, dependencies) {
  return createSourceSigner(cache, commit, files, allSkills)(skill, dependencies);
}
