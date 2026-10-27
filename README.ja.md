# Skill anatomy

[English](README.md) | 日本語

![Skill anatomy。スキルの指示・参照資料・変更履歴を、層に分かれた本と各層をつなぐ糸で表したイラスト](assets/skill-anatomy-cover.ja.webp)

お気に入りのスキルの仕組みを知り、自分のスキル作成に活かすための、AIエージェント向けスキルです。

GitHub上のスキルのURLを渡すと、仕組みや設計の工夫、自作への応用を日本語のレポートにまとめます。

[Skill anatomy自身の分析例](examples/skill-anatomy.md)で、レポートの内容を確認できます。

## はじめる

Node.js 22以上とGitが必要です。

1. 次のどちらかでスキルをインストールします。使うエージェントとインストール先は、実行時に選べます。

   ```sh
   # インストール
   npx skills add yamazaki-yuki-23/skill-anatomy

   # 更新
   npx skills update skill-anatomy
   ```

   GitHub CLIを使う場合

   ```sh
   # インストール
   gh skill install yamazaki-yuki-23/skill-anatomy skill-anatomy

   # 更新
   gh skill update skill-anatomy
   ```

2. エージェントを再起動し、調べたいGitHubのURLを渡します。

   Codexの場合

   ```text
   $skill-anatomy https://github.com/mattpocock/skills
   ```

   Claude Codeの場合

   ```text
   /skill-anatomy https://github.com/mattpocock/skills
   ```

3. 提示された調査範囲と保存先を確認し、「OK」と返します。スキルごとのレポートが順に保存され、最後にリポジトリ全体のレポートが作られます。

リポジトリ全体でも、[1つのスキル](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me)でも、URLから調査範囲を自動で判別します。複数のスキルを含むフォルダや、`SKILL.md` ファイルのURLも指定できます。

PR・Issueも調べる場合は、GitHub CLIをインストールし、`gh auth login` で認証してください。利用できない場合もファイルとコミットを調べ、取得できなかった情報をレポートに記載します。

## レポートで分かること

- 作者がどんな課題に向き合い、どの変更で対処したか。
- 指示の順序や確認のタイミング、参照資料の使い分けが、エージェントの判断をどう変えるか。
- 学んだ設計を別の課題へ応用するとき、どんな条件や指示が必要か。

使い方を知ることに加えて、「なぜこの指示でうまく進むのか」「自分ならどう設計するか」を考えるために作りました。URLと一緒に「参照資料とSKILL.mdの役割分担を詳しく」など、知りたいことも伝えられます。

説明には出典を付け、作者自身の説明と、分析による解釈を区別します。動機が分からない部分は、その旨を記載します。調査対象は指定リポジトリ内のファイル・コミット・PR・Issueです。調べるスキルの実行や採点は行いません。

## 保存されるファイル

レポートは、次の優先順位で選ばれたフォルダの `reports/` に保存されます。

1. `SKILL_ANATOMY_WORKSPACE` で指定したフォルダ。
2. Git cloneしたSkill anatomyを使う場合は、そのcloneのルート。
3. それ以外は、分析を実行している作業フォルダ。

たとえば、別の作業フォルダから `skill-anatomy/` のcloneを使うと、環境変数の指定がなければ `skill-anatomy/reports/` に保存されます。インストールしたコピーはスキルのフォルダ外で使います。既定の保存先なら、レポートはインストール先と分かれ、更新後も残ります。

```text
reports/<所有者>/<リポジトリ名>/
├── repository-analysis.md      # リポジトリ全体のレポート
├── skill-analyses/<パス>.md     # スキルごとのレポート
└── .state.json                 # 再開に使う記録
```

全体のレポートには、スキルの一覧と共通する設計の工夫をまとめます。各スキルの仕組みや経緯、応用例は、スキルごとのレポートに記載します。全体のレポートからリンクをたどって読めます。対象が1つなら、全体のレポートは調べた範囲と個別分析への案内を中心にし、詳しい具体例は繰り返しません。

見出しと順序は、全体のレポートとスキルごとのレポートでそれぞれ統一しています。複数のスキルを調べたときも、使い方・経緯・設計・応用例を同じ場所で探せます。

## 続きから調べる・調べ直す

方針を承認した後、`node skills/skill-anatomy/dist/cli.js index PLAN` で保存済みのPR・Issue索引を確認できます。`PLAN` は返された方針ファイルのパスに置き換えます。`--number 21` を付けると、その番号に一致する項目をすべて返します。読み取り専用の表示で、全件と選定情報を保ち、重複するPR内のURLだけを省きます。一覧は `index`、固定コミットと原索引のパス・ハッシュは `snapshot` にあります。新たな取得や保存内容の変更は行いません。取得不能や一致0件を議論の不存在の証明にせず、必要な原索引・原典の全文は引き続き確認します。

同じURLをもう一度渡すと、未完了のスキルと、変更の影響があるスキルを調べます。共有の参照資料やPR・Issueの一覧が変わった場合など、すべてのスキルを調べ直すこともあります。

次のオプションは、URLの後ろに付けます。

| オプション | 動作 |
|---|---|
| `--no-confirm` | 調査開始前の確認を、今回だけ省く。ツールの権限確認は省かない |
| `--refresh` | 指定した範囲をすべて調べ直す |

<details>
<summary>保存先の変更と、再実行時の注意</summary>

保存先を変える場合は、エージェントを起動する前に設定します。

```sh
export SKILL_ANATOMY_WORKSPACE="$HOME/.local/share/skill-anatomy"
```

同名のスキルは元のパスで区別します。元のスキルが削除されても、過去のレポートは残ります。レポートと `.state.json` は一緒にGitで管理できます。同じリポジトリの調査を、同じ保存先で同時に実行しないでください。

PRレビューだけの変更など、自動検知できない更新もあります。調べ直したい場合は `--refresh` を指定してください。

</details>

[MIT License](LICENSE)
