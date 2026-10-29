# タスク: capture-panel-navigation — 再表示でも解除されない移動警告を修正

- 状態: blocked（修正・独立レビュー完了、Chromeの手動再読み込み待ち）
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af + 既存未コミット成果
- 担当: knowledge/extension/{worker,panel,capture}.js、tests/knowledge-panel.test.cjs、必要なら関連fixture/README
- 依存: corner-capture-panel 完了
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents3、auto pinなし
- モデル選択: 実装gpt-6.1-sol/high（Chrome sender/document/SPA同一性と送信権限の修正）、独立review gpt-6.1-sol/high。collaboration.spawn_agentの候補・effortを2026-10-07確認。fork_turns=none。
- 作業方式: 既承認同一checkout直列、既存未コミットを保護、commit/reset/stash禁止

## 目的

ユーザー報告: 保存パネルを開き直しても「ページが移動しました。保存パネルを開き直してください。」が残り保存不可。添付画面で取得未完了、メモUI参考、save disabled。該当URLは質問中。原因は未確定、authorizePanelのsender.url厳密比較とSPA再表示・既存UI再初期化を検証する。

## 受入条件

1. 実装前に失敗の原因または再現条件を特定し、回帰テストで失敗と修正を確認する。推測と実ブラウザ観測を区別。
2. 同一document内のURL変化後、拡張コマンドで開き直し/再取得でき、現在ページを取得して保存できる。入力済みメモ・タグを無断送信/消失させず復旧可能にする。
3. 別frame/tab/document/extension/偽sessionは拒否。実ページ移動、同URLreload、取得中移動、古い非同期処理が新sessionを上書きする競合対策を維持。URL比較を無条件に外して安全性を弱めない。
4. 送信待ち/既存operation_id/ACK/retry・自己パネル非混入を維持。native/GitHubの無関係な設定・自動化・好みを書き換えない。テストで実データのダミー保存をしない。
5. 必要な回帰テスト、build、独立レビューPASS。このMacでロード中の拡張のパスを確認し反映。実機検証可能なら実ページで取得/保存ボタン有効を確認し、未確認範囲を明記する。

## 参照・制約

- Installed harness ~/.agents/skills/codex-harness/SKILL.md および roles/reviewer 手順。
- Chrome拡張ID ahleaofjfichjdolmgkejbdfbbepgekn。
- ユーザーの現在ページのメモは保存操作を新規生成して勝手に送信しない。今回まず不具合修正と取得復旧確認。
- コード/運用上の不具合報告であり、新しい美的嗜好を記録しない。usage未取得null。

## 進捗

- 親: 警告の発生箇所をworker authorizePanel/identity/updateSessionへ絞込。原因未確定。
- ユーザー追加: Xでポストを保存後、引用ポストも保存しようと発生。提示URL `https://x.com/<user>/status/<id>` と `https://x.com/<user>/status/<id>`。
- 親CUA: 後者の現存Chromeタブで閉じる→拡張アイコン再表示を実行し、「閲覧中のページ」、警告継続、保存disabled、メモ「UI参考」を確認。sender metadataの実値は未観測。
- 対象拡張のChrome設定をID限定で読取: Defaultのunpacked path <repo>/knowledge/extension。ソース変更が次回拡張reloadで反映される。
- 実装: sender.urlの完全一致を同HTTP(S)origin＋browser document/frame/tab/runtime/token＋isolated live URL/timeOrigin/token確認へ変更。待機後retry/ackと取得終了後も再確認。再表示で失敗した取得を再実行し、同originの未送信draftを保持。自動保存なし。
- 実装者: 旧sender URL条件、新旧sessionでのUI復旧・入力保持の3回帰が旧実装でFAILしたことを確認。追加境界含め関連41/41 PASS、npm run build PASS。worker.js/panel.js/tests/knowledge-panel.test.cjs/knowledge/README.mdのみ変更、capture.js不変。
- 制約: Chrome拡張管理URLへのツール操作がbrowser security policyで拒否され、別UI等の迂回も禁止。設定ファイル変更等でreloadを迂回しない。独立レビュー完了後、ユーザーへ拡張reloadとXタブ再読み込みを依頼する。修正版の実Chrome適用・保存成功はまだ未確認。実KBへテスト保存なし。
- 独立レビュー1: 同URLの別operation未読完了結果が、SPAで引き継いだ未送信draftを隠して次回openで消すP2を検出。独立再現 <tmp>/capture-review-draft.cjs。bootstrapの過去結果復元をdraft無しの場合に限定し修正。sent/pending双方の入力保持と、draft無し従来復元/ACKを追加回帰で検証。関連43/43とbuild PASS。ユーザーの実メモは旧パネルに残しており未送信。
- 再レビューで、保存待ちの旧operationが後から完了するstorage event経路にも下書きを隠す処理があることを検出（<tmp>/capture-review-completion.cjs）。修正2へ戻す。引継ぎdraftを旧operationから分離し、ブロック解除と再取得は行いつつ、他操作の完了を下書きの保存成功と解釈しない。
- 修正2: preservingDraftにより引継ぎ入力を旧pending/saving operationから分離。旧完了イベントはblocked解除と再取得に使い、own保存の完了/ACKのみ入力を保存済みにする。旧操作の明示retryでも下書きを保護。READMEは更新前にメモ・タグを控える案内へ訂正。
- 最終独立レビューPASS。2つのP2再現scriptがPASS（completion scriptはfixtureへのemit配送1行のみ互換変更）。独立関連45/45 PASS・npm run build PASS。AC1–4およびAC5のコード/回帰/build/review部分は充足、実Chrome再読み込み後の取得/保存ボタン有効化は未確認。修正2巡、利用量null、commitなし。実データへ保存なし。
- 次の操作: ユーザーがメモ・タグを控え、chrome://extensions で「資料を保存 — Knowledge Capture」を再読み込み、Xタブもリロードしてパネルを再表示する。browser security policyによる制限のためこちらから実行不可。反映後の確認が残ることを最終回答で明記。
