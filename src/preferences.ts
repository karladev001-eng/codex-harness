// Creative preferences records: a local Markdown file, or a GitHub-backed record with a
// verified cache, a durable pending draft, optimistic revisions, legacy migration and sync-all.
import fs from 'node:fs';
import path from 'node:path';
import {
  Json, canonical, dataHome, digest, exists, isObject, localRoot, readJson, rejectSymlink, resolveSettings, safePath,
} from './lib';
import {
  Transport, RemoteError, github, atomic, locked, textInput, remote, targetDirectory, targetIndex, registerTarget,
  targetId, metadata, commitMessage,
} from './records';
import { identityStatus, resolveIdentity, projectIdentity } from './identity';
export { Transport, RemoteError, github } from './records';

const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/;
const PROJECT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const LESSON_FILE = /^lessons\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/;
const PENDING_OPERATION_KINDS = ['create', 'update', 'correction', 'forget', 'migrate'];
/** Remote failures during identity resolution that still allow a locally known project key. */
const RECOVERABLE_IDENTITY_ERRORS = [
  'unavailable', 'authentication', 'forbidden', 'not_found_or_inaccessible', 'identity_requires_remote_check',
];

export function preferenceTarget(config: Json): Json | null {
  const value = config.preferences;
  if (value.enabled === false) return null;
  if (!value.repository && !value.project_key) return null;
  const invalid = !REPOSITORY_PATTERN.test(value.repository)
    || !PROJECT_KEY_PATTERN.test(value.project_key)
    || !value.branch.trim()
    || CONTROL_OR_SPACE.test(value.branch);
  if (invalid) throw new Error('preferences requires valid repository, branch and project_key');
  return {
    hostname: 'github.com',
    repository: value.repository.toLowerCase(),
    branch: value.branch,
    path: `improvement/projects/${value.project_key}/preferences.md`,
  };
}

const withProjectKey = (config: Json, projectKey: unknown): Json =>
  ({ ...config, preferences: { ...config.preferences, project_key: projectKey } });

/**
 * The configuration preferenceTarget should see: a resolved identity supplies the project key,
 * and a repository without any project key falls back to the local backend.
 */
function locationConfig(config: Json, identity: Json | null): Json {
  if (identity?.resolved) return withProjectKey(config, identity.project_key);
  if (config.preferences.project_key) return config;
  return { ...config, preferences: { ...config.preferences, repository: '' } };
}

/** Where the preferences record lives: a GitHub target with its local state, or a local file. */
export function preferenceLocation(args: Json, config: Json): Json {
  const root = localRoot(args.project, args.home);
  const needsRegistry = config.preferences.repository && !config.preferences.project_key;
  const identity = needsRegistry ? identityStatus(args, config) : null;
  if (identity && !identity.resolved) {
    return {
      backend: 'github',
      identity,
      target: null,
      directory: null,
      legacy_file: safePath(root, 'creative', 'preferences.md'),
      retirement_file: safePath(root, 'creative', 'legacy-retired.json'),
    };
  }
  const target = args._target || preferenceTarget(locationConfig(config, identity));
  const retirement_file = safePath(root, 'creative', 'legacy-retired.json');
  if (!target) {
    return {
      retirement_file,
      backend: 'local',
      directory: safePath(root, 'creative'),
      file: safePath(root, 'creative', 'preferences.md'),
    };
  }
  return {
    retirement_file,
    backend: 'github',
    target,
    identity,
    directory: targetDirectory(target, args.home),
    legacy_file: safePath(root, 'creative', 'preferences.md'),
    legacy_directory: safePath(root, 'creative', 'github', digest(JSON.stringify(target))),
  };
}

/** Optimistic-concurrency token for a record's content at a remote SHA. */
const revision = (sha: string | null, content: string): string => digest(JSON.stringify([sha, content]));

const isShaOrNull = (value: unknown): boolean => value === null || GIT_SHA.test(value as string);

function validCache(cache: unknown): boolean {
  return cache === null || (isObject(cache)
    && typeof cache.content === 'string'
    && isShaOrNull(cache.sha)
    && typeof cache.fetched_at === 'string');
}

function validPending(pending: unknown): boolean {
  return pending === null || (isObject(pending)
    && typeof pending.content === 'string'
    && isShaOrNull(pending.base_sha));
}

function validOperation(operation: unknown): boolean {
  return isObject(operation)
    && operation.schema_version === 1
    && /^[a-f0-9-]{36}$/.test(operation.operation_id)
    && PROJECT_KEY_PATTERN.test(operation.project_key)
    && PENDING_OPERATION_KINDS.includes(operation.kind)
    && ['preferences', 'lesson'].includes(operation.record_kind)
    && typeof operation.recorded_at === 'string'
    && Number.isFinite(Date.parse(operation.recorded_at));
}

/** Validates a state.json for `target`; a pending draft always requires the cache it was based on. */
function validateState(value: unknown, target: Json): Json {
  const valid = isObject(value)
    && value.schema === 1
    && JSON.stringify(value.target) === JSON.stringify(target)
    && validCache(value.cache)
    && validPending(value.pending)
    && typeof value.migrated === 'boolean'
    && !(value.pending && !value.cache);
  if (!valid) throw new Error('Corrupt preferences state; refusing to overwrite');
  if (value.pending?.operation !== undefined && !validOperation(value.pending.operation)) {
    throw new Error('Corrupt preferences operation');
  }
  if (value.pending?.delete !== undefined && typeof value.pending.delete !== 'boolean') {
    throw new Error('Corrupt preferences deletion');
  }
  const validConflicts = value.conflicts === undefined
    || (Array.isArray(value.conflicts) && value.conflicts.every((file: unknown) => typeof file === 'string'));
  if (!validConflicts) throw new Error('Corrupt preferences conflicts');
  return value;
}

/** The record as callers see it: the pending draft if there is one, otherwise the verified cache. */
function view(state: Json): Json {
  const item = state.pending ? { sha: state.pending.base_sha, content: state.pending.content } : state.cache;
  if (!item) return { content: null, revision: null, sha: null, fetched_at: null, pending: false };
  return {
    content: item.content,
    revision: revision(item.sha, item.content),
    sha: item.sha,
    fetched_at: state.cache.fetched_at,
    pending: Boolean(state.pending),
  };
}

const identityUnresolved = (): Json =>
  ({ ok: false, error: 'identity_unresolved', freshness: 'stale', content: null, revision: null, pending: false });

/** Read or write the local-backend preferences file (no remote, no cache). */
function localRecord(args: Json, location: Json): Json {
  if (!args._record && exists(location.retirement_file)) {
    throw new Error('Local preferences retired by migration; '
      + 'restore the GitHub preferences configuration and use its current canonical record');
  }
  if (args.action === 'migrate') throw new Error('Configure GitHub preferences before migration');
  rejectSymlink(location.file, 'Preferences file');
  const content = exists(location.file) ? textInput(location.file) : '';
  const result = (text: string) =>
    ({ ok: true, backend: 'local', content: text, revision: revision(null, text), pending: false, freshness: 'local' });
  if (args.action !== 'write') return result(content);
  if (args.revision !== revision(null, content)) throw new Error('Preferences conflict: reread before writing');
  const updated = args._content === undefined ? textInput(args.input) : args._content;
  if (args._delete) {
    if (exists(location.file)) fs.unlinkSync(location.file);
  } else {
    atomic(location.file, updated);
  }
  return result(updated);
}

/**
 * Entry point for `preferences <action>`, and the shared engine behind lessons.
 * Internal callers pass `_target`, `_record`, `_local_file`, `_content` and `_delete`.
 */
export function preferences(args: Json, config: Json, transport: Transport = github): Json {
  if (args.action === 'sync-all') return syncAll(args, transport);
  if (!config.enabled || !config.persistence) {
    return { skipped: !config.enabled ? 'harness disabled' : 'persistence disabled' };
  }
  if (config.preferences.enabled === false) return { skipped: 'preferences disabled' };
  if (args.automatic && !config.improvement_loop) return { skipped: 'improvement loop disabled' };
  if (args.automatic && config.preferences.autosave === false) return { skipped: 'autosave disabled' };
  if (args.offline !== undefined && !['true', 'false'].includes(args.offline)) {
    throw new Error('--offline must be true or false');
  }

  const usesRegistry = config.preferences.repository && !config.preferences.project_key;
  if (usesRegistry && !config.preferences.autosave && args.action !== 'register') return identityUnresolved();
  let identity: Json | null = null;
  if (config.preferences.repository && (config.preferences.autosave || args.action === 'register')) {
    try {
      const mayRegister = ['register', 'write', 'migrate'].includes(args.action);
      identity = resolveIdentity(args, config, transport, mayRegister);
      if (!identity.project_key) return identityUnresolved();
      config = withProjectKey(config, identity.project_key);
    } catch (error) {
      // A previously verified draft must survive a later registry/network outage.
      // Registry collisions remain a hard stop; never guess through one.
      const recoverable = error instanceof RemoteError && RECOVERABLE_IDENTITY_ERRORS.includes(error.kind);
      if (args.action === 'register' || !recoverable) {
        const kind = error instanceof RemoteError ? error.kind : 'identity_resolution_failed';
        return { ok: false, error: kind, freshness: 'stale', pending: false };
      }
      const cached = identityStatus(args, config);
      const origin = config.preferences.project_key ? null : projectIdentity(args.project);
      const originKey = origin ? 'git-' + digest(origin).slice(0, 24) : null;
      const key = config.preferences.project_key || cached.project_key || originKey;
      if (!key) return { ok: false, error: error.kind, freshness: 'stale', pending: false };
      identity = { resolved: false, project_key: key, identity: cached.identity || origin, error: error.kind };
      config = withProjectKey(config, key);
    }
  }
  if (args.action === 'register') return { ok: Boolean(identity?.resolved), identity };

  const location = preferenceLocation(args, config);
  const offline = args.offline === 'true';
  if (args._local_file && location.backend === 'local') {
    location.file = args._local_file;
    location.directory = path.dirname(args._local_file);
  }
  if (location.backend === 'github') registerTarget(args, location.target);
  return locked(location.directory, () => {
    if (location.backend === 'local') return localRecord(args, location);

    const file = safePath(location.directory, 'state.json');
    rejectSymlink(file, 'Preferences state');
    const empty = () => ({ schema: 1, target: location.target, cache: null, pending: null, migrated: false });
    const durable = () => exists(file) ? validateState(readJson(file), location.target) : empty();
    let state: Json = durable();
    if (!args._record) state = absorbLegacy(args, location, state, validateState, file);
    if (state.conflicts?.length) {
      return { ok: false, backend: 'github', error: 'legacy_pending_conflict', pending: true, freshness: 'stale' };
    }
    const save = () => atomic(file, JSON.stringify(state, null, 2) + '\n');
    const output = (extra: Json = {}) => ({
      ok: true,
      backend: 'github',
      target: location.target,
      ...view(state),
      freshness: offline ? 'cached' : 'fresh',
      ...(identity ? { identity } : {}),
      ...extra,
    });
    const failure = (error: unknown) => {
      // In-memory drafts/acknowledgements are not durable until atomic() has succeeded.
      state = durable();
      const kind = error instanceof RemoteError ? error.kind : 'local_save_or_transport_failure';
      return output({ ok: false, freshness: 'stale', error: kind });
    };
    const retire = () => {
      rejectSymlink(location.retirement_file, 'Legacy retirement marker');
      if (exists(location.retirement_file)) {
        const marker = readJson(location.retirement_file);
        if (!isObject(marker) || marker.schema !== 1 || marker.retired !== true) {
          throw new Error('Corrupt legacy retirement marker');
        }
        // Retry durability too: a previous rename may have succeeded before fsync failed.
        // Windows FlushFileBuffers requires write access; r+ preserves the marker bytes.
        const fd = fs.openSync(location.retirement_file, 'r+');
        try {
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        if (process.platform !== 'win32') {
          const directory = fs.openSync(path.dirname(location.retirement_file), 'r');
          try {
            fs.fsyncSync(directory);
          } finally {
            fs.closeSync(directory);
          }
        }
        return;
      }
      const marker = { schema: 1, retired: true, target: location.target, retired_at: new Date().toISOString() };
      atomic(location.retirement_file, JSON.stringify(marker, null, 2) + '\n');
    };
    const ensureRetired = () => {
      if (state.migrated) locked(path.dirname(location.legacy_file), retire);
    };

    /** Sends a pending draft (or refreshes the cache) and reports the outcome. */
    const sync = (): Json => {
      if (offline) {
        const reason = !state.cache ? { error: 'no_cache' } : state.pending ? { error: 'pending_offline' } : {};
        return output({ ok: Boolean(state.cache) && !state.pending, freshness: 'cached', ...reason });
      }
      try {
        // A failed retirement save must be repaired before any migration can transmit.
        ensureRetired();
        if (state.pending && identity && !identity.resolved) identity = resolveIdentity(args, config, transport, true);
        const fetched = remote(location.target, transport);
        if (!state.pending) {
          state.cache = fetched;
          save();
          return output();
        }
        // An earlier attempt may have reached GitHub before its acknowledgement was saved.
        const alreadyApplied = state.pending.delete
          ? fetched.sha === null
          : fetched.content === state.pending.content && fetched.sha !== null;
        if (alreadyApplied) {
          state.cache = fetched;
          state.pending = null;
          save();
          return output({ acknowledged: true });
        }
        if (fetched.sha !== state.pending.base_sha) {
          return output({
            ok: false,
            freshness: 'stale',
            error: 'conflict',
            remote_sha: fetched.sha,
            remote_revision: revision(fetched.sha, fetched.content),
            remote_content: fetched.content,
          });
        }
        if (!state.pending.operation) {
          const kind = state.migrated ? 'migrate' : 'update';
          state.pending.operation = metadata(config.preferences.project_key, kind, args._record || 'preferences');
          save();
        }
        const body: Json = {
          message: commitMessage(state.pending.operation),
          branch: location.target.branch,
          content: Buffer.from(state.pending.content).toString('base64'),
        };
        if (state.pending.base_sha !== null) body.sha = state.pending.base_sha;
        if (state.pending.delete) delete body.content;
        const deleting = state.pending.delete;
        const endpoint = `repos/${location.target.repository}/contents/${location.target.path}`;
        const result = transport(deleting ? 'DELETE' : 'PUT', endpoint, body) as Json | null;
        const committedSha = deleting ? result?.commit?.sha : result?.content?.sha;
        if (!GIT_SHA.test(committedSha)) throw new RemoteError('invalid_response');
        state.cache = {
          sha: deleting ? null : result!.content.sha,
          content: state.pending.content,
          fetched_at: new Date().toISOString(),
        };
        state.pending = null;
        save();
        return output();
      } catch (error) {
        return failure(error);
      }
    };

    if (args.action === 'read') {
      if (offline) {
        return output({ ok: Boolean(state.cache), freshness: 'cached', ...(state.cache ? {} : { error: 'no_cache' }) });
      }
      if (state.pending) {
        // Read does not transmit drafts or bring replaced/forgotten content into the cache.
        try {
          const fetched = remote(location.target, transport);
          const conflict = fetched.sha !== state.pending.base_sha && fetched.content !== state.pending.content;
          return output({
            freshness: 'pending',
            remote_sha: fetched.sha,
            remote_revision: revision(fetched.sha, fetched.content),
            ...(conflict ? { ok: false, error: 'conflict', remote_content: fetched.content } : {}),
          });
        } catch (error) {
          return failure(error);
        }
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
          if (exists(location.retirement_file)) {
            return output({ ok: false, error: 'legacy_retired', freshness: 'cached' });
          }
          rejectSymlink(location.legacy_file, 'Legacy preferences file');
          if (!exists(location.legacy_file)) throw new Error('No local preferences to migrate');
          const content = textInput(location.legacy_file);
          const fetched = remote(location.target, transport);
          if (fetched.sha !== null && fetched.content !== content) {
            return output({ ok: false, error: 'migration_conflict', remote_sha: fetched.sha });
          }
          state.cache = { ...fetched, content };
          state.migrated = true;
          if (fetched.sha === null) {
            state.pending = {
              content,
              base_sha: null,
              source_project: canonical(args.project),
              operation: metadata(config.preferences.project_key, 'migrate'),
            };
          }
          // First protect the draft, then permanently retire the legacy source, then transmit.
          save();
          retire();
          return null;
        });
        return rejected || sync();
      } catch (error) {
        return failure(error);
      }
    }

    if (args.action !== 'write') throw new Error('Unknown preferences action');
    if (!state.cache) throw new Error('Read a verified remote revision before writing; no cache exists');
    if (args.revision !== view(state).revision) throw new Error('Preferences conflict: reread before writing');
    if (args.base_sha !== undefined && args.base_sha !== 'missing' && !GIT_SHA.test(args.base_sha)) {
      throw new Error('--base-sha must be a remote SHA or missing');
    }
    const content = args._content === undefined ? textInput(args.input) : args._content;
    let base: string | null;
    if (args.base_sha === undefined) base = state.pending ? state.pending.base_sha : state.cache.sha;
    else if (args.base_sha === 'missing') base = null;
    else base = args.base_sha;
    if (!state.pending && content === state.cache.content && !args._delete) return output({ unchanged: true });
    if (args._delete && !state.pending && state.cache.sha === null) return output({ unchanged: true });
    // Rewriting an identical draft keeps its operation ID, so a retried send stays one operation.
    const sameDraft = state.pending
      && state.pending.content === content
      && state.pending.base_sha === base
      && Boolean(state.pending.delete) === Boolean(args._delete);
    const defaultKind = args._delete ? 'forget' : state.cache.sha === null ? 'create' : 'update';
    const sourceProject = canonical(args.project);
    state.pending = {
      content,
      base_sha: base,
      source_project: sourceProject,
      ...(args._delete ? { delete: true } : {}),
      operation: sameDraft
        ? state.pending.operation
        : metadata(config.preferences.project_key, args.kind || defaultKind, args._record || 'preferences'),
    };
    // Replace cached text as well: current corrections/forgetting must not survive in hidden local snapshots.
    state.cache.content = content;
    try {
      save();
    } catch (error) {
      return failure(error);
    }
    return sync();
  });
}

// Only the old harness state layout is considered; unrelated files are never collected.
function absorbLegacy(
  args: Json,
  location: Json,
  current: Json,
  validate: (value: unknown, target: Json) => Json,
  destination: string,
): Json {
  const projects = safePath(dataHome(args.home), 'projects');
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
    const old = readJson(file) as Json | null;
    if (old?.schema === 2 && old?.redirect === targetId(location.target)) continue;
    // A directory hash alone is never sufficient evidence of target equality.
    if (JSON.stringify(old?.target) !== JSON.stringify(location.target)) continue;
    validate(old, location.target);
    locked(path.dirname(file), () => {
      const legacy = validate(readJson(file), location.target);
      const conflictingDrafts = legacy.pending && current.pending
        && (legacy.pending.content !== current.pending.content || legacy.pending.base_sha !== current.pending.base_sha);
      if (conflictingDrafts) {
        current.conflicts = [...new Set([...(current.conflicts || []), file])];
        atomic(destination, JSON.stringify(current, null, 2) + '\n');
        return;
      }
      if (!current.cache || (!current.pending && legacy.pending)) current = legacy;
      current.migrated ||= legacy.migrated;
      atomic(destination, JSON.stringify(current, null, 2) + '\n');
      // Retire absorbed copies rather than retaining forgotten/corrected cache bodies.
      const redirect = { schema: 2, redirect: targetId(location.target), target: location.target };
      atomic(file, JSON.stringify(redirect) + '\n');
    });
  }
  return current;
}

/** Failure reasons that sync-all may report as-is; anything else is reported generically. */
const SAFE_REASONS = new Set([
  'authentication', 'forbidden', 'not_found_or_inaccessible', 'unavailable', 'conflict', 'invalid_response',
  'private_repository_required', 'local_save_or_transport_failure', 'legacy_pending_conflict', 'no_cache',
  'pending_offline', 'identity_requires_remote_check', 'registry_conflict', 'invalid_registry',
]);

/** A queued record is sent only if its project still resolves to that target or one of its lessons. */
function stillTargeted(expected: Json | null, saved: Json): boolean {
  if (!expected) return false;
  if (expected.repository !== saved.repository || expected.branch !== saved.branch) return false;
  if (saved.path === expected.path) return true;
  const prefix = expected.path.replace(/preferences\.md$/, '');
  return saved.path.startsWith(prefix + 'lessons/') && LESSON_FILE.test(saved.path.slice(prefix.length));
}

/** Sends every queued draft on this machine, re-checking each source project's current policy first. */
export function syncAll(args: Json, transport: Transport = github): Json {
  let index: Json;
  try {
    index = targetIndex(args.home);
  } catch {
    return { ok: false, results: [], pending: 0, failed: 1, error: 'invalid_target_index' };
  }
  const results: Json[] = [];
  let pending = 0;
  let failed = 0;
  for (const [id, entry] of Object.entries(index.targets) as [string, Json][]) {
    let queued = false;
    const emit = (state: string, reason?: string) =>
      results.push({ target_id: id, state, ...(reason ? { reason } : {}) });
    try {
      const file = safePath(targetDirectory(entry.target, args.home), 'state.json');
      rejectSymlink(file, 'Record state');
      if (!exists(file)) continue;
      const saved = validateState(readJson(file), entry.target);
      if (!saved.pending && !saved.conflicts?.length) continue;
      queued = true;
      pending++;
      if (saved.conflicts?.length) {
        emit('conflict', 'legacy_pending_conflict');
        failed++;
        continue;
      }
      const source = saved.pending.source_project || entry.sources[0];
      const sourceAvailable = source
        && entry.sources.includes(source)
        && exists(source)
        && fs.statSync(source).isDirectory();
      if (!sourceAvailable) {
        emit('skipped', 'source_unavailable');
        continue;
      }
      const config = resolveSettings(source, args.home).config;
      const policyAllowsSync = config.enabled
        && config.persistence
        && config.improvement_loop
        && config.preferences.enabled !== false
        && config.preferences.autosave !== false;
      if (!policyAllowsSync) {
        emit('skipped', 'policy_disabled');
        continue;
      }
      const identity = identityStatus({ project: source, home: args.home }, config);
      if (!identity.resolved && !config.preferences.autosave) {
        emit('skipped', 'identity_unresolved');
        continue;
      }
      if (!identity.resolved) identity.project_key = saved.pending.operation?.project_key;
      const resolved = withProjectKey(config, identity.project_key);
      if (!stillTargeted(preferenceTarget(resolved), entry.target)) {
        emit('skipped', 'target_changed');
        continue;
      }
      const record = entry.target.path.endsWith('/preferences.md') ? undefined : 'lesson';
      const request = {
        project: source, home: args.home, action: 'sync', automatic: true, _target: entry.target, _record: record,
      };
      const outcome = preferences(request, resolved, transport);
      if (outcome.ok && !outcome.pending) {
        emit(outcome.acknowledged || outcome.unchanged ? 'unchanged' : 'sent');
        pending--;
      } else {
        const reason = SAFE_REASONS.has(outcome.error) ? outcome.error : 'local_save_or_transport_failure';
        emit(reason.includes('conflict') ? 'conflict' : 'pending', reason);
        failed++;
      }
    } catch (error) {
      if (!queued) pending++;
      if (error instanceof Error && error.message.includes('locked')) {
        emit('busy', 'busy');
      } else {
        emit('pending', 'local_save_or_transport_failure');
        failed++;
      }
    }
  }
  return { ok: pending === 0 && failed === 0, results, pending, failed };
}
