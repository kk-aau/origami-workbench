import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {prepareSavedProjectImport} from '../../src/app/prepareProjectImport';
import {apiText} from '../../src/app/api';

function savedDoc():Doc&{authorExtension:{labels:string[];sourceId:string}} {
  return {schemaVersion:2,objects:[{id:'original-author-note',kind:'text',position:[4,6],text:'原作者标注',fontSize:3,color:'#234567'}],name:'已保存的中文工程',paper:{width:20,height:20},segments:[
    {id:'original/custom:山折',a:[2,3],b:[18,3],assignment:'M',angle:-137.5,displayColor:'#123456'},
  ],metadata:{sourceFormat:'cp',nativeExtras:{previouslyStored:true},custom:{keep:[1,'二',null]}},
  authorExtension:{labels:['未知顶层字段仍在原位置'],sourceId:'作者自己的编号'}};
}

test('saved envelopes retain unknown document fields, metadata and original IDs without native-file reimport',()=>{
  const source=savedDoc(),text=JSON.stringify({id:'library-record',doc:source,revision:'rev-1',updated:'2026-10-27'});
  const result=prepareSavedProjectImport(text);
  assert.deepEqual(result.doc,source);
  assert.deepEqual((result.doc as typeof source).authorExtension,source.authorExtension);
  assert.deepEqual(result.doc.metadata?.nativeExtras,{previouslyStored:true});
  assert.equal(result.doc.segments[0].id,'original/custom:山折');
  assert.deepEqual(result.savedProject,{draft:false,revision:'rev-1',sourceSignature:JSON.stringify(source),preparedSignature:JSON.stringify(source),upgraded:false});
  assert.equal(Object.hasOwn(result.doc,'revision'),false,'transport envelope metadata is not part of the editable document');
});

test('legacy migration and real intersection splitting retain the saved baseline so changed geometry remains dirty',()=>{
  const source:Doc={name:'旧的交叉工程',paper:{width:2,height:2},segments:[
    {id:'old-horizontal',a:[0,1],b:[2,1],assignment:'V',angle:180},
    {id:'old-vertical',a:[1,0],b:[1,2],assignment:'M',angle:-90},
  ],metadata:{author:'原作'}};
  const original=JSON.stringify(source),result=prepareSavedProjectImport(JSON.stringify({doc:source,draft:false,revision:'rev-legacy'}));
  assert.equal(result.savedProject.sourceSignature,original);
  assert.equal(result.savedProject.preparedSignature,JSON.stringify(result.doc));
  assert.notEqual(result.savedProject.preparedSignature,result.savedProject.sourceSignature);
  assert.equal(result.savedProject.upgraded,true);
  assert.equal(result.doc.schemaVersion,2);assert.deepEqual(result.doc.objects,[]);
  assert.deepEqual(result.doc.segments.map(s=>[s.id,s.a,s.b,s.assignment,s.angle]),[
    ['old-horizontal',[0,1],[1,1],'V',180],['old-horizontal::split:2',[1,1],[2,1],'V',180],
    ['old-vertical',[1,0],[1,1],'M',-90],['old-vertical::split:2',[1,1],[1,2],'M',-90],
  ]);
});

test('draft identity survives preparation and is independent of whether the stored document needs migration',()=>{
  const source=savedDoc();
  for(const draft of [false,true]){
    const result=prepareSavedProjectImport(JSON.stringify({doc:source,draft,revision:'draft-revision'}));
    assert.equal(result.savedProject.draft,draft);
    assert.equal(result.savedProject.sourceSignature,JSON.stringify(source));
    assert.equal(result.savedProject.preparedSignature,result.savedProject.sourceSignature);
    assert.equal(result.savedProject.upgraded,false);
  }
});

test('invalid saved envelopes and invalid documents fail before returning any replacement',()=>{
  const doc=savedDoc();
  for(const value of [null,[],{}, {doc}, {doc,revision:''}, {doc,revision:'r',draft:'yes'},
    {doc:{...doc,schemaVersion:999},revision:'r'},
    {doc:{...doc,segments:[doc.segments[0],doc.segments[0]]},revision:'r'}]){
    assert.throws(()=>prepareSavedProjectImport(JSON.stringify(value)));
  }
  assert.throws(()=>prepareSavedProjectImport('{"doc":'));
});

test('saved GET transport returns the original response text and caller cancellation without parsing a large envelope on the caller',async t=>{
  const raw=' {"revision":"r","doc":{"name":"原样文本","extra":"'+('保留'.repeat(20000))+'"}}\n';
  const controller=new AbortController(),sent:{url:unknown;init?:RequestInit}[]=[];
  t.mock.method(globalThis,'fetch',async(url:unknown,init?:RequestInit)=>{
    sent.push({url,init});const response=new Response(raw,{status:200});
    response.json=async()=>{throw Error('saved GET must not parse JSON on the caller');};return response;
  });
  assert.equal(await apiText('projects/exact-id?draft=1',controller.signal),raw);
  assert.equal(sent[0].url,'/api/projects/exact-id?draft=1');
  assert.equal(sent[0].init?.method,'GET');assert.equal(sent[0].init?.body,undefined);
  assert.equal(sent[0].init?.signal,controller.signal);
});

test('saved GET transport preserves structured server failures and an explicit abort',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('{"error":"当前工程已变化","code":"project_conflict"}',{status:409}));
  await assert.rejects(apiText('projects/id'),(error:unknown)=>{
    const e=error as Error&{status?:number;code?:string};
    assert.equal(e.message,'当前工程已变化');assert.equal(e.status,409);assert.equal(e.code,'project_conflict');return true;
  });
  t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('user cancelled','AbortError');});
  await assert.rejects(apiText('projects/id'),{name:'AbortError'});
});
