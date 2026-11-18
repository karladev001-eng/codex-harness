# ハーネス本体の導入

Node.js 22以上・npmとスキル対応のCodexを用意します。Gitはworktreeでの隔離に使います。導入CLIはモデルやサブエージェントの利用権を付与しません。

## 1コマンドで導入する（`setup`）

新しいPCでは、GitHub Releaseに添付した配布tgzのURLを `npx` へ直接渡して `setup` を実行するのが最短です。ソースリポジトリは公開なので、Releaseのtgz取得にnpm認証やPATは要りません。CodexまたはClaude Codeの本体は先に導入してログインしておきます（`setup` は本体の導入やログインを代行しません）。

```sh
npx --yes --package https://github.com/karladev001-eng/codex-harness/releases/download/v0.5.0/karladev001-eng-codex-harness-0.5.0.tgz \
  codex-harness setup --knowledge-repo karladev001-eng/harness-knowledge-base
```

PowerShellでは行継続の `\` を外して1行で実行します。このURLは[Release v0.5.0](https://github.com/karladev001-eng/codex-harness/releases/tag/v0.5.0)の添付ファイルです（SHA-256 `225f934f5e798792182ab462bad020d29c6264bf113436401e514605ef423450`）。取得できない環境では、後述のローカルtarball・checkoutの経路で同じ `setup` を実行できます（tgzのパスを置き換えるだけです）。

`setup [--home PATH] [--host codex|claude|all] [--knowledge-repo OWNER/REPO] [--knowledge-branch BRANCH] [--html-plan true|false]`

| 手順 | 内容 |
| --- | --- |
| `codex`（`--host` が `codex`・`all`） | `install` と同じCodex導入（旧 `~/.codex/harness` の設定・記憶の共有ストアへの移行を含む） |
| `claude`（`claude`・`all`） | `install --host claude` と同じClaude Code導入。ファイルが最新でも `claude plugin list --json` にuser scopeの `harness@codex-harness` がなければ、前回の登録失敗とみなして登録をやり直す（`install --host claude` も、登録の成否を所有記録 `registered` に残し、失敗していれば再実行で同じ登録・更新を繰り返す）。`plugin list` を読めないときは推測で導入せず、手で実行するコマンドを返して失敗する。あっても版が配布物と違えば、前回の更新失敗とみなして `claude plugin marketplace update codex-harness` と `claude plugin update harness@codex-harness --scope user` を実行（`updated`）。無効にした項目（`enabled: false`）は触らず、`claude plugin enable harness@codex-harness --scope user` を案内する |
| `html-plan`（Claude Code対象で既定true） | 上流の `html-plan@claude-community` を導入。`claude plugin list --json`（標準出力のみを解釈）にuser scopeの同じidの項目があれば、有効・無効にかかわらず導入済みとして `unchanged`。`claude plugin install` は無効にした項目を再び有効にしてしまうため、無効の項目は触らず `claude plugin enable html-plan@claude-community --scope user` を案内します。`--json` が失敗する・JSONとして読めないときだけ、通常の `claude plugin list` の文字列一致で代用します。marketplace登録済みなら登録を飛ばす。`--html-plan false` で行わない |
| `knowledge`（`--knowledge-repo` 指定時のみ） | 個人設定 `~/.agents/harness/settings.json`（`HARNESS_HOME`）の `preferences.repository`・`branch`（既定 `main`）・`autosave=true` を追記。他の項目は保持し、同じ値なら `unchanged`。既に `autosave: false` なら `true` に変わります。`--host claude` だけで、旧 `~/.codex/harness` の設定しかない（共有先が未作成の）ときは、移行されないまま旧パスの `settings.json` に書きます |
| `gh`（`--knowledge-repo` 指定時のみ） | `gh auth status --hostname github.com` の確認だけ。未ログインなら `gh auth login --hostname github.com` を `run_manually` に返す |
| `doctor` | `doctor` 相当の環境確認 |

既定は `--host all`、`--html-plan true`、`--knowledge-branch main` です。再実行が更新で、導入済みの手順は `unchanged` になります。Codex導入が失敗してもClaude Code導入は試すなど、独立した手順は1つの失敗で止まりません。出力は手順ごとの `{name, ok, status, ...}` を並べたJSONで、1つでも失敗すると終了コード2で `run_manually` に手で実行するコマンドを返します。

- `claude` CLIがないとき、`--host all` はClaude Code側（`claude`・`html-plan`）を `skipped` にして成功とし、`--host claude` は失敗として返します。
- 個人設定に別のrepository/branchが既にあるときは上書きせず `conflict` として失敗を報告します。tokenは書きません。
- `--knowledge-repo` が `OWNER/REPO` の形でない、または `--host`・`--html-plan` の値が不正なときは、何も変更せず終了コード1です。`--knowledge-repo` を省略すると `setup` 自身は個人設定を書きません。ただしCodex向け（`--host codex`・`all`）では既存の `install` と同じ旧データの移行が走るため、旧 `~/.codex/harness/settings.json` があれば共有先へコピーされます。`--knowledge-branch` は `--knowledge-repo` と一緒にだけ指定でき、単独指定は何も変更せず終了コード1です。空の `--knowledge-repo` も不正です。設定ファイルは検証してから一時ファイル経由で置き換え、直前に内容が変わっていれば書かずに `conflict` を返しますが、直前の確認から置換までの間の変更は防げません。同じ個人設定を編集する複数の `setup` の同時実行には対応していません。個人設定が既存の読み込みと同じ検査（`max_agents` の範囲など）に通らないときは、書かずに失敗します。

以降の「Claude Codeに導入する」にあるHTML仕様書用プラグインと、記憶共有の設定（[設定](configuration.md)）は、`setup` が行う手順に含まれます。個別に導入・設定したい場合だけ下の手順を使います。

## 配布状況

2026-10-10にGitHub Packagesへ非公開npm版0.4.2を初めて配布し、2026-10-11に配布済みの最新版0.4.3を配布しました。registryからの取得には、指定版の配布完了とpackageアクセス権が必要です。ソースcheckoutの `private: true`・`UNLICENSED` を維持し、配布用stagingだけにGitHub Packages向けmanifestを生成します（[リリース手順](../maintainers/releasing.md)）。ソースリポジトリはGitHubで閲覧用に公開していますが、利用ライセンスは付与していません（`UNLICENSED`）。npmパッケージは引き続きGitHub Packagesでの非公開配布で、公開npmへのpublishとライセンス変更は行っていません。

0.5.0（Claude Codeプラグイン、`consult-codex`、`codex-image` を含む）は **ローカルのリリース候補** で、GitHub Packagesへは未送信です（[VALIDATION](../../VALIDATION.md)の2026-10-28の記録）。そのため、registryの `@latest` で取得できるのは配布済みの版です。0.5.0の内容、特にClaude Codeへの導入（`--host claude`）は、GitHub Releaseに添付したtgz（上の `setup`。Release作成後に取得できます）、ローカルtarball、checkoutのいずれかで行います。registryへの送信は行っておらず、その経路は補足です。配布するtgzには `setup` を含めます。`setup` を含める前に作ったtgzと、そのSHA-256は現在の候補には当てはまりません（[VALIDATION](../../VALIDATION.md)）。

`codex-slide-plan` は任意追加スキルです。本体install/updateと指定なしのauthoring操作では配置・更新・削除しません。0.5.0のnpmパッケージまたはtgzから `--skill codex-slide-plan` で単独導入します（[別PC向けの導入手順](../../authoring-skills/INSTALL.md#codex-slide-planを任意追加する)）。

## 補足：GitHub Packagesの非公開npm配布

この経路は補足です。新しいPCでは上の `setup`（Release tgz）を使います。npm認証とpackageアクセス権が必要で、配布済みの版は0.4.3までです。

0.5.0（ローカルのリリース候補）では既定5スキルと任意追加のcodex-slide-planを収録します。registryからの取得には指定版の配布完了と[package](https://github.com/users/karladev001-eng/packages/npm/package/codex-harness)へのアクセス権が必要です。Node.js 22以上とnpmを用意し、ホームなどpackage.jsonのないディレクトリから実行できます。利用PCでclone、npm ci、TypeScriptビルドは不要です。

### GitHub Packagesの初回認証

各PCでGitHub Packagesのnpm認証を行います。通常のGit/gitHub認証だけでは代替できません。対象packageへのアクセス権と、classic PATの `read:packages` が必要です。期限切れ・失効時は再認証します。

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
```

ユーザー名とclassic PATはnpmの対話プロンプトで入力します。tokenをチャット、リポジトリ、コマンド引数へ貼らないでください。npmがPCの認証設定を保存します。認証は利用PCで行います。詳しい要件は[GitHub公式のnpm registry案内](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)を参照します。

### 初回導入・更新

macOS/Linux・Windows PowerShell共通：

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
```

再実行が更新です。同版は `unchanged`、未編集の旧版は更新し、既存の指示・設定・制作記憶を保持します。npm cacheを消した後も導入先runtimeを使えます。`latest`は配布者が指定する安定版で、`--prefer-online`はcacheがあってもregistryの情報を再確認します。取得したCLIが既存installの所有管理に従って恒久ディレクトリを更新します。取得時の自動install hookはありません。npm cache上のCLI取得と恒久コピーの更新は別の操作で、`npm update -g`を更新手順にしません。[npm execの仕様](https://docs.npmjs.com/cli/v11/commands/npm-exec/)も参照できます。

版固定は `@latest` を `@0.5.0` など取得する版へ置換します。旧版への差し戻しも希望版のinstallで行います。確認は下の[確認](#確認)へ。

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@0.5.0 -- codex-harness install
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness uninstall
```

### 取得・導入の失敗

| 結果 | 確認する点 |
| --- | --- |
| 401/403 | npm認証の期限・classic PATのread:packages・対象packageアクセス権 |
| 404 | 配布開始の有無、scope/名前/版、非公開packageのアクセス権 |
| 通信エラー | 接続先registry・ネットワーク。取得が失敗したらinstallは実行されない |
| 取得後の所有ファイル競合 | 未所有/編集済みの内容を保持して拒否。バックアップと差分を確認 |

npm自体が取得エラーで終了した場合は導入CLIが実行されません。通信不能でもnpmがcacheへのfallbackで取得に成功する場合があり、通信障害だけで必ず停止するとの保証ではありません。取得失敗に対してホームでのnpm ciやビルドは不要です。再認証や通信の問題を解決して同じコマンドを再実行します。既存内容を強制上書きしません。

## 受け取ったローカルtarballから導入

配布元が作成した `karladev001-eng-codex-harness-0.5.0.tgz` をPCへコピーし、そのファイルを置いたディレクトリで実行します。受取側でcloneやTypeScriptコンパイルは不要です。取得可能な公開npm・GitHub Releaseは前提にしません。`codex-harness doctor` と `install` の代わりに、同じ形で `setup` も実行できます（例：`npx --yes --package ./karladev001-eng-codex-harness-0.5.0.tgz codex-harness setup --host codex`）。

macOS/Linux・Windows PowerShell共通：

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.5.0.tgz codex-harness doctor
npx --yes --package ./karladev001-eng-codex-harness-0.5.0.tgz codex-harness install
```

npmキャッシュ等が準備済みの環境では `npx --offline` も使えます。単にアーカイブをコピーしただけで、すべてのnpm環境でオフライン起動できると保証するものではありません。

## 手元のcheckoutから導入

開発者向けの経路です。ソースリポジトリはGitHubで閲覧できます（利用ライセンスは未付与）。cloneしてルートへ移動します。

```sh
git clone https://github.com/karladev001-eng/codex-harness.git
cd codex-harness
npm ci
npm run build
node dist/skill/runtime.js doctor --project .
node dist/skill/runtime.js install
```

## Claude Codeに導入する

同じパッケージから、Claude Codeプラグイン `harness` としても導入できます。`install` に `--host claude` を付けます。プラグインを含む0.5.0はまだregistryへ送っていないため、現在使える経路は、受け取ったローカルtarballか手元のcheckoutです。

```sh
# ローカルtarballから
npx --yes --package ./karladev001-eng-codex-harness-0.5.0.tgz codex-harness install --host claude
# 手元のcheckoutから（npm ci && npm run build の後）
node dist/skill/runtime.js install --host claude
```

0.5.0をregistryへ送った後は、npm exec経路の `-- codex-harness install --host claude` も同様に使えます。

CLIは配布物のmarketplaceを `~/.agents/claude-marketplaces/codex-harness` へコピーし、`claude plugin marketplace add` と `claude plugin install harness@codex-harness --scope user` を実行します。再実行が更新で、同じ配布物なら `unchanged` です。所有記録は `~/.claude/harness/install.json`（`CLAUDE_CONFIG_DIR` 指定時はその配下）です。`claude` CLIが見つからない・登録に失敗した場合は、ファイルを残したまま終了コード2で `run_manually` に実行すべきコマンドを返します。Codexの `AGENTS.md` には触れません。

| 含まれるもの | 内容 |
| --- | --- |
| スキル | `harness`（本体）と既定5スキルに加え、`consult-codex`（Codexへの相談・2者レビュー）と `codex-image`（Codexの組み込み画像生成）。`/harness:harness` などで呼べます |
| エージェント | `implementer` / `integrator` / `reviewer` / `researcher`（`harness:` 接頭辞） |
| hook | SessionStartで `status --host claude` を実行し、activeなら設定とモデルを文脈へ入れます。PreToolUseで、activeなときにmodel・effortのない `harness:*` 起動と、fork等で送られたworkerパケットを拒否します |

Claude Code上でのモデルは設定の `hosts.claude.models`（既定：deterministic=haiku/low、standard=sonnet/medium、complex・review=opus/high）から選びます。プロジェクトの `.harness.json` に `{"hosts":{"claude":{"models":{"standard":{"model":"opus"}}}}}` のように書くと固定できます。Codex固有の手順の読み替えは[Claude Code向けの読み替え](../../plugins/codex-harness/skills/harness/references/hosts/claude-code.md)にあります。解除は `codex-harness uninstall --host claude` です。

Claude CodeでのHTML仕様書は、上流の `html-plan` プラグインを使います。この `install --host claude` には含まれません。`setup` は導入まで行うので、`install` を直接使う場合だけ次のコマンドで別に導入します（未導入なら同梱の `harness:codex-html-plan` を使います）。日本語・正本・実装承認の扱いはハーネスの規則に従います（[読み替え](../../plugins/codex-harness/skills/harness/references/hosts/claude-code.md#html仕様書)）。

```sh
claude plugin marketplace add anthropics/claude-plugins-community
claude plugin install html-plan@claude-community
```

設定・制作記憶・技術的知見はCodexと共有します（[設定](configuration.md)）。CodexとClaude Codeの両方に導入して構いません。

## 導入先と変更

| 対象 | 既定の場所・動作 |
| --- | --- |
| 個人用スキル | `~/.agents/skills/codex-harness` に自己完結したruntime・Markdown・assets・Knowledge CLIをコピー |
| 読込入口 | `$CODEX_HOME/AGENTS.md`、未設定なら `~/.codex/AGENTS.md` に所有する区切り付きblockを追加 |
| 所有記録 | `$CODEX_HOME/harness/install.json` |
| バックアップ | `$CODEX_HOME/harness/backups/` |
| 共有データ | `~/.agents/harness/`（`HARNESS_HOME`）。install時に旧 `$CODEX_HOME/harness/` の設定・記憶をコピー |

既存の無関係な指示・個人設定を保持します。入口は恒久導入先の `runtime.js` を参照し、npxキャッシュに依存しません。`AGENTS.override.md` が入口を隠す環境では導入を拒否するので、既存指示を確認して解決します。

`--skills-dir PARENT` でスキルの親ディレクトリを明示できます。導入済みの場所を変える際は、先に所有記録に従って解除します。`--home PATH` は一時ホームでの検証用です。実ホームへ試験導入せず、保守者は[一時環境の手順](../maintainers/releasing.md)を使ってください。

本体install/updateは既定5スキルの導入元を保持し、任意追加のcodex-slide-planを本体配下へ配置しません。[任意追加の導入手順](../../authoring-skills/INSTALL.md#codex-slide-planを任意追加する)では0.5.0のパッケージから明示選択します。既に独立導入したコピーを本体操作で変更しません。

この経路は単体スキルの導入です。コンパイル済みプラグインもtarballの `dist/plugins/codex-harness/` に含まれますが、プラグイン一覧への登録をinstallが行うわけではありません。開発元の `plugins/` だけでは実行物が不足します。本体のプラグイン版と単体スキル版を重複して有効化しないでください。

## 確認

対象プロジェクトの絶対パスに置き換えます。

macOS/Linux：

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" status --project "/path/to/project"
node "$HOME/.agents/skills/codex-harness/runtime.js" doctor --project "/path/to/project"
```

Windows PowerShell：

```powershell
node "$env:USERPROFILE\.agents\skills\codex-harness\runtime.js" status --project "C:\Projects\example"
node "$env:USERPROFILE\.agents\skills\codex-harness\runtime.js" doctor --project "C:\Projects\example"
```

カスタム導入先ならruntimeのパスを置き換えます。`status` のactive・config・model_selectionを確認します。inactiveは設定で全機能を止めた状態でもあり、導入失敗とは限りません。`doctor` は環境診断で、実エージェント起動や全OS認証済みを意味しません。

## 最初の利用

新しいCodexチャットで対象プロジェクトを開きます。

> この変更の仕様と受入条件を示してください。画面変更がある場合はモックも提示してください。

入口から状態を確認し、activeなら手順を読みます。仕様の提示後に、その版と範囲への承認を伝えて実装へ進みます。詳細は[作業の流れ](workflow.md)へ。特定スキルだけ使う場合は[単独導入](../../authoring-skills/INSTALL.md)を選びます。Chrome/Raycastは[それぞれのガイド](../../knowledge/README.md)から別に導入します。

## 更新・解除

registry経路は上のnpm execを再実行します。checkout経路は新しいcheckoutをビルドし、tarball経路は更新版をコピーして同じ `install` を再実行します。未編集の所有ファイルと入口を更新し、同じ配布物なら `unchanged` を返します。個人/プロジェクトの設定と制作記憶は保持します。明示したモデル設定やOFF設定は更新後も優先されます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.5.0.tgz codex-harness uninstall
```

checkoutの場合は `node dist/skill/runtime.js uninstall`。所有するスキルと入口のみを解除し、個人設定、プロジェクト仕様・ADR、制作記憶は残します。

未所有の同名フォルダ、編集された管理ファイル/入口、追加ファイルがある場合は更新・解除を拒否します。ファイルを削除したり所有記録を書き換えたりせず、バックアップと差分を確認し、利用者が移行方針を判断してください。無関係な既存内容を自動マージしません。

JavaScript版の差し戻しは希望版tarballの `install` を使います。旧Python版schema-1の未編集導入はPythonを実行せず移行できます。旧Python版へ戻す場合はJavaScript版で解除後、[旧版履歴](../history/validation-python-v1.md)の対象版を確認します。戻す版によって機能が異なるので、新版の説明をそのまま当てはめません。

macOS以外の実機、別PCでの検出・再開の検証状況は[VALIDATION](../../VALIDATION.md)を参照してください。
