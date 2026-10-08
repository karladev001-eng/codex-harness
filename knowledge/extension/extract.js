// Executed only following the user's action, in the isolated world of the active tab.
export function extractPage(includeHtml = false) {
  const limitations = [];
  const ownPanel = globalThis.__knowledgeCapturePanel?.host;
  const text = el => (el?.innerText || el?.textContent || '').trim();
  const trim = (value, max, label) => { const bytes = new TextEncoder().encode(value); if (bytes.length > max) { limitations.push(`${label}: 容量上限で切り詰めました。`); return new TextDecoder().decode(bytes.slice(0, max)).replace(/\ufffd$/, ''); } return value; };
  const url = new URL(location.href); let kind = 'page'; let root = document.querySelector('article, main') || document.body;
  let title = document.title; let body = ''; let details = {};
  let selection = ownPanel && (document.activeElement === ownPanel || globalThis.__knowledgeCapturePanel.captureFocus) ? '' : String(window.getSelection() || '');
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname) && (url.searchParams.get('v') || /^\/(shorts|live)\//.test(url.pathname) || url.hostname === 'youtu.be')) {
    kind = 'youtube'; const videoId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1];
    root = document.querySelector('ytd-watch-metadata') || document.querySelector('ytd-reel-video-renderer[is-active]');
    title = text(root?.querySelector('h1')) || document.title;
    const description = text(root?.querySelector('#description-inline-expander, #description, .yt-core-attributed-string'));
    const transcript = [...document.querySelectorAll('ytd-transcript-segment-renderer')].filter(el => el.getClientRects().length).map(el => ({ time: text(el.querySelector('.segment-timestamp')), text: text(el.querySelector('.segment-text')) }));
    details = { video_id: videoId || null, channel: text(root?.querySelector('#channel-name, ytd-channel-name')), description: trim(description, 100000, '概要'), playback_seconds: Number.isFinite(document.querySelector('video')?.currentTime) ? Math.floor(document.querySelector('video').currentTime) : null, transcript: transcript.slice(0, 2000) };
    body = description + (transcript.length ? '\n\n' + transcript.map(row => `${row.time} ${row.text}`).join('\n') : '');
    limitations.push('動画本体は未取得。概要/文字起こしは表示済みDOMの範囲のみ。');
    if (!transcript.length) limitations.push('文字起こし未取得。YouTubeで文字起こしを開いて再保存してください。');
    if (transcript.length > 2000) limitations.push('文字起こし: 2000行まで。');
    if (!details.channel) limitations.push('チャンネル未取得。'); if (!description) limitations.push('概要未取得。');
  } else if (url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+/.test(url.pathname) && !['settings','features','orgs','users','marketplace','topics','collections','login'].includes(url.pathname.split('/')[1])) {
    kind = 'github'; const parts = url.pathname.split('/'); details = { repository: `${parts[1]}/${parts[2].replace(/\.git$/, '')}`, description: text(document.querySelector('[itemprop="about"]')), readme_method: 'visible-dom' };
    root = document.querySelector('[data-testid="readme"], #readme, article.markdown-body'); body = text(root);
    limitations.push('GitHub README: 表示DOMの取得範囲のみ。API取得前。'); if (!body) limitations.push('README未取得。');
  } else if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) {
    kind = 'x'; const postId = url.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    const matching = [...document.querySelectorAll('article')].filter(article => { const firstTime = article.querySelector('time'); const link = firstTime?.closest('a[href]'); return link && new URL(link.href, location.href).pathname.match(/\/status\/(\d+)/)?.[1] === postId; });
    root = postId && matching.length === 1 ? matching[0] : null;
    const permalink = root && [...root.querySelectorAll('a[href]')].find(link => new URL(link.href, location.href).pathname.match(/\/status\/(\d+)/)?.[1] === postId && link.querySelector('time'));
    const ownText = root && [...root.querySelectorAll('[data-testid="tweetText"]')].filter(el => !el.closest('[role="link"], [data-testid="quoteTweet"]'));
    body = ownText?.length === 1 ? text(ownText[0]) : ''; selection = ''; // Global selection may belong to an unrelated recommendation.
    details = { post_id: postId || null, author: text(root?.querySelector('[data-testid="User-Name"]')), published_at: permalink?.querySelector('time')?.getAttribute('datetime') || null, references: root ? [...new Set([...root.querySelectorAll('a[href]')].map(a => a.href).filter(href => /^https?:/.test(href)))].slice(0, 100) : [] };
    title = details.author ? `X: ${details.author}` : document.title;
    limitations.push('URLと一致する一投稿のみ。スレッド全体・添付画像本体は未取得。');
    if (!root) limitations.push('対象投稿を一意に取得できませんでした。'); if (!body) limitations.push('対象投稿本文未取得。');
  } else { body = text(root); limitations.push('本文は表示DOMから抽出。遅延表示/別フレーム/非表示内容は未取得。'); }
  const headings = root ? [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].slice(0, 300).map(el => trim(text(el), 1000, '見出し')) : [];
  if (!body) limitations.push('本文未取得。URL・タイトルとユーザーメモのみ保存可能。');
  let html;
  if (includeHtml && root) {
    const allowed = new Set(['DIV','SPAN','P','ARTICLE','MAIN','SECTION','HEADER','FOOTER','NAV','H1','H2','H3','H4','H5','H6','UL','OL','LI','DL','DT','DD','BLOCKQUOTE','PRE','CODE','BR','HR','TABLE','THEAD','TBODY','TR','TH','TD','STRONG','EM','B','I','A','FIGURE','FIGCAPTION']);
    const forbidden = new Set(['SCRIPT','STYLE','NOSCRIPT','FORM','INPUT','TEXTAREA','SELECT','BUTTON','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE']);
    let nodes = 0;
    function clean(node, parent) {
      if (node === ownPanel || ++nodes > 25000) return;
      if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || forbidden.has(node.tagName)) return;
      const next = document.createElement(allowed.has(node.tagName) ? node.tagName.toLowerCase() : 'div');
      // No source attributes, scripts, handlers, URLs, CSS, form data or active embeds.
      parent.appendChild(next); for (const child of node.childNodes) clean(child, next);
    }
    const holder = document.createElement('div'); clean(root, holder);
    html = holder.innerHTML;
    if (nodes > 25000 || new TextEncoder().encode(html).length > 200000) { html = undefined; limitations.push('HTML構造: 容量上限により未取得。'); }
    limitations.push('HTMLは属性/フォーム/外部資源を除いた構造。見た目の完全再現は保証しません。');
  } else if (includeHtml) limitations.push('HTML構造未取得。');
  if (new TextEncoder().encode(JSON.stringify(details)).length > 250000) { details = { ...details, transcript: [] }; limitations.push('詳細情報: 容量上限で文字起こしを省略。'); }
  return { source: { url: location.href, title: trim(title, 4000, 'タイトル'), kind, details, limitations, viewport: { width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio, scroll_x: scrollX, scroll_y: scrollY } }, content: { text: trim(body, 200000, '本文'), headings, selection: trim(selection, 40000, '選択範囲') }, ...(html !== undefined ? { html } : {}), document_url: location.href, time_origin: performance.timeOrigin };
}
