'use strict';
// Reference data is read as Git objects; no checkout, filters, hooks or submodules.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { run } = require('./process.cjs');
const { atomic, read, sha, json, uuid, validateCapture, canonical } = require('./core.cjs');
const { Gh, gitBlobSha } = require('./github.cjs');
const HASH = /^[0-9a-f]{40}$/;
const destination = config => ({ repo: config.repo, branch: config.branch, library_id: config.library_id });
const sameDestination = (a, b) => a && ['repo','branch','library_id'].every(k => a[k] === b[k]);
const SAFE_ERRORS = new Set(['PROCESS_AUTHENTICATION','PROCESS_FORBIDDEN','PROCESS_NETWORK','GH_AUTHENTICATION','GH_FORBIDDEN','GH_NETWORK','GH_TIMEOUT','ANALYSIS_DESTINATION_CHANGED', 'ANALYSIS_INPUT_LIMIT', 'CAPTURE_ID_REQUIRED', 'CORRUPT_LOCAL_STATE', 'DUPLICATE_ARGUMENT', 'DUPLICATE_HOOK_REGISTRATION', 'EXISTING_ORIGIN_MANUAL_REVIEW', 'EXISTING_OR_UNKNOWN_REGISTRATION', 'EXISTING_REGISTRATION_MANUAL_REVIEW', 'GH_ABSOLUTE_PATH_REQUIRED', 'GH_BLOB_MISMATCH', 'GH_INVALID_RESPONSE', 'HOOKS_FILE_CHANGED', 'HOOK_COMMAND_CHANGED_REMOVE_FIRST', 'HOOK_DEFINITION_CONFLICT', 'HOOK_REGISTRATION_DESTINATION_CHANGED', 'INSTALL_PLATFORM_MISMATCH', 'INVALID_ACTION', 'INVALID_ANALYSIS', 'INVALID_ANALYSIS_LIMIT', 'INVALID_ANALYSIS_QUEUE', 'INVALID_ANALYSIS_RESULT', 'INVALID_ARGUMENT', 'INVALID_BACKGROUND_ARGUMENT', 'INVALID_BACKGROUND_PATH', 'INVALID_BRANCH', 'INVALID_CAPTURE_ID', 'INVALID_CONFIG', 'INVALID_DETAILS', 'INVALID_FRAME', 'INVALID_GIT_HEAD', 'INVALID_GIT_TREE', 'INVALID_HEADINGS', 'INVALID_HOOKS_FILE', 'INVALID_HOOK_ARGUMENT', 'INVALID_HOOK_REGISTRATION', 'INVALID_INTERVAL', 'INVALID_KIND', 'INVALID_LIMITATIONS', 'INVALID_MESSAGE', 'INVALID_OPERATION_ID', 'INVALID_PROVIDER_CONFIG', 'INVALID_PROVIDER_EVENTS', 'INVALID_PROVIDER_OUTPUT', 'INVALID_READ_ARGUMENT', 'INVALID_READ_SNAPSHOT', 'INVALID_REGISTRATION', 'INVALID_SAVED_JPEG', 'INVALID_SCHEMA', 'INVALID_SCREENSHOT', 'INVALID_SEARCH_ARGUMENT', 'INVALID_SOURCE_IDENTITY', 'INVALID_TAGS', 'INVALID_TEXT', 'INVALID_URL', 'ITEM_CONFLICT', 'KB_CAPTURE_LIMIT', 'KB_CAPTURE_SCHEMA_CONFLICT', 'KB_SCHEMA_CONFLICT', 'KB_SIZE_LIMIT', 'KB_UNSAFE_TREE', 'LOCKED_MANUAL_INSPECTION_REQUIRED', 'MESSAGE_TOO_LARGE', 'MISSING_ANALYSIS_EVIDENCE', 'MISSING_ARGUMENT', 'NODE_22_REQUIRED', 'NONEMPTY_UNKNOWN_REPOSITORY', 'NOT_CONFIGURED', 'NO_READ_SNAPSHOT', 'OPERATION_COLLISION_OR_CORRUPTION', 'ORIGIN_NOT_ALLOWED', 'PRIVATE_READABLE_REPOSITORY_REQUIRED', 'PRIVATE_WRITABLE_REPOSITORY_REQUIRED', 'PROCESS_OUTPUT_LIMIT', 'PROCESS_TIMEOUT', 'PROCESS_UNAVAILABLE', 'PROVIDER_REQUIRED', 'PROVIDER_TOOL_CALL_FORBIDDEN', 'PROVIDER_TURN_INCOMPLETE', 'README_LIMIT', 'READ_LIMIT_SPLITS_CHARACTER', 'READ_LOCK_TICKET_LIMIT', 'READ_OFFSET_OUT_OF_RANGE', 'READ_OFFSET_SPLITS_CHARACTER', 'READ_TIMEOUT', 'REF_CONFLICT_OR_UNCONFIRMED', 'REGISTRATION_FAILED', 'REGISTRATION_ROLLBACK_FAILED_MANUAL_INSPECTION', 'REMOTE_ANALYSIS_CONFLICT', 'REMOTE_CAPTURE_CHANGED', 'REMOTE_CAPTURE_CONFLICT', 'REMOTE_OPERATION_COLLISION', 'REMOTE_PATH_CONFLICT', 'RESPONSE_TOO_LARGE', 'STATE_ABSOLUTE_PATH_REQUIRED', 'TREE_INCOMPLETE', 'TRUNCATED_FRAME', 'UNKNOWN_ARGUMENT', 'UNOWNED_HOOK_MANUAL_REVIEW', 'UNSAFE_BACKGROUND_STATE', 'UNSAFE_GH_PATH', 'UNSAFE_GIT_CACHE', 'UNSAFE_GIT_CACHE_CONFIG', 'UNSAFE_HOOKS_FILE', 'UNSAFE_HOOK_PATH', 'UNSAFE_IMAGE_CACHE', 'UNSAFE_LAUNCHER_PATH', 'UNSAFE_READ_LOCK', 'UNSAFE_REGISTRATION_STATE', 'UNSUPPORTED_HOOK_PLATFORM']);
const safeError = e => SAFE_ERRORS.has(e?.message) ? e.message : 'KNOWLEDGE_READ_FAILED';
async function recoveryClaim(lock,candidate) {
  // Append-only numbered tickets avoid ABA when reclaiming an abandoned mutex.
  // A killed recoverer leaves its unique ticket; no new process reuses that path.
  const root=lock+'.recovery';await fs.mkdir(root,{recursive:true,mode:0o700});
  const rootStat=await fs.lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
  let ticket;
  for(;;) {
    const names=await fs.readdir(root);if(names.some(name=>!/^\d{10}(\.done)?$/.test(name)))throw new Error('UNSAFE_READ_LOCK');
    if(names.length>20000)throw new Error('READ_LOCK_TICKET_LIMIT');
    const next=names.reduce((max,name)=>Math.max(max,Number(name.split('.')[0])),0)+1;
    ticket=path.join(root,String(next).padStart(10,'0'));
    // Every contender reserves exactly the same numeric pathname for this next
    // sequence. The hard link publishes its already-written PID atomically.
    try{await fs.link(candidate,ticket);break;}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  const markDone=async()=>{try{const handle=await fs.open(ticket+'.done','wx',0o600);await handle.close();}catch(e){if(e.code!=='EEXIST')throw e;}};
  for(const name of (await fs.readdir(root)).filter(name=>/^\d{10}$/.test(name)&&name<path.basename(ticket))) {
    const prior=path.join(root,name);const stat=await fs.lstat(prior);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
    const owner=await read(prior);let done=false;try{const stat=await fs.lstat(prior+'.done');if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');done=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(done)continue;
    if(!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error('UNSAFE_READ_LOCK');
    try{process.kill(owner.pid,0);await markDone();return null;}catch(e){if(e.code!=='ESRCH'){await markDone();return null;}}
  }
  return markDone;
}
function remaining(deadline,timeout=20000) {const value=deadline?Math.min(timeout,deadline-Date.now()):timeout;if(value<=0)throw new Error('READ_TIMEOUT');return value;}
async function libraryLock(config, fn) {
  const lock = path.join(os.tmpdir(), `codex-knowledge-${sha(json(destination(config))).slice(0,32)}.lock`);
  const token = crypto.randomUUID();
  const candidate=lock+'.'+token+'.candidate';
  await fs.writeFile(candidate,json({pid:process.pid,token}),{flag:'wx',mode:0o600});
  let acquired=false;
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await fs.link(candidate,lock); acquired=true;break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let primaryStat;try{primaryStat=await fs.lstat(lock);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!primaryStat.isFile()||primaryStat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
      // Ordinary contention needs no recovery ticket; only dead owners reclaim.
      const current=await read(lock);if(current){if(!Number.isInteger(current.pid)||current.pid<=0)throw new Error('UNSAFE_READ_LOCK');try{process.kill(current.pid,0);return {state:'busy'};}catch(error){if(error.code!=='ESRCH')return {state:'busy'};}}
      const releaseClaim=await recoveryClaim(lock,candidate);if(!releaseClaim)return {state:'busy'};
      try {
      let stat;try{stat=await fs.lstat(lock);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UNSAFE_READ_LOCK');
      let owner; try { owner = await read(lock); } catch { throw new Error('UNSAFE_READ_LOCK'); }
      // A normal owner can release after lstat, outside recovery's mutex.
      // read() returns null only for ENOENT; corrupt/unreadable data still throws.
      if (!owner)continue;
      else {
        if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string') throw new Error('UNSAFE_READ_LOCK');
        try { process.kill(owner.pid,0); return { state: 'busy' }; } catch (error) { if (error.code !== 'ESRCH') return { state: 'busy' }; }
      }
      // Rename before removal: contenders never remove a newly acquired lock.
      const stale = `${lock}.${crypto.randomUUID()}.stale`;
      try { await fs.rename(lock,stale); await fs.unlink(stale); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (attempt === 1) return { state: 'busy' };
      } finally {await releaseClaim();}
    }
  }
  if(!acquired)return {state:'busy'};
  try {return await fn(); }
  finally { const owner = await read(lock); if (owner?.token === token) await fs.unlink(lock); }
  } finally {await fs.rm(candidate,{force:true});}
}
function gitClient(config, gitDir, options = {}) {
  const git = options.git || 'git';
  // Ignore user/system Git configuration, templates and inherited repository selectors.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  // Git for Windows rejects os.devNull (\\.\nul) as a config path but maps '/dev/null'.
  // os.devNull is fine for core.hooksPath: Git only looks for hook files under it; it is rejected only as a config *file* path.
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
  const fixed = ['-c','core.hooksPath='+os.devNull,'-c','protocol.file.allow=never','-c','protocol.ext.allow=never','-c','fetch.recurseSubmodules=false','-c','submodule.recurse=false','-c','gc.auto=0'];
  const invoke = (args, limits={}) => run(git,[...fixed,'--git-dir='+gitDir,...args],{env,...limits,timeout:remaining(options.deadline,limits.timeout||20000)});
  return { invoke, async init() { await fs.mkdir(path.dirname(gitDir),{recursive:true,mode:0o700}); await run(git,[...fixed,'init','--bare','--template=',gitDir],{env,timeout:remaining(options.deadline)});await fs.writeFile(path.join(gitDir,'config'),'[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = true\n',{mode:0o600}); },
    async fetch() {
      const configFile=path.join(gitDir,'config');const stat=await fs.lstat(configFile);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_GIT_CACHE');
      // fetch must never honor credential helpers, includes, url rewrites or filters
      // planted in a previously used cache. init's minimal bare config is the only allowed form.
      const local=await fs.readFile(configFile,'utf8');
      if(!/^\[core\]\r?\n\s*repositoryformatversion = 0\r?\n\s*filemode = (true|false)\r?\n\s*bare = true\r?\n$/.test(local))throw new Error('UNSAFE_GIT_CACHE_CONFIG');
      const remote = options.remote || `https://github.com/${config.repo}.git`;
      if(/[\r\n\0]/.test(config.gh_path))throw new Error('UNSAFE_GH_PATH');
      const credential = "!" + "'" + (process.platform==='win32'?config.gh_path.replace(/\\/g,'/'):config.gh_path).replace(/'/g,"'\\''") + "' auth git-credential";
      const auth = options.remote ? ['-c','protocol.file.allow=always'] : ['-c','credential.helper=','-c','credential.helper='+credential];
      await invoke([...auth,'fetch','--no-tags','--no-recurse-submodules','--depth=1',remote,`+refs/heads/${config.branch}:refs/knowledge/current`],{timeout:options.timeout||20000});
      const head = (await invoke(['rev-parse','refs/knowledge/current'])).toString().trim(); if (!HASH.test(head)) throw new Error('INVALID_GIT_HEAD'); return head;
    } };
}
async function snapshot(store, config) {
  const value = await read(path.join(store.root,'read','snapshot.json'));
  if (!value) return null;
  if (value.schema_version !== 1 || !sameDestination(value.destination,config) || !HASH.test(value.commit || '') || !Array.isArray(value.captures)) throw new Error('INVALID_READ_SNAPSHOT');
  return value;
}
function captureFromBlobs(base, blobs) {
  const decode = name => blobs[name]?.bytes.toString('utf8');
  let capture, metadata; try { capture = JSON.parse(decode('capture.json')); metadata = JSON.parse(decode('metadata.json')); } catch { throw new Error('KB_CAPTURE_SCHEMA_CONFLICT'); }
  const input = { schema_version:1,operation_id:capture.capture_id,captured_at:capture.captured_at,source:capture.source,content:{text:decode('content.md'),headings:[],selection:''},note:decode('note.md'),tags:metadata.tags };
  validateCapture(input);
  const item = sha(canonical(input.source.url)).slice(0,32);
  if (capture.schema_version !== 1 || metadata.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(capture.operation_digest || '') || metadata.item_id !== item || metadata.canonical_url !== canonical(input.source.url) || base !== `items/${item}/captures/${input.operation_id}` || metadata.kind !== input.source.kind || metadata.title !== input.source.title) throw new Error('KB_CAPTURE_SCHEMA_CONFLICT');
  return { capture_id:input.operation_id,path:base,captured_at:input.captured_at,source:input.source,title:metadata.title,tags:metadata.tags,note:input.note,content:input.content.text,blobs:Object.fromEntries(Object.entries(blobs).map(([key,value])=>[key,value.sha])),image:blobs['screenshot.jpg']?.bytes.toString('base64') || null,analysis:decode('analysis.json') ? parseAnalysis(decode('analysis.json')) : null };
}
function parseAnalysis(bytes) { try { return require('./analysis.cjs').validateAnalysis(JSON.parse(bytes)); } catch { return {invalid:true}; } }
async function buildSnapshot(store,config,client,head,previous,deadline) {
  const raw = await client.invoke(['ls-tree','-r','-z','--full-tree',head],{max:2*1024*1024});
  const entries = new Map();
  for (const line of raw.toString().split('\0').filter(Boolean)) {
    const m = line.match(/^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/); if (!m) throw new Error('INVALID_GIT_TREE');
    if (m[2] === 'commit' || m[1] === '120000') throw new Error('KB_UNSAFE_TREE');
    entries.set(m[4],{mode:m[1],type:m[2],sha:m[3]});
  }
  const blob = async (name,max=1500000) => { const entry=entries.get(name); if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new Error('KB_SCHEMA_CONFLICT'); return client.invoke(['cat-file','blob',entry.sha],{max}); };
  let kb; try { kb=JSON.parse((await blob('kb.json',10000)).toString()); } catch { throw new Error('KB_SCHEMA_CONFLICT'); }
  if (kb.schema_version !== 1 || kb.library_id !== config.library_id || kb.format !== 'codex-knowledge-capture' || entries.get('schemas/capture-v1.json')?.sha !== gitBlobSha(json(require('./schemas/capture-v1.json')))) throw new Error('KB_SCHEMA_CONFLICT');
  const bases = [...entries.keys()].filter(name=>/^items\/[a-f0-9]{32}\/captures\/[a-f0-9-]+\/capture.json$/.test(name)).map(name=>name.slice(0,-13));
  if (bases.length > 1000) throw new Error('KB_CAPTURE_LIMIT');
  const prior = new Map((previous?.captures || []).map(row=>[row.path,row])); const captures=[]; let size=0;
  for (const base of bases) {
    remaining(deadline);
    if (!uuid(base.split('/').at(-1))) throw new Error('KB_CAPTURE_SCHEMA_CONFLICT');
    const names = ['capture.json','metadata.json','note.md','content.md',...['screenshot.jpg','analysis.json'].filter(name=>entries.has(`${base}/${name}`))];
    const old=prior.get(base); if (old && names.length === Object.keys(old.blobs).length && names.every(name=>old.blobs[name] === entries.get(`${base}/${name}`)?.sha)) { captures.push(old); continue; }
    const blobs={}; for (const name of names) { const bytes=await blob(`${base}/${name}`,name==='analysis.json'?50000:1500000); size+=bytes.length; if(size>32*1024*1024)throw new Error('KB_SIZE_LIMIT'); blobs[name]={sha:entries.get(`${base}/${name}`).sha,bytes}; }
    captures.push(captureFromBlobs(base,blobs));
  }
  const total=Buffer.byteLength(JSON.stringify(captures)); if(total>48*1024*1024)throw new Error('KB_SIZE_LIMIT');
  return {schema_version:1,destination:destination(config),commit:head,checked_at:new Date().toISOString(),captures};
}
async function pull(store,options = {}) {
  const config=await store.config(); if(!config)return {state:'unconfigured'};
  return libraryLock(config,async()=>{
    const deadline=Date.now()+(options.timeoutTotal||60000);
    const previous=await snapshot(store,config); const root=path.join(store.root,'read');
    const last=await read(path.join(root,'attempt.json'));
    const interval=options.interval ?? 300;
    if(!Number.isFinite(interval)||interval<0||interval>86400)throw new Error('INVALID_INTERVAL');
    if(!options.force && sameDestination(last?.destination,config) && Date.now()-Date.parse(last.at)<interval*1000)return {state:'throttled',commit:previous?.commit || null,checked_at:previous?.checked_at || null};
    await atomic(path.join(root,'attempt.json'),{destination:destination(config),at:new Date().toISOString()});
    let stage='repository',temp;
    try {
      if(!options.remote) { const info=await (options.gh || new Gh(config.gh_path,{timeout:remaining(deadline,options.timeout||20000)})).api(`repos/${config.repo}`); if(info.private!==true||info.archived||info.disabled)throw new Error('PRIVATE_READABLE_REPOSITORY_REQUIRED'); }
      // Never reopen a previous fetch directory, even after SIGKILL. Legacy
      // caches and their unknown Git locks/configuration are left untouched.
      stage='fetch';
      temp=await fs.mkdtemp(path.join(root,'.fetch-'));
      const client=options.client || gitClient(config,path.join(temp,'repository.git'),{...options,deadline});
      await client.init();
      const head=await client.fetch();
      stage='validation';
      const next=head===previous?.commit?{...previous,checked_at:new Date().toISOString()}:await buildSnapshot(store,config,client,head,previous,deadline);
      next.analysis_pending=next.captures.filter(row=>require('./analysis.cjs').analysisState(row,row.analysis)!=='current').map(row=>row.capture_id);
      remaining(deadline);stage='snapshot';await atomic(path.join(root,'snapshot.json'),next);
      await atomic(path.join(root,'health.json'),{state:'current',at:next.checked_at});
      return {state:'current',commit:head,checked_at:next.checked_at,captures:next.captures.length};
    } catch(e) { const reason=safeError(e); await atomic(path.join(root,'health.json'),{state:'offline',stage,reason,at:new Date().toISOString()}); return {state:'offline',stage,reason,commit:previous?.commit || null,checked_at:previous?.checked_at || null}; }
    finally {if(temp)await fs.rm(temp,{recursive:true,force:true});}
  });
}
module.exports={run,libraryLock,gitClient,pull,snapshot,destination,sameDestination,safeError,parseAnalysis,HASH};
