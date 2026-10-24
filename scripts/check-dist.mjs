import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'anatomy-dist-'));
try {
  build(temporary);
  const files = readdirSync(temporary).sort();
  assert.deepEqual(
    files,
    readdirSync(path.join(root, 'skills/skill-anatomy/dist')).sort(),
    '配布ファイルの一覧が一致しません',
  );
  for (const file of files)
    assert.equal(
      readFileSync(path.join(root, 'skills/skill-anatomy/dist', file), 'utf8'),
      readFileSync(path.join(temporary, file), 'utf8'),
      `${file}をbun run buildで更新してください`,
    );
  console.log('配布用JavaScriptはTypeScriptソースと一致しています');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
