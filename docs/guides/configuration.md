# 設定と機能の切替

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" status --project "/path/to/project"
```

設定は、標準値 → 個人設定 → 共通Git checkoutの `.harness.json` → worktree/対象projectの `.harness.json` の順で上書きします。個人設定は通常 `~/.codex/harness/settings.json`、`CODEX_HOME` が設定されている場合はその配下です。更新は個人設定とプロジェクト設定を変更しません。以前のモデルを明示した設定があれば、新しい配布既定を隠したまま保持されます。上の `status` の `config.models` は設定された基準値です。`model_selection` のmode/resolution/pinsで自動選択方式とpin由来を確認し、新しい既定を使いたい項目だけ個人設定・プロジェクト設定から削除してください。`persistence=false` や `measurement=false` などのOFF設定も維持します。

```json
{
  "schema_version": 1,
  "enabled": true,
  "delegation": true,
  "review": true,
  "persistence": true,
  "measurement": true,
  "improvement_loop": true,
  "model_selection": "auto",
  "max_agents": 3
}
```

- `delegation`：実装を子エージェントへ委譲。ON時は小変更でも委譲します。
- `review`：すべての実装を独立レビューし、統合後の整合性も確認します。
- `persistence`：仕様・タスク進捗・重要な判断をプロジェクトに保存し、制作の好みと技術的知見を設定したlocal/GitHub保存先へ保存します。OFFでは過去の好みを読まず、当該会話だけで扱います。
- `measurement`：明示的に取得できた利用情報・時間・手戻りを記録します。OFFでも改善ループONなら明示された好みは `persistence` に従って扱えますが、集計・利用計測は保存しません。
- `improvement_loop`：好み・技術的知見の自動読取・記録・適用と候補試用（既定ON）。OFFでも保存済み記憶は消さず、依頼内の通常の修正は続けます。明示的な記憶の確認・訂正・忘却は別操作として扱えますが、永続記憶の読書きは `persistence=true` のときだけです。
- `model_selection`：`auto`（既定）は子起動時にホストの候補と対応effortから同系統の後継を選びます。`fixed` は従来の設定を使います。
- `max_agents`：実装・調査・レビューが共有する子の同時稼働上限。ホスト上限を超えません。

`enabled: false`、または5機能をすべてOFFにすると、状態確認だけで通常の作業へ戻ります。追加の分業・記録・計測を行わず、過去の成果物は削除しません。旧4機能がすべてOFFで `improvement_loop` 未指定ならfalseに補完し、従来のinactiveを保ちます。新キーの明示trueは優先します。

メインには `gpt-6-astra` を希望します。ただし、このスキルからメインのホストモデルは自動変更できません。ホストの現在値が異なる場合は、その差を報告します。子の標準割当は `deterministic` が `gpt-6-luna/low`、`standard` が `gpt-6.1-sol/medium`、`complex` と `review` が `gpt-6.1-sol/high` です。

子はまず作業の性質でモデルを選びます。答えと確認方法が明確な作業や範囲を絞った調査は、複数ファイルでもLunaを選べます。開かれた設計・構成判断、非決定的なクリエイティブ制作、重要なレビュー、リスクの高い問題はSol 6.1です。クリエイティブな作業を委譲する場合も同じ規則を適用しますが、この規則で委譲を強制しません。重要性・リスクは手順の単純さより優先します。その後、必要な品質に応じて推論強度を独立に選びます。単純で客観的に確認できる作業は `low`、通常は `medium`、厳密な検討やレビューは `high`、例外的な品質が必要な場合だけ理由付きで `xhigh` または `max` を使います。例えば、決定的な単純作業でも厳密な品質ならLuna/high、創造的な制作でもラフ案ならSol/lowを選べます。例に固定せず、モデルが対応する強度に限ります。`models` 設定とユーザーの明示指定を確認し、選択したモデル・強度と理由をタスクに記録します。利用できない値へ黙って代替しません。

`auto` は親エージェントの指示ベースの選択です。タスク開始時と子起動時に、実際の起動ツールが提示するモデル・対応effortを確認します。個人/プロジェクトの `models.<role>.model` を明示した役割はautoでもpinとして優先し、effortだけの上書きはpinにしません。ホストが同じ役割・系統の後継/最新と明示するなどの根拠がある場合にだけ更新します。候補一覧なし・根拠が曖昧なら設定基準値を使い制約を報告し、LunaからAstraなどへの役割変更は行いません。候補と取得元、選択根拠、実際のmodel+effortをタスクへ記録し、persistence OFFなら会話内に残します。実行中の子は切替しません。

`status` は読取のみでネットワーク・認証取得・外部API呼出を行いません。候補表示はアクセス権や起動成功を保証せず、非対応の明示値は黙って代替せず報告します。別PCでも同じ確認を行うため、リリース直後の自動更新は保証しません。詳細は[役割とモデル](../../plugins/codex-harness/skills/harness/references/roles.md)を参照してください。

## 保存するものを分ける

| 情報 | 保存先と役割 |
| --- | --- |
| 仕様・判断・進捗 | プロジェクトの `docs/harness/`。次の担当やチャットへ引き継ぐ |
| 技術的知見 | [改善ループ](improvement-loop.md)のlessons保存先。原因・対策・検証・範囲・出所を扱う |
| 制作指針 | [改善ループ](improvement-loop.md)のpreferences保存先。用途を限ったユーザー根拠を扱う |
| 原資料・メモ・画像・生成説明 | [Knowledge](knowledge-base.md)の別保存先。保存しただけで好みへ変換しない |
| 長いログ・計測 | statusのホスト内local_root。会話や全資料の自動投入はしない |

Knowledgeは `KNOWLEDGE_HOME`（既定 `~/.codex/knowledge`）で、Codex Harnessの `CODEX_HOME` 設定とは別です。機能フラグは通常作業へ戻るための指示であり、ホストの権限や外部ツールの登録を切り替えません。

## 修正記録の共有とOFF

preferencesの既定はenabled=true、autosave=false、repository/project_key空、branch=mainです。未接続localの制作記憶は維持します。[個人の一回opt-inと別PC手順](improvement-loop.md#githubで制作の記憶を共有する)で共有先を設定します。明示keyを優先し、Git origin/登録簿、non-Gitの持ち運べるkeyで同一projectを解決します。worktreeは共通設定を継承します。separate Git dirに元checkoutへの逆参照がない場合はcore.worktreeを明示し、設定元を推測させません。

| OFF設定 | 止まる処理 | 明示管理 |
| --- | --- | --- |
| enabled / persistence / preferences.enabled | 記憶の読書き・通信・自動再送 | 停止 |
| improvement_loop | 自動参照・記録・適用・試用・再送 | persistence等がONなら可 |
| GitHub接続時のpreferences.autosave | 自動read/write/lesson検索/再送 | 明示keyなら可 |
| measurement | 集計・計測ログ | 根拠の保存は他flagに従う |

repositoryだけを継承したOFF設定も可能です。未登録はunresolvedとして止め、旧localへ自動fallbackしません。OFFは記憶削除ではありません。公開CLIの手動入口は自動操作のflagを取らないため、エージェントがstatusを見て通信前に判定します。再送は各pending元projectの現設定を再解決し、不在/OFF/target変更を保留します。

## PowerShellのパス

本文の `$HOME/...` 例はmacOS/Linux向けです。Windowsでは次のように書きます。カスタム導入先は実際の絶対パスへ置き換えてください。

```powershell
node "$env:USERPROFILE\.agents\skills\codex-harness\runtime.js" status --project "C:\Projects\example"
```

[導入](installation.md)・[作業の流れ](workflow.md)・[トラブルシューティング](troubleshooting.md)
