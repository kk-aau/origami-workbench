import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,distance,epsilonFor} from '../../src/core/geometry';
import {diagnose} from '../../src/core/diagnostics';
import {computeFlatFold,computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {flatCreaseLayerRegions,hasFiniteFlatCreases} from '../../src/core/flatCreaseSupport';
import {exportModelSnapshot,importModelSnapshot} from '../../src/core/modelSnapshot';
import {defaultAngle,type FoldGraph,type Point,type Segment} from '../../src/core/types';

const segment=(a:Point,b:Point,assignment:Segment['assignment'],id='mark'):Segment=>({id,a,b,assignment,angle:defaultAngle(assignment)});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
function fixture(folded:boolean,boundary:boolean){
  const doc=blankDoc('有限预折痕',100,100);
  if(folded)doc.segments.push(segment([50,0],[50,100],'V','fold'));
  doc.segments.push(segment(boundary?[0,30]:[20,30],boundary?[50,30]:[80,30],'F'));
  return doc;
}

function withoutIncidence(input:FoldGraph,fields:('faces_edges'|'edges_faces'|'faces_faces')[]=['faces_edges','edges_faces','faces_faces']){
  const graph=structuredClone(input);for(const field of fields)delete graph[field];return graph;
}

for(const hasF of [false,true])test(`ordinary graph without optional incidence preserves its layer solution: F=${hasF}`,()=>{
  const doc=blankDoc('省略可选邻接',100,100);
  if(hasF)doc.segments.push(segment([0,50],[100,50],'F','separating'));
  const source=buildFold(doc).graph,expected=recomputeFlatLayers(computeFlatGeometry(source,1e-6));
  assert.equal(expected.layers.status,'solved');
  for(const fields of [['faces_edges'],['edges_faces'],['faces_edges','edges_faces','faces_faces']] as ('faces_edges'|'edges_faces'|'faces_faces')[][]){
    const graph=withoutIncidence(source,fields),saved=structuredClone(graph);
    assert.equal(hasFiniteFlatCreases(graph),false,'a separating F is not a finite branch');
    assert.equal(flatCreaseLayerRegions(graph,1e-6),null);
    const result=recomputeFlatLayers(computeFlatGeometry(graph,1e-6));
    assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);
    assert.deepEqual(result.layers.faceOrders,expected.layers.faceOrders);assert.deepEqual(result.geometry.vertices,expected.geometry.vertices);
    assert.deepEqual(result.geometry.faces,source.faces_vertices);assert.deepEqual(result.geometry.graph!.edges_vertices,source.edges_vertices);
    assert.deepEqual(graph,saved,'adjacency inference must not modify the public input');
    for(const field of fields)assert.equal(result.geometry.graph![field],undefined,'derived adjacency stays private');
  }
});

for(const boundary of [false,true])test(`missing optional incidence still recognizes and validates a genuine finite F: boundary=${boundary}`,()=>{
  const doc=fixture(true,false);
  if(boundary)doc.segments[doc.segments.length-1]=segment([0,30],[30,30],'F');
  const source=buildFold(doc).graph,expected=computeFlatFold(doc);
  for(const fields of [['faces_edges'],['edges_faces'],['faces_edges','edges_faces','faces_faces']] as ('faces_edges'|'edges_faces'|'faces_faces')[][]){
    const graph=withoutIncidence(source,fields),saved=structuredClone(graph);
    assert.equal(hasFiniteFlatCreases(graph),true);assert.ok(flatCreaseLayerRegions(graph,1e-6));
    const geometry=computeFlatGeometry(graph,1e-6),result=recomputeFlatLayers(geometry);
    assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);
    assert.deepEqual(result.geometry.vertices,expected.geometry.vertices);assert.deepEqual(result.geometry.faces,source.faces_vertices);
    assert.deepEqual(result.geometry.graph!.edges_vertices,source.edges_vertices);assert.deepEqual(result.geometry.graph!.edges_assignment,source.edges_assignment);
    assert.deepEqual(result.layers.faceOrders,expected.layers.faceOrders);assert.deepEqual(graph,saved);
  }
});

test('missing incidence cannot guess parallel slit banks or conceal dangling active creases and explicit corrupt incidence',()=>{
  const source=buildFold(fixture(false,false)).graph,parallel=withoutIncidence(source);
  parallel.edges_vertices.push([...parallel.edges_vertices[0]]);parallel.edges_assignment.push('B');parallel.edges_foldAngle.push(0);
  assert.throws(()=>flatCreaseLayerRegions(parallel,1e-6),/切口两侧边.*逐面边关联/);
  for(const assignment of ['M','V','U'] as const){
    const doc=fixture(false,false);doc.segments.push(segment([0,60],[50,60],assignment,'dangling-active'));
    assert.throws(()=>flatCreaseLayerRegions(withoutIncidence(buildFold(doc).graph),1e-6),/悬空山谷线/);
  }
  const corrupt=structuredClone(source),free=corrupt.edges_faces!.findIndex((owners,e)=>corrupt.edges_assignment[e]==='F'&&owners.length===0);
  corrupt.faces_edges![0][0]=free;
  assert.throws(()=>flatCreaseLayerRegions(corrupt,1e-6),/无效纸边/);
});

test('hole boundaries keep their explicit corner-edge contract when finite F adjacency is incomplete',()=>{
  const graph:FoldGraph={
    vertices_coords:[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60],[10,10],[20,10]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[8,9]],
    edges_assignment:['B','B','B','B','B','B','B','B','F'],edges_foldAngle:[0,0,0,0,0,0,0,0,0],
    faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],faces_holes:[[[4,7,6,5]]],faces_holeEdges:[[[7,6,5,4]]],
    edges_faces:[[0],[0],[0],[0],[0],[0],[0],[0],[]],
  };
  assert.ok(flatCreaseLayerRegions(graph,1e-6));
  assert.ok(flatCreaseLayerRegions(withoutIncidence(graph,['edges_faces']),1e-6),'declared edge occurrences can supply missing owner lists');
  for(const field of ['faces_edges','faces_holeEdges'] as const){
    const missing=structuredClone(graph);delete missing[field];delete missing.edges_faces;
    assert.throws(()=>flatCreaseLayerRegions(missing,1e-6),/孔洞.*逐面边界关联/);
  }
});

for(const folded of [false,true])for(const boundary of [false,true])test(`finite F: folded=${folded}, boundary=${boundary} retains source topology and genuine layer certificate`,()=>{
  const doc=fixture(folded,boundary),saved=structuredClone(doc),graph=buildFold(doc).graph;
  const errors=diagnose(doc).issues.filter(issue=>issue.severity==='error');assert.deepEqual(errors,[]);
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);
  assert.equal(result.geometry.vertices.length,graph.vertices_coords.length);assert.deepEqual(result.geometry.faces,graph.faces_vertices);
  assert.deepEqual(result.geometry.graph!.edges_vertices,graph.edges_vertices);assert.deepEqual(result.geometry.graph!.edges_assignment,graph.edges_assignment);
  assert.deepEqual(result.geometry.graph!.vertices_coords,result.geometry.vertices);
  graph.vertices_coords.forEach(([x,y],v)=>close(result.geometry.vertices[v],[folded&&x>50?100-x:x,y]));
  assert.deepEqual(doc,saved);assert.deepEqual(buildFold(doc).graph,graph);
  const savedGraph=structuredClone(result.geometry.graph),again=recomputeFlatLayers(result);
  assert.equal(again.layers.status,'solved',again.layers.message);assert.deepEqual(again.geometry,result.geometry);assert.deepEqual(result.geometry.graph,savedGraph);
  assert.deepEqual(again.layers.faceOrders,result.layers.faceOrders);
  const loaded=importModelSnapshot(exportModelSnapshot(doc,result));
  assert.deepEqual(loaded.source,doc);assert.deepEqual(loaded.result.geometry.vertices,result.geometry.vertices);assert.deepEqual(loaded.result.geometry.faces,graph.faces_vertices);
  assert.equal(loaded.result.layers.status,'unknown');assert.equal(recomputeFlatLayers(loaded.result).layers.status,'solved');
});

test('private F support drops only zero-area marks while preserving structural F and every material face ID',()=>{
  const doc=fixture(true,false);doc.segments.push(segment([0,70],[100,70],'F','separating'));
  const graph=buildFold(doc).graph,saved=structuredClone(graph),regions=flatCreaseLayerRegions(graph,epsilonFor(doc));assert.ok(regions);
  assert.equal(regions.faces_vertices!.length,graph.faces_vertices!.length);
  assert.ok(regions.edges_assignment.includes('F'),'the separating F remains a real boundary');
  assert.equal(regions.edges_assignment.filter(a=>a==='V').length,graph.edges_assignment.filter(a=>a==='V').length);
  assert.ok(regions.faces_vertices!.every(face=>new Set(face).size===face.length));assert.deepEqual(graph,saved);
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved',result.layers.message);
});

test('paper-external F routes, broken boundaries, and dangling M/V/U are still rejected',()=>{
  for(const [a,b] of [[[120,20],[150,20]],[[20,30],[120,30]],[[-20,30],[50,30]]] as [Point,Point][]){
    const doc=blankDoc('纸外 F',100,100);doc.segments.push(segment(a,b,'F'));
    assert.ok(diagnose(doc).issues.some(issue=>issue.severity==='error'));assert.notEqual(computeFlatFold(doc).geometry.status,'ready');
  }
  for(const assignment of ['M','V','U'] as const){
    const doc=fixture(false,false);doc.segments.push(segment([0,60],[50,60],assignment,'dangling-active'));
    assert.ok(diagnose(doc).issues.some(issue=>issue.code==='dangling-edge'&&issue.severity==='error'));assert.notEqual(computeFlatFold(doc).geometry.status,'ready');
  }
  const broken=fixture(false,false);broken.segments=broken.segments.filter((_,i)=>i!==0);
  assert.ok(diagnose(broken).issues.some(issue=>issue.severity==='error'));assert.notEqual(computeFlatFold(broken).geometry.status,'ready');
});

test('finite F layer reanalysis respects reflected raw geometry and does not use observation orientation',()=>{
  const doc=fixture(true,false),result=computeFlatFold(doc);
  result.geometry.vertices=result.geometry.vertices.map(([x,y])=>[-x+13,y-7]);
  result.geometry.graph!.vertices_coords=structuredClone(result.geometry.vertices);result.geometry.modified=true;
  const saved=structuredClone(result.geometry),again=recomputeFlatLayers(result);
  assert.equal(again.layers.status,'solved',again.layers.message);assert.deepEqual(again.geometry,saved);
  assert.deepEqual(again.layers.faceOrders,result.layers.faceOrders);
  const loaded=importModelSnapshot(exportModelSnapshot(doc,again));assert.equal(recomputeFlatLayers(loaded.result).layers.status,'solved');
});

test('finite F support preserves solver top-side constraints instead of treating them as drawing order',()=>{
  const doc=fixture(true,false),result=computeFlatFold(doc);
  const again=recomputeFlatLayers(result,{constraints:[{face:1,side:'color'}]});
  assert.equal(again.layers.status,'solved',again.layers.message);assert.deepEqual(again.layers.constraints,[{face:1,side:'color'}]);
  assert.equal(recomputeFlatLayers(result,{constraints:[{face:0,side:'color'}]}).layers.status,'no-solution');
});
