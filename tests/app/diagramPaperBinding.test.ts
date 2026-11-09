import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {bindDiagramArrow,diagramArrowBindingFaces,editDiagramPaperBindings,fitDiagramArrow,resolveDiagramArrowBinding,resolveDiagramPaperBindings} from '../../src/app/diagramPaperBinding';
import {createDiagramProject,adoptDiagramPose,duplicateDiagramStep,updateDiagramAnnotations,updateDiagramPoseView,updateDiagramPaperPose,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {drawingSVG} from '../../src/app/diagramDrawing';
import {moveDiagramPaperVertices,prepareDiagramPaperAnchors} from '../../src/app/diagramPaperDeformation';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';

function poseOf():DiagramPose {const doc=blankDoc('箭头绑定',100,100);return {sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result:computeFlatFold(doc),view:defaultModelView()};}
function arrow(start:Point=[30,20],end:Point=[120,20],cad=false):DiagramSymbolAnnotation {
  return fitDiagramArrow({id:'arrow',kind:'symbol',symbol:'fold',position:[0,0],size:50,rotation:0,color:'#123456',width:1,...(cad?{cadProperties:{}}:{params:{curve:20}})},start,end);
}
const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6,`${a} != ${b}`);

test('tail binds to material while tip may extend outside, without modifying CP or glyph',()=>{
  const pose=poseOf(),a=arrow(),before=structuredClone({pose,a});assert.deepEqual(diagramArrowBindingFaces(pose,a),[0]);
  const bound=bindDiagramArrow(pose,a,0),resolved=resolveDiagramArrowBinding(pose,bound);assert.equal(resolved.issue,undefined);
  close(symbolNativeBaseline(resolved.annotation)!.start,[30,20]);close(symbolNativeBaseline(resolved.annotation)!.end,[120,20]);
  assert.deepEqual({pose,a},before);assert.deepEqual(bound.params,a.params);assert.throws(()=>bindDiagramArrow(pose,arrow([-10,20]),0),/箭尾不在/);
});

test('legacy and native CAD arrows follow both sides and rotation without accumulating drift',()=>{
  for(const cad of [false,true]){
    const pose=poseOf(),a=bindDiagramArrow(pose,arrow(undefined,undefined,cad),0),original=structuredClone(a);
    for(const side of ['front','back'] as const)for(const rotation of [0,30,90,225,360]){
      const next={...pose,view:{...pose.view!,side,rotation}},projection=modelProjection(pose.result.geometry.vertices,side==='back',rotation);
      let result=resolveDiagramArrowBinding(next,a);assert.equal(result.issue,undefined);close(symbolNativeBaseline(result.annotation)!.start,projection.project([30,20]));close(symbolNativeBaseline(result.annotation)!.end,projection.project([120,20]));
      assert.equal(!!result.annotation.mirrored,side==='back');
      for(let i=0;i<40;i++)result=resolveDiagramArrowBinding(next,result.annotation);
      close(symbolNativeBaseline(result.annotation)!.start,projection.project([30,20]));close(symbolNativeBaseline(result.annotation)!.end,projection.project([120,20]));
      close(symbolNativeBaseline(resolveDiagramArrowBinding(pose,result.annotation).annotation)!.start,[30,20]);
    }
    assert.deepEqual(a,original);
  }
});

test('attachment follows a newly inserted illustration node and survives round trip',()=>{
  const pose=poseOf(),bound=bindDiagramArrow(pose,arrow([30,20],[50,20]),0),prepared=prepareDiagramPaperAnchors(pose,[{point:[30,20],faces:[0]}]);
  const vertex=diagramIllustrationMesh(prepared).vertices.length-1,next=moveDiagramPaperVertices(prepared,{group:[vertex],selected:[vertex]},[35,28]);
  const result=resolveDiagramArrowBinding(next,bound);assert.equal(result.issue,undefined);close(symbolNativeBaseline(result.annotation)!.start,[35,28]);
  close(symbolNativeBaseline(resolveDiagramArrowBinding(pose,result.annotation).annotation)!.start,[30,20]);assert.deepEqual(next.sourceDoc,pose.sourceDoc);
});

test('style edits retain attachment, placement edits move it on the same face, outside drags reject',()=>{
  const pose=poseOf(),bound=bindDiagramArrow(pose,arrow(),0),rotated={...pose,view:{...pose.view!,rotation:90}},shown=resolveDiagramArrowBinding(rotated,bound).annotation;
  const styled=editDiagramPaperBindings(rotated,[bound],[{...shown,color:'#abcdef'}])[0] as DiagramSymbolAnnotation;assert.deepEqual(styled.paperBinding,bound.paperBinding);
  const moved={...shown,position:[shown.position[0]+2,shown.position[1]+3] as Point},updated=editDiagramPaperBindings(rotated,[bound],[moved])[0] as DiagramSymbolAnnotation;
  assert.notDeepEqual(updated.paperBinding!.root,bound.paperBinding!.root);close(symbolNativeBaseline(resolveDiagramArrowBinding(rotated,updated).annotation)!.start,symbolNativeBaseline(moved)!.start);
  assert.throws(()=>editDiagramPaperBindings(rotated,[bound],[{...shown,position:[-1000,-1000]}]),/箭尾不在/);
  const {paperBinding:_binding,...free}=shown;assert.deepEqual(editDiagramPaperBindings(rotated,[bound],[free]),[free]);
});

test('a stale indexed face never silently binds to a new face with the same count',()=>{
  const pose=poseOf(),bound=bindDiagramArrow(pose,arrow(),0),doc=blankDoc('变更纸面',120,100),next={...pose,sourceDoc:doc,result:computeFlatFold(doc)};
  const result=resolveDiagramArrowBinding(next,bound);assert.match(result.issue!,/原纸面已变化/);assert.strictEqual(result.annotation,bound);
  const noPose=resolveDiagramArrowBinding(null,bound);assert.match(noPose.issue!,/没有纸面/);
});

test('degenerate paper preserves artwork with a recoverable status',()=>{
  const pose=poseOf(),bound=bindDiagramArrow(pose,arrow(),0),next=structuredClone(pose);next.result.geometry.vertices=next.result.geometry.vertices.map(([x])=>[x,0]);
  const result=resolveDiagramArrowBinding(next,bound);assert.match(result.issue!,/侧立或退化/);assert.strictEqual(result.annotation,bound);
});

test('binding persists in strict project files and SVG uses the same resolved glyph as the canvas',()=>{
  const pose=poseOf();let p=createDiagramProject(pose.sourceDoc);const id=p.steps[0].id;
  p=adoptDiagramPose(p,id,p.states[0].id,pose.result);p=updateDiagramAnnotations(p,id,[bindDiagramArrow(p.steps[0].pose!,arrow(),0)]);
  p=updateDiagramPoseView(p,id,{...defaultModelView(),side:'back',rotation:45});
  const loaded=importDiagramProject(exportDiagramProject(p)),s=loaded.steps[0],a=resolveDiagramPaperBindings(s.pose,s.annotations!)[0] as DiagramSymbolAnnotation;
  assert.deepEqual(a.paperBinding,p.steps[0].annotations![0].kind==='symbol'?(p.steps[0].annotations![0] as DiagramSymbolAnnotation).paperBinding:undefined);
  const {paperBinding:_binding,...free}=a;
  assert.equal(drawingSVG(s.pose,s.annotations!,'',''),drawingSVG(s.pose,[free],'',''));
});

test('malformed imported bindings reject nonfinite coordinates, extra fields and invalid rings',()=>{
  const bound=bindDiagramArrow(poseOf(),arrow(),0);
  for(const patch of [{root:[NaN,0]},{tip:bound.paperBinding!.root},{handedness:0},{face:Number.MAX_SAFE_INTEGER+1},{material:[]},{material:[[[0,0,0]]]},{extra:true}])assert.throws(()=>validateDiagramAnnotations([{...bound,paperBinding:{...bound.paperBinding,...patch}}]),/纸面绑定/);
});

test('overlapping faces retain distinct material roots and visibility does not change an existing binding',()=>{
  const doc=blankDoc('重合纸面',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const pose={...poseOf(),sourceDoc:doc,result:computeFlatFold(doc)},mesh=diagramIllustrationMesh(pose);
  const points=mesh.vertices,minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const a=arrow([(minX+maxX)/2,25],[(minX+maxX)/2+10,35]),faces=diagramArrowBindingFaces(pose,a);assert.equal(faces.length,2);
  const bound=faces.map(face=>bindDiagramArrow(pose,a,face));assert.notDeepEqual(bound[0].paperBinding!.root,bound[1].paperBinding!.root);
  const hidden={...pose,hiddenFaces:[faces[0]]};assert.deepEqual(diagramArrowBindingFaces(hidden,a),[faces[1]]);
  const result=resolveDiagramArrowBinding(hidden,bound[0]);assert.equal(result.issue,undefined);assert.equal(result.annotation.paperBinding!.face,faces[0]);
});

test('copied steps preserve independent bindings and copied arrows acquire their new material root',()=>{
  const pose=poseOf();let project=createDiagramProject(pose.sourceDoc);const id=project.steps[0].id;
  project=adoptDiagramPose(project,id,project.states[0].id,pose.result);project=updateDiagramAnnotations(project,id,[bindDiagramArrow(project.steps[0].pose!,arrow(),0)]);
  const duplicate=duplicateDiagramStep(project,id),first=duplicate.steps[0].annotations![0] as DiagramSymbolAnnotation,second=duplicate.steps[1].annotations![0] as DiagramSymbolAnnotation;
  assert.deepEqual(first.paperBinding,second.paperBinding);assert.notStrictEqual(first.paperBinding,second.paperBinding);
  const copy={...first,id:'copy',position:[first.position[0]+10,first.position[1]+5] as Point};
  const changed=updateDiagramAnnotations(project,id,[first,copy]),saved=changed.steps[0].annotations![1] as DiagramSymbolAnnotation;
  assert.notDeepEqual(saved.paperBinding!.root,first.paperBinding!.root);close(symbolNativeBaseline(resolveDiagramArrowBinding(pose,saved).annotation)!.start,[40,25]);
});

test('the workspace pull transaction and flat/pulled switches preserve the material frame after a view change',()=>{
  const base=poseOf();let project=createDiagramProject(base.sourceDoc);const id=project.steps[0].id;
  project=adoptDiagramPose(project,id,project.states[0].id,base.result);project=updateDiagramAnnotations(project,id,[bindDiagramArrow(project.steps[0].pose!,arrow(),0)]);
  project=updateDiagramPoseView(project,id,{...defaultModelView(),side:'back',rotation:30});
  const original=project.steps[0],previous=original.pose!,vertex=diagramIllustrationMesh(previous).baseGraph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===0);
  const changed=moveDiagramPaperVertices(previous,{group:[vertex],selected:[vertex]},[125,-15]);
  const expected=resolveDiagramArrowBinding(changed,original.annotations![0] as DiagramSymbolAnnotation).annotation;
  let pulled=updateDiagramPaperPose(project,id,changed);
  pulled=updateDiagramAnnotations(pulled,id,followDiagramPaperAnnotations(previous,changed,original.annotations!));
  pulled=recordDiagramPaperPull(pulled,id,previous,original.annotations!);
  for(const state of ['flat','pulled'] as const){
    pulled=switchDiagramPaperState(pulled,id,state);const step=pulled.steps[0],saved=step.annotations![0] as DiagramSymbolAnnotation,resolved=resolveDiagramArrowBinding(step.pose,saved);
    assert.deepEqual(saved.paperBinding,(original.annotations![0] as DiagramSymbolAnnotation).paperBinding);
    close(symbolNativeBaseline(resolved.annotation)!.start,symbolNativeBaseline(state==='pulled'?expected:resolveDiagramArrowBinding(previous,original.annotations![0] as DiagramSymbolAnnotation).annotation)!.start);
  }
});
