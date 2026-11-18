# タスク: easy-setup — 新しい環境での導入を1コマンドにする

- 状態: ready
- 仕様版: 1
- コード基点: a89a296
- 担当範囲: `src/setup.ts`（新規）、`src/runtime.ts`（コマンド登録・help）、`tests/setup.test.cjs`（新規）、`README.md`、`docs/guides/installation.md`、`docs/maintainers/releasing.md`、`VALIDATION.md`（記録のみ）
- 依存: なし
- 子のモデル・推論強度: 起動時に記録
- モデル選択: auto、`hosts.claude.models` の既定値（pinなし）
- ホスト候補・対応effort・取得元: Claude Code Agentの `model`（haiku/sonnet/opus）と `effort`。2026-11-18の `status --host claude`
- 選択根拠と制約: 下の「進捗」に起動ごとに記録

## 実装内容の説明・目的と対象範囲

新しいPCでの導入は今、clone・`npm ci`・build、Codex/Claudeの別々のinstall、html-planの別導入、settings.jsonの手書き、GitHub PackagesのPAT認証と手順が多い。これを次の3つで減らす。

1. **GitHub Releaseへのtgz添付**：`npm pack` したtgzをRelease `v<version>` に添付する手順を整える。利用者はtgzのURLをnpxへ直接渡せる（公開リポジトリなのでnpm認証・PAT不要）。
2. **`setup` コマンド**：Codex導入、Claude Code導入、html-plan導入、記憶共有設定の追記、gh認証の確認、最後の状態確認を1回で行う。再実行が更新。
3. **README/導入ガイドの差し替え**：新しい手順を先頭に置き、GitHub Packages経路は補足へ。

対象外：GitHub Packagesへの送信、npmjs公開、ライセンス変更、自動更新、`gh auth login` やCLIログインの代行、Codex/Claude CLI本体の導入。Releaseの実作成は実装・検証後に親がユーザーへ確認してから行う（このパケットの実装範囲には含めない）。

## 利用者から見た振る舞い・入出力・異常時

```sh
npx --yes --package https://github.com/karladev001-eng/codex-harness/releases/download/v0.5.0/karladev001-eng-codex-harness-0.5.0.tgz \
  codex-harness setup --knowledge-repo karladev001-eng/harness-knowledge-base
```

`setup [--home PATH] [--host codex|claude|all] [--knowledge-repo OWNER/REPO] [--knowledge-branch BRANCH] [--html-plan true|false]`

- 既定は `--host all`、`--html-plan true`、`--knowledge-branch main`。
- 手順（`--host` に応じて）：
  1. `codex`：既存の `install` と同じ処理（移行を含む）。
  2. `claude`：既存の `install --host claude` と同じ処理。
  3. `html-plan`（claude対象かつtrue）：`claude plugin list` 等で導入済みなら `unchanged`。未導入なら `claude plugin marketplace add anthropics/claude-plugins-community` と `claude plugin install html-plan@claude-community --scope user`。marketplace登録済みならaddを飛ばす。
  4. `knowledge`（`--knowledge-repo` 指定時のみ）：個人設定 `<dataHome>/settings.json` の `preferences.repository/branch/autosave=true` を追記。既存の他の項目は保持。同じ値なら `unchanged`。別のrepository/branchが既に設定されていれば上書きせず失敗として報告。tokenは書かない。
  5. `gh`（knowledge指定時）：`gh auth status --hostname github.com` を確認するだけ。未ログインなら `run_manually: gh auth login --hostname github.com` を返す。ログインは代行しない。
  6. 最後に `doctor` 相当の結果を含める。
- 出力：各手順を `{name, ok, status, ...}` で並べたJSON。1つでも失敗すれば `ok=false`・終了コード2で、失敗手順の `run_manually` を含める。前の手順の失敗で後の独立手順を止めない（Codex導入失敗でもClaude導入は試す）。
- `claude` CLIがない場合：`--host all` なら claude/html-plan 手順を `skipped`（理由付き、全体はok扱い）。`--host claude` なら失敗。
- 不正な `--knowledge-repo`（`OWNER/REPO` 形式でない）は何も変更せず終了コード1。

## 全体像（大きな実装）

非該当：単一CLIコマンドと文書の更新で、画面・複数機能群はない。

## 実装前の提示

- HTML計画スキル: 使用せず。UIのないCLI変更で、提案はチャットで具体的に提示済みのため。
- 説明・仕様の参照と版: このパケット v1。元の提案は2026-11-05のチャット（改善案1〜3、`gh release download` → `setup --host all` の3ステップ）。
- 視覚モックの参照と対応仕様版: 非該当（UIなし。CLI出力はJSON）。
- 提示証拠: 2026-11-05のチャットで改善案1〜3と最終手順を提示。
- 開始前確認: 提示した案1〜3の範囲内であることを確認。

## 受入条件

1. `setup --home <tmp>` が一時ホームでCodex導入とClaude導入（偽claude CLI）を行い、各手順の結果を返す。再実行で両方 `unchanged`。
2. html-plan未導入の偽CLIに対し marketplace add と install を呼ぶ。導入済みを示す偽CLIでは呼ばず `unchanged`。`--html-plan false` では呼ばない。
3. `--knowledge-repo` で settings.json に preferences を追記し、既存の他キーを保持する。同値の再実行は `unchanged`、別値が既にあれば変更せず失敗を報告する。`--knowledge-repo` 省略時は settings.json に触れない。
4. gh未ログイン（偽gh）で `ok=false`・終了コード2・`run_manually` に `gh auth login` を含む。ghを使ったログインは試みない。
5. claude CLIがないとき、`--host all` はclaude系をskippedにして成功、`--host claude` は失敗。
6. 不正なknowledge-repoは何も書かず終了コード1。
7. `--help` と導入ガイドに `setup` が載る。READMEの「導入して使う」は Release tgz URL + `setup` を先頭に示し、GitHub Packages経路は補足にする。
8. releasing.md に、tgz作成・SHA-256記録・`gh release create v<version> <tgz>` の手順と、作成前に確認する事項を書く。
9. `npm test` と `npm run check:docs` が通る。既存のinstall/uninstallの挙動は変えない。

## 制約と参照

- 既存の `install`（`src/install.ts`）、`installClaude`（`src/claude.ts`）、`dataHome`・`mergeSettings`（`src/lib.ts`）を再利用する。所有管理・rollbackを弱めない。
- 外部CLI呼び出しは `spawnSync` + `shell: process.platform === 'win32'` の既存パターンに合わせる。テストは偽CLIをPATHに置く既存パターン（`tests/claude-plugin.test.cjs`）に合わせる。
- 版は0.5.0のまま（未配布のため）。VALIDATIONには新しい候補であることを記録する。
- Codex Harnessのコード・コメントの文体（英語コメント、短い関数）に合わせる。

## 未解決事項

なし。既定値（host=all、html-plan=true、branch=main、版0.5.0のまま）は提案の範囲内で親が決めた。

## 実装承認

- 承認状態: approved
- 対象仕様版・範囲: 改善案1〜3（Release添付手順・setupコマンド・README/導入ガイド差し替え）。Releaseの実作成は含まない。
- ユーザー発言根拠: 2026-11-18「はい、1〜3を実装してください」
- 親仕様・承認の継承: なし

## 進捗・完了

- 2026-11-18: パケット作成。
