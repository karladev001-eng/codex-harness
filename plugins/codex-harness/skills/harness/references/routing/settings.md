# 起動と機能切替

起動とOFFの境界は[共通境界](../../SKILL.md#共通境界)に従います。`HARNESS_WORKER` は入口を再起動せず、割り当てられた役割だけを実行します。

- 設定の優先順は既定 < 個人 < プロジェクトです。上位の指示とユーザーの指定を確認し、次の作業単位で再評価します。実行中の変更は破棄しません。
- `persistence=false`：仕様をインラインで渡します。タスク文書とADRは保存せず、永続記憶の読書きもしません。
- `improvement_loop=false`：好み・技術的知見の自動読取・記録・適用・候補試用を止めます。記憶は消さず、通常の修正は続けます。明示的な確認・訂正・忘却は別操作で、永続記憶を扱うには `persistence=true` が必要です。タスク保存・計測とは独立しています。
- `model_selection=auto`（既定）では、[役割とモデル](../roles.md)に従い、子の起動時にホストの候補から解決します。`fixed` は設定値を使います。`status.config.models` は基準値で、動的な解決結果ではありません。
- `enabled=false`、または5機能が全OFFの場合は、inactiveです。旧4機能全OFFかつ新キー未指定ならloop=falseを補完し、新キーの明示trueを優先します。

記憶の自動処理は、`preferences.enabled=false` でも止まります。GitHub接続時の `preferences.autosave=false` は、自動の読取・記録・lesson検索・再送を保留します。未接続のlocalの制作記憶は、従来の手順を維持します。`enabled=false`・persistence OFF・preferences OFFでは、明示的な管理も止まります。loop/autosaveがOFFでも、明示keyを持つ手動管理は別扱いです。公開CLIに `--automatic` は無いため、エージェント自身が通信の前に実効設定を判定します。
