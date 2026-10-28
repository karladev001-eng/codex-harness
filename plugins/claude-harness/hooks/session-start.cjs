#!/usr/bin/env node
// Runs the same read-only status the Codex bootstrap asks for, so activation does not
// depend on the model remembering to check. Output is SessionStart additionalContext.
// It never migrates data: until the Codex runtime is updated (its install migrates), both
// hosts must keep using the same legacy store.
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
const status = run('status', '--project', cwd, '--host', 'claude');
if (status.error) {
  emit(`Harness status failed (${status.error}). Report this configuration or compatibility error when coding, creative or research work begins; do not activate harness features silently.`);
} else if (status.data.active) {
  const c = status.data.config, flags = ['delegation', 'review', 'persistence', 'measurement', 'improvement_loop'].map(k => `${k}=${c[k] ? 'on' : 'off'}`).join(', ');
  const models = Object.entries(c.models).map(([role, m]) => `${role}=${m.model}/${m.reasoning_effort}`).join(', ');
  const tasks = Object.entries(status.data.collaboration.tasks).map(([task, mode]) => `${task}=${mode}`).join(', ');
  emit([
    `Harness is active for ${status.data.project} (${flags}; max_agents=${c.max_agents}; models ${models}).`,
    `For coding, UI/document creation or feedback, Web research, ideation, strategy consultation or proposal criticism: read ${path.join(skill, 'SKILL.md')}.`,
    'Claude Code reading of Codex wording: AGENTS.md means CLAUDE.md; workers are Agent subagent_type harness:implementer, harness:integrator, harness:reviewer or harness:researcher; Codex sandbox escalation does not exist, so follow the permission mode and do not retry a denied call.',
    `Before delegating, consulting the peer, or following a Codex-only step (early compaction, Knowledge descriptions), read only the matching section of ${path.join(skill, 'references', 'hosts', 'claude-code.md')}, which overrides those steps.`,
    `Collaboration (peer=${status.data.collaboration.peer}): ${tasks}. Peer work goes through the consult-codex skill and needs a recorded send approval per project.`,
    `When settings or scope change within a unit of work, re-run: node "${runtime}" status --project <absolute-project-path> --host claude.`,
    'Every harness:* Agent launch passes model and effort from the role key above (worker agents inherit the main model otherwise, and the plugin denies such launches); never use fork for workers.',
    'A delegated worker (prompt contains HARNESS_WORKER) performs only its assignment and never coordinates.',
  ].filter(Boolean).join('\n'));
}
