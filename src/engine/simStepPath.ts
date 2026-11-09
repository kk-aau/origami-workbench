import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {compileSimulationStepRigidMechanism} from './simStepRigid';
import {simulationStepAxisGroups,simulationStepGroupCombinations} from './simStepScheduling';

/** A temporary playback plan. Angles follow prepared.creaseParams, never CP
 * drawing order. It is deliberately separate from the saved diagram format. */
export interface SimulationStepMotionPhase {
  start:number;
  end:number;
  fromAngles:number[];
  toAngles:number[];
  kind:'linear'|'tangent';
  /** For a flat-foldable one-degree-of-freedom mechanism, the half-angle
   * tangents have constant ratios. Positive coefficients preserve each MV. */
  coefficients?:number[];
}
export interface SimulationStepMotion {
  version:1;
  method:'simultaneous'|'sequential'|'coupled'|'batched'|'scheduled';
  /** Recomputed from the actual phase instructions at the trust boundary. */
  batches?:Array<{start:number;end:number;apex?:number;creases:number[]}>;
  phases:SimulationStepMotionPhase[];
  knots:Array<{progress:number;angles:number[]}>;
  maxClosureResidual:number;
}
export interface SimulationStepPathEvaluator {
  evaluate(progress:number):Float32Array;
  angles(progress:number):number[];
  angleBounds(start:number,end:number):Array<{min:number;max:number}>;
  /** Per material vertex, an upper bound on displacement from the interval's
   * midpoint over its entire duration, not just its two endpoints. */
  motionBound(start:number,end:number):number[];
  mechanism:ReturnType<typeof compileSimulationStepRigidMechanism>;
}
export interface SimulationStepPathCheck {
  status:'clear'|'collision'|'inconclusive';message?:string;
  /** A localized failed interval allows equivalent batch candidates to be
   * skipped during this bounded search. It is never a success certificate. */
  progress?:number;interval?:[number,number];
}
export interface SimulationStepPathOptions {
  checkPath?:(path:SimulationStepPathEvaluator,motion:SimulationStepMotion)=>SimulationStepPathCheck;
  maxCandidates?:number;
  /** Total planning budget, including synchronous continuous checks. One
   * running check is allowed to finish, but no further candidate then starts. */
  maxSearchMs?:number;
}

export class SimulationStepPathError extends Error {
  constructor(readonly reason:'geometry'|'collision'|'inconclusive',message:string){super(message);this.name='SimulationStepPathError';}
}

const tolerance=2e-5;
const phaseLimit=128;
const knotLimit=4096;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const different=(a:number,b:number)=>Math.abs(a-b)>1e-8;
const isFlat=(a:number)=>Math.abs(a)<1e-8;
const isFolded=(a:number)=>Math.abs(Math.abs(a)-180)<1e-8;
const fullSweep=(a:number,b:number)=>isFlat(a)&&isFolded(b)||isFolded(a)&&isFlat(b);
const endpoints=(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation)=>{
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r]));
  const from=prepared.creaseParams.map(c=>ranges.get(c.edge)!.fromAngle);
  const to=prepared.creaseParams.map(c=>ranges.get(c.edge)!.toAngle);
  const via=animation.ranges.some(r=>r.viaAngle!==undefined)?prepared.creaseParams.map(c=>{
    const r=ranges.get(c.edge)!;return r.viaAngle??(r.fromAngle+r.toAngle)/2;
  }):null;
  const instructions=prepared.creaseParams.map(c=>ranges.get(c.edge)!);
  return {from,to,via,instructions};
};
const same=(a:readonly number[],b:readonly number[])=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-8);

/** User timings describe the complete excursion, including the return of a
 * precrease. Split at every start, finish and apex so each interval has an
 * exact, seek-independent linear angle law. No geometric search may silently
 * move these boundaries or substitute a different folding order. */
function scheduledPhases(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):SimulationStepMotionPhase[]|null{
  if(animation.timings===undefined)return null;
  if(!Array.isArray(animation.timings)||!animation.timings.length||animation.timings.length>prepared.creaseParams.length)throw Error('折痕启动时段无效。');
  const expected=endpoints(prepared,animation),timings=new Map<number,{start:number;end:number}>();
  for(const row of animation.timings){
    if(!row||typeof row.edge!=='number'||!Number.isInteger(row.edge)||timings.has(row.edge)||typeof row.start!=='number'||typeof row.end!=='number'||!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.start<0||row.end>1||row.end-row.start<1e-8)throw Error('折痕启动时段无效或时间间隔过短。');
    const instruction=expected.instructions.find(r=>r.edge===row.edge);
    if(!instruction||!different(instruction.fromAngle,instruction.toAngle)&&!(instruction.viaAngle!==undefined&&different(instruction.fromAngle,instruction.viaAngle)))throw Error('只能为本步参与运动的折痕设置启动时段。');
    timings.set(row.edge,row);
  }
  const windows=expected.instructions.map(r=>timings.get(r.edge)??{start:0,end:1}),points=new Set<number>([0,1]);
  expected.instructions.forEach((r,i)=>{
    const window=windows[i];points.add(window.start);points.add(window.end);
    if(r.viaAngle!==undefined)points.add((window.start+window.end)/2);
  });
  const boundaries=[...points].sort((a,b)=>a-b);
  if(boundaries.length-1>phaseLimit)throw Error('自定义折痕时序的分段数量过多，请合并启动时段。');
  if(boundaries.some((p,i)=>i>0&&p-boundaries[i-1]<1e-8))throw Error('折痕启动时段的边界过近，请调整启动比例。');
  const at=(progress:number)=>expected.instructions.map((r,i)=>{
    const window=windows[i];
    if(progress<=window.start)return r.fromAngle;
    if(progress>=window.end)return r.toAngle;
    const local=(progress-window.start)/(window.end-window.start);
    if(r.viaAngle===undefined)return r.fromAngle+(r.toAngle-r.fromAngle)*local;
    const midpoint=(window.start+window.end)/2;
    if(progress===midpoint)return r.viaAngle;
    return progress<midpoint?r.fromAngle+(r.viaAngle-r.fromAngle)*local*2:r.viaAngle+(r.toAngle-r.viaAngle)*(local*2-1);
  });
  return boundaries.slice(1).map((end,i)=>({start:boundaries[i],end,fromAngles:at(boundaries[i]),toAngles:at(end),kind:'linear'}));
}

function commonTimingWindow(expected:ReturnType<typeof endpoints>,animation:SimulationStepAnimation):{start:number;end:number}|null{
  const active=expected.instructions.filter(r=>different(r.fromAngle,r.toAngle)||r.viaAngle!==undefined&&different(r.fromAngle,r.viaAngle));
  const windows=active.map(r=>animation.timings?.find(t=>t.edge===r.edge)??{start:0,end:1}),first=windows[0];
  return first&&windows.every(w=>w.start===first.start&&w.end===first.end)?first:null;
}

/** Check actual instructions, rather than trusting a descriptive method tag.
 * A forged or stale serialized plan must not bypass a delayed start. */
function validateScheduledPhases(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,phases:SimulationStepMotionPhase[],method:unknown){
  const requested=scheduledPhases(prepared,animation);
  if(!requested){if(method==='scheduled')throw Error('自定义时序路径缺少折痕启动设置。');return;}
  const expected=endpoints(prepared,animation),window=commonTimingWindow(expected,animation);
  // Equal windows preserve the real nonlinear folding branch. Enforce actual
  // participation throughout each requested leg, not a loose containment rule
  // that would allow a serialized sequential plan to delay some hinges again.
  if(window){
    const at=(progress:number)=>phaseAngles(phases.find(p=>progress<=p.end+1e-12)!,progress);
    const close=(a:number,b:number)=>Math.abs(a-b)<1e-10;
    let valid=method==='scheduled';
    expected.instructions.forEach((r,i)=>{
      const moving=different(r.fromAngle,r.toAngle)||r.viaAngle!==undefined&&different(r.fromAngle,r.viaAngle);
      if(!moving)return;
      const times=r.viaAngle===undefined?[window.start,window.end]:[window.start,(window.start+window.end)/2,window.end];
      const values=r.viaAngle===undefined?[r.fromAngle,r.toAngle]:[r.fromAngle,r.viaAngle,r.toAngle];
      times.forEach((t,j)=>{if(different(at(t)[i],values[j]))valid=false;});
      phases.forEach(phase=>{
        if(phase.end<=window.start+1e-10&&different(phase.toAngles[i],r.fromAngle)||phase.start>=window.end-1e-10&&different(phase.fromAngles[i],r.toAngle))valid=false;
      });
      for(let leg=0;leg<times.length-1;leg++){
        const segment=phases.filter(p=>p.end>times[leg]+1e-10&&p.start<times[leg+1]-1e-10);
        if(!segment.length||!close(segment[0].start,times[leg])||!close(segment.at(-1)!.end,times[leg+1])){valid=false;continue;}
        if(segment.some(p=>different(p.fromAngles[i],p.toAngles[i])!==different(values[leg],values[leg+1])))valid=false;
      }
    });
    if(!valid)throw Error('步骤动画运动路径与自定义折痕启动时序不一致，请重新生成动画。');
    return;
  }
  if(method!=='scheduled'||phases.length!==requested.length||phases.some((phase,i)=>{
    const expected=requested[i];
    return phase.kind!=='linear'||phase.start!==expected.start||phase.end!==expected.end||!same(phase.fromAngles,expected.fromAngles)||!same(phase.toAngles,expected.toAngles);
  }))throw Error('步骤动画运动路径与自定义折痕启动时序不一致，请重新生成动画。');
}

/** Each precrease has its own single directed excursion. A batch may finish
 * and unfold before a later instruction begins; there is no global apex. */
function validateInstructions(phases:SimulationStepMotionPhase[],expected:ReturnType<typeof endpoints>):NonNullable<SimulationStepMotion['batches']>{
  const reached=expected.instructions.map(r=>r.viaAngle===undefined||!different(r.fromAngle,r.viaAngle));
  const finished=expected.instructions.map(r=>r.viaAngle===undefined?!different(r.fromAngle,r.toAngle):!different(r.fromAngle,r.viaAngle)&&!different(r.viaAngle,r.toAngle));
  const batches:NonNullable<SimulationStepMotion['batches']>=[];
  let batchStart=0,pending=new Set<number>(),members=new Set<number>();
  const peaks=new Map<number,number>();
  for(const phase of phases){
    for(let i=0;i<expected.from.length;i++){
      const r=expected.instructions[i],a=phase.fromAngles[i],b=phase.toAngles[i];
      const target=r.viaAngle!==undefined&&!reached[i]?r.viaAngle:r.toAngle;
      const origin=r.viaAngle!==undefined&&reached[i]?r.viaAngle:r.fromAngle;
      const lo=Math.min(origin,target)-1e-8,hi=Math.max(origin,target)+1e-8;
      if(a<lo||a>hi||b<lo||b>hi||(b-a)*(target-origin)<-1e-8||!different(origin,target)&&different(a,origin))throw Error('步骤动画路径改变了未参与折痕、重复预折或超出了本步指定折角。');
      if(different(a,b)){
        if(finished[i])throw Error('步骤动画路径重复执行了已完成的折痕。');
        if(!members.size)batchStart=phase.start;
        members.add(i);pending.add(i);
      }
      if(r.viaAngle!==undefined&&!reached[i]&&!different(b,r.viaAngle)){reached[i]=true;peaks.set(i,phase.end);}
      if((r.viaAngle===undefined||reached[i])&&!different(b,r.toAngle)){
        finished[i]=true;pending.delete(i);
      }
    }
    if(members.size&&!pending.size){
      const creases=[...members].sort((a,b)=>a-b),times=creases.flatMap(i=>peaks.has(i)?[peaks.get(i)!]:[]);
      const apex=times.length&&times.every(t=>Math.abs(t-times[0])<1e-10)?times[0]:undefined;
      batches.push({start:batchStart,end:phase.end,...apex!==undefined?{apex}:{},creases});members=new Set();pending=new Set();
    }
  }
  if(finished.some(v=>!v)||reached.some(v=>!v)||members.size)throw Error('预折动画未完整经过每条指定折痕的峰值并返回。');
  return batches;
}

function phaseAngles(phase:SimulationStepMotionPhase,progress:number):number[]{
  const p=clamp((progress-phase.start)/(phase.end-phase.start));
  if(p===0)return [...phase.fromAngles];
  if(p===1)return [...phase.toAngles];
  if(phase.kind==='linear')return phase.fromAngles.map((a,i)=>a+(phase.toAngles[i]-a)*p);
  const u=Math.tan(Math.PI*p/2);
  return phase.fromAngles.map((a,i)=>{
    const b=phase.toAngles[i];if(!different(a,b))return a;
    const k=phase.coefficients![i],sign=Math.sign(isFlat(a)?b:a);
    return sign*2*Math.atan(k*(isFlat(a)?u:1/u))*180/Math.PI;
  });
}

/** Angle lookup after validateSimulationStepMotion has accepted a plan. */
export function simulationStepMotionAngles(motion:SimulationStepMotion,progress:number):number[]{
  if(!Number.isFinite(progress))throw Error('步骤动画进度无效。');
  const p=clamp(progress),phase=motion.phases.find(item=>p<=item.end+1e-12);
  if(!phase)throw Error('步骤动画运动路径缺少当前进度。');
  return phaseAngles(phase,p);
}

/** Validate serialized data at the iframe boundary. Metadata and knots are
 * descriptive; every requested pose is checked again against real material
 * closure. No stored residual or success flag is accepted as a certificate. */
export function validateSimulationStepMotion(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,value:unknown):SimulationStepMotion{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('步骤动画运动路径无效。');
  const raw=value as Record<string,unknown>,count=prepared.creaseParams.length;
  if(raw.version!==1||!['simultaneous','sequential','coupled','batched','scheduled'].includes(raw.method as string)||!Array.isArray(raw.phases)||!raw.phases.length||raw.phases.length>phaseLimit)throw Error('步骤动画运动路径格式或分段数量无效。');
  const finiteAngles=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===count&&Array.from(v).every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=180);
  const phases:SimulationStepMotionPhase[]=[];
  for(const item of raw.phases){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('步骤动画运动分段无效。');
    const p=item as Record<string,unknown>;
    if(typeof p.start!=='number'||typeof p.end!=='number'||!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end>1||p.end-p.start<1e-8||!finiteAngles(p.fromAngles)||!finiteAngles(p.toAngles)||p.kind!=='linear'&&p.kind!=='tangent')throw Error('步骤动画运动分段或角度无效。');
    const phase:SimulationStepMotionPhase={start:p.start,end:p.end,fromAngles:[...p.fromAngles],toAngles:[...p.toAngles],kind:p.kind};
    if(phase.kind==='tangent'){
      if(!Array.isArray(p.coefficients)||p.coefficients.length!==count||!Array.from(p.coefficients).every(k=>typeof k==='number'&&Number.isFinite(k)&&k>=1e-5&&k<=1e5)||phase.fromAngles.some((a,i)=>different(a,phase.toAngles[i])&&!fullSweep(a,phase.toAngles[i])))throw Error('步骤动画联动折角不符合完整平折路径。');
      phase.coefficients=[...p.coefficients] as number[];
    }
    if(phases.length&&(Math.abs(phase.start-phases.at(-1)!.end)>1e-10||!same(phase.fromAngles,phases.at(-1)!.toAngles)))throw Error('步骤动画运动路径不连续。');
    phases.push(phase);
  }
  const expected=endpoints(prepared,animation);
  if(phases[0].start!==0||phases.at(-1)!.end!==1||!same(phases[0].fromAngles,expected.from)||!same(phases.at(-1)!.toAngles,expected.to))throw Error('步骤动画运动路径与操作前后折角不一致。');
  validateScheduledPhases(prepared,animation,phases,raw.method);
  const batches=validateInstructions(phases,expected);
  if(raw.batches!==undefined){
    if(!Array.isArray(raw.batches)||raw.batches.length!==batches.length)throw Error('步骤动画批次与实际运动路径不一致。');
    raw.batches.forEach((item,i)=>{
      if(!item||typeof item!=='object'||Array.isArray(item))throw Error('步骤动画批次无效。');
      const b=item as Record<string,unknown>,actual=batches[i];
      if(b.start!==actual.start||b.end!==actual.end||b.apex!==actual.apex||!Array.isArray(b.creases)||b.creases.length!==actual.creases.length||b.creases.some((v,j)=>v!==actual.creases[j]))throw Error('步骤动画批次与实际运动路径不一致。');
    });
  }
  if(!Array.isArray(raw.knots)||raw.knots.length<2||raw.knots.length>knotLimit)throw Error('步骤动画路径采样数量无效。');
  const knots:SimulationStepMotion['knots']=[];
  for(const item of raw.knots){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('步骤动画路径采样无效。');
    const k=item as Record<string,unknown>;
    if(typeof k.progress!=='number'||!Number.isFinite(k.progress)||k.progress<0||k.progress>1||knots.length&&k.progress<=knots.at(-1)!.progress||!finiteAngles(k.angles))throw Error('步骤动画路径采样或折角无效。');
    const progress=k.progress,phase=phases.find(p=>progress<=p.end+1e-12)!;
    if(!same(k.angles,phaseAngles(phase,progress)))throw Error('步骤动画路径采样与实际联动方式不一致。');
    knots.push({progress,angles:[...k.angles]});
  }
  if(knots[0].progress!==0||knots.at(-1)!.progress!==1)throw Error('步骤动画路径采样缺少起点或终点。');
  const motion:SimulationStepMotion={version:1,method:raw.method as SimulationStepMotion['method'],phases,knots,batches,maxClosureResidual:0};
  const evaluator=createSimulationStepPathEvaluatorUnchecked(prepared,animation,motion);
  for(const phase of phases)for(const t of [0,.001,.03,.125,.25,.5,.75,.875,.97,.999,1]){
    const angles=phaseAngles(phase,phase.start+(phase.end-phase.start)*t),evaluation=evaluator.mechanism.evaluateAngles(angles);
    evaluator.mechanism.validatePose(angles,evaluation);motion.maxClosureResidual=Math.max(motion.maxClosureResidual,evaluation.maxResidual);
  }
  return motion;
}

function createSimulationStepPathEvaluatorUnchecked(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,motion:SimulationStepMotion):SimulationStepPathEvaluator{
  const mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  const angles=(progress:number)=>simulationStepMotionAngles(motion,progress);
  const angleBounds=(start:number,end:number)=>{
    if(!Number.isFinite(start)||!Number.isFinite(end))throw Error('步骤动画区间无效。');
    const lo=clamp(Math.min(start,end)),hi=clamp(Math.max(start,end)),points=[angles(lo),angles(hi)];
    for(const p of motion.phases)if(p.end>lo&&p.end<hi)points.push([...p.toAngles]);
    return prepared.creaseParams.map((_,i)=>({min:Math.min(...points.map(p=>p[i])),max:Math.max(...points.map(p=>p[i]))}));
  };
  return {mechanism,angles,angleBounds,evaluate(progress){const a=angles(progress);return mechanism.validatePose(a,mechanism.evaluateAngles(a));},motionBound(start,end){
    const mid=(start+end)/2,center=angles(mid),bounds=angleBounds(start,end);
    const far=bounds.map((b,i)=>center[i]+Math.max(Math.abs(center[i]-b.min),Math.abs(center[i]-b.max)));
    const bodies=mechanism.displacementBounds(center,far);
    return mechanism.vertexBodies.map(body=>bodies[body]);
  }};
}

/** Runtime evaluator retains strict closure checks at arbitrary seeks. Analytic
 * half-angle interpolation avoids the disconnected meshes caused by linearly
 * interpolating four coupled crease angles independently. */
export function createSimulationStepPathEvaluator(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,motion:SimulationStepMotion):SimulationStepPathEvaluator{
  return createSimulationStepPathEvaluatorUnchecked(prepared,animation,validateSimulationStepMotion(prepared,animation,motion));
}

function makeMotion(phases:SimulationStepMotionPhase[],method:SimulationStepMotion['method']):SimulationStepMotion{
  const knots:SimulationStepMotion['knots']=[];
  for(const phase of phases)for(let s=0;s<=16;s++){
    const progress=phase.start+(phase.end-phase.start)*s/16;
    if(knots.length&&Math.abs(knots.at(-1)!.progress-progress)<1e-12)continue;
    knots.push({progress,angles:phaseAngles(phase,progress)});
  }
  return {version:1,method,phases,knots,maxClosureResidual:0};
}

/** Small bounded dense solve; only the changing hinges are variables. Old
 * folds and material pins are never softened to make a candidate fit. */
function solveLinear(matrix:number[][],rhs:number[]):number[]|null{
  const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let col=0;col<n;col++){
    let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
    if(Math.abs(a[pivot][col])<1e-16)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];const divisor=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=divisor;
    for(let i=0;i<n;i++)if(i!==col){const k=a[i][col];for(let j=col;j<=n;j++)a[i][j]-=k*a[col][j];}
  }
  return a.map(row=>row[n]);
}
const normSquared=(a:ArrayLike<number>)=>Array.from(a).reduce((s,v)=>s+v*v,0);
function projectClosure(mechanism:SimulationStepPathEvaluator['mechanism'],from:number[],to:number[],driver:number,seed:number[]):number[]|null{
  const active=from.flatMap((v,i)=>different(v,to[i])&&i!==driver?[i]:[]);if(active.length>32)return null;
  let x=[...seed],lambda=1e-7;
  for(let iteration=0;iteration<100;iteration++){
    const evaluation=mechanism.evaluateAngles(x),r=evaluation.residuals,cost=normSquared(r);
    if(evaluation.maxResidual<2e-9){try{mechanism.validatePose(x,evaluation);return x;}catch{/* Continue if the strict geometric checks expose an unscaled residual. */}}
    const jacobian=active.map(index=>{
      const trial=[...x],h=.005;trial[index]+=h;
      const next=mechanism.evaluateAngles(trial).residuals;
      return Array.from(r,(v,i)=>(next[i]-v)/h);
    });
    const matrix=active.map((_,i)=>active.map((__,j)=>jacobian[i].reduce((sum,v,k)=>sum+v*jacobian[j][k],i===j?lambda:0)));
    const rhs=active.map((_,i)=>-jacobian[i].reduce((sum,v,k)=>sum+v*r[k],0)),delta=solveLinear(matrix,rhs);
    if(!delta)return null;
    let improved=false;
    for(const scale of [1,.5,.25,.1,.03]){
      const trial=[...x];active.forEach((index,i)=>trial[index]=Math.max(Math.min(from[index],to[index])+1e-5,Math.min(Math.max(from[index],to[index])-1e-5,x[index]+scale*Math.max(-35,Math.min(35,delta[i])))));
      if(normSquared(mechanism.evaluateAngles(trial).residuals)<cost){x=trial;lambda=Math.max(1e-12,lambda*.3);improved=true;break;}
    }
    if(!improved){lambda*=10;if(lambda>1e6)break;}
  }
  const result=mechanism.evaluateAngles(x);try{mechanism.validatePose(x,result);return result.maxResidual<tolerance/10?x:null;}catch{return null;}
}

/** Joint blocks meeting at just one rigid body have independent relative
 * motion. Parallel material hinges remain in the same multigraph block. */
function independentJointBlocks(mechanism:SimulationStepPathEvaluator['mechanism']):number[][]{
  const adjacency=mechanism.components.map(()=>[] as number[]);
  mechanism.joints.forEach((joint,i)=>{if(joint.a!==joint.b){adjacency[joint.a].push(i);adjacency[joint.b].push(i);}});
  const discovery=adjacency.map(()=>0),low=adjacency.map(()=>0),stack:number[]=[],blocks:number[][]=[];let clock=0;
  const visit=(body:number,parentJoint:number)=>{
    discovery[body]=low[body]=++clock;
    for(const index of adjacency[body]){
      if(index===parentJoint)continue;
      const joint=mechanism.joints[index],next=joint.a===body?joint.b:joint.a;
      if(!discovery[next]){
        stack.push(index);visit(next,index);low[body]=Math.min(low[body],low[next]);
        if(low[next]>=discovery[body]){
          const creases:number[]=[];let edge:number;
          do{edge=stack.pop()!;creases.push(mechanism.joints[edge].crease);}while(edge!==index);
          blocks.push(creases);
        }
      }else if(discovery[next]<discovery[body]){stack.push(index);low[body]=Math.min(low[body],discovery[next]);}
    }
  };
  visit(mechanism.root,-1);return blocks;
}

function* coupledPhaseCandidates(mechanism:SimulationStepPathEvaluator['mechanism'],phase:SimulationStepMotionPhase,exhausted=()=>false):Generator<SimulationStepMotionPhase>{
  const active=phase.fromAngles.flatMap((v,i)=>different(v,phase.toAngles[i])?[i]:[]);
  if(active.length<3||active.some(i=>!fullSweep(phase.fromAngles[i],phase.toAngles[i])))return;
  const activeSet=new Set(active),blocks=independentJointBlocks(mechanism).map(block=>block.filter(i=>activeSet.has(i))).filter(block=>block.length);
  for(const driver of active.slice(0,12))for(const bias of [1,.35,2.2]){
    if(exhausted())return;
    const seed=phase.fromAngles.map((a,i)=>{
      if(!different(a,phase.toAngles[i]))return a;
      const sign=Math.sign(isFlat(a)?phase.toAngles[i]:a);return sign*2*Math.atan(i===driver?1:bias)*180/Math.PI;
    });
    const solved=projectClosure(mechanism,phase.fromAngles,phase.toAngles,driver,seed);if(!solved)continue;
    const coefficients=solved.map((angle,i)=>different(phase.fromAngles[i],phase.toAngles[i])?Math.tan(Math.abs(angle)*Math.PI/360):1);
    if(coefficients.some(k=>!Number.isFinite(k)||k<1e-5||k>1e5))continue;
    const variants=[coefficients];
    if(blocks.length>1){
      const synchronized=[...coefficients];
      for(const block of blocks){const speed=Math.max(...block.map(i=>coefficients[i]));for(const i of block)synchronized[i]/=speed;}
      variants.push(synchronized);
    }
    for(const values of variants){
      if(exhausted())return;
      const candidate={...phase,kind:'tangent' as const,coefficients:values};
      try{
        for(const t of [.001,.01,.03,.09,.18,.32,.5,.73,.89,.97,.999]){const angles=phaseAngles(candidate,phase.start+(phase.end-phase.start)*t);mechanism.validatePose(angles,mechanism.evaluateAngles(angles));}
        // Different drivers and seeds may choose different relative speeds of
        // independent closed vertices. Geometric closure alone cannot select a
        // collision-safe member of that family; let the caller check each one.
        yield candidate;
      }catch{/* A generic mechanism need not have constant half-angle ratios. */}
    }
  }
}

const coupledPhase=(mechanism:SimulationStepPathEvaluator['mechanism'],phase:SimulationStepMotionPhase):SimulationStepMotionPhase|null=>coupledPhaseCandidates(mechanism,phase).next().value??null;

function orders(indices:number[],limit:number):number[][]{
  const result:number[][]=[],seen=new Set<string>();
  const add=(order:number[])=>{const key=order.join(',');if(!seen.has(key)){seen.add(key);result.push(order);}};
  add([...indices]);add([...indices].reverse());
  if(indices.length<=6){
    const visit=(prefix:number[],remaining:number[])=>{
      if(result.length>=limit)return;if(!remaining.length){add(prefix);return;}
      for(const i of remaining)visit([...prefix,i],remaining.filter(v=>v!==i));
    };visit([],indices);
  }else for(let shift=1;shift<indices.length&&result.length<limit;shift++){add([...indices.slice(shift),...indices.slice(0,shift)]);add([...indices.slice(shift),...indices.slice(0,shift)].reverse());}
  return result.slice(0,limit);
}

/** The geometry stage searches whole material axes, not triangulation edges.
 * A closed vertex is not indiscriminately merged: different subsets of its
 * axes can be valid mechanisms (two crossing precreases are a simple example).
 * Every complete candidate is still subjected to the caller's full CCD. */
function searchBatchedPaths(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,mechanism:SimulationStepPathEvaluator['mechanism'],expected:ReturnType<typeof endpoints>,accept:(phases:SimulationStepMotionPhase[],method:SimulationStepMotion['method'])=>SimulationStepMotion|null,lastChecked:(phases:SimulationStepMotionPhase[])=>SimulationStepPathCheck|undefined,exhausted:()=>boolean):SimulationStepMotion|null{
  const groups=simulationStepAxisGroups(prepared,animation);if(groups.length<2||groups.length*2>phaseLimit)return null;
  let geometricAttempts=0;
  const cache=new Map<string,SimulationStepMotionPhase[]|null>();
  const blocked=new Set<string>();
  const batchKey=(current:number[],ids:number[])=>`${current.join(',')}/${ids.join(',')}`;
  const materialBatch=(current:number[],ids:number[]):SimulationStepMotionPhase[]|null=>{
    const key=batchKey(current,ids);if(blocked.has(key))return null;if(cache.has(key))return cache.get(key)!;
    if(++geometricAttempts>2048||exhausted())return null;
    const creases=ids.flatMap(i=>groups[i].creases),peak=[...current];
    for(const i of creases)peak[i]=expected.instructions[i].viaAngle??expected.to[i];
    let outward:SimulationStepMotionPhase={start:0,end:1,fromAngles:[...current],toAngles:peak,kind:'linear'};
    const valid=(phase:SimulationStepMotionPhase)=>{
      try{for(const p of [0,.125,.375,.625,.875,1]){const angles=phaseAngles(phase,p);mechanism.validatePose(angles,mechanism.evaluateAngles(angles));}return true;}catch{return false;}
    };
    if(!valid(outward)){
      // Existing full-step nonlinear mechanisms take the fast path above.
      // Small subset mechanisms may also need joint half-angle motion. Bound
      // the expensive closure solve instead of treating every failed large
      // collection as a new dense optimization problem.
      const linked=groups.length<=6&&creases.length<=12?coupledPhase(mechanism,outward):null;
      if(!linked){cache.set(key,null);return null;}outward=linked;
    }
    const phases=[outward],returned=[...peak];
    for(const i of creases)if(expected.instructions[i].viaAngle!==undefined)returned[i]=expected.to[i];
    if(!same(returned,peak)){
      const inverse=same(returned,current);
      const back:SimulationStepMotionPhase={start:0,end:1,fromAngles:[...peak],toAngles:returned,kind:inverse?outward.kind:'linear',...inverse&&outward.coefficients?{coefficients:[...outward.coefficients]}:{}};
      if(!valid(back)){cache.set(key,null);return null;}phases.push(back);
    }
    cache.set(key,phases);return phases;
  };
  const normalized=(phases:SimulationStepMotionPhase[])=>phases.map((phase,i)=>({...phase,start:i/phases.length,end:(i+1)/phases.length}));
  const visit=(remaining:number[],current:number[],prefix:SimulationStepMotionPhase[],schedule:Array<{key:string;first:number;last:number}>):SimulationStepMotion|null=>{
    if(exhausted()||geometricAttempts>2048||schedule.some(b=>blocked.has(b.key)))return null;
    if(!remaining.length){
      const phases=normalized(prefix),result=accept(phases,expected.via?'batched':'sequential');if(result)return result;
      const check=lastChecked(phases);
      if(check&&check.status!=='clear')for(const batch of schedule){
        const start=phases[batch.first].start,end=phases[batch.last].end;
        const insidePoint=check.status==='collision'&&check.progress!==undefined&&check.progress>start+1e-10&&check.progress<end-1e-10;
        const insideInterval=check.interval&&check.interval[0]>start+1e-10&&check.interval[1]<end-1e-10;
        // Contact at the boundary between batches can depend on both sides;
        // do not attribute such a failure to either batch in isolation.
        if(insidePoint||insideInterval)blocked.add(batch.key);
      }
      return null;
    }
    for(const ids of simulationStepGroupCombinations(groups,remaining)){
      if(exhausted()||geometricAttempts>2048||schedule.some(b=>blocked.has(b.key)))return null;
      const batch=materialBatch(current,ids);if(!batch)continue;
      if(prefix.length+batch.length>phaseLimit)continue;
      const result=visit(remaining.filter(i=>!ids.includes(i)),batch.at(-1)!.toAngles,[...prefix,...batch],[...schedule,{key:batchKey(current,ids),first:prefix.length,last:prefix.length+batch.length-1}]);
      if(result)return result;
    }
    return null;
  };
  return visit(groups.map((_,i)=>i),expected.from,[],[]);
}

/** Search a bounded set of material-valid paths. A caller-provided continuous
 * collision check is run for every candidate before it is accepted, allowing
 * independent paper flaps to fold in a safe order instead of simultaneously. */
export function planSimulationStepPath(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,options:SimulationStepPathOptions={}):SimulationStepMotion{
  const expected=endpoints(prepared,animation),points=expected.via?[expected.from,expected.via,expected.to]:[expected.from,expected.to];
  const base=points.slice(1).map((to,i)=>({start:i/(points.length-1),end:(i+1)/(points.length-1),fromAngles:[...points[i]],toAngles:[...to],kind:'linear' as const}));
  const maxCandidates=Math.max(1,Math.min(96,Math.trunc(options.maxCandidates??48))),mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  const deadline=Date.now()+Math.max(1,options.maxSearchMs??Infinity);
  let attempted=0,lastCheck:SimulationStepPathCheck|undefined,geometricPath=false,lastCheckedPhases:SimulationStepMotionPhase[]|undefined;
  const checkedCandidates=new Map<string,SimulationStepPathCheck>();
  const exhausted=()=>attempted>=maxCandidates||Date.now()>=deadline;
  const accept=(phases:SimulationStepMotionPhase[],method:SimulationStepMotion['method'])=>{
    if(exhausted())return null;
    const key=JSON.stringify(phases),previous=checkedCandidates.get(key);
    if(previous){lastCheckedPhases=phases;lastCheck=previous;return null;}
    try{
      const motion=validateSimulationStepMotion(prepared,animation,makeMotion(phases,method)),path=createSimulationStepPathEvaluatorUnchecked(prepared,animation,motion);
      // Closure failures are cheap geometry pruning, not failed collision
      // certificates, and must not consume all of a small candidate budget.
      attempted++;
      geometricPath=true;lastCheckedPhases=phases;lastCheck=options.checkPath?.(path,motion);
      if(lastCheck)checkedCandidates.set(key,lastCheck);
      return !lastCheck||lastCheck.status==='clear'?motion:null;
    }catch{return null;}
  };
  if(animation.timings!==undefined){
    let phases:SimulationStepMotionPhase[];
    try{phases=scheduledPhases(prepared,animation)!;}
    catch(error){throw new SimulationStepPathError('geometry',error instanceof Error?error.message:'折痕启动时段无效。');}
    const scheduled=accept(phases,'scheduled');if(scheduled)return scheduled;
    const window=commonTimingWindow(expected,animation);
    if(window&&!geometricPath){
      try{
        const original=planSimulationStepPath(prepared,{...animation,timings:undefined,motion:undefined},{maxCandidates,maxSearchMs:Math.max(1,deadline-Date.now())});
        const scale=(p:number)=>p===0?window.start:p===1?window.end:window.start+(window.end-window.start)*p;
        const remapped:SimulationStepMotionPhase[]=[
          ...(window.start>0?[{start:0,end:window.start,fromAngles:[...expected.from],toAngles:[...expected.from],kind:'linear' as const}]:[]),
          ...original.phases.map(phase=>({...phase,start:scale(phase.start),end:scale(phase.end)})),
          ...(window.end<1?[{start:window.end,end:1,fromAngles:[...expected.to],toAngles:[...expected.to],kind:'linear' as const}]:[]),
        ];
        const coupled=accept(remapped,'scheduled');if(coupled)return coupled;
      }catch{/* A common clock cannot rescue an unavailable material branch. */}
    }
    if(geometricPath&&lastCheck)throw new SimulationStepPathError(lastCheck.status==='collision'?'collision':'inconclusive',lastCheck.message||(lastCheck.status==='collision'?'自定义折痕时序中纸面发生碰撞；请允许穿模播放或调整启动比例。':'无法连续确认自定义折痕时序中的纸层接触安全；请允许穿模播放或调整启动比例。'));
    throw new SimulationStepPathError('geometry','所设折痕时序无法同时保持固定侧、折角和材料连接；这些折痕受几何耦合，不能按当前比例独立延迟，请调整启动比例或将需要联动的折痕设为同时开始。');
  }
  const simultaneous=accept(base,'simultaneous');if(simultaneous)return simultaneous;
  // A neighbouring old hinge must sometimes stay open while a new precrease
  // is pressed and released. Completing each inferred excursion as a separate
  // batch closes the old hinge too soon. Try a reversible nested schedule;
  // the return retraces the exact material branch, not the same forward order.
  const reopening=expected.instructions.flatMap((r,i)=>r.fromAngle!==0&&!different(r.fromAngle,r.toAngle)&&r.viaAngle!==undefined&&different(r.fromAngle,r.viaAngle)?[i]:[]);
  if(reopening.length&&expected.via&&same(expected.from,expected.to)){
    const opened=[...expected.from];for(const i of reopening)opened[i]=expected.instructions[i].viaAngle!;
    const pressGroups=simulationStepAxisGroups(prepared,animation).map(group=>group.creases.filter(i=>!reopening.includes(i))).filter(group=>group.length);
    const groupOrders=pressGroups.length*2+2<=phaseLimit?orders(pressGroups.map((_,i)=>i),Math.min(12,maxCandidates)):[];
    const solve=(from:number[],to:number[]):SimulationStepMotionPhase|null=>{
      const phase:SimulationStepMotionPhase={start:0,end:1,fromAngles:[...from],toAngles:[...to],kind:'linear'};
      try{for(const t of [0,.001,.03,.25,.5,.75,.97,.999,1])mechanism.validatePose(phaseAngles(phase,t));return phase;}
      catch{return coupledPhaseCandidates(mechanism,phase,exhausted).next().value??null;}
    };
    const opening=solve(expected.from,opened);
    if(opening){
      for(let attempt=0;attempt<=groupOrders.length&&!exhausted();attempt++){
        const batches=attempt===0?[pressGroups.flat()]:groupOrders[attempt-1].map(i=>pressGroups[i]);
        const outward=[opening];let current=[...opened],valid=true;
        for(const group of batches){
          const next=[...current];for(const i of group)next[i]=expected.via[i];
          if(same(current,next))continue;
          const phase=solve(current,next);if(!phase){valid=false;break;}outward.push(phase);current=next;
        }
        if(!valid||!same(current,expected.via))continue;
        const mirrored=[...outward,...[...outward].reverse().map(phase=>({...phase,fromAngles:[...phase.toAngles],toAngles:[...phase.fromAngles]}))];
        const phases=mirrored.map((phase,i)=>({...phase,start:i/mirrored.length,end:(i+1)/mirrored.length}));
        const candidate=accept(phases,phases.some(phase=>phase.kind==='tangent')?'coupled':'sequential');if(candidate)return candidate;
      }
    }
  }
  const searchCoupled=(index:number,coupled:SimulationStepMotionPhase[]):SimulationStepMotion|null=>{
    if(exhausted())return null;
    if(index===base.length)return coupled.some(p=>p.kind==='tangent')?accept(coupled,'coupled'):null;
    const phase=base[index],previous=coupled.at(-1);
    if(previous&&same(previous.fromAngles,phase.toAngles)&&same(previous.toAngles,phase.fromAngles)){
      return searchCoupled(index+1,[...coupled,{...phase,kind:previous.kind,...previous.coefficients?{coefficients:[...previous.coefficients]}:{}}]);
    }
    let linear=true;
    try{for(const p of [.125,.375,.625,.875]){const angles=phaseAngles(phase,phase.start+(phase.end-phase.start)*p);mechanism.validatePose(angles,mechanism.evaluateAngles(angles));}}
    catch{linear=false;}
    if(linear)return searchCoupled(index+1,[...coupled,phase]);
    for(const candidate of coupledPhaseCandidates(mechanism,phase,exhausted)){
      const result=searchCoupled(index+1,[...coupled,candidate]);if(result)return result;
    }
    return null;
  };
  const coupled=searchCoupled(0,[]);if(coupled)return coupled;
  const batched=searchBatchedPaths(prepared,animation,mechanism,expected,accept,phases=>lastCheckedPhases===phases?lastCheck:undefined,exhausted);if(batched)return batched;
  const active=expected.from.flatMap((v,i)=>points.slice(1).some(p=>different(v,p[i]))?[i]:[]);
  const serialPhaseCount=base.reduce((sum,phase)=>sum+Math.max(1,phase.fromAngles.reduce((n,a,i)=>n+(different(a,phase.toAngles[i])?1:0),0)),0);
  // Check capacity before expanding complete angle vectors for every phase
  // and knot; large inputs must not allocate an unbounded permutation plan.
  if(active.length>1&&serialPhaseCount<=phaseLimit)for(const order of orders(active,maxCandidates-attempted)){
    const phases:SimulationStepMotionPhase[]=[];
    for(const phase of base){
      const actual=order.filter(i=>different(phase.fromAngles[i],phase.toAngles[i]));
      if(!actual.length){phases.push(phase);continue;}
      let current=[...phase.fromAngles];
      for(const [index,crease] of actual.entries()){
        const next=[...current];next[crease]=phase.toAngles[crease];
        phases.push({start:phase.start+(phase.end-phase.start)*index/actual.length,end:phase.start+(phase.end-phase.start)*(index+1)/actual.length,fromAngles:current,toAngles:next,kind:'linear'});current=next;
      }
    }
    const candidate=accept(phases,'sequential');if(candidate)return candidate;
  }
  if(geometricPath&&lastCheck)throw new SimulationStepPathError(lastCheck.status==='collision'?'collision':'inconclusive',lastCheck.message||(lastCheck.status==='collision'?'本步已找到保持纸面刚性的折叠路径，但纸瓣相互阻挡；尝试的先后折叠顺序仍发生碰撞，请拆分步骤或调整作用纸层。':'本步刚性折叠路径已求出，但无法连续确认纸层接触安全；请拆分步骤或调整固定侧。'));
  throw new SimulationStepPathError('geometry','本步无法找到同时保持固定侧、既有折角和材料连接的连续刚性路径；请拆分步骤，或补充必要的活动折痕。');
}
