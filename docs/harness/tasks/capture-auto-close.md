# タスク: capture-auto-close — 保存成功後の自動close

- 状態: done（コード完成、Chromeへの読込反映は手動reload待ち）
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af + 既存未コミット成果
- 担当: knowledge/extension/panel.js、tests/knowledge-panel.test.cjs、knowledge/README.md
- 依存: capture-panel-navigationのコードレビューPASS済（実Chrome reload待ち）
- 実効設定: 全feature true、max_agents3、auto pinなし。collaboration候補gpt-6.1-sol medium/high確認。
- 実装Sol6.1/medium（非同期UI状態を伴う小変更）、review Sol6.1/high、履歴なし。既承認共有checkout直列。既存変更をcommit/reset/stashしない。

## 目的・根拠

ユーザー2026-10-07の明示依頼「保存した後、自動的にパネルが閉じるようにして下さい。」。Chrome保存パネルだけに適用し、全UIの好みに一般化しない。今回の実装結果へのユーザー評価は未取得。

## 受入条件

1. GitHub保存成功sentの表示後、約800msでパネルを自動的に閉じる。失敗/error、pending、savingは自動closeしない。新規save・再送の成功を扱うが、別operation完了で保護中draftを閉じない。
2. 再open・新しいメモ開始・手動close・destroy/session置換で古いclose予約を無効化。新しいdraftや別sessionを古いtimerで閉じない。次のcommandでは従来通り空のメモへfocus。
3. 自動closeでページの操作中focusを奪わない。保存中の手動closeも維持。直前のSPA/draft/queue/ACKの修正を回帰させない。
4. 適切な制御timerテスト（sleep不要）、関連tests・build・独立review PASS。既存ロードpathがsource/knowledge/extensionであることを踏まえて反映手順を案内。chrome://extensionsの操作制限は継続し迂回しない。

## 完了・検証

- 保存原文/スケジュールの変更や実KBへのテストsaveなし。新しいUIフィードバックの記憶は専任record-keeperのみ書込。usage未取得null。
- 実装: panel.jsのsent表示後800ms timer。open/new/manual close/destroyで予約・世代を無効化、operation/panel同一性も照合。auto closeはpanel内にfocusが残る場合だけ元focusへ戻し、ページ操作中は奪わない。pending/error/savingは閉じない。
- baseline /private/tmp/capture-auto-close-baseline、今回差分 /private/tmp/capture-auto-close-review.diff。制御timer回帰追加、関連4suite78/78・build・diffチェックPASS。実Chromereload/実KBテスト送信なし。
- 記録管理担当がF-capture-autoclose-20261007、C-capture-autoclose-20261007をGitHub記憶へ保存。ok=true,pending=false,freshness=fresh。Chrome拡張限定、今回の実装選択やユーザー評価を根拠として混同しない。
- 独立レビュー指摘1: 既読ACKが別tabのqueue待ちになるとauto close後に次commandで新規editorを開けない競合を検出。既読ACKを表示のbusy処理から分離し、旧ACKの成功/失敗が新draftへ影響しないようversion/operationで保護。hold ACKと次acquire保留の制御timer回帰を追加。
- 最終: 関連4suite80/80・build・diffチェックPASS。独立reviewerのpanel27/27および独立holdACK resolve/reject再現PASS、追加修正必須なし。AC1–4コード/自動検証/レビュー充足。実Chromeへ再読込後の実画面動作は未確認で、先のbrowser security policy制限を迂回しない。
- source/dist panel SHA256一致: d5701e5203442239e7977e7f5d640080435aec2ec1b25931280dd21453cb4684。commitなし。読み込み先source/knowledge/extensionの再読込と閲覧タブreloadを案内する。
- 記憶T-capture-autoclose-20261007も保存。ユーザー評価unknown/null、800msは実装判断。最終revision39987cb44a337f0c395ffaab3a616d996a39854dedb31aac5094821c1f0114fe、pending=false,fresh。
