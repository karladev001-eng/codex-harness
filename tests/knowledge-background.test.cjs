const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {background:rawBackground,start:rawStart,classify,execute,destination,save,plist,cliArgs,TOTAL_TIMEOUT}=require('../knowledge/background.cjs');
const completeSync={ok:true,results:[],pending:0,failed:0};
const inject=deps=>({...deps,run:async(binary,args,options)=>args.includes('sync-all')?{output:Buffer.from(JSON.stringify(completeSync))}:deps.run(binary,args,options)});
const background=(options,deps)=>rawBackground(options,inject(deps));
const start=(args,deps)=>rawStart(args,inject(deps));
const fresh=(rows=[],published=[])=>({freshness:{state:'current'},results:rows,publish:{results:published}});
async function fixture(t) {const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'background-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('classifies JSON completion, failed/offline/pending and busy without copying secrets',()=>{
  const row={capture_id:'a',state:'pending'};
  for(const state of ['sent','reused'])assert.equal(classify(fresh([row],[{capture_id:'a',state}])).state,'ok');
  assert.equal(classify(fresh()).reason,'unchanged');
  assert.equal(classify(fresh([row],[])).state,'publish_pending');
  assert.equal(classify(fresh([], [{capture_id:'a',state:'pending',reason:'SECRET'}])).reason,'publish_pending');
  assert.equal(classify(fresh([{capture_id:'a',state:'failed',reason:'SECRET'}])).reason,'generation_failed');
  assert.equal(classify({...fresh(),freshness:{state:'offline',reason:'SECRET'}}).state,'offline');
  assert.equal(classify({...fresh(),state:'busy'}).reason,'busy');
  assert.equal(classify({...fresh(),publish:{state:'busy'}}).reason,'busy');
  assert.equal(classify({...fresh([row]),publish:{state:'busy'}}).reason,'publish_pending');
  assert.equal(classify({...fresh(),reason:'SECRET'}).state,'failed');
  for(const value of [null,{},[],{...fresh(),results:[{state:'unexpected',capture_id:'a'}]}])assert.equal(classify(value).reason,'invalid_result');
  assert(!JSON.stringify(classify(fresh([{capture_id:'SECRET',state:'failed',reason:'SECRET'}]))).includes('SECRET'));
});
test('background uses fixed CLI arguments and saves only latest sanitized result; notifications retain primary failure',async t=>{
  const state=await fixture(t);let notified=0;
  const runner=async(binary,args,options)=>{assert.equal(binary,process.execPath);assert.deepEqual(args,cliArgs({state,codex:'/absolute/codex'}));assert(options.timeout>0&&options.timeout<=TOTAL_TIMEOUT);return {output:Buffer.from(JSON.stringify(fresh([{capture_id:'SECRET',state:'failed',reason:'SECRET'}])))};};
  const result=await background({state,codex:'/absolute/codex'},{run:runner,notification:async()=>{notified++;throw Error('SECRET');}});
  assert.equal(notified,1);assert.equal(result.exitCode,1);assert.equal(result.record.notification,'failed');assert.equal(result.record.reason,'generation_failed');
  const file=path.join(state,'background','last-run.json');assert(!String(await fs.readFile(file)).includes('SECRET'));assert.equal((await fs.stat(file)).mode&0o777,0o600);
  await background({state,codex:'/absolute/codex'},{run:async()=>({output:Buffer.from(JSON.stringify(fresh()))}),notification:async()=>{throw Error('should not notify');}});
  assert.equal(JSON.parse(await fs.readFile(file)).state,'skipped');assert.deepEqual((await fs.readdir(path.dirname(file))).sort(),['episodes.json','last-run.json']);
});
test('nonzero, invalid JSON and timeout outcomes notify as failures',async t=>{
  const state=await fixture(t);
  for(const response of [{reason:'cli_failed'},{reason:'timeout'},{output:Buffer.from('SECRET invalid json')}]) {
    let notified=false;const result=await background({state,codex:'/codex'},{run:async()=>response,notification:async()=>{notified=true;return 'sent';}});
    assert.equal(result.exitCode,1);assert(notified);assert.equal(result.record.notification,'sent');assert(!JSON.stringify(result).includes('SECRET'));
  }
});
test('state rejects directory/file symlinks, hardlinks and unsafe directory permissions',async t=>{
  const state=await fixture(t),other=await fixture(t);await fs.mkdir(path.join(state,'background'));await fs.symlink(other,path.join(state,'background','last-run.json'));
  await assert.rejects(destination(state),/UNSAFE_BACKGROUND_STATE/);await fs.unlink(path.join(state,'background','last-run.json'));
  await fs.writeFile(path.join(other,'foreign'),'keep');await fs.link(path.join(other,'foreign'),path.join(state,'background','last-run.json'));
  await assert.rejects(destination(state),/UNSAFE_BACKGROUND_STATE/);await fs.unlink(path.join(state,'background','last-run.json'));
  const file=await destination(state);await fs.symlink(path.join(other,'foreign'),file);await assert.rejects(save(file,{state:'ok'}),/UNSAFE_BACKGROUND_STATE/);assert.equal(await fs.readFile(path.join(other,'foreign'),'utf8'),'keep');
  await fs.rm(path.join(state,'background'),{recursive:true});await fs.symlink(other,path.join(state,'background'));await assert.rejects(destination(state),/UNSAFE_BACKGROUND_STATE/);
  await fs.unlink(path.join(state,'background'));await fs.mkdir(path.join(state,'background'));await fs.chmod(path.join(state,'background'),0o777);await assert.rejects(destination(state),/UNSAFE_BACKGROUND_STATE/);
});
test('execution suppresses stderr, rejects failures/oversize and terminates on deadline',async()=>{
  const ok=await execute(process.execPath,['-e','process.stderr.write("SECRET");process.stdout.write("{}")']);assert.equal(ok.output.toString(),'{}');
  assert.equal((await execute(process.execPath,['-e','process.exit(2)'])).reason,'cli_failed');
  const start=Date.now();assert.equal((await execute(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:30})).reason,'timeout');assert(Date.now()-start<2500);
  assert.equal((await execute(process.execPath,['-e','process.stdout.write("x".repeat(10000));setInterval(()=>{},1000)'],{max:50})).reason,'output_limit');
  assert.equal((await execute('/missing-background-binary',[])).reason,'cli_unavailable');
});
test('plist has fixed hourly background policy and safely escaped absolute executable paths',()=>{
  const xml=plist({node:'/node',runner:'/a&b/background.cjs',state:'/state',codex:'/codex'});
  assert(xml.includes('/a&amp;b/background.cjs'));assert(xml.includes('<integer>3600</integer>'));assert(xml.includes('<key>RunAtLoad</key><false/>'));assert(xml.includes('<string>Background</string>'));assert.equal((xml.match(/<string>\/dev\/null<\/string>/g)||[]).length,3);
  assert.throws(()=>plist({node:'relative',runner:'/runner',state:'/state',codex:'/codex'}));
});
test('deadline invokes CLI cancellation to stop separately grouped provider descendants',async t=>{
  const root=await fixture(t),pidFile=path.join(root,'pid'),script=path.join(root,'fake-cli.cjs');
  await fs.writeFile(script,`const {run,installCancellation}=require(${JSON.stringify(path.resolve(__dirname,'../knowledge/process.cjs'))});installCancellation();run(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`)}],{timeout:30000}).catch(()=>{});`);
  const result=await execute(process.execPath,[script],{timeout:500});assert.equal(result.reason,'timeout');
  const pid=Number(await fs.readFile(pidFile,'utf8'));assert(pid>0);
  // The parent's cancellation kills the descendant; allow its OS exit to settle.
  for(let attempt=0;attempt<30;attempt++){try{process.kill(pid,0);}catch(e){assert.equal(e.code,'ESRCH');return;}await new Promise(resolve=>setTimeout(resolve,20));}
  assert.fail('provider descendant remained alive');
});

test('startup/state-write failure attempts one fixed notification without unsafe fallback or duplicate notification',async t=>{
  const state=await fixture(t),outside=await fixture(t),file=path.join(state,'background','last-run.json');
  let notices=[];const notification=async kind=>{notices.push(kind);return 'sent';};
  assert.equal((await start(['--bad'],{notification})).exitCode,1);assert.deepEqual(notices,['startup']);
  notices=[];await fs.symlink(outside,path.join(state,'background'));
  assert.equal((await start(['--state',state,'--codex','/codex'],{notification,run:async()=>assert.fail('unsafe state ran CLI')})).exitCode,1);
  assert.deepEqual(notices,['startup']);assert.deepEqual(await fs.readdir(outside),[]);
  await fs.unlink(path.join(state,'background'));notices=[];
  const result=await start(['--state',state,'--codex','/codex'],{notification,run:async()=>{await fs.symlink(path.join(outside,'never-created'),file);return {output:Buffer.from(JSON.stringify(fresh()))};}});
  assert.equal(result.exitCode,1);assert.deepEqual(notices,['startup']);assert.deepEqual(await fs.readdir(outside),[]);
  await fs.unlink(file);notices=[];
  const second=await start(['--state',state,'--codex','/codex'],{run:async()=>({reason:'cli_failed'}),notification:async kind=>{notices.push(kind);await fs.unlink(file);await fs.symlink(path.join(outside,'never-created'),file);throw Error('notification failure');}});
  assert.equal(second.exitCode,1);assert.equal(notices.length,1);assert.deepEqual(await fs.readdir(outside),[]);
});

const targetA='a'.repeat(64),targetB='b'.repeat(64);
const syncResult=(rows,pending=rows.filter(row=>!['sent','unchanged'].includes(row.state)).length,failed=rows.filter(row=>['pending','conflict'].includes(row.state)).length)=>({ok:pending===0&&failed===0,results:rows,pending,failed});
function job(analysis,sync=completeSync,extra={}) {return {run:async(binary,args)=>({output:Buffer.from(JSON.stringify(args.includes('sync-all')?sync:analysis)),...(args.includes('sync-all')&&!sync.ok?{reason:'cli_failed',code:2}:{})}),...extra};}
async function episodeState(state){return JSON.parse(await fs.readFile(path.join(state,'background/episodes.json'),'utf8'));}
test('registered preferences retry runs after analysis startup and generation failures and parses exit 2 JSON',async t=>{
  const state=await fixture(t),calls=[];let notices=0;
  const pending=syncResult([{target_id:targetA,state:'pending',reason:'authentication'}]);
  const deps={run:async(binary,args,options)=>{calls.push(args);if(!args.includes('sync-all'))return {reason:'cli_failed'};assert.equal(args.at(-1),os.homedir());assert(options.timeout>0&&options.timeout<=TOTAL_TIMEOUT);return {reason:'cli_failed',code:2,output:Buffer.from(JSON.stringify(pending))};},notification:async()=>{notices++;return 'sent';}};
  const result=await rawBackground({state,codex:'/codex'},deps);
  assert.equal(calls.length,2);assert.equal(result.exitCode,1);assert.equal(result.record.sync.pending,1);assert.equal(result.record.sync.results[0].reason,'authentication');assert.equal(notices,1);
  const next=await rawBackground({state,codex:'/codex'},job(fresh([{capture_id:'id',state:'failed',reason:'SECRET_BODY'}]),completeSync,{notification:async()=> 'sent'}));
  assert.equal(next.record.sync.ok,true);assert.equal(next.exitCode,1);assert(!JSON.stringify(await episodeState(state)).includes('SECRET_BODY'));
});
test('episodes suppress repeated failure, distinguish causes and targets, and recover only successful targets',async t=>{
  const state=await fixture(t);let notices=0;const notification=async()=>{notices++;return 'sent';};
  const run=sync=>rawBackground({state,codex:'/codex'},job(fresh(),sync,{notification}));
  const failed=(id=targetA,reason='authentication')=>syncResult([{target_id:id,state:'pending',reason}]);
  await run(failed());const second=await run(failed());assert.equal(second.exitCode,1);assert.equal(second.record.notification,'suppressed');assert.equal(notices,1);
  let entries=Object.values((await episodeState(state)).episodes);assert.equal(entries[0].suppressed,1);assert(entries[0].first_at<=entries[0].last_at);
  await run(failed(targetA,'unavailable'));assert.equal(notices,2);
  await run(failed(targetB));assert.equal(notices,3);
  // One target succeeds; another remains busy. Only A is recovered.
  await run(syncResult([{target_id:targetA,state:'sent'},{target_id:targetB,state:'busy',reason:'busy'}]));
  entries=Object.values((await episodeState(state)).episodes);assert.equal(entries.length,1);assert.equal(entries[0].target_id,targetB);
  await run(failed(targetB));assert.equal(notices,3);
  await run(failed());assert.equal(notices,4);
});
test('busy, skipped and partial generation never recover an earlier generation failure',async t=>{
  const state=await fixture(t);let notices=0;const notification=async()=>{notices++;return 'sent';};
  const failed=fresh([{capture_id:'one',state:'failed',reason:'PROCESS_TIMEOUT'}]);
  const run=analysis=>rawBackground({state,codex:'/codex'},job(analysis,completeSync,{notification}));
  await run(failed);await run({...fresh(),state:'busy'});await run(fresh());
  await run(fresh([{capture_id:'one',state:'pending'},{capture_id:'two',state:'failed',reason:'PROCESS_TIMEOUT'}],[{capture_id:'one',state:'sent'}]));
  await run(failed);assert.equal(notices,1);
  await run(fresh([{capture_id:'one',state:'pending'}],[{capture_id:'one',state:'sent'}]));
  await run(failed);assert.equal(notices,2);
});
test('read stages and normalized causes have separate episodes and successful read recovers them',async t=>{
  const state=await fixture(t);let notices=0;const notification=async()=>{notices++;return 'sent';};
  const run=(reason,stage='fetch')=>rawBackground({state,codex:'/codex'},job({...fresh(),freshness:{state:'offline',stage,reason}},completeSync,{notification}));
  await run('PROCESS_AUTHENTICATION');await run('PROCESS_AUTHENTICATION');assert.equal(notices,1);
  await run('PROCESS_NETWORK');assert.equal(notices,2);await run('KB_SCHEMA_CONFLICT','validation');assert.equal(notices,3);
  const bytes=JSON.stringify(await episodeState(state));assert(bytes.includes('read_fetch'));assert(bytes.includes('read_validation'));
  await rawBackground({state,codex:'/codex'},job(fresh(),completeSync,{notification}));
  await run('PROCESS_AUTHENTICATION');assert.equal(notices,4);
});
test('notification failure is reserved durably and retries at most once per 24 hours',async t=>{
  const state=await fixture(t);let time=Date.parse('2026-10-25T00:00:00Z'),notices=0;
  const deps=()=>job(fresh([{capture_id:'id',state:'failed'}]),completeSync,{now:()=>time,notification:async()=>{notices++;return 'failed';}});
  await rawBackground({state,codex:'/codex'},deps());time+=86399999;await rawBackground({state,codex:'/codex'},deps());assert.equal(notices,1);
  time++;await rawBackground({state,codex:'/codex'},deps());assert.equal(notices,2);time++;await rawBackground({state,codex:'/codex'},deps());assert.equal(notices,2);
  assert.equal(Object.values((await episodeState(state)).episodes)[0].notification,'failed');
});
test('simultaneous jobs reserve one notification while retaining both primary failures',async t=>{
  const state=await fixture(t);let notices=0,release,entered;
  const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const notification=async()=>{notices++;entered();await gate;return 'sent';};
  const deps=()=>job(fresh([{capture_id:'id',state:'failed'}]),completeSync,{notification});
  const first=rawBackground({state,codex:'/codex'},deps());await waiting;
  const second=await rawBackground({state,codex:'/codex'},deps());assert.equal(second.exitCode,1);assert.equal(second.record.notification,'suppressed');assert.equal(notices,1);
  release();assert.equal((await first).exitCode,1);await rawBackground({state,codex:'/codex'},deps());assert.equal(notices,1);
});
test('unsafe episode state uses fixed startup failure and leaves external files intact',async t=>{
  const state=await fixture(t),outside=await fixture(t);await destination(state);const foreign=path.join(outside,'foreign');await fs.writeFile(foreign,'KEEP');await fs.symlink(foreign,path.join(state,'background/episodes.json'));
  const notices=[];const result=await rawStart(['--state',state,'--codex','/codex'],job(fresh(),completeSync,{notification:async kind=>{notices.push(kind);return 'sent';}}));
  assert.equal(result.exitCode,1);assert.deepEqual(notices,['startup']);assert.equal(await fs.readFile(foreign,'utf8'),'KEEP');
});
test('unknown errors, forged targets and raw child output never enter notification state',async t=>{
  const state=await fixture(t);const secret='SECRET_TOKEN';
  const value=syncResult([{target_id:targetA,state:'pending',reason:secret}]);
  let result=await rawBackground({state,codex:'/codex'},job(fresh(),value,{notification:async()=> 'sent'}));assert.equal(result.record.sync.results[0].reason,'local_save_or_transport_failure');
  result=await rawBackground({state,codex:'/codex'},job(fresh(),syncResult([{target_id:secret,state:'pending',reason:secret}]),{notification:async()=> 'sent'}));assert.equal(result.record.sync.reason,'invalid_result');
  assert(!JSON.stringify(await episodeState(state)).includes(secret));
});
test('successful unchanged CLI execution recovers CLI failures while busy keeps the failure episode',async t=>{
  const state=await fixture(t);let notices=0;const notification=async()=>{notices++;return 'sent';};
  const fail=()=>rawBackground({state,codex:'/codex'},{run:async(binary,args)=>args.includes('sync-all')?{output:Buffer.from(JSON.stringify(completeSync))}:{reason:'cli_unavailable'},notification});
  await fail();await rawBackground({state,codex:'/codex'},job({...fresh(),state:'busy'},completeSync,{notification}));await fail();assert.equal(notices,1);
  await rawBackground({state,codex:'/codex'},job(fresh(),completeSync,{notification}));await fail();assert.equal(notices,2);
});
test('overall sync_pending status cannot report successful analysis as successful job completion',async t=>{
  const state=await fixture(t),sync=syncResult([{target_id:targetA,state:'skipped',reason:'policy_disabled'}]);
  const result=await rawBackground({state,codex:'/codex'},job(fresh(),sync,{notification:async()=>assert.fail('skipped target should not notify')}));
  assert.equal(result.exitCode,1);assert.equal(result.record.state,'sync_pending');assert.equal(result.record.reason,'preferences_sync_pending');assert.equal(result.record.analysis.state,'skipped');assert.equal(result.record.sync.pending,1);
});
