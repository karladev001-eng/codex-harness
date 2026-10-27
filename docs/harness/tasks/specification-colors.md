# 仕様書の固定配色

- ID: specification-colors / 版1 / 2026-10-24 Asia/Tokyo
- 目的: 仕様書で文字と背景が同化する問題を修正し、今後の作成でも再発させない。
- 範囲: codex-html-planの共通CSS・作成ルール・配布サンプル、knowledge-autosaveの確認用HTML、導入済みの対応スキル。
- 直接の指示根拠: knowledge-autosave仕様v1の提示後、ユーザーが「仕様書のフォントと背景の色が似ていて見にくい」「仕様書作成時の色彩設計を固定化してください」と指示。
- この明示的な文書修正・固定化の指示の範囲で進める。元のknowledge-autosave S1–S5/AC1–12は未承認・未実装のまま。
- 仕様提示: 白系背景と濃い文字へ固定、背景/文字を対で指定、共通トークン利用とコントラスト確認、製品モックの配色は別に保つ旨を今回の会話で提示。

## 受入条件

1. C1: 仕様書の外枠・概要・カード・補足・表・リンク・操作部は明るい背景と濃い文字の固定配色。OSの明暗や既存data-themeによって自動反転させない。
2. C2: 本文は背景とのコントラスト7以上、補足・リンク・状態表示は4.5以上を内部基準とする。既存の端末モックなど独立した暗背景は文字色を対で指定する。
3. C3: 共通の短い配色ルールを作成入口から必ず参照でき、局所の背景色だけを固定して文字色を継承する作りを防ぐ。本文フォントの種類や製品モックのデザインを勝手に変更しない。
4. C4: 現在のknowledge-autosave HTMLを同じファイルへ再packし、内容・仕様版1・承認pendingと既存回答identityを維持する。配布サンプルにも共通修正を反映。
5. C5: コントラストの関連検証と独立レビューを行い、既存導入を壊さず正規導入で今後の生成へ反映。ブラウザ/実機表示が確認できない場合は未検証と区別する。
6. C6: 今回の明示的な継続指示を、仕様書作成の用途に限定した指針として既存GitHub記録に保存する。自作の具体的色値をユーザーが指定した好みに変換しない。修正後のユーザー評価はunknown。

## 作業・検証

- 実装と独立レビューを別担当にし、既存未commit差分を保持。変更は今回の配色・ルール・関連検証に限定し、commit/reset/stashなしで直列作業。
- 記憶更新はrecord-keeperが唯一writer。ソース編集とは別領域で行う。
- 共通CSSのprefers-color-schemeによる自動暗色化と、現HTMLの白いカード背景の組合せを原因としてコードで確認。
- ブラウザのfile URLとCodexアプリへのCUAアクセスはホストが拒否。別経路によるUI操作の迂回はしない。静的な色計算・pack・ローカル表示用ファイルで検証を進める。
- 利用枠/トークン: 未取得(null)。

## 完了記録（2026-10-25 Asia/Tokyo）

- C1–C6: 完了（ブラウザ/実機の視覚確認は未検証という制限付き）。実装担当spec_colors_impl、独立review担当spec_colors_review、保存担当spec_colors_record。各担当は履歴なし・再委譲なし、Sol6.1 medium/レビューhigh。ホストのcollaboration候補・対応effortを確認して選択。既存未commit差分を今回前baselineと区別して保持した。
- 原因: OS darkで共通文字色が明るく反転し、局所の白い概要/カード背景が残っていた。
- 共通CSSはlight固定。paper `#f8fafc` / card `#ffffff` / sunk `#eef2f6`、本文 `#172033`、補足 `#334155`・`#475569`、リンク `#1d4ed8`。フォント定義と製品モックは保持。soft背景、hover、disabled/削除、暗い端末/引用も点検した。
- 相対輝度コントラスト: 本文/基本背景15.55、本文/白カード16.27、補足/基本背景7.24、リンク/基本背景6.41。共通9背景で本文最低12.80、補足/リンク/状態8色×9背景で最低5.27。
- [固定配色ルール](../../../authoring-skills/codex-html-plan/references/color-design.md)を作成入口SKILLから必読参照。配布のinstall/authoring/package必須列挙へ追加。
- knowledge-autosaveとサンプルのplan.htmlを再pack、警告0。元HTMLはstyle以外が今回前baselineとbyte一致し、仕様v1/pending/回答identityを保持。独立再packもbyte一致。
- html-plan11件、authoring/install43件、package2件、計56件PASS。最初のpackage直接実行2件はnpm_execpath前提で失敗したため、npm環境下で同じ2件を再実行してPASS。暗背景の定数テストというレビュー提案を実CSSのselector抽出とメモリ内mutation4例へ改め、独立再レビューPASS。
- 本PCの本体同梱版と単独`~/.codex/skills/codex-html-plan`を正規installerで更新。メインは既存版に今回6ファイルだけ差分を加えたステージから導入し、他作業の未commit変更を混入させなかった。backup `/Users/kan/.codex/harness/backups/install-EeBbga`。本体108ファイル/単独18ファイルの所有manifest一致、CSS/ルール/SKILL/サンプルのソース一致を確認。bootstrap・個人設定は保持。
- 導入済みruntimeで現仕様を再packして元plan.htmlとbyte一致を確認。Codexのローカルファイル表示へ同じHTMLを再提示（open結果queued）。ブラウザ/画面操作での視覚確認は環境制限により未実施。
- 継続指針は正規read→revision付きwrite→fresh readで既存GitHubへ保存。観察 `F-specification-colors-20261024`、指針 `G-specification-readable-fixed-palette`、ok=true/exit0/pending=false/freshness=fresh。revision `e03e604b825bafbb884080b5d2de85d1510f430656974cc023289a02d85eb225`。用途は仕様書、具体的hexは実装判断、修正後ユーザー評価unknown/nullを維持。
- 元のknowledge-autosave機能の実装・移行は未着手/承認pendingのまま。利用枠/トークンは未取得(null)。

関連: [元の自動保存計画](knowledge-autosave.md)、[表示HTML](knowledge-autosave.plan.html)。
