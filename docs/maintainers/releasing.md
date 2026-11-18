# 非公開npm配布を準備・検証する

0.5.0のGitHub Packages向け非公開配布を準備・検証します。ソースの `private: true` はnpm publishを禁止する設定で、非公開registry設定そのものではありません。`UNLICENSED`も維持します。この手順はbuild、配布用staging、dry-run、ローカルtarballと隔離検証までです。実registry送信、公開、push、認証操作、ライセンス変更は別途指示まで行いません。GitHub Releaseへのtgz添付は[下の節](#github-releaseへtgzを添付する)に分けて記します。

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
tar -tzf "/tmp/codex-harness-release/karladev001-eng-codex-harness-0.5.0.tgz"
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$env:TEMP\codex-harness-release"
npm pack --pack-destination "$env:TEMP\codex-harness-release"
tar -tzf "$env:TEMP\codex-harness-release\karladev001-eng-codex-harness-0.5.0.tgz"
```

版はpackage.jsonの値と生成ファイル名で確認します。独立したstandalone/plugin、既定5スキルと任意追加codex-slide-planの導入元、Knowledge CLIと独立拡張、文書・出典・個別LICENSEを含むこと、参照先が展開後にも存在することを確認します。TypeScriptソース・node_modules・個人設定を実行配布物へ入れません。Raycastの実行ソース/依存は別導入です。

## GitHub Packages用stagingを生成する

ビルド済みの既存npm pack選択内容を使い、別の配布用manifestを作ります。出力先の親ディレクトリを先に作り、**まだ存在しないstagingディレクトリ**を指定します。既存ファイル/ディレクトリは上書きせず拒否します。失敗時に残った新規stagingは中身を確認して別の名前で再試行します。

macOS/Linux：

```sh
mkdir -p "/tmp/codex-harness-release"
npm run stage:registry -- "/tmp/codex-harness-release/stage-0.5.0"
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$env:TEMP\codex-harness-release"
npm run stage:registry -- "$env:TEMP\codex-harness-release\stage-0.5.0"
```

生成manifestは `@karladev001-eng/codex-harness` / 0.5.0、repositoryは `karladev001-eng/harness`、publishConfig.registryは `https://npm.pkg.github.com` です。ソースのprivate:trueは変えず、stagingにだけpublish禁止フラグを収録しません。配布manifestにdevDependenciesやprepare/prepack/postinstall等のscriptsはなく、利用PCではbuildやAGENTSへの自動書込みを行いません。stage生成のpack一覧取得も専用一時home/config/cacheとofflineを使い、認証設定へ触れません。

stagingに移動してdry-runとローカルpackを行います。レビュー・隔離検証したtgzのSHA-256を記録し、実配布には同じtgzを使います。検証後に再build/再packしたものは別の配布候補として扱います。以下の `publish --dry-run` は送信しません。実publishコマンドは今回の手順に含めません。npmのログ/cacheも一時ディレクトリへ向けます。

```sh
cd "/tmp/codex-harness-release/stage-0.5.0"
npm publish --dry-run --ignore-scripts --offline --cache "/tmp/codex-harness-release/npm-cache" --registry=https://npm.pkg.github.com
npm pack --ignore-scripts --offline --cache "/tmp/codex-harness-release/npm-cache" --pack-destination "/tmp/codex-harness-release"
```

PowerShellでも作成したstageへ `Set-Location` し、上の絶対パスを `$env:TEMP` 以下へ置換します。npm publishのdry-run成功は、GitHub Packagesの受入、packageのvisibility/アクセス、版未使用の確認ではありません。配布直前に0.5.0が未使用であること、関連repositoryが非公開で対象packageも非公開であること、利用者/送信者のpackage権限、送信者認証を別工程で確認します。ソースのpublish禁止とstagingのregistry固定を、実配布や一般公開の許可と読み替えません。

## 一時registryでnpm経路を検証する

`npm test` の `tests/registry.test.cjs` が127.0.0.1だけに一時registryを開きます。Node.js実行中のHTTPサーバーからfixture版tarballを返し、外部registryへ送信しません。一時home、空のuser/global npmrc、一時cache、package.jsonのないcwdを使って実npm execを実行し、終了時にサーバーを停止して一時ファイルを削除します。

初回、同版unchanged、古いcacheのlatest→新版、版固定、解除、authoring単体、401/403/404/通信失敗、編集済み拒否、cache削除後の恒久runtimeを確認します。認証失敗は偽のHTTP応答で、実GitHub認証は使いません。取得失敗は空の専用cacheで未cache版の取得を失敗させ、既存homeの全ファイルが保持されることを確認します。npm 11では通信障害後にpackument cacheへfallbackする場合が観測されました。npmがcacheで成功する場合と、取得全体がエラー終了してCLIを実行しない場合を区別します。旧版は更新挙動を確認する内容違いのfixtureで、実GitHubに旧版があるとの証拠ではありません。既存package/install試験で詳細な所有管理・rollback・全5スキル・tarballリンクを確認します。

## 一時ホームで導入・更新・解除

macOS/Linuxの例です。受け取ったtarballの絶対パスを使います。

```sh
task_home="$(mktemp -d)"
task_project="$(mktemp -d)"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.5.0.tgz codex-harness doctor --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.5.0.tgz codex-harness install --home "$task_home"
node "$task_home/.agents/skills/codex-harness/runtime.js" status --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.5.0.tgz codex-harness install --home "$task_home"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.5.0.tgz codex-harness uninstall --home "$task_home"
```

再installで `unchanged`、無関係なAGENTS/設定/制作記憶の保持を確認します。別版からの更新・編集済み拒否・失敗時の復元は既存テストで確認し、新版で回帰があれば修正します。Windowsで一時ホームを指定する場合は、存在する絶対ディレクトリを `--home` と `--project` に渡します。実機未検証ならその旨を記録します。

authoringは `authoring install --project "$task_project" --skill inspect-harness` と対応するuninstallで単体選択を確認します。0.5.0では `--skill codex-slide-plan` の明示導入・再実行・解除も確認し、runtime/CSS/JS、quality-review.md、revision-notes.md、サンプルが導入先に揃うこととHTML生成を検査します。指定なしのauthoring操作と本体install/updateでは任意スキルを変更しないことも確認します。本体installと所有記録が別で、本体の有効化を行わないことを確認します。Knowledge stateも一時絶対パスにし、登録・外部送信は実行しません。

## GitHub Releaseへtgzを添付する

利用者は、Releaseに添付したtgzのURLを `npx` へ直接渡して `setup` を実行します（[導入ガイド](../guides/installation.md#1コマンドで導入するsetup)）。公開リポジトリなので、取得にnpm認証やPATは要りません。GitHub Packagesやnpmjsへの送信とは別の経路です。**Releaseの作成は外部への公開操作**なので、作成前にユーザーの明示的な指示を得ます。この節の手順は、指示を受けてから行います。

作成前に確認する事項：

- `package.json` の版と、作成するタグ `v<version>`（例：`v0.5.0`）が一致し、そのタグのReleaseがまだ存在しない（`gh release view v0.5.0` が見つからない）。
- Releaseの元にするcommit（完全なSHA。`git rev-parse HEAD`）がpush済みで、作業ツリーに未コミットの変更がなく、`npm test` と `npm run check:docs` がそのcommitで通っている。追跡ファイルに個人のパスやtokenがない。
- tgzは、そのcommitそのものをcheckoutして `npm pack` したもの（packした時点の `git rev-parse HEAD` が、Releaseの元にするSHAと一致する）。`tar -tzf` で一覧を確認し、`dist/skill/setup.js` が入っている。検査・smoke試験・SHA-256の記録・添付は、すべて同じ1つのtgzファイルに対して行う。
- 一時ホームで、tgzからの `setup --home <一時ディレクトリ> --host codex --html-plan false` が成功し、再実行が `unchanged` になる。実ホームの `~/.claude` などへ試験導入しない。
- `gh auth status` が対象リポジトリへ書けるアカウントでログイン済み。ログインや権限の変更は利用者自身が行う。
- Release本文にtoken・個人情報・未公開の情報を入れていない。

手順は「用意」と「作成」に分けます。tgzは**用意の段階で1回だけ**作り、検査・smoke試験・SHA-256の記録をそのファイルに対して行います。作成の段階では `npm pack` を再実行せず、そのファイルをそのまま添付します。保存先は、上のregistry用stagingの手順（`/tmp/codex-harness-release` 直下）とは別の専用ディレクトリにし、片方の手順がもう片方のtgzを上書きしないようにします。

用意（macOS/Linux）：

```sh
release_dir="/tmp/codex-harness-github-release"
mkdir -p "$release_dir"
commit="$(git rev-parse HEAD)"   # packするcommitそのもの。短縮形やブランチ名は使わない
npm pack --pack-destination "$release_dir"
tgz="$release_dir/karladev001-eng-codex-harness-0.5.0.tgz"
tar -tzf "$tgz" | grep dist/skill/setup.js
shasum -a 256 "$tgz"
```

この `$tgz` に対して、上の「作成前に確認する事項」の一時ホームでの `setup` 試験を行い、SHA-256を[VALIDATION](../../VALIDATION.md)へ日付つきで記録します（Release本文にも書けます）。

作成（ユーザーの明示的な指示を受けた後）：

```sh
shasum -a 256 "$tgz"   # 記録したSHA-256と一致することを、作成の直前にもう一度確認する
gh release create v0.5.0 "$tgz" \
  --target "$commit" \
  --title "v0.5.0" \
  --notes "Codex Harness 0.5.0. Install with: npx --yes --package <this tgz URL> codex-harness setup"
```

PowerShellでは `Get-FileHash -Algorithm SHA256 <tgz>` でSHA-256を求め、行継続の `\` を外して1行で実行します。SHA-256が記録と違う場合はReleaseを作らず、原因を調べます。`--target` でタグを作るcommitをpackしたcommitに固定します（既にタグをpushしてある場合は `--target` の代わりに `--verify-tag` を使い、そのタグが同じcommitを指すことを `git rev-parse v0.5.0^{commit}` で確認します）。作成後に再packしたものは別の配布物で、SHA-256も変わるため、添付しません。作成後に、添付したtgzをダウンロードし直してSHA-256が記録と一致すること、次のURLで取得できることを確認します。

```sh
https://github.com/karladev001-eng/codex-harness/releases/download/v0.5.0/karladev001-eng-codex-harness-0.5.0.tgz
```

誤って作成した場合の修正（`gh release delete`・タグの扱い）も公開操作なので、ユーザーへ確認してから行います。

## 文書と記録

`npm run check:docs` はREADME、目的別ガイド、移動元、ビルド済みstandalone/plugin/Knowledgeの相対リンクとMarkdown見出しを確認します。npm testのpackage試験では実際のtarballを展開し、同じ検証と一時ホームへの恒久導入後の自己完結性を確認します。ADR・旧検証履歴は参照先の実在を確認し、その本文の過去環境へのリンクは対象外です。古い履歴の過去環境への参照と、現行ガイドのリンク切れを区別します。pack結果、テスト、OS/Node、未検証事項を[VALIDATION](../../VALIDATION.md)へ記録してください。

ローカルでchecksumを作る場合は配布物とは別の `SHA256SUMS.txt` に保存し、生成した実ファイルだけを対象にします。既にchecksumやReleaseが公開されていると記載しません。将来の外部公開は[公開前の判断](publication.md)を解決してから別工程にします。
