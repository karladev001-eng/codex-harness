# タスク: preimplementation-spec

> 2026-10-08追記: この文書は初回導入時の記録。「毎回承認を追加しない」方針は、後続の[承認待ちルール改訂](preimplementation-approval.md)で置き換えられた。現在の規則はSKILL.mdを参照する。

- 状態: done
- 仕様版: 1
- 開始: 2026-10-07T06:03:07+00:00
- コード基点: 82586eda58699e6d44e656689586e220befe41af + 依頼開始時の未コミット変更
- 依頼開始時コピー: <tmp>/harness-preimplementation-qw59s6k7
- 作業方式: 既存変更を保持し現在のcheckoutで直列作業。commit/stash/resetなし。
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、model_selection=auto、pinなし。
- 子のモデル: 実装 gpt-6.1-sol/medium（規則の適用境界と文書整合）、レビュー gpt-6.1-sol/high（独立評価）。候補取得元は本セッションの collaboration.spawn_agent のモデル・effort一覧。設定基準と一致、同系統の新後継は提示なし。fork_turns=none。
- 担当範囲: plugins/codex-harness/skills/harness/SKILL.md、assets/task.md、references/reviewer.md、README.md、SPEC.md。ビルド成果と導入は親が後工程で検証。
- 依存: なし

## 目的と対象外

ハーネスの標準手順として、実装前に実装内容の説明・仕様書・UIがある場合の視覚的なモックアップを作成してユーザーに提示することを必須にする。ルールは既存のSKILL入口に集約し、重複するHARNESS.mdやAGENTS.mdは作らない。新しいUI・runtimeの機械的な実行阻止・新設定キー・公開・commit/pushは対象外。今回はルール文書の更新なのでUIモックアップは非該当。

## 受入条件

1. activeの実装依頼（新規機能・修正を含む）では、本実装や実装担当への着手指示より先に説明・仕様を作成して提示する。UIを作成・変更する場合は視覚的モックアップも必須。説明文だけをモックアップと扱わない。調査・仕様・モック作成そのものは事前準備として可能。
2. 仕様は目的、対象範囲/対象外、利用者から見た振る舞い・必要な入出力や異常時、番号付き受入条件、制約・未解決事項を持つ。小変更は短くできるが一律免除しない。既存仕様・モックは現在依頼との適合を確認して再利用できる。
3. モックは主要な画面・操作・必要な状態を確認できる画像、ワイヤーフレーム、表示可能なHTML等で提示し、実仕様と版を対応させる。productionへの組込みや実機能の実装を先行させない。提示不能や判断必須の未解決事項は実装開始を止め、制約を明示する。
4. 保存ONでは既存タスク仕様を正本にして参照/版/提示証拠/UI非該当理由を記録する。保存OFFでも会話内で同じ事前準備と提示を行う。ready移行、実装者の受領、レビュー時に充足を確認し、仕様変更時は関係資料を先に更新・再提示する。
5. 毎回のユーザー承認を新設しない。明示的な承認待ちや上位の権限制約は守る。ユーザー指示と既存認可を優先する。review/delegation/improvement_loop OFFでもactiveなら事前準備は必要。inactiveで追加工程を強制しない。純調査や仕様作成だけの依頼に本実装・コード委譲やGit工程を付加しない。
6. SKILL、タスク雛形、reviewer、README、SPECが整合し、既存Designer自動化対象外の記述はモック作成不要という意味に読めないこと。既存リンクを検証し、不要な文言写経テストは増やさない。
7. ソース・ビルド・実導入の規則を一致させる。既存設定、記憶、入口、配布物を保持し、導入に障害があれば未反映を明記する。

## 未解決事項

なし。作成と提示を実装開始条件とし、別途の毎回承認は追加しない。

## 事前提示

ユーザーへ会話内で説明・仕様・視覚モックの必須化、短縮可能だが省略不可、承認待ちを追加しない方針を提示済み。このパケットが今回の仕様正本。UIは変更しないためモック非該当。

## 進捗・完了

開始時の利用枠: null（未取得）。終了時刻・独立レビューと適用確認を追記する。

担当5文書の更新完了。説明・仕様・UIモックの事前提示とready/受領/reviewでの確認を追加。純調査・準備作業は着手条件の対象外、既存Markdown/CLI JSONの正本を再利用。実装担当のリンク検証40件（節アンカー含む）とdiff空白検査PASS。

親検証: npm run build PASS。source/standalone/pluginの今回の3スキル文書が完全一致。開始時・build後ともdist/releases内に配布アーカイブはなく、新規アーカイブは作成していない。実導入を複製した一時stageへ今回の3文書だけを反映し、他ファイルの追加/削除/変更がないことを確認。隔離HOMEへの標準installer実行PASS、3文書一致・再install unchanged・status activeを確認。独立レビューPASS後に実導入済み。

最終結果: 受入条件1〜7すべて独立レビューPASS、修正必須指摘なし。標準installerで ~/.agents/skills/codex-harness へ反映、旧版backupは ~/.codex/harness/backups/install-urJpxg。独立検証でsource/standalone/plugin/stage/liveの3文書一致、stage/live全46ファイル一致、所有manifest一致、backupからの変更が正確に3文書のみ、既存入口・設定・記録のfingerprint4件保持を確認。実runtime status active=true、git diff --check PASS。runtimeコード変更なしのため全テストスイートは未実行（build・隔離導入/冪等性・リンク・実導入一致を検証）。commit/pushなし。指示による実装開始条件であり、ホストでの機械的な強制機能ではない。

終了: 2026-10-07T06:09:36.223363+00:00。利用枠前後: null（未取得）。実装 Sol6.1/medium、独立レビュー Sol6.1/high。レビューによる修正0巡。
