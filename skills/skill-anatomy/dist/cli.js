import { parseArgs } from "node:util";
import { prepare } from "./anatomy.js";
import { approve, complete } from "./state.js";
import { defaultWorkspace } from "./workspace.js";
const HELP = `GitHubスキルの分析準備・差分検出・完了記録

使い方: node dist/cli.js <コマンド>

  prepare URL [--no-confirm] [--refresh] [--workspace PATH]
    URLを判別し、索引・差分・再開位置を準備する
  approve PLAN
    ユーザーが分析方針にOKした後に承認を記録する
  complete PLAN (--skill PATH/SKILL.md | --repository) [--dependency PATH ...]
    分析ファイルを保存した後に完了状態を記録する

保存先: SKILL_ANATOMY_WORKSPACE、clone元、実行中の作業フォルダの順で判別。
--workspace PATHはレポートとキャッシュの保存先を指定し、上記より優先する。
旧オプション--tool-rootは使用できない。--workspaceに置き換える。
`;
function main(args) {
  const [command, ...rest] = args;
  if (!command || ["-h", "--help", "help"].includes(command)) {
    console.log(HELP);
    return;
  }
  if (["-V", "--version"].includes(command)) {
    console.log("0.3.0");
    return;
  }
  if (!["prepare", "approve", "complete"].includes(command))
    throw new Error(`不明なコマンドです: ${command}`);
  const options = { help: { type: "boolean", short: "h" } };
  if (command === "prepare")
    Object.assign(options, {
      "no-confirm": { type: "boolean" },
      refresh: { type: "boolean" },
      workspace: { type: "string" },
      "tool-root": { type: "string" }
    });
  if (command === "complete")
    Object.assign(options, {
      skill: { type: "string" },
      repository: { type: "boolean" },
      dependency: { type: "string", multiple: true }
    });
  const parsed = parseArgs({ args: rest, allowPositionals: true, strict: true, options });
  if (parsed.values.help) {
    console.log(HELP);
    return;
  }
  if (parsed.positionals.length !== 1)
    throw new Error("URLまたはPLANを1つ指定してください。--helpで使い方を確認できます");
  const [input] = parsed.positionals;
  const values = parsed.values;
  if (values["tool-root"] !== undefined)
    throw new Error("--tool-rootは廃止しました。保存先は--workspace PATHで指定してください");
  if (command === "prepare")
    return prepare({
      url: input,
      workspace: values.workspace ?? defaultWorkspace(),
      noConfirm: values["no-confirm"] === true,
      refresh: values.refresh === true
    });
  if (command === "approve")
    return approve(input);
  const skill = values.skill;
  const repository = values.repository === true;
  const dependencies = values.dependency ?? [];
  if (Boolean(skill) === repository)
    throw new Error("--skillか--repositoryのどちらか1つを指定してください");
  if (dependencies.length && !skill)
    throw new Error("--dependencyは--skillと一緒に指定してください");
  return complete(input, skill, repository, dependencies);
}
try {
  const result = main(process.argv.slice(2));
  if (result !== undefined)
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`エラー: ${error.message}`);
  process.exitCode = 1;
}
