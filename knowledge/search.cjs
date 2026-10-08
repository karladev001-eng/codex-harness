'use strict';
const {pull,snapshot}=require('./reader.cjs');
const {effectiveAnalysis}=require('./analysis.cjs');
const {uuid}=require('./core.cjs');
const {selected}=require('./retrieval.cjs');
function card(row,analysis,state,checked) {
  const list=value=>(value||[]).slice(0,6).map(text=>text.slice(0,200));
  const details=row.source.details||{};const refs={};
  for(const key of ['repository','readme_url','readme_path','readme_blob_sha','readme_method','api_fetched_at','video_id','playback_seconds','post_id','author','published_at'])if(['string','number'].includes(typeof details[key]))refs[key]=String(details[key]).slice(0,200);
  return {capture_id:row.capture_id,title:row.title.slice(0,300),url:row.source.url,kind:row.source.kind,captured_at:row.captured_at,checked_at:checked,analysis_state:state,summary:analysis?.text?.result?.summary.slice(0,500) || null,use_cases:list(analysis?.text?.result?.use_cases),topics:list(analysis?.text?.result?.topics),appearance:analysis?.image?.result?.appearance.slice(0,500) || null,evidence:list(analysis?.text?.result?.evidence),image_evidence:list(analysis?.image?.result?.evidence),scope:{content_bytes:Buffer.byteLength(row.content),screenshot_saved:!!row.image,...refs},source_limitations:list(row.source.limitations),analysis_limitations:list(analysis?.text?.result?.limitations),image_limitations:list(analysis?.image?.result?.limitations),tags:row.tags.slice(0,20),note_excerpt:row.note.slice(0,300)};
}
async function search(store,{query='',limit=10,captureId,freshness=true,pullOptions}={}) {
  if((captureId!==undefined&&!uuid(captureId))||typeof query!=='string'||Buffer.byteLength(query)>1000||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('INVALID_SEARCH_ARGUMENT');
  const freshnessResult=freshness?await pull(store,pullOptions):{state:'not_checked'};
  const config=await store.config();const saved=config&&await snapshot(store,config);
  if(!saved)return {mode:'lexical',vector_search:false,freshness:freshnessResult,results:[]};
  const tokens=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);const results=[];
  for(const row of saved.captures) {
    if(captureId&&row.capture_id!==captureId)continue;
    const effective=await effectiveAnalysis(store,row,config);const analysis=effective.analysis;
    const fields=[row.title,row.note,row.content,JSON.stringify(analysis?.text?.result || {}),JSON.stringify(analysis?.image?.result || {}),row.tags.join(' ')].map(value=>value.toLocaleLowerCase());
    if(tokens.length&&!tokens.every(token=>fields.some(field=>field.includes(token))))continue;
    const score=tokens.reduce((sum,token)=>sum+fields.reduce((part,field,index)=>part+(field.includes(token)?[4,3,1,2,2,3][index]:0),0),0);
    const matches=[];
    for(const [field,value]of [['content',row.content],['note',row.note]]) {
      for(const token of tokens) {
        const lower=value.toLocaleLowerCase(),position=lower.indexOf(token);
        if(position<0)continue;
        // Lowercasing can expand characters; map the match back to source UTF-16.
        let offset=0,lowerOffset=0;
        for(const character of value){const length=character.toLocaleLowerCase().length;if(lowerOffset+length>position)break;lowerOffset+=length;offset+=character.length;}
        matches.push({field,offset_unit:'utf16',offset,excerpt:value.slice(offset,offset+160)});break;
      }
    }
    results.push({...card(row,analysis,effective.state,saved.checked_at),commit:saved.commit,matches,score});
  }
  results.sort((a,b)=>b.score-a.score||b.captured_at.localeCompare(a.captured_at)||a.capture_id.localeCompare(b.capture_id));
  return {mode:'lexical',vector_search:false,freshness:freshnessResult,commit:saved.commit,checked_at:saved.checked_at,results:results.slice(0,limit)};
}
async function captureCard(store,options={}) {
  const {row,provenance}=await selected(store,options);
  if(!row)return {...provenance,results:[]};
  const config=await store.config(),effective=await effectiveAnalysis(store,row,config);
  return {...provenance,mode:'lexical',vector_search:false,results:[card(row,effective.analysis,effective.state,provenance.checked_at)]};
}
module.exports={search,card,captureCard};
