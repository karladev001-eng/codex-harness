# Codex Harness v1 Specification

Status: implementation baseline, 2026-09-21. Japanese user-facing documentation; portable local Codex plugin.

Delivery status is tracked in VALIDATION.md. V1 local acceptance and distribution packaging are separate from certification on another physical PC or OS; those environments must remain marked unverified until exercised there. Do not equate automated tests with full release acceptance or proven quota savings.

## 日本語要約

メインは仕様と方針を決め、実装は必ず子へ委譲する。独立タスクは最大３担当を既定として並列化し、Git worktreeで変更を隔離する。作業が決定的なほど軽いモデルを選び、すべての実装と統合結果を独立レビューする。仕様・ADR・進捗はプロジェクト内に保存し、次のセッションや別PCへ必要な情報だけ引き継ぐ。全機能OFFでは状態確認以外の追加処理を行わない。配布用プラグインと、安全に繰り返せる個人用スキルの導入・更新・解除手順を提供する。実行手順はCodexが解釈し、補助ツールが設定・記録・worktree操作を支える。以下を実装上の詳細仕様とする。

## Goal and scope

Preserve quality and consistency while reducing Codex subscription usage per completed task. Main agent owns specifications, decisions and coordination; all product implementation is delegated. Independent tasks run concurrently, with three child slots by default (bounded by host capability). Deterministic tasks use lighter models; reviews use stronger models. No claim of savings until measured.

V1 includes task handoffs, model routing, isolated parallel implementation, independent review, persistent decisions, feature flags, portable setup/doctor/uninstall, and measurement records. Designer, browser UX validation, knowledge-base integration, automatic compaction and transcript deletion are future extensions. No daemon, API key, hosted service, or automatic publishing.

## Distribution and interfaces

Repository contains `plugins/codex-harness/` with `.codex-plugin/plugin.json`, `skills/harness/SKILL.md`, role instructions, defaults and templates; a root `scripts/harness.py` entry point; tests and Japanese README. Use Python 3.9+ standard library and Git. The package helper lives inside the plugin so copied installations are self-contained.

CLI: `python3 scripts/harness.py status|doctor|install|uninstall|task|worktree|measure`. Subcommands and options documented in README. Every filesystem mutation is explicit. `status --project PATH` resolves defaults, personal settings and project overrides and emits JSON. Configuration file names: personal `$CODEX_HOME/harness/settings.json` (default `~/.codex/harness/settings.json`); project `.harness.json`. Host-local runtime data goes under `$CODEX_HOME/harness/projects/<hash-of-canonical-project-path>/`.

Install uses a copied standalone skill under `~/.agents/skills/codex-harness`; `--skills-dir` explicitly overrides its parent directory. Provide `--home PATH` isolated user-home override for tests and reproducible installations; resolve CODEX_HOME when no override. This standalone-skill route is the zero-marketplace setup; retain valid plugin packaging for Codex plugin distribution, and clearly document the distinction. Do not require or edit marketplace configuration for standalone setup.

Install adds a uniquely delimited bootstrap to `$CODEX_HOME/AGENTS.md`, preserving existing content and settings, and installs the skill with its required runtime/assets together. Preflight ownership/collisions, back up managed previous version, preserve user settings, refuse to overwrite user-modified managed files on update/uninstall. Repeated installation is idempotent. Uninstall removes owned registrations/instructions only and retains project documentation and personal settings. Document restoring previous release using Git checkout plus install. No global model or Codex concurrency configuration changes.

## Configuration

JSON object with `schema_version: 1`, booleans `enabled`, `delegation`, `review`, `persistence`, `measurement` (default true), `max_agents: 3`, and `models` mappings. Model mappings include `deterministic` = gpt-5.6-luna/medium, `standard` = gpt-5.6-terra/medium, `complex` = gpt-6-astra/high, `review` = gpt-5.6-sol/high. Each contains `model` and `reasoning_effort`. Unknown keys, wrong types, invalid concurrency and unsupported schema fail clearly. Merge nested mappings defaults < personal < project. Model availability must be verified by executing host; unavailable selection is surfaced, not silently replaced.

All feature flags independent. `enabled=false` OR all four feature flags false means inactive: status check only, no agent launches, project records, logs or measurement. With delegation off main can implement normally; review remains independent if enabled. With persistence off use inline handoffs and no persistent task documents. Runtime metadata required for explicitly requested worktrees remains local. Re-evaluate flags at task boundaries. Invalid configuration must not silently activate features.

## Orchestration protocol

Bootstrap applies automatically to coding requests across projects, but excludes child recursion: a delegated worker performs its bounded assignment without invoking coordinator workflow. Existing higher-priority project/environment constraints prevail. This is instruction-based orchestration, not a scheduler enforcement guarantee.

Main creates one task packet per independent unit: ID, goal, non-goals, numbered acceptance criteria, scope/owned paths, dependencies, specification revision, code base revision, constraints, source references and open questions. It records dependency graph before dispatch, rejects cycles/missing dependencies, and launches ready tasks only. Explicitly spawn with no parent history using supported host mechanism; if unavailable report incompatibility. Shared spec and necessary files are available by reference. Children never recursively spawn.

Deterministic = exact location/expected behavior and established pattern; standard = clear criteria requiring local investigation across files; complex = authentication, migration, concurrency or failed lower-tier attempts. Ambiguous requirements return to main. Research delegation is optional only when exploration is substantial. Implementer returns result, changed paths, checks with evidence, unresolved issues and commit ID. No raw logs in main.

Each parallel implementation has a Git worktree at an explicitly selected committed base. Never reset, stash or delete user changes. If relevant work is uncommitted, ask to choose checkpointing or use serial work in current checkout; do not drop it. Worktree helper validates task IDs, refuses branch/path collisions and checks repository/base. Non-Git projects use serial execution and explain why. Initial repository bootstrap can use distinct owned paths serially until a committed base exists.

Each implementation gets a separate reviewer if enabled. Reviewer uses packet + actual diff + surrounding code + validation evidence, not implementation transcript. Output verdict PASS/NEEDS_WORK/BLOCKED, criterion coverage, findings with severity/location/evidence, checks and limitations. Review-only agents do not edit product code. Fix and review at most two rounds; unresolved issues go to main, not auto-pass. After task-level review, delegated integrator combines approved commits on integration worktree in dependency order, runs integration checks, and obtains final cross-task review before completion. Main resolves specification decisions; integration code edits remain delegated. Never auto-merge/push external branches.

States: planned -> ready -> implementing -> reviewing -> done; needs_work returns to implementing; blocked requires reason; integration and completion validate current spec revision and code revision. Completion requires acceptance checks and review PASS when review enabled. Spec changes invalidate affected results and dependent integration; completed tasks not reread wholesale.

## Persistence and measurement

Project `docs/harness/` stores project map, tasks, and ADRs; create only when needed, not for every folder. Task records hold compact specification, progress, completion and evidence references. ADRs record consequential choices with rationale, not all conversation. Runtime logs and measurements remain host-local. Session restart accepts a task ID and rereads current packet + relevant decisions, not whole archive. Cross-PC handoff requires committing/syncing code and documents; active agents/worktrees are not migrated.

Measurement records baseline/harness condition, task/run IDs, start/end, elapsed time, model roles, corrections, completion/defects, optional account usage before/after and reset-window identifiers. Missing values remain null. Account-wide deltas are not exact task costs; overlapping runs or reset windows are invalid for comparison. No token-to-quota conversion. Benchmark 3 task classes x 3 repetitions x 2 conditions manually/explicitly triggered; no automatic expensive benchmark. Track lower median quota use with no quality regression; otherwise report unconfirmed.

## Acceptance and tests

Automated tests use temporary home directories and disposable Git repositories only. Cover layered config and all-off no-write behavior; malformed flags/schema; safe idempotent install/update/uninstall including unrelated AGENTS content, custom CODEX_HOME, paths with spaces, collisions and user edits; task IDs and document creation; isolated worktrees, dirty files retained, invalid refs/collisions; measurements unknown/reset/overlap. Validate plugin manifest and skills using supplied validators.

Manual live acceptance: host honors model/no-history spawning; multiple isolated tasks overlap; review catches seeded defect; integration catches cross-task mismatch; restart/cross-PC packet resume; feature flags respected. Report these separately from unit tests and do not claim live validation from document checks. macOS locally tested; Windows/Linux portability designed, unverified until run there.

## References and adaptations

- https://github.com/worldflowai/everything-claude-code/blob/main/commands/orchestrate.md — workflow and structured handoff inspiration.
- https://github.com/worldflowai/everything-claude-code/blob/main/rules/agents.md — specialized roles and independent parallel work.
- https://github.com/worldflowai/everything-claude-code/blob/main/agents/code-reviewer.md — independent, evidence-based severity reporting.
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://developers.openai.com/plugins/build/plugins

Write original instructions; do not copy repository code. Claude-specific hooks/model settings are not transplanted. Session-end and pre-compact scripts in reference repository do not themselves extract all decisions; explicit checkpoint writing remains required.
