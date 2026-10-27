# Harness A/B comparison pilot

State: done. Specification revision: 1. Owner: root coordinator.

Goal: compare a small website, primary-source web research, and a small Python module under baseline versus the installed harness.

Scope: benchmarks/2026-09-28 and /private/tmp/harness-ab-20260928 only. Do not change product code or existing uncommitted model-selection.md.

Acceptance:
1. Both conditions receive identical task prompts and start with empty artifact directories, no inherited conversation.
2. Finish all six runs sequentially. Harness runs get independent review and at most two correction rounds.
3. Evaluate artifacts against the predeclared rubric and common checks; identify defects and unverified behavior.
4. Record elapsed times, available cumulative token breakdowns, account allowance windows/deltas and limitations without estimating missing values.
5. Deliver Japanese comparison report and links to all artifacts; no general statistical claims from n=1.

Protocol and exact task acceptance requirements: [protocol](../../../benchmarks/2026-09-28/protocol.md) and [prompts](../../../benchmarks/2026-09-28/prompts.json).

Initial state: empty non-Git artifact directories; no committed base applicable. All execution is sequential. Parent observed model: gpt-6-astra / medium. Website implementer: gpt-6-sol / medium due to visual design choices. Research/code implementer: gpt-6-luna / low due to bounded requirements. Review: gpt-6-sol / high per effective settings. Baseline inherits the parent's Astra/medium.

Research is an experimental extension: the installed harness primarily targets coding; report conclusions separately.

Completion: all six conditions finished; all three harness internal reviews PASS with no mandatory correction rounds. Independent anonymous grading completed. Website baseline/harness 97/99, research 98/94, code 99/97; both code versions passed 38/38 common cases. Browser checks exercised both sites at 390/1280px. Reviewer packaging mistakes concerning intentionally omitted completion notes were corrected before final scoring.

Results and limits: [Japanese report](../../../benchmarks/2026-09-28/report.md). Worker/reviewer tokens are 1,024,898 baseline and 3,636,205 harness. Parent coordination and common grading are separately reported. Account-wide allowance change is coarse and includes experiment overhead; no task-level quota-savings conclusion. One repetition only. No source commits or product changes required for these non-Git benchmark artifacts. Existing model-selection.md is preserved.
