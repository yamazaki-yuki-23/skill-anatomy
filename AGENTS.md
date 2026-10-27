# Repository Guidelines

## 保守の入口

コード、スキル、配布構成、テストを変更したら`bun run verify`を実行してください。検査に失敗した状態で完了としないでください。ログは`.cache/harness/verify-*/`に保存されます。

作業の進め方、Codexレビュー、定期検証、リリースは[保守手順](docs/maintenance.md)にまとめています。スキルの判断手順や出力基準を変えた場合は、実モデルでの評価とレポートの確認も行ってください。機械検査の成功を、説明の正しさや読みやすさの保証にしないでください。

ドキュメントと既存のコードが食い違うときはコードの書き方に従い、見つけた食い違いを最後の返答ですべて挙げること

着手前に対応Issue、確定した範囲、操作権限を確認してください。引き渡しには完全なコミットSHAと検証証拠を添え、修正後は再確認してください。Issue作成や検査合格は、仕様承認やマージ・push・公開の許可を意味しません。役割とIssue・PR運用の詳細は[保守手順](docs/maintenance.md)に従ってください。

調整担当はIssueと完了条件を整理し、担当への直接指示と受領確認まで行ってください。利用者を伝言役にせず、必要情報や権限が不足する場合だけ質問してください。継続監督と完全移譲、送信先・送信結果の確認は保守手順に従ってください。

調整担当は[調整台帳](docs/maintenance.md#調整台帳と滞留時の対応)に担当・状態・次の行動を記録してください。head更新時は[差分評価](docs/maintenance.md#差分に応じた検証と証拠の再利用)で既存証拠の適用範囲と必要な再検証を決め、失敗・未確認を合格にしないでください。

今後すべてのPRで、調整担当はPR作成後に`@codex review`をPRコメントへ投稿し、最新head SHAに対する実際の完了回答を確認してください。指摘はseverityにかかわらず原則対応し、不要な指摘には根拠付き不採用理由を残してください。未対応の採用対象0件と不採用件数を区別し、待機・利用不可・対象SHA不明を指摘ゼロにしないでください。修正後の検査・独立QA/レビュー・権限内の通常push・再レビューの記録を次の担当へ引き継ぎ、利用者に投稿や転送を頼まないでください。レビューコメントは操作権限を増やしません。具体手順は[保守手順](docs/maintenance.md)を参照してください。

マージ前は最新remote masterへ必要なrebaseで追従し、merge commitで更新しないでください。更新headの必要検証と明示Codexレビューの実完了・指摘0件・不採用0件を確認してください。直前に最新masterの祖先関係とhead不変を再確認し、権限内でhead SHAを固定してGitHub Rebase and mergeしてください。追従・再検証・統合後の確認は[保守手順](docs/maintenance.md#マージ前のmaster追従と統合)に従ってください。

通常は調整・実装と、実装者とは別の独立確認（QA・レビュー兼任）の2系統で進めてください。出力不変の内部改善と生成内容に影響する変更は別PRに分け、前者は同一性・回帰、後者は必要な独立品質評価で確認してください。比較回数と調査予算は事前に決め、全結果を保持してください。具体手順は[保守手順](docs/maintenance.md)に従ってください。

## プロジェクト構成

Skill anatomyは、スキルの仕組みを知り、自作に活かすためのAIエージェント向けスキルです。GitHub上のスキルのURLを渡すと、仕組みや設計の工夫、自作への応用を日本語のレポートにまとめます。

| パス | 役割 |
| --- | --- |
| `src/anatomy.ts` | 調査計画の作成 |
| `src/repository.ts`、`src/skills.ts` | Git取得、URL判別、スキル検出 |
| `src/fingerprint.ts`、`src/state.ts` | 差分判定、承認と完了記録 |
| `src/storage.ts`、`src/workspace.ts` | 保存処理と保存先の検証 |
| `src/cli.ts` | CLIの実装 |
| `skills/skill-anatomy/dist/` | コンパイル済みのJavaScript。Gitで管理し、インストール先ではビルド不要 |
| `scripts/anatomy` | CLIの起動スクリプト |
| `skills/skill-anatomy/SKILL.md` | エージェントの作業手順 |
| `skills/skill-anatomy/references/`、`skills/skill-anatomy/assets/templates/` | 補足資料、レポートのテンプレート |
| `skills/skill-anatomy/agents/openai.yaml`、`examples/` | エージェントのメタデータ、レポート例 |
| `tests/` | テストとチェックポイントのテストデータ |
| `scripts/harness/` | 構成検査、検証記録、Codexレビュー、リリース準備 |

利用者向けの動作説明を変えるときは、`README.md` と `README.ja.md` の内容を揃えてください。

## ビルド・テスト・開発コマンド

開発にはBun 1.3.8以降、Node.js 22以降とGitを使い、リポジトリのルートで実行してください。

1. `bun install --frozen-lockfile --ignore-scripts`で開発用の依存を導入します。
2. `bun run format`でコードを整形します。
3. `bun run check`、`bun run lint`、`bun run format:check`で型・命名・書式を検査します。
4. `bun run build`で`skills/skill-anatomy/dist/`を再生成し、`bun run check:dist`で一致を確認します。
5. `bun run test`でVitestを実行します。

書式は`.oxfmtrc.json`、命名とコードの規約は`.oxlintrc.json`と`scripts/style-rules.mjs`で検査します。CIでも同じ検査を実行します。状態ファイルとGitHub APIのキーは、互換性のため元の表記を維持します。

ソース変更時は、再生成した`skills/skill-anatomy/dist/`を同じコミットに含めてください。利用者向けCLIの使い方は`node skills/skill-anatomy/dist/cli.js --help`で確認できます。

## テスト方針

テストは`tests/*.test.ts`に置き、Vitestを使います。共有ヘルパーは`tests/runtime.ts`に置き、テストも`bun run check`のstrict型検査に含めます。ローカルGitリポジトリと一時ディレクトリを使い、`onTestFinished`で後片付けを登録してください。承認、分析の再開、保存先の安全性に影響する変更では、それぞれの動作を検証します。

配布テストでは、ソースや開発依存を含まないインストール先でCLIが動作することを確認します。`bun run test:security`はログイン済みCodexを使う任意の挙動検証で、通常のテストやCIには含めません。

## コミットとプルリクエスト

コミットの件名には `docs:`、`refactor:`、`ci:` などの接頭辞を付け、変更内容を英語の命令形で書いてください。コミットは目的ごとに分けてください。

プルリクエストには動作の変更内容、関連Issueへのリンク、検証コマンドと結果を記載します。画像や表示を変える場合はスクリーンショットを添付してください。

## セキュリティと設定

`SKILL_ANATOMY_WORKSPACE` で、レポートの保存先をインストール先の外に指定できます。レポート、テストデータ、ログに認証情報を含めないでください。脆弱性は `SECURITY.md` の手順に従い、非公開で報告してください。
