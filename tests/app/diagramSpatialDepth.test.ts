import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance,polygonArea} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import {diagramDepthActive,diagramDepthAvailable} from '../../src/app/diagramDepth';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {diagramModelMarkup,diagramPresentation} from '../../src/app/diagramDrawing';
import {diagramSpatialEdgeMarkup} from '../../src/app/diagramSpatialEdges';
import {mapDiagramFoldLines,pickDiagramFoldAnchor,applyDiagramFoldMatrix,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';
import {createDiagramProject,adoptDiagramPose,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {createDiagramSpatialPose,reprojectDiagramSpatialPose,restoreDiagramSpatialLayers,spatialFaceMatrix,validateDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {defaultModelView} from '../../src/app/modelViewState';
import {updateDiagramDepth} from '../../src/app/diagramDepthTransaction';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

// The real three-bank accordion from diagramSpatialPose.test.ts: one fully
// folded material pair and one genuinely spatial, partially folded bank.
function document(first=180,second=-45):Doc {
 const segments:Segment[]=[
  {id:'b0',a:[0,0],b:[90,0],assignment:'B',angle:0},{id:'b1',a:[90,0],b:[90,90],assignment:'B',angle:0},
  {id:'b2',a:[90,90],b:[0,90],assignment:'B',angle:0},{id:'b3',a:[0,90],b:[0,0],assignment:'B',angle:0},
  {id:'crease-1',a:[30,0],b:[30,90],assignment:first<0?'M':'V',angle:first},
  {id:'crease-2',a:[60,0],b:[60,90],assignment:second>0?'V':'M',angle:second},
 ];
 return {schemaVersion:2,name:'空间图解分层试件',paper:{width:90,height:90},segments};
}
function flatPose(doc=document(180,-180)):DiagramPose {
 const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved',result.layers.message);
 return {sourceStateId:'cp-flat',sourceRevision:0,sourceDoc:structuredClone(doc),result};
}
function fixture(second=-45,camera={yaw:23,elevation:35}) {
 const previous=flatPose(),doc=document(180,second);
 const pose:DiagramPose={sourceStateId:'cp-spatial',sourceRevision:0,sourceDoc:structuredClone(doc),...createDiagramSpatialPose(doc,0,undefined,previous,camera),view:{...defaultModelView(),depth:{amount:.08,direction:135}}};
 assert.equal(pose.result.layers.status,'solved');assert.equal(pose.result.layers.faceOrder?.length,3);validateDiagramSpatialPose(pose,true);
 return {previous,doc,pose};
}
const mix=(points:Point[],w:number[]):Point=>[0,1].map(axis=>points.reduce((sum,p,i)=>sum+p[axis]*w[i],0)) as Point;
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-6,`${a} != ${b}`);
const stroke=(a:Point,b:Point,face:number):DiagramLineAnnotation=>({id:'spatial-crease',kind:'line',a,b,style:'valley',color:'#123456',width:.7,foldAngle:60,foldFaces:[face]});

test('spatial relief visibly separates real paper while keeping all physical and source values immutable',()=>{
 const {pose}=fixture(),before=structuredClone(pose),mesh=diagramIllustrationMesh(pose);
 assert.ok(diagramDepthAvailable(pose));assert.ok(diagramDepthActive(pose));assert.notDeepEqual(mesh.vertices,pose.result.geometry.vertices);
 assert.ok(mesh.vertices.some((p,i)=>distance(p,pose.result.geometry.vertices[i])>1e-4));
 for(const row of mesh.triangles)for(const t of row){const original=polygonArea(t.map(v=>pose.result.geometry.vertices[v])),shown=polygonArea(t.map(v=>mesh.vertices[v]));assert.ok(shown/original>=.2-1e-8);}
 const off={...pose,view:{...pose.view!,depth:{amount:0,direction:135}}};
 assert.notEqual(diagramModelMarkup(pose),diagramModelMarkup(off));assert.deepEqual(pose,before);
 assert.deepEqual(diagramIllustrationMesh(off).vertices,pose.result.geometry.vertices);
});

test('spatial display triangles map new strokes and fixed anchors to the same real material on both sides',()=>{
 for(const side of ['front','back'] as const)for(const rotation of [0,47]){
  const {pose}=fixture();pose.view={...pose.view!,side,rotation};const before=structuredClone(pose);
  const mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices;
  for(let face=0;face<mesh.triangles.length;face++){
   const ids=mesh.triangles[face][0],a=mix(ids.map(v=>shown[v]),[.6,.2,.2]),b=mix(ids.map(v=>shown[v]),[.2,.4,.4]);
   const cpA=mix(ids.map(v=>mesh.graph.vertices_coords[v]),[.6,.2,.2]),cpB=mix(ids.map(v=>mesh.graph.vertices_coords[v]),[.2,.4,.4]);
   const mapped=mapDiagramFoldLines(pose,[stroke(a,b,face)],{enabled:true,layers:'selected',selectedFaces:[face]});
   assert.ok(mapped.segments.length,`side=${side}, rotation=${rotation}, face=${face}`);close(mapped.segments[0].a,cpA);close(mapped.segments.at(-1)!.b,cpB);
   assert.ok(Math.abs(mapped.segments.reduce((n,s)=>n+distance(s.a,s.b),0)-distance(cpA,cpB))<1e-6);
   assert.ok(diagramFoldFacesAtPoint(pose,a).includes(face));
   const fixed=pickDiagramFoldAnchor(pose,a,face);close(fixed.point,cpA);
   assert.deepEqual(fixed.spatialTransform,pose.spatial!.faceTransforms[face]);assert.deepEqual(fixed.matrix,spatialFaceMatrix(pose.spatial!,face));
   close(applyDiagramFoldMatrix(fixed.matrix,cpA),mix(ids.map(v=>pose.result.geometry.vertices[v]),[.6,.2,.2]));
  }
  assert.deepEqual(pose,before);
 }
});

test('turning spatial display separation off and on, exporting and restoring layers preserves physical material',()=>{
 const {doc,pose,previous}=fixture();let project=createDiagramProject(doc);
 project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,pose.result,pose.view,pose.spatial);
 const before=structuredClone(project),expanded=diagramIllustrationMesh(project.steps[0].pose!).vertices;
 const off=updateDiagramDepth(project,project.activeStepId,{amount:0,direction:135});
 assert.deepEqual(off.states,project.states);assert.deepEqual(off.steps[0].pose!.result,project.steps[0].pose!.result);assert.deepEqual(off.steps[0].pose!.spatial,project.steps[0].pose!.spatial);
 assert.deepEqual(diagramIllustrationMesh(off.steps[0].pose!).vertices,pose.result.geometry.vertices);
 const again=updateDiagramDepth(off,off.activeStepId,{amount:.08,direction:135});assert.deepEqual(diagramIllustrationMesh(again.steps[0].pose!).vertices,expanded);
 const saved=importDiagramProject(exportDiagramProject(again)),restored=saved.steps[0].pose!;
 assert.deepEqual(restored.view!.depth,pose.view!.depth);assert.deepEqual(restored.spatial!.vertices,pose.spatial!.vertices);
 restoreDiagramSpatialLayers(restored,previous);assert.ok(diagramDepthAvailable(restored));
 assert.deepEqual(restored.result.layers.faceOrders,pose.result.layers.faceOrders);assert.deepEqual(diagramIllustrationMesh(restored).vertices,expanded);
 assert.deepEqual(project,before);
});

test('changing the real spatial camera recomputes display separation without changing physical geometry or its settings',()=>{
 const {pose,previous}=fixture(),before=structuredClone(pose);
 for(const camera of [{yaw:-25,elevation:40},{yaw:52,elevation:-20}]){
  const next={...pose,...reprojectDiagramSpatialPose(pose,camera,[previous,pose])};
  for(const key of ['vertices','faceTransforms','measuredAngles'] as const)assert.deepEqual(next.spatial![key],pose.spatial![key]);
  assert.deepEqual(next.sourceDoc,pose.sourceDoc);assert.deepEqual(next.view!.depth,pose.view!.depth);assert.ok(diagramDepthAvailable(next));
  assert.notDeepEqual(diagramIllustrationMesh(next).vertices,next.result.geometry.vertices);validateDiagramSpatialPose(next,true);
 }
 assert.deepEqual(pose,before);
});

test('hidden spatial paper stays hidden and cannot be selected in the separated display',()=>{
 const {pose}=fixture(),mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices,hidden=0;
 const a=mix(mesh.triangles[hidden][0].map(v=>shown[v]),[.6,.2,.2]),next={...pose,hiddenFaces:[hidden]};
 assert.deepEqual(diagramIllustrationMesh(next).vertices,mesh.vertices,'hiding paper cannot redefine the physical or cosmetic material coordinate frame');
 assert.ok(!diagramFoldFacesAtPoint(next,a).includes(hidden));assert.doesNotMatch(diagramModelMarkup(next),/data-diagram-paper-face="0"/);
 assert.ok(diagramModelMarkup(next).includes('data-diagram-paper-face="1"'));
});

test('an exact edge-on spatial bank remains zero-area and unpickable while the other banks continue separating',()=>{
 const {pose}=fixture(-90,{yaw:0,elevation:35}),before=structuredClone(pose),edgeOn=pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[];
 assert.ok(edgeOn.length>0);assert.ok(diagramDepthAvailable(pose));
 const mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices;
 assert.notDeepEqual(mesh.vertices,pose.result.geometry.vertices,'one side-on bank must not zero the whole effect');
 for(const face of edgeOn){
  for(const v of new Set(mesh.triangles[face].flat()))close(mesh.vertices[v],pose.result.geometry.vertices[v]);
  assert.ok(Math.abs(polygonArea(mesh.rings[face][0].map(v=>mesh.vertices[v])))<1e-8);
  const point=mix(mesh.triangles[face][0].map(v=>shown[v]),[.6,.2,.2]);assert.ok(!diagramFoldFacesAtPoint(pose,point).includes(face));
  assert.throws(()=>pickDiagramFoldAnchor(pose,point,face),/内部|对应|侧立|明确选择/);
 }
 assert.deepEqual(pose,before);
});

test('missing or cyclic global order never becomes a fabricated spatial display rank',()=>{
 const {pose}=fixture();
 for(const cyclic of [false,true]){
  const unordered=structuredClone(pose);delete unordered.result.layers.faceOrder;
  // A drawing fallback is not a layer certificate. Imported cyclic pair rows
  // likewise cannot authorize cosmetic ranks or silently become faceOrder.
  unordered.displayOrder=[2,1,0];
  if(cyclic)unordered.result.layers.faceOrders=[[0,1,1],[1,2,1],[2,0,1]];
  const before=structuredClone(unordered);assert.equal(diagramDepthAvailable(unordered),false);assert.equal(diagramDepthActive(unordered),false);
  assert.deepEqual(diagramIllustrationMesh(unordered).vertices,unordered.result.geometry.vertices);assert.deepEqual(unordered,before);
 }
});

const edgeLines=(markup:string)=>[...markup.matchAll(/<line data-diagram-spatial-edge="true"[^>]+>/g)].map(([line])=>{
 const read=(name:string)=>Number(line.match(new RegExp(`${name}="([^"]+)"`))![1]);
 return {a:[read('x1'),read('y1')] as Point,b:[read('x2'),read('y2')] as Point};
});

// A real connected seven-bank sheet, rather than the deliberately synthetic
// coveredEdgePose renderer fixture. The elevated narrow cover crosses an
// upright bank, which is invisible to positive-area global overlap ranking.
function coveredSpatialPose():DiagramPose {
 const segments:Segment[]=[],boundary:Point[]=[[0,0],[90,0],[90,30],[390,30],[390,60],[90,60],[90,90],[0,90]];
 boundary.forEach((a,i)=>segments.push({id:'cover-boundary-'+i,a,b:boundary[(i+1)%boundary.length],assignment:'B',angle:0}));
 for(const [x,y0,y1,angle] of [[30,0,90,180],[60,0,90,-90],[90,30,60,90],[150,30,60,-90],[180,30,60,90],[240,30,60,-180]])segments.push({id:'cover-fold-'+x,a:[x,y0],b:[x,y1],assignment:angle<0?'M':'V',angle});
 const doc:Doc={schemaVersion:2,name:'真实侧立纸面与局部覆盖',paper:{width:390,height:90},segments};
 return {sourceStateId:'cover-cp',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:0,elevation:0}),view:{...defaultModelView(),depth:{amount:.08,direction:90}}};
}

test('separated spatial covers clip the fixed side-on silhouette at the displayed coverage, including back and hidden views',()=>{
 const pose=coveredSpatialPose(),before=structuredClone(pose);validateDiagramSpatialPose(pose,true);assert.ok(diagramDepthActive(pose));
 const mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices,sideFace=(pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[])[0];
 assert.equal(sideFace,2);const sideX=shown[mesh.rings[sideFace][0][0]][0],coverFace=6,cover=mesh.rings[coverFace][0].map(v=>shown[v]),cuts:number[]=[];
 for(let i=0;i<cover.length;i++){const a=cover[i],b=cover[(i+1)%cover.length];if((a[0]-sideX)*(b[0]-sideX)<0)cuts.push(a[1]+(b[1]-a[1])*(sideX-a[0])/(b[0]-a[0]));}
 assert.equal(cuts.length,2);const lo=Math.min(...cuts),hi=Math.max(...cuts);assert.ok(lo>31&&hi>61,'the cover moved away from its original 30..60 interval');
 const sideSpans=(markup:string,x=sideX)=>edgeLines(markup).filter(line=>Math.abs(line.a[0]-x)<1e-6&&Math.abs(line.b[0]-x)<1e-6).map(line=>[Math.min(line.a[1],line.b[1]),Math.max(line.a[1],line.b[1])]);
 const markup=diagramSpatialEdgeMarkup(pose,pose.view!,'#123456'),front=sideSpans(markup);
 assert.ok(front.length);assert.ok(front.every(([a,b])=>b<=lo+1e-6||a>=hi-1e-6),'the display cover must hide the entire shifted middle interval');
 assert.ok(front.some(([,b])=>Math.abs(b-lo)<1e-6));assert.ok(front.some(([a])=>Math.abs(a-hi)<1e-6));
 const hidden=sideSpans(diagramSpatialEdgeMarkup({...pose,hiddenFaces:[3,4,5,6]},pose.view!,'#123456'));
 assert.ok(hidden.some(([a,b])=>a<lo&&b>hi),'hiding the actual covers reveals the middle');
 const backView={...pose.view!,side:'back' as const},backX=diagramPresentation(pose,backView).vertices[mesh.rings[sideFace][0][0]][0];
 const back=sideSpans(diagramSpatialEdgeMarkup(pose,backView,'#123456'),backX);
 assert.ok(back.some(([a,b])=>a<lo&&b>hi),'the same elevated cover is behind the side-on bank when viewed from the back');
 assert.deepEqual(edgeLines(diagramModelMarkup(pose)),edgeLines(markup));assert.deepEqual(pose,before);
});

test('subdivided folded spatial edges follow display vertices without leaving ink at the old projection',()=>{
 const doc=document();doc.segments.push({id:'existing-horizontal-mark',a:[0,45],b:[90,45],assignment:'F',angle:0});
 const pose:DiagramPose={sourceStateId:'ink-cp',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:23,elevation:35}),view:{...defaultModelView(),depth:{amount:.08,direction:135}}};
 validateDiagramSpatialPose(pose,true);assert.ok(diagramDepthActive(pose));const before=structuredClone(pose),mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices;
 const graph=pose.result.geometry.graph!,folded=graph.edges_vertices.filter((_,e)=>['M','V'].includes(graph.edges_assignment[e])&&Math.abs(pose.spatial!.measuredAngles[e]??0)>1e-5);
 assert.ok(folded.length>2,'the original creases contain actual CP intersections, not just one unsplit edge each');
 const pointOn=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),along=(p[0]-a[0])*dx+(p[1]-a[1])*dy;return length>1e-8&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)<1e-6*length&&along>=-1e-6&&along<=length*length+1e-6;};
 const lines=edgeLines(diagramSpatialEdgeMarkup(pose,pose.view!,'#123456'));assert.ok(lines.length);
 for(const line of lines)assert.ok(folded.some(([a,b])=>pointOn(line.a,shown[a],shown[b])&&pointOn(line.b,shown[a],shown[b])),'every visible ink fragment lies on its current display material edge');
 assert.ok(folded.some(([a,b])=>distance(mesh.vertices[a],pose.result.geometry.vertices[a])>1e-4||distance(mesh.vertices[b],pose.result.geometry.vertices[b])>1e-4));
 const oldShown=diagramPresentation({...pose,view:{...pose.view!,depth:{amount:0,direction:135}}}).vertices;
 assert.ok(lines.some(line=>!folded.some(([a,b])=>pointOn(line.a,oldShown[a],oldShown[b])&&pointOn(line.b,oldShown[a],oldShown[b]))),'the regression must exercise a visibly moved crease');
 assert.deepEqual(pose,before);
});
