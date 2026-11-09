import type {Point} from './types';
import {materialOrientation} from './materialTraceGeometry';
export type MaterialNetworkGraph={vertices:Point[];edges:[number,number][]};
export const MATERIAL_NETWORK_LIMITS={vertices:128,edges:256,intersections:1024};
const memory=new DataView(new ArrayBuffer(8));
const dyadic=(x:number):[bigint,number]=>{if(!x)return [0n,0];memory.setFloat64(0,x);const b=memory.getBigUint64(0),e=Number((b>>52n)&2047n),m=(b&((1n<<52n)-1n))|(e?1n<<52n:0n);return [(b>>63n?-1n:1n)*m,e?e-1075:-1074];};
const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const r=a%b;a=b;b=r;}return a||1n;};
// Round the exact rational to nearest IEEE-754 (ties to even), rather than
// independently truncating numerator/denominator and adding intersection drift.
const ratio=(n:bigint,d:bigint,e:number)=>{if(!n)return 0;const sign=n<0n?-1:1;n=n<0n?-n:n;let k=n.toString(2).length-d.toString(2).length;if(k>=0?n<(d<<BigInt(k)):(n<<BigInt(-k))<d)k--;const subnormal=k+e< -1022,shift=subnormal?e+1074:52-k,a=shift>=0?n<<BigInt(shift):n,b=shift>=0?d:d<<BigInt(-shift),q=a/b,r=a%b,rounded=q+(r*2n>b||r*2n===b&&(q&1n)!==0n?1n:0n);return sign*Number(rounded)*2**(subnormal?-1074:k+e-52);};
const on=(p:Point,a:Point,b:Point)=>!materialOrientation(a,b,p)&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);

/** Exact rational intersection identities. Input points are never moved or
 * clustered; different intersections that round to one point are rejected. */
export function splitMaterialNetwork(graph:MaterialNetworkGraph,tolerance:number,capacity:{vertices:number;edges:number;intersections:number;openSegments?:boolean}=MATERIAL_NETWORK_LIMITS,spendPair?:()=>void){
 const p=graph?.vertices,e=graph?.edges;
 if(!graph||Object.keys(graph).sort().join(',')!=='edges,vertices'||!Array.isArray(p)||p.length<(capacity.openSegments?2:3)||p.length>capacity.vertices||Array.from(p).some(q=>!Array.isArray(q)||q.length!==2||Array.from(q).some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6))||!Array.isArray(e)||e.length<(capacity.openSegments?1:3)||e.length>capacity.edges||Array.from(e).some(q=>!Array.isArray(q)||q.length!==2||q[0]===q[1]||Array.from(q).some(v=>!Number.isInteger(v)||v<0||v>=p.length)))throw Error(`线网需要${capacity.openSegments?2:3}–${capacity.vertices}个有限二维点、${capacity.openSegments?1:3}–${capacity.edges}条有效边，坐标±1000000。`);
 if(new Set(p.map(q=>q.join(','))).size!==p.length)throw Error('线网有重复坐标点，请显式使用同一编号连接，不会焊接端点。');
 if(new Set(e.map(q=>[...q].sort((a,b)=>a-b).join(','))).size!==e.length)throw Error('线网有重复边，未静默删除。');
 const coords=p.map(q=>[...q] as Point),all=p.flat().map(dyadic),exponent=Math.min(...all.filter(([m])=>m!==0n).map(([,s])=>s)),ints=p.map(q=>q.map(v=>{const [m,s]=dyadic(v);return m<<BigInt(s-exponent);}) as [bigint,bigint]);
 const keys=new Map(ints.map(([x,y],i)=>[`${x}/1;${y}/1`,i])),cuts=e.map(([a,b])=>new Set([a,b])),coordinateKeys=new Set(coords.map(q=>q.join(',')));let intersections=0;
 const cross=(a:bigint[],b:bigint[])=>a[0]*b[1]-a[1]*b[0],sub=(a:bigint[],b:bigint[])=>[a[0]-b[0],a[1]-b[1]];
 for(let i=0;i<e.length;i++){
  const [a,b]=e[i];if(Math.hypot(p[b][0]-p[a][0],p[b][1]-p[a][1])<=tolerance)throw Error('线网边长度低于可验证精度。');
  p.forEach((q,v)=>{spendPair?.();if(on(q,p[a],p[b]))cuts[i].add(v);});
  for(let j=i+1;j<e.length;j++){spendPair?.();
   const [c,d]=e[j],r=sub(ints[b],ints[a]),s=sub(ints[d],ints[c]);let det=cross(r,s);
   if(!det){if(!cross(sub(ints[c],ints[a]),r)){const axis=Math.abs(p[b][0]-p[a][0])>=Math.abs(p[b][1]-p[a][1])?0:1;if(Math.max(Math.min(p[a][axis],p[b][axis]),Math.min(p[c][axis],p[d][axis]))<Math.min(Math.max(p[a][axis],p[b][axis]),Math.max(p[c][axis],p[d][axis])))throw Error('线网存在共线重叠，未合并或删除。');}continue;}
   let t=cross(sub(ints[c],ints[a]),s),u=cross(sub(ints[c],ints[a]),r);if(det<0n){det=-det;t=-t;u=-u;}if(t<0n||t>det||u<0n||u>det)continue;
   const nx=ints[a][0]*det+r[0]*t,ny=ints[a][1]*det+r[1]*t,gx=gcd(nx,det),gy=gcd(ny,det),stamp=`${nx/gx}/${det/gx};${ny/gy}/${det/gy}`;let v=keys.get(stamp);
   if(v===undefined){if(++intersections>capacity.intersections)throw Error('线网交点超过1024个，未截断。');const q:Point=[ratio(nx,det,exponent),ratio(ny,det,exponent)];if(q.some(x=>!Number.isFinite(x))||coordinateKeys.has(q.join(',')))throw Error('不同交点无法用当前浮点坐标区分，未吸附或焊接。');v=coords.length;coords.push(q);coordinateKeys.add(q.join(','));keys.set(stamp,v);}
   cuts[i].add(v);cuts[j].add(v);
  }
 }
 const edges:[number,number][]=[],edgeSource:number[]=[];
 cuts.forEach((set,i)=>{const [a,b]=e[i],axis=Math.abs(p[b][0]-p[a][0])>=Math.abs(p[b][1]-p[a][1])?0:1,vs=[...set].sort((u,v)=>(coords[u][axis]-coords[v][axis])*Math.sign(p[b][axis]-p[a][axis]));for(let k=1;k<vs.length;k++){if(Math.hypot(coords[vs[k]][0]-coords[vs[k-1]][0],coords[vs[k]][1]-coords[vs[k-1]][1])<=tolerance)throw Error('线网交点间距低于可验证精度，未吸附端点。');edges.push([vs[k-1],vs[k]]);edgeSource.push(i);}});
 const degree=coords.map(()=>0);edges.forEach(([a,b])=>{degree[a]++;degree[b]++;});if(degree.some(n=>n<(capacity.openSegments?1:2)))throw Error('线网含孤点或自由端点，尚不能组成完整闭合材料面。');
 return {vertices:coords,edges,edgeSource,intersections};
}
