# Repository Guidelines

Skill anatomyは、GitHub上のAIエージェント向けスキルを調べ、作者が向き合った課題と設計判断を日本語のレポートに読み解くスキルです。

## 保守の入口

コード、スキル、配布構成、テストを変更したら`bun run verify`を実行してください。失敗した状態で完了としないでください。ログは`.cache/harness/verify-*/`に保存されます。機械検査の成功を、説明の正しさや読みやすさの保証にしないでください。

ドキュメントと既存のコードが食い違うときはコードの書き方に従い、見つけた食い違いを最後の返答ですべて挙げてください。

## プロジェクト構成

| パス | 役割 |
| --- | --- |
| `src/anatomy.ts` | 調査計画の作成 |
| `src/repository.ts`、`src/skills.ts` | Git取得、URL判別、スキル検出、Issue・PRの一括取得 |
| `src/source.ts` | 固定コミットのファイル展開と索引 |
| `src/hash.ts`、`src/state.ts` | ハッシュ、承認と完了記録 |
| `src/storage.ts`、`src/workspace.ts` | 保存処理と保存先の検証 |
| `src/markdown.ts`、`src/render.ts`、`src/templates.ts`、`src/html.ts` | Markdownの部分集合の変換、HTML版の組み立て、テンプレートの所在、安全条件の検査 |
| `src/cli.ts`、`src/types.ts` | CLIの実装、共有型定義 |
| `skills/skill-anatomy/` | 公開スキル。`SKILL.md`、`references/`、`assets/templates/`、`agents/openai.yaml`、コンパイル済みの`dist/`（Gitで管理し、インストール先ではビルド不要） |
| `scripts/anatomy`、`scripts/harness/` | CLIの起動スクリプト、構成検査・検証記録・Codexレビュー・リリース準備・実モデル評価 |
| `tests/`、`examples/`、`docs/` | テスト、レポート例、評価の定義 |

## 開発コマンド

Bun 1.3.8以降、Node.js 22以降、Gitを使い、リポジトリのルートで実行します。利用者の実行環境はNode.jsとGitだけで、Bunは開発専用です。

| コマンド | 内容 |
| --- | --- |
| `bun install --frozen-lockfile --ignore-scripts` | 開発用の依存を導入 |
| `bun run format` | 整形（`.oxfmtrc.json`） |
| `bun run check`、`bun run lint`、`bun run format:check` | 型・命名（`.oxlintrc.json`、`scripts/style-rules.ts`）・書式の検査 |
| `bun run build`、`bun run check:dist` | `skills/skill-anatomy/dist/`の再生成と一致確認 |
| `bun run test` | Vitest |
| `bun run verify` | 上記の検査をまとめて実行。CIも同じ |
| `bun run test:security` | 外部文章による誘導の実モデル評価。ログイン済みCodexが必要で、CIに含めない |
| `bun run harness:review` | Codexによるローカルレビュー。記録は`.cache/harness/review-*/` |

ソースを変えたら、再生成した`dist/`を同じコミットに含めてください。状態ファイルとGitHub APIのキーは互換性のため元の表記を維持します。テストは`tests/*.test.ts`に置き、共有ヘルパーは`tests/runtime.ts`、後片付けは`onTestFinished`で登録します。承認、分析の再開、保存先の安全性に影響する変更では、それぞれの動作を検証してください。配布テストでは、ソースや開発依存のないインストール先でCLIが動くことを確認します。

## 作業の進め方

1. 対応Issue、確定した範囲、操作権限を確認します。Issueの存在や検査の合格は、仕様承認やマージ・push・公開の許可ではありません。
2. 作業ブランチで実装し、必要なテスト・文書・`dist/`を同じ変更に含めます。利用者向けの動作説明を変えたら`README.md`と`README.ja.md`を揃えます。
3. PRを作り、コメントで`@codex review`を依頼します。回答が最新headの完全SHAを対象にしていることを確認し、指摘はseverityによらず対応します。不採用にする指摘は根拠をPRに残し、未対応0件と不採用件数を分けて報告します。待機中や対象SHA不明を指摘0件としません。headを更新したら再度依頼します。
4. マージ前に最新remote masterへrebaseで追従し（merge commitは使わない）、1コミットにまとめ、更新headで`verify`・CI・Codex指摘0件を確認します。直前にmasterがheadの祖先であることとheadの不変を確かめ、head SHAを固定してRebase and mergeします。統合後はlocal masterをff-onlyで同期します。
5. PRには関連Issue、変更内容、対象SHA、検証コマンドと結果、評価記録の参照先を書きます。失敗・未確認を合格にせず、全結果を保持します。認証情報や非公開ログは載せません。

## 評価

- 出力不変の内部変更は、`verify`と同一性・回帰の確認で判断します。
- スキルの判断手順や出力基準、承認・保存先・再開の安全性に影響する変更では、`bun run test:security`（[安全性評価](docs/security-evaluation.md)）と[実モデル評価](docs/real-model-evaluation.md)を行い、生成レポートを[品質の採点基準](docs/quality-rubric.md)で実読して採点します。
- 出力不変の変更と生成内容に影響する変更は別のPRにします。比較回数と予算は事前に決めます。

## コミットとプルリクエスト

コミットの件名には`docs:`、`feat:`、`refactor:`、`ci:`などの接頭辞を付け、変更内容を英語の命令形で書きます。目的ごとに分けます。PRには動作の変更内容、関連Issue、検証コマンドと結果を記載し、表示を変える場合はスクリーンショットを添えます。

## 定期運用とリリース

PRとmasterへのpushでLinux・macOS、Node.js 22・24の`verify`が走り、毎週月曜9時（日本時間）に同じ検査と`bun audit`、Dependabotが依存更新のPRを作ります。`v*`タグのpushでReleaseワークフローが内容を検証し、GitHub Releaseを公開します。

リリースはマージ・push・公開の権限を確認した担当が行います。

1. `bun run release:prepare 0.9.0`のように次の番号を指定し、`package.json`とCLIの番号を揃えて配布ファイルを生成します。
2. `bun run verify`と`bun run release:check v0.9.0`を実行し、PRでmasterへ反映します。
3. 統合コミットに`git tag v0.9.0`を付けて`git push origin v0.9.0`で送ります。

既存タグの付け替え、公開済みリリースの上書き、番号不一致・master外・検証失敗のコミットの公開はしません。`gh skill update`がソースの`SKILL.md`へ`metadata.github-*`を追加した場合は、本文の変更と混ざっていないことを確認して取り除きます。

## セキュリティと設定

`SKILL_ANATOMY_WORKSPACE`でレポートの保存先をインストール先の外に指定できます。レポート、テストデータ、ログに認証情報を含めないでください。脆弱性は`SECURITY.md`の手順に従い非公開で報告してください。
