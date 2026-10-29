#!/usr/bin/env node
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { prepare } from './anatomy.js';
import { isReportFormat } from './html.js';
import { approve, checkHtml, complete, status } from './state.js';
import { defaultWorkspace } from './workspace.js';

const HELP = `GitHubスキルの分析準備・差分検出・完了記録

使い方: node dist/cli.js <コマンド>

  prepare URL [--no-confirm] [--refresh] [--format markdown|html] [--workspace PATH]
    URLを判別し、索引・差分・再開位置を準備する
  approve PLAN
    ユーザーが分析方針にOKした後に承認を記録する
  status PLAN
    選択対象ごとの現在の状態、全体分析の完了状態、HTML版の有無を確認する
  complete PLAN (--skill PATH/SKILL.md | --repository) [--dependency PATH ...]
    分析ファイルを保存した後に完了状態を記録する
  check-html PLAN (--skill PATH/SKILL.md | --repository)
    Markdownの隣に保存したHTML版が安全条件を満たすか検査する

保存先: SKILL_ANATOMY_WORKSPACE、clone元、実行中の作業フォルダの順で判別。
--workspace PATHはレポートとキャッシュの保存先を指定し、上記より優先する。
旧オプション--tool-rootは使用できない。--workspaceに置き換える。
--format htmlは、Markdownのレポートに加えて同名の.htmlを書く計画にする。
HTML版は完了記録に含めず、status PLANのhtmlで有無と検査結果を返す。
`;

function main(args: string[]): unknown {
  const [command, ...rest] = args;
  if (!command || ['-h', '--help', 'help'].includes(command)) {
    console.log(HELP);
    return;
  }
  if (['-V', '--version'].includes(command)) {
    console.log('0.5.0');
    return;
  }
  if (!['prepare', 'approve', 'status', 'complete', 'check-html'].includes(command))
    throw new Error(`不明なコマンドです: ${command}`);
  const options: ParseArgsOptionsConfig = { help: { type: 'boolean', short: 'h' } };
  if (command === 'prepare')
    Object.assign(options, {
      'no-confirm': { type: 'boolean' },
      refresh: { type: 'boolean' },
      format: { type: 'string' },
      workspace: { type: 'string' },
      'tool-root': { type: 'string' },
    });
  if (command === 'complete' || command === 'check-html')
    Object.assign(options, {
      skill: { type: 'string' },
      repository: { type: 'boolean' },
    });
  if (command === 'complete')
    Object.assign(options, { dependency: { type: 'string', multiple: true } });
  const parsed = parseArgs({ args: rest, allowPositionals: true, strict: true, options });
  if (parsed.values.help) {
    console.log(HELP);
    return;
  }
  if (parsed.positionals.length !== 1)
    throw new Error('URLまたはPLANを1つ指定してください。--helpで使い方を確認できます');
  const [input] = parsed.positionals;
  const values = parsed.values;
  if (values['tool-root'] !== undefined)
    throw new Error('--tool-rootは廃止しました。保存先は--workspace PATHで指定してください');
  if (command === 'prepare') {
    const format = (values.format as string | undefined) ?? 'markdown';
    if (!isReportFormat(format))
      throw new Error(`対応していない形式です: ${format}。markdownかhtmlを指定してください`);
    return prepare({
      url: input!,
      workspace: (values.workspace as string | undefined) ?? defaultWorkspace(),
      noConfirm: values['no-confirm'] === true,
      refresh: values.refresh === true,
      format,
    });
  }
  if (command === 'approve') return approve(input!);
  if (command === 'status') return status(input!);
  const skill = values.skill as string | undefined;
  const repository = values.repository === true;
  if (Boolean(skill) === repository)
    throw new Error('--skillか--repositoryのどちらか1つを指定してください');
  if (command === 'check-html') return checkHtml(input!, skill, repository);
  const dependencies = (values.dependency as string[] | undefined) ?? [];
  if (dependencies.length && !skill)
    throw new Error('--dependencyは--skillと一緒に指定してください');
  return complete(input!, skill, repository, dependencies);
}

try {
  const result = main(process.argv.slice(2));
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`エラー: ${(error as Error).message}`);
  process.exitCode = 1;
}
