#!/usr/bin/env node
// Runs the same read-only status the Codex bootstrap asks for, so activation does not
// depend on the model remembering to check. Output is SessionStart additionalContext.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const skill = path.join(root, 'skills', 'harness');
const runtime = path.join(skill, 'runtime.js');

function run(...args) {
  const result = spawnSync(process.execPath, [runtime, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (result.error) return { error: String(result.error.message || result.error) };
  if (result.status !== 0) return { error: (result.stderr || '').trim() || 'exit ' + result.status };
  try { return { data: JSON.parse(result.stdout) }; } catch { return { error: 'invalid status output' }; }
}
function emit(text) {
  if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}
function project() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

const cwd = project();
const migrated = run('data', 'migrate');
const status = run('status', '--project', cwd, '--host', 'claude');
if (status.error) {
  emit(`Harness status failed (${status.error}). Report this configuration or compatibility error when coding, creative or research work begins; do not activate harness features silently.`);
} else if (status.data.active) {
  const c = status.data.config, flags = ['delegation', 'review', 'persistence', 'measurement', 'improvement_loop'].map(k => `${k}=${c[k] ? 'on' : 'off'}`).join(', ');
  const models = Object.entries(c.models).map(([role, m]) => `${role}=${m.model}/${m.reasoning_effort}`).join(', ');
  emit([
    `Harness is active for ${status.data.project} (${flags}; max_agents=${c.max_agents}; models ${models}).`,
    `For coding, UI/document creation or feedback, Web research, ideation, strategy consultation or proposal criticism: read ${path.join(skill, 'SKILL.md')} and then ${path.join(skill, 'references', 'hosts', 'claude-code.md')}, which overrides Codex-specific steps.`,
    `Re-check with: node "${runtime}" status --project <absolute-project-path> --host claude.`,
    migrated.data?.status === 'migrated' ? `Shared harness data was copied from ${migrated.data.from} to ${migrated.data.data_home}.` : '',
    'A delegated worker (prompt contains HARNESS_WORKER) performs only its assignment and never coordinates.',
  ].filter(Boolean).join('\n'));
}
