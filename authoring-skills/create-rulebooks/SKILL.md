---
name: create-rulebooks
description: Create or update durable project rulebooks from natural-language policy requests. Use for reusable rules, not one-time records or task results.
---

# Create Rulebooks

Create a concise, durable rule only when the request is meant to guide future work. Keep a one-time decision, incident note, or task result in its existing record instead.

Resolve the index in this order: an explicitly specified entrypoint, an existing index referenced by `AGENTS.md` or another reading entrypoint, then `HARNESS.md`. Respect a specified name or destination. Otherwise use `harness/rulebooks/<id>.md`, with a short lowercase hyphenated `<id>`. These destinations are relative to the project root. Before writing, inspect the existing destination and resolved index; reuse or update a matching definition without discarding still-valid content. Do not create unused directories.

Use [the template](assets/rulebook.md) and write in the project's established language. State natural-language applicability conditions, the procedure, and a record contract: when to record, where, what to record, how it is updated, and how completion is confirmed. Preserve higher-priority instructions and user authorization; a rulebook cannot grant permissions or override either.

If a project has a reading entrypoint such as `AGENTS.md`, add at most one relative link to the resolved index when that link is needed to make the rule discoverable. If no reading entrypoint exists, explain that users must read the resolved index; create a minimal `AGENTS.md` reference only when asked to make the result operational or the user provides another connection method. Preserve existing content and local convention. Keep the resolved index compact: add or update one row with kind, ID, condition, and a verified path. Index and definition links are relative to the file containing them; record project-root-relative output paths in the generated definition where useful. Markdown does not register a host feature or run automatically.

Report the file created or updated and the link check performed. Surface conflicts or unclear scope instead of silently making a broad rule.
