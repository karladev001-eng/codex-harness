const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
async function panelApi() {
 const state={local:{},session:{}},scripts=[],native=[];
 const token='secret';let liveToken=token;const doc='document-1',tab={id:1,windowId:2,url:'https://example.com/page'};
 const source={url:tab.url,title:'Page',kind:'page',details:{},limitations:[]};
 const store=area=>({get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(state[area][key])])),set:async values=>Object.assign(state[area],structuredClone(values)),remove:async key=>delete state[area][key]});
 const api={runtime:{id:'extension',connectNative(){let receive;return {onMessage:{addListener:fn=>receive=fn},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){native.push(message);queueMicrotask(()=>receive({state:'sent',durable:true,operation_id:message.capture.operation_id}));}};}},storage:{local:store('local'),session:store('session')},action:{setBadgeText:async()=>{}},tabs:{get:async()=>tab,query:async()=>[tab],captureVisibleTab:async()=>{scripts.push('screenshot');return 'data:image/jpeg;base64,YWJj';}},scripting:{executeScript:async request=>{scripts.push([request.func.name,request.args,request.target]);if(request.func.name==='panelProbe')return[{documentId:doc,result:{session:liveToken,url:tab.url,time:1}}];if(request.func.name==='extractPage')return[{documentId:doc,result:{source:{...source,url:tab.url},content:{text:'BODY',headings:[],selection:''},html:'<p>BODY</p>',document_url:tab.url,time_origin:1}}];if(request.func.name==='mountPanel'){liveToken=request.args[0];return[{}];}if(request.func.name==='panelVisibility')return[{}];return[{documentId:doc,result:{url:tab.url,time:1}}];}}};
 state.session['panel:1']={token,documentId:doc,tabId:1,url:tab.url,time:1};
 const sender={id:'extension',frameId:0,documentId:doc,tab,url:tab.url};
 return {api,state,scripts,native,token,doc,tab,sender};
}
test('corner panel rejects forged sessions, other frames, documents, tabs and extension senders before privileged work',async()=>{
 const {handlePanelMessage}=await import('../knowledge/extension/worker.js');const f=await panelApi();
 const message={action:'retry',panel_session:f.token};
 for(const sender of [{...f.sender,id:'other'},{...f.sender,frameId:1},{...f.sender,documentId:'old'},{...f.sender,tab:{id:2}},{...f.sender,url:'https://evil.example'}])await assert.rejects(()=>handlePanelMessage(f.api,message,sender));
 await assert.rejects(()=>handlePanelMessage(f.api,{...message,panel_session:'forged'},f.sender));
 assert.equal(f.native.length,0);assert.equal(f.scripts.length,0);assert.deepEqual(f.state.local,{});
});
test('panel capture suspends and restores exact isolated host, binds source and prevents duplicate save/replay',async()=>{
 const {handlePanelMessage}=await import('../knowledge/extension/worker.js');const f=await panelApi();
 const result=await handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token,settings:{html:true,screenshot:true}},f.sender);
 const capture=result.capture;
 assert.deepEqual(f.scripts.filter(row=>Array.isArray(row)&&row[0]==='panelVisibility').map(row=>row[1]),[[true],[false]]);
 assert.ok(f.scripts.findIndex(row=>row==='screenshot')>f.scripts.findIndex(row=>row[0]==='panelVisibility'));
 assert.ok(f.scripts.filter(row=>Array.isArray(row)).every(row=>row[2].documentIds?.[0]===f.doc));
 assert.equal(f.native.length,0);assert.equal(f.state.local.pending,undefined);
 const request={action:'save',panel_session:f.token,capture:{...capture,source:{url:'https://forged.example'},content:{text:'FORGED'},note:'Memo',tags:['tag']}};
 assert.equal((await handlePanelMessage(f.api,request,f.sender)).state,'sent');
 assert.equal(f.native[0].capture.source.url,f.tab.url);assert.equal(f.native[0].capture.content.text,'BODY');assert.equal(f.native[0].capture.note,'Memo');
 assert.equal((await handlePanelMessage(f.api,request,f.sender)).state,'sent');assert.equal(f.native.length,1);
 assert.equal(f.state.local.pending,undefined);assert.equal(f.state.session['panel:1'].capture,undefined);
});
test('panel source identity rejects a same-url reload and restores capture visibility on extraction failure',async()=>{
 const {handlePanelMessage}=await import('../knowledge/extension/worker.js');const f=await panelApi(),execute=f.api.scripting.executeScript;
 f.api.scripting.executeScript=async request=>request.func.name==='panelProbe'?[{documentId:f.doc,result:{url:f.tab.url,time:2}}]:execute(request);
 await assert.rejects(()=>handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token},f.sender),/ページが移動/);assert.equal(f.native.length,0);
 f.api.scripting.executeScript=async request=>{if(request.func.name==='extractPage')throw Error('FAIL');return execute(request);};
 await assert.rejects(()=>handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token},f.sender),/FAIL/);
 assert.deepEqual(f.scripts.filter(row=>row[0]==='panelVisibility').map(row=>row[1]),[[true],[false]]);
});
test('panel session remains authorized after worker restart; manifest uses user-triggered commands with no page bridge',async()=>{
 const f=await panelApi(),worker=await import('../knowledge/extension/worker.js?panel-restart');
 assert.equal((await worker.handlePanelMessage(f.api,{action:'captureStatus',panel_session:f.token},f.sender)).saving,false);
 const manifest=JSON.parse(await fs.readFile('knowledge/extension/manifest.json','utf8'));
 assert.equal(manifest.action.default_popup,undefined);assert.equal(manifest.commands['save-page'].suggested_key.mac,'Command+Shift+Y');
 assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.web_accessible_resources,undefined);assert.equal(manifest.externally_connectable,undefined);assert.equal(manifest.content_scripts,undefined);
 const source=await fs.readFile('knowledge/extension/panel.js','utf8');assert.match(source,/mode: 'closed'/);assert.match(source,/event\.isTrusted/);assert.match(source,/!event\.isComposing/);assert.doesNotMatch(source,/postMessage|dispatchEvent/);
});
test('open command reuses only the same source session, renews SPA identity, and restores restricted fallback action',async()=>{
 const {openPanel}=await import('../knowledge/extension/worker.js');const f=await panelApi();
 assert.equal((await openPanel(f.api,f.tab)).opened,true);assert.equal(f.state.session['panel:1'].token,f.token);
 f.tab.url='https://example.com/next';await openPanel(f.api,f.tab);
 assert.notEqual(f.state.session['panel:1'].token,f.token);assert.equal(f.state.session['panel:1'].url,f.tab.url);
 const fallback=[];f.api.action.setPopup=async value=>fallback.push(value);f.api.action.openPopup=async value=>fallback.push(value);
 assert.equal((await openPanel(f.api,{...f.tab,url:'chrome://settings'})).fallback,true);
 assert.deepEqual(fallback,[{tabId:1,popup:'popup.html'},{windowId:2},{tabId:1,popup:''}]);
});
test('completed panel replay keeps its own minimal result when another tab finishes and restoration runs after frame-barrier failure',async()=>{
 const {handlePanelMessage}=await import('../knowledge/extension/worker.js');const f=await panelApi();
 f.state.session['panel:1'].completed='own-save';f.state.session['panel:1'].completion={state:'sent',operation_id:'own-save'};
 f.state.local.captureResult={state:'error',operation_id:'other-save',unread:true};
 assert.deepEqual(await handlePanelMessage(f.api,{action:'save',panel_session:f.token,capture:{operation_id:'own-save'}},f.sender),{state:'sent',operation_id:'own-save'});
 assert.equal(f.state.local.captureResult.operation_id,'other-save');assert.equal(f.native.length,0);
 const execute=f.api.scripting.executeScript;
 f.api.scripting.executeScript=async request=>{if(request.func.name==='panelVisibility'&&request.args[0]){f.scripts.push(['panelVisibility',request.args,request.target]);throw Error('FRAME_TIMEOUT');}return execute(request);};
 await assert.rejects(()=>handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token},f.sender),/FRAME_TIMEOUT/);
 assert.deepEqual(f.scripts.filter(row=>row[0]==='panelVisibility').map(row=>row[1]),[[true],[false]]);
});
test('held save A cannot overwrite the new SPA session B or its draft authority when A finishes',async()=>{
 const worker=await import('../knowledge/extension/worker.js');const f=await panelApi();
 const {capture}=await worker.handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token,settings:{screenshot:false}},f.sender);
 let releaseNative,ready;const nativeReady=new Promise(resolve=>ready=resolve);
 f.api.runtime.connectNative=()=>{let receive;return{onMessage:{addListener:fn=>receive=fn},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){f.native.push(message);releaseNative=()=>receive({state:'sent',durable:true,operation_id:message.capture.operation_id});ready();}};};
 const saving=worker.handlePanelMessage(f.api,{action:'save',panel_session:f.token,capture:{...capture,note:'A memo'}},f.sender);
 await nativeReady;f.tab.url='https://example.com/page-b';await worker.openPanel(f.api,f.tab);
 const newer=f.state.session['panel:1'];assert.notEqual(newer.token,f.token);newer.draftAuthority='B draft';
 const snapshot=structuredClone(newer);releaseNative();assert.equal((await saving).state,'sent');
 assert.deepEqual(f.state.session['panel:1'],snapshot);
 const senderB={...f.sender,url:f.tab.url};
 assert.equal((await worker.authorizePanel(f.api,{panel_session:newer.token},senderB)).session.token,newer.token);
 await assert.rejects(()=>worker.authorizePanel(f.api,{panel_session:f.token},f.sender));
 const fresh=await worker.handlePanelMessage(f.api,{action:'panelAcquire',panel_session:newer.token,settings:{screenshot:false}},senderB);
 assert.equal(fresh.capture.source.url,f.tab.url);assert.equal(f.state.session['panel:1'].draftAuthority,'B draft');
 assert.equal(f.state.local.pending,undefined);assert.equal(f.native.length,1);
});
test('capture A completing after a SPA session B opens cannot replace B or install stale acquired source',async()=>{
 const worker=await import('../knowledge/extension/worker.js');const f=await panelApi(),execute=f.api.scripting.executeScript;
 let restore,ready;const restoreReady=new Promise(resolve=>ready=resolve);
 f.api.scripting.executeScript=async request=>{if(request.func.name==='panelVisibility'&&request.args[0]===false){ready();await new Promise(resolve=>restore=resolve);}return execute(request);};
 const acquiring=worker.handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token,settings:{screenshot:false}},f.sender);
 // Register the expected rejection before releasing the old asynchronous capture.
 const rejected=assert.rejects(()=>acquiring,/ページが移動/);
 await restoreReady;f.tab.url='https://example.com/page-b';await worker.openPanel(f.api,f.tab);
 const newer=f.state.session['panel:1'];newer.draftAuthority='B draft';const snapshot=structuredClone(newer);
 restore();await rejected;assert.deepEqual(f.state.session['panel:1'],snapshot);
 const senderB={...f.sender,url:f.tab.url};assert.equal((await worker.authorizePanel(f.api,{panel_session:newer.token},senderB)).session.token,newer.token);
 assert.equal(f.native.length,0);
});
async function panelUi({pending=false,saving=false,acquireFailures=0,initialResult,saveState='sent',holdAck=false}={}) {
 const vm=require('node:vm'),{mountPanel}=await import('../knowledge/extension/panel.js');
 const ids=['heading','editor','title','url','note','tags','save','html','screenshot','scope','body','limitations','status','close','acquire','retry','new'];
 let elements,root,host;
 const createHost=()=>{
 const ownElements=Object.fromEntries(ids.map(id=>[id,{value:'',hidden:false,checked:true,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},replaceChildren(){},focus(){ownRoot.activeElement=this;document.activeElement=ownHost;}}]));
 const ownRoot={activeElement:undefined,getElementById:id=>ownElements[id],listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
 const style={setProperty(key,value){this[key]=value;},getPropertyValue(key){return this[key]||'';}};
 const ownHost={style,isConnected:true,attachShadow:()=>ownRoot,remove(){this.isConnected=false;}};
 elements=ownElements;root=ownRoot;host=ownHost;return ownHost;};
 let restoredFocus=0;
 const pageFocus={isConnected:true,focus(){restoredFocus++;document.activeElement=this;}};
 const document={activeElement:pageFocus,documentElement:{appendChild(){}},createElement:tag=>tag==='div'?createHost():{}};
 const calls=[],state={...((pending||saving)?{pending,saving,operation_id:'retry-operation'}:{}),...(initialResult?{result:structuredClone(initialResult)}:{})};
 const capture={operation_id:'new-operation',source:{title:'Source',url:'https://example.com/a',limitations:[]},content:{text:'Body'}};
 const listeners=new Set(),acknowledgements=[];
 const api={storage:{onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},runtime:{sendMessage:async message=>{calls.push(message);if(message.action==='acknowledge'&&holdAck)return new Promise((resolve,reject)=>acknowledgements.push({resolve,reject}));if(message.action==='captureStatus')return structuredClone(state);if(message.action==='panelAcquire'){if(acquireFailures-->0)return {state:'error',reason:'ページが移動しました。保存パネルを開き直してください。'};return {capture:{...capture,source:{...capture.source,url:context.location.href}}};}if(message.action==='retry'){state.pending=false;return{state:'sent',operation_id:'retry-operation'};}if(message.action==='save')return{state:saveState,operation_id:'new-operation'};return{};}}};
 let now=0,nextTimer=0;const timers=new Map();
 const context=vm.createContext({document,chrome:api,location:{href:'https://example.com/a',origin:'https://example.com'},setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(`(${mountPanel.toString()})('session')`,context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 return {api,state,timers,releaseAck:error=>{for(const ack of acknowledgements.splice(0))if(error)ack.reject(error);else ack.resolve({});},get host(){return host;},get panel(){return context.__knowledgeCapturePanel;},get restoredFocus(){return restoredFocus;},get pageActive(){return document.activeElement;},focusPage:()=>{document.activeElement={isConnected:true,focus(){}};return document.activeElement;},advance:ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}},publishCompletion:result=>{state.pending=false;state.saving=false;state.result=structuredClone(result);for(const listener of listeners)listener({captureResult:{newValue:structuredClone(result)}},'local');},get elements(){return elements;},get root(){return root;},calls,settle,navigate:url=>{context.location.href=url;context.location.origin=new URL(url).origin;},reopen:(token='session')=>vm.runInContext(`(${mountPanel.toString()})(${JSON.stringify(token)})`,context)};
}
test('retry success is acknowledged and the next command opens a fresh focused memo',async()=>{
 const ui=await panelUi({pending:true});assert.equal(Boolean(ui.elements.retry.hidden),false);
 ui.elements.retry.listeners.click({isTrusted:true});await ui.settle();
 assert.equal(ui.elements.editor.hidden,true);assert.ok(ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='retry-operation'));
 ui.reopen();await ui.settle();assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.root.activeElement,ui.elements.note);
 assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,1);
});
test('panel ignores synthetic save events and composing Enter, but trusted command Enter submits once',async()=>{
 const ui=await panelUi();
 ui.elements.note.value='Draft';ui.elements.save.listeners.click({isTrusted:false});
 const key={isTrusted:true,metaKey:true,key:'Enter',preventDefault(){},stopPropagation(){}};
 ui.root.listeners.keydown({...key,isComposing:true});ui.root.listeners.compositionstart();ui.root.listeners.keydown(key);ui.root.listeners.compositionend();
 await ui.settle();assert.equal(ui.calls.filter(row=>row.action==='save').length,0);
 ui.root.listeners.keydown(key);ui.root.listeners.keydown(key);await ui.settle();
 assert.equal(ui.calls.filter(row=>row.action==='save').length,1);assert.equal(ui.calls.find(row=>row.action==='save').capture.note,'Draft');
});

test('SPA reopen accepts an old same-document sender URL only while the live panel has current identity',async()=>{
 const worker=await import('../knowledge/extension/worker.js'),f=await panelApi();
 f.tab.url='https://example.com/next';await worker.openPanel(f.api,f.tab);
 const token=f.state.session['panel:1'].token;
 const fresh=await worker.handlePanelMessage(f.api,{action:'panelAcquire',panel_session:token,settings:{screenshot:false}},f.sender);
 assert.equal(fresh.capture.source.url,f.tab.url);assert.equal(f.native.length,0);
 f.tab.url='https://example.com/later';
 for(const action of ['captureStatus','retry','acknowledge'])await assert.rejects(()=>worker.handlePanelMessage(f.api,{action,panel_session:token},f.sender),/ページが移動/);
 assert.equal(f.native.length,0);
});
test('reopening a failed existing panel reacquires and retains the unsent memo and tags',async()=>{
 const ui=await panelUi({acquireFailures:1});assert.equal(ui.elements.save.disabled,true);
 ui.elements.note.value='Unsent memo';ui.elements.tags.value='reference, UI';
 ui.reopen();await ui.settle();
 assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,2);assert.equal(ui.elements.save.disabled,false);
 assert.equal(ui.elements.note.value,'Unsent memo');assert.equal(ui.elements.tags.value,'reference, UI');
 assert.equal(ui.calls.filter(row=>row.action==='save').length,0);
});
test('a replacement SPA panel preserves unsent draft inputs while reacquiring the page',async()=>{
 const ui=await panelUi();ui.elements.note.value='Unsent memo';ui.elements.tags.value='reference, UI';
 ui.reopen('new-session');await ui.settle();
 assert.equal(ui.elements.note.value,'Unsent memo');assert.equal(ui.elements.tags.value,'reference, UI');
 assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,2);assert.equal(ui.elements.save.disabled,false);
 assert.equal(ui.calls.filter(row=>row.action==='save').length,0);
});

test('live probe rejects a detached isolated panel and acquisition navigation during visibility restoration',async()=>{
 const worker=await import('../knowledge/extension/worker.js'),f=await panelApi(),execute=f.api.scripting.executeScript;
 f.api.scripting.executeScript=async request=>request.func.name==='panelProbe'?[{documentId:f.doc,result:{session:'detached',url:f.tab.url,time:1}}]:execute(request);
 await assert.rejects(()=>worker.handlePanelMessage(f.api,{action:'retry',panel_session:f.token},f.sender),/ページが移動/);
 f.api.scripting.executeScript=async request=>{const result=await execute(request);if(request.func.name==='panelVisibility'&&request.args[0]===false)f.tab.url='https://example.com/moved';return result;};
 await assert.rejects(()=>worker.handlePanelMessage(f.api,{action:'panelAcquire',panel_session:f.token,settings:{screenshot:false}},f.sender),/ページが移動/);
 assert.equal(f.state.session['panel:1'].capture,undefined);assert.equal(f.native.length,0);
});
test('a queued retry rechecks source identity before sending any native operation',async()=>{
 const worker=await import('../knowledge/extension/worker.js'),f=await panelApi();
 let release,ready;const held=new Promise(resolve=>ready=resolve);
 const barrier=worker.serialized(async()=>{ready();await new Promise(resolve=>release=resolve);});await held;
 const retry=worker.handlePanelMessage(f.api,{action:'retry',panel_session:f.token},f.sender);
 const rejected=assert.rejects(()=>retry,/ページが移動/);
 await new Promise(resolve=>setImmediate(resolve));f.tab.url='https://example.com/moved';release();await barrier;await rejected;
 assert.equal(f.native.length,0);assert.deepEqual(f.state.local,{});
});
test('a different-origin replacement and a completed editor do not carry an old memo into a new draft',async()=>{
 const ui=await panelUi();ui.elements.note.value='Origin memo';ui.elements.tags.value='private';
 ui.navigate('https://other.example/page');ui.reopen('other-session');await ui.settle();
 assert.equal(ui.elements.note.value,'');assert.equal(ui.elements.tags.value,'');
 ui.elements.note.value='Saved memo';ui.elements.save.listeners.click({isTrusted:true});await ui.settle();assert.equal(ui.elements.editor.hidden,true);
 ui.reopen('next-session');await ui.settle();assert.equal(ui.elements.note.value,'');assert.equal(ui.elements.tags.value,'');
 assert.equal(ui.calls.filter(row=>row.action==='save').length,1);
});

test('an unread result from another operation at the same URL cannot replace a preserved SPA draft',async()=>{
 for(const state of ['sent','pending']){
  const ui=await panelUi();ui.elements.note.value='Unsent draft';ui.elements.tags.value='keep';ui.elements.screenshot.checked=false;
  ui.navigate('https://example.com/b');ui.reopen('session-b');await ui.settle();
  ui.state.result={state,operation_id:'other-tab-operation',source_url:'https://example.com/a',unread:true};
  ui.navigate('https://example.com/a');ui.reopen('replacement-session');await ui.settle();
  assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.save.disabled,false);
  ui.reopen('replacement-session');await ui.settle();
  assert.equal(ui.elements.note.value,'Unsent draft');assert.equal(ui.elements.tags.value,'keep');assert.equal(ui.elements.screenshot.checked,false);
  assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,3);
  assert.equal(ui.calls.filter(row=>row.action==='save'||row.action==='acknowledge').length,0);
 }
});
test('a new panel without a carried draft still restores and acknowledges its unread saved result',async()=>{
 for(const state of ['sent','pending']){
  const ui=await panelUi({initialResult:{state,operation_id:'previous-save',source_url:'https://example.com/a',unread:true}});
  assert.equal(ui.elements.editor.hidden,true);assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,0);
  assert.ok(ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='previous-save'));
  assert.equal(ui.calls.filter(row=>row.action==='save').length,0);
 }
});

test('old pending or saving completion unlocks acquisition while preserving a carried unsent SPA draft',async()=>{
 for(const phase of ['pending','saving'])for(const completion of ['sent','pending'])for(const ownCompletion of ['sent','pending']){
  const ui=await panelUi({[phase]:true,saveState:ownCompletion});ui.elements.note.value='New unsent draft';ui.elements.tags.value='keep';ui.elements.html.checked=false;
  ui.navigate('https://example.com/b');ui.reopen('session-b');await ui.settle();assert.equal(ui.elements.save.disabled,true);
  ui.publishCompletion({state:completion,operation_id:'retry-operation',source_url:'https://example.com/a',unread:true});await ui.settle();
  assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.save.disabled,false);
  assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,1);
  ui.reopen('session-b');await ui.settle();
  assert.equal(ui.elements.note.value,'New unsent draft');assert.equal(ui.elements.tags.value,'keep');assert.equal(ui.elements.html.checked,false);
  assert.equal(ui.calls.filter(row=>row.action==='save'||row.action==='acknowledge').length,0);
  const transport=ui.api.runtime.sendMessage;
  ui.api.runtime.sendMessage=async message=>{
   if(message.action==='save')ui.publishCompletion({state:ownCompletion,operation_id:message.capture.operation_id,source_url:'https://example.com/b',unread:true});
   return transport(message);
  };
  ui.elements.save.listeners.click({isTrusted:true});await ui.settle();
  assert.equal(ui.elements.editor.hidden,true);assert.equal(ui.calls.filter(row=>row.action==='save').length,1);
  assert.equal(ui.calls.find(row=>row.action==='save').capture.note,'New unsent draft');assert.equal(ui.calls.find(row=>row.action==='save').capture.source.url,'https://example.com/b');
  assert.ok(ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='new-operation'));
  assert.ok(!ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='retry-operation'));
 }
});
test('explicit retry of an old pending operation retains a carried draft and resumes current acquisition',async()=>{
 const ui=await panelUi({pending:true});ui.elements.note.value='New unsent draft';ui.elements.tags.value='keep';
 ui.navigate('https://example.com/b');ui.reopen('session-b');await ui.settle();
 ui.elements.retry.listeners.click({isTrusted:true});await ui.settle();
 assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.save.disabled,false);
 assert.equal(ui.elements.note.value,'New unsent draft');assert.equal(ui.elements.tags.value,'keep');
 assert.equal(ui.calls.filter(row=>row.action==='panelAcquire').length,1);
 assert.ok(ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='retry-operation'));
 assert.equal(ui.calls.filter(row=>row.action==='save').length,0);
});

test('sent save and retry auto-close after 800ms and the next command focuses an empty memo',async()=>{
 for(const action of ['save','retry']){
  const ui=await panelUi({pending:action==='retry'});ui.elements.note.value='Saved memo';ui.elements.tags.value='saved';
  ui.elements[action].listeners.click({isTrusted:true});await ui.settle();
  assert.equal(ui.elements.heading.textContent,'保存しました');assert.equal(ui.timers.size,1);
  ui.advance(799);assert.equal(ui.host.style.display,'block');
  ui.advance(1);assert.equal(ui.host.style.display,'none');assert.equal(ui.restoredFocus,1);
  ui.reopen();await ui.settle();assert.equal(ui.host.style.display,'block');assert.equal(ui.elements.note.value,'');assert.equal(ui.elements.tags.value,'');assert.equal(ui.root.activeElement,ui.elements.note);
 }
});
test('pending, error and saving stay open; own storage completion schedules close without stealing page focus',async()=>{
 for(const phase of ['pending','error','saving']){
  const ui=await panelUi(phase==='saving'?{saving:true}:{saveState:phase});
  if(phase!=='saving'){ui.elements.save.listeners.click({isTrusted:true});await ui.settle();}
  assert.equal(ui.timers.size,0);ui.advance(10000);assert.equal(ui.host.style.display,'block');
 }
 const ui=await panelUi({saving:true});
 ui.publishCompletion({state:'sent',operation_id:'retry-operation',unread:true});await ui.settle();
 assert.equal(ui.timers.size,1);const active=ui.focusPage();ui.advance(800);
 assert.equal(ui.host.style.display,'none');assert.equal(ui.pageActive,active);assert.equal(ui.restoredFocus,0);
});
test('reopen, new memo, manual close and session replacement invalidate even a queued stale close callback',async()=>{
 for(const action of ['reopen','new','close','replace','destroy']){
  const ui=await panelUi();ui.elements.save.listeners.click({isTrusted:true});await ui.settle();
  const oldHost=ui.host,stale=[...ui.timers.values()][0].callback;
  if(action==='reopen')ui.reopen();
  else if(action==='replace')ui.reopen('replacement-session');
  else if(action==='destroy')ui.panel.destroy();
  else ui.elements[action].listeners.click({isTrusted:true});
  await ui.settle();assert.equal(ui.timers.size,0);
  if(['reopen','new','replace'].includes(action)){ui.elements.note.value='New draft';stale();ui.advance(10000);assert.equal(ui.host.style.display,'block');assert.equal(ui.elements.note.value,'New draft');}
  else {const restored=ui.restoredFocus;stale();assert.equal(ui.restoredFocus,restored);if(action==='destroy')assert.equal(oldHost.isConnected,false);else assert.equal(oldHost.style.display,'none');}
 }
});
test('manual close during a held save stays closed after completion and never schedules an old close',async()=>{
 const ui=await panelUi(),transport=ui.api.runtime.sendMessage;let release;
 ui.api.runtime.sendMessage=message=>message.action==='save'?new Promise(resolve=>release=()=>resolve({state:'sent',operation_id:'new-operation'})):transport(message);
 ui.elements.save.listeners.click({isTrusted:true});await ui.settle();
 assert.equal(ui.elements.save.disabled,true);ui.elements.close.listeners.click({isTrusted:true});release();await ui.settle();
 assert.equal(ui.host.style.display,'none');assert.equal(ui.timers.size,0);
 ui.reopen();await ui.settle();assert.equal(ui.elements.note.value,'');assert.equal(ui.root.activeElement,ui.elements.note);
});
test('another operation completing cannot schedule a close for a preserved draft',async()=>{
 for(const action of ['storage','retry']){
  const ui=await panelUi({pending:true});ui.elements.note.value='Keep draft';ui.reopen('replacement-session');await ui.settle();
  if(action==='retry')ui.elements.retry.listeners.click({isTrusted:true});
  else ui.publishCompletion({state:'sent',operation_id:'retry-operation',unread:true});
  await ui.settle();assert.equal(ui.timers.size,0);ui.advance(10000);assert.equal(ui.host.style.display,'block');assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.note.value,'Keep draft');
 }
});

test('held success ACK does not delay automatic close or the next empty focused memo in any result path',async()=>{
 for(const action of ['save','retry','storage','bootstrap'])for(const reject of [false,true]){
  const ui=await panelUi({holdAck:true,pending:action==='retry',saving:action==='storage',initialResult:action==='bootstrap'?{state:'sent',operation_id:'previous-save',source_url:'https://example.com/a',unread:true}:undefined});
  if(['save','retry'].includes(action)){ui.elements.note.value='Saved memo';ui.elements.tags.value='saved';ui.elements[action].listeners.click({isTrusted:true});}
  else if(action==='storage')ui.publishCompletion({state:'sent',operation_id:'retry-operation',unread:true});
  await ui.settle();const acknowledged=ui.calls.filter(row=>row.action==='acknowledge');assert.equal(acknowledged.length,1);assert.equal(ui.elements.new.disabled,false);
  ui.advance(800);assert.equal(ui.host.style.display,'none');
  const transport=ui.api.runtime.sendMessage;let releaseAcquire;
  ui.api.runtime.sendMessage=message=>message.action==='panelAcquire'?new Promise(resolve=>releaseAcquire=async()=>resolve(await transport(message))):transport(message);
  ui.reopen();await ui.settle();assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.note.value,'');assert.equal(ui.elements.tags.value,'');assert.equal(ui.root.activeElement,ui.elements.note);
  ui.elements.note.value='New draft';const currentStatus=ui.elements.status.textContent;
  ui.releaseAck(reject?Error('ACK failed'):undefined);await ui.settle();ui.advance(10000);
  assert.equal(ui.host.style.display,'block');assert.equal(ui.elements.editor.hidden,false);assert.equal(ui.elements.note.value,'New draft');assert.equal(ui.elements.status.textContent,currentStatus);assert.equal(ui.timers.size,0);
  await releaseAcquire();await ui.settle();assert.equal(ui.elements.save.disabled,false);assert.equal(ui.elements.note.value,'New draft');assert.equal(ui.root.activeElement,ui.elements.note);
  assert.equal(ui.calls.filter(row=>row.action==='save').length,action==='save'?1:0);assert.deepEqual(ui.calls.filter(row=>row.action==='acknowledge'),acknowledged);
 }
});
test('a current ACK failure is reported without an unhandled rejection or automatic close',async()=>{
 const ui=await panelUi({holdAck:true});ui.elements.save.listeners.click({isTrusted:true});await ui.settle();
 ui.releaseAck(Error('ACK failed'));await ui.settle();assert.equal(ui.elements.status.textContent,'ACK failed');assert.equal(ui.timers.size,0);
 ui.advance(10000);assert.equal(ui.host.style.display,'block');
});
