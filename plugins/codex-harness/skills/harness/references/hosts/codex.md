# Codexで動かすときの具体値

本文の共通規則は、役割キー（`deterministic` / `standard` / `complex` / `review`）とeffortで書いています。Codexで動かすときの具体的なモデル名と起動方法は、このファイルにまとめます。Claude Codeでの読み替えは[Claude Code](claude-code.md)を参照してください。

## モデル

メインのモデルは `gpt-6-astra` を希望します。実際の値はホストの現在値で、スキルや設定からは変更できません。希望と違えば報告します。

| 選択キー | 既定のモデル | 既定のeffort |
|---|---|---|
| `deterministic` | `gpt-6-luna` | low |
| `standard` | `gpt-6.1-sol` | medium |
| `complex` | `gpt-6.1-sol` | high |
| `review` | `gpt-6.1-sol` | high |

既定値の正本は `assets/defaults.json` の `models` で、実効値は `status` の `config.models` に出ます。この表と食い違う場合は `status` を優先します。Luna→Astraのような系統をまたぐ昇格は、自動更新の対象ではありません。

## 子の起動

子は履歴なし（`fork_turns="none"`）で起動します。使えなければ報告し、全履歴を渡す起動へ黙って切り替えません。

## 外部相談

Codexが親のときの相手はClaudeで、[consult-claude](../../consult-claude/SKILL.md)を使います。ログイン確認で追加の実行権限が要るときの `sandbox_permissions: "require_escalated"` の使い方も、そちらに書いてあります。どの作業を相手に回すかは `status` の `collaboration` で決まります（[外部相談](../routing/peer-consult.md)）。
