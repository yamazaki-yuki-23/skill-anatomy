# nanaism/yomiyasu の全体分析

## 概要

AIが書いた日本語を、意味を保ちながら読みやすく直すスキルです。文章の直し方、用途別の参照資料、表現と変更箇所を調べるPythonのコードをまとめています。[構成と使い方](https://github.com/nanaism/yomiyasu/blob/29d67ccb05e370b5958d72920a9cd1aa829dee80/skills/yomiyasu/SKILL.md)が入口です。

分析状況：完了 1 / 未完了 0。対象範囲：リポジトリ内で検出した1スキル。関連資料・コード・履歴を調べ、全テストや全評価結果の検証は対象外です。

## スキル一覧

| スキル | 元のパス | 役割 | 分析状況 | 個別分析 |
|---|---|---|---|---|
| yomiyasu | `skills/yomiyasu/SKILL.md` | 日本語の推敲と変更前後の確認 | 完了 | [分析レポート](skill-analyses/yomiyasu.md)・[HTML版](skill-analyses/yomiyasu.html) |

## スキル同士の関係

対象は1スキルです。参照資料と検査コードの役割は、[個別分析の処理の流れ](skill-analyses/yomiyasu.md#仕組みと処理の流れ)を参照してください。

## 共通する設計と学び

[残す意味の確認と提出前の照合](skill-analyses/yomiyasu.md#設計判断と学べること)、[会議メモの要約への応用](skill-analyses/yomiyasu.md#自作スキルへの応用)にまとめています。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [nanaism/yomiyasu](https://github.com/nanaism/yomiyasu) |
| 分析コミット | `29d67ccb05e370b5958d72920a9cd1aa829dee80` |
| 調査日 | 2026-11-01 |
| 調査範囲 | スキルの指示、参照資料の関連箇所、検査・記録・照合のコード、関連テストと評価資料、Git履歴、関連Issue・PR。詳細は[個別分析](skill-analyses/yomiyasu.md#調査範囲と出典)。 |
| 未確認の範囲 | 全コード・全テストの網羅的確認、非公開の評価環境、利用環境ごとの動作。 |
| 実行検証 | なし |
