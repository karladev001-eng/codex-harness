// Project identity: derives a portable project key from the Git origin (or an explicit or
// generated ID) and keeps it consistent with the shared registry in the preferences repository.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  Json, canonical, dataHome, digest, exists, git, isObject, projectSettings, readJson, rejectSymlink, safePath, taskId,
} from './lib';
import { Transport, RemoteError, atomic, locked, remote, metadata, commitMessage } from './records';

const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;
const PROJECT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const REGISTRY_IDENTITY = /^(?:git:[A-Za-z0-9.:-]+\/[^\s?#%\\]+|id:[A-Za-z0-9][A-Za-z0-9_-]{0,63})$/;
/** Ports that GitHub serves on by default; they are dropped so equivalent URLs share one identity. */
const GITHUB_DEFAULT_PORTS = ['22', '443', '9418'];
/** Registry write failures that are retried with a fresh read of the registry. */
const RETRYABLE_REGISTER_ERRORS = ['conflict', 'unavailable'];

/** Normalizes an HTTPS, SSH, git:// or scp-style origin to `git:<host>/<repository>`. */
export function normalizeOrigin(origin: string): string {
  if (typeof origin !== 'string' || CONTROL_OR_SPACE.test(origin)) throw new Error('Unsupported Git origin');
  let host: string;
  let repository: string;
  if (/^(https?|ssh|git):\/\//i.test(origin)) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('Unsupported Git origin');
    }
    if (parsed.search || parsed.hash) throw new Error('Unsupported Git origin');
    host = parsed.hostname.toLowerCase();
    const defaultGithubPort = host === 'github.com' && GITHUB_DEFAULT_PORTS.includes(parsed.port);
    if (parsed.port && !defaultGithubPort) host += ':' + parsed.port;
    repository = parsed.pathname.replace(/^\/+/, '');
  } else {
    const match = /^(?:[^@/:]+@)?([A-Za-z0-9.-]+):(.+)$/.exec(origin);
    if (!match) throw new Error('Unsupported Git origin');
    host = match[1].toLowerCase();
    repository = match[2];
  }
  repository = repository.replace(/\/+$/, '').replace(/\.git$/i, '');
  const unsafeRepository = !repository
    || /[?#%\\]/.test(repository)
    || repository.split('/').some(part => !part || part === '.' || part === '..');
  if (unsafeRepository) throw new Error('Unsupported Git origin');
  if (host === 'github.com') repository = repository.toLowerCase();
  return 'git:' + host + '/' + repository;
}

export function projectIdentity(project: string): string | null {
  let origin: string;
  try {
    origin = git(project, 'remote', 'get-url', 'origin');
  } catch {
    return null;
  }
  return normalizeOrigin(origin);
}

function registryTarget(config: Json): Json {
  return {
    hostname: 'github.com',
    repository: config.preferences.repository.toLowerCase(),
    branch: config.preferences.branch,
    path: 'improvement/projects.json',
  };
}

function validEntry(entry: unknown): entry is Json {
  return isObject(entry)
    && typeof entry.identity === 'string'
    && REGISTRY_IDENTITY.test(entry.identity)
    && PROJECT_KEY_PATTERN.test(entry.project_key);
}

/** Requires a schema 1 registry in which identities and project keys are each unique. */
function validateRegistry(value: unknown): Json {
  if (!isObject(value) || value.schema_version !== 1 || !Array.isArray(value.projects)) {
    throw new RemoteError('invalid_registry');
  }
  const identities = new Set<unknown>();
  const keys = new Set<unknown>();
  for (const entry of value.projects) {
    if (!validEntry(entry)) throw new RemoteError('registry_conflict');
    if (identities.has(entry.identity) || keys.has(entry.project_key)) throw new RemoteError('registry_conflict');
    identities.add(entry.identity);
    keys.add(entry.project_key);
  }
  return value;
}

function registryFile(args: Json, config: Json): string {
  return safePath(dataHome(args.home), 'registries', digest(JSON.stringify(registryTarget(config))) + '.json');
}

/** Resolves identity from configuration and the local registry cache only; never contacts GitHub. */
export function identityStatus(args: Json, config: Json): Json {
  const key = config.preferences.project_key;
  if (key) return { resolved: true, source: 'explicit', project_key: key, identity: 'id:' + key };
  const identity = projectIdentity(args.project);
  if (!identity) return { resolved: false, source: 'unregistered', identity: null, project_key: null };
  const file = registryFile(args, config);
  rejectSymlink(file, 'Identity cache');
  if (exists(file)) {
    const cached = validateRegistry(readJson(file));
    const entry = cached.projects.find((entry: Json) => entry.identity === identity);
    if (entry) return { resolved: true, source: 'registry-cache', ...entry };
  }
  return { resolved: false, source: 'unregistered', identity, project_key: null };
}

function persistNonGitKey(args: Json, key: string): void {
  // Write beside the common checkout policy, so linked worktrees inherit the ID too.
  const file = projectSettings(args.project)[0] || path.join(canonical(args.project), '.harness.json');
  locked(path.dirname(file), () => {
    rejectSymlink(file, 'Project configuration');
    const value = exists(file) ? readJson(file) : {};
    if (!isObject(value) || (value.preferences !== undefined && !isObject(value.preferences))) {
      throw new Error('Invalid project configuration');
    }
    const recordedKey = value.preferences?.project_key;
    if (recordedKey && recordedKey !== key) throw new RemoteError('registry_conflict');
    value.preferences = { ...value.preferences, project_key: key };
    atomic(file, JSON.stringify(value, null, 2) + '\n');
  }, '.harness-identity.lock');
}

// Status never calls this function. Read may look up a registry but only a recording/register action creates a row.
export function resolveIdentity(args: Json, config: Json, transport: Transport, register: boolean): Json {
  const explicit = config.preferences.project_key || args.project_key;
  if (explicit) taskId(explicit);
  let gitIdentity: string | null = null;
  try {
    gitIdentity = projectIdentity(args.project);
  } catch (error) {
    if (!explicit) throw error;
  }
  // An explicit portable ID remains usable when a later Git origin is local or
  // otherwise unsupported. It still must agree with the remote registry row.
  let key = explicit || (gitIdentity ? 'git-' + digest(gitIdentity).slice(0, 24) : null);
  if (!key && !register) return { resolved: false, identity: null, project_key: null };
  if (!key) key = 'project-' + crypto.randomUUID();
  if (!gitIdentity && register && !config.preferences.project_key) persistNonGitKey(args, key);
  let identity = gitIdentity || 'id:' + key;
  const target = registryTarget(config);
  const file = registryFile(args, config);
  if (args.offline === 'true') {
    const cacheConfig = { ...config, preferences: { ...config.preferences, project_key: explicit || '' } };
    const cached = identityStatus(args, cacheConfig);
    if (!cached.resolved) throw new RemoteError('identity_requires_remote_check');
    return cached;
  }
  const operation = metadata(key, 'register', 'project_registry');
  for (let attempt = 0; attempt < 3; attempt++) {
    const fetched = remote(target, transport);
    let registry: Json;
    try {
      registry = fetched.sha ? validateRegistry(JSON.parse(fetched.content)) : { schema_version: 1, projects: [] };
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError('invalid_registry');
    }
    const projects: Json[] = registry.projects;
    const explicitRowExists = explicit
      && projects.some(entry => entry.project_key === explicit && entry.identity === 'id:' + explicit);
    if (explicitRowExists) identity = 'id:' + explicit;
    const match = projects.find(entry => entry.identity === identity);
    if (match && explicit && match.project_key !== explicit) throw new RemoteError('registry_conflict');
    if (match) key = match.project_key;
    if (projects.some(entry => entry.project_key === key && entry.identity !== identity)) {
      throw new RemoteError('registry_conflict');
    }
    if (!match && register) {
      projects.push({ identity, project_key: key });
      const body: Json = {
        branch: target.branch,
        message: commitMessage(operation),
        content: Buffer.from(JSON.stringify(registry, null, 2) + '\n').toString('base64'),
      };
      if (fetched.sha) body.sha = fetched.sha;
      try {
        const result = transport('PUT', `repos/${target.repository}/contents/${target.path}`, body) as Json | null;
        if (!/^[a-f0-9]{40}$/.test(result?.content?.sha)) throw new RemoteError('invalid_response');
      } catch (error) {
        const retryable = error instanceof RemoteError && RETRYABLE_REGISTER_ERRORS.includes(error.kind);
        if (retryable && attempt < 2) continue;
        throw error;
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    locked(path.dirname(file), () => atomic(file, JSON.stringify(registry, null, 2) + '\n'), '.registry-cache.lock');
    const resolved = Boolean(match || register);
    return { resolved, identity, project_key: key, source: resolved ? 'registry' : 'unregistered' };
  }
  throw new RemoteError('registry_conflict');
}
