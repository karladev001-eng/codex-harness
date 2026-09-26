# 補助CLI

インストール済みスキルの `runtime.py` を直接実行できる。配布リポジトリでは `python3 scripts/harness.py` が同じ入口になる。各コマンドの `--help` で現在の引数を確認する。

以下の `<runtime>` はSKILL.mdと同じディレクトリのruntime.pyへのパス。パスや自由文はシェルに合わせて引用する。

```text
python3 <runtime> status --project <project>
python3 <runtime> doctor --project <project>
python3 <runtime> task create --project <project> --id <task-id> --goal <goal> --acceptance <criterion> --scope <owned-path> --base <commit>
python3 <runtime> task show --project <project> --id <task-id>
python3 <runtime> task validate --project <project>
python3 <runtime> worktree create --project <project> --id <task-id> --base <commit>
python3 <runtime> measure record --project <project> --input <measurement.json>
```

`task create` の `--acceptance` と `--scope` は必須で繰り返し可能。`--depends-on`、`--non-goal`、`--constraint`、`--reference` も繰り返し可能。`--spec-revision` は既定1。基点は明示したコミットを使う。

作成されるパケットは `docs/harness/tasks/<id>.json`。Markdown雛形は必要項目の説明であり、CLIのJSONパケットを重複してMarkdown保存する必要はない。未解決事項と進捗を補い、CLIが生成したフィールドを維持して更新する。CLIはタスク作成・読取・依存検証を支援するが、レビュー判定・状態更新・統合はエージェントが担当する。

全コマンドで `--home <temporary-home>` を指定すると隔離したホームを使える。通常は既存CODEX_HOMEまたは標準ホームから個人設定を解決する。プロジェクト設定は `.harness.json`。状態確認はファイルを作らない。task/worktree/measureは明示的な書込み操作であり、設定が許可する範囲のみ使用する。

計測入力はJSONオブジェクト。`task_id`、`run_id`、`condition`（`baseline` または `harness`）、タイムゾーン付きISO日時の `start` と `end` が必須。任意項目は `model_roles`、`corrections`、`completion`、`defects`、`usage_before`、`usage_after`、`window_before`、`window_after`、`overlap`。利用枠値は残量ではなく消費済み百分率（0–100）で、前後を同じ窓に揃える。重複なしを確認できた場合のみ `overlap=false`。未取得はnull。経過秒・比較可否・除外理由・比較可能な場合のアカウント消費差分はCLIが算出する。
