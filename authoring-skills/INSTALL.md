# Authoring Skills を既存プロジェクトへ導入する

`create-rulebooks`、`create-subagent`、`create-harness`、`inspect-harness` を、任意の既存プロジェクトで使えるようにする手順です。リポジトリ全体を clone する必要はありません。導入先はプロジェクトの `.agents/skills` です。[Codexのプロジェクト用スキル](https://learn.chatgpt.com/docs/build-skills)として、この配置を検出します。

この4スキルはOS固有のコードを含まないMarkdownです。利用先のCodexがスキルに対応していれば、macOS、Windows、Linuxで使えます。macOSでの導入は作成用3スキルについて検証済みです。WindowsとLinuxは手順を用意していますが、実機での検証はまだしていません。PythonやGitを使う既存のCodex Harness本体とは別であり、この手順では導入しません。

## Codexへ依頼して導入する

対象プロジェクトをCodexで開き、次の文をそのまま依頼してください。`/絶対パス/対象プロジェクト` は実際の対象プロジェクトの絶対パスに置き換えます。空白や日本語などの非ASCII文字を含むパスでも構いません。

> Codex標準の skill-installer を使い、非公開リポジトリ `karladev001-eng/harness` の `authoring-skills/create-rulebooks`、`authoring-skills/create-subagent`、`authoring-skills/create-harness`、`authoring-skills/inspect-harness` を、`/絶対パス/対象プロジェクト/.agents/skills` に download 方式で導入してください。リポジトリを clone せず、`--method download`、`--ref main` を指定してください。認証情報は表示・保存せず、既存の `GITHUB_TOKEN` または `GH_TOKEN` があれば使い、なければ `gh auth token` の値をこの導入用の子プロセスにだけ渡してください。既存の導入先を上書きせず、競合時は停止して報告してください。

この依頼は、4スキルをプロジェクトへ配置するだけです。ハーネスの規則、担当定義、実行手順を新たに生成する作業は、導入後に各スキルへ依頼します。`inspect-harness` は構成を変更せずに確認します。導入後は、そのプロジェクトを開いたままスキルを使う依頼をします。

### 作成用3スキルへ確認用スキルを追加する

すでに `create-rulebooks`、`create-subagent`、`create-harness` が同じ導入先にある場合は、それらを削除または再導入する必要はありません。`--path` を `authoring-skills/inspect-harness` だけにして、同じ `--dest` へ追加します。Codexには次のように依頼できます。

> 既存の作成用3スキルを残したまま、Codex標準の skill-installer で `authoring-skills/inspect-harness` だけを同じ `.agents/skills` へ download 方式で追加してください。`--ref main` を使い、既存のスキルを上書きせず、競合時は停止して報告してください。

## 手動で導入する

導入先に同名の `create-rulebooks`、`create-subagent`、`create-harness`、`inspect-harness` がないことを先に確認してください。標準ヘルパーは同名の導入先を自動マージせず、既存の場合は上書きを拒否して停止します。必要なら、内容を比較して別の場所へ退避するなど、利用者が判断してから再実行してください。

このリポジトリは非公開です。GitHubへのアクセス権が必要です。既に `GITHUB_TOKEN` または `GH_TOKEN` が設定されていればそのまま利用します。どちらもない場合は、`gh auth login` 済みの GitHub CLI が必要です。下記の手順はトークンを画面表示やファイル保存せず、ヘルパーを起動する子プロセスにだけ渡します。

### macOS / Linux

`TARGET_PROJECT` を対象プロジェクトの絶対パスへ設定します。引用符を外さないでください。

```sh
TARGET_PROJECT="/absolute/path/to/your project"
python3 --version
python3 - "$TARGET_PROJECT" <<'PY'
import os
from pathlib import Path
import subprocess
import sys

target = Path(sys.argv[1])
codex_root = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
helper = codex_root / "skills/.system/skill-installer/scripts/install-skill-from-github.py"
if not helper.is_file():
    raise SystemExit("Codex の skill-installer が見つかりません。Codex で導入を依頼してください。")
env = os.environ.copy()
if not (env.get("GITHUB_TOKEN") or env.get("GH_TOKEN")):
    try:
        token = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit("GitHub CLI の認証が必要です。gh auth login を実行してください。")
    if not token:
        raise SystemExit("GitHub CLI の認証が必要です。gh auth login を実行してください。")
    env["GH_TOKEN"] = token
subprocess.run([
    sys.executable, str(helper), "--method", "download",
    "--dest", str(target / ".agents" / "skills"),
    "--repo", "karladev001-eng/harness",
    "--ref", "main",
    "--path", "authoring-skills/create-rulebooks",
    "authoring-skills/create-subagent", "authoring-skills/create-harness",
    "authoring-skills/inspect-harness",
], env=env, check=True, shell=False)
PY
```

`python3` は 3.9 以上が必要です。スクリプトはCodex同梱の標準ヘルパーが存在することを確認し、`--method download`、`--dest`、4つの `--path`、`main` の `--ref` を指定して起動します。新スキルを含まない旧基点 `f3dd51d7e6a2fd77cab98b016a8c78148fff80fe` は使いません。再現性が必要な場合は、新スキルを含むコミットIDに `main` を置き換えます。`gh auth token` が失敗した場合は導入を停止します。GitHub CLIで認証するか、アクセス権のあるトークンを既存環境変数として設定してからやり直してください。認証用のPython起動処理は、取得したトークンを自身のメモリと導入ヘルパーの子プロセスだけで使い、親シェルの環境は変更しません。

### Windows PowerShell

`$targetProject` を対象プロジェクトの絶対パスへ設定します。PowerShellの文字列として扱うため、空白や非ASCII文字を含められます。

```powershell
$targetProject = 'C:\absolute\path\to\your project'
$bootstrap = @'
import os, subprocess, sys
from pathlib import Path

target = Path(sys.argv[1])
codex_root = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
helper = codex_root / "skills/.system/skill-installer/scripts/install-skill-from-github.py"
if not helper.is_file():
    raise SystemExit("Codex skill-installer was not found. Ask Codex to install the skills.")
env = os.environ.copy()
if not (env.get("GITHUB_TOKEN") or env.get("GH_TOKEN")):
    try:
        token = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit("GitHub CLI authentication is required. Run gh auth login.")
    if not token:
        raise SystemExit("GitHub CLI authentication is required. Run gh auth login.")
    env["GH_TOKEN"] = token
subprocess.run([
    sys.executable, str(helper), "--method", "download",
    "--dest", str(target / ".agents" / "skills"),
    "--repo", "karladev001-eng/harness",
    "--ref", "main",
    "--path", "authoring-skills/create-rulebooks",
    "authoring-skills/create-subagent", "authoring-skills/create-harness",
    "authoring-skills/inspect-harness",
], env=env, check=True, shell=False)
'@
py -3 --version
$bootstrap | py -3 - $targetProject
if ($LASTEXITCODE -ne 0) { throw 'スキルの導入に失敗しました。上のエラーを確認してください。' }
```

`py -3` は Python 3.9 以上を指す必要があります。利用できない環境では、Python 3.9以上を導入してから、利用可能な実行コマンドに置き換えてください。認証用のPython起動処理は、取得したトークンを自身のメモリと導入ヘルパーの子プロセスだけで使い、親のPowerShell環境は変更しません。

## 個人用とプロジェクト用

この手順の `.agents/skills` は、そのプロジェクトを開いたときだけ使うプロジェクト用の配置です。個人用に入れたい場合は、対象を `CODEX_HOME/skills`（通常は `~/.codex/skills`）にします。個人用スキルは複数のプロジェクトへ影響するため、通常はプロジェクト用を選びます。同じ名前のスキルを個人用とプロジェクト用の両方へ入れると、利用先Codexで重複して表示されることがあります。標準ヘルパーは両者を自動マージしません。

導入完了後、`$TARGET_PROJECT/.agents/skills` または `$targetProject/.agents/skills` に4つのスキルフォルダが作成されます。再導入時に同名フォルダがあればヘルパーは停止します。既存ファイルを保護するため、この動作を回避するオプションは使いません。

## 確認済みの範囲

macOSで、非公開リポジトリから標準ヘルパーのdownload方式により作成用3スキルを導入しました。導入した7ファイルはソースと一致し、既存ファイルは保持され、`.git` は作成されませんでした。同じ導入先への再実行は既存フォルダの競合として拒否され、ファイルは変わりませんでした。これは旧基点での3スキルの確認です。加えて、`3a861ce9cacbb954601dc373a3e89dbe6cdd516e` から4スキルを一括導入し、8ファイルのソース一致、既存ファイルの保持、`.git` 非作成を確認しました。同じコミットから `inspect-harness` 単体を個人用スキル領域へ導入する確認も済んでいます。WindowsとLinuxでの実機またはCI確認は未実施です。
