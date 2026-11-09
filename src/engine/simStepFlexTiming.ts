import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {validateSimulationStepFlexMotion,type SimulationStepFlexMotion,type SimulationStepFlexBatch} from './simStepFlex';

/** Time-warp independent, reversible short-crease motions without changing
 * either material endpoint. Superposition is only a candidate: the complete
 * piecewise-linear mesh must pass the usual continuous material validation. */
export function retimeSimulationStepFlexMotions(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,parts:readonly {motion:SimulationStepFlexMotion;edges:readonly number[]}[]):SimulationStepFlexMotion{
  if(!animation.timings?.length||!parts.length||parts.length>32)throw Error('局部压痕的自定义启动时段无效。');
  const first=parts[0].motion,seed=Array.from(Float32Array.from(animation.initialPositions)),byEdge=new Map(animation.timings.map(t=>[t.edge,t]));
  const batches:SimulationStepFlexBatch[]=[],times=new Set<number>([0,1]);
  const candidates=parts.map(part=>{
    if(part.motion.foldLimit!==first.foldLimit||part.motion.bendingStiffness.length!==first.bendingStiffness.length||part.motion.bendingStiffness.some((v,e)=>v!==first.bendingStiffness[e]))throw Error('局部柔性压痕各组的材料参数或峰值比例不一致。');
    const edges=new Set(part.edges),subAnimation={...animation,ranges:animation.ranges.map(r=>{const {viaAngle,...base}=r;return edges.has(r.edge)?{...base,...viaAngle===undefined?{}:{viaAngle}}:base;})};
    delete subAnimation.timings;
    const motion=validateSimulationStepFlexMotion(prepared,subAnimation,part.motion),window=byEdge.get(part.edges[0]),start=window?.start??0,end=window?.end??1;
    if(part.edges.some(edge=>{const timing=byEdge.get(edge);return (timing?.start??0)!==start||(timing?.end??1)!==end;}))throw Error('同一局部短痕轴上的线段需要相同的启动时段；请统一时段或拆分步骤。');
    if(motion.batches&&motion.batches.length!==1)throw Error('局部柔性压痕只允许调整完整的独立单组动作。');
    batches.push({start,end,edges:[...part.edges]});
    times.add(start);times.add((start+end)/2);times.add(end);
    for(const frame of motion.keyframes)times.add(start+(end-start)*frame.progress);
    return {motion,start,end};
  });
  if(times.size>4097||times.size*seed.length>3_000_000)throw Error('自定义短痕时段的关键帧超过材料校验预算，请减少同时参与的短痕。');
  const sample=(motion:SimulationStepFlexMotion,p:number)=>{
    const i=motion.keyframes.findIndex(k=>k.progress>=p),b=motion.keyframes[Math.max(0,i)],a=motion.keyframes[Math.max(0,i-1)];
    if(a===b||p===b.progress)return b.positions;
    const t=(p-a.progress)/(b.progress-a.progress);return a.positions.map((v,i)=>v+(b.positions[i]-v)*t);
  };
  const keyframes=[...times].sort((a,b)=>a-b).map(progress=>{
    const positions=[...seed];
    for(const {motion,start,end} of candidates){
      if(progress<=start||progress>=end)continue;
      const local=(progress-start)/(end-start),pose=sample(motion,local);
      for(let i=0;i<positions.length;i++)positions[i]+=pose[i]-seed[i];
    }
    return {progress,positions:Array.from(Float32Array.from(positions))};
  });
  try{return validateSimulationStepFlexMotion(prepared,animation,{...first,keyframes,batches});}
  catch(error){throw Error(`这些局部短痕的启动时段无法同时保持材料连接、折角或固定侧，请调整时段或拆分步骤。${error instanceof Error?error.message:''}`);}
}
