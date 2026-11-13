# migrate-to-shoehorn の分析

## 概要と使い方

migrate-to-shoehorn は、テスト内の型アサーションを、部分データ用と意図的な型違い用の関数に置き換えるスキルです。テストで使わないプロパティを埋める負担と、誤った入力を作る必要を区別し、移行後もテストの意図を保つ構成です。[課題と利用条件](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L3-L18)

TypeScript の型アサーションとは、ここでは `as Request` のように値を特定の型として扱わせる記述です。入力は、問題になっているテストファイルと、部分データが必要なのか、不正なデータを意図的に渡したいのかという要件です。出力は `@total-typescript/shoehorn` の関数呼び出しと import を持つテストコードです。必要な環境はパッケージを追加できる TypeScript プロジェクトと型検査の手段で、スキル自体に変換スクリプトは同梱されていません。[移行工程](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L105-L118)

適用範囲はテストコードに限定され、本番コードでの使用は禁止されています。この境界は、入力を正常な完成形にするための変更ではなく、テストのためにデータを省略したり型を外したりする変更を扱うために重要です。これは指示と作例からの読み解きで、ライブラリ実装の安全性を確認した結論ではありません。[適用境界](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L10-L18)

## 仕組みと処理の流れ

代表例は本文の `getUser({ body: { id: "123" } } as Request)` です。前にある型の例では Request は body のほか headers と cookies も持ちますが、このテストが必要とするのは body.id だけです。スキルは、この省略を `fromPartial` で表すよう指示します。[Request の例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L28-L63)

1. エージェントは対象ファイルと、少数のプロパティだけ必要な大きなオブジェクトを扱うか、不正データを渡すテストがあるかを利用者へ尋ねます。
2. パッケージを追加し、本文が示す `*.test.ts` と `*.spec.ts` の `as` 記述を探します。
3. 代表例では `as Request` を外し、同じ `body.id = "123"` を持つオブジェクトを `fromPartial(...)` で囲みます。
4. `fromPartial` の import を追加し、プロジェクトの型検査を行うよう指示されています。

移行の対応関係は次の作例です。これは元の本文にあるコードで、今回実行した変換結果ではありません。

```ts
// 変更前
getUser({ body: { id: "123" } } as Request);

// 変更後（fromPartial の import を追加）
getUser(fromPartial({ body: { id: "123" } }));
```

この経路では ID の文字列を数値へ直したり、不要な headers を埋め直したりしません。変わるのは省略したデータを型の側へ渡す表現です。どのアサーションをどう置き換えるかの判断はエージェントが担い、部分データの扱いは外部ライブラリへ委ねます。[対応する変換例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L65-L79)

別の経路として、本文は `id: 123` を意図的に渡す二重アサーションを `fromAny` に置き換えています。また関数一覧には完全なオブジェクトを要求する `fromExact` もありますが、移行チェックリストの主経路は `fromPartial` と `fromAny` の2つです。[不正データの例と関数一覧](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L81-L103)

型検査の実行は完了確認として書かれていますが、検査コマンド、入力ごとの期待診断、専用の採点コードは本文にありません。掲載された `it(...)` は説明用のテストコードであり、このリポジトリで実行可能なテスト一式や保存済み実行結果ではありません。

## 作成・変更の経緯

[2026年2月3日の追加](https://github.com/mattpocock/skills/commit/64b2f9924555a561896157b17606c042cd01053c)では、ルート直下にこのスキルが置かれました。[翌日の変更](https://github.com/mattpocock/skills/commit/c90b246c926a940bb4b74c90bf39f75b2e414319)では、既存の変換例を保ったまま、テスト専用という禁止条件と、移行前に利用者へ要件を尋ねる工程が加えられています。

変更前は、パッケージ追加から型検査までが単一のチェックリストでした。変更後は、まず問題のあるファイル、部分データの必要性、不正データの必要性を確かめ、その後に移行へ進みます。したがって、たとえば二重アサーションを見つけた場合も、不正値を残す理由を確認してから関数を選ぶ読み方になります。この行動の変化は差分から確認できますが、作者がこの変更を行った具体的なきっかけは、短いコミットメッセージからは確認できません。

4月のフォルダ再配置後も本文の中心は同じです。7月1日の[整理](https://github.com/mattpocock/skills/commit/7efc3d2a3899c141f4d64e11be2227e0049db626)で misc が積極的に配布しない区分と明記され、固定コミットの[保守方針](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.out-of-scope/frozen-misc-skills.md#L1-L15)では、作者が日常的に使わないスキル群として保守を凍結しています。これは変換関数の選択理由とは別の配布・保守の判断です。

## 設計判断

### データ不足と意図的な型違いを分ける

テストで型を合わせたいという要求には、不要なプロパティを省略したい場合と、型の違う入力をわざと渡したい場合があります。確認できる選択肢は `fromPartial` と `fromAny`、さらに完全なオブジェクト用の `fromExact` です。スキルが示す判断基準はテストの入力意図で、単にコードが短くなる関数を選ぶものではありません。[関数の使い分け](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L97-L110)

`body.id` が文字列の例は `fromPartial`、数値を意図的に渡す例は `fromAny` に対応します。後者の数値を文字列へ「修正」すれば、不正入力を試すという例の目的が消えます。このため、要件質問は置換の前提を決める役割を持っています。これは本文の対応関係からの分析で、作者が検討した全代替案の履歴を意味しません。[2つの変換例](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L65-L95)

### 本番コードへ適用せず、型検査で終える

型アサーションを見つけた場所すべてへ適用するのではなく、スキルはテスト専用という境界を明示しています。検索例も test/spec の拡張子を対象にします。採用結果は、テストの入力構築を補助し、import を加えて型検査で確かめる流れです。[境界と検索・確認](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L12-L18)・[チェックリスト](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md#L112-L118)

この検索式は本文が示す探索方法であり、すべての TypeScript のアサーションを網羅する構文解析器ではありません。またスキルにはテスト実行までを必須にする記載はなく、完了条件は型検査の指示までです。外部パッケージの関数が実際に受け入れる入力の全範囲や、移行前後の実行時挙動が一致するかは、今回の調査では確認していません。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [migrate-to-shoehorn](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/SKILL.md) |
| 分析コミット | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 調査日 | 2026-11-13 |
| 調査範囲 | SKILL.md、agents/openai.yaml、misc/README、保守方針、plugin.json、link-skills.sh、package.json、固定ツリー一覧、移動前を含む本文履歴と2月4日の差分。Issue/PR索引全体を関連語で確認し、共通配布方針の Issue #164 と PR #1025 を確認しました。 |
| 未確認の範囲 | 変更の具体的な契機。shoehorn の外部実装・ドキュメントは境界外。固定ツリー内に専用評価・fixture・実行結果、共有評価への参照は見つかりませんでした。直接関連する議論は索引の関連語検索では見つかりませんでした。 |
| 実行検証 | なし |

[表示用メタデータ](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/migrate-to-shoehorn/agents/openai.yaml#L1-L3)は名前と説明だけで、変換ロジックを追加していません。[Issue #164 の作者回答](https://github.com/mattpocock/skills/issues/164#issuecomment-4418682499)は、misc がプラグインに含まれないことを意図的だと確認しています。
