import { Json, digest, isObject, localRoot, safePath, taskId } from './lib';
import { preferences, preferenceTarget } from './preferences';
import { Transport, github, privateRef, RemoteError, textInput } from './records';
import { resolveIdentity, identityStatus, projectIdentity } from './identity';
export function validateLesson(value: any): Json {
  const text = (item: unknown) => typeof item === 'string' && item.trim().length > 0 && item.length <= 16384 && !item.includes('\0');
  if (!isObject(value) || value.schema_version !== 1) throw new Error('Lesson requires schema_version 1');
  taskId(value.id);
  for (const field of ['cause', 'remedy']) if (!text(value[field])) throw new Error('Lesson requires ' + field);
  for (const field of ['verification', 'scope', 'sources']) if (!Array.isArray(value[field]) || !value[field].length || value[field].length > 32 || !value[field].every(text)) throw new Error('Lesson requires nonempty ' + field + ' array');
  if (typeof value.recorded_at !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.recorded_at) || !Number.isFinite(Date.parse(value.recorded_at))) throw new Error('Lesson requires recorded_at timestamp with timezone');
  const calendar = /^(\d{4})-(\d\d)-(\d\d)T/.exec(value.recorded_at)!;
  const date = new Date(0); date.setUTCFullYear(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3]));
  if (date.getUTCFullYear() !== Number(calendar[1]) || date.getUTCMonth() !== Number(calendar[2]) - 1 || date.getUTCDate() !== Number(calendar[3])) throw new Error('Lesson recorded_at has invalid date');
  if (!['unknown', 'accepted', 'rejected'].includes(value.evaluation)) throw new Error('Lesson requires explicit evaluation, including unknown');
  if (value.evaluation !== 'unknown' && (!Array.isArray(value.evaluation_sources) || !value.evaluation_sources.length || !value.evaluation_sources.every(text))) throw new Error('Evaluated lesson requires evaluation_sources');
  const allowed = ['schema_version', 'id', 'cause', 'remedy', 'verification', 'scope', 'sources', 'recorded_at', 'evaluation', 'evaluation_sources'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown lesson field');
  return value;
}
export function lessons(args: Json, config: Json, transport: Transport = github): Json {
  if (!config.enabled || !config.persistence || config.preferences.enabled === false || (args.automatic && (!config.improvement_loop || config.preferences.autosave === false))) return { skipped: 'record policy disabled' };
  let record: Json | null = null;
  if (args.action === 'write') {
    try { record = validateLesson(JSON.parse(textInput(args.input))); }
    catch (error) { if (error instanceof SyntaxError) throw new Error('Lesson input must be JSON'); throw error; }
    if (args.id && args.id !== record.id) throw new Error('Lesson ID does not match input');
    args = { ...args, id: record.id };
  }
  if (config.preferences.repository && config.preferences.autosave) {
    try {
      const identity = resolveIdentity(args, config, transport, false);
      if (!identity.project_key) return { ok: false, error: 'identity_unresolved', freshness: 'stale' };
      config = { ...config, preferences: { ...config.preferences, project_key: identity.project_key } };
    } catch (error) {
      if (!(error instanceof RemoteError) || !['unavailable', 'authentication', 'forbidden', 'not_found_or_inaccessible', 'identity_requires_remote_check'].includes(error.kind)) return { ok: false, error: error instanceof RemoteError ? error.kind : 'identity_resolution_failed', freshness: 'stale' };
      const cached = identityStatus(args, config), origin = config.preferences.project_key ? null : projectIdentity(args.project);
      const key = config.preferences.project_key || cached.project_key || (origin ? 'git-' + digest(origin).slice(0, 24) : null);
      if (!key) return { ok: false, error: error.kind, freshness: 'stale' };
      config = { ...config, preferences: { ...config.preferences, project_key: key } };
    }
  }
  const target = preferenceTarget(config);
  if (args.action === 'search') {
    if (!target) throw new Error('Lesson search requires GitHub preferences configuration');
    if (args.offline === 'true') return { ok: false, freshness: 'stale', error: 'fresh_required', lessons: [] };
    const limit = Number(args.limit || 3);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Lesson limit must be 1–10');
    const directory = target.path.replace(/preferences\.md$/, 'lessons');
    try {
      privateRef(target, transport);
      let files: any;
      try { files = transport('GET', `repos/${target.repository}/contents/${directory}?ref=${encodeURIComponent(target.branch)}`); }
      catch (error) {
        if (!(error instanceof RemoteError) || error.kind !== 'not_found_or_inaccessible') throw error;
        privateRef(target, transport); return { ok: true, freshness: 'fresh', lessons: [] };
      }
      if (!Array.isArray(files) || files.length > 1000) throw new RemoteError('invalid_response');
      const found: Json[] = [];
      let checked = 0;
      for (const file of files.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
        if (!file || file.type !== 'file' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/.test(file.name) || file.path !== directory + '/' + file.name) throw new RemoteError('invalid_response');
        if (checked++ >= 20 || found.length >= limit) break;
        const result = lessons({ ...args, action: 'read', id: file.name.slice(0, -5), automatic: args.automatic }, config, transport);
        if (!result.ok || result.freshness !== 'fresh') return { ok: false, freshness: 'stale', error: 'fresh_required', lessons: [] };
        if (result.lesson && (!args.query || JSON.stringify(result.lesson).toLowerCase().includes(args.query.toLowerCase()))) found.push(result.lesson);
      }
      return { ok: true, freshness: 'fresh', lessons: found };
    } catch (error) { return { ok: false, freshness: 'stale', error: error instanceof RemoteError ? error.kind : 'invalid_lesson', lessons: [] }; }
  }
  const id = taskId(args.id), recordTarget = target ? { ...target, path: target.path.replace(/preferences\.md$/, `lessons/${id}.json`) } : null;
  const request: Json = { ...args, _target: recordTarget, _record: 'lesson', _local_file: safePath(localRoot(args.project, args.home), 'lessons', id + '.json') };
  if (args.action === 'forget') { request.action = 'write'; request._delete = true; request._content = ''; request.kind = 'forget'; }
  if (record) request._content = JSON.stringify(record, null, 2) + '\n';
  const result = preferences(request, config, transport);
  if (result.skipped) return result;
  const { content, remote_content, ...output } = result;
  if (content && !request._delete) {
    try {
      const lesson = validateLesson(JSON.parse(content));
      if (lesson.id !== id) throw new Error('Lesson ID mismatch');
      // Pending/stale records are available for explicit management, never automatic application.
      if (args.automatic && result.freshness !== 'fresh') return { ...output, ok: false, error: 'fresh_required', lesson: null };
      return { ...output, lesson };
    } catch { return { ...output, ok: false, error: 'invalid_lesson', lesson: null }; }
  }
  return { ...output, lesson: null };
}
