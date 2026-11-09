import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {FoldProfile,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import {createSimulationStepRigidDriver} from './simStepRigid';
import {createSimulationStepPathEvaluator,simulationStepMotionAngles,validateSimulationStepMotion,type SimulationStepMotion} from './simStepPath';
import {createSimulationStepFlexEvaluator,inspectSimulationStepFlexCurvature,simulationStepFlexMotionAngles,validateSimulationStepFlexMotion,type SimulationStepFlexMotion,type SimulationStepFlexRequest} from './simStepFlex';
import {certifySimulationStepFlexPath} from './simStepFlexCollision';
import {createSimulationStepDynamicEvaluator,simulationStepDynamicAngles,validateSimulationStepDynamicMotion,type SimulationStepDynamicMotion} from './simStepDynamic';

/** All indices belong to the exact prepared mesh of sourceSignature. Coordinates
 * use the same radius-normalised basis as OrigamiModel, never drawing pixels. */
export interface SimulationStepAnimation {
  version:1;
  sourceSignature:string;
  initialPositions:number[];
  ranges:Array<{edge:number;fromAngle:number;toAngle:number;viaAngle?:number}>;
  fixedVertices:number[];
  /** Diagram previews may retain a geometrically valid self-intersecting path. */
  collisionPolicy?:'allow'|'contact';
  /** Explicit numerical preview when an exact rigid trajectory is unavailable. */
  motionPolicy?:'allow-dynamic';
  /** Curved paper keeps its material metric and selected anchor, but numerical
   * F seams may bend instead of joining complete source faces into rigid bodies. */
  materialMode?:'bendable';
  /** Selected source face for a refined paper fallback; rigid planning may
   * additionally pin its complete unchanged assembly. */
  bendingFixedVertices?:number[];
  dynamic?:SimulationStepDynamicMotion;
  /** Per material hinge, normalized window for its entire out-and-return action. */
  timings?:Array<{edge:number;start:number;end:number}>;
  motion?:SimulationStepMotion;
  /** Temporary bendable material. It never changes the saved CP topology. */
  flexRequest?:SimulationStepFlexRequest;
  flex?:SimulationStepFlexMotion;
  /** Real pre-existing expanded CP marks, including marks folded again now. */
  retainedCreases?:number[];
  /** Trusted contact orders on the common material faces, never palette swaps. */
  layerTimeline?:Array<{progress:number;faceOrders:[number,number,number][]}>;
}

type V3=[number,number,number];
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=(a:V3)=>Math.hypot(...a);
const unit=(a:V3):V3=>{const n=length(a);return [a[0]/n,a[1]/n,a[2]/n];};
const point=(a:ArrayLike<number>,i:number):V3=>[a[i*3],a[i*3+1],a[i*3+2]];
const validAngle=(a:unknown):a is number=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a)<=180;

/** Validate the whole clip before a solver is created or changed. */
export function validateSimulationStepAnimationStructure(value:unknown,prepared:PreparedOrigamiModel,sourceSignature:string):SimulationStepAnimation {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('步骤动画数据无效。');
  const raw=value as Record<string,unknown>;
  if(raw.version!==1||!sourceSignature||raw.sourceSignature!==sourceSignature)throw Error('步骤动画与当前折痕图不匹配，请重新生成动画。');
  if(prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('步骤动画暂使用 CPU 求解，最多支持 1,200 个顶点和 2,400 个三角面。');
  if(!Array.isArray(raw.initialPositions)||raw.initialPositions.length!==prepared.vertexCount*3||
    !Array.from(raw.initialPositions).every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e4))throw Error('步骤动画的初始纸面坐标无效。');
  const initialPositions=raw.initialPositions as number[],model=new OrigamiModel(prepared);
  for(let e=0;e<prepared.edgesVertices.length;e++){
    const [a,b]=prepared.edgesVertices[e],rest=model.edgeRestLength(e),actual=length(sub(point(initialPositions,a),point(initialPositions,b)));
    if(Math.abs(actual/rest-1)>2e-4)throw Error('步骤动画初始纸面存在拉伸，请恢复真实平折状态后重试。');
  }
  const creaseEdges=new Set(prepared.creaseParams.map(c=>c.edge));
  if(!Array.isArray(raw.ranges)||raw.ranges.length!==creaseEdges.size)throw Error('步骤动画缺少折痕角度，不能只播放部分材料网格。');
  const ranges:SimulationStepAnimation['ranges']=[],seen=new Set<number>();
  for(const item of raw.ranges){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('步骤动画的折痕角度无效。');
    const r=item as Record<string,unknown>,edge=r.edge;
    if(typeof edge!=='number'||!Number.isSafeInteger(edge)||!creaseEdges.has(edge)||seen.has(edge)||
      !validAngle(r.fromAngle)||!validAngle(r.toAngle)||r.viaAngle!==undefined&&!validAngle(r.viaAngle))throw Error('步骤动画的折痕索引或角度无效。');
    if(r.fromAngle*r.toAngle<0||r.viaAngle!==undefined&&(r.fromAngle*(r.viaAngle as number)<0||r.toAngle*(r.viaAngle as number)<0))throw Error('步骤动画折角不能越过山谷方向；谷折限 0～180°，峰折限 -180～0°，反向折叠请拆步。');
    seen.add(edge);ranges.push({edge,fromAngle:r.fromAngle,toAngle:r.toAngle,...(r.viaAngle!==undefined?{viaAngle:r.viaAngle as number}:{})});
  }
  const normals=prepared.facesVertices.map(face=>unit(cross(sub(point(initialPositions,face[1]),point(initialPositions,face[0])),sub(point(initialPositions,face[2]),point(initialPositions,face[0])))));
  const byEdge=new Map(ranges.map(r=>[r.edge,r]));
  for(const crease of prepared.creaseParams){
    if(Math.abs(byEdge.get(crease.edge)!.toAngle-crease.targetAngle)>1e-8)throw Error('步骤动画终点角度与操作后折痕图不一致，请重新生成动画。');
    const [a,b]=prepared.edgesVertices[crease.edge],axis=unit(sub(point(initialPositions,b),point(initialPositions,a))),n1=normals[crease.face1],n2=normals[crease.face2];
    const theta=Math.atan2(dot(cross(n1,axis),n2),Math.max(-1,Math.min(1,dot(n1,n2)))),expected=byEdge.get(crease.edge)!.fromAngle*Math.PI/180;
    if(!Number.isFinite(theta)||Math.abs(Math.atan2(Math.sin(theta-expected),Math.cos(theta-expected)))>1e-3)throw Error('步骤动画初始折角与操作前纸面不一致，未启动动画。');
  }
  if(!Array.isArray(raw.fixedVertices)||raw.fixedVertices.length<3||raw.fixedVertices.length>prepared.vertexCount||
    !Array.from(raw.fixedVertices).every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<prepared.vertexCount)||new Set(raw.fixedVertices).size!==raw.fixedVertices.length)throw Error('步骤动画需要有效的固定纸面，请先选择固定侧。');
  const fixedVertices=raw.fixedVertices as number[],anchor=point(initialPositions,fixedVertices[0]);
  let axis:V3=[0,0,0],longest=0;
  for(const v of fixedVertices){const d=sub(point(initialPositions,v),anchor),n=length(d);if(n>longest){axis=d;longest=n;}}
  if(longest<1e-6||!fixedVertices.some(v=>length(cross(axis,sub(point(initialPositions,v),anchor)))>longest*1e-6))throw Error('步骤动画固定点共线，无法保持固定纸面的方向。');
  const order=new Map(prepared.creaseParams.map((c,i)=>[c.edge,i]));ranges.sort((a,b)=>order.get(a.edge)!-order.get(b.edge)!);
  const animation:SimulationStepAnimation={version:1,sourceSignature,initialPositions:[...initialPositions],ranges,fixedVertices:[...fixedVertices]};
  if(raw.collisionPolicy!==undefined){
    if(raw.collisionPolicy!=='allow'&&raw.collisionPolicy!=='contact')throw Error('步骤动画穿模策略无效。');
    animation.collisionPolicy=raw.collisionPolicy;
  }
  if(raw.motionPolicy!==undefined){
    if(raw.motionPolicy!=='allow-dynamic')throw Error('步骤动画运动策略无效。');
    animation.motionPolicy='allow-dynamic';
  }
  if(raw.materialMode!==undefined){
    if(raw.materialMode!=='bendable')throw Error('步骤动画纸张材料模式无效。');
    animation.materialMode='bendable';
  }
  if(raw.bendingFixedVertices!==undefined){
    const anchors=raw.bendingFixedVertices;
    if(!Array.isArray(anchors)||anchors.length<3||new Set(anchors).size!==anchors.length||anchors.some(v=>typeof v!=='number'||!fixedVertices.includes(v)))throw Error('曲面动画固定纸面的顶点无效。');
    const origin=point(initialPositions,anchors[0]),directions=anchors.map(v=>sub(point(initialPositions,v),origin));
    if(!directions.some(a=>directions.some(b=>length(cross(a,b))>1e-10)))throw Error('曲面动画固定纸面不能共线。');
    animation.bendingFixedVertices=[...anchors];
  }
  if(raw.timings!==undefined){
    if(!Array.isArray(raw.timings)||!raw.timings.length||raw.timings.length>ranges.length)throw Error('折痕启动时段无效。');
    const seenTimings=new Set<number>(),timings:NonNullable<SimulationStepAnimation['timings']>=[];
    for(const value of raw.timings){
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('折痕启动时段无效。');
      const row=value as Record<string,unknown>,r=ranges.find(r=>r.edge===row.edge);
      if(!r||seenTimings.has(r.edge)||r.fromAngle===r.toAngle&&(r.viaAngle===undefined||r.viaAngle===r.fromAngle)||typeof row.start!=='number'||typeof row.end!=='number'||!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.start<0||row.end>1||row.end-row.start<1e-8)throw Error('折痕启动时段必须对应活动折痕，且满足 0 ≤ 开始 < 结束 ≤ 1。');
      seenTimings.add(r.edge);timings.push({edge:r.edge,start:row.start,end:row.end});
    }
    animation.timings=timings;
  }
  if(raw.retainedCreases!==undefined){
    if(!Array.isArray(raw.retainedCreases)||raw.retainedCreases.length>prepared.edgeCount||new Set(raw.retainedCreases).size!==raw.retainedCreases.length||
      !Array.from(raw.retainedCreases).every(e=>typeof e==='number'&&Number.isSafeInteger(e)&&e>=0&&e<prepared.edgeCount&&['F','M','V'].includes(prepared.edgesAssignment[e])&&ranges.some(r=>r.edge===e&&r.fromAngle===0)))throw Error('步骤动画的已有折痕显示索引无效。');
    animation.retainedCreases=[...raw.retainedCreases] as number[];
  }
  if(raw.flexRequest!==undefined){
    const request=raw.flexRequest as SimulationStepFlexRequest;
    if(!request||request.version!==1||!Array.isArray(request.bendingStiffness)||request.bendingStiffness.length!==prepared.edgeCount||
      !Array.from(request.bendingStiffness).every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1&&(v===1||prepared.edgesAssignment[i]==='F'))||
      ranges.some(r=>r.fromAngle!==r.toAngle))throw Error('局部柔性压痕的材料参数无效。');
    animation.flexRequest={version:1,bendingStiffness:[...request.bendingStiffness]};
  }
  if(raw.flex!==undefined){
    if(raw.motion!==undefined)throw Error('同一步骤不能混用刚性路径和局部柔性路径。');
    animation.flex=validateSimulationStepFlexMotion(prepared,animation,raw.flex);
    if(animation.flexRequest&&animation.flexRequest.bendingStiffness.some((v,i)=>v!==animation.flex!.bendingStiffness[i]))throw Error('局部柔性动画与材料参数不匹配。');
  }
  if(raw.motion!==undefined)animation.motion=validateSimulationStepMotion(prepared,animation,raw.motion);
  if(raw.dynamic!==undefined){
    if(animation.motionPolicy!=='allow-dynamic'||!['allow','contact'].includes(animation.collisionPolicy??'')||raw.motion!==undefined||raw.flex!==undefined||raw.flexRequest!==undefined)throw Error('数值步骤动画不能混用刚性或局部压痕路径。');
    animation.dynamic=validateSimulationStepDynamicMotion(prepared,animation,raw.dynamic);
  }
  if(raw.layerTimeline!==undefined){
    const frames=raw.layerTimeline,count=prepared.sourceFaceCount??prepared.facesVertices.length;
    if(!Array.isArray(frames)||!frames.length||frames.length>129)throw Error('步骤动画纸层时间序列无效。');
    const timeline:NonNullable<SimulationStepAnimation['layerTimeline']>=[];let rowCount=0;
    for(const frame of frames){
      if(!frame||typeof frame!=='object'||Array.isArray(frame))throw Error('步骤动画纸层时间序列无效。');
      const data=frame as Record<string,unknown>,progress=data.progress;
      if(typeof progress!=='number'||!Number.isFinite(progress)||progress<0||progress>1||timeline.length&&progress<=timeline.at(-1)!.progress||!Array.isArray(data.faceOrders))throw Error('步骤动画纸层时间序列无效。');
      const rows:[number,number,number][]=[],pairs=new Set<string>();rowCount+=data.faceOrders.length;if(rowCount>1_000_000)throw Error('步骤动画纸层关系数量过多。');
      for(const row of data.faceOrders){
        if(!Array.isArray(row)||row.length!==3||!row.slice(0,2).every(v=>Number.isSafeInteger(v)&&v>=0&&v<count)||row[0]===row[1]||row[2]!==1&&row[2]!==-1)throw Error('步骤动画纸层关系无效。');
        const [a,b,sign]=row as [number,number,number],key=a<b?`${a}:${b}`:`${b}:${a}`;if(pairs.has(key))throw Error('步骤动画包含重复的纸层关系。');pairs.add(key);rows.push([a,b,sign]);
      }
      timeline.push({progress,faceOrders:rows});
    }
    if(timeline[0].progress!==0||timeline.at(-1)!.progress!==1)throw Error('步骤动画纸层时间序列缺少起态或终态。');
    animation.layerTimeline=timeline;
  }
  return animation;
}

export function validateSimulationStepAnimation(value:unknown,prepared:PreparedOrigamiModel,sourceSignature:string):SimulationStepAnimation {
  const animation=validateSimulationStepAnimationStructure(value,prepared,sourceSignature);
  if(animation.dynamic)return animation;
  if(animation.flex){
    if(!inspectSimulationStepFlexCurvature(prepared,animation,animation.flex).curved)throw Error('短痕端点附近尚未形成真实曲面过渡，未把整条延长线折叠作为局部压痕播放。');
    if(animation.collisionPolicy==='allow')return animation;
    const batches=animation.flex.batches?.length??1;
    const result=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},animation.flex.keyframes,{maxSegments:4096,maxPairs:Math.min(2_000_000,500_000*batches),maxTimeMs:Math.min(24_000,8000*batches)});
    if(result.status!=='clear')throw Error(result.reason??'未能确认局部柔性曲面不会穿透，未启动动画。');
    return animation;
  }
  if(animation.flexRequest)throw Error('局部柔性压痕尚未完成求解和防穿透检查。');
  // A valid starting and ending drawing does not certify a valid intermediate
  // mechanism. Check the real hinge path before offering playback, including
  // both halves of a fold-and-unfold instruction. Every later seek is checked
  // again by the same driver; incompatible loops never fall back to stretching.
  const driver=animation.motion?createSimulationStepPathEvaluator(prepared,animation,animation.motion).evaluate:null;
  const rigid=driver?null:createSimulationStepRigidDriver(prepared,animation);
  for(const p of [0,.125,.25,.375,.5,.625,.75,.875,1]){
    if(driver){driver(p);continue;}
    const target=new Map(simulationStepFoldProfile(animation,p).ranges.map(r=>[r.edge,r.fromAngle]));
    rigid!(prepared.creaseParams.map(c=>target.get(c.edge)!));
  }
  return animation;
}

/** Precrease instructions use two phases; ordinary creases retain their old
 * angle instead of being multiplied from zero with the global progress. */
export function simulationStepFoldProfile(animation:SimulationStepAnimation,progress:number):FoldProfile {
  const p=Math.max(0,Math.min(1,progress));
  const planned=animation.dynamic?simulationStepDynamicAngles(animation,p):animation.flex?simulationStepFlexMotionAngles(animation,animation.flex,p):animation.motion?simulationStepMotionAngles(animation.motion,p):null;
  return {ranges:animation.ranges.map((r,i)=>{
    const timing=animation.timings?.find(t=>t.edge===r.edge),local=timing?Math.max(0,Math.min(1,(p-timing.start)/(timing.end-timing.start))):p;
    const peak=r.viaAngle===undefined?undefined:r.fromAngle+(r.viaAngle-r.fromAngle)*(animation.flex?.foldLimit??1);
    const angle=planned?planned[i]:peak===undefined?r.fromAngle+(r.toAngle-r.fromAngle)*local:local<=.5?r.fromAngle+(peak-r.fromAngle)*local*2:peak+(r.toAngle-peak)*(local-.5)*2;
    return {edge:r.edge,fromAngle:angle,toAngle:angle};
  })};
}

/** Reload/replay the exact previous folded state, retaining flat rest lengths. */
export function seedSimulationStepAnimation(solver:ReferenceSolver,animation:SimulationStepAnimation):((progress:number)=>void)|undefined {
  solver.reset();
  solver.setFoldProfile(simulationStepFoldProfile(animation,0));
  solver.setFoldPercent(0);
  const angles=new Map(animation.ranges.map(r=>[r.edge,r.fromAngle]));
  const initial=new Float32Array(animation.initialPositions);
  solver.setInitialPositions(initial,solver.model.prepared.creaseParams.map(c=>angles.get(c.edge)!));
  for(const v of animation.fixedVertices)solver.setVertexConstraint(v,point(initial,v));
  if(animation.dynamic){
    const evaluator=createSimulationStepDynamicEvaluator(solver.model.prepared,animation,animation.dynamic);let progress=0;
    // The numerical trajectory is indexed by progress, since equal target
    // angles on an outward/return leg need not have the same dynamic pose.
    solver.setRigidPoseDriver(()=>evaluator.evaluate(progress));
    return value=>{
      if(!Number.isFinite(value))throw Error('步骤动画进度无效。');
      progress=Math.max(0,Math.min(1,value));
      solver.setFoldProfile(simulationStepFoldProfile(animation,progress));solver.setFoldPercent(progress*100);
    };
  }
  solver.setRigidPoseDriver((animation.flex?createSimulationStepFlexEvaluator(solver.model.prepared,animation,animation.flex).driver:createSimulationStepRigidDriver(solver.model.prepared,animation)));
}
