import test from 'node:test';
import assert from 'node:assert/strict';
import {materialDoc} from '../fixtures/materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {materialFaceHoleCount} from '../../src/core/materialWeak';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {importDocument,exportDocument} from '../../src/core/formats';
import type {Doc,Point} from '../../src/core/types';
import type {MaterialCurveIntent} from '../../src/core/materialCurves';
const sheet=(hole=false)=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[40,40],[60,40],[60,60],[40,60]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
const path=(a:Point,b:Point)=>({kind:'bezier-path' as const,assignment:'M' as const,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]});
const intent=(...curves:ReturnType<typeof path>[]):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves,deviation:1,fixedPoint:[10,10],cpOnly:true});
const material=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const perform=(source:Doc,ids:string[])=>{const request={kind:'material-cut' as const,segmentIds:ids},cut=cutMaterialEdges(source,request);assert.deepEqual(prepareEditorCommit(source,cut.doc,request).doc,cut.doc);return cut;};
const restore=(source:Doc,cut:ReturnType<typeof cutMaterialEdges>,ids:string[])=>{const request={kind:'material-join' as const,pairs:ids.map(id=>({first:id,second:cut.descendants.get(id)![1],assignment:source.segments.find(s=>s.id===id)!.assignment as 'M'}))},joined=joinMaterialEdges(cut.doc,request);assert.deepEqual(prepareEditorCommit(cut.doc,joined.doc,request).doc,joined.doc);assert.deepEqual(material(joined.doc).graph,material(source).graph);assert.deepEqual(joined.doc.segments,source.segments);return joined;};
test('an isolated interior crease cuts into two independent same-face banks and joins back exactly',()=>{
 const first=editMaterialFaces(sheet(),intent(path([25,50],[75,50]))),before=JSON.stringify(first.doc),cut=perform(first.doc,first.insertedIds!),m=material(cut.doc);assert.equal((cut.doc.metadata!.materialTopology as any).schema,'zhezhi-material-topology-v4');assert.equal(cut.addedVertices,0);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(materialFaceHoleCount(m.graph,0),0);assert.equal(m.foldedVertices,undefined);for(const id of cut.descendants.get(first.insertedIds![0])!){const e=m.edgeSegmentIds.indexOf(id);assert.equal(m.graph.edges_assignment[e],'B');assert.deepEqual(m.graph.edges_faces![e],[0]);}restore(first.doc,cut,first.insertedIds!);assert.equal(JSON.stringify(first.doc),before);
});
test('a boundary-ended slit duplicates only the actually separated base fan without moving coordinates or the root',()=>{
 const built=editMaterialFaces(sheet(),intent(path([0,50],[50,50]))),source=setStartingFace(built.doc,0),cut=perform(source,built.insertedIds!),m=material(cut.doc),old=material(source);assert.equal(cut.addedVertices,1);assert.deepEqual(m.graph.vertices_coords.slice(0,old.graph.vertices_coords.length),old.graph.vertices_coords);assert.deepEqual(m.graph.vertices_coords.at(-1),[0,50]);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(resolveStartingFace(cut.doc,m.graph).stale,false);restore(source,cut,built.insertedIds!);
});
test('crossing trees split real corner fans and restore all four indexed branches',()=>{
 const built=editMaterialFaces(sheet(),intent(path([25,50],[75,50]),path([50,25],[50,75]))),cut=perform(built.doc,built.insertedIds!),m=material(cut.doc);assert.equal(built.insertedIds!.length,4);assert.equal(cut.addedVertices,3);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(m.graph.vertices_coords.filter(p=>p[0]===50&&p[1]===50).length,4);restore(built.doc,cut,built.insertedIds!);
});
test('outer-to-hole bridge cutting opens the real boundary while retaining the geometric hole and both banks',()=>{
 const built=editMaterialFaces(sheet(true),intent(path([0,50],[40,50]))),cut=perform(built.doc,built.insertedIds!),m=material(cut.doc);assert.equal(cut.addedVertices,2);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(materialFaceHoleCount(m.graph,0),1);restore(built.doc,cut,built.insertedIds!);assert.equal(material(built.doc).components[0].boundaryLoops.length,2);
});
test('partial cutting preserves every unselected crease and joining never alters outside work',()=>{
 const built=editMaterialFaces(sheet(),intent(path([25,50],[75,50]),path([50,25],[50,75]))),chosen=[built.insertedIds![0]],cut=perform(built.doc,chosen),m=material(cut.doc);for(const id of built.insertedIds!.slice(1))assert.deepEqual(cut.doc.segments.find(s=>s.id===id),built.doc.segments.find(s=>s.id===id));assert.ok(m.graph.edges_faces!.some(r=>r[0]===r[1]));restore(built.doc,cut,chosen);
});
test('v3 cannot silently accept independent bank geometry and v4 cannot forge a weak-slit label',()=>{
 const built=editMaterialFaces(sheet(),intent(path([0,50],[50,50]))),cut=perform(built.doc,built.insertedIds!),legacy=structuredClone(cut.doc);(legacy.metadata!.materialTopology as any).schema='zhezhi-material-topology-v3';assert.equal(inspectMaterialTopology(legacy).ok,false);const forged=structuredClone(built.doc);(forged.metadata!.materialTopology as any).schema='zhezhi-material-topology-v4';assert.equal(inspectMaterialTopology(forged).ok,false);const changed=structuredClone(cut.doc),m=material(changed),id=cut.descendants.get(built.insertedIds![0])![1],e=m.edgeSegmentIds.indexOf(id),v=m.graph.edges_vertices[e].find(v=>v>=material(built.doc).graph.vertices_coords.length)!;assert.ok(Number.isInteger(v));(changed.metadata!.materialTopology as any).graph.vertices_coords[v][0]+=.01;for(const [i,[a,b]]of m.graph.edges_vertices.entries()){const segment=changed.segments.find(s=>s.id===m.edgeSegmentIds[i])!,forward=segment.a[0]===m.graph.vertices_coords[a][0]&&segment.a[1]===m.graph.vertices_coords[a][1];if(a===v)segment[forward?'a':'b'][0]+=.01;if(b===v)segment[forward?'b':'a'][0]+=.01;}const rejected=inspectMaterialTopology(changed);assert.equal(rejected.ok,false);if(!rejected.ok)assert.ok(!rejected.reason.includes('线段绑定'));
});
test('native/FOLD reopen and mirrored copies retain weak-slit identity and no stale folded pose',()=>{
 const built=editMaterialFaces(sheet(true),intent(path([0,50],[40,50]))),cut=perform(built.doc,built.insertedIds!),copied=copyMaterialComponents(cut.doc,{kind:'material-copy',segmentIds:cut.doc.segments.map(s=>s.id),placements:[{dx:220,dy:15,rotation:0,scale:1,mirror:'x'}]}).doc,m=material(copied);assert.equal(m.components.length,2);assert.equal(materialFaceHoleCount(m.graph,1),1);assert.equal(m.foldedVertices,undefined);for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(copied,format).text,format).doc;assert.deepEqual(material(back).graph,m.graph);assert.equal(material(back).foldedVertices,undefined);}const flat=computeFlatFold(cut.doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');const simulated=prepareSimulationDocument(material(cut.doc).graph).prepared;assert.equal(simulated.vertexCount,material(cut.doc).graph.vertices_coords.length);assert.equal(simulated.faceCount,10);assert.equal(inspectMaterialCurveModel(cut.doc).ok,false);
});
test('new curves crossing a slit split both banks independently and never weld the crossing point',()=>{
 const built=editMaterialFaces(sheet(),intent(path([25,50],[75,50]))),cut=perform(built.doc,built.insertedIds!),base=editMaterialFaces(cut.doc,{kind:'material-curves-rebase'}).doc,request=intent(path([50,25],[50,75])),result=editMaterialFaces(base,request),m=material(result.doc);assert.equal(result.insertedIds!.length,2);const ids=m.graph.vertices_coords.flatMap((p,v)=>p[0]===50&&p[1]===50?[v]:[]);assert.equal(ids.length,2);const ends=result.insertedIds!.map(id=>m.graph.edges_vertices[m.edgeSegmentIds.indexOf(id)].find(v=>ids.includes(v)));assert.equal(new Set(ends).size,2);for(const v of ids)assert.equal(m.graph.edges_vertices.filter((e,i)=>e.includes(v)&&m.graph.edges_assignment[i]==='B').length,2);assert.equal(m.components.length,1);assert.equal(m.foldedVertices,undefined);assert.ok(inspectMaterialCurveModel(result.doc).ok);assert.deepEqual(prepareEditorCommit(base,result.doc,request).doc,result.doc);
});
test('an away-from-slit closed construction retains slit banks and the real outer/hole geometry',()=>{
 const built=editMaterialFaces(sheet(),intent(path([0,50],[50,50]))),cut=perform(built.doc,built.insertedIds!),base=editMaterialFaces(cut.doc,{kind:'material-curves-rebase'}).doc,request:MaterialCurveIntent={kind:'material-face-curves',face:0,curves:[{kind:'ellipse',center:[75,75],radii:[10,10],rotation:0,assignment:'F'}],deviation:1,fixedPoint:[10,10],cpOnly:true},result=editMaterialFaces(base,request),m=material(result.doc);assert.equal(m.graph.faces_vertices!.length,2);for(const id of cut.descendants.get(built.insertedIds![0])!)assert.deepEqual(result.doc.segments.find(s=>s.id===id),cut.doc.segments.find(s=>s.id===id));assert.ok(inspectMaterialCurveModel(result.doc).ok);assert.equal(m.foldedVertices,undefined);
});
