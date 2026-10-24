import { nodeExecutable } from './runtime.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, onTestFinished } from 'vitest';
import { approve, complete } from '../src/state.ts';
import { canonicalJson, digest } from '../src/fingerprint.ts';
import { discover, reportPaths } from '../src/skills.ts';
import { inside, readJson } from '../src/storage.ts';
import { parseUrl } from '../src/repository.ts';
import { prepareSnapshot } from '../src/anatomy.ts';

const cli = fileURLToPath(new URL('../skills/skill-anatomy/dist/cli.js', import.meta.url));
class Fixture {
  constructor() {
    this.base = mkdtempSync(path.join(tmpdir(), 'skill-anatomy-test-'));
    onTestFinished(() => rmSync(this.base, { recursive: true, force: true }));
    this.source = path.join(this.base, 'source');
    this.root = path.join(this.base, 'tool');
    mkdirSync(this.source);
    mkdirSync(this.root);
    this.index = { status: 'available', items: [] };
    this.git('init', '-b', 'main');
    this.git('config', 'user.email', 'fixture@example.invalid');
    this.git('config', 'user.name', 'Fixture');
    this.write('README.md', '# Fixture\n');
    for (const name of ['review', 'testing', 'writing']) {
      this.write(
        `skills/${name}/SKILL.md`,
        `---\nname: ${name}\ndescription: fixture\n---\n# ${name}\n`,
      );
    }
    this.write('skills/testing/references/shared.md', 'First version\n');
    this.commit('Initial skills');
  }
  git(...args) {
    const result = spawnSync('git', ['-C', this.source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  write(filename, text) {
    const output = path.join(this.source, filename);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, text);
  }
  commit(message) {
    this.git('add', '.');
    this.git('commit', '-m', message);
  }
  prepare(suffix = '', noConfirm = false, refresh = false) {
    const options = {
      url: `https://github.com/Alice/Agent-Skills${suffix}`,
      toolRoot: this.root,
      noConfirm,
      refresh,
    };
    const result = prepareSnapshot(
      options,
      parseUrl(options.url),
      this.root,
      path.join(this.source, '.git'),
      'refs/heads/main',
      this.index,
    );
    return { result, plan: readJson(result.plan_file), planFile: result.plan_file };
  }
  finish(prepared, skill, dependencies = []) {
    const entry = prepared.plan.skills.find((e) => e.skill === skill);
    mkdirSync(path.dirname(entry.report), { recursive: true });
    writeFileSync(entry.report, '# テスト用分析\nソースに基づく説明。\n');
    return complete(prepared.planFile, skill, false, dependencies);
  }
  finishAll() {
    const prepared = this.prepare('', true);
    for (const entry of prepared.plan.skills) this.finish(prepared, entry.skill);
    return prepared;
  }
}

test('confirmation gate, missing report and completion count', () => {
  const f = new Fixture();
  const prepared = f.prepare();
  assert.equal(prepared.result.approved, false);
  assert.throws(() => f.finish(prepared, 'skills/review/SKILL.md'), /未承認/);
  approve(prepared.planFile);
  assert.throws(() => complete(prepared.planFile, 'skills/testing/SKILL.md'), /先に保存/);
  assert.equal(f.finish(prepared, 'skills/review/SKILL.md').done, 1);
});

test('distributed Node CLI preserves the approval gate and records completed reports', () => {
  const f = new Fixture();
  const prepared = f.prepare();
  const entry = prepared.plan.skills[0];
  mkdirSync(path.dirname(entry.report), { recursive: true });
  writeFileSync(entry.report, '# 分析済み\n');
  const invoke = (...args) => spawnSync(nodeExecutable, [cli, ...args], { encoding: 'utf8' });
  const blocked = invoke('complete', prepared.planFile, '--skill', entry.skill);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /未承認/);
  const approved = invoke('approve', prepared.planFile);
  assert.equal(approved.status, 0, approved.stderr);
  const completed = invoke('complete', prepared.planFile, '--skill', entry.skill);
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).done, 1);
  assert.equal(readJson(prepared.plan.state_file).skills[entry.skill].status, 'done');
});

test('repository, tree, blob, slash branch and commit URLs', () => {
  const f = new Fixture();
  f.git('branch', 'feature/docs');
  const sha = f.git('rev-parse', 'HEAD');
  for (const suffix of [
    '/tree/main/skills/review',
    '/blob/main/skills/review/SKILL.md',
    '/tree/feature/docs/skills/review',
    `/blob/${sha}/skills/review/SKILL.md`,
  ]) {
    const { result, plan } = f.prepare(suffix);
    assert.equal(result.scope, 'skill');
    assert.deepEqual(result.pending, ['skills/review/SKILL.md']);
    assert.equal(plan.commit, sha);
  }
  assert.equal(f.prepare().result.scope, 'repository');
  assert.equal(f.prepare('/tree/main/skills').result.selected_skills, 3);
});

test('resume skips completed analysis and updates only changed skill', () => {
  const f = new Fixture();
  let prepared = f.prepare('', true);
  f.finish(prepared, 'skills/review/SKILL.md');
  prepared = f.prepare('', true);
  assert.equal(prepared.result.pending.length, 2);
  assert.ok(!prepared.result.pending.includes('skills/review/SKILL.md'));
  for (const entry of prepared.plan.skills)
    if (entry.status === 'pending') f.finish(prepared, entry.skill);
  f.write('skills/testing/SKILL.md', '# Updated testing\n');
  f.commit('Change testing only');
  assert.deepEqual(f.prepare().result.pending, ['skills/testing/SKILL.md']);
});

test('shared file changes invalidate all skills', () => {
  const f = new Fixture();
  f.finishAll();
  f.write('README.md', '# New shared instructions\n');
  f.commit('Update shared README');
  assert.equal(f.prepare().result.pending.length, 3);
});

test('deleted cross-skill dependencies invalidate their consumers', () => {
  const f = new Fixture();
  const prepared = f.prepare('', true);
  const dependency = 'skills/testing/references/shared.md';
  for (const entry of prepared.plan.skills)
    f.finish(prepared, entry.skill, entry.skill === 'skills/review/SKILL.md' ? [dependency] : []);
  unlinkSync(path.join(f.source, dependency));
  f.commit('Remove referenced resource');
  assert.deepEqual(f.prepare().result.pending, [
    'skills/review/SKILL.md',
    'skills/testing/SKILL.md',
  ]);
});

test('GitHub index changes and acquisition failures trigger research', () => {
  const f = new Fixture();
  f.finishAll();
  f.index = { status: 'available', items: [{ number: 1, updated_at: '2026-10-19T00:00:00Z' }] };
  assert.equal(f.prepare().result.pending.length, 3);
  f.index = { status: 'unavailable', items: [], error: 'rate limited' };
  const { result } = f.prepare();
  assert.equal(result.index_status, 'unavailable');
  assert.equal(result.warning, 'rate limited');
  assert.equal(result.pending.length, 3);
});

test('stale plans cannot approve or complete', () => {
  const f = new Fixture();
  const old = f.prepare('', true);
  f.prepare();
  assert.throws(() => approve(old.planFile), /古いPLAN/);
  assert.throws(() => f.finish(old, 'skills/review/SKILL.md'), /古いPLAN/);
});

test('repository completion requires every selected report', () => {
  const f = new Fixture();
  const prepared = f.prepare('', true);
  writeFileSync(path.join(prepared.plan.destination, 'repository-analysis.md'), '# 全体分析\n');
  assert.throws(() => complete(prepared.planFile, undefined, true), /未完了/);
  for (const entry of prepared.plan.skills) f.finish(prepared, entry.skill);
  assert.equal(complete(prepared.planFile, undefined, true).done, 3);
});

test('individual analysis preserves other reports and inventory', () => {
  const f = new Fixture();
  const old = f.finishAll();
  const report = old.plan.skills[1].report;
  const before = readFileSync(report, 'utf8');
  const prepared = f.prepare('/tree/main/skills/review');
  assert.equal(prepared.result.selected_skills, 1);
  assert.deepEqual(prepared.result.pending, []);
  assert.equal(readFileSync(report, 'utf8'), before);
  assert.equal(prepared.plan.skills.length, 3);
});

test('forced refresh survives interruption', () => {
  const f = new Fixture();
  f.finishAll();
  f.prepare('', false, true);
  assert.equal(f.prepare().result.pending.length, 3);
});

test('root skills and duplicate namespaces have distinct reports', () => {
  const f = new Fixture();
  f.write('SKILL.md', '# Root\n');
  f.write('.agents/skills/review/SKILL.md', '# Another review\n');
  f.commit('Add duplicate and root skills');
  const { plan, result } = f.prepare();
  assert.equal(result.total_skills, 5);
  assert.equal(new Set(plan.skills.map((e) => e.report)).size, 5);
  assert.ok(plan.skills.some((e) => e.report.endsWith(`${path.sep}root.md`)));
});

test('removed skills retain existing reports', () => {
  const f = new Fixture();
  const old = f.finishAll();
  const report = old.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md').report;
  unlinkSync(path.join(f.source, 'skills/review/SKILL.md'));
  f.commit('Remove review');
  const { plan } = f.prepare();
  assert.deepEqual(readJson(plan.state_file).removed, ['skills/review/SKILL.md']);
  assert.ok(existsSync(report));
});

test('missing reports are not skipped', () => {
  const f = new Fixture();
  const old = f.finishAll();
  unlinkSync(old.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md').report);
  assert.deepEqual(f.prepare().result.pending, ['skills/review/SKILL.md']);
});

test('unsafe URLs and non-skill blobs are rejected', () => {
  for (const url of [
    'http://github.com/a/b',
    'https://github.com.evil.test/a/b',
    'https://github.com/a/b/tree/main/%2e%2e/private',
    'https://github.com/a/b/issues/1',
    'https://github.com/a/..',
    'https://github.com:8443/a/b',
  ])
    assert.throws(() => parseUrl(url));
  assert.throws(() => discover({ 'skills/review/SKILL.md': 'blob' }, 'README.md', 'blob'), /blob/);
});

test.skipIf(process.platform === 'win32')(
  'output symlinks cannot escape the workspace',
  { skip: process.platform === 'win32' },
  () => {
    const f = new Fixture();
    symlinkSync(f.source, path.join(f.root, 'reports'), 'dir');
    assert.throws(() => inside(f.root, 'reports/alice/repo'), /範囲外/);
  },
);

test('report names preserve namespaces and readable names', () => {
  const mapping = reportPaths([
    'skills/review/SKILL.md',
    '.agents/skills/review/SKILL.md',
    'skills/a/review/SKILL.md',
    'skills/productivity/grill-me/SKILL.md',
  ]);
  assert.notEqual(mapping['skills/review/SKILL.md'], mapping['.agents/skills/review/SKILL.md']);
  assert.equal(mapping['skills/a/review/SKILL.md'], 'skill-analyses/a/review.md');
  assert.equal(
    mapping['skills/productivity/grill-me/SKILL.md'],
    'skill-analyses/productivity/grill-me.md',
  );
});

test('CLI help and invalid input exit codes', () => {
  assert.equal(spawnSync(nodeExecutable, [cli, '--help']).status, 0);
  const result = spawnSync(nodeExecutable, [cli, 'prepare', 'https://example.com/a/b'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /github.com/);
  for (const args of [
    ['complete', 'plan'],
    ['complete', 'plan', '--skill', 'x', '--repository'],
    ['prepare', 'url', '--unknown'],
    ['approve', 'one', 'two'],
  ]) {
    assert.equal(spawnSync(nodeExecutable, [cli, ...args]).status, 1);
  }
});

test('fingerprints keep Rust-compatible map key order and string encoding', () => {
  assert.equal(
    canonicalJson({ z: '日本語', 10: 2, 2: 1, a: '\n' }),
    '{"10":2,"2":1,"a":"\\n","z":"日本語"}',
  );
});

test('fingerprints match checkpoints produced by the former Rust binary', () => {
  const fixture = readJson(
    fileURLToPath(new URL('./fixtures/checkpoint-format-v2.json', import.meta.url)),
  );
  assert.equal(
    digest({ files: fixture.files, history: fixture.history }),
    fixture.source_signature,
  );
  assert.equal(digest(fixture.report_text), fixture.report_hash);
  assert.equal(digest(fixture.index), fixture.index_hash);
});

test('missing dependencies and blank reports cannot be completed', () => {
  const f = new Fixture();
  const prepared = f.prepare('', true);
  assert.throws(
    () => f.finish(prepared, 'skills/review/SKILL.md', ['not-in-commit.md']),
    /存在しない/,
  );
  const entry = prepared.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md');
  writeFileSync(entry.report, '\n');
  assert.throws(() => complete(prepared.planFile, entry.skill), /空です/);
});
