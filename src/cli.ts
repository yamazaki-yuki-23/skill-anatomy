#!/usr/bin/env node
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { prepare } from './anatomy.js';
import { approve, complete } from './state.js';
import { defaultWorkspace } from './workspace.js';
import { indexView, parseIndexNumber } from './index-view.js';

const HELP = `GitHubスキルの分析準備・差分検出・完了記録

使い方: node dist/cli.js <コマンド>

  prepare URL [--no-confirm] [--refresh] [--tool-root PATH]
    URLを判別し、索引・差分・再開位置を準備する
  approve PLAN
    ユーザーが分析方針にOKした後に承認を記録する
  index PLAN [--number N]
    承認済みPLANの固定索引を読み取り専用で表示する
  complete PLAN (--skill PATH/SKILL.md | --repository) [--dependency PATH ...]
    分析ファイルを保存した後に完了状態を記録する

保存先: SKILL_ANATOMY_WORKSPACE、clone元、実行中の作業フォルダの順で判別。
--tool-rootを指定した場合はそのパスを優先する。
`;

function main(args: string[]): unknown {
  const [command, ...rest] = args;
  if (!command || ['-h', '--help', 'help'].includes(command)) {
    console.log(HELP);
    return;
  }
  if (['-V', '--version'].includes(command)) {
    console.log('0.3.0');
    return;
  }
  if (!['prepare', 'approve', 'complete', 'index'].includes(command))
    throw new Error(`不明なコマンドです: ${command}`);
  const options: ParseArgsOptionsConfig = { help: { type: 'boolean', short: 'h' } };
  if (command === 'prepare')
    Object.assign(options, {
      'no-confirm': { type: 'boolean' },
      refresh: { type: 'boolean' },
      'tool-root': { type: 'string' },
    });
  if (command === 'complete')
    Object.assign(options, {
      skill: { type: 'string' },
      repository: { type: 'boolean' },
      dependency: { type: 'string', multiple: true },
    });
  if (command === 'index') Object.assign(options, { number: { type: 'string' } });
  const parsed = parseArgs({ args: rest, allowPositionals: true, strict: true, options });
  if (parsed.values.help) {
    console.log(HELP);
    return;
  }
  if (parsed.positionals.length !== 1)
    throw new Error('URLまたはPLANを1つ指定してください。--helpで使い方を確認できます');
  const [input] = parsed.positionals;
  const values = parsed.values;
  if (command === 'prepare')
    return prepare({
      url: input!,
      toolRoot: (values['tool-root'] as string | undefined) ?? defaultWorkspace(),
      noConfirm: values['no-confirm'] === true,
      refresh: values.refresh === true,
    });
  if (command === 'approve') return approve(input!);
  if (command === 'index') {
    if (rest.filter((arg) => arg === '--number' || arg.startsWith('--number=')).length > 1)
      throw new Error('--numberは1回だけ指定してください');
    return indexView(
      input!,
      values.number === undefined ? undefined : parseIndexNumber(values.number as string),
    );
  }
  const skill = values.skill as string | undefined;
  const repository = values.repository === true;
  const dependencies = (values.dependency as string[] | undefined) ?? [];
  if (Boolean(skill) === repository)
    throw new Error('--skillか--repositoryのどちらか1つを指定してください');
  if (dependencies.length && !skill)
    throw new Error('--dependencyは--skillと一緒に指定してください');
  return complete(input!, skill, repository, dependencies);
}

try {
  const result = main(process.argv.slice(2));
  if (result !== undefined)
    console.log(JSON.stringify(result, null, process.argv[2] === 'index' ? undefined : 2));
} catch (error) {
  console.error(`エラー: ${(error as Error).message}`);
  process.exitCode = 1;
}
