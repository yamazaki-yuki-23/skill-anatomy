# 開発・保守の入口

```sh
bun run verify
```

公開スキルの構成、リンク、型、命名、書式、配布ファイル、バージョン、Vitestを検査する。1つでも失敗すれば終了コードは0にならない。検査ごとのログと結果は`.cache/harness/verify-*/`に保存される。GitHub Actionsも同じコマンドを使う。

開発にはBun 1.3.8以上、Node.js 22以上、Gitを使う。初回は`bun install --frozen-lockfile --ignore-scripts`で依存を導入する。利用者にBunは必要ない。

テストは`tests/*.test.ts`、共有ヘルパーは`tests/runtime.ts`に置く。`bun run check`は本体・開発スクリプト・テストを同じstrict設定で型検査し、`bun run test`はVitestをBun上で実行する。配布物の動作はNode.jsを使うテストで確認する。

## 変更から検証まで

1. 依頼の目的と、完了を判断できる条件を決める。関連する実装・スキル・既存テストを読む。
2. 不具合修正では、その不具合を再現するテストを追加する。実際の失敗を確認してから直す。
3. 必要な範囲を変更する。コードを変えた場合は`bun run build`で配布ファイルを更新する。
4. `bun run verify`を実行する。失敗した検査のログから原因を調べ、修正後に再検証する。文書だけの変更は`bun run check:skill`と`git diff --check`で確認する。
5. スキルの判断手順や出力基準を変えた場合は`bun run test:security`も実行し、生成レポートを読む。操作が安全か、根拠と解釈が分かれているか、自作への応用が具体的かを確認する。

検査の成功と、文章の品質確認は別に扱う。モデルが作る説明の正しさは、見出しやキーワードの一致だけでは判断しない。新しく見つかった失敗は、テストデータや攻撃例へ追加して次回も検証する。[評価の手順と限界](security-evaluation.md)も参照する。

## Codexによる保守レビュー

```sh
bun run harness:review
```

ログイン済みのCodex CLIが必要。Git管理下のテキストと差分から、読み取り用スナップショットを作る。削除ファイルにはHEAD時点の内容を添える。新規ファイルはステージしてから実行する。`.env`、認証設定、鍵ファイル、シンボリックリンク、画像、生成済みJavaScriptなどは渡さない。除外したパスは`snapshot.json`へ記録する。

モデルに渡すツールは、スナップショット内のファイル一覧と読み取りだけ。シェル、書き込み、Web検索、外部サービス連携は無効にする。通常の開発作業を行うエージェントとは別の、レビュー専用の実行である。

`AGENTS.md`、ルートの`package.json`、公開する`SKILL.md`、`src/cli.ts`を読んだ記録がなければ失敗する。指摘には実在するパス・行番号・修正案を求める。highまたはmediumの指摘があれば終了コードは0にならない。レビュー結果を修正へ反映し、再度`verify`とレビューを実行する。自動でコード変更やマージは行わない。

`.cache/harness/review-*/`に、入力のスナップショット、Codexのイベント、指摘、結果を保存する。入力のハッシュとコミットも記録する。モデルをそろえて比較する場合は、実行前に`SKILL_ANATOMY_REVIEW_MODEL`を設定する。未指定ならCodex CLIの既定モデルを使い、モデル名は固定しない。

レビューはすべての不具合を検出する保証ではない。除外したファイルと、取得できた証拠の範囲を確認する。Codexの設定項目はバージョンによって変わるため、CLI更新後は実際にレビューを実行して互換性を確認する。

## 定期運用

| きっかけ | 実行される処理 | 確認する結果 |
| --- | --- | --- |
| PR・masterへのpush | Linux・macOS、Node.js 22・24で`verify` | CI結果と14日間保存する検証ログ |
| 毎週月曜9時、日本時間 | 同じ検証と`bun audit` | 依存の脆弱性と既存処理の失敗 |
| 依存の新バージョン | DependabotがBunとGitHub Actionsの更新PRを作成 | 更新差分とCI結果 |
| `v*`タグのpush | タグの内容を検証し、成功後にGitHub Releaseを作成 | バージョン一致、公開結果 |

AIレビューと攻撃例の実モデル評価は、ログインとモデル利用を伴うためローカルから実行する。通常のCIではAPIキーを使わない。

## リリース

1. `bun run release:prepare 0.3.1`のように、次の安定版の番号を指定する。`package.json`とCLIの番号をそろえ、配布ファイルを生成する。
2. `bun run verify`と`bun run release:check v0.3.1`を実行する。
3. 差分をレビューし、コミットしてmasterへ反映する。
4. `git tag v0.3.1`で、そのコミットにタグを付ける。
5. `git push origin v0.3.1`でタグを送る。Releaseワークフローが検証後に公開する。

番号は実際の次バージョンへ置き換える。既存タグを付け替えない。タグとCLIの番号が違う場合、masterに含まれないコミットの場合、検証に失敗した場合は公開しない。公開済みリリースの上書きもしない。

`gh skill update`がソースの`SKILL.md`へ`metadata.github-*`を追加した場合、公開用の構成検査が失敗する。これは導入先を追跡する情報であり、開発元にはコミットしない。本文の変更と混ざっていないことを確認してから取り除く。

## 参考にした公式資料

- [Using skills to accelerate OSS maintenance](https://developers.openai.com/blog/skills-agents-sdk)：リポジトリの指示と検証の手順をそろえる考え方。
- [Build an Agent Improvement Loop with Traces, Evals, and Codex](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)：実行記録とフィードバックを回帰評価へ戻す考え方。
- [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)：`codex exec`による処理の組み込み。
