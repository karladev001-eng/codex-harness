import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Json, codexHome, digest, exists, isObject, readJson, rejectSymlink, safePath, canonical } from './lib';
export type Transport = (method: string, endpoint: string, body?: Json) => any;
export class RemoteError extends Error {
  constructor(public kind: string) { super('GitHub preferences: ' + kind); }
}
// Neither credentials nor raw stderr/response bodies are persisted.
export const github: Transport = (method, endpoint, body) => {
  const result = spawnSync('gh', ['api', '--hostname', 'github.com', '--method', method,
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint,
    ...(body ? ['--input', '-'] : [])], { input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const status = /\bHTTP (\d{3})\b/.exec(result.stderr || '')?.[1];
    throw new RemoteError(status === '401' ? 'authentication' : status === '403' ? 'forbidden' :
      status === '404' ? 'not_found_or_inaccessible' : ['409', '422'].includes(status || '') ? 'conflict' : 'unavailable');
  }
  try { return JSON.parse(result.stdout); } catch { throw new RemoteError('invalid_response'); }
};
export function atomic(file: string, content: string): void {
  rejectSymlink(file, 'Record file');
  const temporary = safePath(path.dirname(file), '.preferences-' + crypto.randomUUID() + '.tmp');
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    if (process.platform !== 'win32') {
      const directory = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally { if (exists(temporary)) fs.unlinkSync(temporary); }
}
export function locked<T>(directory: string, action: () => T, name = '.preferences.lock'): T {
  rejectSymlink(directory, 'Record directory');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = safePath(directory, name);
  try { fs.mkdirSync(lock); } catch (error: any) {
    if (error.code === 'EEXIST') throw new Error('Preferences locked; do not remove an unknown or stale lock automatically');
    throw error;
  }
  try { return action(); } finally { fs.rmdirSync(lock); }
}
export function textInput(file: string): string {
  const data = fs.readFileSync(file);
  if (data.length > 512 * 1024) throw new Error('Preferences must be at most 512 KiB');
  const content = data.toString('utf8');
  if (!Buffer.from(content).equals(data) || content.includes('\0')) throw new Error('Preferences must be UTF-8 text');
  return content;
}
export function privateRef(target: Json, transport: Transport): void {
  if (transport('GET', `repos/${target.repository}`).private !== true) throw new RemoteError('private_repository_required');
  transport('GET', `repos/${target.repository}/branches/${encodeURIComponent(target.branch)}`);
}
export function decodeRemote(result: any): Json {
  if (!result || result.type !== 'file' || result.encoding !== 'base64' || !/^[a-f0-9]{40}$/.test(result.sha) || typeof result.content !== 'string') throw new RemoteError('invalid_response');
  const encoded = result.content.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new RemoteError('invalid_response');
  const bytes = Buffer.from(encoded, 'base64'), content = bytes.toString('utf8');
  if (bytes.toString('base64') !== encoded || bytes.length > 512 * 1024 || !Buffer.from(content).equals(bytes) || content.includes('\0')) throw new RemoteError('invalid_response');
  return { sha: result.sha, content, fetched_at: new Date().toISOString() };
}
export function remote(target: Json, transport: Transport): Json {
  privateRef(target, transport);
  try { return decodeRemote(transport('GET', `repos/${target.repository}/contents/${target.path}?ref=${encodeURIComponent(target.branch)}`)); }
  catch (error) {
    if (!(error instanceof RemoteError) || error.kind !== 'not_found_or_inaccessible') throw error;
    privateRef(target, transport);
    return { sha: null, content: '', fetched_at: new Date().toISOString() };
  }
}
export const targetId = (target: Json): string => digest(JSON.stringify(target));
export const targetRoot = (home?: string): string => safePath(codexHome(home), 'harness', 'targets');
export const targetDirectory = (target: Json, home?: string): string => safePath(targetRoot(home), targetId(target));
export function metadata(projectKey: string, kind: string, recordKind = 'preferences'): Json {
  if (!['create', 'update', 'correction', 'forget', 'migrate', 'register'].includes(kind)) throw new Error('Invalid record operation kind');
  return { schema_version: 1, project_key: projectKey, operation_id: crypto.randomUUID(), kind, record_kind: recordKind, recorded_at: new Date().toISOString() };
}
export const commitMessage = (operation: Json): string => 'Harness record\n\n' + JSON.stringify(operation);
export function targetIndex(home?: string): Json {
  const file = safePath(targetRoot(home), 'index.json'); rejectSymlink(file, 'Target index');
  if (!exists(file)) return { schema_version: 1, targets: {} };
  const value = readJson(file);
  if (!isObject(value) || value.schema_version !== 1 || !isObject(value.targets)) throw new Error('Corrupt target index');
  for (const [id, entry] of Object.entries(value.targets) as [string, Json][]) {
    if (!isObject(entry) || !isObject(entry.target) || targetId(entry.target) !== id || !Array.isArray(entry.sources) || entry.sources.some((source: unknown) => typeof source !== 'string' || !path.isAbsolute(source))) throw new Error('Corrupt target index');
  }
  return value;
}
export function registerTarget(args: Json, target: Json): void {
  const root = targetRoot(args.home);
  locked(root, () => {
    const index = targetIndex(args.home), id = targetId(target);
    const entry = index.targets[id] || { target, sources: [] };
    const source = canonical(args.project);
    if (!entry.sources.includes(source)) entry.sources.push(source);
    index.targets[id] = entry;
    atomic(safePath(root, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  }, '.index.lock');
}
