# Skill anatomy

GitHubで公開されたスキルを読み解き、概要・使い方・作成経緯・設計の工夫・自作スキルへの応用例を日本語Markdownにまとめます。CodexとClaude Codeで使えます。

## 導入

```sh
npx skills add yamazaki-yuki-23/skill-anatomy
```

Node.js 22以上とGitが必要です。PR・Issueも調べる場合は、GitHub CLIを導入して `gh auth login` で認証してください。

導入先のエージェントと適用範囲は、実行時に選択してください。導入後はエージェントを再起動します。[skills CLIの仕様](https://github.com/vercel-labs/skills#install-a-skill)

## 使う

Codexでは次のように呼び出します。

```text
$skill-anatomy https://github.com/mattpocock/skills
```

Claude Codeでは個別スキルのURLも指定できます。

```text
/skill-anatomy https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me
```

リポジトリ全体・個別スキル・複数スキルを含むフォルダを自動判別します。`blob/REF/PATH/SKILL.md` のURLにも対応します。

分析方針と保存先を提示し、OKを受けてから分析を始めます。「指示の分割方法を詳しく」など、重点的に知りたいことも添えられます。

| オプション | 動作 |
|---|---|
| `--no-confirm` | 今回だけ分析方針の確認を省く。ツールの権限確認は省かない |
| `--refresh` | 指定範囲をすべて再分析する |

調査は対象リポジトリのファイル・コミット・PR・Issueに限定し、出典を付けます。作成の動機が分からなければ「確認できず」、取得できなければ「未確認」と記載します。対象スキルの実行検証や弱点評価は含めません。

## 出力

```text
reports/<所有者>/<リポジトリ名>/
├── repository-analysis.md      # 全体概要、スキル一覧、共通する設計の工夫
├── skill-analyses/<パス>.md    # 各スキルの詳細と応用例
└── .state.json                 # 再開に使う記録
```

上記の導入手順では、分析を実行している作業フォルダに保存します。保存先を変える場合は、エージェントを起動する前に設定します。

```sh
export SKILL_ANATOMY_WORKSPACE="$HOME/.local/share/skill-anatomy"
```

同じURLで再実行すると、未完了分と変更の影響がある分だけ分析します。同名スキルは元のパスで区別し、削除されたスキルの過去レポートは残します。同じリポジトリの分析を並行して実行しないでください。

共有資料やPR・Issueの索引が変わった場合は、保守的に全件を再調査します。索引に反映されない変更などは自動検知できないため、必要に応じて `--refresh` を使ってください。GitHub CLIが使えない場合はファイルとコミットで分析を続け、PR・Issueは未確認とします。

## 更新

```sh
npx skills update skill-anatomy
```

npxで導入した場合、分析結果はインストール先の外に保存するため、スキルを更新しても残ります。レポートと `.state.json` は一緒にGitで管理できます。自動でcommit・pushはしません。

## 開発

開発時は次を実行します。

```sh
npm ci
npm run build
npm run check
npm test
npm run check:dist
```

TypeScriptは `src/`、配布用JavaScriptは `dist/` に置きます。ソースを変更したら、ビルドした `dist/` もコミットしてください。

CLIの使い方は `node dist/cli.js --help`、分析手順は [SKILL.md](SKILL.md) を参照してください。

テストはURL判別・差分検出・再開・配布ファイルの動作を確認します。AIが書く分析文の質は対象外です。

MIT License。対象リポジトリのコードや文章の権利は、それぞれの作者に帰属します。
