import {wovenCurveHolesMatch,type WovenCurveHole} from './wovenCurveHoles';
import {wovenMotherRegions} from './wovenMotherRings';
import type {XY} from './tessellation';
export type WovenRingHole={face:number;component:number};
export type WovenGraph={vertices:XY[];edges:[number,number][];holeFaces?:number[];nestedSheets?:true;ringHoles?:WovenRingHole[];curveHoles?:WovenCurveHole[]};
export function readWovenRingHoles(value:unknown):value is WovenRingHole[]{return Array.isArray(value)&&value.length>=1&&value.length<=32&&Array.from(value).every(b=>!!b&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).sort().join(',')==='component,face'&&Number.isInteger(b.face)&&b.face>=0&&b.face<256&&Number.isInteger(b.component)&&b.component>=0&&b.component<512)&&new Set(value.map(b=>b.component)).size===value.length;}
export function readWovenGraph(value:unknown):WovenGraph|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>,p=r.vertices,e=r.edges;
 if(Object.keys(r).some(k=>!['edges','vertices','holeFaces','nestedSheets','ringHoles','curveHoles'].includes(k))||Object.hasOwn(r,'ringHoles')&&!readWovenRingHoles(r.ringHoles)||Object.hasOwn(r,'nestedSheets')&&r.nestedSheets!==true||!Array.isArray(p)||p.length<3||p.length>512||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000))||!Array.isArray(e)||e.length<3||e.length>1024||e.some(q=>!Array.isArray(q)||q.length!==2||q[0]===q[1]||q.some(n=>!Number.isInteger(n)||n<0||n>=p.length))||new Set(e.map(q=>q.slice().sort((a:number,b:number)=>a-b).join(','))).size!==e.length||r.holeFaces!==undefined&&!readWovenHoleIds(r.holeFaces))return null;
 if(Object.hasOwn(r,'curveHoles')&&!wovenCurveHolesMatch(r.curveHoles,{vertices:p as XY[],edges:e as [number,number][],ringHoles:r.ringHoles as WovenRingHole[]}))return null;
 return structuredClone(value) as WovenGraph;
}
/** In[1278] half-edge order, used only to bind full inset classification stamps. */
export function readWovenHoleIds(value:unknown):value is number[]{return Array.isArray(value)&&value.length>=1&&value.length<=32&&Array.from(value).every(i=>Number.isInteger(i)&&i>=0&&i<256)&&new Set(value).size===value.length;}
export function wovenGraphFaceCycles(graph:WovenGraph):{inner:number[][];outer:number[][]}|null{
 const {vertices:p,edges}=graph,neighbors:number[][]=p.map(()=>[]),seen=new Set<string>();
 const inner:number[][]=[],outer:number[][]=[];
 edges.forEach(([a,b])=>{neighbors[a].push(b);neighbors[b].push(a);});
 neighbors.forEach((ns,v)=>ns.sort((a,b)=>Math.atan2(p[a][1]-p[v][1],p[a][0]-p[v][0])-Math.atan2(p[b][1]-p[v][1],p[b][0]-p[v][0])));
 for(const first of [...edges,...edges.map(([a,b])=>[b,a] as [number,number])]){
  if(seen.has(first.join(',')))continue;const face:number[]=[];let [a,b]=first;
  while(!seen.has(`${a},${b}`)){seen.add(`${a},${b}`);face.push(a);const ns=neighbors[b];[a,b]=[b,ns[(ns.indexOf(a)+ns.length-1)%ns.length]];}
  if(a!==first[0]||b!==first[1]||face.length<3||new Set(face).size!==face.length)return null;
  const area=face.reduce((s,a,i)=>{const b=face[(i+1)%face.length];return s+p[a][0]*p[b][1]-p[a][1]*p[b][0];},0);
  if(area===0)return null;(area>0?inner:outer).push(face);
 }
 return {inner,outer};
}
export function wovenGraphEdgeKinds(graph:WovenGraph):number[]|null{
 const cycles=wovenGraphFaceCycles(graph);if(!cycles||graph.holeFaces?.some(i=>i>=cycles.inner.length))return null;
 const counts=new Map<string,number>(),key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
 let regions:{faces:number[][];holes:number[][][]} ;try{regions=graph.ringHoles?wovenMotherRegions(graph):{faces:cycles.inner.filter((_,f)=>!graph.holeFaces?.includes(f)),holes:[]};}catch{return null;}
 regions.faces.forEach((face,f)=>[face,...(regions.holes[f]??[])].forEach(ring=>ring.forEach((a,i)=>{const k=key(a,ring[(i+1)%ring.length]);counts.set(k,(counts.get(k)??0)+1);})));
 const edges=graph.edges;
 if(edges.some(([a,b])=>![1,2].includes(counts.get(key(a,b))??0)))return null;
 return edges.map(([a,b])=>counts.get(key(a,b))===1?-1:0);
}
export function wovenGraphPreset():WovenGraph{return {vertices:[[.001,.001],[1,0],[0,1],[-1,0],[0,-1]],edges:[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]]};}

/** Source-index components; coordinate equality never joins separate inputs. */
export function wovenGraphComponents(graph:WovenGraph):number[][] {
 const neighbors=graph.vertices.map(()=>[] as number[]);graph.edges.forEach(([a,b])=>{neighbors[a].push(b);neighbors[b].push(a);});
 const seen=new Set<number>(),components:number[][]=[];
 for(let first=0;first<neighbors.length;first++){
  if(seen.has(first))continue;const queue=[first];seen.add(first);
  for(let k=0;k<queue.length;k++)for(const v of neighbors[queue[k]])if(!seen.has(v)){seen.add(v);queue.push(v);}
  components.push(queue.sort((a,b)=>a-b));
 }
 return components;
}
