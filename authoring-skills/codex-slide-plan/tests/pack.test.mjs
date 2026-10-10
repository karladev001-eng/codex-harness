import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build, bundle, contentHash, feedbackCheck, hash, provenance, validateDeck, safeRead } from '../scripts/pack.mjs';
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
test('sample, revised script and catalogue retain canonical identities; stale check is rejected', async (t) => {
    const f = await fixture(t);
    const { catalog } = await validateDeck(f.deck);
    assert.equal(catalog.stories.length, 4);
    assert.equal(catalog.layouts.length, 11);
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
    assert.match(slideHTML, /source-illustrative-data/);
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
    d.catalog.layouts[0].grid.slots[0].column = 3;
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
