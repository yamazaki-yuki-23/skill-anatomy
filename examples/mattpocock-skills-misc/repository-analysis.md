# mattpocock/skills の全体分析

## 概要

今回の対象である misc の4スキルは、Git操作の制約、テストデータの型表現、教材の雛形、コミット前検査を扱う独立した道具です。日常利用しない道具を残しつつ、通常のプラグイン配布と保守から外すという方針でまとめられています。[misc の一覧](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/README.md#L1-L8)・[凍結方針](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)

各スキルは SKILL.md と表示用の agents/openai.yaml を持ち、Git遮断だけが実行用の補助シェルスクリプトを同梱します。必要な環境は一様ではありません。Git遮断は Claude Code と Bash・jq・grep、型表現の移行は TypeScript と shoehorn、教材生成は pnpm と ai-hero-cli、コミット前検査は Husky・lint-staged・Prettier を前提にしています。外部ツールの実装は今回の対象リポジトリ外です。

分析状況：完了 4 / 未完了 0。対象範囲：固定コミットの `skills/misc` フォルダと、配布・保守・履歴の説明に必要な関連ファイルです。engineering、productivity、in-progress、deprecated 配下の個別スキルは対象外で、リポジトリ全体の機能を網羅する分析ではありません。

## スキル一覧

| スキル | 元のパス | 役割 | 分析状況 | 個別分析 |
|---|---|---|---|---|
| git-guardrails-claude-code | skills/misc/git-guardrails-claude-code/SKILL.md | Bash 実行前の文字列照合フックを設置 | 完了 | [処理・経緯・設計](skill-analyses/misc/git-guardrails-claude-code.md) |
| migrate-to-shoehorn | skills/misc/migrate-to-shoehorn/SKILL.md | テスト用の型アサーションを関数へ移行 | 完了 | [処理・経緯・設計](skill-analyses/misc/migrate-to-shoehorn.md) |
| scaffold-exercises | skills/misc/scaffold-exercises/SKILL.md | 計画から教材フォルダと readme を生成 | 完了 | [処理・経緯・設計](skill-analyses/misc/scaffold-exercises.md) |
| setup-pre-commit | skills/misc/setup-pre-commit/SKILL.md | コミット前の整形・検査を設定 | 完了 | [処理・経緯・設計](skill-analyses/misc/setup-pre-commit.md) |

## スキル同士の関係

この4件の本文には、相互の呼び出しや、あるスキルの成果物を次のスキルへ引き渡す指定はありません。共通フォルダに置かれている理由は処理の連鎖ではなく、作者が保持するものの利用頻度が低いという位置づけです。[分類の説明](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/README.md#L1-L8)

Git を使うスキルも役割が異なります。git-guardrails-claude-code は実行直前の遮断を設定し、setup-pre-commit はコミット時の確認を設定します。scaffold-exercises は教材生成後のコミットを指示しますが、ほかの2件の導入を前提にしていません。3件を連続した導入手順とみなす根拠はありません。[遮断設定](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L43-L58)・[コミット前検査](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L37-L47)・[教材の終点](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L8-L8)

個別の流れは各分析の「仕組みと処理の流れ」で追えます。型表現の移行と教材生成は外部パッケージを利用する作業指示が中心で、Git遮断は設置後に動く同梱コードがあります。コミット前検査は、生成した設定から外部ツールと対象プロジェクトの scripts を呼ぶ形です。表示用の agents/openai.yaml は4件とも名前と短い説明だけで、連携処理や実行設定は持っていません。

## 共通する設計

### 動作の境界を本文の条件で決める

4件とも、何を処理対象とし、何を完成とするかを本文の条件で定めています。ただし条件の種類は異なります。Git遮断は利用者が適用範囲とパターンを選び、型表現の移行はテスト専用という境界と入力意図で関数を選びます。教材生成は計画の種類指定とコードの有無に従い、コミット前検査は既存の設定や scripts の有無に合わせます。

| 対象 | 動作を分ける条件 | 具体的に変わる行動 |
|---|---|---|
| Git遮断 | プロジェクト単位か全体か | コピー先と設定ファイルを選ぶ |
| 型表現の移行 | 部分データか意図的な不正値か | fromPartial と fromAny を使い分ける |
| 教材生成 | 計画で種類が明示されているか | 未指定なら explainer、指定時はその種類を作る |
| コミット前検査 | 既存設定・検査 script があるか | 設定を保ち、存在しない script の呼び出しを省く |

根拠と適用条件の詳説は、[Git遮断の設計](skill-analyses/misc/git-guardrails-claude-code.md)、[型表現の使い分け](skill-analyses/misc/migrate-to-shoehorn.md)、[教材の既定値](skill-analyses/misc/scaffold-exercises.md)、[既存環境への適応](skill-analyses/misc/setup-pre-commit.md)にまとめています。これらは本文から読める構造上の共通点であり、作者が4件に共通する設計原則として宣言したものではありません。

### 完成確認は同じ強さの評価を意味しない

各スキルには最後に確認する行動がありますが、確かめる対象が異なります。Git遮断には1つの JSON 入力と終了コード・標準エラーの期待値があり、型表現の移行にはプロジェクトの型検査の指示があります。教材生成では外部 lint に構造を確かめさせ、コミット前検査ではファイル確認、lint-staged 単独実行、最後のコミットを通します。[遮断の期待値](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L87-L95)・[移行後の確認](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L112-L118)・[教材の検査](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L44-L63)・[フックの確認](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L73-L85)

固定ツリーには選択4件の専用評価スイートや保存された実行結果はなく、外部 lint のコードもありません。このため、確認の指示があることを成果全般の保証へ広げられません。Git遮断の未採用 PR に記載されたテスト件数や、Issue 投稿者の修正版の検証結果も、固定コミットの評価結果には含めていません。

### 保存することと通常配布することを分ける

misc をプラグインに含めないことは、[Issue #164 の作者回答](https://github.com/mattpocock/skills/issues/164#issuecomment-4418682499)で意図的だと確認できます。[7月1日の変更](https://github.com/mattpocock/skills/commit/7efc3d2a3899c141f4d64e11be2227e0049db626)は、その扱いを README などにも反映しました。変更の説明によれば、プラグイン定義はこの変更前から misc を含んでおらず、7月に初めて削除したわけではありません。

さらに、作者による [PR #1025](https://github.com/mattpocock/skills/pull/1025)は、ローカル開発用のリンク生成でも misc を除外し、通常配布しない位置づけと揃えると説明しています。固定コミットの[スクリプト](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/scripts/link-skills.sh#L18-L32)にはその除外条件があります。これは新しくリンクする対象の条件であり、すでに存在する古いリンクを削除する処理までは示していません。

[凍結方針](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)が述べる理由は、作者が日常的に使わず修正の妥当性を判断できないことと、利用頻度に対して保守コストが高いことです。一方で、そのまま使える人のためにファイルは残します。設計の保持と保守の継続を分ける判断が、今回の4件に共通する現在の位置づけです。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [固定コミットの skills/misc](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc) |
| 分析コミット | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 調査日 | 2026-11-13 |
| 調査範囲 | 4件の SKILL.md と agents/openai.yaml、同梱シェルコード、misc/README、.out-of-scope/frozen-misc-skills.md、.claude-plugin/plugin.json、scripts/link-skills.sh、package.json。固定ツリー一覧、移動前を追う本文履歴と重要差分。Issue/PR索引全体を関連語で確認し、Issue #14・#164・#301・#465・#898、PR #27・#60・#1025 の本文・コメント・取得対象のレビュー・変更ファイルを読みました。 |
| 未確認の範囲 | 対象外スキルの個別設計、外部依存の実装、外部フォークの修正、専用評価がない対象の一般的な品質。初期の採用動機が記録されていない箇所は各分析に明記しました。Issue/PRは調査時点の情報で、固定コミットの実装と分けました。 |
| 実行検証 | なし |

議論の取得対象では API エラーは記録されていません。作者アカウントの投稿でも AI 生成と明示されたトリアージ文は各個別分析で区別しました。未採用案は現在の実装に含めず、過去レポートの再利用はありません。
