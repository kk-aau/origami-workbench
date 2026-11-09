import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramCallout} from '../../src/app/diagramCallouts';
import {
 createDiagramProject,appendDiagramStep,adoptDiagramPose,selectDiagramStep,updateDiagramStep,
 updateDiagramCanvas,updateDiagramFoldLink,updateDiagramCP,updateDiagramImages,updateDiagramCallouts,
 updateDiagramAnnotations,updateDiagramPoseView,resyncDiagramStepViews,validateDiagramProject,
 type DiagramProject,
} from '../../src/app/diagramProject';

function freeze<T>(value:T):T{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const entry of Object.values(value))freeze(entry);}
 return value;
}
function fixture(count=3){
 let serial=0;const ids=()=>`shared-${++serial}`,doc=blankDoc('结构共享',100,100),result=computeFlatFold(doc);
 let project=createDiagramProject(doc,ids);
 for(let i=0;i<count;i++){
  if(i)project=appendDiagramStep(project,ids);
  const step=project.steps[i];project=adoptDiagramPose(project,step.id,step.beforeId,result);
 }
 return project;
}
const line:DiagramLineAnnotation={id:'line',kind:'line',a:[10,20],b:[70,80],style:'crease',color:'#123456',width:.7};
const turn:DiagramSymbolAnnotation={id:'turn',kind:'symbol',symbol:'rotate',position:[10,10],size:20,rotation:0,turnAngle:90,color:'#123456',width:.7};

test('navigation and local metadata edits retain unchanged immutable snapshots',()=>{
 const project=freeze(fixture()),before=JSON.stringify(project),id=project.steps[0].id;
 const selected=selectDiagramStep(project,id);
 assert.equal(selected.steps,project.steps);assert.equal(selected.states,project.states);
 assert.equal(selectDiagramStep(selected,id),selected);
 const variants=[
  updateDiagramStep(project,id,{title:'改标题'}),
  updateDiagramCanvas(project,id,{...project.steps[0].canvas!,gridSpacing:12}),
  updateDiagramFoldLink(project,id,{...project.steps[0].foldLink!,enabled:true}),
  updateDiagramImages(project,id,[],false),
  updateDiagramCallouts(project,id,[]),
 ];
 for(const next of variants){
  assert.notEqual(next.steps[0],project.steps[0]);assert.equal(next.steps[0].pose,project.steps[0].pose);
  assert.equal(next.steps[1],project.steps[1]);assert.equal(next.states,project.states);validateDiagramProject(next);
 }
 assert.equal(JSON.stringify(project),before);
});

test('new CP, canvas and callout values stay detached while unrelated history is shared',()=>{
 const project=freeze(fixture()),id=project.steps[0].id,state=project.states[1],doc=structuredClone(state.doc);
 const next=updateDiagramCP(project,state.id,doc);doc.name='external mutation';doc.segments[0].a[0]=42;
 assert.equal(next.steps,project.steps);assert.equal(next.states[0],project.states[0]);assert.notEqual(next.states[1],state);
 assert.equal(next.states[1].revision,state.revision+1);assert.equal(next.states[1].doc.name,state.doc.name);
 assert.deepEqual(next.states[1].doc.segments,state.doc.segments);
 const canvas={...project.steps[0].canvas!,constructionPoints:[[15,20] as [number,number]]},withCanvas=updateDiagramCanvas(project,id,canvas);
 canvas.constructionPoints[0][0]=99;assert.equal(withCanvas.steps[0].canvas!.constructionPoints![0][0],15);
 const callouts:DiagramCallout[]=[{id:'detail',source:{kind:'cp',stateId:project.steps[0].beforeId,center:[20,20],radius:10},target:{center:[140,20],radius:20}}];
 const withCallout=updateDiagramCallouts(project,id,callouts);callouts[0].target.center[0]=999;
 assert.equal(withCallout.steps[0].callouts![0].target.center[0],140);
});

test('an ordinary drawing edit leaves every unrelated step and saved geometry reusable',()=>{
 const project=freeze(fixture()),before=JSON.stringify(project),annotations=[structuredClone(line)];
 const next=updateDiagramAnnotations(project,project.steps[0].id,annotations);annotations[0].a[0]=999;
 assert.equal(next.states,project.states);assert.equal(next.steps[0].pose,project.steps[0].pose);
 assert.equal(next.steps[1],project.steps[1]);assert.equal(next.steps[2],project.steps[2]);
 assert.equal((next.steps[0].annotations![0] as DiagramLineAnnotation).a[0],10);
 assert.equal(JSON.stringify(project),before);validateDiagramProject(next);
});

test('orientation inheritance copies only affected poses and does not modify a historical paper-state snapshot',()=>{
 let project=fixture(4);project=updateDiagramPoseView(project,project.steps[2].id,{...defaultModelView(),rotation:17});
 project.steps[1].paperStates={active:'flat',flat:structuredClone(project.steps[1].pose!)};
 freeze(project);const before=JSON.stringify(project),next=updateDiagramAnnotations(project,project.steps[0].id,[turn]);
 assert.equal(next.steps[0].pose,project.steps[0].pose);assert.notEqual(next.steps[1],project.steps[1]);
 assert.equal(next.steps[1].pose!.view!.rotation,90);
 assert.equal(next.steps[1].pose!.result,project.steps[1].pose!.result,'orientation does not copy material geometry');
 assert.equal(next.steps[2],project.steps[2],'manual orientation stops propagation');assert.equal(next.steps[3],project.steps[3]);
 assert.notEqual(next.steps[1].paperStates!.flat,next.steps[1].pose,'active paper-state snapshot stays independent');
 assert.deepEqual(next.steps[1].paperStates!.flat,next.steps[1].pose);
 assert.equal(JSON.stringify(project),before);validateDiagramProject(next);
 const synced=resyncDiagramStepViews(freeze(next));
 assert.ok(synced.steps.every((step,index)=>step===next.steps[index]),'stable synchronization does not invalidate previews');
});

test('shared history still runs validation and rejects malformed input without changing valid neighbors',()=>{
 const project=fixture(),id=project.steps[0].id;project.states.at(-1)!.doc.paper.width=NaN;
 assert.throws(()=>selectDiagramStep(project,id));
 assert.throws(()=>updateDiagramStep(project,id,{title:'不能跳过校验'}));
 assert.throws(()=>updateDiagramAnnotations(project,id,[line]));
});
