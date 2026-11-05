import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished, test } from 'vitest';
import { discussion, prepareSnapshot } from '../src/anatomy.ts';
import { parseUrl } from '../src/repository.ts';
import { SOURCE_FILE_LIMIT } from '../src/source.ts';
import { readJson } from '../src/storage.ts';
import type { Plan, SourceIndex } from '../src/types.ts';
import { nodeExecutable, required } from './runtime.ts';

const cli = fileURLToPath(new URL('../skills/skill-anatomy/dist/cli.js', import.meta.url));
const posix = process.platform !== 'win32';

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'anatomy-helpers-'));
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  const root = path.join(base, 'workspace');
  mkdirSync(source);
  mkdirSync(root);
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (file: string, content: string | Buffer) => {
    mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    writeFileSync(path.join(source, file), content);
  };
  git('init', '-b', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  write('README.md', '# Fixture\nno trailing newline');
  write('skills/review/SKILL.md', '---\nname: review\ndescription: fixture\n---\n# review\n');
  write('skills/review/scripts/run.sh', '#!/bin/sh\necho run\n');
  write('skills/review/assets/logo.bin', Buffer.from([0x89, 0x50, 0x00, 0x47, 0x0a, 0x1a]));
  write('skills/review/assets/large.txt', 'x'.repeat(SOURCE_FILE_LIMIT + 1));
  if (posix) chmodSync(path.join(source, 'skills/review/scripts/run.sh'), 0o755);
  git('add', '.');
  git('commit', '-m', 'Initial skill');
  const prepare = () => {
    const url = 'https://github.com/Alice/Agent-Skills';
    const result = prepareSnapshot(
      { url, workspace: root, noConfirm: true },
      parseUrl(url),
      root,
      path.join(source, '.git'),
      'refs/heads/main',
      { status: 'available', items: [] },
    );
    const planFile = result.plan_file as string;
    return { result, planFile, plan: readJson<Plan>(planFile) };
  };
  return { base, source, root, git, prepare };
}

test('prepare expands the pinned commit into a source tree with a path, byte and line index', () => {
  const f = fixture();
  const { result, plan } = f.prepare();
  assert.equal(
    plan.source,
    path.join(realpathSync(f.root), '.cache/sources/alice/agent-skills', plan.commit),
  );
  assert.equal(plan.source_index, `${plan.source}.json`);
  assert.equal(result.source, plan.source);
  assert.equal(result.source_files, 4);
  assert.equal(result.source_skipped, 1);
  assert.equal(
    readFileSync(path.join(plan.source, 'README.md'), 'utf8'),
    '# Fixture\nno trailing newline',
  );
  assert.ok(existsSync(path.join(plan.source, 'skills/review/SKILL.md')));
  assert.ok(!existsSync(path.join(plan.source, 'skills/review/assets/large.txt')));
  const index = readJson<SourceIndex>(plan.source_index);
  assert.equal(index.commit, plan.commit);
  assert.equal(index.directory, plan.source);
  const byPath = Object.fromEntries(index.files.map((entry) => [entry.path, entry]));
  assert.deepEqual(byPath['README.md'], { path: 'README.md', bytes: 29, lines: 2, expanded: true });
  assert.equal(required(byPath['skills/review/SKILL.md']).lines, 5);
  assert.equal(required(byPath['skills/review/assets/logo.bin']).lines, null);
  assert.equal(required(byPath['skills/review/assets/logo.bin']).expanded, true);
  assert.deepEqual(byPath['skills/review/assets/large.txt'], {
    path: 'skills/review/assets/large.txt',
    bytes: SOURCE_FILE_LIMIT + 1,
    lines: null,
    expanded: false,
    reason: 'too-large',
  });
  if (posix)
    assert.equal(statSync(path.join(plan.source, 'skills/review/scripts/run.sh')).mode & 0o111, 0);
});

test('a second prepare reuses the expanded tree and a new commit gets its own tree', () => {
  const f = fixture();
  const first = f.prepare();
  const sentinel = path.join(first.plan.source, 'sentinel.txt');
  writeFileSync(sentinel, 'kept\n');
  const indexBefore = readFileSync(first.plan.source_index, 'utf8');
  const again = f.prepare();
  assert.equal(again.plan.source, first.plan.source);
  assert.equal(again.result.source_files, 4);
  assert.equal(readFileSync(sentinel, 'utf8'), 'kept\n');
  assert.equal(readFileSync(again.plan.source_index, 'utf8'), indexBefore);
  rmSync(path.join(first.plan.source, 'skills'), { recursive: true, force: true });
  const restored = f.prepare();
  assert.equal(restored.plan.source, first.plan.source);
  assert.equal(restored.result.source_files, 4);
  assert.ok(existsSync(path.join(first.plan.source, 'skills/review/SKILL.md')));
  assert.equal(readFileSync(sentinel, 'utf8'), 'kept\n');
  writeFileSync(path.join(f.source, 'README.md'), '# Changed\n');
  f.git('commit', '-am', 'Change README');
  const next = f.prepare();
  assert.notEqual(next.plan.source, first.plan.source);
  assert.equal(readFileSync(path.join(next.plan.source, 'README.md'), 'utf8'), '# Changed\n');
  assert.ok(existsSync(first.plan.source));
});

test('paths that collide on case-insensitive filesystems are not expanded', () => {
  const f = fixture();
  const sha = spawnSync('git', ['-C', f.source, 'hash-object', '-w', '--stdin'], {
    input: '# Other case\n',
    encoding: 'utf8',
  }).stdout.trim();
  f.git('update-index', '--add', '--cacheinfo', `100644,${sha},skills/Review/SKILL.md`);
  f.git('commit', '-m', 'Add a path that differs only by case');
  const { result, plan } = f.prepare();
  const index = readJson<SourceIndex>(plan.source_index);
  const collided = index.files.filter((entry) => entry.reason === 'path-collision');
  assert.deepEqual(
    collided.map((entry) => [entry.path, entry.expanded]),
    [
      ['skills/Review/SKILL.md', false],
      ['skills/review/SKILL.md', false],
    ],
  );
  assert.ok(!existsSync(path.join(plan.source, 'skills/review/SKILL.md')));
  assert.ok(!existsSync(path.join(plan.source, 'skills/Review/SKILL.md')));
  assert.equal(result.source_files, 3);
  assert.equal(result.source_skipped, 3);
});

function fakeGh(base: string): string {
  const bin = path.join(base, 'bin');
  mkdirSync(bin, { recursive: true });
  const script = path.join(bin, 'gh');
  writeFileSync(
    script,
    `#!/bin/sh
for arg in "$@"; do last="$arg"; done
case "$last" in
  repos/alice/agent-skills/issues/7) echo '{"number":7,"title":"Add review","pull_request":{"url":"x"},"body":"PR body","user":{"login":"alice","avatar_url":"x"},"labels":[{"name":"skill"}],"reactions":{"+1":1}}';;
  repos/alice/agent-skills/issues/7/comments) echo '[[{"id":1,"body":"first","user":{"login":"bob","type":"Bot"},"url":"x"}],[{"id":2,"body":"second"}]]';;
  repos/alice/agent-skills/pulls/7) echo '{"number":7,"merged_at":"2026-01-01T00:00:00Z","head":{"ref":"feature","sha":"abc","repo":{"big":true}},"body":"PR body"}';;
  repos/alice/agent-skills/pulls/7/reviews) echo '[[{"id":3,"state":"APPROVED","user":{"login":"carol"},"_links":{}}]]';;
  repos/alice/agent-skills/pulls/7/comments) echo '[[]]';;
  repos/alice/agent-skills/pulls/7/files) echo '[[{"filename":"skills/review/SKILL.md","patch":"+review"}]]';;
  repos/alice/agent-skills/issues/9) echo '{"number":9,"title":"Question","body":"Why?"}';;
  repos/alice/agent-skills/issues/9/comments) echo 'not json';;
  *) echo 'gh: HTTP 404: Not Found' >&2; exit 1;;
esac
`,
  );
  chmodSync(script, 0o755);
  return bin;
}

test(
  'discussion fetches an issue or pull request bundle in one call and records failures',
  { skip: !posix },
  () => {
    const f = fixture();
    const { planFile } = f.prepare();
    const bin = fakeGh(f.base);
    const originalPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
    onTestFinished(() => {
      process.env.PATH = originalPath;
    });
    const result = discussion(planFile, ['9', '7', '404', '7']) as {
      repository: string;
      items: Record<string, unknown>[];
      warning: string | null;
    };
    assert.equal(result.repository, 'alice/agent-skills');
    assert.deepEqual(
      result.items.map((item) => [item.number, item.kind]),
      [
        [7, 'pull'],
        [9, 'issue'],
        [404, 'unknown'],
      ],
    );
    const pull = required(result.items[0]);
    assert.deepEqual(pull.issue, {
      number: 7,
      title: 'Add review',
      state: null,
      user: 'alice',
      bot: false,
      labels: ['skill'],
      created_at: null,
      updated_at: null,
      closed_at: null,
      comments: null,
      html_url: null,
      body: 'PR body',
    });
    assert.deepEqual(pull.comments, [
      { id: 1, user: 'bob', bot: true, created_at: null, html_url: null, body: 'first' },
      { id: 2, user: null, bot: false, created_at: null, html_url: null, body: 'second' },
    ]);
    const pullDetails = pull.pull as Record<string, unknown>;
    assert.deepEqual(pullDetails.head, { ref: 'feature', sha: 'abc' });
    assert.equal(pullDetails.merged_at, '2026-01-01T00:00:00Z');
    assert.ok(!('body' in pullDetails));
    assert.deepEqual(
      (pull.reviews as Record<string, unknown>[]).map((review) => [review.user, review.state]),
      [['carol', 'APPROVED']],
    );
    assert.ok(!JSON.stringify(pull).includes('avatar_url'));
    assert.deepEqual(pull.review_comments, []);
    assert.equal((pull.files as { filename: string }[])[0]?.filename, 'skills/review/SKILL.md');
    assert.deepEqual(pull.errors, []);
    const issue = required(result.items[1]);
    assert.equal(issue.comments, null);
    assert.equal(issue.pull, null);
    assert.equal((issue.errors as { endpoint: string }[])[0]?.endpoint, 'issues/9/comments');
    const missing = required(result.items[2]);
    assert.equal(missing.issue, null);
    assert.match((missing.errors as { error: string }[])[0]?.error ?? '', /404/);
    assert.match(result.warning ?? '', /未確認/);
    assert.throws(() => discussion(planFile, []), /1つ以上/);
    assert.throws(() => discussion(planFile, ['7', '0']), /番号が不正/);
    assert.throws(() => discussion(planFile, ['../7']), /番号が不正/);
    const viaCli = spawnSync(nodeExecutable, [cli, 'discussion', planFile, '--number', '7'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH },
    });
    assert.equal(viaCli.status, 0, viaCli.stderr);
    assert.equal(JSON.parse(viaCli.stdout).items[0].kind, 'pull');
    const rejected = spawnSync(nodeExecutable, [cli, 'discussion', planFile], { encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /--number/);
  },
);
