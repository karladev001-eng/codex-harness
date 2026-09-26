---
name: create-subagent
description: Create or update reusable subagent role definitions from natural-language assignments. Use for durable roles, not to launch an agent or record a one-time handoff.
---

# Create Subagent Definitions

Create a reusable role definition only when the assignment will guide future delegation. A one-time handoff belongs in its task record and does not create or launch a subagent.

Resolve the index in this order: an explicitly specified entrypoint, an existing index referenced by `AGENTS.md` or another reading entrypoint, then `HARNESS.md`. Respect a specified name or destination. Otherwise use `harness/subagents/<id>.md`, with a short lowercase hyphenated `<id>`. These destinations are relative to the project root. Inspect the existing destination and resolved index first. Update a matching role without removing requirements that still apply, and do not create unused directories.

Use [the template](assets/subagent.md) and write in the project's established language. Define inputs, responsibility, permitted change scope, applicable rulebook references, output and evidence, and conditions that require returning to the parent. Preserve user instructions, authorization boundaries, and higher-priority constraints.

If an existing reading entrypoint such as `AGENTS.md` needs a connection, add only one relative link to the resolved index and retain its conventions and content. If no reading entrypoint exists, explain that users must read the resolved index; create a minimal `AGENTS.md` reference only when asked to make the result operational or the user provides another connection method. Keep the resolved index compact: one row for kind, ID, use condition, and a verified path. Index and definition links are relative to the file containing them; record project-root-relative output paths in the generated definition where useful. The definition is a document the parent reads and supplies during delegation; it does not register a host agent, grant permissions or tools, change settings, or cause an agent to start.

Report the file created or updated and the link check performed. Return conflicts, missing authority, and out-of-scope dependencies to the requester rather than expanding the role.
