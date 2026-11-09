import type {FoldGraph} from './types';
import {materialFaceRings,materialFaceEdgeRings} from './materialRings';
import {materialAreaRings,hasUnresolvedMaterialHinge} from './materialWeak';
import {validateMaterialFaceRings} from './materialTopology';
import {materialCanonical} from './materialFaceCommon';
import {materialPointInside,materialOrientation} from './materialTraceGeometry';

/** PRIVATE area graph for layer coverage. Public CP/FF vertices, banks, flat
 * crease walks and face IDs are retained in the caller, never replaced by it. */
export function materialLayerRegions(graph:FoldGraph,epsilon:number):FoldGraph{
 const vs=graph.vertices_coords,es=graph.edges_vertices,faces=graph.faces_vertices;
 function fail(text:string):never{throw Error(`材料区域层序无效：${text}`);}
 const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
 if(!Number.isFinite(epsilon)||epsilon<=0||!Array.isArray(vs)||vs.length>8192||vs.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))||!Array.isArray(faces)||!faces.length||faces.length>8192||!Array.isArray(es)||es.length>16384)fail('坐标、材料面或容量无效。');
 const valid=(v:number)=>Number.isInteger(v)&&v>=0&&v<vs.length;
 if(es.some(e=>!Array.isArray(e)||e.length!==2||!e.every(valid)||e[0]===e[1])||graph.edges_assignment.length!==es.length||graph.edges_foldAngle.length!==es.length||graph.edges_assignment.some(a=>!['B','M','V','F','U'].includes(a)))fail('原边或赋型无效。');
 if(!Array.isArray(graph.faces_edges)||graph.faces_edges.length!==faces.length||!Array.isArray(graph.edges_faces)||graph.edges_faces.length!==es.length||graph.edges_faces.some(fs=>!Array.isArray(fs)||fs.some(f=>!Number.isInteger(f)||f<0||f>=faces.length)))fail('缺少实际逐角边界关联。');
 if(graph.faces_holes&&(!Array.isArray(graph.faces_holes)||graph.faces_holes.length!==faces.length||!graph.faces_holeEdges||graph.faces_holeEdges.length!==faces.length))fail('内环关联无效。');
 const owners=es.map(()=>[] as number[]),uses=es.map(()=>[] as [number,number][]),parent=vs.map((_,v)=>v),find=(v:number):number=>{let root=v;while(parent[root]!==root)root=parent[root];while(parent[v]!==v){const next=parent[v];parent[v]=root;v=next;}return root;},union=(a:number,b:number)=>{a=find(a);b=find(b);parent[Math.max(a,b)]=Math.min(a,b);};
 let corners=0,pairs=0;
 for(let f=0;f<faces.length;f++){
  const rs=materialFaceRings(graph,f),ers=materialFaceEdgeRings(graph,f),aliases=new Map<string,number>();
  if(rs.length!==ers.length)fail('内外环数量不符。');
  for(let h=0;h<rs.length;h++){
   const r=rs[h],er=ers[h];if(!Array.isArray(r)||r.length<(h?2:3)||!Array.isArray(er)||er.length!==r.length||r.some(v=>!valid(v)))fail('面角索引无效。');
   corners+=r.length;if(corners>65536)fail('面角预算超限。');
   for(let k=0;k<r.length;k++){const a=r[k],b=r[(k+1)%r.length],e=er[k];if(!Number.isInteger(e)||e<0||e>=es.length||key(a,b)!==key(...es[e]))fail('逐角边端点不符。');owners[e].push(f);uses[e].push([a,b]);const stamp=vs[a].join(','),prior=aliases.get(stamp);if(prior!==undefined)union(prior,a);else aliases.set(stamp,a);}
  }
 }
 if(owners.some((fs,e)=>fs.length!==(graph.edges_assignment[e]==='B'?1:2)||JSON.stringify([...fs].sort((a,b)=>a-b))!==JSON.stringify([...graph.edges_faces![e]].sort((a,b)=>a-b))))fail('实际边所属面不符。');
 if(hasUnresolvedMaterialHinge({...graph,edges_faces:owners}))fail('同面悬空山谷线不能作为平面区域处理。');
 const regions=faces.map((_,f)=>materialAreaRings(graph,f).map(r=>r.map(find)));
 const edgeRows=regions.map((rs,f)=>{
  const candidates=new Map<string,number[]>();for(const e of new Set(materialFaceEdgeRings(graph,f).flat())){const k=key(...es[e].map(find) as [number,number]);candidates.set(k,[...(candidates.get(k)??[]),e]);}
  const row=rs.map(r=>r.map((a,k)=>{const matches=candidates.get(key(a,r[(k+1)%r.length]));if(matches?.length!==1)fail('真实区域边没有唯一原边身份。');return matches[0];}));
  pairs+=rs.flat().length**2;if(pairs>2_000_000)fail('区域验证预算超限。');validateMaterialFaceRings(vs,rs,epsilon,true);return row;
 });
 const retained=es.map(()=>[] as number[]);edgeRows.forEach((rs,f)=>rs.forEach(r=>r.forEach(e=>retained[e].push(f))));
 const removed=new Set<number>(),banks=new Map<string,number[]>();uses.forEach((rows,e)=>{if(graph.edges_assignment[e]==='B'&&rows.length===1){const stamp=[owners[e][0],...rows[0].map(find)].join(',');banks.set(stamp,[...(banks.get(stamp)??[]),e]);}});
 const checkBranch=(e:number)=>{const f=owners[e][0],rs=regions[f],boundary=new Set(rs.flat()),[a,b]=es[e].map(find),p=vs[a],q=vs[b],inside=(v:number[]|number)=>{const point=typeof v==='number'?vs[v]:v;return materialPointInside(point as [number,number],rs[0].map(i=>vs[i]))&&!rs.slice(1).some(r=>materialPointInside(point as [number,number],r.map(i=>vs[i])));};if(!inside([p[0]/2+q[0]/2,p[1]/2+q[1]/2])||[a,b].some(v=>!boundary.has(v)&&!inside(v)))fail('零面积绕行越出真实材料。');
  const on=(x:number,y:number,z:number)=>!materialOrientation(vs[x],vs[y],vs[z])&&vs[z][0]>=Math.min(vs[x][0],vs[y][0])&&vs[z][0]<=Math.max(vs[x][0],vs[y][0])&&vs[z][1]>=Math.min(vs[x][1],vs[y][1])&&vs[z][1]<=Math.max(vs[x][1],vs[y][1]);
  for(const r of rs)for(let k=0;k<r.length;k++){if(++pairs>2_000_000)fail('区域验证预算超限。');const x=r[k],y=r[(k+1)%r.length];if(materialOrientation(p,q,vs[x])*materialOrientation(p,q,vs[y])<0&&materialOrientation(vs[x],vs[y],p)*materialOrientation(vs[x],vs[y],q)<0||on(a,b,x)&&x!==a&&x!==b||on(a,b,y)&&y!==a&&y!==b||on(x,y,a)&&x!==a&&y!==a||on(x,y,b)&&x!==b&&y!==b)fail('零面积绕行穿越纸边或孔洞。');}
 };
 for(let e=0;e<es.length;e++){
  if(retained[e].length){if(JSON.stringify(retained[e].sort((a,b)=>a-b))!==JSON.stringify([...owners[e]].sort((a,b)=>a-b)))fail('区域投影改变了真实共享铰接。');continue;}
  const kind=graph.edges_assignment[e];
  if(kind==='F'&&owners[e].length===2&&owners[e][0]===owners[e][1]){checkBranch(e);removed.add(e);continue;}
  if(kind!=='B'||owners[e].length!==1)fail('不能从区域分析中移除实际山谷铰接。');
  const [a,b]=uses[e][0].map(find),matches=banks.get([owners[e][0],b,a].join(','))??[];
  if(matches.length!==1||matches[0]===e||retained[matches[0]].length)fail('零面积切口没有唯一反向独立侧。');checkBranch(e);removed.add(e);
 }
 const used=new Set(regions.flat(2)),sourceVertices=vs.flatMap((_,v)=>used.has(v)?[v]:[]),vertexMap=new Map(sourceVertices.map((v,i)=>[v,i])),sourceEdges=es.flatMap((_,e)=>removed.has(e)?[]:[e]),edgeMap=new Map(sourceEdges.map((e,i)=>[e,i]));
 const rings=regions.map(rs=>rs.map(r=>r.map(v=>vertexMap.get(v)!))),rows=edgeRows.map(rs=>rs.map(r=>r.map(e=>edgeMap.get(e)!)));
 return materialCanonical(sourceVertices.map(v=>[...vs[v]]),sourceEdges.map(e=>es[e].map(v=>vertexMap.get(find(v))!) as [number,number]),sourceEdges.map(e=>graph.edges_assignment[e]),sourceEdges.map(e=>graph.edges_foldAngle[e]),rings.map(rs=>rs[0]),rows.map(rs=>rs[0]),rings.map(rs=>rs.slice(1)),rows.map(rs=>rs.slice(1)));
}
