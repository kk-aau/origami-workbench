import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,distance,polygonArea} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {materialFaceInside} from '../../src/core/materialRings';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {modelProjection} from '../../src/app/modelProjection';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramCPState,DiagramPose} from '../../src/app/diagramProject';
import type {Doc,Point,Segment} from '../../src/core/types';
import {mapDiagramCPSelection,fixedDiagramCPSelection,fixedDiagramCPItem,diagramCPFaceTriangles} from '../../src/app/diagramCPSelection';
import {mapDiagramFoldLines,applyDiagramFoldSegments,diagramFoldStartingFace,alignDiagramFoldResult,applyDiagramFoldMatrix} from '../../src/app/diagramFoldLink';
import {materialDoc} from '../fixtures/materialModel';

function poseOf(doc:Doc):DiagramPose {
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  return {sourceStateId:'cp-before',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
const stateOf=(doc:Doc,id='cp-before'):DiagramCPState=>({id,revision:0,doc});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
const area=(polygons:Point[][])=>polygons.reduce((sum,p)=>sum+Math.abs(polygonArea(p)),0);
const center=(p:Point[]):Point=>[p.reduce((sum,p)=>sum+p[0],0)/p.length,p.reduce((sum,p)=>sum+p[1],0)/p.length];
const segment=(a:Point,b:Point,assignment:Segment['assignment']='F',id='new'):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:0});
function stacked(){
  const doc=blankDoc('两层纸面',100,100);doc.segments.push(segment([50,0],[50,100],'V','old-fold'));
  const pose=poseOf(doc);return {doc,pose,source:stateOf(doc)};
}
function afterHorizontal(pose:DiagramPose,doc:Doc):Doc {
  const mapped=mapDiagramFoldLines(pose,[{id:'next-fold',kind:'line',a:[0,40],b:[50,40],style:'valley',color:'#314b3c',width:.7}],{enabled:true,layers:'all',selectedFaces:[]});
  return applyDiagramFoldSegments(doc,mapped.segments);
}

test('source face and exact source vertex preserve CP identity under back-side rotation',()=>{
  const {doc,pose,source}=stacked();pose.view={...defaultModelView(),side:'back',rotation:73};
  const graph=buildFold(doc).graph,projection=modelProjection(pose.result.geometry.vertices,true,73),before=structuredClone(pose);
  for(let face=0;face<graph.faces_vertices!.length;face++){
    const mapped=mapDiagramCPSelection(pose,source,{kind:'face',index:face},source);
    assert.deepEqual(mapped.faces,[face]);assert.ok(mapped.polygonFaces.every(f=>f===face));
    assert.ok(Math.abs(area(mapped.polygons)-Math.abs(polygonArea(graph.faces_vertices![face].map(v=>graph.vertices_coords[v]))))<1e-5);
    for(const v of graph.faces_vertices![face])assert.ok(mapped.polygons.flat().some(p=>distance(p,projection.project(pose.result.geometry.vertices[v]))<1e-5));
  }
  const vertex=graph.vertices_coords.findIndex(p=>p[0]===0&&p[1]===0),mapped=mapDiagramCPSelection(pose,source,{kind:'vertex',index:vertex},source);
  assert.equal(mapped.points.length,1);close(mapped.points[0],projection.project(pose.result.geometry.vertices[vertex]));
  assert.deepEqual(mapped.faces,graph.faces_vertices!.flatMap((face,f)=>face.includes(vertex)?[f]:[]));assert.deepEqual(pose,before);
});

test('new after-CP face numbers map to their old source parents rather than becoming source face indices',()=>{
  const {doc,pose,source}=stacked(),after=afterHorizontal(pose,doc),state=stateOf(after,'cp-after'),graph=buildFold(after).graph,original=buildFold(doc).graph;
  assert.equal(original.faces_vertices!.length,2);assert.equal(graph.faces_vertices!.length,4);
  for(let f=0;f<graph.faces_vertices!.length;f++){
    const cp=graph.faces_vertices![f].map(v=>graph.vertices_coords[v]),inside=center(cp),parent=original.faces_vertices!.findIndex((_,index)=>materialFaceInside(original,index,inside));
    assert.ok(parent>=0);const mapped=mapDiagramCPSelection(pose,state,{kind:'face',index:f},source);
    assert.deepEqual(mapped.faces,[parent]);assert.ok(mapped.polygonFaces.every(index=>index===parent));
    assert.ok(Math.abs(area(mapped.polygons)-Math.abs(polygonArea(cp)))<1e-5);
  }
  const f=3,mapped=mapDiagramCPSelection(pose,state,{kind:'face',index:f},source);
  assert.ok(!mapped.faces.includes(f),'the displayed after-CP F4 is not source F4');
});

test('an intersection added on the old crease selects both incident source layers and one shared displayed point',()=>{
  const {doc,pose,source}=stacked(),after=afterHorizontal(pose,doc),graph=buildFold(after).graph,index=graph.vertices_coords.findIndex(p=>distance(p,[50,40])<1e-8);
  assert.ok(index>=0);assert.ok(!buildFold(doc).graph.vertices_coords.some(p=>distance(p,[50,40])<1e-8));
  const mapped=mapDiagramCPSelection(pose,stateOf(after,'cp-after'),{kind:'vertex',index},source);
  assert.deepEqual(new Set(mapped.faces),new Set([0,1]));assert.equal(mapped.points.length,1);close(mapped.points[0],[50,40]);
  assert.deepEqual(new Set(mapped.pieces.map(p=>p.face)),new Set([0,1]));
});

test('finite F interior tips map to their containing paper face without requiring a face-boundary vertex',()=>{
  const doc=blankDoc('有限预折痕端点',100,100);doc.segments.push(segment([20,30],[80,30],'F','finite-F'));
  const pose=poseOf(doc),source=stateOf(doc),graph=buildFold(doc).graph;pose.view={...defaultModelView(),side:'back',rotation:37};
  const projection=modelProjection(pose.result.geometry.vertices,true,37),before=structuredClone({pose,source});
  for(const tip of [[20,30],[80,30]] as Point[]){
    const index=graph.vertices_coords.findIndex(point=>distance(point,tip)<1e-8);assert.ok(index>=0);
    assert.ok(graph.faces_vertices!.every(face=>!face.includes(index)),'fixture retains isolated F tips rather than extending the crease to a paper edge');
    const mapped=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);assert.deepEqual(mapped.faces,[0]);assert.equal(mapped.points.length,1);
    close(mapped.points[0],projection.project(pose.result.geometry.vertices[index]));assert.ok(mapped.pieces.every(piece=>piece.face===0));
    const anchor=fixedDiagramCPSelection(pose,source,{kind:'vertex',index},0,doc,undefined,source);
    assert.deepEqual(anchor.target,{stateId:source.id,kind:'vertex',point:tip});assert.deepEqual(fixedDiagramCPItem(source,anchor),{kind:'vertex',index});
  }
  assert.deepEqual({pose,source},before);
});

test('finite F tips crossing an existing fold highlight only their real source layer, while the fold intersection highlights both',()=>{
  const doc=blankDoc('两层有限预折痕',100,100);doc.segments.push(segment([50,0],[50,100],'V','old-fold'),segment([20,30],[80,30],'F','finite-F'));
  const pose=poseOf(doc),source=stateOf(doc),graph=buildFold(doc).graph,projection=modelProjection(pose.result.geometry.vertices,false,0);
  for(const tip of [[20,30],[80,30]] as Point[]){
    const index=graph.vertices_coords.findIndex(point=>distance(point,tip)<1e-8),mapped=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);
    assert.equal(mapped.faces.length,1);assert.equal(mapped.points.length,1);close(mapped.points[0],projection.project(pose.result.geometry.vertices[index]));
    assert.ok(graph.faces_vertices![mapped.faces[0]].some(v=>graph.vertices_coords[v][0]===tip[0]));
  }
  const index=graph.vertices_coords.findIndex(point=>distance(point,[50,30])<1e-8),intersection=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);
  assert.deepEqual(new Set(intersection.faces),new Set([0,1]));assert.equal(intersection.points.length,1);close(intersection.points[0],projection.project(pose.result.geometry.vertices[index]));
});

test('illustration deformation remains hoverable piece by piece but cannot become a physical fixed anchor',()=>{
  const doc=blankDoc('二维修形',100,100),pose=poseOf(doc),source=stateOf(doc),graph=buildFold(doc).graph,index=graph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===0);
  pose.result.geometry.vertices[index]=[112,8];pose.result.geometry.modified=true;
  const mapped=mapDiagramCPSelection(pose,source,{kind:'face',index:0},source);
  assert.deepEqual(mapped.faces,[0]);assert.equal(mapped.polygons.length,2);assert.ok(mapped.polygons.flat().some(p=>distance(p,[112,8])<1e-5));
  const vertex=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);close(vertex.points[0],[112,8]);
  assert.throws(()=>fixedDiagramCPSelection(pose,source,{kind:'face',index:0},0,doc,[20,20],source),/非等距|等距/);
});

test('fixing a CP vertex keeps the exact target plus a separate interior seed, and the next fold retains its location',()=>{
  const {doc,pose,source}=stacked();pose.view={...defaultModelView(),side:'back',rotation:90};
  const plain=structuredClone(pose);plain.view=defaultModelView();const after=afterHorizontal(plain,doc),state=stateOf(after,'cp-after'),graph=buildFold(after).graph;
  const index=graph.vertices_coords.findIndex(p=>distance(p,[50,40])<1e-8),item={kind:'vertex' as const,index};
  const anchor=fixedDiagramCPSelection(pose,state,item,0,after,undefined,source);
  assert.deepEqual(anchor.target,{stateId:'cp-after',kind:'vertex',point:[50,40]});assert.ok(distance(anchor.point,[50,40])>1e-4);
  assert.deepEqual(fixedDiagramCPItem(state,anchor),item);assert.equal(fixedDiagramCPItem(source,anchor),null);
  const fixedFace=diagramFoldStartingFace(after,anchor);assert.ok(materialFaceInside(graph,fixedFace,anchor.point));
  assert.ok(graph.faces_vertices![fixedFace].includes(index));
  const result=computeFlatFold(after,undefined,{startingFace:fixedFace});assert.equal(result.geometry.status,'ready');
  const aligned=alignDiagramFoldResult(after,result,anchor);close(aligned.geometry.vertices[index],applyDiagramFoldMatrix(anchor.matrix,[50,40]));
  for(const v of graph.faces_vertices![fixedFace])close(aligned.geometry.vertices[v],applyDiagramFoldMatrix(anchor.matrix,graph.vertices_coords[v]));
  const separated=structuredClone(after),x=(anchor.point[0]+50)/2;
  assert.ok(Math.abs(anchor.point[0]-50)>1e-5);separated.segments.push(segment([x,0],[x,100],'F','separates-reference'));
  assert.doesNotThrow(()=>diagramFoldStartingFace(separated,anchor),'a flat mark cannot separate the fixed paper reference');
  separated.segments[separated.segments.length-1]=segment([x,0],[x,100],'V','separates-reference');
  assert.throws(()=>diagramFoldStartingFace(separated,anchor),/分开了固定顶点|邻接纸面/);
});

test('a face click fixes the clicked new subface rather than the source face center on a new crease',()=>{
  const doc=blankDoc('固定上半面',100,100),pose=poseOf(doc),source=stateOf(doc),after=structuredClone(doc);
  after.segments.push(segment([0,50],[100,50],'V','next'));
  const anchor=fixedDiagramCPSelection(pose,source,{kind:'face',index:0},0,after,[20,15],source),graph=buildFold(after).graph;
  close(anchor.point,[20,15]);assert.deepEqual(anchor.target,{stateId:source.id,kind:'face',point:[20,15]});
  const fixedFace=diagramFoldStartingFace(after,anchor);assert.ok(graph.faces_vertices![fixedFace].every(v=>graph.vertices_coords[v][1]<=50));
  assert.deepEqual(fixedDiagramCPItem(source,anchor),{kind:'face',index:0});
});

test('a face click near a new crease stays in the clicked band rather than the nearest triangle centroid',()=>{
  const doc=blankDoc('三条纸带',100,100),pose=poseOf(doc),source=stateOf(doc),after=structuredClone(doc);
  for(const y of [20,80])after.segments.push(segment([0,y],[100,y],'V',`new-${y}`));
  const anchor=fixedDiagramCPSelection(pose,source,{kind:'face',index:0},0,after,[5,21],source),graph=buildFold(after).graph;
  close(anchor.point,[5,21]);const face=diagramFoldStartingFace(after,anchor);
  assert.ok(graph.faces_vertices![face].every(v=>graph.vertices_coords[v][1]>=20&&graph.vertices_coords[v][1]<=80));
});

test('the artificial triangulation diagonal is not treated as a CP face boundary for a fixed marker',()=>{
  const source=stateOf(blankDoc('内部对角线',100,100));
  assert.deepEqual(fixedDiagramCPItem(source,{point:[50,50],matrix:[1,0,0,1,0,0],target:{stateId:source.id,kind:'face',point:[50,50]}}),{kind:'face',index:0});
});

test('concave paper highlighting covers both arms and never fills the missing corner',()=>{
  const points:Point[]=[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]],doc:Doc={schemaVersion:2,name:'凹纸面',paper:{width:100,height:100},segments:points.map((a,i)=>segment(a,points[(i+1)%points.length],'B',`b${i}`))};
  const pose=poseOf(doc),source=stateOf(doc),mapped=mapDiagramCPSelection(pose,source,{kind:'face',index:0},source),graph=buildFold(doc).graph;
  assert.ok(Math.abs(area(mapped.polygons)-5100)<1e-5);
  for(const polygon of mapped.polygons)assert.ok(materialFaceInside(graph,0,center(polygon)));
  assert.ok(mapped.polygons.every(p=>p.every(v=>v[0]<=30+1e-6||v[1]<=30+1e-6)));
});

function holed(){
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]);
  const doc=materialDoc(graph,points);return {doc,pose:poseOf(doc),source:stateOf(doc)};
}

test('a material hole stays empty in CP-to-model highlight triangles',()=>{
  const {doc,pose,source}=holed(),graph=buildFold(doc).graph,mapped=mapDiagramCPSelection(pose,source,{kind:'face',index:0},source);
  assert.equal(diagramCPFaceTriangles(graph,0).length,8);assert.ok(Math.abs(area(mapped.polygons)-9600)<1e-5);
  assert.ok(mapped.polygons.every(poly=>materialFaceInside(graph,0,center(poly))));
  for(const poly of mapped.polygons)for(let i=0;i<poly.length;i++){
    const mid:Point=[(poly[i][0]+poly[(i+1)%poly.length][0])/2,(poly[i][1]+poly[(i+1)%poly.length][1])/2];
    assert.ok(!(mid[0]>40+1e-6&&mid[0]<60-1e-6&&mid[1]>40+1e-6&&mid[1]<60-1e-6));
  }
});

test('vertices of a true interior boundary remain incident to the surrounding material face',()=>{
  const {doc,pose,source}=holed(),graph=buildFold(doc).graph;
  const index=graph.vertices_coords.findIndex(p=>distance(p,[40,40])<1e-8);assert.ok(index>=0);
  const mapped=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);
  assert.deepEqual(mapped.faces,[0]);assert.equal(mapped.points.length,1);close(mapped.points[0],[40,40]);
});

test('renaming an after-CP cannot weld two coincident independent material vertex identities',()=>{
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[0,0],[100,0],[100,100],[0,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3],[4,5,6,7]],[[0,1,2,3],[4,5,6,7]]),doc=materialDoc(graph,points),pose=poseOf(doc),source=stateOf(doc);
  const after=structuredClone(doc);after.name='操作后CP';
  assert.deepEqual(mapDiagramCPSelection(pose,source,{kind:'vertex',index:0},source).faces,[0]);
  assert.deepEqual(mapDiagramCPSelection(pose,stateOf(after,'cp-after'),{kind:'vertex',index:0},source).faces,[0]);
  assert.deepEqual(mapDiagramCPSelection(pose,stateOf(after,'cp-after'),{kind:'face',index:0},source).faces,[0]);
});

test('a changed material topology refuses geometric guessing across independent CP identities',()=>{
  const {doc,pose,source}=holed(),graph=structuredClone(buildFold(doc).graph),before=structuredClone(pose);
  graph.vertices_coords[0][0]-=5;const after=materialDoc(graph,graph.vertices_coords);
  assert.doesNotThrow(()=>buildFold(after));
  assert.throws(()=>mapDiagramCPSelection(pose,stateOf(after,'cp-after'),{kind:'face',index:0},source),/材料|切口|拓扑/);
  assert.throws(()=>mapDiagramCPSelection(pose,stateOf(after,'cp-after'),{kind:'vertex',index:0},source),/材料|切口|拓扑/);
  assert.deepEqual(pose,before);
});

test('stale source revision, source identity and source content refuse both highlighting and fixed selection',()=>{
  const {doc,pose,source}=stacked(),before=structuredClone(pose);
  const changed=structuredClone(doc);changed.name='已修改来源';
  for(const stale of [{...source,revision:1},{...source,id:'other-cp'},{...source,doc:changed}]){
    assert.throws(()=>mapDiagramCPSelection(pose,source,{kind:'face',index:0},stale),/来源 CP 已更新/);
    assert.throws(()=>fixedDiagramCPSelection(pose,source,{kind:'face',index:0},0,doc,[20,20],stale),/来源 CP 已更新/);
  }
  assert.deepEqual(pose,before);
});

test('missing source vertex identity and invalid local selections fail without inferring a different paper face',()=>{
  const {pose,source}=stacked(),missing=structuredClone(pose);missing.result.geometry.vertices.pop();
  assert.throws(()=>mapDiagramCPSelection(missing,source,{kind:'face',index:0},source),/纸面身份/);
  assert.throws(()=>mapDiagramCPSelection(pose,source,{kind:'face',index:99},source),/纸面不存在/);
  assert.throws(()=>mapDiagramCPSelection(pose,source,{kind:'vertex',index:99},source),/顶点不存在/);
});

test('a selected crease edge highlights its line and both real incident layers without filling whole faces',()=>{
  const {doc,pose,source}=stacked(),graph=buildFold(doc).graph,edge=graph.edges_assignment.findIndex(assignment=>assignment==='V');
  const mapped=mapDiagramCPSelection(pose,source,{kind:'edge',index:edge},source);
  assert.deepEqual(new Set(mapped.faces),new Set([0,1]));assert.equal(mapped.polygons.length,0);assert.equal(mapped.points.length,0);
  assert.deepEqual(new Set(mapped.segments.map(part=>part.face)),new Set([0,1]));
  for(const part of mapped.segments){close(part.a,[50,0]);close(part.b,[50,100]);}
  assert.throws(()=>fixedDiagramCPSelection(pose,source,{kind:'edge',index:edge},0,doc,undefined,source),/线段.*纸面或顶点/);
});

test('individual after-CP edge pieces project onto their source paper rather than adjacent folded layers',()=>{
  const {doc,pose,source}=stacked(),after=afterHorizontal(pose,doc),graph=buildFold(after).graph,state=stateOf(after,'cp-after');
  const edges=graph.edges_assignment.flatMap((assignment,index)=>['M','V'].includes(assignment)&&graph.edges_vertices[index].every(v=>Math.abs(graph.vertices_coords[v][1]-40)<1e-8)?[index]:[]);
  assert.equal(edges.length,2);
  for(const index of edges){
    const edge=graph.edges_vertices[index],cp=edge.map(v=>graph.vertices_coords[v]),middle:Point=[(cp[0][0]+cp[1][0])/2,40],parent=buildFold(doc).graph.faces_vertices!.findIndex((_,f)=>materialFaceInside(buildFold(doc).graph,f,middle));
    const mapped=mapDiagramCPSelection(pose,state,{kind:'edge',index},source);assert.deepEqual(mapped.faces,[parent]);
    assert.ok(mapped.segments.length>=1);assert.ok(mapped.segments.every(part=>part.face===parent&&Math.abs(part.a[1]-40)<1e-8&&Math.abs(part.b[1]-40)<1e-8));
  }
});

test('edge correspondence follows pulled paper corners and a rotated back-side presentation',()=>{
  const doc=blankDoc('修形后的纸边',100,100),pose=poseOf(doc),source=stateOf(doc),graph=buildFold(doc).graph;
  const vertex=graph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===0);pose.result.geometry.vertices[vertex]=[112,8];pose.result.geometry.modified=true;
  pose.view={...defaultModelView(),side:'back',rotation:37};
  const index=graph.edges_vertices.findIndex(edge=>edge.includes(vertex)&&edge.every(v=>graph.vertices_coords[v][1]===0));assert.ok(index>=0);
  const mapped=mapDiagramCPSelection(pose,source,{kind:'edge',index},source),projection=modelProjection(pose.result.geometry.vertices,true,37);
  assert.deepEqual(mapped.faces,[0]);assert.equal(mapped.polygons.length,0);
  for(const v of graph.edges_vertices[index])assert.ok(mapped.segments.some(part=>[part.a,part.b].some(p=>distance(p,projection.project(pose.result.geometry.vertices[v]))<1e-5)));
  assert.throws(()=>mapDiagramCPSelection(pose,source,{kind:'edge',index:999},source),/线段不存在/);
});

test('coincident independent material edge identities never highlight a different paper bank',()=>{
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[0,0],[100,0],[100,100],[0,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3],[4,5,6,7]],[[0,1,2,3],[4,5,6,7]]),doc=materialDoc(graph,points),pose=poseOf(doc),source=stateOf(doc);
  for(const [index,face] of [[0,0],[4,1]]){
    const mapped=mapDiagramCPSelection(pose,source,{kind:'edge',index},source);
    assert.deepEqual(mapped.faces,[face]);assert.ok(mapped.segments.length);assert.ok(mapped.segments.every(part=>part.face===face));assert.equal(mapped.polygons.length,0);
  }
});

test('precrease edge selection keeps physical face numbers instead of creating new paper layers',()=>{
  const doc=blankDoc('预折痕不分层',100,100);doc.segments.push(segment([50,0],[50,100],'V','old-fold'),segment([20,30],[80,30],'F','finite-F'));
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready',result.geometry.message);
  const pose:DiagramPose={sourceStateId:'cp-before',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()},source=stateOf(doc),graph=buildDiagramFold(doc).graph;
  assert.equal(graph.faces_vertices!.length,2);assert.equal(result.geometry.faces.length,2);
  for(const index of graph.edges_assignment.flatMap((assignment,index)=>assignment==='F'?[index]:[])){
    const mapped=mapDiagramCPSelection(pose,source,{kind:'edge',index},source);
    assert.equal(mapped.faces.length,1);assert.equal(mapped.polygons.length,0);assert.ok(mapped.segments.length);
    assert.ok(mapped.segments.every(part=>part.face===mapped.faces[0]));
  }
  for(const point of [[20,30],[80,30]] as Point[]){
    const index=graph.vertices_coords.findIndex(p=>distance(p,point)<1e-8),mapped=mapDiagramCPSelection(pose,source,{kind:'vertex',index},source);
    assert.equal(mapped.faces.length,1);assert.equal(mapped.points.length,1);
  }
});

test('a physical CP face can still correspond to older saved poses with subdivided F faces',()=>{
  const doc=blankDoc('旧预折步骤姿态',100,100);doc.segments.push(segment([0,30],[100,30],'F','old-precrease'));
  const pose=poseOf(doc),source=stateOf(doc);assert.equal(pose.result.geometry.faces.length,2);assert.equal(buildDiagramFold(doc).graph.faces_vertices!.length,1);
  const mapped=mapDiagramCPSelection(pose,source,{kind:'face',index:0},source);
  assert.deepEqual(new Set(mapped.faces),new Set([0,1]));assert.ok(Math.abs(area(mapped.polygons)-10000)<1e-5);
});
