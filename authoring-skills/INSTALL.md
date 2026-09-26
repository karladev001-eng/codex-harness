# Authoring Skills を既存プロジェクトへ導入する

`create-rulebooks`、`create-subagent`、`create-harness`、`inspect-harness` を任意のプロジェクトへ導入します。4スキルは独立したMarkdownです。ハーネス本体の有効化、個人用AGENTS.mdやモデル設定の変更は行いません。

導入CLIにはNode.js 22以上とnpmが必要です。利用者のPython、TypeScriptコンパイラ、リポジトリのcloneは不要です。スキルの使用自体には、利用先のCodexがMarkdownスキルに対応している必要があります。

## 非公開GitHubから取得する

GitHubアクセス権と認証済みGitHub CLI（`gh auth login`）が必要です。公開npmレジストリへは配布しません。macOS/LinuxとWindows PowerShellで同じコマンドを使えます。

```sh
gh release download v0.2.0 --repo karladev001-eng/harness --pattern "*.tgz"
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness authoring install --project "/absolute/path/to/your project"
```

PowerShellではプロジェクトパスを `"C:\absolute\path\to\your project"` のように指定します。空白・日本語を含むパスは引用符で囲んでください。tarballはダウンロードしたディレクトリから指定するか、絶対パスに置き換えます。Node/npmを導入済みなら、ダウンロード後は `npx --offline --yes --package ./...tgz codex-harness ...` でも実行できます。

Codexへは次のように依頼できます。

> 非公開リポジトリ karladev001-eng/harness の v0.2.0 Releaseからnpm tarballを取得し、codex-harness authoring installで `/絶対パス/対象プロジェクト` に4つのauthoringスキルを導入してください。既存の同名スキルが未所有または編集済みなら上書きせず報告してください。

## 更新・削除と個別選択

配置先は `<project>/.agents/skills/` です。所有記録は同じ親の `.codex-harness-authoring.json` に保存します。同じ配布物の再実行は変更なしで終了し、新しいReleaseからの再実行は未編集の所有ファイルのみ更新します。旧手順でコピー済みなど、所有記録のない既存フォルダは内容が同じでも拒否します。ファイルや記録を勝手に削除せず、別の場所へ退避して比較してから利用者が移行を判断してください。

1スキルだけ導入・追加・更新するには `--skill` を指定します。複数回指定できます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness authoring install --project "/path/to/project" --skill inspect-harness
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness authoring uninstall --project "/path/to/project" --skill inspect-harness
```

`--skill` を省略すると4スキルすべてを対象にします。全対象の確認後に一括変更するため、1つでも競合があれば他の対象も変更しません。所有するスキルに追記・編集・削除があると、更新・解除を拒否してその内容を保持します。無関係なスキルやプロジェクトファイルは残します。

個人用に使う場合は `--skills-dir` にスキル親ディレクトリを明示できます。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness authoring install --skills-dir "/absolute/user/home/.codex/skills" --skill inspect-harness
```

同名スキルをプロジェクト用と個人用の両方へ置くと、Codexで重複して表示される場合があります。通常はプロジェクト用を選びます。導入CLIは既存スキルを自動マージしません。

## 確認範囲

自動テストで、4スキルの一致、独立導入、再実行、部分更新・削除、既存指示の保持、未所有・編集済みフォルダの拒否、失敗時の復元を確認します。実際のtarballをnpxで起動する検証も含みます。実行済みOS・制約は [VALIDATION.md](../VALIDATION.md) を参照してください。

以前のdownload方式では、macOS上で `3a861ce9cacbb954601dc373a3e89dbe6cdd516e` の4スキル8ファイルの一致を確認しました。この歴史的確認は、現在のCLIによる全OS検証を代替するものではありません。
