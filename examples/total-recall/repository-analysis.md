# gavdalf/total-recall の全体分析

## 概要

Total Recallは、会話を自動で観察してMarkdownへ保存し、セッションをまたいで読み直す記憶システムです。保存の取りこぼしを複数の起動条件で補い、LLMによる意味の判断と、シェルによる収集・保存・検査を分けています。

固定コミットにはルートのSKILL.mdが1件あります。Observer、Reflector、Recovery、Linux用Watcherに加え、任意の夜間整理を行うDream Cycleが含まれます。READMEはさらに、外部サービスのイベントから考察・質問・下書きなどを作るAmbient Intelligence Engine（AIE）を説明しています。AIEは同居する処理系であり、別スキルとして数えていません。[READMEの構成説明](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/README.md#L5-L46)が出典です。

setupが確認する依存はjq、curl、python3、PyYAMLです。会話の入力にはOpenClaw形式のセッションJSONL、圧縮には設定したLLMの認証情報が必要です。Linuxの反応型Watcherにはinotifyとsystemdを使います。cronと起動時の読み込み指示は利用者が設定します。Dream Cycleは専用プロンプトを読むエージェントが本体で、シェルはファイル操作の補助です。[setupの確認処理と案内](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/setup.sh#L21-L60)と[個別分析](skill-analyses/root.md)で条件を説明しています。

分析状況：完了 1 / 未完了 0。対象範囲：リポジトリ全体から検出されたSKILL.md 1件と、その動作・設計を説明する関連資料です。AIEは設定と主要処理の役割を確認し、コネクタ個別の実装と外部サービスの動作は詳細分析の対象外としました。4月1日の固定点には[開発休止の告知](https://github.com/gavdalf/total-recall/issues/22)があります。

## スキル一覧

| スキル | 元のパス | 役割 | 分析状況 | 個別分析 |
|---|---|---|---|---|
| total-recall | SKILL.md | 会話の自動収集、統合、取りこぼし回収と夜間の記憶整理 | 完了 | [日本語Markdown](skill-analyses/root.md)・[HTML](skill-analyses/root.html) |

検出されたスキルはこの1件です。Dream CycleやAIEのスクリプト群は、独立したSKILL.mdの件数へ加えていません。

## スキル同士の関係

[個別分析「仕組みと処理の流れ」](skill-analyses/root.md#仕組みと処理の流れ)を参照してください。

## 共通する設計

[個別分析「設計判断」：取りこぼしを補う起動条件、意味の選別と保存条件の役割分担、人の承認を待つ段階](skill-analyses/root.md#設計判断)を参照してください。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [gavdalf/total-recall](https://github.com/gavdalf/total-recall/tree/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f) |
| 分析コミット | `437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f` |
| 調査日 | 2026-11-13 |
| 調査範囲 | SKILL.md、README、CHANGELOG、architecture、setup、会話記憶の4種のスクリプトとプロンプト、Dream Cycleの指示・補助コード・schema・README、staging-review、起動・圧縮前設定とテンプレート、tests/validate-fixes.sh。AIEの設定と主要処理も参照しました。到達可能な全コミット一覧と重要変更の差分、全ページのIssue/PR索引、#2・#9・#14・#22の詳細を確認しました。 |
| 未確認の範囲 | コネクタ個別の外部動作、他の議論詳細、未公表の動機、性能と費用の再現性。大きいPR #14応答の省略部分のレビュー発言は根拠にしていません。固定点より後の議論は当時の実装の証拠にしていません。外部記事や派生リポジトリは取得していません。 |
| 実行検証 | なし |

個別分析はIssue #9の再現報告を代表例に、エージェントの判断と補助コードの保存処理を対応付けています。プロンプト内の形式例、静的なテスト、作者が記載した運用実績は区別しています。履歴や議論、本文中の具体的な設計判断の出典は[個別分析の調査記録](skill-analyses/root.md#調査範囲と出典)にまとめています。
