import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Bun's --bun mode prepends a node -> bun shim to PATH.
const candidate = (process.env.PATH ?? '')
  .split(path.delimiter)
  .map((directory) => path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node'))
  .find((file) => existsSync(file) && realpathSync(file) !== realpathSync(process.execPath));
assert.ok(candidate, 'Node.js is required to verify the distributed CLI');

export const nodeExecutable: string = candidate;

export function required<T>(value: T | undefined): T {
  assert.ok(value !== undefined, 'Required fixture value is missing');
  return value;
}
