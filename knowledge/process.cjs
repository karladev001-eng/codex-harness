'use strict';
const {spawn}=require('node:child_process');
const active=new Set();
function killTree(child) {
  if(!child.pid)return;
  if(process.platform==='win32') {const killer=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill('SIGKILL'));killer.unref();}
  else {try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
function installCancellation() {
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{for(const child of active)killTree(child);process.exit(signal==='SIGINT'?130:143);});
  process.once('exit',()=>{for(const child of active)killTree(child);});
}
function run(binary,args,{cwd,input,timeout=20000,max=32*1024*1024,env=process.env}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env,detached:process.platform!=='win32',windowsHide:true,stdio:['pipe','pipe','pipe']});active.add(child);
    let bytes=0,settled=false;const chunks=[];
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);active.delete(child);if(error){killTree(child);child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();reject(new Error(error));}else resolve(value);};
    const timer=setTimeout(()=>finish('PROCESS_TIMEOUT'),timeout);
    child.stdout.on('data',value=>{bytes+=value.length;if(bytes>max)finish('PROCESS_OUTPUT_LIMIT');else chunks.push(value);});
    child.stderr.resume();child.stdin.on('error',()=>{});
    child.on('error',()=>finish('PROCESS_UNAVAILABLE'));
    child.on('close',code=>finish(code===0?null:'PROCESS_FAILED',Buffer.concat(chunks)));
    child.stdin.end(input);
  });
}
module.exports={run,installCancellation};
