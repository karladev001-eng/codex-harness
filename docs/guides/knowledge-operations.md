# Knowledgeの同期・説明生成・定期実行

必要な機能だけ個別に設定します。本体導入はhookやOSスケジュールを登録しません。検索だけなら説明生成・定期実行は不要です。[保存先・認証](knowledge-base.md)と[検索](search.md)を先に確認してください。

## command hooks・生成・共有

Codexのcommand hooksへ次のコマンドで登録できます。`--file` は使うhooks.jsonを明示し、Node/CLI/stateは絶対パスです。既存ORCA等のentryを保持し、所有する同じentryだけを登録/解除します。定義の破損や競合時は停止します。

```sh
node "/absolute/path/knowledge/cli.cjs" hooks --action install --file "/absolute/path/hooks.json" --node "/absolute/path/node" --state "/absolute/path/state"
node "/absolute/path/knowledge/cli.cjs" hooks --action status --file "/absolute/path/hooks.json" --state "/absolute/path/state"
node "/absolute/path/knowledge/cli.cjs" hooks --action remove --file "/absolute/path/hooks.json" --state "/absolute/path/state"
```

SessionStartの`startup|resume`とUserPromptSubmitへ `async=true`、timeout10秒のpullを登録します。通常stdout/stderrは空です。背景同期は説明生成を行いません。Git hook、OSの常駐fetch、PreToolUseの架空検索matcherも登録しません。Codex側の信頼確認は別であり、ツールは `trusted_hash` を生成/更新しません。新しいhook定義をCodexで信頼する必要があります。MacはPOSIX引用、Windowsは二重引用と危険なcmd文字の拒否を使います。Windows生成は `--platform win32` で確認できます。

説明は既存のChatGPTログインを使うCodex CLIで生成します。CLI実行ファイルとmodelを明示します。例のmodelは実際に利用できる名前へ置き換えてください。

```sh
node "/absolute/path/knowledge/cli.cjs" analyze --codex "/absolute/path/codex" --model gpt-6.1-sol --limit 2 --publish --state "/absolute/path/state"
node "/absolute/path/knowledge/cli.cjs" publish-analysis --limit 5 --state "/absolute/path/state"
```

`analyze` はまず最新化を試み、変更された入力/recipeだけを生成します。既定は5capture/回（最大20）、componentごと120秒（`--timeout`で1〜300秒）、本文/メモ/取得詳細を合わせUTF-8 100KB以内。画像は保存JPEGを実際に添付した別生成で、メモ変更だけでは再実行しません。入力hashは切り詰め前の資料全体から作り、切り詰めを説明の不足として強制記録します。取得本文の指示は操作指示として実行しません。Codexは隔離cwd・read-only・ephemeral・ignore-user-config・no-daemonで動き、hooksや不要なtool/アプリ/skill探索を無効にします。schemaとJSONLを検証し、tool呼出や不完全なturnを成功と扱いません。共有componentの `tool_calls: 0` は実adapterで確認した値です。秘密・入力本文・生のproviderログは出力/永続ログへ書きません。

ローカルの `analysis/` は生成済componentと送信待ちの耐久領域です。中断後に完了componentを再利用し、完成した未確定状態は送信待ちへ復旧します。`publish-analysis` は現在のGitHubhead・schema・capture各blobを再確認し、`analysis.json` 一つだけを追加/更新するnonforce commitを作ります。変更/削除済captureや別の解析変更への衝突はpendingを保持します。ref競合/応答紛失は現在headで確認し直すため、再試行に再生成は不要です。別PCが同じ入力/recipeの解析を共有済みなら、その解析を取得して使います。

読み取り/生成/共有はPC内の同じrepo/branch/library lock、hooks編集はさらに対象hooksファイルのlockで排他します。ownerを完成してからatomic hard-linkでlockを取得し、終了済PIDのlockだけを排他的な番号ticketで回収します。ticket番号は使い回しません。通常競合はbusyを返します。hook同期は全体8.5秒、手動同期は60秒の期限があり、期限後にsnapshotを切り替えません。subprocess timeoutは子孫も停止し、継承pipeで待ち続けません。fetchごとに新しい隔離bare repositoryを使い、検証済みsnapshotだけをatomicに切り替えます。fetch中断/timeout/検証失敗では旧snapshotを保持し、中断したrepositoryを次回fetchへ再利用しません。未知のGit lockは自動削除しません。取得失敗はrepository/fetch/validation/snapshot段階と安全なreasonを示し、生stderr・認証情報は残しません。初回の巨大catalogがhook期限内に処理できないときは一度 `pull --force` を実行してください。現在の上限は1000capture、読み取る差分32MiB、全snapshot48MiBです。破損/未知lockやcache configは消さずに停止します。

毎時の説明生成には、以下のMac LaunchAgentからsessionless runnerを実行します。初回生成担当を一台に絞り、他PCはhook同期で共有済解析を取得する運用です。[設計と制限](../adr/0005-knowledge-sync-analysis.md)に責任分界を記録しています。

Git Data APIでblob群→base_tree付きtree→一つのcommit→ref更新（force=false）。private/既存branch/schema/libraryを検証して、他PC変更を取り込んだheadから再試行します。曖昧な更新応答は、refと操作receipt/保存ファイルを読み直して確認します。3回の更新で確認できなければpending。未知schema/壊れたitem/既存capture衝突/不完全なtreeはpendingとして停止します。mainのbranch保護規則が書込を禁じる場合もpendingになります。

## Macでチャットを増やさず毎時実行

Node22+の `background.cjs` は同じ配布先のruntimeで `preferences sync-all` を先に実行し、続いて `cli.cjs analyze` をshellなしで起動します。再送は最大5分、全体は共通30分期限です。登録済みpreferences/lessonのpendingだけを扱い、元projectの現在policyが確認不能/OFF/target変更なら保留します。任意フォルダの探索や全会話送信は行いません。説明生成に失敗しても再送は独立に試されます。モデルは `gpt-6.1-sol`、limit5、publishありに固定し、既存providerの `--no-daemon exec --ephemeral` を維持します。Codexアプリの定期チャットや外側のLLMターンを作りません。ログイン済みCodex CLIとgh、設定済みのstateが必要です。登録は一台に限ります。同じ処理を行う既存の定期実行がある場合は、重複実行しないよう停止してから登録してください。

```sh
"/absolute/path/node" "/absolute/path/skill/knowledge/background.cjs" --state "/absolute/path/state" --codex "/absolute/path/codex"
```

全体の期限は30分、期限時にCLIへSIGTERMを送り、CLIの既存キャンセル処理でprovider/Git等の子プロセスも停止します。1秒後に残ったCLIのprocess groupを強制停止します。stdout/stderrはログへ保存しません。終了コード0は成功またはbusy/変更なし、1は失敗/未完了です。JSONの生成failed、publish pending、offlineも検出します。生成結果のpendingは同じ回のpublish sent/reusedで解決した場合に成功です。busyによって未送信分が残ればpublish_pendingとして次回に再試行します。

最新一件だけをstateの `background/last-run.json` にschema_version=2、mode0600・atomic renameで保存します。analysisとsyncを分けて保存し、syncにpending/失敗/保留が残れば、analysisが成功でもtop stateはsync_pending、終了コード1です。開始/終了時刻、状態、件数、一般化したreason、通知状態だけで、資料本文、capture ID、認証情報、生のCLI出力は保存しません。stateまでのsymlink、backgroundや出力ファイルのsymlink、出力hardlink、他ユーザー所有/書込可能なbackgroundを拒否します。既存の未知lockを削除しません。拒否時は非0終了で既存ファイルを保持し、固定の起動/状態保存失敗通知を一度だけ試みます。安全に保存できない場合は別の保存先へ迂回しません。状態を書けない場合にはlast-runが古いままになるためlaunchctlの終了状態も確認してください。通常の失敗通知を既に試みた回は重複通知しません。

失敗/未完了は `background/episodes.json` の処理段階・正規化reason・不透明target IDで障害episodeを識別し、初回だけ `/usr/bin/osascript` で一般的なMac通知を試みます。同じ障害が続く間は抑制し、初回/直近時刻・抑制回数を更新します。原因やtargetが変われば新しいepisodeです。対象段階の正常完了だけが解除し、busy/一部成功/未実行は復旧に数えません。CLIの変更なし成功はそのCLI段階だけを解除します。復旧後の再発は再び初回通知します。

通知を排他的に予約して並行jobの重複を防ぎ、通知コマンド失敗時は同じepisodeを24時間に最大一度再試行します。本文・エラー原文は通知/episodeに含めません。通知状態はpending/sent/failed/unsupported、試行不要はnot_neededです。sentはコマンド成功で、通知許可・集中モード・ログイン状態による表示は保証しません。通知抑制/失敗で主処理やpendingを成功にしません。通知stateの安全性/保存を確認できないときは永続的な抑制を保証せず、固定の起動/状態保存失敗通知と非0終了を維持します。

`background.cjs` の限定 `plist({node,runner,state,codex})` helperでLaunchAgent XMLを生成できます。全pathは絶対path、CLIはrunnerと同じディレクトリに固定します。次の例のpathを配布済みの恒久pathへ置き換えてください。helperは登録操作を行いません。`wx` は既存plistの上書きを拒否します。既存jobが同じlabelを使っていないことを先に確認してください。

```sh
launchctl print "gui/$(id -u)/com.codex-harness.knowledge-analysis"
"/absolute/path/node" - <<'JS'
const fs = require('node:fs');
const {plist} = require('/absolute/path/skill/knowledge/background.cjs');
const xml = plist({node:'/absolute/path/node', runner:'/absolute/path/skill/knowledge/background.cjs', state:'/absolute/path/state', codex:'/absolute/path/codex'});
fs.writeFileSync(process.env.HOME+'/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plist', xml, {flag:'wx', mode:0o600});
JS
plutil -lint "$HOME/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plist"
launchctl kickstart "gui/$(id -u)/com.codex-harness.knowledge-analysis"
launchctl print "gui/$(id -u)/com.codex-harness.knowledge-analysis"
cat "/absolute/path/state/background/last-run.json"
# 現在のログインセッションで停止（plistが残ると次回ログインで再読込されます）。
launchctl bootout "gui/$(id -u)/com.codex-harness.knowledge-analysis"
```

恒久的に解除する場合はbootout後、この手順で自分が作成したplistだけを確認してLaunchAgents外へ退避します。`mv -i` は退避先の上書き前に確認します。再開時はplistを戻し、bootstrapします。

```sh
plutil -p "$HOME/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plist"
launchctl bootout "gui/$(id -u)/com.codex-harness.knowledge-analysis"
mkdir -p "$HOME/Library/Application Support/CodexHarness/disabled-launchagents"
mv -i "$HOME/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plist" "$HOME/Library/Application Support/CodexHarness/disabled-launchagents/com.codex-harness.knowledge-analysis.plist"
```

すでにbootout済みなら二度目のbootoutの「見つからない」結果を確認して退避へ進みます。plistをLaunchAgents外へ移した後は、次回ログインでもこのjobは自動登録されません。別のjobやKnowledge状態は削除しません。

LaunchAgentはログインユーザー権限、StartInterval3600、ProcessType Background、RunAtLoad=false、stdin/stdout/stderr=/dev/nullです。PATHは `/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`。Node/runner/codex/stateはProgramArgumentsの絶対pathを使い、開発checkoutやshellの設定に依存しません。NodeまたはCodex実行ファイルの更新でpathが変わった場合は停止してpathを見直します。PCスリープ/ログアウト中や既に実行中のtickの実行は保証されません。アプリの既存チャットを削除/アーカイブする機能はありません。
## 検証範囲

fake GitHub/Ghと一時ホームで通常保存、再起動、応答紛失、再保存、同時ref変更、schema/private/offline/破損、framing/origin、配布物、拡張の状態を検証。実DOM fixturesでは一般ページのHTML除去、YouTube、GitHub、Xの対象/引用/不在/UTF8を確認します。Chrome154の実DOM fixture10件が成功。popupはmock Chrome APIによる実ブラウザ表示/操作で、取得・メモ/タグ・保存済み・PC送信待ち・接続エラー・制限ページからの復帰を確認。

右下パネル用fixture `tests/fixtures/knowledge-panel.html` はmock transportのみで、通常のブラウザ操作・フォーカス・キーボード保存・閉じる/再表示・撮影時の非表示を確認できます。fixtureのShadowRootはブラウザ操作検証用にのみopenへ置き換え、製品ではclosed固定です。session偽造・他frame/document/tab・同URLリロード・重複保存・worker再起動・取得失敗時の表示復元は自動回帰テストで確認します。SPA移動後の旧sender URLと新session、未送信入力の引継ぎ、再表示による取得復旧、待機中retryの移動拒否もmock API/DOMで検証します。

上記は拡張実装時の隔離試験の範囲です。その時点ではユーザー環境への登録・外部保存を行わず、実GitHub書込、実Chrome拡張としてのコマンド配送/注入→native連携、Windows実機、実サービスの現在のDOMでの網羅取得は検証対象外でした。その後の現機への導入・資料保存・生成説明の共有確認は`docs/harness/tasks/activate-knowledge-memory.md`（source checkoutの現機導入記録）を参照してください。

参照: [runtime/MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)、[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[isolated world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds)（パネル移動対策の確認日2026-10-07）、[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[tabs/captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Git Data refs](https://docs.github.com/en/rest/git/refs)、[trees](https://docs.github.com/en/rest/git/trees)、[gh api](https://cli.github.com/manual/gh_api)、[Windows launcher実装](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/extensions/api/messaging/launch_context.h)。確認日2026-10-04。

[Knowledge索引](../../knowledge/README.md)・[Chrome拡張](../../knowledge/extension/README.md)・[検証記録](../../VALIDATION.md)
