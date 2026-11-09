import earcut from 'earcut';
import type {Point} from '../core/types';
import {materialAreaRings} from '../core/materialWeak';
import {materialOrientation} from '../core/materialTraceGeometry';
const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
/** Private geometric seed only. All actual source constraints are inserted
 * afterwards; callers restore indexed bank/fan identities and independently
 * validate the final mesh. No generated point or moved source coordinate. */
export function triangulateWeakConstraints(coords:Point[],rings:number[][],edgeRows:number[][],edges:[number,number][],spend:()=>void):number[][]{
 const representatives=new Map<string,number>(),rep=new Map<number,number>();for(const v of rings.flat()){const stamp=coords[v].join(',');if(!representatives.has(stamp))representatives.set(stamp,v);rep.set(v,representatives.get(stamp)!);}
 const region=materialAreaRings({vertices_coords:coords,edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[rings[0]],faces_holes:[rings.slice(1)]},0),ids=region.flat().map(v=>rep.get(v)!),holes:number[]=[];let size=region[0].length;for(const r of region.slice(1)){holes.push(size);size+=r.length;}
 const raw=earcut(ids.flatMap(v=>coords[v]),holes,2);let triangles=Array.from({length:raw.length/3},(_,i)=>raw.slice(i*3,i*3+3).map(k=>ids[k]));
 const orient=(a:number,b:number,c:number)=>materialOrientation(coords[a],coords[b],coords[c]),positive=(t:number[])=>orient(...t as [number,number,number])<0?[t[0],t[2],t[1]]:t;
 triangles=triangles.map(positive);
 const on=(v:number,a:number,b:number)=>v!==a&&v!==b&&!orient(a,b,v)&&coords[v][0]>=Math.min(coords[a][0],coords[b][0])&&coords[v][0]<=Math.max(coords[a][0],coords[b][0])&&coords[v][1]>=Math.min(coords[a][1],coords[b][1])&&coords[v][1]<=Math.max(coords[a][1],coords[b][1]);
 const restore=(ts:number[][],points:Iterable<number>)=>{for(const v of points){let present=ts.some(t=>t.includes(v));for(let i=0;i<ts.length;i++){spend();const t=ts[i];let split=false;for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],c=t[(k+2)%3];if(!on(v,a,b))continue;ts[i]=[a,v,c];ts.push([v,b,c]);present=true;split=true;break;}if(split)continue;if(!present&&[0,1,2].every(k=>orient(t[k],t[(k+1)%3],v)>0)){const [a,b,c]=t;ts[i]=[a,b,v];ts.push([b,c,v],[c,a,v]);present=true;}}if(!present)throw Error('弱边界受约束网格无法保留源点。');}};
 restore(triangles,representatives.values());
 const proper=(a:number,b:number,c:number,d:number)=>orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
 const constraints=new Map<string,[number,number]>();for(const e of edgeRows.flat()){const [a,b]=edges[e].map(v=>rep.get(v)!) as [number,number];constraints.set(key(a,b),[a,b]);}
 const protectedEdges=new Set<string>();
 for(const [stamp,[a,b]]of constraints){
  const mesh=new Map<string,{a:number;b:number;owners:number[]}>();triangles.forEach((t,f)=>t.forEach((v,k)=>{spend();const w=t[(k+1)%3],s=key(v,w),entry=mesh.get(s);if(entry)entry.owners.push(f);else mesh.set(s,{a:v,b:w,owners:[f]});}));
  if(mesh.has(stamp)){protectedEdges.add(stamp);continue;}
  const removed=new Set<number>();for(const [s,e]of mesh){spend();if(!proper(a,b,e.a,e.b))continue;if(protectedEdges.has(s)||e.owners.length!==2)throw Error('弱边界约束跨越已有源线或材料外边。');e.owners.forEach(f=>removed.add(f));}
  if(!removed.size)throw Error('弱边界受约束网格找不到实际源线的三角走廊。');
  const boundary=new Map<number,number>();for(const e of mesh.values()){const owners=e.owners.filter(f=>removed.has(f));if(owners.length!==1)continue;const t=triangles[owners[0]],k=t.findIndex((v,k)=>key(v,t[(k+1)%3])===key(e.a,e.b)),v=t[k],w=t[(k+1)%3];if(boundary.has(v))throw Error('弱边界三角走廊不是单个简单区域。');boundary.set(v,w);}
  const chain=(start:number,end:number)=>{const row=[start],seen=new Set(row);let v=start;while(v!==end){spend();const next=boundary.get(v);if(next===undefined||seen.has(next))throw Error('弱边界三角走廊边界不闭合。');v=next;row.push(v);seen.add(v);}return row;};
  const left=chain(a,b),right=chain(b,a);if(left.length+right.length-2!==boundary.size)throw Error('弱边界三角走廊有未覆盖的边界。');
  const next=triangles.filter((_,f)=>!removed.has(f));for(const row of [left,right]){if(row.length<3)throw Error('弱边界三角走廊退化。');const raw=earcut(row.flatMap(v=>coords[v]),undefined,2),patch=Array.from({length:raw.length/3},(_,i)=>positive(raw.slice(i*3,i*3+3).map(k=>row[k])));restore(patch,row);next.push(...patch);}triangles=next;protectedEdges.add(stamp);
 }
 const finalEdges=new Set(triangles.flatMap(t=>t.map((v,k)=>key(v,t[(k+1)%3]))));for(const stamp of constraints.keys())if(!finalEdges.has(stamp))throw Error('弱边界受约束网格丢失源线。');return triangles;
}
