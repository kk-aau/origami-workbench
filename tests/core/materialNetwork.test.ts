import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {editMaterialFaces,type MaterialFaceNetworkIntent} from '../../src/core/materialFaceEdit';
import {splitMaterialNetwork} from '../../src/core/materialNetworkGeometry';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialDoc,materialCutFixture} from '../fixtures/materialModel';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {importDocument,exportDocument} from '../../src/core/formats';
function inspect(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function sheet(hole=false){const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[44,44],[56,44],[56,56],[44,56]] as Point[]:[])],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,edges,edges.map(()=>'B'),edges.map(()=>null),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);}
function loop(a=25,b=75):MaterialFaceNetworkIntent{return {kind:'material-face-network',face:0,graph:{vertices:[[a,a],[b,a],[b,b],[a,b]],edges:[[0,1],[1,2],[2,3],[3,0]]},assignments:['F','F','F','F'],fixedPoint:[10,10],cpOnly:false};}
test('closed interior graph creates real faces without moving old CP/FF or turning creases into paper edges',()=>{
 const doc=sheet(),before=JSON.stringify(doc),old=inspect(doc),r=editMaterialFaces(doc,loop()),m=inspect(r.doc);
 assert.equal(JSON.stringify(doc),before);assert.equal(r.facesAfter,2);assert.equal(r.placement,'preserved');assert.deepEqual(m.graph.vertices_coords.slice(0,4),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,4),old.foldedVertices);assert.deepEqual(m.graph.vertices_coords.slice(4),loop().graph.vertices);assert.equal(m.graph.faces_holes!.filter(h=>h.length).length,1);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.deepEqual(m.graph.edges_assignment.slice(4),['F','F','F','F']);assert.deepEqual(m.graph.edges_faces.slice(4).map(fs=>fs.length),[2,2,2,2]);
});
test('nested loops route negative rings to immediate parents and preserve an actual paper hole',()=>{
 const intent=loop(20,80),inner=loop(35,65);intent.graph.vertices.push(...inner.graph.vertices);intent.graph.edges.push(...inner.graph.edges.map(([a,b])=>[a+4,b+4] as [number,number]));intent.assignments.push(...inner.assignments);
 const r=editMaterialFaces(sheet(true),intent),m=inspect(r.doc);assert.equal(r.facesAfter,3);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,2);assert.deepEqual(m.graph.faces_holes!.map(h=>h.length).sort(),[1,1,1]);assert.equal(m.graph.edges_assignment.filter(a=>a==='B').length,8);
});
test('intersecting closed rectangles split all crossing edges and retain source assignment',()=>{
 const req=loop();req.graph={vertices:[[15,20],[70,20],[70,65],[15,65],[40,40],[85,40],[85,85],[40,85]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]]};req.assignments=['F','F','F','F','F','F','F','F'];const s=splitMaterialNetwork(req.graph,1e-8),r=editMaterialFaces(sheet(),req),m=inspect(r.doc);assert.equal(s.intersections,2);assert.equal(s.edges.length,12);assert.equal(r.facesAfter,4);assert.deepEqual(s.vertices.slice(0,8),req.graph.vertices);assert.deepEqual(m.graph.vertices_coords.slice(4,12),req.graph.vertices);for(let i=0;i<s.edges.length;i++)assert.equal(m.graph.edges_assignment[i+4],req.assignments[s.edgeSource[i]]);
});
test('three concurrent lines reuse one exact rational crossing identity',()=>{
 const graph={vertices:[[0,0],[6,0],[6,6],[0,6],[3,-3],[3,9]] as Point[],edges:[[0,1],[1,2],[2,3],[3,0],[0,2],[1,3],[4,5],[4,0],[5,2]] as [number,number][]},s=splitMaterialNetwork(graph,1e-9);assert.equal(s.vertices.filter(p=>p[0]===3&&p[1]===3).length,1);const c=s.vertices.findIndex(p=>p[0]===3&&p[1]===3);assert.equal(s.edges.filter(e=>e.includes(c)).length,6);assert.deepEqual(s.vertices.slice(0,6),graph.vertices);
});
test('duplicate, overlap, free endpoints, bridge, boundary contact and hole crossing reject atomically',()=>{
 const doc=sheet(true),before=JSON.stringify(doc),bad:MaterialFaceNetworkIntent[]=[];
 const duplicate=loop();duplicate.graph.edges.push([1,0]);duplicate.assignments.push('F');bad.push(duplicate);
 const overlap=loop();overlap.graph.vertices.push([40,25],[60,25]);overlap.graph.edges.push([4,5],[4,2],[5,3]);overlap.assignments.push('F','F','F');bad.push(overlap);
 const free=loop();free.graph.vertices.push([15,15]);free.graph.edges.push([0,4]);free.assignments.push('F');bad.push(free);
 const bridge=loop(20,35),second=loop(65,80);bridge.graph.vertices.push(...second.graph.vertices);bridge.graph.edges.push(...second.graph.edges.map(([a,b])=>[a+4,b+4] as [number,number]),[2,4]);bridge.assignments.push(...second.assignments,'F');bad.push(bridge);
 bad.push(loop(0,75),loop(44,56));const crossing=loop();crossing.graph.vertices=[[20,50],[50,20],[80,50],[50,80]];crossing.graph.edges.push([0,2]);crossing.assignments.push('F');bad.push(crossing);
 const fixed=loop();fixed.fixedPoint=[25,50];bad.push(fixed);const nan=loop();nan.graph.vertices[0][0]=NaN;bad.push(nan);
 for(const [i,req] of bad.entries())assert.throws(()=>editMaterialFaces(doc,req),`invalid case ${i}`);assert.equal(JSON.stringify(doc),before);
});
test('incompatible mountain loop refuses stale FF; explicit CP-only keeps geometry with unavailable FF',()=>{
 const req=loop();req.assignments.fill('M');assert.throws(()=>editMaterialFaces(sheet(),req));const r=editMaterialFaces(sheet(),{...req,cpOnly:true});assert.equal(r.placement,'unavailable');assert.equal(inspect(r.doc).foldedVertices,undefined);assert.deepEqual(inspect(r.doc).graph.edges_assignment.slice(4),['M','M','M','M']);
});
test('closed network in real original material preserves every old point in its stored folded frame',()=>{
 const {source}=materialCutFixture(),old=inspect(source);let verified=false;
 for(let f=0;f<old.graph.faces_vertices!.length&&!verified;f++){const ps=old.graph.faces_vertices![f].map(v=>old.graph.vertices_coords[v]),center:Point=[ps.reduce((s,p)=>s+p[0],0)/ps.length,ps.reduce((s,p)=>s+p[1],0)/ps.length];for(const size of [.01,.001]){const req=loop();req.face=f;req.graph.vertices=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+size*x,center[1]+size*y]);req.fixedPoint=[center[0]+size*2,center[1]];try{const r=editMaterialFaces(source,req),m=inspect(r.doc);assert.equal(r.placement,'preserved');assert.deepEqual(m.foldedVertices!.slice(0,old.graph.vertices_coords.length),old.foldedVertices);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);verified=true;break;}catch(e){if(e instanceof assert.AssertionError)throw e;}}}assert.ok(verified,'a real material face accepts the interior loop');
});
test('independent replay, history and JSON/FOLD roundtrips retain full closed-network topology',()=>{
 const doc=sheet(),req=loop(),r=editMaterialFaces(doc,req),m=inspect(r.doc);assert.deepEqual(prepareEditorCommit(doc,r.doc,req).doc,r.doc);let h=editorHistoryReducer(emptyEditorHistory(doc),{type:'commit',doc:r.doc});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,doc);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,r.doc);for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(inspect(loaded).graph,m.graph);assert.deepEqual(inspect(loaded).foldedVertices,m.foldedVertices);}const forged=structuredClone(r.doc);forged.segments.at(-1)!.assignment='M';assert.throws(()=>prepareEditorCommit(doc,forged,req));
});
test('crossing segments inherit mixed types exactly and keep nonbinary original endpoints',()=>{
 const req=loop();req.graph={vertices:[[15.1,20.2],[70.3,20.2],[70.3,65.4],[15.1,65.4],[40.5,40.6],[85.7,40.6],[85.7,85.8],[40.5,85.8]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]]};req.assignments=['M','V','F','U','U','F','V','M'];req.cpOnly=true;const s=splitMaterialNetwork(req.graph,1e-8),m=inspect(editMaterialFaces(sheet(),req).doc);assert.deepEqual(m.graph.vertices_coords.slice(4,12),req.graph.vertices);for(let i=0;i<s.edges.length;i++)assert.equal(m.graph.edges_assignment[4+i],req.assignments[s.edgeSource[i]]);assert.equal(m.foldedVertices,undefined);
});
test('malformed network data and excessive intersection work reject without truncation',()=>{
 const req=loop();for(const graph of [{...req.graph,unknown:true},{vertices:[...req.graph.vertices,[25,25]],edges:req.graph.edges},{vertices:req.graph.vertices,edges:[[0,1],[1,2],[2,99]]},{vertices:new Array(4),edges:req.graph.edges}])assert.throws(()=>splitMaterialNetwork(graph as typeof req.graph,1e-8));
 const p:Point[]=Array.from({length:128},(_,i)=>[i,i*i]),edges:[number,number][]=[...Array.from({length:64},(_,i)=>[i,i+64] as [number,number]),...Array.from({length:128},(_,i)=>[i,(i+63)%128] as [number,number]),...Array.from({length:64},(_,i)=>[i,(i+62)%128] as [number,number])];assert.throws(()=>splitMaterialNetwork({vertices:p,edges},1e-12),/1024/);
});
test('rational intersections round once to nearest double and retain exact shared identity',()=>{
 const graph={vertices:[[0,0],[1,0],[1,1],[0,1]] as Point[],edges:[[0,1],[1,2],[2,3],[3,0],[0,2],[1,3],[0,3]] as [number,number][]};graph.edges.pop();graph.vertices.push([.5,0],[0,.25]);graph.edges.push([4,5]);const s=splitMaterialNetwork(graph,1e-12);assert.ok(s.vertices.some(p=>p[0]===1/6&&p[1]===1/6));assert.deepEqual(s.vertices.slice(0,6),graph.vertices);
});
