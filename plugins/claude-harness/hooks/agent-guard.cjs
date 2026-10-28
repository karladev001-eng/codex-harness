#!/usr/bin/env node
// PreToolUse guard for Agent launches. Evals showed the coordinator sometimes omitted the
// worker model, so the rules a hook can check mechanically are enforced here instead of
// repeated in prose: harness workers need an explicit model and effort, and never fork.
// Anything else, and every launch while the harness is inactive, passes untouched.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const runtime = path.join(root, 'skills', 'harness', 'runtime.js');

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
}
function status(project) {
  const result = spawnSync(process.execPath, [runtime, 'status', '--project', project, '--host', 'claude'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  try { return result.status === 0 ? JSON.parse(result.stdout) : null; } catch { return null; }
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const tool = input.tool_input || {}, type = String(tool.subagent_type || '');
// Model and effort are checked only on harness agents; the prompt marker only identifies a worker sent
// through fork or with no type, which runs outside the harness agent definitions.
const forkedWorker = (type === 'fork' || type === '') && String(tool.prompt || '').includes('HARNESS_WORKER');
const missing = type.startsWith('harness:') ? ['model', 'effort'].filter(key => !tool[key]) : [];
if (!forkedWorker && missing.length === 0) process.exit(0);

const current = status(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
// Only an active harness is enforced; an unreadable status is reported at session start instead.
if (!current || !current.active) process.exit(0);
const table = Object.entries(current.config.models).map(([role, m]) => `${role}=${m.model}/${m.reasoning_effort}`).join(', ');
if (forkedWorker) deny(`Harness workers start without the parent history: use a harness:* subagent_type instead of fork or an omitted type. Role models: ${table}.`);
deny(`Harness worker launch is missing ${missing.join(' and ')}. Pass them from the role key that fits the work (${table}); an explicit user choice or a pin overrides the table.`);
