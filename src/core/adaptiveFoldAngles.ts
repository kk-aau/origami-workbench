import ear from 'rabbit-ear';
import type {FoldGraph} from './types';
import {materialFaceRings} from './materialRings';
import {solveRigidFoldGeometry} from './rigidFoldGeometry';

const identity=()=>[1,0,0,0,1,0,0,0,1,0,0,0];
/** Distinguish a failed local correction from invalid material geometry. */
export class AdaptiveFoldBoundsError extends Error {}
/** Solve free M/V hinges from material loop closure. Explicit angles are hard
 * constraints. Iteration stops on convergence or numerical stagnation, never
 * on elapsed time or a search-size budget; callers run this in a worker. */
export function solveAdaptiveFoldAngles(graph:FoldGraph,options:{initial?:readonly number[];allowUnderdetermined?:boolean;angleBounds?:readonly (readonly [number,number]|null)[]}={}):number[]{
 const limits=options.angleBounds;
 if(limits&&(limits.length!==graph.edges_vertices.length||limits.some((range,e)=>range!==null&&(!Array.isArray(range)||range.length!==2||range.some(v=>!Number.isFinite(v))||range[0]<-180||range[1]>180||range[0]>range[1]||typeof graph.edges_foldAngle[e]==='number'&&(graph.edges_foldAngle[e]!<range[0]||graph.edges_foldAngle[e]!>range[1])))))throw Error('折角修正范围无效，或与已知驱动角冲突。');
 const free=graph.edges_vertices.flatMap((_,e)=>graph.edges_foldAngle[e]===null&&['M','V'].includes(graph.edges_assignment[e])?[e]:[]);
 if(!free.length)return graph.edges_foldAngle.map(a=>a??0);
 const driven=graph.edges_foldAngle.filter((a,e)=>typeof a==='number'&&Math.abs(a)>1e-6&&['M','V'].includes(graph.edges_assignment[e]));
 if(!driven.length)throw Error('自适应折角需要至少一条已知的非零折角，请先设置一条驱动折痕。');
 const rest=solveRigidFoldGeometry(graph,{edgesFoldAngle:graph.edges_vertices.map(()=>0)});
 if(rest.status!=='ready')throw Error(rest.message);
 const points=graph.vertices_coords,faces=graph.faces_vertices!,edges=graph.edges_vertices;
 const extent=Math.max(1,...points.map(p=>Math.hypot(p[0]-points[0][0],p[1]-points[0][1])));
 const uses=edges.map(()=>[] as {face:number;direction:number}[]),lookup=new Map<string,number>();
 edges.forEach(([a,b],e)=>lookup.set(a<b?`${a}:${b}`:`${b}:${a}`,e));
 faces.forEach((face,f)=>{
  const area=face.reduce((s,v,i)=>{const a=points[v],b=points[face[(i+1)%face.length]];return s+a[0]*b[1]-a[1]*b[0]},0),sign=Math.sign(area);
  materialFaceRings(graph,f).forEach((ring,h)=>ring.forEach((a,k)=>{
   const b=ring[(k+1)%ring.length],e=(h?graph.faces_holeEdges?.[f]?.[h-1]:graph.faces_edges?.[f])?.[k]??lookup.get(a<b?`${a}:${b}`:`${b}:${a}`)!;
   uses[e].push({face:f,direction:(edges[e][0]===a?1:-1)*sign});
  }));
 });
 const neighbors=faces.map(()=>[] as {face:number;edge:number;direction:number}[]);
 uses.forEach((owners,e)=>{if(owners.length===2){const [a,b]=owners;neighbors[a.face].push({face:b.face,edge:e,direction:b.direction});neighbors[b.face].push({face:a.face,edge:e,direction:a.direction});}});
 const parent=faces.map(()=>-1),tree:{from:number;face:number;edge:number;direction:number}[]=[],queue=[0];parent[0]=0;
 for(let i=0;i<queue.length;i++)for(const n of neighbors[queue[i]])if(parent[n.face]<0){parent[n.face]=queue[i];tree.push({from:queue[i],...n});queue.push(n.face);}
 const hinges=uses.flatMap((owners,e)=>owners.length===2?[{from:owners[0].face,face:owners[1].face,edge:e,direction:owners[1].direction}]:[]);
 const axes=edges.map(([a,b])=>{const x=points[b][0]-points[a][0],y=points[b][1]-points[a][1],d=Math.hypot(x,y);return [x/d,y/d,0]});
 const angleSeed=Math.min(120,Math.max(10,Math.abs(driven[0]!)));
 const initial=free.map(e=>options.initial?.[e]??(graph.edges_assignment[e]==='M'?-angleSeed:angleSeed));
 const ranges=free.map(e=>[Math.max(graph.edges_assignment[e]==='M'?-180:0,limits?.[e]?.[0]??-180),Math.min(graph.edges_assignment[e]==='M'?0:180,limits?.[e]?.[1]??180)]);
 if(ranges.some(([lo,hi])=>lo>hi))throw Error('折角修正范围与山谷方向冲突。');
 const bound=(v:number,i:number)=>Math.max(ranges[i][0],Math.min(ranges[i][1],v));
 const angles=(x:number[])=>{const a=graph.edges_foldAngle.map(a=>a??0);free.forEach((e,i)=>a[e]=x[i]);return a;};
 const residual=(x:number[])=>{
  const a=angles(x),matrices=faces.map(()=>identity());
  const local=(n:typeof hinges[number])=>ear.math.makeMatrix3Rotate(n.direction*a[n.edge]*Math.PI/180,axes[n.edge] as [number,number,number],[...points[edges[n.edge][0]],0]);
  for(const n of tree)matrices[n.face]=ear.math.multiplyMatrices3(matrices[n.from],local(n));
  return hinges.flatMap(n=>{const expected=ear.math.multiplyMatrices3(matrices[n.from],local(n));return expected.map((v,k)=>(v-matrices[n.face][k])/(k>=9?extent:1));});
 };
 const squared=(r:number[])=>r.reduce((sum,x)=>sum+x*x,0);
 const jacobian=(x:number[],r:number[])=>x.map((_,i)=>{const h=x[i]>=0?-1e-4:1e-4,y=[...x];y[i]+=h;const next=residual(y);return next.map((v,k)=>(v-r[k])/h);});
 const rank=(columns:number[][])=>{const basis:number[][]=[];for(const c of columns){let v=[...c];for(const b of basis){const dot=v.reduce((s,x,i)=>s+x*b[i],0);v=v.map((x,i)=>x-dot*b[i]);}const n=Math.sqrt(squared(v));if(n>1e-7)basis.push(v.map(x=>x/n));}return basis.length;};
 let x=initial.map(bound),r=residual(x),cost=squared(r),damping=1e-8;
 const unresolved=()=>limits?new AdaptiveFoldBoundsError('在限定折角范围内未能找到闭合姿态，请调整驱动折角或范围。'):Error('这些驱动折角互相冲突或缺少约束，未能推算出闭合姿态。');
 for(;;){
  // The independent material geometry validator defines sufficient accuracy;
  // demanding a smaller arbitrary residual can keep a valid pose iterating.
  const candidateAngles=angles(x),check=solveRigidFoldGeometry(graph,{edgesFoldAngle:candidateAngles});
  if(check.status==='ready'){
   if(!options.allowUnderdetermined&&rank(jacobian(x,r))<free.length)throw Error('已知折角不足以确定所有自适应折痕，请再指定驱动折角或从三维模拟选择姿态。');
   return candidateAngles;
  }
  const j=jacobian(x,r),gradient=j.map(c=>c.reduce((sum,v,t)=>sum+v*r[t],0));
  // A clipped full-space Newton step can crawl along an active bound forever.
  // Hold coordinates whose descent points out of the permitted correction box.
  const working=x.flatMap((v,i)=>limits&&(v<=ranges[i][0]+1e-10&&gradient[i]>=0||v>=ranges[i][1]-1e-10&&gradient[i]<=0)?[]:[i]);
  if(!working.length)throw unresolved();
  const columns=working.map(i=>j[i]),n=working.length,a=columns.map((c,i)=>columns.map((d,k)=>c.reduce((sum,v,t)=>sum+v*d[t],0)+(i===k?damping:0))),b=working.map(i=>-gradient[i]);
  // Pivoted elimination of the damped normal system.
  for(let i=0;i<n;i++){
   let p=i;for(let k=i+1;k<n;k++)if(Math.abs(a[k][i])>Math.abs(a[p][i]))p=k;
   [a[p],a[i]]=[a[i],a[p]];[b[p],b[i]]=[b[i],b[p]];
   const pivot=a[i][i];if(!Number.isFinite(pivot)||Math.abs(pivot)<1e-30)throw Error('自适应折角数值退化，请调整驱动折角。');
   for(let k=i+1;k<n;k++){const t=a[k][i]/pivot;for(let c=i;c<n;c++)a[k][c]-=t*a[i][c];b[k]-=t*b[i];}
  }
  const delta=Array(n).fill(0);for(let i=n-1;i>=0;i--)delta[i]=(b[i]-a[i].slice(i+1).reduce((s,v,k)=>s+v*delta[i+1+k],0))/a[i][i];
  const candidate=[...x];working.forEach((index,i)=>candidate[index]=bound(x[index]+delta[i],index));
  const next=residual(candidate),value=squared(next);
  if(value<cost){
   const progress=cost-value;x=candidate;r=next;cost=value;damping=Math.max(1e-14,damping/4);
   if(progress<=Number.EPSILON*Math.max(cost,1e-14)&&solveRigidFoldGeometry(graph,{edgesFoldAngle:angles(x)}).status!=='ready')throw unresolved();
  }else{damping*=10;if(damping>1e8)throw unresolved();}
 }
}
