# ハーネス本体の導入

Node.js 22以上・npmとスキル対応のCodexを用意します。Gitはworktreeでの隔離に使います。導入CLIはモデルやサブエージェントの利用権を付与しません。

## GitHub Packagesの非公開npm配布（準備中）

**0.4.2の配布準備中です。実registryへの登録・入手可能性は未確認です。** 配布開始後は、Node.js 22以上とnpmを用意し、ホームなどpackage.jsonのないディレクトリから実行できます。利用PCでclone、npm ci、TypeScriptビルドは不要です。

### GitHub Packagesの初回認証

各PCでGitHub Packagesのnpm認証を行います。通常のGit/gitHub認証だけでは代替できません。対象packageへのアクセス権と、classic PATの `read:packages` が必要です。期限切れ・失効時は再認証します。

```sh
npm login --scope=@karladev001-eng --auth-type=legacy --registry=https://npm.pkg.github.com
```

ユーザー名とclassic PATはnpmの対話プロンプトで入力します。tokenをチャット、リポジトリ、コマンド引数へ貼らないでください。npmがPCの認証設定を保存します。この準備実装では実認証・token発行/入力を行っていません。詳しい要件は[GitHub公式のnpm registry案内](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)を参照します。

### 初回導入・更新

macOS/Linux・Windows PowerShell共通（配布開始後）：

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
```

再実行が更新です。`latest`は配布者が指定する安定版で、`--prefer-online`はcacheがあってもregistryの情報を再確認します。取得したCLIが既存installの所有管理に従って恒久ディレクトリを更新します。取得時の自動install hookはありません。npm cache上のCLI取得と恒久コピーの更新は別の操作で、`npm update -g`を更新手順にしません。[npm execの仕様](https://docs.npmjs.com/cli/v11/commands/npm-exec/)も参照できます。

版固定は `@latest` を `@0.4.2` など実際に配布済みの版へ置換します。旧版への差し戻しも希望版のinstallで行います。確認は下の[確認](#確認)へ。

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@0.4.2 -- codex-harness install
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

配布元が作成した `karladev001-eng-codex-harness-0.4.2.tgz` をPCへコピーし、そのファイルを置いたディレクトリで実行します。受取側でcloneやTypeScriptコンパイルは不要です。取得可能な公開npm・GitHub Releaseは前提にしません。

macOS/Linux・Windows PowerShell共通：

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.2.tgz codex-harness doctor
npx --yes --package ./karladev001-eng-codex-harness-0.4.2.tgz codex-harness install
```

npmキャッシュ等が準備済みの環境では `npx --offline` も使えます。単にアーカイブをコピーしただけで、すべてのnpm環境でオフライン起動できると保証するものではありません。

## 手元のcheckoutから導入

開発者向けの経路です。リポジトリへのアクセス権を用意し、cloneしてルートへ移動します。

```sh
git clone https://github.com/karladev001-eng/harness.git
cd harness
npm ci
npm run build
node dist/skill/runtime.js doctor --project .
node dist/skill/runtime.js install
```

## 導入先と変更

| 対象 | 既定の場所・動作 |
| --- | --- |
| 個人用スキル | `~/.agents/skills/codex-harness` に自己完結したruntime・Markdown・assets・Knowledge CLIをコピー |
| 読込入口 | `$CODEX_HOME/AGENTS.md`、未設定なら `~/.codex/AGENTS.md` に所有する区切り付きblockを追加 |
| 所有記録 | `$CODEX_HOME/harness/install.json` |
| バックアップ | `$CODEX_HOME/harness/backups/` |

既存の無関係な指示・個人設定を保持します。入口は恒久導入先の `runtime.js` を参照し、npxキャッシュに依存しません。`AGENTS.override.md` が入口を隠す環境では導入を拒否するので、既存指示を確認して解決します。

`--skills-dir PARENT` でスキルの親ディレクトリを明示できます。導入済みの場所を変える際は、先に所有記録に従って解除します。`--home PATH` は一時ホームでの検証用です。実ホームへ試験導入せず、保守者は[一時環境の手順](../maintainers/releasing.md)を使ってください。

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

registry配布開始後は上のnpm execを再実行します。checkout経路は新しいcheckoutをビルドし、tarball経路は更新版をコピーして同じ `install` を再実行します。未編集の所有ファイルと入口を更新し、同じ配布物なら `unchanged` を返します。個人/プロジェクトの設定と制作記憶は保持します。明示したモデル設定やOFF設定は更新後も優先されます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.2.tgz codex-harness uninstall
```

checkoutの場合は `node dist/skill/runtime.js uninstall`。所有するスキルと入口のみを解除し、個人設定、プロジェクト仕様・ADR、制作記憶は残します。

未所有の同名フォルダ、編集された管理ファイル/入口、追加ファイルがある場合は更新・解除を拒否します。ファイルを削除したり所有記録を書き換えたりせず、バックアップと差分を確認し、利用者が移行方針を判断してください。無関係な既存内容を自動マージしません。

JavaScript版の差し戻しは希望版tarballの `install` を使います。旧Python版schema-1の未編集導入はPythonを実行せず移行できます。旧Python版へ戻す場合はJavaScript版で解除後、[旧版履歴](../history/validation-python-v1.md)の対象版を確認します。戻す版によって機能が異なるので、新版の説明をそのまま当てはめません。

macOS以外の実機、別PCでの検出・再開の検証状況は[VALIDATION](../../VALIDATION.md)を参照してください。
