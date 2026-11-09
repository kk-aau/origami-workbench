import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepPathEvaluator} from './simStepPath';

type V=[number,number,number];
type P=[number,number];
type Weights=Array<[number,number]>;
export interface SimulationStepInitialOrder {
  sourceFaceCount:number;
  /** Trusted FOLD relations, recomputed on the common-index initial geometry.
   * A positive sign puts the first face along the second face's normal. */
  faceOrders:readonly (readonly [number,number,number])[];
}
export interface SimulationStepContactOrderViolation {
  triangles:[number,number];
  faces:[number,number];
  expectedSign:-1|1;
  actualSign:-1|1;
  materialPoints:[Weights,Weights];
}
export interface SimulationStepContactOrderResult {
  status:'clear'|'collision'|'inconclusive';
  overlapPairs:number;
  checkedPairs:number;
  violations:SimulationStepContactOrderViolation[];
  reason?:string;
}
export interface SimulationStepContactOrderOptions {
  /** Analytic first nonzero separation of A-B along B's current normal.
   * Zero means the signed normal separation is identically zero over the
   * whole plan; null means it was not proved. Finite-time samples cannot
   * certify the first departure from a zero-gap stack. */
  initialSide?:(triangleB:readonly number[],pointA:readonly (readonly [number,number])[],pointB:readonly (readonly [number,number])[])=>-1|0|1|null;
  maxPairs?:number;
  maxOverlapPairs?:number;
  planeTolerance?:number;
  minOverlapArea?:number;
}
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const size=(a:V)=>Math.hypot(...a);
const unit=(a:V):V=>{const n=size(a);return [a[0]/n,a[1]/n,a[2]/n];};
const point=(p:ArrayLike<number>,i:number):V=>[p[i*3],p[i*3+1],p[i*3+2]];
const cross2=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clipTriangle(polygon:P[],triangle:P[]):P[]{
  let output=polygon;const orientation=Math.sign(cross2(triangle[0],triangle[1],triangle[2]));if(!orientation)return [];
  for(let k=0;k<3;k++){
    const a=triangle[k],b=triangle[(k+1)%3],input=output;output=[];
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length],first=orientation*cross2(a,b,p),last=orientation*cross2(a,b,q);
      if(first>=0)output.push(p);
      if(first>=0&&last<0||first<0&&last>=0){const t=first/(first-last);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    if(output.length<3)return [];
  }
  return output.filter((p,i)=>p[0]!==output[(i+output.length-1)%output.length][0]||p[1]!==output[(i+output.length-1)%output.length][1]);
}
function polygonArea(polygon:P[]):number{return Math.abs(polygon.reduce((sum,p,i)=>sum+p[0]*polygon[(i+1)%polygon.length][1]-p[1]*polygon[(i+1)%polygon.length][0],0))/2;}
function barycentric(p:P,triangle:P[],vertices:readonly number[]):Weights|null{
  const area=cross2(triangle[0],triangle[1],triangle[2]);if(Math.abs(area)<1e-20)return null;
  const weights=[cross2(p,triangle[1],triangle[2])/area,cross2(triangle[0],p,triangle[2])/area,cross2(triangle[0],triangle[1],p)/area];
  if(weights.some(w=>!Number.isFinite(w)||w< -1e-9||w>1+1e-9))return null;
  const clamped=weights.map(w=>Math.max(0,Math.min(1,w))),total=clamped.reduce((a,b)=>a+b,0);
  return clamped.map((w,i)=>[vertices[i],w/total]);
}
function validOrders(order:SimulationStepInitialOrder|null|undefined,count:number){
  if(!order||order.sourceFaceCount!==count||!Array.isArray(order.faceOrders)||order.faceOrders.length>1_000_000)return null;
  const rows=new Map<string,readonly [number,number,number]>();
  for(const row of order.faceOrders){
    if(!Array.isArray(row)||row.length!==3||!Number.isSafeInteger(row[0])||!Number.isSafeInteger(row[1])||row[0]<0||row[1]<0||row[0]>=count||row[1]>=count||row[0]===row[1]||row[2]!==1&&row[2]!==-1)return null;
    const key=row[0]<row[1]?`${row[0]}:${row[1]}`:`${row[1]}:${row[0]}`;if(rows.has(key))return null;rows.set(key,[row[0],row[1],row[2]]);
  }
  return rows;
}

/** Zero-thickness collision separation alone cannot identify which side of an
 * initially coincident stack a flap is allowed to leave. Compare actual shared
 * material points in every positive-area overlap against trusted initial FOLD
 * relations. This check does not replace continuous collision certification. */
export function inspectSimulationStepInitialContactOrder(prepared:PreparedOrigamiModel,path:SimulationStepPathEvaluator,order:SimulationStepInitialOrder|null|undefined,options:SimulationStepContactOrderOptions={}):SimulationStepContactOrderResult{
  const seed=path.mechanism.seedPositions,bodies=path.mechanism.triangleBodies,triangles=prepared.facesVertices;
  const sourceFaces=prepared.triangleSourceFaces??triangles.map((_,i)=>i),sourceFaceCount=prepared.sourceFaceCount??Math.max(...sourceFaces)+1;
  const result:SimulationStepContactOrderResult={status:'clear',overlapPairs:0,checkedPairs:0,violations:[]};
  const fail=(reason:string):SimulationStepContactOrderResult=>({...result,status:'inconclusive',reason});
  if(seed.length!==prepared.vertexCount*3||bodies.length!==triangles.length||sourceFaces.length!==triangles.length||Array.from(seed).some(n=>!Number.isFinite(n)))return fail('初态纸层顺序检查的材料索引不一致。');
  const maxPairs=Math.max(1,Math.min(3_000_000,Math.trunc(options.maxPairs??1_000_000))),maxOverlapPairs=Math.max(1,Math.min(200_000,Math.trunc(options.maxOverlapPairs??40_000)));
  const planeTolerance=options.planeTolerance??1e-7,minArea=options.minOverlapArea??1e-12,rows=validOrders(order,sourceFaceCount);
  const vertices=triangles.map(t=>t.map(v=>point(seed,v))),normals=vertices.map(t=>unit(cross3(sub(t[1],t[0]),sub(t[2],t[0]))));
  if(normals.some(n=>n.some(v=>!Number.isFinite(v))))return fail('初态纸层包含退化三角面，无法判断接触方向。');
  const bounds=vertices.map(t=>[0,1,2].map(axis=>({min:Math.min(...t.map(v=>v[axis])),max:Math.max(...t.map(v=>v[axis]))})));
  let work=0,unresolved=false;
  for(let first=0;first<triangles.length;first++)for(let second=first+1;second<triangles.length;second++){
    if(bodies[first]===bodies[second])continue;
    if(++work>maxPairs)return fail('初态重叠纸层数量过多，顺序检查尚未完成。');
    if(bounds[first].some((b,axis)=>b.max<bounds[second][axis].min-planeTolerance||bounds[second][axis].max<b.min-planeTolerance))continue;
    const nb=normals[second];
    if(size(cross3(normals[first],nb))>1e-7||vertices[first].some(p=>Math.abs(dot(sub(p,vertices[second][0]),nb))>planeTolerance))continue;
    const drop=nb.reduce((axis,value,i)=>Math.abs(value)>Math.abs(nb[axis])?i:axis,0),axes=[0,1,2].filter(a=>a!==drop);
    const project=(p:V):P=>[p[axes[0]],p[axes[1]]],a=vertices[first].map(project),b=vertices[second].map(project),overlap=clipTriangle(a,b);
    if(overlap.length<3||polygonArea(overlap)<=minArea)continue;
    result.overlapPairs++;if(result.overlapPairs>maxOverlapPairs)return fail('初态接触区域过多，顺序检查尚未完成。');
    const fa=sourceFaces[first],fb=sourceFaces[second],key=fa<fb?`${fa}:${fb}`:`${fb}:${fa}`,row=rows?.get(key);
    if(!row){unresolved=true;continue;}
    // Follow the row's original orientation. Reversing a FOLD row is not simply
    // negating its sign when the two material normals point opposite ways.
    const ia=row[0]===fa?first:second,ib=row[1]===fb?second:first,ta=ia===first?a:b,tb=ib===second?b:a;
    const center:P=[overlap.reduce((s,p)=>s+p[0],0)/overlap.length,overlap.reduce((s,p)=>s+p[1],0)/overlap.length];
    const probes=[center,...overlap.map(p=>[center[0]*.1+p[0]*.9,center[1]*.1+p[1]*.9] as P)];
    let complete=true;
    for(const probe of probes){
      const wa=barycentric(probe,ta,triangles[ia]),wb=barycentric(probe,tb,triangles[ib]);
      if(!wa||!wb){complete=false;continue;}
      const side=options.initialSide?.(triangles[ib],wa,wb)??null;
      if(side===null){complete=false;continue;}
      if(side!==0&&side!==row[2]){
        result.violations.push({triangles:[ia,ib],faces:[row[0],row[1]],expectedSign:row[2] as -1|1,actualSign:side,materialPoints:[wa,wb]});
        return {...result,status:'collision',reason:'活动纸瓣将从初态纸层的错误一侧离开；请调整折叠方向、作用纸层或固定侧。'};
      }
    }
    if(complete)result.checkedPairs++;else unresolved=true;
  }
  return unresolved?{...result,status:'inconclusive',reason:rows?'部分初态接触尚未证明正确的离层方向。':'存在初态重叠纸层，尚未取得与本步材料索引一致的可信初态层序。'}:result;
}
