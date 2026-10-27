# 起動と機能切替

起動・OFF境界は[共通境界](../../SKILL.md#共通境界)に従う。`HARNESS_WORKER` は入口を再起動せず、割当役割のみ実行する。

- 設定は既定 < 個人 < プロジェクト。上位指示・ユーザー指定を確認し、次の作業単位で再評価する。実行中の変更は破棄しない。
- `persistence=false`：仕様をインラインで渡す。タスク文書・ADRを保存せず、永続記憶を読書きしない。
- `improvement_loop=false`：好み・技術的知見の自動読取・記録・適用・候補試用を停止。記憶は消さず、通常修正を続ける。明示的な確認・訂正・忘却は別操作で、永続記憶には `persistence=true` が必要。タスク保存・計測とは独立。
- `model_selection=auto`（既定）は[役割とモデル](../roles.md)に従い子の起動時にホスト候補から解決。`fixed` は設定値を使う。`status.config.models` は基準値で、動的な解決結果ではない。
- `enabled=false` または5機能全OFFはinactive。旧4機能全OFFかつ新キー未指定はloop=falseを補完し、新キーの明示trueを優先する。

記憶の自動処理は `preferences.enabled=false` でも停止する。GitHub接続時の `preferences.autosave=false` は自動読取・記録・lesson検索・再送を保留する。未接続localの制作記憶は従来の手順を維持する。`enabled=false`・persistence OFF・preferences OFFでは明示管理も停止。loop/autosave OFFでも明示keyを持つ手動管理は別。公開CLIに `--automatic` は無いため、エージェント自身が通信前に実効設定を判定する。
