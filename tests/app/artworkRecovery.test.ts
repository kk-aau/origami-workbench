import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtworkRecoveryStore,type ArtworkRecoverySummary} from '../../src/app/artworkRecovery';
import {exportArtworkProject} from '../../src/app/artworkProject';
import {blankDoc} from '../../src/app/state';
import {emptyFoldedModelCollection} from '../../src/app/foldedModelCollection';
import {tessPreset} from '../../src/app/tessellation';

const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',revision='a'.repeat(64);
const entry:ArtworkRecoverySummary={id,name:'恢复作品',updated:'2026-10-21T10:00:00.000Z',revision,bytes:100,models:0,steps:0,simulation:false};
const text=()=>exportArtworkProject({editor:blankDoc('恢复作品',100,100),models:emptyFoldedModelCollection(),diagram:null,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}});

test('list validates records, rejects duplicate identities and returns owned objects',async()=>{
  const raw={entries:[entry],warnings:['保留其他副本']},store=createArtworkRecoveryStore({request:async()=>raw});
  const list=await store.list();list.entries[0].name='修改';list.warnings.push('本地');assert.equal(entry.name,'恢复作品');assert.equal(raw.warnings.length,1);
  for(const damaged of [{entries:[entry,entry],warnings:[]},{entries:[{...entry,revision:'bad'}],warnings:[]},{entries:[entry],warnings:[1]}])await assert.rejects(createArtworkRecoveryStore({request:async()=>damaged}).list());
});

test('load performs the complete artwork codec before offering any replacement workspaces',async()=>{
  const source=text(),store=createArtworkRecoveryStore({request:async()=>({summary:entry,text:source})}),loaded=await store.load(id);
  assert.equal(loaded.project.editor.name,'恢复作品');assert.equal(loaded.summary.id,id);
  const corrupt=JSON.parse(source);corrupt.construction.tessellation={family:'unsupported'};
  await assert.rejects(createArtworkRecoveryStore({request:async()=>({summary:entry,text:JSON.stringify(corrupt)})}).load(id),/镶嵌构造参数/);
  await assert.rejects(createArtworkRecoveryStore({request:async()=>({summary:{...entry,id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},text:source})}).load(id),/不一致/);
});

test('save and removal use explicit slot revisions and reject mismatched acknowledgements',async()=>{
  const calls:{route:string;value:unknown}[]=[],store=createArtworkRecoveryStore({request:async(route,value)=>{calls.push({route,value});return route.endsWith('/delete')?{id,deleted:true}:entry;}}),source=text();
  assert.deepEqual(await store.save({id,expectedRevision:null,text:source}),entry);await store.remove(id,revision);
  assert.deepEqual(calls,[{route:'artwork-recovery',value:{id,expectedRevision:null,text:source}},{route:`artwork-recovery/${id}/delete`,value:{expectedRevision:revision}}]);
  await assert.rejects(createArtworkRecoveryStore({request:async()=>({...entry,id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'})}).save({id,expectedRevision:revision,text:source}),/回执/);
});

test('invalid slot IDs, revision or text fail before any network mutation',async()=>{
  let requests=0;const store=createArtworkRecoveryStore({request:async()=>{requests++;return entry;}});
  await assert.rejects(store.load('../escape'));await assert.rejects(store.remove(id,'bad'));
  await assert.rejects(store.save({id,expectedRevision:'bad',text:text()}));
  await assert.rejects(store.save({id,expectedRevision:null,text:null as unknown as string}),/JSON 文本/);assert.equal(requests,0);
});

test('save and list accept artwork sizes above the former 32 MiB ceiling',async()=>{
  const source='x'.repeat(32*1024*1024+1),large={...entry,bytes:source.length};let actual:unknown;
  const store=createArtworkRecoveryStore({request:async(route,value)=>{actual=value;return route==='artwork-recovery'&&value===undefined?{entries:[large],warnings:[]}:large;}});
  assert.deepEqual(await store.save({id,expectedRevision:null,text:source}),large);
  assert.deepEqual(actual,{id,expectedRevision:null,text:source});
  assert.equal((await store.list()).entries[0].bytes,source.length);
});
