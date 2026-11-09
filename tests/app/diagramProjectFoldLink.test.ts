import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramFoldLinkSettings} from '../../src/app/diagramFoldLinkTypes';
import {
  createDiagramProject,appendDiagramStep,advanceDiagramStep,duplicateDiagramStep,selectDiagramStep,
  adoptDiagramPose,updateDiagramFoldLink,validateDiagramFoldLink,exportDiagramProject,importDiagramProject,
} from '../../src/app/diagramProject';

function ids(){let count=0;return()=>`fold-link-${++count}`;}
function settings():DiagramFoldLinkSettings {
  return {enabled:true,layers:'selected',selectedFaces:[1,0],
    fixed:{point:[25,75],matrix:[0,1,-1,0,100,-50]},
    generated:[{id:'generated-valley',a:[10,0],b:[10,100],assignment:'V',angle:180}]};
}
function fixture(){
  const doc=blankDoc('联动折序',100,100);
  doc.segments.push({id:'existing-crease',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const factory=ids(),project=createDiagramProject(doc,factory),result=computeFlatFold(doc);
  assert.equal(result.geometry.status,'ready');
  return {doc,factory,project,result};
}

test('new projects require explicit linking and legacy version 1 files retain their absence',()=>{
  const {project,factory}=fixture();
  assert.deepEqual(project.steps[0].foldLink,{enabled:false,layers:'top',selectedFaces:[]});
  const legacy=structuredClone(project);delete legacy.steps[0].foldLink;
  const loaded=importDiagramProject(exportDiagramProject(legacy));
  assert.equal(Object.hasOwn(loaded.steps[0],'foldLink'),false);
  assert.equal(Object.hasOwn(appendDiagramStep(loaded,factory).steps[1],'foldLink'),false);
});

test('enabling linking stores isolated settings without converting old annotations or changing CPs',()=>{
  const {project,result}=fixture(),stepId=project.activeStepId;
  const posed=adoptDiagramPose(project,stepId,project.states[0].id,result);
  posed.steps[0].annotations=[{id:'teaching-line',kind:'line',a:[0,0],b:[100,100],style:'valley',color:'#315ebe',width:.7}];
  const original=structuredClone(posed),input=settings(),next=updateDiagramFoldLink(posed,stepId,input);
  input.selectedFaces.pop();input.fixed!.point[0]=900;input.fixed!.matrix[4]=800;input.generated![0].a[0]=300;
  assert.deepEqual(next.steps[0].foldLink,settings());assert.deepEqual(posed,original);
  assert.deepEqual(next.states,posed.states);assert.deepEqual(next.steps[0].annotations,posed.steps[0].annotations);
  assert.deepEqual(next.steps[0].pose,posed.steps[0].pose);
});

test('project export and import preserve the fixed material anchor and generated crease ledger',()=>{
  const {project}=fixture(),linked=updateDiagramFoldLink(project,project.activeStepId,settings());
  const original=structuredClone(linked),loaded=importDiagramProject(exportDiagramProject(linked));
  assert.deepEqual(loaded.steps[0].foldLink,settings());assert.deepEqual(linked,original);
  loaded.steps[0].foldLink!.fixed!.point[0]=400;
  loaded.steps[0].foldLink!.generated![0].a[0]=500;
  assert.deepEqual(linked,original);
});

test('appending inherits only the explicit mode and layer range, with no old pose or indexed anchors',()=>{
  const {project,result,factory}=fixture();
  let linked=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  linked=updateDiagramFoldLink(linked,linked.activeStepId,settings());
  linked.steps[0].annotations=[{id:'old-arrow',kind:'symbol',symbol:'fold',position:[20,30],size:50,rotation:0,color:'#314b3c',width:.7}];
  const before=structuredClone(linked),next=appendDiagramStep(linked,factory);
  assert.deepEqual(next.steps[1].foldLink,{enabled:true,layers:'selected',selectedFaces:[]});
  assert.equal(next.steps[1].pose,null);assert.deepEqual(next.steps[1].annotations,[]);
  assert.deepEqual(next.states[1].doc,next.states[2].doc);
  assert.deepEqual(linked,before);assert.deepEqual(next.steps[0],before.steps[0]);
});

test('navigating to an authored successor retains its own linked faces and fixed side',()=>{
  const {project,factory}=fixture();let next=appendDiagramStep(project,factory);
  next=updateDiagramFoldLink(next,next.activeStepId,settings());
  next=selectDiagramStep(next,next.steps[0].id);
  const original=structuredClone(next),following=advanceDiagramStep(next,()=>{throw new Error('must not append');});
  assert.deepEqual(following.steps[1],original.steps[1]);assert.deepEqual(next,original);
});

test('copying an authored step preserves an independent ledger and anchor matching its copied pose',()=>{
  const {project,result,factory}=fixture();
  let posed=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  posed=updateDiagramFoldLink(posed,posed.activeStepId,settings());
  const copied=duplicateDiagramStep(posed,posed.activeStepId,factory);
  assert.deepEqual(copied.steps[1].foldLink,settings());
  copied.steps[1].foldLink!.generated![0].a[0]=500;copied.steps[1].foldLink!.fixed!.point[0]=400;
  assert.deepEqual(copied.steps[0].foldLink,settings());assert.deepEqual(posed.steps[0].foldLink,settings());
});

test('adopting freshly computed geometry can receive the preceding observation view without copying its model',()=>{
  const {project,result,factory}=fixture(),view={...defaultModelView(),side:'back' as const,rotation:90,
    colors:{front:'#c5dac2',back:'#f3e6ce',line:'#41634e'}};
  const next=appendDiagramStep(adoptDiagramPose(project,project.activeStepId,project.states[0].id,result,view),factory);
  const step=next.steps[1],adopted=adoptDiagramPose(next,step.id,step.beforeId,result,view);
  view.rotation=0;
  assert.equal(next.steps[1].pose,null);assert.equal(adopted.steps[1].pose!.view!.rotation,90);
  assert.equal(adopted.steps[1].pose!.view!.side,'back');assert.deepEqual(adopted.steps[1].pose!.view!.cameras,{});
  assert.equal(adopted.steps[1].pose!.sourceStateId,step.beforeId);
});

test('fixed matrices accept rotations and reflections but reject scale, shear and invalid coordinates',()=>{
  for(const matrix of [[1,0,0,1,0,0],[-1,0,0,1,100,0],[0,1,-1,0,100,-50]])
    assert.doesNotThrow(()=>validateDiagramFoldLink({...settings(),fixed:{point:[10,20],matrix}}));
  for(const fixed of [null,{}, {point:[0,0],matrix:[2,0,0,1,0,0]},
    {point:[0,0],matrix:[1,0,.1,1,0,0]}, {point:[0,0],matrix:[0,0,0,0,0,0]},
    {point:[0,0],matrix:[1,0,0,1,Infinity,0]}, {point:[0,0],matrix:[1,0,0,1,0]},
    {point:[0,0],matrix:[1,0,0,1,1_000_001,0]}, {point:[NaN,0],matrix:[1,0,0,1,0,0]},
    {point:[0,1_000_001],matrix:[1,0,0,1,0,0]}, {point:[0,0],matrix:[1,0,0,1,0,0],extra:true}])
    assert.throws(()=>validateDiagramFoldLink({...settings(),fixed}));
});

test('invalid fold-link settings reject updates and imported files atomically',()=>{
  const {project}=fixture(),original=structuredClone(project),base=settings();
  const invalid=[null,[],{}, {...base,enabled:1}, {...base,layers:'visible'},
    {...base,selectedFaces:[1,1]}, {...base,selectedFaces:[-1]}, {...base,selectedFaces:[.5]},
    {...base,selectedFaces:[Number.MAX_SAFE_INTEGER+1]}, {...base,selectedFaces:[Infinity]}, {...base,selectedFaces:['0']},
    {...base,selectedFaces:undefined}, {...base,extra:true}];
  for(const value of invalid){
    assert.throws(()=>updateDiagramFoldLink(project,project.activeStepId,value as DiagramFoldLinkSettings));
    const raw=JSON.parse(exportDiagramProject(project));raw.steps[0].foldLink=value;
    assert.throws(()=>importDiagramProject(JSON.stringify(raw)));
  }
  assert.throws(()=>updateDiagramFoldLink(project,'unknown',base),/不存在/);
  assert.deepEqual(project,original);
});

test('generated ledgers enforce CP segment validation and permit only folds or F/0° precreases',()=>{
  const base=settings(),segment=base.generated![0];
  for(const assignment of ['M','V','U','F'] as const){
    const angle=assignment==='M'?-180:assignment==='V'?180:assignment==='F'?0:null;
    assert.doesNotThrow(()=>validateDiagramFoldLink({...base,generated:[{...segment,assignment,angle}]}));
  }
  const {project,factory}=fixture(),input:DiagramFoldLinkSettings={...base,generated:[{...segment,assignment:'F',angle:0}]};
  const linked=updateDiagramFoldLink(project,project.activeStepId,input),original=structuredClone(linked);
  input.generated![0].a[0]=700;
  assert.deepEqual(linked,original);
  const loaded=importDiagramProject(exportDiagramProject(linked)),copied=duplicateDiagramStep(linked,linked.activeStepId,factory);
  assert.deepEqual(loaded.steps[0].foldLink,original.steps[0].foldLink);
  assert.deepEqual(copied.steps[1].foldLink,original.steps[0].foldLink);
  loaded.steps[0].foldLink!.generated![0].a[0]=500;copied.steps[1].foldLink!.generated![0].b[0]=400;
  assert.deepEqual(linked,original);assert.deepEqual(copied.steps[0].foldLink,original.steps[0].foldLink);
  for(const generated of [null,{},[null], [{...segment,assignment:'B',angle:0}],
    [{...segment,assignment:'A',angle:0}], [{...segment,assignment:'F',angle:180}],
    [{...segment,assignment:'F',angle:-180}], [{...segment,assignment:'F',angle:null}],
    [{...segment,assignment:'M',angle:180}], [{...segment,angle:-180}],
    [{...segment,angle:Infinity}], [{...segment,a:[NaN,0]}], [{...segment,b:[0,1_000_001]}],
    [{...segment,displayColor:'blue'}], [{...segment,extra:true}], [segment,segment]])
    assert.throws(()=>validateDiagramFoldLink({...base,generated}));
});

test('generated fold-link ledgers preserve all entries beyond the former 12000-segment limit',()=>{
  const base=settings(),generated=Array.from({length:15000},(_,index)=>({...base.generated![0],id:`generated-${index}`})),input={...base,generated};
  assert.doesNotThrow(()=>validateDiagramFoldLink(input));
  const {project}=fixture(),before=structuredClone(project),linked=updateDiagramFoldLink(project,project.activeStepId,input);
  assert.equal(linked.steps[0].foldLink!.generated!.length,15000);
  assert.deepEqual(linked.steps[0].foldLink!.generated,generated);
  assert.deepEqual(importDiagramProject(exportDiagramProject(linked)),linked);
  assert.deepEqual(project,before);
  input.generated[0].a[0]=900;assert.equal(linked.steps[0].foldLink!.generated![0].a[0],10);
});
