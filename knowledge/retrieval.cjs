'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pull,snapshot}=require('./reader.cjs');
const {uuid}=require('./core.cjs');
async function selected(store,{captureId,freshness=true,pullOptions}={}) {
  if(!uuid(captureId))throw new Error('CAPTURE_ID_REQUIRED');
  const freshnessResult=freshness?await pull(store,pullOptions):{state:'not_checked'};
  const config=await store.config(),saved=config&&await snapshot(store,config);
  const row=saved?.captures.find(row=>row.capture_id===captureId);
  const provenance={capture_id:captureId,freshness:freshnessResult,commit:saved?.commit||null,checked_at:saved?.checked_at||null};
  if(!row)return {row:null,provenance:{...provenance,state:config?'capture_not_found':'unconfigured'}};
  return {row,provenance:{...provenance,state:'found',url:row.source.url,captured_at:row.captured_at,source_limitations:row.source.limitations.slice(0,6).map(value=>value.slice(0,200))}};
}
async function readCapture(store,{field='content',offset=0,limit=4000,...options}={}) {
  if(!['content','note'].includes(field)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>16000)throw new Error('INVALID_READ_ARGUMENT');
  const {row,provenance}=await selected(store,options);
  if(!row)return provenance;
  const value=row[field];
  if(offset>value.length)throw new Error('READ_OFFSET_OUT_OF_RANGE');
  // UTF-16 indices match String.slice and search match positions. Avoid splitting pairs.
  if(offset>0&&/[\uDC00-\uDFFF]/.test(value[offset]||'')&&/[\uD800-\uDBFF]/.test(value[offset-1]))throw new Error('READ_OFFSET_SPLITS_CHARACTER');
  let end=Math.min(offset+limit,value.length);
  if(end<value.length&&/[\uDC00-\uDFFF]/.test(value[end])&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;
  if(end===offset&&offset<value.length)throw new Error('READ_LIMIT_SPLITS_CHARACTER');
  return {...provenance,field,field_kind:field==='note'?'user_note':'source_text',blob_sha:row.blobs?.[field==='note'?'note.md':'content.md']||null,offset_unit:'utf16',offset,end_offset:end,next_offset:end<value.length?end:null,total_length:value.length,text:value.slice(offset,end)};
}
async function safeDirectory(directory) {
  const stat=await fs.lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('UNSAFE_IMAGE_CACHE');
}
async function exportImage(store,options={}) {
  const {row,provenance}=await selected(store,options);
  if(!row)return provenance;
  if(!row.image)return {...provenance,state:'image_unavailable'};
  const bytes=Buffer.from(row.image,'base64');
  if(bytes.length>1500000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('INVALID_SAVED_JPEG');
  // Resolve the trusted state root once; never accept a caller-supplied output path.
  await safeDirectory(store.root);
  const root=await fs.realpath(store.root),readRoot=path.join(root,'read'),cache=path.join(readRoot,'image-cache');
  await safeDirectory(readRoot);
  try{await fs.mkdir(cache,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await safeDirectory(cache);
  if(await fs.realpath(cache)!==cache)throw new Error('UNSAFE_IMAGE_CACHE');
  const directory=path.join(cache,crypto.randomUUID());
  await fs.mkdir(directory,{mode:0o700});
  const file=path.join(directory,'screenshot.jpg');
  let handle;
  try {
    await safeDirectory(cache);await safeDirectory(directory);
    if(await fs.realpath(directory)!==directory)throw new Error('UNSAFE_IMAGE_CACHE');
    handle=await fs.open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);
    await handle.writeFile(bytes);await handle.sync();
  } finally {await handle?.close();}
  return {...provenance,state:'image_exported',blob_sha:row.blobs?.['screenshot.jpg']||null,path:file,bytes:bytes.length,media_type:'image/jpeg',inspection_required:true};
}
module.exports={selected,readCapture,exportImage};
