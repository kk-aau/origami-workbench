const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../src-tauri/src/bridge.js'),'utf8');

function bridge({nested=false, file=null, windowState={maximized:false,fullscreen:false},context=null}={}) {
  const calls=[],entries=new Map(),requests=[];
  const native=new Map();
  const window={
    addEventListener(type,callback){if(!native.has(type))native.set(type,new Set());native.get(type).add(callback);},
    removeEventListener(type,callback){native.get(type)?.delete(callback);},
    confirm(){return true;},
    __TAURI_INTERNALS__:{async invoke(command,args){calls.push({command,args});if(command==='desktop_open_project')return file??new ArrayBuffer(0);if(command==='desktop_window_state')return windowState;}},
  };
  if(context)window.__zhezhiHostContext=context;
  window.top=nested?{}:window;
  class XMLHttpRequest {
    open(method,url,async){assert.equal(async,false);requests.push({method,url,synchronous:true});this.method=method;this.url=url;}
    setRequestHeader(){}
    send(body){
      this.status=200;
      let result;
      if(this.url==='/api/health')result={token:'test-token'};
      else if(this.method==='GET')result={value:entries.get(new URL(this.url,'http://127.0.0.1').searchParams.get('key'))??null};
      else {
        const data=JSON.parse(body);
        if('expectedValue' in data && (entries.get(data.key)??null)!==data.expectedValue){this.status=409;result={error:'conflict'};}
        else {entries.set(data.key,data.value);result={value:null};}
      }
      this.responseText=JSON.stringify(result);
    }
  }
  async function fetch(url,options={}){
    requests.push({method:options.method??'GET',url,synchronous:false});let status=200,result;
    if(url==='/api/health')result={token:'test-token'};
    else if(url.endsWith('/snapshot'))result={values:Object.fromEntries([...entries].filter(([key])=>key!=='zhezhi.diagram-project.v1'))};
    else if((options.method??'GET')==='GET')result={value:entries.get(new URL(url,'http://127.0.0.1').searchParams.get('key'))??null};
    else{const data=JSON.parse(options.body);if('expectedValue'in data&&(entries.get(data.key)??null)!==data.expectedValue){status=409;result={error:'conflict'};}else{entries.set(data.key,data.value);result={value:null};}}
    return {ok:status===200,status,json:async()=>result};
  }
  vm.runInNewContext(source,{window,addEventListener:window.addEventListener.bind(window),location:{pathname:'/'},XMLHttpRequest,fetch,Event,Set,Object,console,Uint8Array,DataView,TextDecoder});
  return {window,calls,entries,native,requests};
}

test('desktop settings preload asynchronously and repeated UI reads never issue requests',async()=>{
  const {window,entries,requests}=bridge(),prefs=window.desktop.preferences;
  entries.set('zhezhi.theme.v1','dark');entries.set('zhezhi.diagram-project.v1','large drawing');await prefs.refresh();
  assert(requests.every(request=>!request.synchronous));const count=requests.length;
  for(let i=0;i<100;i++)assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');
  assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),null);assert.equal(requests.length,count);
  assert.equal(await prefs.getItemAsync('zhezhi.diagram-project.v1'),'large drawing');assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),'large drawing');
  assert(requests.every(request=>!request.synchronous));
});
test('desktop unchanged small-setting sets skip startup requests but explicit CAS still checks the service',async()=>{
  const {window,entries,requests}=bridge(),prefs=window.desktop.preferences;entries.set('zhezhi.theme.v1','dark');await prefs.refresh();const before=requests.length;
  prefs.setItem('zhezhi.theme.v1','dark');assert.equal(requests.length,before);
  assert.equal(prefs.compareAndSet('zhezhi.theme.v1','dark','dark'),true);assert.equal(requests.length,before+1);
  prefs.setItem('zhezhi.theme.v1','light');assert.equal(requests.length,before+2);assert.equal(entries.get('zhezhi.theme.v1'),'light');
  entries.set('zhezhi.theme.v1','other window');prefs.setItem('zhezhi.theme.v1','light');assert.equal(requests.length,before+2);assert.equal(entries.get('zhezhi.theme.v1'),'other window');
  assert.throws(()=>prefs.setItem('zhezhi.theme.v1','changed'),/其他窗口/);
});

test('desktop async CAS preserves conflicts and directory refresh invalidates cached documents',async()=>{
  const {window,entries}=bridge(),prefs=window.desktop.preferences;entries.set('zhezhi.theme.v1','dark');await prefs.refresh();
  assert.equal(await prefs.compareAndSetAsync('zhezhi.theme.v1',null,'ours'),false);assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');
  assert.equal(await prefs.compareAndSetAsync('zhezhi.theme.v1','dark','light'),true);assert.equal(entries.get('zhezhi.theme.v1'),'light');assert.equal(prefs.getItem('zhezhi.theme.v1'),'light');
  entries.set('zhezhi.theme.v1','other window');assert.throws(()=>prefs.setItem('zhezhi.theme.v1','stale'),/其他窗口/);assert.equal(entries.get('zhezhi.theme.v1'),'other window');
  entries.set('zhezhi.diagram-project.v1','body');await prefs.getItemAsync('zhezhi.diagram-project.v1');await prefs.refresh(true);assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),null);
});

test('desktop document cache is bounded and pins preserve transactional reads without touching disk records',async()=>{
  const {window,entries}=bridge(),prefs=window.desktop.preferences;entries.set('zhezhi.theme.v1','dark');await prefs.refresh();
  const keys=Array.from({length:8},(_,i)=>'zhezhi.diagram-library-doc-'+String.fromCharCode(97+i).repeat(32)+'.v1');
  const release=prefs.retainRecords([keys[0]]);
  for(const key of keys){entries.set(key,'body');await prefs.getItemAsync(key);}
  assert.equal(prefs.getItem(keys[0]),'body');assert.throws(()=>prefs.getItem(keys[1]),/缓存已释放/);assert.equal(entries.get(keys[1]),'body');
  assert.throws(()=>prefs.setItem(keys[1],'body'),/缓存已释放/);
  release();assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');
});

test('synchronous preferences preserve compare-and-set conflict semantics',()=>{
  const {window,entries}=bridge();const prefs=window.desktop.preferences;
  assert.equal(prefs.getItem('zhezhi.theme.v1'),null);
  prefs.setItem('zhezhi.theme.v1','dark');assert.equal(prefs.getItem('zhezhi.theme.v1'),'dark');
  assert.equal(prefs.compareAndSet('zhezhi.theme.v1',null,'light'),false);
  assert.equal(entries.get('zhezhi.theme.v1'),'dark');
  assert.equal(prefs.compareAndSet('zhezhi.theme.v1','dark','light'),true);
});

test('native close handshake consults existing workspace guards and removals',async()=>{
  const {window,calls}=bridge();
  window.__zhezhiBeforeClose('clean');await Promise.resolve();
  assert.equal(calls.at(-1).args.dirty,false);
  const guard=event=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',guard);
  window.__zhezhiBeforeClose('dirty');await Promise.resolve();
  assert.equal(calls.at(-1).args.dirty,true);
  window.removeEventListener('beforeunload',guard);
  window.__zhezhiBeforeClose('removed');await Promise.resolve();
  assert.equal(calls.at(-1).args.dirty,false);
});

test('binary file bridge preserves UTF-8 name and unmodified file bytes',async()=>{
  const name=Buffer.from('中文大图.fold');const data=Buffer.from([0xff,0xfe,0x00,13,10]);
  const frame=Buffer.alloc(4+name.length+data.length);frame.writeUInt32LE(name.length);name.copy(frame,4);data.copy(frame,4+name.length);
  const {window}=bridge({file:frame.buffer.slice(frame.byteOffset,frame.byteOffset+frame.length)});
  const selected=await window.desktop.openProject('crease');
  assert.equal(selected.name,'中文大图.fold');assert.deepEqual(Buffer.from(selected.bytes),data);
  assert.equal(await bridge().window.desktop.openProject('crease'),null);
});

test('malformed binary envelopes fail without exposing partial data',async()=>{
  const {window}=bridge({file:Uint8Array.from([255,255,255,255]).buffer});
  await assert.rejects(window.desktop.openProject('crease'),/读取结果不完整/);
});

test('tool layout import uses its own native chooser kind and preserves JSON bytes',async()=>{
  const name=Buffer.from('我的工具排版.tool-layout.json');
  const data=Buffer.from(JSON.stringify({format:'zhezhi-tool-layout',version:1,name:'中文排版'}));
  const frame=Buffer.alloc(4+name.length+data.length);frame.writeUInt32LE(name.length);name.copy(frame,4);data.copy(frame,4+name.length);
  const {window,calls}=bridge({file:frame.buffer.slice(frame.byteOffset,frame.byteOffset+frame.length)});
  const selected=await window.desktop.openProject('tool-layout');
  assert.equal(calls.at(-1).command,'desktop_open_project');
  assert.equal(calls.at(-1).args.kind,'tool-layout');
  assert.equal(selected.name,'我的工具排版.tool-layout.json');
  assert.deepEqual(Buffer.from(selected.bytes),data);
  const cancelled=bridge();
  assert.equal(await cancelled.window.desktop.openProject('tool-layout'),null);
  assert.equal(cancelled.calls.at(-1).args.kind,'tool-layout');
});

test('desktop commands can unsubscribe and are not exposed inside iframe',()=>{
  const {window}=bridge();let seen=[];
  const off=window.desktop.onCommand(value=>seen.push(value));
  window.__zhezhiDesktopCommand('save');window.__zhezhiDesktopCommand('unsafe');off();window.__zhezhiDesktopCommand('save');
  assert.deepEqual(seen,['save']);assert.equal(bridge({nested:true}).window.desktop,undefined);
});

test('custom window controls invoke the guarded host actions, never bypass the close handshake',async()=>{
  const {window,calls}=bridge({windowState:{maximized:true,fullscreen:false}});
  assert.deepEqual(await window.desktop.window.getState(),{maximized:true,fullscreen:false});
  for(const action of ['minimize','toggleMaximize','toggleFullscreen','startDragging','close']) {
    await window.desktop.window[action]();
    assert.equal(calls.at(-1).command,'desktop_window_action');
    assert.equal(calls.at(-1).args.action,action);
  }
  assert.equal(calls.some(call=>/destroy|exit|force/i.test(call.command)),false);
  const guard=event=>event.preventDefault();
  window.addEventListener('beforeunload',guard);
  window.__zhezhiBeforeClose('custom-close');await Promise.resolve();
  assert.equal(calls.at(-1).command,'desktop_close_ack');
  assert.equal(calls.at(-1).args.dirty,true);
  await window.desktop.openDataDirectory();
  assert.equal(calls.at(-1).command,'desktop_open_data_directory');
});

test('custom chrome receives only boolean window state and unsubscribes cleanly',()=>{
  const {window}=bridge();const seen=[];
  const off=window.desktop.window.onStateChanged(state=>seen.push(state));
  window.__zhezhiWindowState({maximized:true,fullscreen:false,unexpected:'discarded'});
  window.__zhezhiWindowState({maximized:'yes',fullscreen:false});
  window.__zhezhiWindowState(null);
  off();window.__zhezhiWindowState({maximized:false,fullscreen:false});
  assert.equal(seen.length,1);
  assert.equal(seen[0].maximized,true);assert.equal(seen[0].fullscreen,false);
  assert.equal('unexpected' in seen[0],false);assert.equal(Object.isFrozen(seen[0]),true);
});

test('removing the native menu preserves print and fullscreen shortcuts without duplicating open/save',async()=>{
  const {window,calls,native}=bridge();const commands=[];
  window.desktop.onCommand(command=>commands.push(command));
  const key=(key,extra={})=>{const e={key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,defaultPrevented:false,repeat:false,isComposing:false,preventDefault(){this.defaultPrevented=true;},...extra};for(const handler of native.get('keydown')??[])handler(e);return e;};
  assert.equal(key('p',{ctrlKey:true}).defaultPrevented,true);
  assert.deepEqual(commands,['print']);
  assert.equal(key('F11').defaultPrevented,true);await Promise.resolve();
  assert.equal(calls.at(-1).args.action,'toggleFullscreen');
  const count=calls.length;
  for(const [value,options] of [['F11',{repeat:true}],['F11',{altKey:true}],['F11',{isComposing:true}],['p',{ctrlKey:true,defaultPrevented:true}],['p',{ctrlKey:true,shiftKey:true}],['s',{ctrlKey:true}],['o',{ctrlKey:true}]]) key(value,options);
  assert.equal(calls.length,count);assert.deepEqual(commands,['print']);
});

function exportBridge({prepare=async()=>({cancelled:false,ticket:'native-ticket',chunkBytes:1024*1024}),write,finish=async()=>({status:'saved',path:'D:\\图纸\\龙神.dxf'})}={}) {
  const calls=[];
  const window={addEventListener(){},removeEventListener(){},__TAURI_INTERNALS__:{async invoke(command,args,options){calls.push({command,args,options});if(command==='desktop_prepare_export')return prepare(args);if(command==='desktop_write_export')return write?write(args,options):Number(options.headers['x-zhezhi-export-offset'])+args.byteLength;if(command==='desktop_finish_export')return finish(args);if(command==='desktop_cancel_export')return true;}}};window.top=window;
  const document={createElement(){throw Error('Native exports must never create download anchors');}};
  vm.runInNewContext(source,{window,document,location:{pathname:'/'},Blob,Event,console,TextDecoder,Uint8Array,DataView,setTimeout(){throw Error('Native writes have no arbitrary deadline');},clearTimeout(){}});
  return {window,calls};
}

test('native export streams exact binary chunks without whole-file reads, URLs or browser downloads',async()=>{
  const f=exportBridge(),bytes=new Uint8Array(2*1024*1024+19);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const blob=new Blob([bytes]);blob.arrayBuffer=()=>{throw Error('Whole-file copy forbidden');};const progress=[];
  const result=await f.window.desktop.saveExport(blob,'龙神.dxf',{onProgress:(n,total)=>progress.push([n,total])});
  assert.equal(result.status,'saved');assert.equal(result.path,'D:\\图纸\\龙神.dxf');
  const chunks=f.calls.filter(c=>c.command==='desktop_write_export');assert.deepEqual(chunks.map(c=>c.args.byteLength),[1048576,1048576,19]);
  assert.deepEqual(Buffer.concat(chunks.map(c=>Buffer.from(c.args))),Buffer.from(bytes));
  assert.deepEqual(chunks.map(c=>c.options.headers['x-zhezhi-export-offset']),['0','1048576','2097152']);assert(chunks.every(c=>c.options.headers['x-zhezhi-export-ticket']==='native-ticket'));
  assert.deepEqual(progress.at(-1),[bytes.length,bytes.length]);assert.equal(f.calls.at(-1).command,'desktop_finish_export');
});
test('cancelled picker and already aborted requests never write or commit',async()=>{
  const f=exportBridge({prepare:async()=>({cancelled:true})});assert.equal((await f.window.desktop.saveExport(new Blob(['x']),'x.bin')).status,'cancelled');assert.equal(f.calls.length,1);
  const controller=new AbortController();controller.abort();const g=exportBridge();assert.equal((await g.window.desktop.saveExport(new Blob(['x']),'x.bin',{signal:controller.signal})).status,'cancelled');assert.equal(g.calls.length,0);
});
test('cancellation between chunks cleans the exact ticket and never commits',async()=>{
  const controller=new AbortController(),f=exportBridge();
  const result=await f.window.desktop.saveExport(new Blob([new Uint8Array(2*1024*1024)]),'x.bin',{signal:controller.signal,onProgress:n=>{if(n)controller.abort();}});
  assert.equal(result.status,'cancelled');assert.equal(f.calls.filter(c=>c.command==='desktop_write_export').length,1);assert.equal(f.calls.at(-1).command,'desktop_cancel_export');assert.equal(f.calls.at(-1).args.ticket,'native-ticket');
});
test('picker, write and commit failures never report success and clean allocated tickets',async()=>{
  for(const options of [{prepare:async()=>{throw Error('目录拒绝访问');}},{write:async()=>{throw Error('磁盘空间不足');}},{finish:async()=>{throw Error('同步写入失败');}}]){
    const f=exportBridge(options);await assert.rejects(f.window.desktop.saveExport(new Blob(['DXF']),'a.dxf'),/目录拒绝访问|磁盘空间不足|同步写入失败/);
    if(!options.prepare)assert.equal(f.calls.at(-1).command,'desktop_cancel_export');
  }
});
test('native export waits for acknowledged writes and final commit without time budgets',async()=>{
  let acknowledge,commit;const f=exportBridge({write:()=>new Promise(r=>acknowledge=r),finish:()=>new Promise(r=>commit=r)});
  let resolved=false;const pending=f.window.desktop.saveExport(new Blob(['DXF']),'x.dxf').then(r=>{resolved=true;return r;});await new Promise(r=>setImmediate(r));assert.equal(resolved,false);assert.equal(f.calls.at(-1).command,'desktop_write_export');
  acknowledge(3);await new Promise(r=>setImmediate(r));assert.equal(resolved,false);assert.equal(f.calls.at(-1).command,'desktop_finish_export');commit({status:'saved',path:'D:\\x.dxf'});assert.equal((await pending).status,'saved');
});
test('incorrect acknowledgements abort; zero-byte exports commit without a fake write',async()=>{
  const bad=exportBridge({write:async()=>999});await assert.rejects(bad.window.desktop.saveExport(new Blob(['x']),'x.bin'),/进度不匹配/);assert.equal(bad.calls.at(-1).command,'desktop_cancel_export');
  const empty=exportBridge();assert.equal((await empty.window.desktop.saveExport(new Blob([]),'empty.bin')).status,'saved');assert.equal(empty.calls.filter(c=>c.command==='desktop_write_export').length,0);
});


test('native document working draft keys are UUID-scoped while shared libraries and preferences remain shared',async()=>{
  const id='01234567-89ab-4cde-8fab-0123456789ab';
  const f=bridge({context:{role:'document',documentId:id}}),prefs=f.window.desktop.preferences;
  const scoped='zhezhi.document-'+id.replaceAll('-','').replace(/[0-9a-f]/g,d=>String.fromCharCode(97+parseInt(d,16)))+'-diagram-project.v1';
  assert.equal(f.window.desktop.role,'document');assert.equal(f.window.desktop.documentId,id);
  await prefs.compareAndSetAsync('zhezhi.diagram-project.v1',null,'own draft');
  assert.equal(f.entries.get(scoped),'own draft');assert.equal(f.entries.has('zhezhi.diagram-project.v1'),false);
  assert.equal(prefs.getItem('zhezhi.diagram-project.v1'),'own draft');assert.equal(await prefs.getItemAsync('zhezhi.diagram-project.v1'),'own draft');
  assert.equal(prefs.compareAndSet('zhezhi.diagram-project.v1','own draft','updated'),true);assert.equal(f.entries.get(scoped),'updated');
  for(const key of ['zhezhi.theme.v1','zhezhi.diagram-library.v1','zhezhi.base-design-library.v1']){await prefs.compareAndSetAsync(key,null,'shared');assert.equal(f.entries.get(key),'shared');}
  const other=bridge({context:{role:'document',documentId:'11111111-1111-4111-8111-111111111111'}});assert.equal(other.window.desktop.preferences.getItem('zhezhi.diagram-project.v1'),null);
});

test('document events preserve stable identity, dispatch whitelisted commands, and unsubscribe after reparent',async()=>{
  const f=bridge({context:{role:'document',documentId:'11111111-1111-4111-8111-111111111111'}}),docs=f.window.desktop.documents;
  const states=[],commands=[];const off=docs.subscribe(s=>states.push(s)),uncommand=docs.onCommand(c=>commands.push(c));
  f.window.__zhezhiDocumentsChanged({windowId:'main',windows:[],documents:[]});
  f.window.__zhezhiDocumentsChanged({windowId:'window-detached',windows:[],documents:[]});
  assert.equal(states[1].windowId,'window-detached');assert.equal(f.window.desktop.documentId,'11111111-1111-4111-8111-111111111111');
  f.window.__zhezhiDocumentCommand('save-artwork');f.window.__zhezhiDocumentCommand('print');f.window.__zhezhiDocumentCommand('eval');assert.deepEqual(commands,['save-artwork','print']);
  off();uncommand();f.window.__zhezhiDocumentsChanged({windowId:'main',windows:[],documents:[]});f.window.__zhezhiDocumentCommand('new');assert.equal(states.length,2);assert.equal(commands.length,2);
  await assert.rejects(docs.sendCommand('id','eval'),/不支持/);
  await docs.sendCommand('id','undo');assert.equal(f.calls.at(-1).command,'desktop_documents');assert.equal(f.calls.at(-1).args.action,'command');assert.equal(f.calls.at(-1).args.input.command,'undo');
});

test('native shell sends actual OS-menu requests without serializing a document or synthesizing a selected result',async()=>{
  const f=bridge({context:{role:'shell',documentId:null}}),docs=f.window.desktop.documents;
  await docs.popupMenu([{id:'layout:grid',label:'平铺',checked:true}],{x:80,y:40});
  const call=f.calls.at(-1);assert.equal(call.command,'desktop_documents');assert.equal(call.args.action,'popup');assert.equal(call.args.input.items[0].id,'layout:grid');assert.equal(call.args.input.x,80);assert.equal(call.args.input.y,40);
  await docs.report({dirty:true});assert.equal(f.calls.at(-1).args.action,'report');
});


test('document and shell creation keep initial open/new commands in the native handshake instead of client polling',async()=>{
  for(const role of ['shell','document']){const f=bridge({context:{role,documentId:role==='document'?'11111111-1111-4111-8111-111111111111':null}}),docs=f.window.desktop.documents;
    await docs.create('open');assert.equal(f.calls.at(-1).args.action,'create');assert.equal(f.calls.at(-1).args.input.initialCommand,'open');
    await docs.create('new');assert.equal(f.calls.at(-1).args.input.initialCommand,'new');
    await docs.create();assert.deepEqual(Object.keys(f.calls.at(-1).args.input),[]);
    await assert.rejects(docs.create('eval'),/新建或打开/);
  }
});
