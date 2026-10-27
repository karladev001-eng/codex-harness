# 記録と再開

状態は `planned → ready → implementing → reviewing → done`。review OFFは検証後done。`needs_work` は修正へ、`blocked` は理由を記す。状態/受入判断はエージェントの責務で、CLIだけでは完了を証明しない。

保存ONは[完了記録](../../assets/completion.md)をパケットに追記。長いログはホスト保存先へ。再開はタスクIDから現パケット・必要ADR・実コードだけを確認する。別PCはコード/文書をGit等で同期し、ローカルworktree/稼働担当の移動を前提にしない。activeな長期作業のフェーズ境界・大量読取前は[早期compact](../early-compaction.md)を読み引継ぎを更新する。正式な本体自動compactとagent実行機能を区別し、実行/使用量取得を保証しない。独自監視・API・会話削除は禁止。

CLI操作（起動statusも含む）は[commands](../commands.md)、measurement ONは[計測](../measurement.md)を読む。役割手順は該当時のみ適用し、追加起動を自動化しない。Designer自動化・ブラウザ評価はv1自動工程外だが、UI実装前の視覚モックは必須。保存資料は必要時に指示で参照し、runtime/同期hookの全資料自動注入を前提にしない。
