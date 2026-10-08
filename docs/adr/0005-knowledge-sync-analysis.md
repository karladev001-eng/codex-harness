# ADR 0005: エージェントhook同期とcapture別説明生成

- 日付: 2026-10-05 JST
- 状態: 採用

GitHubの保存済captureを複数PCで読むため、Chrome保存/再送とは別のbare Git参照領域を設ける。作業checkoutと未送信operationsを読み取り同期が変更しない。fetch後にprivate repository・branch・library・schemaを確認し、commit内のblob差分だけを読み直してcatalog snapshotをatomic renameする。失敗時は前の有効snapshotと成功確認日時を保つ。通常削除されたcaptureは現在snapshotから消え、過去Git履歴から復元しない。

Gitのユーザー/system/inherited設定を無効化し、cache configも既知のcore bare設定だけを許す。checkout、template、hooks、filters、submodule、取得資料内のスクリプトを実行しない。認証は明示gh実行ファイルの既存GitHubログインを使い、credentialsとstderrを保存しない。

SessionStart(startup/resume)・UserPromptSubmitの非同期command hookを採用する。300秒の頻度制限、library lock、8.5秒全体期限、timeoutを持つ静かなpullだけを実行する。hook登録は既存entryを保持し、対象ファイル自身も排他して複数libraryの競合更新を防ぐ。Codexの信頼確認は製品の責務でありtrusted_hashを変更しない。検索CLI自身も鮮度確認を行い、専用検索toolがない段階ではPreToolUseを登録しない。

生成はcapture別analysis.jsonで、原文・ユーザーメモ・receiptとは独立させる。短い説明/役立つ場面/語句/根拠/不足はtext component、画像に写る見た目/根拠/不足はimage componentへ分け、入力hash/recipe/model/provider/日時を対応づける。text hashは切り詰め前の資料全体、image hashは画像bytesのみから作る。メモの変更だけで画像を再解析しない。未生成・古い・失敗をカードで区別する。

初期providerはCodex CLIのChatGPTログイン方式。modelを明示し、隔離cwd、read-only、ephemeral、ignore-user-config、no-daemon、schema、JSONL検証を使う。不要なtoolとhook/skill discoveryを無効化し、source指示は実行しない。実adapterはtool呼出がない完了turnだけを採用する。生成入力はUTF-8 100KB以内へ収め、切り詰めた取得範囲を必ず記録する。provider抽象はmock可能だが、別providerの実装は今回追加しない。

耐久queueへcomponentごと保存し、途中失敗/終了後は完成部分だけ再利用する。すべて完成したgenerating/failed状態はpendingへ復旧する。共有はfresh headを基点にcaptureのblob一致を確認し、analysis.json一つだけのnonforce commitで行う。変更/削除/解析衝突はpendingに保持する。応答が不確かな場合はremoteの同じblobを確認し、二重commitや再生成を避ける。複数PCは同じ入力/recipeのremote生成結果を再利用し、初回の生成担当をMacに限定する。

lockは完成ownerファイルのatomic hard-linkで取得する。終了済PIDだけを回収し、回収者は共有numeric pathnameのatomic予約ticketで直列化する。番号を使い回さず、中断した回収者もPID確認で扱えるようにする。未知/破損lockは停止する。通常競合では待たずbusyを返す。上限は1000capture、差分32MiB、snapshot48MiB、通常同期60秒、生成5capture/回(最大20)、component120秒(最大300)。

最小の検索はタイトル・メモ・本文・説明の部分一致で、短いカードと元URL/範囲/鮮度を返す。索引全文をLLMへ渡さない。ベクトル埋め込み、意味検索ランキング、Raycast画面、PC未送信operationsの検索統合、別provider、削除履歴の消去は後続の設計/検証対象。説明生成を意味検索の完成と扱わない。

検証は一時local Git、mock GitHub/provider、隔離hooks fixture、子process終了/競合を使う。実GitHubの初回fetch/生成/共有、実hook登録と信頼確認、毎時Codex automationは独立review後に実環境で確認する。このADRだけではそれらの実行完了を主張しない。

参照: [Git fetch](https://git-scm.com/docs/git-fetch)、[Codex hooks](https://learn.chatgpt.com/docs/hooks)、[Codex構造化評価](https://developers.openai.com/blog/eval-skills)。
