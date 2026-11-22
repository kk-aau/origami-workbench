import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import {pointOnSegment} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {adoptDiagramPose,createDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramCP,updateDiagramPoseView} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {applyDiagramFoldSegments,diffDiagramFoldCP,subtractDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {adoptDiagramFoldCP,reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing,updateDiagramFoldDrawingFromCP} from '../../src/app/diagramFoldTransactions';

function fixture(){
  const raw=blankDoc('水雷基本形',100,100),corners:Point[]=[[0,0],[100,0],[100,100],[0,100]];
  corners.forEach((b,i)=>raw.segments.push({id:'corner'+i,a:[50,50],b,assignment:'M',angle:-180}));
  raw.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'V',angle:180});
  const before=normalizeDiagramCP(raw).doc,result=computeFlatFold(before);
  assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved');
  let i=0,project=createDiagramProject(before,()=>`sink-tx-${++i}`);
  project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  const config={enabled:true,layers:'selected' as const,selectedFaces:result.geometry.faces.map((_,face)=>face)};
  const guide:DiagramLineAnnotation={id:'sink-guide',kind:'line',style:'valley',color:'#293d35',width:.7,
    a:[25,25],b:[75,25],foldAction:'fold',sinkFold:true,foldFaces:config.selectedFaces};
  return {project,before,id:project.activeStepId,config,guide};
}
const at=(doc:Doc,p:Point)=>doc.segments.find(s=>pointOnSegment(p,s,1e-6));
function sameCP(a:Doc,b:Doc){
  assert.deepEqual(diffDiagramFoldCP(a,b),[]);assert.deepEqual(diffDiagramFoldCP(b,a),[]);
}

test('六个所选纸面上的一笔形成沉口；重算、保存、重开和移动或删除不会重复反转',()=>{
  const {project,before,id,config,guide}=fixture();
  const local:Segment={id:'after-only',a:[35,44],b:[40,44],assignment:'V',angle:70};
  const manual=applyDiagramFoldSegments(before,[local]),start=updateDiagramCP(project,project.states[1].id,manual);
  let saved=reconcileDiagramFoldAnnotations(start,id,[guide],config);
  const target=saved.states[1].doc;
  assert.equal(at(target,[40,40])?.assignment,'V');assert.equal(at(target,[15,15])?.assignment,'M');
  assert.equal(at(target,[40,50])?.assignment,'M');assert.equal(at(target,[15,50])?.assignment,'V');
  assert.equal(at(target,[37,44])?.angle,-70);
  const authored=saved.steps[0].annotations!.find(a=>a.id===guide.id);
  assert.ok(authored?.kind==='line'&&authored.sinkAssignment);
  assert.equal(at(target,[40,25])?.assignment,authored.sinkAssignment);assert.equal(at(target,[40,75])?.assignment,authored.sinkAssignment);
  assert.deepEqual(project.states[0].doc,before);
  saved=importDiagramProject(exportDiagramProject(saved));
  saved=refreshDiagramFoldDrawing(saved,id);
  saved=updateDiagramFoldDrawingFromCP(saved,id);
  saved=adoptDiagramFoldCP(saved,id,saved.states[1].doc);
  const stored=saved.steps[0].annotations!.find(a=>a.id===guide.id);
  assert.ok(stored?.kind==='line'&&stored.sinkFold);
  saved=reconcileDiagramFoldAnnotations(saved,id,saved.steps[0].annotations!,saved.steps[0].foldLink);
  sameCP(saved.states[1].doc,target);
  const moved={...authored,a:[15,15] as Point,b:[85,15] as Point};
  saved=reconcileDiagramFoldAnnotations(saved,id,[moved]);
  assert.equal(at(saved.states[1].doc,[40,15])?.assignment,authored.sinkAssignment);assert.equal(at(saved.states[1].doc,[40,25]),undefined);
  saved=reconcileDiagramFoldAnnotations(saved,id,[]);
  sameCP(saved.states[1].doc,manual);
  assert.equal(saved.steps[0].foldLink?.generatedOriginals,undefined);
});

test('整圈线型随用户改峰谷而切换，切换绘图正反面和重算保留物理线型',()=>{
  const {project,id,config,guide}=fixture();
  const folded=reconcileDiagramFoldAnnotations(project,id,[guide],config);
  const original=folded.steps[0].annotations!.find(a=>a.id===guide.id);
  assert.ok(original?.kind==='line'&&original.sinkAssignment);
  const reversed=reconcileDiagramFoldAnnotations(folded,id,[{...original,style:'mountain'}]);
  const assignment=original.sinkAssignment==='M'?'V':'M';
  for(const point of [[40,25],[40,75],[25,40],[75,60]] as Point[])assert.equal(at(reversed.states[1].doc,point)?.assignment,assignment);
  const front=reversed.steps[0].pose!.view??defaultModelView();
  const back=refreshDiagramFoldDrawing(updateDiagramPoseView(reversed,id,{...front,side:'back'}),id,front);
  const updated=reconcileDiagramFoldAnnotations(back,id,back.steps[0].annotations!,back.steps[0].foldLink);
  sameCP(updated.states[1].doc,reversed.states[1].doc);
});

test('未闭合的选面范围不提交半个沉折',()=>{
  const {project,config,id,guide}=fixture(),saved=JSON.stringify(project);
  assert.throws(()=>reconcileDiagramFoldAnnotations(project,id,[{...guide,foldFaces:[0]}],config),/闭合/);
  assert.equal(JSON.stringify(project),saved);
});

test('直接修改沉口以外的 CP 后仍能单独删除沉折；改写沉口时清除原操作记录',()=>{
  const {project,config,id,guide,before}=fixture();
  const folded=reconcileDiagramFoldAnnotations(project,id,[guide],config);
  const external:Segment={id:'elsewhere',a:[6,13],b:[10,13],assignment:'M',angle:-30};
  const adopted=adoptDiagramFoldCP(folded,id,applyDiagramFoldSegments(folded.states[1].doc,[external]));
  assert.ok(adopted.steps[0].annotations!.some(a=>a.kind==='line'&&a.sinkFold));
  const deleted=reconcileDiagramFoldAnnotations(adopted,id,adopted.steps[0].annotations!.filter(a=>a.kind!=='line'||!a.sinkFold));
  sameCP(deleted.states[1].doc,applyDiagramFoldSegments(before,[external]));
  const rim=folded.states[1].doc.segments.filter(s=>pointOnSegment([40,25],s,1e-6));
  const rewritten=adoptDiagramFoldCP(folded,id,subtractDiagramFoldSegments(folded.states[1].doc,rim));
  assert.ok(!rewritten.steps[0].annotations!.some(a=>a.kind==='line'&&a.sinkFold));
  assert.equal(rewritten.steps[0].foldLink?.generatedOriginals,undefined);
  const imported=updateDiagramCP(folded,folded.states[1].id,rewritten.states[1].doc);
  const refreshed=updateDiagramFoldDrawingFromCP(imported,id);
  assert.ok(!refreshed.steps[0].annotations!.some(a=>a.kind==='line'&&a.sinkFold));
  assert.equal(refreshed.steps[0].foldLink?.generatedOriginals,undefined);
  assert.deepEqual(refreshed.states,imported.states);
});
