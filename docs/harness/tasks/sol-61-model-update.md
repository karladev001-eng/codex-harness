# タスク: sol-61-model-update

- 状態: done
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af と現在の既存未コミット変更（保持、直列作業）
- 目的: ユーザー指定により子のgpt-6-solをgpt-6.1-solへ変更。
- 対象: defaults.json、roles.md、README.md、SPEC.md、生成配布物、所有確認付き実導入更新。
- 対象外: 歴史的実行記録・ベンチマーク、Luna、推論強度、メイン設定。
- 受入条件: standard/complex/reviewがgpt-6.1-sol、強度はmedium/high/high。deterministicはgpt-6-luna/low。既存変更保持。buildとstatus検証、独立レビュー、実導入版で確認。
- 実装・統合: gpt-6-luna/low（明確な置換と確認）。レビュー: gpt-6.1-sol/high（ユーザーの明示モデル指定）。
- 依存: 実装→レビュー→導入。
- 未解決: なし。

## 完了

- 指定4ファイルの現行モデルIDを更新。Luna/推論強度を保持。歴史的記録は変更しない。
- build、差分チェック、生成版status確認PASS。gpt-6.1-sol/highの独立レビューPASS。standalone/plugin生成物との一致を確認。
- 実導入を更新し、導入済みruntime statusでstandard/complex/review = gpt-6.1-sol、medium/high/high、deterministic = gpt-6-luna/lowを確認。
- 旧版バックアップ: `~/.codex/harness/backups/install-4u7jSi`。
- 設定値置換のため新規テスト・全テスト反復なし。commit/pushなし。
