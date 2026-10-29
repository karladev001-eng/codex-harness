const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const {Store,atomic,read,json,sha,filesFor}=require('../knowledge/core.cjs');
const {gitBlobSha}=require('../knowledge/github.cjs');
const {pull,snapshot,libraryLock,destination,run}=require('../knowledge/reader.cjs');
const {analyze,publish,CodexProvider,inputs,analysisState,validateAnalysis}=require('../knowledge/analysis.cjs');
const {hooks,hookCommand}=require('../knowledge/hooks.cjs');
const {search}=require('../knowledge/search.cjs');
function input(url='https://example.com/a') {return {schema_version:1,operation_id:crypto.randomUUID(),captured_at:'2026-10-05T00:00:00.000Z',source:{url,title:'Design sample',kind:'page',details:{},limitations:['表示範囲のみ']},content:{text:'A bright blue card design with rounded corners',headings:[],selection:''},note:'私の好きなカード',tags:['design'],screenshot:'data:image/jpeg;base64,/9j/2Q=='};}
function git(cwd,args) {const r=spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});if(r.status!==0)throw Error('fixture git failed: '+r.stderr);return r.stdout.trim();}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-reader-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new Store(path.join(root,'state')),config={schema_version:1,repo:'me/knowledge',branch:'main',library_id:crypto.randomUUID(),gh_path:process.execPath,extension_id:'a'.repeat(32)};
  await atomic(path.join(store.root,'config.json'),config);const remote=path.join(root,'remote');await fs.mkdir(remote);git(remote,['init','-b','main']);git(remote,['config','user.name','Fixture']);git(remote,['config','user.email','fixture@example.invalid']);
  const capture=input(),op={input:capture,digest:sha(JSON.stringify(capture))},bundle=filesFor(op);
  const files={...bundle.files,'kb.json':json({schema_version:1,library_id:config.library_id,format:'codex-knowledge-capture'}),'schemas/capture-v1.json':json(require('../knowledge/schemas/capture-v1.json'))};
  for(const [name,bytes]of Object.entries(files)){await fs.mkdir(path.dirname(path.join(remote,name)),{recursive:true});await fs.writeFile(path.join(remote,name),bytes);}
  git(remote,['add','.']);git(remote,['commit','-m','fixture']);return {root,store,config,remote,capture,bundle,files};
}
async function fetched(t){const f=await fixture(t);const result=await pull(f.store,{remote:f.remote,force:true});assert.equal(result.state,'current',JSON.stringify(result));return f;}
const textResult={summary:'青い角丸カードの参考資料',use_cases:['カードUIを制作するとき'],topics:['blue','rounded corners'],evidence:['本文のbright blue card'],limitations:['表示範囲の保存のみ']};
const imageResult={appearance:'青いカードの画像',evidence:['添付画像内の青色'],limitations:['画像に写る範囲のみ']};
function provider(){return {model:'fixture-model',calls:[],async generate(kind,data){this.calls.push({kind,data});return structuredClone(kind==='text'?textResult:imageResult);}};}
class FakeGh {
  constructor(files){this.head='head0';this.trees={tree0:{}};this.commits={head0:{tree:{sha:'tree0'}}};this.blobs={};this.calls=[];this.counter=0;for(const [name,value]of Object.entries(files)){const hash=gitBlobSha(value);this.trees.tree0[name]=hash;this.blobs[hash]=Buffer.from(value).toString('base64');}}
  current(){return this.trees[this.commits[this.head].tree.sha];}
  async api(endpoint,method='GET',body){
    this.calls.push({endpoint,method,body});
    if(endpoint==='repos/me/knowledge')return {private:true};
    if(endpoint.includes('/git/ref/heads/'))return{object:{sha:this.head}};
    let match=endpoint.match(/\/git\/commits\/([^/?]+)$/);if(match)return this.commits[match[1]];
    match=endpoint.match(/\/git\/trees\/([^/?]+)\?recursive=1/);if(match)return {truncated:false,tree:Object.entries(this.trees[match[1]]).map(([path,sha])=>({path,sha,type:'blob',mode:'100644'}))};
    match=endpoint.match(/\/git\/blobs\/([^/?]+)$/);if(match)return{encoding:'base64',content:this.blobs[match[1]]};
    if(endpoint.endsWith('/git/blobs')&&method==='POST'){const hash=gitBlobSha(Buffer.from(body.content,'base64'));this.blobs[hash]=body.content;return{sha:hash};}
    if(endpoint.endsWith('/git/trees')&&method==='POST'){const hash='tree'+ ++this.counter;this.trees[hash]={...this.trees[body.base_tree]};for(const entry of body.tree)this.trees[hash][entry.path]=entry.sha;return{sha:hash};}
    if(endpoint.endsWith('/git/commits')&&method==='POST'){const hash='head'+ ++this.counter;this.commits[hash]={tree:{sha:body.tree},parents:body.parents};return{sha:hash};}
    if(endpoint.includes('/git/refs/heads/')&&method==='PATCH'){assert.equal(body.force,false);if(this.conflict){this.conflict=false;const tree={...this.current(),'other-pc.md':gitBlobSha('other')};this.trees.race=tree;this.commits.race={tree:{sha:'race'}};this.head='race';throw Error('conflict');}assert.equal(this.commits[body.sha].parents[0],this.head);this.head=body.sha;if(this.lose){this.lose=false;throw Error('lost');}return{};}
    throw Error('unsupported fixture endpoint');
  }
}
test('bare reference fetch updates changed/deleted captures, preserves working checkout/pending and old snapshot on failure',async t=>{
  const f=await fetched(t),before=await snapshot(f.store,f.config);assert.equal(before.captures.length,1);assert.deepEqual(before.analysis_pending,[f.capture.operation_id]);
  const pending=await f.store.stage(input('https://example.com/pending'));const pendingBytes=await fs.readFile(f.store.file(pending.input.operation_id));
  const note=Object.keys(f.files).find(name=>name.endsWith('/note.md'));await fs.writeFile(path.join(f.remote,note),'changed note');git(f.remote,['add','.']);git(f.remote,['commit','-m','change']);
  assert.equal((await pull(f.store,{remote:f.remote,force:true})).state,'current');assert.equal((await snapshot(f.store,f.config)).captures[0].note,'changed note');assert.deepEqual(await fs.readFile(f.store.file(pending.input.operation_id)),pendingBytes);
  const valid=await fs.readFile(path.join(f.store.root,'read/snapshot.json'));assert.equal((await pull(f.store,{remote:path.join(f.root,'missing'),force:true})).state,'offline');assert.deepEqual(await fs.readFile(path.join(f.store.root,'read/snapshot.json')),valid);
  assert.equal((await pull(f.store,{remote:f.remote})).state,'throttled');
  await fs.rm(path.join(f.remote,f.bundle.base,'captures',f.capture.operation_id),{recursive:true});git(f.remote,['add','-A']);git(f.remote,['commit','-m','delete']);assert.equal((await pull(f.store,{remote:f.remote,force:true})).captures,0);
});
test('isolated fetch ignores abandoned Git config/lock and rejects schema; inherited Git execution is disabled',async t=>{
  const f=await fetched(t);const snapshotFile=path.join(f.store.root,'read/snapshot.json'),valid=await fs.readFile(snapshotFile);
  const planted=path.join(f.root,'executed');const previous=process.env.GIT_CONFIG_PARAMETERS;process.env.GIT_CONFIG_PARAMETERS="'core.hooksPath'='"+f.root+"'";
  try {assert.equal((await pull(f.store,{remote:f.remote,force:true})).state,'current');}finally{if(previous===undefined)delete process.env.GIT_CONFIG_PARAMETERS;else process.env.GIT_CONFIG_PARAMETERS=previous;}
  const cache=path.join(f.store.root,'read','legacy.git');await fs.mkdir(cache);await fs.writeFile(path.join(cache,'config'),'[core]\n');await fs.writeFile(path.join(cache,'shallow.lock'),'unknown lock');
  await fs.appendFile(path.join(cache,'config'),`[credential]\n\thelper = !touch ${planted}\n`);assert.equal((await pull(f.store,{remote:f.remote,force:true})).state,'current');assert.equal(await fs.readFile(path.join(cache,'shallow.lock'),'utf8'),'unknown lock');await assert.rejects(()=>fs.stat(planted),{code:'ENOENT'});
  const preserved=await fs.readFile(snapshotFile);assert.equal(JSON.parse(preserved).commit,JSON.parse(valid).commit);
  await fs.rm(cache,{recursive:true});await fs.writeFile(path.join(f.remote,'kb.json'),json({schema_version:99,library_id:f.config.library_id,format:'codex-knowledge-capture'}));git(f.remote,['add','.']);git(f.remote,['commit','-m','bad schema']);assert.equal((await pull(f.store,{remote:f.remote,force:true})).reason,'KB_SCHEMA_CONFLICT');assert.deepEqual(await fs.readFile(snapshotFile),preserved);
});
test('shared library lock excludes concurrent operations and recovers killed holder under competing claims',async t=>{
  const f=await fixture(t);const module=path.resolve('knowledge/reader.cjs');
  const child=spawn(process.execPath,['-e',`const {libraryLock}=require(${JSON.stringify(module)});libraryLock(JSON.parse(process.argv[1]),async()=>{process.stdout.write('locked\\n');await new Promise(()=>{});});setInterval(()=>{},1000);`,JSON.stringify(f.config)],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
  assert.equal((await libraryLock(f.config,async()=>({entered:true}))).state,'busy');child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));
  // Hold the winner until all seven contenders have observed contention;
  // a scheduling delay must not turn valid sequential acquisition into failure.
  const entries=[];let release,busy=0,timedOut=false;const held=new Promise(resolve=>release=resolve);
  const watchdog=setTimeout(()=>{timedOut=true;release();},3000);t.after(()=>clearTimeout(watchdog));
  const outcomes=await Promise.all(Array.from({length:8},async()=>{const outcome=await libraryLock(f.config,async()=>{entries.push('enter');await held;entries.push('exit');return {entered:true};});if(outcome.state==='busy'&&++busy===7)release();return outcome;}));
  clearTimeout(watchdog);assert.equal(timedOut,false,'contenders did not observe the held winner');
  assert.equal(outcomes.filter(row=>row.entered).length,1);assert.deepEqual(entries,['enter','exit']);assert.equal((await libraryLock(f.config,async()=>({entered:true}))).entered,true);
});
test('hook install/status/remove preserve ORCA/trust, are idempotent, reject broken/conflicting definitions and quote safe paths',async t=>{
  const f=await fixture(t);const file=path.join(f.root,'hooks.json');const orca={matcher:'startup',hooks:[{type:'command',command:'orca test',timeout:3}]};const original={trusted_hash:'do-not-touch',other:{kept:true},hooks:{SessionStart:[orca],PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'orca pre'}]}]}};await atomic(file,original);
  assert.equal((await hooks(f.store,{action:'install',file})).installed,true);assert.equal((await hooks(f.store,{action:'install',file})).installed,true);let installed=await read(file);assert.equal(installed.hooks.SessionStart.length,2);assert.deepEqual(installed.hooks.SessionStart[0],orca);assert.equal(installed.trusted_hash,'do-not-touch');assert.equal((await hooks(f.store,{action:'status',file})).installed,true);
  assert.equal((await hooks(f.store,{action:'remove',file})).installed,false);assert.deepEqual((await read(file)).hooks.PreToolUse,original.hooks.PreToolUse);assert.deepEqual((await read(file)).hooks.SessionStart,[orca]);
  await fs.writeFile(file,'{broken');await assert.rejects(()=>hooks(f.store,{action:'install',file}),/INVALID_HOOKS/);assert.equal(await fs.readFile(file,'utf8'),'{broken');
  assert.match(hookCommand(new Store("/tmp/it has ' quotes"),{node:'/tmp/node path',platform:'darwin'}),/'\\''/);
  assert.match(hookCommand({root:'C:\\State Folder'},{node:'C:\\Node\\node.exe',cli:'C:\\Tools\\cli.cjs',platform:'win32'}),/--state "C:\\State Folder"/);
  assert.throws(()=>hookCommand({root:'C:\\Bad%Folder'},{node:'C:\\node.exe',cli:'C:\\cli.cjs',platform:'win32'}),/UNSAFE/);
});
test('delta analysis separates text/image, reuses generated partial component after failure, and never changes source/note',async t=>{
  const f=await fetched(t),p=provider();const source=await fs.readFile(path.join(f.remote,f.bundle.base,'captures',f.capture.operation_id,'note.md'));
  assert.equal((await analyze(f.store,{provider:p})).results[0].state,'pending');assert.deepEqual(p.calls.map(row=>row.kind),['text','image']);assert.deepEqual((await analyze(f.store,{provider:p})).results,[]);
  const note=Object.keys(f.files).find(name=>name.endsWith('/note.md'));await fs.writeFile(path.join(f.remote,note),'new note only');git(f.remote,['add','.']);git(f.remote,['commit','-m','note']);await pull(f.store,{remote:f.remote,force:true});await analyze(f.store,{provider:p});assert.deepEqual(p.calls.map(row=>row.kind),['text','image','text']);
  const saved=await snapshot(f.store,f.config);const row=saved.captures[0];const state=await read(path.join(f.store.root,'analysis',f.capture.operation_id+'.json'));assert.equal(analysisState(row,state.analysis),'current');assert.equal(state.analysis.image.input_hash,inputs(row).image);assert.equal(state.analysis.text.result.summary,textResult.summary);assert.notDeepEqual(await fs.readFile(path.join(f.remote,note)),source);
  const partialRoot=path.join(f.root,'partial');const partial=new Store(partialRoot);await atomic(path.join(partialRoot,'config.json'),f.config);await atomic(path.join(partialRoot,'read/snapshot.json'),saved);
  const failing=provider();failing.generate=async function(kind,data){this.calls.push({kind,data});if(kind==='image')throw Error('bad provider user source');return structuredClone(textResult);};assert.equal((await analyze(partial,{provider:failing})).results[0].state,'failed');const retry=provider();await analyze(partial,{provider:retry});assert.deepEqual(retry.calls.map(row=>row.kind),['image']);
});
test('publish only analysis.json with nonforce CAS, preserves capture receipts, confirms response loss and retains source/conflict failures',async t=>{
  const f=await fetched(t);await analyze(f.store,{provider:provider()});const gh=new FakeGh(f.files);const before={...gh.current()};gh.conflict=true;gh.lose=true;assert.equal((await publish(f.store,{},gh)).results[0].state,'sent');assert.ok(gh.current()['other-pc.md']);
  for(const [name,hash]of Object.entries(before))assert.equal(gh.current()[name],hash);assert.equal(gh.calls.filter(row=>row.method==='POST'&&row.endpoint.endsWith('/git/trees')).every(row=>row.body.tree.length===1&&row.body.tree[0].path.endsWith('/analysis.json')),true);assert.deepEqual((await publish(f.store,{},gh)).results,[]);
  const stateFile=path.join(f.store.root,'analysis',f.capture.operation_id+'.json'),state=await read(stateFile);state.state='pending';await atomic(stateFile,state);gh.current()[Object.keys(f.files).find(name=>name.endsWith('/note.md'))]=gitBlobSha('changed');assert.equal((await publish(f.store,{},gh)).results[0].reason,'REMOTE_CAPTURE_CHANGED');assert.equal((await read(stateFile)).state,'pending');
});
test('remote generated analysis is reused by a second PC; lexical cards include ungenerated rows and bounded scope',async t=>{
  const f=await fetched(t);await analyze(f.store,{provider:provider()});const state=await read(path.join(f.store.root,'analysis',f.capture.operation_id+'.json'));const analysisFile=path.join(f.remote,f.bundle.base,'captures',f.capture.operation_id,'analysis.json');await atomic(analysisFile,state.analysis);git(f.remote,['add','.']);git(f.remote,['commit','-m','analysis']);
  const second=new Store(path.join(f.root,'second'));await atomic(path.join(second.root,'config.json'),f.config);await pull(second,{remote:f.remote,force:true});const p=provider();assert.deepEqual((await analyze(second,{provider:p})).results,[]);assert.equal(p.calls.length,0);
  const found=await search(second,{query:'blue',freshness:false});assert.equal(found.mode,'lexical');assert.equal(found.vector_search,false);assert.equal(found.results[0].analysis_state,'current');assert.ok(JSON.stringify(found).length<6000);assert.equal(found.results[0].summary,textResult.summary);
  const first=await search(f.store,{query:'rounded',freshness:false});assert.equal(first.results.length,1);
});
test('Codex adapter isolates cwd, sends source via stdin, disables hooks/tools, validates schema and suppresses raw output on invalid result',async t=>{
  if(process.platform==='win32')return t.skip('executable fixture uses POSIX shebang; Windows quoting is tested separately');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-provider-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const binary=path.join(root,'fake-codex'),log=path.join(root,'args.json');
  await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);let source='';process.stdin.on('data',c=>source+=c);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(log)},JSON.stringify({args,cwd:process.cwd(),source}));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(${JSON.stringify(textResult)}));process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'untrusted source text'}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n');});`,{mode:0o700});
  const p=new CodexProvider(binary,'fixture-model');assert.deepEqual(await p.generate('text',{text:{note:'private source marker'}}),textResult);const called=await read(log);assert.equal(called.args[0],'--no-daemon');assert.ok(called.args.includes('--ignore-user-config'));assert.ok(called.args.includes('features.hooks=false'));assert.ok(called.args.includes('features.shell_tool=false'));assert.ok(!called.args.join(' ').includes('private source marker'));assert.match(called.source,/private source marker/);assert.notEqual(called.cwd,path.resolve('.'));await assert.rejects(()=>fs.stat(called.cwd),{code:'ENOENT'});
  await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{broken');process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n');`,{mode:0o700});await assert.rejects(()=>p.generate('text',{text:{}}),/INVALID_PROVIDER_OUTPUT/);
});
test('quiet hook pull emits neither source data nor diagnostic output when unconfigured/invalid',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-quiet-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const command=path.resolve('knowledge/cli.cjs');for(const args of [['pull','--quiet','--state',root],['pull','--quiet','--bad','private source marker','--state',root]]){const result=spawnSync(process.execPath,[command,...args],{encoding:'utf8'});assert.equal(result.stdout,'');assert.equal(result.stderr,'');}
});
test('completed generating crash is promoted to pending and publishes without a repeated provider call',async t=>{
  const f=await fetched(t);await analyze(f.store,{provider:provider()});const file=path.join(f.store.root,'analysis',f.capture.operation_id+'.json'),state=await read(file);state.state='generating';await atomic(file,state);
  const p=provider();assert.deepEqual((await analyze(f.store,{provider:p})).results,[]);assert.equal(p.calls.length,0);assert.equal((await read(file)).state,'pending');
  state.state='generating';await atomic(file,state);assert.equal((await publish(f.store,{},new FakeGh(f.files))).results[0].state,'sent');
});
test('different libraries editing the same hooks file serialize and preserve both hook registrations',async t=>{
  const f=await fixture(t),other=new Store(path.join(f.root,'other-state'));await atomic(path.join(other.root,'config.json'),{...f.config,library_id:crypto.randomUUID()});const file=path.join(f.root,'shared-hooks.json');await atomic(file,{hooks:{UserPromptSubmit:[{hooks:[{type:'command',command:'orca'}]}]}});
  // Hold the lock owner at its first hooks-file read until the contender returns; otherwise slow Windows I/O can serialize the calls.
  const readFile=fs.readFile;let release;const gate=new Promise(resolve=>release=resolve);t.after(()=>{fs.readFile=readFile;});
  fs.readFile=async(name,...rest)=>{if(name===file){fs.readFile=readFile;await gate;}return readFile(name,...rest);};
  const pending=[hooks(f.store,{action:'install',file}),hooks(other,{action:'install',file})];Promise.race(pending).then(release,release);
  const results=await Promise.all(pending);assert.equal(results.filter(result=>result.installed).length,1);assert.equal(results.filter(result=>result.state==='busy').length,1);
  await hooks(f.store,{action:'install',file});await hooks(other,{action:'install',file});const saved=await read(file);assert.equal(saved.hooks.UserPromptSubmit.length,3);assert.equal(saved.hooks.SessionStart.length,2);assert.equal(saved.hooks.UserPromptSubmit[0].hooks[0].command,'orca');
});
test('invalid remote analysis is failed rather than ungenerated, and full valid source data fits generator budget with visible scope',async t=>{
  const f=await fetched(t);const base=path.join(f.remote,f.bundle.base,'captures',f.capture.operation_id);await fs.writeFile(path.join(base,'analysis.json'),'{broken');
  const capture=await read(path.join(base,'capture.json'));capture.source.details={description:'界'.repeat(90000),playback_seconds:42};capture.source.limitations=Array.from({length:20},(_,i)=>'limitation '+i);await atomic(path.join(base,'capture.json'),capture);await fs.writeFile(path.join(base,'content.md'),'界'.repeat(150000));git(f.remote,['add','.']);git(f.remote,['commit','-m','long malformed']);await pull(f.store,{remote:f.remote,force:true});
  assert.equal((await search(f.store,{freshness:false})).results[0].analysis_state,'failed');const p=provider();assert.equal((await analyze(f.store,{provider:p})).results[0].state,'pending');assert.ok(Buffer.byteLength(JSON.stringify(p.calls[0].data.text))<=100000);const found=await search(f.store,{freshness:false});assert.match(found.results[0].analysis_limitations[0],/切り詰め/);assert.ok(JSON.stringify(found).length<6500);assert.equal(found.results[0].scope.playback_seconds,'42');
});
test('subprocess timeout settles on deadline even when a descendant holds inherited pipes',async()=>{
  const start=Date.now();await assert.rejects(()=>run(process.execPath,['-e',"require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'inherit'});setTimeout(()=>{},10000);"],{timeout:1000}),/PROCESS_TIMEOUT/);assert.ok(Date.now()-start<2000);
});
test('full read deadline preserves previous snapshot and interrupted cache init is retried safely',async t=>{
  const f=await fetched(t),file=path.join(f.store.root,'read/snapshot.json'),valid=await fs.readFile(file);const cache=path.join(f.store.root,'read','.fetch-left-by-kill');await fs.mkdir(cache);
  const client={async init(){},async fetch(){await new Promise(resolve=>setTimeout(resolve,30));return git(f.remote,['rev-parse','HEAD']);},async invoke(){throw Error('should not read unchanged head');}};
  assert.equal((await pull(f.store,{force:true,remote:f.remote,client,timeoutTotal:5})).reason,'READ_TIMEOUT');assert.deepEqual(await fs.readFile(file),valid);
  await fs.rm(cache,{recursive:true});await fs.mkdir(cache);assert.equal((await pull(f.store,{force:true,remote:f.remote})).state,'current');
});
test('serialized source input budget includes escaped newlines quotes controls and Unicode while preserving full input hash',async t=>{
  const f=await fetched(t),base=path.join(f.remote,f.bundle.base,'captures',f.capture.operation_id);
  const rawBody=('\n"\\\u0001界😀').repeat(25000),rawNote=('\n"\\\u0001').repeat(10000);await fs.writeFile(path.join(base,'content.md'),rawBody);await fs.writeFile(path.join(base,'note.md'),rawNote);git(f.remote,['add','.']);git(f.remote,['commit','-m','escaped source']);await pull(f.store,{force:true,remote:f.remote});
  const p=provider();assert.equal((await analyze(f.store,{provider:p})).results[0].state,'pending');const actual=p.calls[0].data.text;assert.ok(Buffer.byteLength(JSON.stringify(actual))<=100000);assert.ok(Buffer.byteLength(json(actual))<=100000);assert.match(actual.generator_scope,/切り詰め/);
  const row=(await snapshot(f.store,f.config)).captures[0],state=await read(path.join(f.store.root,'analysis',f.capture.operation_id+'.json'));assert.equal(state.analysis.input_hashes.text,inputs(row).text);assert.equal(row.content,rawBody);assert.equal(row.note,rawNote);
});
test('remote symlink is rejected while legacy config symlink stays untouched',async t=>{
  if(process.platform==='win32')return t.skip('POSIX symlink fixture; Windows symlink permission differs');
  const f=await fetched(t),snapshotFile=path.join(f.store.root,'read/snapshot.json'),valid=await fs.readFile(snapshotFile);await fs.symlink('kb.json',path.join(f.remote,'remote-script'));git(f.remote,['add','.']);git(f.remote,['commit','-m','symlink']);assert.equal((await pull(f.store,{force:true,remote:f.remote})).reason,'KB_UNSAFE_TREE');assert.deepEqual(await fs.readFile(snapshotFile),valid);
  const cache=path.join(f.store.root,'read','legacy.git');await fs.mkdir(cache);const configFile=path.join(cache,'config'),bytes=Buffer.from('[credential]\nhelper=!false\n'),target=path.join(f.root,'config-target');await fs.writeFile(target,bytes);await fs.symlink(target,configFile);assert.equal((await pull(f.store,{force:true,remote:f.remote})).reason,'KB_UNSAFE_TREE');assert.deepEqual(await fs.readFile(target),bytes);assert.deepEqual(await fs.readFile(snapshotFile),valid);
});

test('retrieval preserves AND search, tags, exact IDs and bounded source positions',async t=>{
  const {readCapture}=require('../knowledge/retrieval.cjs'),{captureCard}=require('../knowledge/search.cjs');
  const f=await fetched(t),options={freshness:false,captureId:f.capture.operation_id};
  const found=await search(f.store,{query:'design rounded',limit:3,freshness:false});
  assert.equal(found.results.length,1);assert.deepEqual(found.results[0].tags,['design']);
  assert.equal((await search(f.store,{query:'design absent',freshness:false})).results.length,0);
  const hit=found.results[0].matches.find(row=>row.field==='content');assert.ok(hit);assert.equal(hit.offset_unit,'utf16');
  const portion=await readCapture(f.store,{...options,offset:hit.offset,limit:7});
  assert.equal(portion.text,f.capture.content.text.slice(hit.offset,hit.offset+7));assert.equal(portion.next_offset,hit.offset+7);
  assert.equal(portion.commit,found.commit);assert.equal(portion.url,f.capture.source.url);assert.equal(portion.blob_sha,gitBlobSha(f.capture.content.text));assert.equal(portion.field_kind,'source_text');
  const note=await readCapture(f.store,{...options,field:'note',limit:3});assert.equal(note.field_kind,'user_note');assert.equal(note.text,f.capture.note.slice(0,3));
  assert.equal((await readCapture(f.store,{...options,offset:f.capture.content.text.length})).next_offset,null);
  for(const captureId of [undefined,'', '../outside','bad']) {
    await assert.rejects(()=>captureCard(f.store,{freshness:false,captureId}),/CAPTURE_ID_REQUIRED/);
    await assert.rejects(()=>readCapture(f.store,{freshness:false,captureId}),/CAPTURE_ID_REQUIRED/);
  }
  const missing=crypto.randomUUID();assert.equal((await captureCard(f.store,{freshness:false,captureId:missing})).state,'capture_not_found');assert.equal((await readCapture(f.store,{freshness:false,captureId:missing})).capture_id,missing);
  assert.equal((await captureCard(f.store,options)).results[0].capture_id,f.capture.operation_id);
  for(const value of [{limit:16001},{offset:-1},{field:'analysis'},{offset:1.5},{offset:999999}])await assert.rejects(()=>readCapture(f.store,{...options,...value}),/INVALID_READ_ARGUMENT|READ_OFFSET/);
  const cli=path.resolve('knowledge/cli.cjs');
  for(const command of ['card','read','export-image'])for(const args of [[],['--capture','bad']]){const result=spawnSync(process.execPath,[cli,command,...args,'--state',f.store.root],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/CAPTURE_ID_REQUIRED/);assert.equal(result.stdout,'');}
});

test('read positions preserve Unicode pairs and empty fields',async t=>{
  const {readCapture}=require('../knowledge/retrieval.cjs');const f=await fetched(t),saved=await snapshot(f.store,f.config);saved.captures[0].content='A😀B';saved.captures[0].note='';await atomic(path.join(f.store.root,'read/snapshot.json'),saved);
  const options={captureId:f.capture.operation_id,freshness:false};
  const first=await readCapture(f.store,{...options,limit:2});assert.equal(first.text,'A');assert.equal(first.next_offset,1);
  const next=await readCapture(f.store,{...options,offset:1,limit:2});assert.equal(next.text,'😀');assert.equal(next.next_offset,3);
  await assert.rejects(()=>readCapture(f.store,{...options,offset:2}),/SPLITS_CHARACTER/);
  await assert.rejects(()=>readCapture(f.store,{...options,offset:1,limit:1}),/SPLITS_CHARACTER/);
  assert.equal((await readCapture(f.store,{...options,field:'note'})).text,'');
  saved.captures[0].content='İblue';await atomic(path.join(f.store.root,'read/snapshot.json'),saved);
  const unicode=await search(f.store,{query:'\u0307',freshness:false});assert.equal(unicode.results[0].matches[0].offset,0);assert.equal(unicode.results[0].matches[0].excerpt,'İblue');
});

test('JPEG export uses new private cache files, rejects symlinks and keeps source unchanged',async t=>{
  const {exportImage}=require('../knowledge/retrieval.cjs');const f=await fetched(t),options={captureId:f.capture.operation_id,freshness:false},snapshotFile=path.join(f.store.root,'read/snapshot.json'),before=await fs.readFile(snapshotFile);
  const first=await exportImage(f.store,options),second=await exportImage(f.store,options);
  assert.equal(first.state,'image_exported');assert.equal(first.inspection_required,true);assert.notEqual(first.path,second.path);assert.ok(first.path.startsWith(path.join(await fs.realpath(f.store.root),'read/image-cache')+path.sep));
  // Windows does not report POSIX permission bits (it reports 0o666), so the mode check is skipped there.
  assert.deepEqual(await fs.readFile(first.path),Buffer.from('/9j/2Q==','base64'));assert.equal(first.blob_sha,gitBlobSha(Buffer.from('/9j/2Q==','base64')));if(process.platform!=='win32')assert.equal((await fs.stat(first.path)).mode&0o777,0o600);assert.deepEqual(await fs.readFile(snapshotFile),before);
  const cache=path.join(f.store.root,'read/image-cache'),outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.rename(cache,cache+'.old');await fs.symlink(outside,cache);
  await assert.rejects(()=>exportImage(f.store,options),/UNSAFE_IMAGE_CACHE/);assert.deepEqual(await fs.readdir(outside),[]);await fs.unlink(cache);
  const saved=JSON.parse(before);saved.captures[0].image=null;await atomic(snapshotFile,saved);assert.equal((await exportImage(f.store,options)).state,'image_unavailable');
  saved.captures[0].image=Buffer.from('not JPEG').toString('base64');await atomic(snapshotFile,saved);await assert.rejects(()=>exportImage(f.store,options),/INVALID_SAVED_JPEG/);
  const cli=path.resolve('knowledge/cli.cjs'),result=spawnSync(process.execPath,[cli,'export-image','--capture',f.capture.operation_id,'--output',outside,'--state',f.store.root],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/UNKNOWN_ARGUMENT/);
});

test('installed CLI is self contained outside the source checkout',async t=>{
  const f=await fetched(t),installed=path.join(f.root,'installed-skill');await fs.cp(path.resolve('dist/skill'),installed,{recursive:true});
  const cli=path.join(installed,'knowledge/cli.cjs');const result=spawnSync(process.execPath,[cli,'status','--state',path.join(f.root,'unconfigured')],{cwd:os.tmpdir(),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).configured,false);
  // A current attempt throttles network checks, so this exercises the bundled retrieval path.
  const found=spawnSync(process.execPath,[cli,'read','--capture',f.capture.operation_id,'--limit','8','--state',f.store.root],{cwd:os.tmpdir(),encoding:'utf8'});assert.equal(found.status,0,found.stderr);assert.equal(JSON.parse(found.stdout).text,f.capture.content.text.slice(0,8));
  assert.equal((await fs.readdir(path.join(installed,'knowledge'))).includes('extension'),false);
});

test('SIGKILL during isolated fetch leaves prior snapshot and abandoned locks harmless on next pull',async t=>{
  if(process.platform==='win32')return t.skip('POSIX force-kill fixture');
  const f=await fetched(t),file=path.join(f.store.root,'read/snapshot.json'),valid=await fs.readFile(file);
  const signal=path.join(f.root,'fetch-started.json'),fake=path.join(f.root,'fake-git.cjs');
  await fs.writeFile(fake,`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');const args=process.argv.slice(2);if(args.includes('fetch')){const dir=args.find(x=>x.startsWith('--git-dir=')).slice(10);fs.writeFileSync(path.join(dir,'shallow.lock'),'abandoned');fs.writeFileSync(${JSON.stringify(signal)},JSON.stringify({pid:process.pid,dir}));setInterval(()=>{},1000);}else{const result=cp.spawnSync('git',args,{stdio:'inherit'});process.exit(result.status||0);}\n`,{mode:0o700});
  const child=spawn(process.execPath,['-e',`const {Store}=require('./knowledge/core.cjs');require('./knowledge/reader.cjs').pull(new Store(process.argv[1]),{force:true,remote:process.argv[2],git:process.argv[3]}).then(()=>process.exit());`,f.store.root,f.remote,fake],{cwd:path.resolve(__dirname,'..'),stdio:'ignore'});
  t.after(()=>child.kill('SIGKILL'));let started;
  for(let i=0;i<200;i++){try{started=JSON.parse(await fs.readFile(signal,'utf8'));break;}catch{}await new Promise(resolve=>setTimeout(resolve,10));}
  assert(started,'fixture fetch did not start');const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');process.kill(started.pid,'SIGKILL');await exited;
  assert.deepEqual(await fs.readFile(file),valid);assert.equal(await fs.readFile(path.join(started.dir,'shallow.lock'),'utf8'),'abandoned');
  assert.equal((await pull(f.store,{remote:f.remote,force:true})).state,'current');
  assert.equal(await fs.readFile(path.join(started.dir,'shallow.lock'),'utf8'),'abandoned');
  const dirs=(await fs.readdir(path.join(f.store.root,'read'))).filter(name=>name.startsWith('.fetch-'));assert.deepEqual(dirs,[path.basename(path.dirname(started.dir))]);
});
test('process failures retain only allowlisted communication/authentication reasons and reader persists stage',async t=>{
  for(const [stderr,reason]of [['fatal: Authentication failed for https://SECRET@host','PROCESS_AUTHENTICATION'],['fatal: Could not resolve host: SECRET','PROCESS_NETWORK'],['remote: HTTP 403 SECRET','PROCESS_FORBIDDEN'],['SECRET_UNRECOGNIZED_ERROR','PROCESS_FAILED']]) {
    await assert.rejects(run(process.execPath,['-e',`process.stderr.write(${JSON.stringify(stderr)});process.exit(1)`]),error=>error.message===reason&&!JSON.stringify(error).includes('SECRET'));
  }
  const f=await fetched(t),valid=await fs.readFile(path.join(f.store.root,'read/snapshot.json'));
  for(const [message,reason]of [['PROCESS_AUTHENTICATION','PROCESS_AUTHENTICATION'],['SECRET_RAW_ERROR','KNOWLEDGE_READ_FAILED'],['PROCESS_TIMEOUT','PROCESS_TIMEOUT']]) {
    const result=await pull(f.store,{force:true,remote:f.remote,client:{async init(){},async fetch(){throw Error(message);}}});assert.equal(result.stage,'fetch');assert.equal(result.reason,reason);
    assert.deepEqual(await fs.readFile(path.join(f.store.root,'read/snapshot.json')),valid);
    assert(!String(await fs.readFile(path.join(f.store.root,'read/health.json'))).includes('SECRET'));
    assert(!(await fs.readdir(path.join(f.store.root,'read'))).some(name=>name.startsWith('.fetch-')));
  }
});

test('recovery retries when a normally released lock disappears between lstat and read',async t=>{
  const f=await fixture(t),dead=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});assert.equal(dead.status,0);
  // Isolate readFile injection from all other tests and model the precise
  // normal-release race: lstat sees a real lock; its subsequent read is ENOENT.
  const script=`const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {sha,json}=require('./knowledge/core.cjs');const {libraryLock,destination}=require('./knowledge/reader.cjs');
(async()=>{const config=JSON.parse(process.argv[1]);const lock=path.join(os.tmpdir(),'codex-knowledge-'+sha(json(destination(config))).slice(0,32)+'.lock');
await fs.writeFile(lock,json({pid:Number(process.argv[2]),token:'dead-owner'}),{flag:'wx',mode:0o600});
const original=fs.readFile;let reads=0,removed=false;fs.readFile=async function(file,...args){if(file===lock&&++reads===2){await fs.unlink(lock);removed=true;}return original.call(this,file,...args);};
try{const outcome=await libraryLock(config,async()=>({entered:true}));process.stdout.write(JSON.stringify({outcome,removed}));}catch(error){process.stdout.write(JSON.stringify({error:error.message,removed}));}finally{fs.readFile=original;await fs.rm(lock,{force:true});}})();`;
  const result=JSON.parse((await run(process.execPath,['-e',script,JSON.stringify(f.config),String(dead.pid)],{cwd:path.resolve(__dirname,'..')})).toString());
  assert.deepEqual(result,{outcome:{entered:true},removed:true});
});
test('lock disappearance recovery preserves malformed and symlink locks and rejects unreadable owners',async t=>{
  const f=await fixture(t),lock=path.join(os.tmpdir(),`codex-knowledge-${sha(json(destination(f.config))).slice(0,32)}.lock`);
  t.after(()=>fs.rm(lock,{force:true}));
  for(const content of ['null','{broken',JSON.stringify({pid:-1,token:'unknown'})]) {
    await fs.writeFile(lock,content,{flag:'wx',mode:0o600});
    await assert.rejects(libraryLock(f.config,async()=>assert.fail('unsafe owner acquired')),/UNSAFE_READ_LOCK|CORRUPT_LOCAL_STATE/);
    assert.equal(await fs.readFile(lock,'utf8'),content);await fs.unlink(lock);
  }
  if(process.platform!=='win32') {
    const target=path.join(f.root,'unknown-lock');await fs.writeFile(target,'KEEP');await fs.symlink(target,lock);
    await assert.rejects(libraryLock(f.config,async()=>assert.fail('symlink acquired')),/UNSAFE_READ_LOCK/);
    assert.equal((await fs.lstat(lock)).isSymbolicLink(),true);assert.equal(await fs.readFile(target,'utf8'),'KEEP');await fs.unlink(lock);
  }
  const dead=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});assert.equal(dead.status,0);
  const content=json({pid:dead.pid,token:'fixture-owner'});await fs.writeFile(lock,content,{flag:'wx',mode:0o600});
  const script=`const fs=require('node:fs/promises'),{libraryLock}=require('./knowledge/reader.cjs');const original=fs.readFile;let count=0;
fs.readFile=async function(file,...args){if(file===process.argv[2]&&++count===2){const error=Error('fixture unreadable');error.code='EACCES';throw error;}return original.call(this,file,...args);};
libraryLock(JSON.parse(process.argv[1]),async()=>({entered:true})).then(value=>process.stdout.write(JSON.stringify(value)),error=>process.stdout.write(JSON.stringify({error:error.message})));`;
  const value=JSON.parse((await run(process.execPath,['-e',script,JSON.stringify(f.config),lock],{cwd:path.resolve(__dirname,'..')})).toString());
  assert.deepEqual(value,{error:'UNSAFE_READ_LOCK'});assert.equal(await fs.readFile(lock,'utf8'),content);
});
