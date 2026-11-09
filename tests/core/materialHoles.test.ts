import {test} from 'node:test';
import assert from 'node:assert/strict';
import {holesMaterial,mergeHoleRing,mergeTwoHoleRing} from '../fixtures/materialHoles';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {exportDocument,importDocument} from '../../src/core/formats';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {buildConcaveLayerPartition} from '../../src/core/concaveLayers';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {traceMaterialBatch} from '../../src/core/materialTraceBatch';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {copyMaterialSelection,pasteMaterialSelection} from '../../src/app/materialClipboard';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import type {Doc,Point} from '../../src/core/types';
import {materialDoc} from '../fixtures/materialModel';
import {reflectMaterialEdge} from '../../src/core/materialReflect';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
const anchorAt=(d:Doc,p:Point)=>{const m=holesMaterial(d),g=m.graph,e=g.edges_vertices.findIndex(([a,b])=>{const x=g.vertices_coords[a],y=g.vertices_coords[b];return x[0]===p[0]&&y[0]===p[0]&&p[1]>Math.min(x[1],y[1])&&p[1]<Math.max(x[1],y[1])||x[1]===p[1]&&y[1]===p[1]&&p[0]>Math.min(x[0],y[0])&&p[0]<Math.max(x[0],y[0]);});assert.ok(e>=0);const [a,b]=g.edges_vertices[e].map(v=>g.vertices_coords[v]),axis=a[0]===b[0]?1:0;return {edgeId:m.edgeSegmentIds[e],fraction:(p[axis]-a[axis])/(b[axis]-a[axis])};};
test('one straight trace across the merged hole makes two actual creases and two simple subfaces, and M refolds as one transaction',()=>{
 const {result}=mergeHoleRing(),doc=result.doc;for(const assignment of ['F','M'] as const){const r=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:anchorAt(doc,[0,150]),to:anchorAt(doc,[300,150]),assignment,fixedSide:'left'}),m=holesMaterial(r.doc);assert.equal(r.facesAfter,2);assert.equal(r.insertedIds!.length,2);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-9);assert.equal(m.graph.faces_holes,undefined);assert.equal(computeFlatFold(r.doc).layers.status,'solved');assert.equal(r.placement,assignment==='F'?'preserved':'recomputed');}
});
test('single-face insertion in a holed face clips to actual material and uses explicit visual left/right fixed sides',()=>{
 const doc=mergeHoleRing().result.doc;for(const fixedPart of [0,1] as const){const r=editMaterialFaces(doc,{kind:'material-face-insert',face:0,from:anchorAt(doc,[0,150]),to:anchorAt(doc,[300,150]),assignment:'M',fixedPart});assert.equal(r.insertedIds!.length,2);assert.equal(r.facesAfter,2);assert.equal(r.placement,'recomputed');assert.equal(computeFlatFold(r.doc).layers.status,'solved');}
});
test('two holes remain separate inside one face, with complete private coverage and three M pieces across two blanks',()=>{
 const {result}=mergeTwoHoleRing(),doc=result.doc,m=holesMaterial(doc);assert.equal(m.graph.faces_holes![0].length,2);assert.equal(m.components[0].boundaryLoops.length,3);assert.equal(doc.segments.length,24);const p=buildConcaveLayerPartition(m.graph,m.tolerance);assert.equal(p.sourceAreas[0],130000);assert.equal(p.graph.faces_vertices.length,26);assert.equal(computeFlatFold(doc).layers.status,'solved');
 const r=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:anchorAt(doc,[0,150]),to:anchorAt(doc,[500,150]),assignment:'M',fixedSide:'left'});assert.equal(r.insertedIds!.length,3);assert.equal(r.facesAfter,2);assert.ok(Math.abs(r.trace!.blankLength-200)<1e-9);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('joining a center island along all hole edges preserves ring ownership, and inserting in the island updates the neighboring hole slots',()=>{
 const doc=mergeHoleRing().result.doc,coords:Point[]=[[100,100],[200,100],[200,200],[100,200]],center=materialDoc({vertices_coords:coords,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},coords),clipboard=copyMaterialSelection(center,holesMaterial(center).edgeSegmentIds),pasted=pasteMaterialSelection(doc,{kind:'material-clipboard-paste',clipboard,offset:[0,0],cpOnly:false,splitTarget:false}).doc,m=holesMaterial(pasted),hole=m.graph.faces_holeEdges![0][0],island=m.components.find(c=>c.faces.includes(1))!,same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1],pairs=hole.map(e=>{const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]),other=island.edges.find(k=>{const [x,y]=m.graph.edges_vertices[k].map(v=>m.graph.vertices_coords[v]);return same(a,x)&&same(b,y)||same(a,y)&&same(b,x);})!;return {first:m.edgeSegmentIds[e],second:m.edgeSegmentIds[other],assignment:'F' as const};}),joined=joinMaterialEdges(pasted,{kind:'material-join',pairs}).doc;
 assert.equal(holesMaterial(joined).components.length,1);assert.equal(holesMaterial(joined).components[0].boundaryLoops.length,1);const r=editMaterialFaces(joined,{kind:'material-face-insert',face:1,from:anchorAt(joined,[100,150]),to:anchorAt(joined,[200,150]),assignment:'F',fixedPart:0}),g=holesMaterial(r.doc).graph;assert.equal(g.faces_holes![0][0].length,6);assert.equal(g.faces_vertices!.length,3);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('a chord away from the hole preserves the untouched hole, and cut/join across its neighbor preserves all rings',()=>{
 const doc=mergeHoleRing().result.doc,r=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:anchorAt(doc,[0,50]),to:anchorAt(doc,[300,50]),assignment:'F',fixedSide:'left'}),m=holesMaterial(r.doc);assert.equal(r.facesAfter,2);assert.equal(m.graph.faces_holes!.flat().length,1);const cut=cutMaterialEdges(r.doc,{kind:'material-cut',segmentIds:r.insertedIds!}),cm=holesMaterial(cut.doc);assert.equal(cm.components.length,2);assert.equal(cm.graph.faces_holes!.flat().length,1);const banks=cut.descendants.get(r.insertedIds![0])!,joined=joinMaterialEdges(cut.doc,{kind:'material-join',pairs:[{first:banks[0],second:banks[1],assignment:'F'}]}).doc;assert.equal(holesMaterial(joined).components.length,1);assert.deepEqual(holesMaterial(joined).graph,m.graph);assert.equal(computeFlatFold(joined).layers.status,'solved');
});
test('two batch lines exclude the hole, preserve one material and never create a fictitious center intersection',()=>{
 const doc=mergeHoleRing().result.doc,r=traceMaterialBatch(doc,{kind:'material-face-traces',component:0,lines:[{from:anchorAt(doc,[0,150]),to:anchorAt(doc,[300,150]),assignment:'F'},{from:anchorAt(doc,[150,0]),to:anchorAt(doc,[150,300]),assignment:'F'}],fixedPoint:[25,25],cpOnly:false,overrides:[]}),m=holesMaterial(r.doc);assert.equal(r.facesAfter,4);assert.equal(r.batch.pieces.length,4);assert.ok(Math.abs(r.batch.blankLength-200)<1e-9);assert.equal(m.graph.vertices_coords.filter(p=>p[0]===150&&p[1]===150).length,0);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
 assert.throws(()=>traceMaterialBatch(doc,{kind:'material-face-traces',component:0,lines:[{from:anchorAt(doc,[0,150]),to:anchorAt(doc,[300,150]),assignment:'F'}],fixedPoint:[150,150],cpOnly:false,overrides:[]}),/固定点/);
});
test('complete copies and cross-project clipboard preserve real hole rings, orientation and boundary IDs',()=>{
 const doc=mergeHoleRing().result.doc,m=holesMaterial(doc),copied=copyMaterialComponents(doc,{kind:'material-copy',segmentIds:m.edgeSegmentIds,placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'x'}]}).doc,cm=holesMaterial(copied);assert.equal(cm.components.length,2);assert.equal(cm.graph.faces_holes!.flat().length,2);assert.equal(copied.segments.length,32);assert.equal(computeFlatFold(copied).layers.status,'solved');
 const clip=copyMaterialSelection(doc,m.edgeSegmentIds),pasted=pasteMaterialSelection(doc,{kind:'material-clipboard-paste',clipboard:clip,offset:[400,0],cpOnly:false,splitTarget:false}).doc,pm=holesMaterial(pasted);assert.equal(pm.components.length,2);assert.equal(pm.graph.faces_holes!.flat().length,2);assert.equal(pasted.segments.length,32);assert.equal(computeFlatFold(pasted).layers.status,'solved');
});
test('overlap cells and front/back SVG image export leave the actual hole empty',()=>{
 const flat=computeFlatFold(mergeHoleRing().result.doc),regions=modelOverlapRegions(flat);assert.equal(regions.cells.reduce((n,r)=>n+r.area,0),80000);assert.ok(regions.cells.every(r=>!r.polygon.every(p=>p[0]>=100&&p[0]<=200&&p[1]>=100&&p[1]<=200)));for(const side of ['front','back'] as const){const svg=foldedModelSVG(flat,{name:'孔洞',side,xray:false});assert.match(svg,/data-face-holes="1"/);assert.match(svg,/fill-rule="evenodd"/);assert.equal((svg.match(/data-face-id="0"/g)??[]).length,1);}
});
test('single-edge reflection in a neighboring holed face creates two finite real pieces without bridging its opening',()=>{
 const doc=mergeHoleRing().result.doc,base=editMaterialFaces(doc,{kind:'material-face-trace',component:0,from:anchorAt(doc,[0,50]),to:anchorAt(doc,[300,50]),assignment:'M',fixedSide:'left'}).doc;base.segments.push({id:'axis',a:[0,100],b:[300,100],assignment:'A',angle:null});const source=base.segments.find(s=>s.assignment==='M')!,r=reflectMaterialEdge(base,{kind:'material-edge-reflect',sourceId:source.id,axisId:'axis',component:'source',fixedSide:'left',cpOnly:false});assert.equal(r.insertedIds!.length,2);assert.ok(Math.abs(r.trace!.blankLength-100)<1e-9);assert.equal(r.placement,'recomputed');assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('visible region boundaries include all hole edges and shadow coverage never claims a paper layer inside the hole',()=>{
 const flat=computeFlatFold(mergeHoleRing().result.doc),overlap=modelOverlapRegions(flat),regions=modelRegionLayers(flat,overlap,'front'),boundaries=modelRegionBoundaries(flat,regions);assert.ok(boundaries.edges.some(e=>e.a[0]===100&&e.b[0]===100));assert.ok(boundaries.edges.some(e=>e.a[1]===200&&e.b[1]===200));assert.equal(boundaries.ambiguousEdges,0);const shadows=modelShadowBoundaries(flat,'front');assert.equal(shadows.status,'ready');assert.equal(shadows.boundaries.length,0);
});
test('multi-ring 3D simulation retains the opening in a private complete mesh without mutating the material CP',()=>{
 const g=holesMaterial(mergeHoleRing().result.doc).graph,before=JSON.stringify(g),{prepared}=prepareSimulationDocument(g);assert.equal(prepared.faceCount,16);assert.equal(prepared.vertexCount,16);assert.equal(prepared.edgesAssignment.filter(a=>a==='B').length,16);assert.equal(JSON.stringify(g),before);
});
test('holed face uses private complete triangulation for one original face layer without filling the hole or adding CP edges',()=>{
 const {result}=mergeHoleRing(),m=holesMaterial(result.doc),before=JSON.stringify(result.doc),p=buildConcaveLayerPartition(m.graph,m.tolerance);assert.equal(p.graph.faces_vertices.length,16);assert.equal(p.sourceAreas[0],80000);assert.ok(p.parent.every(f=>f===0));assert.equal(p.privateVertices.length,0);assert.equal(JSON.stringify(result.doc),before);const flat=computeFlatFold(result.doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(flat.geometry.faces.length,1);assert.equal(flat.geometry.graph!.edges_vertices.length,16);assert.equal(recomputeFlatLayers(flat).layers.status,'solved');
});
test('removing the ring internal creases creates one genuine holed face without any helper CP edge',()=>{
 const {source,intent,result}=mergeHoleRing(),m=holesMaterial(result.doc);assert.equal(result.facesBefore,8);assert.equal(result.facesAfter,1);assert.equal(m.graph.faces_holes![0].length,1);assert.equal(m.graph.faces_vertices![0].length,12);assert.equal(m.graph.faces_holes![0][0].length,4);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,2);assert.equal(m.graph.edges_vertices.length,16);assert.equal(result.doc.segments.length,16);assert.equal(result.removedEdges,8);assert.equal(result.placement,'preserved');assert.deepEqual(prepareEditorCommit(source,result.doc,intent).doc,result.doc);
 const removed=new Set(intent.segmentIds);assert.deepEqual(result.doc.segments,source.segments.filter(s=>!removed.has(s.id)));
 assert.equal((result.doc.metadata!.materialTopology as {schema:string}).schema,'zhezhi-material-topology-v2');
});
test('JSON and explicit material FOLD preserve hole vertices, edge identities, frame and CP without connecting seams',()=>{
 const {result}=mergeHoleRing(),m=holesMaterial(result.doc);for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(result.doc,format).text,format).doc,n=holesMaterial(reopened);assert.deepEqual(n.graph,m.graph);assert.deepEqual(n.foldedVertices,m.foldedVertices);assert.equal(reopened.segments.length,16);}
});
test('malformed hole incidence, touching boundaries, winding, shared indices and fabricated FF are rejected',()=>{
 const {result}=mergeHoleRing();for(const mutation of [(g:any)=>{delete g.faces_holeEdges;},(g:any)=>{g.faces_holes[0][0].reverse();},(g:any)=>{g.faces_holeFaces[0][0][0]=0;},(g:any)=>{g.faces_holeEdges[0][0][0]=0;},(g:any)=>{g.faces_holes[0].push(g.faces_holes[0][0]);}]){const d=structuredClone(result.doc);mutation((d.metadata!.materialTopology as any).graph);assert.equal(inspectMaterialTopology(d).ok,false);}
 const bad=structuredClone(result.doc);(bad.metadata!.materialTopology as any).foldedVertices[5]=[1000,1000];assert.equal(inspectMaterialTopology(bad).ok,false);
 for(const shift of [-100,300]){const malformed=structuredClone(result.doc),g=(malformed.metadata!.materialTopology as any).graph;for(const v of g.faces_holes[0][0])g.vertices_coords[v][0]+=shift;const inspected=inspectMaterialTopology(malformed);assert.equal(inspected.ok,false);if(!inspected.ok)assert.match(inspected.reason,/内部|相交|接触|自交/);}
 const downgrade=structuredClone(result.doc);(downgrade.metadata!.materialTopology as any).schema='zhezhi-material-topology-v1';const inspected=inspectMaterialTopology(downgrade);assert.equal(inspected.ok,false);if(!inspected.ok)assert.match(inspected.reason,/v2/);
});
