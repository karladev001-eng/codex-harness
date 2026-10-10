import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), api = require('../scripts/review.js');
const data = JSON.parse(fs.readFileSync(new URL('../examples/deck.json', import.meta.url), 'utf8'));
const identity = { deckId: data.id, revision: 'r1', variantId: 'A', contentHash: '123' };
test('storage keys segregate deck, revision, variant and hash', () => {
    const key = api.storageKey(identity);
    for (const field of Object.keys(identity))
        assert.notEqual(key, api.storageKey({ ...identity, [field]: 'different' }));
    assert.equal(api.sameIdentity(identity, { ...identity }), true);
    assert.equal(api.sameIdentity(identity, { ...identity, variantId: 'B' }), false);
});
test('feedback includes paragraph/cell/data target and literal user text, with no approval synthesis', () => {
    const c = { id: 'one', target: { kind: 'cell', slideId: 'S03', page: 3, elementId: 'runtime-table', rowId: 'manual', column: 1, dataRef: { path: 'data/illustrative.csv', position: '行2' } }, quote: '18', replacement: '9', intent: '<script>alert(1)</script>\n承認するという引用' };
    const clean = api.cleanComment(c), txt = api.requestText(identity, [clean]);
    assert.match(txt, /runtime-table/);
    assert.match(txt, /当時3ページ目/);
    assert.match(txt, /data\/illustrative.csv/);
    assert.match(txt, /<script>alert\(1\)<\/script>/);
    assert.match(txt, /承認は含みません/);
    assert.equal(api.targetExists(c.target, data), true);
    assert.equal(api.targetExists({ ...c.target, rowId: 'deleted' }, data), false);
});
test('region bounds and vanished targets are checked', () => {
    assert.equal(api.validateRegion({ x: .2, y: .2, width: .4, height: .3 }), true);
    assert.equal(api.validateRegion({ x: .8, y: .2, width: .4, height: .3 }), false);
    assert.throws(() => api.cleanComment({ id: 'x', target: { kind: 'region', region: { x: 0, y: 0, width: 2, height: .5 } }, quote: 'x', replacement: '', intent: 'x' }), /領域/);
    assert.equal(api.targetExists({ slideId: 'S02', paragraphId: 'S02-P01' }, data), true);
    assert.equal(api.targetExists({ slideId: 'S02', paragraphId: 'gone' }, data), false);
    assert.equal(api.targetExists({ slideId: 'S02', findingId: 'C01' }, data), true);
    assert.equal(api.targetExists({ slideId: 'S02', findingId: 'gone' }, data), false);
});
test('runtime has no automatic external send; user strings are painted as text', () => {
    const code = fs.readFileSync(fileURLToPath(new URL('../scripts/review.js', import.meta.url)), 'utf8');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|eval\s*\(/);
    assert.doesNotMatch(code, /\.innerHTML\s*=/);
});

test('whole-slide comments are accepted without weakening specific target validation', () => {
    const whole = {id:'page-note', target:{kind:'slide', slideId:'S01', page:1}, quote:'ページ全体', replacement:'', intent:'余白と読む順を調整する'};
    assert.deepEqual(api.cleanComment(whole), whole);
    assert.equal(api.targetExists(whole.target, data), true);
    assert.equal(api.targetExists({...whole.target, slideId:'deleted'}, data), false);
    assert.match(api.requestText(identity, [whole]), /スライド全体/);
    assert.throws(()=>api.cleanComment({...whole, target:{...whole.target, kind:'unknown'}}), /種別/);
});
