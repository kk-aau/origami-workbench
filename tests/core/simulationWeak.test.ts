import test from 'node:test';
import assert from 'node:assert/strict';
import {materialDoc} from '../fixtures/materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialFaceInside} from '../../src/core/materialRings';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {triangulateSimulationWeak} from '../../src/engine/simWeak';
import {simulationFoldSnapshot} from '../../src/engine/simDisplay';
import {simulationObjText,simulationStlText} from '../../src/engine/simExport';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDXF} from '../../src/core/dxf';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {Doc,Point} from '../../src/core/types';
import type {MaterialCurveIntent} from '../../src/core/materialCurves';
const sheet=(hole=false)=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[40,40],[60,40],[60,60],[40,60]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
const line=(a:Point,b:Point,assignment:'F'|'M'='M'):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]}],deviation:1,fixedPoint:[10,10],cpOnly:true});
const mat=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const source=(name:string)=>{const request=name==='boundary'?line([0,50],[50,50]):name==='hole'?line([0,50],[40,50]):line([25,50],[75,50]);if(name==='cross')request.curves.push(...line([50,25],[50,75]).curves);const built=editMaterialFaces(sheet(name==='hole'),request);return cutMaterialEdges(built.doc,{kind:'material-cut',segmentIds:built.insertedIds!}).doc;};
for(const [name,count]of [['interior',6],['boundary',5],['cross',12],['hole',10]] as const)test(`${name} weak slit mesh keeps every source bank/vertex and material area with no welded cut`,()=>{
 const d=source(name),g=mat(d).graph,before=JSON.stringify(d),dxf=exportDXF(d).text,p=prepareSimulationDocument(g).prepared;assert.equal(p.vertexCount,g.vertices_coords.length);assert.equal(p.faceCount,count);assert.deepEqual(p.edgesVertices.slice(0,g.edges_vertices.length),g.edges_vertices);assert.deepEqual(p.edgesAssignment.slice(0,g.edges_vertices.length),g.edges_assignment);assert.deepEqual(p.edgesFoldAngle.slice(0,g.edges_vertices.length),g.edges_foldAngle);let area=0;for(const t of p.facesVertices){const [a,b,c]=t.map(v=>g.vertices_coords[v]);const signed=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;assert.ok(signed>0);area+=signed;}assert.equal(area,name==='hole'?9600:10000);g.edges_vertices.forEach((_,e)=>assert.equal(p.edgesFaces[e].length,g.edges_assignment[e]==='B'?1:2));p.edgesVertices.slice(g.edges_vertices.length).forEach((_,i)=>{const e=i+g.edges_vertices.length;assert.equal(p.edgesAssignment[e],'F');assert.equal(p.edgesFaces[e].length,2);});assert.equal(JSON.stringify(d),before);assert.equal(exportDXF(d).text,dxf);
});
test('parallel banks sharing the same endpoint IDs keep separate triangle owners, including FOLD reimport',()=>{
 const d=source('interior'),g=mat(d).graph,p=prepareSimulationDocument(g).prepared,banks=g.edges_vertices.flatMap((e,i)=>i>3?[i]:[]);assert.equal(banks.length,2);assert.deepEqual(p.edgesVertices[banks[0]],p.edgesVertices[banks[1]]);assert.notEqual(p.edgesFaces[banks[0]][0],p.edgesFaces[banks[1]][0]);const snapshot=simulationFoldSnapshot(p,p.positions,0,0),back=prepareSimulationDocument(JSON.parse(JSON.stringify(snapshot))).prepared;assert.deepEqual(back.edgesVertices,p.edgesVertices);assert.deepEqual(back.facesEdges,p.facesEdges);assert.deepEqual(back.edgesFaces,p.edgesFaces);assert.deepEqual(back.positions,p.positions);
});
test('floating F/M constraints retain actual targets and both source edge sides rather than dropping a loose endpoint',()=>{
 for(const type of ['F','M'] as const){const d=editMaterialFaces(sheet(),line([25,50],[75,50],type)).doc,g=mat(d).graph,p=prepareSimulationDocument(g).prepared,e=g.edges_vertices.length-1;assert.equal(p.vertexCount,g.vertices_coords.length);assert.equal(p.edgesFaces[e].length,2);assert.ok(p.creaseParams.some(c=>c.edge===e));assert.equal(p.edgesAssignment[e],type);assert.equal(p.edgesFoldAngle[e],type==='M'?-180:0);if(type==='M')assert.equal(computeFlatFold(d).geometry.status,'unsupported');}
});
test('collinear multi-stroke hanging crease preserves each original segment and its intermediate node in the simulation',()=>{
 const request=line([25,50],[75,50]),c=request.curves[0];assert.equal(c.kind,'bezier-path');if(c.kind==='bezier-path')c.nodes.splice(1,0,{point:[50,50],incoming:[50,50],outgoing:[50,50]});const d=editMaterialFaces(sheet(),request).doc,g=mat(d).graph,p=prepareSimulationDocument(g).prepared;assert.equal(g.edges_assignment.filter(a=>a==='M').length,2);assert.equal(p.vertexCount,g.vertices_coords.length);assert.deepEqual(p.edgesVertices.slice(0,g.edges_vertices.length),g.edges_vertices);for(const e of g.edges_vertices.flatMap((_,i)=>g.edges_assignment[i]==='M'?[i]:[])){assert.equal(p.edgesFaces[e].length,2);assert.ok(p.creaseParams.some(c=>c.edge===e));}
});
test('independent coincident weak copies remain disconnected indexed meshes',()=>{
 const d=source('boundary'),copied=copyMaterialComponents(d,{kind:'material-copy',segmentIds:d.segments.map(s=>s.id),placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc,g=mat(copied).graph,p=prepareSimulationDocument(g).prepared,n=mat(d).graph.vertices_coords.length;assert.equal(p.vertexCount,2*n);assert.equal(p.faceCount,10);assert.ok(p.facesVertices.slice(0,5).every(t=>t.every(v=>v<n)));assert.ok(p.facesVertices.slice(5).every(t=>t.every(v=>v>=n)));
});
test('planar 3D weak faces preserve the existing FOLD axis conversion and source winding',()=>{
 const base=mat(source('hole')).graph;for(const lift of [(x:number,y:number)=>[x,y,17],(x:number,y:number)=>[17,x,y],(x:number,y:number)=>[x,.6*y,.8*y]]){const g={...structuredClone(base),vertices_coords:base.vertices_coords.map(([x,y])=>lift(x,y))},before=structuredClone(g),p=prepareSimulationDocument(g).prepared;assert.equal(p.faceCount,10);g.vertices_coords.forEach(([x,y,z],i)=>assert.deepEqual(Array.from(p.positions.slice(3*i,3*i+3)),[x,z,-y]));assert.deepEqual(g,before);}
});
test('weak source and simulation exports retain full mesh and bank incidence in FOLD/OBJ/STL',()=>{
 const g=mat(source('cross')).graph,p=prepareSimulationDocument(g).prepared,snapshot=simulationFoldSnapshot(p,p.positions,0,0),obj=simulationObjText(p,p.positions),stl=simulationStlText(p,p.positions);assert.deepEqual(snapshot.faces_edges,p.facesEdges);assert.deepEqual(snapshot.edges_faces,p.edgesFaces);assert.equal(snapshot.faces_holes,undefined);assert.equal(snapshot.edges_foldAngle,undefined);assert.equal(obj.split('\n').filter(s=>s.startsWith('f ')).length,p.faceCount);assert.equal((stl.match(/facet normal/g)??[]).length,p.faceCount);const back=prepareSimulationDocument(snapshot).prepared;assert.equal(back.vertexCount,p.vertexCount);assert.deepEqual(back.facesEdges,p.facesEdges);
});
test('real M hinge with an adjoining hanging F line drives CPU motion and reset without altering source CP',()=>{
 const base=editMaterialFaces(sheet(),line([0,50],[100,50])).doc,m=mat(base),face=m.graph.faces_vertices!.findIndex((_,f)=>materialFaceInside(m.graph,f,[20,20])),d=editMaterialFaces(base,{...line([20,20],[60,20],'F'),face}).doc,g=mat(d).graph,before=JSON.stringify(d),dxf=exportDXF(d).text,p=prepareSimulationDocument(g).prepared,model=new OrigamiModel(p),solver=new ReferenceSolver(model,{foldPercent:.3,timeStepScale:.35,damping:.5});try{solver.step(4000);const result=new Float32Array(p.vertexCount*3);solver.readPositions(result);assert.ok(Array.from(result).every(Number.isFinite));assert.ok(result.some((v,i)=>i%3===1&&Math.abs(v)>1e-3));assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.03);solver.reset();solver.readPositions(result);assert.deepEqual(result,model.originalPositions);}finally{solver.dispose();}assert.equal(JSON.stringify(d),before);assert.equal(exportDXF(d).text,dxf);
});
test('hanging M enters the numerical driver without claiming a valid rigid flat-fold solution',()=>{
 const d=editMaterialFaces(sheet(),line([25,50],[75,50])).doc,p=prepareSimulationDocument(mat(d).graph).prepared,model=new OrigamiModel(p),solver=new ReferenceSolver(model,{foldPercent:.1,timeStepScale:.25,damping:.6});try{solver.step(500);const result=new Float32Array(p.vertexCount*3);solver.readPositions(result);assert.ok(Array.from(result).every(Number.isFinite));assert.ok(p.creaseParams.some(c=>p.edgesAssignment[c.edge]==='M'));assert.equal(computeFlatFold(d).geometry.status,'unsupported');}finally{solver.dispose();}
});
test('missing/forged incidence, unknown targets, non-planar patches and forged mesh markers reject atomically',()=>{
 const g=mat(source('hole')).graph;for(const [index,mutate] of [(d:any)=>delete d.faces_edges,(d:any)=>{d.faces_holeEdges=[[[]]];},(d:any)=>{d.edges_faces[0]=[1];},(d:any)=>{d.faces_edges[0][0]=d.faces_edges[0][1];},(d:any)=>{d.vertices_coords=d.vertices_coords.map(([x,y]:number[],i:number)=>[x,y,i===0?20:0]);}].entries()){const bad:any=structuredClone(g);mutate(bad);const before=JSON.stringify(bad);assert.throws(()=>prepareSimulationDocument(bad),undefined,`mutation ${index}`);assert.equal(JSON.stringify(bad),before);}const generated=triangulateSimulationWeak(g as any),bad=structuredClone(generated);delete bad.faces_edges;assert.throws(()=>prepareSimulationDocument(bad));const m=mat(editMaterialFaces(sheet(),line([25,50],[75,50])).doc).graph;m.edges_foldAngle[m.edges_assignment.indexOf('M')]=null;assert.throws(()=>prepareSimulationDocument(m),/目标角未知/);
});

test('reverse-wound actual weak contours retain their original directed source edges',()=>{
 for(const name of ['interior','boundary','cross','hole']){const g=structuredClone(mat(source(name)).graph);const reverse=(r:number[])=>[r[0],...r.slice(1).reverse()];g.faces_vertices=g.faces_vertices!.map(reverse);g.faces_edges=g.faces_edges!.map(r=>[...r].reverse());g.faces_faces=g.faces_faces?.map(r=>[...r].reverse());g.faces_holes=g.faces_holes?.map(rs=>rs.map(reverse));g.faces_holeEdges=g.faces_holeEdges?.map(rs=>rs.map(r=>[...r].reverse()));g.faces_holeFaces=g.faces_holeFaces?.map(rs=>rs.map(r=>[...r].reverse()));const p=prepareSimulationDocument(g).prepared;assert.deepEqual(p.edgesVertices.slice(0,g.edges_vertices.length),g.edges_vertices);assert.equal(p.vertexCount,g.vertices_coords.length);for(const t of p.facesVertices){const [a,b,c]=t.map(v=>g.vertices_coords[v]);assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0);}}
});

test('a weak mesh below Float32 positional resolution is rejected without silently welding or dropping corners',()=>{
 const g=structuredClone(mat(source('interior')).graph);g.vertices_coords=g.vertices_coords.map(([x,y])=>[1e8+x/100,1e8+y/100]);const before=JSON.stringify(g);assert.throws(()=>prepareSimulationDocument(g));assert.equal(JSON.stringify(g),before);
});
