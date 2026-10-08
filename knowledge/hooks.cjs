'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {atomic,read}=require('./core.cjs');
const {libraryLock}=require('./reader.cjs');
const EVENTS=['SessionStart','UserPromptSubmit'];
function hookCommand(store,{node=process.execPath,cli=path.resolve(__dirname,'cli.cjs'),platform=process.platform}={}) {
  const absolute=platform==='win32'?path.win32.isAbsolute:path.isAbsolute;
  const values=[node,cli,store.root];if(values.some(value=>!absolute(value)||/[\r\n\0]/.test(value)))throw new Error('UNSAFE_HOOK_PATH');
  if(platform==='win32') {if(values.some(value=>/[%!"&|<>^]/.test(value)))throw new Error('UNSAFE_HOOK_PATH');return values.map(value=>'"'+value+'"').slice(0,2).join(' ')+` pull --quiet --state "${store.root}"`;}
  if(platform!=='darwin'&&platform!=='linux')throw new Error('UNSUPPORTED_HOOK_PLATFORM');
  const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
  return `${quote(node)} ${quote(cli)} pull --quiet --state ${quote(store.root)}`;
}
function definitions(command) {return {SessionStart:{matcher:'startup|resume',hooks:[{type:'command',command,async:true,timeout:10}]},UserPromptSubmit:{hooks:[{type:'command',command,async:true,timeout:10}]}};}
function validateHooks(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!value.hooks||typeof value.hooks!=='object'||Array.isArray(value.hooks))throw new Error('INVALID_HOOKS_FILE');
  for(const entries of Object.values(value.hooks))if(!Array.isArray(entries)||entries.some(entry=>!entry||typeof entry!=='object'||!Array.isArray(entry.hooks)||entry.hooks.some(hook=>!hook||typeof hook!=='object')))throw new Error('INVALID_HOOKS_FILE');
  return value;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function hooks(store,{action,file,...options}) {
  if(!['install','status','remove'].includes(action)||!path.isAbsolute(file||'')||/[\r\n\0]/.test(file))throw new Error('INVALID_HOOK_ARGUMENT');
  const config=await store.config();if(!config)throw new Error('NOT_CONFIGURED');
  let target=path.join(await fs.realpath(path.dirname(file)),path.basename(file));if(process.platform==='win32')target=target.toLocaleLowerCase();
  return libraryLock({repo:'hooks-file',branch:target,library_id:'hooks-target'},()=>libraryLock(config,async()=>{
    let bytes=null,mode=0o600;
    try {const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_HOOKS_FILE');mode=stat.mode;bytes=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    let value;try {value=bytes===null?{hooks:{}}:validateHooks(JSON.parse(bytes));}catch{throw new Error('INVALID_HOOKS_FILE');}
    const registrationFile=path.join(store.root,'hooks-registration.json');const registration=await read(registrationFile);
    if(registration&&registration.file!==file)throw new Error('HOOK_REGISTRATION_DESTINATION_CHANGED');
    const command=hookCommand(store,options),expected=registration?.definitions||definitions(command);
    if(registration&&(typeof registration.command!=='string'||!equal(registration.definitions,definitions(registration.command))))throw new Error('INVALID_HOOK_REGISTRATION');
    const counts=Object.fromEntries(EVENTS.map(event=>[event,(value.hooks[event]||[]).filter(entry=>equal(entry,expected[event])).length]));
    if(EVENTS.some(event=>counts[event]>1))throw new Error('DUPLICATE_HOOK_REGISTRATION');
    const allHooks=Object.values(value.hooks).flat().flatMap(entry=>entry.hooks);
    for(const hook of allHooks)if(hook.command=== (registration?.command||command) && !EVENTS.some(event=>(value.hooks[event]||[]).some(entry=>equal(entry,expected[event])&&entry.hooks.includes(hook))))throw new Error('HOOK_DEFINITION_CONFLICT');
    const installed=EVENTS.every(event=>counts[event]===1);
    if(action==='status')return {installed,events:counts,trust:'Codex must trust the hooks file; this tool never reads or updates trusted_hash.'};
    if(action==='install') {
      if(registration&&registration.command!==command)throw new Error('HOOK_COMMAND_CHANGED_REMOVE_FIRST');
      for(const event of EVENTS)if(counts[event]===0)(value.hooks[event]||= []).push(expected[event]);
    } else {
      if(!registration) {if(EVENTS.some(event=>counts[event]))throw new Error('UNOWNED_HOOK_MANUAL_REVIEW');return {installed:false};}
      for(const event of EVENTS) value.hooks[event]=(value.hooks[event]||[]).filter(entry=>!equal(entry,expected[event]));
    }
    // Fail instead of overwriting edits made by another hook installer after reading.
    let now=null;try{now=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(now!==bytes)throw new Error('HOOKS_FILE_CHANGED');
    if(action==='install')await atomic(registrationFile,{schema_version:1,file,command,definitions:expected});
    await atomic(file,value);await fs.chmod(file,mode);
    if(action==='remove')await fs.rm(registrationFile,{force:true});
    return {installed:action==='install',file,trust:'Trust the updated definition in Codex; trusted_hash was not changed.'};
  }));
}
module.exports={hooks,hookCommand,definitions,validateHooks};
