import {screenshotStepAnimationDocuments1015} from './screenshotStepAnimation1015';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {adoptDiagramPose,appendDiagramStep,createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Point,Segment} from '../../src/core/types';

export type ScreenshotStage1016=1|2|3|4;
const p=(x:number,y:number):Point=>[100*x,100*y];
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});

/** Reconstruction of the four 2026-10-16 screenshots. In contrast to the
 * 1015 network, the lower-left corner is also replaced by an eight-vertex
 * twisted ring: LL=(t,u), LC=(k,.5), BC=(.5,1-k) all have their own MV spokes.
 * Screenshots 1, 2 and 4 have identical MV assignments. Screenshot 2 adds a
 * flat vertical mark above UR=(u,t); screenshot 3 changes that mark to M and
 * opens UR's old horizontal M. Screenshot 4 restores the horizontal M and
 * keeps the vertical mark F. */
export function screenshotStepStageDocuments1016(stage:ScreenshotStage1016){
  const {before:base,t,u,h,k}=screenshotStepAnimationDocuments1015(2);
  const corners=[p(0,0),p(1,0),p(1,1),p(0,1)];
  const ring:Point[]=[p(t,t),p(.5,k),p(u,t),p(1-k,.5),p(u,u),p(.5,1-k),p(t,u),p(k,.5)];
  const ur=ring[2],vertical=segment('ur-vertical',p(u,0),ur);
  const doc=normalizeDiagramCP({...base,name:`2026-10-16 截图 ${stage}`,segments:[...base.segments,...stage===1?[]:[vertical]]}).doc;
  const coloured:Segment[]=[
    ...ring.map((a,i)=>segment(`ring-${i}`,a,ring[(i+1)%ring.length],'V')),
    ...corners.map((a,i)=>segment(`corner-${i}`,a,ring[i*2],'V')),
    segment('top-valley',p(.5,0),ring[1],'V'),segment('right-valley',ring[3],p(1,.5),'V'),
    segment('bottom-valley',ring[5],p(.5,1),'V'),segment('left-valley',p(0,.5),ring[7],'V'),
    segment('ul-mountain',p(0,t),ring[0],'M'),segment('top-mountain',p(t,0),ring[1],'M'),
    stage===3?{...vertical,assignment:'M',angle:-180}:segment('ur-horizontal',ur,p(1,t),'M'),
    segment('right-mountain',ring[3],p(1,u),'M'),segment('lr-mountain',ring[4],p(u,1),'M'),
    segment('bottom-mountain',p(t,1),ring[5],'M'),segment('ll-mountain',p(0,u),ring[6],'M'),
    segment('left-mountain',p(0,u),ring[7],'M'),
  ];
  const cp=normalizeDiagramCP(applyDiagramFoldSegments(doc,coloured)).doc;
  return {doc:cp,coloured,ring,corners,vertical,t,u,h,k};
}

export function screenshotStepStagesFixture1016(from:ScreenshotStage1016,to:ScreenshotStage1016){
  const before=screenshotStepStageDocuments1016(from),after=screenshotStepStageDocuments1016(to);
  let counter=0,project=createDiagramProject(before.doc,()=>`screenshot-stages-${from}-${to}-${++counter}`);
  const stepId=project.activeStepId,step=project.steps[0],beforeResult=computeFlatGeometry(buildDiagramFold(before.doc).graph,1e-6);
  if(beforeResult.geometry.status==='ready')project=adoptDiagramPose(project,stepId,step.beforeId,beforeResult);
  project=updateDiagramCP(project,step.afterId,after.doc);
  return {project,stepId,before,after,beforeResult};
}

/** The two-step route explicitly proposed by the user. Its intermediate CP
 * carries a vertical mountain instead of the old horizontal mountain; the
 * final state restores the horizontal fold and retains the vertical F mark. */
export function screenshotStagedPrecreaseFixture1016(){
  const first=screenshotStepStagesFixture1016(1,3),middle=first.after.doc,last=screenshotStepStageDocuments1016(4).doc;
  let counter=0,project=appendDiagramStep(first.project,()=>`screenshot-stage-return-${++counter}`);
  const second=project.steps[1],middleResult=computeFlatGeometry(buildDiagramFold(middle).graph,1e-6);
  if(middleResult.geometry.status==='ready')project=adoptDiagramPose(project,second.id,second.beforeId,middleResult);
  project=updateDiagramCP(project,second.afterId,last);
  return {project,stepIds:[first.stepId,second.id],stages:[1,3,4] as const};
}
