/** Display-only affine paper heights. This feasibility solver never changes
 * material topology, CP geometry, or the physical simulation. */
export interface SimulationSurfaceHeightPanel {center:readonly [number,number];scale:number}
export interface SimulationSurfaceHeightConstraint {above:number;below:number;point:readonly [number,number];gap:number}
export interface SimulationSurfaceHeightProblem {
  panels:readonly SimulationSurfaceHeightPanel[];
  constraints:readonly SimulationSurfaceHeightConstraint[];
  maxSweeps?:number;
  maxMs?:number;
  tolerance?:number;
  maxRows?:number;
}
export interface SimulationSurfaceHeightSolution {
  status:'solved'|'inconclusive';
  /** Per panel: a,b,c in h(u,v)=a*(u-center.u)/scale +
   * b*(v-center.v)/scale+c. */
  coefficients:Float64Array;
  maxViolation:number;
  iterations:number;
  reason?:string;
}

/** Hildreth dual coordinate ascent for sparse half-spaces. Normalized local
 * panel coordinates precondition slopes and constants to comparable sizes.
 * Any early candidate is checked against every ORIGINAL half-space; reaching
 * an iteration/time budget never counts as a successful layout. */
export function solveSimulationSurfacePanelHeights(problem:SimulationSurfaceHeightProblem):SimulationSurfaceHeightSolution {
  const {panels,constraints}=problem,count=panels.length,size=count*3,coefficients=new Float64Array(size),tolerance=problem.tolerance??1e-6;
  let iterations=0,maxViolation=Infinity;
  const failure=(reason:string):SimulationSurfaceHeightSolution=>({status:'inconclusive',coefficients,maxViolation,iterations,reason});
  if(!count||count>4096||constraints.length>(problem.maxRows??100_000)||panels.some(p=>!Number.isFinite(p.scale)||p.scale<=0||p.center.some(v=>!Number.isFinite(v)))||!Number.isFinite(tolerance)||tolerance<0)return failure('完整纸面高度约束数量或坐标无效。');
  if(constraints.some(c=>!Number.isInteger(c.above)||!Number.isInteger(c.below)||c.above<0||c.below<0||c.above>=count||c.below>=count||c.above===c.below||!Number.isFinite(c.gap)||c.gap<0||c.point.some(v=>!Number.isFinite(v))))return failure('完整纸面层序约束无效。');
  if(!constraints.length)return {status:'solved',coefficients,maxViolation:0,iterations};
  const rows=constraints.length,above=new Uint32Array(rows),below=new Uint32Array(rows),au=new Float64Array(rows),av=new Float64Array(rows),ac=new Float64Array(rows),bu=new Float64Array(rows),bv=new Float64Array(rows),bc=new Float64Array(rows),target=new Float64Array(rows),multipliers=new Float64Array(rows);
  for(let r=0;r<rows;r++){
    const c=constraints[r],a=panels[c.above],b=panels[c.below];above[r]=c.above*3;below[r]=c.below*3;
    const x=(c.point[0]-a.center[0])/a.scale,y=(c.point[1]-a.center[1])/a.scale,z=(c.point[0]-b.center[0])/b.scale,w=(c.point[1]-b.center[1])/b.scale,normalization=1/Math.hypot(x,y,1,z,w,1);
    au[r]=x*normalization;av[r]=y*normalization;ac[r]=normalization;bu[r]=-z*normalization;bv[r]=-w*normalization;bc[r]=-normalization;target[r]=c.gap*normalization;
  }
  const evaluate=()=>{
    maxViolation=0;let minRatio=Infinity;
    for(let r=0;r<rows;r++){
      const a=above[r],b=below[r],normalized=au[r]*coefficients[a]+av[r]*coefficients[a+1]+ac[r]*coefficients[a+2]+bu[r]*coefficients[b]+bv[r]*coefficients[b+1]+bc[r]*coefficients[b+2],margin=normalized/ac[r],gap=constraints[r].gap;
      maxViolation=Math.max(maxViolation,gap-margin);if(gap>0)minRatio=Math.min(minRatio,margin/gap);
    }
    return minRatio;
  };
  const validateOriginal=()=>{
    maxViolation=0;
    for(const c of constraints){
      const a=panels[c.above],b=panels[c.below],ia=c.above*3,ib=c.below*3;
      const hA=coefficients[ia]*(c.point[0]-a.center[0])/a.scale+coefficients[ia+1]*(c.point[1]-a.center[1])/a.scale+coefficients[ia+2],hB=coefficients[ib]*(c.point[0]-b.center[0])/b.scale+coefficients[ib+1]*(c.point[1]-b.center[1])/b.scale+coefficients[ib+2];
      if(!Number.isFinite(hA)||!Number.isFinite(hB)){maxViolation=Infinity;return false;}
      maxViolation=Math.max(maxViolation,c.gap-(hA-hB));
    }
    return maxViolation<=tolerance;
  };
  const deadline=Date.now()+Math.max(0,Math.min(30_000,problem.maxMs??1200)),maxSweeps=Math.max(1,Math.min(100_000,Math.trunc(problem.maxSweeps??12_000)));
  for(let sweep=0;sweep<maxSweeps;sweep++){
    if((sweep&7)===0&&Date.now()>=deadline)return failure('完整纸面间距布局达到计算时间预算。');
    for(let r=0;r<rows;r++){
      const a=above[r],b=below[r],value=au[r]*coefficients[a]+av[r]*coefficients[a+1]+ac[r]*coefficients[a+2]+bu[r]*coefficients[b]+bv[r]*coefficients[b+1]+bc[r]*coefficients[b+2],delta=Math.max(-multipliers[r],target[r]-value);
      if(delta===0)continue;multipliers[r]+=delta;
      coefficients[a]+=delta*au[r];coefficients[a+1]+=delta*av[r];coefficients[a+2]+=delta*ac[r];coefficients[b]+=delta*bu[r];coefficients[b+1]+=delta*bv[r];coefficients[b+2]+=delta*bc[r];
    }
    iterations=sweep+1;
    if((sweep&7)===7||sweep+1===maxSweeps){
      const ratio=evaluate();
      if(maxViolation<=tolerance&&validateOriginal())return {status:'solved',coefficients,maxViolation,iterations};
      // Homogeneous positive half-spaces admit a safe uniform rescale once
      // every requested gap has the right sign. This avoids wasting thousands
      // of iterations approaching the final unit gap asymptotically.
      if(ratio>=.8&&ratio<1){
        const factor=(1+1e-9)/ratio;
        for(let i=0;i<size;i++)coefficients[i]*=factor;
        if(validateOriginal())return {status:'solved',coefficients,maxViolation,iterations};
        for(let i=0;i<size;i++)coefficients[i]/=factor;
      }
    }
  }
  evaluate();return failure('完整纸面间距布局达到迭代预算，尚未满足全部层序约束。');
}
