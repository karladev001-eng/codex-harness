# 右下の保存パネルとキーボード操作

- 日付: 2026-10-05 JST
- 状態: done
- 仕様版: 1
- 基点: HEAD 82586eda58699e6d44e656689586e220befe41af + 既存未commit成果。今回baseline `/tmp/harness-corner-panel-baseline`。
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents3、auto/pinなし。collaboration.spawn_agentの候補/effortから、設計判断を含む実装はSol6.1/high、独立reviewはSol6.1/high。履歴なし。親モデルはホスト設定を維持。
- 関連未commit成果を保護し同checkout直列。commit/reset/stash不要。

## 目的と受入条件

ユーザーはmac通知のような角丸UIをページ右下へ置き、コマンド→メモ入力→保存をスムーズにしたい。ツールバーに固定されたpopupを通常ページ上の非モーダルな小型パネルへ変更。OS通知そのものやRaycast連携は今回不要。

1. 通常のHTTP(S)ページ右下、余白16px程度、幅320px程度、角丸16px程度、控えめな影。背景を暗くせずページ操作を妨げない。狭い画面でも収まり、詳細のみ必要時に展開する。明示closeとEsc、閉じたら可能なら元のfocusへ戻る。
2. 拡張アイコンとChrome commandのどちらでも開く。初期ショートカットMac Command+Shift+Y、他Ctrl+Shift+Y、chrome://extensions/shortcutsで変更可能。開くとメモfocus、既に開いている場合も同じパネルへfocusしてdraft保持。Cmd/Ctrl+Enterで保存、IME確定を誤保存しない。明示保存までアップロードしない。
3. 本文/HTML/画像に保存パネル自身や入力メモを混入させない。再取得/設定変更でも自己混入を避ける。ページ/タブ移動のidentityチェックを維持し誤ページを保存しない。
4. ページCSS/JSとの干渉を抑え、ページからprivileged save/retry/settings APIを任意呼出できるbridgeを作らない。既存activeTab/scripting権限でユーザー操作後のみ起動、恒久全サイトアクセスなし。制限ページでは伝わるfallback。sender/session/tabの検証。Native/GitHub契約と耐久queue/retry/operation ID/最小結果/既存pending保持を維持。
5. 保存中にパネルを閉じてもworkerは続行。小型完了表示とbadge、待ち/errorを区別。close/reopenや二重操作でduplicate/lossなし。新しい保存draftを古い結果で置換しない。
6. 適切な回帰テストと実ブラウザfixtureでfocus、右下配置、角丸、shortcut保存、close/reopen、自己混入防止と安全境界を確認。npm suite/buildと独立review PASS。READMEへ操作/reload/制限を反映。実GitHubデータへの追加書込不要。

## 根拠・範囲

- フィードバックF-corner-20261005: 「macの通知やポップアップみたいに角を丸く」「右下のページの邪魔にならない場所」「コマンド→書き込み→保存」。今回の保存拡張に限定、改修後評価unknown。前回の小型UI希望と同じ成果物なので独立の一般嗜好根拠に数えない。
- Chrome commands: https://developer.chrome.com/docs/extensions/reference/api/commands
- Content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- 新UI検証はmock transport、実ChromeでのロードやOS shortcut実機動作は確認範囲を区別する。

## 実装と検証の進捗

- 実装: /root/corner_panel_impl、独立レビュー: /root/corner_panel_review。isolated worldのclosed ShadowRoot内へパネルを配置。iframe/WAR/postMessage bridgeなし。sender tab/documentId/frame0とsession tokenを検証し、worker側で取得済み内容を保持。UIはtrusted/noncomposing入力だけを保存操作に使う。
- workerで取得前にパネルを隠し、描画待ち後に取得、finallyで復元。保存直前もURL/timeOriginを照合。親指摘の同一documentでのSPA URL変更時のsession再生成を追加。
- 親CUA: IAB localhost fixture（native通信はmock、shadowはfixtureのみopen）で1280×720時320×324px、右/下16px、角丸16pxを実測/目視。360×600でもはみ出さない。自動note focus、Meta/Ctrl+Shift+Y再表示、下書き保持、Meta/Ctrl+Enter保存、Esc→元のページへfocus復帰、完了後の再commandで新規noteを確認。
- 送信保留中に閉じても保存継続、native接続失敗から再送で成功。fixtureが本文/HTMLへのパネル・メモ非混入と撮影時にpanel hiddenを確認。実画素の撮影先はmockのため実Chrome captureVisibleTab画像の確認は今回未実施。
- 独立review修正1: 保存/取得中のsession Aが、SPA遷移と再openで作られたBを完了時に上書きする競合を修正。短いsession書込lockとtoken/document/tab/URL/time照合で新sessionを保持。再送成功後にcommandから新規メモへ進めない問題も修正。
- 親CUAで修正後の接続失敗→再送成功→command再表示を再検証し、空のメモが表示されfocusされることを確認。
- 最終独立レビューPASS。reviewerが元のsession競合再現を再実行しBの完全保持を確認、knowledge+panel35/35とnpm test/build102/102 PASS。修正必須の未解決事項なし。実Chrome拡張のreload後のOSショートカット登録とnative連携はユーザー環境で未検証、fixtureのキー操作/通信mock結果と区別する。
- 変更: knowledge/extension/{manifest.json,worker.js,capture.js,extract.js,popup.js,panel.js}、knowledge/README.md、tests/knowledge-panel.test.cjs、tests/fixtures/knowledge-panel.html。commitと実GitHub追加書込なし。検証tab/一時serverを終了。フィードバック適用のユーザー評価はunknown。
