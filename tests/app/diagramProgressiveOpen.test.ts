import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,addDiagramBranch,prepareParsedDiagramProject,prepareParsedDiagramProjectProgressively} from '../../src/app/diagramProject';
import {createDiagramPoseRestoreCache,encodeDiagramPoseCache,decodeDiagramPoseCache} from '../../src/app/diagramPoseRestoreCache';
import {withDiagramOpenMemo,withDiagramOpenMemoAsync} from '../../src/core/diagramOpenMemo';

function fixture(){
  const doc=blankDoc('恢复测试',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let p=createDiagramProject(doc);p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,computeFlatFold(doc));
  const root=p.activeStepId;p=appendDiagramStep(p);p=addDiagramBranch(p,root);p.activeStepId=root;return p;
}
test('progressive opening publishes a current-step checkpoint but returns the identical complete branched project',async()=>{
  const source=fixture(),order:string[]=[],expected=withDiagramOpenMemo(()=>prepareParsedDiagramProject(structuredClone(source)));
  const actual=await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(structuredClone(source),{
    onProgress:(n,total)=>order.push(n+'/'+total),onCurrentStep:(p,step)=>{assert.equal(p.activeStepId,step.id);assert.deepEqual(step,expected.steps[0]);order.push('preview');},
  }));
  assert.deepEqual(actual,expected);assert(order.indexOf('preview')<order.indexOf('3/3'));
});
test('pose cache reuses caption-only edits, binds preceding paper and algorithm identity, and survives failed I/O',async()=>{
  const source=fixture(),records=new Map<string,unknown>(),store={async read(key:string){return structuredClone(records.get(key));},async write(key:string,value:unknown){records.set(key,structuredClone(value));}};
  const first=createDiagramPoseRestoreCache('algorithm-a',store);
  await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(structuredClone(source),{restore:first.restore}));assert(first.stats.misses>0);
  const second=createDiagramPoseRestoreCache('algorithm-a',store),edited=structuredClone(source);edited.steps[0].description='仅说明变化';
  const actual=await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(edited,{restore:second.restore}));
  assert(second.stats.hits>0);assert.equal(second.stats.misses,0);assert.equal(actual.steps[0].description,'仅说明变化');
  const version=createDiagramPoseRestoreCache('algorithm-b',store);await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(structuredClone(source),{restore:version.restore}));assert(version.stats.misses>0);
  const pose=structuredClone(source.steps[0].pose!),basis=structuredClone(pose),cache=createDiagramPoseRestoreCache('basis',store);let calls=0;
  await cache.restore(structuredClone(pose),basis,()=>calls++);await cache.restore(structuredClone(pose),basis,()=>calls++);basis.sourceRevision++;
  await cache.restore(structuredClone(pose),basis,()=>calls++);assert.equal(calls,2);
  const broken=createDiagramPoseRestoreCache('failed',{async read(){throw Error('disk');},async write(){throw Error('disk');}});
  const recovered=await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(structuredClone(source),{restore:broken.restore}));
  assert.deepEqual(recovered,withDiagramOpenMemo(()=>prepareParsedDiagramProject(structuredClone(source))));
});
test('compressed cache round trips and rejects unsupported or corrupt data',async()=>{
  const value={version:1,pose:fixture().steps[0].pose};assert.deepEqual(await decodeDiagramPoseCache(await encodeDiagramPoseCache(value)),JSON.parse(JSON.stringify(value)));
  assert.equal(await decodeDiagramPoseCache({encoding:'future',data:'x'}),undefined);
  await assert.rejects(decodeDiagramPoseCache({encoding:'gzip-v1',data:'not gzip'}));
});
test('pose cache binds geometry, tolerates malformed entries and limits pending immutable writes',async()=>{
  const source=fixture().steps[0].pose!,records=new Map<string,unknown>(),pending:(()=>void)[]=[];let active=0,maxActive=0;
  const cache=createDiagramPoseRestoreCache('bounded',{
    async read(key){return structuredClone(records.get(key));},
    async write(key,value){active++;maxActive=Math.max(maxActive,active);await new Promise<void>(resolve=>pending.push(resolve));records.set(key,value);active--;},
  });
  for(let i=0;i<4;i++){const pose=structuredClone(source);pose.sourceRevision=i;await cache.restore(pose,undefined,()=>{});pose.sourceRevision=99;}
  const fifth=structuredClone(source);fifth.sourceRevision=4;
  let finished=false;const next=cache.restore(fifth,undefined,()=>{}).then(()=>{finished=true;});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(finished,false);assert.equal(maxActive,4);
  pending.shift()!();await next;pending.splice(0).forEach(resolve=>resolve());await cache.flush();assert.equal(active,0);
  assert([...records.values()].every(value=>(value as {pose:{sourceRevision:number}}).pose.sourceRevision!==99));
  let calls=0;const store={async read(key:string){return structuredClone(records.get(key));},async write(key:string,value:unknown){records.set(key,structuredClone(value));}};
  const geometry=createDiagramPoseRestoreCache('geometry',store);await geometry.restore(structuredClone(source),undefined,()=>calls++);await geometry.flush();
  const edited=structuredClone(source);edited.result.geometry.vertices[0][0]+=1;
  await geometry.restore(edited,undefined,()=>calls++);assert.equal(calls,2);
  const malformed=createDiagramPoseRestoreCache('bad',{async read(){return {version:1,pose:{}};},async write(){}});
  await malformed.restore(structuredClone(source),undefined,()=>calls++);assert.equal(calls,3);
});
test('late invalid geometry rejects before an early preview, and a failed scope releases its memo',async()=>{
  const bad=fixture();bad.states.at(-1)!.doc.paper.width=-1;let previews=0;
  await assert.rejects(withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(bad,{onCurrentStep:()=>previews++})));assert.equal(previews,0);
  await withDiagramOpenMemoAsync(()=>prepareParsedDiagramProjectProgressively(fixture()));
});
