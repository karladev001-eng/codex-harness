// Serialized by chrome.scripting into the active tab's isolated world.
// No web-accessible resources, page messages or DOM-visible session credentials.
export function mountPanel(session) {
  const existing = globalThis.__knowledgeCapturePanel;
  if (existing?.session === session && existing.host.isConnected) { existing.open(true); return; }
  const draft = existing?.origin === location.origin ? existing.draft?.() : undefined;
  existing?.destroy();
  let previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;width:min(320px,calc(100vw - 32px))!important;z-index:2147483647!important;display:block!important;visibility:visible!important;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
:host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.panel{font:12px/1.5 system-ui,-apple-system,sans-serif;color:#172522;background:#f6f7f3;border:1px solid #dce4da;border-radius:16px;padding:16px;box-shadow:0 6px 28px #17252220;max-height:calc(100dvh - 32px);overflow:auto}header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}.eyebrow{font-size:9px;letter-spacing:1.5px;color:#527566;font-weight:700}h1{font-size:16px;margin:3px 0 0}h2{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}p{margin:4px 0;font-size:11px}#url{font-size:10px;color:#68776e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}label{display:block;font-weight:600;margin:10px 0 5px}label span{font-size:10px;font-weight:400;color:#68776e}textarea,input[type=text]{width:100%;border:1px solid #becbc1;border-radius:8px;padding:9px;font:12px system-ui;background:white;color:#172522}textarea{resize:vertical;min-height:58px;max-height:140px}button{border:0;border-radius:8px;padding:10px;background:#265c46;color:white;font:600 12px system-ui;cursor:pointer;width:100%;margin-top:9px}button:disabled{opacity:.45;cursor:default}#close{margin:0;padding:0;width:24px;height:24px;background:transparent;color:#64756d;font-size:20px;font-weight:400}button.secondary{background:#e8eee6;color:#28513f;padding:8px}.shortcut{font-size:10px;opacity:.7;margin-left:12px}details{margin-top:10px}summary{font-size:10px;color:#28513f;cursor:pointer}.options{display:flex;flex-wrap:wrap;gap:8px}.options label{font-size:10px}#status{font-size:11px;color:#52705f;margin-top:10px;overflow-wrap:anywhere}pre{font:11px/1.6 system-ui;white-space:pre-wrap;max-height:130px;overflow:auto}ul{padding-left:16px;font-size:10px;color:#735625}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid #387758;outline-offset:3px}
</style><section class="panel" role="region" aria-label="資料を保存"><header><div><span class="eyebrow">KNOWLEDGE CAPTURE</span><h1 id="heading">この資料を残す</h1></div><button id="close" aria-label="閉じる">×</button></header><div id="editor"><h2 id="title">閲覧中のページ</h2><p id="url"></p><label for="note">メモ <span>任意</span></label><textarea id="note" rows="2" maxlength="20000" placeholder="後で見返したいこと"></textarea><button id="save" disabled>保存する <span class="shortcut">⌘ / Ctrl ↵</span></button><details><summary>タグ・保存オプション・取得内容</summary><label for="tags">タグ <span>カンマ区切り</span></label><input id="tags" type="text" maxlength="2000" placeholder="デザイン, 読みたい"><div class="options"><label><input id="screenshot" type="checkbox" checked> 表示範囲の画像</label><label><input id="html" type="checkbox" checked> HTML構造</label></div><p id="scope"></p><details><summary>取得本文を確認</summary><pre id="body"></pre></details><ul id="limitations"></ul></details></div><p id="status" role="status" aria-live="polite">ページの取得中…</p><button id="acquire" class="secondary" hidden>取得し直す</button><button id="retry" class="secondary" hidden>拡張の送信待ちを再送</button><button id="new" class="secondary" hidden>新しいメモを残す</button></section>`;
  const el = id => root.getElementById(id);
  if (draft) { el('note').value = draft.note; el('tags').value = draft.tags; for (const id of ['html','screenshot']) el(id).checked = draft.settings[id]; }
  let preservingDraft = Boolean(draft);
  let acquired, working = false, blocked = false, observed, composing = false, updatePending = false, bootstrapping = true, destroyed = false, readyNew = false;
  let closeTimer, viewVersion = 0;
  const cancelAutoClose = () => { viewVersion++; clearTimeout(closeTimer); closeTimer = undefined; };
  const send = message => chrome.runtime.sendMessage({ ...message, panel_session: session });
  const status = text => { el('status').textContent = text; };
  const controls = () => { el('save').disabled = working || blocked || !acquired; for (const id of ['acquire','retry','html','screenshot','new']) el(id).disabled = working; };
  const busy = async action => {
    if (working || destroyed) return;
    working = true; controls();
    try { await action(); } catch (error) { cancelAutoClose(); status(error.message); el('acquire').hidden = blocked; }
    finally { working = false; controls(); if (updatePending) { updatePending = false; update(); } }
  };
  const result = (data, version) => {
    if (destroyed) return;
    clearTimeout(closeTimer); closeTimer = undefined;
    if (['sent','pending'].includes(data?.state)) {
      preservingDraft = false; acquired = undefined; el('editor').hidden = true; el('new').hidden = false;
      el('heading').textContent = data.state === 'sent' ? '保存しました' : 'PC送信待ち';
      status(data.state === 'sent' ? 'GitHubへ保存しました。' : 'PCへ保存済み・GitHub送信待ち。PCツールの retry で再送できます。');
      readyNew = data.state === 'sent';
      if (readyNew && version === viewVersion) {
        closeTimer = setTimeout(() => {
          if (!destroyed && version === viewVersion && globalThis.__knowledgeCapturePanel === panel && data.operation_id === observed && el('editor').hidden) close(document.activeElement === host);
        },800);
      }
    } else status(data?.reason || '保存応答を確認できません。再送してください。');
  };
  // Marking a result as read may wait behind another tab's transport. It must not lock this editor.
  const acknowledge = async (operation_id, version) => {
    if (!operation_id) return;
    try { await send({action:'acknowledge',operation_id}); }
    catch (error) {
      if (!destroyed && version === viewVersion && operation_id === observed) { cancelAutoClose(); status(error.message); el('acquire').hidden = blocked; }
    }
  };
  const reconcile = async () => {
    const state = await send({ action:'captureStatus' });
    if (state?.state === 'error') throw Error(state.reason);
    blocked = Boolean(state.pending || state.saving);
    // Carried unsent edits belong to this page, not to the globally queued operation.
    if (blocked && !acquired && !observed && !preservingDraft) observed = state.operation_id;
    el('retry').hidden = !state.pending || state.saving;
    if (state.saving) status('PCに保存しています… 閉じても送信は続きます。');
    else if (state.pending) status('拡張に送信待ちがあります。再送してから保存してください。');
    return state;
  };
  const refresh = async () => {
    acquired = undefined; observed = undefined; status('ページの取得中…'); el('acquire').hidden = true;
    const response = await send({ action:'panelAcquire', settings:{ html:el('html').checked, screenshot:el('screenshot').checked } });
    if (response.state === 'error') throw Error(response.reason);
    acquired = response.capture;
    el('title').textContent = acquired.source.title; el('url').textContent = acquired.source.url;
    el('scope').textContent = `本文 ${acquired.content.text.length.toLocaleString()}文字 / 画像 ${acquired.screenshot ? 'あり':'なし'} / HTML ${acquired.html ? 'あり':'なし'}`;
    el('body').textContent = acquired.content.text;
    el('limitations').replaceChildren(...acquired.source.limitations.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    status(acquired.source.limitations.length ? '保存できます。取得範囲は詳細で確認できます。' : '保存できます。');
  };
  const save = () => busy(async () => {
    if (!acquired || blocked) return;
    const version = viewVersion;
    const operation = { ...acquired, note:el('note').value, tags:el('tags').value.split(',').map(s=>s.trim()).filter(Boolean) };
    observed = operation.operation_id; status('PCに保存しています… 閉じても送信は続きます。');
    const response = await send({action:'save',capture:operation});
    await reconcile(); result(response, version);
    acknowledge(response.operation_id, version);
  });
  const close = (restoreFocus = true) => { cancelAutoClose(); if (panel.captureDisplay !== undefined) panel.captureDisplay = 'none'; host.style.setProperty('display','none','important'); if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({preventScroll:true}); };
  const open = (fresh = false) => {
    cancelAutoClose();
    if (fresh && document.activeElement !== host) previousFocus = document.activeElement;
    if (panel.captureDisplay !== undefined) panel.captureDisplay = 'block'; else host.style.setProperty('display','block','important');
    if (fresh && readyNew && !working && !blocked) { readyNew = false; busy(async () => { observed = undefined; el('note').value = el('tags').value = ''; el('editor').hidden = false; el('new').hidden = true; el('heading').textContent = 'この資料を残す'; el('note').focus(); await refresh(); }); }
    else {
      (el('editor').hidden ? el('close') : el('note')).focus({preventScroll:true});
      if (fresh && !acquired && !el('editor').hidden && !working) busy(async () => { await reconcile(); if (!blocked) await refresh(); });
    }
  };
  const trusted = fn => event => { if (event.isTrusted) fn(event); };
  el('close').addEventListener('click', trusted(close));
  el('save').addEventListener('click', trusted(save));
  root.addEventListener('compositionstart', () => { composing = true; }); root.addEventListener('compositionend', () => { composing = false; });
  root.addEventListener('keydown', trusted(event => {
    if (event.key === 'Escape' && !event.isComposing && !composing) { event.preventDefault(); event.stopPropagation(); close(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); save(); }
  }));
  el('acquire').addEventListener('click', trusted(() => busy(refresh)));
  for (const id of ['html','screenshot']) el(id).addEventListener('change', trusted(() => busy(refresh)));
  el('new').addEventListener('click', trusted(() => busy(async () => { cancelAutoClose(); readyNew = false; preservingDraft = false; observed = undefined; el('note').value = el('tags').value = ''; el('editor').hidden = false; el('new').hidden = true; el('heading').textContent = 'この資料を残す'; await reconcile(); if (!blocked) await refresh(); el('note').focus(); })));
  el('retry').addEventListener('click', trusted(() => busy(async () => {
    const version = viewVersion;
    const response = await send({action:'retry'}); await reconcile();
    const keepDraft = preservingDraft && response.operation_id !== observed && ['sent','pending'].includes(response.state);
    if (keepDraft) { if (!blocked && !acquired) await refresh(); } else result(response, version);
    acknowledge(response.operation_id, version);
  })));
  const update = () => {
    if (working) { updatePending = true; return; }
    busy(async () => {
      const version = viewVersion;
      const state = await reconcile();
      if (!state.saving && state.result?.unread && state.result.operation_id === observed) {
        result(state.result, version); acknowledge(state.result.operation_id, version);
      // An older operation can release the queue without completing this draft.
      } else if (!blocked && !acquired && !el('editor').hidden) await refresh();
    });
  };
  const listener = (changes, area) => { const data = changes.captureResult?.newValue; if (area === 'local' && data?.unread && data.state !== 'saving' && (bootstrapping || blocked || data.operation_id === observed)) update(); };
  chrome.storage.onChanged.addListener(listener);
  const panel = { session, origin:location.origin, host, open, close, draft:() => el('editor').hidden ? undefined : {note:el('note').value,tags:el('tags').value,settings:{html:el('html').checked,screenshot:el('screenshot').checked}}, destroy:() => { cancelAutoClose(); destroyed = true; chrome.storage.onChanged.removeListener(listener); host.remove(); }, focused:() => root.activeElement === el('note') };
  globalThis.__knowledgeCapturePanel = panel;
  document.documentElement.appendChild(host); open();
  busy(async () => {
    const version = viewVersion;
    const state = await reconcile();
    const settings = state.settings;
    for (const id of ['html','screenshot']) if (!draft && typeof settings?.[id] === 'boolean') el(id).checked = settings[id];
    if (blocked) return;
    // URL equality cannot associate another tab's historical result with this unsent draft.
    if (!draft && state.result?.unread && ['sent','pending'].includes(state.result.state) && state.result.source_url === location.href) { observed = state.result.operation_id; result(state.result, version); acknowledge(state.result.operation_id, version); return; }
    await refresh();
  }).finally(() => { bootstrapping = false; });
}

// Functions below run in the same isolated world; page-owned globals cannot impersonate this registry.
export function panelProbe() {
  const panel = globalThis.__knowledgeCapturePanel;
  return { session:panel?.host.isConnected ? panel.session : undefined, url:location.href, time:performance.timeOrigin };
}
export async function panelVisibility(hidden) {
  const panel = globalThis.__knowledgeCapturePanel;
  if (!panel?.host.isConnected) return;
  if (hidden) {
    panel.captureFocus = panel.focused();
    panel.captureDisplay = panel.host.style.getPropertyValue('display');
    panel.host.style.setProperty('display','none','important');
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('タブが切り替わりました。取得し直してください。')),1000);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    });
  } else if (panel.captureDisplay !== undefined) {
    panel.host.style.setProperty('display',panel.captureDisplay,'important'); delete panel.captureDisplay; delete panel.captureFocus;
    if (panel.host.style.getPropertyValue('display') !== 'none') panel.open();
  }
}
