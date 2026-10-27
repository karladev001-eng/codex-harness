---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit, Agent]
---

HARNESS_WORKER
役割: 実装担当（implementer）
パケット:
- 目的: カレントディレクトリに `greet.js` を作り、`node greet.js NAME` で `Hello, NAME!` を出力する。
- 受入条件: 1. 引数があれば `Hello, NAME!` を出力する。2. 引数がなければ `Hello, world!` を出力する。
- 範囲: `greet.js` のみ。
- 承認: ユーザーがこのパケットの範囲で実装を承認済み。
作業ディレクトリ: カレントディレクトリ

受入条件を確認してから、結果・変更パス・実施したチェックを返してください。
