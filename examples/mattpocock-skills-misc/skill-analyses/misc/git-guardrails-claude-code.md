# git-guardrails-claude-code の分析

## 概要と使い方

git-guardrails-claude-code は、Claude Code が Bash で Git コマンドを実行する直前に、特定の文字列を含む操作を止めるフックを設置するスキルです。危険な操作を会話上の注意だけに委ねず、実行前の補助スクリプトで判定する構成です。ただし、ここで確認できる実装はコマンド文字列の照合であり、Git 操作全般の安全を保証するものではありません。[役割と遮断対象](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L3-L18)

入力は、プロジェクト単位か全プロジェクト共通かという設置範囲と、遮断パターンの追加・削除の希望です。出力は、選んだ範囲の `.claude/hooks/block-dangerous-git.sh` と `settings.json` の設定です。Claude Code の `PreToolUse` はツールの使用直前に呼ぶ仕組みで、この設定では `Bash` を対象にします。スクリプトは Bash、JSON 抽出用の jq、文字列照合用の grep を使います。依存の実体はコードから確認でき、SKILL.md に jq の導入工程はありません。[設置手順](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L22-L81)・[補助コード](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/scripts/block-dangerous-git.sh#L1-L25)

## 仕組みと処理の流れ

本文にある検証入力 `tool_input.command = "git push origin main"` を追います。これはフックに渡す JSON の例です。今回この入力を実行した結果ではなく、記述された期待値とコードの対応を説明します。[検証例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L87-L95)

1. エージェントは、設置先をプロジェクト内かホームディレクトリ配下か利用者に尋ねます。決まった場所へ同梱スクリプトをコピーし、実行権限を付けます。
2. 選んだ設定ファイルの `hooks.PreToolUse` に Bash 用の呼び出しを加えます。既存ファイルがある場合は配列へ統合し、他の設定を上書きしません。
3. 利用者に遮断一覧の変更希望を尋ね、必要ならコピー先のスクリプトを編集します。
4. フックは標準入力全体を読み、jq で `.tool_input.command` を取り出します。例の文字列は一覧の `git push` に一致します。
5. 一致すると、該当コマンドとパターンを含む `BLOCKED` メッセージを標準エラーへ出し、終了コード2で終了します。一致しない場合の終点は終了コード0です。

設置の判断と既存設定の統合はエージェントの責務で、毎回の文字列判定はコピーされたコードの責務です。コードは受け取ったコマンドを自分で実行せず、grep の拡張正規表現で照合します。したがって検証例も実際に push する手順ではなく、JSON を渡して応答を確かめる作りです。[設定・調整・検証](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L81-L95)・[照合処理](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/scripts/block-dangerous-git.sh#L3-L25)

本文の合格条件は「終了コード2」と「標準エラーの BLOCKED 表示」の組です。固定コミットには、このスキルの独立したテストスイートや評価用入力集はありません。この1例から他の綴りや異常な JSON の扱いまで検証済みとは読めません。

## 作成・変更の経緯

2026年2月10日の[追加コミット](https://github.com/mattpocock/skills/commit/30e0fdc263826f6db7b84362167a166d69d3041c)では、旧名 `setup-git-guardrails` の本文と補助スクリプトが追加されています。同日の[変更](https://github.com/mattpocock/skills/commit/b81729c6adec4fe7727da92020a5cb5358b2edd6)は現在名への変更で、スクリプトの内容は同一です。名称変更から判定方式の変化を読み取ることはできません。

実質的に異なる案として、[PR #27](https://github.com/mattpocock/skills/pull/27) は、常時遮断とリポジトリ別の書き込み許可を2つのフックに分け、GitHub CLI も扱う案を提示しました。しかし PR は未マージで閉じられ、固定コミットは単一スクリプトのままです。提案者のテスト件数も、この固定コミットの評価結果には含めません。作者がこの案を採用しなかった技術的な理由は、取得した本文・コメント・レビューからは確認できませんでした。

7月1日の[非推奨配布枠への整理](https://github.com/mattpocock/skills/commit/7efc3d2a3899c141f4d64e11be2227e0049db626)を経て、固定コミットでは misc 全体が保守対象外です。[方針文書](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)は、作者が日常的に使わず変更の妥当性を判断できないことと、利用頻度に対する保守コストを理由として説明しています。これは最初にフック方式を選んだ理由とは別の、現在の保守方針です。

## 設計判断

### 設置範囲を決めてから設定を変更する

どのプロジェクトに制約を及ぼすかが決まらなければ、設定ファイルの場所も決まりません。確認できる選択肢はプロジェクト単位と全プロジェクト共通の2つです。スキルは利用者の選択を先に求め、その後にコピーと設定追加へ進みます。採用する判断基準は適用範囲で、危険度によってスキル側が設置先を決める構成ではありません。[範囲確認](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L22-L35)

既存の `hooks.PreToolUse` 配列への統合という指示は、他のフックや設定を残したまま制約を追加する動作を定めています。調整の対象も同梱元ではなくコピー先です。これにより、設置先の利用者が遮断内容を決める形になります。これらは指示から読み取れる役割分担であり、作者が比較検討した全候補の記録ではありません。[既存設定と調整](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md#L81-L85)

### 操作の意味ではなく文字列を判定する

実装上の問いは「何をもって遮断対象とするか」です。採用されているのは固定パターンとコマンド全文の一致で、リポジトリの所有者やブランチの状態は判定材料にありません。通常の push も force push も `git push` で止まります。一方、`push --force` や `reset --hard` という git を含まないパターンも併記されています。[パターン一覧](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/scripts/block-dangerous-git.sh#L6-L16)

この条件の具体的な意味は、[Issue #301](https://github.com/mattpocock/skills/issues/301)の `git -C /any/repo push` という報告で追えます。文字の間にオプションが入ると `git push` とは一致しません。ただし同じ報告に挙がる全例が同じ理由で通過するとは限らず、`reset --hard` は独立パターンにも一致します。ここでは報告者の主張とコードの条件を区別します。判定条件の説明であって、今回の再現実行ではありません。

[Issue #898](https://github.com/mattpocock/skills/issues/898)は jq 不在時にも言及しています。固定コードは抽出の終了状態を検査せず、一致がなければ0で終わります。作者アカウントの[回答](https://github.com/mattpocock/skills/issues/898#issuecomment-6034220111)は「AIによるトリアージ生成」と明示され、保守を行わず、安全保証として依存しないよう説明しています。提案された構文解析や失敗時遮断は、採用済みの仕様として扱えません。元の文字列方式を選んだ当時の判断基準や、組み込み deny ルールとの比較理由も未確認です。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [git-guardrails-claude-code](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md) |
| 分析コミット | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 調査日 | 2026-11-13 |
| 調査範囲 | 本文、補助スクリプト、agents/openai.yaml、misc/README、保守方針、plugin.json、link-skills.sh、package.json、固定ツリー一覧、移動前を含む本文履歴。Issue #301・#465・#898、PR #27・#1025 と取得できる関連コメント・レビュー・変更ファイル。索引全体を関連語で確認しました。 |
| 未確認の範囲 | 初期方式の採用動機、組み込み権限との比較理由。外部フォークの修正版は未取得。固定ツリーで専用評価・共有評価への参照は見つからず、PR記載のテストは未採用案の情報です。 |
| 実行検証 | なし |

表示用メタデータは[名前と短い説明](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/agents/openai.yaml#L1-L3)のみです。[Issue #465 の回答](https://github.com/mattpocock/skills/issues/465#issuecomment-6016340857)も、比較ドキュメントを追加しない現在の保守方針を示しています。
