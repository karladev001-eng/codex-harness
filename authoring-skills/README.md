# 既定5スキルと任意追加スキル

必要な文書を作成・確認するためのスキルです。本体のオーケストレーションやモデル設定を有効化せず、それぞれ単独で使えます。[導入手順](INSTALL.md)で既定5スキルまたは必要なものだけ選べます。`codex-slide-plan` は `--skill codex-slide-plan` を明示して追加します。本体install/updateと指定なしのauthoring操作では導入・更新・削除しません。`codex-slide-plan` は現在のcheckoutに追加済みで、配布中の0.4.2 tarballには含まれていません。対応版を配布するまでは現行のnpm `@latest` から導入できません。

| スキル | 依頼例 | 成果物 |
| --- | --- | --- |
| [`create-rulebooks`](create-rulebooks/SKILL.md) | 「本番データを触る変更には復旧手順を残す、という規則を作って」 | 継続して使うMarkdown規則 |
| [`create-subagent`](create-subagent/SKILL.md) | 「リリース候補を確認して証拠を返す担当を定義して」 | 再利用可能な担当定義。起動は行わない |
| [`create-harness`](create-harness/SKILL.md) | 「規則と担当を必要な順でつなぐ最小の調整手順を作って」 | 索引・必要な規則/担当/ワークフロー |
| [`inspect-harness`](inspect-harness/SKILL.md) | 「今のルール、担当、作業手順を変更せず見せて」 | 構成と確認できる状態の説明 |
| [`codex-html-plan`](codex-html-plan/SKILL.md) | 「実装前の仕様とUIモックを単一HTMLで提示して」 | `.src.html` とpack済み `.plan.html`。仕様回答と実装承認を分ける |
| [`codex-slide-plan`](codex-slide-plan/SKILL.md) | 「この調査結果を発表用のスライドと話す原稿にまとめて」 | HTMLスライドとHTMLレビュー。話の流れ、発表原稿、図表の出典、自由配置とマスターを同じ正本で管理 |

Codexでは `$inspect-harness` のように明示して依頼できます。作成用3スキルを併用するなら、`create-harness` で最小索引を作り、必要なときだけ規則や担当を追加します。単発の結果・会議メモを恒久ルールへ変換しません。

## 必要な環境と導入の影響

全スキルにスキル対応のCodexが必要です。最初の4つは独立したMarkdown、`codex-html-plan`はNode.js 22以上のpack runtimeとApache-2.0由来部分を含みます。`codex-slide-plan` はHTMLレビュー用pack runtimeを含み、PPTX/PDF書出しは行いません。導入CLIにはNode.js 22以上とnpmが必要です。PPTX/POTXの構造読取りだけはPython 3を使い、通常のHTML制作には不要です。原本の表示確認には利用可能なレンダラーを使います。

既定のCLI導入先は `<project>/.agents/skills/`。本体runtimeへの依存、個人用AGENTS.mdやモデル設定の変更、Chrome/Raycastの登録は行いません。手動でフォルダをコピーする方法もありますが、CLIの所有記録がない既存フォルダをinstallで引き継ぐことはできません。[更新と競合](INSTALL.md#更新削除と個別選択)を確認してください。

## 作成するMarkdownの配置

| 種別 | 既定の保存先 |
| --- | --- |
| 索引 | `HARNESS.md` |
| 規則 | `harness/rulebooks/<id>.md` |
| 担当 | `harness/subagents/<id>.md` |
| 手順 | `harness/workflows/<id>.md` |

明示指定、AGENTSなどが参照する既存索引、`HARNESS.md`の順で入口を解決します。指定された名称・場所と既存内容を優先し、使わないフォルダは作りません。定義間のリンクはその文書からの相対パスです。

これらのMarkdown自体は担当の自動起動、ホストへの登録、権限付与、設定変更を行いません。「運用可能にして」と依頼された場合のみ、必要ならプロジェクトAGENTSに最小の参照を作ります。`inspect-harness`は変更しません。

## 詳しい資料

[単独導入・確認・更新・解除](INSTALL.md)・[全体の文書索引](../docs/README.md)・[検証記録](../VALIDATION.md)・[出典と個別ライセンス](../THIRD_PARTY_NOTICES.md)。各スキルのSKILL.mdを実行手順として参照してください。
