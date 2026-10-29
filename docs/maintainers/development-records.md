# 開発記録の案内

このリポジトリには、機能ごとの仕様・承認・結果、設計判断、測定の成果物が残っています。これらは **このハーネスを自分の開発に使った過程の記録** です。利用者への指示ではなく、導入や使い方は[文書索引](../README.md)のガイドを読んでください。記録は当時の状態を保存したもので、古い版番号や「未実装」の記述が現在と異なる場合があります。

ソースcheckoutにだけ含まれ、npm配布物には入りません（`docs/harness/` と `benchmarks/` は配布物から除外されます）。そのため、この文書から以下のフォルダへは相対リンクではなくパスで示します。

## 何がどこにあるか

| 場所 | 中身 | 読み方 |
| --- | --- | --- |
| [SPEC](../../SPEC.md) | 実装契約。役割、承認、worktree、計測、導入の振る舞い | 設計の全体像を知るときの正本 |
| [docs/adr/](../adr/0001-portable-skill-harness.md) | 設計判断の記録（ADR 0001〜0006）。背景・決定・影響 | 「なぜこうなっているか」を調べるとき。初期ADRの将来計画は、その後の実装状況と分けて読む |
| `docs/harness/tasks/` | 作業単位ごとのタスクパケット | 下の「タスクパケットの構成」を参照 |
| `docs/harness/previews/` | 承認前に提示した視覚モック（HTML・画像） | 実装前に何を見せて承認を得たかの証拠 |
| `docs/harness/authorizations/` | 外部モデル（Claude/Codex）へ情報を送ってよい範囲の事前承認 | 下の「送信承認の記録」を参照 |
| `docs/harness/project-map.md` | 開発履歴の入口になる案内 | 履歴をたどる起点 |
| `benchmarks/` | 実験成果物（読込量の比較、手順選択の予行など） | 下の「ベンチマークの読み方」を参照 |
| [VALIDATION](../../VALIDATION.md) | 日付・環境・対象ごとの検証証拠 | 何を確認し、何を未検証にしているかを知るとき |
| [docs/history/](../history/validation-python-v1.md) | 旧Python版の検証結果 | 現行のTypeScript版とは別の履歴 |

## タスクパケットの構成

`docs/harness/tasks/<名前>.md` は、このハーネスの手順（[作業の流れ](../guides/workflow.md)）に沿って1つの作業単位を記録したものです。典型的には次の順に読めます。

1. 見出しの要約：状態、仕様版、基点（コミット）、実効設定（どの機能がONだったか）、担当（どのモデル・強さで誰に任せたか）、作業場所。
2. 説明・目的・対象範囲：実装前にユーザーへ示した内容。
3. 受入条件：番号付き。後のレビューはこの番号に対して判定します。
4. 未解決事項：確定した仕様と分けて書く欄（なしの場合も「なし」と書く）。
5. 事前提示・今回の許可：ユーザーの承認の根拠。仕様への回答と実装承認は別に記録します。
6. 進捗・完了：実施した検証、独立レビューの結果、修正、未実施の項目。

例として、承認手順そのものを変更した記録は `docs/harness/tasks/preimplementation-approval.md` で、承認前に実装を始めない規則の導入経緯と受入条件を確認できます。

同じ名前で `.plan.html`（承認用に提示した単一HTML）、`.src.html`（そのHTMLの元）、`.json`（CLIが作るタスクパケット。例：`harness-v1.json`）、`.evidence.json`（機密を除いた実行証拠）が並ぶことがあります。承認用HTMLの作り方は `authoring-skills/codex-html-plan` のスキルです。

## 送信承認の記録

`docs/harness/authorizations/claude-send.md` と `codex-send.md` は、別のモデルへプロジェクトの情報を送ってよい範囲を、ユーザー本人の承認として記録したものです。先頭のfrontmatterは機械可読で、`peer`・`project`・`purposes`・`status`・`recorded` を持ちます。相談用のヘルパー（`plugins/codex-harness/skills/harness/consult-claude`・`consult-codex`・`codex-image`）は、それぞれ `--approval` モードでこの記録を判定します。記録がない・形式が不正・撤回済み・目的が許可されていない・`project` が実行場所と一致しない場合は、承認されていない（`approved: false`）と返します。判定は共通のテスト済みコードですが、送信の前にこれを呼ぶことは手順（`references/routing/peer-consult.md`）の指示で、ヘルパーの送信処理が自動で強制するものではありません。

この `project` は、実在する絶対パスとの一致で判定されるため、**個人環境の絶対パスのまま残しています**（他の記録は `<repo>` などの置換語に直しています）。別のcheckoutで使うときは、自分のパスに書き換えた承認記録を、自分でユーザーとして作る必要があります。この記録は承認の根拠であり、他人に使い回せる許可ではありません。

## ベンチマークの読み方

`benchmarks/` は、運用文書の読込量を減らす試みを測った成果物です。測っているのは **文書のバイト数と、モデルが手順選択で実際に読んだ量** であり、会話トークン・利用枠・速度・品質の改善ではありません。各フォルダの文書に、何を測り何を測っていないかが書いてあります。

| 場所 | 内容 |
| --- | --- |
| `benchmarks/context-routing.md` / `.json` | 入口文書とYes/No表による依頼別の読込量。`node scripts/context-routing.cjs --check` で再現確認（テストでも検査） |
| `benchmarks/context-concision/` | 本文を短くする前後の同一ファイル集合のバイト数。ファイルごとのSHA-256つき |
| `benchmarks/context-verification/` | 独立した読み手に運用文書を読ませた確認。`reading/materials` は測定に使った固定の入力資料（運用文書の写し）で、`context-concision/source-bytes.json` のSHA-256とテストで照合する。絶対パスは含まない（書き換えない） |
| `benchmarks/section-reading/` | 必要な節だけを読む補助の効果測定。コード修正では総量が増える結果（+17.99%）も、そのまま残している |

最後の例のように、期待した効果が出なかった測定も結果として残しています。数値を引用するときは、それぞれの文書にある測定範囲と「主張しないこと」を併せて確認してください。

## 個人の絶対パスの扱い

公開に先立ち、記録内の個人環境の絶対パスを `<repo>`（このリポジトリ）、`<tmp>`（一時ディレクトリ）、`~/`（ホーム）に置換しました。値が検査の対象になる次の箇所は、記録時のまま残しています。

- `docs/harness/authorizations/*.md` の `project:` 行（上記のとおり、機械検査が絶対パス一致で判定する）。
- `benchmarks/section-reading/measurements.json` と `source-inventory.json`。測定時のルートと、それらを含む入力のSHA-256を結び付けて記録しており、書き換えると整合性の連鎖が崩れる。
- テストと検証記録の一部（`tests/consult-codex.test.cjs` の置換前の文字列、[VALIDATION](../../VALIDATION.md) の過去の検証コマンド）。

開発の流れ全体は[CONTRIBUTING](../../CONTRIBUTING.md)、設計の経緯は上のADRを起点に読めます。
