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

Node.js 22以上。0.4.3では既定5スキルと任意追加のcodex-slide-planを同じ非公開npmパッケージに収録する。registry取得には指定版の配布完了とpackageアクセス権が必要。PCごとにnpm login（classic PATのread:packagesとpackageアクセス権）を済ませ、次を実行する。tokenは対話入力のみとし、チャット/リポジトリ/引数へ貼らない。

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness authoring install --project "/path/to/project"
```

初回・更新は同じコマンド。確認は恒久runtimeのstatus/doctor、版固定は@latestを配布済み版へ置換、解除はinstallをuninstallへ置換する。取得失敗ではCLIは実行されない。401/403は認証/権限、404は未配布/名前/版/権限、通信失敗は接続を確認し、ホームでnpm ciは行わない。

現在は配布元で作成したコンパイル済みtarballを対象PCへコピーして使える。新規導入と旧版更新は同じ `install` 操作。GitHub Release公開は前提にしない。実行時のPython・TypeScriptコンパイラ・追加npm依存は不要。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.3.tgz codex-harness install
npx --yes --package ./karladev001-eng-codex-harness-0.4.3.tgz codex-harness authoring install --project "/path/to/project"
```

更新後の `status` の `config.models` で設定基準値を確認する。`model_selection` はmode/resolution/pinned_roles/pinsを返し、autoはhost-launch時の解決、catalog_checked=falseである。statusは読取のみ・ネットワークなしで、動的なモデル選択結果を返さない。個人設定・プロジェクト設定と制作の好みは保持され、明示モデル設定は新しい既定を隠す。新しい既定を使う項目だけ利用者が上書きから削除する。

`install` は個人用AGENTS.mdに恒久的な導入先のruntime.jsを参照する入口を登録する。`uninstall` は所有する入口とスキルのみ解除する。旧Python版schema-1 manifestも、ファイルと入口が未編集ならPythonを実行せず移行できる。

`authoring install|uninstall --project PATH` は既定5スキル（4つのMarkdownスキルとcodex-html-plan）を `.agents/skills` に導入・更新・削除する。`--skill NAME` を繰り返すと対象を選べる。任意追加の `codex-slide-plan` は0.4.3のパッケージCLIから `--skill codex-slide-plan` を明示する。0.4.3に固定したnpm/tgz手順は[単独導入](../../../../../authoring-skills/INSTALL.md#codex-slide-planを任意追加する)へ。指定なしのinstall/update/uninstallは独立導入済みオプションを変更しない。本体の通常install/updateもオプションを配置しない。

`--skills-dir PARENT` で個人用など別のスキル親ディレクトリを明示できる。所有manifestで確認できない既存フォルダや編集済みファイルは上書きしない。オーケストレーションの有効化やAGENTS.md変更は行わない。オプションの導入元は恒久本体runtimeにないため、install/updateは対応版のnpm/tgzから実行する。明示uninstallは所有記録だけで行える。旧本体内のオプションコピーの移行では所有記録に沿う未編集チェック・バックアップを適用し、独立導入や制作資料には触れない。PPTX/POTX構造読取りだけはPython 3を追加で使う。

設定は既定 < 個人 < プロジェクト。`improvement_loop` はboolean（既定true）で好み・技術的知見の自動読取・記録・適用・候補試用を制御する。OFFは保存済み記憶を消さず通常の修正を続け、明示的な記憶管理は別操作（persistence OFFなら永続記憶読書きなし）。`model_selection` はauto/fixed（既定auto）。明示modelのある役割だけpinになり、effortだけの上書きはpinにしない。旧4機能全OFFかつ新キー未指定はimprovement_loop=falseを補完する。enabled=falseまたは5機能全OFFはinactive。

## 制作の記憶

`preferences` の既定は `{ "repository": "", "branch": "main", "project_key": "", "autosave": false, "enabled": true }`。未接続localは従来の制作記憶を維持する。個人設定のrepository/branchとautosave=trueでGitHub共有へ一回opt-inできる。明示project_keyを優先し、Git originの正規化と非公開 `improvement/projects.json` の登録簿でkeyを共有する。non-Gitはregisterが `.harness.json` へ保存したkeyをprojectと一緒に持ち運ぶ。worktreeは共通checkout設定→固有設定の順。逆参照の無いseparate Git dirは推測せずcore.worktree解決を求める。同じtarget/keyのcache・pending・排他を共有し、別projectは別keyにする。未登録や保存先不明を旧local正本へ戻さない。

認証はそのPCの `gh` を使い、tokenを設定へ書かない。GitHub.comの非公開repositoryと既存branchが必要。公開repositoryへの送信は拒否する。statusは保存先のmetadataのみ返し、本文の読取・通信・書込をしない。未登録はunresolvedであり、statusだけで登録しない。

```text
node "<runtime>" preferences register --project <project> [--project-key <key>]
node "<runtime>" preferences read --project <project>
node "<runtime>" preferences write --project <project> --input <updated.md> --revision <read-token> [--kind create|update|correction|forget]
node "<runtime>" preferences sync --project <project>
node "<runtime>" preferences sync-all --project <project>
node "<runtime>" preferences migrate --project <project>
```

全操作に `--home PATH` が使える。保存すべき根拠・変更がある初回だけregister→read→write/migrateと進み、開始時の検索/readだけで空projectを大量登録しない。registerは既存opt-in先のproject登録で、新repository作成とは別。明示keyも登録簿の衝突確認を行う。`--offline true` はread/write/syncの通信を止める。migrateはremote確認が必要なのでオフラインでは止まる。readは `content/revision/sha/fetched_at/freshness/pending` を返す。送信失敗・競合・キャッシュへのfallbackは `ok=false`・終了コード2。初回失敗は本文・版ともnull。writeは必ずreadのrevisionを渡し、送信待ちはlocalへ先に保存する。readはpendingを送信せず、syncが再試行する。writeはUTF-8 Markdown全体（最大512 KiB）を置換し、項目・根拠IDの意味は親が点検する。local未設定では欠損ファイルが空、同期はlocal readと同じ。

競合時はreadに返る `remote_content/remote_sha` を確認して再評価した本文を作り、`write ... --revision <current-local-token> --base-sha <observed-remote-SHA>` で明示的に再調整する。remoteが無い場合だけ `--base-sha missing`。確認後さらにremoteが変われば再び止まる。古い版の自動mergeは行わない。

sync-allは登録済みtargetのpendingだけを再送する。元projectの現在policyを再確認し、不在/OFF/target変更は保留、異なる旧pendingは消さず競合を返す。任意folderや会話を収集しない。`ok/pending/failed/results` を確認し、保留・busy・部分成功を送信完了にしない。既存毎時jobも同じ入口を使う。

明示migrateは旧local原本を保持し、異なる既存remoteを拒否し、保存先別migration markerとproject単位の本文なし `creative/legacy-retired.json` で旧原本の再取込を拒否する。draftとretirementを永続化した後だけ送信し、retirement保存失敗時はsyncで先に再確保する。失敗結果はdiskのpendingを示し、pending=falseならmigrateを再試行する。設定済みでは旧localを自動参照しない。移行後に保存先設定を外すとlocal read/write/syncはretiredエラーになる。GitHub設定を復元して現在の正本を使う。別targetにも旧原本を再migrateできないので、現在の正本から明示transferする。

`enabled=false`・`persistence=false`・`preferences.enabled=false` は明示管理も含め記憶の読書き・通信を止める。improvement_loop OFFは自動処理を停止。GitHub接続時のautosave=falseは自動read/write/lesson検索/再送を保留するが、明示keyの手動管理は維持する。公開CLIに `--automatic` は無いため、エージェントは通信前にstatusの実効設定を判定する。measurementは独立。詳細は[制作改善](creative-loop.md)と[技術的知見](technical-lessons.md)。

## 技術的な修正の記憶

GitHub正本は `improvement/projects/<project_key>/lessons/<id>.json`。未接続ではlocal_rootの `lessons/<id>.json` を明示管理できる。初回取得失敗を空にせず、read revision→writeの契約とOFF境界はpreferencesと同じ。

```text
node "<runtime>" lessons search --project <project> --query <text> --limit 3
node "<runtime>" lessons read --project <project> --id <id>
node "<runtime>" lessons write --project <project> --input <lesson.json> --revision <read-token> [--kind create|update|correction]
node "<runtime>" lessons forget --project <project> --id <id> --revision <read-token>
node "<runtime>" lessons sync --project <project> --id <id>
```

schema_version=1、id、cause、remedy、verification/scope/sources（空でない文字列配列）、timezone付きrecorded_at、evaluation（unknown/accepted/rejected）が必須。確定評価にはevaluation_sourcesも必須。検索はGitHub接続が必要でlimitは1–10、名前順で最大20ファイルを確認する文字検索。必要な少数だけ取得し、ok=true/freshness=fresh、個別readはpending=falseだけを自動適用する。local/cached/stale/pendingをfreshとしない。lessonの訂正writeとforgetにも `--offline true` / `--base-sha SHA|missing` が使える。lesson競合では対象の現在remoteを個別に確認し、曖昧なmergeは親へ戻す。

GitHub commit metadataはschema_version/project_key/operation_id/kind/record_kind/recorded_at。kindはcreate/update/correction/forget/migrate/registerで、本文journalを別保存しない。再送は同じoperation ID、同内容は重複commitを作らない。元ID/日付/unknownを保持し、移行を新規獲得や品質向上へ換算しない。成長dashboard本体は対象外。訂正・忘却は現在の正本/cache/pending/検索へ反映するがGit履歴の完全消去は別操作。旧原本・Git履歴の通常閲覧でも取消内容を勝手に復活させない。
