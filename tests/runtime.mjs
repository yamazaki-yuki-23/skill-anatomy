import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Bun's --bun mode prepends a node -> bun shim to PATH.
export const nodeExecutable = (process.env.PATH ?? '')
  .split(path.delimiter)
  .map((directory) => path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node'))
  .find((file) => existsSync(file) && realpathSync(file) !== realpathSync(process.execPath));
assert.ok(nodeExecutable, 'Node.js is required to verify the distributed CLI');
