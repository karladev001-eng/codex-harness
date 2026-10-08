import { acquire } from './capture.js';
import { validateUserInput } from './inputs.js';
const el = id => document.getElementById(id);
let acquired, working = false, blocked = false, pendingUpdate = false, observedOperation, bootstrapping = true; 
function status(text) { el('status').textContent = text; }
function controls() {
  el('save').disabled = working || blocked || !acquired;
  el('acquire').disabled = el('retry').disabled = working;
  el('html').disabled = el('screenshot').disabled = working || blocked;
}
function render(data) {
  el('preview').hidden = false; el('title').textContent = data.source.title; el('url').textContent = data.source.url;
  el('scope').textContent = `本文 ${data.content.text.length.toLocaleString()}文字 / 見出し ${data.content.headings.length} / 選択 ${data.content.selection.length}文字 / 画像 ${data.screenshot ? 'あり' : 'なし'} / HTML ${data.html ? 'あり' : 'なし'}`;
  el('body').textContent = data.content.text;
  el('limitations').replaceChildren(...data.source.limitations.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
}
async function busy(action) {
  if (working) return;
  working = true; controls();
  try { await action(); } catch (e) { status(e.message); if (!acquired && !blocked && !el('editor').hidden) el('acquire').hidden = false; }
  finally { working = false; controls(); if (pendingUpdate) { pendingUpdate = false; updateResult(); } }
}
function reason(code) {
  const messages = {
    NOT_CONFIGURED:'PCツールで保存先を設定して再送してください。', DESTINATION_NOT_BOUND:'PCツールの retry --bind で保存先を明示してください。',
    DESTINATION_CHANGED:'保存時の保存先と現在の設定が違います。PCで元の設定を確認してください。',
    GH_REQUEST_FAILED:'接続・GitHub認証を確認し、PCツールで再送してください。', GH_UNAVAILABLE:'PCのghパスと導入を確認してください。',
    PRIVATE_WRITABLE_REPOSITORY_REQUIRED:'保存先が非公開で書込可能か、PCで確認してください。',
    KB_SCHEMA_CONFLICT:'保存先の形式またはライブラリIDが違います。PCで設定を確認してください。',
    REF_CONFLICT_OR_UNCONFIRMED:'GitHubの競合または応答未確認です。PCツールで再送してください。',
    LOCKED_MANUAL_INSPECTION_REQUIRED:'PCツールが使用中か、lock状態の点検が必要です。', CORRUPT_LOCAL_STATE:'PCの保存状態が壊れています。データを保持して点検してください。'
  };
  return messages[code] || (typeof code === 'string' && !/^[A-Z0-9_]+$/.test(code) ? code : 'PCツールの状態を確認して再送してください。');
}
function result(data) {
  if (!data) { status('保存応答を確認できません。拡張の送信待ちを再送してください。'); return; }
  if (data.state === 'sent') {
    el('editor').hidden = true; el('heading').textContent = '保存しました'; status('GitHubへ保存しました。');
    el('retry').hidden = el('acquire').hidden = true;
  } else if (data.state === 'pending') {
    status(`PCへ保存済み・GitHub送信待ち。${reason(data.reason)}`);
    el('editor').hidden = true; el('heading').textContent = 'PC送信待ち';
  } else if (data.state === 'error') status(reason(data.reason));
  else status(`拡張の送信待ちはありません。PC送信待ち ${data.pending || 0}件。`);
}
async function refresh() {
  acquired = undefined; observedOperation = undefined; el('acquire').hidden = true; status('ページの取得中…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const data = await acquire(chrome, tab, { html: el('html').checked, screenshot: el('screenshot').checked });
    acquired = { schema_version: 1, operation_id: crypto.randomUUID(), captured_at: new Date().toISOString(), ...data, note: '', tags: [] };
    render(data); status(data.source.limitations.length ? '取得しました。詳細に未取得部分の記録があります。' : '保存できます。');
  } catch (e) { el('preview').hidden = true; el('acquire').hidden = false; throw e; }
}
async function reconcile() {
  const state = await chrome.runtime.sendMessage({ action: 'captureStatus' });
  blocked = Boolean(state?.pending || state?.saving);
  if (blocked && !acquired && !observedOperation) observedOperation = state.operation_id;
  el('retry').hidden = !state?.pending || Boolean(state?.saving);
  if (blocked && state.source_url) { el('preview').hidden = false; el('title').textContent = '前の保存操作'; el('url').textContent = state.source_url; }
  if (state?.saving) { status('PCに保存しています… 閉じても送信は続きます。'); return state; }
  if (state?.pending) { status('拡張に送信待ちがあります。再送してから保存してください。'); return state; }
  return state;
}
async function save() {
  await busy(async () => {
    if (!acquired || blocked) return;
    const tags = el('tags').value.split(',').map(s => s.trim()).filter(Boolean);
    validateUserInput(el('note').value, tags);
    const operation = { ...acquired, note: el('note').value, tags };
    observedOperation = operation.operation_id;
    status('PCに保存しています… 閉じても送信は続きます。');
    const response = await chrome.runtime.sendMessage({ action: 'save', capture: operation });
    const state = await reconcile();
    result(response);
    if (response?.state === 'sent' || response?.state === 'pending' || state?.pending) acquired = undefined;
    if (response?.operation_id) await chrome.runtime.sendMessage({ action: 'acknowledge', operation_id: response.operation_id });
  });
}
el('save').addEventListener('click', save);
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); save(); } });
el('acquire').addEventListener('click', () => busy(refresh));
for (const id of ['html', 'screenshot']) el(id).addEventListener('change', () => busy(async () => {
  acquired = undefined; el('acquire').hidden = false;
  await chrome.storage.local.set({ captureSettings: { html: el('html').checked, screenshot: el('screenshot').checked } });
  await refresh();
}));
el('retry').addEventListener('click', () => busy(async () => {
  status('拡張の送信待ちを再送中…');
  const response = await chrome.runtime.sendMessage({ action: 'retry' });
  await reconcile(); result(response);
  if (response?.operation_id) await chrome.runtime.sendMessage({ action: 'acknowledge', operation_id: response.operation_id });
}));
// Storage updates survive popup destruction; reopen observes the worker's state.
function updateResult() {
  if (working) { pendingUpdate = true; return; }
  busy(async () => {
    const state = await reconcile();
    if (!state?.saving && state?.result?.unread && state.result.operation_id === observedOperation) {
      result(state.result);
      await chrome.runtime.sendMessage({ action: 'acknowledge', operation_id: state.result.operation_id });
    }
  });
}
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.captureResult?.newValue?.unread && (bootstrapping || changes.captureResult.newValue.operation_id === observedOperation) && changes.captureResult.newValue.state !== 'saving') updateResult();
});
el('note').focus();
busy(async () => {
  const { captureSettings } = await chrome.storage.local.get('captureSettings');
  for (const id of ['html', 'screenshot']) if (typeof captureSettings?.[id] === 'boolean') el(id).checked = captureSettings[id];
  const state = await reconcile();
  if (blocked) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (state?.result?.unread && ['sent', 'pending'].includes(state.result.state) && state.result.source_url === tab?.url) {
    result(state.result);
    await chrome.runtime.sendMessage({ action: 'acknowledge', operation_id: state.result.operation_id });
    return;
  }
  await refresh();
}).finally(() => { bootstrapping = false; });
