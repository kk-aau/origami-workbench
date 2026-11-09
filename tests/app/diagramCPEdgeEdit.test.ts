import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramAnnotations,updateDiagramFoldLink,updateDiagramHiddenFaces,exportDiagramProject,importDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {adoptDiagramFoldCP,reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {diagramCPEdgeProperties,diagramCPEdgeSegment,editDiagramCPEdge,findDiagramCPEdge} from '../../src/app/diagramCPEdgeEdit';
import {diffDiagramFoldCP,applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';

function fixture(){
  const doc=blankDoc('单段属性',100,100);
  doc.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'F',angle:0},{id:'vertical',a:[50,0],b:[50,100],assignment:'F',angle:0});
  let sequence=0,project=createDiagramProject(doc,()=>`edge-test-${++sequence}`);
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready',result.geometry.message);
  assert.equal(result.layers.status,'solved',result.layers.message);
  project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  return project;
}

test('editing a CP half edge changes only that part and leaves the before CP intact',()=>{
  const project=fixture(),step=project.steps[0],source=project.states[0],original=structuredClone(project);
  const index=findDiagramCPEdge(source,{a:[0,50],b:[50,50]});assert.ok(index>=0);
  const changed=editDiagramCPEdge(project,step.id,source.id,index,'V');
  assert.deepEqual(project,original);
  assert.deepEqual(changed.states[0],source);
  const after=changed.states.find(item=>item.id===step.afterId)!;
  const delta=diffDiagramFoldCP(source.doc,after.doc);assert.equal(delta.length,1);
  assert.deepEqual(new Set([JSON.stringify(delta[0].a),JSON.stringify(delta[0].b)]),new Set(['[0,50]','[50,50]']));
  assert.equal(delta[0].assignment,'V');
  assert.equal(diagramCPEdgeSegment(after,findDiagramCPEdge(after,{a:[50,50],b:[100,50]})).assignment,'F');
  assert.ok(changed.steps[0].annotations?.some(item=>item.kind==='line'&&item.style==='valley'));
});

test('changing one after CP segment preserves selection geometry and shared next-step state',()=>{
  const project=fixture(),step=project.steps[0],source=project.states[1],route={a:[0,50] as [number,number],b:[50,50] as [number,number]};
  let sequence=0;const chained=appendDiagramStep(project,()=>`next-${++sequence}`);
  const index=findDiagramCPEdge(source,route),mountain=editDiagramCPEdge(chained,step.id,source.id,index,'M');
  const after=mountain.states.find(item=>item.id===step.afterId)!;
  assert.equal(mountain.steps[1].beforeId,after.id);
  assert.equal(diagramCPEdgeSegment(after,findDiagramCPEdge(after,route)).assignment,'M');
  const flat=editDiagramCPEdge(mountain,step.id,after.id,findDiagramCPEdge(after,route),'F');
  const restored=flat.states.find(item=>item.id===after.id)!;
  assert.equal(diagramCPEdgeSegment(restored,findDiagramCPEdge(restored,route)).angle,0);
  assert.equal(buildDiagramFold(restored.doc).graph.faces_vertices?.length,1);
});

test('paper edges cannot be changed into internal creases',()=>{
  const project=fixture(),source=project.states[0],graph=buildDiagramFold(source.doc).graph,index=graph.edges_assignment.indexOf('B');
  assert.ok(index>=0);
  assert.throws(()=>editDiagramCPEdge(project,project.activeStepId,source.id,index,'M'),/纸边/);
});

test('a single CP edge assignment edit keeps every unrelated crease color and width',()=>{
  let project=fixture();project=adoptDiagramFoldCP(project,project.activeStepId,project.states[1].doc);
  const beforeLines=project.steps[0].annotations!.filter((item):item is DiagramLineAnnotation=>item.kind==='line').map(line=>({...line,
    color:line.a[1]===line.b[1]?'#ee1234':'#2567a9',width:line.a[1]===line.b[1]?2:.9}));
  project=updateDiagramAnnotations(project,project.activeStepId,beforeLines);
  const source=project.states[0],index=findDiagramCPEdge(source,{a:[0,50],b:[50,50]}),changed=editDiagramCPEdge(project,project.activeStepId,source.id,index,'V');
  const afterLines=changed.steps[0].annotations!.filter((item):item is DiagramLineAnnotation=>item.kind==='line');
  const untouched=beforeLines.filter(line=>!(line.a[1]===50&&line.b[1]===50&&Math.max(line.a[0],line.b[0])<=50));
  assert.ok(untouched.length>=3);
  for(const line of untouched){
    const match=afterLines.find(after=>after.style===line.style&&JSON.stringify(after.a)===JSON.stringify(line.a)&&JSON.stringify(after.b)===JSON.stringify(line.b));
    assert.ok(match,'unmodified CP geometry stays drawn');assert.equal(match.color,line.color);assert.equal(match.width,line.width);
  }
});

test('splitting a fully styled existing route preserves the style on the unchanged F piece',()=>{
  let project=fixture();
  const line:DiagramLineAnnotation={id:'cp-existing:whole-horizontal',kind:'line',a:[0,50],b:[100,50],style:'crease',color:'#c24173',width:2.4,foldFaces:[0]};
  project=updateDiagramAnnotations(project,project.activeStepId,[line]);
  const source=project.states[0],index=findDiagramCPEdge(source,{a:[0,50],b:[50,50]}),changed=editDiagramCPEdge(project,project.activeStepId,source.id,index,'V');
  const right=changed.steps[0].annotations!.find((item):item is DiagramLineAnnotation=>item.kind==='line'&&item.style==='crease'&&item.a[1]===50&&item.b[1]===50&&Math.min(item.a[0],item.b[0])>=50);
  assert.ok(right);assert.equal(right.color,line.color);assert.equal(right.width,line.width);
});

test('explicitly setting an F precrease edge to an existing crease cancels only that route intent',()=>{
  const doc=blankDoc('取消本段预折意图',100,100);let sequence=0,project=createDiagramProject(doc,()=>`precrease-edge-${++sequence}`);
  project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  const lines:DiagramLineAnnotation[]=[
    {id:'current-a',kind:'line',a:[0,30],b:[100,30],style:'valley',foldAction:'precrease',color:'#254d3c',width:.7},
    {id:'current-b',kind:'line',a:[0,70],b:[100,70],style:'mountain',foldAction:'precrease',color:'#254d3c',width:.7},
  ];
  project=reconcileDiagramFoldAnnotations(project,project.activeStepId,lines,{enabled:true,layers:'all',selectedFaces:[]});
  const after=project.states[1],index=findDiagramCPEdge(after,{a:[0,30],b:[100,30]});assert.ok(index>=0);
  const changed=editDiagramCPEdge(project,project.activeStepId,after.id,index,'F'),intent=changed.steps[0].foldLink!.precreases!;
  assert.ok(intent.length);assert.ok(intent.every(segment=>segment.a[1]===70&&segment.b[1]===70),'the other precrease retains its illustration intent');
  assert.ok(changed.steps[0].annotations!.some(item=>item.kind==='line'&&item.style==='crease'&&item.a[1]===30&&item.b[1]===30));
  assert.ok(!changed.steps[0].annotations!.some(item=>item.kind==='line'&&item.foldAction==='precrease'&&item.a[1]===30&&item.b[1]===30));
  assert.deepEqual(changed.states[0],project.states[0]);assert.equal(buildDiagramFold(changed.states[1].doc).graph.faces_vertices?.length,1);
});

test('a CP half-edge precrease retains its M/V instruction while the physical CP remains F/0 degrees',()=>{
  for(const assignment of ['M','V'] as const){
    const project=fixture(),step=project.steps[0],source=project.states[0],original=structuredClone(project);
    const route={a:[0,50] as [number,number],b:[50,50] as [number,number]},right={a:[50,50] as [number,number],b:[100,50] as [number,number]};
    const index=findDiagramCPEdge(source,route),changed=editDiagramCPEdge(project,step.id,source.id,index,assignment,'precrease'),after=changed.states[1];
    assert.deepEqual(project,original);assert.deepEqual(changed.states[0],source);
    assert.equal(diagramCPEdgeSegment(after,findDiagramCPEdge(after,route)).assignment,'F');
    assert.equal(diagramCPEdgeSegment(after,findDiagramCPEdge(after,route)).angle,0);
    assert.deepEqual(diagramCPEdgeProperties(changed,step.id,after.id,findDiagramCPEdge(after,route)),{assignment,foldAction:'precrease'});
    assert.deepEqual(diagramCPEdgeProperties(changed,step.id,source.id,index),{assignment,foldAction:'precrease'});
    assert.deepEqual(diagramCPEdgeProperties(changed,step.id,after.id,findDiagramCPEdge(after,right)),{assignment:'F',foldAction:null});
    assert.equal(changed.steps[0].foldLink!.precreases!.length,1);
    assert.deepEqual(new Set([JSON.stringify(changed.steps[0].foldLink!.precreases![0].a),JSON.stringify(changed.steps[0].foldLink!.precreases![0].b)]),new Set(['[0,50]','[50,50]']));
    assert.ok(changed.steps[0].annotations?.some(item=>item.kind==='line'&&item.foldAction==='precrease'&&item.style===(assignment==='V'?'valley':'mountain')));
    assert.equal(buildDiagramFold(after.doc).graph.faces_vertices?.length,1,'precreasing does not add physical paper layers');
  }
});

test('editing precrease type and purpose changes only the selected atomic route and preserves intent outside it',()=>{
  let project=fixture();const step=project.steps[0],after=project.states[1],route={a:[0,50] as [number,number],b:[50,50] as [number,number]},right={a:[50,50] as [number,number],b:[100,50] as [number,number]};
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases:[
    {id:'whole-horizontal',a:[0,50],b:[100,50],assignment:'M',angle:-180},
    {id:'whole-vertical',a:[50,0],b:[50,100],assignment:'V',angle:180},
  ]});
  project=adoptDiagramFoldCP(project,step.id,after.doc);
  const valley=editDiagramCPEdge(project,step.id,after.id,findDiagramCPEdge(after,route),'V','precrease');
  const valleyAfter=valley.states[1];
  assert.deepEqual(diagramCPEdgeProperties(valley,step.id,valleyAfter.id,findDiagramCPEdge(valleyAfter,route)),{assignment:'V',foldAction:'precrease'});
  assert.deepEqual(diagramCPEdgeProperties(valley,step.id,valleyAfter.id,findDiagramCPEdge(valleyAfter,right)),{assignment:'M',foldAction:'precrease'});
  const verticalIntent=valley.steps[0].foldLink!.precreases!.filter(segment=>segment.a[0]===50&&segment.b[0]===50);
  assert.equal(verticalIntent.reduce((sum,segment)=>sum+distance(segment.a,segment.b),0),100);
  assert.ok(verticalIntent.every(segment=>segment.assignment==='V'));
  const folded=editDiagramCPEdge(valley,step.id,valleyAfter.id,findDiagramCPEdge(valleyAfter,route),'V');
  const foldedAfter=folded.states[1];
  assert.deepEqual(diagramCPEdgeProperties(folded,step.id,foldedAfter.id,findDiagramCPEdge(foldedAfter,route)),{assignment:'V',foldAction:'fold'});
  assert.deepEqual(diagramCPEdgeProperties(folded,step.id,foldedAfter.id,findDiagramCPEdge(foldedAfter,right)),{assignment:'M',foldAction:'precrease'});
  const flat=editDiagramCPEdge(valley,step.id,valleyAfter.id,findDiagramCPEdge(valleyAfter,route),'F','precrease'),flatAfter=flat.states[1];
  assert.deepEqual(diagramCPEdgeProperties(flat,step.id,flatAfter.id,findDiagramCPEdge(flatAfter,route)),{assignment:'F',foldAction:null});
  assert.deepEqual(diagramCPEdgeProperties(flat,step.id,flatAfter.id,findDiagramCPEdge(flatAfter,right)),{assignment:'M',foldAction:'precrease'});
  assert.deepEqual(flat.states[0],project.states[0]);
});

test('the next step inherits CP-edited precreases as existing F and does not retain their folding instructions',()=>{
  const project=fixture(),step=project.steps[0],source=project.states[1],route={a:[0,50] as [number,number],b:[50,50] as [number,number]};
  const precreased=editDiagramCPEdge(project,step.id,source.id,findDiagramCPEdge(source,route),'V','precrease');
  let sequence=0,next=appendDiagramStep(precreased,()=>`precrease-next-${++sequence}`),nextStep=next.steps[1],before=next.states.find(state=>state.id===nextStep.beforeId)!;
  assert.equal(nextStep.foldLink!.precreases,undefined);
  next=adoptDiagramPose(next,nextStep.id,before.id,computeFlatFold(before.doc,undefined,{flatCreases:'marks'}));
  next=refreshDiagramFoldDrawing(next,nextStep.id);
  assert.ok(next.steps[1].annotations!.some(item=>item.kind==='line'&&item.style==='crease'));
  assert.ok(next.steps[1].annotations!.filter(item=>item.kind==='line').every(item=>item.kind==='line'&&item.style==='crease'&&item.foldAction===undefined));
  assert.deepEqual(diagramCPEdgeProperties(next,nextStep.id,before.id,findDiagramCPEdge(before,route)),{assignment:'F',foldAction:null});
});

test('precrease type editing preserves crease appearance and the model visibility metadata',()=>{
  let project=fixture();const step=project.steps[0],source=project.states[1],route={a:[0,50] as [number,number],b:[50,50] as [number,number]};
  project=adoptDiagramFoldCP(project,step.id,source.doc);
  project=updateDiagramAnnotations(project,step.id,project.steps[0].annotations!.map(item=>item.kind==='line'?{...item,color:'#c24173',width:2.4}:item));
  const changed=editDiagramCPEdge(project,step.id,source.id,findDiagramCPEdge(source,route),'V','precrease');
  const line=changed.steps[0].annotations!.find((item):item is DiagramLineAnnotation=>item.kind==='line'&&item.foldAction==='precrease');
  assert.ok(line);assert.equal(line.color,'#c24173');assert.equal(line.width,2.4);
  const hidden=updateDiagramHiddenFaces(project,step.id,[0]),pose=structuredClone(hidden.steps[0].pose),hiddenChanged=editDiagramCPEdge(hidden,step.id,source.id,findDiagramCPEdge(source,route),'M','precrease');
  assert.deepEqual(hiddenChanged.steps[0].pose,pose,'changing crease purpose does not alter paper geometry or visibility');
});

test('coincident precrease projections retain separate appearance on their original paper faces',()=>{
  const doc=blankDoc('重合纸层样式',100,100);
  doc.segments.push({id:'fold-axis',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'horizontal',a:[0,40],b:[100,40],assignment:'F',angle:0});
  let sequence=0,project=createDiagramProject(doc,()=>`overlap-style-${++sequence}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  assert.equal(project.steps[0].pose!.result.geometry.faces.length,2);
  project=adoptDiagramFoldCP(project,step.id,project.states[1].doc);
  const annotations=project.steps[0].annotations!.flatMap(item=>item.kind==='line'?(item.foldFaces??[]).map(face=>({...item,id:`${item.id}:face:${face}`,foldFaces:[face],color:face===0?'#293d35':'#ee1234',width:face===0?.7:1.5})):[item]);
  project=updateDiagramAnnotations(project,step.id,annotations);
  const left={a:[0,40] as [number,number],b:[50,40] as [number,number]},right={a:[50,40] as [number,number],b:[100,40] as [number,number]};
  project=editDiagramCPEdge(project,step.id,step.beforeId,findDiagramCPEdge(project.states[0],left),'V','precrease');
  project=editDiagramCPEdge(project,step.id,step.beforeId,findDiagramCPEdge(project.states[0],right),'M','precrease');
  const lines=project.steps[0].annotations!.filter((item):item is DiagramLineAnnotation=>item.kind==='line'&&item.foldAction==='precrease');
  assert.equal(lines.length,2);
  for(const face of [0,1]){
    const line=lines.find(item=>item.foldFaces?.includes(face));assert.ok(line);
    assert.deepEqual(line.foldFaces,[face]);assert.equal(line.color,face===0?'#293d35':'#ee1234');assert.equal(line.width,face===0?.7:1.5);
  }
});

test('before-CP properties report no single value when the after CP splits that edge into different purposes',()=>{
  const doc=blankDoc('分段不同用途',100,100);doc.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'F',angle:0});
  let sequence=0,project=createDiagramProject(doc,()=>`mixed-edge-${++sequence}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  const afterDoc=structuredClone(doc);afterDoc.segments.push({id:'crossing',a:[50,0],b:[50,100],assignment:'F',angle:0});
  project=adoptDiagramFoldCP(project,step.id,afterDoc);
  const after=project.states[1],half={a:[0,50] as [number,number],b:[50,50] as [number,number]},whole={a:[0,50] as [number,number],b:[100,50] as [number,number]};
  project=editDiagramCPEdge(project,step.id,after.id,findDiagramCPEdge(after,half),'M','precrease');
  assert.equal(diagramCPEdgeProperties(project,step.id,step.beforeId,findDiagramCPEdge(project.states[0],whole)),null);
});

test('paper edges expose no folding purpose and reject precrease changes',()=>{
  const project=fixture(),source=project.states[0],graph=buildDiagramFold(source.doc).graph,index=graph.edges_assignment.indexOf('B');
  assert.deepEqual(diagramCPEdgeProperties(project,project.activeStepId,source.id,index),{assignment:'B',foldAction:null});
  assert.throws(()=>editDiagramCPEdge(project,project.activeStepId,source.id,index,'V','precrease'),/纸边/);
  const withAux=structuredClone(project);withAux.states[1].doc.segments.push({id:'helper',a:[10,10],b:[20,10],assignment:'A',angle:0});
  assert.equal(findDiagramCPEdge(withAux.states[1],{a:[10,10],b:[20,10]}),-1,'auxiliary marks are excluded from the physical CP edge graph');
  assert.throws(()=>editDiagramCPEdge(withAux,project.activeStepId,withAux.states[1].id,-1,'M','precrease'),/已变化/);
});

function oldMountainFixture(){
  const raw=blankDoc('旧峰往返',100,100);raw.segments.push({id:'old-mountain',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const doc=normalizeDiagramCP(raw).doc;let sequence=0,project=createDiagramProject(doc,()=>`old-return-${++sequence}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[]});
  return {project,step:project.steps[0],index:findDiagramCPEdge(project.states[1],{a:[50,0],b:[50,100]})};
}

test('CP-side precrease on an unchanged old mountain records its return without unfolding or owning the CP edge',()=>{
  const {project,step,index}=oldMountainFixture(),original=structuredClone(project),changed=editDiagramCPEdge(project,step.id,step.afterId,index,'M','precrease');
  assert.deepEqual(project,original);assert.deepEqual(changed.states,project.states);assert.deepEqual(changed.steps[0].pose,step.pose);
  assert.deepEqual(changed.steps[0].foldLink!.generated,[]);assert.equal(changed.steps[0].foldLink!.precreases!.length,1);
  assert.equal(changed.steps[0].foldLink!.precreases![0].assignment,'M');assert.equal(changed.steps[0].foldLink!.precreases![0].angle,-180);
  assert.deepEqual(diagramCPEdgeProperties(changed,step.id,step.afterId,index),{assignment:'M',foldAction:'precrease'});
  const loaded=importDiagramProject(exportDiagramProject(changed));assert.deepEqual(loaded.steps[0].foldLink!.precreases,changed.steps[0].foldLink!.precreases);
  const restored=editDiagramCPEdge(loaded,step.id,step.afterId,index,'M','fold');
  assert.deepEqual(restored.steps[0].foldLink!.precreases,[]);assert.deepEqual(diffDiagramFoldCP(project.states[1].doc,restored.states[1].doc),[]);assert.deepEqual(diffDiagramFoldCP(restored.states[1].doc,project.states[1].doc),[]);
});

test('a partial old-mountain return intent reports mixed purpose on a whole before edge',()=>{
  const {project,step,index}=oldMountainFixture(),partial={id:'half-return',a:[50,0] as [number,number],b:[50,50] as [number,number],assignment:'M' as const,angle:-180};
  const changed=updateDiagramFoldLink(project,step.id,{...step.foldLink!,precreases:[partial]});
  assert.equal(diagramCPEdgeProperties(changed,step.id,step.beforeId,index),null);
});

test('clearing an old-mountain return on one atomic half survives subsequent drawing reconciliation',()=>{
  const {project,step,index}=oldMountainFixture(),recorded=editDiagramCPEdge(project,step.id,step.afterId,index,'M','precrease');
  const half={id:'selected-half',a:[50,0] as [number,number],b:[50,50] as [number,number],assignment:'M' as const,angle:-180};
  const split=updateDiagramCP(recorded,step.afterId,applyDiagramFoldSegments(recorded.states[1].doc,[half]));
  const selected=findDiagramCPEdge(split.states[1],half),trimmed=editDiagramCPEdge(split,step.id,step.afterId,selected,'M','fold');
  assert.equal(trimmed.steps[0].foldLink!.precreases!.reduce((sum,s)=>sum+distance(s.a,s.b),0),50);
  const remapped=reconcileDiagramFoldAnnotations(trimmed,step.id,trimmed.steps[0].annotations!);
  assert.equal(remapped.steps[0].foldLink!.precreases!.reduce((sum,s)=>sum+distance(s.a,s.b),0),50);
  assert.deepEqual(diffDiagramFoldCP(project.states[1].doc,remapped.states[1].doc),[]);assert.deepEqual(diffDiagramFoldCP(remapped.states[1].doc,project.states[1].doc),[]);
});
