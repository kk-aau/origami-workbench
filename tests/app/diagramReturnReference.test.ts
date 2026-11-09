import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {
  createDiagramProject,appendDiagramStep,duplicateDiagramStep,removeDiagramStep,updateDiagramAnnotations,adoptDiagramPose,
  validateDiagramProject,exportDiagramProject,importDiagramProject,type DiagramProject,
} from '../../src/app/diagramProject';
import {getDiagramReturnTarget,syncDiagramReturnLabels} from '../../src/app/diagramReturnReference';

function fixture(count=3){
  let sequence=0;const factory=()=>`return-${++sequence}`;
  let project=createDiagramProject(blankDoc('返回步骤',100,100),factory);
  while(project.steps.length<count)project=appendDiagramStep(project,factory);
  return {project,factory};
}
const symbol=(id='return-symbol',returnStepId?:string):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol:'return',position:[10,20],size:30,rotation:0,color:'#293d35',width:.7,...(returnStepId?{returnStepId}:{})});
const annotation=(project:DiagramProject,index:number)=>project.steps[index].annotations![0] as DiagramSymbolAnnotation;
function continuous(project:DiagramProject){
  assert.equal(project.states.length,project.steps.length+1);
  project.steps.forEach((step,index)=>{assert.equal(step.beforeId,project.states[index].id);assert.equal(step.afterId,project.states[index+1].id);});
  assert.doesNotThrow(()=>validateDiagramProject(project));
}
function withCache(project:DiagramProject,index:number):DiagramProject {
  const step=project.steps[index],state=project.states.find(state=>state.id===step.beforeId)!;
  const next=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(state.doc)),current=next.steps[index];
  current.paperStates={active:'flat',flat:structuredClone(current.pose!),flatAnnotations:structuredClone(current.annotations!),spatialAnnotations:structuredClone(current.annotations!)};
  for(const annotations of [current.paperStates.flatAnnotations!,current.paperStates.spatialAnnotations!])for(const a of annotations)if(a.kind==='symbol')a.position=[70,80];
  validateDiagramProject(next);return next;
}

test('legacy numeric labels, CAD text and counts remain illustration-only on load and save',()=>{
  const {project}=fixture(),step=project.steps[2],legacy={...symbol(),text:'1',cadAttributes:{'1757':'2'},params:{count:3}};
  const next=updateDiagramAnnotations(project,step.id,[legacy]),loaded=importDiagramProject(exportDiagramProject(next));
  assert.equal(getDiagramReturnTarget(next,step.id),null);assert.equal(getDiagramReturnTarget(loaded,step.id),null);
  assert.deepEqual(annotation(loaded,2),legacy);assert.equal(syncDiagramReturnLabels(next),next);
});

test('binding uses a stable target identity and refreshes both labels beyond the legacy count limit',()=>{
  const {project}=fixture(14),step=project.steps[13],target=project.steps[12],before=structuredClone(project);
  const next=updateDiagramAnnotations(project,step.id,[{...symbol('bound',target.id),text:'old',params:{count:3},cadAttributes:{'1757':'old'}}]);
  assert.equal(getDiagramReturnTarget(next,step.id),next.steps[12]);
  assert.equal(annotation(next,13).text,'13');assert.equal(annotation(next,13).cadAttributes?.['1757'],'13');assert.equal(annotation(next,13).params?.count,3);
  assert.equal(next.states,project.states);assert.equal(next.steps[12],project.steps[12]);assert.notEqual(next.steps[13].annotations,project.steps[13].annotations);
  assert.equal(syncDiagramReturnLabels(next),next);assert.deepEqual(project,before);
});

test('all explicit references reject missing, current, future or conflicting targets atomically',()=>{
  const {project}=fixture(4),step=project.steps[2],before=structuredClone(project);
  const same=updateDiagramAnnotations(project,step.id,[symbol('a',project.steps[0].id),symbol('b',project.steps[0].id)]);
  assert.equal(getDiagramReturnTarget(same,step.id),same.steps[0]);
  for(const [target,error] of [['missing',/已不存在/],[step.id,/此前/],[project.steps[3].id,/此前/]] as const){
    assert.throws(()=>updateDiagramAnnotations(project,step.id,[symbol('a',target)]),error);
    const invalid=structuredClone(project);invalid.steps[2].annotations=[symbol('a',target)];
    assert.throws(()=>getDiagramReturnTarget(invalid,step.id),error);
  }
  const conflict=[symbol('a',project.steps[0].id),symbol('b',project.steps[1].id)];
  assert.throws(()=>updateDiagramAnnotations(project,step.id,conflict),/多个不同/);
  const invalid=structuredClone(project);invalid.steps[2].annotations=conflict;assert.throws(()=>getDiagramReturnTarget(invalid,step.id),/多个不同/);
  assert.throws(()=>getDiagramReturnTarget(project,'missing'),/不存在/);assert.deepEqual(project,before);
});

test('only return symbols accept a bounded nonempty string target, including file trust boundaries',()=>{
  const {project}=fixture(),step=project.steps[2];
  const invalids=[undefined,null,0,[],{},'', '  ','bad\nvalue','x'.repeat(257)].map(returnStepId=>({...symbol(),returnStepId}));
  invalids.push({...symbol(),symbol:'fold',returnStepId:project.steps[0].id} as any);
  for(const invalid of invalids){
    assert.throws(()=>validateDiagramAnnotations([invalid]),/返回步骤目标/);
    const raw=structuredClone(project);raw.steps[2].annotations=[{...invalid,returnStepId:invalid.returnStepId===undefined?null:invalid.returnStepId} as any];
    assert.throws(()=>importDiagramProject(JSON.stringify(raw)),/返回步骤目标/);
  }
  assert.throws(()=>updateDiagramAnnotations(project,step.id,[{...symbol(),returnStepId:undefined}]),/返回步骤目标/);
});

test('copy, insertion and deletion preserve the chosen target while its displayed sequence number changes',()=>{
  const {project,factory}=fixture(4),target=project.steps[1],last=project.steps[3];
  const bound=updateDiagramAnnotations(project,last.id,[symbol('bound',target.id)]),before=structuredClone(bound);
  const copied=duplicateDiagramStep(bound,last.id,factory);continuous(copied);
  assert.equal(annotation(copied,4).returnStepId,target.id);assert.equal(annotation(copied,4).text,'2');
  const inserted=duplicateDiagramStep(copied,copied.steps[0].id,factory);continuous(inserted);
  for(const index of [4,5]){assert.equal(annotation(inserted,index).returnStepId,target.id);assert.equal(annotation(inserted,index).text,'3');assert.equal(annotation(inserted,index).cadAttributes?.['1757'],'3');}
  assert.notEqual(inserted.steps[4].annotations,copied.steps[3].annotations);
  const removed=removeDiagramStep(inserted,inserted.steps[0].id);continuous(removed);
  for(const index of [3,4]){assert.equal(annotation(removed,index).returnStepId,target.id);assert.equal(annotation(removed,index).text,'2');}
  assert.deepEqual(bound,before);
});

test('deleting a target names its referring steps and clearing a binding clears archived references while preserving geometry',()=>{
  const {project}=fixture(),target=project.steps[0],current=project.steps[2];
  let bound=updateDiagramAnnotations(project,current.id,[symbol('bound',target.id)]);bound=withCache(bound,2);const before=structuredClone(bound);
  assert.throws(()=>removeDiagramStep(bound,target.id),/第 3 步.*先清除或修改/);
  const unbound={...annotation(bound,2)};delete unbound.returnStepId;
  const cleared=updateDiagramAnnotations(bound,current.id,[unbound]),step=cleared.steps[2];
  assert.equal(getDiagramReturnTarget(cleared,current.id),null);
  for(const annotations of [step.paperStates!.flatAnnotations!,step.paperStates!.spatialAnnotations!]){
    const a=annotations[0] as DiagramSymbolAnnotation;assert.equal(Object.hasOwn(a,'returnStepId'),false);assert.deepEqual(a.position,[70,80]);
  }
  assert.equal(step.pose,bound.steps[2].pose);assert.equal(step.paperStates!.flat,bound.steps[2].paperStates!.flat);
  const removed=removeDiagramStep(cleared,target.id);continuous(removed);assert.deepEqual(bound,before);
  const deletedSymbol=updateDiagramAnnotations(bound,current.id,[]);assert.deepEqual(deletedSymbol.steps[2].paperStates!.flatAnnotations,[]);assert.deepEqual(deletedSymbol.steps[2].paperStates!.spatialAnnotations,[]);
  assert.doesNotThrow(()=>removeDiagramStep(deletedSymbol,target.id));
});

test('changing a bound target refreshes archived labels without moving cached symbols',()=>{
  const {project}=fixture(),current=project.steps[2];
  const bound=withCache(updateDiagramAnnotations(project,current.id,[symbol('bound',project.steps[0].id)]),2);
  const changed=updateDiagramAnnotations(bound,current.id,[{...annotation(bound,2),returnStepId:project.steps[1].id}]);
  for(const annotations of [changed.steps[2].annotations!,changed.steps[2].paperStates!.flatAnnotations!,changed.steps[2].paperStates!.spatialAnnotations!]){
    const a=annotations[0] as DiagramSymbolAnnotation;assert.equal(a.returnStepId,project.steps[1].id);assert.equal(a.text,'2');assert.equal(a.cadAttributes?.['1757'],'2');
  }
  assert.deepEqual((changed.steps[2].paperStates!.flatAnnotations![0] as DiagramSymbolAnnotation).position,[70,80]);
  assert.equal(annotation(bound,2).returnStepId,project.steps[0].id);
});

test('save and import normalize outdated sequence labels without mutating live artwork',()=>{
  const {project}=fixture(),step=project.steps[2],target=project.steps[1];
  const bound=withCache(updateDiagramAnnotations(project,step.id,[symbol('bound',target.id)]),2);
  for(const annotations of [bound.steps[2].annotations!,bound.steps[2].paperStates!.flatAnnotations!,bound.steps[2].paperStates!.spatialAnnotations!]){
    const a=annotations[0] as DiagramSymbolAnnotation;a.text='99';a.cadAttributes={'1757':'88'};
  }
  const before=structuredClone(bound),saved=JSON.parse(exportDiagramProject(bound)),loaded=importDiagramProject(JSON.stringify(bound));
  for(const value of [saved,loaded])for(const annotations of [value.steps[2].annotations,value.steps[2].paperStates.flatAnnotations,value.steps[2].paperStates.spatialAnnotations]){
    assert.equal(annotations[0].returnStepId,target.id);assert.equal(annotations[0].text,'2');assert.equal(annotations[0].cadAttributes['1757'],'2');
  }
  assert.deepEqual(bound,before);
});

test('invalid hidden snapshot references are rejected at import and export, and block target deletion',()=>{
  const {project}=fixture(),current=project.steps[2];
  const cached=withCache(updateDiagramAnnotations(project,current.id,[symbol()]),2);
  (cached.steps[2].paperStates!.flatAnnotations![0] as DiagramSymbolAnnotation).returnStepId=project.steps[0].id;
  assert.throws(()=>removeDiagramStep(cached,project.steps[0].id),/第 3 步/);
  (cached.steps[2].paperStates!.flatAnnotations![0] as DiagramSymbolAnnotation).returnStepId='missing';
  assert.throws(()=>exportDiagramProject(cached),/已不存在/);assert.throws(()=>importDiagramProject(JSON.stringify(cached)),/已不存在/);
});
