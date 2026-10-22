# skill-anatomy の分析

## 概要と使い方

Skill anatomyは、GitHubで公開されたスキルを調べ、仕組みや設計判断を日本語のMarkdownレポートにまとめるスキルです。学べるのは、文章を読んで判断する仕事と、対象や進捗を記録する仕事の分け方です。ソースを解釈するのはエージェント、調査範囲の確定や完了記録を担うのは補助CLIです。[SKILL.md][skill]

作者はREADMEで、気に入ったスキルを使ううちに「なぜこの指示でうまく進むのか」「自分ならどう設計するか」が気になり、その疑問をソースと履歴から掘り下げるために作ったと説明しています。[作成の背景][purpose]

Codexでは、次のようにURLを渡します。これは、このリポジトリ自身を調べる場合の呼び出し例です。

```text
$skill-anatomy https://github.com/yamazaki-yuki-23/skill-anatomy
```

Claude Codeでは、先頭を `/skill-anatomy` に変えます。リポジトリ全体のほか、1つのスキルや複数スキルを含むフォルダのURLにも対応します。Node.js 22以上とGitが必要で、PR・Issueも調べる場合は認証済みのGitHub CLIを使います。[利用方法][usage]

分析前に調査範囲と保存先が提示され、利用者が「OK」と返すと調査が始まります。結果は、スキルごとのレポートと、調べた範囲の全体レポートです。この文書は、公開用の分析例としてソースと履歴を読んで作成したもので、CLIの実行ログではありません。

## 仕組みと処理の流れ

ここでは、2つのスキルを含むリポジトリを初めて調べる場面を仮定します。件数とファイル名は説明用の仮想例です。

```text
skills/review/SKILL.md
skills/release/SKILL.md
references/common.md
```

1. `prepare URL` がリポジトリを取得し、分析するコミットと対象ファイルを確定します。`SKILL.md` を探し、今回は2件を対象にした計画を保存します。エージェントは対象・件数・保存先を利用者に示し、まだレポートを書き始めません。[準備処理][prepare]
2. 利用者の「OK」を受けて、エージェントが `approve PLAN` を実行します。`PLAN` は保存された計画ファイルのパスです。確認を省く `--no-confirm` は、利用者が指定した場合だけ使います。[開始の指示][approval]
3. エージェントが、確定したコミットの指示・参照資料・変更履歴を読みます。`review` の説明を保存し、完成基準を満たした後に `complete PLAN --skill 'skills/review/SKILL.md'` で完了を記録します。読んだ共有資料も依存ファイルとして登録します。[保存と完了記録][save]
4. `release` も同様に仕上げます。最後に、2つのスキルに共通する設計を全体レポートへまとめ、`complete PLAN --repository` を実行します。対象スキルの完了記録がそろっていなければ、CLIは全体の完了を受け付けません。[完了処理][complete]

調査対象はcheckoutしないbareリポジトリとして取得されます。調べるスキルに「スクリプトを実行する」と書いてあっても、それは仕組みを理解するための資料として読みます。分析中のエージェントへの命令にはしません。Skill anatomy自身を題材にしても、対象の指示を再実行し続ける手順にはなっていません。[取得処理][acquire]・[調査の境界][boundary]

## 作成・変更の経緯

### 使い方の説明から、設計を学ぶための解説へ

[初版の20aa472][initial]には、概要・使い方・経緯・工夫・応用例をまとめる目的と、承認・再開の仕組みがありました。

[1febb13][learning-change]では、読み手が仕組みを具体例で説明し、別の課題に応用できることを目標として追記しています。調査手順にも、ファイルを読むことに加え、入力から結果まで処理をたどり、指示がエージェントの判断をどう変えるか確かめるよう加えています。

たとえば「確認してから進む」と要約するだけでは、いつ何を確認するのか分かりません。現在の指示に沿って読むと、「対象・保存先を確定して示す」「利用者が了承するまで本文を書かない」「了承を計画ファイルにも記録する」という分担まで説明することになります。これは差分から読み取れる行動の変化です。特定の生成結果への不満がこの変更の直接のきっかけだったかは、確認した公開資料からは確認できませんでした。

### 形式をそろえ、説明の深さは対象に合わせる

1febb13時点では、レポートの見出しと順序を固定しない方針でした。[4eca8a4][format-change]で、スキルごととリポジトリ全体のテンプレートを追加し、見出しと順序をそろえる方針へ変わっています。

一方、現在の執筆基準は、章の分量を均等にする必要はないとしています。作者が明記している理由は、読み手が使い方・経緯・設計・応用を同じ場所で探せるようにすることです。見出しをそろえることと、中身を定型文で埋めることを分けています。[形式と完成基準][format]

### 利用時のビルドを、配布前のビルドへ移す

[ad1cb96][runtime-change]では、Rust製の補助処理をTypeScriptへ置き換え、ビルド済みJavaScriptを `dist/` に含めています。初版ではラッパーが初回実行時にビルドしていましたが、現在は `node dist/cli.js` を呼ぶ構成です。[現在の呼び出し方][runtime]

この差分から確認できるのは、利用者が実行する前のビルド工程がなくなったことです。処理速度を比較した結果は確認できず、言語変更を高速化のためだったとは断定できません。

## 設計判断と学べること

### 判断は指示に、記録はCLIに分担させる

`references/research.md` は何を根拠に調べるか、`references/writing.md` はどう説明するか、`references/report-format.md` は何を満たせば完成とするかを担当します。SKILL.mdは、それぞれを読むタイミングと作業の順序を示しています。[手順][skill]・[執筆の指針][writing]

CLIが確認するのは、計画が承認済みか、対象に含まれるスキルか、レポートが保存され空でないか、といった条件です。「設計判断を十分説明できているか」はエージェントが完成基準に照らして確かめます。[完了処理][complete]・[完成基準][quality]

この分担を読むと、「良い解説を作る」という指示だけで保存や進捗まで管理しようとせず、機械的に確認できる条件をコードへ移していることが分かります。ただし、CLIが完了を受け付けた事実だけで、文章の品質まで検証できたことにはなりません。

### 承認する内容を、保存された計画と結び付ける

計画にはコミット・対象スキル・保存先・承認状態が入ります。分析はそのコミットの資料を読むため、作業中にリポジトリが更新されても、途中で新旧のファイルを混ぜる手順にはなっていません。[計画の保存][plan]・[根拠の読み方][research]

ここから学べるのは、確認を会話の一言で終えず、承認した対象を後続処理が参照できる形で残す設計です。CLIは利用者の「OK」を直接読むわけではありません。返事を待つのはエージェントで、CLIは `approve` による承認状態の変更を受け持ちます。[承認処理][approve-code]

### 再開時は、本文以外の変更も見る

再実行時は、スキルのファイル、共有資料、登録した依存ファイル、関係する履歴、PR・Issueの一覧、保存済みレポートを照合します。変更がないと判定できたレポートは、前回の記録を保ちます。[変更の照合][signature]・[再調査の判定][resume]

仮想例の `common.md` を2つのスキルが参照しているなら、その資料が変わったときは両方の説明を見直す必要があります。スキル本体が同じでも、説明の根拠が変わるためです。PR・Issueの一覧を取得できなかった場合も、現在の実装は変更なしと判定しません。取得失敗を「前回と同じ」と扱わない、慎重な再開処理になっています。

### 読者が理解できることを完成条件にする

現在の完成基準は、読者が使う場面、指示と行動の関係、事実と解釈の違い、別用途への応用条件を説明できるか、と問いかけています。章が存在するかを確認するだけでは終えません。[完成基準][quality]

たとえば応用例に「手順を分割する」とだけ書いてあれば、何をどう分けるかは読者に残されたままです。分割する対象、具体的な指示、適用できる条件まで書くよう求めることで、解説の完成条件を具体化しています。学習効果を実測した主張とは区別する必要があります。

## 自作スキルへの応用

### API変更を、社内の利用手順書へ反映するスキル

以下は、この分析で作成した仮想の応用例です。API仕様と利用手順書をGitで管理し、仕様変更に合わせて複数の手順書を更新する場面を考えます。元になる仕様と改訂するファイルを特定でき、内容の承認を担当者に求める運用で使えます。

```text
1. API仕様のコミット、影響を受ける手順書、参照した共通設定を
   更新計画に保存し、担当者に対象と変更方針を示す。
2. 承認された計画の仕様を読み、手順書を1件ずつ改訂する。
   検討中に仕様が変わったら、対象への影響を示して再確認する。
3. 変更理由と根拠の箇所を説明し、記載したリクエスト例が仕様に
   合っているか確認する。保存後に、その手順書の完了を記録する。
4. 全件の改訂が終わったら、変更一覧と未確認の事項をまとめる。
   公開は担当者の承認を待つ。
```

APIの認証方式が変わった場合、通信先だけを扱う手順書は更新不要でも、リクエスト例に認証ヘッダーを含む手順書は書き換える必要があります。共通の設定ファイルにも依存しているなら、仕様書だけの差分で判断せず、その設定の変更も確認します。

Skill anatomyから移すのは、範囲を確定してから承認を受けること、成果物を保存してから完了を記録すること、再開時に根拠の変更を確認することです。内容の確認を担当者に求め、対象と進捗の記録を補助処理へ分担させます。

変更するのは完成基準です。Skill anatomyは読者が設計を説明できる解説を目指しますが、API手順書では、認証・パラメーター・リクエスト例が仕様に合い、利用者が操作を進められることを確かめます。また、ローカルへの保存と利用者への公開を分けるため、公開前の承認を追加しています。元の手順の名称だけを置き換えず、成果物を使う場面に合わせて終わり方を変える例です。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | https://github.com/yamazaki-yuki-23/skill-anatomy |
| 分析コミット | `181500bfe4eea20868d5bcf4a45dc96ef0794c21` |
| 調査日 | 2026-10-22 |
| 調査範囲 | SKILL.md、README、調査・執筆基準、レポートのテンプレート、`src/anatomy.ts` の対象判別・承認・状態記録処理、`src/cli.ts` の引数処理、初版からの関連差分 |
| PR・Issue | GitHub Issues APIで公開分を全ページ照会。調査時点では該当項目なし |
| 未確認の範囲 | 外部リポジトリ、公開されていない議論、処理速度・学習効果の実測 |
| 実行検証 | なし。指示とコードに基づく机上の読み解き |

現在の構成に関する出典は、分析コミットへ固定しています。経緯の出典は、それぞれの変更コミットです。

[skill]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/SKILL.md#L8-L31
[purpose]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/README.ja.md#L43-L53
[usage]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/README.ja.md#L13-L41
[prepare]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L251-L310
[approval]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/SKILL.md#L18-L19
[save]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/SKILL.md#L20-L22
[complete]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L328-L362
[acquire]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L147-L160
[boundary]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/SKILL.md#L26-L31
[initial]: https://github.com/yamazaki-yuki-23/skill-anatomy/commit/20aa472
[learning-change]: https://github.com/yamazaki-yuki-23/skill-anatomy/commit/1febb13d009c1a76ade2bc51d8cea31c041163aa
[format-change]: https://github.com/yamazaki-yuki-23/skill-anatomy/commit/4eca8a42051d2677cabde6360d533d83db4dc455
[format]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/references/report-format.md#L5-L12
[runtime-change]: https://github.com/yamazaki-yuki-23/skill-anatomy/commit/ad1cb96
[runtime]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/SKILL.md#L10-L14
[writing]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/references/writing.md#L3-L23
[plan]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L295-L302
[research]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/references/research.md#L3-L20
[approve-code]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L313-L326
[signature]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L240-L249
[resume]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/src/anatomy.ts#L275-L284
[quality]: https://github.com/yamazaki-yuki-23/skill-anatomy/blob/181500bfe4eea20868d5bcf4a45dc96ef0794c21/references/report-format.md#L14-L23
