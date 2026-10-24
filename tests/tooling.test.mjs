import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';

function fixture(content) {
  mkdirSync('.cache', { recursive: true });
  const root = mkdtempSync(path.resolve('.cache/style-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'example.ts');
  writeFileSync(file, content);
  return file;
}

function lint(file) {
  return Bun.spawnSync([process.execPath, 'node_modules/oxlint/bin/oxlint', '--no-ignore', file]);
}

test('Vitest workers use the Bun runtime', () => {
  assert.ok(process.versions.bun);
});

test('oxlint rejects invalid type, function, variable names and builtin imports', () => {
  const file = fixture(
    "import fs from 'fs';\nexport interface bad_interface {}\nexport function BadFunction() { let BAD_VARIABLE = fs; return BAD_VARIABLE; }\n",
  );
  const result = lint(file);
  const diagnostics = result.stdout.toString() + result.stderr.toString();
  assert.notEqual(result.exitCode, 0);
  for (const name of ['bad_interface', 'BadFunction', 'BAD_VARIABLE', 'prefer-node-protocol']) {
    assert.ok(diagnostics.includes(name), diagnostics);
  }
});

test('oxlint accepts naming conventions and preserves serialized property names', () => {
  const file = fixture(
    "export interface ReportState { 'report_hash': string }\nexport const VERSION = 2;\nexport function makeReport(): ReportState { const reportHash = String(VERSION); return { report_hash: reportHash }; }\n",
  );
  const result = lint(file);
  assert.equal(result.exitCode, 0, result.stdout.toString() + result.stderr.toString());
});

test('oxfmt rejects unformatted code and fixes it to the configured style', () => {
  const file = fixture('export function render(){\nreturn "done"\n}\n');
  const format = (...args) =>
    Bun.spawnSync([process.execPath, 'node_modules/oxfmt/bin/oxfmt', ...args, file]);
  assert.notEqual(format('--check').exitCode, 0);
  assert.equal(format('--write').exitCode, 0);
  assert.equal(format('--check').exitCode, 0);
});
