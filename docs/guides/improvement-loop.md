# 修正の記録を保存して次回に使う

制作指針はユーザーの発言を根拠とする記憶です。保存資料の本文や画像、検索回数はそのまま好みの根拠にはなりません。

```text
ユーザーのフィードバック → 根拠を記録 → 候補/継続指針を区別
         → 適用する用途を確認 → 次回の依頼と照合 → 評価を更新
```

| 依頼例 | 扱い |
| --- | --- |
| 「今回は前置きを削って」 | 今回限り。次回の指針にはしない |
| 「今後、社内報告は結論から」 | 社内報告に限った継続指針 |
| 「次は別の雰囲気を試して」 | 保存した作風を固定せず、今回の探索を優先 |
| 評価がない | unknown。採用・成功・改善を推測しない |

## 技術的な修正の再利用

通常のコード修正では、開始時に関連する少数のlessonを検索して適用条件を確認し、完了時に原因・対策・実際の検証・範囲・出所が揃った修正だけを記録します。機能を実装しただけではlessonやユーザー肯定を作りません。根拠のない場合は新規記録なしとし、変更も既知pendingも無ければ保存担当を起動しません。詳細は[技術的知見の手順](../../plugins/codex-harness/skills/harness/references/technical-lessons.md)。制作指針の観察/候補/指針とは記録種別とIDを分けます。

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" lessons search --project "/path/to/project" --query "関連語" --limit 3
node "$HOME/.agents/skills/codex-harness/runtime.js" lessons read --project "/path/to/project" --id "LESSON_ID"
```

GitHub接続時はfresh取得したものだけを自動適用し、個別readではpending=falseも確認します。古いcache・競合・送信待ちは自動適用せず、現在の依頼で修正を続けます。全projectの本文や会話は自動注入/送信しません。

## 自動適用と保存

`improvement_loop=true` のとき、UI・文書などの制作開始時に、このプロジェクトに対応する保存済みの有効な指針と現在の依頼を照合します。修正時は発言を根拠として観察し、単発の修正は候補、明示的な継続希望は用途を限った指針にします。候補は範囲が合えば次回に暫定試用できますが、「今回限り」の指定は次回に持ち越しません。推測した好みは、別の作品や会話から独立した根拠が反復するまで昇格させません。完了時にユーザーの評価を区別して記録し、次回の開始時に適用を見直します。無反応やエージェント自身の評価は成功の証拠にしません。探索や別案を求められたら作風を固定せず、現在の指示を優先します。

未設定時の保存先は `status.local_root/creative/preferences.md` です。`preferences read/write/sync` 経由で読み書きし、GitHub保存先を設定すると非公開リポジトリの小さなMarkdown一ファイルを端末間で共有できます。最初は空で、プロフィール入力は不要です。好みを確認・訂正・忘却したいときは、Codexにそのまま「覚えている制作の好みを見せて」「この指針を訂正して」「この好みを忘れて」と依頼できます。忘却時はその好みを再生成できる保存済み観察も削除します。同時更新・保存失敗・参照切れの扱いは[制作改善ループ](../../plugins/codex-harness/skills/harness/references/creative-loop.md)に記載しています。長期的な改善効果はまだ検証していません。

保存すべき根拠・更新や既知pendingの再同期があるときは、active/persistence/improvement_loop/preferences.enabled/delegationが有効（GitHub接続時はautosave ON）なら[記録管理担当（record-keeper）](../../plugins/codex-harness/skills/harness/references/roles/record-keeper.md)へ既定で委譲します。無変更では起動しません。親が根拠・対象・最終判断を持ち、同じproject/保存先を更新する担当は一人に直列化します。既存 `standard`（Sol/medium）とpin/auto規則を使う指示ベースの経路で、runtimeによる自動spawnやホストagent登録ではありません。明示管理はloop OFFでも可能、delegation OFFは親が同じ契約で実行、persistence OFFは起動と記憶の読書きを止めます。子を起動できなければ制約を報告して親が担当するか現在依頼を続け、未保存・未送信は完了扱いしません。通常保存ごとの再承認は不要です。

純粋なクリエイティブ依頼にはGit工程やコード用の委譲を要求しません。コードを含む制作には既存の実装・レビュー工程も適用します。`review` の設定はコード作業で引き続き有効です。

### GitHubで制作の記憶を共有する

既定配布は未接続（repository/keyは空、autosave=false、preferences.enabled=true）で、従来のlocal制作記憶を使えます。GitHub共有を使う人は、Node.js 22+、GitHub CLIと非公開repository/既存branchへの権限を用意し、`gh auth login --hostname github.com` で認証します。個人設定 `~/.agents/harness/settings.json`（HARNESS_HOME指定時はその配下。保存先は[設定](configuration.md)を参照）へ既存項目を残して次を一度設定します。tokenは書きません。以下のrepositoryは今回承認された保存先です。別利用者は自分が権限を持つ非公開保存先へ置き換えます。

```json
{
  "preferences": {
    "repository": "karladev001-eng/harness-knowledge-base",
    "branch": "main",
    "autosave": true
  }
}
```

project設定が個人設定より優先します。既存の明示project_keyは保持。Gitは認証部分を除いたoriginを正規化し、private登録簿 `improvement/projects.json` で安定keyへ対応させます。SSH/HTTPSと末尾.gitの差は吸収し、GitHubでは大小文字を揃えます。fork/別origin/改名を推測で統合しません。同じGit repositoryのworktreeは共通checkoutの `.harness.json` を継承し、固有上書きを優先します。non-Git/originなしは初回registerが作る `.harness.json` のkeyを持ち運び、後でGit化しても保持します。

保存すべき根拠や変更が確定した初回に `preferences register --project "/path/to/project"`→read→write/migrateと進めます。non-Gitの初回readだけではIDを作らず、nullからrevisionを捏造しません。開始時の検索だけで空projectを大量登録しません。statusは通信/書込をせず、未登録をunresolvedと示します。保存先が不明でも旧localを正本に戻しません。設定だけでは旧local記録は送信されません。同じtarget/keyのcache/pending/排他は同一PCの別path/worktreeで共有します。

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" preferences read --project "/path/to/project"
node "$HOME/.agents/skills/codex-harness/runtime.js" preferences write --project "/path/to/project" --input "/path/to/updated.md" --revision "READ_TOKEN"
node "$HOME/.agents/skills/codex-harness/runtime.js" preferences sync --project "/path/to/project"
# 旧local記録を取り込むときだけ明示実行
node "$HOME/.agents/skills/codex-harness/runtime.js" preferences migrate --project "/path/to/project"
```

readは本文・版・blob SHA・確認日時・鮮度・未送信を返します。writeはreadで得たrevisionを必須とし、local排他とGitHub SHA条件付き更新で競合を上書きしません。送信前にlocalへpendingを確保し、失敗は `ok=false` と終了コード2。`--offline true` でcache閲覧・書込待ちができ、syncで再送します。初回取得失敗は空の正本にせずnullを返します。statusは通信・書込・cache本文読取なしです。

競合ではreadの `remote_content/remote_sha` を確認し、訂正・忘却と根拠IDを再評価した本文を作って `write ... --revision "CURRENT_LOCAL_TOKEN" --base-sha "OBSERVED_REMOTE_SHA"` で明示調整します。さらにremoteが変われば再び停止します。キャッシュ・古い内容・未送信は自動適用せず、fresh取得に成功してから改善ループへ戻ります。制作自体は現在の依頼で続けます。

移行は旧原本を保持し、異なる既存remoteを拒否し、保存先別migration markerとproject単位の本文なし `creative/legacy-retired.json` で旧原本の再取込を防ぎます。移行後に旧原本・Git履歴を自動参照して復活させません。保存先設定が消えてもruntimeは旧localのread/write/syncをエラーで止めます。元のGitHub設定を復元して現在の正本を使います。別保存先へ移す場合も旧原本をmigrateせず、現在の正本を読んで明示的にtransferします。忘却は現在の正本・cache・pendingを更新しますが、未送信は完了扱いしません。移行はtarget draft→local retirement marker→remote送信の順で保存し、retirement失敗時はsyncも送信前にmarker確保を再試行します。失敗結果はdisk上のpendingを返し、pending=falseならmigrateを再実行します。保持した旧原本・利用者の入力ファイルは必要に応じて別途訂正・削除します。Git履歴や他PCの古いコピーの完全消去は保証しません。

`enabled=false`・`persistence=false`・`preferences.enabled=false` は明示管理も含め記憶の読書き・通信を止めます。loop OFFは自動処理を停止します。GitHub接続時のautosave=falseも自動読取・記録・lesson検索・再送を保留しますが、明示keyの手動管理は可能です。未接続localの制作記憶は従来どおり。公開CLIに `--automatic` はないためエージェントが通信前に設定を確認します。measurementは独立です。[ADR 0003](../adr/0003-github-improvement-records.md)はこの段階の範囲と制限を記録しています。ページ収集・検索・拡張機能は別の[Knowledge基盤](knowledge-base.md)に実装されています。制作指針の保存とは分けて扱います。

## 初めて使うとき

プロフィール入力は不要です。制作・修正の依頼をし、継続させたい点を明示してください。

> 今後の社内資料では、最初に結論と根拠を短く置いてください。

確認・訂正・忘却は別に依頼できます。保存失敗・同期待ち・競合があれば完了扱いにせず報告します。`persistence=false` なら過去記憶を読み書きせず会話内だけで扱います。`improvement_loop=false` なら自動読取・記録・適用・候補試用を止めますが、persistence ONでの明示的な記憶管理は可能です。OFFにしても保存済み内容は削除しません。

ここにある `$HOME` のコマンドはmacOS/Linux用です。PowerShellでのruntime指定は[導入の確認](installation.md#確認)に従います。保存内容の意味・昇格条件・根拠IDはエージェントが点検し、CLIは版・競合・耐久保存を支援します。

[詳細契約](../../plugins/codex-harness/skills/harness/references/creative-loop.md)・[設定](configuration.md)・[検索](search.md)

## 別PC・別worktreeで再利用する

今回の機能のnpm公開は別工程です。registryの@latestに含まれるとは限りません。検証済みの同じ `.tgz` を対象PCへコピーし、そのファイルから本体を導入/更新します。各PCでNode.js 22+とGitHub CLIを用意します。

```sh
npx --yes --package "/path/to/karladev001-eng-codex-harness-0.4.3.tgz" codex-harness install
gh auth login --hostname github.com
```

導入後に同じ個人共有設定を既存settingsへ追加します。Git projectは同じoriginでcloneし、non-Gitは `.harness.json` をprojectフォルダと一緒にコピーします。設定/IDは共有しますが認証token、稼働agent、worktree自体、古いcache/pendingはコピー元の代替正本にしません。その後、次のコマンドでok=true/freshness=fresh/pending=falseと期待keyを確認して再利用します。

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" status --project "/path/to/project"
node "$HOME/.agents/skills/codex-harness/runtime.js" preferences read --project "/path/to/project"
```

実機のない他PCのログイン/導入成功は保証しません。[導入](installation.md)のPowerShell手順も参照してください。

## 自動送信・再送と履歴

エージェントが根拠を点検して保存した変更は、pendingを耐久保存してからGitHubへ送ります。成否/未送信は完了時に確認します。失敗はpendingとして保持し、既存の毎時jobが `preferences sync-all` で登録済みtargetだけを再送します。元project不在・現在policyがOFF・保存先変更は保留。説明生成の成否と再送は独立し、追加の定期チャットは作りません。復旧/通知は[Knowledge運用](knowledge-operations.md)へ。

lesson JSONとpreferences Markdownの元ID・日時・unknown評価を保ち、GitHub commitにはschema_version/project_key/operation_id/kind/record_kind/recorded_atを残します。新規/更新/訂正/忘却/移行/登録を区別し、本文journalを二重保存しません。同じ操作の再送/同内容保存で履歴を増やしません。初回移行日を大量の新規獲得や品質向上の実績と扱わず、記録数から改善効果を推測しません。成長を表示するdashboardは将来範囲です。訂正・忘却は現在の正本/cache/pending/検索へ反映します。Git履歴の完全消去は別操作で、通常の履歴閲覧でも取消済み内容を勝手に再表示しません。
