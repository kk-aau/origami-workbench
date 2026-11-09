import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startModelBoardExport} from '../../src/app/modelBoardExportTask';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce} from '../../src/app/foldedModelCollection';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultBoardPlacement} from '../../src/app/modelBoard';
function fixture(){const doc=blankDoc('图板',100,100);let state=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'<A&>',source:{doc,graph:buildFold(doc).graph},result:computeFlatFold(doc)});state=reduce(state,{type:'snapshot-copy',id:'b',name:'B'});return reduce(state,{type:'snapshot-copy',id:'c',name:'隐藏'});}
test('board export snapshots visible models and paints active model last',async()=>{
 let state=fixture();state=reduce(state,{type:'board',id:'c',placement:{...defaultBoardPlacement(2),visible:false}});state=reduce(state,{type:'select',id:'a'});
 const seen:string[]=[],job=startModelBoardExport(state,(_result,name,view)=>{seen.push(name);assert.equal(view.rotation,0);return {promise:Promise.resolve({status:'complete',svg:`<svg><title>${name}</title></svg>`}),cancel(){}};});
 state.entries[0].name='改名';state.entries[0].view!.rotation=90;state.entries[1].view!.board={...defaultBoardPlacement(1),x:999};
 const reply=await job.promise;assert.deepEqual(seen,['B','<A&>']);assert.equal(reply.status,'complete');if(reply.status==='complete'){assert.match(reply.svg,/x="392" y="16"/);assert.doesNotMatch(reply.svg,/<A&>/);assert.match(reply.svg,/%3CA%26%3E/);assert.match(reply.svg,/width="768" height="480"/);}
});
test('board real exporter embeds full model sheets without mutating collection',async()=>{
 const state=fixture(),before=structuredClone(state),reply=await startModelBoardExport(state).promise;assert.deepEqual(state,before);assert.equal(reply.status,'complete');if(reply.status==='complete'){const images=[...reply.svg.matchAll(/href="data:image\/svg\+xml;charset=utf-8,([^"]+)"/g)];assert.equal(images.length,3);assert.ok(images.every(m=>decodeURIComponent(m[1]).includes('data-face-id')));}
});
test('board cancellation stops active render and ignores late success',async()=>{
 let entered!:()=>void,resolve!: (reply:any)=>void,calls=0,stops=0;const waiting=new Promise<void>(r=>entered=r);
 const job=startModelBoardExport(fixture(),()=>{calls++;entered();return {promise:new Promise(r=>resolve=r),cancel(){stops++;resolve({status:'complete',svg:'<svg/>'});}};});
 await waiting;job.cancel();assert.equal((await job.promise).status,'cancelled');assert.equal(calls,1);assert.equal(stops,1);
 let started=0;const immediate=startModelBoardExport(fixture(),()=>{started++;throw Error('unexpected');});immediate.cancel();assert.equal((await immediate.promise).status,'cancelled');assert.equal(started,0);
});
test('board rejects empty selection and never exports partial sheets on failure',async()=>{
 assert.throws(()=>startModelBoardExport(emptyFoldedModelCollection()),/可见/);
 for(const status of ['error','timeout'] as const){let calls=0;const reply=await startModelBoardExport(fixture(),()=>({promise:Promise.resolve(++calls===1?{status:'complete',svg:'<svg/>'}:{status,message:'未完成'}),cancel(){}})).promise;assert.equal(reply.status,status);assert.equal(calls,2);assert.ok(!('svg' in reply));}
});
