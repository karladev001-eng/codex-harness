# 検証記録

実施日: 2026-09-26 / macOS arm64 / Node.js 26.9.0、22.23.3 / npm 12.0.2。

TypeScriptへの移行と、コンパイル済みnpm tarballによる非公開GitHub配布を検証しています。旧Python版の確認結果は [2026-09-21の記録](docs/history/validation-python-v1.md) に保持しています。

## 自動テスト

実装担当の報告では `npm test` が39件成功し、Node.js 22.23.3でも同じ39件が成功しました。統合worktreeでもNode.js 26.9.0で `npm ci`、`npm test` を実行し、39件すべてが成功しました。Nodeの実行パスを明示して検証しており、npxの起動先バージョンも確認します。

- 設定の階層、型、schema、全OFF時の無書込み、既存の保存先ハッシュ
- 依存関係の欠落・循環、永続化OFF、Windows形式を含む不正scope、欠けた末尾を持つシンボリックリンクからの逸脱防止
- コミット済み基点からのworktree隔離、調整用文書・設定のdirty除外、コード保全、衝突と保存済み基点不一致
- 利用枠の欠測・重複・窓変更・減少の除外、日時の暦検証とマイクロ秒精度
- グローバル導入・更新・解除、冪等性、独立した4 authoringスキルの導入・部分選択・解除
- CRLF、BOM、日本語、無関係な指示・設定のバイト単位保持、既存CODEX_HOMEと明示home/skills-dir
- 旧Python版schema-1所有manifestと静的ファイルfixtureを使う移行。Pythonは実行せず、旧版のファイル編集・入口編集を拒否
- ソースの必須ファイル不足、フォルダ重複、未所有・編集済みファイル、追加ファイル、symlinkの拒否
- AGENTS・manifest書込み前後の失敗、更新・解除の復元。復元自体が失敗する場合は回復用ファイルを残し、その場所を報告
- コピー済みスタンドアロン・プラグインのリポジトリ外実行（親がES Modules形式でも動作）
- 実際の `npm pack` tarballを、別プロジェクト・隔離npmキャッシュで `npx --offline` 実行。TypeScript・Python・ネットワークなしでstatus/doctor、導入・解除、authoring導入・解除
- npxキャッシュ削除後にも恒久導入先のruntime.jsが動作し、個人用入口がキャッシュを参照しないこと

旧22テストの機能をNodeテストへ移し、旧実装・旧テストの `.py` は削除しました。移行用の旧ファイルは `tests/fixtures/legacy-schema1.json` 内の実行しないデータとして保持しています。TypeScript・型定義はdevDependenciesのみです。配布物の実行時依存はありません。

## 配布物

統合検証で `npm pack --pack-destination /private/tmp/harness-typescript-integrated` を実行し、`/private/tmp/harness-typescript-integrated/karladev001-eng-codex-harness-0.2.0.tgz` を生成しました。中にはCLI、自己完結した `dist/skill/`、manifestを含む `dist/plugins/codex-harness/`、4 authoringスキルと文書が入ります。ソースの `.py`、TypeScriptソース、node_modulesは配布に含みません。`npm ls --omit=dev --depth=0` は空で、実行時production依存がないことも確認しました。Release用のchecksumは配布物とは別の `SHA256SUMS.txt` で提供します。

パッケージは `private: true` です。公開npmへのpublishはせず、非公開GitHub Releaseから認証付きで取得して `npx --yes --package ./archive.tgz codex-harness ...` で使います。Releaseへの添付・実際の個人ホームへの更新は、独立レビュー・統合後の配布工程で行います。この実装検証では個人ホームを変更していません。

## CI・制約

`.github/workflows/test.yml` にNode.js 22のubuntu-latest、windows-latest、macos-latestで `npm ci`、`npm test`、`npm pack` を行うmatrixを追加しました。private branch CI run [36236798775](https://github.com/karladev001-eng/harness/actions/runs/36236798775) は、いずれのOSでもstep開始前に停止しました。GitHubは最近のアカウント支払い失敗、またはspending limit増額が必要と報告しました。請求設定は変更していません。このためWindows/Linuxは未検証です。symlink作成権限に依存する4テストはWindowsでスキップします。

- Windows/LinuxでのCI結果、別物理PC上のCodex検出・新規セッション再開は未確認。
- 実装の独立レビューはPASS。統合検証はNode.js 26.9.0で `npm ci`、39件の `npm test`、`npm pack`、standalone/plug-in同梱物の確認をPASSとする。最終整合性レビュー、private GitHub配布、実個人ホームの安全な更新は調整担当のdelivery工程で保留する。
- 旧版の実エージェント並列・独立レビュー・再開の結果は歴史的証拠として保持し、今回のモデル実行検証とは扱わない。
- 利用枠削減、大規模アプリ品質、競合解消性能は未計測。

状態遷移・レビュー判定・エージェント上限はスキルの運用手順であり、補助CLIによる強制ではありません。利用枠残量はアカウント共通で、タスク単位の正確な費用として扱いません。
