#!/usr/bin/env node
// PreToolUse guard for Agent launches. Evals showed the coordinator sometimes omitted the
// worker model, so the rules a hook can check mechanically are enforced here instead of
// repeated in prose: harness workers need an explicit model and effort, and run only as harness:* agents.
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
const tool = input.tool_input || {}, type = String(tool.subagent_type || '').trim();
// A worker packet starts with the HARNESS_WORKER marker. Such a prompt must go to a harness:* agent:
// fork, an empty or blank type and any other agent type (general-purpose, Explore, ...) all run outside
// the harness agent definitions. A prompt that merely mentions the marker later on is not a worker.
// Model and effort are checked only on harness agents.
const harnessType = type.startsWith('harness:');
const strayWorker = !harnessType && String(tool.prompt || '').trimStart().startsWith('HARNESS_WORKER');
const missing = harnessType ? ['model', 'effort'].filter(key => !tool[key]) : [];
if (!strayWorker && missing.length === 0) process.exit(0);

const current = status(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
// Only an active harness is enforced; an unreadable status is reported at session start instead.
if (!current || !current.active) process.exit(0);
const table = Object.entries(current.config.models).map(([role, m]) => `${role}=${m.model}/${m.reasoning_effort}`).join(', ');
if (strayWorker) deny(`Harness workers start without the parent history: use a harness:* subagent_type instead of fork, an omitted type or another agent type. Role models: ${table}.`);
deny(`Harness worker launch is missing ${missing.join(' and ')}. Pass them from the role key that fits the work (${table}); an explicit user choice or a pin overrides the table.`);
