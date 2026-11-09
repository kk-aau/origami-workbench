import type {XY} from './tessellation';

type Segment=[XY,XY];
type IndexGraph={vertices:XY[];edges:[number,number][]};
type Medial={point:XY;halfDistance:number;parameters:[number,number]};
const CHOP_TOLERANCE=1e-10;
const chop=(n:number)=>Math.abs(n)<CHOP_TOLERANCE?0:n;
const sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:XY,b:XY)=>a[0]*b[0]+a[1]*b[1];
const at=(a:XY,d:XY,t:number):XY=>[a[0]+t*d[0],a[1]+t*d[1]];

/** In[1094]/In[195]: append the first encountered representative; no averaging. */
function indexify(segments:Segment[],tolerance:number):IndexGraph{
 const vertices:XY[]=[],edges:[number,number][]=[];
 for(const segment of segments){
  const ids=segment.map(point=>{
   const found=vertices.findIndex(p=>(p[0]-point[0])**2+(p[1]-point[1])**2<=tolerance**2);
   if(found>=0)return found;
   vertices.push([...point]);return vertices.length-1;
  });
  edges.push([ids[0],ids[1]]);
 }
 return {vertices,edges};
}

/** Literal In[179], including the parallel-overlap return and nine candidates. */
function segmentMedials(p1:XY,p2:XY,q1:XY,q2:XY):Medial[]{
 const dp=sub(p2,p1),dq=sub(q2,q1);
 if(dp.every(n=>chop(n)===0)||dq.every(n=>chop(n)===0))throw Error('原 Graph 首轮合点产生退化线段。');
 const pp=dot(dp,dp),pq=dot(dp,dq),qq=dot(dq,dq),det=pq**2-pp*qq;
 const candidatePoints=(rp:XY,rq:XY,tp:number,tq:number,fromQ=false):Medial=>{
  const point:XY=[(rp[0]+rq[0])/2,(rp[1]+rq[1])/2],delta=sub(point,fromQ?rq:rp);
  return {point,halfDistance:Math.sqrt(dot(delta,delta)),parameters:[tp,tq]};
 };
 const candidate=(tp:number,tq:number)=>candidatePoints(at(p1,dp,tp),at(q1,dq,tq),tp,tq);
 const candidates:Medial[]=[];
 if(chop(det)===0){
  const projected=[dot(sub(q1,p1),dp)/pp,dot(sub(q2,p1),dp)/pp].sort((a,b)=>a-b),[low,high]=projected;
  if(low<=1&&high>=0){
   const tp=(Math.max(low,0)+Math.min(high,1))/2;
   return [candidate(tp,dot(sub(at(p1,dp,tp),q1),dq)/qq)];
  }
 }else{
  const dqp=sub(q1,p1),pd=dot(dp,dqp),qd=dot(dq,dqp);
  candidates.push(candidate((pq*qd-pd*qq)/det,(pp*qd-pq*pd)/det));
 }
 for(const [tp,p] of [[0,p1],[1,p2]] as [number,XY][])for(const [tq,q] of [[0,q1],[1,q2]] as [number,XY][])candidates.push(candidatePoints(p,q,tp,tq));
 for(const [tp,p] of [[0,p1],[1,p2]] as [number,XY][]){
  const tq=dot(sub(p,q1),dq)/qq;candidates.push(candidatePoints(p,at(q1,dq,tq),tp,tq));
 }
 for(const [tq,q] of [[0,q1],[1,q2]] as [number,XY][]){
  const tp=dot(sub(q,p1),dp)/pp;candidates.push(candidatePoints(at(p1,dp,tp),q,tp,tq,true));
 }
 const admissible=candidates.filter(c=>c.parameters.every(t=>t>=0&&t<=1));
 const best=admissible.reduce((best,c)=>c.halfDistance<best.halfDistance?c:best);
 // Strict source Sort leaves equal-key order unspecified; accept only equivalent finite branches.
 if(admissible.some(c=>c.halfDistance===best.halfDistance&&(
  c.point.some((n,k)=>Math.abs(n-best.point[k])>1e-12)||c.parameters.some((t,k)=>
   (chop(t)===0)!==(chop(best.parameters[k])===0)||(chop(t-1)===0)!==(chop(best.parameters[k]-1)===0))
 )))throw Error('原 Graph 最小距离平局产生不同几何或端点分支。');
 const minima:Medial[]=[];
 for(const c of admissible)if(c.halfDistance===best.halfDistance&&!minima.some(m=>m.point.every((n,k)=>n===c.point[k])&&m.parameters.every((n,k)=>n===c.parameters[k])))minima.push(c);
 return minima;
}

const boxesOverlap=(p1:XY,p2:XY,q1:XY,q2:XY,tolerance:number)=>[0,1].every(k=>
 !(Math.max(p1[k],p2[k])<Math.min(q1[k],q2[k])-tolerance||Math.max(q1[k],q2[k])<Math.min(p1[k],p2[k])-tolerance));

/** Independent finite In[3411] replay. Faces stays empty until the woven adapter. */
export function recomputeWovenCourteousGraph(completeLines:Segment[],samePtTolerance=1e-6,intersectionTolerance=1e-6){
 if([samePtTolerance,intersectionTolerance].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>.1))throw Error('原 Graph 两项公差须为 0–0.1 的有限数。');
 if(!Array.isArray(completeLines)||completeLines.length<1||completeLines.length>56||completeLines.some(s=>!Array.isArray(s)||s.length!==2||s.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)))))throw Error('原 Graph 输入须为完整有限二维线段。');
 const firstIndex=indexify(completeLines,samePtTolerance),{vertices,edges}=firstIndex;
 const pairResults:{i:number;j:number;minima:Medial[]}[]=[];
 let medialTieBranchesChecked=1;
 for(let i=0;i<edges.length;i++){
  const [a,b]=edges[i],p1=vertices[a],p2=vertices[b];
  for(let j=i+1;j<edges.length;j++){
   const [c,d]=edges[j],q1=vertices[c],q2=vertices[d];
   if(!boxesOverlap(p1,p2,q1,q2,intersectionTolerance))continue;
   const minima=segmentMedials(p1,p2,q1,q2);
   if(chop(minima[0].halfDistance)<=intersectionTolerance/2){
    pairResults.push({i,j,minima});medialTieBranchesChecked*=minima.length;
    if(medialTieBranchesChecked>64)throw Error('原 Graph 等距排序分支超过 64 分支预算。');
   }
  }
 }
 const embeddedResult=(selected:Medial[])=>{
  const edgePoints:{point:XY;t:number}[][]=edges.map(([a,b])=>[{point:[...vertices[a]],t:0},{point:[...vertices[b]],t:1}]);
  pairResults.forEach(({i,j},k)=>{
   const {point,parameters}=selected[k];
   for(const [index,t] of [[i,parameters[0]],[j,parameters[1]]])if(chop(t)!==0&&chop(t-1)!==0)edgePoints[index].push({point:[...point],t});
  });
  const embeddedSegments:Segment[]=[],embeddedEdgeOrigins:number[]=[];
  for(let i=0;i<edgePoints.length;i++){
   const points=edgePoints[i];
   // Original Sort uses strict <. Distinct points at identical t are outside this finite contract.
   if(points.some((p,j)=>points.slice(j+1).some(q=>p.t===q.t&&(p.point[0]!==q.point[0]||p.point[1]!==q.point[1]))))throw Error('原 Graph 的同参数不同交点不能确定原 Sort 次序。');
   points.sort((a,b)=>a.t-b.t);
   for(let j=0;j<points.length-1;j++){
    embeddedSegments.push([[...points[j].point],[...points[j+1].point]]);embeddedEdgeOrigins.push(i);
   }
  }
  const secondIndex=indexify(embeddedSegments,samePtTolerance),removedSelfLoopSegments:number[]=[],kept:number[]=[];
  secondIndex.edges.forEach(([a,b],i)=>(a===b?removedSelfLoopSegments:kept).push(i));
  const graph={vertices:secondIndex.vertices.map(p=>[...p] as XY),edges:kept.map(i=>[...secondIndex.edges[i]] as [number,number]),faces:[] as number[][]};
  return {embeddedSegments,embeddedEdgeOrigins,secondIndex,removedSelfLoopSegments,kept,graph};
 };
 let branches:Medial[][]=[[]];
 for(const {minima} of pairResults)branches=branches.flatMap(branch=>minima.map(m=>[...branch,m]));
 const reference=embeddedResult(branches[0]),exact=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 for(const branch of branches.slice(1)){
  const other=embeddedResult(branch),graph=reference.graph;
  if(!exact(graph.edges,other.graph.edges)||graph.vertices.length!==other.graph.vertices.length||
   graph.vertices.some((p,i)=>p.some((n,k)=>Math.abs(n-other.graph.vertices[i][k])>1e-12))||
   !exact(reference.embeddedEdgeOrigins,other.embeddedEdgeOrigins)||!exact(reference.secondIndex.edges,other.secondIndex.edges)||
   !exact(reference.removedSelfLoopSegments,other.removedSelfLoopSegments)||!exact(reference.kept,other.kept))throw Error('原 Graph 等距排序分支产生不同二轮索引或边来源。');
 }
 const {embeddedSegments,embeddedEdgeOrigins,secondIndex,removedSelfLoopSegments,kept,graph}=reference;
 return {schema:'origamica-courteous-graph-v1',function:'MakeCourteousAnarchyGraph',definitionCells:['In[3410]','In[3411]'],
  definitionLines:[[252214,252224],[252226,252266]],indexConvention:'zero-based; source traversal order',
  samePtTolerance,intersectionTolerance,sameTest:'SamePtQ=PtOnPtQ',startPoints:[],chopTolerance:CHOP_TOLERANCE,
  firstIndex,embeddedSegments,embeddedEdgeOrigins,secondIndex,removedSelfLoopSegments,
  edgeOrigins:kept.map(i=>embeddedEdgeOrigins[i]),graph,
  numericalTiePolicy:'all minimum-distance branches checked; identical ordered graph topology and roundoff-equivalent coordinates required',
  medialTieBranchesChecked,medialTieBranchLimit:64,
  wolframExecuted:false,fullSymbolicOptionsImplemented:false,
  finiteOptions:['SamePtTolerance','IntersectionTolerance']};
}
