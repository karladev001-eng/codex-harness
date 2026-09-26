# TypeScript migration

State: done
Specification revision: 1
Committed base: e50da1e18aac3ea25afd79d72486743313794229

## Goal
Replace Python implementation with TypeScript compiled before distribution into JavaScript. Preserve existing harness mechanisms, configuration, Markdown authoring skills, and ownership-safe installation. Keep GitHub private; support installation without cloning via a downloadable npm tarball and npx.

## Acceptance criteria
1. All runtime commands, configuration precedence, feature flags, task graph, path guards, worktree isolation and measurement behavior retain their semantics. Existing data/settings paths remain compatible.
2. Global install/update/uninstall retain ownership checks, backups, rollback, idempotence and exact preservation of unrelated instructions/settings. An unmodified Python schema-1 installation migrates without executing Python; modified owned installations are refused safely.
3. Published artifact contains compiled JavaScript and necessary Markdown/assets. Users require supported Node/npm and Git where worktrees are used; no Python, TypeScript compiler or clone is needed. Runtime has no external production dependencies.
4. Four authoring skills remain usable independently; project installation from the packaged CLI supports arbitrary projects, refuses overwrites of modified/unowned content, and is documented. No implicit orchestration activation from authoring-skill installation.
5. Meaningful Node tests cover previous runtime/installer cases plus migration and packaged npx execution, paths with spaces, installed execution outside repository. Cross-platform paths and invocation support Windows/Linux/macOS.
6. Current README, command references, skill instructions and validation documentation describe the real Node interface and private GitHub distribution accurately; historical records need not be rewritten.
7. Independent implementation review, delegated integration, and final consistency review pass. Private GitHub receives committed changes and downloadable package; local installed harness is safely upgraded after validation.

## Scope and delegation
Implementation owns repository source/build/tests/docs except this coordinator packet. One implementer owns the coherent runtime/installer migration to avoid split API contracts. Reviewer is read-only and independent. Integration occurs in a separate worktree.
Implementation worktree: /Users/kan/.codex/worktrees/project-skill-install/harness
Integration worktree: /Users/kan/.codex/worktrees/project-skill-install-integration/harness
Dependencies: implementation -> review -> integration -> final review -> delivery.

## Constraints
Do not publish public npm package or alter GitHub visibility. Do not change flags/model defaults or execute live personal installation during implementation. Keep npm dependencies development-only. Preserve private configuration. Remove active Python entrypoints/tests once replaced, retain legacy migration fixtures as data if useful. No worker redelegation or push.

## Evidence and completion
- Implementation: 29b2da3d48299ba46665e4770c1fb367252b82ba, ea8eefd332fed5fe45a42ac3011373be80e528f0.
- Implementer reports 39 tests passing on macOS with Node 22.23.3 and 26.9.0, including packed offline npx execution.
- Coordinator independently copied the actual schema-1 Python installation into a temporary home: upgrade, idempotent reinstallation, installed JavaScript execution and uninstall passed; individual settings and exact unrelated CRLF instructions survived. Finder metadata outside the old manifest was preserved separately before upgrade; the installer correctly refused it initially.
- Private branch CI run https://github.com/karladev001-eng/harness/actions/runs/36236798775 could not start any OS job. GitHub reported recent account payments failed or spending limit must be increased. No billing settings changed. Windows/Linux execution remains unverified; matrix configuration is present.
- Independent implementation review: PASS on ea8eefd332fed5fe45a42ac3011373be80e528f0. Integration cherry-picked approved changes and passed 39 tests. Final consistency review requested two documentation corrections (stale archive checksum and Python-era ADR); both corrected and re-reviewed PASS on 71fba43fa60464b6ed540ede630ffea3e46d3698.
- Release: https://github.com/karladev001-eng/harness/releases/tag/v0.2.0, targeting 71fba43fa60464b6ed540ede630ffea3e46d3698. Repository remains PRIVATE. Compiled archive and external SHA256SUMS.txt uploaded; archive SHA-256 is `4ac41af6fbf18ef73311cf67fab28bf42388a9ef009f9e27979cbb0ca8c66d70`.
- Real GitHub download verification passed: checksum match, offline npx standalone install/status/uninstall, four-skill installation into a non-Git project with spaces/Japanese in its path, existing file preservation and no clone.
- This PC's standalone harness migrated with the reviewed tarball. Its status JSON exactly matches the pre-migration Python status (effective settings, active state, project and local storage root). Individual settings are byte-identical; ownership manifest is now schema 2; runtime.py is no longer installed. Personal inspect-harness was updated after verifying the previous content matched its snapshot.
- Recovery: the installer retained the old owned installation under `~/.codex/harness/backups/install-yBgOeO`; Finder metadata and the old personal inspect-harness instruction are preserved separately under `~/.codex/harness/backups/typescript-migration-xV9EZu`.
- All code and documentation changes are delivered on main. Remaining limitation: hosted Windows/Linux tests require resolution of the external GitHub billing/spending restriction; no success is claimed for those platforms.
