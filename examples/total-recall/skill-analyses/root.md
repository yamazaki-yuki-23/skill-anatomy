# total-recall の分析

## 概要と使い方

total-recallは、会話の保存をエージェントの思い出しに頼らず、定期収集と取りこぼしの回収で補い、次のセッションへMarkdownの記憶を渡すスキルです。中心となる判断は、会話の意味を選ぶ処理をLLMに任せ、起動条件・保存・重複除去・形式検査をシェルへ分けることです。

対象はOpenClaw形式のセッション記録を使うエージェントです。入力はJSONLの会話、既存の `memory/observations.md`、日次メモ、設定、LLMの認証情報です。Observerが優先度付きの観察を追記し、Reflectorが膨らんだ観察を統合します。任意のDream Cycleは古い情報を別ファイルへ移し、検索語と参照先を残します。[構成と基本手順](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/SKILL.md#L26-L84)に加え、固定コミットのREADMEは外部イベントを扱うAmbient Intelligence Engine（AIE）も説明しています。AIEは別のSKILL.mdとして定義されたスキルではなく、同じリポジトリに追加された処理系です。

利用の準備は次の順です。ここでは資料にある使い方を説明しており、インストールや実行検証はしていません。

1. スキルを配置し、ワークスペース、セッションの場所、APIキーを設定します。
2. `setup.sh`で保存先を作り、表示されたObserverとReflectorの定期起動を設定します。
3. セッション開始時にRecoveryを起動し、その後で観察・重要事項・日次メモを読み込む指示を追加します。
4. Dream Cycleを使う場合は、専用プロンプトを読むエージェントを夜間に起動するよう設定します。

必要な環境はBash、jq、curl、python3、PyYAMLです。setupはこれらを確認します。LinuxではinotifyとsystemdがそろうとWatcherをサービス化します。定期起動とセッション開始処理は利用者が設定する構成で、setupがすべて登録するわけではありません。[setupの依存確認](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/setup.sh#L21-L60)と[手動設定の案内](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/setup.sh#L170-L213)が根拠です。

## 仕組みと処理の流れ

### 「夜間処理は成功したのに何も残らない」という実例

[Issue #9](https://github.com/gavdalf/total-recall/issues/9)は、Ubuntu 24とOpenClaw 2026.3.8でDream Cycleの起動を設定した際、終了コードが成功でも、観察・ログ・メトリクスが更新されない事例です。報告者は原因を、ファイル操作用のシェルを夜間処理の本体として起動していたことだと説明しています。修正前の実際の案内は `dream-cycle.sh preflight` だけを呼んでいました。これは事前準備であり、その後の分類・保存を行うエージェントがいません。この実例を、固定コミットで案内される処理へ対応付けると、次の流れになります。再実行による結果ではなく、指示とコードからの読み解きです。

1. **エージェントを起動する。** cronはDream Cycleのプロンプトを読むエージェントを起動します。ファイル操作用シェルは、そのエージェントが必要なサブコマンドを選んで呼ぶ道具です。
2. **保存前の状態を確保して資料を読む。** エージェントはpreflightを呼び、観察、favorites、当日の日次メモを読みます。preflightは観察のバックアップを作り、書き込みモードならGitのスナップショットも作ります。
3. **何を残すか判断する。** 重要度・経過日数・現在も有効かを見て、日常的な重複をまとめます。未来の日付を持つ予定は保護します。Phase 2では種類、有効期間、確信度も扱い、関連する3件以上をまとめた要約や、複数日に現れる傾向の提案を作ります。
4. **原文と検索の手掛かりを保存する。** エージェントは退避対象の原文・理由・IDをJSONへまとめ、archiveで日付別ファイルに保存します。残す観察には、具体的な検索語と退避先を持つ短い参照を加え、update-observationsで置き換えます。
5. **記録を残して検査する。** write-logとwrite-metricsでログとJSONを保存し、validateを呼びます。書き込みモードで検査が失敗した場合はrollbackを呼ぶ指示です。

この順序は[専用プロンプト](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L29-L82)、[未来日付の保護と要約](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L223-L273)、[保存と検査](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L360-L399)に記されています。シェルの[preflightとarchive](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/dream-cycle.sh#L94-L163)はバックアップと形式変換を担当します。何が古いか、何が重要かはシェル自身では判断しません。

検索の手掛かりにもリポジトリ内の具体例があります。プロンプトはFitbitの22,376歩という記録を、Fitbitという名前と数値を含む参照にするよう例示し、「Operational churn」のような一般的な見出しを避けています。読み込み対象を短くしても、後日の検索語が残るようにする指示です。この例は[プロンプト内の作例](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L306-L358)で、保存済みの実行ログではありません。

### 会話の収集と外部イベントの経路

Dream Cycleが読む観察は、通常はObserverが作ります。Observerは最近更新された主セッションのJSONLを探し、時刻と発言者で抽出し、定型応答を除きます。入力のハッシュが前回と同じなら処理を省き、既存観察の末尾もLLMへ渡して重複を避けさせます。応答後は日付や装飾を除いた先頭80バイトの比較でも重複を落とし、観察へ追記してからハッシュを保存します。[抽出と入力判定](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/observer-agent.sh#L124-L202)、[LLM入力から追記まで](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/observer-agent.sh#L204-L360)が対応します。

Reflectorは別のプロンプトで高優先度の保持、同じ話題の統合、古い低優先度の削減を行います。Recoveryはセッション開始時、WatcherはLinuxのファイル変更時、memoryFlushは自動圧縮前にObserverへ入る経路です。Watcherの実装が数えるのはmodifyイベントであり、資料にある「40行」はJSONLの実行時行数を毎回測る処理ではありません。[Watcherのカウンタ](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/observer-watcher.sh#L142-L151)と[圧縮前の二段階保存](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/config/memory-flush.json#L1-L8)から区別できます。

AIEは有効なコネクタのイベントを `bus.jsonl` に集め、rumination-engineが会話由来の観察と合わせて考察を作ります。preconscious-selectは重要度に時間による減衰と期限の加点を適用し、話題の偏りを制限して最大5件をバッファへ残します。ambient-actionsは考察を質問、確認済み事実の保存、下書き、通知、リマインダーへ振り分けます。buffer-injectは更新されたバッファをセッションへ渡します。[収集の起動条件](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/sensor-sweep.sh#L36-L109)、[バッファの選定条件](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/preconscious-select.sh#L85-L130)、[行動の分類指示](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/ambient-actions.sh#L246-L300)が根拠です。READMEの直線的な図は概念の案内であり、各スクリプトの起動設定まで自動接続するものではありません。

## 作成・変更の経緯

履歴上の最初のスキャフォールドは2026年2月11日の[42112a9](https://github.com/gavdalf/total-recall/commit/42112a916900b8966df17961940c1781280b15b1)です。SKILL.mdの追加は2月18日の[9285af7](https://github.com/gavdalf/total-recall/commit/9285af7d9fec960f656d59c1a7328ced717b17ea)で、既存の観察・統合・回収をTotal Recallとして配布し直しています。このコミットは、追記より前のハッシュ保存を後ろへ移し、Reflectorを一時ファイル経由の置き換えへ変更したことを説明しています。収集する判断だけでなく、保存途中の失敗を扱う処理も配布単位に含めた変更です。

2月25日の[Issue #2の作者コメント](https://github.com/gavdalf/total-recall/issues/2#issuecomment-3957412663)では、他のAPIを使うためにスクリプトを編集する必要をなくすと説明しています。[e299c46の差分](https://github.com/gavdalf/total-recall/commit/e299c468f90bb41d904ed512d5f29999e7d846af)は固定されたURLとキーを環境変数へ置き換え、旧キー名との互換性を残しました。ただし現在のモデル選択は後続変更を経ており、固定コミットではObserverが `OBSERVER_MODEL`、Reflectorが `REFLECTOR_MODEL` を使います。かつての `LLM_MODEL` の案内だけで現在の選択を説明しないことが必要です。

2月28日の[9397823](https://github.com/gavdalf/total-recall/commit/939782300c159264e0ecdff60965e7b91aff1395)は、観察の肥大化への対応をまとめています。自動処理の記録を重要度1〜2に制限し、重複比較を40から80バイトへ伸ばして日付・曜日を正規化し、低い重要度を退避するコードを加えました。CHANGELOGは退避しきい値を0.5から3.0へ引き上げたと説明しますが、このコミットのコード差分では3.0未満を実際に別ファイルへ退避する処理の追加も確認できます。作者の「68%削減」という記録は、その運用での報告であり、今回再現した値ではありません。

3月11日の[83d4326](https://github.com/gavdalf/total-recall/commit/83d432605337c6a9a18c865f5a51f97868132445)では、Issue #9に対応してDream Cycleの案内をpreflight単独からエージェントの起動へ変更しました。3月14日の[e6500c4](https://github.com/gavdalf/total-recall/commit/e6500c428fb46ba0a6fff06b52473ab112484793)は、夜間処理が900秒の制限に2夜続けて達したという作者の説明を受け、毎晩の整理と週次の傾向分析を分ける方針を文書化しています。ただし変更対象はCHANGELOGとDream Cycle READMEの2ファイルです。固定コミットの専用プロンプトは傾向分析をPhase 2の手順に残し、検索の手掛かりも4〜5個と指示しています。「分割が全実行経路へ反映済み」とは読めません。

3月22日付の[履歴上の取り込み](https://github.com/gavdalf/total-recall/commit/b7e14051c14079e2c5414ba4f3314e1dce36149a)は、[PR #14](https://github.com/gavdalf/total-recall/pull/14)の無料モデルへの変更と応答フィールド対応を含みます。PR提出者の動作確認の説明と、botによるレビュー文は作者自身の検証結果とは区別します。4月1日の固定点では、作者が[Issue #22](https://github.com/gavdalf/total-recall/issues/22)で開発を休止し、保守対応が遅くなると告知しています。

## 設計判断

### 圧縮から独立した保存と、異なる起動条件を組み合わせる

記憶の保存先を会話コンテキストの外へ置く理由を、作者の文書は「圧縮の影響を受けず、人が読め、OpenClaw本体の変更を要しない」と説明しています。保存先にはMarkdownを採用しています。データベースやベクトル基盤を必須にしない方針は明示されていますが、他の保存方式を比較試験して却下した記録までは確認していません。[外部ファイルの理由](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/docs/architecture.md#L76-L83)が出典です。

収集の問いは「定期実行だけで、手動リセット直前の会話を拾えるか」です。資料は、Watcherの5分の待機中に/newが起こると、15分ごとのcronも自動圧縮用フックも間に合わない場面を挙げます。そこで起動時のRecoveryを追加し、読み込みより先に保存を試みます。これは起動条件を補完する設計です。「5層」の数え方は文書により異なるため、各経路の条件で理解する必要があります。[取りこぼしの説明](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/docs/architecture.md#L7-L18)と[開始時の順序](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/templates/AGENTS-snippet.md#L1-L19)が対応します。実装上、Recoveryは名前の逆順で候補を選び、生JSONL末尾のハッシュを比較します。Observerが抽出した本文のハッシュとは生成方法が違うため、この比較だけで未保存の有無を厳密に証明するものではありません。

### 意味の選別と、機械的な保存条件を分ける

記録を増やしすぎない判断は、同一入力の再処理、表現を変えた重複、低重要度の蓄積で条件が違います。採用されている構成は、入力ハッシュ、既存観察を示すプロンプト、応答後の文字列比較、経時的な重要度低下を組み合わせます。たとえばプロンプトの「Daily briefing sent」と「Saturday briefing sent to the user」は同じ事実と扱います。単なる文字列一致では捉えにくい違いをLLMへ判断させ、その後にシェルが正規化した接頭部で比較する構成です。[重複の具体例](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/observer-system.txt#L67-L86)と[追記後に記録するハッシュ](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/observer-agent.sh#L284-L348)が根拠です。この役割分担が一般にどれだけ重複を減らすかは未検証です。

保持の判断では、Reflectorが高優先度を残し、Dream Cycleが未来の予定を保護します。一方、検査コードは文章の意味全体を評価しません。Reflectorは空の応答と入力より語数の多い応答を拒否しますが、同語数は許し、40〜60%削減の達成までは要求しません。[保持のプロンプト](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/reflector-system.txt#L1-L31)と[書き換え前の検査](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/reflector-agent.sh#L147-L175)を分けて読むと、LLMへの目標と保存時の合格条件の違いが分かります。

### 退避・形式検査・人の承認を別の段階にする

Dream Cycleは、常時読み込む内容を減らす際、原文を退避し、具体語を含む参照を残す方式を採用します。さらに、複数日に繰り返された行動を恒久的な指示へ変える段階では、自動適用せずstagingへ提案を書きます。承認を待つ対象は、整理した観察の保存そのものではなく、AGENTS.mdやMEMORY.mdなどへ反映する提案です。review補助コードのapproveも提案を `.approved.md` へ改名するだけで、対象文書を書き換えません。[提案の条件](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L148-L221)と[承認処理](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/staging-review.sh#L155-L190)が出典です。

保存先と検査条件には、次の区別があります。これらは確認できた動作の境界であり、成果物全体の品質を採点したものではありません。

| 対象 | 指示・資料の条件 | 補助コードが実際に確認する条件 |
|---|---|---|
| 要約する観察の件数 | 関連する3件以上、source_idsも3個以上 | source_idsは空でない文字列の配列、件数は1個以上 |
| Dream Cycleの完了判定 | 誤退避ゼロ、8,000未満、10%以上削減を報告 | validateは概算トークン数と当日の退避ファイルのImpactを検査。削減率は判定しない |
| メトリクス | 指定JSON項目を記録 | write-metricsは必須キーが非nullかを確認。値の正しさは再計算しない |
| モデル変更のテスト | 無料モデル、応答フィールド、フォールバック | validate-fixes.shはソース内の文字列をgrepで確認。API応答や記憶保持を実行評価しない |

要約の件数は[プロンプト](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/dream-cycle-prompt.md#L227-L273)と[chunkの検査](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/dream-cycle.sh#L185-L230)、メトリクスと完了条件は[write-metrics](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/dream-cycle.sh#L363-L387)と[validate](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/dream-cycle.sh#L676-L730)、モデル変更は[静的な検査スクリプト](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/tests/validate-fixes.sh#L1-L102)で確認できます。validateの既定目標は5,000で、ファイルのバイト数を4で割った概算を使います。SKILL.mdの8,000という設定案内や、プロンプトの8,000未満という移行条件とは同じ基準ではありません。

validateが数える「誤退避」は、当日の日付別アーカイブのImpactがcriticalまたは数値9以上である件数です。原文と保存後の全項目を照合する検査ではありません。またdecayは重要度3未満を `memory/archived-observations.md` へ移し、validateが読む日付別保存先とは異なります。schemaは7種類を定義しますが、Observerのプロンプトにはdecisionもあり、decayの未知の種類はfactの率へ戻ります。[schema](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/schemas/observation-format.md#L19-L94)、[Observerの種類](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/prompts/observer-system.txt#L16-L26)、[decayの実装](https://github.com/gavdalf/total-recall/blob/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f/scripts/dream-cycle.sh#L411-L526)から、説明資料・生成指示・読取り側の条件を区別できます。

## 調査範囲と出典

| 項目 | 内容 |
|---|---|
| 元URL | [gavdalf/total-recallの固定コミット](https://github.com/gavdalf/total-recall/tree/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f) |
| 分析コミット | `437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f` |
| 調査日 | 2026-11-13 |
| 調査範囲 | ルートSKILL.md、README、CHANGELOG、setup、Observer・Reflector・Recovery・Watcher、両システムプロンプト、Dream Cycleのプロンプト・補助コード・README、staging-review、observation-format、architecture、cron・memoryFlush設定、AGENTSテンプレート。AIEの設定と主要スクリプトも参照しました。到達可能なコミット履歴の全一覧を確認し、配布化・provider設定・肥大化対策・起動修正の差分、夜間分割の変更対象を確認しました。Issue/PRは全ページの索引を確認し、#2・#9・#14・#22の詳細を取得しました。 |
| 未確認の範囲 | コネクタ個別の外部サービス動作、対象外の議論詳細、作者が公表していない比較案・動機、性能・費用・品質の再現性は未確認です。#14の詳細は本文・コメント・レビュー・変更ファイルを取得しましたが、大きい応答の一部は表示が省略されたため、未読のレビュー発言を判断根拠にしていません。固定点より後の議論は当時の実装の根拠にしていません。 |
| 実行検証 | なし |

事例にはIssue #9の報告と、プロンプトに含まれる検索参照の作例を使いました。保存された会話入力と期待出力を組にした実行結果は確認していません。testsの固定モデル確認は形式上の回帰検査です。CHANGELOGの削減率・誤退避件数やPRの動作報告は、それぞれの記述者による報告として扱いました。外部記事・依存サービス・派生リポジトリは取得していません。
