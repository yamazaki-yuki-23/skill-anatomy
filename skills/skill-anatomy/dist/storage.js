import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
export function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}
export function writeJson(filename, value) {
  const parent = path.dirname(filename);
  mkdirSync(parent, { recursive: true });
  const temporary = path.join(parent, `.anatomy-${process.pid}-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 384);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}
`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, filename);
  } finally {
    if (descriptor !== undefined)
      closeSync(descriptor);
    if (existsSync(temporary))
      unlinkSync(temporary);
  }
}
function physicalPath(input) {
  const absolute = path.resolve(input);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute)
      throw error;
    return path.join(physicalPath(parent), path.basename(absolute));
  }
}
export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}
export function inside(root, relative) {
  root = physicalPath(root);
  let candidate = root;
  if (relative === "")
    return candidate;
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.includes("\x00"))
    throw new Error(`不正な保存先です: ${relative}`);
  for (const component of relative.split("/")) {
    if (["", ".", ".."].includes(component))
      throw new Error(`不正な保存先です: ${relative}`);
    candidate = path.join(candidate, component);
    try {
      lstatSync(candidate);
    } catch (error) {
      if (error.code === "ENOENT")
        continue;
      throw error;
    }
    candidate = realpathSync(candidate);
    if (!isWithin(root, candidate))
      throw new Error(`保存先の範囲外です: ${relative}`);
  }
  return candidate;
}
