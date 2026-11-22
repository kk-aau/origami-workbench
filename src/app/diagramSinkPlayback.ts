import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import {simulationSourceSignature} from '../engine/simLayerOrder';
import {validateSimulationStepAnimationStructure,type SimulationStepAnimation} from '../engine/simStepAnimation';
import {planSimulationStepDynamic,validateSimulationStepDynamicMotion} from '../engine/simStepDynamic';
import {createSimulationStepPathEvaluator} from '../engine/simStepPath';
import {compileSimulationStepRigidMechanism} from '../engine/simStepRigid';
import {buildSimulationStepDynamicLayerTimeline} from '../engine/simStepLayerTimeline';
import type {SimulationStepPlanningResult} from '../engine/simStepPlanningClient';
import type {DiagramStepAnimationClip} from './diagramStepAnimation';
import type {DiagramSinkTarget} from './diagramSinkTarget';

function matchingPose(a:ArrayLike<number>,b:ArrayLike<number>,tolerance:number,vertices?:number[]){
  if(a.length!==b.length)return false;
  const matches=(v:number)=>Math.hypot(a[3*v]-b[3*v],a[3*v+1]-b[3*v+1],a[3*v+2]-b[3*v+2])<=tolerance;
  if(vertices)return vertices.every(matches);
  for(let i=0;i<a.length/3;i++)if(!matches(i))return false;
  return true;
}

function checkSinkEndpoint(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,positions:ArrayLike<number>,target?:DiagramSinkTarget){
  if(!matchingPose(positions,animation.initialPositions,2e-6,animation.fixedVertices))throw Error('沉折动画未保持指定固定面。');
  // The existing initial-pose validator measures all actual hinge angles
  // and edge lengths. A constant clip checks them against the operation-after CP.
  validateSimulationStepAnimationStructure({
    version:1,sourceSignature:animation.sourceSignature,initialPositions:Array.from(positions),fixedVertices:animation.fixedVertices,
    ranges:animation.ranges.map(r=>({edge:r.edge,fromAngle:r.toAngle,toAngle:r.toAngle})),
  },prepared,animation.sourceSignature);
  if(target&&!matchingPose(positions,target.positions,2e-5))throw Error('沉折轨迹未到达已保存的纸面姿态。');
}

/** On a singular folded configuration the simulator can choose a different
 * branch. Start from the author's other endpoint and solve the inverse fold
 * on the identical triangulation. Only a recording that reaches the original
 * start and passes the original forward material/pin checks can be replayed. */
function reverseSinkMotion(prepared:PreparedOrigamiModel,clip:DiagramStepAnimationClip,destination:number[],onProgress?:(message:string)=>void):SimulationStepPlanningResult{
  const original=clip.animation;
  const ranges=original.ranges.map(r=>({...r,fromAngle:r.toAngle,toAngle:r.fromAngle}));
  const edgesFoldAngle=[...prepared.edgesFoldAngle],edgesAssignment=[...prepared.edgesAssignment];
  for(const r of ranges){
    edgesFoldAngle[r.edge]=r.toAngle;
    edgesAssignment[r.edge]=r.toAngle<0?'M':r.toAngle>0?'V':'F';
  }
  const fold={...prepared.fold,edges_foldAngle:edgesFoldAngle,edges_assignment:edgesAssignment};
  const reverseMesh={...prepared,fold,edgesFoldAngle,edgesAssignment,creaseParams:prepared.creaseParams.map(c=>({...c,targetAngle:edgesFoldAngle[c.edge]??0}))};
  const signature=simulationSourceSignature({
    vertices_coords:prepared.fold.vertices_coords,edges_vertices:prepared.edgesVertices,faces_vertices:prepared.facesVertices,
    edges_assignment:edgesAssignment,edges_foldAngle:edgesFoldAngle,
  });
  const reversed=validateSimulationStepAnimationStructure({
    version:1,sourceSignature:signature,initialPositions:destination,ranges,fixedVertices:original.fixedVertices,
    bendingFixedVertices:original.bendingFixedVertices,materialMode:original.materialMode,collisionPolicy:'allow',motionPolicy:'allow-dynamic',
    timings:original.timings?.map(t=>({edge:t.edge,start:1-t.end,end:1-t.start})),
  },reverseMesh,signature);
  const recording=planSimulationStepDynamic(reverseMesh,reversed,{onProgress});
  if(!matchingPose(recording.keyframes.at(-1)!.positions,original.initialPositions,2e-7))throw Error('从目标反向求解也未能回到本段起始姿态。');
  const keyframes=recording.keyframes.slice().reverse().map(f=>({progress:1-f.progress,positions:f.positions}));
  const animation:SimulationStepAnimation={...original,collisionPolicy:'allow',motionPolicy:'allow-dynamic'};
  animation.dynamic=validateSimulationStepDynamicMotion(prepared,animation,{version:1,method:'dynamic',keyframes});
  animation.layerTimeline=buildSimulationStepDynamicLayerTimeline(prepared,animation,clip.initialDisplayOrder??clip.initialContactOrder);
  return {animation,method:'dynamic',checkedIntervals:0,warnings:['本段从目标姿态反向求解，并按折序方向播放。']};
}

export function planDiagramSinkLeg(prepared:PreparedOrigamiModel,clip:DiagramStepAnimationClip,target:DiagramSinkTarget|undefined,forward:()=>SimulationStepPlanningResult,onProgress?:(message:string)=>void):SimulationStepPlanningResult{
  if(target)checkSinkEndpoint(prepared,clip.animation,target.positions);
  let plan:SimulationStepPlanningResult;
  try{
    plan=forward();
    const animation=plan.animation;
    const end=animation.dynamic?.keyframes.at(-1)?.positions??animation.flex?.keyframes.at(-1)?.positions??
      createSimulationStepPathEvaluator(prepared,animation,animation.motion!).evaluate(1);
    checkSinkEndpoint(prepared,clip.animation,end,target);
  }catch(forwardError){
    onProgress?.('正在从沉折目标姿态反向求解…');
    try{
      const destination=target?.positions??Array.from(compileSimulationStepRigidMechanism(prepared,clip.animation).validatePose(clip.animation.ranges.map(r=>r.toAngle)));
      checkSinkEndpoint(prepared,clip.animation,destination);
      plan=reverseSinkMotion(prepared,clip,destination,onProgress);
      checkSinkEndpoint(prepared,clip.animation,plan.animation.dynamic!.keyframes.at(-1)!.positions,target);
    }catch(reverseError){
      const message=(e:unknown)=>e instanceof Error?e.message:String(e);
      throw Error('沉折路径无法与中间图连续衔接。正向求解：'+message(forwardError)+' 反向求解：'+message(reverseError));
    }
  }
  // Numerical approach order is inferred from the penultimate sample.
  // Once the saved endpoint is reached, use its verified contact solution.
  if(target?.faceOrders){
    const seed=clip.initialDisplayOrder?.faceOrders??clip.initialContactOrder?.faceOrders;
    const originalTimeline=plan.animation.layerTimeline??[{progress:0,faceOrders:seed?.map(([a,b,s]):[number,number,number]=>[a,b,s])??[]}];
    const timeline=[...originalTimeline.filter(f=>f.progress<1),{progress:1,faceOrders:target.faceOrders}];
    return {...plan,animation:{...plan.animation,layerTimeline:timeline}};
  }
  return plan;
}
