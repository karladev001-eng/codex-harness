// Offline structural and numeric checks only. These tests do not render HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build,bundle,contentHash,hash,validateDeck,rendererHash,artifactHash,reviewIdentity,reviewReport} from '../scripts/pack.mjs';
const api=createRequire(import.meta.url)('../scripts/review.js');
const skill=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
async function fixture(t) {
    const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'slide-v6-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const input=path.join(root,'input');await fs.cp(path.join(skill,'examples'),input,{recursive:true});
    const deck=JSON.parse(await fs.readFile(path.join(input,'deck.json'),'utf8'));delete deck.coherence;
    return {root,input,deck};
}
function record(d,identity,kind='page',slideId=d.slides[0].id) {
    return {id:`${kind}-${slideId}`,kind,...(kind==='flow'?{}:{slideId}),identity,status:'verified',reviewer:'Synthetic test record (not an actual review)',reviewMode:'self',checkedAt:'2026-10-10',verification:kind==='visual'?'rendered':'semantic',environment:{surface:'test fixture, not a rendering'},evidence:[],checks:[{item:'synthetic coverage',result:'pass',reason:'Fixture to exercise state rules'}],findings:[],unchecked:[]};
}
async function identity(f) {return reviewIdentity(f.deck,'A',await rendererHash(),await artifactHash(f.deck,f.input));}
test('every page/variant and flow must be reviewed; DOM cannot verify visual or meaning',async t=>{
    const f=await fixture(t),i=await identity(f),r=record(f.deck,i);f.deck.reviews=[r];
    await validateDeck(f.deck);
    let report=reviewReport(f.deck,'A',i.rendererHash,{},i.artifactHash);
    assert.equal(report.status,'pending');assert.equal(report.scopes.length,f.deck.slides.length*2+1);
    assert.equal(report.scopes.find(s=>s.kind==='page'&&s.slideId===r.slideId).status,'verified');
    assert.ok(reviewReport(f.deck,'B',i.rendererHash,{},i.artifactHash).scopes.every(s=>s.status==='pending'));
    r.verification='structure';await assert.rejects(validateDeck(f.deck),/meaning requires semantic/);
    r.kind='visual';r.verification='rendered';await assert.rejects(validateDeck(f.deck),/rendered evidence/);
    r.status='pending';r.verification='structure';await validateDeck(f.deck);
    report=reviewReport(f.deck,'A',i.rendererHash,{},i.artifactHash);assert.equal(report.status,'pending');
});
test('content, layout, renderer and actual asset/data bytes invalidate records; evidence additions do not',async t=>{
    const f=await fixture(t),i=await identity(f);f.deck.reviews=[record(f.deck,i)];
    const original=contentHash(f.deck), originalArtifact=await artifactHash(f.deck,f.input);
    f.deck.reviews[0].checks[0].reason='new review wording';assert.equal(contentHash(f.deck),original);
    const e={path:'evidence/operation.json',sha256:hash('synthetic operation evidence')};
    await fs.mkdir(path.join(f.input,'evidence'));await fs.writeFile(path.join(f.input,e.path),'synthetic operation evidence');
    f.deck.files.push(e.path);f.deck.reviews[0].evidence.push(e);
    assert.equal(contentHash(f.deck),original);assert.equal(await artifactHash(f.deck,f.input),originalArtifact);
    await validateDeck(f.deck);
    assert.equal(reviewReport(f.deck,'A',i.rendererHash,{},i.artifactHash).records[0].stale,false);
    for (const alter of [d=>d.slides[0].message+='changed', d=>{d.slides[0].layout={grid:{columns:1,rows:1,slots:[]}};}]) {
        const d=structuredClone(f.deck);alter(d);assert.equal(reviewReport(d,'A',i.rendererHash,{},i.artifactHash).records[0].stale,true);
    }
    assert.equal(reviewReport(f.deck,'A',hash('another renderer'),{},i.artifactHash).records[0].effectiveStatus,'pending');
    await fs.appendFile(path.join(f.input,f.deck.assets[0].file),'\n');
    let changed=await artifactHash(f.deck,f.input);assert.notEqual(changed,i.artifactHash);
    assert.equal(reviewReport(f.deck,'A',i.rendererHash,{},changed).records[0].stale,true);
    await fs.appendFile(path.join(f.input,'data/illustrative.csv'),'\n');assert.notEqual(await artifactHash(f.deck,f.input),changed);
    const d=structuredClone(f.deck);d.reviews[0].evidence=[{path:d.assets[0].file,sha256:hash('x')}];d.files.push(d.assets[0].file);
    await assert.rejects(validateDeck(d),/evidence\//);
    assert.notEqual(contentHash({...d,assets:d.assets.map(a=>({...a,alt:'content edit'}))}),contentHash(d));
    // Dedicated evidence cannot be reused as data/code/source to hide content edits.
    const reuse=structuredClone(f.deck);reuse.slides[0].elements[0].dataRef={path:e.path,position:'test'};
    await assert.rejects(validateDeck(reuse),/not reused/);
});
test('evidence hash/missing reads remain pending, manifest SHA detects bundle tampering',async t=>{
    const f=await fixture(t);await fs.mkdir(path.join(f.input,'evidence'));
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1cAAAAASUVORK5CYII=','base64');await fs.writeFile(path.join(f.input,'evidence/view.png'),bytes);
    f.deck.files.push('evidence/view.png');f.deck.reviews=[record(f.deck,{},'visual')];
    f.deck.reviews[0].evidence=[{path:'evidence/view.png',sha256:hash(bytes)}];f.deck.reviews[0].identity=await identity(f);
    const file=path.join(f.input,'deck.json');await fs.writeFile(file,JSON.stringify(f.deck));
    let result=await build(file,path.join(f.root,'first'));
    assert.equal(result.reviews[0].records[0].effectiveStatus,'verified');assert.equal(result.reviews[0].status,'pending');
    const report=JSON.parse(await fs.readFile(path.join(result.directory,'A/reviews.json'),'utf8'));
    assert.deepEqual(report,result.reviews[0]);
    const moved=await bundle(path.join(result.directory,'A'),path.join(f.root,'shared'));
    assert.deepEqual(await fs.readFile(path.join(moved.directory,'evidence/view.png')),bytes);
    await fs.appendFile(path.join(result.directory,'A/evidence/view.png'),'tampered');
    await assert.rejects(bundle(path.join(result.directory,'A'),path.join(f.root,'tampered')),/Bundle hash mismatch/);
    await fs.writeFile(path.join(f.input,'evidence/view.png'),'wrong bytes');
    result=await build(file,path.join(f.root,'second'));assert.equal(result.reviews[0].records[0].effectiveStatus,'pending');assert.equal(result.reviews[0].records[0].stale,false);
    await fs.rm(path.join(f.input,'evidence/view.png'));
    result=await build(file,path.join(f.root,'third'));assert.equal(result.reviews[0].records[0].effectiveStatus,'pending');assert.match(result.reviews[0].records[0].evidenceIssues[0],/ENOENT/);
});
test('unresolved findings block completion and changed deck retains stale disappearing targets',async t=>{
    const f=await fixture(t),i=await identity(f),r=record(f.deck,i);
    r.status='changes';r.findings=[{id:'F01',target:{slideId:r.slideId,elementId:f.deck.slides[0].elements[0].id},severity:'major',problem:'two separate claims',reason:'A synthetic semantic finding',suggestion:'split the page',resolution:'open'}];f.deck.reviews=[r];
    assert.equal(reviewReport(f.deck,'A',i.rendererHash,{},i.artifactHash).status,'changes');
    r.status='verified';await assert.rejects(validateDeck(f.deck),/unresolved/);
    r.findings[0].resolution='intentional';await assert.rejects(validateDeck(f.deck),/resolution reason/);
    r.findings[0].resolutionReason='Synthetic intentional example';await validateDeck(f.deck);
    f.deck.slides.shift();f.deck.requestedSlides=f.deck.slides.length;
    for (const a of f.deck.assets) a.slideIds=a.slideIds.filter(id=>f.deck.slides.some(s=>s.id===id));
    await validateDeck(f.deck);assert.equal(reviewReport(f.deck,'A',i.rendererHash,{},i.artifactHash).records[0].stale,true);
});
test('diagnostic geometry finds overflow/footer crossings while retaining justified overlap exclusions',()=>{
    const nodes=[{id:'title',role:'content',rect:{x:100,y:80,width:900,height:70}},{id:'text',role:'content',rect:{x:100,y:580,width:900,height:150},overflow:true},{id:'footer',role:'footer',rect:{x:100,y:680,width:900,height:30}},{id:'background',role:'content',rect:{x:0,y:0,width:1280,height:720}}];
    const reasons=nodes.slice(0,3).map(n=>({first:'background',second:n.id,reason:'Master background intentionally contains foreground'}));
    const result=api.diagnoseGeometry(nodes,1280,720,reasons);
    assert.ok(result.findings.some(f=>f.type==='boundary'&&f.target==='text'));
    assert.ok(result.findings.some(f=>f.type==='overflow'));
    assert.ok(result.findings.some(f=>f.type==='footer-intersection'));
    assert.equal(result.excluded.length,3);assert.equal(result.visualStatus,'pending');
    for (const scale of [.28125,.6,1.125]) {
        const logical=api.logicalRect({left:40+100*scale,top:20+80*scale,width:900*scale,height:70*scale},{left:40,top:20},scale);
        assert.deepEqual(logical,nodes[0].rect);
    }
    assert.equal(api.fitScale(1280,720,0),null);assert.equal(api.fitScale(1280,720,1440,360),.5);
});
test('review/slides share fixed canvas markup and slide styles have no viewport typography',async t=>{
    const f=await fixture(t);await fs.writeFile(path.join(f.input,'deck.json'),JSON.stringify(f.deck));
    const result=await build(path.join(f.input,'deck.json'),path.join(f.root,'output'));
    const html=await fs.readFile(path.join(result.directory,'A/review.html'),'utf8');
    const slides=await fs.readFile(path.join(result.directory,'A/output/slides.html'),'utf8');
    const section=h=>h.match(/<section class="slide[^>]+data-slide-id="S01"[\s\S]*?<\/section>/)[0];
    assert.equal(section(html),section(slides));
    assert.match(html,/data-canvas-width="1280" data-canvas-height="720"/);assert.match(html,/--slide-padding:76.8px/);
    const css=await fs.readFile(path.join(skill,'scripts/style.css'),'utf8');
    assert.doesNotMatch(css.slice(css.indexOf('/* Only the frame')),/vw|clamp\(|overflow:hidden/);
    assert.match(html,/審査待ち \/ 未検証/);assert.match(html,/意味内容を自動判定しません/);
});

test('identical title and message appear once on the canvas with message comment target preserved in review',async t=>{
    const f=await fixture(t);f.deck.slides[0].message=f.deck.slides[0].title;
    await fs.writeFile(path.join(f.input,'deck.json'),JSON.stringify(f.deck));
    const output=await build(path.join(f.input,'deck.json'),path.join(f.root,'output'));
    const html=await fs.readFile(path.join(output.directory,'A/review.html'),'utf8');
    const slide=html.match(/<section class="slide[^>]+data-slide-id="S01"[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(slide,/<p class="slide-message"/);
    assert.match(html,/data-target="\{&quot;kind&quot;:&quot;message&quot;,&quot;slideId&quot;:&quot;S01&quot;/);
    assert.match(html,/<p class="slide-message"[^>]*data-target="\{&quot;kind&quot;:&quot;message&quot;,&quot;slideId&quot;:&quot;S02&quot;/);
});
