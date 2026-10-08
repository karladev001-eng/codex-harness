# Authoring Skills を既存プロジェクトへ導入する

`create-rulebooks`、`create-subagent`、`create-harness`、`inspect-harness`、`codex-html-plan` を任意のプロジェクトへ導入します。最初の4スキルは独立したMarkdownで、`codex-html-plan` はpack runtimeを含み使用時にNode.js 22以上が必要です。ハーネス本体の有効化、個人用AGENTS.mdやモデル設定の変更は行いません。

導入CLIにはNode.js 22以上とnpmが必要です。利用者のPython、TypeScriptコンパイラ、リポジトリのcloneは不要です。スキルの使用自体には、利用先のCodexがMarkdownスキルに対応している必要があります。

## checkoutから導入する

checkoutのルートで次を実行します。対象は本体のcheckoutと別の、既存のプロジェクトの絶対パスです。

```sh
npm ci
npm run build
node dist/skill/runtime.js authoring install --project "/path/to/project"
```

PowerShellでは `--project "C:\Projects\example"`。利用したい1スキルだけなら `--skill inspect-harness` を加えます。

## 配布物をコピーして導入する

配布元で作成した `karladev001-eng-codex-harness-0.4.1.tgz` を対象PCへコピーします。0.4.1のGitHub Release公開は前提にしません。macOS/LinuxとWindows PowerShellで同じコマンドを使えます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.1.tgz codex-harness authoring install --project "/absolute/path/to/your project"
```

PowerShellではプロジェクトパスを `"C:\absolute\path\to\your project"` のように指定します。空白・日本語を含むパスは引用符で囲んでください。tarballはコピーしたディレクトリから指定するか、絶対パスに置き換えます。隔離テストでは `npx --offline` 起動を確認していますが、利用環境のnpmキャッシュ等に依存します。Node/npmの導入だけで全環境のoffline起動を保証するものではありません。

Codexへは次のように依頼できます。

> コピー済みの `karladev001-eng-codex-harness-0.4.1.tgz` を使い、codex-harness authoring installで `/絶対パス/対象プロジェクト` に5つのauthoringスキルを導入してください。既存の同名スキルが未所有または編集済みなら上書きせず報告してください。

## 導入確認と最初の利用

対象プロジェクトの `.agents/skills/<name>/SKILL.md` が存在することを確認し、新しいCodexチャットでそのプロジェクトを開きます。

> $inspect-harness 今の構成、規則、担当、作業手順を変更せずに確認してください。

既存の索引がなければその旨を説明します。作成には `$create-harness` で必要な規則・担当・ワークフローを依頼します。5スキルの用途と成果物は[一覧](README.md)へ。

## 更新・削除と個別選択

配置先は `<project>/.agents/skills/` です。所有記録は同じ親の `.codex-harness-authoring.json` に保存します。同じ配布物の再実行は変更なしで終了し、新しい配布物からの再実行は未編集の所有ファイルのみ更新します。旧手順でコピー済みなど、所有記録のない既存フォルダは内容が同じでも拒否します。ファイルや記録を勝手に削除せず、別の場所へ退避して比較してから利用者が移行を判断してください。

1スキルだけ導入・追加・更新するには `--skill` を指定します。複数回指定できます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.1.tgz codex-harness authoring install --project "/path/to/project" --skill inspect-harness
npx --yes --package ./karladev001-eng-codex-harness-0.4.1.tgz codex-harness authoring uninstall --project "/path/to/project" --skill inspect-harness
```

`--skill` を省略すると5スキルすべてを対象にします。従来の4スキルだけを指定する従来コマンドも引き続き使えます。全対象の確認後に一括変更するため、1つでも競合があれば他の対象も変更しません。所有するスキルに追記・編集・削除があると、更新・解除を拒否してその内容を保持します。無関係なスキルやプロジェクトファイルは残します。

個人用に使う場合は `--skills-dir` にスキル親ディレクトリを明示できます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.4.1.tgz codex-harness authoring install --skills-dir "/absolute/user/home/.codex/skills" --skill inspect-harness
```

同名スキルをプロジェクト用と個人用の両方へ置くと、Codexで重複して表示される場合があります。通常はプロジェクト用を選びます。導入CLIは既存スキルを自動マージしません。

## 確認範囲

自動テストで、5スキルの一致、従来4スキルおよび単体スキルの独立導入、再実行、部分更新・削除、不完全なHTML計画スキルの拒否、既存指示の保持、未所有・編集済みフォルダの拒否、失敗時の復元を確認します。実際のtarballをnpxで起動する検証も含みます。実行済みOS・制約は [VALIDATION.md](../VALIDATION.md) を参照してください。

以前のdownload方式では、macOS上でコミット `3a861ce9cacbb954601dc373a3e89dbe6cdd516e` の4スキル8ファイルの一致を確認しました。この歴史的確認は、現在のCLIによる全OS検証を代替するものではありません。
