# 補助CLI

インストール済みスキルの `runtime.js` を直接実行できる。配布リポジトリでは `node dist/skill/runtime.js`（`npm run build` 後） が同じ入口になる。各コマンドの `--help` で現在の引数を確認する。

以下の `<runtime>` はSKILL.mdと同じディレクトリのruntime.jsへのパス。パスや自由文はシェルに合わせて引用する。

```text
node "<runtime>" status --project <project>
node "<runtime>" doctor --project <project>
node "<runtime>" task create --project <project> --id <task-id> --goal <goal> --acceptance <criterion> --scope <owned-path> --base <commit>
node "<runtime>" task show --project <project> --id <task-id>
node "<runtime>" task validate --project <project>
node "<runtime>" worktree create --project <project> --id <task-id> --base <commit>
node "<runtime>" measure record --project <project> --input <measurement.json>
```

`task create` の `--acceptance` と `--scope` は必須で繰り返し可能。`--depends-on`、`--non-goal`、`--constraint`、`--reference` も繰り返し可能。`--spec-revision` は既定1。基点は明示したコミットを使う。

作成されるパケットは `docs/harness/tasks/<id>.json`。Markdown雛形は必要項目の説明であり、CLIのJSONパケットを重複してMarkdown保存する必要はない。未解決事項と進捗を補い、CLIが生成したフィールドを維持して更新する。CLIはタスク作成・読取・依存検証を支援するが、レビュー判定・状態更新・統合はエージェントが担当する。

全コマンドで `--home <temporary-home>` を指定すると隔離したホームを使える。通常は既存CODEX_HOMEまたは標準ホームから個人設定を解決する。プロジェクト設定は `.harness.json`。状態確認はファイルを作らない。task/worktree/measureは明示的な書込み操作であり、設定が許可する範囲のみ使用する。

計測入力はJSONオブジェクト。`task_id`、`run_id`、`condition`（`baseline` または `harness`）、タイムゾーン付きISO日時の `start` と `end` が必須。任意項目は `model_roles`、`corrections`、`completion`、`defects`、`usage_before`、`usage_after`、`window_before`、`window_after`、`overlap`。利用枠値は残量ではなく消費済み百分率（0–100）で、前後を同じ窓に揃える。重複なしを確認できた場合のみ `overlap=false`。未取得はnull。経過秒・比較可否・除外理由・比較可能な場合のアカウント消費差分はCLIが算出する。

## 配布と導入

Node.js 22以上。非公開GitHub Releaseから取得したコンパイル済みtarballを使う。実行時のPython・TypeScriptコンパイラ・追加npm依存は不要。

```sh
gh release download v0.2.0 --repo karladev001-eng/harness --pattern "*.tgz"
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness install
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness authoring install --project "/path/to/project"
```

`install` は個人用AGENTS.mdに恒久的な導入先のruntime.jsを参照する入口を登録する。`uninstall` は所有する入口とスキルのみ解除する。旧Python版schema-1 manifestも、ファイルと入口が未編集ならPythonを実行せず移行できる。

`authoring install|uninstall --project PATH` は独立した4スキルを `.agents/skills` に導入・更新・削除する。`--skill NAME` を繰り返すと対象を選べる。`--skills-dir PARENT` で個人用など別のスキル親ディレクトリを明示できる。所有manifestで確認できない既存フォルダや編集済みファイルは上書きしない。オーケストレーションの有効化やAGENTS.md変更は行わない。
