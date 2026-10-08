const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {background,start,classify,execute,destination,save,plist,cliArgs,TOTAL_TIMEOUT}=require('../knowledge/background.cjs');
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
  const runner=async(binary,args,options)=>{assert.equal(binary,process.execPath);assert.deepEqual(args,cliArgs({state,codex:'/absolute/codex'}));assert.equal(options.timeout,TOTAL_TIMEOUT);return {output:Buffer.from(JSON.stringify(fresh([{capture_id:'SECRET',state:'failed',reason:'SECRET'}])))};};
  const result=await background({state,codex:'/absolute/codex'},{run:runner,notification:async()=>{notified++;throw Error('SECRET');}});
  assert.equal(notified,1);assert.equal(result.exitCode,1);assert.equal(result.record.notification,'failed');assert.equal(result.record.reason,'generation_failed');
  const file=path.join(state,'background','last-run.json');assert(!String(await fs.readFile(file)).includes('SECRET'));assert.equal((await fs.stat(file)).mode&0o777,0o600);
  await background({state,codex:'/absolute/codex'},{run:async()=>({output:Buffer.from(JSON.stringify(fresh()))}),notification:async()=>{throw Error('should not notify');}});
  assert.equal(JSON.parse(await fs.readFile(file)).state,'skipped');assert.deepEqual(await fs.readdir(path.dirname(file)),['last-run.json']);
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
