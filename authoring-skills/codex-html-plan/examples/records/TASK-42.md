# TASK-42: 担当絞り込み

- 計画ID: TASK-42
- 仕様版: 2
- 対象範囲: 全体: 仕様1–3とAC1–4
- 承認状態: pending
- 承認根拠: 未受領（試用サンプル）

## 確定仕様

1. 全件と自分の担当を切り替え、担当IDと利用者IDの一致で表示を選ぶ。
2. 全件・担当あり・担当なし・読込中・失敗の各画面と復帰操作を示す。
3. 全件へ戻す際、取得済みデータを使う。

受入条件: AC1=仕様1の表示切替、AC2=仕様2の状態/復帰、AC3=仕様3の不要な再取得なし、AC4=390pxの操作。
未解決事項: なし。対象外: 認証、API契約、通知、フィルタ永続保存。

## 関連リンク

- [仕様HTMLとモック](../task-board.plan.html): 同じ計画ID/仕様v2。
- [ADR-07](ADR-07.md): 既存APIを維持する決定。
- [EXP-03](EXP-03.md): 狭幅の確認計画。
- [記録体系](index.md)

## HTMLの開き方

macOS・zsh。実行ディレクトリは、現在利用している `codex-html-plan` のスキルルート（`SKILL.md` があるディレクトリ）。導入先やコピー先でも、このディレクトリに移動して実行する。

```sh
open "examples/task-board.plan.html"
```

Linuxなら同じディレクトリで `xdg-open "examples/task-board.plan.html"`、Windows PowerShellなら `Start-Process ".\examples\task-board.plan.html"`。
コマンドの記載は実行や実装開始の許可ではない。
