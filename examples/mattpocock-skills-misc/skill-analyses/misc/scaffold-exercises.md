# scaffold-exercises の分析

## 概要と使い方

scaffold-exercises は、教材の計画を番号付きの演習ディレクトリへ変換するスキルです。内容がまだ決まっていない演習は説明用の雛形として作り、教材用 lint が受け入れる構造に整えることを中心にしています。[役割と既定の種類](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L3-L25)

入力はセクション名、演習番号・演習名、必要な種類を含む計画です。出力は `exercises/` 以下のフォルダと各種類の `readme.md` です。`problem` は学習者が取り組む場所、`solution` は解答、`explainer` は TODO を持たない説明教材を表します。本文は lint 通過後の Git コミットも成果の終点に含めています。[種類と成果物](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L8-L42)

想定環境は、pnpm から `ai-hero-cli internal lint` を利用できる教材プロジェクトと Git です。このリポジトリには教材用 lint の実装は同梱されておらず、パッケージの追加手順もありません。スキルは教材内容を完成させるための実装集ではなく、エージェントが既存の計画を配置する指示書です。

## 仕組みと処理の流れ

本文には「Section 05: Memory Skill Building」という計画と生成先の対応例があります。この例を使うと、演習の種類が明示されている場所と、省略されている場所で動作がどう変わるかを追えます。[計画と出力例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L79-L106)

1. エージェントはセクション05を `05-memory-skill-building` にし、演習番号と名前を読み取ります。名前は小文字とハイフンで表します。
2. 種類の指定がない `05.01 Introduction to Memory` と `05.03 Long-term Memory` には、それぞれ `explainer/` を作ります。
3. `05.02 Short-term Memory` は計画が3種類を明示しているため、`explainer/`、`problem/`、`solution/` を作ります。
4. 各種類の直下に、対応するタイトルを持つ `readme.md` を配置します。この例の出力は合計5つの readme で、コードファイルの生成例はありません。
5. 本文の工程に沿って教材用 lint を呼び、報告されたエラーを直して再検査します。冒頭の完了指示では、その後にコミットします。

出力例のうち、同じ演習の目的別フォルダは次のように対応します。これは本文の例の抜粋で、今回生成した教材ではありません。

```text
exercises/05-memory-skill-building/
  05.02-short-term-memory/
    explainer/readme.md
    problem/readme.md
    solution/readme.md
```

フォルダ名の決定、readme の内容、エラーへの対応はエージェントの責務です。lint は生成した構造を検査する外部の道具で、別のスキルを呼び出して作業を引き継ぐ記載はありません。[処理の順序](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L44-L50)

教材の移動・改番は別の利用経路です。本文は `git mv`、番号の更新、移動後の lint を指示し、既存教材の配置が変わる場合にも同じ検査へ戻します。この経路の具体例は embeddings の03から04への改番で、Section05 の新規生成例とは別です。[移動時の指示](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L65-L77)

## 作成・変更の経緯

[2026年2月20日の追加](https://github.com/mattpocock/skills/commit/8e51ff765eb242b65324e9b770526cc53e9db767)の時点で、番号の規則、3種類の教材、readme だけの雛形、lint による確認、Section05 の例が揃っています。したがって、現在の主要な生成方針が後から評価結果に応じて導入されたとは確認できません。

[3月13日の変更](https://github.com/mattpocock/skills/commit/d1beb4fe61574b3325ed96cd0d9a31966d31a02a)は、起動条件を含む name・description のメタデータを追加し、冒頭の指示を「lint を通す」から「lint を通してコミットする」へ変えました。本文中の5段階の工程は lint の再試行までなので、コミットという終点はこの冒頭の追加から読み取れます。変更は確認できますが、コミットを加えた個別の動機は記録から確認できません。

その後、4月の再配置で misc 配下となり、[7月1日の整理](https://github.com/mattpocock/skills/commit/7efc3d2a3899c141f4d64e11be2227e0049db626)で配布上の非推奨区分が明文化されました。現在の[保守方針](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)は、作者が日常利用せず変更の正しさを把握しにくいため保守を凍結すると説明しています。教材生成の規則そのものを廃止したという記載ではありません。

## 設計判断

### 種類が未指定なら説明用の雛形にする

計画が演習名しか含まないとき、コードを書き始めるか、説明の置き場所だけ作るかが分かれます。本文で確認できる採用結果は `explainer` を既定にすることです。問題・解答の種類が明示されたときは、その指定を優先します。Section05 の例では、この条件により05.01と05.03は1フォルダ、05.02は3フォルダになります。[既定値](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L17-L25)・[作例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L83-L105)

これは、未指定の計画に対して問題コードや解答を創作する必要がない構成だと読めます。readme だけの雛形を認め、コードがある場合だけ `main.ts` を要求する条件とも対応します。ただし作者がその目的で他案を比較し、説明用を選んだという発言は未確認です。確認できる判断基準は、計画の明示指定とコードの有無です。[必要ファイル](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L27-L42)

### 教材構造の確認を lint に委ねる

空ディレクトリを作っただけでは、スキルが要求する成果物にはなりません。本文が示す検査対象には、主要フォルダの非空 readme、リンク、禁止ファイル、コードを持つ場合の `main.ts` が含まれます。たとえば `.gitkeep` を置くだけの雛形は認めず、内容のある readme を作るよう指示しています。[検査規則の要約](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L52-L63)

ここで確認できる合格基準は、あくまで SKILL.md が説明する lint の要約です。「各演習に種類のフォルダがある」という説明に加え、problem・explainer・explainer.1 のどれかが必要とも書かれているので、solution だけで十分とは読めません。一方、実際の lint が読む保存階層・必須キー・判定コードはリポジトリ内にありません。教材内容の正確さや教育効果、各コード例の実行成功を検査する基準までは、この要約からは確認できません。

一般のファイル規則はタイトルと説明を勧めますが、本文の作例はタイトルだけを配置しています。また非空条件の説明もタイトル1行を許しています。したがってタイトルだけの作例を完成した教材本文と扱う必要はなく、ここでは構造を整えるための最小の内容として読めます。外部 lint が本当に受け入れるかは未実行です。[readme の条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L29-L42)・[作例の内容](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md#L98-L106)

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [scaffold-exercises](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/SKILL.md) |
| 分析コミット | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 調査日 | 2026-11-13 |
| 調査範囲 | 本文全体、agents/openai.yaml、misc/README、保守方針、plugin.json、link-skills.sh、package.json、固定ツリー一覧、移動前を含む履歴、初出と3月13日の差分。Issue/PR索引全体を関連語で確認し、共通配布方針の Issue #164 と PR #1025 を確認しました。 |
| 未確認の範囲 | コミット終点を加えた動機、外部 ai-hero-cli の実装と検査結果。固定ツリーに専用 evals/tests/fixtures、共有教材検査への参照はありません。直接関連する議論は索引の関連語検索では見つかりませんでした。 |
| 実行検証 | なし |

[package.json](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/package.json#L12-L21)にあるのはリリース管理用のスクリプト・依存で、教材用 lint の実装ではありません。[表示用メタデータ](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/scaffold-exercises/agents/openai.yaml#L1-L3)も実行条件や検査コードを追加していません。
