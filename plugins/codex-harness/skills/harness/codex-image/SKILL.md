---
name: codex-image
description: From Claude Code, generate an image with Codex's built-in image_gen tool through the logged-in Codex CLI and save it inside the project without overwriting. Needs a recorded send approval for the image purpose.
---

# Codexでの画像生成

Claude Codeが親のとき、Codex（OpenAI）の組み込みツール `image_gen` で画像を1回生成し、プロジェクト内の指定パスへ保存します。APIキーは不要で、既存のCodex CLIのログインを使います。何を描くか・採否・使い方はClaudeが決めます。Codexには画像生成以外の作業をさせません。

## いつ使うか

- UIモック・資料・説明図などに、写真やイラストのようなラスター画像が必要なとき。
- 設定 `collaboration.image_generation` が `peer` のとき（Claude Codeが親の既定）、harnessの親が自動で使えます。`delegation=false`・inactive・`HARNESS_WORKER` では自動で使いません。ユーザーが明示的に頼んだ場合や「外部に送らないで」と言った場合はそれに従います。
- 図表・アイコン・フローチャートのように、SVGやコードで正確に描けるものには使いません。
- 外部の担当として同時実行枠 `max_agents` に数えます。

## 送信の承認

プロンプトと `references` の画像はOpenAIに送られます。承認はプロジェクトごとに、consult-codexと同じ `<project>/docs/harness/authorizations/codex-send.md` へ記録します。画像生成の目的（purpose）は `image` です。

- 生成する前に毎回、`node "<skill-dir>/scripts/image.mjs" --approval --project <プロジェクトの絶対パス>` で判定します（`--purpose` を省くと `image` で判定します）。結果は常に終了コード0の `{"ok":true,"approved":true|false,"reason":"approved|missing|malformed|revoked|project_mismatch|purpose_missing","record":"<path>","purposes":[...]}` です。スクリプトは記録を読むだけで、書きません。
- `approved` なら、聞き直さずに生成します。
- それ以外（`missing`・`malformed`・`revoked`・`project_mismatch`・`purpose_missing`）なら、生成せずに、次の文面でユーザーに1回だけ確認します。「Codex（OpenAI）へ、<送る情報の範囲>を、image（画像生成）のために送ってよいですか。この承認は <プロジェクトの絶対パス> のこの目的だけに使います。」`malformed` のときは、`message` にある問題の行も示します。
- ユーザーが明示的に承認したら、親が記録してから生成します。記録がなければ次のテンプレートどおりに作ります。既存の記録があれば、その `purposes` に `image` を追記するだけにします（他の目的を足さず、他の項目も書き換えません）。承認されなければ生成せず、画像なしで進めます。

```markdown
---
peer: codex
project: /abs/path/to/project
purposes: [image]
status: approved
recorded: 2026-10-28
---

# Codexへの送信事前承認

- 送信先: 既存ログインを使うCodex CLI（OpenAI）。
- 送る情報の範囲: （例：画像のプロンプトと参照画像）
- 目的: （purposesごとの用途）。必要最小限の情報だけを送る。
- 除外: 認証情報・秘密鍵・個人情報・第三者から預かった機密情報。
- 承認根拠: （日付と、ユーザー本人の承認の発言）
```

- `purposes` は `advice`（発案・相談・批評の3役）・`review`（`reviewer`）・`image`（画像生成）から、承認された目的だけを書きます。`[]` は何も承認しません。`[advice,,image]` のような空の要素は `malformed` です。
- `status` が `approved` 以外なら撤回扱い（`revoked`）です。撤回はユーザーの指示で `status: revoked` に書き換えます。
- `project` はシンボリックリンクを解決したうえで比べます。別のプロジェクトの記録は使えません。
- frontmatterの5項目は必須です。未知の項目は無視し、同じ項目の重複は `malformed` です。
- persistence OFFのときは会話内の承認だけで生成し、ファイルは作りません。このとき `--approval` は `missing` を返しますが、会話内の承認があれば生成してかまいません。
- 承認を、別のプロジェクトや記録にない目的に広げません。
- 秘密鍵・トークン・認証情報・無関係な個人情報は、プロンプトにも参照画像にも入れません。

## 進め方

1. 何を描くかを1枚分に絞り、プロンプト・保存先・必要ならサイズや透過を決めます。
2. 初回や環境が変わったときは `node "<skill-dir>/scripts/image.mjs" --check` で、CLI・ログイン・`image_generation` 機能を確認します（`<skill-dir>` はこのSKILL.mdがあるディレクトリの絶対パス）。`auth_unavailable` なら、ユーザーに `! codex login` を案内します。ログインを代行したり、認証情報を読んだりしません。
3. `--approval` で承認を確かめます（上記）。
4. JSONをstdinのheredocか `--input <file>` で渡して実行します。プロンプトをコマンド引数に入れません。モデルは必要なときだけ `--model` で指定します。

   ```sh
   node "<skill-dir>/scripts/image.mjs" <<'EOF'
   {"project":"/abs/project","prompt":"夕焼けの港町の水彩画","out":"/abs/project/assets/harbor.png","size":"1536x1024"}
   EOF
   ```

5. 保存された画像を自分で開いて確認し、使うかどうかを決めます。気に入らなければプロンプトを直してもう1回生成します。前の画像は上書きされません。

## 入出力

入力（JSONオブジェクト）：

| 項目 | 必須 | 内容 |
|---|---|---|
| `project` | はい | プロジェクトの絶対パス |
| `prompt` | はい | 空でない文字列。描いてほしい内容 |
| `out` | はい | 保存先の絶対パス。`project` の内側で、拡張子は `.png`・`.jpg`・`.jpeg`・`.webp` |
| `transparent` | いいえ | 真偽値。背景を透過にするか |
| `size` | いいえ | `"auto"`・`"1024x1024"`・`"1536x1024"`・`"1024x1536"` |
| `references` | いいえ | `project` 内にある既存画像の絶対パスの配列（最大4枚）。参考画像としてCodexに添付します |

未知の項目は、その項目名を示して拒否します。型の誤りは、どの項目が何の型であるべきかを返します。

- stdinが端末なら、すぐに `input_unavailable` で失敗します。端末でなくても、最初のデータが5秒来なければ `input_timeout` で失敗します。どちらも「heredocか `--input` で渡す」よう案内します。
- `out` に同名のファイルがあれば上書きせず、`name-v2.png`・`name-v3.png`… に保存します。親ディレクトリがなければ、`project` の内側に限って作ります。
- 1回で複数枚できたときは全部保存し、2枚目以降は `name-2.png`・`name-3.png`… とします。
- 生成された画像の実際の形式が `out` の拡張子と違うときは、実際の形式の拡張子で保存します。返却の `path` が実際の保存先です。

成功：`{"ok":true,"peer":"codex","files":[{"path":"...","bytes":N}],"sources":["<Codexが保存した元画像のパス>"]}`。

- 画像が保存されたあとにターンがエラーで終わった、CLIが非0で終了した、時間や出力の上限に達したときも、画像があれば成功として返し、`"warning":"<短い理由>"`（例 `turn ended with an error after the image was generated`・`Codex CLI timed out after the image was generated`）を付けます。上限に達したときもCLIは止めます。画像を確認してから使います。

失敗：`{"ok":false,"error":{"code","message"}}` で非0終了です。主なcode：`invalid_input`・`path_outside_project`・`input_unavailable`・`input_timeout`・`auth_unavailable`・`feature_unavailable`・`tool_forbidden`・`peer_busy`・`response_error`・`cli_failed`・`empty_response`・`timeout`・`output_limit`。Codexの生の出力やstderrは表示しません。

- `peer_busy` は、画像ができないまま、Codexのモデルが混雑している（容量不足・レート制限など）と報告されたときです。時間を置くか、`--model` で別のモデルを指定してやり直します。

## 隔離

- `codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only` で、空の一時ディレクトリを作業場所にして実行します。Web検索・シェル・hooks・plugins・MCPアプリ・マルチエージェント・画像の読み取りなどを無効にし、画像生成だけを有効にします。
- イベントの項目は型名の完全一致で許可します（`agent_message`・`reasoning`・`error`・`image_generation`・`image_generation_call`）。それ以外（コマンド実行・ファイル変更・MCP・Web検索・`view_image` など）の痕跡があれば、結果を捨てて `tool_forbidden` で失敗します。
- 生成物は `$CODEX_HOME/generated_images/<thread_id>/`（未設定なら `~/.codex/generated_images/<thread_id>/`）からだけ取り出します。`<thread_id>` は今回の実行の `thread.started` イベントの値なので、同時に動く別のCodexセッションの画像は拾いません。thread_idが取れない・UUIDでないときは、`generated_images` のほかの場所を探さず、画像を採用しません（`empty_response`）。シンボリックリンクはたどりません。保存先もシンボリックリンク経由で `project` の外に出ないよう、実体のパスで確かめます。
- GitHub・クラウド・Anthropicの環境変数は子プロセスに渡しません。
- 時間の上限は既定300秒（`--timeout-ms` は100〜900000）、入力の上限は256KiBです。
- これはCLIの機能による制限で、OSのsandboxそのものではありません。
