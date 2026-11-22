import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {createDiagramLibrary} from '../../src/app/diagramLibrary';
import {diagramStepZoom,diagramStepZooms} from '../../src/app/diagramStepZoom';
import {
  adoptDiagramPose,appendDiagramStep,createDiagramProject,createDiagramProcessFigure,
  exportDiagramProject,importDiagramProject,insertDiagramStepBefore,removeDiagramProcessFigure,
  updateDiagramCP,upsertDiagramProcessFigure,validateDiagramProject,
} from '../../src/app/diagramProject';

function fixture(){
  let id=0;const factory=()=>`insert-${++id}`;
  let project=createDiagramProject(blankDoc('方块',100,100),factory);
  project=appendDiagramStep(appendDiagramStep(project,factory),factory);
  for(const [i,step] of project.steps.entries()){step.title=`原步骤 ${i+1}`;step.description=`原说明 ${i+1}`;}
  return {project,factory};
}

for(const index of [0,1,2])test(`insert before position ${index+1} without moving the downstream CP boundary`,()=>{
  const {project,factory}=fixture(),target=project.steps[index],input=JSON.stringify(project);
  const next=insertDiagramStepBefore(project,target.id,factory),inserted=next.steps[index];
  assert.equal(JSON.stringify(project),input);
  assert.equal(next.activeStepId,inserted.id);assert.equal(inserted.title,'');assert.equal(inserted.description,'');
  assert.deepEqual(inserted.annotations,[]);
  assert.deepEqual(next.states[index].doc,next.states[index+1].doc);
  assert.notEqual(next.states[index].doc,next.states[index+1].doc);
  assert.equal(inserted.afterId,target.beforeId);
  assert.deepEqual(next.steps.filter(s=>s.id!==inserted.id).map(s=>[s.id,s.title,s.description]),project.steps.map(s=>[s.id,s.title,s.description]));
  assert.equal(next.states[index+1],project.states[index]);
  const edited=updateDiagramCP(next,inserted.afterId,{...next.states[index].doc,name:'插入后的 CP'});
  assert.equal(edited.states[index].doc.name,'方块');
  assert.equal(edited.states[index+1].doc.name,'插入后的 CP');
  assert.equal(next.steps[index+1].beforeId,inserted.afterId);
  const restored=importDiagramProject(exportDiagramProject(edited));
  assert.equal(restored.steps.length,4);assert.equal(restored.states.length,5);
});

test('insertion carries the starting paper without inheriting action drawings, and rebinds the previous step CP inset',()=>{
  let {project,factory}=fixture();
  const [previous,target,last]=project.steps,boundary=project.states[1];
  project=updateDiagramCP(project,boundary.id,{...boundary.doc,name:'修订后的边界'});
  project=adoptDiagramPose(project,target.id,boundary.id,computeFlatFold(project.states[1].doc));
  project.steps[0].callouts=[{id:'inset',source:{kind:'cp',stateId:boundary.id,center:[10,10],radius:10},target:{center:[100,10],radius:20}}];
  project.steps[1].annotations=[{id:'crease',kind:'line',style:'valley',width:.7,color:'#112233',a:[5,5],b:[20,20]}];
  project.steps[2].annotations=[{id:'back',kind:'symbol',symbol:'return',returnStepId:target.id,position:[0,0],size:10,rotation:0,width:.7,color:'#112233'}];
  const next=insertDiagramStepBefore(project,target.id,factory),inserted=next.steps[1];
  assert.equal(next.steps[0].id,previous.id);
  assert.deepEqual(next.steps[0].callouts![0].source,{...project.steps[0].callouts![0].source,stateId:inserted.beforeId});
  assert.equal(inserted.pose!.sourceStateId,inserted.beforeId);assert.equal(inserted.pose!.sourceRevision,1);
  assert.deepEqual(inserted.pose!.result,project.steps[1].pose!.result);
  assert.equal(next.steps[2].pose!.sourceStateId,boundary.id);
  assert.equal(next.steps[3].id,last.id);
  const annotation=next.steps[3].annotations![0];
  assert.ok(annotation.kind==='symbol');assert.equal(annotation.returnStepId,target.id);assert.equal(annotation.text,'3');
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(next)));
});

test('copied figures have independent local CPs, preserve historical geometry and remove external return links',()=>{
  let {project,factory}=fixture();
  const [earlier,target]=project.steps;
  const external=project.states[0];
  project=adoptDiagramPose(project,target.id,external.id,computeFlatFold(external.doc));
  for(const state of project.states.slice(1,3))project=updateDiagramCP(project,state.id,{...state.doc,name:'修改的边界'});
  project.steps[1].annotations=[{id:'back',kind:'symbol',symbol:'return',text:'1',returnStepId:earlier.id,position:[0,0],size:10,rotation:0,width:.7,color:'#112233'}];
  const figure=createDiagramProcessFigure(project,target.id,'copy',factory),step=figure.steps[0];
  assert.equal(figure.steps.length,1);assert.equal(figure.states.length,2);
  assert.equal(step.pose!.sourceDoc.name,'方块');assert.equal(figure.states[0].doc.name,'修改的边界');
  assert.equal(step.pose!.sourceStateId,step.beforeId);assert.ok(step.pose!.sourceRevision<figure.states[0].revision);
  assert.ok(!('returnStepId' in step.annotations![0]));assert.equal((step.annotations![0] as {text?:string}).text,'1');
  step.title='侧视';
  const combined=upsertDiagramProcessFigure(project,target.id,figure);
  step.title='外部继续修改';
  assert.equal(combined.steps[1].processFigures![0].steps[0].title,'侧视');
  assert.equal(project.steps[1].processFigures,undefined);
  const reopened=importDiagramProject(exportDiagramProject(combined));
  assert.equal(reopened.steps.length,3);assert.equal(reopened.states.length,4);
  assert.equal(reopened.steps[1].processFigures![0].steps[0].pose!.sourceDoc.name,'方块');
  const updated=upsertDiagramProcessFigure(reopened,target.id,figure);
  assert.equal(updated.steps[1].processFigures!.length,1);
  assert.equal(removeDiagramProcessFigure(updated,target.id,figure.activeStepId).steps[1].processFigures,undefined);
});

test('image figures start with hidden paper; recursive, multi-step and duplicate figures cannot be imported',()=>{
  const {project,factory}=fixture(),owner=project.steps[1],figure=createDiagramProcessFigure(project,owner.id,'image',factory);
  assert.equal(figure.steps[0].paperVisible,false);assert.equal(figure.steps[0].pose,null);
  const nested=upsertDiagramProcessFigure(project,owner.id,figure);
  assert.throws(()=>upsertDiagramProcessFigure(nested,owner.id,appendDiagramStep(figure,factory)),/单|一个/);
  const invalid=structuredClone(nested);
  invalid.steps[1].processFigures![0].steps[0].processFigures=[figure];
  assert.throws(()=>importDiagramProject(JSON.stringify(invalid)),/嵌套/);
  nested.steps[1].processFigures!.push(figure);
  assert.throws(()=>validateDiagramProject(nested),/重复/);
});

test('a copied spatial snapshot reopens with independently rebuilt occlusion',()=>{
  const doc=blankDoc('折起',100,100);
  doc.segments.push({id:'partial',a:[50,0],b:[50,100],assignment:'V',angle:90});
  const base=createDiagramProject(doc),orig=base.steps[0];
  const {result,spatial}=createDiagramSpatialPose(doc);
  const project=adoptDiagramPose(base,orig.id,orig.beforeId,result,undefined,spatial);
  const figure=createDiagramProcessFigure(project,orig.id,'copy');
  const reopened=importDiagramProject(exportDiagramProject(upsertDiagramProcessFigure(project,orig.id,figure)));
  const pose=reopened.steps[0].processFigures![0].steps[0].pose!;
  assert.ok(pose.spatial);assert.equal(pose.result.layers.status,'solved');
});

test('native .zds content and the document library retain inserted steps and their independent figures',async()=>{
  const {project,factory}=fixture();
  const target=project.steps[1],inserted=insertDiagramStepBefore(project,target.id,factory);
  const figure=createDiagramProcessFigure(inserted,inserted.activeStepId,'image',factory);
  figure.steps[0].title='背面细节';
  const edited=upsertDiagramProcessFigure(inserted,inserted.activeStepId,figure);
  const file=new File([exportDiagramProject(edited)],'背面.zds');
  const fromFile=importDiagramProject(await file.text());
  const records=new Map<string,string>(),storage={getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value);}};
  const first=createDiagramLibrary(storage),entry=first.save(fromFile,{kind:'saved'});
  const reopened=createDiagramLibrary(storage).load(entry.id);
  assert.equal(reopened.steps[1].id,inserted.activeStepId);assert.equal(reopened.steps[2].id,target.id);
  assert.equal(reopened.steps[1].processFigures![0].steps[0].title,'背面细节');assert.equal(reopened.states.length,5);
});

test('detaching a cropped main step carries its close-up without a synthetic zoom arrow',()=>{
  const {project,factory}=fixture();
  const [previous,current]=project.steps;
  previous.annotations=[{id:'zoom',kind:'symbol',symbol:'zoom',position:[80,75],size:15,rotation:0,width:.7,color:'#112233',
    zoomArea:{region:{kind:'circle',center:[25,50],radius:10},basis:{x:0,y:0,width:100,height:100}}}];
  const expected=diagramStepZoom(project,current.id)!.region;
  const figure=importDiagramProject(exportDiagramProject(createDiagramProcessFigure(project,current.id,'copy',factory)));
  assert.deepEqual(figure.steps[0].annotations,[]);assert.deepEqual(diagramStepZoom(figure,figure.activeStepId)!.region,expected);
  assert.deepEqual(diagramStepZooms(figure).get(figure.activeStepId)!.region,expected);
});
