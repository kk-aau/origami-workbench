import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import type {Point,Segment} from '../../src/core/types';
import {createDiagramProject,updateDiagramCP,appendDiagramStep} from '../../src/app/diagramProject';
import {DiagramPlaybackSequence} from '../../src/app/diagramPlaybackSequence';
import {createSinkPoseClock,localProgressAt,playbackBoundaryPause,sinkMotionProgress,sinkPhaseAt,stepProgressAt} from '../../src/app/diagramPlaybackProgress';
import {bakeBlenderAnimation} from '../../src/app/blenderAnimation';
import {diagramAnimationBoundary} from '../../src/app/diagramFullAnimation';
import {sampleDiagramMaterialPoint} from '../../src/app/diagramAnimationRegistration';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {automaticSinkOperation} from '../../src/app/diagramAutomaticSinkPlayback';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {buildDiagramFold,epsilonFor} from '../../src/core/geometry';

function directSink(){
  const before=blankDoc('方形沉折',200,200),after=blankDoc('沉折后',200,200);
  const ring:Point[]=[[75,75],[125,75],[125,125],[75,125]],corners:Point[]=[[0,0],[200,0],[200,200],[0,200]];
  let serial=0;
  const crease=(a:Point,b:Point,angle:number):Segment=>({id:'crease-'+serial++,a,b,angle,assignment:angle<0?'M':'V'});
  for(const [i,p] of ring.entries()){
    before.segments.push(crease([100,100],corners[i],-180));
    after.segments.push(crease(corners[i],p,-180),crease(p,ring[(i+1)%4],-180),crease([100,100],p,180));
  }
  before.segments.push(crease([0,100],[200,100],180));
  after.segments.push(crease([0,100],[75,100],180),crease([75,100],[125,100],-180),crease([125,100],[200,100],180));
  const project=createDiagramProject(before);
  return appendDiagramStep(updateDiagramCP(project,project.steps[0].afterId,after));
}

test('重分段的展示图可手动重看上一沉折，后续普通折线变化和静止页不重复重播',()=>{
  const project=directSink(),[,end,display]=project.states;
  const line=end.doc.segments.find(s=>s.assignment==='V')!;
  const middle:Point=[(line.a[0]+line.b[0])/2,(line.a[1]+line.b[1])/2];
  const segments=end.doc.segments.filter(s=>s!==line).map(s=>({...s,id:s.id+'-display'}));
  const copy={...end.doc,segments:[...segments,{...line,id:'half-a',b:middle},{...line,id:'half-b',a:middle}]};
  project.states[2]={...display,doc:copy};
  assert.equal(automaticSinkOperation(project,project.steps[1].id)?.index,0);
  const another=appendDiagramStep(project);
  assert.equal(automaticSinkOperation(another,another.steps[2].id),undefined);
  const unrelated:Segment={id:'unrelated',a:[0,10],b:[10,0],angle:180,assignment:'V'};
  project.states[2]={...display,doc:{...copy,segments:[...copy.segments,unrelated]}};
  assert.equal(automaticSinkOperation(project,project.steps[1].id),undefined);
});

test('已识别沉折但动画目标无法验证时，报告沉折识别结果和具体错误',()=>{
  const project=directSink(),before=project.states[0],doc=before.doc;
  project.steps[0].pose={sourceDoc:doc,sourceStateId:before.id,sourceRevision:before.revision,
    result:computeFlatGeometry(buildDiagramFold(doc).graph,epsilonFor(doc))};
  project.states[0]={...before,revision:before.revision+1};
  assert.equal(automaticSinkOperation(project,project.steps[0].id)?.index,0);
  assert.throws(()=>new DiagramPlaybackSequence(project).prepare(0,0),/已识别沉折.*操作前 CP 已变化/);
});

test('自动沉折在全程演示和 Blender 中共用原步号及同一帧位置',async()=>{
  const project=directSink(),unchanged=JSON.stringify(project);
  const session=new DiagramPlaybackSequence(project);
  const open=session.prepare(0,0),close=session.prepare(0,0,undefined,.75),next=session.prepare(1,0);
  assert.deepEqual([open.index,close.index,next.index],[0,0,1]);
  assert.deepEqual([open.automaticSinkPhase,close.automaticSinkPhase,next.automaticSinkPhase],[0,1,undefined]);
  assert.equal(next.still,true);
  const end=diagramAnimationBoundary(close),{prepared}=prepareSimulationDocument(next.plan.fold??next.clip.fold);
  for(const [vertex,p] of prepared.fold.vertices_coords.entries()){
    const wanted=sampleDiagramMaterialPoint(end,[p[0],-p[2]]).position;
    for(let k=0;k<3;k++)assert.ok(Math.abs(wanted[k]-next.plan.animation.initialPositions[3*vertex+k])<2e-5);
  }
  assert.deepEqual([open.clip.beforeLabel,open.clip.afterLabel,close.clip.afterLabel,next.clip.beforeLabel],['CP0','沉折中间态','CP1','CP1']);
  for(const p of [0,.25,.5,.75,1])assert.equal(stepProgressAt(sinkPhaseAt(p),localProgressAt(sinkPhaseAt(p),p)),p);
  const blob=bakeBlenderAnimation({project,speed:2,pauseSeconds:.5,render:{kind:'png',stepIndex:0,progress:.75}},()=>{});
  const bytes=Buffer.from(await blob.arrayBuffer()),header=JSON.parse(bytes.toString('utf8',12,12+bytes.readUInt32LE(8)));
  assert.deepEqual(header.steps.map((s:{title:string})=>s.title),['第 1 步 · 撑开纸层','第 1 步 · 向内沉折','第 2 步']);
  const [a,b]=header.steps;
  assert.equal(a.hold,0,'撑开与沉入共用一个接缝帧');
  assert.equal(b.hold,12,'真正步间保留用户的半秒停顿');
  // The baked meshes may differ across the seam. Compare distances travelled
  // on each individual mesh to its mid-fold speed, in the actual Blender bytes.
  let offset=12+bytes.readUInt32LE(8);
  for(const [leg,info] of [a,b].entries()){
    offset+=info.triangles*12+info.vertices*8;
    const stride=info.vertices*12;
    const movement=(f:number)=>{
      let sum=0;
      for(let k=0;k<stride;k+=4){
        const at=offset+f*stride+k;
        sum+=(bytes.readFloatLE(at+stride)-bytes.readFloatLE(at))**2;
      }
      return Math.sqrt(sum);
    };
    assert.ok(movement(leg===0?info.frames-2:0)>.35*movement(Math.floor(info.frames/2)),'接缝两侧持续移动');
    offset+=info.frames*stride;
  }
  assert.equal(header.finalRender.frame,1+(a.frames-1)+a.hold+Math.round((b.frames-1)/2));
  assert.equal(JSON.stringify(project),unchanged);
});

test('沉折只压缩相同姿态的求解时间，显式停顿和原步间设置独立',()=>{
  const positions=[[0,0,0],[.99,0,0],[.99,0,0],[1,0,0]];
  const keyframes=positions.map((p,i)=>({progress:[0,.5,.9,1][i],positions:p}));
  const animation={version:1 as const,sourceSignature:'clock',initialPositions:positions[0],ranges:[],fixedVertices:[],
    dynamic:{version:1 as const,method:'dynamic' as const,keyframes,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  const clock=createSinkPoseClock(animation);
  assert.deepEqual(clock,[[0,0],[.99,.5],[.99,.9],[1,1]]);
  assert.equal(sinkMotionProgress(clock,0),0);
  assert.equal(sinkMotionProgress(clock,.99),.9);
  assert.equal(sinkMotionProgress(clock,1),1);
  assert.equal(createSinkPoseClock({...animation,timings:[{edge:0,start:.2,end:.8}]}),undefined);
  assert.equal(createSinkPoseClock({...animation,dynamic:{...animation.dynamic,contactStop:{progress:.5,reason:'接触'}}}),undefined);
  assert.deepEqual([playbackBoundaryPause(true,2),playbackBoundaryPause(true,2,.5),playbackBoundaryPause(false,-1)],[0,.5,-1]);
});
