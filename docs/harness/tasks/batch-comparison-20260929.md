# Larger batch comparison

State: done. Fresh restart authorized by user. Specification revision1. Root coordinator.

Goal: run the same three larger tasks continuously under baseline and harness, compare aggregate shared allowance consumption and independently verify quality.

Acceptance: byte-identical task specs and empty starts; baseline then harness continuous blocks; snapshots before/after each block with same reset window; no overlapping test conditions; user has confirmed stopping other account usage; harness review included; common grading after both blocks; all metrics/artifacts/limitations in a Japanese report.

Scope: benchmarks/2026-09-29-batch and /private/tmp/harness-batch-20260929 only. Initial non-Git artifacts, no committed base. Preserve other uncommitted work and all settings.

Protocol: [protocol](../../../benchmarks/2026-09-29-batch/protocol.md). Exact numbered acceptance requirements: [website](../../../benchmarks/2026-09-29-batch/specs/website.md), [research](../../../benchmarks/2026-09-29-batch/specs/research.md), [code](../../../benchmarks/2026-09-29-batch/specs/code.md).

Model choices: baseline Astra/medium inherited host; larger UI/search/transactional CLI assignments Sol/medium due to open-ended decisions, independent reviews Sol/high. Preparation/evaluation are bounded workers and excluded from measured blocks. Child redelegation prohibited.

Interruption: baseline website completed; baseline research interrupted; baseline CLI and all harness tasks not started. User questioned use of an outer subagent for baseline. Existing design compares one isolated Astra worker against harness workers/reviewers, NOT a no-subagent top-level conversation. Do not treat this incomplete block as a completed comparison. Preserve artifacts and snapshots; resolve experimental design before resuming.

Resolution: user explicitly accepts one dedicated baseline subagent and requests restarting from the beginning. Use fresh /private/tmp/harness-batch-20260929-restart directories and restart-allowance-snapshots.json. Frozen tasks/tests remain unchanged. Earlier attempt is excluded. Only one measured implementer or reviewer runs at a time; preparation is already finished. User's prior confirmation of stopping other account usage remains in effect.

Completion: all six tasks and three harness review cycles finished. Web and research each required one correction round; CLI internal review PASS. Independent common grading completed after both measurement blocks. Account used17→22% baseline (5pp),22→26% harness (4pp), same reset window. Common grading afterward reached27%. Website checks16/16 both. Research eligible168/178 baseline vs62/62 harness, both15/15 partial anchors. CLI fixed tests57/57 both; extra check found harness DB overwrite on export to active database path. No post-evaluation implementation changes. Baseline research required recovery from a stalled save; long unexplained event gaps prevent a fair wall-time comparison. Findings and all limitations: [Japanese report](../../../benchmarks/2026-09-29-batch/report.md).
