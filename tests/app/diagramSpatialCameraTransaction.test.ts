import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {buildDiagramFold} from '../../src/core/geometry';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,adoptDiagramPose,updateDiagramCP,updateDiagramAnnotations,updateDiagramFoldLink,exportDiagramProject,importDiagramProject,type DiagramPose,type DiagramProject} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {createDiagramSpatialPose,reprojectDiagramSpatialPose,spatialFaceMatrix} from '../../src/app/diagramSpatialPose';
import {applyDiagramSpatialCamera} from '../../src/app/diagramSpatialCameraTransaction';
import {applyDiagramFoldMatrix} from '../../src/app/diagramFoldLink';
import {modelProjection} from '../../src/app/modelProjection';
import {validateDiagramAnnotations,type DiagramLineAnnotation,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {bindDiagramArrow,fitDiagramArrow,resolveDiagramArrowBinding} from '../../src/app/diagramPaperBinding';
import {symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';

const camera={yaw:25,elevation:30};
const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5,`${a} != ${b}`);
function shown(pose:DiagramPose,face:number,p:Point):Point{return modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0).project(applyDiagramFoldMatrix(spatialFaceMatrix(pose.spatial!,face),p));}
const ink=(p:DiagramProject,id:string)=>p.steps[0].annotations!.find(a=>a.id===id) as DiagramLineAnnotation;
function fixture(linked=true){
  const doc=blankDoc('camera transaction',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:90});
  let sequence=0,project=createDiagramProject(doc,()=>`orbit-${++sequence}`);const id=project.activeStepId,created=createDiagramSpatialPose(doc,0,undefined,undefined,camera);
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,created.result,{...defaultModelView(),rotation:17,cameras:{'front-solid':{rotation:17,x:1,y:2,width:40,height:40}}},created.spatial);
  const pose=project.steps[0].pose!,graph=buildDiagramFold(doc).graph,face=graph.faces_vertices!.findIndex(row=>row.some(v=>graph.vertices_coords[v][0]>75));
  assert.ok(face>=0);
  const after=structuredClone(project.states[1].doc);after.segments.push({id:'pending-a',a:[50,30],b:[100,30],assignment:'V',angle:90},{id:'pending-b',a:[50,60],b:[100,60],assignment:'M',angle:-45});
  project=updateDiagramCP(project,project.steps[0].afterId,after);
  const det=(m:number[])=>m[0]*m[3]-m[1]*m[2],positive=det(spatialFaceMatrix(pose.spatial!,face))>0;
  const line=(lineId:string,a:Point,b:Point,style:'valley'|'mountain'):DiagramLineAnnotation=>({id:lineId,kind:'line',a:shown(pose,face,a),b:shown(pose,face,b),style:positive?style:style==='valley'?'mountain':'valley',color:'#cb4391',width:1.7,strokePattern:'dotted',appearanceOverrides:['color','width','strokePattern'],foldFaces:[face],foldAngle:90});
  const a=line('cp-link:custom-a',[50,30],[100,30],'valley'),b={...line('cp-link:custom-b',[50,60],[100,60],'mountain'),animationTiming:{afterLineId:a.id,startAfter:.4}};
  const free:DiagramSymbolAnnotation={id:'free',kind:'symbol',symbol:'fold',position:[-10,-10],size:20,rotation:0,color:'#123456',width:1};
  const fixedFace=face===0?1:0,bound=bindDiagramArrow(pose,fitDiagramArrow({...free,id:'bound'},shown(pose,fixedFace,[20,20]),shown(pose,fixedFace,[35,30])),fixedFace);
  project=updateDiagramAnnotations(project,id,[a,b,free,bound]);
  if(linked)project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[],fixed:{point:[20,20],matrix:[1,0,0,1,0,0],spatialTransform:structuredClone(pose.spatial!.faceTransforms[fixedFace])}});
  project.steps[0].paperStates={active:'spatial',spatial:structuredClone(project.steps[0].pose!),spatialAnnotations:structuredClone(project.steps[0].annotations!)};
  return {project,id,face};
}
function turn(project:DiagramProject,id:string,view:{yaw:number;elevation:number}){return applyDiagramSpatialCamera(project,id,reprojectDiagramSpatialPose(project.steps[0].pose!,view));}

test('camera transaction keeps CP, fixed material, authored paint/timing and independently placed artwork intact',()=>{
  const {project,id,face}=fixture(),original=structuredClone(project),next=turn(project,id,{yaw:-65,elevation:25});
  assert.deepEqual(project,original);assert.deepEqual(next.states,project.states);assert.deepEqual(next.steps[0].foldLink,project.steps[0].foldLink);
  for(const key of ['vertices','faceTransforms','measuredAngles'] as const)assert.deepEqual(next.steps[0].pose!.spatial![key],project.steps[0].pose!.spatial![key]);
  assert.deepEqual(next.steps[0].pose!.view,{...project.steps[0].pose!.view,cameras:{}});
  const before=ink(project,'cp-link:custom-b'),after=ink(next,before.id);for(const key of ['color','width','strokePattern','appearanceOverrides','animationTiming','foldAngle'] as const)assert.deepEqual(after[key],before[key]);
  close(after.a,shown(next.steps[0].pose!,face,[50,60]));close(after.b,shown(next.steps[0].pose!,face,[100,60]));
  assert.deepEqual(next.steps[0].annotations!.find(a=>a.id==='free'),project.steps[0].annotations!.find(a=>a.id==='free'));
  const bound=next.steps[0].annotations!.find(a=>a.id==='bound') as DiagramSymbolAnnotation,expected=resolveDiagramArrowBinding(next.steps[0].pose!,project.steps[0].annotations!.find(a=>a.id==='bound') as DiagramSymbolAnnotation).annotation;
  close(symbolNativeBaseline(bound)!.start,symbolNativeBaseline(expected)!.start);
});

test('a CP handle collapsed to a point returns with its original material span, paint and timing after saving',()=>{
  const {project,id}=fixture(),edge=turn(project,id,{yaw:0,elevation:0});
  assert.ok(ink(edge,'cp-link:custom-a').cameraSource);
  const saved=importDiagramProject(exportDiagramProject(edge)),returned=turn(saved,id,camera);
  for(const name of ['cp-link:custom-a','cp-link:custom-b']){const a=ink(project,name),b=ink(returned,name);close(a.a,b.a);close(a.b,b.b);assert.equal(b.color,a.color);assert.equal(b.strokePattern,a.strokePattern);assert.deepEqual(b.animationTiming,a.animationTiming);}
  assert.deepEqual(returned.states,project.states);
});

test('moving an authored handle invalidates the saved source instead of pulling the edit back',()=>{
  const {project,id,face}=fixture(false),first=turn(project,id,{yaw:-45,elevation:20}),pose=first.steps[0].pose!,a=ink(first,'cp-link:custom-a');
  const moved={...a,a:shown(pose,face,[50,35]),b:shown(pose,face,[100,35])};
  const edited=updateDiagramAnnotations(first,id,first.steps[0].annotations!.map(x=>x.id===a.id?moved:x)),next=turn(edited,id,camera),line=ink(next,a.id);
  close(line.a,shown(next.steps[0].pose!,face,[50,35]));close(line.b,shown(next.steps[0].pose!,face,[100,35]));
});

test('legacy side-on ink without metadata recovers from the matching CP span without a singular inverse',()=>{
  const fixtureData=fixture(false),{id,face}=fixtureData;let project=turn(fixtureData.project,id,{yaw:0,elevation:0});
  const doc=structuredClone(project.states[1].doc);doc.segments.push({id:'legacy-vertical',a:[75,0],b:[75,100],assignment:'V',angle:90});project=updateDiagramCP(project,project.steps[0].afterId,doc);
  const pose=project.steps[0].pose!,{cameraSource:_source,...basis}=ink(project,'cp-link:custom-a');
  const legacy={...basis,id:'cp-link:legacy',a:shown(pose,face,[75,0]),b:shown(pose,face,[75,100]),style:'valley' as const};
  project=updateDiagramAnnotations(project,id,[legacy]);
  const next=turn(project,id,camera),line=ink(next,legacy.id);close(line.a,shown(next.steps[0].pose!,face,[75,0]));close(line.b,shown(next.steps[0].pose!,face,[75,100]));
  assert.equal(line.color,legacy.color);assert.equal(line.strokePattern,legacy.strokePattern);assert.ok(line.cameraSource);
});

test('camera failure leaves source and linkage untouched; stale whole-face display order is cleared',()=>{
  const {project,id}=fixture(false),original=structuredClone(project),answer=reprojectDiagramSpatialPose(project.steps[0].pose!,{yaw:-30,elevation:20}),bad=structuredClone(answer);
  bad.spatial.vertices[0][0]+=.5;assert.throws(()=>applyDiagramSpatialCamera(project,id,bad),/真实折角/);assert.deepEqual(project,original);
  delete answer.result.layers.faceOrder;
  const next=applyDiagramSpatialCamera(project,id,answer);assert.equal(next.steps[0].pose!.displayOrder,undefined);
});

test('camera material metadata rejects nonfinite, empty, degenerate and unrecognized source spans',()=>{
  const {project,id}=fixture(false),line=ink(turn(project,id,{yaw:-30,elevation:25}),'cp-link:custom-a');
  validateDiagramAnnotations([line]);
  for(const patch of [{revision:-1},{spans:[]},{shownA:[NaN,0]},{extra:true},{spans:[{...line.cameraSource!.spans[0],a:[0,0],b:[0,0]}]},{spans:[{...line.cameraSource!.spans[0],assignment:'B'}]}])assert.throws(()=>validateDiagramAnnotations([{...line,cameraSource:{...line.cameraSource,...patch}}]),/视角材料/);
});
