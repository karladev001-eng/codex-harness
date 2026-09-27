# Codex Harness

仕様を中心に引き継ぎ、軽量モデルによる実装と独立レビューを組み合わせる、個人用Codexハーネスです。独立したタスクはGit worktreeで隔離して並列実行します。

**これはCodexが読む実行手順とローカル補助ツールです。常駐型の自動実行サービスではありません。** モデル起動・並列化・レビューはCodexの利用可能なツールで行います。利用枠の削減効果は未計測です。

仕様の正本は [SPEC.md](SPEC.md) です。全体構成の判断は [ADR](docs/adr/0001-portable-skill-harness.md)、検証結果は [VALIDATION.md](VALIDATION.md) を参照してください。

## 必要な環境

- Node.js 22以上とnpm（実行時の追加依存なし。TypeScriptコンパイラとPythonは利用者には不要）
- Git（隔離した並列実装に使用）
- スキルとサブエージェントを利用できるCodexアプリ
- 親の会話を渡さない起動、モデル指定、担当別作業ディレクトリを扱える実行環境

モデルやサブエージェントの利用可否はアカウント・ホストで異なります。補助ツールの診断だけでモデル利用権を保証するものではありません。Windows PowerShellでも `node` と `npx` を使います。macOS以外の実機検証状況はVALIDATION.mdに記載します。

## 別のPCに導入する

非公開GitHub Releaseのコンパイル済みnpm tarballを取得します。GitHubアクセス権と認証済みGitHub CLI（`gh auth login`）が必要です。リポジトリのcloneや公開npmレジストリへの公開は不要です。macOS/LinuxとWindows PowerShellで同じコマンドを使えます。

```sh
gh release download v0.2.0 --repo karladev001-eng/harness --pattern "*.tgz"
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness doctor
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness install
```

セットアップは自己完結したJavaScript実行物・Markdown・assetsを `~/.agents/skills/codex-harness` へコピーし、Codexの個人用AGENTS.mdに小さな入口を追加します。入口は恒久的な導入先の `runtime.js` を参照し、npxキャッシュに依存しません。既存の設定・指示は保持します。**この導入経路は単体スキルの登録です。プラグイン一覧への登録とは別です。** コンパイル済みプラグインもtarball内の `dist/plugins/codex-harness/` に含まれます。開発元の `plugins/` はMarkdown・manifestのソースで、単独では実行用配布物ではありません。

導入後は新しいCodexタスクで実装を依頼してください。通常のコード変更依頼に適用し、委譲された子エージェントは担当作業だけを行います。ハーネスのプラグイン版と単体スキル版を重複して有効化しないでください。

個人用の設定や認証情報はGitに含めません。別のPCではCodexのログイン・ツール接続を個別に設定してください。

Git clone をせず、既存プロジェクトに作成用の `create-rulebooks`、`create-subagent`、`create-harness` と確認用の `inspect-harness` を入れる方法は、[Authoring Skills の導入手順](authoring-skills/INSTALL.md)を参照してください。これはハーネス本体とは別の、Markdownだけで構成された4スキルです。

## 動作と設定

```sh
node "$HOME/.agents/skills/codex-harness/runtime.js" status --project "/path/to/project"
```

設定は、標準値 → 個人設定 → プロジェクトの `.harness.json` の順で上書きします。個人設定は通常 `~/.codex/harness/settings.json`、`CODEX_HOME` が設定されている場合はその配下です。

```json
{
  "schema_version": 1,
  "enabled": true,
  "delegation": true,
  "review": true,
  "persistence": true,
  "measurement": true,
  "max_agents": 3
}
```

- `delegation`：実装を子エージェントへ委譲。ON時は小変更でも委譲します。
- `review`：すべての実装を独立レビューし、統合後の整合性も確認します。
- `persistence`：仕様・タスク進捗・重要な判断をプロジェクトに保存します。
- `measurement`：明示的に取得できた利用情報・時間・手戻りを記録します。
- `max_agents`：実装・調査・レビューが共有する子の同時稼働上限。ホスト上限を超えません。

`enabled: false`、または４機能をすべてOFFにすると、状態確認だけで通常の作業へ戻ります。追加の分業・記録・計測を行わず、過去の成果物は削除しません。

メインには `gpt-6-astra` を希望します。ただし、このスキルからメインのホストモデルは自動変更できません。ホストの現在値が異なる場合は、その差を報告します。子の標準割当は `deterministic` が `gpt-6-luna/low`、`standard` が `gpt-6-sol/medium`、`complex` と `review` が `gpt-6-sol/high` です。

子はまず作業の性質でモデルを選びます。答えと確認方法が明確な作業や範囲を絞った調査は、複数ファイルでもLunaを選べます。開かれた設計・構成判断、重要なレビュー、リスクの高い問題はSolです。その後、必要な品質に応じて推論強度を独立に選びます。単純で客観的に確認できる作業は `low`、通常は `medium`、厳密な検討やレビューは `high`、例外的な品質が必要な場合だけ理由付きで `xhigh` または `max` を使います。モデルが対応する強度に限ります。`models` 設定とユーザーの明示指定を確認し、選択したモデル・強度と理由をタスクに記録します。利用できない値へ黙って代替しません。

## 作業の流れ

1. メインが目的、受入条件、対象範囲、依存関係を確定します。
2. 独立したタスクを、履歴を引き継がない実装担当へ割り当てます。
3. 担当ごとのworktreeで実装と必要なテストを行います。
4. 別担当が実際の差分と受入条件をレビューします。
5. 統合担当が承認済み変更をまとめ、結合検証と統合後レビューを行います。
6. 完了条件を満たした時点で、結果と証拠への参照を保存します。

未コミットの変更を勝手に捨てたり、stashしたりしません。新しいworktreeへ含める必要がある変更は、ユーザーが選んだチェックポイントを使います。Gitを使っていないプロジェクトは順次実行します。

修正・再レビューは２巡までとし、解決しない場合はメインへ判断を戻します。外部へのpush、PR作成、マージは別途依頼された範囲でのみ行います。

## 記録とPC間の引継ぎ

`docs/harness/` にタスク仕様、主要ファイルへの案内、ADRを保存します。全フォルダへのREADME生成や、全会話のコピーは行いません。長い実行ログと計測値はPC内に保存します。

別PCへ移る前にコードとタスク記録を保存・同期し、新しいCodexタスクで対象タスクIDからの再開を依頼してください。起動中のエージェントやworktreeは同期されません。自動compactと会話削除はv1の対象外です。

## 更新・削除

更新先Releaseのtarballを取得し、そのパッケージの `install` を再実行します。旧Python版のschema-1所有記録も読み取り、未編集の導入はPythonを実行せず移行します。管理対象のファイルや入口が編集されていれば、更新・解除を拒否します。更新前のスキルと指示は `$CODEX_HOME/harness/backups/` に残ります。JavaScript版同士の差し戻しは希望するReleaseの `install` を使います。旧Python版へ戻す場合はJavaScript版で解除してから旧版の手順を使います。

```sh
npx --yes --package ./karladev001-eng-codex-harness-0.2.0.tgz codex-harness uninstall
```

解除するのはハーネス所有の入口とスキルです。個人設定、プロジェクト仕様、ADRは残ります。

## 開発・検証

```sh
npm ci
npm test
node dist/skill/runtime.js --help
npm pack
```

開発にはTypeScriptのdevDependenciesを使います。`npm pack` は先にビルドし、コンパイル済みJavaScript・4 authoringスキル・プラグインを格納します。`private: true` によりnpm公開は拒否されます。tarballを非公開GitHub Releaseへ添付して配布します。

テストは一時ホームと使い捨てGitリポジトリで行い、実際のCodex設定は変更しません。`--home` オプションで導入先のユーザーホームを隔離できます。実際の引数は各サブコマンドの `--help` を参照してください。

利用枠の比較は通常実行とハーネス実行を、同じ開始状態のタスクで実施します。他の作業と重なった記録や利用枠のリセットをまたぐ記録は比較から除きます。未知の値は欠測として扱い、トークン数から利用枠へ換算しません。

## 参考

[everything-claude-code](https://github.com/worldflowai/everything-claude-code) のタスク別オーケストレーション、構造化された引継ぎ、独立レビューを参考にしています。実装・指示文は独自に作成し、Claude固有の設定やhooksをそのまま移植していません。

今のハーネスのルールとエージェント一覧を見せてほしい場合は、`inspect-harness` を使います。
