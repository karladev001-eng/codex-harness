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

検証: `npm ci`、`npm test`。配布物作成: `npm pack`。配布は非公開GitHub Releaseのtarballを使う。個人用設定や認証情報は含めない。
