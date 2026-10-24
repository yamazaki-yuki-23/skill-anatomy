import { nodeExecutable } from './runtime.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, onTestFinished } from 'vitest';
import { defaultWorkspace } from '../src/workspace.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'anatomy-install-')));
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  const packageRoot = path.join(base, '.agents/skills/skill-anatomy');
  const workspace = path.join(base, 'analysis workspace');
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(workspace);
  cpSync(path.join(root, 'skills/skill-anatomy'), packageRoot, {
    recursive: true,
  });
  return { base, packageRoot, workspace };
}

test('managed installs save outside the package and preserve clone defaults', () => {
  const f = fixture();
  assert.equal(defaultWorkspace(f.packageRoot, f.workspace, ''), f.workspace);
  writeFileSync(path.join(f.packageRoot, '.git'), 'gitdir: /fixture.git\n');
  assert.equal(defaultWorkspace(f.packageRoot, f.workspace, ''), f.packageRoot);
  const custom = path.join(f.base, 'dedicated data');
  assert.equal(defaultWorkspace(f.packageRoot, f.workspace, custom), custom);
});

test('running inside the managed install requires an explicit workspace', () => {
  const f = fixture();
  assert.throws(() => defaultWorkspace(f.packageRoot, f.packageRoot, ''), /インストール先の外/);
  assert.equal(defaultWorkspace(f.packageRoot, f.packageRoot, f.workspace), f.workspace);
});

test('the nested skill keeps the clone repository as its default workspace', () => {
  const f = fixture();
  const packageRoot = path.join(f.base, 'skills/skill-anatomy');
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(path.join(f.base, '.git'), 'gitdir: /fixture.git\n');
  assert.equal(defaultWorkspace(packageRoot, f.workspace, ''), f.base);
});

test('the published package stays ESM inside a CommonJS project', () => {
  const f = fixture();
  writeFileSync(path.join(f.base, 'package.json'), '{"type":"commonjs"}\n');
  const result = spawnSync(nodeExecutable, [path.join(f.packageRoot, 'dist/cli.js'), '--help'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /prepare URL/);
});

test('distributed JS runs with Node alone and no build step', () => {
  const f = fixture();
  const result = spawnSync(nodeExecutable, [path.join(f.packageRoot, 'dist/cli.js'), '--help'], {
    cwd: f.workspace,
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /prepare URL/);
  assert.ok(!existsSync(path.join(f.packageRoot, 'node_modules')));
  assert.ok(!existsSync(path.join(f.packageRoot, 'target')));
});

test(
  'Claude symlinks load the same JavaScript distribution',
  { skip: process.platform === 'win32' },
  () => {
    const f = fixture();
    const claude = path.join(f.base, '.claude/skills/skill-anatomy');
    mkdirSync(path.dirname(claude), { recursive: true });
    symlinkSync(f.packageRoot, claude, 'dir');
    const result = spawnSync(nodeExecutable, [path.join(claude, 'dist/cli.js'), '--help'], {
      cwd: f.workspace,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  },
);

test('updating installed skill files keeps workspace reports and checkpoints', () => {
  const f = fixture();
  const reports = path.join(f.workspace, 'reports/alice/skills');
  mkdirSync(reports, { recursive: true });
  writeFileSync(path.join(reports, '.state.json'), '{"version":2}\n');
  writeFileSync(path.join(reports, 'repository-analysis.md'), '# 保存済みの分析\n');
  rmSync(f.packageRoot, { recursive: true });
  mkdirSync(f.packageRoot, { recursive: true });
  cpSync(path.join(root, 'skills/skill-anatomy/dist'), path.join(f.packageRoot, 'dist'), {
    recursive: true,
  });
  assert.equal(
    readFileSync(path.join(reports, 'repository-analysis.md'), 'utf8'),
    '# 保存済みの分析\n',
  );
  assert.equal(readFileSync(path.join(reports, '.state.json'), 'utf8'), '{"version":2}\n');
});

test('missing Git is reported before attempting repository analysis', () => {
  const f = fixture();
  const result = spawnSync(
    nodeExecutable,
    [path.join(f.packageRoot, 'dist/cli.js'), 'prepare', 'https://github.com/a/b'],
    {
      cwd: f.workspace,
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /gitを起動できません/);
});
