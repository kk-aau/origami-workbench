import {wovenEllipseChordError} from './wovenCurveHoles';
import type {FoldGraph,Point} from '../core/types';
import type {TessParams} from './tessellation';
import {readWovenParams,type WovenParams} from './wovenParams';
import {readWovenGraph,wovenGraphComponents} from './wovenGraph';
import {wovenMotherRegions} from './wovenMotherRings';
import {materialPointInside as inside} from '../core/materialTraceGeometry';
import {readWovenGraphSource,recomputeWovenGraphSource} from './wovenGraphSource';
import {verifyWovenAreaRecovery} from './wovenAreaTopology';
import {readWovenOldState} from './wovenOld';

export interface WovenCutComponent {
  faces:number[];
  vertices:number[];
  edges:number[];
  /** Boundary walks, with the closing vertex omitted; slit tips may repeat. */
  boundaryLoops:number[][];
}
export interface WovenCutTopology {
  sourceCP:Point[];
  sourceFolded:Point[];
  splitGraph:FoldGraph;
  splitFolded:Point[];
  /** Split vertex/edge -> original source index; original face IDs are unchanged. */
  vertexSource:number[];
  edgeSource:number[];
  faceCorners:number[][];
  internalBoundaryEdges:number[];
  edgeFaceIncidence:number[][];
  foldedFaceWinding:number[];
  edgeRestoreAnglesDeg:number[];
  components:WovenCutComponent[];
  stationaryFoldFace:number;
  /** Geometric/source verification does not certify a layer order or folding path. */
  standardSingleSheetFold:boolean;
}
export type WovenCutInspection={ok:true;topology:WovenCutTopology}|{ok:false;reason:string};
export type WovenCutSplit=Pick<WovenCutTopology,'splitGraph'|'splitFolded'|'vertexSource'|'edgeSource'|'faceCorners'|'components'>;

const MAX_VERTICES=8192,MAX_EDGES=16384,MAX_CORNERS=65536,MAX_PAIR_CHECKS=2_000_000;
function fail(reason:string):never{throw new Error(reason);}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function area(points:Point[],face:number[]):number {
  const origin=points[face[0]];
  return face.reduce((s,a,i)=>s+cross(origin,points[a],points[face[(i+1)%face.length]]),0)/2;
}
function exact(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>exact(v,b[i]));
  const x=record(a),y=record(b);if(!x||!y)return false;
  const keys=Object.keys(x).sort();return exact(keys,Object.keys(y).sort())&&keys.every(k=>exact(x[k],y[k]));
}
function points(value:unknown,limit=MAX_VERTICES):Point[] {
  if(!Array.isArray(value)||value.length<3||value.length>limit||value.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!finite(n))))fail('切口图包含无效的二维坐标或超过验证预算。');
  return (value as Point[]).map(p=>[...p]);
}
function edges(value:unknown,n:number,limit=MAX_EDGES):[number,number][] {
  if(!Array.isArray(value)||!value.length||value.length>limit||value.some(e=>!Array.isArray(e)||e.length!==2||e[0]===e[1]||e.some(v=>!Number.isInteger(v)||v<0||v>=n)))fail('切口图的边索引无效或超过验证预算。');
  const result=(value as [number,number][]).map(e=>[...e] as [number,number]);
  if(new Set(result.map(([a,b])=>edgeKey(a,b))).size!==result.length)fail('原切口图存在重复拓扑边。');
  return result;
}
function faces(value:unknown,n:number):number[][] {
  if(!Array.isArray(value)||!value.length||value.length>MAX_VERTICES||value.some(f=>!Array.isArray(f)||f.length<3||new Set(f).size!==f.length||f.some(v=>!Number.isInteger(v)||v<0||v>=n))||value.reduce((s,f)=>s+f.length,0)>MAX_CORNERS)fail('切口图的面索引无效或超过验证预算。');
  return (value as number[][]).map(f=>[...f]);
}
function faceHoles(value:unknown,outer:number[][],n:number):number[][][]{
 if(value===undefined)return outer.map(()=>[]);
 if(!Array.isArray(value)||value.length!==outer.length||Array.from(value).some(rs=>!Array.isArray(rs)||rs.length>32))fail('原材料面的内环列表无效。');
 let total=outer.reduce((s,r)=>s+r.length,0);
 return value.map((rs,f)=>{const rings=(rs as unknown[]).map(r=>faces([r],n)[0]),all=[...outer[f],...rings.flat()];total+=rings.reduce((s,r)=>s+r.length,0);if(new Set(all).size!==all.length||total>MAX_CORNERS)fail('材料内外环共用点或超过面角验证预算。');return rings;});
}
function tolerance(coords:Point[]):number {
  let magnitude=0,span=0;
  for(const k of [0,1]){let lo=Infinity,hi=-Infinity;for(const p of coords){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);magnitude=Math.max(magnitude,Math.abs(p[k]));}span=Math.max(span,hi-lo);}
  if(!finite(span)||span<=0)fail('切口图的坐标跨度退化或溢出。');
  const ulp=magnitude?2**(Math.floor(Math.log2(magnitude))-52):Number.MIN_VALUE;
  return Math.max(span*2e-8,128*ulp,1e-12);
}
function incidence(es:[number,number][],fs:number[][],holes:number[][][]=[]):number[][] {
  const lookup=new Map(es.map(([a,b],i)=>[edgeKey(a,b),i])),owners=es.map(()=>[] as number[]);
  fs.forEach((face,f)=>[face,...(holes[f]??[])].forEach(ring=>ring.forEach((a,k)=>{const e=lookup.get(edgeKey(a,ring[(k+1)%ring.length]));if(e===undefined)fail('原面引用不存在的边。');owners[e].push(f);})));
  if(owners.some(o=>o.length<1||o.length>2))fail('切口图有未被面使用的边或非流形边。');
  return owners;
}
/** Sweep candidate intersections; the bound is explicit, never a geometry certificate. */
function planar(coords:Point[],es:[number,number][],tol:number):void {
  const boxes=es.map(([a,b],i)=>({i,minX:Math.min(coords[a][0],coords[b][0]),maxX:Math.max(coords[a][0],coords[b][0]),minY:Math.min(coords[a][1],coords[b][1]),maxY:Math.max(coords[a][1],coords[b][1])})).sort((a,b)=>a.minX-b.minX||a.i-b.i);
  const on=(p:Point,a:Point,b:Point)=>Math.abs(cross(a,b,p))<=tol*distance(a,b)&&p[0]>=Math.min(a[0],b[0])-tol&&p[0]<=Math.max(a[0],b[0])+tol&&p[1]>=Math.min(a[1],b[1])-tol&&p[1]<=Math.max(a[1],b[1])+tol;
  let checked=0;const active:typeof boxes=[];
  for(const box of boxes){
    const [a,b]=es[box.i];if(distance(coords[a],coords[b])<=tol)fail('切口图包含零长边或数值不可分辨的边。');
    for(let j=active.length-1;j>=0;j--)if(active[j].maxX<box.minX-tol)active.splice(j,1);
    for(const other of active){
      if(other.maxY<box.minY-tol||other.minY>box.maxY+tol)continue;
      if(++checked>MAX_PAIR_CHECKS)fail('切口图的独立相交验证超过有限预算，未签发几何验证。');
      const [c,d]=es[other.i],shared=[a,b].filter(v=>v===c||v===d);
      if(shared.length){
        const v=shared[0],u=a===v?b:a,w=c===v?d:c;
        if(on(coords[u],coords[v],coords[w])||on(coords[w],coords[v],coords[u]))fail('切口图含重叠共线边。');
        continue;
      }
      const p=coords[a],q=coords[b],r=coords[c],s=coords[d];
      if(on(p,r,s)||on(q,r,s)||on(r,p,q)||on(s,p,q)||cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)fail('原切口图包含未拆分的交叉或点边交点。');
    }
    active.push(box);
  }
}
/** Original In[1278] consumes Edges followed by their reversals. */
function planeCycles(coords:Point[],es:[number,number][]):{inner:number[][];outer:number[][]} {
  const around=coords.map(()=>[] as number[]),seen=new Set<string>(),inner:number[][]=[],outer:number[][]=[];
  es.forEach(([a,b])=>{around[a].push(b);around[b].push(a);});
  around.forEach((ns,v)=>ns.sort((a,b)=>Math.atan2(coords[a][1]-coords[v][1],coords[a][0]-coords[v][0])-Math.atan2(coords[b][1]-coords[v][1],coords[b][0]-coords[v][0])));
  for(const first of [...es,...es.map(([a,b])=>[b,a] as [number,number])]){
    if(seen.has(`${first[0]},${first[1]}`))continue;
    const face:number[]=[];let [a,b]=first;
    while(!seen.has(`${a},${b}`)){
      seen.add(`${a},${b}`);face.push(a);const ns=around[b],where=ns.indexOf(a);
      if(where<0||face.length>es.length*2)fail('切口图半边遍历不闭合。');
      [a,b]=[b,ns[(where+ns.length-1)%ns.length]];
    }
    if(a!==first[0]||b!==first[1]||face.length<3||new Set(face).size!==face.length)fail('原切口图含桥边、重复绕行或悬挂边。');
    const signed=area(coords,face);if(!finite(signed)||signed===0)fail('切口图含退化面。');
    (signed>0?inner:outer).push(face);
  }
  return {inner,outer};
}
function canonicalCycle(face:number[]):string {
  const start=face.indexOf(Math.min(...face));return [...face.slice(start),...face.slice(0,start)].join(',');
}
function validateGraph(value:unknown,holeCycles:number[][]=[],cornerSource=new Map<number,number>()):{graph:FoldGraph;owners:number[][];tol:number} {
  const r=record(value);if(!r)fail('缺少原折痕图。');
  const cp=points(r.vertices_coords),es=edges(r.edges_vertices,cp.length),fs=faces(r.faces_vertices,cp.length),kinds=r.edges_assignment,angles=r.edges_foldAngle;
  if(!Array.isArray(kinds)||kinds.length!==es.length||kinds.some(k=>!['B','M','V','F','U'].includes(k))||!Array.isArray(angles)||angles.length!==es.length||angles.some((a,i)=>a!==(kinds[i]==='M'?-180:kinds[i]==='V'?180:null)))fail('原折痕赋型或折角与构造合同不一致。');
  const holes=faceHoles(r.faces_holes,fs,cp.length),owners=incidence(es,fs,holes),tol=tolerance(cp);
  if(owners.some((o,i)=>kinds[i]!=='B'&&o.length!==2))fail('非边界折痕缺少双面关联。');
  planar(cp,es,tol);
  for(const [f,rings] of holes.entries())for(const [i,ring] of rings.entries()){
   if(area(cp,ring)*area(cp,fs[f])>=0||!ring.every(v=>inside(cp[v],fs[f].map(v=>cp[v])))||rings.slice(i+1).some(other=>inside(cp[ring[0]],other.map(v=>cp[v]))||inside(cp[other[0]],ring.map(v=>cp[v]))))fail('原CP的孔环方向或实际材料包含关系无效。');
  }
  const cycles=planeCycles(cp,es),actual=fs.map(f=>canonicalCycle(area(cp,f)>0?f:[...f].reverse())).sort();
  const key=(face:number[])=>[canonicalCycle(face),canonicalCycle([...face].reverse())].sort()[0],holeKeys=holeCycles.map(key),matched:string[]=[];
  const expected=cycles.inner.filter(face=>{
   if(!holeKeys.length)return true;
   const collapsed:number[]=[];for(const v of face){const source=cornerSource.get(v);if(source===undefined)fail('孔洞构造缺少原角点来源。');if(collapsed.at(-1)!==source)collapsed.push(source);}
   if(collapsed.length>1&&collapsed[0]===collapsed.at(-1))collapsed.pop();
   const stamp=key(collapsed);if(holeKeys.includes(stamp)){matched.push(stamp);return false;}return true;
  }).map(canonicalCycle).sort();
  if(!exact(matched.sort(),[...holeKeys].sort()))fail('实际CP未唯一恢复母图孔洞，不能用缺失面替代孔洞。');
  const componentCount=wovenGraphComponents({vertices:cp,edges:es}).length;
  if(cycles.outer.length!==componentCount||cp.length-es.length+fs.length!==componentCount-holeCycles.length||!exact(actual,expected))fail('原折痕面列表与实际平面拓扑不一致。');
  return {graph:{vertices_coords:cp,edges_vertices:es,faces_vertices:fs,edges_assignment:[...kinds],edges_foldAngle:[...angles],...(holes.some(rs=>rs.length)?{faces_holes:holes}:{})},owners,tol};
}
function winding(coords:Point[],face:number[]):number {
  const directions=face.map((a,k)=>{const b=face[(k+1)%face.length];return Math.atan2(coords[b][1]-coords[a][1],coords[b][0]-coords[a][0]);});
  let sum=0;for(let k=0;k<face.length;k++){let d=directions[k]-directions[(k+face.length-1)%face.length];d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;sum+=d;}
  const w=Math.round(sum/(2*Math.PI));if(Math.abs(w)!==1)fail('原平折面绕数退化或自交。');return w;
}
function isometry(cp:Point[],ff:Point[],fs:number[][],tol:number,holes:number[][][]=[]):void {
  if(ff.length!==cp.length)fail('原平折顶点数与 CP 不一致。');
  for(const [f,face] of fs.entries()){
    const a=face[0],b=face[1],lc=distance(cp[a],cp[b]),lf=distance(ff[a],ff[b]),ac=area(cp,face),af=area(ff,face);
    if(lc<=tol||lf<=tol||Math.abs(ac)<=tol*tol||Math.abs(af)<=tol*tol||!finite(ac)||!finite(af))fail('原 CP 或平折面退化。');
    const ex=(ff[b][0]-ff[a][0])/lf,ey=(ff[b][1]-ff[a][1])/lf,ux=(cp[b][0]-cp[a][0])/lc,uy=(cp[b][1]-cp[a][1])/lc,sign=Math.sign(ac)*Math.sign(af);
    for(const v of [...face,...(holes[f]??[]).flat()]){const dx=ff[v][0]-ff[a][0],dy=ff[v][1]-ff[a][1],along=dx*ex+dy*ey,normal=(-dx*ey+dy*ex)*sign;
      if(distance(cp[v],[cp[a][0]+along*ux-normal*uy,cp[a][1]+along*uy+normal*ux])>tol)fail('原平折坐标未保持逐面的完整等距关系。');}
  }
}
function restoration(cp:Point[],ff:Point[],es:[number,number][],fs:number[][],owners:number[][],ws:number[],start:number,tol:number,extraRoots:number[]=[],holes:number[][][]=[]):void {
  type Transform=[number,number,number,number,number,number];
  const transforms:(Transform|undefined)[]=fs.map(()=>undefined),queue=[start,...extraRoots];queue.forEach(f=>transforms[f]=[1,0,0,1,0,0]);
  const links=fs.map(()=>[] as {face:number;edge:number}[]);owners.forEach((o,e)=>{if(o.length===2){links[o[0]].push({face:o[1],edge:e});links[o[1]].push({face:o[0],edge:e});}});
  const apply=(t:Transform,p:Point):Point=>[t[0]*p[0]+t[1]*p[1]+t[4],t[2]*p[0]+t[3]*p[1]+t[5]];
  for(let cursor=0;cursor<queue.length;cursor++){
    const f=queue[cursor],t=transforms[f]!;
    for(const v of [...fs[f],...(holes[f]??[]).flat()])if(distance(apply(t,ff[v]),cp[v])>tol)fail('原平折按绕数回展后与 CP 或固定面不一致。');
    for(const link of links[f]){
      const other=link.face;if(transforms[other])continue;
      if(ws[f]===ws[other])transforms[other]=[...t];
      else{
        const [a,b]=es[link.edge],p=apply(t,ff[a]),q=apply(t,ff[b]),length=distance(p,q);if(length<=tol)fail('回展反射轴退化。');
        const dx=(q[0]-p[0])/length,dy=(q[1]-p[1])/length,r=2*dx*dx-1,s=2*dx*dy,z=2*dy*dy-1;
        transforms[other]=[r*t[0]+s*t[2],r*t[1]+s*t[3],s*t[0]+z*t[2],s*t[1]+z*t[3],r*t[4]+s*t[5]+p[0]-r*p[0]-s*p[1],s*t[4]+z*t[5]+p[1]-s*p[0]-z*p[1]];
      }
      queue.push(other);
    }
  }
  if(queue.length!==fs.length)fail('原折痕图的面关联不连通，无法绑定固定面回展。');
}

/**
 * Structural splitting only. This routine is not an original-source certificate;
 * use inspectWovenCutTopology before displaying an Origamica folded candidate.
 * A B edge with two owners is duplicated, never converted into a crease.
 */
export function splitWovenCutGraph(graph:FoldGraph,folded:Point[]):WovenCutSplit {
  const cp=points(graph.vertices_coords),es=edges(graph.edges_vertices,cp.length),fs=faces(graph.faces_vertices,cp.length),holes=faceHoles(graph.faces_holes,fs,cp.length),owners=incidence(es,fs,holes),kinds=graph.edges_assignment;
  if(kinds.length!==es.length||graph.edges_foldAngle.length!==es.length||kinds.some(k=>!['B','M','V','F','U'].includes(k))||owners.some((o,i)=>kinds[i]!=='B'&&o.length!==2))fail('切开前的边赋型或面关联无效。');
  const ff=points(folded);isometry(cp,ff,fs,Math.max(tolerance(cp),tolerance(ff)),holes);
  const rings=fs.map((face,f)=>[area(cp,face)>0?[...face]:[...face].reverse(),...holes[f].map(r=>area(cp,r)<0?[...r]:[...r].reverse())]),ccw=rings.map(rs=>rs.flat()),starts:number[]=[];let count=0;
  ccw.forEach(f=>{starts.push(count);count+=f.length;});
  const parent=Array.from({length:count},(_,i)=>i),find=(v:number):number=>{let root=v;while(parent[root]!==root)root=parent[root];while(parent[v]!==v){const next=parent[v];parent[v]=root;v=next;}return root;},join=(a:number,b:number)=>{const x=find(a),y=find(b);if(x!==y)parent[Math.max(x,y)]=Math.min(x,y);};
  const corner=(f:number,v:number)=>{const k=ccw[f].indexOf(v);if(k<0)fail('切口面角与边不一致。');return starts[f]+k;};
  owners.forEach((o,e)=>{if(o.length===2&&kinds[e]!=='B')for(const v of es[e])join(corner(o[0],v),corner(o[1],v));});
  const rootIDs=new Map<number,number>(),vertexSource:number[]=[],allCorners=ccw.map((face,f)=>face.map((v,k)=>{const root=find(starts[f]+k);let id=rootIDs.get(root);if(id===undefined){id=vertexSource.length;rootIDs.set(root,id);vertexSource.push(v);}else if(vertexSource[id]!==v)fail('切口拆顶点错误合并了不同原顶点。');return id;}));
  const ringCorners=rings.map((rs,f)=>{let at=0;return rs.map(r=>{const result=allCorners[f].slice(at,at+r.length);at+=r.length;return result;});}),faceCorners=ringCorners.map(rs=>rs[0]),holeCorners=ringCorners.map(rs=>rs.slice(1)),edgeRings=rings.map(rs=>rs.map(r=>Array<number>(r.length).fill(-1))),faceEdges=edgeRings.map(rs=>rs[0]);
  const splitEdges:[number,number][]=[],edgeSource:number[]=[],splitKinds:string[]=[],splitAngles:(number|null)[]=[],splitOwners:number[][]=[];
  const edgeForFace=(e:number,f:number,id:number)=>{for(const [r,face] of rings[f].entries()){const at=face.findIndex((v,k)=>edgeKey(v,face[(k+1)%face.length])===edgeKey(...es[e]));if(at>=0){edgeRings[f][r][at]=id;return;}}fail('切开面的边映射丢失。');};
  owners.forEach((o,e)=>{const groups=kinds[e]==='B'?o.map(f=>[f]):[o];for(const group of groups){const f=group[0],[a,b]=es[e],sa=allCorners[f][ccw[f].indexOf(a)],sb=allCorners[f][ccw[f].indexOf(b)],id=splitEdges.length;for(const other of group)if(allCorners[other][ccw[other].indexOf(a)]!==sa||allCorners[other][ccw[other].indexOf(b)]!==sb)fail('非切口共享边未焊接相同的面角。');splitEdges.push([sa,sb]);edgeSource.push(e);splitKinds.push(kinds[e]);splitAngles.push(graph.edges_foldAngle[e]);splitOwners.push([...group]);group.forEach(face=>edgeForFace(e,face,id));}});
  if(edgeRings.some(rs=>rs.some(r=>r.includes(-1))))fail('切开后的内外环面边列表不完整。');
  const adjacent=fs.map(()=>[] as number[]);splitOwners.forEach(o=>{if(o.length===2){adjacent[o[0]].push(o[1]);adjacent[o[1]].push(o[0]);}});
  const visited=new Set<number>(),components:WovenCutComponent[]=[];
  for(let first=0;first<fs.length;first++){
    if(visited.has(first))continue;const componentFaces=[first];visited.add(first);for(let k=0;k<componentFaces.length;k++)for(const other of adjacent[componentFaces[k]])if(!visited.has(other)){visited.add(other);componentFaces.push(other);}componentFaces.sort((a,b)=>a-b);
    const componentEdges=[...new Set(componentFaces.flatMap(f=>edgeRings[f].flat()))].sort((a,b)=>a-b),vertices=[...new Set(componentFaces.flatMap(f=>allCorners[f]))].sort((a,b)=>a-b),boundaryLoops:number[][]=[],walked=new Set<string>();
    for(const f of componentFaces)for(const [r,edges] of edgeRings[f].entries())for(let k=0;k<edges.length;k++){
      if(splitOwners[edges[k]].length!==1||walked.has(`${f},${r},${k}`))continue;const start=`${f},${r},${k}`,loop:number[]=[];let currentFace=f,currentRing=r,currentCorner=k;
      while(!walked.has(`${currentFace},${currentRing},${currentCorner}`)){
        walked.add(`${currentFace},${currentRing},${currentCorner}`);loop.push(ringCorners[currentFace][currentRing][currentCorner]);let next=(currentCorner+1)%ringCorners[currentFace][currentRing].length,turns=0;
        while(splitOwners[edgeRings[currentFace][currentRing][next]].length===2){if(++turns>count)fail('切口顶点的面扇不闭合。');const edge=edgeRings[currentFace][currentRing][next],other=splitOwners[edge].find(face=>face!==currentFace)!,incomingRing=edgeRings[other].findIndex(row=>row.includes(edge));if(incomingRing<0)fail('切口的边面关联断裂。');const incoming=edgeRings[other][incomingRing].indexOf(edge);currentFace=other;currentRing=incomingRing;next=(incoming+1)%ringCorners[other][incomingRing].length;}
        currentCorner=next;
      }
      if(`${currentFace},${currentRing},${currentCorner}`!==start||loop.length<2)fail('切口边界绕行不闭合或退化。');boundaryLoops.push(loop);
    }
    const ringHoleCount=componentFaces.reduce((n,f)=>n+holeCorners[f].length,0);if(!boundaryLoops.length||vertices.length-componentEdges.length+componentFaces.length-ringHoleCount!==2-boundaryLoops.length)fail('切开后的部件不满足平面纸面的边界／欧拉特征。');components.push({faces:componentFaces,vertices,edges:componentEdges,boundaryLoops});
  }
  const splitGraph:FoldGraph={vertices_coords:vertexSource.map(v=>[...cp[v]]),edges_vertices:splitEdges,edges_assignment:splitKinds,edges_foldAngle:splitAngles,faces_vertices:faceCorners.map(f=>[...f]),faces_edges:faceEdges,edges_faces:splitOwners,faces_faces:faceEdges.map((list,f)=>list.map(e=>splitOwners[e].find(other=>other!==f) as number)),...(holeCorners.some(rs=>rs.length)?{faces_holes:holeCorners,faces_holeEdges:edgeRings.map(rs=>rs.slice(1)),faces_holeFaces:edgeRings.map((rs,f)=>rs.slice(1).map(row=>row.map(e=>splitOwners[e].find(other=>other!==f)??null)))}:{})};
  return {splitGraph,splitFolded:vertexSource.map(v=>[...ff[v]]),vertexSource,edgeSource,faceCorners,components};
}

/** Implemented below independently of backend trust flags. */
export function hasWovenInternalB(fold:unknown):boolean {
  const r=record(fold),edges=r?.edges_vertices,faces=r?.faces_vertices,kinds=r?.edges_assignment;
  if(!Array.isArray(edges)||!Array.isArray(faces)||!Array.isArray(kinds))return false;
  const incidence=new Map<string,number>();
  for(const face of faces){
    if(!Array.isArray(face)||face.length<3||face.some(v=>!Number.isInteger(v)||v<0))continue;
    for(let k=0;k<face.length;k++){const key=edgeKey(face[k],face[(k+1)%face.length]);incidence.set(key,(incidence.get(key)??0)+1);}
  }
  return edges.some((e,i)=>kinds[i]==='B'&&Array.isArray(e)&&e.length===2&&incidence.get(edgeKey(e[0],e[1]))===2);
}

function record(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function edgeKey(a:number,b:number):string{return `${Math.min(a,b)},${Math.max(a,b)}`;}

export function inspectWovenCutTopology(response:unknown,params?:TessParams):WovenCutInspection {
  try{return inspect(response,params);}catch(e){return {ok:false,reason:e instanceof Error?e.message:String(e)};}
}

function normalizedParams(params:WovenParams):unknown {
  return {...params,periodicity:params.periodicity??[],periodicityEnabled:params.periodicityEnabled===true||!!params.periodicity?.length};
}
function inspect(response:unknown,supplied?:TessParams):WovenCutInspection {
  const result=record(response),source=record(result?.source),stats=record(result?.stats),raw=record(stats?.parameters);
  if(!result||!source||!stats||!raw)fail('缺少可绑定的原构造参数或来源。');
  const parsed=readWovenParams(raw);
  if(!parsed||parsed.family!=='woven-lines'||parsed.mode!=='graph')fail('本入口只独立验证原版有限母图编织的 CP 与平折来源。');
  const p=parsed;
  const old=p.wovenVersion==='original-old'?readWovenOldState(source,p):null;
  if(p.wovenVersion==='original-old'&&!old||p.wovenVersion===undefined&&(source.oldWoven!==undefined||source.oldMeritReport!==undefined))fail('原版本 d/dd 身份、原长度变量或原目标报告不一致。');
  if(supplied!==undefined){const input=readWovenParams(supplied as unknown as Record<string,unknown>);if(!input||!exact(normalizedParams(input),normalizedParams(p)))fail('平折响应与当前构造参数不一致。');}
  if(!exact(source.graph,p.graph)||source.defaultInset!==p.width/2||source.edgeOwnerMeaning!=='boundary=-1;finite-interior=0')fail('原母图、默认内缩或边来源合同不一致。');
  if(p.graphSource){
    const original=readWovenGraphSource(source.graphSource);
    if(!original||!exact(original,p.graphSource))fail('原 Intersectify 来源与当前参数不一致。');
    const recomputed=recomputeWovenGraphSource(original),tol=tolerance(p.graph.vertices);
    if(!exact(recomputed.graph.edges,p.graph.edges)||recomputed.graph.vertices.length!==p.graph.vertices.length||recomputed.graph.vertices.some((q,i)=>distance(q,p.graph.vertices[i])>tol)||!exact(source.originalEdgeForSegment,recomputed.originalEdgeForSegment)||source.invertFoldType!==p.graphSource.invertFoldType)fail('原 Intersectify 点边来源无法独立回读。');
  }else if(source.graphSource!==undefined||source.invertFoldType!==undefined||source.originalEdgeForSegment!==undefined)fail('响应附带了未请求的 Intersectify 来源。');
  const mother=readWovenGraph(source.graph);if(!mother)fail('有限母图格式或容量无效。');
  const originalPoints=mother.vertices,originalEdges=mother.edges,mtol=tolerance(originalPoints);
  if(mother.curveHoles){
   const stamp=record(source.wovenMotherCurveHoles),components=wovenGraphComponents(mother),expectedErrors=mother.curveHoles.map(h=>wovenEllipseChordError(h.curve,h.segments));
   if(!stamp||!exact(Object.keys(stamp).sort(),['analyticBoundary','chordErrors','cpBoundary','records','sampledVertexIds','schema'])||stamp.schema!=='zhezhi-woven-curve-holes-v1'||stamp.analyticBoundary!==true||stamp.cpBoundary!=='explicit-chords'||!exact(stamp.records,mother.curveHoles)||!exact(stamp.sampledVertexIds,mother.curveHoles.map(h=>components[h.component]))||!Array.isArray(stamp.chordErrors)||stamp.chordErrors.length!==expectedErrors.length||stamp.chordErrors.some((x,i)=>!finite(x)||Math.abs(x-expectedErrors[i])>32*Number.EPSILON*Math.max(1,expectedErrors[i])))fail('解析曲线孔参数、整段弦误差或显式采样点来源不一致。');
  }else if(source.wovenMotherCurveHoles!==undefined)fail('未请求解析曲线孔，却附带了解析来源。');
  planar(originalPoints,originalEdges,mtol);
  const originalCycles=planeCycles(originalPoints,originalEdges),regions=mother.ringHoles?wovenMotherRegions(mother):null,holeIds=regions?.holeIds??mother.holeFaces??[],originalFaces=regions?.faces??originalCycles.inner.filter((_,f)=>!holeIds.includes(f)),originalHoles=regions?.holes??originalFaces.map(()=>[] as number[][]),originalRings=originalFaces.map((face,f)=>[face,...originalHoles[f]]);
  if(regions){if(!exact(source.sourceFaceHoles,originalHoles)||!exact(source.wovenMotherRingHoles,{schema:'zhezhi-woven-mother-rings-v1',bindings:mother.ringHoles,voidFaceIds:regions.voidIds,physicalComponents:regions.physicalComponents}))fail('多环母面声明、原环归属或材料部件来源不一致。');}else if(source.sourceFaceHoles!==undefined||source.wovenMotherRingHoles!==undefined)fail('未请求多环母面，却附带了多环来源。');
  if(holeIds.length){
   if(holeIds.some(f=>f>=originalCycles.inner.length))fail('母图孔洞原面编号越界。');
   const holeCycles=holeIds.map(f=>originalCycles.inner[f]),border=new Set(originalCycles.outer.flat());
   if(!regions&&(holeCycles.some(face=>face.some(v=>border.has(v)))||holeCycles.some((face,i)=>holeCycles.slice(i+1).some(other=>other.some(v=>face.includes(v))))))fail('母图孔洞接触外边界或其他孔洞。');
   if(!exact(source.wovenMotherHoles,{schema:'zhezhi-woven-mother-holes-v1',faceIds:holeIds,cycles:holeCycles,retainedFaceIds:regions?.retained??originalCycles.inner.flatMap((_,f)=>holeIds.includes(f)?[]:[f])}))fail('母图孔洞及保留原面编号来源不一致。');
  }else if(source.wovenMotherHoles!==undefined)fail('没有请求母图孔洞，却附带了孔洞来源。');
  const rawMotherComponents=wovenGraphComponents(mother),motherComponents=regions?.physicalComponents??rawMotherComponents,componentFaces=regions?.physicalFaceIds??motherComponents.map(comp=>originalFaces.flatMap((face,f)=>comp.includes(face[0])?[f]:[]));
  if(old&&motherComponents.length!==1)fail('原版本未声明独立材料回展根，不能冒用新版独立母图。');
  if(originalCycles.outer.length!==rawMotherComponents.length||componentFaces.some(fs=>!fs.length)||!originalFaces.length||originalPoints.length-originalEdges.length+originalFaces.length-originalHoles.reduce((s,h)=>s+h.length,0)!==motherComponents.length-holeIds.length||!exact(source.sourceFaceCycles,originalFaces))fail('原母图的面编号、部件边界或半边循环不一致。');
  if(!regions&&!mother.nestedSheets)for(let i=0;i<originalCycles.outer.length;i++)for(const ring of originalCycles.outer.slice(i+1))if(inside(originalPoints[originalCycles.outer[i][0]],ring.map(v=>originalPoints[v]))||inside(originalPoints[ring[0]],originalCycles.outer[i].map(v=>originalPoints[v])))fail('独立母图边界相互包含，不能自动推断孔洞或纸片。');
  const originalOwners=incidence(originalEdges,originalFaces,originalHoles),expectedLines=originalOwners.map(o=>o.length===1?-1:0),edgeLines=source.edgeLines;
  if(!exact(edgeLines,expectedLines))fail('原母图的全局边界边来源不一致。');
  const motherResult=record(result.mother);
  if(!motherResult||!exact(motherResult.vertices_coords,originalPoints)||!exact(motherResult.edges_vertices,originalEdges)||!exact(motherResult.faces_vertices,originalFaces.map(f=>[...f].reverse()))||!exact(motherResult.edges_assignment,expectedLines.map(line=>line<0?'B':'U'))||regions&&!exact(motherResult.faces_holes,originalHoles.map(rs=>rs.map(r=>[...r].reverse()))))fail('当前母图与原构造来源不一致。');
  const periodic=p.periodicityEnabled===true||!!p.periodicity?.length,border=p.borderInset==='auto'&&!periodic?p.width/2:0;
  if(source.borderInset!==border||source.stationaryFace!==p.stationaryFace||'periodicityEnabled' in p&&source.periodicityEnabled!==periodic)fail('边界内缩、周期或原固定面与参数不一致。');
  let requested:number[]|undefined,effective:number[]|undefined;
  if(p.fullEdgeInsets){
    if(!exact(source.fullEdgeInsets,p.fullEdgeInsets)||p.fullEdgeInsets.edgeCount!==originalEdges.length)fail('完整逐边内缩的原边数或来源不一致。');
    requested=p.fullEdgeInsets.entries.map((entry,i)=>{
      const [a,b]=originalEdges[i],q=originalPoints[a],r=originalPoints[b];
      if(entry.edge!==i||entry.line!==expectedLines[i]||Math.min(Math.max(distance(entry.from,q),distance(entry.to,r)),Math.max(distance(entry.from,r),distance(entry.to,q)))>mtol)fail('完整逐边内缩的端点或原边索引已变化。');
      return entry.inset;
    });
    effective=requested.map((h,i)=>expectedLines[i]<0&&(p.borderInset==='none'||periodic)?0:h);
    if(!exact(source.requestedEdgeInsets,requested)||!exact(source.effectiveEdgeInsets,effective))fail('请求／有效逐边内缩与实际来源不一致。');
  }else if(source.fullEdgeInsets!==undefined||source.requestedEdgeInsets!==undefined||source.effectiveEdgeInsets!==undefined)fail('响应包含未请求的逐边内缩来源。');
  const widths=effective?effective.map(h=>2*h):expectedLines.map(line=>line<0?0:p.width);
  if(!exact(source.edgeWidths,widths))fail('原母图逐边条带宽度与构造参数不一致。');
  const hs=effective??expectedLines.map((line,i)=>line<0?border:widths[i]/2),lookup=new Map(originalEdges.map(([a,b],i)=>[edgeKey(a,b),i])),boundary=new Set(originalEdges.flatMap((edge,i)=>expectedLines[i]<0?edge:[]));
  const neighbors=originalFaces.map(()=>[] as number[]);originalOwners.forEach(o=>{if(o.length===2){neighbors[o[0]].push(o[1]);neighbors[o[1]].push(o[0]);}});
  const colors:(number|undefined)[]=originalFaces.map(()=>undefined);
  for(const first of old?[p.stationaryFace,...originalFaces.flatMap((_,f)=>f===p.stationaryFace?[]:[f])]:originalFaces.map((_,f)=>f)){
   if(colors[first]!==undefined)continue;const queue=[first];colors[first]=p.parity;
   for(let k=0;k<queue.length;k++)for(const other of neighbors[queue[k]]){if(colors[other]===undefined){colors[other]=-colors[queue[k]]!;queue.push(other);}else if(colors[other]===colors[queue[k]])fail('原母图面邻接不支持编织二着色。');}
  }
  const factors=source.pleatFactors;
  if(!old&&(!Array.isArray(factors)||factors.some(x=>!finite(x))))fail('缺少有限的原褶宽求解值。');
  let factorIndex=0,dIndex=0,ddIndex=0;const expectedFF:Point[]=[],bases:Point[]=[],negativeInitial:Point[]=[],corners=new Map<string,number>(),anchors=new Map<string,number>();
  const getCorner=(f:number,v:number)=>{const id=corners.get(`${f},${v}`);if(id===undefined)fail('原构造角点丢失。');return id;};
  const getAnchor=(f:number,v:number)=>{const id=anchors.get(`${f},${v}`);if(id===undefined)fail('原边界构造角点丢失。');return id;};
  for(let f=0;f<originalFaces.length;f++){
   for(const face of originalRings[f]){
    const origin=originalPoints[face[0]],lines=face.map((a,k)=>{
      const b=face[(k+1)%face.length],q=originalPoints[a],r=originalPoints[b],length=distance(q,r),nx=-(r[1]-q[1])/length,ny=(r[0]-q[0])/length,e=lookup.get(edgeKey(a,b))!;
      return [nx,ny,nx*(q[0]-origin[0])+ny*(q[1]-origin[1])+hs[e]] as [number,number,number];
    });
    for(let k=0;k<face.length;k++){
      const v=face[k],prev=face[(k+face.length-1)%face.length],next=face[(k+1)%face.length],[a,b,c]=lines[(k+face.length-1)%face.length],[d,e,g]=lines[k],det=a*e-b*d;
      if(Math.abs(det)<1e-10)fail('原内缩边的交角退化。');
      const q:Point=[origin[0]+(c*e-b*g)/det,origin[1]+(a*g-c*d)/det],lp=distance(originalPoints[v],originalPoints[prev]),ln=distance(originalPoints[next],originalPoints[v]),ep:Point=[(originalPoints[v][0]-originalPoints[prev][0])/lp,(originalPoints[v][1]-originalPoints[prev][1])/lp],en:Point=[(originalPoints[next][0]-originalPoints[v][0])/ln,(originalPoints[next][1]-originalPoints[v][1])/ln],ie=lookup.get(edgeKey(prev,v))!,oe=lookup.get(edgeKey(v,next))!,bp=old?boundary.has(prev)&&boundary.has(v):expectedLines[ie]<0,bo=old?boundary.has(v)&&boundary.has(next):expectedLines[oe]<0,sine=Math.abs(ep[0]*en[1]-ep[1]*en[0]);
      if(sine<1e-7||q.some(n=>!finite(n)))fail('原构造交角过小或内缩点非有限。');
      corners.set(`${f},${v}`,expectedFF.length);
      const cpq:Point=old?[originalPoints[v][0]+.45*(q[0]-originalPoints[v][0]),originalPoints[v][1]+.45*(q[1]-originalPoints[v][1])]:q;
      if(bp&&bo){expectedFF.push(q);bases.push(q);negativeInitial.push(cpq);continue;}
      const direction:Point=bp?[ep[0]*widths[oe]/(2*sine),ep[1]*widths[oe]/(2*sine)]:bo?[-en[0]*widths[ie]/(2*sine),-en[1]*widths[ie]/(2*sine)]:colors[f]!>0?[-en[0]*widths[ie]/(2*sine),-en[1]*widths[ie]/(2*sine)]:[ep[0]*widths[oe]/(2*sine),ep[1]*widths[oe]/(2*sine)];
      const diverging=bp&&colors[f]===1||bo&&colors[f]===-1,
       factor=old?(diverging?old.rawDD[ddIndex++]:old.rawD[dIndex++]):(factors as number[])[factorIndex++],minimum=old?p.width/2*(diverging?p.minBorderPleat:p.minPleat):bp||bo?p.minBorderPleat:p.minPleat;
      if(!finite(factor)||factor<minimum-1e-9)fail('原褶宽求解值违反请求的最小褶宽。');
      const actualDirection:Point=old?bp?[ep[0]/sine,ep[1]/sine]:bo?[-en[0]/sine,-en[1]/sine]:colors[f]!>0?[-en[0]/sine,-en[1]/sine]:[ep[0]/sine,ep[1]/sine]:direction;
      expectedFF.push([q[0]+factor*actualDirection[0],q[1]+factor*actualDirection[1]]);bases.push(q);
      const probe=Array.isArray(source.topologyProbe)?source.topologyProbe[bp||bo?1:0]:.1;
      negativeInitial.push(old?[cpq[0]-(diverging?.05:.45)*p.width/2*actualDirection[0],cpq[1]-(diverging?.05:.45)*p.width/2*actualDirection[1]]:[q[0]-Number(probe)*direction[0],q[1]-Number(probe)*direction[1]]);
      if(bp||bo){anchors.set(`${f},${v}`,expectedFF.length);expectedFF.push(q);bases.push(q);negativeInitial.push(cpq);}
    }
  }
  }
  if(old?dIndex!==old.rawD.length||ddIndex!==old.rawDD.length:factorIndex!==(factors as number[]).length)fail('原褶宽解与仿射顶点变量数不一致。');
  if(old&&(old.topologyInitialCP.length!==negativeInitial.length||old.topologyInitialCP.some((q,i)=>distance(q,negativeInitial[i])>mtol)))fail('原版本 h/d/dd 固定负初值图不满足原字面替换。');
  const ff=points(source.foldedForm),ftol=Math.max(mtol,tolerance(ff));
  if(ff.length!==expectedFF.length||ff.some((q,i)=>distance(q,expectedFF[i])>ftol))fail('原平折坐标不满足母图内缩与 In[3428] 仿射角点构造。');
  const builtEdges=new Map<string,{edge:[number,number];kind:string}>();
  const add=(a:number,b:number,kind:string)=>{if(a===b){if(old)fail('原版本字面构造产生退化边。');return;}const key=edgeKey(a,b),previous=builtEdges.get(key);if(old&&previous)fail('原版本字面构造产生重复原边，未静默去重。');if(previous&&previous.kind!==kind&&previous.kind!=='B'&&kind!=='B')fail('原编织赋型存在矛盾。');if(!previous)builtEdges.set(key,{edge:old?[a,b]:[Math.min(a,b),Math.max(a,b)],kind});else if(kind==='B')previous.kind=kind;};
  originalRings.forEach((rs,f)=>rs.forEach(face=>face.forEach((a,k)=>{const b=face[(k+1)%face.length];add(getCorner(f,a),getCorner(f,b),boundary.has(a)&&boundary.has(b)?'B':'M');})));
  const sharedOrder=old?originalEdges.map(([a,b])=>edgeKey(a,b)):[...new Set(originalRings.flatMap(rs=>rs.flatMap(face=>face.map((a,k)=>edgeKey(a,face[(k+1)%face.length])))))];
  sharedOrder.forEach(key=>{
    const e=lookup.get(key)!,[u,v]=originalEdges[e];
    const owners=originalOwners[e];if(owners.length!==2)return;
    // The original dictionary key is sorted before selecting the left face.
    const a=Math.min(u,v),b=Math.max(u,v),left=owners.find(f=>originalRings[f].some(face=>face.some((x,k)=>x===a&&face[(k+1)%face.length]===b)));
    if(left===undefined)fail('原母图的共享边缺少相反方向面。');
    const right=owners.find(f=>f!==left)!;
    for(const [vertex,other,kind] of [[a,b,colors[left]!>0?'M':'V'],[b,a,colors[left]!>0?'V':'M']] as [number,number,string][]){
      if(!boundary.has(vertex)){
        if(kind==='M'){
          if(old){const ends=[right,left].map(f=>{const face=originalFaces[f],k=face.indexOf(vertex),n=[face[(k+face.length-1)%face.length],face[(k+1)%face.length]].find(x=>x!==other)!;return anchors.get(`${f},${n}`)??getCorner(f,n);});add(ends[0],ends[1],'V');add(getCorner(right,vertex),getCorner(left,vertex),'M');continue;}
          add(getCorner(owners[0],vertex),getCorner(owners[1],vertex),'M');
          const ends=owners.map(f=>{const face=originalRings[f].find(r=>r.includes(vertex))!,k=face.indexOf(vertex),n=[face[(k+face.length-1)%face.length],face[(k+1)%face.length]].find(x=>x!==other)!;return anchors.get(`${f},${n}`)??getCorner(f,n);});add(ends[0],ends[1],'V');
        }
      }else{
        if(old){add(getCorner(right,vertex),getAnchor(right,vertex),'B');add(getCorner(left,vertex),getAnchor(left,vertex),'B');add(getAnchor(right,vertex),getAnchor(left,vertex),'B');if(kind==='V')for(const f of [left,right])add(anchors.get(`${f},${other}`)??getCorner(f,other),getAnchor(f,vertex),'V');continue;}
        owners.forEach(f=>add(getCorner(f,vertex),getAnchor(f,vertex),'B'));add(getAnchor(owners[0],vertex),getAnchor(owners[1],vertex),'B');
        if(kind==='V')owners.forEach(f=>add(getAnchor(f,vertex),anchors.get(`${f},${other}`)??getCorner(f,other),'V'));
      }
    }
  });
  const cornerSource=new Map<number,number>();for(const [stamp,id] of [...corners,...anchors])cornerSource.set(id,Number(stamp.split(',')[1]));
  const {graph,owners,tol}=validateGraph(result.fold,holeIds.map(f=>originalCycles.inner[f]),cornerSource),cp=graph.vertices_coords,fs=graph.faces_vertices!,es=graph.edges_vertices,expectedEdges=[...builtEdges.values()],invert=p.graphSource?.invertFoldType===true;
  if(!verifyWovenAreaRecovery(source,negativeInitial,fs,{holes:holeIds.map(f=>originalCycles.inner[f]),cornerSource,componentCount:motherComponents.length,edges:es}))fail('原记录负初值图的面积包围、共享预算或来源回读不一致。');
  if(cp.length!==expectedFF.length||!exact(es,expectedEdges.map(e=>e.edge))||!exact(graph.edges_assignment,expectedEdges.map(e=>invert?e.kind==='M'?'V':e.kind==='V'?'M':e.kind:e.kind)))fail('原 CP 点边编号或山谷／边界赋型与声明版本拓扑不一致。');
  if(old&&!exact(fs,planeCycles(negativeInitial,es).inner.map(face=>face.slice().reverse())))fail('原版本固定CP初值的原半边面顺序不一致。');
  const mainFaces=originalFaces.map((face,f)=>{
    const target=face.map(v=>getCorner(f,v)).sort((a,b)=>a-b),matches=fs.flatMap((cycle,i)=>exact([...cycle].sort((a,b)=>a-b),target)?[i]:[]);
    if(matches.length!==1)fail('原母面与生成 CP 的固定面索引不一致。');return matches[0];
  });
  const wantedHoles=fs.map(()=>[] as number[][]);originalHoles.forEach((rs,f)=>rs.forEach(r=>{const ids=r.map(v=>getCorner(f,v));wantedHoles[mainFaces[f]].push(area(cp,ids)*area(cp,fs[mainFaces[f]])<0?ids:[...ids].reverse());}));
  if(!exact(graph.faces_holes??fs.map(()=>[]),wantedHoles))fail('实际CP的环孔面归属或原角点编号不一致。');
  const stationary=mainFaces[p.stationaryFace];
  if(stationary===undefined||source.stationaryFoldFace!==stationary)fail('原固定母面与生成 CP 固定面不一致。');
  const verificationTol=Math.max(tol,ftol);
  isometry(cp,ff,fs,verificationTol,graph.faces_holes);
  const ws=fs.map(face=>winding(ff,face)),restore=owners.map(o=>o.length===2&&ws[o[0]]!==ws[o[1]]?180:0),cuts=owners.flatMap((o,e)=>o.length===2&&graph.edges_assignment[e]==='B'?[e]:[]);
  const componentRoots=componentFaces.filter(fs=>!fs.includes(p.stationaryFace)).map(fs=>mainFaces[fs[0]]);
  if(componentRoots.length){
   const expected={schema:'zhezhi-woven-independent-mother-v1',vertices:motherComponents,faces:componentFaces,foldRoots:[stationary,...componentRoots]};
   if(!exact(source.wovenIndependentMother,expected))fail('独立母图部件和固定回展面来源不一致。');
  }else if(source.wovenIndependentMother!==undefined)fail('单部件母图附带了未请求的独立部件来源。');
  restoration(cp,ff,es,fs,owners,ws,stationary,verificationTol,componentRoots,graph.faces_holes);
  if(stats.vertices!==cp.length||stats.edges!==es.length||stats.faces!==fs.length||stats.tiles!==originalFaces.length)fail('响应的点边面统计与实际图不一致。');
  const cut=record(source.wovenCutTopology);
  if(cuts.length){
    if(!cut||cut.schema!=='origamica-woven-internal-boundary-v1'||cut.standardSingleSheetFold!==false||cut.boundaryAssignmentIsFaceIncidence!==false||!exact(cut.originalFunctions,['MakeSimpleWovenTessellation','EdgeFaceAngles2D','UnfoldGraph2D'])||!exact(cut.internalBoundaryEdges,cuts)||!exact(cut.edgeFaceIncidence,owners)||!exact(cut.foldedFaceWinding,ws)||!exact(cut.edgeRestoreAnglesDeg,restore))fail('内部切口的索引、关联、绕数或回展角来源与真实图不一致。');
  }else if(source.wovenCutTopology!==undefined)fail('没有实际内部 B 切口，却附带切口拓扑凭证。');
  if(old){if(source.periodVectors!==undefined)fail('原版本没有周期选项，不能附入新版周期来源。');}
  else verifyPeriodicity(p,originalPoints,originalFaces,colors,corners,anchors,bases,ff,cp,originalEdges,expectedLines,source,verificationTol);
  const split=splitWovenCutGraph(graph,ff);
  return {ok:true,topology:{sourceCP:cp,sourceFolded:ff,...split,internalBoundaryEdges:cuts,edgeFaceIncidence:owners,foldedFaceWinding:ws,edgeRestoreAnglesDeg:restore,stationaryFoldFace:stationary,standardSingleSheetFold:cuts.length===0&&split.components.length===1}};
}

function verifyPeriodicity(p:WovenParams,points:Point[],faces:number[][],colors:(number|undefined)[],corners:Map<string,number>,anchors:Map<string,number>,bases:Point[],ff:Point[],cp:Point[],edges:[number,number][],lines:number[],source:Record<string,unknown>,tol:number):void {
  const vectors=new Map<string,Point>();
  for(const [a,b] of p.periodicity??[]){
    if(a>=points.length||b>=points.length)fail('原周期配对顶点越界。');
    const delta:Point=[points[b][0]-points[a][0],points[b][1]-points[a][1]],length=Math.hypot(...delta);if(!length)fail('原周期方向退化。');
    for(const color of [-1,1]){
      const fa=faces.flatMap((face,f)=>face.includes(a)&&colors[f]===color&&anchors.has(`${f},${a}`)?[f]:[]),fb=faces.flatMap((face,f)=>face.includes(b)&&colors[f]===color&&anchors.has(`${f},${b}`)?[f]:[]);
      if(fa.length!==1||fb.length!==1)fail('周期配对缺少唯一边界条带端点。');
      const va=corners.get(`${fa[0]},${a}`)!,vb=corners.get(`${fb[0]},${b}`)!,aa=anchors.get(`${fa[0]},${a}`)!,ab=anchors.get(`${fb[0]},${b}`)!;
      if(distance([bases[ab][0]-bases[aa][0],bases[ab][1]-bases[aa][1]],delta)>tol)fail('周期两端原条带宽度或相位不一致。');
      for(const [u,v] of [[va,vb],[aa,ab]]){
        const shift:Point=[ff[v][0]-ff[u][0]-delta[0],ff[v][1]-ff[u][1]-delta[1]];
        if(Math.abs(shift[0]*delta[1]-shift[1]*delta[0])/length>Math.max(tol,1e-7))fail('原平折没有满足周期法向位移约束。');
        const key=delta.map(n=>Math.round(n*1e7)/1e7).join(','),vector:Point=[cp[v][0]-cp[u][0],cp[v][1]-cp[u][1]],previous=vectors.get(key);
        if(previous&&distance(vector,previous)>Math.max(tol,2e-5))fail('原 CP 的周期边界位移不一致。');vectors.set(key,vector);
      }
      const end=(f:number,v:number)=>{const face=faces[f],k=face.indexOf(v),n=[face[(k+face.length-1)%face.length],face[(k+1)%face.length]].find(other=>edges.some((e,i)=>lines[i]>=0&&edgeKey(...e)===edgeKey(v,other)));if(n===undefined)fail('周期端点缺少内部条带。');return corners.get(`${f},${n}`)!;};
      const ea=end(fa[0],a),eb=end(fb[0],b),u:Point=[ff[ea][0]-ff[va][0],ff[ea][1]-ff[va][1]],v:Point=[ff[eb][0]-ff[vb][0],ff[eb][1]-ff[vb][1]],den=Math.hypot(...u)*Math.hypot(...v);
      if(!den||Math.abs(u[0]*v[1]-u[1]*v[0])/den>1e-7)fail('原平折没有满足周期条带方向约束。');
    }
  }
  const expected=[...vectors.values()],actual=source.periodVectors;
  if(!Array.isArray(actual)||actual.length!==expected.length||actual.some((v,i)=>!Array.isArray(v)||v.length!==2||v.some(n=>!finite(n))||distance(v as Point,expected[i])>tol))fail('原周期向量与实际 CP 位移不一致。');
}
