#!/usr/bin/env node
/** Original, offline deck packer. Node >=22; no packages or network requests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SECRET = /(^|\/)(\.git|\.env(?:\..*)?|\.aws|\.ssh|\.codex|\.agents|id_rsa|credentials(?:[.-][^/]*)?|secrets?(?:[.-][^/]*)?)(\/|$)/i;
const FILE_TYPES = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.json', '.md', '.txt', '.py', '.mjs', '.js', '.pptx', '.potx', '.pdf']);
const kinds = new Set(['heading', 'text', 'image', 'diagram', 'chart', 'table', 'list']);
function require(condition, message) { if (!condition)
    throw new Error(message); }
function id(value, label) { require(typeof value === 'string' && ID.test(value), `Invalid ${label}: ${value}`); }
function text(value, label) { require(typeof value === 'string' && value.trim().length > 0, `Missing ${label}`); }
function unique(items, label) { const ids = new Set(); for (const item of items) {
    id(item.id, label);
    require(!ids.has(item.id), `Duplicate ${label}: ${item.id}`);
    ids.add(item.id);
} return ids; }
export function relative(value) {
    require(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !/[\u0000-\u001f\u007f-\u009f:]/u.test(value) && !value.includes('?') && !value.includes('#'), `Unsafe path: ${value}`);
    require(!path.isAbsolute(value) && !value.split('/').some(p => p === '..' || p === '.' || p === '') && !SECRET.test(value), `Unsafe path: ${value}`);
    return value;
}
export async function safeRead(root, relativePath) {
    relative(relativePath);
    const realRoot = await fs.realpath(root), wanted = path.resolve(realRoot, relativePath);
    let cursor = realRoot;
    for (const part of relativePath.split('/')) {
        cursor = path.join(cursor, part);
        const stat = await fs.lstat(cursor);
        require(!stat.isSymbolicLink(), `Symlink refused: ${relativePath}`);
    }
    const actual = await fs.realpath(wanted);
    require(actual.startsWith(realRoot + path.sep), `Path escaped root: ${relativePath}`);
    require((await fs.stat(actual)).isFile(), `Not a file: ${relativePath}`);
    return fs.readFile(actual);
}
export function safeURL(url) { try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
}
catch {
    return false;
} }
function safeSVG(buffer, name) { const s = buffer.toString('utf8'); require(!/<\s*(script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:href|src)\s*=|<!DOCTYPE|<!ENTITY|@import|url\(\s*["']?(?!#)/i.test(s), `Active/external SVG refused: ${name}`); }
function jsonScript(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
export function contentHash(deck) { const { coherence, ...content } = deck; return hash(JSON.stringify(content)); }
const DEFAULT_THEME = { id: 'default', background: '#ffffff', ink: '#243246', accent: '#176b70', muted: '#566777', font: 'Arial, sans-serif', ratio: [16, 9], padding: 6 };
export const variantsFor = deck => deck.variants ?? [{ id: 'A', name: 'デザイン案' }];
export async function loadCatalog(deck) {
    // Private rendering definitions, authored for this deck; no public template catalogue.
    const base = { themes: [{ ...DEFAULT_THEME, ...(deck.design?.theme ?? {}) }, ...(deck.design?.themes ?? [])], layouts: [{ id: 'default' }, ...(deck.design?.layouts ?? [])] };
    unique(base.themes, 'theme'); unique(base.layouts, 'layout');
    for (const slide of deck.slides) if (slide.layout) base.layouts.push({ ...slide.layout, id: `slide-${slide.id}` });
    unique(base.layouts, 'layout');
    for (const layout of base.layouts) {
        const rectangle = box => { for (const k of ['x', 'y', 'width', 'height'])
            require(Number.isFinite(box[k]) && box[k] >= 0 && box[k] <= 100, 'Invalid canvas coordinate'); require(box.width > 0 && box.height > 0 && box.x + box.width <= 100 && box.y + box.height <= 100, 'Canvas escapes slide'); };
        if (layout.titleBox)
            rectangle(layout.titleBox);
        if (layout.messageBox)
            rectangle(layout.messageBox);
        if (layout.canvas) {
            require(Array.isArray(layout.canvas.slots), 'Canvas slots required');
            unique(layout.canvas.slots.map(s => ({ id: s.elementId })), 'canvas element');
            for (const slot of layout.canvas.slots)
                rectangle(slot);
        }
        if (layout.grid) {
            require(Number.isInteger(layout.grid.columns) && layout.grid.columns >= 1 && layout.grid.columns <= 12, 'Grid columns must be 1–12');
            require(Number.isInteger(layout.grid.rows) && layout.grid.rows >= 1 && layout.grid.rows <= 12, 'Grid rows must be 1–12');
            require(Array.isArray(layout.grid.slots), 'Grid slots required');
            const assigned = new Set();
            for (const slot of layout.grid.slots) {
                id(slot.elementId, 'slot element ID');
                require(!assigned.has(slot.elementId), 'Duplicate layout slot');
                assigned.add(slot.elementId);
                for (const [prop, max] of [['row', layout.grid.rows], ['column', layout.grid.columns], ['rowSpan', layout.grid.rows], ['columnSpan', layout.grid.columns]])
                    require(Number.isInteger(slot[prop]) && slot[prop] >= 1 && slot[prop] <= max, `Invalid layout ${prop}`);
                require(slot.row + slot.rowSpan - 1 <= layout.grid.rows && slot.column + slot.columnSpan - 1 <= layout.grid.columns, 'Layout slot escapes grid');
            }
        }
    }
    for (const theme of base.themes) {
        for (const key of ['background', 'ink', 'accent', 'muted'])
            require(/^#[0-9a-f]{6}$/i.test(theme[key]), `Invalid theme color: ${key}`);
        require(typeof theme.font === 'string' && /^[\p{L}\p{M}\p{N} _,"'-]+$/u.test(theme.font), 'Unsafe theme font');
        require(Array.isArray(theme.ratio) && theme.ratio.length === 2 && theme.ratio.every(n => Number.isFinite(n) && n > 0 && n <= 100), 'Invalid theme ratio');
        if (theme.padding !== undefined)
            require(Number.isFinite(theme.padding) && theme.padding >= 2 && theme.padding <= 15, 'Invalid theme padding');
    }
    return base;
}
export async function validateDeck(deck) {
    require(deck.schemaVersion === 2, 'schemaVersion must be 2; legacy v2 decks (schemaVersion 1) require explicit migrate into a new working directory');
    require(!deck.catalog, 'Public catalog is retired; author deck.design or slide.layout');
    require(deck.citations === undefined || ['review', 'slide'].includes(deck.citations), 'citations must be review or slide');
    id(deck.id, 'deck ID');
    id(deck.revision, 'revision');
    for (const key of ['title', 'purpose', 'audience', 'message', 'expectedOutcome'])
        text(deck[key], key);
    if (deck.durationSeconds !== undefined)
        require(Number.isFinite(deck.durationSeconds) && deck.durationSeconds > 0, 'Invalid durationSeconds');
    if (deck.timing)
        require(Number.isFinite(deck.timing.charactersPerMinute) && deck.timing.charactersPerMinute > 0, 'Invalid speaking speed');
    require(Array.isArray(deck.chapters) && deck.chapters.length > 0, 'chapters required');
    unique(deck.chapters, 'chapter');
    require(Array.isArray(deck.unresolved), 'unresolved required (may be empty)');
    require(Array.isArray(deck.slides) && deck.slides.length > 0, 'slides required');
    unique(deck.slides, 'slide');
    if (deck.requestedSlides != null)
        require(deck.requestedSlides === deck.slides.length, 'Requested slide count includes cover and must match');
    require(Array.isArray(variantsFor(deck)) && variantsFor(deck).length > 0, 'variants required');
    unique(variantsFor(deck), 'variant');
    require(Array.isArray(deck.sources) && Array.isArray(deck.assets), 'sources/assets arrays required');
    unique(deck.sources, 'source');
    unique(deck.assets, 'asset');
    const sourceIds = new Set(deck.sources.map(s => s.id)), assetIds = new Set(deck.assets.map(a => a.id));
    const refSources = (refs, label) => { require(Array.isArray(refs), `sourceIds required: ${label}`); for (const ref of refs)
        require(sourceIds.has(ref), `Unknown source ${ref} in ${label}`); };
    const targets = new Set();
    const elements = new Set();
    for (const slide of deck.slides) {
        require(deck.chapters.some(c => c.id === slide.chapter), 'Unknown chapter');
        for (const key of ['role', 'title', 'message', 'transition'])
            text(slide[key], `${slide.id}.${key}`);
        require(Array.isArray(slide.talkingPoints) && slide.talkingPoints.length > 0, 'talkingPoints required');
        require(Number.isFinite(slide.seconds) && slide.seconds > 0, 'Positive slide seconds required');
        text(slide.notes, 'notes');
        refSources(slide.sourceIds, slide.id);
        require(slide.citations === undefined || ['review', 'slide'].includes(slide.citations), 'Invalid slide citations');
        require(Array.isArray(slide.paragraphs) && slide.paragraphs.length > 0, 'Readable script paragraphs required');
        unique(slide.paragraphs, 'paragraph');
        require(Array.isArray(slide.elements) && slide.elements.length > 0, 'elements required');
        unique(slide.elements, 'element');
        targets.add(`${slide.id}:slide`);
        targets.add(`${slide.id}:notes`);
        targets.add(`${slide.id}:title`);
        for (const paragraph of slide.paragraphs) {
            text(paragraph.text, 'paragraph text');
            refSources(paragraph.sourceIds, paragraph.id);
            require(!targets.has(`${slide.id}:paragraph:${paragraph.id}`), 'Duplicate paragraph');
            targets.add(`${slide.id}:paragraph:${paragraph.id}`);
        }
        for (const el of slide.elements) {
            require(kinds.has(el.kind), `Unknown element kind ${el.kind}`);
            refSources(el.sourceIds, el.id);
            require(el.citations === undefined || ['review', 'slide'].includes(el.citations), 'Invalid element citations');
            elements.add(el.id);
            targets.add(`${slide.id}:element:${el.id}`);
            if (['image', 'diagram'].includes(el.kind)) {
                require(assetIds.has(el.assetId), `Unknown asset ${el.assetId}`);
                text(el.alt, 'image alt');
            }
            else if (el.kind === 'table') {
                require(Array.isArray(el.columns) && el.columns.length > 0 && Array.isArray(el.rows), 'Table columns/rows required');
                for (const row of el.rows) {
                    id(row.id, 'row');
                    require(Array.isArray(row.cells) && row.cells.length === el.columns.length, 'Cell count mismatch');
                    for (let i = 0; i < row.cells.length; i++)
                        targets.add(`${slide.id}:cell:${el.id}:${row.id}:${i}`);
                }
                unique(el.rows, 'table row');
            }
            else if (el.kind === 'chart') {
                require(Array.isArray(el.series) && el.series.length > 0, 'chart series required');
                unique(el.series, 'series');
                text(el.unit, 'chart unit');
                for (const series of el.series) {
                    require(Number.isFinite(series.value) && series.value >= 0, 'Chart values must be finite and nonnegative');
                    text(series.label, 'series label');
                    targets.add(`${slide.id}:series:${el.id}:${series.id}`);
                }
            }
            else if (el.kind === 'list')
                require(Array.isArray(el.items) && el.items.length > 0, 'list items required');
            else
                text(el.text, 'element text');
            if (el.dataRef) {
                relative(el.dataRef.path);
                text(el.dataRef.position, 'data position');
            }
        }
    }
    for (const asset of deck.assets) {
        relative(asset.file);
        require(asset.file.startsWith('assets/'), 'Asset must be in assets/');
        text(asset.origin, 'asset origin');
        text(asset.license, 'asset license');
        text(asset.regenerate, 'asset regeneration');
        refSources(asset.sourceIds, asset.id);
        require(Array.isArray(asset.slideIds) && asset.slideIds.every(s => deck.slides.some(x => x.id === s)), 'Invalid asset slide references');
        for (const f of asset.originals ?? [])
            relative(f);
    }
    for (const source of deck.sources) {
        require(['web', 'project', 'data', 'derived', 'concept'].includes(source.kind), 'Unknown source kind');
        text(source.title, 'source title');
        text(source.checkedAt, 'source checkedAt');
        if (source.kind === 'web') {
            require(safeURL(source.url), `Unsafe source URL ${source.id}`);
            for (const key of ['author', 'date', 'location', 'scope'])
                text(source[key], `${source.id}.${key}`);
        }
        if (['project', 'data'].includes(source.kind)) {
            relative(source.path);
            text(source.position, 'source position');
            require(/^[a-f0-9]{64}$/.test(source.sha256), 'Expected source sha256 required');
        }
        if (source.kind === 'data')
            for (const key of ['columns', 'unit', 'period', 'filters'])
                text(source[key], `${source.id}.${key}`);
        if (source.kind === 'derived') {
            refSources(source.inputIds, source.id);
            require(source.inputIds.length > 0 && !source.inputIds.includes(source.id), 'Derived source requires independent inputs');
            for (const key of ['formula', 'unit', 'population', 'missing'])
                text(source[key], `${source.id}.${key}`);
            relative(source.code);
            relative(source.output);
        }
        if (source.kind === 'concept')
            text(source.label, 'Concept must say 仮値/提案/概念図');
        if (source.copy)
            relative(source.path);
    }
    const catalog = await loadCatalog(deck);
    for (const variant of variantsFor(deck)) {
        require(catalog.themes.some(t => t.id === (variant.themeId ?? catalog.themes[0].id)), 'Unknown theme');
        for (const slide of deck.slides) {
            const lid = variant.layouts?.[slide.id] ?? (slide.layout ? `slide-${slide.id}` : slide.layoutId ?? 'default');
            const layout = catalog.layouts.find(l => l.id === lid);
            require(layout, `Unknown layout ${lid}`);
            if (layout.grid || layout.canvas)
                for (const slot of (layout.grid ?? layout.canvas).slots)
                    require(slide.elements.some(el => el.id === slot.elementId), `Custom layout slot missing element: ${slot.elementId}`);
        }
    }
    if (deck.coherence) {
        require(deck.coherence.revision === deck.revision, 'Coherence belongs to another revision');
        require(deck.coherence.contentHash === contentHash(deck), 'Coherence stale: content changed; reread script and update check');
        require(Array.isArray(deck.coherence.checks) && deck.coherence.checks.length > 0, 'Coherence checklist required');
        text(deck.coherence.reviewer, 'Coherence reviewer');
        text(deck.coherence.checkedAt, 'Coherence checkedAt');
        require(Array.isArray(deck.coherence.unchecked), 'Coherence unchecked required');
        for (const c of deck.coherence.checks)
            for (const k of ['item', 'result', 'evidence'])
                text(c[k], `Coherence ${k}`);
        unique(deck.coherence.findings ?? [], 'finding');
        for (const f of deck.coherence.findings ?? []) {
            require(deck.slides.some(s => s.id === f.slideId), 'Finding slide missing');
            if (f.paragraphId)
                require(deck.slides.find(s => s.id === f.slideId).paragraphs.some(p => p.id === f.paragraphId), 'Finding paragraph missing');
            for (const key of ['quote', 'impact', 'reason', 'suggestion'])
                text(f[key], `finding ${key}`);
        }
    }
    return { catalog, targets };
}
export async function provenance(deck, root, projectRoot = root) {
    const statuses = [];
    for (const source of deck.sources) {
        const result = { ...source, status: '要再確認', detail: '' };
        if (source.kind === 'concept') {
            result.status = source.label;
            result.detail = '実測として検証していない';
        }
        if (source.kind === 'web') {
            result.status = source.verified === true ? '記録した閲覧範囲のみ確認' : '要再確認';
            result.detail = 'オフラインpackはURLの到達性を再確認しない';
        }
        if (['project', 'data'].includes(source.kind)) {
            try {
                const data = await safeRead(source.kind === 'project' ? projectRoot : root, source.path);
                require(hash(data) === source.sha256, 'hash不一致');
                if (source.lineRange) {
                    require(Array.isArray(source.lineRange) && source.lineRange.length === 2 && source.lineRange.every(Number.isInteger) && source.lineRange[0] >= 1 && source.lineRange[1] >= source.lineRange[0] && source.lineRange[1] <= data.toString('utf8').split('\n').length, '行範囲が原本に存在しない');
                }
                if (source.heading)
                    require(data.toString('utf8').split('\n').some(l => l.replace(/^#+\s*/, '').trim() === source.heading), '見出しが原本に存在しない');
                result.status = '記録hash一致';
                result.detail = source.copy ? '選択した原本を同梱' : '元プロジェクトが必要';
            }
            catch (e) {
                result.detail = e.message;
            }
        }
        statuses.push(result);
    }
    for (const result of statuses.filter(s => s.kind === 'derived')) {
        const fieldsOK = result.inputIds.every(id => statuses.some(s => s.id === id && !['要再確認'].includes(s.status)));
        try {
            await safeRead(root, result.code);
            await safeRead(root, result.output);
            result.status = fieldsOK ? '入力と再生成コードあり' : '要再確認';
            result.detail = '計算の正しさはCodex/標準集計ツールで別途確認';
        }
        catch (e) {
            result.detail = e.message;
        }
    }
    for (const slide of deck.slides)
        for (const el of slide.elements.filter(e => ['table', 'chart'].includes(e.kind)))
            if (!el.sourceIds.length)
                statuses.push({ id: `missing-${slide.id}-${el.id}`, title: `${slide.id}/${el.id}`, kind: 'missing', status: '要再確認', detail: '結果の出典が欠落' });
    return statuses;
}
const target = (kind, slide, extra = {}) => ({ kind, slideId: slide?.id ?? null, page: slide?.page ?? null, ...extra });
function attrTarget(value) { return ` data-target="${escape(JSON.stringify(value))}" tabindex="0"`; }
function fileHref(file) {
    // Explicit relative URL and segment encoding keep filenames out of URI syntax.
    return './' + relative(file).split('/').map(encodeURIComponent).join('/');
}
function sourceLink(s, prefix = '') { if (s.kind === 'web')
    return `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a>`; if (s.copy)
    return `<a href="${escape(prefix + fileHref((s.kind === 'project' ? 'sources/' : '') + s.path))}">${escape(s.path)}</a>`; return `<span>${escape(s.path ?? s.title)}${s.path ? ' · 元プロジェクトが必要' : ''}</span>`; }
function sourceStrip(ids, sources, prefix, slide) { return `<footer class="source-strip">${ids.length ? ids.map(id => { const s = sources.find(s => s.id === id); return `<span${attrTarget(target('source', slide, { sourceId: id }))}><a href="${escape(prefix + 'review.html#page-' + slide.id)}">${escape(id)}</a>: ${sourceLink(s, prefix)} · ${escape(s.label ?? s.status)}</span>`; }).join(' ｜ ') : '出典: 未設定（結果は要再確認）'}</footer>`; }
function elementHTML(el, slide, deck, prefix) {
    const a = attrTarget(target('element', slide, { elementId: el.id, dataRef: el.dataRef ?? null }));
    let inner;
    if (el.kind === 'heading')
        inner = `<h3>${escape(el.text)}</h3>`;
    if (el.kind === 'text')
        inner = `<p>${escape(el.text)}</p>`;
    if (el.kind === 'list')
        inner = `<ul>${el.items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>`;
    if (['image', 'diagram'].includes(el.kind)) {
        const asset = deck.assets.find(a => a.id === el.assetId);
        inner = `<figure><img src="${escape(asset.previewUri ?? prefix + fileHref(asset.file))}" alt="${escape(el.alt)}"${el.regionSelectable ? ' data-region-image="true"' : ''}><figcaption>${escape(el.caption ?? el.alt)}</figcaption></figure>`;
    }
    if (el.kind === 'table')
        inner = `<div class="table-scroll"><table><caption>${escape(el.caption ?? slide.message)}</caption><thead><tr>${el.columns.map(c => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${el.rows.map(row => `<tr>${row.cells.map((cell, i) => `<td${attrTarget(target('cell', slide, { elementId: el.id, rowId: row.id, column: i, dataRef: el.dataRef ?? null }))}>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (el.kind === 'chart') {
        const max = Math.max(...el.series.map(s => s.value), 1);
        inner = `<figure><figcaption>${escape(el.caption ?? slide.message)} (${escape(el.unit)})</figcaption><dl class="chart">${el.series.map(s => `<div${attrTarget(target('series', slide, { elementId: el.id, seriesId: s.id, dataRef: el.dataRef ?? null }))}><dt>${escape(s.label)}</dt><dd><span class="bar" style="width:${s.value / max * 100}%"></span><b>${s.value} ${escape(el.unit)}</b></dd></div>`).join('')}</dl></figure>`;
    }
    const labels = [...new Set(el.sourceIds.map(id => deck.sources.find(s => s.id === id)?.label).filter(Boolean))];
    const conditions = ['table','chart'].includes(el.kind) ? [...new Set(el.sourceIds.flatMap(id => { const s = deck.sources.find(s => s.id === id); return [s?.unit, s?.filters, s?.period].filter(Boolean); }))] : [];
    const context = [el.context, ...labels, ...conditions].filter(Boolean).join(' · ');
    return `<article class="element kind-${el.kind}" data-element-id="${escape(el.id)}"${a}>${inner}${context ? `<p class="data-context">${escape(context)}</p>` : ''}${(el.citations ?? slide.citations ?? deck.citations) === 'slide' ? sourceStrip(el.sourceIds, deck.sources, prefix, slide) : ''}</article>`;
}
function slideHTML(slide, index, deck, variant, catalog, prefix = '') {
    slide = { ...slide, page: index + 1 };
    const theme = catalog.themes.find(t => t.id === (variant.themeId ?? catalog.themes[0].id));
    const layout = catalog.layouts.find(l => l.id === (variant.layouts?.[slide.id] ?? (slide.layout ? `slide-${slide.id}` : slide.layoutId ?? 'default')));
    const colors = `--slide-bg:${theme.background};--slide-ink:${theme.ink};--accent:${theme.accent};--slide-muted:${theme.muted};--ratio:${theme.ratio[0]}/${theme.ratio[1]};--slide-font:${theme.font};--slide-padding:${theme.padding ?? 6}%`;
    const boxStyle = box => box ? ` style="position:absolute;left:${box.x}%;top:${box.y}%;width:${box.width}%;height:${box.height}%;margin:0"` : '';
    const gridStyle = layout.canvas ? ' style="position:absolute;inset:0;display:block"' : layout.grid ? ` style="display:grid;grid-template-columns:repeat(${layout.grid.columns},minmax(0,1fr));grid-template-rows:repeat(${layout.grid.rows},minmax(0,1fr))"` : '';
    const els = slide.elements.map(el => { let html = elementHTML(el, slide, deck, prefix); const slot = layout.grid?.slots.find(s => s.elementId === el.id); const rect = layout.canvas?.slots.find(s => s.elementId === el.id); if (rect)
        html = html.replace('class="element', `style="position:absolute;left:${rect.x}%;top:${rect.y}%;width:${rect.width}%;height:${rect.height}%" class="element`); if (slot)
        html = html.replace('class="element', `style="grid-row:${slot.row}/span ${slot.rowSpan};grid-column:${slot.column}/span ${slot.columnSpan}" class="element`); return html; }).join('');
    return `<section class="slide layout-${escape(layout.id)}${layout.canvas ? ' canvas-slide' : ''}" style="${escape(colors)}" data-slide-id="${slide.id}"${attrTarget(target('slide', slide))} aria-label="${index + 1}: ${escape(slide.title)}"><div class="slide-kicker"${layout.hideKicker ? ' hidden' : ''}${attrTarget(target('chapter', slide, { chapterId: slide.chapter }))}>${escape(deck.chapters.find(c => c.id === slide.chapter).title)} · ${index + 1}/${deck.slides.length}</div><h2${boxStyle(layout.titleBox)}${attrTarget(target('title', slide))}>${escape(slide.title)}</h2><p class="slide-message"${boxStyle(layout.messageBox)}${attrTarget(target('message', slide))}>${escape(slide.message)}</p><div class="slide-content"${gridStyle}>${els}</div>${(slide.citations ?? deck.citations) === 'slide' ? sourceStrip(slide.sourceIds, deck.sources, prefix, slide) : ''}<span class="slide-id-label">${index + 1} · ${escape(theme.footer ?? deck.title)}</span></section>`;
}
function paragraphHTML(p, slide) { return `<p class="paragraph"${attrTarget(target('paragraph', slide, { paragraphId: p.id }))}>${escape(p.text)}</p>`; }
export function render(deck, variant, catalog, sources, css, js, mode, displayAssets = deck.assets) {
    const prefix = mode === 'slides' ? '../' : '';
    const model = { ...deck, sources, assets: displayAssets };
    const slides = deck.slides.map((s, i) => slideHTML(s, i, model, variant, catalog, prefix));
    const identity = { deckId: deck.id, revision: deck.revision, variantId: variant.id, contentHash: contentHash(deck) };
    const nav = `<div class="slide-controls"><button data-action="previous" aria-label="前のスライド">← 前</button><span id="page-indicator"></span><button data-action="next" aria-label="次のスライド">次 →</button><button data-action="all">一覧</button><button data-action="zoom">拡大</button></div>`;
    let body;
    if (mode === 'slides')
        body = `<header><h1>${escape(deck.title)}</h1><small>${escape(deck.id)} · ${escape(deck.revision)} · ${escape(variant.id)}</small></header><main class="presentation">${nav}<div id="slide-stage">${slides.map((s, i) => `<div class="slide-page" data-page="${i}"${i ? ' hidden' : ''}>${s}</div>`).join('')}</div></main>`;
    else {
        const script = deck.slides.map((s, i) => `<article class="panel speech"><h3><button data-jump-slide="${s.id}">${i + 1}. ${escape(s.title)}</button></h3>${s.paragraphs.map(p => paragraphHTML(p, { ...s, page: i + 1 })).join('')}<p class="bridge">つなぎ: ${escape(s.transition)}</p></article>`).join('');
        const duration = deck.slides.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + [...p.text].length, 0), 0);
        const rate = deck.timing?.charactersPerMinute ?? 300;
        const flow = deck.slides.map((s, i) => `<article class="flow"><button data-jump-slide="${s.id}">${s.id} / ${i + 1}</button><div><strong>${escape(s.role)}</strong><p>${escape(s.message)}</p></div><div${attrTarget(target('notes', { ...s, page: i + 1 }))}>${s.talkingPoints.map(t => `<p>${escape(t)}</p>`).join('')}<small>${escape(s.notes)}</small></div><p class="bridge">${escape(s.transition)}<br>目安 ${s.seconds}秒</p></article>`).join('');
        const check = deck.coherence ? `<p>確認者: ${escape(deck.coherence.reviewer)} · ${escape(deck.coherence.checkedAt)}</p><ul>${deck.coherence.checks.map(c => `<li>${escape(c.item)}: ${escape(c.result)} / ${escape(c.evidence)}</li>`).join('')}</ul><p>未確認: ${escape(deck.coherence.unchecked.join(' / '))}</p>${(deck.coherence.findings ?? []).map(f => `<article class="panel finding"${attrTarget(target('finding', deck.slides.find(s => s.id === f.slideId), { findingId: f.id, paragraphId: f.paragraphId ?? null }))}><button data-jump-slide="${f.slideId}"${f.paragraphId ? ` data-jump-paragraph="${f.paragraphId}"` : ''}>${escape(f.slideId)} / ${escape(f.paragraphId ?? 'スライド')}</button><blockquote>${escape(f.quote)}</blockquote><p>聞き手への影響: ${escape(f.impact)}</p><p>理由: ${escape(f.reason)}</p><p>修正案: ${escape(f.suggestion)}</p></article>`).join('')}` : '<p class="warning">Codexによる通読チェック未記録。ブラウザ内では判定しません。</p>';
        const sourceHTML = (s, slide) => `<article class="source-detail" id="source-${s.id}-${slide.id}"${attrTarget(target('source', slide, { sourceId: s.id }))}><p><strong>${escape(s.title)}</strong> · ${escape(s.status)}</p><p>${sourceLink(s)} · ${escape(s.position ?? s.location ?? '')}</p><p class="muted">${escape(s.detail)}</p><dl>${['author','date','scope','columns','unit','period','filters','formula','population','missing'].filter(k => s[k]).map(k => `<dt>${escape(k)}</dt><dd>${escape(s[k])}</dd>`).join('')}</dl><details class="sub"><summary>参照記録</summary><pre>${escape(JSON.stringify(s, null, 2))}</pre><button data-copy-location="${escape([s.path ?? s.url ?? s.title, s.position ?? s.location ?? ''].join(' : '))}">参照位置をコピー</button></details></article>`;
        const pageReview = deck.slides.map((s, i) => {
            const page = { ...s, page: i + 1 };
            const ids = new Set([...s.sourceIds, ...s.elements.flatMap(e => e.sourceIds), ...s.paragraphs.flatMap(p => p.sourceIds)]);
            // Include derived inputs so their provenance is reachable on the same page.
            const addInputs = id => { for (const input of sources.find(x => x.id === id)?.inputIds ?? []) if (!ids.has(input)) { ids.add(input); addInputs(input); } }; [...ids].forEach(addInputs);
            const related = sources.filter(x => ids.has(x.id) || (x.kind === 'missing' && x.id.startsWith(`missing-${s.id}-`)));
            const assets = displayAssets.filter(a => a.slideIds.includes(s.id));
            return `<details class="page" id="page-${s.id}"><summary><span class="number">${String(i + 1).padStart(2, '0')}</span><span>${escape(s.message)}</span></summary><div class="page-content">${slides[i]}<div class="tools"><small>箇所を選ぶとコメントできます。</small><button data-pick-slide="${s.id}">ページにコメント</button></div><article class="notes"><h3>このページで伝えること</h3><div${attrTarget(target('notes', page))}><p>${escape(s.notes)}</p><ul>${s.talkingPoints.map(t => `<li>${escape(t)}</li>`).join('')}</ul></div><h3>発表原稿</h3>${s.paragraphs.map(p => paragraphHTML(p, page)).join('')}<p class="bridge">次へのつなぎ: ${escape(s.transition)} · 目安 ${s.seconds}秒</p><details class="sub"><summary>出典・素材${related.some(x => x.status === '要再確認') ? ' · 要再確認あり' : ''}</summary>${related.map(x => sourceHTML(x, page)).join('') || '<p>追加の根拠なし。</p>'}${assets.map(a => `<article class="asset-detail"><p>${escape(a.origin)} · ${escape(a.license)}</p><a href="${escape(fileHref(a.file))}">素材を開く</a> · <a href="${escape(fileHref(a.file))}" download>素材を保存</a>${(a.originals ?? []).map(f => ` · <a href="${escape(fileHref(f))}" download>原本 ${escape(f)}</a>`).join('')}<p class="muted">再生成: ${escape(a.regenerate)}</p></article>`).join('')}</details></article></div></details>`;
        }).join('');
        body = `<header class="document-header"><h1>${escape(deck.title)}</h1><p class="meta">${deck.slides.length}ページ · ${escape(deck.revision)} · ${escape(variant.name ?? 'デザイン案')}</p><p${attrTarget({kind:'purpose'})}>目的: ${escape(deck.purpose)}</p><p${attrTarget({kind:'audience'})}>聞き手: ${escape(deck.audience)} · 持ち時間: ${deck.durationSeconds ?? '未指定'}秒</p><p class="lead"${attrTarget({kind:'message'})}>${escape(deck.message)}</p><details class="sub"><summary>発表原稿を通して読む</summary>${script}<p class="muted">推定 ${Math.ceil(duration / rate * 60)}秒 / ${duration}文字 / 毎分${rate}文字。リハーサル実測ではありません。</p><a href="script.md" download>発表原稿を保存</a></details><details class="sub"><summary>流れ・分かりやすさの確認</summary>${check}<p>期待する理解・判断: ${escape(deck.expectedOutcome)}</p><p>未解決事項: ${escape(deck.unresolved.join(' / ') || 'なし')}</p><a href="story.md" download>話の流れを保存</a></details></header><main class="shell"><h2>ページごとの要点</h2>${pageReview}<details class="sub"><summary>マスター・制作情報</summary><p>${escape(deck.master?.status ?? 'マスター未指定。内容に合わせて配置したデザイン案です。')}</p><pre>${escape(JSON.stringify(deck.master ?? {}, null, 2))}</pre>${deck.migration ? `<p class="warning">旧版からの作業用コピー。元ファイルとコメントは保持し、別版の修正を自動適用しません。</p>` : ''}${(deck.files ?? []).filter(f => /\.(pptx|potx)$/i.test(f)).map(f => `<p><a href="${escape(fileHref(f))}">マスター原本 ${escape(f)}</a></p>`).join('')}<details><summary>制作データ</summary><pre>${escape(JSON.stringify(identity, null, 2))}</pre></details>${variantsFor(deck).length > 1 ? `<p>${variantsFor(deck).map(v => `<a href="../${v.id}/review.html">${escape(v.name ?? v.id)}</a>`).join(' · ')}</p>` : ''}</details><section class="feedback"><div id="comment-list"></div><details class="sub"><summary>コメントの保存・読込</summary><label><input type="checkbox" id="persist"> この版のコメントをブラウザに保存</label><p id="storage-status" role="status">保存OFF（localStorageを使いません）</p><button data-action="save-md">修正回答を保存</button><button data-action="save-json">コメントJSONを保存</button><label for="import-comments">保存したJSONを読込（自動適用しない）</label><input id="import-comments" type="file" accept=".json"></details><p id="feedback-status" role="status"></p></section><p class="fine">箇所コメント → 修正回答をコピー → チャットに貼り戻して次の案へ。HTMLから自動送信しません。</p></main><footer class="response-bar"><small id="comment-count">コメント 0件</small><button data-action="respond" class="primary">修正回答を作成</button><a href="output/slides.html">スライドだけを開く</a></footer><dialog id="comment-editor" aria-labelledby="editor-title"><div class="dialog-header"><h2 id="editor-title">この箇所にコメント</h2><button data-close="comment-editor" aria-label="閉じる">×</button></div><p id="selected-target" class="muted"></p><form id="comment-form"><label for="quote">原文</label><textarea id="quote"></textarea><label for="intent">修正希望</label><textarea id="intent" required></textarea><details class="sub"><summary>差替え案・対象の詳細</summary><label for="replacement">差替え案（任意）</label><textarea id="replacement"></textarea><pre id="target-details"></pre><button type="button" data-action="image-region" hidden id="image-region">画像の領域を指定</button><div id="region-fields" hidden><p>画像内の領域（0–1）。元のPPTXオブジェクトとは対応しません。</p>${['x','y','width','height'].map(k => `<label>${k}<input name="region-${k}" type="number" min="0" max="1" step="0.001"></label>`).join('')}</div></details><div class="actions"><button type="button" data-action="cancel-edit">キャンセル</button><button type="submit" class="primary">コメントを保存</button></div></form></dialog><dialog id="response-sheet" aria-labelledby="response-title"><div class="dialog-header"><h2 id="response-title">修正回答</h2><button data-close="response-sheet" aria-label="閉じる">×</button></div><p>コピーしてチャットへ貼り戻してください。</p><label for="request-text">修正回答（手動コピーもできます）</label><textarea id="request-text" readonly rows="14"></textarea><p id="copy-status" role="status"></p><div class="actions"><button data-action="copy" class="primary">修正回答をコピー</button></div></dialog>`;

    }
    return `<!doctype html><html lang="${escape(deck.language ?? 'ja')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'"><title>${escape(deck.title)} · ${escape(deck.revision)} · ${escape(variant.id)}</title><style>${css}</style></head><body data-mode="${mode}" data-deck-id="${deck.id}" data-revision="${deck.revision}" data-variant="${variant.id}" data-content-hash="${identity.contentHash}">${body}<script type="application/json" id="deck-data">${jsonScript({ identity, slides: deck.slides, sources: deck.sources, coherence: deck.coherence ?? null })}</script><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}
function markdown(deck, mode) {
    const heading = `# ${deck.title}\n\nDeck: ${deck.id} / revision: ${deck.revision}\n\n`;
    if (mode === 'story')
        return heading + `目的: ${deck.purpose}\n\n相手: ${deck.audience}\n\n要旨: ${deck.message}\n\n期待: ${deck.expectedOutcome}\n\n` + deck.slides.map((s, i) => `## ${i + 1}. ${s.id} — ${s.title}\n\n役割: ${s.role}\n\n${s.message}\n\n${s.talkingPoints.map(p => `- ${p}`).join('\n')}\n\nつなぎ: ${s.transition}\n\n出典: ${s.sourceIds.join(', ')}\n`).join('\n') + `\n未解決: ${deck.unresolved.join(' / ') || 'なし'}\n`;
    return heading + deck.slides.map((s, i) => `## ${i + 1}. ${s.id} — ${s.title}\n\n` + s.paragraphs.map(p => `### ${p.id}\n\n${p.text}\n\n出典: ${p.sourceIds.join(', ') || '追加事実なし'}\n`).join('\n') + `\nつなぎ: ${s.transition}\n`).join('\n');
}
async function filesFor(deck, root, projectRoot) {
    const files = new Map();
    const add = async (f, from = root, to = f) => { relative(f); relative(to); require(FILE_TYPES.has(path.extname(f).toLowerCase()), `Unsupported bundled file: ${f}`); const buffer = await safeRead(from, f); if (path.extname(f).toLowerCase() === '.svg')
        safeSVG(buffer, f); require(!files.has(to) || hash(files.get(to)) === hash(buffer), `File collision: ${to}`); files.set(to, buffer); };
    for (const f of deck.files ?? []) {
        require(['assets/', 'data/', 'scripts/', 'references/', 'layouts/'].some(p => f.startsWith(p)), `File outside declared artifact folders: ${f}`);
        await add(f);
    }
    for (const a of deck.assets) {
        await add(a.file);
        for (const f of a.originals ?? [])
            await add(f);
    }
    for (const s of deck.sources)
        if (s.copy)
            await add(s.path, s.kind === 'project' ? projectRoot : root, s.kind === 'project' ? `sources/${s.path}` : s.path);
    for (const s of deck.sources.filter(s => s.kind === 'derived')) {
        await add(s.code);
        await add(s.output);
    }
    for (const slide of deck.slides)
        for (const el of slide.elements)
            if (el.dataRef) {
                require(files.has(el.dataRef.path), `dataRef not explicitly included: ${el.dataRef.path}`);
            }
    return files;
}
async function createFreshDirectory(destination, writer) {
    const parent = path.dirname(destination);
    let cursor = path.parse(parent).root;
    for (const segment of parent.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, segment);
        try {
            require(!(await fs.lstat(cursor)).isSymbolicLink(), 'Output path contains symlink');
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    await fs.mkdir(parent, { recursive: true });
    const realParent = await fs.realpath(parent);
    require(realParent === path.resolve(parent), 'Output parent contains symlink');
    await fs.mkdir(destination); // Atomic collision refusal; never merges existing outputs.
    try {
        await writer(destination);
    }
    catch (error) {
        await fs.rm(destination, { recursive: true, force: true });
        throw error;
    }
}
async function writeFile(root, name, data) { relative(name); const full = path.join(root, name); await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, data, { flag: 'wx' }); }
export async function build(input, out, { projectRoot } = {}) {
    const root = path.dirname(path.resolve(input));
    const deck = JSON.parse((await safeRead(root, path.basename(input))).toString('utf8'));
    const { catalog } = await validateDeck(deck);
    const project = projectRoot ?? root;
    const sources = await provenance(deck, root, project), files = await filesFor(deck, root, project);
    const [css, js] = await Promise.all([fs.readFile(path.join(HERE, 'style.css'), 'utf8'), fs.readFile(path.join(HERE, 'review.js'), 'utf8')]);
    const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    const displayAssets = deck.assets.map(asset => { const buffer = files.get(asset.file); if (asset.preview === true && buffer.length <= 262144 && mime[path.extname(asset.file).toLowerCase()])
        return { ...asset, previewUri: `data:${mime[path.extname(asset.file).toLowerCase()]};base64,${buffer.toString('base64')}` }; return asset; });
    const revisionDir = path.resolve(out, deck.revision);
    await createFreshDirectory(revisionDir, async (revision) => {
        for (const variant of variantsFor(deck)) {
            const destination = path.join(revision, variant.id);
            await fs.mkdir(destination);
            const manifest = [];
            const emit = async (name, data) => { await writeFile(destination, name, data); manifest.push({ path: name, sha256: hash(data) }); };
            for (const [name, data] of files)
                await emit(name, data);
            await emit('deck.json', JSON.stringify(deck, null, 2) + '\n');
            await emit('story.md', markdown(deck, 'story'));
            await emit('script.md', markdown(deck, 'script'));
            await emit('sources.json', JSON.stringify(sources, null, 2) + '\n');
            await emit('assets/registry.json', JSON.stringify(deck.assets, null, 2) + '\n');

            await emit('review.html', render(deck, variant, catalog, sources, css, js, 'review', displayAssets));
            await emit('output/slides.html', render(deck, variant, catalog, sources, css, js, 'slides', displayAssets));
            await writeFile(destination, 'bundle-manifest.json', JSON.stringify({ schemaVersion: 1, identity: { deckId: deck.id, revision: deck.revision, variantId: variant.id, contentHash: contentHash(deck) }, files: manifest }, null, 2) + '\n');
        }
    });
    return { directory: revisionDir, variants: variantsFor(deck).map(v => v.id), warnings: sources.filter(s => s.status === '要再確認').map(s => `${s.id}: ${s.detail}`), contentHash: contentHash(deck) };
}
export async function bundle(input, out) {
    const source = path.resolve(input);
    const manifest = JSON.parse((await safeRead(source, 'bundle-manifest.json')).toString('utf8'));
    require(manifest.schemaVersion === 1 && Array.isArray(manifest.files), 'Invalid bundle manifest');
    require(manifest.identity && typeof manifest.identity === 'object', 'Bundle identity required');
    for (const k of ['deckId', 'revision', 'variantId'])
        id(manifest.identity[k], `bundle ${k}`);
    require(/^[a-f0-9]{64}$/.test(manifest.identity.contentHash), 'Invalid bundle content hash');
    const files = new Map();
    for (const entry of manifest.files) {
        relative(entry.path);
        require(!files.has(entry.path), 'Duplicate bundle path');
        const buffer = await safeRead(source, entry.path);
        require(hash(buffer) === entry.sha256, `Bundle hash mismatch: ${entry.path}`);
        files.set(entry.path, buffer);
    }
    // Variant links remain valid by preserving the variant folder; sibling variants are explicitly not included.
    const destination = path.resolve(out, manifest.identity.revision, manifest.identity.variantId);
    require(destination !== source && !destination.startsWith(source + path.sep) && !source.startsWith(destination + path.sep), 'Bundle source/output overlap');
    await createFreshDirectory(destination, async (dir) => { for (const [name, data] of files)
        await writeFile(dir, name, data); await writeFile(dir, 'bundle-manifest.json', JSON.stringify(manifest, null, 2) + '\n'); });
    return { directory: destination, files: files.size, scope: 'Selected variant only. Other variant links require sibling bundles; external project references need original project.' };
}
export function feedbackCheck(deck, feedback) {
    const expected = { deckId: deck.id, revision: deck.revision, contentHash: contentHash(deck) };
    const identity = feedback.identity ?? {};
    const identityOK = Object.entries(expected).every(([k, v]) => identity[k] === v) && variantsFor(deck).some(v => v.id === identity.variantId);
    return { identityOK, automaticApplication: false, comments: (feedback.comments ?? []).map(c => {
            const s = deck.slides.find(s => s.id === c.target?.slideId);
            let exists = true;
            const t = c.target ?? {};
            if (t.slideId && !s)
                exists = false;
            if (t.elementId && !s?.elements.some(e => e.id === t.elementId))
                exists = false;
            if (t.paragraphId && !s?.paragraphs.some(p => p.id === t.paragraphId))
                exists = false;
            if (t.findingId && !deck.coherence?.findings.some(f => f.id === t.findingId))
                exists = false;
            if (t.sourceId && !deck.sources.some(x => x.id === t.sourceId))
                exists = false;
            if (t.rowId)
                exists = exists && !!s?.elements.find(e => e.id === t.elementId)?.rows?.some(r => r.id === t.rowId && Number.isInteger(t.column) && t.column >= 0 && t.column < r.cells.length);
            if (t.seriesId)
                exists = exists && !!s?.elements.find(e => e.id === t.elementId)?.series?.some(r => r.id === t.seriesId);
            return { id: c.id, status: !exists ? '未対応・対象消滅' : !identityOK ? '別版・別内容（手動照合が必要）' : '対象あり（チャットで修正意図を確認）', currentPage: s ? deck.slides.indexOf(s) + 1 : null, originalPage: t.page ?? null };
        }) };
}
export async function migrate(input, out, { projectRoot } = {}) {
    const root = await fs.realpath(path.dirname(path.resolve(input)));
    const original = await safeRead(root, path.basename(input));
    const old = JSON.parse(original.toString('utf8'));
    require(old.schemaVersion === 1, 'migrate only accepts legacy v2 decks (schemaVersion 1)');
    const destination = path.resolve(out);
    require(destination !== root && !destination.startsWith(root + path.sep) && !root.startsWith(destination + path.sep), 'Migration output must not overlap the original directory');
    const legacy = JSON.parse(await fs.readFile(path.join(HERE, 'legacy-v1.json'), 'utf8'));
    const lookup = category => [...legacy[category], ...(old.catalog?.[category] ?? [])];
    for (const category of ['themes','layouts']) unique(lookup(category), `legacy ${category}`);
    const deck = structuredClone(old);
    deck.schemaVersion = 2;
    deck.variants = variantsFor(old).map(({storyId, ...v}) => v);
    const themeIds = new Set(deck.variants.map(v => v.themeId));
    const layoutIds = new Set(deck.variants.flatMap(v => deck.slides.map(s => v.layouts?.[s.id] ?? s.layoutId)));
    const select = (category, ids) => [...ids].map(id => { const value = lookup(category).find(x => x.id === id); require(value, `Unresolved legacy ${category}: ${id}`); return value; });
    deck.design = { themes: select('themes', themeIds), layouts: select('layouts', layoutIds) };
    delete deck.catalog;
    deck.citations = old.citations ?? 'slide'; // Preserve the visible citations of the old output.
    deck.migration = { originalSHA256: hash(original), originalRevision: old.revision, originalContentHash: contentHash(old), originalDeck: 'references/legacy-deck.json', preservedCoherence: old.coherence ?? null, unchecked: ['Re-read script and check migrated appearance; old comments require manual identity comparison.'] };
    delete deck.coherence;
    await validateDeck(deck);
    const files = await filesFor(old, root, projectRoot ?? root);
    const migratedFiles = new Map();
    for (const [name, bytes] of files) {
        const projectSource = old.sources.find(s => s.kind === 'project' && s.copy && `sources/${s.path}` === name);
        const to = projectSource ? projectSource.path : name;
        require(!migratedFiles.has(to) || hash(migratedFiles.get(to)) === hash(bytes), `Migration file collision: ${to}`);
        migratedFiles.set(to, bytes);
    }
    require(!migratedFiles.has('references/legacy-deck.json'), 'Migration original-deck file collision');
    deck.files = [...new Set([...(deck.files ?? []), 'references/legacy-deck.json'])];
    await createFreshDirectory(destination, async fresh => {
        for (const [name, bytes] of migratedFiles) await writeFile(fresh, name, bytes);
        await writeFile(fresh, 'references/legacy-deck.json', original);
        await writeFile(fresh, 'deck.json', JSON.stringify(deck, null, 2) + '\n');
    });
    return { directory: destination, originalChanged: false, warnings: deck.migration.unchecked };
}
async function cli(args) {
    require(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+ required');
    const [command, input, ...rest] = args;
    const option = key => { const i = rest.indexOf(key); return i < 0 ? undefined : rest[i + 1]; };
    if (command === 'hash')
        return { contentHash: contentHash(JSON.parse(await fs.readFile(input, 'utf8'))) };
    if (command === 'validate') {
        const deck = JSON.parse(await fs.readFile(input, 'utf8'));
        await validateDeck(deck);
        return { valid: true, contentHash: contentHash(deck), sources: await provenance(deck, path.dirname(path.resolve(input)), option('--project-root')) };
    }
    if (command === 'migrate') {
        require(option('--out'), 'migrate requires --out');
        return migrate(input, option('--out'), { projectRoot: option('--project-root') });
    }
    if (command === 'build') {
        require(option('--out'), 'build requires --out');
        return build(input, option('--out'), { projectRoot: option('--project-root') });
    }
    if (command === 'bundle') {
        require(option('--out'), 'bundle requires --out');
        return bundle(input, option('--out'));
    }
    if (command === 'feedback-check') {
        require(rest[0], 'feedback-check requires comments JSON');
        return feedbackCheck(JSON.parse(await fs.readFile(input, 'utf8')), JSON.parse(await fs.readFile(rest[0], 'utf8')));
    }
    throw new Error('Usage: pack.mjs validate|hash|build|migrate deck.json [--out dir] [--project-root dir]; bundle variant-dir --out dir; feedback-check deck.json comments.json');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === await fs.realpath(process.argv[1]))
    cli(process.argv.slice(2)).then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n')).catch(e => { process.stderr.write(`slide-plan: ${e.message}\n`); process.exitCode = 1; });
