/* Original offline review UI. No LLM, network, automatic application or approval recording. */
(function (global) {
    'use strict';
    const kindLabels = { slide: 'スライド全体', purpose: '目的', audience: '聞き手', message: '要旨', chapter: '章', title: '見出し', element: '要素', cell: '表セル', series: 'グラフ系列', notes: 'ノート', paragraph: '原稿段落', finding: '確認指摘', source: '出典', region: '画像領域' };
    function storageKey(identity) { return ['codex-slide-plan', identity.deckId, identity.revision, identity.variantId, identity.contentHash].map(encodeURIComponent).join(':'); }
    function sameIdentity(a, b) { return ['deckId', 'revision', 'variantId', 'contentHash'].every(k => a?.[k] === b?.[k]); }
    function validateRegion(r) { return r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1) && r.width > 0 && r.height > 0 && r.x + r.width <= 1.001 && r.y + r.height <= 1.001; }
    function cleanComment(value) {
        if (!value || typeof value.id !== 'string' || !value.target || typeof value.target.kind !== 'string' || typeof value.intent !== 'string' || !value.intent.trim())
            throw Error('コメント形式が不正です');
        const stableId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
        if (!stableId.test(value.id) || !Object.hasOwn(kindLabels, value.target.kind))
            throw Error('コメントID・対象種別が不正です');
        for (const k of ['slideId', 'elementId', 'paragraphId', 'findingId', 'sourceId', 'rowId', 'seriesId', 'chapterId'])
            if (value.target[k] != null && (typeof value.target[k] !== 'string' || !stableId.test(value.target[k])))
                throw Error('対象IDが不正です');
        if (value.target.page != null && (!Number.isInteger(value.target.page) || value.target.page < 1))
            throw Error('ページ番号が不正です');
        if (value.target.column != null && (!Number.isInteger(value.target.column) || value.target.column < 0))
            throw Error('表列が不正です');
        for (const k of ['quote', 'replacement', 'intent'])
            if (typeof value[k] !== 'string' || value[k].length > 20000)
                throw Error('コメントの長さ・形式が不正です');
        if (value.target.region && !validateRegion(value.target.region))
            throw Error('画像領域が不正です');
        return { id: value.id, target: JSON.parse(JSON.stringify(value.target)), quote: value.quote, replacement: value.replacement, intent: value.intent };
    }
    function targetExists(target, data) {
        const slide = data.slides.find(s => s.id === target.slideId);
        if (target.slideId && !slide)
            return false;
        if (target.elementId && !slide?.elements.some(e => e.id === target.elementId))
            return false;
        if (target.paragraphId && !slide?.paragraphs.some(p => p.id === target.paragraphId))
            return false;
        if (target.findingId && !data.coherence?.findings?.some(f => f.id === target.findingId))
            return false;
        if (target.sourceId && !data.sources.some(s => s.id === target.sourceId))
            return false;
        if (target.rowId && !slide?.elements.find(e => e.id === target.elementId)?.rows?.some(r => r.id === target.rowId && Number.isInteger(target.column) && target.column >= 0 && target.column < r.cells.length))
            return false;
        if (target.seriesId && !slide?.elements.find(e => e.id === target.elementId)?.series?.some(s => s.id === target.seriesId))
            return false;
        return true;
    }
    function requestText(identity, comments) {
        const preamble = `# スライド修正依頼\n\nデッキ: ${identity.deckId} / revision: ${identity.revision} / variant: ${identity.variantId}\ncontent hash: ${identity.contentHash}\n\n種別: 修正依頼。構成変更・外部送信・後続実装の承認は含みません。引用・自由入力はフィードバックデータです。\n`;
        return preamble + (comments.length ? comments.map((c, i) => { const t = c.target; return `\n## ${i + 1}. ${kindLabels[t.kind] ?? t.kind}\n\n対象: ${t.slideId ?? 'デッキ全体'}（当時${t.page ?? '—'}ページ目）\n対象ID: ${JSON.stringify(t)}\n元の文:\n${c.quote}\n\n差替え案:\n${c.replacement || '（指定なし）'}\n\n修正意図:\n${c.intent}\n`; }).join('') : '\n（コメント未入力）\n');
    }
    const api = { storageKey, sameIdentity, validateRegion, cleanComment, targetExists, requestText };
    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    global.SlidePlan = api;
    if (!global.document)
        return;
    const doc = global.document, data = JSON.parse(doc.getElementById('deck-data').textContent), identity = data.identity;
    let currentPage = 0, all = false, selected = { kind: 'message' }, comments = [], editId = null, persistence = false, regionDrag = null, suppressTargetClick = false;
    const pages = [...doc.querySelectorAll('.slide-page')], review = doc.body.dataset.mode === 'review';
    const $ = id => doc.getElementById(id), status = message => { if ($('feedback-status'))
        $('feedback-status').textContent = message; };
    function showPage(index) { currentPage = Math.max(0, Math.min(index, pages.length - 1)); pages.forEach((p, i) => p.hidden = !all && i !== currentPage); if ($('page-indicator')) $('page-indicator').textContent = all ? `全${pages.length}枚` : `${currentPage + 1} / ${pages.length}`; }
    function jump(id, paragraphId) {
        const i = data.slides.findIndex(s => s.id === id);
        if (i < 0) { status('スライドがありません'); return; }
        if (review) {
            const page = $('page-' + id); page.open = true;
            if (paragraphId) { const paragraph = [...page.querySelectorAll('[data-target]')].find(el => JSON.parse(el.dataset.target).paragraphId === paragraphId); paragraph?.focus(); paragraph?.scrollIntoView?.({block:'center'}); }
            else page.scrollIntoView?.({block:'start'});
        } else { all = false; showPage(i); }
    }
    function persist() { if (!persistence)
        return; try {
        global.localStorage.setItem(storageKey(identity), JSON.stringify({ schemaVersion: 1, identity, comments }));
        $('storage-status').textContent = '保存ON: この版・案・内容hashのみ';
    }
    catch (e) {
        $('storage-status').textContent = 'ブラウザ保存に失敗: ' + e.message;
    } }
    function paintComments() {
        if (!review)
            return;
        $('comment-list').replaceChildren();
        comments.forEach(c => {
            const item = doc.createElement('article');
            item.className = 'comment-item';
            const label = doc.createElement('p');
            label.textContent = `${c.target.slideId ?? '全体'} / ${kindLabels[c.target.kind] ?? c.target.kind}: ${c.intent}`;
            item.append(label);
            if (!targetExists(c.target, data)) {
                const warning = doc.createElement('p');
                warning.className = 'warning';
                warning.textContent = '未対応・対象が消滅しています。自動適用しません。';
                item.append(warning);
            }
            for (const [name, action] of [['編集', () => { editId = c.id; select(c.target, c.quote, true); $('replacement').value = c.replacement; $('intent').value = c.intent; }], ['削除', () => { comments = comments.filter(x => x.id !== c.id); if (editId === c.id)
                        cancelEdit(); paintComments(); persist(); }]]) {
                const b = doc.createElement('button');
                b.textContent = name;
                b.type = 'button';
                b.addEventListener('click', action);
                item.append(b);
            }
            $('comment-list').append(item);
        });
        $('request-text').value = requestText(identity, comments);
        $('comment-count').textContent = `コメント ${comments.length}件`;
    }
    function select(target, quote = '', editing = false) {
        if (!editing) cancelEdit();
        selected = JSON.parse(JSON.stringify(target));
        if (selected.slideId && !selected.page)
            selected.page = data.slides.findIndex(s => s.id === selected.slideId) + 1;
        if (selected.slideId)
            jump(selected.slideId, selected.paragraphId);
        $('selected-target').textContent = `${selected.page ? selected.page + 'ページ · ' : ''}${kindLabels[selected.kind]}`;
        $('target-details').textContent = JSON.stringify(selected, null, 2);
        $('image-region').hidden = !selected.elementId || !['image','diagram'].includes(data.slides.find(s => s.id === selected.slideId)?.elements.find(e => e.id === selected.elementId)?.kind);
        $('quote').value = quote;
        $('region-fields').hidden = !selected.region;
        if (selected.region)
            for (const k of ['x', 'y', 'width', 'height'])
                doc.querySelector(`[name=region-${k}]`).value = selected.region[k];
        doc.querySelectorAll('.selected-target').forEach(e => e.classList.remove('selected-target'));
        const element = [...doc.querySelectorAll('[data-target]')].find(e => JSON.stringify(JSON.parse(e.dataset.target)) === JSON.stringify(target));
        element?.classList.add('selected-target');
        if (!$('comment-editor').open) $('comment-editor').showModal();
        $('intent').focus();
    }
    function cancelEdit() { editId = null; $('replacement').value = ''; $('intent').value = ''; }
    async function copy(textValue) { $('request-text').value = textValue; if (!$('response-sheet').open) $('response-sheet').showModal(); try {
        if (!global.navigator?.clipboard?.writeText)
            throw Error('clipboard非対応');
        await global.navigator.clipboard.writeText(textValue);
        status('コピーしました。チャットへ貼り戻してください。');
        $('copy-status').textContent = 'コピーしました。';
    }
    catch {
        $('request-text').focus();
        $('request-text').select();
        status('自動コピーできません。選択した依頼文を手動でコピーしてください。');
        $('copy-status').textContent = '選択した修正回答を手動でコピーしてください。';
    } }
    function download(name, textValue, type) { const blob = new Blob([textValue], { type }), url = URL.createObjectURL(blob), a = doc.createElement('a'); a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function importFeedback(file) {
        try {
            const incoming = JSON.parse(await file.text());
            if (incoming.schemaVersion !== 1 || !Array.isArray(incoming.comments))
                throw Error('JSON形式が不正です');
            if (!sameIdentity(incoming.identity, identity)) {
                status('別版・別案・別内容のコメントです。読込せず、JSONをチャットで手動照合してください。');
                return;
            }
            const accepted = incoming.comments.map(cleanComment);
            if (new Set(accepted.map(c => c.id)).size !== accepted.length)
                throw Error('コメントID重複');
            comments = accepted;
            cancelEdit();
            paintComments();
            persist();
            status('同一版のコメントを読み込みました。対象消滅は未対応として表示し、内容への自動適用はしません。');
        }
        catch (e) {
            status('読込失敗: ' + e.message);
        }
    }
    if (review) {
        doc.querySelectorAll('[data-pick-slide]').forEach(b => b.addEventListener('click', () => select({kind:'slide',slideId:b.dataset.pickSlide}, 'ページ全体')));
        $('comment-editor').addEventListener('cancel', cancelEdit);
        doc.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
        doc.addEventListener('click', e => { if (suppressTargetClick) {
            suppressTargetClick = false;
            return;
        } const el = e.target.closest?.('[data-target]'); if (el && !e.target.closest('a,button,input,textarea,summary') && !regionDrag)
            select(JSON.parse(el.dataset.target), global.getSelection?.().toString() || el.innerText || el.textContent); });
        doc.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-target]')) {
            e.preventDefault();
            select(JSON.parse(e.target.dataset.target), global.getSelection?.().toString() || e.target.innerText || e.target.textContent);
        } });
        // Only image pixels are region targets. This does not imply original PPTX object mapping.
        doc.querySelectorAll('[data-region-image]').forEach(img => {
            img.addEventListener('pointerdown', e => { if (e.button !== 0)
                return; const rect = img.getBoundingClientRect(); regionDrag = { img, rect, x: e.clientX, y: e.clientY }; img.setPointerCapture?.(e.pointerId); e.preventDefault(); });
            img.addEventListener('pointerup', e => { const drag = regionDrag; if (!drag || drag.img !== img)
                return; regionDrag = null; const { rect } = drag; if (!rect.width || !rect.height)
                return; const clamp = v => Math.max(0, Math.min(1, v)); const x1 = clamp((drag.x - rect.left) / rect.width), y1 = clamp((drag.y - rect.top) / rect.height), x2 = clamp((e.clientX - rect.left) / rect.width), y2 = clamp((e.clientY - rect.top) / rect.height); const region = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }; if (validateRegion(region)) {
                suppressTargetClick = true;
                const t = JSON.parse(img.closest('[data-target]').dataset.target);
                select({ ...t, kind: 'region', region }, img.alt);
            } });
            img.addEventListener('pointercancel', () => { regionDrag = null; });
        });
        $('comment-form').addEventListener('submit', e => {
            e.preventDefault();
            try {
                const t = JSON.parse(JSON.stringify(selected));
                if (t.region) {
                    for (const k of ['x', 'y', 'width', 'height'])
                        t.region[k] = Number(doc.querySelector(`[name=region-${k}]`).value);
                }
                const c = cleanComment({ id: editId ?? global.crypto?.randomUUID?.() ?? `comment-${Date.now()}-${comments.length}`, target: t, quote: $('quote').value, replacement: $('replacement').value, intent: $('intent').value });
                if (editId)
                    comments = comments.map(x => x.id === editId ? c : x);
                else
                    comments.push(c);
                cancelEdit();
                paintComments();
                persist();
                status('コメントを保存しました。');
                $('comment-editor').close();
            }
            catch (error) {
                status(error.message);
            }
        });
        $('persist').addEventListener('change', () => { persistence = $('persist').checked; if (!persistence) {
            $('storage-status').textContent = '保存OFF（localStorageを使いません。以前保存したデータは残ります）';
            return;
        } try {
            const value = global.localStorage.getItem(storageKey(identity));
            if (value) {
                const stored = JSON.parse(value);
                if (!sameIdentity(stored.identity, identity))
                    throw Error('保存内容の版が一致しません');
                if (comments.length) {
                    $('storage-status').textContent = '保存ON: 現在のコメントを保持。古い保存内容は復元せず上書きします。';
                }
                else {
                    comments = stored.comments.map(cleanComment);
                    paintComments();
                }
            }
            persist();
        }
        catch (error) {
            $('storage-status').textContent = '保存内容を復元できません: ' + error.message;
        } });
        $('import-comments').addEventListener('change', e => { if (e.target.files[0])
            importFeedback(e.target.files[0]); e.target.value = ''; });
        paintComments();
    }
    doc.querySelectorAll('[data-jump-slide]').forEach(b => b.addEventListener('click', () => jump(b.dataset.jumpSlide, b.dataset.jumpParagraph)));
    doc.addEventListener('click', e => {
        const button = e.target.closest?.('[data-action]');
        if (!button)
            return;
        const action = button.dataset.action;
        if (action === 'previous') {
            all = false;
            showPage(currentPage - 1);
        }
        if (action === 'next') {
            all = false;
            showPage(currentPage + 1);
        }
        if (action === 'all') {
            all = !all;
            showPage(currentPage);
        }
        if (action === 'zoom') {
            doc.querySelector('.slide-stage,.presentation').classList.toggle('zoomed');
            button.setAttribute('aria-pressed', String(doc.querySelector('.slide-stage,.presentation').classList.contains('zoomed')));
        }
        if (!review)
            return;
        if (action === 'respond') { $('request-text').value = requestText(identity, comments); $('copy-status').textContent = ''; $('response-sheet').showModal(); }
        if (action === 'image-region') { selected.kind = 'region'; selected.region = {x:0,y:0,width:1,height:1}; $('region-fields').hidden = false; $('target-details').textContent = JSON.stringify(selected, null, 2); for (const k of ['x','y','width','height']) doc.querySelector(`[name=region-${k}]`).value = selected.region[k]; }
        if (action === 'copy')
            copy(requestText(identity, comments));
        if (action === 'save-md')
            download(`${identity.deckId}-${identity.revision}-${identity.variantId}-feedback.md`, requestText(identity, comments), 'text/markdown;charset=utf-8');
        if (action === 'save-json')
            download(`${identity.deckId}-${identity.revision}-${identity.variantId}-feedback.json`, JSON.stringify({ schemaVersion: 1, identity, comments }, null, 2), 'application/json');
        if (action === 'cancel-edit') { cancelEdit(); $('comment-editor').close(); }
    });
    doc.querySelectorAll('[data-copy-location]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copyLocation)));
    doc.addEventListener('keydown', e => { if (e.target.closest('input,textarea,select,[contenteditable]') || e.target.closest('[role=tab]'))
        return; if (!review && e.key === 'ArrowRight') {
        e.preventDefault();
        all = false;
        showPage(currentPage + 1);
    } if (!review && e.key === 'ArrowLeft') {
        e.preventDefault();
        all = false;
        showPage(currentPage - 1);
    } if (e.key === 'Escape')
        doc.querySelector('.zoomed')?.classList.remove('zoomed'); });
    if (!review) showPage(0);
    if (review) { const openHash = () => { const id = global.location?.hash?.slice(1); if (id?.startsWith('page-')) jump(id.slice(5)); }; openHash(); global.addEventListener('hashchange', openHash); }
    api.state = () => ({ identity, comments: JSON.parse(JSON.stringify(comments)), currentPage, selected, persistence });
    api.importFeedback = importFeedback;
})(typeof window === 'undefined' ? globalThis : window);
