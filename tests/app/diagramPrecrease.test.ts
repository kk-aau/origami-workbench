import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import type {Assignment,Doc,Point,Segment} from '../../src/core/types';
import {isDiagramCPExistingLine,validateDiagramAnnotations,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {adoptDiagramPose,advanceDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramCP,updateDiagramFoldLink,updateDiagramPoseView,validateDiagramFoldLink,type DiagramProject} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments,diffDiagramFoldCP,mapDiagramFoldLines,projectDiagramFoldCP,retainDiagramPrecreaseIntents} from '../../src/app/diagramFoldLink';
import {adoptDiagramFoldCP,reconcileDiagramFoldAnnotations,reapplyDiagramFoldLayerScope,refreshDiagramFoldDrawing,updateDiagramFoldDrawingFromCP} from '../../src/app/diagramFoldTransactions';
import {screenshotStepStagesFixture1016} from '../fixtures/screenshotStepStages1016';

const config={enabled:true,layers:'all' as const,selectedFaces:[]};
const line=(a:Point,b:Point,id='precrease'):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#314b3c',width:.7,foldAction:'precrease'});
const segment=(a:Point,b:Point,assignment:Assignment,id='manual'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:assignment==='U'?null:0});
function fixture(crease?:Assignment){
  const raw=blankDoc('预折事务',100,100);
  if(crease)raw.segments.push(segment([50,0],[50,100],crease,'old-fold'));
  const doc=normalizeDiagramCP(raw).doc;
  let i=0,project=createDiagramProject(doc,()=>`pre-${++i}`);const stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,defaultModelView());
  project=updateDiagramFoldLink(project,stepId,config);
  return {doc,project,stepId};
}
const state=(p:DiagramProject,id:string)=>p.states.find(s=>s.id===id)!;
const before=(p:DiagramProject)=>state(p,p.steps[0].beforeId);
const after=(p:DiagramProject)=>state(p,p.steps[0].afterId);
const sameCP=(a:Doc,b:Doc)=>{assert.deepEqual(diffDiagramFoldCP(a,b),[]);assert.deepEqual(diffDiagramFoldCP(b,a),[]);};
const linked=(p:DiagramProject)=>p.steps[0].annotations!.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain'));
const existing=(p:DiagramProject)=>p.steps[0].annotations!.filter(isDiagramCPExistingLine);

test('precreasing records physical F/0° geometry and retains this step valley intent without changing the source',()=>{
  const {project,stepId}=fixture(),old=structuredClone(project),a=line([0,30],[100,30]);
  const mapped=mapDiagramFoldLines(project.steps[0].pose!,[a],config,before(project));
  assert.deepEqual(mapped.segments.map(s=>[s.assignment,s.angle]),[['F',0]]);
  assert.deepEqual(mapped.precreases.map(s=>[s.assignment,s.angle]),[['V',180]]);
  assert.ok(mapped.preview.every(p=>p.assignment==='F'&&p.style==='valley'&&p.existing===false));
  const next=reconcileDiagramFoldAnnotations(project,stepId,[a]);
  assert.deepEqual(project,old);assert.deepEqual(before(next),before(project));
  assert.deepEqual(next.steps[0].foldLink!.generated!.map(s=>[s.assignment,s.angle]),[['F',0]]);
  assert.equal(linked(next)[0].foldAction,'precrease');
  const pose=computeFlatFold(after(next).doc);assert.equal(pose.geometry.status,'ready');
  const graph=pose.geometry.graph!;
  assert.ok(pose.geometry.vertices.every((p,i)=>distance(p,graph.vertices_coords[i])<1e-6));
});

test('all-layer precrease maps every covered layer to F while preserving opposite material valley/mountain intents',()=>{
  const {project,stepId}=fixture('V'),next=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  assert.deepEqual(linked(next)[0].foldFaces,[0,1]);
  assert.equal(next.steps[0].foldLink!.generated!.length,2);
  assert.ok(next.steps[0].foldLink!.generated!.every(s=>s.assignment==='F'&&s.angle===0));
  assert.deepEqual(new Set(next.steps[0].foldLink!.precreases!.map(s=>s.assignment)),new Set(['M','V']));
  assert.ok(after(next).doc.segments.some(s=>s.id.startsWith('old-fold')&&s.assignment==='V'));
  const preview=projectDiagramFoldCP(next.steps[0].pose!,before(next).doc,after(next).doc,before(next),next.steps[0].foldLink!.precreases).preview;
  assert.ok(preview.every(p=>p.style==='valley'&&p.assignment==='F'&&!p.existing));
  assert.deepEqual(new Set(preview.map(p=>p.visibility)),new Set(['visible','hidden']));
});

test('precrease range can expand, narrow and explicitly suspend without activating unrelated layers',()=>{
  const {project,stepId}=fixture('V'),selected={...config,layers:'selected' as const,selectedFaces:[0]};
  const narrow=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,selected),stepId,[line([0,30],[50,30])]);
  assert.deepEqual(linked(narrow)[0].foldFaces,[0]);assert.equal(narrow.steps[0].foldLink!.generated!.length,1);
  const expanded=reapplyDiagramFoldLayerScope(narrow,stepId,{...narrow.steps[0].foldLink!,layers:'all'});
  assert.deepEqual(linked(expanded)[0].foldFaces,[0,1]);assert.equal(expanded.steps[0].foldLink!.generated!.length,2);
  const empty=reapplyDiagramFoldLayerScope(expanded,stepId,{...expanded.steps[0].foldLink!,layers:'selected',selectedFaces:[]});
  assert.deepEqual(linked(empty)[0].foldFaces,[]);assert.deepEqual(empty.steps[0].foldLink!.precreases,[]);
  sameCP(after(empty).doc,after(project).doc);
  const loaded=importDiagramProject(exportDiagramProject(empty));
  const moved=reconcileDiagramFoldAnnotations(loaded,stepId,linked(loaded).map(a=>({...a,a:[0,60] as Point,b:[50,60] as Point})));
  assert.deepEqual(linked(moved)[0].foldFaces,[]);sameCP(after(moved).doc,after(project).doc);
});

test('moving and deleting precreases preserve manually authored F geometry and restore covered source creases',()=>{
  const {project,stepId}=fixture(),hand=updateDiagramCP(project,after(project).id,applyDiagramFoldSegments(after(project).doc,[segment([10,30],[40,30],'F','hand-flat')]));
  const next=reconcileDiagramFoldAnnotations(hand,stepId,[line([0,30],[100,30])]);
  assert.equal(next.steps[0].foldLink!.generated!.reduce((n,s)=>n+distance(s.a,s.b),0),70);
  const moved=reconcileDiagramFoldAnnotations(next,stepId,linked(next).map(a=>({...a,a:[0,60] as Point,b:[100,60] as Point})));
  assert.ok(after(moved).doc.segments.some(s=>s.assignment==='F'&&s.a[1]===30&&s.b[1]===30));
  const deleted=reconcileDiagramFoldAnnotations(moved,stepId,[]);
  sameCP(after(deleted).doc,after(hand).doc);assert.deepEqual(deleted.steps[0].foldLink!.precreases,[]);
  assert.equal(existing(deleted).length,1);
});

test('precreasing over an already folded edge never unfolds or owns it, and only matching known MV retains a return intent',()=>{
  for(const assignment of ['M','V','U'] as const){
    const {project,stepId}=fixture(assignment);
    const next=reconcileDiagramFoldAnnotations(project,stepId,[line([50,20],[50,80])]);
    sameCP(after(next).doc,after(project).doc);
    assert.deepEqual(next.steps[0].foldLink!.generated,[]);
    const intents=next.steps[0].foldLink!.precreases!;
    if(assignment==='U')assert.deepEqual(intents,[]);
    else{
      assert.equal(intents.length,1);assert.equal(intents[0].assignment,assignment);assert.equal(intents[0].angle,assignment==='M'?-180:180);
      assert.ok(Math.abs(distance(intents[0].a,intents[0].b)-60)<1e-6);
    }
    const deleted=reconcileDiagramFoldAnnotations(next,stepId,[]);
    sameCP(after(deleted).doc,after(project).doc);assert.deepEqual(deleted.steps[0].foldLink!.precreases,[]);assert.deepEqual(deleted.steps[0].foldLink!.generated,[]);
  }
});

function twoLayerReturnFixture(){
  const fixture=screenshotStepStagesFixture1016(1,1),stepId=fixture.stepId;
  let project=updateDiagramPoseView(fixture.project,stepId,{...defaultModelView(),side:'back'});
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'selected',selectedFaces:[3,5]});
  const instruction:DiagramLineAnnotation={...line([100*(1-1/Math.sqrt(2)),0],[0,0],'two-layer-instruction'),foldFaces:[3,5]};
  return {project,stepId,instruction,next:reconcileDiagramFoldAnnotations(project,stepId,[instruction])};
}
const intentDoc=(project:DiagramProject):Doc=>({...before(project).doc,segments:project.steps[0].foldLink!.precreases??[]});
const scope=(project:DiagramProject)=>[...new Set(linked(project).filter(a=>a.foldAction==='precrease').flatMap(a=>a.foldFaces??[]))].sort((a,b)=>a-b);

test('one real two-layer drawing records a new vertical press and the lower unchanged mountain return together',()=>{
  const {project,next}=twoLayerReturnFixture(),intents=next.steps[0].foldLink!.precreases!,t=100*(1-1/Math.sqrt(2)),u=100-t;
  assert.equal(intents.length,2);assert.ok(intents.every(segment=>segment.assignment==='M'&&segment.angle===-180));
  assert.ok(intents.some(segment=>Math.abs(segment.a[0]-u)<1e-6&&Math.abs(segment.b[0]-u)<1e-6));
  assert.ok(intents.some(segment=>Math.abs(segment.a[1]-t)<1e-6&&Math.abs(segment.b[1]-t)<1e-6));
  sameCP({...before(next).doc,segments:before(next).doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V')},{...after(next).doc,segments:after(next).doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V')});
  assert.deepEqual(before(next),before(project));assert.deepEqual(scope(next),[3,5]);
  assert.ok(next.steps[0].foldLink!.generated!.every(segment=>segment.assignment==='F'&&segment.angle===0));
  assert.ok(Math.abs(next.steps[0].foldLink!.generated!.reduce((sum,segment)=>sum+distance(segment.a,segment.b),0)-t)<1e-6);
  const preview=projectDiagramFoldCP(next.steps[0].pose!,before(next).doc,after(next).doc,before(next),intents).preview;
  assert.deepEqual([...new Set(preview.filter(part=>part.existing===false).map(part=>part.face))],[3],'ordinary CP preview does not repaint the unchanged lower mountain as F');
});

test('two-layer return intent survives restoration, refresh, explicit update and adoption without adding another material bank',()=>{
  const {next,stepId}=twoLayerReturnFixture(),saved=structuredClone(next);
  const observed=refreshDiagramFoldDrawing(updateDiagramPoseView(next,stepId,{...defaultModelView(),side:'front',rotation:37}),stepId,next.steps[0].pose!.view);
  const variants=[next,importDiagramProject(exportDiagramProject(next)),refreshDiagramFoldDrawing(next,stepId),updateDiagramFoldDrawingFromCP(next,stepId),adoptDiagramFoldCP(next,stepId,after(next).doc),observed];
  for(const variant of variants){
    sameCP(intentDoc(variant),intentDoc(next));assert.deepEqual(scope(variant),[3,5]);
    const remapped=reconcileDiagramFoldAnnotations(variant,stepId,variant.steps[0].annotations!);
    sameCP(after(remapped).doc,after(next).doc);sameCP(intentDoc(remapped),intentDoc(next));assert.deepEqual(scope(remapped),[3,5]);
  }
  assert.deepEqual(next,saved);
});

test('narrowing or clearing the selected two-layer operation removes only its intent and owned F geometry',()=>{
  const {project,next,stepId}=twoLayerReturnFixture();
  const upper=reapplyDiagramFoldLayerScope(next,stepId,{...next.steps[0].foldLink!,layers:'selected',selectedFaces:[3]});
  assert.deepEqual(scope(upper),[3]);assert.equal(upper.steps[0].foldLink!.precreases!.length,1);sameCP(after(upper).doc,after(next).doc);
  const lower=reapplyDiagramFoldLayerScope(next,stepId,{...next.steps[0].foldLink!,layers:'selected',selectedFaces:[5]});
  assert.deepEqual(scope(lower),[5]);assert.equal(lower.steps[0].foldLink!.precreases!.length,1);assert.deepEqual(lower.steps[0].foldLink!.generated,[]);sameCP(after(lower).doc,after(project).doc);
  const expanded=reapplyDiagramFoldLayerScope(lower,stepId,{...lower.steps[0].foldLink!,layers:'selected',selectedFaces:[3,5]});
  sameCP(intentDoc(expanded),intentDoc(next));sameCP(after(expanded).doc,after(next).doc);assert.deepEqual(scope(expanded),[3,5]);
  const empty=reapplyDiagramFoldLayerScope(next,stepId,{...next.steps[0].foldLink!,layers:'selected',selectedFaces:[]});
  assert.deepEqual(empty.steps[0].foldLink!.precreases,[]);assert.deepEqual(empty.steps[0].foldLink!.generated,[]);sameCP(after(empty).doc,after(project).doc);
  const deleted=reconcileDiagramFoldAnnotations(next,stepId,[]);
  assert.deepEqual(deleted.steps[0].foldLink!.precreases,[]);assert.deepEqual(deleted.steps[0].foldLink!.generated,[]);sameCP(after(deleted).doc,after(project).doc);
});

test('retained folding takes precedence over coincident precrease instructions irrespective of draw order',()=>{
  const {project,stepId}=fixture(),pre=line([0,30],[100,30]),fold={...pre,id:'actual-fold',foldAction:'fold' as const};
  for(const annotations of [[pre,fold],[fold,pre]]){
    const next=reconcileDiagramFoldAnnotations(project,stepId,annotations);
    assert.ok(after(next).doc.segments.filter(s=>s.assignment!=='B').every(s=>s.assignment==='V'));
    assert.deepEqual(next.steps[0].foldLink!.precreases,[]);
    assert.ok(next.steps[0].foldLink!.generated!.every(s=>s.assignment==='V'));
  }
});

test('observation flip, rotation and project restoration retain precrease intent and editable layer identities',()=>{
  const {project,stepId}=fixture('V'),next=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  const states=structuredClone(next.states),settings=structuredClone(next.steps[0].foldLink);
  const observed=refreshDiagramFoldDrawing(updateDiagramPoseView(next,stepId,{...defaultModelView(),side:'back',rotation:90}),stepId);
  assert.deepEqual(observed.states,states);assert.deepEqual(observed.steps[0].foldLink,settings);
  assert.ok(linked(observed).every(a=>a.style==='mountain'&&a.foldAction==='precrease'));
  const projection=modelProjection(next.steps[0].pose!.result.geometry.vertices,true,90);
  assert.ok(linked(observed).some(a=>distance(a.a,projection.project([0,30]))<1e-6||distance(a.b,projection.project([0,30]))<1e-6));
  const loaded=importDiagramProject(exportDiagramProject(observed));
  assert.deepEqual(loaded.steps[0].foldLink,settings);
  const remapped=reconcileDiagramFoldAnnotations(loaded,stepId,loaded.steps[0].annotations!,loaded.steps[0].foldLink);
  sameCP(after(remapped).doc,after(next).doc);
  sameCP(after(reconcileDiagramFoldAnnotations(remapped,stepId,[])).doc,after(project).doc);
});

test('the next step inherits physical F as existing creases without copying precrease intent or instruction arrows',()=>{
  const {project,stepId}=fixture(),next=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[100,30])]);
  let i=100,advanced=advanceDiagramStep(next,()=>`pre-${++i}`);const step=advanced.steps[1],source=state(advanced,step.beforeId);
  assert.equal(step.foldLink!.precreases,undefined);assert.deepEqual(step.annotations,[]);
  const pose=computeFlatFold(source.doc);assert.equal(pose.geometry.status,'ready');
  advanced=adoptDiagramPose(advanced,step.id,source.id,pose,defaultModelView());
  advanced=refreshDiagramFoldDrawing(advanced,step.id);
  const handles=advanced.steps[1].annotations!.filter(isDiagramCPExistingLine);
  assert.ok(handles.length);assert.ok(handles.every(a=>a.style==='crease'&&a.foldAction===undefined));
  assert.deepEqual(diffDiagramFoldCP(source.doc,state(advanced,step.afterId).doc),[]);
});

test('inherited F handles are selectable records and ordinary deletion or movement cannot alter their route',()=>{
  const {project,stepId}=fixture('F'),withExisting=refreshDiagramFoldDrawing(project,stepId),handle=existing(withExisting)[0];
  assert.ok(handle);const states=structuredClone(withExisting.states);
  const moved=reconcileDiagramFoldAnnotations(withExisting,stepId,[{...handle,a:[0,20],b:[100,20]}]);
  assert.deepEqual(existing(moved),existing(withExisting));assert.deepEqual(moved.states,states);
  const deleted=reconcileDiagramFoldAnnotations(withExisting,stepId,[]);
  assert.deepEqual(existing(deleted),existing(withExisting));assert.deepEqual(deleted.states,states);
});

test('activating an inherited F crease changes only current after CP and restores F when the instruction is removed',()=>{
  const {project,stepId}=fixture('F'),withExisting=refreshDiagramFoldDrawing(project,stepId),handle=existing(withExisting)[0];
  const active={...handle,id:'activated-existing',style:'valley' as const,foldAction:'fold' as const};
  const next=reconcileDiagramFoldAnnotations(withExisting,stepId,[active]);
  assert.deepEqual(before(next),before(project));assert.equal(existing(next).length,0);
  assert.ok(after(next).doc.segments.filter(s=>s.assignment!=='B').every(s=>s.assignment==='V'));
  const removed=reconcileDiagramFoldAnnotations(next,stepId,[]);
  sameCP(after(removed).doc,after(project).doc);assert.ok(existing(removed).length);
});

test('CP-side edits trim precrease intent to surviving F and new legacy F-only edits become existing handles',()=>{
  const {project,stepId}=fixture(),next=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[100,30])]);
  const edited=applyDiagramFoldSegments(after(next).doc,[segment([0,30],[50,30],'V','activated-half')]);
  const adopted=adoptDiagramFoldCP(next,stepId,edited);
  assert.equal(adopted.steps[0].foldLink!.precreases!.reduce((n,s)=>n+distance(s.a,s.b),0),50);
  assert.ok(linked(adopted).some(a=>a.foldAction==='precrease'));assert.ok(linked(adopted).some(a=>a.foldAction!== 'precrease'));
  const legacy=adoptDiagramFoldCP(project,stepId,applyDiagramFoldSegments(after(project).doc,[segment([0,60],[100,60],'F','external-flat')]));
  assert.ok(existing(legacy).length);assert.equal(legacy.steps[0].foldLink!.precreases,undefined);
  assert.deepEqual(legacy.steps[0].foldLink!.generated,[]);
});

test('CP-authored existing F survives later drawing folds and deletion even with a legacy F ownership ledger',()=>{
  const {project,stepId}=fixture(),f=segment([0,60],[100,60],'F','external-flat');
  const adopted=adoptDiagramFoldCP(project,stepId,applyDiagramFoldSegments(after(project).doc,[f]));
  for(const inherited of [adopted,updateDiagramFoldLink(adopted,stepId,{...adopted.steps[0].foldLink!,generated:[f]})]){
    const fold={...line([0,30],[100,30],'actual'),foldAction:'fold' as const};
    const drawn=reconcileDiagramFoldAnnotations(inherited,stepId,[...inherited.steps[0].annotations!,fold]);
    assert.ok(after(drawn).doc.segments.some(s=>s.assignment==='F'&&s.a[1]===60&&s.b[1]===60));
    const removed=reconcileDiagramFoldAnnotations(drawn,stepId,existing(drawn));
    sameCP(after(removed).doc,after(adopted).doc);
  }
});

test('precrease annotations and intent ledgers roundtrip with strict semantic validation',()=>{
  validateDiagramAnnotations([line([0,30],[100,30])]);
  assert.throws(()=>validateDiagramAnnotations([{...line([0,30],[100,30]),style:'auxiliary'}]),/折线用途/);
  assert.throws(()=>validateDiagramAnnotations([{...line([0,30],[100,30]),foldAction:'unfold'}]),/折线用途/);
  validateDiagramFoldLink({...config,generated:[segment([0,30],[100,30],'F')],precreases:[segment([0,30],[100,30],'V')]});
  validateDiagramFoldLink({...config,precreases:[{...segment([0,30],[100,30],'V'),angle:0},{...segment([0,30],[100,30],'M','partial'),angle:-90}]});
  assert.throws(()=>validateDiagramFoldLink({...config,generated:[{...segment([0,30],[100,30],'F'),angle:180}]}),/0 度/);
  for(const invalid of [segment([0,30],[100,30],'F'),{...segment([0,30],[100,30],'V'),angle:null},{...segment([0,30],[100,30],'V'),angle:NaN},{...segment([0,30],[100,30],'V'),angle:181}, {...segment([0,30],[100,30],'M'),angle:180}])
    assert.throws(()=>validateDiagramFoldLink({...config,precreases:[invalid]}),/预折意图/);
});

test('shared intent retention admits only same-direction unchanged old folds and keeps IDs unique across flat and folded portions',()=>{
  const before=blankDoc('retain',100,100),old=segment([0,50],[100,50],'M','old');before.segments.push(old);
  const intent={...old,id:'intent'},opposite={...intent,id:'opposite',assignment:'V' as const,angle:180};
  const same=retainDiagramPrecreaseIntents(before,before,[intent,opposite]);assert.equal(same.length,1);assert.equal(same[0].assignment,'M');
  const split=applyDiagramFoldSegments(before,[segment([0,50],[50,50],'F','opened-half')]),retained=retainDiagramPrecreaseIntents(before,split,[intent]);
  assert.ok(Math.abs(retained.reduce((sum,s)=>sum+distance(s.a,s.b),0)-100)<1e-6);assert.equal(new Set(retained.map(s=>s.id)).size,retained.length);
  const reversed=applyDiagramFoldSegments(before,[segment([0,50],[100,50],'V','reversed')]);assert.deepEqual(retainDiagramPrecreaseIntents(before,reversed,[intent]),[]);
  const empty=blankDoc('unfolded',100,100),newFold=applyDiagramFoldSegments(empty,[old]);assert.deepEqual(retainDiagramPrecreaseIntents(empty,newFold,[intent]),[]);
});
