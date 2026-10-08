# ADR 0003: 制作改善記録一ファイルのGitHub共有

- 日付: 2026-10-04
- 状態: 実装。実保存先の接続・記録移行は未実施。
- 関連: [SPEC](../../SPEC.md)、[ADR 0002](0002-github-knowledge-base.md)、[制作改善ループ](../../plugins/codex-harness/skills/harness/references/creative-loop.md)

## 決定

既存の観察・候補・制作指針・試用結果を、一つの小さなUTF-8 Markdownとして専用GitHub.com非公開repositoryでPC間共有する。`preferences.repository/branch/project_key` を明示設定し、正本は `improvement/projects/<project-key>/preferences.md`。同一プロジェクトの端末では設定を揃え、別プロジェクトは別keyにする。未設定は従来のhost-local backendとする。

小さな一ファイルなので、既存gh認証とContents APIを使う。shellを起動せず `gh api --hostname github.com` にJSONをstdinで渡す。repoのprivate属性とbranchを確認してからファイルを扱い、公開先への送信を拒否する。token・生のtransport応答/エラーを記録しない。statusは保存先metadataのみを返し、記憶本文の読取・通信・書込をしない。

`preferences read/write/sync/migrate` を記憶の実際の窓口とする。readは本文・不透明revision・blob SHA・確認日時・鮮度・未送信を返し、writeは読取revisionでlocal CASを行う。排他directory lockと同じdirectory内の原子的保存を用い、未知lockを自動削除しない。GitHub更新はbase SHAを条件にし、違えば止まる。SHAは削除後同じblobが再作成された場合の変更履歴までは識別しない。

保存先identityのhashごとにcache・durable pending・migration markerをlocalへ分離する。送信前にpendingを確保し、応答消失時はremote本文一致によって既送信と認識する。読取ではpendingを送らない。cache fallbackや送信失敗は成功扱いせず `ok=false`/終了コード2。認証/アクセス/通信失敗の初回は空の正本とせずnullを返す。file 404はprivate repoと有効branchを再確認できたときだけ未作成として推定する。repository/refの404は権限不足との区別を断定しない。

オフラインはcache閲覧と既知revisionからのpending置換を許す。古いコピーによる忘却済記録の自動適用を避けるため、改善ループはfreshかつ成功・pendingなしの正本だけを自動適用する。同期できない制作は現在の依頼で続け、状態を報告する。競合はremoteを読んで根拠・訂正・忘却を再評価し、current local revisionと確認済remote SHAを明示したwriteで再調整する。さらにremoteが変われば止まる。

## 移行・忘却・フラグ

設定だけでは旧local記録を送らない。明示migrateのみが旧原本を読み、異なる既存remoteを拒否する。旧原本は保持し、保存先別migration markerと本文なしproject-local `creative/legacy-retired.json` で再取込を止める。sourceとlocal backendに共通のlock下でtarget draftを保存し、retirementを永続化してから送信する。retirement保存失敗後のsyncはmarkerを先に再確保し、失敗中は通信・送信しない。失敗結果はdisk stateを再読込して返し、保存前のpendingを実在扱いしない（stateが無ければ空）。pending=falseのdraft保存失敗ならmigrateを再試行する。別targetも旧原本からのmigrateを拒否し、現在の正本を読んだ明示transferを使う。移行後に旧原本やGit履歴を自動読取して記憶を復活させない。設定が消えてもlocal backendはretirement markerを確認してread/write/syncを拒否する。元のGitHub設定を復元して現在の正本を使う。statusはmarkerや本文を読まない。

訂正・忘却のwriteはcache/pending本文も置換し、local stateに旧本文を履歴として残さない。remote反映がオフライン・競合なら未完了と示す。Git履歴・他PCの古いコピー・利用者の入力ファイルの完全消去は保証しない。保持した旧原本は依頼に応じて別途訂正・削除する。現在内容と再生成可能な根拠の削除契約は維持する。

persistence OFFは記憶の読書き・通信を止める。improvement_loop OFFは自動ループを止めるが、明示管理はpersistence ONなら可能。measurement OFFは計測を止め、記憶の根拠保存とは独立。評価unknown/null、独立根拠、今回限り、現在指示の優先という既存規則を変更しない。

## 変更範囲と制限

ADR 0002の「既存の好みの記憶をlocal-onlyとする」境界のみをこの段階で置き換える。ページ収集、意味検索、Chrome/Raycast、保存資料のfetch同期、計測ログ・タスク記録移行は実装しない。本文の意味・ID参照はエージェントが点検し、runtimeはUTF-8と容量・版・通信整合性を扱う。常駐同期や自動競合mergeは行わない。

隔離fixtureと偽GitHub transport、compiled tarball・installerで検証する。実repositoryへのテスト書込は行わない。実PC間運用と長期改善効果は未検証。

## 追記: 標準の記録管理担当

保存・更新・既知pendingの再同期は[record-keeper](../../plugins/codex-harness/skills/harness/references/roles/record-keeper.md)への指示ベースの委譲を既定にする。親はユーザー根拠・対象・最終判断を保持し、必要最小限の根拠・ID・範囲・許された操作を渡す。同じproject/targetのwriterを一人に直列化し、通常保存ごとの再承認は要求しない。既存standardモデルとpin/auto規則を使い、新設定・ホスト登録・runtime自動spawnを追加しない。

active/persistence/improvement_loop/delegationが有効で保存根拠/更新または既知pendingがあるときだけ起動する。明示管理はloop OFFでも可能、delegation OFFは親が同じ契約で実行し、persistence OFFは起動も記憶アクセスも止める。起動不能なら報告して親が担当するか現在依頼のみ継続する。CLIの版管理・pending・忘却・旧原本保持・retirement・unknown評価は維持し、曖昧な昇格や競合mergeは親へ戻す。返却のok・revision・pending・freshness・検証を親が確認し、失敗/未送信を完了扱いしない。配布・導入必須inventoryに手順を含める。実保存先の設定・記録送信・常駐同期はこの担当追加に含めない。

## 参照

- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents): 取得、作成/更新、blob SHA条件。
- [gh api](https://cli.github.com/manual/gh_api): 認証済API、hostnameとstdin入力。
- [GitHub履歴からの削除](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository): 現在ファイルの削除と履歴消去の違い。
