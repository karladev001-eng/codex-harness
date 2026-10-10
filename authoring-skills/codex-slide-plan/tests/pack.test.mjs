import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build, bundle, contentHash, feedbackCheck, hash, provenance, validateDeck, safeRead, migrate } from '../scripts/pack.mjs';
const skill = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function fixture(t) {
    const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'slide-plan-test-')));
    t.after(() => fs.rm(temp, { recursive: true, force: true }));
    const input = path.join(temp, 'input');
    await fs.cp(path.join(skill, 'examples'), input, { recursive: true });
    const deck = JSON.parse(await fs.readFile(path.join(input, 'deck.json'), 'utf8'));
    return { temp, input, deck, file: path.join(input, 'deck.json'), out: path.join(temp, 'output') };
}
async function save(f, deck = f.deck) { await fs.writeFile(f.file, JSON.stringify(deck, null, 2)); }
function uncheck(deck) { delete deck.coherence; return deck; }
test('sample and revised script retain canonical identities; stale check is rejected', async (t) => {
    const f = await fixture(t);
    const { catalog } = await validateDeck(f.deck);
    assert.equal(catalog.layouts.length, 3);
    const revised = JSON.parse(await fs.readFile(path.join(f.input, 'deck-revised.json'), 'utf8'));
    await validateDeck(revised);
    assert.deepEqual(revised.slides.map(s => s.id), f.deck.slides.map(s => s.id));
    f.deck.slides[1].paragraphs[0].text += '改訂';
    await assert.rejects(validateDeck(f.deck), /Coherence stale/);
});
test('immutable build, semantic tables, provenance and portable explicitly selected bundle', async (t) => {
    const f = await fixture(t), result = await build(f.file, f.out);
    assert.deepEqual(result.warnings, []);
    const a = path.join(result.directory, 'A');
    const slideHTML = await fs.readFile(path.join(a, 'output/slides.html'), 'utf8');
    const reviewHTML = await fs.readFile(path.join(a, 'review.html'), 'utf8');
    assert.match(slideHTML, /<table>/);
    assert.doesNotMatch(slideHTML, /<footer class="source-strip">/);
    assert.match(slideHTML, /仮値（実測ではない）/);
    assert.doesNotMatch(slideHTML, /<form id="comment-form"|<p>制作の未解決事項/);
    assert.match(reviewHTML, /S02-P01/);
    assert.match(reviewHTML, /元データ/);
    assert.match(reviewHTML, /C01/);
    const sources = JSON.parse(await fs.readFile(path.join(a, 'sources.json'), 'utf8'));
    assert.equal(sources.find(s => s.id === 'brief').status, '記録hash一致');
    await assert.rejects(build(f.file, f.out), /EEXIST/);
    const copy = await bundle(a, path.join(f.temp, 'shared'));
    assert.equal(hash(await fs.readFile(path.join(copy.directory, 'assets/flow.svg'))), hash(await fs.readFile(path.join(f.input, 'assets/flow.svg'))));
    assert.ok(await fs.stat(path.join(copy.directory, 'sources/data/context.md')));
    await assert.rejects(fs.stat(path.join(copy.directory, 'generate-example.mjs')), /ENOENT/);
    const moved = path.join(f.temp, 'moved');
    await fs.rename(path.join(f.temp, 'shared'), moved);
    assert.ok(await fs.stat(path.join(moved, 'r1/A/data/illustrative.csv')));
    await fs.writeFile(path.join(a, 'data/illustrative.csv'), 'tampered');
    await assert.rejects(bundle(a, path.join(f.temp, 'bad-share')), /hash mismatch/);
});
test('unknown/missing sources and hash drift are surfaced rather than completed as verified', async (t) => {
    const f = await fixture(t);
    uncheck(f.deck);
    f.deck.slides[2].elements[0].sourceIds = [];
    await fs.writeFile(path.join(f.input, 'data/illustrative.csv'), 'changed');
    const sources = await provenance(f.deck, f.input);
    assert.equal(sources.find(s => s.id === 'illustrative-data').status, '要再確認');
    assert.equal(sources.find(s => s.kind === 'missing').status, '要再確認');
    assert.equal(sources.find(s => s.id === 'comparison-derived').status, '要再確認');
    f.deck.slides[0].sourceIds = ['invented'];
    await assert.rejects(validateDeck(f.deck), /Unknown source/);
});
test('source positions must exist; external project-only sources do not become absolute links', async (t) => {
    const f = await fixture(t);
    uncheck(f.deck);
    f.deck.sources.find(s => s.id === 'brief').lineRange = [1, 999];
    assert.match((await provenance(f.deck, f.input)).find(s => s.id === 'brief').detail, /行範囲/);
    delete f.deck.sources.find(s => s.id === 'brief').lineRange;
    f.deck.sources.find(s => s.id === 'brief').copy = false;
    await save(f);
    const result = await build(f.file, f.out);
    const html = await fs.readFile(path.join(result.directory, 'A/review.html'), 'utf8');
    assert.match(html, /元プロジェクトが必要/);
    assert.doesNotMatch(html, new RegExp(f.temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
test('input paths, symlinks, unsafe URLs, SVG injection and missing reads fail safely', async (t) => {
    const f = await fixture(t);
    for (const unsafe of ['../outside.txt', '/etc/passwd', '.env', 'assets/secrets.txt', 'data/../../x', 'data\\x']) {
        const d = uncheck(structuredClone(f.deck));
        d.files = [unsafe];
        await save(f, d);
        await assert.rejects(build(f.file, f.out), /Unsafe path|outside declared artifact/);
    }
    await fs.symlink(path.join(f.temp, 'outside'), path.join(f.input, 'assets/linked.svg'));
    await fs.writeFile(path.join(f.temp, 'outside'), 'outside');
    await assert.rejects(safeRead(f.input, 'assets/linked.svg'), /Symlink/);
    const d = uncheck(structuredClone(f.deck));
    d.sources.push({ id: 'bad', kind: 'web', title: 'x', url: 'javascript:alert(1)', author: 'x', date: 'x', location: 'x', checkedAt: 'x', scope: 'x' });
    await assert.rejects(validateDeck(d), /Unsafe source URL/);
    const injected = uncheck(structuredClone(f.deck));
    await save(f, injected);
    await fs.writeFile(path.join(f.input, 'assets/flow.svg'), '<svg onload="alert(1)"/>');
    await assert.rejects(build(f.file, f.out), /Active\/external SVG/);
    await fs.unlink(path.join(f.input, 'assets/flow.svg'));
    await assert.rejects(build(f.file, f.out), /ENOENT/);
});
test('bundle rejects untrusted identity/path traversal and symlinked output before writes', async (t) => {
    const f = await fixture(t);
    const result = await build(f.file, f.out), a = path.join(result.directory, 'A');
    const manifestFile = path.join(a, 'bundle-manifest.json'), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    manifest.identity.revision = '../../outside';
    await fs.writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(bundle(a, path.join(f.temp, 'share')), /Invalid bundle revision/);
    manifest.identity.revision = 'r1';
    manifest.files.push({ path: '../B/deck.json', sha256: 'x' });
    await fs.writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(bundle(a, path.join(f.temp, 'share')), /Unsafe path/);
    manifest.files.pop();
    await fs.writeFile(manifestFile, JSON.stringify(manifest));
    await fs.mkdir(path.join(f.temp, 'outside'));
    await fs.symlink(path.join(f.temp, 'outside'), path.join(f.temp, 'alias'));
    await assert.rejects(bundle(a, path.join(f.temp, 'alias/new')), /symlink/);
    await assert.rejects(fs.stat(path.join(f.temp, 'outside/new')), /ENOENT/);
    await assert.rejects(bundle(a, a), /overlap/);
});
test('custom layout executes distinct placement and rejects unsafe coordinates/counts', async (t) => {
    const f = await fixture(t);
    const { catalog } = await validateDeck(f.deck);
    assert.equal(catalog.layouts.find(l => l.id === 'custom-evidence-map').grid.columns, 3);
    const result = await build(f.file, f.out), html = await fs.readFile(path.join(result.directory, 'B/review.html'), 'utf8');
    assert.match(html, /grid-row:1\/span 2;grid-column:1\/span 2/);
    const d = uncheck(structuredClone(f.deck));
    d.requestedSlides = 3;
    await assert.rejects(validateDeck(d), /Requested slide count/);
    d.requestedSlides = 4;
    d.design.layouts[0].grid.slots[0].column = 3;
    await assert.rejects(validateDeck(d), /escapes grid/);
});
test('feedback maps stable target after reorder, never applies mismatched versions or deleted objects', async (t) => {
    const f = await fixture(t);
    const feedback = { identity: { deckId: f.deck.id, revision: f.deck.revision, variantId: 'A', contentHash: contentHash(f.deck) }, comments: [{ id: 'one', target: { kind: 'paragraph', slideId: 'S02', paragraphId: 'S02-P01', page: 2 } }, { id: 'two', target: { kind: 'cell', slideId: 'S03', elementId: 'runtime-table', rowId: 'manual', column: 1, page: 3 } }] };
    assert.equal(feedbackCheck(f.deck, feedback).identityOK, true);
    uncheck(f.deck);
    f.deck.slides.reverse();
    let checked = feedbackCheck(f.deck, feedback);
    assert.equal(checked.automaticApplication, false);
    assert.equal(checked.identityOK, false);
    assert.equal(checked.comments[0].currentPage, 3);
    assert.equal(checked.comments[0].originalPage, 2);
    f.deck.slides.find(s => s.id === 'S03').elements = [];
    checked = feedbackCheck(f.deck, feedback);
    assert.equal(checked.comments[1].status, '未対応・対象消滅');
});

// These regressions exercise produced links/style attributes, not validator wording alone.
test('original downloads reject URI/control filenames before any HTML output', async (t) => {
    const f = await fixture(t);
    for (const filename of ['javascript:alert(1).png', 'java\tscript:alert(1).png', 'assets/line\nbreak.png']) {
        const original = path.join(f.input, filename);
        await fs.writeFile(original, 'original-file');
        const deck = uncheck(structuredClone(f.deck));
        deck.assets[0].originals = [filename];
        await save(f, deck);
        await assert.rejects(build(f.file, f.out), /Unsafe path/);
        await assert.rejects(fs.stat(path.join(f.out, deck.revision)), /ENOENT/);
        assert.equal(await fs.readFile(original, 'utf8'), 'original-file');
    }
    const deck = uncheck(structuredClone(f.deck));
    const safeName = 'assets/図の原本 & copy.png';
    await fs.writeFile(path.join(f.input, safeName), 'original-file');
    deck.assets[0].originals = [safeName];
    await save(f, deck);
    const result = await build(f.file, f.out);
    const html = await fs.readFile(path.join(result.directory, 'A/review.html'), 'utf8');
    const downloadLinks = [...html.matchAll(/href="([^"<>]+)" download/g)].map(m => m[1]);
    assert.ok(downloadLinks.includes('./assets/' + encodeURIComponent('図の原本 & copy.png')));
    for (const href of downloadLinks) assert.equal(new URL(href, 'https://local.invalid/review.html').origin, 'https://local.invalid');
});
test('quoted Japanese and accented font names survive one escaped style attribute', async (t) => {
    const f = await fixture(t);
    const deck = uncheck(structuredClone(f.deck));
    const font = '"游ゴシック", "源ノ角ゴシック", "Café Sans", sans-serif';
    deck.design.themes = [{id:'japanese', name:'持込書体', background:'#ffffff', ink:'#243246', accent:'#176b70', muted:'#566777', ratio:[16,9], font}];
    for (const v of deck.variants) v.themeId = 'japanese';
    await save(f, deck);
    const result = await build(f.file, f.out);
    const html = await fs.readFile(path.join(result.directory, 'A/output/slides.html'), 'utf8');
    const slide = html.match(/<section class="slide[^>]+>/)[0];
    const attributes = [...slide.matchAll(/([a-z-]+)="([^"]*)"/g)];
    assert.deepEqual(attributes.map(m=>m[1]).sort(), ['aria-label','class','data-slide-id','data-target','style','tabindex']);
    const decodedStyle = attributes.find(m=>m[1]==='style')[2].replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
    assert.ok(decodedStyle.includes('--slide-font:' + font + ';'));
    for (const injected of ['Arial; color:red', 'Arial" onmouseover="alert(1)', 'Arial\nserif', 'url(https://example.com)']) {
        deck.design.themes[0].font = injected;
        await assert.rejects(validateDeck(deck), /Unsafe theme font/);
    }
});

test('whole-page target preserves specific title/element targets and selected POTX originals', async (t) => {
    const f = await fixture(t);
    const deck = uncheck(structuredClone(f.deck));
    const original = Buffer.from([0x50,0x4b,0x03,0x04,0,17,29,31]);
    await fs.mkdir(path.join(f.input, 'references'));
    await fs.writeFile(path.join(f.input, 'references/template.potx'), original);
    deck.files.push('references/template.potx');
    await save(f, deck);
    const result = await build(f.file, f.out);
    const variant = path.join(result.directory, 'A');
    const html = await fs.readFile(path.join(variant, 'review.html'), 'utf8');
    const pageTag = html.match(/<section class="slide[^>]+data-slide-id="S01"[^>]+>/)[0];
    const target = JSON.parse(pageTag.match(/data-target="([^"]*)"/)[1].replaceAll('&quot;', '"'));
    assert.deepEqual(target, {kind:'slide', slideId:'S01', page:1});
    assert.match(html, /data-target="\{&quot;kind&quot;:&quot;title&quot;,&quot;slideId&quot;:&quot;S01&quot;/);
    assert.match(html, /data-target="\{&quot;kind&quot;:&quot;element&quot;,&quot;slideId&quot;:&quot;S01&quot;/);
    assert.deepEqual(await fs.readFile(path.join(variant, 'references/template.potx')), original);
    const copied = await bundle(variant, path.join(f.temp, 'shared'));
    assert.deepEqual(await fs.readFile(path.join(copied.directory, 'references/template.potx')), original);
    assert.deepEqual(await fs.readFile(path.join(f.input, 'references/template.potx')), original);
});

test('new creation needs no catalogue or selected layout and citations are explicit', async t => {
    const f = await fixture(t), d = uncheck(structuredClone(f.deck));
    delete d.variants; delete d.design; for (const s of d.slides) delete s.layout;
    await save(f, d); const first = await build(f.file, f.out);
    assert.deepEqual(first.variants, ['A']);
    const html = await fs.readFile(path.join(first.directory, 'A/review.html'), 'utf8');
    assert.doesNotMatch(html, /role="tab"|template-card|class="catalog"/);
    const rows = [...html.matchAll(/<details class="page"[^>]*>/g)]; assert.equal(rows.length, d.slides.length);
    assert.ok(rows.every(m => !/\bopen\b/.test(m[0])));
    assert.match(html, /<dialog id="comment-editor"/); assert.match(html, /<dialog id="response-sheet"/);
    assert.doesNotMatch(await fs.readFile(path.join(first.directory,'A/output/slides.html'),'utf8'), /<footer class="source-strip">/);
    d.revision = 'r3'; d.slides[2].citations = 'slide'; await save(f,d);
    const second = await build(f.file,f.out);
    const slides = await fs.readFile(path.join(second.directory,'A/output/slides.html'),'utf8');
    assert.match(slides, /<footer class="source-strip">/); assert.match(slides, /review.html#page-S03/);
    assert.match(slides, /仮値（実測ではない）/); assert.match(slides, /同じ入力を使う想定の2方法/);
});

test('explicit legacy working-copy migration retains originals/IDs/design and refuses unsafe output', async t => {
    const f = await fixture(t), bytes = await fs.readFile(path.join(skill,'tests/fixtures/legacy-v2.json'));
    await fs.writeFile(f.file,bytes); const old = JSON.parse(bytes);
    await assert.rejects(build(f.file,f.out), /explicit migrate/);
    const output = path.join(f.temp,'working'); const result = await migrate(f.file,output);
    assert.equal(result.originalChanged,false); assert.deepEqual(await fs.readFile(f.file),bytes);
    const d = JSON.parse(await fs.readFile(path.join(output,'deck.json'),'utf8'));
    assert.deepEqual(d.slides,old.slides); assert.deepEqual(d.assets,old.assets); assert.deepEqual(d.sources,old.sources);
    assert.equal(d.catalog,undefined); assert.equal(d.coherence,undefined); assert.equal(d.design.themes.length,2);
    assert.equal(d.migration.originalSHA256,hash(bytes)); assert.deepEqual(d.migration.preservedCoherence,old.coherence);
    assert.deepEqual(await fs.readFile(path.join(output,'references/legacy-deck.json')),bytes);
    assert.deepEqual(await fs.readFile(path.join(output,'assets/flow.svg')),await fs.readFile(path.join(f.input,'assets/flow.svg')));
    const built = await build(path.join(output,'deck.json'),path.join(f.temp,'migrated-output'));
    assert.deepEqual(built.warnings,[]); assert.match(await fs.readFile(path.join(built.directory,'B/output/slides.html'),'utf8'), /grid-row:1\/span 2;grid-column:1\/span 2/);
    await assert.rejects(migrate(f.file,output), /EEXIST/);
    await assert.rejects(migrate(f.file,path.join(f.input,'working')), /overlap/);
    await fs.symlink(f.temp,path.join(f.temp,'alias'));
    await assert.rejects(migrate(f.file,path.join(f.temp,'alias/unsafe')), /symlink/);
    assert.deepEqual(await fs.readFile(f.file),bytes);
});


test('page-only concept labels stay visible independently of slide citations', async t => {
    const f = await fixture(t), d = uncheck(structuredClone(f.deck));
    d.sources.push({id:'slide-concept',kind:'concept',title:'Page-level assumption',label:'仮値（非実測）',checkedAt:'2026-10-10'});
    d.slides[0].sourceIds = ['slide-concept']; d.slides[0].elements[0].sourceIds = [];
    await save(f,d); const output = await build(f.file,f.out);
    for (const file of ['review.html','output/slides.html']) {
        const html = await fs.readFile(path.join(output.directory,'A',file),'utf8');
        const page = html.match(/<section class="slide[^>]+data-slide-id="S01"[\s\S]*?<\/section>/)[0];
        assert.match(page, /<p class="data-context">仮値（非実測）<\/p>/);
        assert.doesNotMatch(page, /<footer class="source-strip">/);
    }
});

test('displayed asset-only provenance and its derived inputs are reachable in page review', async t => {
    const f = await fixture(t), d = uncheck(structuredClone(f.deck));
    d.sources.push({id:'image-web',kind:'web',title:'Special image provenance',url:'https://example.com/special-image',author:'Fixture author',date:'2026-10-10',location:'Image credit',scope:'Synthetic regression record, no live fetch',checkedAt:'2026-10-10',verified:true});
    d.sources.push({id:'asset-concept',kind:'concept',title:'Asset concept',label:'素材は概念図（非実測）',checkedAt:'2026-10-10'});
    d.sources.push({id:'asset-derived',kind:'derived',title:'Derived image provenance',inputIds:['image-web'],formula:'Fixture derivation',code:'scripts/aggregate.mjs',output:'data/illustrative.csv',unit:'概念',population:'Synthetic image',missing:'No measurements',checkedAt:'2026-10-10'});
    d.assets[0].sourceIds=['asset-derived','asset-concept']; d.slides[1].sourceIds=['brief']; d.slides[1].elements[0].sourceIds=[];
    await save(f,d); const output = await build(f.file,f.out);
    const html = await fs.readFile(path.join(output.directory,'A/review.html'),'utf8');
    const page = html.slice(html.indexOf('<details class="page" id="page-S02"'),html.indexOf('<details class="page" id="page-S03"'));
    assert.match(page, /href="https:\/\/example.com\/special-image"/);
    assert.match(page, /source-asset-derived-S02/); assert.match(page, /source-asset-concept-S02/);
    const slides = await fs.readFile(path.join(output.directory,'A/output/slides.html'),'utf8');
    const visibleSlide = slides.match(/<section class="slide[^>]+data-slide-id="S02"[\s\S]*?<\/section>/)[0];
    assert.match(visibleSlide, /<p class="data-context">素材は概念図（非実測）<\/p>/);
    assert.doesNotMatch(visibleSlide, /<footer class="source-strip">/);
});
