# ローカル配布物を作成・検証する

この手順はローカルtarballの作成です。GitHub Releaseへの添付、push、npm publishを含めません。現在のpackageは0.4.1、`private: true`・`UNLICENSED`を維持します。

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
tar -tzf "/tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.1.tgz"
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path "$env:TEMP\codex-harness-release"
npm pack --pack-destination "$env:TEMP\codex-harness-release"
tar -tzf "$env:TEMP\codex-harness-release\karladev001-eng-codex-harness-0.4.1.tgz"
```

版はpackage.jsonの値と生成ファイル名で確認します。独立したstandalone/plugin、5スキル、Knowledge CLIと独立拡張、文書・出典・個別LICENSEを含むこと、参照先が展開後にも存在することを確認します。TypeScriptソース・node_modules・個人設定を実行配布物へ入れません。Raycastの実行ソース/依存は別導入です。

## 一時ホームで導入・更新・解除

macOS/Linuxの例です。受け取ったtarballの絶対パスを使います。

```sh
task_home="$(mktemp -d)"
task_project="$(mktemp -d)"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.1.tgz codex-harness doctor --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.1.tgz codex-harness install --home "$task_home"
node "$task_home/.agents/skills/codex-harness/runtime.js" status --home "$task_home" --project "$task_project"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.1.tgz codex-harness install --home "$task_home"
npx --yes --package /tmp/codex-harness-release/karladev001-eng-codex-harness-0.4.1.tgz codex-harness uninstall --home "$task_home"
```

再installで `unchanged`、無関係なAGENTS/設定/制作記憶の保持を確認します。別版からの更新・編集済み拒否・失敗時の復元は既存テストで確認し、新版で回帰があれば修正します。Windowsで一時ホームを指定する場合は、存在する絶対ディレクトリを `--home` と `--project` に渡します。実機未検証ならその旨を記録します。

authoringは `authoring install --project "$task_project" --skill inspect-harness` と対応するuninstallで単体選択を確認します。本体installと所有記録が別で、本体の有効化を行わないことを確認します。Knowledge stateも一時絶対パスにし、登録・外部送信は実行しません。

## 文書と記録

`npm run check:docs` はREADME、目的別ガイド、移動元、ビルド済みstandalone/plugin/Knowledgeの相対リンクとMarkdown見出しを確認します。npm testのpackage試験では実際のtarballを展開し、同じ検証と一時ホームへの恒久導入後の自己完結性を確認します。ADR・旧検証履歴は参照先の実在を確認し、その本文の過去環境へのリンクは対象外です。古い履歴の過去環境への参照と、現行ガイドのリンク切れを区別します。pack結果、テスト、OS/Node、未検証事項を[VALIDATION](../../VALIDATION.md)へ記録してください。

ローカルでchecksumを作る場合は配布物とは別の `SHA256SUMS.txt` に保存し、生成した実ファイルだけを対象にします。既にchecksumやReleaseが公開されていると記載しません。将来の外部公開は[公開前の判断](publication.md)を解決してから別工程にします。
