# Skill anatomy

GitHubのスキルURLをAIエージェントに渡し、設計の工夫と自作スキルへの応用例を日本語Markdownで作るスキルです。CodexとClaude Codeで使えます。

```text
$skill-anatomy https://github.com/mattpocock/skills
```

Rustの補助CLIがURL判別・変更検出・再開位置の管理を行い、エージェントが根拠を読んで分析文を書きます。CLI単体では分析文を生成しません。対象スキルのコードは実行しません。

## 導入

必要なものはRust/Cargo、Git、GitHub CLI、CodexまたはClaude Codeです。GitHub CLIは `gh auth login` で認証してください。LLMのAPIキーをこのツールへ追加する必要はありません。分析には利用中のエージェントの実行枠を使います。

1. このリポジトリをローカルにcloneし、そのフォルダを開きます。
2. `cargo build --release --locked` で補助CLIをビルドします。
3. `sh scripts/install.sh both` で両方のエージェントにスキルを登録します。
4. エージェントを再起動し、下の呼び出し例を入力します。

登録先はCodexが `~/.agents/skills/skill-anatomy`、Claude Codeが `~/.claude/skills/skill-anatomy` です。リポジトリへのシンボリックリンクを作り、別のスキルが存在するときは上書きせず停止します。片方だけなら `both` を `codex` または `claude` に変更してください。`sh scripts/install.sh both --dry-run` は登録先を表示するだけです。インストーラーはmacOS/Linux用です。

保存先はcloneしたツールのリポジトリ内です。登録後も元のリポジトリを移動・削除しないでください。移動した場合はシンボリックリンクの参照先を更新し、再ビルドしてください。

スキルの配置方法は [Codex公式ドキュメント](https://learn.chatgpt.com/docs/build-skills) と [Claude Code公式ドキュメント](https://code.claude.com/docs/en/skills) を参照しています。

## 使う

Codexでリポジトリ全体を分析する場合：

```text
$skill-anatomy https://github.com/mattpocock/skills
```

Claude Codeで個別スキルを分析する場合：

```text
/skill-anatomy https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me
```

`blob/REF/PATH/SKILL.md` のURLにも対応します。ブランチ名に `/` がある場合は、最長の一致を使ってブランチとパスを判別します。`tree/REF/skills` のように複数のスキルを含むフォルダのURLでは、その配下をすべて分析します。

デフォルトでは、対象・分析件数・方針・保存先を提示してOKを待ちます。

| オプション | 動作 |
|---|---|
| `--no-confirm` | 今回だけ分析方針へのOKを省略する。ツールの権限確認は省略しない |
| `--refresh` | 変更検出に関係なく、指定範囲を再分析する |

```text
$skill-anatomy https://github.com/mattpocock/skills --no-confirm
```

「指示の分割方法を詳しく」など、重点的に学びたい観点を添えられます。全体URLを渡した場合、個別スキルを選ぶ操作は必須ではありません。

## 出力

```text
reports/mattpocock/skills/
├── repository-analysis.md
├── skill-analyses/
│   └── productivity/
│       └── grill-me.md
└── .state.json
```

| ファイル | 内容 |
|---|---|
| `repository-analysis.md` | 全体概要、スキル一覧と分析状況、スキル同士の関係、共通する設計の工夫 |
| `skill-analyses/<識別パス>.md` | 各スキルの概要、使い方、作成経緯、設計の工夫、応用例、出典 |
| `.state.json` | 完了状態、前回のコミット、調査日、依存ファイルなどの再開情報 |

スキル名だけでは衝突するため、フォルダの階層を残します。`skills/`、`.agents/skills/` などの共通接頭辞は除きます。同じ出力名になるスキルがある場合は、識別用のハッシュを付けて区別します。

個別URLでも全体分析のファイルを用意し、分析した範囲と未分析の項目を明記します。全件完了前は、リポジトリ全体に共通する傾向を断定しません。

作成経緯は対象リポジトリのファイル・コミット・PR・Issueだけで調べます。作者の動機が分からなければ「確認できず」、取得できなければ「未確認」と記載します。作者が述べた事実と分析者の読み解きを区別し、固定コミットやPRなどへのリンクを付けます。弱点評価・改善提案・実行検証は含めません。

## 再開と更新

同じURLで再実行すると、未完了分と変更の影響がある分だけ分析します。大量のスキルも1件ごとに完了状態を保存し、中断後に続きから処理できます。レポートと `.state.json` を一緒にGitで管理すると、分析結果の差分と再開情報を残せます。公開する際は生成内容を確認してください。ツールは自動でcommit・pushしません。

| 変更 | 再調査の対象 |
|---|---|
| スキル内のファイル・関連コミット | そのスキル |
| 登録済みの参照ファイル | それを参照するスキル |
| 共有ファイル、Issue/PR索引 | 影響範囲を断定できないため保守的に全件 |
| 変更なし | 個別分析は保持する |

外部フォルダのファイルを参照した場合は、エージェントが依存情報を記録します。記録されていないスキル間の参照や、Issueの更新日時に反映されないPRレビューの変更は自動検知できない場合があります。その際は `--refresh` を使ってください。GitHub CLIが使えない場合はファイルとコミットで分析を続け、PR・Issueは未確認とします。次回も取得を試みます。

削除されたスキルの過去レポートは残し、全体分析で対象から外れたことを示します。同じリポジトリの別ブランチも同じ保存先を使います。並行実行はせず、新しい準備を始めたら最新PLANを使ってください。

## 補助CLI

通常はエージェントが操作します。手動確認する場合：

```sh
sh scripts/anatomy prepare https://github.com/mattpocock/skills
```

結果の `plan_file` に今回の対象・固定コミット・出力先・未完了状態が入ります。準備だけでは分析文を生成しません。`.cache/` のGitキャッシュやPLANはGit管理から除外しています。

| コマンド | 用途 |
|---|---|
| `prepare URL` | 対象を判別し、分析計画を準備する |
| `approve PLAN` | ユーザーがOKした後に承認を記録する |
| `complete PLAN --skill PATH/SKILL.md` | 個別レポート保存後に完了を記録する |
| `complete PLAN --repository` | 対象の個別分析がすべて終わった後に全体分析の完了を記録する |

読み込んだ共有ファイルは `complete` の `--dependency PATH` で複数登録できます。未承認・古いPLAN・未保存のレポートの完了記録は拒否します。確認はエージェントとユーザーの対話で行うもので、CLIがユーザーの発言を自動検証する仕組みではありません。

ラッパーはreleaseバイナリがなければビルドします。ソースを更新した後は `cargo build --release --locked` で再ビルドしてください。直接バイナリを使う場合は `target/release/skill-anatomy`。別の場所へ移動して使う場合は `prepare` に `--tool-root` で保存先を指定します。

## 開発

```sh
cargo test --locked
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
```

テストでは一時Gitリポジトリを使い、URL判別、確認フロー、途中再開、変更検出、削除された依存ファイル、同名スキル、保存先の逸脱を確認します。GitHubへのアクセスは差し替えるため、テストに認証やネットワーク接続は不要です。分析文の質と、エージェントごとの指示追従はこのテストでは検証していません。

MIT License。対象リポジトリのコードや文章の権利は、それぞれの作者に帰属します。
