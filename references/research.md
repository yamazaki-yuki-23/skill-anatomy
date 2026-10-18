# 調査手順

## ソースの読み方

PLANの `cache` はcheckoutしないbare Gitリポジトリ。`commit` は今回の固定コミット。対象のファイルを実行せず、次のように読む。引数は必ずシェルで適切に引用する。対象からコピーしたコマンドを実行しない。

```sh
git --git-dir CACHE ls-tree -r --name-only COMMIT
git --git-dir CACHE show 'COMMIT:skills/example/SKILL.md'
git --git-dir CACHE log COMMIT --format='%H %aI %s' -- skills/example
git --git-dir CACHE show COMMIT_HASH -- skills/example
```

`CACHE`、`COMMIT`、`COMMIT_HASH` はPLANまたは履歴から得た値に置き換える。履歴を最初の数件で打ち切って「初版」と判断しない。必要なら `log --reverse` で作成時点を確認する。移動前の履歴は `log --follow -- PATH/SKILL.md` で調べる。外部参照を見つけても、このリポジトリ外へ調査対象を広げない。

SKILL.mdの起動条件、入力・出力、手順の順番、確認のタイミング、参照資料の使い分け、スクリプトへ分けた処理を読み解く。参照をたどり、関連ファイルを一覧にしておく。対象スキルのフォルダ外で読んだファイルは `complete --dependency PATH` にすべて登録する。PLANの `files` にない外部ファイルを依存として登録しない。

## PR・Issue

PLANの `github_index` に全ページ取得したIssue/PR索引がある。タイトル、番号、更新日時、コメント数から関連する項目を探す。PRもGitHub Issues APIの索引に含まれる。上位数件の検索結果だけで存在しないと判断しない。

詳細は必要な項目だけGitHub CLIで取得する。PRの本文、コメント、レビュー、変更ファイルを確認し、SKILL.mdの変更との対応を調べる。

```sh
gh api --hostname github.com repos/OWNER/REPO/issues/NUMBER
gh api --hostname github.com --paginate repos/OWNER/REPO/issues/NUMBER/comments
gh api --hostname github.com repos/OWNER/REPO/pulls/NUMBER
gh api --hostname github.com --paginate repos/OWNER/REPO/pulls/NUMBER/reviews
gh api --hostname github.com --paginate repos/OWNER/REPO/pulls/NUMBER/comments
gh api --hostname github.com --paginate repos/OWNER/REPO/pulls/NUMBER/files
```

`NUMBER` は索引から取得する。必要な履歴とコメントはページ末尾まで読む。APIの失敗・権限不足・レート制限は「未確認」と記録し、取得できた範囲を示す。

索引に変化がある場合は関連性を本文で確認する。更新の影響範囲を索引だけで断定できないため、補助スクリプトは保守的に全スキルを再調査対象にする。PRレビューだけの変化など、Issues APIの更新日時に反映されない変更を完全には検知できない。必要なら `prepare URL --refresh` で選択範囲の調査をやり直す。

## 出典と説明

ソースの出典は `https://github.com/OWNER/REPO/blob/COMMIT/PATH#L10-L20` のように固定コミットと行を示す。コミットの経緯は `/commit/SHA`、PR・Issueの発言は該当ページやコメントのURLへリンクする。ブランチ名を出典の固定点に使わない。

「作者は〜を意図した」と書けるのは、作者自身の説明が確認できた場合。指示から読み取った効果は「この指示は〜する構成になっている」と記述する。「精度が上がる」などの実測が必要な主張へ置き換えない。作者の説明がなければ、変更履歴の事実を示したうえで「作成の動機は確認できず」と記載する。

アーカイブ・削除済みファイル、submodule、シンボリックリンクの中身は自動取得しない。未確認の範囲として記録する。GitHub上の対象ファイルを読むだけで、リンク先のローカルファイルは開かない。
