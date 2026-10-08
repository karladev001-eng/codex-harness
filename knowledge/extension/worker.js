import { validateUserInput } from './inputs.js';
import { acquire } from './capture.js';
import { mountPanel, panelProbe, panelVisibility } from './panel.js';
const HOST = 'com.codex_harness.knowledge';
export function native(api, message) {
  return new Promise((resolve, reject) => {
    const port = api.runtime.connectNative(HOST); let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; port.disconnect(); reject(new Error('PCツールの応答がありません。再送できます。')); } }, 240000);
    port.onMessage.addListener(response => { if (done) return; done = true; clearTimeout(timer); port.disconnect(); resolve(response); });
    port.onDisconnect.addListener(() => { if (done) return; done = true; clearTimeout(timer); const error = api.runtime.lastError; reject(new Error(error?.message ? 'PCツールに接続できません。導入手順を確認して再送してください。' : 'PCツールの接続が終了しました。再送できます。')); });
    port.postMessage(message);
  });
}
export async function deliver(api, capture) {
  validateUserInput(capture.note, capture.tags);
  const stored = await api.storage.local.get('pending');
  if (stored.pending && stored.pending.operation_id !== capture.operation_id) throw new Error('拡張の送信待ちを先に再送してください。');
  // Browser queue persists identity before opening the native host. An ambiguous ACK retries same operation.
  if (stored.pending && JSON.stringify(stored.pending) !== JSON.stringify(capture)) throw new Error('同じ保存操作の内容が変わりました。元の送信待ちを再送してください。');
  if (!stored.pending) await api.storage.local.set({ pending: capture });
  const result = await native(api, { action: 'save', capture });
  if (!result.durable || result.operation_id !== capture.operation_id || !['sent', 'pending'].includes(result.state)) throw new Error('PC側で保存を確認できません。拡張の送信待ちを再送してください。');
  await api.storage.local.remove('pending');
  if (result.state === 'sent') return result;
  try { const synced = await native(api, { action: 'sync', operation_id: capture.operation_id }); return synced.results?.find(row => row.operation_id === capture.operation_id) || { state: 'pending', reason: synced.reason || 'PC送信待ち' }; }
  catch { return { state: 'pending', reason: 'PC送信待ち（送信応答未確認）' }; }
}
let queue = Promise.resolve();
export function serialized(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; }
let activeOperation;
async function badge(api, state) {
  if (!api.action?.setBadgeText) return;
  try {
  await api.action.setBadgeText({ text: state === 'saving' ? '…' : state === 'sent' ? '✓' : state ? '!' : '' });
  await api.action.setBadgeBackgroundColor?.({ color: state === 'sent' ? '#265c46' : '#8b632b' });
  } catch { /* Badge failures must not interrupt the durable queue. */ }
}
export async function captureStatus(api) {
  const { pending, captureResult: storedResult } = await api.storage.local.get(['pending', 'captureResult']);
  let captureResult = storedResult;
  if (!activeOperation && captureResult?.state === 'saving') {
    // A worker restart can interrupt the optional sync after the durable PC ACK.
    captureResult = { ...captureResult, state: pending ? 'error' : 'pending', reason: pending ? 'PC接続の応答未確認。拡張の送信待ちを再送してください。' : 'PC送信待ち（送信応答未確認）' };
  }
  const saving = Boolean(activeOperation && !(captureResult?.operation_id === activeOperation && captureResult.state !== 'saving'));
  return { pending: Boolean(pending), saving, operation_id: activeOperation || pending?.operation_id || captureResult?.operation_id, source_url: pending?.source?.url || captureResult?.source_url, result: captureResult?.state === 'saving' ? undefined : captureResult };
}
export async function acknowledge(api, operationId) {
  const { captureResult, pending } = await api.storage.local.get(['captureResult', 'pending']);
  if (captureResult?.operation_id === operationId && (!activeOperation || captureResult.state !== 'saving')) {
    const result = captureResult.state === 'saving' ? { ...captureResult, state: pending ? 'error' : 'pending', reason: 'PC送信待ち（送信応答未確認）' } : captureResult;
    await api.storage.local.set({ captureResult: { ...result, unread: false } });
    await badge(api, result.state === 'sent' ? undefined : result.state);
  }
  return { acknowledged: true };
}
export async function saveTracked(api, capture) {
  // Reject a competing operation before changing the visible result or badge.
  validateUserInput(capture.note, capture.tags);
  const { pending } = await api.storage.local.get('pending');
  if (pending && (pending.operation_id !== capture.operation_id || JSON.stringify(pending) !== JSON.stringify(capture))) {
    return { state: 'error', reason: '拡張の送信待ちを先に再送してください。' };
  }
  activeOperation = capture.operation_id;
  const metadata = { operation_id: capture.operation_id, source_url: capture.source.url, unread: true };
  try {
    // Persist the complete replayable operation and its visible phase together.
    await api.storage.local.set({ pending: pending || capture, captureResult: { ...metadata, state: 'saving' } });
    await badge(api, 'saving');
    let response;
    try { response = await deliver(api, capture); }
    catch (error) { response = { state: 'error', reason: error.message }; }
    const result = { ...metadata, state: response.state, ...(response.reason ? { reason: response.reason } : {}) };
    await api.storage.local.set({ captureResult: result });
    await badge(api, result.state);
    return { ...response, operation_id: capture.operation_id };
  } finally { activeOperation = undefined; }
}
async function retryTracked(api) {
  const { pending } = await api.storage.local.get('pending');
  if (pending) return saveTracked(api,pending);
  return native(api,{action:'status'});
}
export function handleMessage(api, message) {
  // Read status without waiting behind a potentially slow native save.
  if (message.action === 'captureStatus') return captureStatus(api);
  if (message.action === 'acknowledge') return serialized(() => acknowledge(api, message.operation_id));
  return serialized(async () => {
    if (message.action === 'save') return saveTracked(api, message.capture);
    if (message.action === 'retry') return retryTracked(api);
    throw new Error('不明な操作です。');
  });
}

const sessionKey = tabId => `panel:${tabId}`;
const opening = new Map();
const sessionWrites = new Map();
function sessionLocked(key, action) {
  const result = (sessionWrites.get(key) || Promise.resolve()).catch(() => {}).then(action);
  sessionWrites.set(key,result);
  const cleanup = () => { if (sessionWrites.get(key) === result) sessionWrites.delete(key); };
  result.then(cleanup,cleanup);
  return result;
}
function sameSession(a,b) {
  return a?.token === b.token && a.documentId === b.documentId && a.tabId === b.tabId && a.url === b.url && a.time === b.time;
}
async function updateSession(api,key,accepted,update) {
  return sessionLocked(key,async () => {
    const latest = (await api.storage.session.get(key))[key];
    if (!sameSession(latest,accepted)) return false;
    await api.storage.session.set({[key]:update(latest)});
    return true;
  });
}
async function openFallback(api,tab) {
  await api.action.setPopup({tabId:tab?.id,popup:'popup.html'});
  try { await api.action.openPopup(tab?.windowId ? {windowId:tab.windowId} : {}); }
  finally { await api.action.setPopup({tabId:tab?.id,popup:''}); }
}
export async function openPanel(api, tab) {
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) {
    await openFallback(api,tab); return { fallback:true };
  }
  if (opening.has(tab.id)) return opening.get(tab.id);
  const openingTask = (async () => {
    try {
      const [probe] = await api.scripting.executeScript({ target:{tabId:tab.id}, func:panelProbe });
      if (!probe?.documentId || probe.result.url !== tab.url) throw Error('ページが移動しました。もう一度開いてください。');
      const key = sessionKey(tab.id);
      const session = await sessionLocked(key,async () => {
        const stored = (await api.storage.session.get(key))[key];
        if (stored && stored.documentId === probe.documentId && stored.token === probe.result.session && stored.url === probe.result.url && stored.time === probe.result.time) return stored;
        const fresh = { token:crypto.randomUUID(), tabId:tab.id, documentId:probe.documentId, url:probe.result.url, time:probe.result.time };
        await api.storage.session.set({[key]:fresh});
        return fresh;
      });
      await api.scripting.executeScript({target:{tabId:tab.id,documentIds:[probe.documentId]},func:mountPanel,args:[session.token]});
      return { opened:true };
    } catch (error) {
      // Chrome Web Store and other restricted HTTPS pages cannot accept scripts.
      await openFallback(api,tab); return { fallback:true, reason:error.message };
    }
  })();
  opening.set(tab.id,openingTask);
  try { return await openingTask; } finally { opening.delete(tab.id); }
}
async function verifyPanelIdentity(api,session) {
  const [identity] = await api.scripting.executeScript({target:{tabId:session.tabId,documentIds:[session.documentId]},func:panelProbe});
  if (identity?.documentId !== session.documentId || identity?.result?.session !== session.token || identity?.result?.url !== session.url || identity?.result?.time !== session.time) throw Error('ページが移動しました。保存パネルを開き直してください。');
}
export async function authorizePanel(api, message, sender) {
  if (sender.id !== api.runtime.id || sender.frameId !== 0 || !sender.documentId || !sender.tab?.id || typeof message.panel_session !== 'string') throw Error('保存パネルを拡張アイコンから開き直してください。');
  const key = sessionKey(sender.tab.id), session = (await api.storage.session.get(key))[key];
  let sameOrigin = false;
  try { sameOrigin = /^https?:\/\//.test(sender.url) && new URL(sender.url).origin === new URL(session?.url).origin; } catch { /* Missing or invalid sender metadata is not authorized. */ }
  if (!session || session.token !== message.panel_session || session.documentId !== sender.documentId || session.tabId !== sender.tab.id || !sameOrigin) throw Error('ページが移動しました。保存パネルを開き直してください。');
  // A content-script context can retain its creation URL after same-document navigation.
  // Browser-bound document/frame identity and a live isolated-world probe authorize the current URL.
  await verifyPanelIdentity(api,session);
  const latest = (await api.storage.session.get(key))[key];
  if (!sameSession(latest,session)) throw Error('ページが移動しました。保存パネルを開き直してください。');
  return {key,session};
}
export async function handlePanelMessage(api, message, sender) {
  const {key,session} = await authorizePanel(api,message,sender);
  if (message.action === 'captureStatus') {
    const state = await captureStatus(api), {captureSettings} = await api.storage.local.get('captureSettings');
    return {...state,settings:captureSettings};
  }
  // Acquisition and save acceptance share the durable worker queue. Closure is UI-only.
  return serialized(async () => {
    const current = (await api.storage.session.get(key))[key];
    if (!sameSession(current,session)) throw Error('保存パネルを開き直してください。');
    await verifyPanelIdentity(api,session);
    if (message.action === 'acknowledge') return acknowledge(api,message.operation_id);
    if (message.action === 'retry') return retryTracked(api);
    if (message.action === 'panelAcquire') {
      const state = await captureStatus(api);
      if (state.pending || state.saving) throw Error('前の保存操作を完了してから取得してください。');
      const settings = {html:message.settings?.html !== false,screenshot:message.settings?.screenshot !== false};
      const tab = await api.tabs.get(session.tabId);
      let data;
      try {
        await api.scripting.executeScript({target:{tabId:session.tabId,documentIds:[session.documentId]},func:panelVisibility,args:[true]});
        data = await acquire(api,tab,{...settings,documentId:session.documentId});
      }
      finally { await api.scripting.executeScript({target:{tabId:session.tabId,documentIds:[session.documentId]},func:panelVisibility,args:[false]}).catch(()=>{}); }
      await verifyPanelIdentity(api,session);
      const capture = {schema_version:1,operation_id:crypto.randomUUID(),captured_at:new Date().toISOString(),...data,note:'',tags:[]};
      const retained = await updateSession(api,key,session,latest => ({...latest,capture,completed:undefined,completion:undefined}));
      if (!retained) throw Error('ページが移動しました。保存パネルを開き直してください。');
      await api.storage.local.set({captureSettings:settings});
      return {capture};
    }
    if (message.action === 'save') {
      if (current.completed === message.capture?.operation_id) return current.completion || {state:'pending',operation_id:current.completed};
      if (!current.capture || current.capture.operation_id !== message.capture?.operation_id) throw Error('取得し直してから保存してください。');
      // Source/body originate exclusively from worker acquisition, never from a page bridge.
      const capture = {...current.capture,note:message.capture.note,tags:message.capture.tags};
      validateUserInput(capture.note,capture.tags);
      const result = await saveTracked(api,capture);
      if (result.operation_id) await updateSession(api,key,session,latest => ({...latest,capture:undefined,completed:capture.operation_id,completion:{state:result.state,operation_id:result.operation_id,...(result.reason ? {reason:result.reason} : {})}}));
      return result;
    }
    throw Error('不明な操作です。');
  });
}
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    let task;
    if (sender.url === chrome.runtime.getURL('popup.html') && !sender.tab) task = handleMessage(chrome,message);
    else if (message?.panel_session && sender.tab) task = handlePanelMessage(chrome,message,sender);
    else return false;
    task.then(reply,error=>reply({state:'error',reason:error.message})); return true;
  });
  chrome.action.onClicked.addListener(tab=>{openPanel(chrome,tab).catch(()=>{});});
  chrome.commands.onCommand.addListener(async command=>{if(command==='save-page'){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await openPanel(chrome,tab);}});
  chrome.tabs.onRemoved.addListener(tabId=>{sessionLocked(sessionKey(tabId),()=>chrome.storage.session.remove(sessionKey(tabId))).catch(()=>{});});
}
