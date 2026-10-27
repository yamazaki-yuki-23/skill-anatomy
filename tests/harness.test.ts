import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';
import { validateSkill, validateLinks } from '../scripts/harness/contracts.ts';
import {
  createSnapshot,
  validateReview,
  validateReviewEvents,
} from '../scripts/harness/snapshot.ts';
import { prepareRelease, checkRelease } from '../scripts/harness/release.ts';
import { verify } from '../scripts/harness/verify.ts';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'anatomy-harness-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root: string, file: string, text: string) {
  const output = path.join(root, file);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, text);
}
function publishedFixture() {
  const root = fixture();
  cpSync('skills', path.join(root, 'skills'), { recursive: true });
  cpSync('LICENSE', path.join(root, 'LICENSE'));
  return root;
}
function git(root: string, ...args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('published skill passes source and distribution contracts', () => {
  assert.deepEqual(validateSkill(publishedFixture()), []);
});

test('install metadata is rejected before publishing without changing the file', () => {
  const root = publishedFixture();
  const file = 'skills/skill-anatomy/SKILL.md';
  const text = readFileSync(path.join(root, file), 'utf8').replace(
    'license: MIT',
    'license: MIT\nmetadata:\n  github-ref: refs/tags/v0.3.0',
  );
  write(root, file, text);
  assert.ok(validateSkill(root).some((finding) => finding.message.includes('Install metadata')));
  assert.equal(readFileSync(path.join(root, file), 'utf8'), text);
});

test('invalid YAML, wrong package type, and runtime dependencies fail validation', () => {
  const root = publishedFixture();
  write(
    root,
    'skills/skill-anatomy/SKILL.md',
    '---\nname: skill-anatomy\nname: duplicate\n---\n# Skill\n',
  );
  write(
    root,
    'skills/skill-anatomy/package.json',
    '{"type":"commonjs","dependencies":{"yaml":"*"}}',
  );
  const messages = validateSkill(root)
    .map((finding) => finding.message)
    .join('\n');
  assert.match(messages, /unique|duplicate/i);
  assert.match(messages, /ESM/);
  assert.match(messages, /package installation/);
});

test('local links are resolved relative to their document and reject escapes', () => {
  const root = fixture();
  write(
    root,
    'docs/guide.md',
    '[valid](../README.md)\n[missing](missing.md)\n[escape](../../outside.md)\n[remote](https://example.com)\n',
  );
  write(root, 'README.md', '# Readme\n');
  const findings = validateLinks(root);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((finding) => finding.message.includes('missing.md')));
  assert.ok(findings.some((finding) => finding.message.includes('outside.md')));
});

test('the review snapshot excludes secrets, untracked files, and symlinked parent directories', () => {
  const root = fixture();
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  write(root, 'src/main.ts', 'export const value = 1;\n');
  write(root, '.env', 'FAKE_CANARY');
  write(root, 'docs/private.md', 'original');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  const outside = fixture();
  write(outside, 'private.md', 'FAKE_PRIVATE_CANARY');
  rmSync(path.join(root, 'docs'), { recursive: true });
  symlinkSync(outside, path.join(root, 'docs'), 'dir');
  write(root, 'untracked.txt', 'FAKE_UNTRACKED_CANARY');
  write(root, 'src/main.ts', 'export const value = 2;\n');
  const snapshot = createSnapshot(root);
  assert.equal(snapshot.files['src/main.ts'], 'export const value = 2;\n');
  assert.match(snapshot.diff, /value = 2/);
  assert.ok(!Object.hasOwn(snapshot.files, '.env'));
  assert.ok(!Object.hasOwn(snapshot.files, 'docs/private.md'));
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /FAKE_CANARY|FAKE_PRIVATE_CANARY|FAKE_UNTRACKED_CANARY/,
  );
});

test.each([false, true])(
  'review includes deleted files and their diff when staged=%s',
  (staged) => {
    const root = fixture();
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'Fixture');
    git(root, 'config', 'user.email', 'fixture@example.invalid');
    write(root, 'src/removed.ts', 'export const removed = true;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'fixture');
    rmSync(path.join(root, 'src/removed.ts'));
    if (staged) git(root, 'add', '-u');
    const snapshot = createSnapshot(root);
    assert.equal(snapshot.files['src/removed.ts'], 'export const removed = true;\n');
    assert.deepEqual(snapshot.deleted, ['src/removed.ts']);
    assert.match(snapshot.diff, /deleted file mode/);
    assert.equal(Boolean(snapshot.diff), true);
  },
);

test('snapshot refuses secret-only repositories without collecting an unrestricted diff', () => {
  const root = fixture();
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  write(root, '.env', 'FAKE_CANARY');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  write(root, '.env', 'FAKE_NEW_CANARY');
  assert.throws(() => createSnapshot(root), /No reviewable files/);
});

test('Git pathspec-like filenames cannot include excluded secrets in a review diff', () => {
  const root = fixture();
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  write(root, '.env', 'FAKE_CANARY');
  write(root, ':(glob)*', 'visible = 1');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  write(root, '.env', 'FAKE_NEW_CANARY');
  write(root, ':(glob)*', 'visible = 2');
  const snapshot = createSnapshot(root);
  assert.match(snapshot.diff, /visible = 2/);
  assert.doesNotMatch(snapshot.diff, /FAKE_CANARY|FAKE_NEW_CANARY/);
});

test('review findings require an existing source path and valid line', () => {
  const snapshot = {
    commit: 'fixture',
    diff: '',
    files: { 'src/main.ts': 'value\n' },
    excluded: [],
    deleted: [],
  };
  const finding = {
    severity: 'medium',
    path: 'src/main.ts',
    line: 1,
    message: 'A concrete issue',
    fix: 'A specific repair',
  };
  assert.equal(
    validateReview({ summary: 'Review', findings: [finding] }, snapshot).findings.length,
    1,
  );
  assert.throws(
    () =>
      validateReview(
        { summary: 'Review', findings: [{ ...finding, path: '../../.env' }] },
        snapshot,
      ),
    /evidence/,
  );
  assert.throws(
    () => validateReview({ summary: 'Review', findings: [{ ...finding, line: 99 }] }, snapshot),
    /evidence/,
  );
});

test('review requires every mandatory file to exist and be read, and rejects native tools', () => {
  const required = ['AGENTS.md', 'package.json', 'skills/skill-anatomy/SKILL.md', 'src/cli.ts'];
  const snapshot = {
    commit: 'fixture',
    diff: '',
    excluded: [],
    deleted: [],
    files: Object.fromEntries(required.map((file) => [file, 'evidence'])),
  };
  const events = required
    .map((file) =>
      JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'mcp_tool_call',
          server: 'repository',
          tool: 'read_file',
          status: 'completed',
          arguments: { path: file },
          error: null,
        },
      }),
    )
    .join('\n');
  assert.equal(validateReviewEvents(events, snapshot).size, 4);
  assert.throws(() => validateReviewEvents('', snapshot), /evidence/);
  const incomplete = { ...snapshot, files: { ...snapshot.files } };
  delete incomplete.files['skills/skill-anatomy/SKILL.md'];
  assert.throws(() => validateReviewEvents(events, incomplete), /required evidence/);
  assert.throws(
    () =>
      validateReviewEvents(
        events + '\n' + JSON.stringify({ item: { type: 'command_execution', status: 'failed' } }),
        snapshot,
      ),
    /outside/,
  );
});

test('the review MCP server serves only snapshot keys', () => {
  const root = fixture();
  const snapshot = path.join(root, 'snapshot.json');
  writeFileSync(
    snapshot,
    JSON.stringify({ files: { 'README.md': 'public text' }, excluded: [], commit: 'fixture' }),
  );
  const requests = [
    { id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    {
      id: 2,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'README.md' } },
    },
    { id: 3, method: 'tools/call', params: { name: 'read_file', arguments: { path: snapshot } } },
    { id: 4, method: 'tools/call', params: { name: 'run_command', arguments: { program: 'sh' } } },
  ];
  const result = spawnSync(process.execPath, ['scripts/harness/review-server.ts', snapshot], {
    input:
      requests.map((request) => JSON.stringify({ jsonrpc: '2.0', ...request })).join('\n') + '\n',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.match(replies[1].result.content[0].text, /public text/);
  assert.ok(replies[2].error);
  assert.ok(replies[3].error);
});

test('verification records failed checks and continues collecting evidence', () => {
  const root = fixture();
  write(
    root,
    'package.json',
    JSON.stringify({ scripts: { good: 'exit 0', bad: 'exit 1', later: 'exit 0' } }),
  );
  const result = verify(root, ['good', 'bad', 'later']);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.results.map((check) => check.exitCode),
    [0, 1, 0],
  );
  const evidence = JSON.parse(readFileSync(path.join(result.artifact, 'summary.json'), 'utf8'));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.results.length, 3);
});

test('verification cannot report success with no checks', () => {
  assert.throws(() => verify(fixture(), []), /No verification checks/);
});

test('runtime lint rules reject Bun globals and development-only imports', () => {
  const root = fixture();
  const config = JSON.parse(readFileSync('.oxlintrc.json', 'utf8'));
  config.jsPlugins = [path.resolve('scripts/style-rules.ts')];
  write(root, '.oxlintrc.json', JSON.stringify(config));
  const file = path.join(root, 'src/example.ts');
  write(
    root,
    'src/example.ts',
    "import { test } from 'vitest';\nexport const invoke = () => Bun.spawnSync(['git', '--version']);\nexport { test };\n",
  );
  const result = Bun.spawnSync([
    process.execPath,
    'node_modules/oxlint/bin/oxlint',
    '--config',
    path.join(root, '.oxlintrc.json'),
    file,
  ]);
  assert.notEqual(result.exitCode, 0);
  const diagnostics = result.stdout.toString() + result.stderr.toString();
  assert.match(diagnostics, /Bun/);
  assert.match(diagnostics, /vitest/);
});

test('release preparation updates only version fields and rejects mismatched sources', () => {
  const root = fixture();
  write(root, 'package.json', '{"version":"0.3.0","name":"fixture"}\n');
  write(root, 'src/cli.ts', "console.log('0.3.0');\n");
  prepareRelease(root, '0.3.1');
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version, '0.3.1');
  assert.equal(readFileSync(path.join(root, 'src/cli.ts'), 'utf8'), "console.log('0.3.1');\n");
  assert.throws(() => prepareRelease(root, '../../invalid'), /semantic/);
  assert.throws(() => prepareRelease(root, '0.2.9'), /increase/);
  write(root, 'src/cli.ts', 'unrelated source');
  assert.throws(() => prepareRelease(root, '0.3.2'), /no files changed/);
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version, '0.3.1');
});

test('release check refuses tag and compiled version mismatches', () => {
  const root = fixture();
  write(root, 'package.json', '{"version":"0.3.0"}');
  write(root, 'skills/skill-anatomy/dist/cli.js', "console.log('0.3.0');");
  assert.equal(checkRelease(root, 'v0.3.0'), '0.3.0');
  assert.throws(() => checkRelease(root, 'v0.3.1'), /tag/);
  write(root, 'skills/skill-anatomy/dist/cli.js', "console.log('0.2.0');");
  assert.throws(() => checkRelease(root, 'v0.3.0'), /CLI/);
});

test('Bun loads the TypeScript style plugin and enforces naming rules', () => {
  const root = fixture();
  const config = JSON.parse(readFileSync('.oxlintrc.json', 'utf8'));
  config.jsPlugins = [path.resolve('scripts/style-rules.ts')];
  write(root, '.oxlintrc.json', JSON.stringify(config));
  const file = path.join(root, 'src/names.ts');
  const lint = () =>
    Bun.spawnSync([
      process.execPath,
      '--bun',
      path.resolve('node_modules/oxlint/bin/oxlint'),
      '--config',
      path.join(root, '.oxlintrc.json'),
      file,
    ]);
  write(
    root,
    'src/names.ts',
    'export interface badName { value: string }\nexport function BadFunction() { return true; }\n',
  );
  const bad = lint();
  assert.notEqual(bad.exitCode, 0);
  assert.match(bad.stdout.toString() + bad.stderr.toString(), /style(?:\/|\()naming/);
  write(
    root,
    'src/names.ts',
    'export interface GoodName { value: string }\nexport function goodFunction() { return true; }\n',
  );
  const good = lint();
  assert.equal(good.exitCode, 0, good.stdout.toString() + good.stderr.toString());
});

test('typed review RPC rejects malformed params while list_files keeps optional arguments', () => {
  const root = fixture();
  const snapshot = path.join(root, 'snapshot.json');
  writeFileSync(
    snapshot,
    JSON.stringify({ files: { 'README.md': 'public text' }, excluded: [], commit: 'fixture' }),
  );
  const requests = [
    null,
    { id: 0, method: 'initialize', params: null },
    { id: 1, method: 'tools/call', params: { name: 'list_files' } },
    { id: 2, method: 'ping', params: false },
    {
      id: 3,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/etc/passwd' } },
    },
  ];
  const result = spawnSync(process.execPath, ['scripts/harness/review-server.ts', snapshot], {
    input: requests.map((value) => JSON.stringify(value)).join('\n') + '\n',
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const replies: unknown[] = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(replies.length, 5);
  for (const index of [0, 1, 4]) {
    const reply = replies[index];
    assert.ok(reply && typeof reply === 'object' && 'error' in reply);
    const error = reply.error;
    assert.ok(error && typeof error === 'object' && 'code' in error);
    assert.equal(error.code, -32603);
  }
  assert.deepEqual(replies[2], {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ files: ['README.md'], excluded: [], commit: 'fixture' }),
        },
      ],
    },
  });
  assert.deepEqual(replies[3], { jsonrpc: '2.0', id: 2, result: {} });
});
