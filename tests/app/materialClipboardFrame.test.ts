import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialCutFixture,materialSlitFixture,materialDoc} from '../fixtures/materialModel';
import {copyMaterialSelection,pasteMaterialSelection,cutMaterialSelection} from '../../src/app/materialClipboard';
import {materialViewFrame} from '../../src/app/materialFrame';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeMaterialFlatGeometry} from '../../src/core/materialFlatGeometry';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {importDocument,exportDocument} from '../../src/core/formats';
import {importFoldInterchange} from '../../src/core/foldInterchange';
import type {Doc,Point} from '../../src/core/types';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {constructMaterialMove} from '../../src/app/materialConstructionMove';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {joinMaterialEdges} from '../../src/core/materialJoin';
const read=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;},view=(doc:Doc)=>computeMaterialFlatGeometry(doc,materialViewFrame(doc).root).geometry.vertices,near=(a:Point[],b:Point[])=>{assert.equal(a.length,b.length);a.forEach((p,i)=>assert.ok(Math.hypot(p[0]-b[i][0],p[1]-b[i][1])<1e-9));};
test('different active and reference faces preserve the entire existing target visible pose after paste',()=>{
 const target=setStartingFace(materialCutFixture().source,3),old=read(target),clip=copyMaterialSelection(target,old.edgeSegmentIds),result=pasteMaterialSelection(target,{kind:'material-clipboard-paste',clipboard:clip,offset:[400,-20],cpOnly:false,splitTarget:false}).doc,newm=read(result);assert.equal(old.startingFace,4);assert.equal(newm.startingFace,4);assert.deepEqual(newm.foldedVertices!.slice(0,14),old.foldedVertices);assert.deepEqual(view(result).slice(0,14),view(target));near(view(result).slice(14),view(clip.doc).map(([x,y])=>[x+400,y-20]));
 for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(result,format).text,format).doc;assert.equal(read(loaded).startingFace,4);assert.deepEqual(resolveStartingFace(loaded,read(loaded).graph),{face:3,stale:false});assert.deepEqual(view(loaded),view(result));}
});
test('removing either reference or active component keeps remaining visible positions and explicit root identities',()=>{
 const target=setStartingFace(materialCutFixture().source,3),m=read(target),before=view(target);
 for(const component of m.components){const result=cutMaterialSelection(target,{kind:'material-clipboard-cut',segmentIds:component.edges.map(e=>m.edgeSegmentIds[e]),lockBoundary:false}).doc,remaining=[...new Set(m.components.filter(c=>c!==component).flatMap(c=>c.vertices))].sort((a,b)=>a-b);assert.deepEqual(view(result),remaining.map(v=>before[v]));}
});
test('root-aligned identity basis does not erase very small represented coordinates',()=>{
 const target=setStartingFace(materialSlitFixture().source,4),m=read(target),source=materialCutFixture().source,clip=copyMaterialSelection(source,read(source).edgeSegmentIds),result=pasteMaterialSelection(target,{kind:'material-clipboard-paste',clipboard:clip,offset:[400,0],cpOnly:false,splitTarget:false}).doc,r=read(result);assert.deepEqual(view(result),r.foldedVertices);assert.deepEqual(materialViewFrame(target).toStored([400,9.077074909626828e-14]),[400,9.077074909626828e-14]);assert.deepEqual(view(target),m.foldedVertices);
});
test('FOLD persists reference and active root separately, scales the contour once and rejects inconsistent settings',()=>{
 const target=setStartingFace(materialCutFixture().source,3),raw=importFoldInterchange(JSON.parse(exportDocument(target,'fold').text)) as any;assert.equal(raw.zhezhi_material_topology.startingFace,4);assert.equal(raw.zhezhi_flat_fold.materialFace,3);const loaded=importDocument(JSON.stringify(raw),'fold').doc;assert.deepEqual(view(loaded),view(target));
 const cm=structuredClone(raw);cm.frame_unit='cm';cm.zhezhi_paper.width/=10;cm.zhezhi_paper.height/=10;const scale=(p:Point)=>p.map(n=>n/10);cm.vertices_coords=cm.vertices_coords.map(scale);cm.zhezhi_material_topology.graph.vertices_coords=cm.vertices_coords;cm.file_frames[0].frame_unit='cm';cm.file_frames[0].vertices_coords=cm.file_frames[0].vertices_coords.map(scale);cm.zhezhi_material_topology.foldedVertices=cm.file_frames[0].vertices_coords;cm.zhezhi_flat_fold.startingFace=cm.zhezhi_flat_fold.startingFace.map(scale);const converted=importDocument(JSON.stringify(cm),'fold').doc;near(view(converted),view(target));
 for(const setting of [null,{...raw.zhezhi_flat_fold,materialFace:999},{...raw.zhezhi_flat_fold,extra:true},{...raw.zhezhi_flat_fold,startingFace:[[0,0],[1,0],[0,1]]}])assert.throws(()=>importDocument(JSON.stringify({...raw,zhezhi_flat_fold:setting}),'fold'));
});
test('copy and whole-material movement retain the reference identity instead of relabelling the active face',()=>{
 const source=setStartingFace(materialCutFixture().source,3),m=read(source),before=view(source),copied=copyMaterialComponents(source,{kind:'material-copy',segmentIds:m.edgeSegmentIds,placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc;assert.equal(read(copied).startingFace,4);assert.deepEqual(view(copied).slice(0,14),before);
 const moved=constructMaterialMove(source,{kind:'material-construction-move',segmentIds:m.edgeSegmentIds,transform:{kind:'translate',from:[0,0],to:[400,-20]},lockBoundary:false}).doc;assert.equal(read(moved).startingFace,4);near(view(moved),before.map(([x,y])=>[x+400,y-20]));
});
test('subdividing and merging the reference face retain the active target pose and remap the reference',()=>{
 const source=setStartingFace(materialCutFixture().source,3),m=read(source),at=m.graph.faces_edges![4],split=editMaterialFaces(source,{kind:'material-face-insert',face:4,from:{edgeId:m.edgeSegmentIds[at[0]],fraction:.5},to:{edgeId:m.edgeSegmentIds[at[2]],fraction:.5},assignment:'F',fixedPart:0}),sm=read(split.doc);assert.notEqual(sm.startingFace,resolveStartingFace(split.doc,sm.graph).face);assert.deepEqual(view(split.doc).slice(0,14),view(source));const merged=editMaterialFaces(split.doc,{kind:'material-face-remove',segmentIds:[split.insertedId!]});assert.deepEqual(view(merged.doc).slice(0,14),view(source));
});
test('boundary gluing retains a different active root and reproduces the original visible hinge',()=>{
 const p:Point[]=[[0,0],[100,0],[200,0],[0,100],[100,100],[200,100]],g={vertices_coords:p,edges_vertices:[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[1,4]] as [number,number][],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-180],faces_vertices:[[0,1,4,3],[1,2,5,4]],faces_edges:[[0,6,4,5],[1,2,3,6]],edges_faces:[[0],[1],[1],[1],[0],[0],[0,1]],faces_faces:[[null,1,null,null],[null,null,null,0]] as unknown as number[][]},source=materialDoc(g,[[0,0],[100,0],[0,0],[0,100],[100,100],[0,100]]),cut=cutMaterialEdges(source,{kind:'material-cut',segmentIds:[source.segments[6].id]}),target=setStartingFace(cut.doc,1),ids=cut.descendants.get(source.segments[6].id)!,joined=joinMaterialEdges(target,{kind:'material-join',pairs:[{first:ids[0],second:ids[1],assignment:'M'}]}).doc;assert.equal(read(joined).startingFace,0);assert.deepEqual(resolveStartingFace(joined,read(joined).graph),{face:1,stale:false});assert.deepEqual(view(joined),view(setStartingFace(source,1)));
});
