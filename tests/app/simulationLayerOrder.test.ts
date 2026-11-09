import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,FlatFoldResult,FoldGraph} from '../../src/core/types';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {simulationLayerOrder,simulationLayerOrderSupported,simulationSourceSignature,validateSimulationLayerOrder} from '../../src/engine/simLayerOrder';

function source():FoldGraph {
  return {vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]],
    edges_assignment:['B','B','B','B','V'],edges_foldAngle:[0,0,0,0,180],faces_vertices:[[0,1,2],[0,2,3]],
    faces_edges:[[0,1,4],[4,2,3]],edges_faces:[[0],[0],[1],[1],[0,1]],faces_faces:[[null,null,1],[0,null,null]] as unknown as number[][]};
}
function result(graph=source()):FlatFoldResult {
  return {geometry:{status:'ready',message:'',vertices:[[0,0],[1,0],[1,1],[1,0]],faces:structuredClone(graph.faces_vertices!)},
    layers:{status:'solved',message:'',faceOrders:[[0,1,1]],faceOrder:[1,0],solutionIndex:3},warnings:[]};
}

test('CP signature ignores display fields and object key order, but binds actual topology and targets',()=>{
  const graph=source(),signature=simulationSourceSignature(graph);
  assert.ok(signature);assert.equal(simulationSourceSignature({...graph,file_title:'renamed',displayColor:'red',faceOrders:[[1,0,-1]]}),signature);
  assert.equal(simulationSourceSignature(Object.fromEntries(Object.entries(graph).reverse())),signature);
  for(const change of [
    (g:FoldGraph)=>{g.vertices_coords[0][0]=.1;},(g:FoldGraph)=>{g.edges_vertices[0]=[0,2];},
    (g:FoldGraph)=>{g.edges_assignment[4]='M';},(g:FoldGraph)=>{g.edges_foldAngle[4]=90;},
    (g:FoldGraph)=>{g.faces_vertices![0]=[2,1,0];},(g:FoldGraph)=>{g.faces_edges![0]=[1,0,4];},
    (g:FoldGraph)=>{g.edges_faces![0]=[1];},(g:FoldGraph)=>{g.faces_faces![0]=[1,1,1];},
    (g:FoldGraph)=>{g.zhezhi_flatCreases='marks';},
  ]){const next=structuredClone(graph);change(next);assert.notEqual(simulationSourceSignature(next),signature);}
});

test('CP signature binds holes and their independent incidences',()=>{
  const graph={...source(),faces_holes:[[[0,1,2]],[]],faces_holeEdges:[[[0,1,4]],[]],faces_holeFaces:[[[1,1,null]],[]]};
  const signature=simulationSourceSignature(graph);assert.ok(signature);
  const changed=structuredClone(graph);changed.faces_holes[0][0]=[2,1,0];assert.notEqual(simulationSourceSignature(changed),signature);
  changed.faces_holes=structuredClone(graph.faces_holes);changed.faces_holeEdges[0][0]=[1,0,4];assert.notEqual(simulationSourceSignature(changed),signature);
  assert.equal(simulationSourceSignature({...graph,faces_holeEdges:[]}), '');
});

test('invalid or unbounded CP data has no signature',()=>{
  for(const value of [null,[],{}, {...source(),vertices_coords:[[NaN,0],[1,0],[0,1]]},
    {...source(),edges_vertices:[[0,99]]},{...source(),edges_foldAngle:[0,0,0,0,Infinity]},
    {...source(),faces_vertices:[[0,1,99]]},{...source(),vertices_coords:Array.from({length:8193},()=>[0,0])},
    {...source(),faces_holes:[[],[]],faces_holeFaces:[[[0]],[]]},
    {...source(),edges_assignment:new Array(5)},{...source(),edges_foldAngle:[0,0,0,0,undefined]},
  ])assert.equal(simulationSourceSignature(value),'');
});

test('selected solved result exports raw FOLD relations without adopting a paint order',()=>{
  const graph=source(),flat=result(),before=structuredClone(flat),certificate=simulationLayerOrder(graph,flat)!;
  assert.deepEqual(certificate,{sourceSignature:simulationSourceSignature(graph),sourceFaceCount:2,faceOrders:[[0,1,1]]});
  assert.deepEqual(flat,before);certificate.faceOrders[0][2]=-1;assert.deepEqual(flat.layers.faceOrders,[[0,1,1]]);
  flat.layers.faceOrders=[[0,1,-1]];assert.deepEqual(simulationLayerOrder(graph,flat)!.faceOrders,[[0,1,-1]]);
  delete flat.layers.faceOrders;assert.equal(simulationLayerOrder(graph,flat),null,'a global paint order cannot replace a relation certificate');
});

test('stale, deformed, unsolved or malformed result certificates are rejected',()=>{
  for(const change of [
    (r:FlatFoldResult)=>{r.geometry.status='invalid';},(r:FlatFoldResult)=>{r.geometry.modified=true;},
    (r:FlatFoldResult)=>{r.layers.status='unknown';},(r:FlatFoldResult)=>{r.geometry.vertices.pop();},
    (r:FlatFoldResult)=>{r.geometry.vertices[0]=[NaN,0];},(r:FlatFoldResult)=>{r.geometry.faces.reverse();},
    (r:FlatFoldResult)=>{r.layers.faceOrders=[[0,1,0]];},(r:FlatFoldResult)=>{r.layers.faceOrders=[[0,2,1]];},
    (r:FlatFoldResult)=>{r.layers.faceOrders=[];},
  ]){const flat=result();change(flat);assert.equal(simulationLayerOrder(source(),flat),null);}
});

test('only known flat-fold endpoint targets can use the certificate',()=>{
  for(const [assignment,angle] of [['V',90],['V',-180],['M',180],['M',-90],['V',0],['M',0],['V',null],['U',null],['U',0],['A',0],['F',90],['B',90]] as const){
    const graph=source();graph.edges_assignment[4]=assignment;graph.edges_foldAngle[4]=angle;
    assert.equal(simulationLayerOrder(graph,result()),null,`${assignment}/${angle}`);
    assert.equal(simulationLayerOrderSupported(graph),false,`${assignment}/${angle} must not start a flat-fold worker`);
  }
  for(const [assignment,angle] of [['V',180],['M',-180],['F',0]] as const){
    const graph=source();graph.edges_assignment[4]=assignment;graph.edges_foldAngle[4]=angle;
    assert.ok(simulationLayerOrder(graph,result()),`${assignment}/${angle}`);
    assert.equal(simulationLayerOrderSupported(graph),true);
  }
  const noTargets=source();delete (noTargets as Partial<FoldGraph>).edges_foldAngle;assert.ok(simulationLayerOrder(noTargets,result()));
});

function stripDocument(panels:number,first:'M'|'V'='M'):Doc {
  const doc:Doc={name:'真实纸带',paper:{width:panels,height:1},segments:[
    {id:'bottom',a:[0,0],b:[panels,0],assignment:'B',angle:0},
    {id:'right',a:[panels,0],b:[panels,1],assignment:'B',angle:0},
    {id:'top',a:[panels,1],b:[0,1],assignment:'B',angle:0},
    {id:'left',a:[0,1],b:[0,0],assignment:'B',angle:0},
  ]};
  for(let x=1;x<panels;x++){
    const assignment=x%2===1?first:first==='M'?'V':'M';
    doc.segments.push({id:`fold-${x}`,a:[x,0],b:[x,1],assignment,angle:assignment==='M'?-180:180});
  }
  return doc;
}

test('real single mountain and valley folds retain their computed source indexing and relation signs',()=>{
  for(const assignment of ['M','V'] as const){
    const doc=stripDocument(2,assignment),before=structuredClone(doc),graph=buildFold(doc).graph,flat=computeFlatFold(doc),flatBefore=structuredClone(flat);
    assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(flat.geometry.faces.length,2);
    const certificate=simulationLayerOrder(graph,flat)!;assert.ok(certificate);assert.equal(certificate.sourceFaceCount,2);
    assert.deepEqual(certificate.faceOrders,flat.layers.faceOrders);assert.equal(certificate.sourceSignature,simulationSourceSignature(graph));
    assert.equal(simulationSourceSignature(JSON.parse(JSON.stringify(graph))),certificate.sourceSignature,'undefined boundary neighbours normalize to JSON null');
    assert.equal(simulationSourceSignature(structuredClone(graph)),certificate.sourceSignature,'iframe structured clone preserves the same CP identity');
    assert.deepEqual(validateSimulationLayerOrder(certificate,simulationSourceSignature(graph),2),certificate);
    assert.deepEqual(flat,flatBefore);assert.deepEqual(doc,before);
  }
});

test('real four-panel accordion extracts the currently computed layer solution without imposing a paint order',()=>{
  const doc=stripDocument(4),graph=buildFold(doc).graph,flat=computeFlatFold(doc,undefined,{solutionIndex:0});
  assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(flat.geometry.faces.length,4);
  const certificate=simulationLayerOrder(graph,flat)!;assert.ok(certificate);assert.equal(certificate.sourceFaceCount,4);
  assert.deepEqual(certificate.faceOrders,flat.layers.faceOrders);assert.ok(certificate.faceOrders.length>=3);
  const selected=computeFlatFold(doc,undefined,{solutionIndex:(flat.layers.solutionCount??0)>1?1:0});
  assert.equal(selected.layers.status,'solved');assert.deepEqual(simulationLayerOrder(graph,selected)!.faceOrders,selected.layers.faceOrders);
  delete selected.layers.faceOrder;
  assert.deepEqual(simulationLayerOrder(graph,selected)!.faceOrders,selected.layers.faceOrders,'a complete global paint order is not required');
});

test('real flat solver still reflects a zero-angle M/V crease, so that layer certificate must be rejected',()=>{
  for(const assignment of ['M','V'] as const){
    const doc=stripDocument(2,assignment),folded=computeFlatFold(doc);
    doc.segments.at(-1)!.angle=0;
    const graph=buildFold(doc).graph,flat=computeFlatFold(doc);
    assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
    assert.deepEqual(flat.geometry.vertices,folded.geometry.vertices,'the flat solver uses a signed reflection despite the zero-angle target');
    assert.ok(simulationSourceSignature(graph),'zero angle remains part of the precise CP identity');
    assert.equal(simulationLayerOrderSupported(graph),false);assert.equal(simulationLayerOrder(graph,flat),null);
  }
});

test('message validation rejects source changes, invalid relations and duplicate face pairs',()=>{
  const graph=source(),signature=simulationSourceSignature(graph),certificate=simulationLayerOrder(graph,result())!;
  assert.deepEqual(validateSimulationLayerOrder(certificate,signature,2),certificate);
  for(const value of [null,[],{...certificate,sourceSignature:signature+' '},{...certificate,sourceFaceCount:3},
    {...certificate,faceOrders:[[0,0,1]]},{...certificate,faceOrders:[[0,1,NaN]]},
    {...certificate,faceOrders:[[0,1,1],[1,0,-1]]},{...certificate,faceOrders:[[0,1,1,1]]},
    {...certificate,faceOrders:[[.5,1,1]]},{...certificate,faceOrders:[]},{...certificate,paintOrder:[1,0]},
  ])assert.equal(validateSimulationLayerOrder(value,signature,2),null);
  assert.equal(validateSimulationLayerOrder(certificate,'',2),null);
  assert.equal(validateSimulationLayerOrder(certificate,signature,NaN),null);
});

test('partial orders and globally cyclic relations remain valid for local overlap regions',()=>{
  const signature=simulationSourceSignature(source());
  for(const faceOrders of [[[0,1,1]],[[0,1,1],[1,2,1],[2,0,1]]]){
    const value={sourceSignature:signature,sourceFaceCount:3,faceOrders};
    const checked=validateSimulationLayerOrder(value,signature,3)!;assert.ok(checked);assert.deepEqual(checked.faceOrders,faceOrders);
    checked.faceOrders[0][2]=-1;assert.equal(faceOrders[0][2],1,'message payload is copied');
  }
});
