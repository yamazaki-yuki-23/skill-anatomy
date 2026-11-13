#!/usr/bin/env node
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { discussion, prepare } from './anatomy.js';
import { approve, complete, status } from './state.js';
import { defaultWorkspace } from './workspace.js';

const HELP = `GitHubスキルの分析準備・承認・完了記録

使い方: node dist/cli.js <コマンド>

  prepare URL [--no-confirm] [--workspace PATH]
    URLを判別し、固定コミットの展開・索引・分析方針を準備する。選択範囲は毎回すべて書き直す
  approve PLAN
    ユーザーが分析方針にOKした後に承認を記録する
  status PLAN
    選択対象ごとの現在の状態、全体分析の完了状態、HTML版の有無を確認する
  complete PLAN (--skill PATH/SKILL.md | --repository)
    分析ファイルを保存した後に完了状態を記録し、同じ内容のHTML版を隣に生成する
  discussion PLAN --number N [--number N ...]
    Issue・PRの本文、コメント、レビュー、変更ファイルを1回で取得する

prepareは固定コミットのファイルを保存先の.cache/sources/に展開し、
パス・バイト数・行数の索引を書く（応答と PLAN の source / source_index）。
保存先: SKILL_ANATOMY_WORKSPACE、clone元、実行中の作業フォルダの順で判別。
--workspace PATHはレポートとキャッシュの保存先を指定し、上記より優先する。
旧オプション--tool-rootは使用できない。--workspaceに置き換える。
HTML版はMarkdownの見出し・段落・箇条書き・表・コードブロック・引用・
インラインのコード・強調・リンクから生成し、扱えない記法はwarningsに返す。
HTML版は完了記録に含めず、status PLANのhtmlで有無と検査結果を返す。
`;

function main(args: string[]): unknown {
  const [command, ...rest] = args;
  if (!command || ['-h', '--help', 'help'].includes(command)) {
    console.log(HELP);
    return;
  }
  if (['-V', '--version'].includes(command)) {
    console.log('0.9.0');
    return;
  }
  if (!['prepare', 'approve', 'status', 'complete', 'discussion'].includes(command))
    throw new Error(`不明なコマンドです: ${command}`);
  const options: ParseArgsOptionsConfig = { help: { type: 'boolean', short: 'h' } };
  if (command === 'prepare')
    Object.assign(options, {
      'no-confirm': { type: 'boolean' },
      workspace: { type: 'string' },
      'tool-root': { type: 'string' },
    });
  if (command === 'complete')
    Object.assign(options, {
      skill: { type: 'string' },
      repository: { type: 'boolean' },
    });
  if (command === 'discussion')
    Object.assign(options, { number: { type: 'string', multiple: true } });
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
  if (command === 'prepare')
    return prepare({
      url: input!,
      workspace: (values.workspace as string | undefined) ?? defaultWorkspace(),
      noConfirm: values['no-confirm'] === true,
    });
  if (command === 'approve') return approve(input!);
  if (command === 'status') return status(input!);
  if (command === 'discussion')
    return discussion(input!, (values.number as string[] | undefined) ?? []);
  const skill = values.skill as string | undefined;
  const repository = values.repository === true;
  if (Boolean(skill) === repository)
    throw new Error('--skillか--repositoryのどちらか1つを指定してください');
  return complete(input!, skill, repository);
}

try {
  const result = main(process.argv.slice(2));
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`エラー: ${(error as Error).message}`);
  process.exitCode = 1;
}
