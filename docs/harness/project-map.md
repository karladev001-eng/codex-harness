# プロジェクト案内

- `SPEC.md`: 仕様の正本。役割、機能切替、PC間引継ぎ、検証条件。
- `plugins/codex-harness/`: 配布用プラグイン。
- `plugins/codex-harness/skills/harness/`: 自己完結したスキル、Python補助ツール、役割参照、雛形。
- `scripts/harness.py`: 開発リポジトリから使う入口。
- `tests/`: 一時ホーム・使い捨てGitリポジトリによる検証。
- `VALIDATION.md`: 確認済み事項と未検証事項。

検証: `python3 -m unittest discover -s tests -v`。

このプロジェクトは空のフォルダから作成した。初期実装は担当ファイルを分けて進め、worktree動作は使い捨てGitリポジトリで確認した。リモートへの公開は未実施。
