import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDoc,type Doc,type Point} from '../../src/core/types';
import {buildFold} from '../../src/core/geometry';
import {copyMaterialComponents,type MaterialCopyIntent,type MaterialCopyPlacement} from '../../src/core/materialCopy';
import {materialDoc,materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {setStartingFace,resolveStartingFace,clearStartingFace} from '../../src/app/flatFoldSettings';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {transformSelection} from '../../src/app/state';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
const placement=(dx=400,dy=0):MaterialCopyPlacement=>({dx,dy,rotation:0,scale:1,mirror:'none'});
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const request=(doc:Doc,placements=[placement()]):MaterialCopyIntent=>({kind:'material-copy',segmentIds:material(doc).edgeSegmentIds,placements});
function square(){const p:Point[]=[[0,0],[100,0],[100,100],[0,100]];return materialDoc({vertices_coords:p,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},p);}

test('copying all actual Origamica parts appends disjoint identities and translates CP and FF once',()=>{
 const source=materialCutFixture().source,old=material(source),before=JSON.stringify(source),r=copyMaterialComponents(source,request(source,[placement(400,-20)])),m=material(r.doc);
 assert.equal(JSON.stringify(source),before);assert.equal(r.componentsBefore,3);assert.equal(r.componentsAfter,6);assert.equal(r.sourceComponents,3);assert.equal(r.copies,1);assert.equal(m.graph.vertices_coords.length,28);assert.equal(m.graph.edges_vertices.length,32);assert.equal(m.graph.faces_vertices!.length,10);
 assert.deepEqual(m.graph.vertices_coords.slice(0,14),old.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,14),old.foldedVertices);assert.deepEqual(m.graph.vertices_coords.slice(14),old.graph.vertices_coords.map(([x,y])=>[x+400,y-20]));assert.deepEqual(m.foldedVertices!.slice(14),old.foldedVertices!.map(([x,y])=>[x+400,y-20]));assert.deepEqual(r.doc.segments.slice(0,source.segments.length),source.segments);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('one complete component can be copied without duplicating other parts',()=>{
 const source=materialCutFixture().source,old=material(source),c=old.components[1],r=copyMaterialComponents(source,{kind:'material-copy',segmentIds:c.edges.map(e=>old.edgeSegmentIds[e]),placements:[placement()]});assert.equal(r.sourceComponents,1);assert.equal(material(r.doc).components.length,4);assert.equal(r.copiedIds.length,c.edges.length);assert.deepEqual(r.doc.segments.slice(0,source.segments.length),source.segments);
});
test('slit banks, common tips and subsequent material operations survive independent copy',()=>{
 const source=materialSlitFixture().source,old=material(source),r=copyMaterialComponents(source,request(source)),m=material(r.doc);assert.equal(m.components.length,2);assert.equal(m.graph.vertices_coords.length,32);assert.equal(m.components[1].boundaryLoops[0].length,m.components[0].boundaryLoops[0].length);
 const copied=r.copiedIds.filter(id=>r.doc.segments.find(s=>s.id===id)!.assignment!=='B');assert.ok(copied.length);const cut=cutMaterialEdges(r.doc,{kind:'material-cut',segmentIds:[copied[0]]});assert.deepEqual(material(cut.doc).graph.vertices_coords.slice(0,16),old.graph.vertices_coords);
});
test('a copied component with a hole retains both boundary loops',()=>{
 const grid=materialSlitFixture().source,m=material(grid),all=m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B'),separated=cutMaterialEdges(grid,{kind:'material-cut',segmentIds:m.graph.faces_edges![4].filter(e=>all.includes(m.edgeSegmentIds[e])).map(e=>m.edgeSegmentIds[e])}).doc,sm=material(separated),ring=sm.components.find(c=>c.boundaryLoops.length===2)!;assert.ok(ring);
 const r=copyMaterialComponents(separated,{kind:'material-copy',segmentIds:ring.edges.map(e=>sm.edgeSegmentIds[e]),placements:[placement()]});assert.equal(material(r.doc).components.filter(c=>c.boundaryLoops.length===2).length,2);
});
test('rotation, positive scale and geometric mirrors preserve source assignments, target angles and isometry',()=>{
 const source=materialCutFixture().source,old=material(source);
 for(const mirror of ['none','x','y'] as const){const p={dx:350,dy:-100,rotation:37,scale:.7,mirror},r=copyMaterialComponents(source,request(source,[p])),m=material(r.doc);assert.equal(m.components.length,6);assert.deepEqual(m.graph.edges_assignment.slice(16),old.graph.edges_assignment);assert.deepEqual(m.graph.edges_foldAngle.slice(16),old.graph.edges_foldAngle);assert.equal(computeFlatFold(r.doc).geometry.status,'ready');
  const [cx,cy]=r.pivot,t=37*Math.PI/180,transform=([x,y]:Point):Point=>{x-=cx;y-=cy;if(mirror==='x')x=-x;if(mirror==='y')y=-y;return[cx+.7*(Math.cos(t)*x-Math.sin(t)*y)+350,cy+.7*(Math.sin(t)*x+Math.cos(t)*y)-100];};assert.deepEqual(m.foldedVertices!.slice(14),old.foldedVertices!.map(transform));
 }
});
test('multiple placements create a full array and never compound scale or rotation accidentally',()=>{
 const source=square(),r=copyMaterialComponents(source,request(source,[placement(150),placement(300),placement(450)]));assert.equal(r.copies,3);assert.equal(material(r.doc).components.length,4);assert.deepEqual(material(r.doc).graph.vertices_coords.slice(12),material(source).graph.vertices_coords.map(([x,y])=>[x+450,y]));assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('in-place copies remain distinct and manual indexed roots can choose either coincident face',()=>{
 const source=setStartingFace(square(),0),r=copyMaterialComponents(source,request(source,[placement(0)])),m=material(r.doc);assert.equal(m.components.length,2);assert.equal(m.graph.vertices_coords.length,8);assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:0,stale:false});
 const chosen=setStartingFace(r.doc,1),committed=prepareEditorCommit(r.doc,chosen).doc;assert.equal(chosen.flatFold!.materialFace,1);assert.deepEqual(resolveStartingFace(committed,material(committed).graph),{face:1,stale:false});assert.deepEqual(resolveStartingFace(clearStartingFace(chosen),m.graph),{face:0,stale:false});
 const folded=importDocument(exportDocument(chosen,'fold').text,'fold').doc;assert.deepEqual(resolveStartingFace(folded,material(folded).graph),{face:1,stale:false});assert.equal(computeFlatFold(folded).layers.status,'solved');
 const copiedIDs=new Set(r.copiedIds),moved=prepareEditorCommit(chosen,transformSelection(chosen,copiedIDs,'move',200,0),{kind:'move',segmentIds:[...copiedIDs],a:200,b:0}).doc;assert.deepEqual(resolveStartingFace(moved,material(moved).graph),{face:1,stale:false});
});
test('legacy manual contour is upgraded before copying and stays bound to its original face',()=>{
 const source=square();source.flatFold={startingFace:material(source).graph.vertices_coords.map(p=>[...p])};const r=copyMaterialComponents(source,request(source,[placement(0)]));assert.equal(r.doc.flatFold!.materialFace,0);assert.deepEqual(resolveStartingFace(r.doc,material(r.doc).graph),{face:0,stale:false});
});
test('face subdivision and merge remap indexed root bindings on coincident copied parts',()=>{
 const source=copyMaterialComponents(setStartingFace(square(),0),request(square(),[placement(0)])).doc,chosen=setStartingFace(source,1),ids=material(source).edgeSegmentIds,split=editMaterialFaces(chosen,{kind:'material-face-insert',face:1,from:{edgeId:ids[4],fraction:.5},to:{edgeId:ids[6],fraction:.5},assignment:'F',fixedPart:1});assert.equal(split.doc.flatFold!.materialFace,2);assert.deepEqual(resolveStartingFace(split.doc,material(split.doc).graph),{face:2,stale:false});const merged=editMaterialFaces(split.doc,{kind:'material-face-remove',segmentIds:[split.insertedId!]});assert.equal(merged.doc.flatFold!.materialFace,1);assert.deepEqual(resolveStartingFace(merged.doc,material(merged.doc).graph),{face:1,stale:false});
});
test('styles, selected auxiliary lines and metadata survive; new segment IDs avoid object and segment collisions',()=>{
 const source=square();source.segments[0].displayColor='#123456';source.segments.push({id:'aux',a:[0,0],b:[50,50],assignment:'A',angle:0},{id:'material-edge-0::material-copy',a:[0,0],b:[10,0],assignment:'A',angle:0});source.objects=[{id:'material-edge-1::material-copy',kind:'text',position:[0,0],text:'注释',fontSize:10,color:'#000000'}];source.metadata!.custom={value:3};const req=request(source);req.segmentIds=[...req.segmentIds,'aux'];const r=copyMaterialComponents(source,req);assert.equal(r.copiedIds.length,5);assert.ok(r.copiedIds.includes('material-edge-0::material-copy-1'));assert.ok(r.copiedIds.includes('material-edge-1::material-copy-1'));assert.equal(r.doc.segments.find(s=>s.id==='material-edge-0::material-copy-1')!.displayColor,'#123456');assert.deepEqual(r.doc.objects,source.objects);assert.deepEqual(r.doc.metadata!.custom,{value:3});assert.equal(r.doc.segments.find(s=>s.id==='aux::material-copy')!.assignment,'A');
});
test('missing FF remains missing and copy proposals replay fully through history and JSON/FOLD',()=>{
 const source=square();delete (source.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;assert.equal(material(copyMaterialComponents(source,request(source)).doc).foldedVertices,undefined);
 const original=materialCutFixture().source,req=request(original),r=copyMaterialComponents(original,req),commit=prepareEditorCommit(original,r.doc,req);assert.deepEqual(commit.doc,r.doc);const bad=structuredClone(r.doc);bad.name='bad';assert.throws(()=>prepareEditorCommit(original,bad,req),/独立重放/);assert.throws(()=>prepareEditorCommit(original,r.doc));let history=editorHistoryReducer(emptyEditorHistory(original),{type:'commit',doc:r.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,original);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,r.doc);
 for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc;assert.deepEqual(material(loaded).graph,material(r.doc).graph);assert.deepEqual(material(loaded).foldedVertices,material(r.doc).foldedVertices);assert.equal(computeFlatFold(loaded).layers.status,'solved');}
});
test('invalid, partial, nonfinite and oversized copies fail atomically before allocating a graph',()=>{
 const source=square(),before=JSON.stringify(source),req=request(source);
 for(const bad of [{...req,segmentIds:[source.segments[0].id]},{...req,segmentIds:['missing']},{...req,placements:[]},{...req,placements:Array(65).fill(placement())},{...req,extra:true},{...req,placements:[{...placement(),scale:0}]},{...req,placements:[{...placement(),dx:Infinity}]},{...req,placements:[{...placement(),extra:true}]}])assert.throws(()=>copyMaterialComponents(source,bad as MaterialCopyIntent));assert.equal(JSON.stringify(source),before);
 const points:Point[]=Array.from({length:240},(_,i)=>[150+100*Math.cos(i*2*Math.PI/240),150+100*Math.sin(i*2*Math.PI/240)]),large=materialDoc({vertices_coords:points,edges_vertices:points.map((_,i)=>[i,(i+1)%240] as [number,number]),edges_assignment:points.map(()=>'B'),edges_foldAngle:points.map(()=>0),faces_vertices:[points.map((_,i)=>i)],faces_edges:[points.map((_,i)=>i)],edges_faces:points.map(()=>[0]),faces_faces:[points.map(()=>null)] as unknown as number[][]},points);assert.throws(()=>copyMaterialComponents(large,request(large,Array(64).fill(placement()))),/预算|容量/);
 const badRoot={...source,flatFold:{startingFace:material(source).graph.vertices_coords,materialFace:99}};assert.throws(()=>copyMaterialComponents(badRoot,request(source)),/起始面|固定面/);
});
test('indexed root settings reject malformed values and require both a checked material and matching contour',()=>{
 const source=setStartingFace(square(),0);for(const value of [-1,.5,8192,Infinity,NaN,'0',null,undefined])assert.throws(()=>validateDoc({...source,flatFold:{...source.flatFold!,materialFace:value}}));
 const stale={...source,flatFold:{...source.flatFold!,startingFace:source.flatFold!.startingFace.map(([x,y])=>[x+1,y] as Point)}};assert.deepEqual(resolveStartingFace(stale,material(stale).graph),{face:0,stale:true});assert.throws(()=>exportDocument(stale,'fold'),/起始面已失效/);
 const ordinary={...source};delete ordinary.metadata;assert.deepEqual(resolveStartingFace(ordinary,buildFold(ordinary).graph),{face:0,stale:true});
 const repaired=setStartingFace(ordinary,0);assert.equal(repaired.flatFold!.materialFace,undefined);assert.deepEqual(resolveStartingFace(repaired,buildFold(repaired).graph),{face:0,stale:false});
});
