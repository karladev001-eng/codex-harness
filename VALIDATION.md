# 検証記録

## 現行の読み方

この文書は日付・版ごとの検証証拠です。古い件数、4スキル表記、非公開GitHub Releaseの提案、当時の未実装範囲はその時点の記録として保持します。現在の使い方は[文書索引](docs/README.md)、ローカル配布は[保守ガイド](docs/maintainers/releasing.md)へ。現行packageは0.4.2で、5スキルとKnowledge/Chrome/Raycastの実装があります。実装の存在、隔離試験、実機での登録、長期効果をそれぞれ区別してください。

Knowledgeの隔離試験は[運用ガイドの検証範囲](docs/guides/knowledge-operations.md#検証範囲)、検索の契約は[ADR 0006](docs/adr/0006-knowledge-retrieval.md)、個別の現機確認はsource checkoutの `docs/harness/tasks/activate-knowledge-memory.md` と `docs/harness/tasks/raycast-knowledge.md` に記録されています。ここからWindows/Linux・別PC・全サービスの網羅取得・長期効果を確認済みとは扱いません。最新の公開準備の検証は実行後に追記し、過去の結果を現在版の再実行として扱わないでください。

## 2026-10-08: 0.4.2 非公開npm配布の準備と隔離registry検証

実施環境: macOS / Darwin 25.6.0 arm64、Node.js 26.10.0、npm 11.19.1、package 0.4.2。Node.js 22以上の要件を満たす環境で実行。GitHub Packagesの非公開配布を準備し、ソースの `private: true` / `UNLICENSED`は維持しています。

- `npm test`: 159件PASS、失敗・skipなし。ログ `/tmp/npm-distribution-npm-test-final.log`。制作記憶fixtureを実localRootへ揃えた後、registry代表試験を再実行して1件PASS（`/tmp/npm-distribution-registry-test-final.log`）。API・モデル・既存所有管理の契約は変更していません。
- 新しいstage generatorは既存pack選択の275ファイルを新規ディレクトリへ収録。stagingだけにGitHub Packages固定registry、関連repository、0.4.2のmanifestを生成し、privateフラグ・scripts・dev/runtime依存を収録しません。既存ファイル/ディレクトリへの出力拒否とバイト保持を試験。pack一覧の取得にも一時home/config/cacheとofflineを使います。
- 127.0.0.1限定HTTP registry、一時home、空のuser/global npmrc、一時npm cache、package.jsonのない空白・日本語を含むcwdで実npm execを実行。初回、同版unchanged、古いpackument/cacheからlatest新版、版固定による差し戻し・再更新、解除、authoring単体導入/解除を確認。設定・正規の制作記憶・プロジェクト設定・無関係なAGENTSを保持します。
- 401/403/404/通信resetは空の専用cacheと未cache版で取得を失敗させ、既存homeの全ファイルが変わらないことを確認。編集済みSKILLは取得後も更新拒否。実npm cache削除後も恒久runtimeのstatusが動き、AGENTS入口がcacheを参照しないことを確認。既存package/install試験で詳細なrollback、全5スキル、アーカイブ/恒久コピーの文書リンクを確認しています。
- npm 11では通信障害後にpackument cacheへfallbackする場合を観測。通信障害だけで必ずCLI起動を止めるとの保証ではなく、npm取得全体がエラー終了した場合にCLIが実行されないことを検証しました。
- `npm run stage:registry` とstagingの `npm publish --dry-run --ignore-scripts --offline` が成功（275ファイル）。dry-runは認証なしの警告を出し、実送信なし。最終成果物は `/tmp/npm-distribution-integrated/karladev001-eng-codex-harness-0.4.2.tgz` にローカルpackとして保存。stage自体に取得時build/AGENTS変更hookはありません。
- `npm run check:docs` は現行source/ビルド済みの167文書、806相対リンク/見出しで欠落0（`/tmp/npm-distribution-docs-final.log`）。最終packの展開後も同じ文書検査で欠落0（`/tmp/npm-distribution-artifact-check.json`）。README、本体/単独導入、保守ガイドを「配布準備中」とし、PCごとのclassic PAT/read:packages認証、npm execによる更新/固定/解除、checkoutはclone/cdから案内しています。

通常sandboxはlocalhost待受を拒否したため、承認済みloopback試験に限りauto-reviewで許可された追加権限を使用しました。一時サーバーは終了後停止、一時試験ファイルは削除。実GitHub Packagesへの接続・配布登録・公開・token入力/発行・実ホーム導入・push・ライセンス変更は行っていません。0.4.2の未使用確認、対象packageの非公開状態/アクセス/送信権限は実配布前の別工程です。Windows/Linux・別物理PC・Node.js 22実機・実GitHub認証/registryの挙動は今回未検証です。過去のCI停止記録から他OSの成功を推定しません。

## 2026-10-08: 公開向け文書とローカル配布の整合

実施環境: macOS / Darwin arm64、Node.js 26.10.0、package 0.4.1。`private: true` / `UNLICENSED`は維持。以下は現在checkoutを使った新しい検証で、過去の結果とは別です。

- `npm test`: 158件PASS、失敗・skipなし。ログ `/tmp/public-package-npm-test.log`。文書レビュー修正後は実tarballのpackage試験だけを再実行し、1件PASS（`/tmp/public-package-recheck.log`）。
- `npm run check:docs`: 公開向け入口・目的別ガイド・移動元・sourceスキル・ビルド済みstandalone/plugin/Knowledgeの167文書、788相対リンク/見出し、欠落0。ADR・過去検証本文は対象外、現行入口からの参照先は実在を確認。checkout専用のTASK/benchmarks/project-mapは実行配布へ一括収録しない。
- package試験は実際の `npm pack` を展開し、アーカイブ内の現行リンクと恒久導入後の文書自己完結性を確認。別プロジェクト・隔離npm cache・一時homeでoffline npxのdoctor/status/install/再install（unchanged）/uninstall、全5 authoring・codex-html-plan単体・従来4スキルの導入/解除、旧JavaScript版からの更新を実行。実ホームとネットワークを使用しない。
- Knowledge CLIはinstalledコピーで一時stateのstatus（configured=false）を確認。checkout外の追加例ではdist CLIのconfigure/status/既知library指定による再設定、runtimeのdoctor/status/5スキルhelpを確認。configureはローカル設定のみで、外部GitHubへの保存・pullは行っていない。
- LaunchAgent XMLは一時ファイルへの生成と `plutil -lint` が成功。bootoutと恒久解除を文書で区別し、自分が作成したplistをLaunchAgents外へ退避する手順を案内。実LaunchAgentの登録・解除は実行していない。
- `npm pack --pack-destination /tmp/public-package-final`: ローカルtarballを作成。公開向けガイド・出典・個別LICENSE・Knowledge独立拡張を収録。Raycast READMEとmanifestは案内/権利表記のため同梱し、Raycast実行src/依存・個人設定・TASK/benchmarksは収録しない。Knowledge READMEの相対リンクはinstalled/plugin/独立distの配置ごとにビルド時に変換する。

文書レビューでは新規KBのconfigure→初回GitHub保存成功→pullと、既存KBへの既知library指定configure→pullを分けた。実装のconfigure/初回送信/pullの契約と既存fake GitHub試験を根拠とし、実GitHubの初期化を再実行した証拠とは扱わない。

今回未検証: Node.js 22での再実行、Windows/Linux/別PCの実機、実Chrome/Raycast登録と更新、実GitHub認証/書込/同期、実Codexチャットでのスキル検出、実LaunchAgentのログイン後の動作、長期効果。公開・push・Release・npm publish・実個人ホームへの導入は行っていない。

## 2026-09-26: TypeScript移行の履歴

実施日: 2026-09-26 / macOS arm64 / Node.js 26.9.0、22.23.3 / npm 12.0.2。

TypeScriptへの移行と、コンパイル済みnpm tarballによる非公開GitHub配布を検証しています。旧Python版の確認結果は [2026-09-21の記録](docs/history/validation-python-v1.md) に保持しています。

## 自動テスト

実装担当の報告では `npm test` が39件成功し、Node.js 22.23.3でも同じ39件が成功しました。統合worktreeでもNode.js 26.9.0で `npm ci`、`npm test` を実行し、39件すべてが成功しました。Nodeの実行パスを明示して検証しており、npxの起動先バージョンも確認します。

- 設定の階層、型、schema、全OFF時の無書込み、既存の保存先ハッシュ
- 依存関係の欠落・循環、永続化OFF、Windows形式を含む不正scope、欠けた末尾を持つシンボリックリンクからの逸脱防止
- コミット済み基点からのworktree隔離、調整用文書・設定のdirty除外、コード保全、衝突と保存済み基点不一致
- 利用枠の欠測・重複・窓変更・減少の除外、日時の暦検証とマイクロ秒精度
- グローバル導入・更新・解除、冪等性、独立した4 authoringスキルの導入・部分選択・解除
- CRLF、BOM、日本語、無関係な指示・設定のバイト単位保持、既存CODEX_HOMEと明示home/skills-dir
- 旧Python版schema-1所有manifestと静的ファイルfixtureを使う移行。Pythonは実行せず、旧版のファイル編集・入口編集を拒否
- ソースの必須ファイル不足、フォルダ重複、未所有・編集済みファイル、追加ファイル、symlinkの拒否
- AGENTS・manifest書込み前後の失敗、更新・解除の復元。復元自体が失敗する場合は回復用ファイルを残し、その場所を報告
- コピー済みスタンドアロン・プラグインのリポジトリ外実行（親がES Modules形式でも動作）
- 実際の `npm pack` tarballを、別プロジェクト・隔離npmキャッシュで `npx --offline` 実行。TypeScript・Python・ネットワークなしでstatus/doctor、導入・解除、authoring導入・解除
- npxキャッシュ削除後にも恒久導入先のruntime.jsが動作し、個人用入口がキャッシュを参照しないこと

旧22テストの機能をNodeテストへ移し、旧実装・旧テストの `.py` は削除しました。移行用の旧ファイルは `tests/fixtures/legacy-schema1.json` 内の実行しないデータとして保持しています。TypeScript・型定義はdevDependenciesのみです。配布物の実行時依存はありません。

## 配布物

統合検証で `npm pack --pack-destination /private/tmp/harness-typescript-integrated` を実行し、`/private/tmp/harness-typescript-integrated/karladev001-eng-codex-harness-0.2.0.tgz` を生成しました。中にはCLI、自己完結した `dist/skill/`、manifestを含む `dist/plugins/codex-harness/`、4 authoringスキルと文書が入ります。ソースの `.py`、TypeScriptソース、node_modulesは配布に含みません。`npm ls --omit=dev --depth=0` は空で、実行時production依存がないことも確認しました。Release用のchecksumは配布物とは別の `SHA256SUMS.txt` で提供します。

パッケージは `private: true` です。公開npmへのpublishはせず、非公開GitHub Releaseから認証付きで取得して `npx --yes --package ./archive.tgz codex-harness ...` で使います。Releaseへの添付・実際の個人ホームへの更新は、独立レビュー・統合後の配布工程で行います。この実装検証では個人ホームを変更していません。

## CI・制約

`.github/workflows/test.yml` にNode.js 22のubuntu-latest、windows-latest、macos-latestで `npm ci`、`npm test`、`npm pack` を行うmatrixを追加しました。private branch CI run [36236798775](https://github.com/karladev001-eng/harness/actions/runs/36236798775) は、いずれのOSでもstep開始前に停止しました。GitHubは最近のアカウント支払い失敗、またはspending limit増額が必要と報告しました。請求設定は変更していません。このためWindows/Linuxは未検証です。symlink作成権限に依存する4テストはWindowsでスキップします。

- Windows/LinuxでのCI結果、別物理PC上のCodex検出・新規セッション再開は未確認。
- 実装の独立レビューはPASS。統合検証はNode.js 26.9.0で `npm ci`、39件の `npm test`、`npm pack`、standalone/plug-in同梱物の確認をPASSとする。最終整合性レビュー、private GitHub配布、実個人ホームの安全な更新は調整担当のdelivery工程で保留する。
- 旧版の実エージェント並列・独立レビュー・再開の結果は歴史的証拠として保持し、今回のモデル実行検証とは扱わない。
- 利用枠削減、大規模アプリ品質、競合解消性能は未計測。

状態遷移・レビュー判定・エージェント上限はスキルの運用手順であり、補助CLIによる強制ではありません。利用枠残量はアカウント共通で、タスク単位の正確な費用として扱いません。

## 制作改善ループの追加検証（2026-10-02）

`npm test` は40件すべて成功。新規テストは、制作改善の参照・雛形が実際のnpm tarball内のstandaloneスキルとプラグインの両方に入り、一時ホームへの導入で利用でき、既存導入の更新・解除を経ても `status.local_root/creative/preferences.md` のバイトが保持されることを確認した。既存の入口編集・所有ファイル編集の拒否も通過した。実個人ホームの導入更新はこの実装担当の検証には含めていない。

指示手順と雛形を使った手動シナリオ確認（実ユーザーの嗜好・長期効果の実測ではない）：

| 入力・状況 | 期待される遷移 |
| --- | --- |
| 「今回は前置きを削って」 | 今回限定の候補。作品内で適用し、次回試用はno |
| 「今後、社内報告は結論から」 | 明示・社内報告限定のactive指針 |
| 同じturnを再開時に読み直す | 根拠IDは増えず、昇格支持にも加えない |
| 別作品で候補を暫定試用し無反応 | 試用結果はunknown、評価根拠はnull。昇格しない |
| 「今回は物語風」 | 現在の指示を優先。既存の文体指針と矛盾しても今回へ強制しない |
| 「この好みを忘れて」 | 指針・候補・試用・再生成可能な観察を削除。同一会話から自動再抽出しない |
| `active=false` / `persistence=false` | 前者は追加処理なし。後者は既存ファイルを読まず会話内だけで処理 |
| `measurement=false` | 好みの明示根拠はpersistenceに従い保持可。利用集計は保存しない |
| 純粋な文書・UI制作 / コードを含む制作 | 前者はコード用委譲・Git工程を要求しない。後者は既存レビュー工程を維持 |

同時更新の排他、破損・参照切れ、実際の制作を重ねた好みの改善は手順として定義したが、ライブの複数セッションや実ユーザーフィードバックでは未検証。改善効果は推測しない。

## 0.3.0 ローカル配布の移行検証

2026-10-02に `npm test` の42件がPASSしました。0.2.0のJavaScript版（コミット `82586eda58699e6d44e656689586e220befe41af`）のソースをコンパイルした固定fixtureで旧インストーラを実行し、実際のschema-2所有記録・旧bootstrap・旧モデル既定・制作改善ループ未搭載から最新版へ更新しました。個人設定とプロジェクトの明示モデル上書き、OFF設定、無関係なAGENTSのバイト列、保存済み制作の好みを保持し、再installが `unchanged` になることを確認しています。旧Python版schema-1の移行・編集済み管理ファイルの保護・失敗時の復元も既存テストでPASSしました。

実際の0.3.0 tarballを一時ディレクトリへ作成し、リポジトリ外のnpxで新規導入と旧JavaScript版からの更新を検証しました。新規導入先の実効設定はLuna/low、Sol 6.1/medium・highで、制作改善ループの入口・参照・雛形を含みます。テストは一時ホームを用い、GitHubへの公開や実ホーム更新は行っていません。この確認はmacOS上のローカル配布検証であり、他OSでの実機検証や長期的な制作改善効果を示すものではありません。


## 0.4.0 改善ループ切替とホストモデル選択

`npm test` は47件PASS（失敗・skipなし）。新旧all-offと新キー明示trueの優先順位、設定の型/enum検証、個人/プロジェクトのmodel pin由来、effort-only非pin、statusの設定解決一致とno-writeを確認しました。旧0.3.0の実配布tgzから取り出した自己完結JavaScriptをfixtureにして更新し、保存済み記憶・明示設定・旧all-offを保持する3ケースもPASSです。0.4.0の実tarballを一時領域へ作り、リポジトリ外でoffline npx導入/更新/解除と新defaults/statusを確認しました。実ホームの更新と最終配布物の保存はこのテストの対象外です。

モデルauto選択は実際の子起動ツールの候補・対応effort・後継根拠を親が確認する指示ベース手順です。runtimeは外部APIや認証を追加せず、statusもモデルを起動・動的解決しません。改善ループOFFの記憶自動読書き停止はエージェントが読む手順で定義しました。将来の後継モデルの起動成功、カタログのアクセス権保証、他OSの実機動作、長期的な改善効果は未検証です。

## GitHub制作改善記録（2026-10-04）

`npm test` は67件すべて成功（既存47件＋preferences隔離検証20件）。buildしたstandalone/plugin双方とnpm tarballに `preferences.js` が含まれ、installerの必須inventoryでも欠損検出する。実npxでlocal preferences CLIが動作することを確認した。

偽GitHub transportと隔離したhome/projectで、private repository・branch検証、SHA条件付き作成/更新、local revision CAS、別保存先cache分離、独立PCの競合、PUTのrace、送信成功後応答消失の再試行認識、PUT成功後local acknowledgement保存失敗のpending保持、unknown lock/corrupt state拒否を検証した。認証/アクセス/通信失敗の初回nullとstale cache fallback、offline pending、Unicode/壊れたbase64、current cache/pendingからの忘却対象除去を確認した。

明示migrationは旧原本保持、異なるremote拒否、失敗後を含むmarkerによる再取込拒否を確認した。persistence OFFではファイル・transportに触れず、loop/measurement OFFでも明示管理が可能。statusは本文・通信・書込なし。ghは偽実行ファイルでhostname固定とstdin JSONを検証し、実GitHubへのテスト書込は行っていない。

実保存先の接続・実記録の移行、Windowsでの実運用、長期効果、Git履歴/別PC古いコピーの完全消去は未検証。ページ収集・検索・拡張機能は対象外。

独立レビュー第1巡の回帰修正では、移行後の忘却→GitHub設定削除でも旧local read/write/syncをretirement markerで拒否し、旧原本を保持することを確認した。migration draft保存のrename失敗は既存cache有/無の双方でdisk上のpendingだけを返す。retirement保存失敗では本物のpendingを保持し、syncもmarker確保前に通信・送信しない。PUT時点で本文なしretirement markerが存在することと、送信失敗後もlocal原本が復活しないことを確認した。statusの本文・marker読取なしも維持している。

独立レビュー第2巡では、WindowsのFlushFileBuffersに必要な書込権限を持つ `r+` で既存retirement markerを開き、truncateせずflushするよう修正した。readonly descriptorのflushを拒否する隔離fakeでmigrate直後のsync・その後のsync成功、open flags、marker本文保持を検証した。Windows実機での運用確認は引き続き未実施。
