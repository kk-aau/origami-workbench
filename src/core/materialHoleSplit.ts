import type {Point} from './types';
import {materialPointInside} from './materialTraceGeometry';
export type MaterialRingPart={vertices:number[];edges:number[];holes?:{vertices:number[];edges:number[]}[]};
/** Walk the actual directed material boundaries plus both sides of actual
 * new creases. No bridge or triangulation edge is introduced into the CP. */
export function splitMaterialHoledFace(coords:Point[],rings:{vertices:number[];edges:number[]}[],cuts:{a:number;b:number;e:number}[],allowWeak=false):MaterialRingPart[]{
 const half:{a:number;b:number;e:number}[]=rings.flatMap(r=>r.vertices.map((a,k)=>({a,b:r.vertices[(k+1)%r.vertices.length],e:r.edges[k]})));cuts.forEach(c=>half.push(c,{a:c.b,b:c.a,e:c.e}));
 return walkMaterialFaceDarts(coords,half,allowWeak);
}
export function walkMaterialFaceDarts(coords:Point[],half:{a:number;b:number;e:number}[],allowWeak=false):MaterialRingPart[]{
 const outgoing=new Map<number,number[]>();half.forEach((h,i)=>outgoing.set(h.a,[...(outgoing.get(h.a)??[]),i]));
 const next=half.map(h=>{const at=coords[h.b],before=coords[h.a],angle=Math.atan2(before[1]-at[1],before[0]-at[0]),twins:number[]=[];let best=-1,turn=Infinity;for(const i of outgoing.get(h.b)??[]){const c=half[i],p=coords[c.b];if(c.e===h.e||p[0]===before[0]&&p[1]===before[1]){twins.push(i);continue;}const d=(angle-Math.atan2(p[1]-at[1],p[0]-at[0])+2*Math.PI)%(2*Math.PI);if(d<turn){turn=d;best=i;}}if(best<0&&allowWeak){if(twins.length!==1)throw Error('材料边界没有唯一相反侧，未合并身份。');best=twins[0];}if(best<0)throw Error('孔洞材料划分丢失边界面角。');return best;});
 const visited=new Set<number>(),loops:{vertices:number[];edges:number[];area:number}[]=[];
 for(let seed=0;seed<half.length;seed++){if(visited.has(seed))continue;const vertices:number[]=[],edges:number[]=[];let i=seed;do{if(visited.has(i)||vertices.length>=half.length)throw Error('孔洞材料划分的边界绕行不闭合。');visited.add(i);vertices.push(half[i].a);edges.push(half[i].e);i=next[i];}while(i!==seed);
  if(vertices.length<2||!allowWeak&&(vertices.length<3||new Set(vertices).size!==vertices.length||new Set(edges).size!==edges.length))throw Error('该折痕只连接内外边界，尚不能表示为独立简单子面；未补连接线或吸附端点。');
  const origin=coords[vertices[0]],area=vertices.reduce((n,v,k)=>{const a=coords[v],b=coords[vertices[(k+1)%vertices.length]];return n+(a[0]-origin[0])*(b[1]-origin[1])-(a[1]-origin[1])*(b[0]-origin[0]);},0);if(!area&&!allowWeak)throw Error('孔洞划分产生退化面。');loops.push({vertices,edges,area});
 }
 const positive=loops.filter(r=>r.area>0),parts:MaterialRingPart[]=positive.map(r=>({vertices:r.vertices,edges:r.edges,holes:[]}));
 for(const r of loops.filter(r=>r.area<=0)){const parents=positive.flatMap((p,f)=>materialPointInside(coords[r.vertices[0]],p.vertices.map(v=>coords[v]))?[f]:[]).sort((a,b)=>positive[a].area-positive[b].area);if(!parents.length||parents.length>1&&positive[parents[0]].area===positive[parents[1]].area)throw Error('孔洞没有唯一的材料子面归属。');parts[parents[0]].holes!.push({vertices:r.vertices,edges:r.edges});}
 if(!parts.length)throw Error('孔洞划分没有有效外圈。');return parts;
}
