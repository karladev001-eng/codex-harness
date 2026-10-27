#!/usr/bin/env node
'use strict';
// Sessionless, hourly analyze entry point. Raw child output stays in memory only.
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {libraryLock,safeError}=require('./reader.cjs');
const {spawn}=require('node:child_process');
const SAFE_PATH='/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const TOTAL_TIMEOUT=30*60*1000;
const CLI=path.join(__dirname,'cli.cjs');
function absolute(value) {
  if(typeof value!=='string'||!path.isAbsolute(value)||/[\r\n\0]/.test(value))throw Error('INVALID_BACKGROUND_PATH');
  return path.resolve(value);
}
function cliArgs({state,codex}) {
  return [CLI,'analyze','--codex',absolute(codex),'--model','gpt-6.1-sol','--limit','5','--publish','--state',absolute(state)];
}
function classify(value) {
  const base={state:'failed',reason:'invalid_result',generated:0,published:0,failed:0,pending:0,offline:false};
  if(!value||typeof value!=='object'||Array.isArray(value))return base;
  const busy=value.state==='busy';
  const rows=busy?[]:value.results, pubBusy=value.publish?.state==='busy';
  const published=pubBusy?[]:value.publish?.results;
  if(!Array.isArray(rows)||!Array.isArray(published)||!['current','offline','busy'].includes(value.freshness?.state))return base;
  if(rows.some(r=>!r||!['pending','failed'].includes(r.state)||typeof r.capture_id!=='string')||published.some(r=>!r||!['sent','reused','pending'].includes(r.state)||typeof r.capture_id!=='string'))return base;
  const completed=new Set(published.filter(r=>['sent','reused'].includes(r.state)&&!r.reason).map(r=>r.capture_id));
  base.generated=rows.filter(r=>r.state==='pending').length;
  base.published=completed.size;
  base.failed=rows.filter(r=>r.state==='failed'||r.reason).length;
  base.pending=new Set([...rows.filter(r=>r.state==='pending'&&!completed.has(r.capture_id)),...published.filter(r=>r.state==='pending'||r.reason)].map(r=>r.capture_id)).size;
  base.offline=value.freshness.state==='offline';
  if(base.failed)base.reason='generation_failed';
  else if(base.offline) {base.state='offline';base.reason='offline';}
  else if(base.pending){base.state='publish_pending';base.reason='publish_pending';}
  else if(value.reason||value.freshness.reason||value.publish.reason){base.reason='cli_reported_failure';}
  else if(busy||pubBusy||value.freshness.state==='busy'){base.state='skipped';base.reason='busy';}
  else {base.state=base.generated||base.published?'ok':'skipped';base.reason=base.state==='ok'?null:'unchanged';}
  return base;
}
// All existing directory components must be real directories, including the state root.
async function realDirectory(directory) {
  const resolved=absolute(directory);let current=path.parse(resolved).root;
  for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);const stat=await fs.lstat(current);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('UNSAFE_BACKGROUND_STATE');
  }
  return resolved;
}
async function destination(state) {
  const root=await realDirectory(state),dir=path.join(root,'background');
  try {await fs.mkdir(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await realDirectory(dir);const stat=await fs.lstat(dir);
  if((process.getuid&&stat.uid!==process.getuid())||(stat.mode&0o022))throw Error('UNSAFE_BACKGROUND_STATE');
  const file=path.join(dir,'last-run.json');await safeFile(file);return file;
}
async function safeFile(file) {
  try {const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o022)||(process.getuid&&stat.uid!==process.getuid()))throw Error('UNSAFE_BACKGROUND_STATE');}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
async function save(file,value) {
  await realDirectory(path.dirname(file));await safeFile(file);
  const temp=path.join(path.dirname(file),`.last-run-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();await handle.close();await realDirectory(path.dirname(file));await safeFile(file);await fs.rename(temp,file);
    try {const directory=await fs.open(path.dirname(file),'r');try {await directory.sync();}finally {await directory.close();}}catch(e){if(process.platform!=='win32')throw e;}
  }
  finally {await handle.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});}
}
function execute(binary,args,{timeout=TOTAL_TIMEOUT,max=1024*1024,env=process.env}={}) {
  return new Promise(resolve=>{
    let child,finished=false,timer,hardTimer,bytes=0;const chunks=[];
    const finish=(reason,code)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(hardTimer);process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);resolve({reason,code,output:(!reason||reason==='cli_failed')?Buffer.concat(chunks):null});};
    const signal=kind=>{if(!child?.pid)return;try{if(process.platform==='win32')child.kill(kind);else process.kill(-child.pid,kind);}catch{}};
    // CLI SIGTERM handler stops its separately grouped provider/Git subprocesses.
    const stop=reason=>{if(finished||hardTimer)return;signal('SIGTERM');child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();hardTimer=setTimeout(()=>{signal('SIGKILL');finish(reason,null);},1000);child.once('close',()=>finish(reason,null));};
    const cancel=()=>stop('interrupted');
    try {child=spawn(binary,args,{env,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});}catch{return finish('cli_unavailable',null);}
    process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
    child.stdin.on('error',()=>{});child.stdin.end();child.stderr.resume();
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>max)stop('output_limit');else chunks.push(chunk);});
    child.on('error',()=>finish('cli_unavailable',null));
    child.on('close',code=>{if(!hardTimer)finish(code===0?null:'cli_failed',code);});
    timer=setTimeout(()=>stop('timeout'),timeout);
  });
}
async function notify(kind) {
  if(process.platform!=='darwin')return 'unsupported';
  const message=kind==='startup'?'知識処理の起動または状態保存に失敗しました。設定を確認してください。':'知識の同期または説明生成を完了できませんでした。保存状態を確認してください。';
  const result=await execute('/usr/bin/osascript',['-e',`display notification "${message}" with title "Knowledge"`],{timeout:5000,max:4096});
  return result.reason?'failed':'sent';
}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const EXEC_REASONS=new Set(['cli_failed','cli_unavailable','timeout','interrupted','output_limit','invalid_result']);
const SYNC_REASONS=new Set(['authentication','forbidden','not_found_or_inaccessible','unavailable','conflict','invalid_response','private_repository_required','local_save_or_transport_failure','legacy_pending_conflict','no_cache','pending_offline','identity_requires_remote_check','registry_conflict','invalid_registry','source_unavailable','policy_disabled','identity_unresolved','target_changed','busy','invalid_target_index']);
const STAGES=new Set(['analysis','read_repository','read_fetch','read_validation','read_snapshot','generation','publish','preferences_sync']);
const generalTarget=hash('background-preferences-sync');
function normalized(value,fallback) {const safe=safeError({message:value});return safe==='KNOWLEDGE_READ_FAILED'?fallback:safe;}
async function syncArgs(options={}) {
  // Installed knowledge/ is beside runtime.js; the source tree uses dist/skill/.
  const installed=path.resolve(__dirname,'../runtime.js');
  let runtime=installed;try {await fs.access(installed);}catch {runtime=path.resolve(__dirname,'../dist/skill/runtime.js');}
  return [runtime,'preferences','sync-all','--project',os.homedir(),...(options.home?['--home',absolute(options.home)]:[])];
}
function syncStatus(value) {
  if(!value||typeof value.ok!=='boolean'||!Array.isArray(value.results)||!Number.isSafeInteger(value.pending)||value.pending<0||!Number.isSafeInteger(value.failed)||value.failed<0)return null;
  const results=[];
  for(const row of value.results) {
    if(!row||!/^[a-f0-9]{64}$/.test(row.target_id)||!['sent','unchanged','pending','conflict','skipped','busy'].includes(row.state))return null;
    results.push({target_id:row.target_id,state:row.state,...(row.reason?{reason:SYNC_REASONS.has(row.reason)?row.reason:'local_save_or_transport_failure'}:{})});
  }
  if(!value.ok&&value.pending===0&&value.failed===0)return null;
  const incomplete=results.filter(row=>!['sent','unchanged'].includes(row.state)).length;
  if((value.ok&&(value.pending||value.failed||incomplete))||value.pending<incomplete)return null;
  return {ok:value.ok,pending:value.pending,failed:value.failed,results,...(value.error?{reason:SYNC_REASONS.has(value.error)?value.error:'invalid_result'}:{})};
}
function parsed(result) {try{return JSON.parse(result.output.toString('utf8'));}catch{return null;}}
async function analysisTarget(state) {
  await safeFile(path.join(state,'config.json'));
  try {const value=JSON.parse(await fs.readFile(path.join(state,'config.json'),'utf8'));return hash(JSON.stringify([value.repo,value.branch,value.library_id]));}catch(e){if(e.code==='ENOENT')return hash('background-analysis');throw e;}
}
function outcomes(value,status,result,target) {
  const events=[];
  const failure=(stage,reason)=>events.push({stage,target_id:target,reason,success:false});
  const success=stage=>events.push({stage,target_id:target,success:true});
  if(result.reason||status.reason==='invalid_result') {failure('analysis',EXEC_REASONS.has(result.reason)?result.reason:'invalid_result');return events;}
  // Stage completion is explicit. A successful unrelated stage never recovers
  // another episode, and busy/partial/unexecuted work is never recovery.
  if(status.state==='ok'||(status.state==='skipped'&&status.reason==='unchanged'))success('analysis');
  const fresh=value.freshness;
  if(fresh.state==='offline')failure('read_'+(['repository','fetch','validation','snapshot'].includes(fresh.stage)?fresh.stage:'fetch'),normalized(fresh.reason,'read_failed'));
  if(fresh.state==='current')for(const stage of ['repository','fetch','validation','snapshot'])success('read_'+stage);
  if(status.failed)for(const reason of new Set(value.results.filter(row=>row.state==='failed'||row.reason).map(row=>normalized(row.reason,'generation_failed'))))failure('generation',reason);
  else if(status.state==='ok'&&value.state!=='busy')success('generation');
  if(status.pending)for(const reason of new Set((value.publish.results||[]).filter(row=>row.state==='pending'||row.reason).map(row=>normalized(row.reason,'publish_pending'))))failure('publish',reason);
  if(status.pending&&!events.some(event=>event.stage==='publish'))failure('publish','publish_pending');
  if(value.publish.state!=='busy'&&value.publish.results?.length&&value.publish.results.every(row=>['sent','reused'].includes(row.state)&&!row.reason))success('publish');
  if(status.reason==='cli_reported_failure')failure('analysis','cli_reported_failure');
  return events;
}
function episodeReason(value) {return EXEC_REASONS.has(value)||SYNC_REASONS.has(value)||['read_failed','generation_failed','publish_pending','cli_reported_failure'].includes(value)||normalized(value,null)!==null;}
async function loadEpisodes(file) {
  await safeFile(file);
  let value;try {const stat=await fs.stat(file);if(stat.size>1024*1024)throw Error('UNSAFE_BACKGROUND_STATE');value=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {schema_version:1,episodes:{}};throw Error('UNSAFE_BACKGROUND_STATE');}
  if(Object.keys(value).some(key=>!['schema_version','episodes'].includes(key))||value.schema_version!==1||!value.episodes||Array.isArray(value.episodes)||typeof value.episodes!=='object'||Object.keys(value.episodes).length>2000)throw Error('UNSAFE_BACKGROUND_STATE');
  for(const [key,row] of Object.entries(value.episodes))if(!row||Object.keys(row).some(key=>!['stage','target_id','reason','first_at','last_at','suppressed','notification','attempt_at','attempt_token'].includes(key))||typeof row.attempt_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.attempt_token)||!STAGES.has(row.stage)||!/^[a-f0-9]{64}$/.test(row.target_id)||!episodeReason(row.reason)||key!==hash(JSON.stringify([row.stage,row.reason,row.target_id]))||!Number.isFinite(Date.parse(row.first_at))||!Number.isFinite(Date.parse(row.last_at))||!Number.isSafeInteger(row.suppressed)||row.suppressed<0||!['pending','sent','failed','unsupported'].includes(row.notification)||!Number.isFinite(Date.parse(row.attempt_at)))throw Error('UNSAFE_BACKGROUND_STATE');
  return value;
}
async function episodes(file,events,now) {
  const state=await loadEpisodes(file),at=new Date(now).toISOString();let notice='not_needed';
  for(const event of events.filter(row=>row.success))for(const [key,row] of Object.entries(state.episodes))if(row.stage===event.stage&&row.target_id===event.target_id)delete state.episodes[key];
  const attempts=[];
  for(const event of events.filter(row=>!row.success)) {
    const key=hash(JSON.stringify([event.stage,event.reason,event.target_id]));let row=state.episodes[key];
    if(!row) {row=state.episodes[key]={stage:event.stage,target_id:event.target_id,reason:event.reason,first_at:at,last_at:at,suppressed:0,notification:'pending',attempt_at:at,attempt_token:crypto.randomUUID()};attempts.push(row);}
    else {row.last_at=at;row.suppressed++;if(['failed','pending'].includes(row.notification)&&now-Date.parse(row.attempt_at)>=86400000){row.attempt_at=at;row.attempt_token=crypto.randomUUID();row.notification='pending';attempts.push(row);}else notice='suppressed';}
  }
  if(Object.keys(state.episodes).length>2000)throw Error('UNSAFE_BACKGROUND_STATE');
  // Persist reservation under the mutex before executing the notification.
  await save(file,state);
  return {notice,attempts:attempts.map(row=>({key:hash(JSON.stringify([row.stage,row.reason,row.target_id])),token:row.attempt_token})),at};
}
async function episodeLock(state,fn) {
  const config={repo:hash(state),branch:'background',library_id:'notification-episodes-v1'};
  // The mutex covers only local state transitions. A notification can take five
  // seconds, so its durable reservation must be visible to concurrent jobs.
  for(let attempt=0;attempt<100;attempt++) {
    const value=await libraryLock(config,fn);
    if(value?.state!=='busy')return value;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('UNSAFE_BACKGROUND_STATE');
}

async function background(options,{run=execute,notification=notify,now=()=>Date.now()}={}) {
  const state=absolute(options.state),codex=absolute(options.codex),file=await destination(state);
  const target=await analysisTarget(state),started=new Date(now()).toISOString();
  const deadline=Date.now()+TOTAL_TIMEOUT;
  // Retry records first, with five minutes reserved for transport and a shared
  // thirty-minute deadline. Analysis failure or exhaustion cannot starve retry.
  let retry;try {retry=await run(process.execPath,await syncArgs(options),{env:{...process.env,PATH:SAFE_PATH},timeout:Math.min(5*60*1000,Math.max(1,deadline-Date.now()))});}catch {retry={reason:'cli_failed'};}
  let sync=syncStatus(parsed(retry));
  if((retry.reason&&!(retry.reason==='cli_failed'&&retry.code===2&&sync&&!sync.ok))||!sync)sync={ok:false,pending:0,failed:1,results:[],reason:!sync&&retry.output?'invalid_result':EXEC_REASONS.has(retry.reason)?retry.reason:'invalid_result'};
  let result;
  if(Date.now()>=deadline)result={reason:'timeout'};
  else try {result=await run(process.execPath,cliArgs({state,codex}),{env:{...process.env,PATH:SAFE_PATH},timeout:Math.max(1,deadline-Date.now())});}catch {result={reason:'cli_failed'};}
  const value=parsed(result);
  const status=result.reason?{...classify(null),reason:EXEC_REASONS.has(result.reason)?result.reason:'cli_failed'}:classify(value);
  const record={schema_version:2,started_at:started,finished_at:new Date(now()).toISOString(),...status,analysis:status,sync,notification:'not_needed'};
  if(!sync.ok&&['ok','skipped'].includes(status.state)){record.state='sync_pending';record.reason='preferences_sync_pending';}
  const failed=!['ok','skipped'].includes(record.state)||!sync.ok;
  const events=outcomes(value,status,result,target);
  for(const row of sync.results)if(['sent','unchanged'].includes(row.state))events.push({stage:'preferences_sync',target_id:row.target_id,success:true});else if(['pending','conflict'].includes(row.state))events.push({stage:'preferences_sync',target_id:row.target_id,reason:row.reason||'local_save_or_transport_failure',success:false});
  if(sync.ok)events.push({stage:'preferences_sync',target_id:generalTarget,success:true});
  if(sync.reason)events.push({stage:'preferences_sync',target_id:generalTarget,reason:sync.reason,success:false});
  if(failed)record.notification='pending';await save(file,record);
  const episodeFile=path.join(path.dirname(file),'episodes.json');
  const reservation=await episodeLock(state,()=>episodes(episodeFile,events,now()));
  record.notification=reservation.notice;
  if(reservation.attempts.length) {
    try {record.notification=await notification();}catch {record.notification='failed';}
    if(!['sent','failed','unsupported'].includes(record.notification))record.notification='failed';
    await episodeLock(state,async()=>{
      const saved=await loadEpisodes(episodeFile);
      for(const {key,token} of reservation.attempts)if(saved.episodes[key]?.attempt_token===token)saved.episodes[key].notification=record.notification;
      await save(episodeFile,saved);return true;
    });
  }
  await save(file,record);
  return {record,exitCode:failed?1:0};
}

function plist({node,runner,state,codex}) {
  const escape=value=>absolute(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const args=[node,runner,'--state',state,'--codex',codex].map((v,i)=>`<string>${i===2||i===4?v:escape(v)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>com.codex-harness.knowledge-analysis</string>\n<key>ProgramArguments</key><array>${args}</array>\n<key>StartInterval</key><integer>3600</integer>\n<key>RunAtLoad</key><false/>\n<key>ProcessType</key><string>Background</string>\n<key>EnvironmentVariables</key><dict><key>PATH</key><string>${SAFE_PATH}</string></dict>\n<key>StandardInPath</key><string>/dev/null</string>\n<key>StandardOutPath</key><string>/dev/null</string>\n<key>StandardErrorPath</key><string>/dev/null</string>\n</dict></plist>\n`;
}
async function start(args,{notification=notify,run=execute}={}) {
  let attempted=false;
  const once=async kind=>{if(attempted)return 'failed';attempted=true;return notification(kind);};
  try {
    const options={};let valid=args.length===4;
    for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--state','--codex'].includes(key)||options[key.slice(2)]!==undefined)valid=false;options[key.slice(2)]=args[i+1];}
    if(!valid)throw Error('INVALID_BACKGROUND_ARGUMENT');
    return await background(options,{run,notification:once});
  } catch {
    // Unsafe/unwritable state has no alternate destination. Leave it untouched,
    // but signal startup/storage failure even when launchd discards stderr.
    if(!attempted)try {await once('startup');}catch{}
    return {exitCode:1};
  }
}
if(require.main===module)start(process.argv.slice(2)).then(result=>{process.exitCode=result.exitCode;});
module.exports={syncArgs,syncStatus,background,start,classify,execute,destination,save,plist,cliArgs,SAFE_PATH,TOTAL_TIMEOUT};
