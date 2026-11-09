import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {validateSimulationStepFlexMotion,type SimulationStepFlexMotion} from './simStepFlex';

/** A developable one-apex fan. Angles are signed material-ray rotations in
 * radians, not saved CP fold angles. Every sector is an exact rigid rotation;
 * the only geometric closure condition is the product of all ray rotations. */
export interface SimulationStepConeProblem {rayAngles:readonly number[];activeRay:number;fixedSector?:number}
export interface SimulationStepConeSolution {
  angles:number[];
  /** Row-major material-to-world rotation for each sector. */
  rotations:number[][];
  closureResidual:number;
  bendingEnergy:number;
}
export interface SimulationStepConeSolveOptions {maxIterations?:number;maxTimeMs?:number;perturbation?:number}
export interface SimulationStepConeDescription {
  apexVertex:number;
  rays:Array<{vertex:number;angle:number;direction:[number,number]}>;
  activeRay:number;
  triangleSectors:number[];
  vertexSectors:number[][];
}
export interface SimulationStepConePlanOptions {peakAngle?:number;steps?:number;maxTimeMs?:number}
type V=[number,number,number];
type Q=[number,number,number,number];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:readonly number[])=>Math.hypot(...v);
const point=(p:ArrayLike<number>,v:number):V=>[p[v*3],p[v*3+1],p[v*3+2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(v:V,s:number):V=>[v[0]*s,v[1]*s,v[2]*s];
const unit=(v:V)=>scale(v,1/norm(v));
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const apply=(m:readonly number[],p:V):V=>[m[0]*p[0]+m[1]*p[1]+m[2]*p[2],m[3]*p[0]+m[4]*p[1]+m[5]*p[2],m[6]*p[0]+m[7]*p[1]+m[8]*p[2]];
const transpose=(m:readonly number[])=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
const radians=Math.PI/180;
const multiply=(a:Q,b:Q):Q=>[
  a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],
  a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
  a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],
  a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
const quaternion=(axis:V,angle:number):Q=>{const s=Math.sin(angle/2);return [Math.cos(angle/2),axis[0]*s,axis[1]*s,axis[2]*s];};
function rotation(q:Q):number[]{const [w,x,y,z]=q;return [1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];}
function logarithm(q:Q):V {
  const length=norm(q),sign=q[0]<0?-1:1,v:V=[q[1]*sign/length,q[2]*sign/length,q[3]*sign/length],s=norm(v),angle=2*Math.atan2(s,q[0]*sign/length),k=s>1e-14?angle/s:2;
  return [v[0]*k,v[1]*k,v[2]*k];
}
function solve3(matrix:number[][],rhs:readonly number[]):V|null {
  const a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let j=0;j<3;j++){
    let pivot=j;for(let i=j+1;i<3;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;
    if(Math.abs(a[pivot][j])<1e-22)return null;[a[j],a[pivot]]=[a[pivot],a[j]];
    const divisor=a[j][j];for(let k=j;k<4;k++)a[j][k]/=divisor;
    for(let i=0;i<3;i++)if(i!==j){const factor=a[i][j];for(let k=j;k<4;k++)a[i][k]-=factor*a[j][k];}
  }
  return [a[0][3],a[1][3],a[2][3]];
}

function compile(problem:SimulationStepConeProblem){
  const n=problem.rayAngles.length,base=problem.fixedSector??0;
  if(n<6||n>32||!Number.isInteger(problem.activeRay)||problem.activeRay<0||problem.activeRay>=n||!Number.isInteger(base)||base<0||base>=n||problem.rayAngles.some(v=>!Number.isFinite(v)))throw Error('锥面扇区或驱动射线无效。');
  let winding=0;for(let i=0;i<n;i++){const delta=((problem.rayAngles[(i+1)%n]-problem.rayAngles[i])%(Math.PI*2)+Math.PI*2)%(Math.PI*2);if(delta<1e-5||delta>=Math.PI)throw Error('锥面扇区必须按材料环序排列，且每个扇区小于半圆。');winding+=delta;}
  if(Math.abs(winding-Math.PI*2)>1e-8)throw Error('锥面射线必须恰好围成一个材料闭环。');
  const axes:V[]=problem.rayAngles.map(a=>[Math.cos(a),0,-Math.sin(a)]),order=Array.from({length:n},(_,i)=>(base+i+1)%n),free=Array.from({length:n},(_,i)=>i).filter(i=>i!==problem.activeRay);
  const residual=(angles:readonly number[]):V=>{let q:Q=[1,0,0,0];for(const i of order)q=multiply(q,quaternion(axes[i],angles[i]));return logarithm(q);};
  const jacobian=(angles:readonly number[])=>free.map(i=>{
    const h=1e-6,a=[...angles],b=[...angles];a[i]+=h;b[i]-=h;const x=residual(a),y=residual(b);return x.map((v,k)=>(v-y[k])/(2*h)) as V;
  });
  const rotations=(angles:readonly number[])=>{const result:number[][]=Array.from({length:n},()=>[]);let q:Q=[1,0,0,0];result[base]=rotation(q);for(let j=0;j<n-1;j++){const i=order[j];q=multiply(q,quaternion(axes[i],angles[i]));result[i]=rotation(q);}return result;};
  return {n,axes,free,residual,jacobian,rotations};
}

/** Low-dimensional continuation correction. A positive uniform bending
 * objective selects auxiliary folds; a final closure-only projection certifies
 * the loop instead of trusting a penalty residual. */
export function solveSimulationStepConeAngles(problem:SimulationStepConeProblem,target:number,previous?:readonly number[],options:SimulationStepConeSolveOptions={}):SimulationStepConeSolution {
  const model=compile(problem),{free,axes}=model,maxIterations=options.maxIterations??100,deadline=performance.now()+(options.maxTimeMs??Infinity);
  if(!Number.isFinite(target)||Math.abs(target)>Math.PI||previous&&(previous.length!==model.n||previous.some(v=>!Number.isFinite(v)||Math.abs(v)>Math.PI)))throw Error('锥面压痕角度或初值无效。');
  if(target===0&&!previous)return {angles:Array(model.n).fill(0),rotations:model.rotations(Array(model.n).fill(0)),closureResidual:0,bendingEnergy:0};
  let angles=previous?[...previous]:Array(model.n).fill(0);const increment=target-angles[problem.activeRay];angles[problem.activeRay]=target;
  // The flat Jacobian has rank two. Its first-order minimum-norm correction
  // starts the solve, but is never accepted without nonlinear SO(3) closure.
  if(!previous){
    const normal=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>free.reduce((sum,k)=>sum+axes[k][i]*axes[k][j],0)+(i===j?1e-12:0))),rhs=axes[problem.activeRay].map(v=>-increment*v),multiplier=solve3(normal,rhs);
    if(multiplier)for(const i of free)angles[i]=dot(axes[i],multiplier);
    if(options.perturbation)for(const i of free)angles[i]+=options.perturbation*Math.abs(target)*Math.sin(2.37*i+.4);
  }
  const energy=(a:readonly number[],mu:number)=>{const r=model.residual(a);return dot(r,r)+mu*free.reduce((sum,i)=>sum+a[i]*a[i],0);};
  for(const mu of [1e-4,0]){
    let damping=mu?1e-5:1e-10;
    for(let iteration=0;iteration<maxIterations;iteration++){
      if(performance.now()>deadline)throw Error('锥面闭环求解超过预算，未接受未闭合的扇区。');
      const r=model.residual(angles);if(!mu&&norm(r)<1e-10)break;
      const columns=model.jacobian(angles),diagonal=mu+damping,d0=free.map(i=>-mu/diagonal*angles[i]),rhs:V=[...r];
      for(let k=0;k<free.length;k++)for(let j=0;j<3;j++)rhs[j]+=columns[k][j]*d0[k];
      const matrix=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>columns.reduce((sum,c)=>sum+c[i]*c[j],0)+(i===j?diagonal:0))),y=solve3(matrix,rhs);if(!y){damping*=10;continue;}
      const delta=free.map((_,k)=>d0[k]-dot(columns[k],y)),before=energy(angles,mu);let accepted=false,improvement=0;
      for(const scale of [1,.5,.25,.125,.0625,.03125]){
        const candidate=[...angles];free.forEach((i,k)=>candidate[i]+=scale*delta[k]);if(candidate.some(v=>Math.abs(v)>Math.PI))continue;
        const after=energy(candidate,mu);if(Number.isFinite(after)&&after<before){improvement=before-after;angles=candidate;accepted=true;damping=Math.max(1e-14,damping*.3);break;}
      }
      if(!accepted){damping*=10;if(damping>1e6)break;}
      if(mu&&accepted&&improvement<1e-13)break;
    }
  }
  const closureResidual=norm(model.residual(angles));
  if(!Number.isFinite(closureResidual)||closureResidual>1e-8)throw Object.assign(Error('锥面扇区未满足真实旋转闭环，未生成断开的纸面。'),{closureResidual,target});
  return {angles,rotations:model.rotations(angles),closureResidual,bendingEnergy:free.reduce((sum,i)=>sum+angles[i]*angles[i],0)};
}

/** Prepare a common rigid sector frame. Every shared material vertex has one
 * owner and every competing sector proposal is checked, rather than averaged. */
function coneGeometry(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,description:SimulationStepConeDescription){
  const d=description,n=d?.rays?.length;
  if(!d||!Array.isArray(d.rays)||!Number.isInteger(n)||n<8||n>32||!Number.isInteger(d.apexVertex)||d.apexVertex<0||d.apexVertex>=prepared.vertexCount||!Number.isInteger(d.activeRay)||d.activeRay<0||d.activeRay>=n||!Array.isArray(d.triangleSectors)||d.triangleSectors.length!==prepared.faceCount||!Array.isArray(d.vertexSectors)||d.vertexSectors.length!==prepared.vertexCount)throw Error('有限短痕的锥扇材料映射无效。');
  d.rays.forEach(ray=>{if(!ray||!Number.isInteger(ray.vertex)||ray.vertex<0||ray.vertex>=prepared.vertexCount||!Number.isFinite(ray.angle)||!Array.isArray(ray.direction)||ray.direction.length!==2||ray.direction.some(v=>!Number.isFinite(v))||Math.abs(ray.direction[0]-Math.cos(ray.angle))>1e-6||Math.abs(ray.direction[1]-Math.sin(ray.angle))>1e-6)throw Error('有限短痕的锥扇射线无效。');});
  const material=prepared.originalPositions,materialApex=point(material,d.apexVertex),span=Math.max(...[0,2].map(k=>Math.max(...Array.from({length:prepared.vertexCount},(_,v)=>material[v*3+k]))-Math.min(...Array.from({length:prepared.vertexCount},(_,v)=>material[v*3+k])))),epsilon=Math.max(1e-8,span*1e-6),boundary=new Set(prepared.edgesVertices.flatMap((edge,e)=>prepared.edgesAssignment[e]==='B'?edge:[]));
  if(boundary.has(d.apexVertex))throw Error('锥扇顶点必须位于材料内部。');
  d.rays.forEach(ray=>{const axis=sub(point(material,ray.vertex),materialApex),length=norm(axis);if(!boundary.has(ray.vertex)||length<=epsilon||Math.abs(axis[1])>epsilon||Math.abs(axis[0]/length-ray.direction[0])>1e-5||Math.abs(-axis[2]/length-ray.direction[1])>1e-5)throw Error('锥扇射线与真实纸边材料坐标不匹配。');});
  const incidence=Array.from({length:prepared.vertexCount},()=>new Set<number>());
  prepared.facesVertices.forEach((face,f)=>{const sector=d.triangleSectors[f];if(!Number.isInteger(sector)||sector<0||sector>=n)throw Error('锥扇三角片缺少真实扇区。');const a=d.rays[sector].direction,b=d.rays[(sector+1)%n].direction;face.forEach(v=>{const p=sub(point(material,v),materialApex),x=p[0],y=-p[2];if(a[0]*y-a[1]*x< -epsilon||x*b[1]-y*b[0]< -epsilon)throw Error('锥扇三角片跨越了未建模的材料扇区。');incidence[v].add(sector);});});
  d.vertexSectors.forEach((sectors,v)=>{if(!Array.isArray(sectors)||!sectors.length||sectors.length>n||new Set(sectors).size!==sectors.length||sectors.length!==incidence[v].size||sectors.some(s=>!incidence[v].has(s)))throw Error('锥扇共享顶点的材料扇区不完整。');});
  if(incidence[d.apexVertex].size!==n||!animation.fixedVertices.length)throw Error('锥扇需要完整内部顶点和固定扇区。');
  const common=d.vertexSectors[animation.fixedVertices[0]].filter(s=>animation.fixedVertices.every(v=>d.vertexSectors[v]?.includes(s)));
  if(!common.length)throw Error('固定纸面跨越多个锥扇扇区，请将固定点放在一片未压纸面内。');
  const base=common[0],seed=Float64Array.from(Float32Array.from(animation.initialPositions)),apex=point(seed,d.apexVertex);
  // Overlaying several fans can make the first triangle arbitrarily small.
  // Its Float32 normalised coordinates are not a stable rigid-frame reference:
  // tiny seed rounding would become a whole-sheet rotation, and split genuine
  // shared rays at larger folds. Use full material span and area instead.
  const farthest=(from:number)=>Array.from({length:prepared.vertexCount},(_,v)=>v).reduce((best,v)=>norm(sub(point(material,v),point(material,from)))>norm(sub(point(material,best),point(material,from)))?v:best,from);
  const i=farthest(d.apexVertex),j=farthest(i),axis=sub(point(material,j),point(material,i));
  const k=Array.from({length:prepared.vertexCount},(_,v)=>v).reduce((best,v)=>norm(cross(axis,sub(point(material,v),point(material,i))))>norm(cross(axis,sub(point(material,best),point(material,i))))?v:best,i);
  const basis=(p:ArrayLike<number>)=>{const x=unit(sub(point(p,j),point(p,i))),z=unit(cross(x,sub(point(p,k),point(p,i)))),y=cross(z,x);return [x,y,z] as V[];};
  const sourceBasis=basis(material),seedBasis=basis(seed),frame=Array.from({length:9},(_,index)=>{const row=Math.floor(index/3),col=index%3;return seedBasis.reduce((sum,v,k)=>sum+v[row]*sourceBasis[k][col],0);}),inverse=transpose(frame);
  const problem:SimulationStepConeProblem={rayAngles:d.rays.map(r=>r.angle),activeRay:d.activeRay,fixedSector:base};compile(problem);
  const positions=(solution:SimulationStepConeSolution)=>{
    const result=new Float64Array(seed.length);
    for(let v=0;v<prepared.vertexCount;v++){
      const sectors=d.vertexSectors[v],owner=sectors.includes(base)?base:sectors[0],local=apply(inverse,sub(point(seed,v),apex));
      const proposal=(s:number):V=>s===base?point(seed,v):add(apex,apply(frame,apply(solution.rotations[s],local))),chosen=proposal(owner);
      result.set(chosen,v*3);
      for(const sector of sectors){const other=proposal(sector),gap=norm(sub(other,chosen));if(gap>2e-7)throw Object.assign(Error('锥扇姿态存在共享顶点开缝，未显示断开的纸面。'),{vertex:v,owner,sector,gap,closureResidual:solution.closureResidual,activeAngle:solution.angles[d.activeRay],material:point(material,v),seed:point(seed,v),local,chosen,other});}
    }
    for(const v of animation.fixedVertices)for(let axis=0;axis<3;axis++)if(result[v*3+axis]!==seed[v*3+axis])throw Error('锥扇候选移动了固定纸面。');
    return result;
  };
  const actualAngles=(p:ArrayLike<number>)=>{
    const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(p,b),point(p,a)),sub(point(p,c),point(p,a)))));
    return prepared.creaseParams.map(c=>{const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(point(p,b),point(p,a))),n1=normals[c.face1],n2=normals[c.face2];return Math.atan2(dot(cross(n1,axis),n2),dot(n1,n2));});
  };
  return {problem,positions,actualAngles,seed};
}

/** Compile a reversible finite crease into ordinary, validated flex keyframes.
 * Rotation-loop solving is offline; playback uses the existing linear mesh
 * interpolation and independent metric, area, angle and collision verifiers. */
export function planSimulationStepCone(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,description:SimulationStepConeDescription,options:SimulationStepConePlanOptions={}):SimulationStepFlexMotion {
  if(!animation.flexRequest||animation.ranges.some(r=>r.fromAngle!==0||r.toAngle!==0)||animation.initialPositions.length!==prepared.vertexCount*3||animation.initialPositions.some(v=>!Number.isFinite(v))||prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('锥扇预折暂只支持展开纸面上的一条边界到内部短痕。');
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r])),active=prepared.creaseParams.flatMap((c,i)=>ranges.get(c.edge)?.viaAngle?[i]:[]);
  if(!active.length)throw Error('锥扇预折缺少实际短痕。');
  const request=Math.abs(ranges.get(prepared.creaseParams[active[0]].edge)!.viaAngle!),peak=Math.min(request,options.peakAngle??90),foldLimit=peak/request;
  if(!Number.isFinite(request)||!Number.isFinite(peak)||request>180||peak<=0||peak>178.2||active.some(i=>Math.abs(ranges.get(prepared.creaseParams[i].edge)!.viaAngle!)!==request))throw Error('锥扇同组短痕角度无效或不一致。');
  const geometry=coneGeometry(prepared,animation,description),material=prepared.originalPositions,apex=point(material,description.apexVertex),ray=description.rays[description.activeRay],axis:V=[ray.direction[0],0,-ray.direction[1]],length=norm(sub(point(material,ray.vertex),apex)),epsilon=Math.max(1e-8,length*1e-6);
  if(active.some(i=>prepared.edgesVertices[prepared.creaseParams[i].edge].some(v=>{const d=sub(point(material,v),apex),t=dot(d,axis);return norm(cross(d,axis))>epsilon||t< -epsilon||t>length+epsilon;})))throw Error('锥扇实际短痕不在指定的驱动射线上。');
  const probe=solveSimulationStepConeAngles(geometry.problem,radians),actual=geometry.actualAngles(geometry.positions(probe)),direction=Math.sign(actual[active[0]]);
  // This probe determines only the mountain/valley convention. Small shared
  // triangles amplify Float32 seed noise; final hard angles are independently
  // certified on every complete keyframe interval below.
  if(!direction||active.some(i=>Math.abs(actual[i]-direction*radians)>1e-5))throw Error('锥扇驱动射线与短痕方向不一致。');
  const sign=Math.sign(ranges.get(prepared.creaseParams[active[0]].edge)!.viaAngle!),steps=Math.max(32,Math.min(384,Math.round(options.steps??90))),deadline=performance.now()+(options.maxTimeMs??Infinity);
  if(active.some(i=>Math.sign(ranges.get(prepared.creaseParams[i].edge)!.viaAngle!)!==sign))throw Error('同一短痕上的山谷方向不一致。');
  const outward=[{progress:0,positions:Array.from(geometry.seed)}];let previous:number[]|undefined;
  for(let s=1;s<=steps;s++){
    if(performance.now()>deadline)throw Error('锥扇运动求解超过预算，未生成不完整压痕动画。');
    const solution=solveSimulationStepConeAngles(geometry.problem,sign/direction*peak*radians*s/steps,previous,{maxTimeMs:Math.max(10,deadline-performance.now())});
    previous=solution.angles;outward.push({progress:s/(steps*2),positions:Array.from(Float32Array.from(geometry.positions(solution)))});
  }
  const keyframes=[...outward,...outward.slice(0,-1).reverse().map(frame=>({progress:1-frame.progress,positions:[...frame.positions]}))];
  return validateSimulationStepFlexMotion(prepared,animation,{...animation.flexRequest,method:'local-flex',foldLimit,keyframes,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0});
}
