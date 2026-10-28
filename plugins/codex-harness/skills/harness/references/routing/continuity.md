# 記録と再開

状態は `planned → ready → implementing → reviewing → done` と進みます。review OFFの場合は、検証後にdoneとします。`needs_work` は修正へ回し、`blocked` は理由を記します。状態と受入の判断はエージェントの責務で、CLIだけでは完了を証明しません。

コード修正では[技術的知見](../technical-lessons.md)に、制作では[制作改善](../creative-loop.md)に従い、記録の有無を判断します。保存した場合は、成否とpendingを完了記録に短く残します。変更も既知のpendingも無ければ、record-keeperを起動しません。会話全文を自動送信する手順ではありません。

保存ONなら、[完了記録](../../assets/completion.md)をパケットに追記します。長いログはホストの保存先に置きます。再開するときは、タスクIDから、現在のパケット・必要なADR・実コードだけを確認します。別のPCではコードと文書をGitなどで同期し、ローカルのworktreeや稼働中の担当が移動することは前提にしません。activeな長期作業では、フェーズの境界と大量読取の前に[早期compact](../early-compaction.md)を読み、引継ぎを更新します。正式な本体の自動compactとagentの実行機能は区別し、実行や使用量の取得は保証しません。独自の監視・API・会話削除は禁止です。

CLI操作（起動時のstatusも含む）は[commands](../commands.md)、measurement ONのときは[計測](../measurement.md)を読みます。役割手順は該当するときだけ適用し、追加の起動は自動化しません。Designer自動化とブラウザ評価はv1の自動工程の対象外ですが、UI実装の前の視覚モックは必須です。保存資料は必要なときに指示で参照し、runtimeや同期hookによる全資料の自動注入は前提にしません。
