# 非公開npm配布を準備・検証する

0.4.3のGitHub Packages向け非公開配布を準備・検証します。ソースの `private: true` はnpm publishを禁止する設定で、非公開registry設定そのものではありません。`UNLICENSED`も維持します。この手順はbuild、配布用staging、dry-run、ローカルtarballと隔離検証までです。実registry送信、公開、push、認証操作、ライセンス変更は別途指示まで行いません。

## ビルドと配布内容

checkoutのルートで実行します。

```sh
npm ci
npm test
npm run check:docs
node dist/skill/runtime.js --help
```

pack先には、既存のcheckout外ディレクトリを指定します。`prepack`がdistを再生成するため `dist/releases` を出力先にしません。

macOS/Linux：

```sh
mkdir -p "/tmp/codex-harness-release"
npm pack --pack-destination "/tmp/codex-harness-release"
tar -tzf "/tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.3.tgz"
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$env:TEMP\codex-harness-release"
npm pack --pack-destination "$env:TEMP\codex-harness-release"
tar -tzf "$env:TEMP\codex-harness-release\karladev001-eng-codex-harness-0.4.3.tgz"
```

版はpackage.jsonの値と生成ファイル名で確認します。独立したstandalone/plugin、既定5スキルと任意追加codex-slide-planの導入元、Knowledge CLIと独立拡張、文書・出典・個別LICENSEを含むこと、参照先が展開後にも存在することを確認します。TypeScriptソース・node_modules・個人設定を実行配布物へ入れません。Raycastの実行ソース/依存は別導入です。

## GitHub Packages用stagingを生成する

ビルド済みの既存npm pack選択内容を使い、別の配布用manifestを作ります。出力先の親ディレクトリを先に作り、**まだ存在しないstagingディレクトリ**を指定します。既存ファイル/ディレクトリは上書きせず拒否します。失敗時に残った新規stagingは中身を確認して別の名前で再試行します。

macOS/Linux：

```sh
mkdir -p "/tmp/codex-harness-release"
npm run stage:registry -- "/tmp/codex-harness-release/stage-0.4.3"
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$env:TEMP\codex-harness-release"
npm run stage:registry -- "$env:TEMP\codex-harness-release\stage-0.4.3"
```

生成manifestは `@karladev001-eng/codex-harness` / 0.4.3、repositoryは `karladev001-eng/harness`、publishConfig.registryは `https://npm.pkg.github.com` です。ソースのprivate:trueは変えず、stagingにだけpublish禁止フラグを収録しません。配布manifestにdevDependenciesやprepare/prepack/postinstall等のscriptsはなく、利用PCではbuildやAGENTSへの自動書込みを行いません。stage生成のpack一覧取得も専用一時home/config/cacheとofflineを使い、認証設定へ触れません。

stagingに移動してdry-runとローカルpackを行います。レビュー・隔離検証したtgzのSHA-256を記録し、実配布には同じtgzを使います。検証後に再build/再packしたものは別の配布候補として扱います。以下の `publish --dry-run` は送信しません。実publishコマンドは今回の手順に含めません。npmのログ/cacheも一時ディレクトリへ向けます。

```sh
cd "/tmp/codex-harness-release/stage-0.4.3"
npm publish --dry-run --ignore-scripts --offline --cache "/tmp/codex-harness-release/npm-cache" --registry=https://npm.pkg.github.com
npm pack --ignore-scripts --offline --cache "/tmp/codex-harness-release/npm-cache" --pack-destination "/tmp/codex-harness-release"
```

PowerShellでも作成したstageへ `Set-Location` し、上の絶対パスを `$env:TEMP` 以下へ置換します。npm publishのdry-run成功は、GitHub Packagesの受入、packageのvisibility/アクセス、版未使用の確認ではありません。配布直前に0.4.3が未使用であること、関連repositoryが非公開で対象packageも非公開であること、利用者/送信者のpackage権限、送信者認証を別工程で確認します。ソースのpublish禁止とstagingのregistry固定を、実配布や一般公開の許可と読み替えません。

## 一時registryでnpm経路を検証する

`npm test` の `tests/registry.test.cjs` が127.0.0.1だけに一時registryを開きます。Node.js実行中のHTTPサーバーからfixture版tarballを返し、外部registryへ送信しません。一時home、空のuser/global npmrc、一時cache、package.jsonのないcwdを使って実npm execを実行し、終了時にサーバーを停止して一時ファイルを削除します。

初回、同版unchanged、古いcacheのlatest→新版、版固定、解除、authoring単体、401/403/404/通信失敗、編集済み拒否、cache削除後の恒久runtimeを確認します。認証失敗は偽のHTTP応答で、実GitHub認証は使いません。取得失敗は空の専用cacheで未cache版の取得を失敗させ、既存homeの全ファイルが保持されることを確認します。npm 11では通信障害後にpackument cacheへfallbackする場合が観測されました。npmがcacheで成功する場合と、取得全体がエラー終了してCLIを実行しない場合を区別します。旧版は更新挙動を確認する内容違いのfixtureで、実GitHubに旧版があるとの証拠ではありません。既存package/install試験で詳細な所有管理・rollback・全5スキル・tarballリンクを確認します。

## 一時ホームで導入・更新・解除

macOS/Linuxの例です。受け取ったtarballの絶対パスを使います。

```sh
task_home="$(mktemp -d)"
task_project="$(mktemp -d)"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.3.tgz codex-harness doctor --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.3.tgz codex-harness install --home "$task_home"
node "$task_home/.agents/skills/codex-harness/runtime.js" status --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.3.tgz codex-harness install --home "$task_home"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.3.tgz codex-harness uninstall --home "$task_home"
```

再installで `unchanged`、無関係なAGENTS/設定/制作記憶の保持を確認します。別版からの更新・編集済み拒否・失敗時の復元は既存テストで確認し、新版で回帰があれば修正します。Windowsで一時ホームを指定する場合は、存在する絶対ディレクトリを `--home` と `--project` に渡します。実機未検証ならその旨を記録します。

authoringは `authoring install --project "$task_project" --skill inspect-harness` と対応するuninstallで単体選択を確認します。0.4.3では `--skill codex-slide-plan` の明示導入・再実行・解除も確認し、runtime/CSS/JS、quality-review.md、revision-notes.md、サンプルが導入先に揃うこととHTML生成を検査します。指定なしのauthoring操作と本体install/updateでは任意スキルを変更しないことも確認します。本体installと所有記録が別で、本体の有効化を行わないことを確認します。Knowledge stateも一時絶対パスにし、登録・外部送信は実行しません。

## 文書と記録

`npm run check:docs` はREADME、目的別ガイド、移動元、ビルド済みstandalone/plugin/Knowledgeの相対リンクとMarkdown見出しを確認します。npm testのpackage試験では実際のtarballを展開し、同じ検証と一時ホームへの恒久導入後の自己完結性を確認します。ADR・旧検証履歴は参照先の実在を確認し、その本文の過去環境へのリンクは対象外です。古い履歴の過去環境への参照と、現行ガイドのリンク切れを区別します。pack結果、テスト、OS/Node、未検証事項を[VALIDATION](../../VALIDATION.md)へ記録してください。

ローカルでchecksumを作る場合は配布物とは別の `SHA256SUMS.txt` に保存し、生成した実ファイルだけを対象にします。既にchecksumやReleaseが公開されていると記載しません。将来の外部公開は[公開前の判断](publication.md)を解決してから別工程にします。
