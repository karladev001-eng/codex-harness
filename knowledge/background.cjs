#!/usr/bin/env node
'use strict';
// Sessionless, hourly analyze entry point. Raw child output stays in memory only.
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
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
  try {const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(process.getuid&&stat.uid!==process.getuid()))throw Error('UNSAFE_BACKGROUND_STATE');}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
async function save(file,value) {
  await realDirectory(path.dirname(file));await safeFile(file);
  const temp=path.join(path.dirname(file),`.last-run-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();await handle.close();await realDirectory(path.dirname(file));await safeFile(file);await fs.rename(temp,file);}
  finally {await handle.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});}
}
function execute(binary,args,{timeout=TOTAL_TIMEOUT,max=1024*1024,env=process.env}={}) {
  return new Promise(resolve=>{
    let child,finished=false,timer,hardTimer,bytes=0;const chunks=[];
    const finish=(reason,code)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(hardTimer);process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);resolve({reason,code,output:reason?null:Buffer.concat(chunks)});};
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
  const message=kind==='startup'?'説明生成の起動または状態保存に失敗しました。設定を確認してください。':'説明生成を完了できませんでした。保存状態を確認してください。';
  const result=await execute('/usr/bin/osascript',['-e',`display notification "${message}" with title "Knowledge"`],{timeout:5000,max:4096});
  return result.reason?'failed':'sent';
}
async function background(options,{run=execute,notification=notify}={}) {
  const state=absolute(options.state),codex=absolute(options.codex),file=await destination(state);
  const started=new Date().toISOString();
  const result=await run(process.execPath,cliArgs({state,codex}),{env:{...process.env,PATH:SAFE_PATH},timeout:TOTAL_TIMEOUT});
  let status;
  if(result.reason)status={...classify(null),reason:result.reason};
  else {try {status=classify(JSON.parse(result.output.toString('utf8')));}catch {status=classify(null);}}
  const record={schema_version:1,started_at:started,finished_at:new Date().toISOString(),...status,notification:'not_needed'};
  const failed=!['ok','skipped'].includes(record.state);
  // Persist the primary failure before attempting notification.
  if(failed)record.notification='pending';await save(file,record);
  if(failed){try{record.notification=await notification();}catch{record.notification='failed';}await save(file,record);}
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
module.exports={background,start,classify,execute,destination,save,plist,cliArgs,SAFE_PATH,TOTAL_TIMEOUT};
