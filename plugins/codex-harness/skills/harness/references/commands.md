# 補助CLI

インストール済みスキルの `runtime.js` を直接実行できます。配布リポジトリでは、`npm run build` の後に `node dist/skill/runtime.js` が同じ入口になります。各コマンドの `--help` で現在の引数を確認します。

以下の `<runtime>` は、SKILL.mdと同じディレクトリにあるruntime.jsへのパスです。パスや自由文は、シェルに合わせて引用します。

```text
node "<runtime>" status --project <project>
node "<runtime>" doctor --project <project>
node "<runtime>" task create --project <project> --id <task-id> --goal <goal> --acceptance <criterion> --scope <owned-path> --base <commit>
node "<runtime>" task show --project <project> --id <task-id>
node "<runtime>" task validate --project <project>
node "<runtime>" worktree create --project <project> --id <task-id> --base <commit>
node "<runtime>" measure record --project <project> --input <measurement.json>
```

`task create` の `--acceptance` と `--scope` は必須で、繰り返し指定できます。`--depends-on`、`--non-goal`、`--constraint`、`--reference` も繰り返し指定できます。`--spec-revision` の既定は1です。基点には、明示したコミットを使います。

作成されるパケットは `docs/harness/tasks/<id>.json` です。Markdown雛形は必要項目の説明であり、CLIのJSONパケットをMarkdownで重複して保存する必要はありません。未解決事項と進捗を補い、CLIが生成したフィールドは維持したまま更新します。CLIはタスクの作成・読取と依存の検証を支援しますが、レビュー判定・状態更新・統合はエージェントが担当します。

どのコマンドでも `--home <temporary-home>` を指定すると、隔離したホームを使えます。指定しなければ、既存のCODEX_HOMEまたは標準ホームから個人設定を解決します。プロジェクト設定は `.harness.json` です。状態確認はファイルを作りません。task/worktree/measureは明示的な書込み操作で、設定が許可する範囲だけで使います。

計測入力はJSONオブジェクトです。必須は、`task_id`、`run_id`、`condition`（`baseline` または `harness`）、タイムゾーン付きISO日時の `start` と `end` です。任意項目は `model_roles`、`corrections`、`completion`、`defects`、`usage_before`、`usage_after`、`window_before`、`window_after`、`overlap` です。利用枠の値は残量ではなく消費済みの百分率（0–100）で、前後を同じ窓に揃えます。重複なしを確認できた場合だけ `overlap=false` にします。未取得はnullです。経過秒・比較可否・除外理由と、比較可能な場合のアカウント消費差分は、CLIが算出します。

## 配布と導入

Node.js 22以上が必要です。0.4.3では、既定の5スキルと任意追加のcodex-slide-planを、同じ非公開npmパッケージに収録しています。registryから取得するには、指定版の配布が完了していることと、packageへのアクセス権が必要です。PCごとにnpm login（classic PATのread:packagesとpackageアクセス権）を済ませてから、次を実行します。tokenは対話入力だけで渡し、チャット/リポジトリ/引数へ貼りません。

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness authoring install --project "/path/to/project"
```

初回も更新も同じコマンドです。確認は恒久runtimeのstatus/doctorで行います。版を固定するには@latestを配布済みの版に置き換え、解除するにはinstallをuninstallに置き換えます。取得に失敗した場合、CLIは実行されません。401/403なら認証と権限、404なら未配布・名前・版・権限、通信失敗なら接続を確認します。ホームでnpm ciは行いません。

現在は、配布元で作成したコンパイル済みtarballを対象PCへコピーして使えます。新規導入と旧版の更新は同じ `install` 操作です。GitHub Releaseの公開は前提にしません。実行時にPython・TypeScriptコンパイラ・追加のnpm依存は要りません。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.3.tgz codex-harness install
npx --yes --package ./karladev001-eng-codex-harness-0.4.3.tgz codex-harness authoring install --project "/path/to/project"
```

更新後は、`status` の `config.models` で設定の基準値を確認します。`model_selection` はmode/resolution/pinned_roles/pinsを返し、autoは解決をhost-launch時に行い、catalog_checked=falseです。statusは読取のみでネットワークを使わず、動的なモデル選択の結果は返しません。個人設定・プロジェクト設定と制作の好みは保持されます。明示したモデル設定は新しい既定を隠すので、新しい既定を使いたい項目だけ、利用者が上書きを削除します。

`install` は、個人用AGENTS.mdに、恒久的な導入先のruntime.jsを参照する入口を登録します。`uninstall` は、自分が所有する入口とスキルだけを解除します。旧Python版のschema-1 manifestも、ファイルと入口が未編集であれば、Pythonを実行せずに移行できます。

`authoring install|uninstall --project PATH` は、既定の5スキル（4つのMarkdownスキルとcodex-html-plan）を `.agents/skills` に導入・更新・削除します。`--skill NAME` を繰り返すと対象を選べます。任意追加の `codex-slide-plan` は、0.4.3のパッケージCLIから `--skill codex-slide-plan` を明示して導入します。0.4.3に固定したnpm/tgzの手順は[単独導入](../../../../../authoring-skills/INSTALL.md#codex-slide-planを任意追加する)にあります。指定なしのinstall/update/uninstallは、独立導入済みのオプションを変更しません。本体の通常のinstall/updateも、オプションを配置しません。

`--skills-dir PARENT` で、個人用など別のスキル親ディレクトリを明示できます。所有manifestで確認できない既存フォルダや、編集済みのファイルは上書きしません。オーケストレーションの有効化やAGENTS.mdの変更は行いません。オプションの導入元は恒久本体のruntimeにないため、install/updateは対応版のnpm/tgzから実行します。明示的なuninstallは、所有記録だけで行えます。旧本体内にあったオプションのコピーを移行するときは、所有記録に沿った未編集チェックとバックアップを適用し、独立導入や制作資料には触れません。PPTX/POTXの構造読取りだけは、Python 3を追加で使います。

設定の優先順は、既定 < 個人 < プロジェクトです。`improvement_loop` はbooleanで（既定true）、好み・技術的知見の自動読取・記録・適用・候補試用を制御します。OFFにしても保存済みの記憶は消さず、通常の修正は続けます。明示的な記憶管理は別操作です（persistence OFFなら永続記憶の読書きはしません）。`model_selection` はauto/fixedで（既定auto）、明示modelを持つ役割だけがpinになります。effortだけの上書きはpinにしません。旧4機能が全OFFで新キーが未指定なら、improvement_loop=falseを補完します。enabled=false、または5機能が全OFFの場合は、inactiveです。

## 制作の記憶

`preferences` の既定は `{ "repository": "", "branch": "main", "project_key": "", "autosave": false, "enabled": true }` です。未接続のlocalでは、従来の制作記憶を維持します。個人設定のrepository/branchとautosave=trueがそろうと、GitHub共有へ一回だけopt-inできます。keyは、明示した `project_key` を優先し、Git originの正規化と、非公開の `improvement/projects.json` の登録簿で共有します。non-Gitの場合は、registerが `.harness.json` に保存したkeyを、projectと一緒に持ち運びます。worktreeでは、共通checkoutの設定、固有設定の順に解決します。逆参照のないseparate Git dirは推測せず、core.worktreeでの解決を求めます。同じtarget/keyのcache・pending・排他は共有し、別projectには別のkeyを付けます。未登録や保存先不明の場合に、旧localの正本へ戻しません。

認証はそのPCの `gh` を使い、tokenを設定へ書きません。GitHub.comの非公開repositoryと、既存のbranchが必要です。公開repositoryへの送信は拒否します。statusは保存先のmetadataだけを返し、本文の読取・通信・書込はしません。未登録はunresolvedで、statusだけでは登録しません。

```text
node "<runtime>" preferences register --project <project> [--project-key <key>]
node "<runtime>" preferences read --project <project>
node "<runtime>" preferences write --project <project> --input <updated.md> --revision <read-token> [--kind create|update|correction|forget]
node "<runtime>" preferences sync --project <project>
node "<runtime>" preferences sync-all --project <project>
node "<runtime>" preferences migrate --project <project>
```

どの操作でも `--home PATH` を使えます。保存すべき根拠や変更がある初回だけ、register→read→write/migrateと進めます。開始時の検索やreadだけで、空のprojectを大量に登録しません。registerは既存のopt-in先へのproject登録で、新しいrepositoryの作成とは別です。明示keyでも、登録簿の衝突を確認します。`--offline true` は、read/write/syncの通信を止めます。migrateはremoteの確認が必要なので、オフラインでは止まります。

readは `content/revision/sha/fetched_at/freshness/pending` を返します。送信失敗・競合・キャッシュへのfallbackは `ok=false`・終了コード2です。初回の失敗では、本文も版もnullです。writeには必ずreadのrevisionを渡します。送信待ちの内容は、先にlocalへ保存します。readはpendingを送信せず、syncが再試行します。writeはUTF-8 Markdown全体（最大512 KiB）を置換し、項目や根拠IDの意味は親が点検します。local未設定では、欠損ファイルは空として扱い、同期はlocal readと同じです。

競合したときは、readが返す `remote_content/remote_sha` を確認し、再評価した本文を作って、`write ... --revision <current-local-token> --base-sha <observed-remote-SHA>` で明示的に再調整します。remoteが無い場合だけ `--base-sha missing` を使います。確認した後にさらにremoteが変わると、再び止まります。古い版の自動mergeは行いません。

sync-allは、登録済みtargetのpendingだけを再送します。元projectの現在のpolicyを再確認し、不在・OFF・target変更の場合は保留にします。内容が異なる旧pendingは消さず、競合を返します。任意のfolderや会話は収集しません。`ok/pending/failed/results` を確認し、保留・busy・部分成功を送信完了として扱いません。既存の毎時jobも、同じ入口を使います。

明示的なmigrateは、旧local原本を保持し、内容が異なる既存remoteを拒否します。保存先別のmigration markerと、project単位で本文を含まない `creative/legacy-retired.json` によって、旧原本の再取込を拒否します。draftとretirementを永続化した後にだけ送信し、retirementの保存に失敗した場合は、syncで先に再確保します。失敗結果はdiskにあるpendingを示します。pending=falseならmigrateを再試行します。設定済みの場合、旧localは自動では参照しません。移行後に保存先の設定を外すと、local read/write/syncはretiredエラーになります。その場合はGitHub設定を復元して、現在の正本を使います。別のtargetにも旧原本を再migrateすることはできないので、現在の正本から明示的にtransferします。

`enabled=false`・`persistence=false`・`preferences.enabled=false` のいずれかなら、明示的な管理も含めて、記憶の読書きと通信を止めます。improvement_loop OFFは、自動処理を止めます。GitHub接続時のautosave=falseは、自動のread/write、lesson検索、再送を保留しますが、明示keyによる手動管理は維持します。公開CLIに `--automatic` は無いため、エージェントは通信の前にstatusの実効設定を判定します。measurementは独立しています。詳細は[制作改善](creative-loop.md)と[技術的知見](technical-lessons.md)を参照します。

## 技術的な修正の記憶

GitHub上の正本は `improvement/projects/<project_key>/lessons/<id>.json` です。未接続の場合は、local_rootの `lessons/<id>.json` を明示的に管理できます。初回取得の失敗を空として扱わないこと、read revision→writeの契約、OFFの境界は、preferencesと同じです。

```text
node "<runtime>" lessons search --project <project> --query <text> --limit 3
node "<runtime>" lessons read --project <project> --id <id>
node "<runtime>" lessons write --project <project> --input <lesson.json> --revision <read-token> [--kind create|update|correction]
node "<runtime>" lessons forget --project <project> --id <id> --revision <read-token>
node "<runtime>" lessons sync --project <project> --id <id>
```

必須項目は、schema_version=1、id、cause、remedy、verification/scope/sources（空でない文字列の配列）、タイムゾーン付きのrecorded_at、evaluation（unknown/accepted/rejected）です。確定した評価には、evaluation_sourcesも必須です。検索にはGitHub接続が必要で、limitは1–10、名前順で最大20ファイルを確認する文字検索です。必要な少数だけを取得し、検索ではok=true/freshness=fresh、個別readではpending=falseのものだけを自動適用します。local/cached/stale/pendingはfreshとして扱いません。lessonの訂正writeとforgetにも、`--offline true` / `--base-sha SHA|missing` を使えます。lessonで競合したときは、対象の現在のremoteを個別に確認し、曖昧なmergeは親へ戻します。

GitHubのcommit metadataは、schema_version/project_key/operation_id/kind/record_kind/recorded_atです。kindはcreate/update/correction/forget/migrate/registerで、本文のjournalは別に保存しません。再送は同じoperation IDを使い、同じ内容なら重複したcommitを作りません。元のID・日付・unknownは保持し、移行を新規獲得や品質向上に換算しません。成長dashboard本体は対象外です。訂正と忘却は、現在の正本・cache・pending・検索には反映しますが、Git履歴の完全消去は別操作です。旧原本やGit履歴を通常に閲覧する場合でも、取り消した内容を勝手に復活させません。
