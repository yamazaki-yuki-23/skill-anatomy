# Skill anatomy

[English](README.md) | 日本語

お気に入りのスキルの仕組みを知るための、AIエージェント向けスキルです。GitHub上のスキルのURLを渡すと、作者が向き合った課題、仕組み、そう設計された理由を日本語のレポートにまとめます。

## はじめる

Node.js 22以上とGitが必要です。PR・Issueも調べる場合は、GitHub CLIをインストールして `gh auth login` を済ませてください。

1. スキルをインストールします。使うエージェントとインストール先は、実行時に選べます。

   ```sh
   npx skills add yamazaki-yuki-23/skill-anatomy
   ```

   GitHub CLIを使う場合は `gh skill install yamazaki-yuki-23/skill-anatomy skill-anatomy` でもインストールできます。

2. エージェントを再起動し、調べたいGitHubのURLを渡します。

   ```text
   /skill-anatomy https://github.com/mattpocock/skills
   ```

   Codexでは `/skill-anatomy` の代わりに `$skill-anatomy` と書きます。

3. 提示された調査範囲と保存先を確認し、「OK」と返します。スキルごとのレポートが順に保存され、最後にリポジトリ全体のレポートが、提示された保存先の `reports/` に作られます（既定は分析を実行したフォルダ。[保存されるファイル](#保存されるファイル)を参照）。

調査範囲はURLで決まります。リポジトリ全体、1つのスキル、複数のスキルを含むフォルダ、`SKILL.md` ファイルのどれでも指定できます。ブラウザで読みたいときは「HTMLでも出力して」と添えると、Markdownの各レポートの隣に同じ内容の `.html` が保存されます。更新は `npx skills update skill-anatomy` または `gh skill update skill-anatomy` で行います。

## レポートで分かること

![Skill anatomy。スキルの指示・参照資料・変更履歴を、層に分かれた本と各層をつなぐ糸で表したイラスト](assets/skill-anatomy-cover.ja.webp)

スキルごとのレポートは、リポジトリにある実例1つで入力から出力までの動作を追い、作者の説明と履歴・ファイルで確認できた事実を分けて、重要な設計判断ごとに問い・確認できる選択肢・判断の理由を説明します。実例がない場合は入力を作らず、その旨を記します。全体のレポートは、スキルの一覧と共通する設計をまとめます。どのレポートも同じ見出しを同じ順で使い、固定コミットの出典を付け、確認できない動機は未確認と記します。対象スキルの実行や点数付けはしません。

結果は[承認済みの見本レポート](examples/yomiyasu/skill-analyses/yomiyasu.md)と[その他の作例](examples/README.md)で確認できます。分析手法と文章の規則はスキルの[参照資料](skills/skill-anatomy/references/)に、手法の出どころは[docs/analysis-methods.md](docs/analysis-methods.md)にあります。

URLと一緒に「SKILL.mdと参照資料の役割分担を説明して」のような質問を添えると、該当する章でその点を深く説明します。

## 保存されるファイル

```text
reports/<owner>/<repository>/
├── repository-analysis.md      # リポジトリ全体のレポート
├── repository-analysis.html    # そのHTML版（指定時）
├── skill-analyses/<path>.md     # スキルごとのレポート
├── skill-analyses/<path>.html   # そのHTML版（指定時）
└── .state.json                 # 完了したレポートの記録
```

`reports/` は次の順で最初に当てはまる場所に作られます。環境変数 `SKILL_ANATOMY_WORKSPACE` のフォルダ。それがなければ、スキルを Skill anatomy の Git クローンから読み込んでいる場合は、分析を実行したフォルダに関係なくそのクローンのルート。それ以外は分析を実行したフォルダ。インストールしたコピーはスキルのフォルダの外から実行する必要があり、既定の保存先なら更新してもレポートが残ります。保存先を変えるには、エージェントを起動する前に次を設定します。

```sh
export SKILL_ANATOMY_WORKSPACE="$HOME/.local/share/skill-anatomy"
```

## 調べ直す

同じURLを再度渡すと、選択した範囲をその時点のコミットで最初から調べ直します。選択範囲のレポートはすべて書き直され、範囲外のスキルのレポートは残ります。同じ会話の中なら、中断した分析は未完了のスキルから続きます。

| オプション | 動作 |
|---|---|
| `--no-confirm` | 今回の実行で調査方針の確認を省きます。ツールの権限確認は省けません。 |
| `--format html` | Markdownの各レポートの隣に、同じ内容のHTML版も保存します。 |

<details>
<summary>CLIを直接使う、ロック、整理</summary>

エージェントは `node skills/skill-anatomy/dist/cli.js` を使います（`--help` でコマンド一覧）。`prepare URL` はコミットを固定し、そのファイルを `.cache/sources/<owner>/<repo>/<commit>/` に展開してパス・バイト数・行数の索引を書き、Issueの索引を取得してPLANを返します。`prepare URL --workspace PATH` は今回の保存先を上書きします。`approve PLAN` はOKを記録します。`status PLAN` は各スキルの `pending` / `done`、全体分析の状態、HTML版の有無と検査結果を示します。`complete PLAN --skill PATH` または `--repository` は完了を記録して `report_bytes` を返し、個別分析が20,000バイトを超えると `warnings` を付けます。`check-html PLAN --skill PATH` または `--repository` は、HTML版にスクリプト・イベント属性・外部リソースがないことを検査します。`discussion PLAN --number N` は、Issue・PRの本文、コメント、レビュー、変更ファイルを1回で取得します。HTML版は完了記録に含めません。

`prepare`・`approve`・`complete` は、同じリポジトリの状態を別プロセスが更新中なら `.state.json.lock` のエラーで止まります。異常終了でロックが残ったら、エラーが示すロックファイルの `hostname`・`pid`・`created_at` を確認し、保存先を共有するどのマシンでも実行中でないことを確かめてから、未使用の名前に変更して再実行します。自動回復はありません。同じ保存先で同じリポジトリを並行して調べないでください。

`prepare` の保存に成功すると、同じリポジトリの古い計画ディレクトリを整理します。最新のPLAN、完了記録、レポート、他リポジトリの計画は残り、追加ファイル・壊れたPLAN情報・シンボリックリンクがあるものも残します。同名のスキルは元のパスで区別し、削除されたスキルのレポートも残ります。`.state.json` を含む `reports/` はGitで管理できます。

</details>

レポートの書き方は、[i-have-adhd](https://github.com/ayghri/i-have-adhd/blob/main/skills/i-have-adhd/SKILL.md)（答えを先に、手順は番号で、結果は具体的に）と[yomiyasu](https://github.com/nanaism/yomiyasu/blob/main/skills/yomiyasu/SKILL.md)（意味と断定の強さを保って推敲する）を参考にしています。

[MITライセンス](LICENSE)
