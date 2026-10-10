// A bounded DOM adapter exercises the actual emitted HTML and runtime wiring.
// It has no layout, browser engine or visual/real-browser verification claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from '../scripts/pack.mjs';
const decode = s => s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const camel = s => s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
class Element {
    constructor(tag, doc, attrs={}) { this.tagName=tag;this.doc=doc;this.attrs=attrs;this.children=[];this.handlers={};this.dataset={};this.value='';this.hidden='hidden' in attrs;this.open='open' in attrs;this.text='';this.style={};this.bounds={left:0,top:0,width:0,height:0};for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[camel(k.slice(5))]=v;
        this.classList={add:c=>{this.attrs.class=[...new Set((this.attrs.class??'').split(' ').concat(c))].join(' ');},remove:c=>{this.attrs.class=(this.attrs.class??'').split(' ').filter(x=>x!==c).join(' ');},contains:c=>(this.attrs.class??'').split(' ').includes(c),toggle:c=>{const on=!this.classList.contains(c);on?this.classList.add(c):this.classList.remove(c);return on;}}; }
    get textContent(){return this.text+this.children.map(x=>x.textContent).join('');} set textContent(v){this.text=String(v);this.children=[];}
    get parentElement(){return this.parent;}
    get clientWidth(){return this.bounds.width;} get clientHeight(){return this.bounds.height;}
    getBoundingClientRect(){return this.bounds;}
    getAttribute(k){return this.attrs[k]??null;}
    get innerText(){return this.textContent;}
    set className(v){this.attrs.class=v;}
    matches(selector){return selector.split(',').some(s=>{s=s.trim();const a=s.match(/^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/);if(a){const value=a[2]??a[3]??a[4];return a[1] in this.attrs&&(value===undefined||this.attrs[a[1]]===value);}if(s.startsWith('.'))return this.classList.contains(s.slice(1));if(s.startsWith('#'))return this.attrs.id===s.slice(1);return this.tagName===s;});}
    closest(s){return this.matches(s)?this:this.parent?.closest(s)??null;}
    all(){return this.children.flatMap(x=>[x,...x.all()]);}
    querySelectorAll(s){return this.all().filter(x=>x.matches(s));} querySelector(s){return this.querySelectorAll(s)[0]??null;}
    append(...els){for(const el of els){el.parent=this;this.children.push(el);}} replaceChildren(...els){this.children=[];this.append(...els);}
    addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);} dispatch(type,event={}){for(const fn of this.handlers[type]??[])fn({target:this,preventDefault(){},...event});}
    focus(){this.doc.activeElement=this;} select(){this.selected=true;} scrollIntoView(){} setAttribute(k,v){this.attrs[k]=v;}
    showModal(){assert.equal(this.open,false,'dialog already open');this.open=true;} close(){this.open=false;this.dispatch('close');}
}
function dom(html){
    const data=html.match(/<script type="application\/json" id="deck-data">([\s\S]*?)<\/script>/)[1];
    html=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'');
    const doc=new Element('document',null);doc.doc=doc;doc.createElement=tag=>new Element(tag,doc);doc.getElementById=id=>doc.all().find(x=>x.attrs.id===id)??null;
    const stack=[doc];for(const token of html.matchAll(/<[^>]+>|[^<]+/g)){const t=token[0];if(t.startsWith('</')){const name=t.slice(2,-1).trim();while(stack.length>1){if(stack.pop().tagName===name)break;}}else if(t.startsWith('<!'))continue;else if(t.startsWith('<')){const name=t.match(/^<([\w-]+)/)?.[1];if(!name)continue;const attrs={};for(const a of t.slice(name.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');const el=new Element(name,doc,attrs);stack.at(-1).append(el);if(!['meta','input','img','br','link','hr'].includes(name))stack.push(el);}else stack.at(-1).text+=decode(t);}
    doc.body=doc.querySelector('body');const script=new Element('script',doc,{id:'deck-data'});script.textContent=data;doc.body.append(script);return doc;
}
async function setup(t,mode='review'){
    const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'slide-dom-')));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
    const skill=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
    const result=await build(path.join(skill,'examples/deck.json'),temp);
    const doc=dom(await fs.readFile(path.join(result.directory,'A',mode==='review'?'review.html':'output/slides.html'),'utf8'));
    const listeners={}; const win={document:doc,location:{hash:''},addEventListener(type,fn){(listeners[type]??=[]).push(fn);},requestAnimationFrame:fn=>fn(),getSelection:()=>({toString:()=>''}),navigator:{},crypto:{randomUUID:()=> 'test-comment'}};
    Object.defineProperty(win,'localStorage',{get(){throw Error('storage touched while OFF');}});
    vm.runInNewContext(await fs.readFile(path.join(skill,'scripts/review.js'),'utf8'),{window:win,console,Blob,URL,setTimeout});
    return {doc,win,listeners,$:id=>doc.getElementById(id),click:el=>doc.dispatch('click',{target:el})};
}
test('actual generated review opens targets by keyboard and supports add/edit/delete/response/manual-copy',async t=>{
    const {doc,win,$,click}=await setup(t);
    assert.ok(doc.querySelectorAll('.page').every(p=>!p.open));
    const title=doc.querySelectorAll('[data-target]').find(e=>JSON.parse(e.dataset.target).kind==='title');
    doc.dispatch('keydown',{key:'Enter',target:title});
    assert.equal($('page-S01').open,true);assert.equal($('comment-editor').open,true);assert.match($('quote').value,/数字と条件/);
    $('intent').value='読み方を先に説明';$('comment-form').dispatch('submit');
    assert.equal($('comment-editor').open,false);assert.equal(win.SlidePlan.state().comments.length,1);
    $('comment-list').querySelector('button').dispatch('click');assert.equal($('intent').value,'読み方を先に説明');
    $('intent').value='説明を短くする';$('comment-form').dispatch('submit');assert.equal(win.SlidePlan.state().comments[0].intent,'説明を短くする');
    click(doc.querySelector('[data-action=respond]'));assert.equal($('response-sheet').open,true);assert.match($('request-text').value,/当時1ページ目/);assert.match($('request-text').value,/説明を短くする/);
    click(doc.querySelector('[data-action=copy]'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal($('request-text').selected,true);assert.match($('copy-status').textContent,/手動/);
    $('comment-list').querySelectorAll('button')[1].dispatch('click');assert.equal(win.SlidePlan.state().comments.length,0);assert.equal($('comment-count').textContent,'コメント 0件');
});
test('emitted cell/series/image targets survive selection; manual region and version rejection',async t=>{
    const {doc,win,$}=await setup(t);
    for(const kind of ['cell','series']){const el=doc.querySelectorAll('[data-target]').find(e=>JSON.parse(e.dataset.target).kind===kind);doc.dispatch('keydown',{key:'Enter',target:el});assert.equal(win.SlidePlan.state().selected.kind,kind);$('comment-editor').dispatch('cancel');$('comment-editor').close();}
    const image=doc.querySelectorAll('[data-target]').find(e=>JSON.parse(e.dataset.target).elementId==='scope-diagram');doc.dispatch('keydown',{key:'Enter',target:image});assert.equal($('image-region').hidden,false);
    doc.dispatch('click',{target:$('image-region')});$('intent').value='左側を強調';$('comment-form').dispatch('submit');
    assert.equal(win.SlidePlan.state().comments[0].target.kind,'region');assert.equal(win.SlidePlan.state().comments[0].target.region.width,1);
    const wrong={schemaVersion:1,identity:{...win.SlidePlan.state().identity,revision:'elsewhere'},comments:[]};await win.SlidePlan.importFeedback({text:async()=>JSON.stringify(wrong)});assert.equal(win.SlidePlan.state().comments.length,1);assert.match($('feedback-status').textContent,/別版/);
});
test('slide-only controls advance and list actual generated pages',async t=>{
    const {doc,win,click}=await setup(t,'slides');assert.equal(win.SlidePlan.state().currentPage,0);
    click(doc.querySelector('[data-action=next]'));assert.equal(win.SlidePlan.state().currentPage,1);
    doc.dispatch('keydown',{key:'ArrowLeft',target:doc.body});assert.equal(win.SlidePlan.state().currentPage,0);
    click(doc.querySelector('[data-action=all]'));assert.ok(doc.querySelectorAll('.slide-page').every(p=>!p.hidden));
});

// Numeric dimensions are injected into this adapter; no rendering or visual PASS.
test('fixed canvas fitting recomputes on details/resize/zoom and keeps its logical dimensions',async t=>{
    const {doc,win,listeners,click}=await setup(t,'slides');
    const frame=doc.querySelector('.slide-frame'),slide=frame.querySelector('.slide');
    for (const [w,h] of [[1280,720],[1280,960]]) {
        frame.dataset.canvasWidth=String(w);frame.dataset.canvasHeight=String(h);
        for (const available of [360,768,1440]) {
            frame.parentElement.bounds.width=available;win.SlidePlan.fitFrames();
            assert.equal(slide.style.transform,`scale(${available/w})`);
            assert.equal(frame.style.height,`${h*available/w}px`);
            assert.equal(frame.style.width,`${available}px`);
        }
    }
    frame.parentElement.bounds.width=0;win.SlidePlan.fitFrames();assert.equal(frame.style.width,'1440px');
    frame.parentElement.bounds.width=768;doc.dispatch('toggle');assert.equal(frame.style.width,'768px');
    frame.parentElement.bounds.width=360;listeners.resize.forEach(fn=>fn());assert.equal(frame.style.width,'360px');
    frame.parentElement.bounds.width=1440;win.innerHeight=850;
    click(doc.querySelector('[data-action=zoom]'));assert.equal(frame.style.height,'720px');
    doc.dispatch('keydown',{key:'Escape',target:doc.body});assert.equal(frame.style.height,'1080px');
    assert.equal(frame.dataset.canvasWidth,'1280');assert.equal(frame.dataset.canvasHeight,'960');
});
test('review fitting subtracts document padding and image pointer regions normalize transformed pixels',async t=>{
    const {doc,win,$}=await setup(t);
    const frame=doc.querySelector('.slide-frame');frame.parentElement.bounds.width=814;
    win.getComputedStyle=()=>({paddingLeft:'46px',paddingRight:'0px'});win.SlidePlan.fitFrames();
    assert.equal(frame.style.width,'768px');
    const img=doc.querySelector('[data-region-image]');
    for (const scale of [.25,.75]) {
        img.bounds={left:10,top:20,width:1280*scale,height:720*scale};
        img.dispatch('pointerdown',{button:0,clientX:10+128*scale,clientY:20+72*scale});
        img.dispatch('pointerup',{clientX:10+640*scale,clientY:20+360*scale});
        const r=win.SlidePlan.state().selected.region;
        assert.ok(Math.abs(r.x-.1)<1e-9&&Math.abs(r.y-.1)<1e-9&&Math.abs(r.width-.4)<1e-9&&Math.abs(r.height-.4)<1e-9);
        $('comment-editor').close();
    }
});
