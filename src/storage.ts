import { randomUUID } from 'node:crypto';
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
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
export function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(filename, 'utf8')) as T;
}
export function writeJson(filename: string, value: unknown): void {
  const parent = path.dirname(filename);
  mkdirSync(parent, { recursive: true });
  const temporary = path.join(parent, `.anatomy-${process.pid}-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, filename);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function physicalPath(input: string): string {
  const absolute = path.resolve(input);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(physicalPath(parent), path.basename(absolute));
  }
}
export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
}
export function inside(root: string, relative: string): string {
  root = physicalPath(root);
  let candidate = root;
  if (relative === '') return candidate;
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0'))
    throw new Error(`不正な保存先です: ${relative}`);
  for (const component of relative.split('/')) {
    if (['', '.', '..'].includes(component)) throw new Error(`不正な保存先です: ${relative}`);
    candidate = path.join(candidate, component);
    try {
      lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    candidate = realpathSync(candidate);
    if (!isWithin(root, candidate)) throw new Error(`保存先の範囲外です: ${relative}`);
  }
  return candidate;
}
