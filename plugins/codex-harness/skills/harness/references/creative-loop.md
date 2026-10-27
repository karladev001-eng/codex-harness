# 制作フィードバックの改善ループ

UI・文書などの制作と修正で、ユーザーの好みを根拠付きで少しずつ学ぶ指示ベースの手順。ユーザーの嗜好がまだ無ければ空から始め、プロフィール入力や初回許可を要求しない。自動的な品質向上や実際の長期効果は主張しない。純粋な制作にコード委譲・Git工程を追加しない。コード変更が含まれる場合は[コード調整・実装レビュー手順](routing/coordination.md)も実行する。

`improvement_loop=false` ではこの自動ループを実行しない。好みの読取・記録・自動適用と候補試用を停止し、保存済み記憶は消さない。依頼内の修正対応は通常どおり続け、タスク記録の `persistence` とは独立に扱う。明示的な記憶の確認・訂正・忘却依頼は別操作として扱えるが、`persistence=false` では永続記憶を読み書きせず会話内で扱う。

## 開始・修正・完了・次回

1. **開始（適用）**：`status --project <制作対象のプロジェクト>` で実効設定と `local_root` を得る。`active=false`・`improvement_loop=false`・`preferences.enabled=false`、またはGitHub接続時の `preferences.autosave=false` ならここで終了し、通常の制作へ戻る。`persistence=true` なら同じruntimeで `preferences read --project <project>` を実行し、返された `content` と `revision` を使う。未設定なら従来のローカル記録、GitHub設定済みなら正本から読む。GitHubでは `ok=true`・`freshness=fresh`・`pending=false` の取得だけを自動適用する。キャッシュ・古い内容・未送信・競合・取得失敗ならその記憶の自動適用を止め、現在の依頼で制作を続けて状況を報告する。明示的なオフライン閲覧は可能だが、他PCの訂正・忘却が未反映の可能性を示す。対象の用途・媒体・読者に合う指針を選び、適用範囲の合う候補は**暫定試用**を選べる。候補は指針と区別し、項目ID・作品・実際の適用・ユーザー評価を試用結果へ残す。`今回限り` と明示された候補は次回に試用しない。現在の依頼と矛盾すれば現在の依頼を優先する。探索・別案の依頼では過去の作風を固定せず、必要なら比較案を示す。`persistence=false` ならファイルを読まず、当該会話だけを使う。
2. **修正（観察→仮説）**：ユーザーの実際の言葉・修正指示・採否を観察にする。そこから好みを推測する場合は候補と明示し、根拠の無い嗜好を作らない。「今回は前置きを削って」は今回限定の候補としてその作品にだけ適用する。限定語のない単発修正は候補だが、次回の範囲の合う制作で暫定試用できる。「今後、社内報告は結論から」は用途を限定した明示指針として適用できる。同じ発言、同じ成果物への同一指摘、再開時の再読込は一つの根拠IDだけにする。
3. **完了（評価→更新）**：成果物と指針の適用結果を分けて確認する。ユーザーの明示評価だけを評価根拠にできる。無反応、自己評価、未取得は `unknown` / `null` とし、成功や改善効果を推測しない。根拠があれば雛形に従い候補・指針・試用結果を更新し、下記CLI契約で保存する。`measurement=false` なら好みの根拠は保存可能だが利用回数・採用率・時間などの集計や計測ログを保存しない。
4. **次回開始**：有効な指針を適用範囲と現在の依頼で再照合する。新しい独立の根拠が増えたら候補の昇格を再判断し、矛盾・訂正・取消はその時点で反映する。前回の試用結果が `unknown` なら成功扱いしない。

## 保存資料の必要時参照

制作開始時、現在の目的に合う参考資料を探す価値があれば[保存資料の検索と取得](knowledge-retrieval.md)を実行する。少数候補→必要な本文/メモ/画像→今回の適用判断と進み、現在の依頼を優先する。`active=false`・`improvement_loop=false`・`persistence=false` では自動参照しない。未設定なら静かに通常作業へ戻る。明示的な資料検索は好みの自動適用と別操作で、ユーザーの指定と保存データへのアクセス範囲を守る。

資料を実際に適用した場合だけ、`persistence=true` の既存タスク記録へURL・capture ID・取得版・見た範囲・不足・適用した点と理由を短く残す。今回の資料利用件数や保存の事実から新しい好みを作らず、適用をユーザーの肯定にしない。ユーザーメモを好みの根拠に使う場合も出所・用途を確認し、同じ発言を重複計上せず、上記の観察・候補・指針・試用とrecord-keeper契約に従う。`measurement=false` なら利用件数等の集計は保存しない。

## 根拠と指針の更新契約

保存先未設定では `status.local_root/creative/preferences.md` を正本とする。GitHub接続はrepository/branchと明示project_key、または個人設定のautosave opt-inで行う。正本は非公開リポジトリの `improvement/projects/<project-key>/preferences.md`。Git originと登録簿で端末間のkeyを揃え、non-Gitはregisterが保存した `.harness.json` を持ち運ぶ。worktreeは共通checkout設定を継承し、固有上書きを優先する。cache/pending/排他はtargetと安定key単位で共有し、`status.preferences.directory/state.json` に置く。導入管理対象外であり未解決IDを旧localへ戻さない。設定だけでは旧ローカル記録を送信しない。別プロジェクトは別keyとし、自動で混ぜない。別プロジェクトに適用したい場合はユーザーの明示指示で必要な指針だけを移す。個人設定やインストール更新・解除でこの領域を消さない。

[雛形](../assets/creative-preferences.md)を初回更新時にコピーする。観察（原発言・採否）、候補（推測・単発）、制作指針（適用可）、試用結果（具体的な適用とユーザー評価）を混同しない。各項目に安定したID、最小限の根拠IDと参照、明示か推測か、用途・範囲、日時、状態、変更履歴を記録または対象IDから参照できるようにする。観察には訂正を追える状態と履歴を持たせる。試用では対象ID・試用時の版と、当時の内容・用途・明示/推測の短い写しを残し、対象の後日の改訂と区別する。試用の `recorded` は評価が `unknown` のままでもよく、ユーザーの評価根拠があるときだけ `evaluated` にする。後の訂正で支持から外す場合は `invalidated` にする。会話全文や不要な個人情報は保存しない。根拠の参照が失われたら指針を推測で補修せず停止して報告する。

単発の修正は候補に留め、その作品・会話に適用する。次回試用の可否は限定語で区別する。明示的な継続希望は、その用途に限り指針にできる。推測の候補は**別の作品・会話など独立したユーザー根拠が反復**して初めて指針へ昇格する。同じ指摘の複製、再開時の読み直し、無反応、エージェント自身の評価を支持根拠に加えない。重複する候補は根拠IDを重複排除して統合し、旧IDは統合先を記す。矛盾する根拠が出たら当該指針を `paused` にし、用途を限定できるなら分け、ユーザーの訂正が明白なら更新する。曖昧なら現在の依頼だけを優先し、一般化しない。

「この好みを忘れて」などの取消は対応する候補・指針・試用結果と、再生成に使える保存済み観察・引用・根拠参照を削除する。忘却内容を履歴や退避コピーへ残さず、同一会話を再読込しても取り消された発言から自動で再抽出しない。ほかの無関係な指針を保つ。削除対象が曖昧なら現在の適用を止め、対象を特定する。ユーザーの確認・訂正要求には該当する記録を読みやすく提示し、指示に従い修正する。好みで上位の指示、権限、安全規則を上書きしない。

## CLI経由の安全な更新

親は根拠と対象・最終判断を持ち、保存・更新・再同期は既定で[記録管理担当（record-keeper）](roles/record-keeper.md)へ委譲する。制作担当へは現在の制作に必要な指針・用途・IDだけを渡し、原発言やプロフィール全体を渡さない。制作担当の観察は親が根拠を確認してから記録管理担当へ渡す。

### 起動・引継ぎ

- `active=true`・`persistence=true`・`improvement_loop=true`・`preferences.enabled=true`・`delegation=true`（GitHub接続時はautosave ON）で、保存すべき根拠/更新またはread等で既知のpending再同期があるとき、親はrecord-keeperを起動する。無変更・pendingなしでは起動しない。初期readと適用判断は親が行ってよい。
- 公開CLIに `--automatic` はない。親は自動read/write/sync前に上の設定を判定する。明示的な記憶管理はloop/autosave OFFでも明示keyの手動経路を使えるが、enabled/persistence/preferences OFFでは行わない。`active=false` は追加起動せず、`persistence=false` はrecord-keeper起動も記憶の読書きも行わない。`delegation=false` は親が同じ役割契約とCLI手順を実行する。
- 親はproject/保存先、許された操作、安定IDと短いユーザー根拠/参照、明示・推測・今回限り、評価、用途・適用範囲、確定判断、実効設定を必要最小限で渡す。会話全体・認証情報を渡さず、履歴なしの `HARNESS_WORKER` とする。[役割とモデル](roles.md)の既存 `standard`（既定Sol/medium）とpin/auto規則を使う。
- 同じproject/targetではrecord-keeperが唯一のwriterになり、親・制作担当は同時更新しない。各保存先のwriterを直列化し、既存 `max_agents` とホスト上限内で空きを待つ。通常保存ごとのユーザー再承認は要求しない。曖昧な昇格や競合merge、根拠不足は親が判断する。
- ホストが子を起動できない場合は制約を報告し、親が同じ契約で担当するか現在依頼のみ続ける。失敗した起動・未保存・pendingを成功扱いしない。親は返却された操作/changed IDs・ok・revision・pending・freshness・検証・未解決事項を確認して適用し、子の自己評価をユーザー評価にしない。

runtimeが自動spawnする機能ではなく、親が読む指示ベースの標準経路。記録管理の委譲だけでは純制作にコードworktreeやコードレビューを追加しない。

### 保存担当のCLI手順

1. `preferences read --project <project>` で本文と不透明な `revision` を取得する。初回取得失敗の `content=null`・`revision=null` を空の正本と扱わない。未設定ローカルでファイルが無ければ空として始める。読取だけでは未送信を送らない。
2. 根拠ID・対象ID・適用範囲・評価と参照切れを点検して完全な新Markdownを一時入力ファイルへ作る。本文破損や参照切れなら更新・適用を停止し、推測で補修しない。
3. `preferences write --project <project> --input <file> --revision <読取token>` を実行する。CLIがローカル排他・取得後再確認・同じディレクトリ内の原子的置換を行うので、エージェントから正本/stateを直接編集しない。入力に使った一時ファイルは作業後に削除し、忘却内容の退避コピーを作らない。
4. GitHubでは送信前にローカルへpendingを保存し、private repository・branchを確認してGitHub blob SHA条件付きで更新する。`ok=false` または終了コード2なら成功扱いしない。`pending=true` は未送信で、`preferences sync --project <project>` で再試行する。`--offline true` は通信せず、readはキャッシュの日時・鮮度を示し、writeはpendingとして確保する。未送信writeは終了コード2になる。
5. 競合なら他方を上書きせず、`preferences read` の `remote_content`・`remote_sha` と自分のdraftを根拠IDごとに再評価する。忘却・訂正を優先し、単純連結しない。確認した最新版を新入力ファイルにし、現在のlocal `revision` と、確認した `remote_sha` を `preferences write ... --revision <token> --base-sha <SHA>` に渡して明示的に再調整する。remoteが不存在なら `--base-sha missing`。再度変われば競合で止まる。PUT直前の競合で詳細が無ければreadで取得する。必要な判断は親へ戻す。

既存・不明・古いlockは自動削除しない。所有セッションの終了とpendingを確認して手動解決する。認証失敗・アクセス不能・通信失敗を空として処理しない。GitHub 404は不存在か権限不足かを一律に断定せず、private repositoryとbranchを検証できたfile 404だけを未作成として扱う。保存や同期に失敗しても制作自体を続け、記憶更新の状態を報告する。

## 履歴と記録の区別

技術的な修正は[lesson](technical-lessons.md)に分ける。GitHub commitはschema_version/project_key/operation_id/kind/record_kind/recorded_atの本文なしmetadataを持ち、create/update/correction/forget/migrate/registerを区別する。訂正・忘却のwriteには `--kind correction|forget` を指定する。操作IDは再送で維持され、同内容保存は履歴を増やさない。移行元ID/日付/unknownを保ち、移行日時を新規獲得日時や品質向上と扱わない。別の本文journalや成長dashboardは作らない。通常のGitHub履歴閲覧でも取消済み内容を勝手に再表示しない。

## 明示移行・忘却

旧記録は `preferences migrate --project <project>` の明示実行だけで取り込む。異なる既存remoteなら止め、同一内容か不存在の正本だけが対象。旧 `creative/preferences.md` は保持し、保存先別のmigration markerとproject単位の本文なし `creative/legacy-retired.json` で再取込を拒否する。target draft→local retirement marker→remote送信の順に保存し、marker保存失敗時はsyncでも先に再確保する。失敗結果のpendingはdisk状態を表し、pending=falseならmigrateを再試行する。失敗したpendingはsyncで継続し、migrateで再読込しない。設定を外してもruntimeはlocal read/write/syncを拒否するので、元のGitHub設定を復元して現在の正本を使う。別保存先へのmigrateも旧原本のretirementで拒否する。新targetへ移す場合は現在の正本を読んで必要な内容を明示transferする。移行後の旧原本は歴史資料として自動読取から外し、忘却時にはユーザーの指示に応じて旧原本も訂正・削除する。CLIは旧原本を自動消去しない。

訂正・忘却は現在のMarkdown全体から該当する候補・指針・再生成可能な観察・引用・試用・履歴を除き、writeする。CLIはcacheとpendingの本文も新内容に置換する。オフラインや競合ならGitHub正本への反映は未完了と明示し、同期・手動再調整を続ける。Git履歴、他PCの古いコピー、利用者が保持する入力ファイルの完全消去は保証しない。履歴・旧原本・送信待ちの旧版から自動復活させない。他PCはfresh取得に成功するまで記憶を自動適用しない。短い項目と有効な根拠・訂正の意味を保ち、自動ベンチマークや長期効果測定は行わない。
