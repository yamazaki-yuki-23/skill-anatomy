# setup-pre-commit の分析

## 概要と使い方

setup-pre-commit は、コミット前に整形・型検査・テストを呼ぶ仕組みを既存リポジトリへ設置するスキルです。整形はステージ済みファイルに絞り、型検査とテストは既存スクリプトを使うという、検査範囲の使い分けが中心です。[役割](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L3-L13)・[実行順序](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L87-L91)

入力は現在のリポジトリのロックファイル、package.json の scripts、既存の Prettier 設定です。出力は Husky のフック、lint-staged の設定、必要なら Prettier の設定、および開発用依存の追加です。Husky は Git のフックを管理し、lint-staged はコミット対象としてステージしたファイルへ処理を絞り、Prettier は書式を整えます。[依存導入とフック](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L17-L55)

Node.js 系のパッケージ管理と Git を使うプロジェクトが前提です。本文は npm・pnpm・yarn・bun のロックファイルを挙げ、判別できない場合は npm を既定にしています。型検査とテストの仕組みを新規に作る指示ではなく、それらの script がなければフックから該当行を省く指示です。[検出条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L17-L19)・[適応条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L37-L47)

## 仕組みと処理の流れ

このスキルには設定例がありますが、特定の入力リポジトリから生成結果までを示した独立の利用例や実行記録はありません。以下は本文の工程順に沿った説明であり、架空のプロジェクトを作って結果を補ったものではありません。

1. エージェントはロックファイルからパッケージマネージャーを選び、husky・lint-staged・prettier を開発用依存として追加します。
2. Husky を初期化します。本文の説明では `.husky/` が作られ、package.json の prepare に `husky` が設定されます。
3. `.husky/pre-commit` に lint-staged、型検査、テストの順で呼び出しを書きます。存在しない script の行は省略し、そのことを利用者へ伝えます。
4. `.lintstagedrc` を作り、Prettier 設定がなければ既定の `.prettierrc` を作ります。
5. ファイルの存在・実行権限・prepare 設定を確認し、lint-staged を実行します。その後、変更をステージしてコミットし、新しいフックが動く経路を通します。

フックの掲載例は次の3行です。本文は npm の部分を検出したパッケージマネージャーに合わせるよう明記しています。

```text
npx lint-staged
npm run typecheck
npm run test
```

これはすべてのリポジトリへ無条件に3行を入れる仕様ではありません。既存の scripts を確かめて行を選ぶことが、設定の具体化に必要です。どの行を残すかはエージェントの判断で、コミット時の呼び出しは Husky に、整形対象の絞り込みは lint-staged に委ねます。[フック例と分岐](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L29-L47)

整形の設定例は `"*": "prettier --ignore-unknown --write"` です。対象は lint-staged が受け取るステージ済みファイルで、未知の形式は Prettier のオプションで飛ばす説明になっています。型検査とテストは、そのファイル一覧へ限定する指定がなく、プロジェクトの script を呼びます。[整形設定](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L49-L55)・[補足](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L89-L91)

確認項目は、フックの存在と実行可能性、lint-staged 設定の存在、prepare の値、Prettier 設定、lint-staged の実行です。最後のコミットは、それらを Git から呼ぶ経路の smoke test、つまり接続の簡易確認として説明されています。本文のチェックリストと実行成功の記録は別で、固定コミットにこのスキル専用の自動評価はありません。[確認とコミット](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L73-L85)

## 作成・変更の経緯

[2026年2月10日の初出](https://github.com/mattpocock/skills/commit/4458b65ffca31dc80f975a179a4e9cfe43e1fa49)に、すでに現在の主要な工程があります。ロックファイル検出、既存 script がなければ省略する条件、既存 Prettier 設定を保つ条件、最後にコミットする指示も初出から確認できます。後続のフォルダ移動と表記変更を、これらの動作の追加とは扱いません。

変更案の経緯は [Issue #14](https://github.com/mattpocock/skills/issues/14)で確認できます。報告者は Bun のロックファイル名に疑問を示し、議論では `bun.lock` と `bun.lockb` の両方を認識する案が出ています。[PR #60](https://github.com/mattpocock/skills/pull/60)も両方を列挙する1行の差分を提示しましたが、未マージで閉じられています。固定コミットの検出説明は `bun.lockb` のままです。

作者アカウントの[Issue #14 への回答](https://github.com/mattpocock/skills/issues/14#issuecomment-4337979812)は AI 生成のトリアージ文と明示され、現代の Bun の名前について報告を認めつつ、優先度が高いスキルではないため wontfix と説明しています。これは対象の動作を変える修正ではなく、修正を取り込まない保守判断です。

その後の[7月1日の整理](https://github.com/mattpocock/skills/commit/7efc3d2a3899c141f4d64e11be2227e0049db626)と固定コミットの[凍結方針](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)では、misc を日常利用せず、通常の配布・保守の対象にしないことが明文化されています。初期のツール選定理由は、これらの後年の説明から補いません。

## 設計判断

### 整形とプロジェクト全体の確認を分ける

コミット前に何をどの範囲で確認するかに対して、採用された構成は「ステージ済みファイルの整形を先に、型検査とテストを後に」です。本文自身が、前段を速く対象を絞った処理、後段を全体の検査として説明しています。これは作者が記した順序の理由であり、所要時間を実測した主張ではありません。[順序の説明](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L87-L91)

判断基準は処理の対象範囲です。整形では変更に含めるファイルを扱い、型検査とテストでは package.json にあるプロジェクト側のコマンドを使います。対象リポジトリの script が内部でさらに範囲を絞る可能性までは、このスキルから決まりません。すべてをステージ済みに限定する案や全ファイルを整形する案を作者が比較した記録も未確認です。

### 既存の設定と能力に合わせて構成する

既存の書式規則を変える必要がない場合に設定を増やさないよう、Prettier 設定は存在しないときだけ作成します。既定値はタブを使わず幅2、printWidth 80などですが、既存設定を置き換える基準ではありません。採用する選択は「既存設定を使う」か「存在しない場合に既定を作る」かで、判断材料は設定の有無です。[Prettier の条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L57-L71)

同様に、typecheck と test は script がある場合だけ呼び、なければ省略して利用者へ伝えます。これにより、設定されたフックの内容はプロジェクトごとに異なります。スキルは不足する検査を新規実装せず、何が省かれたかを報告する構成です。この効果は指示から読み取れますが、作者がこの適応条件を採用した当時の具体的な失敗例は確認できません。[適応条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L47-L47)

### 設置したフックを最後のコミットで通す

設定ファイルの存在だけでは、Git のコミットから呼び出される経路は確かまりません。本文は lint-staged の単独実行と最後のコミットを分け、後者を新しいフックの簡易確認として位置づけます。形式の確認から接続の確認へ進む構成と読めます。[検証の終点](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md#L73-L85)

ただし、テスト用の入力 fixture や期待出力を比較する採点処理はありません。コミットが通ることと、対象プロジェクトのテストが網羅的であることは別です。また実際に何を検査するかは存在する script に依存します。今回はスキルのインストールやコミットを行っておらず、この接続の実測結果はありません。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [setup-pre-commit](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/SKILL.md) |
| 分析コミット | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 調査日 | 2026-11-13 |
| 調査範囲 | 本文、agents/openai.yaml、misc/README、凍結方針、plugin.json、link-skills.sh、package.json、固定ツリー一覧、移動前を含む本文履歴と初出差分。Issue/PR索引全体の関連語確認、Issue #14・#164、PR #60・#1025 の本文・コメント・該当するレビューと変更ファイル。 |
| 未確認の範囲 | 初期のツール選定・既存設定保持条件の具体的な動機。独立した利用入力例はなく、本文の順序を追いました。固定ツリーに専用 tests/evals/fixtures・実行記録、共有評価への参照はありません。Husky等の外部実装は調査境界外です。 |
| 実行検証 | なし |

[表示用メタデータ](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/setup-pre-commit/agents/openai.yaml#L1-L3)は名前と短い説明です。[プラグイン定義](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json#L25-L55)にはこのスキルを含む misc の登録がなく、表示用ファイルの存在と通常配布の有無は別です。
