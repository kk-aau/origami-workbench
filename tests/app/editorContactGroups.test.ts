import test from 'node:test';
import assert from 'node:assert/strict';
import {solveEditorFlatRequest,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FlatFoldResult,FoldGraph,Point} from '../../src/core/types';
import {diagnoseFlatLayerCoverage} from '../../src/core/flatLayerSelfDiagnosis';
import {blankDoc} from '../../src/app/state';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';
import {planEditorContactGroups} from '../../src/app/editorContactGroups';

function stacks(depth:number){
  const g:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[],faces_edges:[],edges_faces:[]};
  const addEdge=(a:number,b:number,assignment:string,owners:number[])=>{
    g.edges_vertices.push([a,b]);g.edges_assignment.push(assignment);g.edges_foldAngle.push(assignment==='M'?-180:assignment==='V'?180:0);g.edges_faces!.push(owners);
    return g.edges_vertices.length-1;
  };
  for(let stack=0;stack<2;stack++){
    const base=g.vertices_coords.length,offset=g.faces_vertices!.length;
    const starts:number[]=[];
    for(let i=0;i<=depth;i++){
      const x=stack*30+i%2*10,v=base+2*i;
      g.vertices_coords.push([x,0],[x,10]);
      starts.push(addEdge(v,v+1,i===0||i===depth?'B':i%2?'M':'V',
        [i-1,i].filter(f=>f>=0&&f<depth).map(f=>offset+f)));
    }
    for(let i=0;i<depth;i++){
      const a=base+i*2,f=offset+i;
      g.faces_vertices!.push([a,a+2,a+3,a+1]);
      g.faces_edges!.push([addEdge(a,a+2,'B',[f]),starts[i+1],addEdge(a+3,a+1,'B',[f]),starts[i]]);
    }
  }
  return {geometry:{status:'ready',message:'',graph:g,vertices:g.vertices_coords,faces:g.faces_vertices!},layers:{status:'unknown',message:''},warnings:[]} satisfies FlatFoldResult;
}

test('editor reanalysis certifies two distant 128-layer stacks in original face IDs',async()=>{
  const input=stacks(128);
  const publication=flatFoldPublication(await solveEditorFlatRequest({kind:'layers',result:input},planEditorContactGroups));
  const {result,surface}=publication;
  assert.equal(result.layers.status,'solved',result.layers.message);
  assert.match(result.layers.message,/独立纸叠/);
  assert.equal(result.layers.faceOrders?.length,128*127);
  assert.ok(result.layers.faceOrders!.every(([a,b])=>(a<128)===(b<128)));
  assert.ok(surface?.status==='complete'&&surface.opposite?.exact);
  assert.deepEqual(input.layers,{status:'unknown',message:''});
});

test('edge-only neighbours remain coupled internally and publish only area contacts in both editor routes',async()=>{
  const doc=blankDoc('相邻纸叠',10,10);
  const rim:Point[]=[[5,0],[10,0],[10,5],[10,10],[5,10],[0,10],[0,5],[0,0]];
  const signs=['F','M','M','V','V','V','F','V'] as const;
  rim.forEach((b,i)=>doc.segments.push({id:'r'+i,a:[5,5],b,assignment:signs[i],angle:signs[i]==='M'?-180:signs[i]==='V'?180:0}));
  const initial=await solveEditorFlatRequest({doc},planEditorContactGroups);
  assert.equal(initial.layers.status,'solved',initial.layers.message);
  const baseline=flatFoldPublication(initial);
  assert.equal(baseline.surface?.status,'complete');
  // This fixture folds on 45 degree axes of an integer grid. Supply its exact
  // known placement for reanalysis so sub-ulp positive-area slivers in the
  // separate reflection engine aren't mistaken for a shared edge in the test.
  const exact=structuredClone(initial);
  exact.geometry.vertices=exact.geometry.vertices.map(([x,y])=>[Math.round(x),Math.round(y)]);
  exact.geometry.graph!.vertices_coords=exact.geometry.vertices;
  const full=recomputeFlatLayers(exact);
  const clean=flatFoldPublication(await solveEditorFlatRequest({kind:'layers',result:exact},planEditorContactGroups));
  assert.equal(clean.surface?.status,'complete',clean.result.layers.message);
  assert.equal(clean.result.layers.faceOrders!.length,16);
  assert.ok(clean.result.layers.faceOrders!.every(([a,b])=>(a<2)===(b<2)));
  assert.equal(clean.result.layers.solutionCountExact,full.layers.solutionCountExact);
});

test('a verified edge-only comparison stays private and cannot certify a user-imposed stacking constraint',()=>{
  const source=stacks(1);
  source.geometry.vertices.forEach((p,i)=>{if(i>=4)p[0]-=20;});
  const model:FlatFoldResult={...source,layers:{status:'solved',message:'',faceOrders:[[0,1,1]]}};
  for(const constrained of [false,true]){
    const candidate=structuredClone(model);
    if(constrained)candidate.layers.relativeConstraints=[{above:0,below:1}];
    const verified=diagnoseFlatLayerCoverage(candidate,()=>{throw Error('unexpected missing pair');});
    assert.equal(verified.layers.status,'solved');
    const published=flatFoldPublication(verified);
    if(constrained){
      assert.equal(published.result.layers.status,'error');
      assert.equal(published.surface,undefined);
    }else{
      assert.deepEqual(published.result.layers.faceOrders,[]);
      assert.ok(published.surface?.status==='complete'&&published.surface.opposite?.exact);
    }
  }
});
