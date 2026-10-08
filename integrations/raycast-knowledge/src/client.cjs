'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const execute = promisify(execFile);
function absolute(value, fallback, home) {
  const input = value?.trim() || fallback;
  const expanded = input === '~' ? home : input.startsWith('~/') ? path.join(home, input.slice(2)) : input;
  if (!path.isAbsolute(expanded) || /[\r\n\0]/.test(expanded)) throw new Error('設定には絶対パスを指定してください');
  return expanded;
}
async function resolvePaths(preferences = {}, home = os.homedir()) {
  let defaultNode = '/opt/homebrew/bin/node';
  try { await fs.access(defaultNode, fs.constants.X_OK); } catch { defaultNode = '/usr/local/bin/node'; }
  const paths = {
    node: absolute(preferences.nodePath, defaultNode, home),
    cli: absolute(preferences.cliPath, path.join(home, '.agents/skills/codex-harness/knowledge/cli.cjs'), home),
    state: absolute(preferences.statePath, path.join(home, '.codex/knowledge'), home),
  };
  try { await fs.access(paths.node, fs.constants.X_OK); await fs.access(paths.cli, fs.constants.R_OK); }
  catch { throw new Error('Node.js または Knowledge CLI が見つかりません。拡張設定を確認してください'); }
  return paths;
}
function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function escapeMarkdown(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&');
}
function cardMarkdown(card) {
  const section = (name, value) => value ? `## ${name}\n\n${escapeMarkdown(value)}\n\n` : '';
  return section('説明', card.summary || '説明はまだありません') + section('メモ', card.note_excerpt || 'メモはありません') +
    section('検索一致箇所', (card.matches || []).map(m => `${m.field === 'note' ? 'メモ' : '本文'}: ${m.excerpt}`).join('\n\n')) +
    section('用途', card.use_cases.join('\n\n')) + section('根拠', card.evidence.join('\n\n')) +
    section('見た目', card.appearance) + section('出所の制約', card.source_limitations.join('\n\n')) +
    section('説明の制約', [...card.analysis_limitations, ...card.image_limitations].join('\n\n'));
}
function validateSearch(value) {
  if (!value || typeof value !== 'object' || !value.freshness || typeof value.freshness.state !== 'string' || !Array.isArray(value.results) || value.results.length > 50) throw new Error('CLI の検索応答が不正です');
  const strings = ['capture_id', 'title', 'url', 'kind', 'captured_at', 'analysis_state', 'note_excerpt'];
  const lists = ['tags', 'use_cases', 'evidence', 'source_limitations', 'analysis_limitations', 'image_limitations'];
  for (const card of value.results) {
    if (!card || strings.some(key => typeof card[key] !== 'string') || lists.some(key => !Array.isArray(card[key]) || card[key].some(item => typeof item !== 'string')) || (card.summary !== null && typeof card.summary !== 'string') || (card.appearance !== null && typeof card.appearance !== 'string') || (card.matches !== undefined && (!Array.isArray(card.matches) || card.matches.some(m => !m || !['note', 'content'].includes(m.field) || typeof m.excerpt !== 'string')))) throw new Error('CLI の資料カードが不正です');
  }
  return value;
}
async function invoke(paths, command, args = [], runner = execute) {
  const allowed = { search: true, pull: true };
  if (!allowed[command]) throw new Error('読み取りコマンドのみ使用できます');
  try {
    const { stdout } = await runner(paths.node, [paths.cli, command, ...args, '--state', paths.state], {
      shell: false, timeout: 75000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(':') },
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.killed || error.code === 'ETIMEDOUT') throw new Error('CLI がタイムアウトしました。キャッシュ表示を保持しています');
    const reason = String(error.stderr || error.message || '').trim().slice(0, 300);
    throw new Error(`CLI エラー: ${reason || '実行に失敗しました'}`);
  }
}
async function search(paths, query, runner) {
  if (Buffer.byteLength(query) > 1000) throw new Error('検索語は1000バイト以内で入力してください');
  const value = validateSearch(await invoke(paths, 'search', ['--query', query, '--limit', '50'], runner));
  if (value.freshness.state === 'throttled') {
    try {
      const health = JSON.parse(await fs.readFile(path.join(paths.state, 'read/health.json'), 'utf8'));
      if (health.state === 'offline') value.freshness = { ...value.freshness, state: 'offline', reason: health.reason };
    } catch { /* A missing health file does not prove freshness. */ }
  }
  return value;
}
function freshnessLabel(value) {
  const state = value?.freshness?.state;
  const checked = value?.checked_at || value?.freshness?.checked_at;
  const date = checked ? ` · 最終確認 ${checked}` : '';
  if (state === 'unconfigured') return '未設定 · Knowledge CLI の configure が必要です';
  if (state === 'offline') return `同期失敗 / offline · ${value.results.length ? 'キャッシュを表示' : '未同期'}${date}`;
  if (state === 'busy') return `同期中 / busy · ${value.results.length ? 'キャッシュを表示' : 'キャッシュなし'}${date}`;
  if (!value?.commit) return '未同期 · 手動同期してください';
  if (state === 'current') return `同期確認済み${date}`;
  return `キャッシュ表示 · 今回は同期確認を省略${date}`;
}
function freshnessShortLabel(value) {
  const state = value?.freshness?.state;
  if (state === 'unconfigured') return '未設定';
  if (state === 'offline') return value.results.length ? '同期失敗・キャッシュ' : '同期失敗・未同期';
  if (state === 'busy') return value.results.length ? '同期中・キャッシュ' : '同期中';
  if (!value?.commit) return '未同期';
  return state === 'current' ? '同期確認済み' : 'キャッシュ表示';
}
class RequestGate {
  constructor() { this.version = 0; }
  invalidate() { return ++this.version; }
  current(version) { return this.version === version; }
}
module.exports = { resolvePaths, safeUrl, escapeMarkdown, cardMarkdown, validateSearch, invoke, search, freshnessLabel, freshnessShortLabel, RequestGate };
