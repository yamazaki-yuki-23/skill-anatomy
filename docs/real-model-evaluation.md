# 実モデル評価

スキルの判断手順や出力基準を変えたときに、固定した原典で新しいスキルを実際のモデルに実行させ、生成レポートを実読して品質を確かめる。機械検査の成功だけで合格にしない。採点は[品質の採点基準](quality-rubric.md)、外部文章による誘導の確認は[安全性評価](security-evaluation.md)に従う。

## 実行

ログイン済みのCodex CLIとGitHub CLIが必要で、CIには含めない。

```sh
bun scripts/harness/real-eval.ts single
bun scripts/harness/real-eval.ts multi
```

| 題材 | 原典 | 内容 |
| --- | --- | --- |
| `single` | gavdalf/total-recallの固定コミット | 1スキル |
| `multi` | mattpocock/skillsの`skills/misc`の固定コミット | 複数スキルのリポジトリ |

原典は`.cache/issue-work/<owner>-<repo>.git`へbare cloneし、記録は`.cache/issue-work/<題材>-<時刻>/`に残る（`conditions.json`、`events.jsonl`、`tools.jsonl`、`timings.jsonl`、`summary.json`、生成レポートは`workspace/`）。

モデルに許すのは、固定コミットのファイルとその祖先コミット、同じリポジトリのIssue・PRの読み取り、承認済みレポートの書き込みだけで、この許可規則は`tests/real-eval.test.ts`で検査する。実行中は作業ツリーと`skills/skill-anatomy/dist/`を変更しない。

## 記録

- 生成前に対象の完全SHA、原典のコミットと範囲、試行回数と停止条件を決め、`conditions.json`と対応付ける。
- 全試行の原文・操作記録・採点を保持し、失敗した試行を上書きしない。同じ入力を成功するまで再生成した結果で合格を主張しない。
- headを更新したら、変更の影響範囲を確認する。影響がない根拠を示せる範囲は既存の記録を再利用し、影響がある範囲は再生成して実読する。失敗・未確認は未解決として残す。
- 公開できない原文はGit管理外に置き、PRには確認できた結果と参照先、共有できない制約を要約する。
