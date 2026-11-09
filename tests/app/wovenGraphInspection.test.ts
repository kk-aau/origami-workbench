import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readWovenGraphPackage,wovenResultMatchesGraph,inspectWovenGraphResult,wovenCutFold} from '../../src/app/wovenGraphInspection';
import {wovenGraphPreset} from '../../src/app/wovenGraph';
import {wovenIn3437Source,recomputeWovenGraphSource} from '../../src/app/wovenGraphSource';
import {prepareTessResult} from '../../src/app/tessellation';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases;
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
test('mother import accepts ordered raw geometry and exact replayable source packages',()=>{
 const graph=wovenGraphPreset();assert.deepEqual(readWovenGraphPackage(graph),{schema:'zhezhi-woven-mother-v1',graph});
 const graphSource=wovenIn3437Source(),actual=recomputeWovenGraphSource(graphSource).graph,pack={schema:'zhezhi-woven-mother-v1',graph:actual,graphSource};
 assert.deepEqual(readWovenGraphPackage(JSON.parse(JSON.stringify(pack))),pack);const loaded=readWovenGraphPackage(pack)!;loaded.graph.vertices[0][0]++;assert.notEqual(loaded.graph.vertices[0][0],pack.graph.vertices[0][0]);
 assert.equal(actual.vertices.length,46);assert.equal(actual.edges.length,79);
});
test('mother import rejects foreign fields, malformed geometry and mismatched original source',()=>{
 const graphSource=wovenIn3437Source(),graph=recomputeWovenGraphSource(graphSource).graph,pack={schema:'zhezhi-woven-mother-v1',graph,graphSource};
 for(const change of [(p:any)=>p.schema='other',(p:any)=>p.extra=1,(p:any)=>p.graph.vertices[0][0]+=.01,(p:any)=>p.graphSource.samePtTolerance=.1,(p:any)=>p.graph.edges.reverse(),(p:any)=>p.graph.vertices[0][0]=null]){const p=clone(pack);change(p);assert.equal(readWovenGraphPackage(p),null);}
 assert.equal(readWovenGraphPackage({...wovenGraphPreset(),edges_assignment:[]}),null);
});
test('changed drafts cannot reuse a previous original CP or FF, regardless of object key order',()=>{
 const f=cases[0],r=prepareTessResult(f.response,f.params),g=f.params.graph;assert.equal(wovenResultMatchesGraph(r,{edges:g.edges,vertices:g.vertices}),true);
 const changed=clone(g);changed.vertices[0][0]+=.01;assert.equal(wovenResultMatchesGraph(r,changed),false);assert.equal(inspectWovenGraphResult(r,changed,undefined,f.params).ok,false);
 assert.equal(wovenResultMatchesGraph(r,null),false);assert.equal(wovenResultMatchesGraph(null,g),false);
 const swapped=clone(g);swapped.edges.reverse();assert.equal(wovenResultMatchesGraph(r,swapped),false);
});
test('source-only edits invalidate old generated assignment even when mother points stay unchanged',()=>{
 const f=cases[0],r=prepareTessResult(clone(f.response),f.params),graphSource=wovenIn3437Source(),graph=recomputeWovenGraphSource(graphSource).graph;
 r.source.graph=graph;r.source.graphSource=graphSource;assert.equal(wovenResultMatchesGraph(r,graph,graphSource),true);assert.equal(wovenResultMatchesGraph(r,graph),false);
 const reordered=Object.fromEntries(Object.entries(graphSource).reverse()) as typeof graphSource;assert.equal(wovenResultMatchesGraph(r,graph,reordered),true);
 const changed=clone(graphSource);changed.invertFoldType=false as true;assert.equal(wovenResultMatchesGraph(r,graph,changed),false);
});
test('all finite-boundary fixtures inspect raw original coordinates and B incidence without display normalization',()=>{
 for(const f of cases){const r=prepareTessResult(f.response,f.params),check=inspectWovenGraphResult(r,f.params.graph,undefined,f.params);assert.equal(check.ok,true,f.name);if(!check.ok)continue;
  assert.deepEqual(check.topology.sourceCP,f.response.fold.vertices_coords);assert.deepEqual(check.topology.sourceFolded,f.response.source.foldedForm);
  for(const edge of check.topology.internalBoundaryEdges){assert.equal(f.response.fold.edges_assignment[edge],'B');assert.equal(check.topology.edgeFaceIncidence[edge].length,2);}
 }
});
test('forged cut restoration and face data disable original CP/FF inspection rather than silently showing it',()=>{
 for(const change of [(r:any)=>r.source.wovenCutTopology.internalBoundaryEdges=[],(r:any)=>r.source.wovenCutTopology.edgeRestoreAnglesDeg[2]=0,(r:any)=>r.source.foldedForm[0][0]+=.2,(r:any)=>r.fold.faces_vertices[0].reverse()]){const f=cases[0],r=prepareTessResult(clone(f.response),f.params);change(r);assert.equal(inspectWovenGraphResult(r,f.params.graph,undefined,f.params).ok,false);}
});
test('split FOLD exports explicit CP and FF with single-owner cut sides, source maps and no layer claim',()=>{
 for(const f of cases.slice(0,4)){
  const r=prepareTessResult(f.response,f.params),check=inspectWovenGraphResult(r,f.params.graph,undefined,f.params);assert.equal(check.ok,true,f.name);if(!check.ok)continue;
  const t=check.topology,out=wovenCutFold(t),ff=out.file_frames[0];
  assert.deepEqual(out.vertices_coords,t.splitGraph.vertices_coords);assert.deepEqual(ff.vertices_coords,t.splitFolded);
  assert.equal(ff.frame_inherit,false);assert.deepEqual(ff.edges_vertices,out.edges_vertices);assert.deepEqual(ff.faces_vertices,out.faces_vertices);
  assert.deepEqual(out.faces_edges,t.splitGraph.faces_edges);assert.deepEqual(out.edges_faces,t.splitGraph.edges_faces);assert.deepEqual(ff.faces_edges,out.faces_edges);assert.deepEqual(ff.edges_faces,out.edges_faces);
  assert.deepEqual(out.zhezhi_source_face,f.response.fold.faces_vertices.map((_:unknown,i:number)=>i));
  assert.equal(out.zhezhi_layer_order_certified,false);assert.equal(Object.hasOwn(out,'faceOrders'),false);assert.equal(Object.hasOwn(ff,'faceOrders'),false);
  out.vertices_coords.forEach((p,i)=>assert.deepEqual(p,f.response.fold.vertices_coords[out.zhezhi_source_vertex[i]]));
  ff.vertices_coords.forEach((p,i)=>assert.deepEqual(p,f.response.source.foldedForm[ff.zhezhi_source_vertex[i]]));
  for(const sourceEdge of t.internalBoundaryEdges){const copies=out.zhezhi_source_edge.flatMap((e,i)=>e===sourceEdge?[i]:[]);assert.equal(copies.length,2);
   for(const i of copies){assert.equal(out.edges_assignment[i],'B');const [a,b]=out.edges_vertices[i];assert.equal(out.faces_vertices.filter(face=>face.some((v,j)=>v===a&&face[(j+1)%face.length]===b||v===b&&face[(j+1)%face.length]===a)).length,1);}
  }
  out.vertices_coords[0][0]++;assert.notDeepEqual(out.vertices_coords,t.splitGraph.vertices_coords);
 }
});
