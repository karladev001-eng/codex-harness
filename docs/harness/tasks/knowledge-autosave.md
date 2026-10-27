# 修正記録の自動保存と再利用

- 計画ID: `knowledge-autosave` / 仕様版: **1**
- 状態: done（仕様v1の実装・独立レビュー・現機導入・既存3件移行・技術記録3件保存と再取得確認完了）
- 日付: 2026-10-24 Asia/Tokyo
- 正本: このファイル。[確認用HTML](knowledge-autosave.plan.html)
- HTMLの承認対象範囲: `S1–S5 / AC1–AC12: 自動保存・既存3プロジェクト移行・再利用・同期復旧・通知抑制・履歴基盤・現機導入`
- 目的: 修正で得た知見を失わず、別PC・別worktreeで同じプロジェクトの記録を使い、後から蓄積の推移を確認できる基盤にする。
- 依頼根拠: 「各プロジェクトの修正記録もGitHubに保存」「別PCや別worktreeでも再利用」「ロックの再発対策と同じ失敗通知の抑制」「GitHubの保存は自動ではできませんか」「後々…成長過程なども見れるように」。

## 承認（判断回答とは別）

- 仕様v1の提示後の本人承認: **approved**（2026-10-25 Asia/Tokyo）。
- 根拠: 仕様版1と対象範囲を明記したユーザー本人のチャット発言「計画 knowledge-autosave の仕様版 1、範囲『S1–S5 / AC1–AC12: 自動保存・既存3プロジェクト移行・再利用・同期復旧・通知抑制・履歴基盤・現機導入』の実装開始を承認します。」。資料提示・配色修正後の明示承認であり同じ承認は再取得しない。
- 承認対象: 仕様S1–S5、AC1–AC12の実装・独立レビュー・本PCへの正規導入・既存3プロジェクトの記録移行とGitHub保存・既存毎時ジョブによる再送確認。
- 保存先: 既存の非公開 `karladev001-eng/harness-knowledge-base` / `main`。
- 他PCへのログイン操作、一般公開、実アプリの修正/配信、履歴閲覧ダッシュボード本体は含めない。

## 現状と問題

- GitHub保存は設定済みprojectでは既に可能。`preferences write` はlocal pendingを確保してからSHA条件付きで送信する。しかしharness以外の3プロジェクトはlocalのみで、再送も個別CLI操作が必要。
- local記録とGitHub cache/pendingが絶対project path由来の領域にあり、worktree間で分断される。設定もcwd直下だけで解決する。
- 同じbare Git cacheのfetchを繰り返すため、中断時の `shallow.lock` が後続全回を停止させた。失敗理由は汎用コードとなり、同じ障害を毎時通知する。
- [2026-10-24の実測・復旧](knowledge-health-20261024.md)では、共有資料/説明は各6件。別プロジェクトAの観察22件とゲームの観察19件、および別プロジェクトBの既存記録はlocal保存。記録件数は品質・改善効果の証明ではない。

## S1: PC・worktreeに依存しないプロジェクト識別

1. 個人設定に共有KB repositoryと自動保存の有効化を一度設定する。既定配布値は従来どおり未接続。projectごとの明示設定とOFF指定を優先する。
2. 既存の明示project_keyを保持する。Gitプロジェクトはoriginを認証部分なしのhost/repositoryへ正規化して同一性を判定する。HTTPS/SSH、末尾`.git`の表記差を吸収し、フォルダ名・ブランチ名・絶対pathはIDに含めない。GitHub名は同サービスの大小文字規則に合わせ、未知hostは安易に大小文字変換しない。
3. GitHubの小さなプロジェクト登録簿でidentityとproject_keyを対応付ける。既存harnessもここへ登録してkeyを維持。forkや別originは別projectとし、remote変更/改名を推測で統合しない。対応不明・衝突は登録を止める。
4. non-Gitまたはoriginなしのプロジェクトは、初回登録で安定IDをプロジェクト設定へ保存する。その設定をフォルダと一緒に別PCへ移す。Git化した際も明示IDを優先する。
5. 同じGit repositoryのworktreeでは共通Git領域から元checkoutのproject設定を解決し、worktree固有の明示上書きを優先する。statusは通信・ファイル作成なしで、未解決のidentityを解決済みと表示しない。
6. GitHub向けcache/pending/排他は保存先と安定project_key単位で共有する。旧path別stateはtarget一致を検証して取り込み、複数の異なるpendingは保全して競合を報告する。別PCはGitHubの最新記録を取得する。

## S2: 保存時送信、定期再送、既存データ移行

1. 根拠を確認して修正記録を作った時点で、都度の送信承認なしにGitHubへ送信する。保存成否・pendingを結果に返す。通信失敗では耐久pendingを保持し、成功と報告しない。
2. エージェントによる「何を記録するか」の判断と、CLIの自動送信/再送を区別する。会話すべてを自動抽出・送信する常駐LLMは設けない。完了手順には修正記録の有無と保存結果の確認を加える。
3. 登録済みtargetのpendingだけを処理する `preferences sync-all` 相当を追加し、既存の毎時sessionless jobから実行する。資料説明生成に失敗しても記録再送は別に試す。追加の定期チャットは作らない。
4. OFF指定は自動読取・記録・再送に反映する。元projectが確認不能/削除済みで現在の方針を確認できないpendingは保留し、任意フォルダの総走査や他のMarkdownの収集はしない。
5. 競合はSHA条件付きで検出し、異なる変更を自動連結/上書きしない。操作IDを再試行で維持し、応答紛失時はremoteを再確認する。同内容保存と再送で同じ履歴を重複追加しない。
6. 次の3記録を、内容・ID・元の日付・unknown評価を保って移行する。元記録は保持するが、移行後の自動参照元から外し、旧コピーから訂正・忘却内容を復活させない。異なるremote記録があれば停止する。

| プロジェクト | 現在の場所 | 移行対象 |
| --- | --- | --- |
| 別プロジェクトA | `<other-project-A>` | 既存preferences.md。Git originによる安定識別 |
| ゲーム | `<other-project-C>` | 既存preferences.md。持ち運べる安定IDを作成 |
| 別プロジェクトB | `<other-project-B>` | 既存preferences.md。持ち運べる安定IDを作成 |

記録のない既存projectは空データをGitHubへ大量作成せず、ハーネスで最初に記録する時点で登録する。新PCにはハーネス・同じ個人保存設定・GitHub CLI認証が必要。現在アクセスできない他PCへの導入完了は約束しない。

## S3: 技術的な修正と、将来の成長表示のための履歴

1. 既存の観察・候補・指針・試用のMarkdownを維持する。技術的な不具合修正は好みと混ぜず、project内の `lessons/<stable-id>.json` として原因・対処・検証・適用条件・出所を保存できるようにする。実装しただけの機能を自動で教訓や肯定評価に変換しない。
2. project開始時に目的に合う指針と少数のlessonを取得できる入口を追加する。全projectの全文を常時注入しない。fresh確認失敗・競合中の古い内容は自動適用しない。
3. 新規/更新/訂正/忘却/移行を、安定したoperation ID・project ID・記録種別・記録時刻・schema version付きでGit commitに残す。元の観察日とGitHub移行日を分ける。本文を別の追記journalへ複製しない。
4. 現行MarkdownのIDと日時、lesson JSONとGit履歴から将来時系列を集計できるようにする。形式が異なる旧記録は件数unknownとして扱える。移行日より前の履歴を推測で復元しない。
5. 将来は「いつ何が増減したか」「候補から指針になったか」「評価がunknownか」を表示可能にする。初回移行をその日に大量の知見を獲得した実績に換算せず、記録数だけを品質向上の指標にしない。履歴閲覧画面・グラフの実装は次の段階。
6. 訂正/忘却は現在の正本・cache・pendingと検索入口へ反映する。Git履歴は残るため完全消去は別操作。将来の通常閲覧でも取消済みの本文を勝手に再表示しない契約を明記する。

GitHub上の配置（提案）:

```text
improvement/
  projects.json                     # 安定identityとproject_keyの登録簿
  projects/<project_key>/
    preferences.md                  # 既存の修正フィードバック記録
    lessons/<stable-id>.json         # 技術的な知見。根拠と検証付き
# 時間軸はこれらのGit commit履歴。原文の二重journalを作らない。
```

## S4: ロックが残っても次回同期を止めない

1. fetchは毎回新しい隔離bare repositoryで実行する。検証したsnapshotだけをatomicに切り替え、処理途中のrepositoryを次回のfetchに再利用しない。同headの読取snapshotは再利用できる。
2. 失敗・timeout・中断では以前の有効snapshotを保持する。終了処理で自分のtemp領域を片付け、強制終了で残った領域も次回処理の入口にしない。未知の既存Git lockの自動削除はしない。
3. 現在のlibraryLockによる同時実行排他は維持。schema/private/期限/サイズ・symlink検証を緩めない。成功を確認した版だけfreshとして報告する。
4. 通信/認証/取得/検証の段階と許可済みreason codeを残し、単なるofflineに全原因を丸めない。生のstderr・認証情報・資料本文は保存しない。
5. 毎回浅いfetchをする分、転送が増える。既存の通常300秒間隔とhook期限を保持し、期限内に取得不能なら古いsnapshotであることを明示する。実PCで処理時間を確認する。

## S5: 同一障害の通知を抑える

1. 処理段階・正規化reason・登録targetの不透明IDで障害を識別する。生の本文・時刻・エラー文・実行回数をfingerprintへ混ぜて毎回別障害にしない。
2. 一つの障害episodeの初回だけ通知を試み、同じ障害が続く間は通知を抑制する。毎回の失敗状態・初回/直近日時・抑制回数は更新する。別の原因/targetの新規障害は通知できる。
3. 正常な対象処理の完了でそのepisodeを解除する。busy/未実行/一部成功は復旧に数えない。同じ原因が復旧後に再発した場合は再び初回通知する。
4. 通知コマンド自体が失敗した場合、同じepisodeの再試行は24時間に最大1回。自動ジョブ重複時も通知stateの排他で重複を防ぐ。通知抑制で主処理の失敗やpendingを成功扱いしない。
5. 通知状態を安全に保存できない場合は永続的な抑制を保証できない。既存の固定の起動/保存失敗通知と非0終了を維持し、制限を報告する。Macの通知許可による表示の保証はできない。

## 番号付き受入条件

1. **AC1 / S1**: 同じGit originの別path・別worktree・隔離した別PC相当homeで、同じproject_key/remote記録に到達する。SSH/HTTPS差、fork、ID衝突・設定優先順位を検証。
2. **AC2 / S1**: non-Gitの安定IDを設定とともに別pathへ移しても同じ記録を使う。statusはread-only。未解決を成功表示しない。
3. **AC3 / S1–S2**: 同一targetのcache/pendingを共有し、異なる旧pendingは消さず競合扱い。フラグOFFでは自動送信しない。
4. **AC4 / S2**: 既存3プロジェクトを内容・ID・日付・評価を保ってGitHubへ移行し、fresh readで共有完了を確認。harnessと資料6件を壊さない。
5. **AC5 / S2**: 保存時送信、通信失敗時pending、再起動後再送、応答紛失、SHA競合でデータを失わず、重複commitを作らない。
6. **AC6 / S2**: 毎時の既存ジョブから登録済みpendingを再送し、説明生成の失敗と独立に処理。追加チャットなし。無関係なファイル/会話を送らない。
7. **AC7 / S3**: 技術的修正の保存と必要時取得を検証し、UIの好みと区別。根拠・適用範囲・評価unknownを維持する。
8. **AC8 / S3**: 各変更のoperation ID・種別・記録日時を履歴から識別でき、移行と新規獲得を区別。同内容/再送は履歴を水増ししない。
9. **AC9 / S4**: 古いshallow.lockやfetch強制終了があっても次回の正常pullを妨げない。失敗途中に既存snapshotを破損しない。
10. **AC10 / S4**: 同時実行・timeout・認証/通信/検証失敗・既存安全検証を通し、生ログを保存しない。実PCの同期時間を確認する。
11. **AC11 / S5**: 同一障害の継続、原因変更、部分成功/busy、復旧後再発、通知失敗、同時jobを検証し、必要時だけ通知する。
12. **AC12 / 全体**: 関連テスト・build・独立レビュー後に正規導入。既存ジョブの正常終了、fresh read、他PC向け導入/再利用手順を確認。実機のない他PCは未検証と明示する。

## 作業範囲と段階

1. identity/設定/共有state/送信と移行。主な対象: `src/lib.ts`, `src/preferences.ts`, `src/runtime.ts`、追加identity/lesson module、関連tests。
2. 再送・Git取得・通知。主な対象: `knowledge/reader.cjs`, `knowledge/process.cjs`, `knowledge/background.cjs` と関連tests。ビルド・所有manifestへの追加も必要時に反映。
3. 記録手順・将来履歴の契約・独立レビュー・正規導入・現機移行。`plugins/codex-harness/skills/harness/references/` と関連ガイドを更新する。

既存の未commit差分は保持。実装を委譲して独立レビューし、認証/移行/競合/並行処理を含むためSol系で慎重に検証する。本計画でハーネス自身のコードcommit/pushやnpm公開を必須とはしない。

## 未解決事項・制約

- 実装開始を妨げる仕様上の未解決事項: なし。上記は承認対象の提案値であり、現時点の実装済み仕様とは異なる。
- 他PCのGitHubログイン/設定は端末側で必要。non-GitはID設定をプロジェクトと一緒に共有する必要がある。
- 過去の全修正の網羅、既存記録にない履歴の復元、再発原因の完全除去、記録数からの改善効果推定は保証しない。
- UI: 今回はCLI/保存/通知の変更であり、新規画面は作らない。HTMLには提案する状態遷移・出力・通知文案を展示する。成長ダッシュボードは将来範囲。
- Claude相談: 既存ログインのread-only診断は成功。設計概要送信は自動承認審査が明示的な送信承認不足として拒否したため、相談未実施。迂回せずCodexで設計した。既存の事前承認文書の存在はホストの拒否解除と扱わない。
- 利用量/トークン: 未取得(null)。実装・検証・実データ移行結果は以下の進行/引継ぎ欄を参照。
- 提示検証: pack成功、実在コード4ファイルの埋込・参照確認済み、構文/幅の警告0件。browserはfile URLのポリシー制限で実表示/操作検証不可。代替の外部公開や別ブラウザへの迂回は行わず、Codexのローカルファイル表示で提示する。狭幅表示・状態操作・文案作成・保存状態の版分離は実ブラウザ未検証。

## 参照・表示

- [運用調査](knowledge-health-20261024.md): 実測と応急復旧。
- [既存共有契約](../../guides/improvement-loop.md): 現在のCLI/記憶。
- [定期ジョブ](knowledge-background.md): 既存LaunchAgentの導入記録。
- 実装根拠: `src/preferences.ts:26–40,157–176`、`src/lib.ts:59–85,105`、`knowledge/reader.cjs:142–162`、`knowledge/background.cjs:91–103`。
- HTMLを開く（macOS/zsh、cwd `/Users/kan/dev/harness`）: `open "docs/harness/tasks/knowledge-autosave.plan.html"`。

## 2026-10-25 表示の修正

ユーザーの可読性フィードバックを受け、同じ仕様v1・pendingのまま固定light配色で再packした。機能仕様・承認範囲・回答identityは変更していない。[修正と固定化の記録](specification-colors.md)。

## 実装の進行・引継ぎ

- 2026-10-25: 承認済み仕様v1の実装を開始。HTML側の承認表示は既存契約どおりpendingのまま、承認の正本は本ファイル。
- 既存未commit差分を保持する仕様内で現在checkoutを直列使用。勝手なcommit/stash/resetなし。コード基点HEAD `4c8dcd36c9022dc408daae63ecfa002efb29bb30`。今回前baselineは別temp領域へ保存し既存変更と区別する。
- 委譲: identity/記憶CLI、同期/通知、統合/記録手順の順に実装。独立レビューは実装者以外に委譲。認証・移行・競合・並行処理を含むためホスト候補Sol6.1/highを使用し、pinなし/対応effortを起動前確認。
- 現時点で未完了: 全コード変更・統合テスト・独立レビュー・正規導入・3project移行・現機確認。Claude外部送信は前回の拒否を迂回せず追加しない。
- 実装前baseline: `/private/tmp/knowledge-autosave-baseline-EyXFLD`。既存6資料等のremote treeはtree SHA `f73c0b862174552cfc7f7a23af8289296f0754d5` 固定で保存。3projectの旧本文も同所migration配下へ照合用に保存し、現機の原本は変更していない。
- 移行前SHA-256: 別プロジェクトA `188a4d81c7715c25f984bd643fe694c320918a05c99fc916fc8e4604d3588ba7` (69208 bytes)、ゲーム `8af57ed97b4b62cd84b98dac29b869aa06403eeac85aff4ccd150951d11815fa` (43175 bytes)、別プロジェクトB `6cef488a969c2c736b4af7aff98d82a4dbeb40be66068f54f64b95fe5c820bd8` (7055 bytes)。いずれも移行前project設定なし。
- S1–S3担当 `/root/autosave_records_impl`（Sol6.1/high、履歴なし、再委譲なし）が実装中。既存35件と新規identity5件は担当による中間PASS。独立レビュー・導入完了を意味しない。non-Gitを後からGit化した際の同一性も追加検証中。
- S1–S3初回完了: build・関連77件PASS。独立担当 `/root/autosave_records_review`（Sol6.1/high、履歴なし）の1巡目はNEEDS_WORK。必須3件: autosave:falseでpending自動再送される/共有repositoryだけのOFF上書きが設定エラー、portable明示IDが未対応origin解析に阻害される、separate git-dirのworktreeが共通設定を失う。いずれもtempで再現、修正後に同担当が再レビューする。実home/GitHubデータ未変更。
- S4–S5・毎時再送担当 `/root/autosave_reliability_impl`（Sol6.1/high、履歴なし）がknowledge配下を実装中。同checkoutのコード編集は直列にし、A修正はB停止後。Aレビューはread-onlyで同時実施。
- 全体先行試験231件中229PASS。失敗2件の切分け: context-concisionの歴史比較が現在HTMLskill変更を参照している（比較23資料の保存値は既存historical material Bと全hash一致）、registryはsandboxのloopback listen EPERM。最終統合で履歴値を改変せず比較先/説明を整合し、loopbackを許可した環境で再試験する。
- B完了: reader/process/background/githubの4CJSと関連2testを変更。build・knowledge92件PASS。独立 `/root/autosave_reliability_review` もPASS（92件、通知予約直後crashの24h再試行、別Node8process同時jobで通知1回/suppressed7を追加確認）。新規bareでfetchし所有tempのみ破棄、旧lock再利用なし。既存ジョブでsync-allを先行最大5分、analyzeと共通30分。last-run schema2はanalysis/syncを分離しsync未完了は総合sync_pending/exit1、通知episodeは排他下の耐久予約。
- A1回目修正: build・関連82件PASS、当初3件の主経路修正を独立確認。逆参照なしseparate Git領域は任意探索せず明示エラー、共通Git設定のcore.worktree明示で解消する（情報不足の安全扱い）。再レビューでlesson側通信障害fallbackに同じportable ID解析漏れが残存（P2、draft保全前例外）を追加再現し、2回目の最小修正を担当へ返却。
- C `/root/autosave_integration`（Sol6.1/high、履歴なし）はコード/記録手順・読者ガイド・section索引・歴史比較試験の統合担当。現在読取のみ、A2回目修正停止後に編集再開予定。A/Bの実home/GitHub書込みはまだない。
- A2回目最小修正完了: lesson障害時fallbackも明示keyを優先し、build・関連83件PASS。独立レビュー最終PASS（元再現でunavailable・耐久pending→復旧sync/fresh readを確認、新差分含む21件独立PASS）。当初3件と追加1件の必須指摘は解消。
- C編集再開: D/R入口から必要少数のtechnical lesson取得・根拠付き保存・完了時の有無/保存結果確認へ接続。Fは制作専用のまま。未接続localの既存loop維持、GitHub接続時auto OFFは指示側でも通信前判定。初回記録時だけregister→verified read→write、開始の検索だけで空projectを登録しない。
- C完了: build・focused19・実tgz/npx/隔離導入2件PASS、docs218文書/1050リンク/errors0。履歴値/fixture/rawは不変。通常codingのD/Rとtechnical-lessons入口、recordkeeper初回register、他PC同tgz導入手順を整合。最終独立統合レビューはBレビュー担当が継続中。
- 最終全体試験1回目（loopback許可環境）250件中249PASS。元の2件は解消。残1件はlibraryLockの正当な解放競合: lstat後read前にownerがunlink→nullをunsafeと扱う。独立reviewでP2確認、B1回目修正loopへ返却（readerと関連testのみ）。実データ移行/導入は全体試験・レビュー完了後。
- B修正: 消失由来nullだけ再試行、不正/読取不能/symlink拒否維持。赤→緑・関連42件・競合/消失/安全拒否3件×20反復PASS。全体再試験252/252PASS（fail/skipped0）、最終独立統合レビューPASS。文書リンク218/1050/errors0、隔離npx配布2件も独立PASS。
- 現機正規install完了: `/Users/kan/.agents/skills/codex-harness`、backup `/Users/kan/.codex/harness/backups/install-j5KeGD`。所有112ファイルはsource/dist/manifest一致、旧108から新module3/reference1を追加。個人settingsに既存非公開KB/main・autosave:trueを設定し、その他設定は保持。
- 同版持ち運びtgz: `/Users/kan/dev/harness/releases/knowledge-autosave-dpwaf87g/karladev001-eng-codex-harness-0.4.3.tgz`（937102 bytes、SHA-256 `8074d5b96a8209a64d0fd87106b9909cb0593329bb3280ca36ccfa94e39d9aa4`）。npm公開/code pushなし。初回packはsandboxによる通常npm cache書込制限で失敗、隔離temp cacheで正常作成。既存npm cacheの所有者変更は行わない。
- 実データの唯一writer `/root/autosave_migration`（record-keeper、Sol6.1/high、履歴なし）へ、harness key登録保持、3project exact移行、今回検証した技術lesson3件（評価unknown）保存を委譲。親は同時writerにならない。実pull時間とLaunchAgent検証はその後の残工程。
- harness register/fresh readは成功、key=harnessと既存blob `70b3a3deb5807c8838fe5382b63fffdb3977675c` 不変。3projectのmigrate実行はホスト自動承認審査が拒否。初回は設定全体の送信との誤認、read-only確認後に旧MDだけ/69208bytes/hash/既存非公開KB宛先を明記した再申請も「仕様書は直接のpayload/宛先承認の証拠にならない」と拒否。未実行であり移行完了とはしない。追加retry/迂回なし。
- 親はユーザーへasync確認を提示: 3つの旧creative/preferences.mdの絶対path・byte数、保存先非公開karladev001-eng/harness-knowledge-base/main/improvement/projects/、元ファイル保持・設定全体送信なしを明示。返答が来るまでは移行依存操作を停止し、別payloadの技術lesson/既存job検証を進める。仕様v1本人承認を失効扱いするのではなく、ホスト審査の直接承認要求への対応。
- 実機force pull: exit0/current/captures6、2.483秒、commit `878f7951a1c3be831c049a73e33c787d917f5cdd`、checked_at `2026-10-24T16:05:21.685Z`。新しい隔離fetchで成功。
- 既存LaunchAgent `gui/501/com.codex-harness.knowledge-analysis` をkickstart。runs153→154、last exit0、終了後not running。schema2の実結果 `2026-10-24T16:06:22.562Z`→`16:06:25.176Z`、analysis unchanged/生成0・同期pending0/failed0・notification not_needed。追加job/chatなし。実画面上の通知表示と他PC実機は未検証。
- 追加の直接確認へユーザー本人が「3件の本文のGitHub保存を許可する」と回答。質問には3つの絶対path/byte数と非公開GitHub宛先main/improvement/projects/、原本保持・設定全体送信なしを記載済み。受領後にrecord-keeperへ同payload/宛先の移行再開を指示。interrupt状態を確認したためfollowupで再開し、実行済を照合して二重移行を避けるよう指示。
- 3project実移行完了: 全件exit0/oktrue/fresh/pendingfalse、旧本文bytes/SHA-256 exact一致・旧MD不変・retirementあり。別プロジェクトA key `git-8db4b1d6273ab24d75ed4d5f`、ゲーム `project-567d10d3-05dd-45c7-8659-7cf51f56ceb3`、別プロジェクトB `project-5425b77a-a67c-4ac4-8961-d33284d7348c`。各commit metadataはschema1/kind=migrate/operation_id/recorded_atを確認、sync-all pending0/failed0。本文無しevidence `/private/tmp/knowledge-autosave-migration-evidence.json`。
- 親の独立remote tree照合: 元からあった62blob変更なし、capture6/analysis6維持。移行3ファイルのGit blob SHAも元バイトから独立計算した値と一致。evidence `/private/tmp/knowledge-autosave-preservation.json`。
- 実remoteを使った別home/別path再利用: 空Git projectに同じSSH originを設定して別プロジェクトA記録、non-Git projectへportable `.harness.json` をコピーしてゲーム記録をfresh取得し、双方元SHA-256 exact一致/pendingfalse。`/private/tmp/knowledge-autosave-live-reuse.json`。実認証は本PCのghであり、物理的な別PC操作の検証ではない。
- 技術lesson3件の書込は別payloadの直接承認不足としてホスト審査が拒否し未実行。迂回/pending経由送信なし。確認用の具体JSON `/Users/kan/dev/harness/docs/harness/previews/knowledge-autosave-lessons.json`（SHA-256 `3cd8403b567d6f29d774fae5147820bbc49446a64acc0fc8a2bfa9d20e36a45d`）を作成して表示し、3ID/本文/非公開KB main/harness lessons宛先を明記した別async質問を提示中。現時点の残確認はこの3件の送信許可。

## 完了・現機結果（2026-10-25）

コード/指示/配布は最終独立PASS、252/252 tests・build成功。自動保存の個人opt-inと既存毎時ジョブ導入済み、移行後jobもruns154→155/exit0、sync pending0/failed0・notification not_needed（2026-10-24T16:16:01.141Z〜16:16:04.534Z）。同一Git originの別path/隔離home、portable non-Git設定の別path/隔離homeでも実remoteの本文一致を確認。物理的な別PCとMac通知の画面表示は未検証。

| 移行対象 | bytes | remote blob SHA | migration commit |
| --- | ---: | --- | --- |
| 別プロジェクトA | 69208 | `5c3f8f8855bd8eae175b03addec7a05cc437a581` | `0554b005dba02ee97342db51499547ebf8ca4422` |
| ゲーム | 43175 | `87625b3f04124f37e7d3b0e712db2d1b32ade9e1` | `a0306ed95e2924d6bc51f87cad831f792b77d25c` |
| 別プロジェクトB | 7055 | `87e6bd22aa307c0f0fd45a9227a0ba0486db8602` | `be8bcaac4428ddd136381e98407e35baabc03da2` |

旧MD・ID・元日付・unknown評価はexact bytesで保持。元からあった62blobと6資料/6説明も不変。成長表示用のoperation metadataはremote履歴でmigrationを区別できる。

技術記録3件についても、ユーザー本人が提示JSONと非公開KB/main/harness lessons宛先を明記した質問に「提示されたJSON3件の保存を許可する」と直接回答。record-keeperがartifact hashを再照合して同payloadを送信し、固定recorded_atを含む全項目一致のfresh read・検索・評価unknown・pendingfalseを確認した。全30操作exit0、sync-all pending0/failed0。ホスト審査の拒否は直接許可により解消し、迂回送信は行っていない。

| 技術記録ID | remote blob SHA | create commit |
| --- | --- | --- |
| isolated-knowledge-fetch | `4b629c6923e83b13d7c4967b9c6cd44a68e197bf` | `b8e682cc6f77d88fbc91a646cf67fd644c157f22` |
| failure-notification-episodes | `9118a6ae916d0f1528500af64457ed97ce168558` | `ced7765252435934ebeeb18b3ee2f399efd9e252` |
| library-lock-release-race | `d5c19668550325da022ed6f8ad7d6c6cd2b3fc53` | `e1a502725f7c5b1d7462d6d6ca7f2f7a436eabd8` |

各commitにschema_version1/project_key/operation_id/kind=create/record_kind=lesson/記録日時を確認。親も提示JSONの各lessonからGit blob SHAを独立計算してremoteと一致を確認し、元62blobは引き続き不変。evidence `/private/tmp/knowledge-autosave-final-verification.json`、更新後migration evidence SHA-256 `92d7a8b4b59e7ff1f30f5385d1c54f7b3618740812f85ac9b9f438086b434dfb`。一時入力を削除しwriter停止。未完了の必須作業なし。

AC1–3/5/7–8は独立コード検証と実再利用/保存でPASS、AC4は3件のexact移行と元資料保全でPASS、AC6/9/11は独立障害注入・並行/強制終了検証でPASS、AC10/12は実pull時間・正規導入・毎時jobの正常終了と手順確認でPASS。全体252/252 PASSの後はコード変更なし。実機のない他PCとMac通知の実表示、長期の改善効果は未検証であり、履歴閲覧ダッシュボードは対象外。

手順: [別PC・別worktreeで再利用](../../guides/improvement-loop.md#別pc別worktreeで再利用する)。今回tgzは上記releases配下、公開済みregistry@latestとは区別する。ソースのcommit/push・npm公開は行っていない。
