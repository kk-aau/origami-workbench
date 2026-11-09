import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {buildFold,polygonArea} from '../../src/core/geometry';
import {diagnose} from '../../src/core/diagnostics';
import {flatLayerOrder} from '../../src/core/flatLayerOrder';
import {convexLayerGeometry} from '../../src/core/convexLayerGeometry';
import {simulationLayerOrder} from '../../src/engine/simLayerOrder';
import {overlappingMaterialPairs,singleMountainFold} from '../fixtures/layerBoundaryCases';
import type {LayerNode} from '../../src/core/layerSolutions';

test('visible-face filtering counts all 131072 genuine material candidates and can select past the old scan cap',()=>{
  const doc=overlappingMaterialPairs(),before=structuredClone(doc),constraints=[{face:32,side:'white' as const}];
  assert.equal(diagnose(doc).summary.errors,0);
  const first=computeFlatFold(doc,undefined,{constraints}),later=computeFlatFold(doc,undefined,{constraints,solutionIndex:50000});
  for(const result of [first,later]){
    assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(result.layers.solutionCountExact,'65536');
    assert.equal(result.layers.faceOrder!.at(-1),32);assert.deepEqual(result.layers.constraints,constraints);
  }
  assert.equal(later.layers.solutionIndex,50000);
  assert.deepEqual(later.layers.faceOrders,computeFlatFold(doc,undefined,{solutionIndex:100000}).layers.faceOrders);
  const outside=computeFlatFold(doc,undefined,{constraints,solutionIndex:65536});
  assert.equal(outside.layers.status,'error');assert.equal(outside.layers.solutionCountExact,'65536');
  assert.deepEqual(doc,before);
});

test('signed area, face order and colour constraints are invariant under a large permitted translation',()=>{
  const base=singleMountainFold(.008),moved=singleMountainFold(.008,999999),a=computeFlatFold(base),b=computeFlatFold(moved);
  assert.equal(diagnose(moved).summary.errors,0);assert.equal(b.layers.status,'solved',b.layers.message);
  assert.deepEqual(b.layers.faceOrders,a.layers.faceOrders);assert.deepEqual(b.layers.faceOrder,a.layers.faceOrder);
  const areas=b.geometry.faces.map(face=>polygonArea(face.map(v=>b.geometry.vertices[v])));
  assert.ok(areas[0]>0&&areas[1]<0);assert.ok(Math.abs(areas[0]-.000032)<1e-10);
  const unchanged=recomputeFlatLayers(b);assert.equal(unchanged.layers.status,'solved',unchanged.layers.message);assert.deepEqual(unchanged.layers.faceOrder,a.layers.faceOrder);
  const constraints=[{face:1,side:'white' as const}];
  assert.equal(computeFlatFold(base,undefined,{constraints}).layers.status,'no-solution');
  assert.equal(computeFlatFold(moved,undefined,{constraints}).layers.status,'no-solution');
});

test('private normalization keeps valid small mountain folds and their simulation certificates',()=>{
  for(const size of [.001,.003,.008,1,100])for(const offset of [0,999999])for(const assignment of ['M','V'] as const){
    if(size+offset>1e6)continue;
    const doc=singleMountainFold(size,offset);doc.segments.at(-1)!.assignment=assignment;doc.segments.at(-1)!.angle=assignment==='M'?-180:180;
    const before=structuredClone(doc),result=computeFlatFold(doc);
    assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);
    assert.deepEqual(result.layers.faceOrders,[[0,1,assignment==='M'?-1:1]]);assert.deepEqual(result.layers.faceOrder,assignment==='M'?[1,0]:[0,1]);assert.equal(result.layers.solutionCountExact,'1');
    assert.ok(simulationLayerOrder(buildFold(doc).graph,result));assert.deepEqual(doc,before);
  }
});

test('degenerate normals cannot be turned into a paint order or normalized into a valid face',()=>{
  const vertices:[number,number][]=[[0,0],[1,0],[2,0]],faces=[[0,1,2]];
  assert.deepEqual(flatLayerOrder(vertices,faces,[]),[]);
  assert.throws(()=>convexLayerGeometry({vertices_coords:vertices,faces_vertices:faces,edges_vertices:[[0,1],[1,2],[2,0]],edges_assignment:['B','B','B'],edges_foldAngle:[0,0,0]},1e-6),/退化/);
});

test('malformed actual engine output never publishes a solved layer certificate',()=>{
  const engine=ear as unknown as {layer:(...args:unknown[])=>unknown},original=engine.layer;
  try{
    for(const tree of [
      {orders:[[0,0,-1]]},{orders:[[0,1,1],[1,0,-1]]},{orders:[[0,2,1]]},
      {orders:[],branches:[[{orders:[[1,1,1]]}]]},
      {orders:[[0,1,1]],branches:[[{orders:[[0,1,1]]}]]},
    ] as LayerNode[]){
      engine.layer=()=>tree;
      const result=computeFlatFold(singleMountainFold(1));
      assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'error');assert.equal(result.layers.faceOrders,undefined);
    }
  }finally{engine.layer=original;}
});
