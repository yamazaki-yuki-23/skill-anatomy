import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'anatomy-dist-'));
try {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.json'), '--outDir', temporary], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'TypeScriptのビルドに失敗しました');
  const files = readdirSync(temporary).sort();
  assert.deepEqual(files, readdirSync(path.join(root, 'dist')).sort(), '配布ファイルの一覧が一致しません');
  for (const file of files) assert.equal(readFileSync(path.join(root, 'dist', file), 'utf8'), readFileSync(path.join(temporary, file), 'utf8'), `${file}をnpm run buildで更新してください`);
  console.log('配布用JavaScriptはTypeScriptソースと一致しています');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
