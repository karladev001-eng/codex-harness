# 制作フィードバックの改善ループ

loop ONのUI・文書などの制作・修正・フィードバックでは、[制作改善ループ](../creative-loop.md)に従います。通常の制作では `read-sections.cjs creative-loop loop` で必要な節だけを読み、資料参照・指針の更新・保存の委譲が要るときに `retrieval`・`preferences-contract`・`delegation` を足します（一覧は `--list creative-loop`）。開始時に、現在の指示と適用範囲が合う指針を確認します。修正の根拠は観察として記録し、完了時の評価は区別して記録し、次回にその更新を反映します。GitHub接続時のautosave OFFまたはpreferences OFFなら、自動で読み取る・記録する・再送する前に止めます。未接続のlocalでは既存の手順を維持します。公開CLIには自動操作のフラグがないため、設定は自分で判定します。記憶の読み書きはruntimeの `preferences read/write/sync` を通します。GitHub設定済みでfresh確認に失敗したときは、自動適用しません。persistence OFFでは保存された記憶を読まず、会話内だけで扱います。明示的な好みの根拠はmeasurementとは独立で、persistenceに従います。

保存する根拠や更新、または既知のpendingの再同期があり、active・persistence・loop・delegationがすべてONなら、親は既定で[record-keeper](../roles/record-keeper.md)に保存を委譲します。変更がなければ起動しません。明示的な記憶管理は、loop OFFでも行えます。delegation OFFなら、親が同じ契約で担当します。persistence OFFでは、起動も記憶の読み書きも禁止です。起動と引継ぎ、唯一のwriter、失敗時の扱いは[詳細](../creative-loop.md#起動引継ぎ)を守ります。

保存資料が参考になる場合は、[検索と取得](../knowledge-retrieval.md)に従って、少数の候補から必要な箇所だけを読み、今回への適用を判断します。設定がOFFまたは未設定のとき、資料が足りないときは、通常の作業を続けます。制作を委譲するときは[モデル規則](../roles.md)に従います。非決定的な制作にはSol系を使い、effortは必要な品質に応じて別に選びます。

純制作には、コード調整・実装委譲・worktree・コード統合を要求しません。コードを含む制作・修正では、コード調整と独立レビューにloopを併用します。現在のユーザー指示・権限・安全規則を優先します。
