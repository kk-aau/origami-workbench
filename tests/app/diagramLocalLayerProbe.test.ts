import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FoldGraph,Point} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {prepareDiagramLocalLayerProbe} from '../../src/app/diagramLocalLayerProbe';
import {materialDoc} from '../fixtures/materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';

function fixture(offsets:number[],hole=false):DiagramPose {
  const graph:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[],faces_holes:[]},shown:Point[]=[];
  for(const [face,offset]of offsets.entries()){
    const ring=(points:Point[])=>points.map(p=>{const id=graph.vertices_coords.length;graph.vertices_coords.push([p[0]+face*20,p[1]]);shown.push([p[0]+offset,p[1]]);return id;});
    const outer=ring([[0,0],[10,0],[10,10],[0,10]]),holes=hole&&face===0?[ring([[3,3],[3,7],[7,7],[7,3]])]:[];
    graph.faces_vertices!.push(outer);graph.faces_holes!.push(holes);
    for(const row of [outer,...holes])row.forEach((a,i)=>{graph.edges_vertices.push([a,row[(i+1)%row.length]]);graph.edges_assignment.push('B');graph.edges_foldAngle.push(0);});
  }
  const faceEdges=graph.faces_vertices!.map(row=>row.map((a,i)=>graph.edges_vertices.findIndex(([u,v])=>u===a&&v===row[(i+1)%row.length])));
  const holeEdges=graph.faces_holes!.map(holes=>holes.map(row=>row.map((a,i)=>graph.edges_vertices.findIndex(([u,v])=>u===a&&v===row[(i+1)%row.length]))));
  Object.assign(graph,materialCanonical(graph.vertices_coords,graph.edges_vertices,graph.edges_assignment,graph.edges_foldAngle,graph.faces_vertices!,faceEdges,graph.faces_holes,holeEdges));
  if(!hole)delete graph.faces_holes;
  const sourceDoc=materialDoc(graph,shown),faceOrders:[number,number,number][]=[];
  for(let a=0;a<offsets.length;a++)for(let b=a+1;b<offsets.length;b++)faceOrders.push([a,b,-1]);
  return {sourceStateId:'cp0',sourceRevision:0,sourceDoc,view:defaultModelView(),result:{geometry:{status:'ready',message:'fixture',vertices:shown,faces:graph.faces_vertices!,graph},layers:{status:'solved',message:'fixture',faceOrders,faceOrder:offsets.map((_,i)=>i)},warnings:[]}};
}
test('only paper covering the pointer contributes neighbours; same face changes locally',()=>{
  const pose=fixture([0,5,0,30]),before=structuredClone(pose),model=prepareDiagramLocalLayerProbe(pose);
  assert.deepEqual(model.at([2,5],0)?.faces,[0,2]);
  assert.deepEqual(model.at([2,5],0)?.above,[2]);
  assert.deepEqual(model.at([8,5],0)?.above,[2,1]);
  assert.equal(model.at([30,5],0),null);assert.equal(model.at([20,20]),null);
  assert.deepEqual(pose,before);
});
test('the wheel contains at most two neighbours on either side of the hovered material face',()=>{
  const model=prepareDiagramLocalLayerProbe(fixture(Array(9).fill(0))),probe=model.at([4,5],4)!;
  assert.deepEqual(probe.above,[6,5]);assert.deepEqual(probe.below,[3,2]);
  assert.deepEqual(model.at([4,5],8)?.above,[]);assert.deepEqual(model.at([4,5],0)?.below,[]);
});
test('CP points map to the corresponding material occurrence, and back view reverses neighbours',()=>{
  const pose=fixture([0,0,0,0,0]),front=prepareDiagramLocalLayerProbe(pose).fromCP([44,5],[2])!;
  assert.equal(front.face,2);assert.deepEqual(front.above,[4,3]);assert.deepEqual(front.below,[1,0]);
  const back=prepareDiagramLocalLayerProbe({...pose,view:{...pose.view!,side:'back',rotation:37}}).fromCP([44,5],[2])!;
  assert.equal(back.face,2);assert.deepEqual(back.above,[0,1]);assert.deepEqual(back.below,[3,4]);
});
test('a real hole excludes its surrounding face from local coverage',()=>{
  const model=prepareDiagramLocalLayerProbe(fixture([0,0],true));
  assert.deepEqual(model.at([5,5])?.faces,[1]);assert.equal(model.fromCP([5,5],[0]),null);
  assert.deepEqual(model.at([1,5])?.faces,[0,1]);
});
test('relationships through absent paper never manufacture local order',()=>{
  const pose=fixture([0,30,0]);pose.result.layers.faceOrders=[[0,1,-1],[1,2,-1]];
  const probe=prepareDiagramLocalLayerProbe(pose).at([5,5],0)!;
  assert.equal(probe.order.status,'unconfirmed');assert.deepEqual(probe.above,[]);
});
test('cycles elsewhere do not invalidate an independently ordered local overlap',()=>{
  const pose=fixture([0,0,30]);pose.result.layers.faceOrders=[[0,1,-1],[1,2,-1],[2,0,-1]];
  assert.deepEqual(prepareDiagramLocalLayerProbe(pose).at([5,5],0)?.above,[1]);
});
test('hidden layers remain physical neighbours, while the default hovered face is visible',()=>{
  const pose=fixture([0,0,0]);pose.hiddenFaces=[2];
  const model=prepareDiagramLocalLayerProbe(pose),probe=model.at([5,5])!;
  assert.equal(probe.face,1);assert.deepEqual(probe.above,[2]);assert.deepEqual(probe.below,[0]);
  assert.equal(model.faceSample(2)?.face,2);
});
test('unconfirmed paper does not claim a verified local order',()=>{
  const pose=fixture([0,0]);pose.result.layers.status='unknown';
  assert.equal(prepareDiagramLocalLayerProbe(pose).at([5,5],0)?.order.status,'unconfirmed');
});
