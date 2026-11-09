import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance,pointOnSegment} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Doc,Point,Segment} from '../../src/core/types';
import {createDiagramProject,appendDiagramStep,adoptDiagramPose,updateDiagramCP,updateDiagramAnnotations,updateDiagramCanvas,updateDiagramFoldLink,updateDiagramPoseResult,updateDiagramPaperPose,selectDiagramStep,validateDiagramProject,exportDiagramProject,importDiagramProject,type DiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {advanceDiagramReturnStep,diagramReturnAggregationPose} from '../../src/app/diagramReturnStep';
import {createDiagramSpatialPose,validateDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {recordDiagramPaperPull,isDiagramPaperPulled,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {moveDiagramPaperVertices,diagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {pickDiagramFoldAnchor,projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {modelProjection} from '../../src/app/modelProjection';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramStepLayerPreferences} from '../../src/app/diagramStepInheritance';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {polygonArea} from '../../src/core/geometry';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';

const mark=(id:string,y=40):Segment=>({id,a:[0,y],b:[100,y],assignment:'M',angle:-180});
function fixture(angle=180){
  const doc:Doc={...blankDoc('返回聚合',100,100),segments:[...blankDoc('返回聚合',100,100).segments,{id:'original-fold',a:[50,0],b:[50,100],assignment:'V',angle}]};
  let sequence=0;const factory=()=>`return-test-${++sequence}`;
  let project=createDiagramProject(doc,factory);const target=project.steps[0];
  const view={...defaultModelView(),side:'back' as const,rotation:90};
  if(angle===180)project=adoptDiagramPose(project,target.id,target.beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}),view);
  else {const built=createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:17,elevation:24});project=adoptDiagramPose(project,target.id,target.beforeId,built.result,view,built.spatial);}
  project=updateDiagramCanvas(project,target.id,{...project.steps[0].canvas!,drawingRotation:35});
  project=updateDiagramAnnotations(project,target.id,[{id:'target-symbol',kind:'symbol',symbol:'fold',position:[10,10],size:20,rotation:0,color:'#111111',width:1}]);
  project=appendDiagramStep(project,factory);const current=project.steps[1];
  project=updateDiagramCP(project,current.afterId,{...doc,segments:[...doc.segments,mark('new-fold')]});
  const instruction:DiagramSymbolAnnotation={id:'return-symbol',kind:'symbol',symbol:'return',returnStepId:target.id,position:[20,20],size:30,rotation:0,color:'#111111',width:1};
  project=updateDiagramAnnotations(project,current.id,[instruction]);
  return {project,targetId:target.id,currentId:current.id,factory};
}
function assertMaterialPositions(before:DiagramPose,after:DiagramPose){
  const a=buildDiagramFold(before.sourceDoc).graph,b=buildDiagramFold(after.sourceDoc).graph;
  a.vertices_coords.forEach((point,index)=>{
    const target=b.vertices_coords.findIndex(p=>distance(p,point)<1e-7);assert.ok(target>=0);
    assert.ok(distance(before.result.geometry.vertices[index],after.result.geometry.vertices[target])<1e-6);
  });
}
function physicalAt(doc:Doc,point:Point){return doc.segments.filter(s=>s.assignment!=='A'&&pointOnSegment(point,s,1e-7));}

test('return adopts the target canvas aggregation, retains new creases as F, and binds exact current CP provenance',()=>{
  const {project,targetId,currentId,factory}=fixture(),before=structuredClone(project),target=project.steps[0].pose!;
  const result=advanceDiagramReturnStep(project,factory),step=result.steps.at(-1)!,source=result.states.find(s=>s.id===step.beforeId)!;
  assert.equal(result.steps.length,3);assert.equal(result.states.length,4);assert.equal(step.beforeId,project.steps[1].afterId);
  assert.deepEqual(step.pose!.sourceDoc,source.doc);assert.equal(step.pose!.sourceRevision,source.revision);assert.equal(step.pose!.sourceStateId,source.id);
  assert.ok(physicalAt(source.doc,[20,40]).every(s=>s.assignment==='F'&&s.angle===0));
  assert.ok(physicalAt(source.doc,[50,20]).every(s=>s.assignment==='V'&&s.angle===180));
  assertMaterialPositions(target,step.pose!);assert.deepEqual(step.pose!.view,target.view);assert.equal(step.canvas!.drawingRotation,35);
  assert.equal(step.paperStates!.active,'flat');assert.deepEqual(step.paperStates!.flat,step.pose);assert.equal(step.paperStates!.pulled,undefined);
  assert.ok(step.annotations!.some(a=>a.kind==='line'&&a.id.startsWith('cp-existing:')));assert.ok(step.annotations!.every(a=>a.kind!=='symbol'));
  assert.equal(result.steps.find(s=>s.id===currentId)!.annotations![0].kind,'symbol');assert.equal(result.steps.find(s=>s.id===targetId)!.annotations![0].id,'target-symbol');
  assert.doesNotThrow(()=>projectDiagramFoldCP(step.pose!,source.doc,result.states.at(-1)!.doc,source));
  assert.doesNotThrow(()=>validateDiagramProject(result));assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(result)));assert.deepEqual(project,before);
});

test('marks created in intermediate boundaries survive even when a later boundary no longer contains them',()=>{
  const f=fixture();let project=f.project;const targetAfter=project.steps[0].afterId,state=project.states.find(s=>s.id===targetAfter)!;
  project=updateDiagramCP(project,targetAfter,{...state.doc,segments:[...state.doc.segments,mark('earlier-mark',70)]});
  const result=advanceDiagramReturnStep(project,f.factory),doc=result.steps.at(-1)!.pose!.sourceDoc;
  assert.ok(physicalAt(doc,[20,70]).some(s=>s.assignment==='F'&&s.angle===0));assert.ok(physicalAt(doc,[20,40]).some(s=>s.assignment==='F'&&s.angle===0));
});

test('the displayed target pose is authoritative, not its operation-after CP',()=>{
  const f=fixture();let project=f.project;const target=project.steps[0],after=project.states.find(s=>s.id===target.afterId)!;
  project=updateDiagramCP(project,after.id,{...after.doc,segments:[...after.doc.segments,mark('target-action',65)]});
  const returned=advanceDiagramReturnStep(project,f.factory).steps.at(-1)!.pose!;
  assertMaterialPositions(target.pose!,returned);assert.ok(physicalAt(returned.sourceDoc,[20,65]).every(s=>s.assignment==='F'));
});

test('return retains mapped fixed paper and permits continuing linked crease editing',()=>{
  const f=fixture(),target=f.project.steps[0],pose=target.pose!,face=pose.result.geometry.faces[0],center:Point=[0,0];
  for(const id of face){center[0]+=pose.result.geometry.vertices[id][0]/face.length;center[1]+=pose.result.geometry.vertices[id][1]/face.length;}
  const projection=modelProjection(pose.result.geometry.vertices,true,90),anchor=pickDiagramFoldAnchor(pose,projection.project(center),0);
  const project=updateDiagramFoldLink(f.project,target.id,{enabled:true,layers:'all',selectedFaces:[],fixed:{...anchor,target:{stateId:target.afterId,kind:'face',point:anchor.point}}});
  const result=advanceDiagramReturnStep(project,f.factory),step=result.steps.at(-1)!;
  assert.ok(step.foldLink?.fixed);assert.ok(step.foldLink!.fixed!.matrix.every((n,i)=>Math.abs(n-anchor.matrix[i])<1e-9));assert.equal(step.foldLink!.fixed!.target!.stateId,step.afterId);
  assert.equal(step.foldLink!.enabled,true);assert.equal(isDiagramPaperPulled(step),false);
});

test('return preserves physical spatial coordinates, camera, signed angles and regenerated spatial layer proof',()=>{
  const f=fixture(67),old=f.project.steps[0].pose!,result=advanceDiagramReturnStep(f.project,f.factory),step=result.steps.at(-1)!,pose=step.pose!;
  assert.equal(step.paperStates!.active,'spatial');assert.ok(pose.spatial);assert.deepEqual(pose.spatial!.camera,old.spatial!.camera);
  assertMaterialPositions(old,pose);assert.ok(physicalAt(pose.sourceDoc,[50,20]).every(s=>s.angle===67));
  assert.equal(pose.result.layers.status,'solved');assert.doesNotThrow(()=>validateDiagramSpatialPose(pose,true));assert.doesNotThrow(()=>validateDiagramProject(result));
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(result)));
});

test('a pulled target returns to its archived physical aggregation and cannot inject drawing-only deformation',()=>{
  const f=fixture(),target=f.project.steps[0],physical=target.pose!,vertices=physical.result.geometry.vertices;
  let project=updateDiagramPoseResult(f.project,target.id,moveFoldedVertices(physical.result,{group:[0],selected:[0]},[vertices[0][0]+15,vertices[0][1]-20]));
  project=recordDiagramPaperPull(project,target.id,physical,target.annotations);
  assert.equal(project.steps[0].paperStates?.active,'pulled');assert.deepEqual(diagramReturnAggregationPose(project.steps[0]),physical);
  const result=advanceDiagramReturnStep(project,f.factory),next=result.steps.at(-1)!;
  assertMaterialPositions(physical,next.pose!);assert.equal(next.paperStates!.active,'flat');assert.equal(isDiagramPaperPulled(next),false);
  const missing=structuredClone(project);delete missing.steps[0].paperStates;
  assert.equal(diagramReturnAggregationPose(missing.steps[0]),null);assert.throws(()=>advanceDiagramReturnStep(missing,f.factory),/缺少可信/);
});

test('repeating the same return navigates its existing result without revisions, extra steps or overwritten annotations',()=>{
  const f=fixture(),first=advanceDiagramReturnStep(f.project,f.factory),created=first.steps.at(-1)!;
  const decorated=updateDiagramAnnotations(first,created.id,[...created.annotations!,{id:'later-note',kind:'symbol',symbol:'hold',position:[1,1],size:20,rotation:0,color:'#111111',width:1}]);
  const back=selectDiagramStep(decorated,f.currentId),again=advanceDiagramReturnStep(back,f.factory);
  assert.equal(again.activeStepId,created.id);assert.equal(again.steps.length,3);assert.strictEqual(again.states,back.states);assert.deepEqual(again.steps.at(-1),decorated.steps.at(-1));
});

for(const angle of [180,67])test(`repeating a return restores the ${angle===180?'flat':'spatial'} display and preserves its pulled illustration, fixed face and editable notes`,()=>{
  const f=fixture(angle),target=f.project.steps[0],pose=target.pose!,face=pose.result.geometry.faces[0];
  const center:Point=[0,0];for(const id of face){center[0]+=pose.result.geometry.vertices[id][0]/face.length;center[1]+=pose.result.geometry.vertices[id][1]/face.length;}
  const anchor=pickDiagramFoldAnchor(pose,modelProjection(pose.result.geometry.vertices,true,90).project(center),0);
  const configured=updateDiagramFoldLink(f.project,target.id,{enabled:true,layers:'all',selectedFaces:[],fixed:{...anchor,target:{stateId:target.afterId,kind:'face',point:anchor.point}}});
  let first=advanceDiagramReturnStep(configured,f.factory),created=first.steps.at(-1)!;
  const note:DiagramSymbolAnnotation={id:'keep-note',kind:'symbol',symbol:'hold',position:[30,30],size:20,rotation:0,color:'#123456',width:.8};
  first=updateDiagramAnnotations(first,created.id,[...created.annotations!,note]);created=first.steps.at(-1)!;
  const physical=created.pose!,point=physical.result.geometry.vertices[0],moved=moveDiagramPaperVertices(physical,{group:[0],selected:[0]},[point[0]-15,point[1]-20]);
  let pulled=updateDiagramPaperPose(first,created.id,moved);
  pulled=updateDiagramAnnotations(pulled,created.id,followDiagramPaperAnnotations(physical,pulled.steps.at(-1)!.pose!,created.annotations!));
  pulled=recordDiagramPaperPull(refreshDiagramFoldDrawing(pulled,created.id),created.id,physical,created.annotations);
  const back=selectDiagramStep(pulled,f.currentId),original=structuredClone(back),savedPull=structuredClone(back.steps.at(-1)!.paperStates!.pulled),fixed=structuredClone(back.steps.at(-1)!.foldLink!.fixed);
  const again=advanceDiagramReturnStep(back,f.factory),restored=again.steps.at(-1)!;
  assert.equal(again.activeStepId,created.id);assert.equal(again.steps.length,3);assert.deepEqual(again.states,back.states);
  assert.equal(restored.paperStates!.active,angle===180?'flat':'spatial');assert.equal(isDiagramPaperPulled(restored),false);
  assertMaterialPositions(physical,restored.pose!);assert.deepEqual(restored.foldLink!.fixed,fixed);
  assert.deepEqual(restored.paperStates!.pulled,savedPull);assert.deepEqual(restored.annotations!.find(a=>a.id===note.id),note);
  assert.deepEqual(back,original,'one history commit retains the complete undo snapshot');
  const reopened=importDiagramProject(exportDiagramProject(again));assert.equal(reopened.steps.at(-1)!.paperStates!.active,angle===180?'flat':'spatial');
  assert.deepEqual(reopened.steps.at(-1)!.foldLink!.fixed,fixed);
  const repulled=switchDiagramPaperState(reopened,created.id,'pulled');
  assert.deepEqual(diagramPaperVertices(repulled.steps.at(-1)!.pose!),diagramPaperVertices(savedPull!));
  assert.deepEqual(repulled.steps.at(-1)!.annotations!.find(a=>a.id===note.id),note);
});

test('equal coordinates do not reuse an existing return when the target layer order, visibility or orientation changed',()=>{
  const f=fixture(),first=advanceDiagramReturnStep(f.project,f.factory),back=selectDiagramStep(first,f.currentId);
  const changes=[
    (project:DiagramProject)=>{project.steps[0].pose!.displayOrder=[...project.steps[0].pose!.displayOrder!].reverse();},
    (project:DiagramProject)=>{project.steps[0].pose!.view!.rotation=180;},
    (project:DiagramProject)=>{project.steps[0].canvas!.drawingRotation=70;},
    (project:DiagramProject)=>{project.steps[0].pose!.hiddenFaces=[0];},
  ];
  for(const change of changes){
    const project=structuredClone(back);change(project);const before=structuredClone(project);
    assert.throws(()=>advanceDiagramReturnStep(project,f.factory),/已有不同折图或绘制内容/);assert.deepEqual(project,before);
  }
});

test('an existing empty next step is initialized, while existing authored content is never overwritten',()=>{
  const f=fixture(),withEmpty=appendDiagramStep(f.project,f.factory),emptyId=withEmpty.activeStepId,back=selectDiagramStep(withEmpty,f.currentId);
  const result=advanceDiagramReturnStep(back,f.factory);assert.equal(result.steps.length,3);assert.equal(result.activeStepId,emptyId);assert.ok(result.steps.at(-1)!.pose);
  const content=updateDiagramAnnotations(back,emptyId,[{id:'authored',kind:'symbol',symbol:'hold',position:[1,1],size:20,rotation:0,color:'#111111',width:1}]),before=structuredClone(content);
  assert.throws(()=>advanceDiagramReturnStep(content,f.factory),/已有不同折图或绘制内容/);assert.deepEqual(content,before);
});

test('stale target sources and changed boundaries reject atomically',()=>{
  const f=fixture(),target=f.project.steps[0],source=f.project.states.find(s=>s.id===target.beforeId)!;
  const stale=updateDiagramCP(f.project,source.id,source.doc);assert.throws(()=>advanceDiagramReturnStep(stale,f.factory),/来源 CP 已变化/);
  const after=f.project.states.at(-1)!,changed=updateDiagramCP(f.project,after.id,{...after.doc,paper:{...after.doc.paper,width:120}}),before=structuredClone(changed);
  assert.throws(()=>advanceDiagramReturnStep(changed,f.factory),/尺寸或边界/);assert.deepEqual(changed,before);
});

test('unknown local order remains unknown, and obsolete solution indices are not reused for the rebased topology',()=>{
  const f=fixture(),project=structuredClone(f.project);project.steps[0].pose!.result.layers={status:'unknown',message:'待确认'};project.steps[0].pose!.layerSolutionIndex=5;
  const next=advanceDiagramReturnStep(project,f.factory).steps.at(-1)!.pose!;
  assert.equal(next.result.layers.status,'unknown');assert.equal(next.layerSolutionIndex,undefined);assert.equal(next.result.layers.solutionIndex,undefined);
});

test('local face relations survive material reindexing without manufacturing a global order',()=>{
  const f=fixture(),target=f.project.steps[0],source=f.project.states.find(s=>s.id===target.beforeId)!,reordered={...source.doc,segments:[source.doc.segments.at(-1)!,...source.doc.segments.slice(0,-1)]};
  let project=updateDiagramCP(f.project,source.id,reordered);
  project=adoptDiagramPose(project,target.id,source.id,computeFlatFold(reordered,undefined,{flatCreases:'marks'}));
  const reference=project.steps[0].pose!;delete reference.result.layers.faceOrder;delete reference.displayOrder;
  const result=advanceDiagramReturnStep(project,f.factory).steps.at(-1)!.pose!;
  assert.equal(result.result.layers.status,'solved');assert.equal(result.result.layers.faceOrder,undefined);assert.equal(result.displayOrder,undefined);
  const expected=diagramStepLayerPreferences(reference,result.sourceDoc,result.result).map(({below,above})=>[below,above].join(':')).sort();
  const normals=result.result.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>result.result.geometry.vertices[v]))));
  assert.ok(expected.length);assert.deepEqual(flatLayerEdges(result.result.layers.faceOrders!,normals).map(pair=>pair.join(':')).sort(),expected);
});
