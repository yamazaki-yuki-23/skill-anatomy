import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
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
import { prepareSnapshot } from '../src/anatomy.ts';
import { indexView } from '../src/index-view.ts';
import { parseUrl } from '../src/repository.ts';
import { approve } from '../src/state.ts';
import { readJson, writeJson } from '../src/storage.ts';
import { nodeExecutable } from './runtime.ts';
import type { GithubIndex, Plan } from '../src/types.ts';

const cli = fileURLToPath(new URL('../skills/skill-anatomy/dist/cli.js', import.meta.url));
function fixture(index: GithubIndex = { status: 'available', items: [] }, noConfirm = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'anatomy-index-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  mkdirSync(source);
  for (const args of [
    ['init', '-b', 'main'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
  ]) {
    assert.equal(spawnSync('git', ['-C', source, ...args]).status, 0);
  }
  writeFileSync(
    path.join(source, 'SKILL.md'),
    '---\nname: fixture\ndescription: fixture\n---\n# Fixture\n',
  );
  assert.equal(spawnSync('git', ['-C', source, 'add', '.']).status, 0);
  assert.equal(spawnSync('git', ['-C', source, 'commit', '-m', 'Add fixture']).status, 0);
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  const options = { url: 'https://github.com/alice/skills', toolRoot: workspace, noConfirm };
  const result = prepareSnapshot(
    options,
    parseUrl(options.url),
    workspace,
    path.join(source, '.git'),
    'refs/heads/main',
    index,
  );
  assert.equal(typeof result.plan_file, 'string');
  const planFile = result.plan_file as string;
  const plan = readJson<Plan>(planFile);
  const paths = [planFile, plan.github_index, plan.state_file];
  const snapshot = () => paths.map((filename) => readFileSync(filename).toString('hex'));
  return {
    result,
    root,
    planFile,
    plan,
    snapshot,
    run: (...args: string[]) =>
      spawnSync(nodeExecutable, [cli, 'index', planFile, ...args], { encoding: 'utf8' }),
  };
}

function entry(number: number) {
  const url = `https://github.com/alice/skills/pull/${number}`;
  return {
    number,
    title: `変更 ${number}`,
    updated_at: '2026-10-01T00:00:00Z',
    comments: 0,
    html_url: url,
    extra: { unknown: null },
    pull_request: {
      url: `https://api.github.com/repos/alice/skills/pulls/${number}`,
      html_url: url,
      diff_url: `${url}.diff`,
      patch_url: `${url}.patch`,
      merged_at: null,
      future_selection: 'retained',
    },
  };
}

test('distributed CLI retains all entries, unknown fields and nulls with lower serialized and wire bytes', () => {
  const items: unknown[] = Array.from({ length: 40 }, (_, i) => entry(i + 1));
  items.push(
    { number: 41, pull_request: null },
    { number: 42 },
    {
      number: 43,
      pull_request: { merged_at: '2026-10-01', url: 'https://other.invalid/value', future: true },
    },
  );
  const f = fixture({ status: 'available', items });
  const before = f.snapshot();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const view = JSON.parse(result.stdout);
  assert.equal(view.index.items.length, 43);
  assert.deepEqual(
    view.index.items.slice(0, 40),
    items.slice(0, 40).map((item) => {
      const value = item as ReturnType<typeof entry>;
      return { ...value, pull_request: { merged_at: null, future_selection: 'retained' } };
    }),
  );
  assert.deepEqual(view.index.items.slice(40), items.slice(40));
  assert.equal(Object.hasOwn(view.index.items[41], 'pull_request'), false);
  assert.equal(view.snapshot.raw_index, f.plan.github_index);
  const raw = readFileSync(f.plan.github_index, 'utf8');
  const compactRaw = JSON.stringify(JSON.parse(raw));
  assert.ok(Buffer.byteLength(result.stdout) < Buffer.byteLength(compactRaw));
  const wire = (text: string) =>
    Buffer.byteLength(JSON.stringify({ content: [{ type: 'text', text }] }));
  assert.ok(wire(result.stdout) < wire(compactRaw));
  assert.deepEqual(f.snapshot(), before);
});

test('number query retains duplicate matches and reports only cached absence', () => {
  const f = fixture({ status: 'available', items: [entry(2), entry(1), entry(2)] });
  const before = f.snapshot();
  const view = JSON.parse(f.run('--number', '2').stdout);
  assert.equal(view.matches, 2);
  assert.deepEqual(
    view.index.items.map((item: { number: number }) => item.number),
    [2, 2],
  );
  const missing = JSON.parse(f.run('--number', '99').stdout);
  assert.equal(missing.matches, 0);
  assert.equal(missing.absence_inference, false);
  assert.equal(missing.index.status, 'available');
  assert.deepEqual(f.snapshot(), before);
});

test('unavailable status and error remain unavailable, including number query', () => {
  const f = fixture({ status: 'unavailable', items: [], error: 'permission denied' });
  const before = f.snapshot();
  const view = JSON.parse(f.run('--number', '1').stdout);
  assert.equal(view.index.status, 'unavailable');
  assert.equal(view.index.error, 'permission denied');
  assert.deepEqual(f.snapshot(), before);
});

test('persistent approval is required and ordinary approve enables read-only view', () => {
  const f = fixture(undefined, false);
  const before = f.snapshot();
  assert.throws(() => indexView(f.planFile), /未承認/);
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.snapshot(), before);
  approve(f.planFile);
  const approved = f.snapshot();
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.snapshot(), approved);
});

test('stale PLAN, changed index and outside/symlink index are rejected without mutation', () => {
  const f = fixture();
  const originalPlan = readFileSync(f.planFile);
  const originalIndex = readFileSync(f.plan.github_index);
  const state = JSON.parse(readFileSync(f.plan.state_file, 'utf8'));
  writeJson(f.plan.state_file, { ...state, active_plan: 'other' });
  assert.throws(() => indexView(f.planFile), /古いPLAN/);
  writeJson(f.plan.state_file, state);
  writeJson(f.plan.github_index, { status: 'available', items: [entry(1)] });
  const changed = f.snapshot();
  assert.throws(() => indexView(f.planFile), /固定内容/);
  assert.deepEqual(f.snapshot(), changed);
  writeFileSync(f.plan.github_index, originalIndex);
  const outside = path.join(f.root, 'outside.json');
  writeFileSync(outside, originalIndex);
  writeJson(f.planFile, { ...f.plan, github_index: outside });
  assert.throws(() => indexView(f.planFile), /同じフォルダ/);
  writeFileSync(f.planFile, originalPlan);
  unlinkSync(f.plan.github_index);
  symlinkSync(outside, f.plan.github_index);
  assert.throws(() => indexView(f.planFile), /同じフォルダ/);
  assert.deepEqual(readFileSync(outside), originalIndex);
});

test('invalid numeric forms and extra CLI flags/arguments are rejected without mutation', () => {
  const f = fixture();
  const before = f.snapshot();
  for (const args of [
    ['--number', '0'],
    ['--number', '-1'],
    ['--number', '1.5'],
    ['--number', '1e2'],
    ['--number', '01'],
    ['--number', '9007199254740992'],
    ['--number', '../1'],
    ['--refresh'],
    ['--no-confirm'],
    ['extra'],
    ['--number'],
    ['--number', '1', '--number', '2'],
  ]) {
    assert.notEqual(f.run(...args).status, 0, JSON.stringify(args));
  }
  assert.deepEqual(f.snapshot(), before);
});

test('prepare exposes a trusted descriptor before approval without index payload, including no-confirm', () => {
  const f = fixture(
    { status: 'available', items: [{ ...entry(1), title: 'UNTRUSTED_PAYLOAD_MARKER' }] },
    false,
  );
  const descriptor = f.plan.index_view;
  assert.ok(descriptor);
  assert.deepEqual(descriptor, {
    command: 'index',
    plan_file: f.planFile,
    requires_approval: true,
    raw_fallback: f.plan.github_index,
  });
  assert.deepEqual(f.result.index_view, descriptor);
  assert.equal(JSON.stringify(f.result).includes('UNTRUSTED_PAYLOAD_MARKER'), false);
  assert.equal(JSON.stringify(descriptor).includes('UNTRUSTED_PAYLOAD_MARKER'), false);
  const invoke = () =>
    spawnSync(nodeExecutable, [cli, descriptor.command, descriptor.plan_file], {
      encoding: 'utf8',
    });
  const before = f.snapshot();
  assert.notEqual(invoke().status, 0);
  assert.deepEqual(f.snapshot(), before);
  approve(f.planFile);
  const approved = f.snapshot();
  const response = invoke();
  assert.equal(response.status, 0, response.stderr);
  const view = JSON.parse(response.stdout);
  assert.equal(view.index.items.length, 1);
  assert.equal(view.index.items[0].title, 'UNTRUSTED_PAYLOAD_MARKER');
  assert.deepEqual(view.index.items[0], {
    ...entry(1),
    title: 'UNTRUSTED_PAYLOAD_MARKER',
    pull_request: { merged_at: null, future_selection: 'retained' },
  });
  assert.equal(view.snapshot.index_hash, f.plan.index_hash);
  assert.deepEqual(f.snapshot(), approved);
  const skipped = fixture();
  assert.equal(skipped.plan.approved, true);
  assert.equal(skipped.plan.index_view?.requires_approval, true);
  assert.equal(skipped.run().status, 0);
});

test('older PLAN without a capability descriptor remains readable', () => {
  const f = fixture({ status: 'available', items: [entry(1)] });
  const { index_view: descriptor, ...older } = f.plan;
  assert.ok(descriptor);
  writeJson(f.planFile, older);
  const before = f.snapshot();
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.snapshot(), before);
});
