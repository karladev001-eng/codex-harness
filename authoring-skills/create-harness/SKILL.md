---
name: create-harness
description: Create or update a minimal Markdown harness that connects reusable rules, roles, and workflows from a natural-language coordination request.
---

# Create a Harness

Build only the definitions the request needs. A harness is Markdown guidance for people or a parent agent; it is not an execution engine, host registration, permission grant, model configuration, or automatic launch mechanism.

Resolve the index in this order: an explicitly specified entrypoint, an existing index referenced by `AGENTS.md` or another reading entrypoint, then `HARNESS.md`. Respect specified names and destinations. Otherwise put needed files at `harness/rulebooks/<id>.md`, `harness/subagents/<id>.md`, or `harness/workflows/<id>.md`; these are relative to the project root. Inspect existing content first, preserve applicable material, and do not create unused folders. Verify every index path exists before adding it.

Use [the index template](assets/harness-index.md) to create or update the resolved index. It records only kind, ID, applicability condition, and relative path. Index and definition links are relative to the file containing them; generated definitions should state project-root-relative output paths where useful. If the project has an existing reading entrypoint such as `AGENTS.md`, connect it with one relative link to the resolved index only when required for operation. If none exists, explain that users must read the index; create a minimal `AGENTS.md` reference only when asked to make the result operational or when the user names another connection method. Preserve an existing entrypoint and do not turn it into a catalog.

When the request needs a rulebook, create a concise document with applicability conditions, procedure, and a record contract covering when, where, what, update, and confirmation. When it needs a role, create a concise definition with inputs, responsibility, change scope, applicable rules, output and evidence, and stopping conditions. Add their paths to the resolved index only after those files exist. These minimum contracts make this skill usable alone; `create-rulebooks` and `create-subagent` are optional helpers when available.

For a requested workflow, use [the workflow template](assets/workflow.md). Define only applicable start conditions, dependency order, handoff, completion decision, and failure, retry, or resume behavior. Do not assume delegation, review, measurement, fixed models, or parallel work unless the request calls for them.

When asked to make a harness equivalent to an existing one, read the identified source and retain the relevant roles, configuration conditions, review practice, handoff behavior, and explicitly required model choices. Verify specified models or tools are available on the host and report unsupported requirements as constraints; never change host configuration to make them available. Do not import its runtime, installer, or unrelated conventions. If no source is identified, ask for it or create only the requested general workflow.

The companion skills can provide templates when available, but are not required. Report the files created or updated and the link checks performed. Preserve user authorization and higher-priority instructions throughout.
