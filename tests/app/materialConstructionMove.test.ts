import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialCutFixture,materialSlitFixture,materialDoc} from '../fixtures/materialModel';
import {constructMaterialMove,previewMaterialConstructionMove,type MaterialConstructionMoveIntent} from '../../src/app/materialConstructionMove';
import {transformPoint,type SelectionTransform} from '../../src/app/selectionTransform';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {editorHistoryReducer,emptyEditorHistory} from '../../src/app/editorHistory';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import type {Doc,Point} from '../../src/core/types';
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const request=(doc:Doc,transform:SelectionTransform):MaterialConstructionMoveIntent=>({kind:'material-construction-move',segmentIds:material(doc).edgeSegmentIds,transform,lockBoundary:false});
const translate:SelectionTransform={kind:'translate',from:[5.203112322132217,9.077074909626828e-14],to:[400.45678,-20.12345]};
const similarity:SelectionTransform={kind:'similarity',a:[5.203112322132217,0],b:[200,194.7968876778677],c:[400,-10],d:[530,200]};

for(const [name,t] of [['two-point',translate],['four-point',similarity]] as const)test(`${name} moves original three-part CP/FF by the original formula, retaining all indexed identity`,()=>{
 const source=setStartingFace(materialCutFixture().source,3),before=JSON.stringify(source),old=material(source),req=request(source,t),r=constructMaterialMove(source,req),m=material(r.doc);
 assert.equal(JSON.stringify(source),before);assert.deepEqual(m.graph.vertices_coords,old.graph.vertices_coords.map(p=>transformPoint(p,t)));assert.deepEqual(m.foldedVertices,old.foldedVertices!.map(p=>transformPoint(p,t)));
 for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','edges_faces','faces_vertices','faces_edges','faces_faces'] as const)assert.deepEqual(m.graph[key],old.graph[key]);
 assert.deepEqual(m.edgeSegmentIds,old.edgeSegmentIds);assert.deepEqual(r.doc.segments.map(s=>s.id),source.segments.map(s=>s.id));assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:3,stale:false});
 assert.deepEqual(prepareEditorCommit(source,r.doc,req).doc,r.doc);assert.deepEqual([...r.descendants],source.segments.map(s=>[s.id,[s.id]]));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('moving one complete component leaves all other CP/FF vertices and segments exact, including their selected root',()=>{
 const source=setStartingFace(materialCutFixture().source,3),old=material(source),component=old.components.find(c=>!c.faces.includes(3))!,ids=component.edges.map(e=>old.edgeSegmentIds[e]),vertices=new Set(component.vertices),req={...request(source,similarity),segmentIds:ids},r=constructMaterialMove(source,req),m=material(r.doc);
 assert.equal(r.components,1);old.graph.vertices_coords.forEach((p,v)=>assert.deepEqual(m.graph.vertices_coords[v],vertices.has(v)?transformPoint(p,similarity):p));old.foldedVertices!.forEach((p,v)=>assert.deepEqual(m.foldedVertices![v],vertices.has(v)?transformPoint(p,similarity):p));source.segments.filter(s=>!ids.includes(s.id)).forEach(s=>assert.deepEqual(r.doc.segments.find(v=>v.id===s.id),s));assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:3,stale:false});
});
test('coincident indexed copies can move independently without deleting either set of material banks',()=>{
 const base=materialCutFixture().source,copy=copyMaterialComponents(base,{kind:'material-copy',segmentIds:material(base).edgeSegmentIds,placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}),source=setStartingFace(copy.doc,8),old=material(source),req={...request(source,{kind:'translate',from:[0,0],to:[400,0]}),segmentIds:copy.copiedIds},r=constructMaterialMove(source,req),m=material(r.doc);
 assert.equal(m.components.length,6);assert.equal(m.graph.edges_vertices.length,32);assert.deepEqual(m.graph.vertices_coords.slice(0,14),old.graph.vertices_coords.slice(0,14));assert.deepEqual(m.foldedVertices!.slice(0,14),old.foldedVertices!.slice(0,14));assert.deepEqual(m.graph.vertices_coords.slice(14),old.graph.vertices_coords.slice(14).map(p=>transformPoint(p,req.transform)));assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:8,stale:false});assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('moving slit material retains parallel bank occurrences, styles, null/zero angles, guides and independent objects',()=>{
 const source=materialSlitFixture().source;source.segments=source.segments.map((s,i)=>({...s,displayColor:i%2?'#aa22bb':'#22aacc'}));source.segments.push({id:'selected-guide',a:[0,0],b:[100,0],assignment:'A',angle:0},{id:'unselected-guide',a:[0,100],b:[100,100],assignment:'A',angle:null});source.objects=[{id:'note',kind:'text',position:[5,10],text:'材料',fontSize:10,color:'#111111'}];
 const old=material(source),req={...request(source,similarity),segmentIds:[...old.edgeSegmentIds,'selected-guide']},r=constructMaterialMove(source,req),m=material(r.doc);
 assert.deepEqual(m.graph.edges_vertices,old.graph.edges_vertices);assert.deepEqual(m.graph.faces_edges,old.graph.faces_edges);assert.deepEqual(m.graph.edges_assignment,old.graph.edges_assignment);assert.deepEqual(m.graph.edges_foldAngle,old.graph.edges_foldAngle);assert.deepEqual(m.components[0].boundaryLoops.map(l=>l.length).sort((a,b)=>a-b),[2,12]);assert.deepEqual(r.doc.objects,source.objects);assert.deepEqual(r.doc.segments.at(-1),source.segments.at(-1));assert.deepEqual(r.doc.segments.at(-2)!.a,transformPoint([0,0],similarity));assert.deepEqual(r.doc.segments.map(s=>s.displayColor),source.segments.map(s=>s.displayColor));
});
test('boundary protection, partial choices and malformed intents reject before changing material or history',()=>{
 const source=materialCutFixture().source,before=JSON.stringify(source),req=request(source,translate);
 for(const bad of [{...req,lockBoundary:true},{...req,segmentIds:[source.segments[0].id]},{...req,segmentIds:['missing']},{...req,segmentIds:[...req.segmentIds,...req.segmentIds]},{...req,extra:1},{...req,lockBoundary:undefined},{...req,transform:{...translate,extra:1}},{...req,transform:{kind:'reflect',a:[0,0],b:[1,0]}},{...req,transform:{kind:'translate',from:[NaN,0],to:[400,0]}},{...req,transform:{kind:'similarity',a:[0,0],b:[0,0],c:[1,1],d:[2,2]}},{...req,transform:{kind:'similarity',a:[0,0],b:[1,0],c:[1,1],d:[1,1]}},{...req,transform:{kind:'translate',from:[0,0],to:[1e7,0]}}])assert.throws(()=>constructMaterialMove(source,bad as MaterialConstructionMoveIntent));
 assert.equal(JSON.stringify(source),before);const next=constructMaterialMove(source,req).doc,bad=structuredClone(next);bad.name='undeclared';assert.throws(()=>prepareEditorCommit(source,bad,req),/独立重放/);assert.throws(()=>prepareEditorCommit(source,next),/替换/);
});
test('material movement never trims coincident target coverage or silently changes crease assignment',()=>{
 const base=materialCutFixture().source,copy=copyMaterialComponents(base,{kind:'material-copy',segmentIds:material(base).edgeSegmentIds,placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'none'}]}),source=copy.doc,old=material(source),r=constructMaterialMove(source,{...request(source,{kind:'translate',from:[400,0],to:[0,0]}),segmentIds:copy.copiedIds}),m=material(r.doc);
 assert.equal(r.doc.segments.length,source.segments.length);assert.deepEqual(m.graph.edges_assignment,old.graph.edges_assignment);assert.deepEqual(m.graph.edges_foldAngle,old.graph.edges_foldAngle);assert.equal(m.components.length,6);assert.deepEqual(m.graph.edges_vertices,old.graph.edges_vertices);
});
test('move preview is pure, zero-reference motion rejects, and malformed previews do not publish a graph',()=>{
 const source=materialCutFixture().source,before=JSON.stringify(source),req=request(source,similarity),preview=previewMaterialConstructionMove(source,req),r=constructMaterialMove(source,req);preview.forEach((s,i)=>{assert.deepEqual(s,r.doc.segments[i]);});assert.equal(JSON.stringify(source),before);assert.throws(()=>constructMaterialMove(source,request(source,{kind:'translate',from:[10,20],to:[10,20]})),/位置相同/);assert.throws(()=>constructMaterialMove(source,request(source,{kind:'similarity',a:[10,20],b:[100,100],c:[10,20],d:[100,100]})),/位置相同/);assert.throws(()=>previewMaterialConstructionMove(source,{...req,lockBoundary:true}),/边界保护/);
});
test('moves without FF preserve absence, including a high-offset four-point reference transformation',()=>{
 const p:Point[]=[[900000,0],[900002,0],[900002,2],[900000,2]],source=materialDoc({vertices_coords:p,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},p);delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;
 const r=constructMaterialMove(source,request(source,{kind:'similarity',a:[900000,0],b:[900002,0],c:[0,0],d:[200000,0]}));assert.equal(material(r.doc).foldedVertices,undefined);assert.deepEqual(material(r.doc).graph.vertices_coords,[[0,0],[200000,0],[200000,200000],[0,200000]]);
});
test('atomic undo/redo and actual format round trips retain moved source CP/FF and the indexed root',()=>{
 const source=setStartingFace(materialCutFixture().source,3),req=request(source,similarity),r=constructMaterialMove(source,req),m=material(r.doc);let history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:r.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,r.doc);
 for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc,lm=material(loaded);assert.deepEqual(lm.graph,m.graph);assert.deepEqual(lm.foldedVertices,m.foldedVertices);assert.deepEqual(resolveStartingFace(loaded,lm.graph),{face:3,stale:false});assert.equal(computeFlatFold(loaded,undefined,{startingFace:3}).layers.status,'solved');}
});
