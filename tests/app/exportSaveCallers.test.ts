import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import type {ExportSaveResult} from '../../src/app/api';

/** Exercise the actual component handlers without mounting unrelated canvases,
 * workers and document libraries. Only their surrounding state/services are
 * supplied here; the asynchronous control flow is taken from shipped source. */
function componentHandler(file:string,name:string,environment:Record<string,unknown>):()=>Promise<unknown>{
  const source=ts.createSourceFile(file,readFileSync(new URL(`../../src/${file}`,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let body:ts.Node|undefined;
  const visit=(node:ts.Node)=>{
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name)body=node;
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer)body=node.initializer;
    ts.forEachChild(node,visit);
  };
  visit(source);assert.ok(body,`${file} must contain ${name}`);
  const script=ts.transpileModule(`const handler=(${body.getText(source)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(environment),`${script}\nreturn handler;`)(...Object.values(environment));
}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
type HandlerCase={file:string;name:string;signal?:boolean;exportFlag?:boolean;pdf?:boolean};
const handlers:HandlerCase[]=[
  ...['saveArtwork','exportCurrentModel','exportCollection','exportRecoveryBackup','doExport'].map(name=>({file:'App.tsx',name})),
  {file:'components/ActivityLogPanel.tsx',name:'exportLog',signal:true},
  {file:'components/CPProcessingExportDialog.tsx',name:'exportFile',signal:true,exportFlag:true},
  {file:'components/CPProcessingExportDialog.tsx',name:'exportReport',signal:true},
  {file:'components/DiagramWorkspace.tsx',name:'downloadProjectBackup'},
  {file:'components/DiagramWorkspace.tsx',name:'exportDrawing',signal:true},
  {file:'components/DiagramPDFExport.tsx',name:'exportPDF',signal:true,pdf:true},
];
function fixture(spec:HandlerCase){
  const pending=deferred<ExportSaveResult>(),started=deferred<void>(),messages:string[]=[],errors:string[]=[],busy:boolean[]=[],exported:boolean[]=[],progress:string[]=[];
  const doc={name:'保存测试'},step={id:'step-1',annotations:[{kind:'line'}]},project={name:'折序测试',activeStepId:step.id,steps:[step],states:[]};
  let calls=0,signal:AbortSignal|undefined;
  const download=(...args:unknown[])=>{calls++;signal=(args.at(-1) as {signal?:AbortSignal})?.signal;started.resolve();return pending.promise;};
  const report=(value:string)=>messages.push(value),failure=(value:string)=>errors.push(value),setBusy=(value:boolean)=>busy.push(value);
  const environment:Record<string,unknown>={
    download,downloadBlob:download,saveDownload:download,safeName:(name:string)=>name,inform:report,message:report,onMessage:report,onExported:report,
    setError:failure,setExportError:failure,setExportBusy:setBusy,setSavingArtwork:setBusy,setExporting:setBusy,setSaving:setBusy,setBusy,setBackupSaving:setBusy,setSVGExporting:setBusy,
    setNotice:(value:string)=>{if(value)messages.push(value);},setProgress:(value:string)=>progress.push(value),setExported:(value:boolean)=>exported.push(value),
    errorText:(cause:Error)=>cause.message,flatBusy:false,busy:false,
    artworkSaveLock:{current:false},exportLock:{current:false},backupSaveLock:{current:false},exportRequest:{current:null},saveRequest:{current:null},
    exportController:{current:null},svgPreparation:{current:null},svgSaveController:{current:null},mounted:{current:true},activeRef:{current:true},
    generation:{current:0},fileGeneration:{current:0},doc,docRef:{current:doc},flatSource:{doc},modelRef:{current:{present:{}}},modelsRef:{current:{}},projectRef:{current:project},
    captureArtwork:async()=>'{"artwork":true}',exportModelSnapshot:()=>'{"model":true}',exportModelCollection:()=>'{"models":true}',exportDiagramProject:()=>'{"diagram":true}',
    recoveryAlternatives:[{doc}],exportDocument:()=>({text:'{"document":true}',warnings:[]}),storedCurveDesign:null,exportFormat:'json',cpCoordinates:'paper',
    setTimeout:(resolve:()=>void)=>{resolve();return 0;},
    recordActivity:()=>{},flushActivityLog:async()=>true,setPendingWarning:()=>{},api:async()=>({format:'zhezhi-activity-log',version:1,entries:[],generatedAt:'2026-10-28'}),
    plan:{options:{},analysis:{},groups:[],paths:[]},files:{dxf:'DXF',report:{format:'dxf'},warnings:[]},input:{options:{}},settings:{},processingPreviewStatistics:()=>({}),
    flushFields:()=>{},diagramLayerDisplaySignature:()=> 'unchanged',startDiagramLayerDisplayPreparation:()=>({promise:Promise.resolve({project,issues:[]}),cancel:()=>{}}),
    drawingSVG:()=>'<svg/>',diagramPDFStepLabel:()=> '步骤 1',diagramStepZoom:()=>null,lineDefaults:{},adaptiveLines:false,
    planned:{plan:{pages:[{}]}},preparedProject:project,project,options:{title:'PDF 测试'},palette:{},exportDiagramPDF:async()=>new Blob(['PDF']),
  };
  return {run:componentHandler(spec.file,spec.name,environment),pending,started,messages,errors,busy,exported,progress,environment,get calls(){return calls;},get signal(){return signal;}};
}

for(const spec of handlers)test(`${spec.name} waits for the real save result and handles saved, browser, cancel and failure without a premature success`,async()=>{
  for(const status of ['saved','browser','cancelled','error'] as const){
    const f=fixture(spec),before=structuredClone(f.environment.doc),task=f.run();
    await f.started.promise;
    assert.equal(f.calls,1);assert.deepEqual(f.messages,[],'no success before disk write settles');assert.deepEqual(f.exported,[]);
    assert.equal(f.busy.at(-1),true,'busy remains active during native save');
    await f.run();assert.equal(f.calls,1,'repeated clicks cannot create a second save');
    if(spec.signal)assert.ok(f.signal instanceof AbortSignal,'the existing cancellation signal reaches file writing');
    if(status==='error')f.pending.reject(new Error('磁盘不可写'));
    else f.pending.resolve(status==='saved'?{status,path:'D:\\图纸\\保存测试.json'}:{status});
    await task;
    assert.equal(f.busy.at(-1),false,'busy clears after every terminal result');
    assert.deepEqual(f.environment.doc,before,'export does not change or mark the source document saved');
    const notice=f.messages.join(' '),error=f.errors.filter(Boolean).join(' ');
    if(status==='saved'){assert.match(notice,/保存完成|已保存到你选择的位置/);assert.equal(error,'');if(spec.exportFlag)assert.deepEqual(f.exported,[true]);}
    else if(status==='browser'){assert.match(notice,/已发起.*浏览器下载/);assert.doesNotMatch(notice,/保存完成|已保存到/);if(spec.exportFlag)assert.deepEqual(f.exported,[false]);}
    else{assert.doesNotMatch(notice,/保存完成|已保存到|已导出|已下载/);assert.deepEqual(f.exported,[]);if(status==='error')assert.match(error+' '+notice,/磁盘不可写/);else assert.equal(error,'');}
  }
});

test('closing PDF export aborts the pending file save and suppresses subsequent completion notices',async()=>{
  const spec=handlers.find(item=>item.pdf)!,f=fixture(spec),task=f.run();await f.started.promise;
  const controller=(f.environment.exportController as {current:AbortController}).current;
  controller.abort();assert.equal(f.signal?.aborted,true);f.pending.resolve({status:'cancelled'});await task;
  assert.deepEqual(f.messages,[]);assert.deepEqual(f.errors.filter(Boolean),[]);
  assert.equal((f.environment.exportController as {current:unknown}).current,null);
});
