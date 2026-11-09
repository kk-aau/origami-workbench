import test from 'node:test';
import assert from 'node:assert/strict';
import {constructMaterialCopy,previewMaterialConstructionCopy,selectionContainsMaterial,type MaterialConstructionCopyIntent} from '../../src/app/materialConstructionCopy';
import {materialCutFixture,materialSlitFixture,materialDoc} from '../fixtures/materialModel';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {transformPoint,applySelectionTransform} from '../../src/app/selectionTransform';
import {reflectPoint} from '../../src/app/mirror';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import type {Doc,Point} from '../../src/core/types';
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const request=(doc:Doc,transform:MaterialConstructionCopyIntent['transform']):MaterialConstructionCopyIntent=>({kind:'material-construction-copy',segmentIds:material(doc).edgeSegmentIds,transform});
test('two-point copying uses the exact existing formula for both CP and FF and replays atomically',()=>{
 const source=materialCutFixture().source,old=material(source),t={kind:'translate' as const,from:[-.1234,.2345] as Point,to:[400.1567,-20.9876] as Point},req=request(source,t),r=constructMaterialCopy(source,req),m=material(r.doc);
 assert.deepEqual(m.graph.vertices_coords.slice(0,14),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,14),old.foldedVertices);assert.deepEqual(m.graph.vertices_coords.slice(14),old.graph.vertices_coords.map(p=>transformPoint(p,t)));assert.deepEqual(m.foldedVertices!.slice(14),old.foldedVertices!.map(p=>transformPoint(p,t)));assert.equal(m.components.length,6);assert.deepEqual(prepareEditorCommit(source,r.doc,req).doc,r.doc);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('four-point copy retains the original complex formula instead of decomposing and re-rounding rotation',()=>{
 const source=materialCutFixture().source,old=material(source),t={kind:'similarity' as const,a:[5.203112322132217,0] as Point,b:[200,194.7968876778677] as Point,c:[400,-10] as Point,d:[530,200] as Point},req=request(source,t),r=constructMaterialCopy(source,req),m=material(r.doc),preview=previewMaterialConstructionCopy(source,req);
 assert.deepEqual(m.graph.vertices_coords.slice(14),old.graph.vertices_coords.map(p=>transformPoint(p,t)));assert.deepEqual(m.foldedVertices!.slice(14),old.foldedVertices!.map(p=>transformPoint(p,t)));r.copiedIds.forEach((id,i)=>{const s=r.doc.segments.find(s=>s.id===id)!;assert.deepEqual(s.a,preview[i].a);assert.deepEqual(s.b,preview[i].b);});assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('axis reflection at 22.5 degrees applies identical unsnapped CP/FF maps, keeps banks and original assignments',()=>{
 const source=materialSlitFixture().source,old=material(source),a:Point=[400,0],b:Point=[400+100*Math.cos(Math.PI/8),100*Math.sin(Math.PI/8)],r=constructMaterialCopy(source,request(source,{kind:'reflect',a,b})),m=material(r.doc);
 assert.equal(m.components.length,2);assert.deepEqual(m.graph.vertices_coords.slice(16),old.graph.vertices_coords.map(p=>reflectPoint(p,a,b)));assert.deepEqual(m.foldedVertices!.slice(16),old.foldedVertices!.map(p=>reflectPoint(p,a,b)));assert.deepEqual(m.graph.edges_assignment.slice(old.graph.edges_vertices.length),old.graph.edges_assignment);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('in-place material tools copy all banks rather than trimming existing geometric coverage',()=>{
 const source=materialCutFixture().source,old=material(source),t={kind:'translate' as const,from:[0,0] as Point,to:[0,0] as Point},r=constructMaterialCopy(source,request(source,t)),m=material(r.doc);assert.equal(m.graph.edges_vertices.length,32);assert.equal(m.components.length,6);assert.deepEqual(m.graph.vertices_coords.slice(14),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(14),old.foldedVertices);
});
test('partial selections, malformed references, degenerate axes and changed proposals reject before history',()=>{
 const source=materialCutFixture().source,before=JSON.stringify(source),req=request(source,{kind:'translate',from:[0,0],to:[400,0]});for(const invalid of [{...req,segmentIds:[source.segments[0].id]},{...req,extra:true},{...req,transform:{kind:'reflect',a:[0,0],b:[0,0]}},{...req,transform:{kind:'similarity',a:[0,0],b:[0,0],c:[400,0],d:[450,0]}},{...req,transform:{kind:'translate',from:[NaN,0],to:[400,0]}},{...req,transform:{...req.transform,extra:true}}])assert.throws(()=>constructMaterialCopy(source,invalid as MaterialConstructionCopyIntent));assert.equal(JSON.stringify(source),before);const r=constructMaterialCopy(source,req),bad=structuredClone(r.doc);bad.name='bad';assert.throws(()=>prepareEditorCommit(source,bad,req),/独立重放/);assert.throws(()=>prepareEditorCommit(source,r.doc));
});
test('JSON/FOLD, full undo redo and independent original coordinates survive material construction copies',()=>{
 const source=materialCutFixture().source,r=constructMaterialCopy(source,request(source,{kind:'reflect',a:[400,0],b:[400,100]})),m=material(r.doc);for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(material(loaded).graph,m.graph);assert.deepEqual(material(loaded).foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(loaded).layers.status,'solved');}let history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:r.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,r.doc);
});
test('ordinary geometry copy and auxiliary-only selections retain their existing route',()=>{
 const source=materialCutFixture().source;source.segments.push({id:'aux',a:[0,0],b:[100,0],assignment:'A',angle:0});assert.equal(selectionContainsMaterial(source,['aux']),false);assert.equal(selectionContainsMaterial(source,[source.segments[0].id]),true);const ordinary={...source};delete ordinary.metadata;assert.equal(selectionContainsMaterial(ordinary,[ordinary.segments[0].id]),false);assert.ok(applySelectionTransform(ordinary,['aux'],{kind:'translate',from:[0,0],to:[0,100]},true).segments.length>ordinary.segments.length);
});
test('valid high-offset no-FF reference mapping is not rejected by evaluating an unrelated origin',()=>{
 const p:Point[]=[[900000,0],[900002,0],[900002,2],[900000,2]],source=materialDoc({vertices_coords:p,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},p);delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;
 const r=constructMaterialCopy(source,request(source,{kind:'similarity',a:[900000,0],b:[900002,0],c:[0,0],d:[200000,0]}));assert.equal(material(r.doc).foldedVertices,undefined);assert.deepEqual(material(r.doc).graph.vertices_coords.slice(4),[[0,0],[200000,0],[200000,200000],[0,200000]]);
});
