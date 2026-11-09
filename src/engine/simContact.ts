import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SolverBackend,SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {certifySimulationStepFlexPath,type SimulationStepFlexCollisionMesh} from './simStepFlexCollision';
import type {SimulationStepPathCertificate} from './simStepCollision';
import type {SimulationStepCollisionPair} from './simStepCollision';
import {projectSimulationContactMotion} from './simContactResponse';

export interface SimulationContactOptions {maxTimeMs?:number;maxPairs?:number;maxBisections?:number}
export type SimulationContactFailure='collision'|'direction'|'budget'|'invalid';
export interface SimulationContactStepResult {
  status:'clear'|'limited'|'blocked';
  fraction:number;
  positions:Float32Array;
  certificate:SimulationStepPathCertificate;
  reason?:string;
  failure?:SimulationContactFailure;
  contactsResolved?:number;
}
export interface SimulationContactAdvanceResult extends Pick<SimulationContactStepResult,'status'|'fraction'|'reason'|'failure'> {advancedSteps:number;constrainedSteps?:number}
const reasonFor=(certificate:SimulationStepPathCertificate):{failure:SimulationContactFailure;reason:string}=>{
  if(certificate.status==='collision')return {failure:'collision',reason:'纸面即将穿透另一纸层，已限制到最后确认安全的位置。'};
  if(/预算/.test(certificate.reason??''))return {failure:'budget',reason:'碰撞检查未在本次预算内完成，已保持最后安全姿态并暂停；可降低网格精细度后重试。'};
  if(/退化|无效|不匹配/.test(certificate.reason??''))return {failure:'invalid',reason:'候选纸面退化或坐标无效，已恢复最后安全姿态。'};
  return {failure:'direction',reason:'纸层接触或离层方向尚未确认，已保持最后安全姿态并暂停。'};
};

/** Constrain the actual straight displacement between two displayed states.
 * The swept triangle proof includes vertex-face, edge-edge and shared-vertex
 * pairs; a valid endpoint alone can never authorize motion through a sheet.
 * Original CP face IDs are diagnostic labels, never collision exemptions. */
export function evaluateSimulationContactStep(
  mesh:SimulationStepFlexCollisionMesh,first:ArrayLike<number>,last:ArrayLike<number>,
  options:SimulationContactOptions&{interpolate?:(fraction:number)=>Float32Array;projectContact?:(pairs:readonly SimulationStepCollisionPair[])=>Float32Array|null}={},
):SimulationContactStepResult{
  const maxTimeMs=options.maxTimeMs??150,maxPairs=options.maxPairs??200_000,maxBisections=options.maxBisections??8;
  if(!Number.isFinite(maxTimeMs)||maxTimeMs<0||!Number.isSafeInteger(maxPairs)||maxPairs<0||!Number.isSafeInteger(maxBisections)||maxBisections<0||maxBisections>24)throw Error('碰撞保护的计算预算无效。');
  const deadline=performance.now()+maxTimeMs;
  const interpolate=options.interpolate??((fraction:number)=>Float32Array.from(first,(value,i)=>value+(last[i]-value)*fraction));
  const check=(positions:ArrayLike<number>)=>certifySimulationStepFlexPath(mesh,[{progress:0,positions:first},{progress:1,positions}],{
    contactMode:'nonpenetration',maxTimeMs:Math.max(0,deadline-performance.now()),maxPairs,maxDepth:10,maxEvaluations:8192,maxSegments:1,
  });
  const candidate=new Float32Array(last),full=check(candidate);
  if(full.status==='clear')return {status:'clear',fraction:1,positions:candidate,certificate:full};
  const explanation=reasonFor(full),blocked=():SimulationContactStepResult=>({status:'blocked',fraction:0,positions:new Float32Array(first),certificate:full,...explanation});
  if(options.projectContact&&explanation.failure!=='budget'&&explanation.failure!=='invalid'&&!(full.status==='collision'&&full.progress===0)){
    let current=full,prior:Float32Array=candidate;const pairs:SimulationStepCollisionPair[]=[],seen=new Set<string>();
    for(let pass=0;pass<8&&performance.now()<deadline;pass++){
      for(const pair of current.pairs){const key=[...pair.triangles].sort((a,b)=>a-b).join(':');if(!seen.has(key)){seen.add(key);pairs.push(pair);}}
      if(!pairs.length)break;const projected=options.projectContact(pairs);
      if(!projected||projected.every((v,i)=>v===prior[i]))break;
      current=check(projected);prior=projected;
      if(current.status==='clear')return {status:'clear',fraction:1,positions:projected,certificate:current,contactsResolved:pairs.length};
      if(reasonFor(current).failure==='budget')break;
    }
  }
  if(explanation.failure==='budget'||explanation.failure==='invalid'||full.status==='collision'&&full.progress===0||explanation.failure==='direction'&&full.interval?.[0]===0)return blocked();
  let lo=0,hi=1,accepted:Float32Array|null=null,certificate=full;
  for(let i=0;i<maxBisections&&performance.now()<deadline;i++){
    const fraction=(lo+hi)/2,positions=interpolate(fraction),checkResult=check(positions);
    if(checkResult.status==='clear'){lo=fraction;accepted=positions;certificate=checkResult;}
    else {hi=fraction;if(reasonFor(checkResult).failure==='budget')break;}
  }
  // Only a complete certificate for this exact rounded endpoint is committed.
  return accepted?{status:'limited',fraction:lo,positions:accepted,certificate,...explanation}:blocked();
}

export function snapshotAt(prepared:PreparedOrigamiModel,rest:Float32Array,before:SolverPoseSnapshot,after:SolverPoseSnapshot,fraction:number,requested?:ArrayLike<number>):SolverPoseSnapshot{
  const fixed=new Set(before.pins.map(pin=>pin.index));
  const displacements=before.displacements.map((value,i)=>fixed.has(Math.floor(i/3))?value:requested?requested[i]===after.positions[i]?after.displacements[i]:Math.fround(requested[i]-rest[i]):Math.fround(value+(after.displacements[i]-value)*fraction)),positions=displacements.map((value,i)=>Math.fround(rest[i]+value));
  const sub=(a:number[],b:number[])=>a.map((x,k)=>x-b[k]),cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a:number[],b:number[])=>a.reduce((s,v,k)=>s+v*b[k],0),unit=(a:number[])=>{const n=Math.hypot(...a);return a.map(v=>v/n);},point=(v:number)=>positions.slice(v*3,v*3+3);
  const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(b),point(a)),sub(point(c),point(a)))));
  const creaseAngles=prepared.creaseParams.map((c,i)=>{
    const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(point(b),point(a))),n1=normals[c.face1],n2=normals[c.face2],angle=Math.atan2(dot(cross(n1,axis),n2),Math.max(-1,Math.min(1,dot(n1,n2)))),branch=before.creaseAngles[i]+(after.creaseAngles[i]-before.creaseAngles[i])*fraction;
    return angle+2*Math.PI*Math.round((branch-angle)/(2*Math.PI));
  });
  return {...before,positions,displacements,creaseAngles,pins:before.pins.map(pin=>({index:pin.index,position:[...pin.position]}))};
}

/** Optional runtime guard around the existing GPU or CPU backend. Disabled
 * callers do not construct it and retain the original zero-readback fast path.
 * Each real integrator substep is checked separately, never an unobserved batch.
 * A rejected step restores all position history, theta branches and fixed pins. */
export class SimulationContactGuard {
  private ready=false;
  private rest:Float32Array;
  private mesh:SimulationStepFlexCollisionMesh;
  constructor(private prepared:PreparedOrigamiModel,private backend:SolverBackend,private options:SimulationContactOptions={}){
    this.rest=new OrigamiModel(prepared).originalPositions;
    this.mesh={indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces};
  }
  initialize():SimulationContactStepResult{
    const pose=this.backend.capturePose(),result=evaluateSimulationContactStep(this.mesh,pose.positions,pose.positions,this.options);
    this.ready=result.status==='clear';
    if(!this.ready){this.backend.arrestDynamics();result.reason=result.failure==='collision'?'当前纸面已存在穿插，碰撞保护已阻止继续推进；请复位或调整到无穿插姿态后重试。':result.failure==='budget'?'当前姿态的碰撞检查尚未在预算内完成，已暂停，未推进模拟；可降低网格精细度后重试。':'当前纸面的接触关系或几何有效性尚未确认，已暂停，未推进模拟；请复位或调整姿态后重试。';}
    return result;
  }
  step(count:number):SimulationContactAdvanceResult{
    if(!Number.isSafeInteger(count)||count<0)throw Error('碰撞保护的推进步数无效。');
    if(!this.ready){const start=this.initialize();if(start.status!=='clear')return {...start,advancedSteps:0};}
    const maxTimeMs=this.options.maxTimeMs??150,deadline=performance.now()+maxTimeMs;let advancedSteps=0,constrainedSteps=0;
    while(advancedSteps<count&&performance.now()<deadline){
      const before=this.backend.capturePose();let after:SolverPoseSnapshot;
      try{this.backend.step(1);after=this.backend.capturePose();}
      catch(error){this.backend.restorePose(before);throw error;}
      const limitedSnapshots=new Map<number,SolverPoseSnapshot>();
      let resolvedSnapshot:SolverPoseSnapshot|null=null;
      const result=evaluateSimulationContactStep(this.mesh,before.positions,after.positions,{...this.options,maxTimeMs:Math.max(0,deadline-performance.now()),interpolate:fraction=>{
        const snapshot=snapshotAt(this.prepared,this.rest,before,after,fraction);limitedSnapshots.set(fraction,snapshot);return new Float32Array(snapshot.positions);
      },projectContact:pairs=>{
        const projected=projectSimulationContactMotion({indices:this.prepared.indices,edgesVertices:this.prepared.edgesVertices,restPositions:this.rest},before.positions,after.positions,pairs,new Set(before.pins.map(pin=>pin.index)));
        if(!projected)return null;resolvedSnapshot=snapshotAt(this.prepared,this.rest,before,after,1,projected);return new Float32Array(resolvedSnapshot.positions);
      }});
      if(result.status==='clear'){if(result.contactsResolved&&resolvedSnapshot){this.backend.restorePose(resolvedSnapshot);constrainedSteps++;}advancedSteps++;continue;}
      this.backend.restorePose(result.status==='limited'?limitedSnapshots.get(result.fraction)!:before);
      // restorePose already arrests momentum and synchronizes all history.
      // A second arrest would erase the GPU velocity texture's strain channel.
      if(result.status==='limited')advancedSteps++;
      return {advancedSteps,constrainedSteps,status:result.status,fraction:result.fraction,reason:result.reason,failure:result.failure};
    }
    return {advancedSteps,constrainedSteps,status:'clear',fraction:1};
  }
}
