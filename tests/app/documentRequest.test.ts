import test from 'node:test';
import assert from 'node:assert/strict';
import {documentRequestJson} from '../../src/app/documentRequest';
import {apiSerialized} from '../../src/app/api';

test('saved document signatures retain full JSON and correctly escaped envelope fields',()=>{
 const doc={name:'中文“折痕”\n\\',paper:{width:100,height:100},segments:[{id:'s1',a:[-12.3,45],b:[0,1],assignment:'V',angle:180}],metadata:{source:'保留'}},text=JSON.stringify(doc);
 for(const fields of [{},{id:'a"b\\c\n',baseRevision:null},{projectId:null,updated:'2026-10-27T00:00:00.000Z',notPresent:undefined}]){
  assert.deepEqual(JSON.parse(documentRequestJson(text,fields)),JSON.parse(JSON.stringify({...fields,doc})));
 }
 assert.throws(()=>documentRequestJson(text,{doc}),/重复/);
});
test('pre-serialized writes preserve request JSON, authentication and error handling',async t=>{
 const sent:RequestInit[]=[],body=documentRequestJson('{"name":"CP","segments":[]}',{id:'test'});
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{sent.push(init);return new Response('{"revision":"saved"}',{status:200});});
 assert.deepEqual(await apiSerialized('projects/draft',body),{revision:'saved'});
 assert.equal(sent[0].body,body);assert.equal(sent[0].method,'POST');assert.equal((sent[0].headers as Record<string,string>)['Content-Type'],'application/json');assert.ok(Object.hasOwn(sent[0].headers!,'X-Zhezhi-Token'));
});
