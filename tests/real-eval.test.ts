import assert from 'node:assert/strict';
import { test } from 'vitest';
import { decide } from '../scripts/harness/real-eval.ts';
import type { RuleContext } from '../scripts/harness/real-eval.ts';

const commit = 'a'.repeat(40);
const context: RuleContext = {
  owner: 'fixture-owner',
  repo: 'review-skills',
  commit,
  planFile: '/ws/plan.json',
  workspace: '/ws',
  cache: '/caches/review-skills.git',
  reportPaths: () => ['/ws/reports/fixture-owner/review-skills/skill-analyses/review-brief.md'],
  githubIndex: () => '/ws/github-index.json',
  sourceRoot: () => '/ws/.cache/sources/fixture-owner/review-skills/' + commit,
  sourceIndex: () => '/ws/.cache/sources/fixture-owner/review-skills/' + commit + '.json',
  knownPath: (value) => ['SKILL.md', 'references', 'references/guide.md'].includes(value),
  resolveCommit: (spec) => (commit.startsWith(spec) ? commit : undefined),
  pathAtCommit: (at, value) => at === commit && value === 'old/guide.md',
};
function command(program: string, ...args: string[]) {
  return decide('run_command', { program, args }, context);
}

test('allow rules pass --hostname, -- pathspecs, and --jq through to the fixed sources', () => {
  assert.deepEqual(
    command(
      'gh',
      'api',
      '--hostname',
      'github.com',
      'repos/fixture-owner/review-skills/issues/7/comments',
    ),
    {
      kind: 'gh',
      args: [
        'api',
        '--hostname',
        'github.com',
        'repos/fixture-owner/review-skills/issues/7/comments',
      ],
    },
  );
  assert.deepEqual(
    command('gh', 'api', '--jq', '.[].body', 'repos/fixture-owner/review-skills/pulls/3/files'),
    {
      kind: 'gh',
      args: [
        'api',
        '--hostname',
        'github.com',
        '--jq',
        '.[].body',
        'repos/fixture-owner/review-skills/pulls/3/files',
      ],
    },
  );
  assert.deepEqual(
    command('git', '--git-dir', '/cache/repo.git', 'show', commit, '--', 'references/guide.md'),
    {
      kind: 'git',
      args: [
        '--literal-pathspecs',
        'show',
        '--no-ext-diff',
        '--no-textconv',
        commit,
        '--',
        'references/guide.md',
      ],
    },
  );
  assert.equal(
    command('git', '--git-dir=/cache/repo.git', 'log', '--format=%H', 'aaaaaaa', '--', 'SKILL.md')
      .kind,
    'git',
  );
  assert.equal(
    command('git', '--git-dir', '/cache/repo.git', 'show', `${commit}:old/guide.md`).kind,
    'git',
  );
  assert.deepEqual(
    command('git', '--git-dir', '/cache/repo.git', 'log', '--oneline', '--', 'SKILL.md'),
    { kind: 'git', args: ['--literal-pathspecs', 'log', '--oneline', commit, '--', 'SKILL.md'] },
  );
  assert.deepEqual(command('git', '--git-dir', '/cache/repo.git', 'show'), {
    kind: 'git',
    args: ['--literal-pathspecs', 'show', '--no-ext-diff', '--no-textconv', commit],
  });
  assert.equal(
    command('git', '--git-dir', '/cache/repo.git', 'log', `${commit}~3..${commit}`).kind,
    'git',
  );
  assert.deepEqual(decide('read_file', { path: '/cache/source/references/guide.md' }, context), {
    kind: 'read_source',
    path: 'references/guide.md',
  });
  const expanded = `/workspace/.cache/sources/fixture-owner/review-skills/${commit}`;
  assert.deepEqual(decide('read_file', { path: `${expanded}/references/guide.md` }, context), {
    kind: 'read_expanded',
    path: `/ws/.cache/sources/fixture-owner/review-skills/${commit}/references/guide.md`,
  });
  assert.deepEqual(decide('read_file', { path: `${expanded}.json` }, context), {
    kind: 'read',
    path: `/ws/.cache/sources/fixture-owner/review-skills/${commit}.json`,
  });
  assert.deepEqual(
    decide(
      'run_command',
      { program: 'node', args: ['/tool/dist/cli.js', 'discussion', '/plan.json', '--number', '7'] },
      context,
    ),
    { kind: 'cli', args: ['discussion', '--number', '7'] },
  );
  assert.deepEqual(
    decide(
      'run_command',
      { program: 'node', args: ['/tool/dist/cli.js', 'status', '/plan.json'] },
      context,
    ),
    { kind: 'cli', args: ['status'] },
  );
});

test('allow rules deny other hosts, unapproved endpoints, outside files, and executing sources', () => {
  const denied = (action: ReturnType<typeof decide>, reason: string) =>
    assert.deepEqual(action, { kind: 'deny', reason });
  denied(
    command(
      'gh',
      'api',
      '--hostname',
      'ghe.example.com',
      'repos/fixture-owner/review-skills/issues/7',
    ),
    'Unknown host',
  );
  denied(command('gh', 'api', 'repos/other-owner/review-skills/issues/7'), 'Unapproved gh command');
  denied(
    command('gh', 'api', '--method', 'POST', 'repos/fixture-owner/review-skills/issues/7/comments'),
    'Unapproved gh command',
  );
  denied(
    command('gh', 'api', '--include', 'repos/fixture-owner/review-skills/issues/7/comments'),
    'Unapproved gh option',
  );
  denied(command('gh', 'api', '--jq'), 'Missing jq expression');
  assert.equal(
    command('gh', 'api', 'repos/fixture-owner/review-skills/contents/README.md').kind,
    'error',
  );
  denied(
    decide('read_file', { path: '/etc/passwd' }, context),
    'Read outside fixed source and report paths',
  );
  denied(
    decide('read_file', { path: '/ws/other.md' }, context),
    'Read outside fixed source and report paths',
  );
  denied(
    decide(
      'read_file',
      { path: `/workspace/.cache/sources/fixture-owner/review-skills/${commit}/missing.md` },
      context,
    ),
    'Read outside fixed source and report paths',
  );
  denied(
    decide(
      'read_file',
      { path: `/workspace/.cache/sources/fixture-owner/review-skills/${commit}/../other/SKILL.md` },
      context,
    ),
    'Read outside fixed source and report paths',
  );
  assert.equal(decide('read_file', { path: '/cache/source/missing.md' }, context).kind, 'error');
  assert.equal(decide('read_file', { path: '/tool/dist/cli.js' }, context).kind, 'error');
  denied(
    decide('write_file', { path: '/ws/reports/index.html', content: 'x' }, context),
    'Write outside approved reports',
  );
  denied(
    decide('path_info', { path: '/ws/plan.json' }, context),
    'Inspect outside approved reports',
  );
  denied(
    command('bun', '/cache/source/SKILL.md'),
    'Program outside approved fixed-source research',
  );
  denied(
    command('node', '/cache/source/scripts/run.js'),
    'Only the installed CLI may run on the plan',
  );
  denied(
    command('node', '/tool/dist/cli.js', 'prepare', '/plan.json'),
    'Only the installed CLI may run on the plan',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'push', 'origin', 'main'),
    'Non-read-only Git operation',
  );
  denied(command('git', '--git-dir', '/cache/other.git', 'show', commit), 'Unknown source cache');
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'show', '--output=/tmp/x', commit),
    'Unsupported Git option: --output=/tmp/x',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'show', 'b'.repeat(40)),
    'Commit outside pinned history',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'log', `${commit}..${'b'.repeat(40)}`),
    'Commit outside pinned history',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'log', `${'b'.repeat(40)}..${commit}`),
    'Commit outside pinned history',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'log', '--all'),
    'Unsupported Git option: --all',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'log', 'HEAD'),
    'Unknown fixed source object/path: HEAD',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'show', `${commit}:secrets.env`),
    'Unknown path at commit: secrets.env',
  );
  denied(
    command('git', '--git-dir', '/cache/repo.git', 'show', commit, '--', '--output=/tmp/x'),
    'Invalid pathspec',
  );
  denied(decide('run_command', { program: 'git', args: [1] }, context), 'Invalid argument vector');
  denied(
    decide('delete_file', { path: '/ws/plan.json' }, context),
    'Operation outside approved fixed-source research',
  );
  assert.equal(decide('fetch_url', { url: 'https://example.com' }, context).kind, 'error');
});

test('read-only search and range reads are confined to the expanded source tree', () => {
  const root = context.sourceRoot()!;
  assert.deepEqual(command('rg', 'needle', '-n', '/cache/source/SKILL.md', '-i'), {
    kind: 'search',
    program: 'rg',
    args: ['-n', '-i', '--', 'needle', `${root}/SKILL.md`],
  });
  assert.deepEqual(command('rg', '-n', '--', '-needle', '/cache/source/SKILL.md'), {
    kind: 'search',
    program: 'rg',
    args: ['-n', '--', '-needle', `${root}/SKILL.md`],
  });
  assert.equal(command('rg', '-n', '--').kind, 'deny');
  assert.deepEqual(command('rg', '-n', 'validate|hook', '/cache/source/references/guide.md'), {
    kind: 'search',
    program: 'rg',
    args: ['-n', '--', 'validate|hook', `${root}/references/guide.md`],
  });
  assert.deepEqual(command('grep', '-rn', '-e', '-dash', '/cache/source'), {
    kind: 'search',
    program: 'grep',
    args: ['-rn', '-e', '-dash', root],
  });
  assert.deepEqual(command('rg', '--files', '/cache/source/references'), {
    kind: 'search',
    program: 'rg',
    args: ['--files', `${root}/references`],
  });
  assert.deepEqual(command('sed', '-n', '300,520p', '/cache/source/SKILL.md'), {
    kind: 'search',
    program: 'sed',
    args: ['-n', '300,520p', `${root}/SKILL.md`],
  });
  assert.deepEqual(command('head', '-n', '40', '/cache/source/SKILL.md'), {
    kind: 'search',
    program: 'head',
    args: ['-n', '40', `${root}/SKILL.md`],
  });
  assert.deepEqual(command('wc', '-l', '/cache/source/SKILL.md'), {
    kind: 'search',
    program: 'wc',
    args: ['-l', `${root}/SKILL.md`],
  });
  for (const [program, ...args] of [
    ['rg', '--pre', 'cat', 'x', '/cache/source'],
    ['rg', '-n', 'x', '/ws/reports'],
    ['rg', '-n', 'x', '/cache/source/../../.env'],
    ['rg', '-n', 'x', '/cache/source/missing.md'],
    ['grep', '-rn', 'x', '/etc'],
    ['sed', '-i', 's/a/b/', '/cache/source/SKILL.md'],
    ['sed', '-n', '1,5p', '/cache/repo.git/HEAD'],
    ['sed', '-n', 'e touch x', '/cache/source/SKILL.md'],
    ['head', '-c', '10', '/cache/source/SKILL.md'],
    ['cat', '/ws/.env'],
    ['wc', '-l'],
    ['python3', '-c', 'print(1)'],
    ['node', '-e', '1'],
  ] as string[][]) {
    assert.equal(command(program!, ...args).kind, 'deny', [program, ...args].join(' '));
  }
});

test('generated HTML siblings can be inspected and read but not written', () => {
  const html = '/ws/reports/fixture-owner/review-skills/skill-analyses/review-brief.html';
  assert.deepEqual(decide('path_info', { path: html }, context), { kind: 'path_info', path: html });
  assert.deepEqual(decide('read_file', { path: html }, context), { kind: 'read', path: html });
  assert.equal(
    decide('write_file', { path: html, content: '<!doctype html>' }, context).kind,
    'deny',
  );
  assert.equal(decide('path_info', { path: '/ws/reports/other.html' }, context).kind, 'deny');
});

test('parent and ancestor suffixes on pinned commits are read-only history access', () => {
  const short = commit.slice(0, 12);
  assert.deepEqual(
    command('git', '--git-dir', '/cache/repo.git', 'diff', `${short}^1`, short, '--', 'SKILL.md'),
    {
      kind: 'git',
      args: [
        '--literal-pathspecs',
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        `${short}^1`,
        short,
        '--',
        'SKILL.md',
      ],
    },
  );
  assert.equal(
    command('git', '--git-dir', '/cache/repo.git', 'show', `${short}~2:SKILL.md`).kind,
    'git',
  );
  assert.equal(
    command('git', '--git-dir', '/cache/repo.git', 'log', `${short}^1..${short}`).kind,
    'git',
  );
  assert.equal(
    command('git', '--git-dir', '/cache/repo.git', 'show', 'bbbbbbbbbbbb^1').kind,
    'deny',
  );
});
