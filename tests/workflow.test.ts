import { nodeExecutable, required } from './runtime.ts';
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
import { parseUrl, resolveTarget } from '../src/repository.ts';
import { prepareSnapshot } from '../src/anatomy.ts';

import type { Plan, State, GithubIndex, Files } from '../src/types.js';

const cli = fileURLToPath(new URL('../skills/skill-anatomy/dist/cli.js', import.meta.url));
interface Prepared {
  result: {
    'plan_file': string;
    approved: boolean;
    pending: string[];
    scope: string;
    'selected_skills': number;
    'total_skills': number;
    'index_status': string;
    warning: string | null;
  };
  plan: Plan;
  planFile: string;
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function doneCount(value: unknown): number {
  assert.ok(value && typeof value === 'object' && 'done' in value);
  assert.ok(typeof value.done === 'number');
  return value.done;
}
class Fixture {
  base: string;
  source: string;
  root: string;
  index: GithubIndex;
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
  git(...args: string[]) {
    const result = spawnSync('git', ['-C', this.source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  write(filename: string, text: string) {
    const output = path.join(this.source, filename);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, text);
  }
  commit(message: string) {
    this.git('add', '.');
    this.git('commit', '-m', message);
  }
  prepare(suffix = '', noConfirm = false, refresh = false): Prepared {
    const options = {
      url: `https://github.com/Alice/Agent-Skills${suffix}`,
      workspace: this.root,
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
    assert.ok(typeof result.plan_file === 'string');
    assert.ok(typeof result.approved === 'boolean');
    assert.ok(isStringArray(result.pending));
    assert.ok(typeof result.scope === 'string');
    assert.ok(typeof result.selected_skills === 'number');
    assert.ok(typeof result.total_skills === 'number');
    assert.ok(typeof result.index_status === 'string');
    assert.ok(result.warning === null || typeof result.warning === 'string');
    const preparedResult = {
      ...result,
      'plan_file': result.plan_file,
      approved: result.approved,
      pending: result.pending,
      scope: result.scope,
      'selected_skills': result.selected_skills,
      'total_skills': result.total_skills,
      'index_status': result.index_status,
      warning: result.warning,
    };
    return {
      result: preparedResult,
      plan: readJson<Plan>(result.plan_file),
      planFile: result.plan_file,
    };
  }
  finish(prepared: Prepared, skill: string, dependencies: string[] = []) {
    const entry = prepared.plan.skills.find((e) => e.skill === skill);
    assert.ok(entry);
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
  assert.equal(Object.hasOwn(prepared.plan, 'pending'), false);
  assert.deepEqual(
    prepared.result.pending,
    prepared.plan.skills
      .filter((entry) => entry.selected && entry.status === 'pending')
      .map((entry) => entry.skill),
  );
  assert.throws(() => f.finish(prepared, 'skills/review/SKILL.md'), /未承認/);
  approve(prepared.planFile);
  assert.throws(() => complete(prepared.planFile, 'skills/testing/SKILL.md'), /先に保存/);
  assert.equal(doneCount(f.finish(prepared, 'skills/review/SKILL.md')), 1);
  const snapshot = readJson<Plan>(prepared.planFile);
  assert.equal(
    required(snapshot.skills.find((entry) => entry.skill === 'skills/review/SKILL.md')).status,
    'pending',
  );
  assert.equal(
    required(readJson<State>(snapshot.state_file).skills['skills/review/SKILL.md']).status,
    'done',
  );
});

test('distributed Node CLI preserves the approval gate and records completed reports', () => {
  const f = new Fixture();
  const prepared = f.prepare();
  const entry = required(prepared.plan.skills[0]);
  mkdirSync(path.dirname(entry.report), { recursive: true });
  writeFileSync(entry.report, '# 分析済み\n');
  const invoke = (...args: string[]) =>
    spawnSync(nodeExecutable, [cli, ...args], { encoding: 'utf8' });
  const blocked = invoke('complete', prepared.planFile, '--skill', entry.skill);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /未承認/);
  const approved = invoke('approve', prepared.planFile);
  assert.equal(approved.status, 0, approved.stderr);
  const completed = invoke('complete', prepared.planFile, '--skill', entry.skill);
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).done, 1);
  assert.equal(
    required(readJson<State>(prepared.plan.state_file).skills[entry.skill]).status,
    'done',
  );
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
  f.finishAll();
  f.index = { status: 'unavailable', items: [], error: 'rate limited' };
  const { result } = f.prepare();
  assert.equal(result.index_status, 'unavailable');
  assert.match(result.warning ?? '', /rate limited/);
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
  assert.equal(doneCount(complete(prepared.planFile, undefined, true)), 3);
});

test('individual analysis preserves other reports and inventory', () => {
  const f = new Fixture();
  const old = f.finishAll();
  const report = required(old.plan.skills[1]).report;
  const before = readFileSync(report, 'utf8');
  const prepared = f.prepare('/tree/main/skills/review');
  assert.equal(prepared.result.selected_skills, 1);
  assert.deepEqual(prepared.result.pending, []);
  assert.equal(readFileSync(report, 'utf8'), before);
  assert.equal(prepared.plan.skills.length, 3);
});

test('unchanged unavailable indexes resume completed reports and still detect source changes', () => {
  const f = new Fixture();
  f.index = { status: 'unavailable', items: [], error: 'gh missing' };
  f.finishAll();
  f.index.error = 'authentication unavailable';
  const resumed = f.prepare();
  assert.deepEqual(resumed.result.pending, []);
  assert.equal(resumed.result.index_status, 'unavailable');
  assert.match(resumed.result.warning ?? '', /索引.*取得できない/);
  f.write('skills/review/SKILL.md', '# Changed review\n');
  f.commit('Change offline source');
  assert.deepEqual(f.prepare().result.pending, ['skills/review/SKILL.md']);
  assert.equal(f.prepare('', false, true).result.pending.length, 3);
});

test('restored GitHub index triggers research after offline completion', () => {
  const f = new Fixture();
  f.index = { status: 'unavailable', items: [] };
  f.finishAll();
  assert.deepEqual(f.prepare().result.pending, []);
  f.index = { status: 'available', items: [] };
  const result = f.prepare().result;
  assert.equal(result.pending.length, 3);
  assert.equal(result.warning, null);
});

test('individual forced refresh preserves completed skills outside the selection', () => {
  const f = new Fixture();
  f.finishAll();
  const individual = f.prepare('/tree/main/skills/review', false, true);
  assert.deepEqual(individual.result.pending, ['skills/review/SKILL.md']);
  const state = readJson<State>(individual.plan.state_file);
  assert.equal(required(state.skills['skills/testing/SKILL.md']).status, 'done');
  assert.equal(required(state.skills['skills/writing/SKILL.md']).status, 'done');
  assert.deepEqual(f.prepare().result.pending, ['skills/review/SKILL.md']);
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

test('report paths remain distinct on case-insensitive filesystems', () => {
  const f = new Fixture();
  f.write('skills/Foo/SKILL.md', '# Foo\n');
  f.write('.agents/skills/foo/SKILL.md', '# Another foo\n');
  f.commit('Add case-folding report collision');
  const { plan } = f.prepare();
  const reports = plan.skills.map((entry) => entry.report.toLowerCase());
  assert.equal(new Set(reports).size, reports.length);
});

test('removed skills retain existing reports', () => {
  const f = new Fixture();
  const old = f.finishAll();
  const report = required(old.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md')).report;
  unlinkSync(path.join(f.source, 'skills/review/SKILL.md'));
  f.commit('Remove review');
  const { plan } = f.prepare();
  assert.deepEqual(readJson<State>(plan.state_file).removed, ['skills/review/SKILL.md']);
  assert.ok(existsSync(report));
});

test('replacement skills cannot overwrite removed skill reports', () => {
  const f = new Fixture();
  const old = f.finishAll();
  const report = required(old.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md')).report;
  const contents = readFileSync(report, 'utf8');
  unlinkSync(path.join(f.source, 'skills/review/SKILL.md'));
  f.write('.agents/skills/review/SKILL.md', '# Replacement\n');
  f.commit('Replace review namespace');
  const current = f.prepare('', true);
  f.finish(current, '.agents/skills/review/SKILL.md');
  const replacement = required(
    current.plan.skills.find((e) => e.skill === '.agents/skills/review/SKILL.md'),
  );
  assert.notEqual(replacement.report.toLowerCase(), report.toLowerCase());
  assert.equal(readFileSync(report, 'utf8'), contents);
  assert.deepEqual(f.prepare().result.pending, []);
});

test('report files cannot collide with parent directories', () => {
  const f = new Fixture();
  f.write('skills/foo/SKILL.md', '# Foo\n');
  f.write('skills/foo.md/bar/SKILL.md', '# Bar\n');
  f.commit('Add report and directory collision');
  assert.equal(f.finishAll().plan.skills.length, 5);
});

test('missing reports are not skipped', () => {
  const f = new Fixture();
  const old = f.finishAll();
  unlinkSync(required(old.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md')).report);
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
  const fixture = readJson<{
    files: Files;
    history: string;
    'source_signature': string;
    'report_text': string;
    'report_hash': string;
    index: GithubIndex;
    'index_hash': string;
  }>(fileURLToPath(new URL('./fixtures/checkpoint-format-v2.json', import.meta.url)));
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
  const entry = required(prepared.plan.skills.find((e) => e.skill === 'skills/review/SKILL.md'));
  writeFileSync(entry.report, '\n');
  assert.throws(() => complete(prepared.planFile, entry.skill), /空です/);
});

test.each([
  {
    kind: 'pathspec-magic skill',
    target: ':(exclude)skills/review/SKILL.md',
    unrelated: 'skills/review/SKILL.md',
    watched: ':(exclude)skills/review/SKILL.md',
    extraSkill: 'skills/testing/SKILL.md',
    relevantPending: [':(exclude)skills/review/SKILL.md'],
    unrelatedPending: ['skills/review/SKILL.md'],
  },
  {
    kind: 'skill',
    target: 'skills/[review]/SKILL.md',
    unrelated: 'skills/r/SKILL.md',
    watched: 'skills/[review]/SKILL.md',
    extraSkill: 'skills/r/SKILL.md',
    relevantPending: ['skills/[review]/SKILL.md'],
    unrelatedPending: ['skills/r/SKILL.md'],
  },
  {
    kind: 'shared file',
    target: '[docs]/guide.md',
    unrelated: 'd/guide.md',
    watched: 'skills/review/SKILL.md',
    extraSkill: 'd/SKILL.md',
    relevantPending: [
      'd/SKILL.md',
      'skills/review/SKILL.md',
      'skills/testing/SKILL.md',
      'skills/writing/SKILL.md',
    ],
    unrelatedPending: ['d/SKILL.md'],
  },
  {
    kind: 'dependency',
    target: 'skills/testing/references/[guide].md',
    unrelated: 'skills/testing/references/g.md',
    watched: 'skills/review/SKILL.md',
    extraSkill: 'skills/testing/SKILL.md',
    relevantPending: ['skills/review/SKILL.md', 'skills/testing/SKILL.md'],
    unrelatedPending: ['skills/testing/SKILL.md'],
  },
])('history treats $kind paths literally when blobs are restored', (scenario) => {
  const f = new Fixture();
  f.write(scenario.extraSkill, '# Extra skill\n');
  f.write(scenario.target, '# Original\n');
  f.write(scenario.unrelated, '# Original\n');
  f.commit('Add literal and pathspec-matching paths');
  const finish = () => {
    const prepared = f.prepare('', true);
    for (const entry of prepared.plan.skills) {
      const dependencies =
        scenario.kind === 'dependency' && entry.skill === scenario.watched ? [scenario.target] : [];
      f.finish(prepared, entry.skill, dependencies);
    }
  };
  const changeAndRestore = (file: string) => {
    const tree = f.git('rev-parse', 'HEAD^{tree}');
    f.write(file, '# Temporary change\n');
    f.commit('Change content without retaining the new blob');
    f.write(file, '# Original\n');
    f.commit('Restore the original blob');
    assert.equal(f.git('rev-parse', 'HEAD^{tree}'), tree);
  };
  finish();
  assert.deepEqual(f.prepare().result.pending, []);
  changeAndRestore(scenario.target);
  assert.deepEqual(f.prepare().result.pending.sort(), [...scenario.relevantPending].sort());
  finish();
  changeAndRestore(scenario.unrelated);
  assert.deepEqual(f.prepare().result.pending.sort(), [...scenario.unrelatedPending].sort());
});

test('full commit URL resolution avoids absent named-ref probes', () => {
  const f = new Fixture();
  const commit = f.git('rev-parse', 'HEAD');
  const trace = path.join(f.base, 'git-trace.log');
  const previous = process.env.GIT_TRACE;
  let resolved;
  try {
    process.env.GIT_TRACE = trace;
    resolved = resolveTarget(path.join(f.source, '.git'), 'refs/heads/main', [
      'blob',
      commit,
      'skills',
      'review',
      'SKILL.md',
    ]);
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE;
    else process.env.GIT_TRACE = previous;
  }
  assert.deepEqual(resolved, { commit, target: 'skills/review/SKILL.md', kind: 'blob' });
  const calls = readFileSync(trace, 'utf8')
    .split('\n')
    .filter((line) => line.includes('built-in: git') && line.includes(' rev-parse '));
  assert.equal(calls.length, 2, calls.join('\n'));
});

test('full SHA shortcuts preserve branch, tag, slash, symbolic and DWIM shadowing', () => {
  for (const shadow of ['branch', 'tag', 'slash', 'symbolic', 'dwim']) {
    const f = new Fixture();
    const original = f.git('rev-parse', 'HEAD');
    f.write('README.md', '# Newer fixture\n');
    f.commit('Add newer commit');
    const newer = f.git('rev-parse', 'HEAD');
    if (shadow === 'branch') {
      f.git('branch', original, newer);
      f.git('tag', original, original);
    }
    if (shadow === 'tag') f.git('tag', '-a', original, newer, '-m', 'Annotated shadow');
    if (shadow === 'slash') f.git('branch', `${original}/skills`, newer);
    if (shadow === 'symbolic') f.git('symbolic-ref', `refs/heads/${original}`, 'refs/heads/main');
    if (shadow === 'dwim') f.git('branch', `refs/heads/${original}`, newer);
    assert.deepEqual(
      resolveTarget(path.join(f.source, '.git'), 'refs/heads/main', [
        'blob',
        original,
        'skills',
        'review',
        'SKILL.md',
      ]),
      {
        commit: newer,
        target: shadow === 'slash' ? 'review/SKILL.md' : 'skills/review/SKILL.md',
        kind: 'blob',
      },
      shadow,
    );
  }
});

test('commit resolution keeps short SHA and revision paths, rejects invalid objects and noncommit tags', () => {
  const f = new Fixture();
  const original = f.git('rev-parse', 'HEAD');
  f.write('README.md', '# Newer fixture\n');
  f.commit('Add newer commit');
  const cache = path.join(f.source, '.git');
  for (const ref of [original.slice(0, 7), 'main~1']) {
    assert.deepEqual(
      resolveTarget(cache, 'refs/heads/main', ['blob', ref, 'skills', 'review', 'SKILL.md']),
      { commit: original, target: 'skills/review/SKILL.md', kind: 'blob' },
    );
  }
  const blob = f.git('rev-parse', 'HEAD:README.md');
  f.git('tag', original, blob);
  assert.equal(
    resolveTarget(cache, 'refs/heads/main', ['blob', original, 'skills', 'review', 'SKILL.md'])
      .commit,
    original,
  );
  for (const ref of ['f'.repeat(40), blob, 'missing-branch'])
    assert.throws(
      () => resolveTarget(cache, 'refs/heads/main', ['blob', ref, 'skills', 'review', 'SKILL.md']),
      /URLのブランチ・タグ・コミットを解決できません/,
    );
});

test('failed local ref inventory falls back without accepting an invalid repository', () => {
  const f = new Fixture();
  const commit = f.git('rev-parse', 'HEAD');
  writeFileSync(path.join(f.source, '.git', 'packed-refs'), 'invalid packed refs\n');
  const trace = path.join(f.base, 'failed-git-trace.log');
  const previous = process.env.GIT_TRACE;
  try {
    process.env.GIT_TRACE = trace;
    assert.throws(
      () =>
        resolveTarget(path.join(f.source, '.git'), 'refs/heads/main', [
          'blob',
          commit,
          'skills',
          'review',
          'SKILL.md',
        ]),
      /URLのブランチ・タグ・コミットを解決できません/,
    );
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE;
    else process.env.GIT_TRACE = previous;
  }
  const calls = readFileSync(trace, 'utf8')
    .split('\n')
    .filter((line) => line.includes('built-in: git') && line.includes(' rev-parse '));
  assert.equal(calls.length, 10, calls.join('\n'));
});
