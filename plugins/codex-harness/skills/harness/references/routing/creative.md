# 制作フィードバックの改善ループ

loop ONのUI・文書等の制作/修正/フィードバックは[制作改善ループ](../creative-loop.md)に従う。開始時に現指示と適用範囲の合う指針を確認し、修正根拠を観察、完了評価を区別して記録、次回に更新を反映する。GitHub接続時のautosave OFFまたはpreferences OFFなら自動読取・記録・再送前に止める。未接続localの既存手順は維持する。公開CLIに自動操作フラグはないため設定を自身で判定する。記憶はruntimeの `preferences read/write/sync` 経由。GitHub設定済みでfresh確認失敗なら自動適用しない。persistence OFFは保存記憶を読まず会話内のみ。明示的な好みの根拠はmeasurementと独立しpersistenceに従う。

保存根拠/更新/既知pendingの再同期がありactive/persistence/loop/delegation ONなら、親は既定で[record-keeper](../roles/record-keeper.md)へ保存を委譲する。無変更なら起動しない。明示管理はloop OFFでも可、delegation OFFは親が同じ契約で担当、persistence OFFは起動・記憶読書き禁止。起動/引継ぎ・唯一のwriter・失敗時は[詳細](../creative-loop.md#起動引継ぎ)を守る。

保存資料が参考になる場合は[検索と取得](../knowledge-retrieval.md)で少数候補の必要箇所を読み、今回への適用を判断する。設定OFF・未設定・資料不足なら通常作業を続ける。制作委譲時は[モデル規則](../roles.md)に従い、非決定的制作はSol系、effortは必要品質で別に選ぶ。

純制作にコード調整・実装委譲・worktree・コード統合は要求しない。コードを含む制作/修正はコード調整・独立レビューとloopを併用する。現ユーザー指示・権限・安全規則を優先する。
