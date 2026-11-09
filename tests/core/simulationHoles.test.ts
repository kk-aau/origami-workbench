import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationFoldSnapshot} from '../../src/engine/simDisplay';
import {simulationObjText,simulationStlText} from '../../src/engine/simExport';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {holesMaterial,mergeHoleRing,mergeTwoHoleRing} from '../fixtures/materialHoles';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {materialPointInside} from '../../src/core/materialTraceGeometry';
import type {FoldGraph} from '../../src/core/types';

function verifyCoverage(g:FoldGraph,area:number,count:number){
  const before=structuredClone(g),{prepared}=prepareSimulationDocument(g);
  assert.deepEqual(g,before);assert.equal(prepared.faceCount,count);assert.equal(prepared.vertexCount,g.vertices_coords.length);
  assert.deepEqual(prepared.edgesVertices.slice(0,g.edges_vertices.length),g.edges_vertices);
  assert.deepEqual(prepared.edgesAssignment.slice(0,g.edges_vertices.length),g.edges_assignment);
  let total=0;
  for(const t of prepared.facesVertices){
    const [a,b,c]=t.map(v=>g.vertices_coords[v]);const signed=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
    total+=Math.abs(signed);assert.ok(Math.abs(signed)>0);
    const mid=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3] as [number,number];
    for(const rings of g.faces_holes??[])for(const h of rings)assert.ok(!materialPointInside(mid,h.map(v=>g.vertices_coords[v])));
  }
  assert.equal(total,area);
  g.edges_vertices.forEach((_,e)=>assert.equal(prepared.edgesFaces[e].length,g.edges_assignment[e]==='B'?1:2));
  prepared.edgesVertices.slice(g.edges_vertices.length).forEach((_,i)=>{
    const e=i+g.edges_vertices.length;assert.equal(prepared.edgesAssignment[e],'F');assert.equal(prepared.edgesFoldAngle[e],0);assert.equal(prepared.edgesFaces[e].length,2);
  });
  assert.equal(prepared.fold.faces_holes,undefined);assert.equal(prepared.fold.faces_holeEdges,undefined);
  return prepared;
}

test('simulation annulus covers all original boundary subdivisions and never covers its opening',()=>{
  verifyCoverage(holesMaterial(mergeHoleRing().result.doc).graph,80000,16);
});

test('two openings have exact material area and two distinct inner boundaries in the simulation mesh',()=>{
  verifyCoverage(holesMaterial(mergeTwoHoleRing().result.doc).graph,130000,26);
});

test('coincident independent holed material copies are not welded by simulation preparation',()=>{
  const doc=mergeHoleRing().result.doc,r=copyMaterialComponents(doc,{kind:'material-copy',segmentIds:holesMaterial(doc).edgeSegmentIds,placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]});
  const g=holesMaterial(r.doc).graph,p=verifyCoverage(g,160000,32);
  assert.equal(p.vertexCount,32);assert.ok(p.facesVertices.slice(0,16).every(t=>t.every(v=>v<16)));assert.ok(p.facesVertices.slice(16).every(t=>t.every(v=>v>=16)));
});

test('a genuine mountain hinge adjoining a holed face enters the CPU solver and preserves rigid paper at an intermediate target',()=>{
  const doc=mergeHoleRing().result.doc,m=holesMaterial(doc),edge=(x:number)=>{const e=m.graph.edges_vertices.findIndex(([a,b])=>m.graph.vertices_coords[a][0]===x&&m.graph.vertices_coords[b][0]===x&&Math.min(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])===0);return {edgeId:m.edgeSegmentIds[e],fraction:.5};};
  const next=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:edge(0),to:edge(300),assignment:'M',fixedSide:'left'}).doc,g=holesMaterial(next).graph;
  assert.ok(g.faces_holes!.some(rs=>rs.length));
  const before=JSON.stringify(next),dxf=exportDXF(next).text,{prepared}=prepareSimulationDocument(g),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:30,timeStepScale:.35,damping:.5});
  try{
    solver.step(4000);const positions=new Float32Array(prepared.vertexCount*3);solver.readPositions(positions);
    assert.ok(Array.from(positions).every(Number.isFinite));assert.ok(positions.some((v,i)=>i%3===1&&Math.abs(v)>1e-3));
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.03);
    const snapshot=simulationFoldSnapshot(prepared,positions,.3,solver.stepCount);
    assert.equal(snapshot.faces_holes,undefined);assert.equal(snapshot.edges_foldAngle,undefined);assert.equal(snapshot.faces_vertices.length,prepared.faceCount);
    solver.reset();const reset=new Float32Array(positions.length);solver.readPositions(reset);assert.deepEqual(reset,model.originalPositions);
  }finally{solver.dispose();}
  assert.equal(JSON.stringify(next),before);assert.equal(exportDXF(next).text,dxf);
});

test('planar 3D hole faces use their own plane and preserve the standard FOLD axis conversion',()=>{
  const base=holesMaterial(mergeHoleRing().result.doc).graph;
  for(const lift of [(x:number,y:number)=>[x,y,17],(x:number,y:number)=>[17,x,y],(x:number,y:number)=>[x,y*.6,y*.8]]){
    const source={...structuredClone(base),vertices_coords:base.vertices_coords.map(([x,y])=>lift(x,y))},before=structuredClone(source),{prepared}=prepareSimulationDocument(source);
    assert.equal(prepared.faceCount,16);source.vertices_coords.forEach(([x,y,z],v)=>assert.deepEqual(Array.from(prepared.positions.slice(3*v,3*v+3)),[x,z,-y]));assert.deepEqual(source,before);
  }
});

test('reversed source face winding is preserved consistently across all simulation triangles',()=>{
  const g=structuredClone(holesMaterial(mergeHoleRing().result.doc).graph);g.faces_vertices![0].reverse();g.faces_holes![0][0].reverse();delete g.faces_holeEdges;delete g.faces_holeFaces;
  const p=verifyCoverage(g,80000,16);for(const t of p.facesVertices){const [a,b,c]=t.map(v=>g.vertices_coords[v]);assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0);}
});

test('3D FOLD, OBJ and STL export the complete hole mesh with no stale original-face hole incidence',()=>{
  const g=holesMaterial(mergeHoleRing().result.doc).graph,{prepared}=prepareSimulationDocument(g),snapshot=simulationFoldSnapshot(prepared,prepared.positions,0,0);
  assert.equal(snapshot.faces_holes,undefined);assert.equal(snapshot.faces_holeEdges,undefined);assert.equal(snapshot.faces_holeFaces,undefined);
  const round=prepareSimulationDocument(JSON.parse(JSON.stringify(snapshot)));assert.equal(round.prepared.faceCount,16);assert.deepEqual(round.prepared.positions,prepared.positions);
  const obj=simulationObjText(prepared,prepared.positions),stl=simulationStlText(prepared,prepared.positions);
  const objFaces=obj.split('\n').filter(s=>s.startsWith('f ')).map(s=>s.slice(2).split(' ').map(v=>Number(v.split('//')[0])-1));assert.deepEqual(objFaces,prepared.facesVertices);
  assert.equal((stl.match(/facet normal/g)??[]).length,16);
  const stlVertices=[...stl.matchAll(/vertex ([^\n]+)/g)].map(m=>m[1].split(' ').map(Number));
  assert.deepEqual(stlVertices,prepared.facesVertices.flatMap(t=>t.map(v=>snapshot.vertices_coords[v])));
});

test('malformed hole geometry, incidence, missing edges and non-planar input fail atomically before simulation',()=>{
  const base=holesMaterial(mergeHoleRing().result.doc).graph;
  const bads:FoldGraph[]=[];
  for(const mutate of [(g:FoldGraph)=>{g.faces_holes![0][0].reverse();},(g:FoldGraph)=>{g.faces_holes![0][0][0]=g.faces_vertices![0][0];},(g:FoldGraph)=>{g.faces_holeEdges![0][0][0]=999;},(g:FoldGraph)=>{g.faces_holeFaces![0][0][0]=0;},(g:FoldGraph)=>{g.edges_vertices.pop();},(g:FoldGraph)=>{g.faces_holes=[];},(g:FoldGraph)=>{for(const v of g.faces_holes![0][0])g.vertices_coords[v][0]+=100;}]){const g=structuredClone(base);mutate(g);bads.push(g);}
  for(const g of bads){const before=structuredClone(g);assert.throws(()=>prepareSimulationDocument(g),/带孔模拟|孔洞|原面/);assert.deepEqual(g,before);}
  const nonplanar={...structuredClone(base),vertices_coords:base.vertices_coords.map(([x,y],i)=>[x,y,i===0?10:0])};assert.throws(()=>prepareSimulationDocument(nonplanar),/同一平面/);
});
