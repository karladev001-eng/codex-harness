import fs from 'node:fs';
import path from 'node:path';
import { Json, digest, exists, isObject, localRoot, readJson, rejectSymlink, safePath } from './lib';

import { Transport, RemoteError, github, atomic, locked, textInput, remote, targetDirectory, targetIndex, registerTarget, targetId, metadata, commitMessage } from './records';
import { identityStatus, resolveIdentity, projectIdentity } from './identity';
import { canonical, codexHome, resolveSettings } from './lib';
export { Transport, RemoteError, github } from './records';
export function preferenceTarget(config: Json): Json | null {
  const value = config.preferences;
  if (value.enabled === false) return null;
  if (!value.repository && !value.project_key) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value.repository) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.project_key) ||
      !value.branch.trim() || /[\x00-\x20\x7f]/.test(value.branch)) throw new Error('preferences requires valid repository, branch and project_key');
  return { hostname: 'github.com', repository: value.repository.toLowerCase(), branch: value.branch,
    path: `improvement/projects/${value.project_key}/preferences.md` };
}
export function preferenceLocation(args: Json, config: Json): Json {
  const root = localRoot(args.project, args.home);
  const identity = config.preferences.repository && !config.preferences.project_key ? identityStatus(args, config) : null;
  if (identity && !identity.resolved) return { backend: 'github', identity, target: null, directory: null, legacy_file: safePath(root, 'creative', 'preferences.md'), retirement_file: safePath(root, 'creative', 'legacy-retired.json') };
  const target = args._target || preferenceTarget(identity?.resolved ? { ...config, preferences: { ...config.preferences, project_key: identity.project_key } } : config.preferences.project_key ? config : { ...config, preferences: { ...config.preferences, repository: '' } });
  const retirement_file = safePath(root, 'creative', 'legacy-retired.json');
  return target ? { retirement_file, backend: 'github', target, identity, directory: targetDirectory(target, args.home),
    legacy_file: safePath(root, 'creative', 'preferences.md'), legacy_directory: safePath(root, 'creative', 'github', digest(JSON.stringify(target))) } :
    { retirement_file, backend: 'local', directory: safePath(root, 'creative'), file: safePath(root, 'creative', 'preferences.md') };
}
const revision = (sha: string | null, content: string): string => digest(JSON.stringify([sha, content]));
function validateState(value: any, target: Json): Json {
  if (!isObject(value) || value.schema !== 1 || JSON.stringify(value.target) !== JSON.stringify(target) ||
      (value.cache !== null && (!isObject(value.cache) || typeof value.cache.content !== 'string' ||
      !(value.cache.sha === null || /^[a-f0-9]{40}$/.test(value.cache.sha)) || typeof value.cache.fetched_at !== 'string')) ||
      (value.pending !== null && (!isObject(value.pending) || typeof value.pending.content !== 'string' ||
      !(value.pending.base_sha === null || /^[a-f0-9]{40}$/.test(value.pending.base_sha)))) ||
      typeof value.migrated !== 'boolean' || (value.pending && !value.cache)) throw new Error('Corrupt preferences state; refusing to overwrite');
  if (value.pending?.operation !== undefined) {
    const operation = value.pending.operation;
    if (!isObject(operation) || operation.schema_version !== 1 || !/^[a-f0-9-]{36}$/.test(operation.operation_id) ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(operation.project_key) || !['create', 'update', 'correction', 'forget', 'migrate'].includes(operation.kind) ||
        !['preferences', 'lesson'].includes(operation.record_kind) || typeof operation.recorded_at !== 'string' || !Number.isFinite(Date.parse(operation.recorded_at))) throw new Error('Corrupt preferences operation');
  }
  if (value.pending?.delete !== undefined && typeof value.pending.delete !== 'boolean') throw new Error('Corrupt preferences deletion');
  if (value.conflicts !== undefined && (!Array.isArray(value.conflicts) || value.conflicts.some((file: unknown) => typeof file !== 'string'))) throw new Error('Corrupt preferences conflicts');
  return value;
}
function view(state: Json): Json {
  const item = state.pending ? { sha: state.pending.base_sha, content: state.pending.content } : state.cache;
  return item ? { content: item.content, revision: revision(item.sha, item.content), sha: item.sha,
    fetched_at: state.cache.fetched_at, pending: Boolean(state.pending) } : { content: null, revision: null, sha: null, fetched_at: null, pending: false };
}
export function preferences(args: Json, config: Json, transport: Transport = github): Json {
  if (args.action === 'sync-all') return syncAll(args, transport);
  if (!config.enabled || !config.persistence) return { skipped: !config.enabled ? 'harness disabled' : 'persistence disabled' };
  if (config.preferences.enabled === false) return { skipped: 'preferences disabled' };
  if (args.automatic && !config.improvement_loop) return { skipped: 'improvement loop disabled' };
  if (args.automatic && config.preferences.autosave === false) return { skipped: 'autosave disabled' };
  if (args.offline !== undefined && !['true', 'false'].includes(args.offline)) throw new Error('--offline must be true or false');
  if (config.preferences.repository && !config.preferences.project_key && !config.preferences.autosave && args.action !== 'register') return { ok: false, error: 'identity_unresolved', freshness: 'stale', content: null, revision: null, pending: false };
  let identity: Json | null = null;
  if (config.preferences.repository && (config.preferences.autosave || args.action === 'register')) {
    try {
      identity = resolveIdentity(args, config, transport, ['register', 'write', 'migrate'].includes(args.action));
      if (!identity.project_key) return { ok: false, error: 'identity_unresolved', freshness: 'stale', content: null, revision: null, pending: false };
      config = { ...config, preferences: { ...config.preferences, project_key: identity.project_key } };
    } catch (error) {
      // A previously verified draft must survive a later registry/network outage.
      // Registry collisions remain a hard stop; never guess through one.
      if (args.action === 'register' || !(error instanceof RemoteError) || !['unavailable', 'authentication', 'forbidden', 'not_found_or_inaccessible', 'identity_requires_remote_check'].includes(error.kind)) return { ok: false, error: error instanceof RemoteError ? error.kind : 'identity_resolution_failed', freshness: 'stale', pending: false };
      const cached = identityStatus(args, config), origin = config.preferences.project_key ? null : projectIdentity(args.project);
      const key = config.preferences.project_key || cached.project_key || (origin ? 'git-' + digest(origin).slice(0, 24) : null);
      if (!key) return { ok: false, error: error.kind, freshness: 'stale', pending: false };
      identity = { resolved: false, project_key: key, identity: cached.identity || origin, error: error.kind };
      config = { ...config, preferences: { ...config.preferences, project_key: key } };
    }
  }
  if (args.action === 'register') return { ok: Boolean(identity?.resolved), identity };
  const location = preferenceLocation(args, config), offline = args.offline === 'true';
  if (args._local_file && location.backend === 'local') { location.file = args._local_file; location.directory = path.dirname(args._local_file); }
  if (location.backend === 'github') registerTarget(args, location.target);
  return locked(location.directory, () => {
    if (location.backend === 'local') {
      if (!args._record && exists(location.retirement_file)) throw new Error('Local preferences retired by migration; restore the GitHub preferences configuration and use its current canonical record');
      if (args.action === 'migrate') throw new Error('Configure GitHub preferences before migration');
      rejectSymlink(location.file, 'Preferences file');
      const content = exists(location.file) ? textInput(location.file) : '';
      if (args.action === 'write') {
        if (args.revision !== revision(null, content)) throw new Error('Preferences conflict: reread before writing');
        const updated = args._content === undefined ? textInput(args.input) : args._content;
        if (args._delete) { if (exists(location.file)) fs.unlinkSync(location.file); } else atomic(location.file, updated);
        return { ok: true, backend: 'local', content: updated, revision: revision(null, updated), pending: false, freshness: 'local' };
      }
      return { ok: true, backend: 'local', content, revision: revision(null, content), pending: false, freshness: 'local' };
    }
    const file = safePath(location.directory, 'state.json'); rejectSymlink(file, 'Preferences state');
    const empty = () => ({ schema: 1, target: location.target, cache: null, pending: null, migrated: false });
    const durable = () => exists(file) ? validateState(readJson(file), location.target) : empty();
    let state: Json = durable();
    if (!args._record) state = absorbLegacy(args, location, state, validateState, file);
    if (state.conflicts?.length) return { ok: false, backend: 'github', error: 'legacy_pending_conflict', pending: true, freshness: 'stale' };
    const save = () => atomic(file, JSON.stringify(state, null, 2) + '\n');
    const output = (extra: Json = {}) => ({ ok: true, backend: 'github', target: location.target, ...view(state), freshness: offline ? 'cached' : 'fresh', ...(identity ? { identity } : {}), ...extra });
    const failure = (error: any) => {
      // In-memory drafts/acknowledgements are not durable until atomic() has succeeded.
      state = durable();
      return output({ ok: false, freshness: 'stale', error: error instanceof RemoteError ? error.kind : 'local_save_or_transport_failure' });
    };
    const retire = () => {
      rejectSymlink(location.retirement_file, 'Legacy retirement marker');
      if (exists(location.retirement_file)) {
        const marker = readJson(location.retirement_file);
        if (!isObject(marker) || marker.schema !== 1 || marker.retired !== true) throw new Error('Corrupt legacy retirement marker');
        // Retry durability too: a previous rename may have succeeded before fsync failed.
        // Windows FlushFileBuffers requires write access; r+ preserves the marker bytes.
        const fd = fs.openSync(location.retirement_file, 'r+');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        if (process.platform !== 'win32') {
          const directory = fs.openSync(path.dirname(location.retirement_file), 'r');
          try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
        }
        return;
      }
      atomic(location.retirement_file, JSON.stringify({ schema: 1, retired: true,
        target: location.target, retired_at: new Date().toISOString() }, null, 2) + '\n');
    };
    const ensureRetired = () => {
      if (state.migrated) locked(path.dirname(location.legacy_file), retire);
    };
    const sync = (): Json => {
      if (offline) return output({ ok: Boolean(state.cache) && !state.pending, freshness: 'cached',
        ...(!state.cache ? { error: 'no_cache' } : state.pending ? { error: 'pending_offline' } : {}) });
      try {
        // A failed retirement save must be repaired before any migration can transmit.
        ensureRetired();
        if (state.pending && identity && !identity.resolved) identity = resolveIdentity(args, config, transport, true);
        const fetched = remote(location.target, transport);
        if (!state.pending) { state.cache = fetched; save(); return output(); }
        if ((state.pending.delete ? fetched.sha === null : fetched.content === state.pending.content && fetched.sha !== null)) {
          state.cache = fetched; state.pending = null; save(); return output({ acknowledged: true });
        }
        if (fetched.sha !== state.pending.base_sha) return output({ ok: false, freshness: 'stale', error: 'conflict', remote_sha: fetched.sha,
          remote_revision: revision(fetched.sha, fetched.content), remote_content: fetched.content });
        if (!state.pending.operation) { state.pending.operation = metadata(config.preferences.project_key, state.migrated ? 'migrate' : 'update', args._record || 'preferences'); save(); }
        const body: Json = { message: commitMessage(state.pending.operation), branch: location.target.branch,
          content: Buffer.from(state.pending.content).toString('base64') };
        if (state.pending.base_sha !== null) body.sha = state.pending.base_sha;
        if (state.pending.delete) delete body.content;
        const deleting = state.pending.delete;
        const result = transport(deleting ? 'DELETE' : 'PUT', `repos/${location.target.repository}/contents/${location.target.path}`, body);
        if (!/^[a-f0-9]{40}$/.test(deleting ? result?.commit?.sha : result?.content?.sha)) throw new RemoteError('invalid_response');
        state.cache = { sha: deleting ? null : result.content.sha, content: state.pending.content, fetched_at: new Date().toISOString() };
        state.pending = null; save(); return output();
      } catch (error) { return failure(error); }
    };
    if (args.action === 'read') {
      if (offline) return output({ ok: Boolean(state.cache), freshness: 'cached', ...(state.cache ? {} : { error: 'no_cache' }) });
      if (state.pending) {
        // Read does not transmit drafts or bring replaced/forgotten content into the cache.
        try {
          const fetched = remote(location.target, transport);
          return output({ freshness: 'pending', remote_sha: fetched.sha, remote_revision: revision(fetched.sha, fetched.content),
            ...(fetched.sha !== state.pending.base_sha && fetched.content !== state.pending.content ? { ok: false, error: 'conflict', remote_content: fetched.content } : {}) });
        } catch (error) { return failure(error); }
      }
      return sync();
    }
    if (args.action === 'sync') return sync();
    if (args.action === 'migrate') {
      if (state.migrated) return output({ ok: false, error: 'already_migrated', freshness: 'cached' });
      if (state.pending) throw new Error('Pending update exists; sync or reconcile before migration');
      if (offline) return output({ ok: false, error: 'migration_requires_remote_check', freshness: 'cached' });
      try {
        const rejected = locked(path.dirname(location.legacy_file), () => {
          if (exists(location.retirement_file)) return output({ ok: false, error: 'legacy_retired', freshness: 'cached' });
          rejectSymlink(location.legacy_file, 'Legacy preferences file');
          if (!exists(location.legacy_file)) throw new Error('No local preferences to migrate');
          const content = textInput(location.legacy_file);
          const fetched = remote(location.target, transport);
          if (fetched.sha !== null && fetched.content !== content) return output({ ok: false, error: 'migration_conflict', remote_sha: fetched.sha });
          state.cache = { ...fetched, content }; state.migrated = true;
          if (fetched.sha === null) state.pending = { content, base_sha: null, source_project: canonical(args.project), operation: metadata(config.preferences.project_key, 'migrate') };
          // First protect the draft, then permanently retire the legacy source, then transmit.
          save(); retire();
          return null;
        });
        return rejected || sync();
      } catch (error) { return failure(error); }
    }
    if (args.action !== 'write') throw new Error('Unknown preferences action');
    if (!state.cache) throw new Error('Read a verified remote revision before writing; no cache exists');
    if (args.revision !== view(state).revision) throw new Error('Preferences conflict: reread before writing');
    if (args.base_sha !== undefined && args.base_sha !== 'missing' && !/^[a-f0-9]{40}$/.test(args.base_sha)) throw new Error('--base-sha must be a remote SHA or missing');
    const content = args._content === undefined ? textInput(args.input) : args._content, base = args.base_sha === undefined ? (state.pending ? state.pending.base_sha : state.cache.sha) : args.base_sha === 'missing' ? null : args.base_sha;
    if (!state.pending && content === state.cache.content && !args._delete) return output({ unchanged: true });
    if (args._delete && !state.pending && state.cache.sha === null) return output({ unchanged: true });
    const same = state.pending && state.pending.content === content && state.pending.base_sha === base && Boolean(state.pending.delete) === Boolean(args._delete);
    state.pending = { content, base_sha: base, source_project: canonical(args.project), ...(args._delete ? { delete: true } : {}), operation: same ? state.pending.operation : metadata(config.preferences.project_key, args.kind || (args._delete ? 'forget' : state.cache.sha === null ? 'create' : 'update'), args._record || 'preferences') };
    // Replace cached text as well: current corrections/forgetting must not survive in hidden local snapshots.
    state.cache.content = content;
    try { save(); } catch (error) { return failure(error); }
    return sync();
  });
}

// Only the old harness state layout is considered; unrelated files are never collected.
function absorbLegacy(args: Json, location: Json, current: Json, validate: (value: any, target: Json) => Json, destination: string): Json {
  const projects = safePath(codexHome(args.home), 'harness', 'projects');
  if (!exists(projects)) return current;
  const candidates: string[] = [];
  for (const name of fs.readdirSync(projects)) {
    if (!/^[a-f0-9]{20}$/.test(name)) continue;
    const directory = safePath(projects, name, 'creative', 'github', digest(JSON.stringify(location.target)));
    const file = safePath(directory, 'state.json');
    if (exists(file)) candidates.push(file);
  }
  for (const file of candidates) {
    rejectSymlink(file, 'Legacy preferences state');
    const old = readJson(file);
    if (old?.schema === 2 && old?.redirect === targetId(location.target)) continue;
    // A directory hash alone is never sufficient evidence of target equality.
    if (JSON.stringify(old?.target) !== JSON.stringify(location.target)) continue;
    validate(old, location.target);
    locked(path.dirname(file), () => {
      const legacy = validate(readJson(file), location.target);
      if (legacy.pending && current.pending && (legacy.pending.content !== current.pending.content || legacy.pending.base_sha !== current.pending.base_sha)) {
        current.conflicts = [...new Set([...(current.conflicts || []), file])];
        atomic(destination, JSON.stringify(current, null, 2) + '\n');
        return;
      }
      if (!current.cache || (!current.pending && legacy.pending)) current = legacy;
      current.migrated ||= legacy.migrated;
      atomic(destination, JSON.stringify(current, null, 2) + '\n');
      // Retire absorbed copies rather than retaining forgotten/corrected cache bodies.
      atomic(file, JSON.stringify({ schema: 2, redirect: targetId(location.target), target: location.target }) + '\n');
    });
  }
  return current;
}
const SAFE_REASONS = new Set(['authentication', 'forbidden', 'not_found_or_inaccessible', 'unavailable', 'conflict', 'invalid_response', 'private_repository_required', 'local_save_or_transport_failure', 'legacy_pending_conflict', 'no_cache', 'pending_offline', 'identity_requires_remote_check', 'registry_conflict', 'invalid_registry']);
export function syncAll(args: Json, transport: Transport = github): Json {
  let index: Json;
  try { index = targetIndex(args.home); } catch { return { ok: false, results: [], pending: 0, failed: 1, error: 'invalid_target_index' }; }
  const results: Json[] = [];
  let pending = 0, failed = 0;
  for (const [id, entry] of Object.entries(index.targets) as [string, Json][]) {
    let queued = false;
    const emit = (state: string, reason?: string) => results.push({ target_id: id, state, ...(reason ? { reason } : {}) });
    try {
      const file = safePath(targetDirectory(entry.target, args.home), 'state.json'); rejectSymlink(file, 'Record state');
      if (!exists(file)) continue;
      const saved = validateState(readJson(file), entry.target);
      if (!saved.pending && !saved.conflicts?.length) continue;
      queued = true; pending++;
      if (saved.conflicts?.length) { emit('conflict', 'legacy_pending_conflict'); failed++; continue; }
      const source = saved.pending.source_project || entry.sources[0];
      if (!source || !entry.sources.includes(source) || !exists(source) || !fs.statSync(source).isDirectory()) { emit('skipped', 'source_unavailable'); continue; }
      const config = resolveSettings(source, args.home).config;
      if (!config.enabled || !config.persistence || !config.improvement_loop || config.preferences.enabled === false || config.preferences.autosave === false) { emit('skipped', 'policy_disabled'); continue; }
      const identity = identityStatus({ project: source, home: args.home }, config);
      if (!identity.resolved && !config.preferences.autosave) { emit('skipped', 'identity_unresolved'); continue; }
      if (!identity.resolved) identity.project_key = saved.pending.operation?.project_key;
      const resolved = { ...config, preferences: { ...config.preferences, project_key: identity.project_key } };
      const target = preferenceTarget(resolved);
      const expectedPrefix = target?.path.replace(/preferences\.md$/, '');
      if (!target || target.repository !== entry.target.repository || target.branch !== entry.target.branch ||
          (entry.target.path !== target.path && !(entry.target.path.startsWith(expectedPrefix + 'lessons/') && /^lessons\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/.test(entry.target.path.slice(expectedPrefix.length))))) {
        emit('skipped', 'target_changed'); continue;
      }
      const outcome = preferences({ project: source, home: args.home, action: 'sync', automatic: true,
        _target: entry.target, _record: entry.target.path.endsWith('/preferences.md') ? undefined : 'lesson' }, resolved, transport);
      if (outcome.ok && !outcome.pending) { emit(outcome.acknowledged || outcome.unchanged ? 'unchanged' : 'sent'); pending--; }
      else { const reason = SAFE_REASONS.has(outcome.error) ? outcome.error : 'local_save_or_transport_failure'; emit(reason.includes('conflict') ? 'conflict' : 'pending', reason); failed++; }
    } catch (error) {
      if (!queued) pending++;
      if (error instanceof Error && error.message.includes('locked')) emit('busy', 'busy');
      else { emit('pending', 'local_save_or_transport_failure'); failed++; }
    }
  }
  return { ok: pending === 0 && failed === 0, results, pending, failed };
}
