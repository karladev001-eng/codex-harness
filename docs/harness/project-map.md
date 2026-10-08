# プロジェクト案内

- `SPEC.md`: 仕様の正本。役割、機能切替、PC間引継ぎ、検証条件。
- `src/`: TypeScript実装。`runtime.ts` はCLI・タスク・worktree・計測、`lib.ts` は設定と共通処理、`install.ts` と `authoring.ts` は所有確認付き導入。
- `plugins/codex-harness/`: プラグインmanifest、スキルMarkdown、役割参照、雛形のソース。
- `authoring-skills/`: 独立した作成・確認用4スキル。
- `scripts/build.cjs`: TypeScriptをコンパイルし、自己完結した `dist/skill/` と `dist/plugins/codex-harness/` を生成。
- `dist/skill/runtime.js`: ビルド後のCLI入口。npm tarballは `codex-harness` コマンドを提供。
- `tests/`: 一時ホーム・使い捨てGitリポジトリ・実tarball/npxによるNodeテスト。
- `.github/workflows/test.yml`: Node.js 22・macOS/Linux/WindowsのCI。
- `VALIDATION.md`: 確認済み事項と未検証事項。
- [ADR 0002](../adr/0002-github-knowledge-base.md): GitHubを正本とするPC向けナレッジベースの設計判断。保存内容、同期、意味検索、キャッシュ、ハーネス連携の設計。保存・文字検索・段階取得は実装済み、意味検索は対象外。

検証: `npm ci`、`npm test`。配布物作成: `npm pack`。配布は非公開GitHub Releaseのtarballを使う。個人用設定や認証情報は含めない。

- `src/preferences.ts`: local/GitHub制作記録のCLI、gh transport、保存先別cache/pending、SHA/CAS、明示移行。
- `tests/preferences.test.cjs`: 隔離ホーム・偽transportによる競合/失敗/フラグ/移行検証。実remote書込なし。
- `docs/adr/0003-github-improvement-records.md`: 小さな制作記録の共有段階。ページ収集・検索は対象外。

- `knowledge/`: Chrome MV3拡張、Native Messaging host、耐久operation、gh Git Data API保存。配布は `dist/knowledge/`。
- `tests/knowledge.test.cjs` / `tests/fixtures/knowledge-browser.html`: 保存・失敗・再起動・競合・実DOM/mock popup検証。
- [ADR 0004](../adr/0004-chrome-knowledge-capture.md): ADR0002の保存部分の具体化。文字検索と段階取得はADR0005/0006で実装。

- [ADR 0006](../adr/0006-knowledge-retrieval.md): 保存資料の検索・本文部分取得・JPEG取得と制作への必要時参照。

- [codex-html-planの計画](tasks/codex-html-plan.md): Codex用の対話型HTML仕様スキル。仕様v2の実装・導入完了。[完成サンプル](../../authoring-skills/codex-html-plan/examples/task-board.plan.html)と開き方は計画の完了記録を参照。

- [公開向けリポジトリ整理の仕様案](tasks/repository-public-readiness.md): README・導入導線・詳細ガイドの整理。仕様v2/承認済み・整備完了。外部公開は対象外。

- [npm配布の仕様と検証](tasks/npm-distribution.md): clone不要の導入・更新。仕様v2（GitHub Packages非公開）・N1–N4の準備完了、159テストと独立レビューPASS。実配布は別工程。
