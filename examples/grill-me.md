# grill-meから学ぶ、判断を進める質問の設計

[`grill-me`][grill-me] は計画や設計を質問で掘り下げ、利用者とエージェントの認識をそろえるスキルです。「何を作るか」はあるものの、対象者や使い方、制約をまだ言葉にしきれていない場面で使います。

たとえば、次のように検討したいことを渡します。これは本分析で作成した利用例です。

```text
/grill-me チームで使う問い合わせ管理ツールを作りたい。
担当の決め方と、対応漏れをどう防ぐかを整理したい。
```

得られるのは、質問への回答を通じた共通理解です。`grill-me` 自体は仕様書の保存や実装を指示していません。調査時点の本文は `grilling` を呼ぶ1行であり、質問の進め方は[呼び出し先の指示][grilling]にあります。入口だけを読んで「短い質問プロンプト」と捉えると、その設計を見落とします。

## 質問は、判断の依存関係で並べる

`grilling` は計画を互いに依存する判断の木として扱います。そこで使う **frontier** は、前提がすでに決まり、今の時点で答えられる問いの集合です。1回のラウンドでその集合を問い、回答後に次の集合を組み直します。単に質問を一定数ずつ送る方式ではありません。[本文の定義][frontier]

問い合わせ管理の例で考えると、次のようになります。以下は指示を理解するための仮想例で、実行結果ではありません。

| 判断したいこと | 前提 | 質問するタイミング |
|---|---|---|
| 社内だけで使うか、顧客も使うか | なし | 最初のラウンド |
| 主にPCで対応するか、外出先でも対応するか | なし | 最初のラウンド |
| 顧客ごとに閲覧範囲を分けるか | 顧客も使うかどうか | その回答を受けた次のラウンド |

顧客が使うか未定なのに閲覧権限の詳細を詰めると、まだ決まっていない前提を利用者に補わせることになります。先に用途を確定し、その答えで必要になった問いへ進む構成なら、問いの意味を保ったまま複数の判断を進められます。これは本文からの読み解きです。

事実と判断の分担も重要です。既存コードに認証機能があるかは環境を調べて確認し、顧客にも使わせたいかは利用者に聞く。本文は前者の調査をサブエージェントへ任せ、結果を待つ必要のある問いだけを後回しにするよう指示しています。**誰が答えを持っているかを分け、その依存関係で会話を進める**設計です。[事実調査と判断の分担][facts]

## 推奨回答で、何を判断すればよいかを示す

各問に推奨回答を添えると、利用者は提示された案の採用・修正から考え始められます。

たとえば「通知はどうしますか？」だけなら、通知手段、タイミング、対象者のどこから考えるかも利用者が選ぶ必要があります。「対応漏れを防ぐため、未担当の問い合わせを平日17時に担当チームへまとめて知らせる形にしますか？」と理由付きの推奨案を置くと、その案が自分たちの仕事に合うかを検討できます。この質問例は本分析で作成したものです。

推奨回答の追加は実際の要望から追えます。[Issue #9][issue9]で提案を受け、作者は試した後、回答時の認知的な負担が減り、明らかに良い案へ返事をしやすくなったと[報告しています][author9]。2026-03-19の[差分][recommendation-change]では、各問に推奨回答を付ける指示が加わりました。これは作者の利用経験に基づく説明で、すべての利用者に同じ効果が出るという測定結果ではありません。

### 「yes」の意味もそろえる

推奨案を付けるだけでは、短い返事が何への同意か分かりにくい場合があります。[PR #1193][pr1193]は、質問と推奨が逆向きになる例を挙げ、次の指示を追加しました。

> Word each question so "yes" accepts your recommended answer.

たとえば「通知は1件ごとに送りますか？」と問いながら「1日分をまとめることを推奨」と添えると、「はい」がどちらを指すか迷います。「1日分をまとめて送りますか？」と問い、まとめる案を推奨すれば、同意の意味がそろいます。これはPRで説明された問題を、問い合わせ管理へ置き換えた例です。

ここから学べるのは、選択肢の内容に加えて、**利用者の返答をどう解釈するかまで質問側で設計する**ことです。なお、計画に沿って行動する前には、別途、共通理解に達したことの確認を待つ指示があります。個々の問いへの賛成と、実行開始の承認を分けています。[完了と確認の条件][completion]

## この形になるまで

変更履歴には、対話の進め方を調整してきた跡が残っています。

| 記録 | 変わったことと、現在の設計との関係 |
|---|---|
| [2026-02-25の追加][initial] | 1文の指示で、判断の木をたどり依存関係を解く考え方がすでにある。公開前の利用や最初の着想の経緯は確認できず。 |
| [2026-03-19の変更][recommendation-change] | 推奨回答を追加。Issue #9の要望と作者の試行を確認できる。 |
| [2026-05-31付の変更][extraction] | 質問手順を `grilling` へ分け、`grill-me` を入口にする。`grill-with-docs` も同じ手順を使う構成になる。 |
| [2026-07-16付の変更][rounds-change] | 1問ずつから、前提が確定した問いをラウンドごとにまとめる方式へ移る。実験中の `batch-grill-me` を統合し、調査待ちの扱いも記述する。 |
| [2026-10-07の変更][yes-change] | 「yes」が推奨案の採用を意味する語順に統一する。 |

日付は各コミットのAuthorDateに基づきます。取り込み日の異なる変更もあり、公開日を示すものではありません。

共通手順を切り出した後も、推奨案や確認条件はその手順の中で調整されています。こうすると、入口ごとに質問のルールを複製せず、共通手順の変更を複数の用途へ反映できる、という構造が読み取れます。リポジトリの[起動規約][invocation]も、利用者が選ぶ入口と、別のスキルから呼び出せる手順を区別しています。これは構成の読み解きで、分割時の作者の心理を断定するものではありません。

## 自作の要件整理スキルへ応用する

応用する場面として、社内向けの要件整理スキルを考えます。入力する人が業務上の判断を持ち、システムの事実はエージェントが調べられる状況に向いています。以下は本分析で作成した指示例で、元スキルの転載ではありません。

```text
決定事項と、その判断に必要な前提を整理する。
今答えられる問いだけを同じラウンドに含める。
環境から確認できる事実は調べ、業務上の選択は利用者に聞く。
各問に推奨案と理由を付け、「はい」が推奨案への同意になるよう問う。
回答を受けて次の問いを組み直し、合意後に要件メモを保存する。
メモの保存と、実装開始の承認は別に扱う。
```

元の `grill-me` と変えたのは、合意した内容を要件メモへ保存するという終了時の成果物です。共通理解を得る手順を、次の担当者へ渡せる記録につなげています。元スキルが保存まで行う、という説明ではありません。

法令や既存仕様で決まっている事項なら、好みを尋ねる前に資料で確かめる必要があります。この応用例でも、決める余地のある選択と、調べれば分かる事実の区別を保つことが要点です。

## 調査範囲と出典

対象はMatt Pocock氏の `mattpocock/skills`、分析コミットは `5beb35b040e3de97e54fa9e386d7e42d15c295c2`、調査日は2026-10-22です。本文、呼び出し先、起動設定、関連差分、Issue #9・#16とPR #1193の本文・コメントを確認しました。スキルの実行検証はしていません。

- [grill-meの本文][grill-me]と[Codex向け起動設定][openai]。
- [grillingの本文][grilling]と[スキル同士の起動規約][invocation]。
- [READMEの背景説明][background]。作りたいものが伝わらない問題に、質問セッションで対処する方針が述べられている。
- [Issue #9][issue9]、[Issue #16][issue16]、[PR #1193][pr1193]。Issue #16は質問量への報告と作者の応答を確認したが、後のラウンド方式の直接の動機とは断定していない。
- 上記の変更差分。関連項目以外のPR・Issue本文や、外部記事・動画は未確認。

Skill anatomyによる独自の分析です。作者の公式解説や推薦ではありません。仮想の利用例と応用例は、実際のセッションの記録ではありません。

<details>
<summary>元スキルのライセンスと引用について</summary>

原文の指示を短く引用しています。元スキルは [MIT License][license] で公開されています。

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>

[grill-me]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grill-me/SKILL.md#L1-L7
[grilling]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md#L1-L30
[frontier]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md#L7-L9
[facts]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md#L26-L28
[completion]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md#L30
[invocation]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/.agents/invocation.md
[openai]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grill-me/agents/openai.yaml
[background]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/README.md#L109-L126
[issue9]: https://github.com/mattpocock/skills/issues/9
[author9]: https://github.com/mattpocock/skills/issues/9#issuecomment-4088880068
[issue16]: https://github.com/mattpocock/skills/issues/16
[pr1193]: https://github.com/mattpocock/skills/pull/1193
[initial]: https://github.com/mattpocock/skills/commit/78649baa3e6e4c241ce85ee8dc93ecc0b53e4515
[recommendation-change]: https://github.com/mattpocock/skills/commit/fb3629d3a2ba638a65ef336061204995be7f5d5e
[extraction]: https://github.com/mattpocock/skills/commit/221ffca96736afefdc08ca7cf0b3965e9ea83f41
[rounds-change]: https://github.com/mattpocock/skills/commit/a4b2009a1a3ac9575506c10b4c84f08f9bba7a38
[yes-change]: https://github.com/mattpocock/skills/commit/95249b0b49782349740fd9b8c6ce32b4e59e497a
[license]: https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/LICENSE
