import { extractPage } from './extract.js';
export async function acquire(chromeApi, tab, { html, screenshot, documentId }) {
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('このページでは取得できません。通常のWebページを開いてください。');
  const [result] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, ...(documentId ? { documentIds: [documentId] } : {}) }, func: extractPage, args: [html] });
  if (!result?.result || result.result.document_url !== tab.url) throw new Error('ページが移動しました。取得し直してください。');
  const data = result.result;
  if (screenshot) {
    let changed = false;
    const activated = info => { if (info.windowId === tab.windowId && info.tabId !== tab.id) changed = true; };
    const updated = (id, info) => { if (id === tab.id && (info.url || info.status === 'loading')) changed = true; };
    chromeApi.tabs.onActivated?.addListener(activated); chromeApi.tabs.onUpdated?.addListener(updated);
    const active = await chromeApi.tabs.query({ active: true, windowId: tab.windowId });
    if (active[0]?.id !== tab.id || active[0]?.url !== tab.url) { chromeApi.tabs.onActivated?.removeListener(activated); chromeApi.tabs.onUpdated?.removeListener(updated); throw new Error('タブが切り替わりました。取得し直してください。'); }
    try {
      const image = await chromeApi.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 });
      const after = await chromeApi.tabs.query({ active: true, windowId: tab.windowId });
      const [identity] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, ...(documentId ? { documentIds: [documentId] } : {}) }, func: () => ({ url: location.href, time: performance.timeOrigin }) });
      if (changed || after[0]?.id !== tab.id || after[0]?.url !== tab.url || identity?.result?.url !== data.document_url || identity?.result?.time !== data.time_origin) throw new Error('CAPTURE_CHANGED');
      if (image.length > 1500000) data.source.limitations.push('画像は容量上限を超えたため未取得。'); else data.screenshot = image;
    } catch (e) { if (e.message === 'CAPTURE_CHANGED') throw new Error('撮影中にタブ/ページが変わりました。取得し直してください。'); data.source.limitations.push('表示範囲の画像を取得できませんでした。'); }
    finally { chromeApi.tabs.onActivated?.removeListener(activated); chromeApi.tabs.onUpdated?.removeListener(updated); }
  }
  // Detect same-URL reload even when screenshot is disabled.
  const [identity] = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, ...(documentId ? { documentIds: [documentId] } : {}) }, func: () => ({ url: location.href, time: performance.timeOrigin }) });
  if (identity?.result?.url !== data.document_url || identity?.result?.time !== data.time_origin) throw new Error('取得中にページが変わりました。取得し直してください。');
  delete data.document_url; delete data.time_origin; return data;
}
