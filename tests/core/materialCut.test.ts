import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,FoldGraph,Point} from '../../src/core/types';
import {cutMaterialEdges,type MaterialCutIntent} from '../../src/core/materialCut';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialDoc,materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {paperPath,paperFillRule} from '../../src/app/paper';

function inspect(doc:Doc){const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;}
function grid():Doc{
 const points:Point[]=Array.from({length:16},(_,i)=>[i%4*100,Math.floor(i/4)*100]),faces:number[][]=[],edges:[number,number][]=[],owners:number[][]=[],faceEdges:number[][]=[],byKey=new Map<string,number>();
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){
  const a=y*4+x,face=[a,a+1,a+5,a+4],f=faces.length;faces.push(face);const row:number[]=[];
  face.forEach((a,k)=>{const b=face[(k+1)%4],key=[a,b].sort((a,b)=>a-b).join(',');let e=byKey.get(key);if(e===undefined){e=edges.length;byKey.set(key,e);edges.push([a,b]);owners.push([]);}owners[e].push(f);row.push(e);});faceEdges.push(row);
 }
 const graph:FoldGraph={vertices_coords:points,edges_vertices:edges,edges_assignment:owners.map(fs=>fs.length===1?'B':'F'),edges_foldAngle:edges.map(()=>0),faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:faceEdges.map((row,f)=>row.map(e=>owners[e].find(other=>other!==f)??null)) as unknown as number[][]};
 return materialDoc(graph,points);
}
function idsFor(doc:Doc,pairs:number[][]):string[]{const m=inspect(doc);return pairs.map(([a,b])=>{const e=m.graph.edges_vertices.findIndex(([x,y])=>x===a&&y===b||x===b&&y===a);assert.ok(e>=0);return m.edgeSegmentIds[e];});}
function intent(ids:string[]):MaterialCutIntent{return {kind:'material-cut',segmentIds:ids};}

test('one interior slit retains common tip IDs and creates separate parallel banks',()=>{
 const doc=grid(),original=JSON.stringify(doc),old=inspect(doc),id=idsFor(doc,[[5,6]])[0],r=cutMaterialEdges(doc,intent([id])),m=inspect(r.doc);
 assert.equal(JSON.stringify(doc),original);assert.equal(r.cutEdges,1);assert.equal(r.addedVertices,0);assert.equal(m.components.length,1);
 assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(m.graph.edges_vertices.length,old.graph.edges_vertices.length+1);
 const bankIDs=r.descendants.get(id)!;assert.equal(bankIDs.length,2);
 const banks=bankIDs.map(id=>m.edgeSegmentIds.indexOf(id));assert.deepEqual(m.graph.edges_vertices[banks[0]],m.graph.edges_vertices[banks[1]]);
 assert.ok(banks.every(e=>m.graph.edges_assignment[e]==='B'&&m.graph.edges_faces![e].length===1));
 assert.deepEqual(m.foldedVertices,old.foldedVertices);
});

test('complete boundary chain separates parts without moving original CP/FF coordinates',()=>{
 const doc=grid(),old=inspect(doc),r=cutMaterialEdges(doc,intent(idsFor(doc,[[1,5],[5,9],[9,13]]))),m=inspect(r.doc);
 assert.equal(m.components.length,2);assert.equal(r.addedVertices,4);assert.equal(m.graph.vertices_coords.length,20);
 assert.deepEqual(m.graph.vertices_coords.slice(0,16),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,16),old.foldedVertices);
 m.graph.faces_vertices!.forEach((face,f)=>assert.deepEqual(face.map(v=>m.graph.vertices_coords[v]),old.graph.faces_vertices![f].map(v=>old.graph.vertices_coords[v])));
 assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});

test('closed cut creates an outer piece with a hole and an independently placed center',()=>{
 const doc=grid(),r=cutMaterialEdges(doc,intent(idsFor(doc,[[5,6],[6,10],[10,9],[9,5]]))),m=inspect(r.doc);
 assert.equal(m.components.length,2);assert.equal(r.addedVertices,4);
 assert.deepEqual(m.components.map(c=>c.boundaryLoops.length).sort(),[1,2]);
 assert.equal(paperFillRule(r.doc),'nonzero');assert.equal((paperPath(r.doc).match(/Z/g)??[]).length,3);
 assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});

test('extending an existing slit keeps its bank identities and uses explicit corner slots',()=>{
 const source=materialSlitFixture().source,old=inspect(source),a=old.graph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===100),b=old.graph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===200),id=idsFor(source,[[a,b]])[0];
 const r=cutMaterialEdges(source,intent([id])),m=inspect(r.doc);
 assert.equal(m.graph.edges_vertices.length,old.graph.edges_vertices.length+1);
 assert.deepEqual(m.edgeSegmentIds.slice(0,old.edgeSegmentIds.length),old.edgeSegmentIds);
 assert.deepEqual(m.foldedVertices!.slice(0,old.graph.vertices_coords.length),old.foldedVertices);
 assert.equal(m.components.length,1);assert.equal(computeFlatFold(r.doc).geometry.status,'ready');
});

test('all internal seams can be cut in one atomic transaction',()=>{
 const doc=grid(),m=inspect(doc),ids=m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B'),r=cutMaterialEdges(doc,intent(ids));
 const next=inspect(r.doc);assert.equal(next.components.length,9);assert.equal(next.graph.vertices_coords.length,36);assert.equal(next.graph.edges_vertices.length,36);
 assert.ok(next.graph.edges_assignment.every(k=>k==='B'));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});

test('a real Origamica cut source remains complete on both sides after an additional cut',()=>{
 const {source}=materialCutFixture(),old=inspect(source),id=old.edgeSegmentIds.find((_,e)=>old.graph.edges_assignment[e]!=='B')!,r=cutMaterialEdges(source,intent([id])),m=inspect(r.doc);
 assert.equal(m.components.length,old.components.length+1);assert.deepEqual(m.foldedVertices!.slice(0,old.foldedVertices!.length),old.foldedVertices);
 const flat=computeFlatFold(r.doc);assert.equal(flat.layers.status,'solved',flat.layers.message);
 const overlap=modelOverlapRegions(flat);for(const side of ['front','back'] as const){const regions=modelRegionLayers(flat,overlap,side);assert.ok(regions.length);assert.ok(regions.every(r=>r.layers.status==='ordered'));}
 for(const format of ['json','fold'] as const){const d=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(inspect(d).graph,m.graph);assert.deepEqual(inspect(d).foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(d).layers.status,'solved');}
});

test('declared cuts replay in commit, restore exact undo/redo and preserve selected face',()=>{
 const source=setStartingFace(grid(),4),ids=idsFor(source,[[5,6]]),request=intent(ids),r=cutMaterialEdges(source,request),next=prepareEditorCommit(source,r.doc,request);
 assert.deepEqual(next.doc,r.doc);assert.deepEqual(next.descendants.get(ids[0]),r.descendants.get(ids[0]));
 assert.deepEqual(resolveStartingFace(next.doc,inspect(next.doc).graph),{face:4,stale:false});
 let history=editorHistoryReducer(emptyEditorHistory(source),{type:'commit',doc:next.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);
 history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,next.doc);
 assert.throws(()=>prepareEditorCommit(source,r.doc),/合同|身份|替换/);
 const tampered=structuredClone(r.doc);tampered.name='tampered';assert.throws(()=>prepareEditorCommit(source,tampered,request),/独立重放/);
});

test('invalid selection, stale material, recutting a bank and unsupported intent reject atomically',()=>{
 const source=grid(),old=JSON.stringify(source),m=inspect(source),internal=m.edgeSegmentIds.find((_,e)=>m.graph.edges_assignment[e]!=='B')!,border=m.edgeSegmentIds[0];
 for(const request of [intent([]),intent([internal,internal]),intent(['missing']),intent([border]),{...intent([internal]),extra:true} as never])assert.throws(()=>cutMaterialEdges(source,request));
 const next=cutMaterialEdges(source,intent([internal])).doc;assert.throws(()=>cutMaterialEdges(next,intent([internal])),/再次切开/);
 const stale=structuredClone(source);stale.segments[0].a[0]+=1;assert.throws(()=>cutMaterialEdges(stale,intent([internal])),/来源已过期/);
 assert.equal(JSON.stringify(source),old);
});

test('notes, colors and auxiliary IDs are preserved and new bank IDs avoid collisions',()=>{
 const source=grid(),id=idsFor(source,[[5,6]])[0];source.segments.find(s=>s.id===id)!.displayColor='#123456';
 source.segments.push({id:`${id}::cut-bank-1`,a:[0,0],b:[300,300],assignment:'A',angle:0});source.objects=[{id:'note',kind:'text',position:[20,30],fontSize:12,color:'#123456',text:'保留'}];
 const r=cutMaterialEdges(source,intent([id]));assert.equal(r.descendants.get(id)![1],`${id}::cut-bank-2`);
 assert.deepEqual(r.doc.objects,source.objects);assert.deepEqual(r.doc.segments.find(s=>s.assignment==='A'),source.segments.at(-1));
 assert.ok(r.descendants.get(id)!.every(id=>r.doc.segments.find(s=>s.id===id)?.displayColor==='#123456'));
});

test('cutting an unplaced CP calculates new pieces at their actual CP roots without inventing a common origin',()=>{
 const source=grid();delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;
 const r=cutMaterialEdges(source,intent(idsFor(source,[[1,5],[5,9],[9,13]]))),m=inspect(r.doc);
 assert.equal(m.components.length,2);assert.equal(m.foldedVertices,undefined);
 const before=JSON.stringify(r.doc),flat=computeFlatFold(r.doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.ok(flat.warnings.some(w=>w.includes('CP根面位置')));assert.deepEqual(flat.geometry.vertices,m.graph.vertices_coords);assert.equal(JSON.stringify(r.doc),before);assert.equal(inspect(r.doc).foldedVertices,undefined);
});
