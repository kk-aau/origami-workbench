import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from '../fixtures/flasher-all-vertices-labels-20261010.json';
import old from '../../src/app/flasherP46ReadonlyData.json';
import {flasherAllLabelsSeedPoint,flasherAllLabelsSeedQuery,flasherAllVerticesLabels,flasherLabelWrap,readFlasherAllLabelsParameters,
  readFlasherAllLabelsQuery,readFlasherAllLabelsResult,writeFlasherAllLabelsParameters} from '../../src/app/flasherAllVerticesLabels';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-11,`${a} vs ${b}`);

test('all six independent source cases retain literal nested i/j Table and every original Text',()=>{
  for(const c of fixture.cases){
    const r=flasherAllVerticesLabels(c.query),expected=c.expectedData;
    assert.equal(r.data.head,'Style');assert.equal(r.data.style,'Black');
    assert.equal(r.data.items.length,c.query.n+2);
    for(let i=0;i<r.data.items.length;i++)for(let j=0;j<r.data.items[i].length;j++){
      const a=r.data.items[i][j],b=expected.items[i][j];assert.deepEqual(a.content,b.content);assert.equal(a.head,b.head);
      assert.deepEqual(a.resolvedPositionIndex,b.resolvedPositionIndex);a.position.forEach((x,k)=>near(x,b.position[k]));
    }
  }
});
test('one-argument WrapRules preserves k=-1 and never substitutes periodic m-1',()=>{
  assert.deepEqual(flasherLabelWrap([-1,3,0]),[3,0,-1]);assert.deepEqual(flasherLabelWrap([2,3,-5]),[2,3,-5]);
  const r=flasherAllVerticesLabels(flasherAllLabelsSeedQuery(6,5));
  assert.deepEqual(r.data.items[0][3].content.indices,[-1,3,0]);assert.deepEqual(r.data.items[0][3].resolvedPositionIndex,[3,0,-1]);
  assert.equal(r.query.bindings.some(b=>b.index[2]===4),false);
});
test('h2 all-possible labels include panel intermediate points excluded from effective sector topology',()=>{
  const c=fixture.cases.find(c=>c.name==='all-middle-points-r3-h2-m5')!,r=flasherAllVerticesLabels(c.query);
  assert.equal(r.data.items.flat().length,56);
  const effective=new Set(c.effectiveSectorVertexIndices!.map(index=>`${index[0]},${index[1]},${index[2]===4?-1:index[2]}`));
  assert.ok(r.data.items.flat().filter(item=>!effective.has(item.resolvedPositionIndex.join(','))).length>10);
  assert.ok(r.data.items.flat().some(item=>item.content.indices.join(',')==='0,2,0'));
});
test('u label prefix, v position head and arbitrary 3D numeric vector bindings remain independent',()=>{
  const c=fixture.cases.find(c=>c.name==='nonperiodic-three-dimensional-bindings')!,r=flasherAllVerticesLabels(c.query);
  assert.equal(r.query.u,'q');assert.equal(r.query.v,'pp');assert.equal(r.query.dimension,3);
  assert.deepEqual(r.data.items[0][0].position,[-4,-1,-1.2]);assert.equal(r.data.items[0][0].content.base.value,'q');
  const change=structuredClone(c.query);change.bindings[0].point=[9,8,7];
  assert.deepEqual(flasherAllVerticesLabels(change).data.items[0][0].position,[9,8,7]);
});
test('saved original n4/m5 label coordinates remain equal while original symbolic seam indices stay unwrapped',()=>{
  const r=flasherAllVerticesLabels(flasherAllLabelsSeedQuery(4,5)),items=r.data.items.flat();
  assert.equal(items.length,old.sectors.Y.labels.length);
  old.sectors.Y.labels.forEach((item,i)=>{assert.deepEqual(items[i].content.indices,item.ijk);items[i].position.forEach((x,k)=>near(x,item.point[k]));});
});
test('query/result and parameter file roundtrips keep complete data and do not mutate inputs',()=>{
  for(const c of fixture.cases){const input=structuredClone(c.query),r=flasherAllVerticesLabels(input);
    assert.deepEqual(readFlasherAllLabelsParameters(writeFlasherAllLabelsParameters(r.query)),input);
    assert.deepEqual(readFlasherAllLabelsResult(JSON.stringify(r)),r);r.query.bindings[0].point[0]+=1;assert.deepEqual(input,c.query);
  }
});
test('current r/h source binding is genuine and changing n/m produces different complete original data',()=>{
  const q=flasherAllLabelsSeedQuery(4,4,'p','p',{rings:2,heightOrder:2});assert.equal(flasherAllVerticesLabels(q).data.items.flat().length,30);
  assert.equal(flasherAllVerticesLabels(flasherAllLabelsSeedQuery(6,5)).data.items.flat().length,56);
  assert.notDeepEqual(q.bindings,flasherAllLabelsSeedQuery(4,5).bindings);
  assert.throws(()=>flasherAllLabelsSeedQuery(4,5,'p','p',{rings:3,heightOrder:2}),/n=r/);
});
test('malformed tables, nonfinite points, repeated/missing/periodic aliases and mixed dimensions reject',()=>{
  const q=flasherAllLabelsSeedQuery(4,5);
  for(const mutate of [(q:any)=>q.n=NaN,(q:any)=>q.n=13,(q:any)=>q.n=.5,(q:any)=>q.u='',(q:any)=>q.v='\n',
    (q:any)=>q.bindings.pop(),(q:any)=>q.bindings[0]=q.bindings[1],(q:any)=>q.bindings[0].index[2]=4,
    (q:any)=>q.bindings[0].point[0]=Infinity,(q:any)=>q.bindings[0].point[0]=true,(q:any)=>q.bindings[0].point.push(1),
    (q:any)=>q.wrapContext.periodicModulo=true,(q:any)=>q.origin.rotationalOrder=2,(q:any)=>q.origin.prefill={rings:2,heightOrder:3},
    (q:any)=>q.options={LineStyle:'Red'},(q:any)=>q.bindings[0].point[0]+=.01]){
    const invalid=structuredClone(q);mutate(invalid);assert.throws(()=>readFlasherAllLabelsQuery(invalid));
  }
  for(const x of [null,{},[],false,'symbolic-vector'])assert.throws(()=>readFlasherAllLabelsQuery(x));
  assert.throws(()=>flasherAllLabelsSeedPoint([0,0,0],0));
});
test('genuine coordinate editing must change provenance and cannot silently claim an untouched original seed',()=>{
  const q=flasherAllLabelsSeedQuery(4,5);q.bindings[0].point[0]+=1;assert.throws(()=>readFlasherAllLabelsQuery(q),/坐标已修改/);
  q.origin={kind:'finite-numeric-bindings'};assert.deepEqual(flasherAllVerticesLabels(q).data.items[0][0].position,q.bindings[0].point);
});
test('all original Text source fields read back strictly; options or physical CP claims cannot be forged',()=>{
  const q=flasherAllLabelsSeedQuery(4,5),r=flasherAllVerticesLabels(q);
  assert.equal(r.source.originalGraphicOptions.length,0);assert.equal(r.source.wolframExecuted,false);assert.equal(r.source.paperCertification,false);
  for(const mutate of [(r:any)=>r.data.items[0][0].position[0]+=.1,(r:any)=>r.data.items.pop(),(r:any)=>r.source.originalStyle='Red',
    (r:any)=>r.source.symbolicVectorDomainComplete=true,(r:any)=>r.source.solvedCreasePattern=true,(r:any)=>r.source.optionsForwarded=true,
    (r:any)=>r.data.items[0][0].resolvedPositionIndex[2]=4,(r:any)=>r.data.items[0][0].content.indices[0]=0]){
    const bad=structuredClone(r);mutate(bad);assert.throws(()=>readFlasherAllLabelsResult(JSON.stringify(bad)));
  }
  assert.equal('edges_vertices' in r,false);assert.equal('faces_vertices' in r,false);
  assert.throws(()=>readFlasherAllLabelsParameters('bad'));assert.throws(()=>readFlasherAllLabelsParameters('{}'));
});
