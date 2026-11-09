import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,exportDiagramProject,importDiagramProject,updateDiagramAnnotations,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {validateDiagramAnnotations,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {cleanDiagramAnimationTimings,diagramAnimationLineWindows,setDiagramLineAnimationTiming} from '../../src/app/diagramAnimationTiming';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {simulationStepMotionAngles,createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {copyDiagramAnnotations,mirrorCopyDiagramAnnotations} from '../../src/app/diagramDrawingTools';

const line=(id:string,x:number):DiagramLineAnnotation=>({id,kind:'line',a:[x,0],b:[x,100],style:'valley',color:'#293d35',width:.7});
const lines=()=>[line('A',30),line('B',70),line('C',90)];

test('80% dependency keeps action duration and supports chained dependencies',()=>{
  let annotations=setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'A',startAfter:.8});
  annotations=setDiagramLineAnimationTiming(annotations,['C'],{afterLineId:'B',startAfter:.5});
  const windows=diagramAnimationLineWindows(annotations);
  assert.deepEqual(windows.get('A'),{start:0,end:1});
  assert.deepEqual(windows.get('B'),{start:.8,end:1.8});
  assert.deepEqual(windows.get('C'),{start:1.3,end:2.3});
});

test('self, circular, missing and nonfinite timing inputs fail with actionable messages',()=>{
  assert.throws(()=>setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'B',startAfter:.8}),/另一条/);
  const annotations=setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'A',startAfter:.8});
  assert.throws(()=>setDiagramLineAnimationTiming(annotations,['A'],{afterLineId:'B',startAfter:.8}),/循环/);
  assert.throws(()=>setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'missing',startAfter:.8}),/参考折痕/);
  for(const startAfter of [NaN,Infinity,-.1,1.01])assert.throws(()=>setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'A',startAfter}),/比例/);
  assert.throws(()=>validateDiagramAnnotations([{...line('B',70),animationTiming:{afterLineId:'A',startAfter:.8,extra:true}}]),/启动条件/);
});

test('removing or suspending a reference clears dependants without changing geometry',()=>{
  const annotations=setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'A',startAfter:.8});
  const deleted=cleanDiagramAnimationTimings(annotations.filter(a=>a.id!=='A'));
  assert.equal((deleted[0] as DiagramLineAnnotation).animationTiming,undefined);
  assert.deepEqual((deleted[0] as DiagramLineAnnotation).a,[70,0]);
  const paused=cleanDiagramAnimationTimings(annotations.map(a=>a.id==='A'?{...a,foldFaces:[]}:a));
  assert.equal((paused[1] as DiagramLineAnnotation).animationTiming,undefined);
});

for(const mirror of [false,true])test(`${mirror?'mirror copies':'copies'} remap references within the copied group`,()=>{
  const annotations=setDiagramLineAnimationTiming(lines(),['B'],{afterLineId:'A',startAfter:.8});
  const result=mirror?mirrorCopyDiagramAnnotations(annotations,['A','B'],[50,0],[50,100]):copyDiagramAnnotations(annotations,['A','B'],[5,0]);
  const [a,b]=result.ids.map(id=>result.annotations.find(a=>a.id===id) as DiagramLineAnnotation);
  assert.equal(b.animationTiming?.afterLineId,a.id);assert.equal(b.animationTiming?.startAfter,.8);
  assert.equal((result.annotations[1] as DiagramLineAnnotation).animationTiming?.afterLineId,'A');
});

function fixture(){
  const doc=blankDoc('折痕启动时序',100,100);let n=0,project=createDiagramProject(doc,()=>`timing-${++n}`);
  const step=project.steps[0],result=computeFlatGeometry(buildDiagramFold(doc).graph,1e-6);
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  const annotations=setDiagramLineAnimationTiming(lines().slice(0,2),['B'],{afterLineId:'A',startAfter:.8});
  const fixed=pickDiagramFoldAnchor(project.steps[0].pose!,[10,10],0);
  project=reconcileDiagramFoldAnnotations(project,step.id,annotations,{enabled:true,layers:'all',selectedFaces:[],fixed});
  return {project,stepId:step.id};
}

test('saved engineering data preserves timing while CP and pose remain unchanged',()=>{
  const {project,stepId}=fixture(),original=structuredClone(project);
  const next=updateDiagramAnnotations(project,stepId,setDiagramLineAnimationTiming(project.steps[0].annotations!,['B'],{afterLineId:'A',startAfter:1}));
  assert.deepEqual(next.states,original.states);assert.deepEqual(next.steps[0].pose,original.steps[0].pose);
  const restored=importDiagramProject(exportDiagramProject(next));
  assert.deepEqual((restored.steps[0].annotations![1] as DiagramLineAnnotation).animationTiming,{afterLineId:'A',startAfter:1});
});

test('a production clip maps delayed strokes to every actual material hinge and plays overlapping folds',()=>{
  const {project,stepId}=fixture(),saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId);
  assert.ok(clip.animation.timings?.length);assert.deepEqual(project,saved);
  const {prepared}=prepareSimulationDocument(clip.fold),planned=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'},undefined,{initialGeometry:clip.initialGeometry});
  assert.equal(planned.method,'scheduled');
  const a=clip.animation.timings!.filter(t=>t.start===0),b=clip.animation.timings!.filter(t=>t.start>0);
  assert.ok(a.length&&b.length);
  const threshold=b[0].start,angles=simulationStepMotionAngles(planned.animation.motion!,threshold);
  for(const timing of a){const i=prepared.creaseParams.findIndex(c=>c.edge===timing.edge);assert.ok(Math.abs(angles[i]-144)<1e-6);}
  for(const timing of b){const i=prepared.creaseParams.findIndex(c=>c.edge===timing.edge);assert.equal(angles[i],0);}
  const path=createSimulationStepPathEvaluator(prepared,planned.animation,planned.animation.motion!);
  for(const p of [0,threshold-.0001,threshold,threshold+.0001,.8,1])assert.ok(Array.from(path.evaluate(p)).every(Number.isFinite));
});

test('CP handle refresh preserves timing and rewrites its reference to the rebuilt handle',()=>{
  const {project,stepId}=fixture(),refreshed=refreshDiagramFoldDrawing(project,stepId),annotations=refreshed.steps[0].annotations!;
  const dependent=annotations.find(a=>a.kind==='line'&&a.animationTiming) as DiagramLineAnnotation;
  assert.ok(dependent);assert.equal(dependent.animationTiming!.startAfter,.8);
  assert.ok(annotations.some(a=>a.id===dependent.animationTiming!.afterLineId));
  assert.doesNotThrow(()=>diagramAnimationLineWindows(annotations));
  assert.ok(buildDiagramStepAnimation(refreshed,stepId).animation.timings?.some(t=>t.start>0));
});

test('a timing reference to a stationary drawn axis does not silently animate a different crease',()=>{
  let {project,stepId}=fixture();
  project=updateDiagramFoldLink(project,stepId,{...project.steps[0].foldLink!,enabled:false});
  const annotations=[...project.steps[0].annotations!,line('stationary',50)];
  project=updateDiagramAnnotations(project,stepId,setDiagramLineAnimationTiming(annotations,['B'],{afterLineId:'stationary',startAfter:.8}));
  assert.throws(()=>buildDiagramStepAnimation(project,stepId),/没有可驱动/);
});
