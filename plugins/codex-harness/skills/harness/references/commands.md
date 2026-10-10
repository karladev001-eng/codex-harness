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

Node.js 22以上。GitHub Packages非公開npm配布は準備中。配布開始後はPCごとにnpm login（classic PATのread:packagesとpackageアクセス権）を済ませ、次を実行する。tokenは対話入力のみとし、チャット/リポジトリ/引数へ貼らない。

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness authoring install --project "/path/to/project"
```

初回・更新は同じコマンド。確認は恒久runtimeのstatus/doctor、版固定は@latestを配布済み版へ置換、解除はinstallをuninstallへ置換する。取得失敗ではCLIは実行されない。401/403は認証/権限、404は未配布/名前/版/権限、通信失敗は接続を確認し、ホームでnpm ciは行わない。

現在は配布元で作成したコンパイル済みtarballを対象PCへコピーして使える。新規導入と旧版更新は同じ `install` 操作。0.4.2のGitHub Release公開は前提にしない。実行時のPython・TypeScriptコンパイラ・追加npm依存は不要。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.2.tgz codex-harness install
npx --yes --package ./karladev001-eng-codex-harness-0.4.2.tgz codex-harness authoring install --project "/path/to/project"
```

更新後の `status` の `config.models` で設定基準値を確認する。`model_selection` はmode/resolution/pinned_roles/pinsを返し、autoはhost-launch時の解決、catalog_checked=falseである。statusは読取のみ・ネットワークなしで、動的なモデル選択結果を返さない。個人設定・プロジェクト設定と制作の好みは保持され、明示モデル設定は新しい既定を隠す。新しい既定を使う項目だけ利用者が上書きから削除する。

`install` は個人用AGENTS.mdに恒久的な導入先のruntime.jsを参照する入口を登録する。`uninstall` は所有する入口とスキルのみ解除する。旧Python版schema-1 manifestも、ファイルと入口が未編集ならPythonを実行せず移行できる。

`authoring install|uninstall --project PATH` は独立した6スキル（4つのMarkdownスキルとHTML pack runtimeを持つcodex-html-plan、codex-slide-plan）を `.agents/skills` に導入・更新・削除する。現在配布中の0.4.2 tarballにはcodex-slide-planがないため、checkoutから導入する。`--skill NAME` を繰り返すと対象を選べる。`--skills-dir PARENT` で個人用など別のスキル親ディレクトリを明示できる。所有manifestで確認できない既存フォルダや編集済みファイルは上書きしない。オーケストレーションの有効化やAGENTS.md変更は行わない。

設定は既定 < 個人 < プロジェクト。`improvement_loop` はboolean（既定true）で好みの自動読取・記録・適用・候補試用を制御する。OFFは保存済み記憶を消さず通常の修正を続け、明示的な記憶管理は別操作（persistence OFFなら永続記憶読書きなし）。`model_selection` はauto/fixed（既定auto）。明示modelのある役割だけpinになり、effortだけの上書きはpinにしない。旧4機能全OFFかつ新キー未指定はimprovement_loop=falseを補完する。enabled=falseまたは5機能全OFFはinactive。

## 制作の記憶

設定の `preferences` は `{ "repository": "owner/private-repo", "branch": "main", "project_key": "shared-project" }`。repositoryとproject_keyの両方が空なら従来のローカル保存。同一プロジェクトの端末では同じ3値を使い、別プロジェクトは別keyにする。認証はそのPCの `gh` を使い、tokenを設定へ書かない。GitHub.comの非公開repositoryと既存branchが必要。公開repositoryへの送信は拒否する。statusは保存先のmetadataのみ返し、本文の読取・通信・書込をしない。

```text
node "<runtime>" preferences read --project <project>
node "<runtime>" preferences write --project <project> --input <updated.md> --revision <read-token>
node "<runtime>" preferences sync --project <project>
node "<runtime>" preferences migrate --project <project>
```

全操作に `--home PATH` が使える。`--offline true` はread/write/syncの通信を止める。migrateはremote確認が必要なのでオフラインでは止まる。readは `content/revision/sha/fetched_at/freshness/pending` を返す。送信失敗・競合・キャッシュへのfallbackは `ok=false`・終了コード2。初回失敗は本文・版ともnull。writeは必ずreadのrevisionを渡し、送信待ちはlocalへ先に保存する。readはpendingを送信せず、syncが再試行する。writeはUTF-8 Markdown全体（最大512 KiB）を置換し、項目・根拠IDの意味はエージェントが点検する。local未設定では欠損ファイルが空、同期はlocal readと同じ。

競合時はreadに返る `remote_content/remote_sha` を確認して再評価した本文を作り、`write ... --revision <current-local-token> --base-sha <observed-remote-SHA>` で明示的に再調整する。remoteが無い場合だけ `--base-sha missing`。確認後さらにremoteが変われば再び止まる。古い版の自動mergeは行わない。

明示migrateは旧local原本を保持し、異なる既存remoteを拒否し、保存先別migration markerとproject単位の本文なし `creative/legacy-retired.json` で旧原本の再取込を拒否する。draftとretirementを永続化した後だけ送信し、retirement保存失敗時はsyncで先に再確保する。失敗結果はdiskのpendingを示し、pending=falseならmigrateを再試行する。設定済みでは旧localを自動参照しない。移行後に保存先設定を外すとlocal read/write/syncはretiredエラーになる。GitHub設定を復元して現在の正本を使う。別targetにも旧原本を再migrateできないので、現在の正本から明示transferする。忘却では現在のcache/pending/正本を訂正するが、Git履歴の完全消去は別操作。詳細は[制作改善ループ](creative-loop.md)。`persistence=false` は全記憶の読書き・通信を止め、`improvement_loop=false` でも明示管理が可能、measurementは独立。
