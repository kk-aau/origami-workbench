import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {defaultModelView} from '../../src/app/modelViewState';
import {
  createDiagramProject,appendDiagramStep,advanceDiagramStep,inheritDiagramCurrentPose,duplicateDiagramStep,selectDiagramStep,updateDiagramStep,
  updateDiagramAnnotations,
  updateDiagramCP,adoptDiagramPose,updateDiagramPoseResult,updateDiagramPoseView,updateDiagramPoseDisplayOrder,
  updateDiagramHiddenFaces,updateDiagramOrientationLock,removeDiagramStep,
  exportDiagramProject,importDiagramProject,validateDiagramProject,type DiagramProject,
} from '../../src/app/diagramProject';
import type {DiagramSymbolAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {materialSlitFixture} from '../fixtures/materialModel';
import {retainDiagramPaperStates} from '../../src/app/diagramPaperState';

function ids(){let index=0;return ()=>`diagram-${++index}`;}
function fixture(){
  const doc=blankDoc('折序工程',100,100);
  doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const factory=ids(),project=createDiagramProject(doc,factory),result=computeFlatFold(doc);
  assert.equal(result.geometry.status,'ready');
  return {doc,project,result,factory};
}

test('next-step history shares unchanged geometry while new poses and CPs remain independent',()=>{
  const {project,result,factory}=fixture();
  const posed=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  const saved=structuredClone(posed),next=advanceDiagramStep(posed,factory);
  assert.equal(next.states[0],posed.states[0]);
  assert.equal(next.steps[0].pose!.result,posed.steps[0].pose!.result);
  assert.notEqual(next.states.at(-1)!.doc,posed.states.at(-1)!.doc);
  const inherited=inheritDiagramCurrentPose(next,posed.activeStepId,next.activeStepId);
  assert.equal(inherited.steps[0].pose!.result,posed.steps[0].pose!.result);
  assert.notEqual(inherited.steps[1].pose!.result,posed.steps[0].pose!.result);
  const computed=adoptDiagramPose(next,next.activeStepId,next.steps[1].beforeId,result);
  const cached=retainDiagramPaperStates(computed,computed.activeStepId,next.steps[1]);
  assert.equal(cached.steps[0].pose!.result,posed.steps[0].pose!.result);
  cached.steps[1].pose!.result.geometry.vertices[0][0]+=1;
  assert.deepEqual(posed,saved);
});

test('editing and saving one step never clone unrelated geometry or mutate frozen history',()=>{
  const {project,result,factory}=fixture();
  let base=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  base=appendDiagramStep(base,factory);
  base=adoptDiagramPose(base,base.activeStepId,base.steps[1].beforeId,result);
  base=retainDiagramPaperStates(base,base.activeStepId,base.steps[1]);
  const saved=JSON.stringify(base),target=base.activeStepId;
  const freeze=(value:unknown):void=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}};
  freeze(base);
  for(const update of [
    ()=>updateDiagramPoseResult(base,target,result),
    ()=>updateDiagramHiddenFaces(base,target,[0]),
    ()=>updateDiagramPoseDisplayOrder(base,target,[...result.layers.faceOrder!].reverse()),
    ()=>updateDiagramOrientationLock(base,target,true),
    ()=>duplicateDiagramStep(base,target,factory),
    ()=>removeDiagramStep(base,target),
  ]){
    const next=update();
    assert.equal(next.steps[0].pose!.result,base.steps[0].pose!.result);
    assert.equal(next.states[0],base.states[0]);
    validateDiagramProject(next);
  }
  const restored=importDiagramProject(exportDiagramProject(base));
  assert.equal(restored.steps.length,base.steps.length);
  assert.deepEqual(restored.states,base.states);
  assert.deepEqual(restored.steps.map(step=>step.pose!.result.geometry.vertices),base.steps.map(step=>step.pose!.result.geometry.vertices));
  assert.equal(JSON.stringify(base),saved);
});
function continuous(project:DiagramProject){
  assert.equal(project.states.length,project.steps.length+1);
  project.steps.forEach((step,index)=>{
    assert.equal(step.beforeId,project.states[index].id);
    assert.equal(step.afterId,project.states[index+1].id);
  });
  assert.doesNotThrow(()=>validateDiagramProject(project));
}

test('one initial step owns two independent CP states without editing the original Doc',()=>{
  const doc=blankDoc('开始',100,100),before=structuredClone(doc),project=createDiagramProject(doc,ids());
  continuous(project);assert.equal(project.activeStepId,project.steps[0].id);
  assert.equal(project.steps[0].pose,null);assert.deepEqual(project.states.map(state=>state.revision),[0,0]);
  assert.deepEqual(doc,before);assert.notEqual(project.states[0].doc,project.states[1].doc);
  project.states[0].doc.segments[0].a[0]=17;
  assert.deepEqual(doc,before);assert.deepEqual(project.states[1].doc,before);
});

test('appending and copying a middle step keep exactly N + 1 ordered CP states',()=>{
  const {project,factory}=fixture(),original=structuredClone(project);
  let next=appendDiagramStep(project,factory);next=appendDiagramStep(next,factory);
  const oldNext=next.steps[1],shared=next.steps[0].afterId;
  next=duplicateDiagramStep(next,next.steps[0].id,factory);
  continuous(next);assert.equal(next.steps.length,4);
  assert.equal(next.steps[1].beforeId,shared);
  assert.equal(next.steps[2].id,oldNext.id);assert.equal(next.steps[2].beforeId,next.steps[1].afterId);
  assert.equal(next.activeStepId,next.steps[1].id);assert.deepEqual(project,original);
  assert.notEqual(next.states[1].doc,next.states[2].doc);
  const oldDoc=structuredClone(next.states[1].doc);next.states[2].doc.segments[0].a[0]=22;
  assert.deepEqual(next.states[1].doc,oldDoc);
});

test('next step selects an existing successor and preserves its authored pose, drawings and CP chain',()=>{
  const {project,result,factory}=fixture();let two=appendDiagramStep(project,factory);
  const following=two.steps[1];two=adoptDiagramPose(two,following.id,following.beforeId,result);
  two=updateDiagramStep(two,following.id,{title:'已有下一步',description:'保留这段说明。'});
  two.steps[1].annotations=[{id:'line',kind:'line',a:[10,10],b:[20,20],style:'valley',width:.7,color:'#112233'}];
  two.steps[1].canvas!.gridSpacing=10;two=selectDiagramStep(two,two.steps[0].id);
  const before=structuredClone(two),next=advanceDiagramStep(two,()=>{throw new Error('已有下一步不可生成新 ID。');});
  continuous(next);assert.equal(next.steps.length,2);assert.equal(next.activeStepId,following.id);
  assert.deepEqual(next.steps[1],two.steps[1]);assert.deepEqual(next.states,two.states);assert.deepEqual(two,before);
});

test('next step at the end reuses current after as its before and adds one independent after state',()=>{
  const {doc,project,factory}=fixture(),after=structuredClone(doc);after.name='操作完成 CP';
  const updated=updateDiagramCP(project,project.steps[0].afterId,after),next=advanceDiagramStep(updated,factory);
  continuous(next);assert.equal(next.steps.length,2);assert.equal(next.activeStepId,next.steps[1].id);
  assert.equal(next.steps[1].beforeId,updated.steps[0].afterId);assert.equal(next.steps[1].pose,null);
  assert.deepEqual(next.states[1].doc,after);assert.deepEqual(next.states[2].doc,after);assert.notEqual(next.states[1].doc,next.states[2].doc);
  assert.equal(next.states[1].revision,1);assert.equal(next.states[2].revision,0);
});

test('updating one intermediate CP is seen by both adjacent steps and advances one revision',()=>{
  const {doc,project,factory}=fixture(),withTwo=appendDiagramStep(project,factory),before=structuredClone(withTwo);
  const shared=withTwo.steps[0].afterId;
  assert.equal(shared,withTwo.steps[1].beforeId);
  const changed=structuredClone(doc);changed.name='共同中间状态';
  const next=updateDiagramCP(withTwo,shared,changed);continuous(next);
  const after=next.states.find(state=>state.id===next.steps[0].afterId)!;
  const followingBefore=next.states.find(state=>state.id===next.steps[1].beforeId)!;
  assert.equal(after,followingBefore);assert.equal(after.doc.name,changed.name);assert.equal(after.revision,1);
  assert.deepEqual(withTwo,before);changed.segments[0].a[0]=25;assert.deepEqual(after.doc.segments,doc.segments);
});

test('CP updates keep edited poses as stale calculation-time snapshots',()=>{
  const {doc,project,result}=fixture(),stepId=project.steps[0].id,stateId=project.states[0].id;
  const posed=adoptDiagramPose(project,stepId,stateId,result),oldPose=structuredClone(posed.steps[0].pose);
  const changed=structuredClone(doc);changed.segments.push({id:'aux',a:[0,25],b:[100,25],assignment:'A',angle:0});
  const next=updateDiagramCP(posed,stateId,changed);
  assert.deepEqual(next.steps[0].pose,oldPose);assert.equal(next.states[0].revision,1);
  assert.equal(next.steps[0].pose!.sourceRevision,0);assert.deepEqual(next.steps[0].pose!.sourceDoc,doc);
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(next)));
});

test('copied steps retain the actual pose source and independently editable model geometry',()=>{
  const {project,result,factory}=fixture(),stepId=project.steps[0].id,stateId=project.states[0].id;
  const posed=adoptDiagramPose(project,stepId,stateId,result),copied=duplicateDiagramStep(posed,stepId,factory),copy=copied.steps[1];
  assert.equal(copy.pose!.sourceStateId,stateId);assert.notEqual(copy.pose,copied.steps[0].pose);
  const moved=moveFoldedVertices(copy.pose!.result,{group:[0],selected:[0]},[-20,-10]);
  const next=updateDiagramPoseResult(copied,copy.id,moved);
  assert.deepEqual(next.steps[0].pose!.result,result);
  assert.deepEqual(next.steps[1].pose!.result.geometry.vertices[0],[-20,-10]);
  assert.deepEqual(next.steps[1].pose!.displayOrder,result.layers.faceOrder);
  assert.equal(next.steps[1].pose!.result.layers.status,'unknown');
  assert.deepEqual(copied.steps[1].pose!.result,result);continuous(next);
});

test('selecting and changing text preserve historical projects through subsequent CP updates and reject unknown steps',()=>{
  const {project,factory}=fixture(),two=appendDiagramStep(project,factory),before=structuredClone(two);
  const selected=selectDiagramStep(two,two.steps[0].id);
  const next=updateDiagramStep(selected,selected.activeStepId,{title:'打开上层',description:'只拉开选中的纸角。'});
  assert.equal(next.steps[0].title,'打开上层');assert.equal(next.steps[0].description,'只拉开选中的纸角。');
  assert.deepEqual(two,before);
  const changedDoc=structuredClone(next.states[0].doc);changedDoc.name='独立';
  const edited=updateDiagramCP(next,next.states[0].id,changedDoc);
  assert.equal(edited.states[0].doc.name,'独立');assert.equal(next.states[0].doc.name,before.states[0].doc.name);
  assert.deepEqual(two,before);assert.equal(two.states[0].doc.name,before.states[0].doc.name);
  assert.throws(()=>selectDiagramStep(two,'unknown'),/不存在/);
  assert.throws(()=>updateDiagramStep(two,'unknown',{title:'错'}),/不存在/);
});

test('project files preserve moved vertices, original CPs, view and drawing order while discarding solver caches',()=>{
  const {project,result}=fixture(),stepId=project.steps[0].id,stateId=project.states[0].id;
  const view={...defaultModelView(),rotation:90,xray:true,cameras:{'front-solid':{rotation:90,x:5,y:6,width:200,height:120}}};
  let next=adoptDiagramPose(project,stepId,stateId,result,view);
  const order=[...next.steps[0].pose!.displayOrder!].reverse();next=updateDiagramPoseDisplayOrder(next,stepId,order);
  const moved=moveFoldedVertices(result,{group:[0],selected:[0]},[-15,10]);next=updateDiagramPoseResult(next,stepId,moved);
  next.steps[0].pose!.result.geometry.graph!.faces_matrix2=['untrusted-cache'];
  const before=structuredClone(next),text=exportDiagramProject(next),loaded=importDiagramProject(text);
  assert.ok(!text.includes('untrusted-cache'));assert.deepEqual(next,before);
  assert.deepEqual(loaded.states,next.states);assert.deepEqual(loaded.steps[0].pose!.sourceDoc,next.steps[0].pose!.sourceDoc);
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,moved.geometry.vertices);
  assert.deepEqual(loaded.steps[0].pose!.view,view);assert.deepEqual(loaded.steps[0].pose!.displayOrder,order);
  assert.equal(loaded.steps[0].pose!.result.layers.status,'unknown');assert.equal(loaded.steps[0].pose!.result.layers.faceOrder,undefined);
  loaded.steps[0].pose!.sourceDoc.name='载入后';assert.equal(next.steps[0].pose!.sourceDoc.name,before.steps[0].pose!.sourceDoc.name);
});

test('pose view and display order updates validate inputs and keep independent references',()=>{
  const {project,result}=fixture(),stepId=project.steps[0].id;
  const posed=adoptDiagramPose(project,stepId,project.states[0].id,result),view={...defaultModelView(),rotation:45};
  const next=updateDiagramPoseView(posed,stepId,view);view.rotation=180;
  assert.equal(next.steps[0].pose!.view!.rotation,45);assert.equal(posed.steps[0].pose!.view!.rotation,0);
  assert.throws(()=>updateDiagramPoseView(posed,stepId,{...defaultModelView(),rotation:360}),/视图/);
  assert.throws(()=>updateDiagramPoseDisplayOrder(posed,stepId,[0,0]),/绘制顺序/);
  assert.throws(()=>updateDiagramPoseDisplayOrder(project,stepId,[0]),/先/);
});

test('layer reanalysis updates the saved illustration order and preserves it after solver caches are discarded',()=>{
  const {project,result}=fixture(),stepId=project.steps[0].id;
  assert.equal(result.geometry.faces.length,2);assert.equal(result.layers.status,'solved');
  const posed=adoptDiagramPose(project,stepId,project.states[0].id,result);
  const oldOrder=[...posed.steps[0].pose!.displayOrder!],reanalysed=structuredClone(result);
  reanalysed.layers.faceOrder=[...oldOrder].reverse();
  const next=updateDiagramPoseResult(posed,stepId,reanalysed);
  assert.deepEqual(posed.steps[0].pose!.displayOrder,oldOrder);
  assert.deepEqual(next.steps[0].pose!.displayOrder,reanalysed.layers.faceOrder);
  assert.notEqual(next.steps[0].pose!.displayOrder,reanalysed.layers.faceOrder);
  const loaded=importDiagramProject(exportDiagramProject(next));
  assert.equal(loaded.steps[0].pose!.result.layers.status,'unknown');
  assert.equal(loaded.steps[0].pose!.result.layers.faceOrder,undefined);
  assert.deepEqual(loaded.steps[0].pose!.displayOrder,[...oldOrder].reverse());
  const moved=moveFoldedVertices(next.steps[0].pose!.result,{group:[0],selected:[0]},[-15,10]);
  assert.equal(moved.layers.status,'unknown');
  const edited=updateDiagramPoseResult(next,stepId,moved);
  assert.deepEqual(edited.steps[0].pose!.displayOrder,[...oldOrder].reverse());
  const editedLoaded=importDiagramProject(exportDiagramProject(edited));
  assert.deepEqual(editedLoaded.steps[0].pose!.displayOrder,[...oldOrder].reverse());
});

test('invalid updates reject atomically, including source topology and unknown CPs',()=>{
  const {doc,project,result}=fixture(),before=structuredClone(project),stepId=project.steps[0].id;
  const invalid=structuredClone(doc);invalid.paper.width=Infinity;
  assert.throws(()=>updateDiagramCP(project,project.states[0].id,invalid));
  assert.throws(()=>updateDiagramCP(project,'unknown',doc),/不存在/);
  assert.throws(()=>adoptDiagramPose(project,stepId,'unknown',result),/不存在/);
  const corrupted=structuredClone(result);corrupted.geometry.graph!.edges_assignment[0]='M';
  assert.throws(()=>adoptDiagramPose(project,stepId,project.states[0].id,corrupted),/拓扑/);
  assert.throws(()=>createDiagramProject(doc,()=> 'duplicate'),/重复/);
  assert.deepEqual(project,before);
});

test('corrupted imports reject discontinuity, duplicate IDs, invalid revisions and damaged pose geometry',()=>{
  const {project,result}=fixture(),posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result),saved=JSON.parse(exportDiagramProject(posed));
  const mutations=[
    (value:any)=>value.version=2,
    (value:any)=>value.states.pop(),
    (value:any)=>value.states[1].id=value.states[0].id,
    (value:any)=>value.steps[0].beforeId='unknown',
    (value:any)=>value.activeStepId='unknown',
    (value:any)=>value.steps[0].pose.sourceStateId='unknown',
    (value:any)=>value.steps[0].pose.sourceRevision=2,
    (value:any)=>value.steps[0].pose.sourceDoc.name='wrong source',
    (value:any)=>value.steps[0].pose.result.geometry.vertices.pop(),
    (value:any)=>value.steps[0].pose.result.geometry.vertices[0]=[null,0],
    (value:any)=>value.steps[0].pose.result.geometry.vertices[0]=[1000001,0],
    (value:any)=>value.steps[0].pose.result.geometry.faces[0][0]=99,
    (value:any)=>value.steps[0].pose.result.geometry.graph.edges_vertices.reverse(),
    (value:any)=>value.steps[0].pose.displayOrder=[0,0],
    (value:any)=>value.steps[0].pose.view.rotation=-1,
  ];
  for(const mutate of mutations){const value=structuredClone(saved);mutate(value);assert.throws(()=>importDiagramProject(JSON.stringify(value)));}
  assert.throws(()=>importDiagramProject('{broken'),/JSON/);
});

test('material paper snapshots retain cut banks and explicit face incidence in diagram files',()=>{
  const {source,result,banks}=materialSlitFixture(),project=createDiagramProject(source,ids());
  const posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result);
  const loaded=importDiagramProject(exportDiagramProject(posed)),graph=loaded.steps[0].pose!.result.geometry.graph!;
  assert.deepEqual(graph.edges_vertices[banks[0]],graph.edges_vertices[banks[1]]);
  assert.notDeepEqual(graph.edges_faces![banks[0]],graph.edges_faces![banks[1]]);
  assert.deepEqual(loaded.steps[0].pose!.sourceDoc,source);assert.deepEqual(loaded.states[0].doc,source);
});

const titleSymbol=(id='arrow',symbol:DiagramSymbolAnnotation['symbol']='fold'):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol,position:[20,25],size:30,rotation:0,color:'#293d35',width:.7});
const titleLine:DiagramLineAnnotation={id:'drawing-line',kind:'line',a:[0,0],b:[100,100],style:'valley',color:'#293d35',width:.7};

test('new and appended steps leave their titles empty while retaining the supplied CP and shared state chain',()=>{
  const {doc,project,factory}=fixture(),next=advanceDiagramStep(project,factory),third=appendDiagramStep(next,factory);
  assert.equal(project.steps[0].title,'');assert.deepEqual(third.steps.map(step=>step.title),['','','']);assert.deepEqual(third.states[0].doc,doc);continuous(third);
});

test('only the first actually committed symbol supplies the catalogue name in the same immutable update',()=>{
  const {project,result}=fixture(),id=project.activeStepId,posed=adoptDiagramPose(project,id,project.states[0].id,result),before=structuredClone(posed);
  const drawn=updateDiagramAnnotations(posed,id,[titleLine]);assert.equal(drawn.steps[0].title,'');assert.equal(drawn.steps[0].firstSymbolPlaced,undefined);
  const annotations=[titleLine,titleSymbol()],placed=updateDiagramAnnotations(drawn,id,annotations);
  assert.equal(placed.steps[0].title,'谷折箭头');assert.equal(placed.steps[0].firstSymbolPlaced,true);assert.deepEqual(placed.steps[0].annotations,annotations);
  assert.deepEqual(placed.states,drawn.states);assert.deepEqual(placed.steps[0].pose,drawn.steps[0].pose);assert.deepEqual(posed,before);assert.equal(drawn.steps[0].title,'');
  annotations[1].id='changed-outside';assert.equal(placed.steps[0].annotations![1].id,'arrow');
  assert.equal(drawn.steps[0].annotations!.length,1);assert.equal(drawn.steps[0].firstSymbolPlaced,undefined);
});

test('every catalogue symbol names an untitled step with its existing Chinese label',()=>{
  const {project}=fixture();for(const symbol of SYMBOL_CATALOG){const next=updateDiagramAnnotations(project,project.activeStepId,[titleSymbol('first',symbol.kind)]);assert.equal(next.steps[0].title,symbol.label);assert.equal(next.steps[0].firstSymbolPlaced,true);}
});

test('moving, editing and adding later symbols never overwrite the first suggested or user-authored title',()=>{
  const {project}=fixture(),id=project.activeStepId,first=updateDiagramAnnotations(project,id,[titleSymbol()]),edited=updateDiagramStep(first,id,{title:'拉开左侧纸层'});
  const moved={...titleSymbol(),symbol:'open' as const,position:[90,40] as [number,number]},next=updateDiagramAnnotations(edited,id,[moved,titleSymbol('second','pull')]);
  assert.equal(next.steps[0].title,'拉开左侧纸层');assert.equal(next.steps[0].firstSymbolPlaced,true);assert.equal(first.steps[0].title,'谷折箭头');
  const extra=updateDiagramAnnotations(first,id,[titleSymbol(),titleSymbol('second','pull')]);assert.equal(extra.steps[0].title,'谷折箭头');
});

test('a pre-authored title survives the first symbol and clearing it cannot re-enable naming on the second',()=>{
  const {project}=fixture(),id=project.activeStepId,custom=updateDiagramStep(project,id,{title:'第一道山折'}),first=updateDiagramAnnotations(custom,id,[titleSymbol('first','mountainFold')]);
  assert.equal(first.steps[0].title,'第一道山折');assert.equal(first.steps[0].firstSymbolPlaced,true);
  const cleared=updateDiagramStep(first,id,{title:''}),next=updateDiagramAnnotations(cleared,id,[titleSymbol('first','mountainFold'),titleSymbol('second','open')]);
  assert.equal(next.steps[0].title,'');assert.equal(next.steps[0].firstSymbolPlaced,true);
});

test('the completed first-symbol record survives deleting all symbols, round trips and adding another symbol',()=>{
  const {project}=fixture(),id=project.activeStepId,first=updateDiagramAnnotations(project,id,[titleSymbol()]);
  const removed=updateDiagramAnnotations(updateDiagramStep(first,id,{title:''}),id,[]),loaded=importDiagramProject(exportDiagramProject(removed));
  assert.equal(loaded.steps[0].title,'');assert.equal(loaded.steps[0].firstSymbolPlaced,true);
  const later=updateDiagramAnnotations(loaded,id,[titleSymbol('later','open')]);assert.equal(later.steps[0].title,'');assert.equal(later.steps[0].firstSymbolPlaced,true);
});

test('legacy numbered placeholders can be named by their first symbol without changing descriptive custom titles',()=>{
  const {project}=fixture(),id=project.activeStepId;
  for(const title of ['步骤 1','步骤2','  步骤  29  ','']){
    const legacy=structuredClone(project);legacy.steps[0].title=title;delete legacy.steps[0].firstSymbolPlaced;
    const loaded=importDiagramProject(exportDiagramProject(legacy)),next=updateDiagramAnnotations(loaded,id,[titleSymbol('first','pull')]);assert.equal(next.steps[0].title,'拉出纸层');
  }
  const custom=updateDiagramStep(project,id,{title:'步骤 2：向上谷折'}),next=updateDiagramAnnotations(custom,id,[titleSymbol()]);assert.equal(next.steps[0].title,'步骤 2：向上谷折');
});

test('legacy drawings with existing symbols are recognized before their removal so later placement cannot rename a cleared title',()=>{
  const {project}=fixture(),id=project.activeStepId,legacy=structuredClone(project);legacy.steps[0].title='已有自定义标题';legacy.steps[0].annotations=[titleSymbol('existing')];
  const loaded=importDiagramProject(exportDiagramProject(legacy)),cleared=updateDiagramStep(loaded,id,{title:''}),removed=updateDiagramAnnotations(cleared,id,[]);
  assert.equal(removed.steps[0].firstSymbolPlaced,true);assert.equal(removed.steps[0].title,'');
  const later=updateDiagramAnnotations(importDiagramProject(exportDiagramProject(removed)),id,[titleSymbol('new','swivelDouble')]);assert.equal(later.steps[0].title,'');
});

test('pasting several first symbols uses the first symbol in drawing order and line-only cancellation consumes no title suggestion',()=>{
  const {project}=fixture(),id=project.activeStepId,cancelled=updateDiagramAnnotations(project,id,[]);
  assert.equal(cancelled.steps[0].firstSymbolPlaced,undefined);assert.equal(cancelled.steps[0].title,'');
  const pasted=updateDiagramAnnotations(cancelled,id,[titleLine,titleSymbol('a','swivelDouble'),titleSymbol('b','fold')]);assert.equal(pasted.steps[0].title,'双向段折箭头');assert.equal(pasted.steps[0].firstSymbolPlaced,true);
});

test('copied steps retain custom and automatic titles without suffixes or duplicated numbering, with independent first-symbol state',()=>{
  const {project,factory}=fixture(),id=project.activeStepId,first=updateDiagramAnnotations(project,id,[titleSymbol()]),copy=duplicateDiagramStep(first,id,factory);
  assert.equal(copy.steps[1].title,'谷折箭头');assert.equal(copy.steps[1].firstSymbolPlaced,true);assert.notEqual(copy.steps[1].annotations,copy.steps[0].annotations);
  const custom=duplicateDiagramStep(updateDiagramStep(project,id,{title:'摊开右袋'}),id,factory);assert.equal(custom.steps[1].title,'摊开右袋');
  const blank=duplicateDiagramStep(project,id,factory);assert.equal(blank.steps[1].title,'');
  const numbered=duplicateDiagramStep(updateDiagramStep(project,id,{title:'步骤 17'}),id,factory);assert.equal(numbered.steps[1].title,'');continuous(copy);continuous(custom);
});

test('first-symbol metadata validates strictly and invalid annotations cannot partially rename an otherwise valid project',()=>{
  const {project}=fixture(),id=project.activeStepId,before=structuredClone(project);
  for(const marker of ['yes',1,null,{}]){const saved=JSON.parse(exportDiagramProject(project));saved.steps[0].firstSymbolPlaced=marker;assert.throws(()=>importDiagramProject(JSON.stringify(saved)),/首次符号/);}
  const invalid={...titleSymbol(),width:Infinity};assert.throws(()=>updateDiagramAnnotations(project,id,[invalid]));assert.deepEqual(project,before);
  const noTitle=updateDiagramStep(project,id,{title:'   '}),next=updateDiagramAnnotations(noTitle,id,[titleSymbol('first','open')]);assert.equal(next.steps[0].title,'撑开纸层');
});

test('linked crease reconciliation commits the first symbol title and geometry together through the common annotation entry point',()=>{
  const {project,result}=fixture(),id=project.activeStepId,posed=adoptDiagramPose(project,id,project.states[0].id,result),original=structuredClone(posed);
  const config={enabled:true,layers:'top' as const,selectedFaces:[]},line={...titleLine,a:[20,25] as [number,number],b:[50,25] as [number,number]};
  const linked=reconcileDiagramFoldAnnotations(posed,id,[line,titleSymbol('first','open')],config);
  assert.equal(linked.steps[0].title,'撑开纸层');assert.equal(linked.steps[0].firstSymbolPlaced,true);assert.equal(linked.steps[0].annotations!.filter(annotation=>annotation.kind==='symbol').length,1);assert.equal(linked.steps[0].foldLink!.enabled,true);assert.deepEqual(posed,original);
});

test('diagram projects preserve source metadata above the former file quota',()=>{
  const source=blankDoc('大折序工程',100,100);source.metadata={padding:'x'.repeat(33*1024*1024)};
  const project=createDiagramProject(source,ids()),text=exportDiagramProject(project);
  assert.ok(Buffer.byteLength(text)>32*1024*1024);
  assert.deepEqual(importDiagramProject(text).states,project.states);
});
