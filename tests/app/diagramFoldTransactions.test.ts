import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import type {Assignment,Doc,Point,Segment} from '../../src/core/types';
import type {DiagramAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramProject} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink,updateDiagramCP,updateDiagramPoseView,
  updateDiagramAnnotations,updateDiagramStep,updateDiagramHiddenFaces,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {diffDiagramFoldCP,applyDiagramFoldSegments,mapDiagramFoldLines,projectDiagramFoldCP,diagramFoldStartingFace} from '../../src/app/diagramFoldLink';
import {setDiagramStartingFace} from '../../src/app/diagramFoldSettings';
import {resolveStartingFace} from '../../src/app/flatFoldSettings';
import {reconcileDiagramFoldAnnotations,reapplyDiagramFoldLayerScope,changeDiagramFoldLayerScope,adoptDiagramFoldCP,refreshDiagramFoldDrawing,updateDiagramFoldDrawingFromCP} from '../../src/app/diagramFoldTransactions';
import {diagramFoldBackgroundLines,drawingSVG} from '../../src/app/diagramDrawing';
import {isolateDiagramLineEdits} from '../../src/app/diagramLineEditScope';

const config={enabled:true,layers:'all' as const,selectedFaces:[]};
const line=(a:Point,b:Point,id='new-fold'):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#314b3c',width:.7});
const segment=(a:Point,b:Point,assignment:Assignment,id='manual'):Segment=>({id,a,b,assignment,
  angle:assignment==='M'?-180:assignment==='V'?180:assignment==='U'?null:0});
function fixture(assignment:Assignment='V'){
  const raw=blankDoc('事务叠纸',100,100);raw.segments.push(segment([50,0],[50,100],assignment,'old-fold'));
  const doc=normalizeDiagramCP(raw).doc;
  let i=0,project=createDiagramProject(doc,()=>`transaction-${++i}`),stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,defaultModelView());
  project=updateDiagramFoldLink(project,stepId,config);
  return {doc,project,stepId};
}
function partialOverlapFixture(){
  const raw=blankDoc('局部重叠的上层范围',100,100);raw.segments.push(segment([25,0],[25,100],'M','off-centre-fold'));
  const doc=normalizeDiagramCP(raw).doc;let i=0,project=createDiagramProject(doc,()=>`partial-range-${++i}`),stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,defaultModelView());
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'top',selectedFaces:[]});
  const manual=segment([60,90],[80,90],'V','unrelated-hand-authored');
  project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(project.states[1].doc,[manual]));
  return {project,stepId,stroke:line([-50,40],[25,40],'cross-top'),second:line([-50,70],[25,70],'other-fold')};
}
const before=(p:DiagramProject)=>p.states.find(s=>s.id===p.steps[0].beforeId)!;
const after=(p:DiagramProject)=>p.states.find(s=>s.id===p.steps[0].afterId)!;
const sameCP=(a:Doc,b:Doc)=>{assert.deepEqual(diffDiagramFoldCP(a,b),[]);assert.deepEqual(diffDiagramFoldCP(b,a),[]);};
function foldLines(p:DiagramProject){return (p.steps[0].annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain'));}
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);

test('changing future drawing scope leaves existing folds, CP revisions and poses intact',()=>{
  const {project,stepId}=fixture(),old={...config,layers:'selected' as const,selectedFaces:[0]};
  const linked=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,old),stepId,[line([0,30],[50,30],'old')]);
  const snapshot=structuredClone(linked);
  for(const scope of [{layers:'all' as const,selectedFaces:[]},{layers:'top' as const,selectedFaces:[]},{layers:'selected' as const,selectedFaces:[1]},{layers:'selected' as const,selectedFaces:[]}]){
    const changed=changeDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,...scope},[]);
    assert.deepEqual(changed.states,linked.states);assert.deepEqual(changed.steps[0].pose,linked.steps[0].pose);
    assert.deepEqual(changed.steps[0].annotations,linked.steps[0].annotations);
    assert.deepEqual(changed.steps[0].foldLink!.generated,linked.steps[0].foldLink!.generated);
    if(scope.layers==='selected'&&!scope.selectedFaces.length)continue;
    const next=reconcileDiagramFoldAnnotations(changed,stepId,[...changed.steps[0].annotations!,line([0,60],[50,60],'new')]);
    assert.deepEqual(foldLines(next).find(a=>a.id==='old')!.foldFaces,[0]);
    const expected=mapDiagramFoldLines(linked.steps[0].pose!,[line([0,60],[50,60],'new')],changed.steps[0].foldLink!,before(linked));
    assert.deepEqual(foldLines(next).find(a=>a.id==='new')!.foldFaces,[...new Set(expected.preview.map(p=>p.face))].sort());
  }
  assert.deepEqual(linked,snapshot);
});

test('legacy strokes keep their old range when future defaults change and the project is reopened',()=>{
  const {project,stepId}=fixture(),old={...config,layers:'selected' as const,selectedFaces:[0]};
  const linked=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,old),stepId,[line([0,30],[50,30],'old')]);
  const legacy=updateDiagramAnnotations(linked,stepId,linked.steps[0].annotations!.map(a=>{if(a.kind!=='line')return a;const {foldFaces,...unbound}=a;return unbound;}));
  const changed=changeDiagramFoldLayerScope(legacy,stepId,{...legacy.steps[0].foldLink!,layers:'selected',selectedFaces:[1]});
  assert.deepEqual(changed.states,legacy.states);assert.deepEqual(foldLines(changed)[0].foldFaces,[0]);
  const loaded=importDiagramProject(exportDiagramProject(changed));
  const next=reconcileDiagramFoldAnnotations(loaded,stepId,[...loaded.steps[0].annotations!,line([0,60],[50,60],'new')]);
  assert.deepEqual(foldLines(next).map(a=>[a.id,a.foldFaces]),[['old',[0]],['new',[1]]]);
});

test('editing selected strokes does not overwrite the future drawing defaults',()=>{
  const {project,stepId}=fixture();
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30],'one'),line([0,60],[50,60],'two')]);
  const changed=changeDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,layers:'selected',selectedFaces:[1]},['one']);
  assert.deepEqual(foldLines(changed).map(a=>[a.id,a.foldFaces]),[['one',[1]],['two',[0,1]]]);
  assert.equal(changed.steps[0].foldLink!.layers,'all');
  const next=reconcileDiagramFoldAnnotations(changed,stepId,[...changed.steps[0].annotations!,line([0,80],[50,80],'new')]);
  assert.deepEqual(foldLines(next).find(a=>a.id==='new')!.foldFaces,[0,1]);
});

test('coincident screen strokes on an exposed lower sheet retain independent material scopes after showing all sheets',()=>{
  let {project,stepId}=fixture();project=updateDiagramFoldLink(project,stepId,{...config,layers:'top'});
  const upper=line([0,30],[50,30],'upper-stroke');
  project=reconcileDiagramFoldAnnotations(project,stepId,[upper]);
  const first=foldLines(project)[0],upperFace=first.foldFaces![0],savedUpper=mapDiagramFoldLines(project.steps[0].pose!,[first],{...config,layers:'selected',selectedFaces:first.foldFaces!}).segments;
  project=updateDiagramHiddenFaces(project,stepId,[upperFace]);
  const lower={...line([0,30],[50,30],'lower-stroke'),style:'mountain' as const};
  project=reconcileDiagramFoldAnnotations(project,stepId,[...(project.steps[0].annotations??[]),lower]);
  const instructions=foldLines(project),added=instructions.find(a=>a.id==='lower-stroke')!;
  assert.ok(added.foldFaces?.length);assert.ok(!added.foldFaces.includes(upperFace),'hidden upper sheet cannot capture the new stroke');
  const saved=structuredClone(after(project).doc);
  project=updateDiagramHiddenFaces(project,stepId,[]);
  project=reconcileDiagramFoldAnnotations(project,stepId,project.steps[0].annotations!.map(a=>a.id==='lower-stroke'?{...a,width:1.1}:a));
  sameCP(after(project).doc,saved);
  for(const s of savedUpper)assert.ok(after(project).doc.segments.some(n=>n.assignment===s.assignment&&distance(n.a,s.a)<1e-6&&distance(n.b,s.b)<1e-6));
});

test('M to F without a new CP segment keeps a visible mountain opening guide through refresh and export',()=>{
  const {project,stepId}=fixture('M'),opened=structuredClone(after(project).doc);
  const hinge=opened.segments.find(s=>s.id==='old-fold')!;hinge.assignment='F';hinge.angle=0;
  const changed=updateDiagramCP(project,project.steps[0].afterId,opened);
  const refreshed=refreshDiagramFoldDrawing(changed,stepId),step=refreshed.steps[0];
  const guide=step.annotations!.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.id.startsWith('cp-existing:')&&a.style==='mountain');
  assert.ok(guide.length>0);
  const preview=projectDiagramFoldCP(step.pose!,before(refreshed).doc,after(refreshed).doc,before(refreshed)).preview;
  assert.ok(preview.some(part=>part.unfolding&&part.style==='mountain'));
  const svg=drawingSVG(step.pose!,step.annotations!,'','',preview);
  assert.match(svg,/stroke-dasharray/);assert.match(svg,/stroke="#41634e" stroke-width="0.7"/);
  assert.deepEqual(importDiagramProject(exportDiagramProject(refreshed)).steps[0].annotations,step.annotations);
});

test('a fixed F-marked sheet accepts a corner-to-interior stroke and retains its exact crease and fixed reference',()=>{
  const doc=blankDoc('固定纸面短折线',100,100);
  for(const x of [25,50,75])doc.segments.push(segment([x,0],[x,100],'F',`mark-${x}`));
  let sequence=0,project=createDiagramProject(doc,()=>`fixed-branch-${++sequence}`),id=project.activeStepId;
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  const fixed={point:[80,20] as Point,matrix:[1,0,0,1,0,0] as [number,number,number,number,number,number]};
  project=updateDiagramFoldLink(project,id,{...config,fixed});
  project=updateDiagramCP(project,project.steps[0].afterId,setDiagramStartingFace(after(project).doc,0));
  project=refreshDiagramFoldDrawing(project,id);const original=structuredClone(project),stroke=line([0,0],[35,40]);
  const next=reconcileDiagramFoldAnnotations(project,id,[...project.steps[0].annotations!,stroke]),updated=after(next).doc,graph=buildDiagramFold(updated).graph;
  assert.deepEqual(resolveStartingFace(updated,graph),{face:diagramFoldStartingFace(updated,fixed,graph),stale:false});
  assert.deepEqual(next.steps[0].foldLink!.fixed,fixed);assert.deepEqual(next.steps[0].annotations!.find(a=>a.id===stroke.id),{...stroke,foldFaces:[0]});
  sameCP(updated,applyDiagramFoldSegments(after(project).doc,mapDiagramFoldLines(project.steps[0].pose!,[stroke],project.steps[0].foldLink!,before(project)).segments));
  const saved=importDiagramProject(exportDiagramProject(next));assert.deepEqual(resolveStartingFace(after(saved).doc,buildDiagramFold(after(saved).doc).graph),{face:0,stale:false});
  const removed=reconcileDiagramFoldAnnotations(next,id,next.steps[0].annotations!.filter(a=>a.id!==stroke.id));sameCP(after(removed).doc,after(project).doc);
  assert.deepEqual(removed.steps[0].foldLink!.fixed,fixed);assert.deepEqual(project,original);
});

test('completing a pending fixed-side stroke updates the root to the actual newly divided region',()=>{
  const doc=blankDoc('续画固定纸面折线',100,100);let sequence=0,project=createDiagramProject(doc,()=>`complete-branch-${++sequence}`),id=project.activeStepId;
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,computeFlatFold(doc));
  const fixed={point:[80,20] as Point,matrix:[1,0,0,1,0,0] as [number,number,number,number,number,number]};
  project=updateDiagramFoldLink(project,id,{...config,fixed});
  const first=line([0,0],[40,40],'first'),second=line([40,40],[100,100],'second');
  const pending=reconcileDiagramFoldAnnotations(project,id,[first]),completed=reconcileDiagramFoldAnnotations(pending,id,[...pending.steps[0].annotations!,second]);
  const updated=after(completed).doc,graph=buildDiagramFold(updated).graph;
  assert.equal(graph.faces_vertices!.length,2);assert.deepEqual(resolveStartingFace(updated,graph),{face:diagramFoldStartingFace(updated,fixed,graph),stale:false});
  assert.deepEqual(completed.steps[0].foldLink!.fixed,fixed);assert.equal(completed.steps[0].annotations!.filter(a=>a.kind==='line'&&a.style==='valley').length,2);
});

test('paper-exterior drawing fragments survive CP edits and repeated preview refreshes',()=>{
  const {project,stepId}=fixture(),stroke={...line([-20,30],[80,30],'cross-paper'),color:'#b34e32',width:1.2};
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]);
  const expected=diagramFoldBackgroundLines(linked.steps[0].pose!,[stroke]);assert.equal(expected.length,2);
  const changed=adoptDiagramFoldCP(linked,stepId,after(linked).doc);
  const background=(changed.steps[0].annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.id.startsWith('bg:'));
  assert.deepEqual(background,expected);
  assert.ok(background.every(a=>a.color===stroke.color&&a.width===stroke.width&&a.foldFaces?.length===0));
  const refreshed=refreshDiagramFoldDrawing(refreshDiagramFoldDrawing(changed,stepId),stepId);
  assert.deepEqual(refreshed.steps[0].annotations?.filter(a=>a.id.startsWith('bg:')),background);
  assert.deepEqual(after(refreshed),after(changed));
  assert.ok(after(refreshed).doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V').every(s=>s.a[0]>=-1e-7&&s.a[0]<=100+1e-7&&s.b[0]>=-1e-7&&s.b[0]<=100+1e-7));
});

test('one drawing transaction maps a real two-layer valley into opposite CP assignments and commits both together',()=>{
  const {project,stepId}=fixture(),original=structuredClone(project),a=line([0,30],[50,30]);
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[a]);
  assert.deepEqual(project,original);assert.deepEqual(before(linked),before(project));
  assert.equal(after(linked).revision,after(project).revision+1);
  assert.deepEqual(linked.steps[0].annotations,[{...a,foldFaces:[0,1]}]);assert.equal(linked.steps[0].foldLink!.generated!.length,2);
  assert.deepEqual(new Set(linked.steps[0].foldLink!.generated!.map(s=>s.assignment)),new Set(['M','V']));
  const preview=projectDiagramFoldCP(linked.steps[0].pose!,before(linked).doc,after(linked).doc,before(linked)).preview;
  assert.deepEqual(new Set(preview.map(s=>s.visibility)),new Set(['visible','hidden']));
  assert.ok(preview.every(s=>s.assignment==='V'));
});

test('moving and deleting a generated drawing crease retain hand-authored after CP geometry and the original before crease',()=>{
  const {project,stepId}=fixture(),manual=segment([10,80],[40,80],'M','hand-after');
  const hand=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(after(project).doc,[manual]));
  const generated=reconcileDiagramFoldAnnotations(hand,stepId,[line([0,30],[50,30])]);
  const moved=reconcileDiagramFoldAnnotations(generated,stepId,[line([0,60],[50,60])]);
  const expected=applyDiagramFoldSegments(after(hand).doc,mapDiagramFoldLines(project.steps[0].pose!,[line([0,60],[50,60])],config,before(project)).segments);
  sameCP(after(moved).doc,expected);
  const deleted=reconcileDiagramFoldAnnotations(moved,stepId,[]);
  sameCP(after(deleted).doc,after(hand).doc);assert.deepEqual(deleted.steps[0].foldLink!.generated,[]);
  assert.deepEqual(before(deleted).doc,before(project).doc);
});

test('dragging a clicked two-layer crease replaces both old CP routes without leaving a copied handle',()=>{
  const {project,stepId}=fixture(),manual=segment([10,80],[40,80],'M','independent-after');
  const hand=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(after(project).doc,[manual]));
  const generated=reconcileDiagramFoldAnnotations(hand,stepId,[line([0,30],[50,30])]);
  const original=foldLines(generated)[0],undoSnapshot=exportDiagramProject(generated),beforeSnapshot=structuredClone(before(generated));
  assert.deepEqual(original.foldFaces,[0,1]);
  const edited=isolateDiagramLineEdits(generated.steps[0].annotations!,[{...original,a:[0,60],b:[50,60]}],{[original.id]:[1]},()=> 'unwanted-old-route');
  const moved=reconcileDiagramFoldAnnotations(generated,stepId,edited);
  assert.equal(foldLines(moved).length,1);assert.deepEqual(foldLines(moved)[0].foldFaces,[0,1]);
  assert.ok(!moved.steps[0].annotations?.some(a=>a.id==='unwanted-old-route'));
  const expected=applyDiagramFoldSegments(after(hand).doc,mapDiagramFoldLines(project.steps[0].pose!,[line([0,60],[50,60])],config,before(project)).segments);
  sameCP(after(moved).doc,expected);
  assert.ok(!after(moved).doc.segments.some(s=>s.assignment!=='B'&&Math.abs(s.a[1]-30)<1e-6&&Math.abs(s.b[1]-30)<1e-6),'both generated source routes leave their old location');
  assert.ok(after(moved).doc.segments.some(s=>s.id===manual.id),'independent after-CP artwork survives');
  assert.deepEqual(before(moved),beforeSnapshot,'source CP and its physical old fold are unchanged');
  const preview=projectDiagramFoldCP(moved.steps[0].pose!,before(moved).doc,after(moved).doc,before(moved)).preview;
  assert.ok(preview.length>0&&preview.every(p=>Math.abs(p.a[1]-60)<1e-6&&Math.abs(p.b[1]-60)<1e-6||Math.abs(p.a[1]-80)<1e-6&&Math.abs(p.b[1]-80)<1e-6));
  const undone=importDiagramProject(undoSnapshot);sameCP(after(undone).doc,after(generated).doc);assert.deepEqual(foldLines(undone),[original]);
  const redone=importDiagramProject(exportDiagramProject(moved));sameCP(after(redone).doc,after(moved).doc);assert.deepEqual(foldLines(redone),foldLines(moved));
});

test('changing a covered U or F source assignment through the drawing restores its original kind on deletion',()=>{
  for(const assignment of ['U','F'] as const){
    const {project,stepId}=fixture(assignment),selection={...config,layers:'selected' as const,selectedFaces:[0]};
    const selected=updateDiagramFoldLink(project,stepId,selection);
    const changed=reconcileDiagramFoldAnnotations(selected,stepId,[line([50,20],[50,80])]);
    assert.ok(changed.steps[0].foldLink!.generated!.some(s=>s.assignment==='V'));
    const removed=reconcileDiagramFoldAnnotations(changed,stepId,[]);
    sameCP(after(removed).doc,after(project).doc);
    assert.ok(after(removed).doc.segments.filter(s=>s.assignment!=='B').every(s=>s.assignment===assignment));
  }
});

test('CP-side paired additions become one editable display crease and can be moved back into the CP',()=>{
  const {project,stepId}=fixture(),a=line([0,30],[50,30]),mapped=mapDiagramFoldLines(project.steps[0].pose!,[a],config,before(project));
  const cp=applyDiagramFoldSegments(after(project).doc,mapped.segments),adopted=adoptDiagramFoldCP(project,stepId,cp);
  assert.equal(foldLines(adopted).length,1);assert.equal(foldLines(adopted)[0].style,'valley');
  const changed=foldLines(adopted).map(s=>({...s,a:[s.a[0],60] as Point,b:[s.b[0],60] as Point}));
  const moved=reconcileDiagramFoldAnnotations(adopted,stepId,changed);
  const expected=applyDiagramFoldSegments(after(project).doc,mapDiagramFoldLines(project.steps[0].pose!,[line([0,60],[50,60])],config,before(project)).segments);
  sameCP(after(moved).doc,expected);
  sameCP(after(reconcileDiagramFoldAnnotations(moved,stepId,[])).doc,after(project).doc);
});

test('a single paper-layer CP addition stays confined to its original layer when its display handle moves',()=>{
  const {project,stepId}=fixture();
  const cp=applyDiagramFoldSegments(after(project).doc,[segment([0,30],[50,30],'V','only-left')]);
  const adopted=adoptDiagramFoldCP(project,stepId,cp),editable=foldLines(adopted);
  assert.equal(editable.length,1);
  assert.deepEqual(editable[0].foldFaces,[0]);
  const annotations=editable.map(s=>({...s,a:[s.a[0],60] as Point,b:[s.b[0],60] as Point}));
  const moved=reconcileDiagramFoldAnnotations(adopted,stepId,annotations);
  const expected=applyDiagramFoldSegments(after(project).doc,[segment([0,60],[50,60],'V','moved-left')]);
  sameCP(after(moved).doc,expected);
});

test('adopting an identical after CP does not manufacture a source revision',()=>{
  const {project,stepId}=fixture(),adopted=adoptDiagramFoldCP(project,stepId,after(project).doc);
  assert.equal(after(adopted).revision,after(project).revision);
  sameCP(after(adopted).doc,after(project).doc);
});

test('symbols and teaching marks remain independent while real fold lines are reconciled',()=>{
  const {project,stepId}=fixture(),symbol:DiagramAnnotation={id:'arrow',kind:'symbol',symbol:'fold',position:[10,10],size:30,rotation:0,color:'#314b3c',width:.7},mark={...line([0,90],[50,90],'mark'),style:'auxiliary' as const};
  const generated=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30]),symbol,mark]);
  const oldCP=structuredClone(after(generated)),next=reconcileDiagramFoldAnnotations(generated,stepId,[...foldLines(generated),{...symbol,position:[20,20]},mark]);
  assert.deepEqual(after(next),oldCP);
  const refreshed=refreshDiagramFoldDrawing(next,stepId);
  assert.deepEqual(refreshed.steps[0].annotations!.filter(a=>a.id==='arrow'||a.id==='mark'),next.steps[0].annotations!.filter(a=>a.id==='arrow'||a.id==='mark'));
});

test('flipping and rotating observation refresh only drawing handles, preserving CP revision and ownership',()=>{
  const {project,stepId}=fixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  const oldStates=structuredClone(linked.states),oldSettings=structuredClone(linked.steps[0].foldLink);
  const view={...defaultModelView(),side:'back' as const,rotation:90};
  const observed=updateDiagramPoseView(linked,stepId,view),refreshed=refreshDiagramFoldDrawing(observed,stepId);
  assert.deepEqual(refreshed.states,oldStates);assert.deepEqual(refreshed.steps[0].foldLink,oldSettings);
  const handles=foldLines(refreshed);assert.equal(handles.length,1);assert.equal(handles[0].style,'mountain');
  const projection=modelProjection(linked.steps[0].pose!.result.geometry.vertices,true,90);
  const a=projection.project([0,30]),b=projection.project([50,30]);
  assert.ok(distance(handles[0].a,a)<1e-5&&distance(handles[0].b,b)<1e-5||distance(handles[0].a,b)<1e-5&&distance(handles[0].b,a)<1e-5);
  const remapped=reconcileDiagramFoldAnnotations(refreshed,stepId,handles,{...refreshed.steps[0].foldLink!});
  sameCP(after(remapped).doc,after(linked).doc);
});

test('flipping swaps explicit standard fold patterns, preserves custom paint and restores patterns when flipped back',()=>{
  for(const strokePattern of [undefined,'dashed','solid'] as const){
    const {project,stepId}=fixture(),front=defaultModelView(),back={...front,side:'back' as const,rotation:90};
    const stroke:DiagramLineAnnotation={...line([0,30],[50,30]),color:'#9b3158',width:1.4,...(strokePattern?{strokePattern}:{})};
    const linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]),snapshot=structuredClone(linked);
    const flipped=refreshDiagramFoldDrawing(updateDiagramPoseView(linked,stepId,back),stepId,front),flippedLines=foldLines(flipped);
    assert.equal(flippedLines.length,1);assert.equal(flippedLines[0].style,'mountain');
    assert.equal(flippedLines[0].strokePattern,strokePattern==='dashed'?'dash-dot':strokePattern);
    assert.equal(Object.hasOwn(flippedLines[0],'strokePattern'),strokePattern!==undefined);
    assert.equal(flippedLines[0].color,stroke.color);assert.equal(flippedLines[0].width,stroke.width);
    assert.deepEqual(flipped.states,linked.states);assert.deepEqual(flipped.steps[0].foldLink,linked.steps[0].foldLink);
    const restored=refreshDiagramFoldDrawing(updateDiagramPoseView(flipped,stepId,front),stepId,back),restoredLines=foldLines(restored);
    assert.equal(restoredLines.length,1);assert.equal(restoredLines[0].style,'valley');assert.equal(restoredLines[0].strokePattern,strokePattern);
    assert.equal(Object.hasOwn(restoredLines[0],'strokePattern'),strokePattern!==undefined);
    assert.deepEqual(restored.states,linked.states);assert.deepEqual(restored.steps[0].foldLink,linked.steps[0].foldLink);
    close(restoredLines[0].a,stroke.a);close(restoredLines[0].b,stroke.b);
    assert.deepEqual(linked,snapshot);
  }
});

test('saved generated ledgers allow deletion after restoration even when solver certificates are discarded',()=>{
  const {project,stepId}=fixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  const saved=exportDiagramProject(linked),restored=importDiagramProject(saved);
  assert.deepEqual(restored.steps[0].foldLink,linked.steps[0].foldLink);
  assert.equal(restored.steps[0].pose!.result.layers.status,'unknown');
  const removed=reconcileDiagramFoldAnnotations(restored,stepId,[]);
  sameCP(after(removed).doc,after(project).doc);assert.deepEqual(removed.steps[0].foldLink!.generated,[]);
});

test('one transaction provides immutable complete snapshots for undo, redo and restoration',()=>{
  const {project,stepId}=fixture(),oldSnapshot=exportDiagramProject(project);
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]),newSnapshot=exportDiagramProject(linked);
  const undone=importDiagramProject(oldSnapshot),redone=importDiagramProject(newSnapshot);
  sameCP(after(undone).doc,after(project).doc);assert.deepEqual(undone.steps[0].annotations,[]);
  sameCP(after(redone).doc,after(linked).doc);assert.deepEqual(redone.steps[0].annotations,linked.steps[0].annotations);
  assert.deepEqual(redone.steps[0].foldLink,linked.steps[0].foldLink);
  assert.equal(exportDiagramProject(project),oldSnapshot);
});

test('stale or genuinely stretched source poses reject a drawing edit without changing either state',()=>{
  const {project,stepId}=fixture(),stale=updateDiagramCP(project,before(project).id,before(project).doc),old=structuredClone(stale);
  assert.throws(()=>reconcileDiagramFoldAnnotations(stale,stepId,[line([0,30],[50,30])]),/来源 CP 已变化/);assert.deepEqual(stale,old);
  const damaged=structuredClone(project);damaged.steps[0].pose!.result.geometry.vertices[0][1]+=5;
  const snapshot=structuredClone(damaged);
  assert.throws(()=>reconcileDiagramFoldAnnotations(damaged,stepId,[line([0,30],[50,30])]),/非等距/);assert.deepEqual(damaged,snapshot);
});

test('new selected or top-layer drawing lines capture only the material faces actually affected',()=>{
  const {project,stepId}=fixture();
  for(const selection of [{...config,layers:'selected' as const,selectedFaces:[0]}, {...config,layers:'top' as const}]){
    const selected=updateDiagramFoldLink(project,stepId,selection);
    const linked=reconcileDiagramFoldAnnotations(selected,stepId,[line([0,30],[50,30])]);
    const expected=mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],selection,before(project));
    assert.deepEqual(foldLines(linked)[0].foldFaces,[...new Set(expected.preview.map(p=>p.face))]);
    assert.equal(foldLines(linked)[0].foldFaces!.length,1);
    const switched=updateDiagramFoldLink(linked,stepId,{...linked.steps[0].foldLink!,layers:'all'});
    const moved=reconcileDiagramFoldAnnotations(switched,stepId,foldLines(switched).map(s=>({...s,a:[s.a[0],60] as Point,b:[s.b[0],60] as Point})));
    assert.equal(foldLines(moved)[0].foldFaces!.length,1);
    assert.equal(moved.steps[0].foldLink!.generated!.length,1);
  }
});

test('automatic top-face binding includes hidden intervals immediately and stays fixed on appearance edits',()=>{
  const {project,stepId,stroke}=partialOverlapFixture(),snapshot=structuredClone(project);
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]),original=structuredClone(linked);
  const expected=mapDiagramFoldLines(project.steps[0].pose!,[stroke],project.steps[0].foldLink!,before(project));
  sameCP(after(linked).doc,applyDiagramFoldSegments(after(project).doc,expected.segments));
  sameCP(after(linked).doc,applyDiagramFoldSegments(after(project).doc,[segment([0,40],[25,40],'V'),segment([25,40],[100,40],'M','back-face')]));
  assert.ok(expected.preview.some(part=>part.visibility==='hidden'),'a chosen material face folds through its hidden part too');
  assert.deepEqual(foldLines(linked)[0].foldFaces,[0,1]);
  const recalculated=reconcileDiagramFoldAnnotations(linked,stepId,linked.steps[0].annotations!,{...linked.steps[0].foldLink!});
  sameCP(after(recalculated).doc,after(linked).doc);
  for(const patch of [{width:.71},{color:'#c05a33'},{strokePattern:'dotted' as const}]){
    const edited=reconcileDiagramFoldAnnotations(linked,stepId,foldLines(linked).map(a=>({...a,...patch})));
    sameCP(after(edited).doc,after(linked).doc);assert.deepEqual(before(edited),before(project));
    assert.deepEqual(edited.steps[0].pose,project.steps[0].pose);
  }
  const switched=updateDiagramFoldLink(linked,stepId,{...linked.steps[0].foldLink!,layers:'all'});
  const recolored=reconcileDiagramFoldAnnotations(switched,stepId,foldLines(switched).map(a=>({...a,color:'#ab623b'})));
  sameCP(after(recolored).doc,after(linked).doc);
  assert.deepEqual(linked,original);assert.deepEqual(project,snapshot);
});

test('automatic top-face binding includes chosen hidden intervals without selecting an entirely hidden third face',()=>{
  const raw=blankDoc('三层自动选面',100,100);raw.segments.push(segment([25,0],[25,100],'M','first-fold'),segment([50,0],[50,100],'V','second-fold'));
  const doc=normalizeDiagramCP(raw).doc,result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready');
  let i=0,project=createDiagramProject(doc,()=>`three-faces-${++i}`),stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,defaultModelView());
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'top',selectedFaces:[]});
  const stroke=line([0,40],[50,40],'three-face-stroke'),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]);
  assert.deepEqual(foldLines(linked)[0].foldFaces,[0,2]);
  sameCP(after(linked).doc,applyDiagramFoldSegments(after(project).doc,[segment([0,40],[25,40],'V','upper'),segment([50,40],[100,40],'V','lower')]));
  const mapped=mapDiagramFoldLines(project.steps[0].pose!,[stroke],project.steps[0].foldLink!,before(project));
  assert.ok(mapped.preview.some(part=>part.face===2&&part.visibility==='hidden'));assert.ok(!mapped.preview.some(part=>part.face===1));
  const all=reapplyDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,layers:'all'},[stroke.id]);
  assert.deepEqual(foldLines(all)[0].foldFaces,[0,1,2]);
  sameCP(after(all).doc,applyDiagramFoldSegments(after(linked).doc,[segment([25,40],[50,40],'M','middle')]));
  assert.deepEqual(before(all),before(project));
});

test('automatic top-face binding stays complete when another crease is drawn or edited',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]);
  const two=reconcileDiagramFoldAnnotations(linked,stepId,[...linked.steps[0].annotations!,second]);
  const mapped=mapDiagramFoldLines(project.steps[0].pose!,[second],project.steps[0].foldLink!,before(project));
  sameCP(after(two).doc,applyDiagramFoldSegments(after(linked).doc,mapped.segments));
  const other=structuredClone(foldLines(two).find(a=>a.id===second.id)!);
  const changed=reconcileDiagramFoldAnnotations(two,stepId,foldLines(two).map(a=>a.id===stroke.id?{...a,color:'#b04f32'}:a));
  sameCP(after(changed).doc,after(two).doc);assert.deepEqual(foldLines(changed).find(a=>a.id===second.id),other);
  assert.deepEqual(before(changed),before(project));
});

test('automatic top-face binding survives a crease move and return without changing its material scope',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const lines=foldLines(linked),saved=structuredClone(lines.find(a=>a.id===stroke.id)!),other=structuredClone(lines.find(a=>a.id===second.id)!);
  const shifted={...saved,a:[saved.a[0],50] as Point,b:[saved.b[0],50] as Point};
  const moved=reconcileDiagramFoldAnnotations(linked,stepId,lines.map(a=>a.id===stroke.id?shifted:a));
  const mapped=mapDiagramFoldLines(project.steps[0].pose!,[line([-50,50],[25,50],stroke.id),second],project.steps[0].foldLink!,before(project));
  sameCP(after(moved).doc,applyDiagramFoldSegments(after(project).doc,mapped.segments));
  const returned=reconcileDiagramFoldAnnotations(moved,stepId,foldLines(moved).map(a=>a.id===stroke.id?saved:a));
  sameCP(after(returned).doc,after(linked).doc);assert.deepEqual(foldLines(returned).find(a=>a.id===second.id),other);
  assert.deepEqual(before(returned),before(project));
});

test('automatic top-face binding survives saving and reopening, and deletion keeps another crease intact',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const loaded=importDiagramProject(exportDiagramProject(linked));
  const styled=reconcileDiagramFoldAnnotations(loaded,stepId,foldLines(loaded).map(a=>a.id===stroke.id?{...a,width:1.1}:a));
  sameCP(after(styled).doc,after(linked).doc);
  const other=structuredClone(foldLines(styled).find(a=>a.id===second.id)!);
  const removed=reconcileDiagramFoldAnnotations(styled,stepId,foldLines(styled).filter(a=>a.id!==stroke.id));
  const mapped=mapDiagramFoldLines(project.steps[0].pose!,[second],project.steps[0].foldLink!,before(project));
  sameCP(after(removed).doc,applyDiagramFoldSegments(after(project).doc,mapped.segments));
  assert.deepEqual(foldLines(removed),[other]);assert.deepEqual(before(removed),before(project));
});

test('automatic top-face binding supports explicit material selection and reapplying all or automatic faces',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const other=structuredClone(foldLines(linked).find(a=>a.id===second.id)!);
  for(const scope of [{...config,layers:'selected' as const,selectedFaces:[0]},{...config,layers:'selected' as const,selectedFaces:[1]}]){
    const applied=reapplyDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,...scope},[stroke.id]);
    const mapped=mapDiagramFoldLines(project.steps[0].pose!,[stroke],scope,before(project));
    const otherMapped=mapDiagramFoldLines(project.steps[0].pose!,[second],project.steps[0].foldLink!,before(project));
    sameCP(after(applied).doc,applyDiagramFoldSegments(after(project).doc,[...mapped.segments,...otherMapped.segments]));
    assert.ok(diffDiagramFoldCP(after(applied).doc,after(linked).doc).length>0,'explicit single-face selection narrows the material scope');
    assert.deepEqual(foldLines(applied).find(a=>a.id===second.id),other);
    for(const layers of ['all','top'] as const){
      const expanded=reapplyDiagramFoldLayerScope(applied,stepId,{...applied.steps[0].foldLink!,layers},[stroke.id]);
      sameCP(after(expanded).doc,after(linked).doc);
      const changed=reconcileDiagramFoldAnnotations(expanded,stepId,foldLines(expanded).map(a=>a.id===stroke.id?{...a,width:.9}:a));
      sameCP(after(changed).doc,after(linked).doc);assert.deepEqual(before(changed),before(project));
    }
  }
});

test('automatic top-face binding remains dormant after explicit empty scope, movement and reopening',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const empty=reapplyDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,layers:'selected',selectedFaces:[]},[stroke.id]);
  assert.deepEqual(foldLines(empty).find(a=>a.id===stroke.id)!.foldFaces,[]);
  const loaded=importDiagramProject(exportDiagramProject(empty)),moved=reconcileDiagramFoldAnnotations(loaded,stepId,foldLines(loaded).map(a=>a.id===stroke.id?{...a,a:[-50,50] as Point,b:[25,50] as Point}:a));
  const otherMapped=mapDiagramFoldLines(project.steps[0].pose!,[second],project.steps[0].foldLink!,before(project));
  sameCP(after(moved).doc,applyDiagramFoldSegments(after(project).doc,otherMapped.segments));
  const expanded=reapplyDiagramFoldLayerScope(moved,stepId,{...moved.steps[0].foldLink!,layers:'all'},[stroke.id]);
  const expandedMapped=mapDiagramFoldLines(project.steps[0].pose!,[line([-50,50],[25,50],stroke.id)],config,before(project));
  sameCP(after(expanded).doc,applyDiagramFoldSegments(after(project).doc,[...otherMapped.segments,...expandedMapped.segments]));
  assert.deepEqual(before(expanded),before(project));
});

test('current drawing restoration preserves complete long handles, UUIDs, layer bindings and timing references',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,{...second,animationTiming:{afterLineId:stroke.id,startAfter:.5}}]);
  assert.equal(linked.steps[0].foldLink!.drawingVersion,1);
  const loaded=importDiagramProject(exportDiagramProject(linked)),states=structuredClone(loaded.states),pose=structuredClone(loaded.steps[0].pose);
  const restored=refreshDiagramFoldDrawing(loaded,stepId,undefined,true),twice=refreshDiagramFoldDrawing(restored,stepId,undefined,true);
  assert.deepEqual(foldLines(restored),foldLines(linked));assert.deepEqual(foldLines(twice),foldLines(linked));
  assert.deepEqual(twice.states,states);assert.deepEqual(twice.steps[0].pose,pose);
  const reselected=reapplyDiagramFoldLayerScope(twice,stepId,{...twice.steps[0].foldLink!,layers:'all'},[stroke.id]);
  const recovered=refreshDiagramFoldDrawing(importDiagramProject(exportDiagramProject(reselected)),stepId,undefined,true);
  assert.deepEqual(foldLines(recovered),foldLines(reselected));assert.deepEqual(recovered.states,reselected.states);
});

test('current drawing camera changes keep long handle identities and recover exact CP scope on returning',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const previousView=linked.steps[0].pose!.view!,targetView={...previousView,side:'back' as const,rotation:37};
  const viewed=updateDiagramPoseView(linked,stepId,targetView),turned=refreshDiagramFoldDrawing(viewed,stepId,previousView);
  assert.deepEqual(foldLines(turned).map(a=>[a.id,a.foldFaces]),foldLines(linked).map(a=>[a.id,a.foldFaces]));
  assert.ok(foldLines(turned).every(a=>a.style==='mountain'));assert.deepEqual(turned.states,linked.states);
  const returned=refreshDiagramFoldDrawing(updateDiagramPoseView(turned,stepId,previousView),stepId,targetView);
  for(const original of foldLines(linked)){
    const restored=foldLines(returned).find(a=>a.id===original.id)!;close(restored.a,original.a);close(restored.b,original.b);
    assert.equal(restored.style,original.style);assert.deepEqual(restored.foldFaces,original.foldFaces);
  }
  const recolored=reconcileDiagramFoldAnnotations(returned,stepId,foldLines(returned).map(a=>a.id===stroke.id?{...a,color:'#ae5833'}:a));
  sameCP(after(recolored).doc,after(linked).doc);assert.deepEqual(before(recolored),before(project));
});

test('authoritative CP edits rebuild current drawing handles instead of retaining obsolete long routes',()=>{
  const {project,stepId,stroke,second}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke,second]);
  const replacement=applyDiagramFoldSegments(after(project).doc,[segment([0,55],[25,55],'V','authoritative')]);
  const adopted=adoptDiagramFoldCP(linked,stepId,replacement);
  assert.ok(!foldLines(adopted).some(a=>a.id===stroke.id||a.id===second.id));
  sameCP(after(adopted).doc,replacement);assert.deepEqual(before(adopted),before(project));
  assert.deepEqual(adopted.steps[0].pose,linked.steps[0].pose);
  const refreshed=refreshDiagramFoldDrawing(linked,stepId);
  assert.ok(!foldLines(refreshed).some(a=>a.id===stroke.id||a.id===second.id),'ordinary geometry refresh keeps the authoritative rebuild path');
  assert.deepEqual(refreshed.states,linked.states);
});

test('drawing binding version is strictly validated on project import and absent legacy bindings still rebuild',()=>{
  const {project,stepId,stroke}=partialOverlapFixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[stroke]);
  const serialized=exportDiagramProject(linked);assert.equal(importDiagramProject(serialized).steps[0].foldLink!.drawingVersion,1);
  for(const version of [0,2,-1,'1',null,{},true]){
    const value=JSON.parse(serialized);value.steps[0].foldLink.drawingVersion=version;
    assert.throws(()=>importDiagramProject(JSON.stringify(value)),/绑定版本/);
  }
  const legacy=JSON.parse(serialized);delete legacy.steps[0].foldLink.drawingVersion;
  const loaded=importDiagramProject(JSON.stringify(legacy)),restored=refreshDiagramFoldDrawing(loaded,stepId,undefined,true);
  assert.ok(!foldLines(restored).some(a=>a.id===stroke.id));assert.deepEqual(restored.states,loaded.states);
});

test('overlapping CP projections aggregate both original material faces and retain them through save and reload',()=>{
  const {project,stepId}=fixture(),segments=mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],config,before(project)).segments;
  const adopted=adoptDiagramFoldCP(project,stepId,applyDiagramFoldSegments(after(project).doc,segments));
  assert.deepEqual(foldLines(adopted)[0].foldFaces,[0,1]);
  const loaded=importDiagramProject(exportDiagramProject(adopted));
  assert.deepEqual(foldLines(loaded)[0].foldFaces,[0,1]);
  const moved=reconcileDiagramFoldAnnotations(loaded,stepId,foldLines(loaded).map(s=>({...s,a:[s.a[0],60] as Point,b:[s.b[0],60] as Point})));
  assert.equal(moved.steps[0].foldLink!.generated!.length,2);
});

test('explicitly applying all layers expands an existing selected-layer crease and reapplies even when all is already the default',()=>{
  const {project,stepId}=fixture(),selected={...config,layers:'selected' as const,selectedFaces:[0]};
  const narrow=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,selected),stepId,[line([0,30],[50,30])]);
  const original=structuredClone(narrow),expanded=reapplyDiagramFoldLayerScope(narrow,stepId,{...narrow.steps[0].foldLink!,layers:'all'});
  assert.deepEqual(narrow,original);assert.deepEqual(foldLines(expanded)[0].foldFaces,[0,1]);
  const expected=applyDiagramFoldSegments(after(project).doc,mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],config,before(project)).segments);
  sameCP(after(expanded).doc,expected);
  const cpOnly=adoptDiagramFoldCP(project,stepId,applyDiagramFoldSegments(after(project).doc,[segment([0,30],[50,30],'V')]));
  assert.equal(cpOnly.steps[0].foldLink!.layers,'all');assert.deepEqual(foldLines(cpOnly)[0].foldFaces,[0]);
  const reapplied=reapplyDiagramFoldLayerScope(cpOnly,stepId,cpOnly.steps[0].foldLink!);
  assert.deepEqual(foldLines(reapplied)[0].foldFaces,[0,1]);sameCP(after(reapplied).doc,expected);
});

test('applying a layer range to selected folds leaves other folds and teaching objects in their original ranges',()=>{
  const {project,stepId}=fixture(),selected={...config,layers:'selected' as const,selectedFaces:[0]};
  const mark={...line([0,80],[50,80],'guide'),style:'auxiliary' as const};
  const narrow=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,selected),stepId,[line([0,30],[50,30],'one'),line([0,60],[50,60],'two'),mark]);
  const expanded=reapplyDiagramFoldLayerScope(narrow,stepId,{...narrow.steps[0].foldLink!,layers:'all'},['one']);
  assert.deepEqual(foldLines(expanded).map(a=>[a.id,a.foldFaces]),[['one',[0,1]],['two',[0]]]);
  assert.deepEqual(expanded.steps[0].annotations!.find(a=>a.id==='guide'),mark);
  const expected=applyDiagramFoldSegments(after(project).doc,[...mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],config,before(project)).segments,
    ...mapDiagramFoldLines(project.steps[0].pose!,[line([0,60],[50,60])],selected,before(project)).segments]);
  sameCP(after(expanded).doc,expected);
});

test('explicit range changes can narrow an all-layer crease to one source face or the real top layer',()=>{
  const {project,stepId}=fixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  for(const scope of [{...config,layers:'selected' as const,selectedFaces:[1]},{...config,layers:'top' as const}]){
    const applied=reapplyDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,...scope});
    const mapped=mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],scope,before(project));
    assert.deepEqual(foldLines(applied)[0].foldFaces,[...new Set(mapped.preview.map(a=>a.face))]);
    assert.equal(foldLines(applied)[0].foldFaces!.length,1);
    sameCP(after(applied).doc,applyDiagramFoldSegments(after(project).doc,mapped.segments));
  }
});

test('an explicit empty layer range removes owned CP geometry, stays inactive when moved or loaded, and can be reapplied',()=>{
  const {project,stepId}=fixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  const empty=reapplyDiagramFoldLayerScope(linked,stepId,{...linked.steps[0].foldLink!,layers:'selected',selectedFaces:[]});
  assert.deepEqual(foldLines(empty)[0].foldFaces,[]);assert.deepEqual(empty.steps[0].foldLink!.generated,[]);sameCP(after(empty).doc,after(project).doc);
  const loaded=importDiagramProject(exportDiagramProject(empty)),switched=updateDiagramFoldLink(loaded,stepId,{...loaded.steps[0].foldLink!,layers:'all'});
  const moved=reconcileDiagramFoldAnnotations(switched,stepId,foldLines(switched).map(a=>({...a,a:[0,60] as Point,b:[50,60] as Point})));
  assert.deepEqual(foldLines(moved)[0].foldFaces,[]);sameCP(after(moved).doc,after(project).doc);
  const reapplied=reapplyDiagramFoldLayerScope(moved,stepId,moved.steps[0].foldLink!);
  assert.deepEqual(foldLines(reapplied)[0].foldFaces,[0,1]);assert.equal(reapplied.steps[0].foldLink!.generated!.length,2);
  assert.throws(()=>reconcileDiagramFoldAnnotations(empty,stepId,[line([0,80],[50,80],'new-unselected')]),/请先选择/);
});

test('untargeted legacy folds capture their previous range before another fold is explicitly reassigned',()=>{
  const {project,stepId}=fixture(),selected={...config,layers:'selected' as const,selectedFaces:[0]};
  const narrow=reconcileDiagramFoldAnnotations(updateDiagramFoldLink(project,stepId,selected),stepId,[line([0,30],[50,30],'one'),line([0,60],[50,60],'legacy')]);
  const legacy=structuredClone(narrow);delete (legacy.steps[0].annotations![1] as DiagramLineAnnotation).foldFaces;
  const expanded=reapplyDiagramFoldLayerScope(legacy,stepId,{...legacy.steps[0].foldLink!,layers:'all'},['one']);
  assert.deepEqual(foldLines(expanded).map(a=>[a.id,a.foldFaces]),[['one',[0,1]],['legacy',[0]]]);
});

test('refreshing matching drawing geometry preserves teaching crease styles and explicitly inactive line handles',()=>{
  const {project,stepId}=fixture(),styled={...line([0,30],[50,30]),width:2.5,color:'#cc6633'};
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[styled]);
  const refreshed=refreshDiagramFoldDrawing(linked,stepId);
  assert.equal(foldLines(refreshed)[0].width,2.5);assert.equal(foldLines(refreshed)[0].color,'#cc6633');
  const inactive=reapplyDiagramFoldLayerScope(refreshed,stepId,{...refreshed.steps[0].foldLink!,layers:'selected',selectedFaces:[]});
  const reprojected=refreshDiagramFoldDrawing(inactive,stepId);
  assert.deepEqual(reprojected.steps[0].annotations,inactive.steps[0].annotations);sameCP(after(reprojected).doc,after(project).doc);
});

test('inactive CP-origin handles survive refresh and CP edits without colliding with newly projected crease IDs',()=>{
  const {project,stepId}=fixture(),cp=applyDiagramFoldSegments(after(project).doc,[segment([0,30],[50,30],'V','lower'),segment([0,60],[50,60],'V','upper')]);
  const adopted=adoptDiagramFoldCP(project,stepId,cp),first=foldLines(adopted)[0];
  assert.equal(first.id,`cp-link:${stepId}:0`);
  const partial=reapplyDiagramFoldLayerScope(adopted,stepId,{...adopted.steps[0].foldLink!,layers:'selected',selectedFaces:[]},[first.id]);
  for(const next of [refreshDiagramFoldDrawing(partial,stepId),adoptDiagramFoldCP(partial,stepId,after(partial).doc)]){
    const annotations=next.steps[0].annotations!;assert.equal(annotations.length,2);
    assert.equal(new Set(annotations.map(a=>a.id)).size,2);
    assert.deepEqual(annotations.find(a=>a.id===first.id),{...first,foldFaces:[]});
  }
});

test('explicit layer reassignment remains locked on a pulled illustration even when the requested range is empty',()=>{
  const {project,stepId}=fixture(),linked=reconcileDiagramFoldAnnotations(project,stepId,[line([0,30],[50,30])]);
  const pulled=structuredClone(linked);pulled.steps[0].pose!.result.geometry.vertices[0][1]+=5;const snapshot=structuredClone(pulled);
  for(const settings of [{...pulled.steps[0].foldLink!,layers:'all' as const},{...pulled.steps[0].foldLink!,layers:'selected' as const,selectedFaces:[]}]){
    assert.throws(()=>reapplyDiagramFoldLayerScope(pulled,stepId,settings),/非等距/);assert.deepEqual(pulled,snapshot);
  }
});

test('explicitly updating main creases from after CP enables linking while preserving the complete before pose and independent artwork',()=>{
  const {project,stepId}=fixture(),symbol:DiagramAnnotation={id:'arrow',kind:'symbol',symbol:'fold',position:[10,10],size:30,rotation:0,color:'#314b3c',width:.7};
  const mark={...line([0,90],[50,90],'mark'),style:'auxiliary' as const},drawing={...line([0,30],[50,30],'styled'),foldFaces:[0,1],color:'#d24b37',width:1.4};
  let edited=updateDiagramFoldLink(project,stepId,{...config,enabled:false});
  edited=updateDiagramStep(edited,stepId,{title:'用户定义的步骤',description:'只更新折痕，保持当前纸层位置。'});
  edited=updateDiagramAnnotations(edited,stepId,[symbol,mark,drawing]);
  const mapped=mapDiagramFoldLines(edited.steps[0].pose!,[drawing],config,before(edited));
  edited=updateDiagramCP(edited,after(edited).id,applyDiagramFoldSegments(after(edited).doc,mapped.segments));
  const snapshot=structuredClone(edited),updated=updateDiagramFoldDrawingFromCP(edited,stepId);
  assert.deepEqual(edited,snapshot);assert.deepEqual(updated.states,snapshot.states);assert.deepEqual(updated.steps[0].pose,snapshot.steps[0].pose);
  assert.equal(updated.steps[0].title,snapshot.steps[0].title);assert.equal(updated.steps[0].description,snapshot.steps[0].description);
  assert.equal(updated.steps[0].foldLink!.enabled,true);assert.equal(updated.steps[0].foldLink!.generated!.length,2);
  assert.deepEqual(updated.steps[0].annotations!.filter(a=>a.id==='arrow'||a.id==='mark'),[symbol,mark]);
  const handles=foldLines(updated);assert.equal(handles.length,1);assert.equal(handles[0].color,drawing.color);assert.equal(handles[0].width,drawing.width);
  assert.deepEqual(handles[0].foldFaces,[0,1]);
});

test('explicit after-CP presentation leaves raw CP segment identities, revision and metadata unchanged across repeated updates',()=>{
  const {project,stepId}=fixture(),manual=segment([0,35],[50,35],'V','manual-primary');
  const doc=structuredClone(after(project).doc);doc.segments.push(manual,{...structuredClone(manual),id:'manual-duplicate'});
  doc.metadata={...doc.metadata,note:'保持手动CP内容与编号'};
  const edited=updateDiagramCP(project,after(project).id,doc),states=structuredClone(edited.states),pose=structuredClone(edited.steps[0].pose);
  const once=updateDiagramFoldDrawingFromCP(edited,stepId),twice=updateDiagramFoldDrawingFromCP(once,stepId);
  assert.deepEqual(once.states,states);assert.deepEqual(twice.states,states);assert.deepEqual(twice.steps[0].pose,pose);
  assert.ok(after(twice).doc.segments.some(s=>s.id==='manual-duplicate'));
  assert.deepEqual(twice.steps[0].annotations,once.steps[0].annotations);
});

test('explicit after-CP presentation records ownership so later main-line edits replace their old route without recomputing a pose',()=>{
  const {project,stepId}=fixture(),mapped=mapDiagramFoldLines(project.steps[0].pose!,[line([0,30],[50,30])],config,before(project));
  const edited=updateDiagramCP(updateDiagramFoldLink(project,stepId,{...config,enabled:false}),after(project).id,applyDiagramFoldSegments(after(project).doc,mapped.segments));
  const updated=updateDiagramFoldDrawingFromCP(edited,stepId),lines=foldLines(updated).map(s=>({...s,a:[s.a[0],60] as Point,b:[s.b[0],60] as Point}));
  const moved=reconcileDiagramFoldAnnotations(updated,stepId,lines),expected=applyDiagramFoldSegments(after(project).doc,mapDiagramFoldLines(project.steps[0].pose!,[line([0,60],[50,60])],config,before(project)).segments);
  sameCP(after(moved).doc,expected);assert.deepEqual(moved.steps[0].pose,project.steps[0].pose);
});

test('explicit after-CP presentation rejects stale, after-source and pulled poses atomically',()=>{
  const {project,stepId}=fixture(),stale=updateDiagramCP(project,before(project).id,before(project).doc);
  const afterSource=adoptDiagramPose(project,stepId,after(project).id,computeFlatFold(after(project).doc),defaultModelView());
  const legacyPull=structuredClone(project);legacyPull.steps[0].pose!.result.geometry.vertices[0][1]+=5;
  const archivedPull=structuredClone(project),pose=archivedPull.steps[0].pose!;
  archivedPull.steps[0].paperStates={active:'pulled',flat:structuredClone(pose),pulled:structuredClone(pose),flatAnnotations:[]};
  for(const [candidate,message] of [[stale,/来源 CP 已变化/],[afterSource,/操作前 CP/],[legacyPull,/非等距/],[archivedPull,/平整状态/]] as const){
    const snapshot=structuredClone(candidate);assert.throws(()=>updateDiagramFoldDrawingFromCP(candidate,stepId),message);assert.deepEqual(candidate,snapshot);
  }
});
