# 好み記録のGitHub接続と説明生成の実運用

- 日付: 2026-10-06 JST
- 状態: done（実導入・好み保存・説明共有・毎時設定・独立確認PASS）
- ユーザー依頼: 「そちらの記録もgithub のknowledge baseに保存されるようにして下さい。説明生成送信は承認します。」既存・今後の保存資料の本文/画像/メモ/タグを既存Codex/OpenAIログインで説明生成する、前回の確認への承認として扱う。
- 作業先: <repo>。既存未commit成果を保持、commit/reset/stashなし。既存GitHub preferences/記録管理role/同期/生成コードは独立reviewと118testsを通過済み。今回は実導入・設定・データ記録・確認が中心。
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop true、max_agents3、auto/pinなし。ホストcollaboration候補のSol6.1/mediumを記録/導入担当、Sol6.1/highを独立確認に採用。根拠の用途判断と認証/導入の慎重な扱いのため。履歴なし、親モデル変更なし。

## 受入条件

1. レビュー済み最新版を正規installerでこのPCへ反映し、既存指示/設定を保持。導入版がGitHub preferencesとrecord-keeperを含むことを確認。
2. プロジェクトharnessの好み保存先を既存private repo karladev001-eng/harness-knowledge-base/main、project_key=harnessへ設定。他projectの好みを自動混合しない。statusでGitHub backendとimprovement/projects/harness/preferences.mdを確認。
3. 実フィードバックを根拠ID・用途付きで記録。小型UI/操作削減と角丸右下/keyboardは同じ保存拡張に関する根拠で、全UIへ一般化しない。候補と今回の適用を記録し、改修後のユーザー評価はunknown/null。会話全文/秘密/推測の人物像を送らない。read→revision付きwrite→fresh readで共有完了を確認。専用担当が唯一writer。
4. 親が実保存2件の説明生成を実行、画像を実際に読んだ結果・tool_calls=0・本文/メモ区別を確認してanalysisだけGitHub共有。原文/receiptを保持、再同期後currentと再生成0件を確認。
5. 毎時の説明生成heartbeatをCodex automation toolで作成（既存重複がないか先に確認）。最大5capture、差分のみ、変更なしは静か、要対応を通知。企業調査等の他automationは変更/表示しない。
6. 独立確認で導入版/設定/好み根拠/remote保存/無変更再読取と残課題を照合。hook信頼は偽装しない。Windows実機やベクトル検索、実際の長期改善効果は未確認と区別。

## 参照

- docs/harness/tasks/compact-capture-popup.md:40、corner-capture-panel.md のフィードバックと実装記録。
- plugins/codex-harness/skills/harness/references/roles/record-keeper.md と assets/creative-preferences.md。
- docs/harness/tasks/knowledge-sync-analysis.md、github-improvement-records.md、default-record-keeper.md。

## 担当境界

導入/記録担当は正規build/install、project設定、CLIによる好み記録だけ。親は説明生成・analysis公開・automationと本パケット。GitHubへの書込は好み記録完了後に親がanalysisを公開して直列化。コードの不具合が出ればまず報告し、無断の範囲拡張をしない。

## 実施結果

- 正規build/install成功。初回は所有manifest外の`.DS_Store`2件で停止したが、スキル本文のSHAは全一致。metadataを`<tmp>/harness-installer-metadata-qNEoc6`へ保持し再実行。正規backupは`~/.codex/harness/backups/install-Chw9xJ`。導入版/dist/manifest32files一致、record-keeper存在。ユーザー指示と既存設定を保持。
- `.harness.json`へ指定repo/main/project_key=harnessを設定。導入版statusはGitHub backendと`improvement/projects/harness/preferences.md`を返す。
- 好み記録はread→版付きwrite→fresh read→no-op read成功（exit0/ok=true/freshness=fresh/pending=false）。blob `925b51357537336c767ee519c7bcb6d74da95497`、commit `d0884a1782ee232844df0313f492824b3a1f2c8f`。観察2/候補2/試用2、一般指針なし、ユーザー評価unknown/null。唯一writerはactivate_memory担当。
- 2captureの本文/画像計4componentを既存Codexログイン、gpt-6.1-sol/mediumで実生成。全component tool_calls=0。原文とメモを区別、画像外や実装ファイル未取得の限界を記録。独立担当が保存JPEG実画素とimage説明を照合済み。
- analysis2件のpublishはsent。GitHub base `c009819bd735663f9a9f75d54c35f78f1b8e347d`→head `5282da24de5c490bb813671b44eef953ab0997eb` の変更はpreferences.mdとanalysis.json2個の追加だけ（削除0）。元capture/receipt不変。
- 再同期後commit一致、analyzeのresults=[]で再生成0件。`search --query デザイン`は説明付きcurrentカードを返す。
- Codex automation toolでheartbeat `automation-2`「保存資料の説明生成」を新規作成・表示確認。毎時/ACTIVE、このchatを対象、最大5capture、既存CLIの差分生成/共有、失敗時通知。無関係な既存企業調査automationは変更していない。
- 既存ORCA定義が保持され、SessionStart/UserPromptSubmitの同期hookが各1件あることを再確認。今回の親/workerはconfig.tomlやtrusted_hashを変更していない。確認時点で同期hookに対応するsession_start:1:0とuser_prompt_submit:1:0の信頼記録も存在した。旧日付のconfig.toml SHAは現在値とは異なるため今回の不変証明には使わない。製品側の有効判定/実際の自動発火ログは未確認。
- 独立確認activate_memory_reviewはAC1–6 PASS。installed32file hash、private target、fresh read2回同版、短い根拠と用途/評価、保存JPEG実画素、remote analysis一致、差分3file、snapshot current2/analysis_pending空、automation設定を確認。修正必須なし。コード変更なしのため既存118testを重複実行せず、buildと実運用の検証を実施。
- 制限: Windows実機・PC間実運用・hook自動発火・ベクトル検索・実際の長期改善効果は未確認。メモリはこのproject_key=harnessに限定。他projectへの自動適用は行わない。今後の制作時に新しい導入版のread/record-keeper手順で同じ正本を扱う。
