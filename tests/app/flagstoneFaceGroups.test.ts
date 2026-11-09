import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {groupFlagstoneFaces} from '../../src/app/flagstoneFaceGroups';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {prepareTessResult,tessPreset,type TessParams} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FlatFoldResult} from '../../src/core/types';

function threeOverlaidFaces():FlatFoldResult{return {
  geometry:{status:'ready',message:'',vertices:[[0,0],[10,0],[10,10],[0,10]],faces:[[0,1,2,3],[0,1,2,3],[0,1,2,3]]},
  layers:{status:'solved',message:'',faceOrders:[[0,1,-1],[1,2,-1]]},warnings:[],
};}

test('groups verified layer ranks and records actual immediate occlusions',()=>{
  const input=threeOverlaidFaces(),before=structuredClone(input),result=groupFlagstoneFaces(input);
  assert.equal(result.status,'grouped');
  if(result.status!=='grouped')return;
  assert.deepEqual(result.groups,[{level:0,faces:[0]},{level:1,faces:[1]},{level:2,faces:[2]}]);
  assert.deepEqual(result.occlusions.map(({belowGroup,aboveGroup,facePairs})=>({belowGroup,aboveGroup,facePairs})),[
    {belowGroup:0,aboveGroup:1,facePairs:[[0,1]]},
    {belowGroup:1,aboveGroup:2,facePairs:[[1,2]]},
  ]);
  assert.ok(result.regionTopFaces.length>0);
  assert.ok(result.regionTopFaces.every(id=>id===2));
  assert.deepEqual(input,before);
  input.layers.faceOrder=[2,1,0];
  assert.deepEqual(groupFlagstoneFaces(input),result,'a draw-order array is not layer-group evidence');
});

test('disjoint faces can share a rank but group relations retain face-pair witnesses',()=>{
  const input=threeOverlaidFaces();
  input.geometry.vertices.push([20,0],[30,0],[30,10],[20,10]);
  input.geometry.faces[2]=[4,5,6,7];
  input.layers.faceOrders=[[0,1,-1]];
  const result=groupFlagstoneFaces(input);
  assert.equal(result.status,'grouped');
  if(result.status!=='grouped')return;
  assert.deepEqual(result.groups,[{level:0,faces:[0,2]},{level:1,faces:[1]}]);
  assert.deepEqual(result.occlusions.map(x=>({belowGroup:x.belowGroup,aboveGroup:x.aboveGroup,facePairs:x.facePairs})),[
    {belowGroup:0,aboveGroup:1,facePairs:[[0,1]]},
  ]);
});

test('FOLD face-order signs use folded face normals rather than raw tuple order',()=>{
  const input=threeOverlaidFaces();
  input.geometry.faces[1].reverse();
  input.layers.faceOrders=[[0,1,1],[1,2,-1]];
  const result=groupFlagstoneFaces(input);
  assert.equal(result.status,'grouped');
  if(result.status!=='grouped')return;
  assert.deepEqual(result.groups,[{level:0,faces:[0]},{level:1,faces:[1]},{level:2,faces:[2]}]);
  assert.deepEqual(result.occlusions.flatMap(edge=>edge.facePairs),[[0,1],[1,2]]);
});

test('unresolved, cyclic, or incomplete overlap order never yields definite groups',()=>{
  const input=threeOverlaidFaces();
  input.layers.status='unknown';
  assert.deepEqual(groupFlagstoneFaces(input).groups,[]);
  input.layers.status='solved';input.layers.faceOrders=[[0,1,-1]];
  assert.equal(groupFlagstoneFaces(input).status,'unconfirmed');
  input.layers.faceOrders=[[0,1,-1],[1,2,-1],[2,0,-1]];
  assert.equal(groupFlagstoneFaces(input).status,'conflict');
  input.layers.faceOrders=[[0,1,-1],[0,1,1]];
  assert.equal(groupFlagstoneFaces(input).status,'conflict');
  input.layers.faceOrders=[[0,3,-1]];
  assert.equal(groupFlagstoneFaces(input).status,'conflict');
});

test('stale or incomplete precomputed overlap regions cannot certify a new frame',()=>{
  const input=threeOverlaidFaces(),current=modelOverlapRegions(input);
  assert.equal(groupFlagstoneFaces(input,current).status,'grouped');
  const missing=structuredClone(current);missing.cells.pop();
  assert.equal(groupFlagstoneFaces(input,missing).status,'unconfirmed');
  const wrongMembership=structuredClone(current);wrongMembership.cells[0].faces=[0];
  assert.equal(groupFlagstoneFaces(input,wrongMembership).status,'unconfirmed');
  const wrongArea=structuredClone(current);wrongArea.cells[0].area*=2;
  assert.equal(groupFlagstoneFaces(input,wrongArea).status,'unconfirmed');
  const next=structuredClone(input);next.geometry.vertices=next.geometry.vertices.map(([x,y])=>[x+100,y]);
  assert.equal(groupFlagstoneFaces(next,current).status,'unconfirmed');
});

test('solved square flagstone produces witnessed groups consistent with every visible region',()=>{
  const params:TessParams={...tessPreset('flagstone'),rows:2,columns:2};delete params.paper;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{
    input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,
  });
  assert.equal(run.status,0,run.stderr);
  const source=prepareTessResult(JSON.parse(run.stdout),params),fold=tessFlatInput(source,source.doc,'groups-test',true);
  const flat=recomputeFlatLayers(computeFlatGeometry(fold.graph,2e-6,{startingFace:tessFlatRoot(fold.graph)}));
  assert.equal(flat.layers.status,'solved');
  const regions=modelOverlapRegions(flat),local=modelRegionLayers(flat,regions,'front'),grouped=groupFlagstoneFaces(flat,regions);
  assert.equal(grouped.status,'grouped');
  if(grouped.status!=='grouped')return;
  assert.ok(grouped.groups.length>1);
  assert.equal(grouped.groups.flatMap(group=>group.faces).length,flat.geometry.faces.length);
  assert.deepEqual(grouped.groups.flatMap(group=>group.faces).sort((a,b)=>a-b),flat.geometry.faces.map((_,id)=>id));
  assert.deepEqual(grouped.regionTopFaces,local.map(cell=>cell.layers.status==='ordered'?cell.layers.topToBottom[0]:-1));
  for(const edge of grouped.occlusions){
    assert.ok(edge.belowGroup<edge.aboveGroup);
    assert.ok(edge.facePairs.length>0&&edge.cellIndices.length>0);
    for(const [below,above] of edge.facePairs){
      assert.ok(grouped.groups[edge.belowGroup].faces.includes(below));
      assert.ok(grouped.groups[edge.aboveGroup].faces.includes(above));
      assert.ok(edge.cellIndices.some(index=>{
        const order=local[index].layers.status==='ordered'?local[index].layers.topToBottom:[];
        return order.some((face,position)=>face===above&&order[position+1]===below);
      }),'every group edge is witnessed by immediate occlusion in a real cell');
    }
  }
});
