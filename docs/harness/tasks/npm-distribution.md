# npmのみでハーネスを導入・更新する

- 計画ID: npm-distribution
- 仕様版: 2
- 状態: done
- 実装承認: approved（仕様v2・N1–N4）
- 対象範囲: N1–N4（GitHub Packages非公開配布の準備、npm導入/更新案内、隔離検証）。実際の配布登録・公開・push・ライセンス変更は別途指示まで行わない。
- 基点: 745082daed78b36434482d1dc57209a809b0606e。既存未追跡の履歴・benchmarksを保持。
- 依頼: 「cloneせずにnpmだけでインストールとアップデートができるようにできますか？」

## 目的と全体像

利用PCはNode.js 22以上とnpmを用意し、ホーム等から一つのnpmコマンドで配布版を取得して恒久導入する。リポジトリの手動clone、利用PCでのnpm ci/TypeScriptビルド、tarballの手動転送を不要にする。Gitは本体のworktree機能等では別途必要だが、registryからの取得には使わない。

配布先はGitHub Packages（https://npm.pkg.github.com）、非公開。パッケージ名は `@karladev001-eng/codex-harness`、関連リポジトリは非公開の `karladev001-eng/harness` とする。

利用の流れ: 各PCでGitHub Packagesへの初回認証 → npm execで配布版取得 → 既存installで本体とAGENTS入口を更新 → statusで確認。同じコマンドの再実行が更新となる。Chrome/Raycastの独立登録は今回に含めない。

現状はローカルtarballをnpxで導入可能。installは同じ配布ならunchanged、異なる配布なら未編集の所有ファイルを更新し、設定・記憶を保持する。追加すべき中心はオンラインregistryへ出せる成果物と案内・検証。package.jsonのprivate:trueは非公開registryを意味せず、npm publish自体を禁止するフラグ。

## 確定仕様案

### N1: ビルド済みregistry配布物を用意

現在の自己完結distと選択済み文書/ライセンスだけを収録する。ソースcheckoutのprivate:trueを保ち、別の配布用staging manifestでのみpublish禁止フラグを外し、GitHub Packagesのregistry、上記repository/name、配布versionを設定する。新しい配布版は0.4.2を提案し、registryに同版が存在しないことを実配布直前に確認する。実配布時は対象packageの非公開状態・アクセス権と送信権限も確認する。ソースリポジトリの非公開設定とUNLICENSEDを維持し、npmjs.orgへの一般公開は行わない。

利用側でbuildするprepare/postinstallや、npm取得時にAGENTSへ書く自動hookは追加しない。ビルドは配布元で完了させ、配布側manifestにcheckout依存のprepack等を残さない。npmの取得と明示したcodex-harness installを分けて検証する。staging生成とdry-run/ローカルregistry検証までは実装範囲。実registryへの送信は別工程。

### N2: 初回と更新を同じnpmコマンドにする

以下は配布完了後のコマンド案であり、現時点で入手できるとの表示はしない。

GitHub Packages非公開配布（初回認証後）:

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
```

`latest`は配布者が指定した安定版。検証では古いcacheがある状態から新版へ更新できることを確認する。版固定は`@latest`を具体版に置換する。解除は同じ呼出しの末尾を`uninstall`へ置換する。既存install/authoring installの契約を使い、新規updateサブコマンドや自動更新サービスは追加しない。

取得したCLIはnpm cacheから起動し、本体を恒久ディレクトリへコピーする。cache削除後もAGENTS入口が動くことを維持する。npmだけの更新と本体コピーの更新を混同しないよう、global npm updateを主要導線にしない。

### N3: 案内と失敗時の動作

READMEの最初の利用者向け経路をnpm経路へ改め、配布開始前は「準備中」を明記し利用可能なローカルtarball経路も残す。checkout手順は開発者向けとし、clone/cdから記載する。単独スキルも同じ取得方式でauthoring installを案内する。

各PCでGitHub Packagesへの初回npm loginと権限を案内する。通常のGitHubへのgit認証だけでは代替しない。classic PATのread:packagesと対象packageアクセスが必要で、tokenをチャット/リポジトリ/コマンド引数へ貼らせない。npm loginの対話入力で扱う。

初回認証の案内例（この仕様作成では実行しない）:

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
```

ユーザー名とclassic PATはnpmの対話プロンプトで入力する。認証の期限切れや失効時は再認証が必要。実際のtoken発行・入力とpackage配布は準備実装の対象外。

401/403は認証/権限、404は未配布/名前/権限、通信失敗は取得の問題として切り分け、ビルドやホームでのnpm ciを案内しない。registry取得失敗時はinstallを実行しない。取得後の未所有/編集済みファイル競合は既存の拒否を保ち、利用者の内容を強制上書きしない。

### N4: 公開せずに導入と更新を検証

一時registry（localhost）・一時home・一時npm cache・package.jsonのないディレクトリを使い、実際のnpm execで初回/同版再実行/旧版から新版/版固定/解除/単独スキルを検証する。認証失敗・未配布の取得エラーで既存導入を変えないこと、編集済み拒否、cache削除後の恒久runtimeを確認する。既存のpackage/install試験を再利用し、必要なregistry経路だけ追加する。

Node22+、実行したnpm/OSを記録。Linuxの今回エラー（ホームにpackage.jsonがない）を隔離環境で再現する。別OSの未実行は明記。UI画面は変更しないため、HTMLではコマンドの利用例を展示する。

## 未解決事項（承認とは別）

実装準備N1–N4の方針を左右する未解決事項: なし。ユーザーの「非公開の方針でいきましょう」により、GitHub Packagesの非公開配布へ確定。実装承認は独立した承認記録を参照。

実配布前の確認として、対象packageの非公開状態・権限・version未使用・認証を残す。実配布は今回の承認対象に含めず、配布可能と確認済みとは扱わない。

## 受入条件

1. 手動clone/利用側build/手動tarball転送なしで、package.jsonのない場所からnpm execの導入・更新が成立する（N1/N2/N4）。
2. 古いcacheから新しいlatestを取得でき、版固定と同版再実行、解除が動く（N2/N4）。
3. 設定・記憶・無関係なAGENTSを保ち、編集済み拒否/取得失敗時に既存導入を壊さない（N2/N3/N4）。
4. 配布元だけでビルドし、配布物に取得時のbuild/自動設定変更hookや秘密・実状態・内部実験を含めない（N1）。
5. README/単独スキル/導入/保守ガイドで初回・更新・確認・解除・認証を辿れ、配布前後の状態を誤認させない（N3）。
6. 実registry送信・公開設定・ライセンス・認証情報・実ホームの変更は行わず、未検証環境を明記する（全体）。

## 関連記録と表示

- [対話型仕様](npm-distribution.plan.html)
- [既存のリポジトリ整備](repository-public-readiness.md)
- [構成/配布のADR](../../adr/0001-portable-skill-harness.md)
- [現在の導入](../../guides/installation.md)

macOS/zsh、実行ディレクトリ `/Users/kan/dev/harness`:

```sh
open "docs/harness/tasks/npm-distribution.plan.html"
```

## 調査根拠

- [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/): --package、cache、明示version、prefer-online。
- [GitHub Packages npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry): 認証、初期private、registryとrepository設定。
- [npm private/publishConfig](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private): private:trueによるpublish禁止、registry固定。
- 実コード: package.json、scripts/build.cjs、src/install.ts、src/runtime.ts、tests/package.test.cjs。現行install更新と恒久コピーを再利用する設計判断。

## 承認記録

approved（仕様v2・N1–N4）。提示後のユーザー本人の明示承認は下記「実装承認と着手」に記録。実registry配布・pushは対象外。以下のpending表記は提示時点の履歴であり、過去repository-public-readiness v2の承認やpush指示を今回へ流用しない。

### 仕様v1の準備検証と提示

- 現行コードとnpm/GitHub公式資料を確認。HTML packは218KB、警告0。ID/仕様版/範囲/pending、未解決の配布先1問、関連記録リンクを配置。
- Codexファイル表示へopen要求済み（queued）。ブラウザはfile URLをセキュリティポリシーで拒否したため、迂回せず実ブラウザの展開/狭幅検証は未実施。絶対パスのHTML/Markdownを会話で提示する。
- 本実装、package設定変更、認証設定、公開、pushは未実施。配布先回答と明示承認は未受領。

### 仕様v2 — 配布方針の回答反映

- ユーザー回答: 「非公開の方針でいきましょう」。配布先をGitHub Packages・非公開へ確定。一般公開案と配布先の質問を撤去。
- 仕様v2、未解決事項なし、実装承認pending。回答は実装開始/registryへの送信許可と扱わない。
- コマンド例を非公開配布へ一本化し、初回npm loginを明記。実装準備の範囲と、実配布前の認証/権限確認を分離。

- v2 pack: 成功・警告0。HTMLの版2/pending、質問0件、相対リンク6件の実在を確認。前回のfile URL制限のためブラウザ検証は未実施。本実装/配布/pushなし。

### 仕様v2 — 実装承認と着手

- ユーザーが前ターンの仕様v2提示後、チャットで「計画 npm-distribution の仕様版 2、範囲『N1–N4: GitHub Packages非公開配布の準備・npm導入更新案内・隔離検証（実配布・公開・push・ライセンス変更除外）』の実装開始を承認します」と明示。承認状態approved、全N1–N4。
- 提示済み: v2 HTML/Markdownリンクとコマンド案。UI画面変更なし。ブラウザfile URL制限は提示時に記録済み。HTMLのpendingは文案UIの契約として維持し、承認根拠はこの正本に記録する。古いpending文は準備履歴。
- 未解決事項なし。実registry配布・公開・push・ライセンス変更は引き続き対象外。過去のpush承認を今回へ流用しない。
- 基点745082dと既存の記録/未追跡成果物を保持し、今回も現在checkoutで実装・レビュー・統合を直列で行う。commit/stash/resetなし。着手時のtracked hashは /tmp/npm-distribution-baseline/hashes.json。
- 実効: active、全機能ON、max_agents3、auto/pinなし。モデル候補はcollaboration.spawn_agentのホスト一覧。registry/staging構成と失敗処理の設計を伴うため実装Sol6.1/high、独立レビューSol6.1/high、統合Luna/mediumを予定。各子は履歴なし・再委譲なし。

- 実装担当npm_distribution_implementation（Sol6.1/high、履歴なし）へ承認とAC1–6を引継ぎ。保存済み指針はpreferences readのEPERMで取得不能のため適用せず、現仕様を基準とする。

### 実装結果とレビュー開始

- 実装担当からソース/文書凍結を受領。npm test 159件PASS、制作記憶fixtureを実localRootへ整合後のregistry代表試験1件PASS。stage生成、送信なしpublish dry-run、ローカルpack、文書167件/806参照の欠落0を報告。
- runtime statusを再確認: active、全機能ON、auto/pinなし。ホストのcollaboration.spawn_agent候補から重要な配布経路の独立レビューにSol6.1/highを選び、npm_distribution_reviewを履歴なしで起動。実差分からリスク表を作った後に実装報告/検証を照合し、AC1–6を個別判定する。
- 最終配布候補は `/tmp/npm-distribution-final/karladev001-eng-codex-harness-0.4.2.tgz`。実配布・pushは未実施。

### 独立レビューと統合

- npm_distribution_review: PASS、AC1–6すべて充足、修正必須なし。記録 `/tmp/npm-distribution-review.md`。既存出力先、正規化別名、symlink、コピー失敗時の保護を独立追試。archive SHA256と167文書/806参照欠落0も再確認。
- 保守ガイドの「sourceとstageのregistry固定」を、ソースのpublish禁止とstagingのregistry固定に区別するP3の文言改善を採用。振る舞い・仕様範囲は変更しない。
- 起動前statusを再確認してauto/pinなしを維持。ホスト候補から限定的な文書・生成物統合にLuna/mediumを選び、npm_distribution_integrationを履歴なしで起動。文言改善後のstage/pack/文書・manifest・コピー整合を確認する。全テストは既存159件PASSを利用し、挙動変更のない全文書修正で重複実行しない。

### 完了記録 — 2026-10-08

- 仕様v2・承認範囲N1–N4を完了。最新の提示・明示承認とAC1–6の対応を確認。AC1（clone不要取得）、AC2（更新/固定/解除）、AC3（既存内容保護）、AC4（自己完結配布）、AC5（案内）、AC6（準備範囲/制約）は独立レビュー・統合後再レビューともPASS。
- 変更: 0.4.2のpackage/lock/plugin整合、`scripts/stage-registry.cjs`、`tests/npm-fixture.cjs`、`tests/registry.test.cjs`、既存package試験の隔離、README/CONTRIBUTING/SPEC/VALIDATION/導入・保守・単独スキル案内。installer/runtimeの所有管理やコマンド契約は変更なし。
- 検証: npm test 159件PASS（fail/skip0）、記憶fixture整合後のregistry代表1件PASS。macOS Darwin25.6 arm64 / Node26.10.0 / npm11.19.1。実npm execの初回・再実行・旧cache→latest・版固定・解除・単独スキル・401/403/404/通信失敗・編集済み拒否・cache削除後起動を隔離環境で確認。
- 統合後: 167文書/806参照欠落0、stageと展開済みarchiveの275ファイルが全バイト一致、standalone/plugin89ファイル一致、git diff --check成功。独立レビュー担当も同じ結果を確認。P3文言は解消。証拠JSONの旧hashは別名保存し、現在artifactの結果へ更新した。
- 最終成果物: `/tmp/npm-distribution-integrated/karladev001-eng-codex-harness-0.4.2.tgz`（275ファイル、692368 bytes）。SHA256 `245456d04c74d07411986fdf7e2357f8577428964418b422c2b0725b2d9f1a32`。stage: `/tmp/npm-distribution-final/stage-integrated-0.4.2`。一時領域なので必要時は保守ガイドのstageコマンドで再生成する。
- 証拠: `/tmp/npm-distribution-implementation.md`、`/tmp/npm-distribution-integration.md`、`/tmp/npm-distribution-review.md`、`/tmp/npm-distribution-npm-test-final.log`、`/tmp/npm-distribution-registry-test-final.log`、`/tmp/npm-distribution-artifact-check.json`。取得できた実測のみを記録し、トークン/費用や長期効果は推定しない。
- 実配布・実GitHub認証・公開設定・push・ライセンス変更・実ホーム導入なし。ソースprivate:true/UNLICENSED維持。commitなし、基点745082dのまま未コミット差分。既存の無関係な記録・benchmarksを保持。
- 準備範囲の未解決事項なし。実GitHub Packages受入、package非公開状態/権限/0.4.2未使用、Windows/Linux・別PC・Node22実機は未検証。実registry配布は別工程であり、現時点ではnpmから入手可能と案内しない。ユーザーの成果物評価は未受領、テスト/レビューのPASSと区別する。

### Git同期 — 2026-10-09

- ユーザーが2026-10-09に「pushして下さい」と明示し、今回のnpm-distribution v2完了変更をコミットして `origin main` へ通常pushすることを承認。これはGit変更の同期のみで、npm publish/Release/可視性変更の承認ではない。
- 今回のコミット対象は指定済み22ファイルに限定し、既存の無関係なbenchmarks/他TASKは含めない。commit/pushを実施する。
