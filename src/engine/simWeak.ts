import earcut from 'earcut';
import type {FoldDocument,FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {Doc,Point,Assignment} from '../core/types';
import {materialFaceRings,materialFaceEdgeRings} from '../core/materialRings';
import {materialCanonical} from '../core/materialFaceCommon';
import {createMaterialTopology} from '../core/materialTopology';
import {materialOrientation} from '../core/materialTraceGeometry';
import {projectSimulationFace} from './simHoles';
import {triangulateWeakConstraints} from './simWeakConstraints';

const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
function fail(text:string):never{throw Error(`弱边界模拟网格无效：${text}`);}
/** A face can meet one global vertex in several disconnected local sectors.
 * Build private sector IDs from actual dart adjacency for local geometry
 * verification. Public indexed corners are never changed by this check. */
function cornerPatch(rings:number[][][],rows:number[][][],edges:[number,number][]){
 const slots:{v:number;next:number}[]=[],at:number[][][]=[],darts=new Map<number,number[]>();
 rings.forEach((rs,f)=>{at[f]=[];rs.forEach((r,h)=>{at[f][h]=r.map(v=>{const i=slots.length;slots.push({v,next:0});return i;});r.forEach((v,k)=>{const i=at[f][h][k],j=at[f][h][(k+1)%r.length],e=rows[f][h][k];slots[i].next=j;if(key(v,r[(k+1)%r.length])!==key(...edges[e]))fail('局部面角端点不符。');darts.set(e,[...(darts.get(e)??[]),i]);});});});
 const parent=slots.map((_,i)=>i),find=(i:number):number=>{let root=i;while(parent[root]!==root)root=parent[root];while(parent[i]!==i){const next=parent[i];parent[i]=root;i=next;}return root;},join=(a:number,b:number)=>{if(slots[a].v!==slots[b].v)fail('局部面角混淆源顶点。');parent[find(b)]=find(a);};
 for(const ds of darts.values()){if(ds.length>2)fail('局部边连接多于两侧。');if(ds.length===2){join(ds[0],slots[ds[1]].next);join(slots[ds[0]].next,ds[1]);}}
 const roots=[...new Set(slots.map((_,i)=>find(i)))],map=new Map(roots.map((v,i)=>[v,i])),rs=at.map(face=>face.map(r=>r.map(i=>map.get(find(i))!))),used=[...darts.keys()].sort((a,b)=>a-b),em=new Map(used.map((e,i)=>[e,i])),ers=rows.map(face=>face.map(r=>r.map(e=>em.get(e)!))),localEdges=used.map(e=>{const i=darts.get(e)![0];return [map.get(find(i))!,map.get(find(slots[i].next))!] as [number,number];}),fans=new Map<number,Set<number>>();slots.forEach((s,i)=>fans.set(s.v,new Set([...(fans.get(s.v)??[]),find(i)])));
 return {sourceVertices:roots.map(i=>slots[i].v),rings:rs,rows:ers,edges:localEdges,kinds:used.map(e=>darts.get(e)!.length===1?'B':'F'),fans};
}
function verifyLocal(coords:Point[],rings:number[][][],rows:number[][][],edges:[number,number][],area:number){
 const local=cornerPatch(rings,rows,edges),origin=coords[local.sourceVertices[0]],span=Math.max(1,...local.sourceVertices.map(v=>Math.hypot(coords[v][0]-origin[0],coords[v][1]-origin[1]))),points=local.sourceVertices.map(v=>[(coords[v][0]-origin[0])/span*100,(coords[v][1]-origin[1])/span*100] as Point);
 if(area<0)local.rings.forEach((rs,f)=>rs.forEach((r,h)=>{rs[h]=[r[0],...r.slice(1).reverse()];local.rows[f][h].reverse();}));
 const angles=local.edges.map(()=>0),graph=materialCanonical(points,local.edges,local.kinds,angles,local.rings.map(rs=>rs[0]),local.rows.map(rs=>rs[0]),local.rings.map(rs=>rs.slice(1)),local.rows.map(rs=>rs.slice(1))),names=local.edges.map((_,e)=>`mesh-${e}`),doc:Doc={name:'模拟局部材料核查',paper:{width:100,height:100},segments:local.edges.map(([a,b],e)=>({id:names[e],a:points[a],b:points[b],assignment:local.kinds[e] as Assignment,angle:0}))};
 createMaterialTopology(doc,graph,names);
}
function verifyPatch(coords:Point[],rings:number[][],rows:number[][],edges:[number,number][],area:number){verifyLocal(coords,[rings],[rows],edges,area);}
function verifyTriangles(coords:Point[],ts:number[][],rows:number[][],edges:[number,number][],area:number){verifyLocal(coords,ts.map(t=>[t]),rows.map(r=>[r]),edges,area);}

/** Constrained triangulation copy, including zero-area walks. Every original
 * edge remains at its original index; explicit triangle-edge incidence keeps
 * parallel slit banks separate even when their endpoint IDs are identical. */
export function triangulateSimulationWeak(source:FoldDocument):FoldDocument{
 const graph=source as unknown as import('../core/types').FoldGraph,n=source.vertices_coords.length,edgeCount=source.edges_vertices.length,faceCount=source.faces_vertices.length;
 if(!Array.isArray(source.faces_edges)||source.faces_edges.length!==faceCount||!Array.isArray(source.edges_faces)||source.edges_faces.length!==edgeCount)fail('缺少实际逐角边关联。');
 if(graph.faces_holes!==undefined&&(!Array.isArray(graph.faces_holes)||graph.faces_holes.length!==faceCount||graph.faces_holes.some(rs=>!Array.isArray(rs))||!Array.isArray(graph.faces_holeEdges)||graph.faces_holeEdges.length!==faceCount||graph.faces_holeEdges.some((rs,f)=>!Array.isArray(rs)||rs.length!==graph.faces_holes![f].length)))fail('内环关联格式无效。');
 const fold=structuredClone(source),edges=fold.edges_vertices,triangles:number[][]=[],triangleRows:number[][]=[],parents:number[]=[],owners=edges.map(()=>[] as number[]),darts=edges.map(()=>[] as {f:number;h:number;k:number;a:number;b:number}[]),cornerSlots:{f:number;h:number;k:number;v:number}[]=[],slotByCorner=new Map<string,number>();let corners=0;
 for(let f=0;f<faceCount;f++){
  const rs=materialFaceRings(graph,f),ers=materialFaceEdgeRings(graph,f);if(rs.length!==ers.length)fail('内外环数量不符。');
  rs.forEach((r,h)=>{if(!Array.isArray(r)||r.length<(h?2:3)||!Array.isArray(ers[h])||ers[h].length!==r.length||r.some(v=>!Number.isInteger(v)||v<0||v>=n))fail('源边界面角无效。');corners+=r.length;if(corners>65536)fail('源面角预算超限。');r.forEach((a,k)=>{const b=r[(k+1)%r.length],e=ers[h][k];if(!Number.isInteger(e)||e<0||e>=edgeCount||key(a,b)!==key(...edges[e]))fail('源边界端点不符。');owners[e].push(f);darts[e].push({f,h,k,a,b});slotByCorner.set(`${f},${h},${k}`,cornerSlots.length);cornerSlots.push({f,h,k,v:a});});});
 }
 owners.forEach((fs,e)=>{if(fs.length!==(source.edges_assignment?.[e]==='B'?1:2)||!Array.isArray(source.edges_faces![e])||JSON.stringify([...fs].sort((a,b)=>a-b))!==JSON.stringify([...source.edges_faces![e]].sort((a,b)=>a-b)))fail('源边所属材料面不符。');if(fs.length===2&&(darts[e][0].a!==darts[e][1].b||darts[e][0].b!==darts[e][1].a))fail('源共享边方向不相反。');});
 for(let f=0;f<faceCount;f++){const ers=materialFaceEdgeRings(graph,f);for(let h=0;h<ers.length;h++){const declared=h?graph.faces_holeFaces?.[f]?.[h-1]:graph.faces_faces?.[f];if((h?graph.faces_holeFaces:graph.faces_faces)===undefined)continue;if(!Array.isArray(declared)||declared.length!==ers[h].length||declared.some((v,k)=>{const fs=owners[ers[h][k]],expected=fs.length===2?fs[0]===f?fs[1]:fs[0]:null;return expected===null?v!==null&&v!==undefined:v!==expected;}))fail('源逐角邻面不符。');}}
 // A vertex is one connected actual corner fan, not coordinate-based welding.
 const at=Array.from({length:n},()=>[] as number[]);cornerSlots.forEach((s,i)=>at[s.v].push(i));
 at.forEach(slots=>{if(!slots.length)fail('源含孤立顶点。');const links=new Map<number,number[]>();let banks=0;for(const i of slots){const {f,h,k}=cornerSlots[i],r=materialFaceRings(graph,f)[h],er=materialFaceEdgeRings(graph,f)[h];for(const [j,incoming]of [[(k+r.length-1)%r.length,true],[k,false]] as const){const e=er[j];if(source.edges_assignment?.[e]==='B'){banks++;continue;}const other=darts[e].find(d=>d.f!==f||d.h!==h||d.k!==j);if(!other)fail('源面角丢失相反侧。');const next=slotByCorner.get(`${other.f},${other.h},${incoming?other.k:(other.k+1)%materialFaceRings(graph,other.f)[other.h].length}`);if(next===undefined)fail('源面角断裂。');links.set(i,[...(links.get(i)??[]),next]);}}const seen=new Set([slots[0]]),pending=[slots[0]];while(pending.length)for(const v of links.get(pending.pop()!)??[])if(!seen.has(v)){seen.add(v);pending.push(v);}if(seen.size!==slots.length||banks!==0&&banks!==2)fail('源顶点不是单个材料扇。');});
 fold.edges_assignment=edges.map((_,e)=>source.edges_assignment?.[e]??'U');fold.edges_foldAngle=edges.map((_,e)=>source.edges_foldAngle?.[e]??(source.edges_assignment?.[e]==='M'?-180:source.edges_assignment?.[e]==='V'?180:0));
 let comparisons=0;const spend=()=>{if(++comparisons>2_000_000)fail('三角化核查预算超限。');};
 for(let f=0;f<faceCount;f++){
  const rs=materialFaceRings(graph,f),ers=materialFaceEdgeRings(graph,f),{coords,area,eps}=projectSimulationFace(source,rs,false);if(!Number.isFinite(area)||Math.abs(area)<=eps*eps)fail('源纸面面积退化。');verifyPatch(coords,rs,ers,source.edges_vertices,area);
  // Earcut chooses among coordinate-equal corners according to walk order.
  // Normalize its private input winding first, then restore the actual source
  // winding below; reversing only output triangles can select the wrong bank.
  const inputRings=area<0?rs.map(r=>[r[0],...r.slice(1).reverse()]):rs;
  const ids=inputRings.flat(),offsets:number[]=[];let count=rs[0].length;for(const r of rs.slice(1)){offsets.push(count);count+=r.length;}
  const raw=earcut(ids.flatMap(v=>coords[v]),offsets,2);let ts=Array.from({length:raw.length/3},(_,i)=>raw.slice(i*3,i*3+3).map(k=>ids[k]));if(area<0)ts.forEach(t=>[t[1],t[2]]=[t[2],t[1]]);
  const turn=(a:Point,b:Point)=>{const angle=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);return angle<=0?angle+2*Math.PI:angle;},fan=(v:number,p:Point)=>rs.some(r=>r.some((a,k)=>{if(a!==v)return false;const o=coords[v],next=coords[r[(k+1)%r.length]],prior=coords[r[(k+r.length-1)%r.length]],start=area>0?next:prior,end=area>0?prior:next;return turn([start[0]-o[0],start[1]-o[1]],[p[0]-o[0],p[1]-o[1]])<turn([start[0]-o[0],start[1]-o[1]],[end[0]-o[0],end[1]-o[1]]);}));
  // Earcut may remove a collinear bank corner and use its coordinate-equal
  // opposite corner. Bind each triangle to the actual fan it lies inside;
  // identical coordinates are never a reason to weld indexed slit banks.
  const aliases=new Map<string,number[]>();for(const v of new Set(ids)){const stamp=coords[v].join(',');aliases.set(stamp,[...(aliases.get(stamp)??[]),v]);}
  const bind=()=>{for(const t of ts){const center:Point=[t.reduce((n,v)=>n+coords[v][0],0)/3,t.reduce((n,v)=>n+coords[v][1],0)/3];for(let k=0;k<3;k++){const group=aliases.get(coords[t[k]].join(','))!;if(group.length<2)continue;const eligible=group.filter(v=>fan(v,center));if(eligible.length!==1)return false;t[k]=eligible[0];}}return true;};
  let bound=bind();
  // Restore collinear corners on their actual side, never substitute a
  // coordinate-equal bank endpoint or make a zero-area triangle.
  for(const v of new Set(ids))for(let i=0;i<ts.length;i++)for(let k=0;k<3;k++){
   spend();const t=ts[i],a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],p=coords[v],x=coords[a],y=coords[b];if(v===a||v===b||p[0]===x[0]&&p[1]===x[1]||p[0]===y[0]&&p[1]===y[1])continue;
   if(!materialOrientation(x,y,p)&&p[0]>=Math.min(x[0],y[0])&&p[0]<=Math.max(x[0],y[0])&&p[1]>=Math.min(x[1],y[1])&&p[1]<=Math.max(x[1],y[1])&&fan(v,coords[c])){ts[i]=[a,v,c];ts.push([v,b,c]);break;}
  }
  const complete=()=>{const seen=new Set(ts.flatMap(t=>t.map((v,k)=>`${v}:${t[(k+1)%3]}`)));return rs.every(r=>r.every((v,k)=>seen.has(`${v}:${r[(k+1)%r.length]}`)));};
  if(!bound||!complete()||ts.length!==count+2*(rs.length-1)-2||new Set(ts.flat()).size!==new Set(ids).size){ts=triangulateWeakConstraints(coords,rs,ers,source.edges_vertices,spend);if(area<0)ts.forEach(t=>[t[1],t[2]]=[t[2],t[1]]);bound=bind();}
  if(!bound||ts.length!==count+2*(rs.length-1)-2||new Set(ts.flat()).size!==new Set(ids).size)fail('三角片数量、实际面角或源顶点覆盖不符。');
  const directed=new Map<string,number[]>(),originalPairs=new Set<string>();rs.forEach((r,h)=>r.forEach((a,k)=>{const b=r[(k+1)%r.length],e=ers[h][k],stamp=`${a}:${b}`;directed.set(stamp,[...(directed.get(stamp)??[]),e]);originalPairs.add(key(a,b));}));
  const helpers=new Map<string,number>(),rows=ts.map(t=>t.map((a,k)=>{const b=t[(k+1)%3],matches=directed.get(`${a}:${b}`);if(matches){if(matches.length!==1)fail('三角片没有唯一实际边界侧。');return matches[0];}const pair=key(a,b);if(originalPairs.has(pair))fail('三角片使用了错误的原边界侧。');let e=helpers.get(pair);if(e===undefined){e=edges.length;helpers.set(pair,e);edges.push([a,b]);fold.edges_assignment!.push('F');fold.edges_foldAngle!.push(0);}return e;}));
  verifyTriangles(coords,ts,rows,edges,area);triangles.push(...ts);triangleRows.push(...rows);parents.push(...ts.map(()=>f));if(triangles.length>15000||edges.length>45000)fail('模拟网格容量超限。');
 }
 const incidence=edges.map(()=>[] as number[]);triangleRows.forEach((r,t)=>r.forEach(e=>incidence[e].push(t)));
 for(let e=0;e<edges.length;e++){const fs=incidence[e];if(fs.length!==(fold.edges_assignment![e]==='B'?1:2))fail('模拟边界或铰接面数量不符。');if(e<edgeCount){const sourceFaces=fs.map(t=>parents[t]);if(JSON.stringify(sourceFaces.sort((a,b)=>a-b))!==JSON.stringify([...owners[e]].sort((a,b)=>a-b)))fail('网格改变了实际源边的所属面。');}else if(new Set(fs.map(t=>parents[t])).size!==1)fail('辅助边跨越了独立原面。');}
 if(new Set(triangles.flat()).size!==n)fail('网格丢失源顶点。');
 if([...cornerPatch(triangles.map(t=>[t]),triangleRows.map(r=>[r]),edges).fans.values()].some(fs=>fs.size!==1))fail('模拟网格把一个源顶点拆成了不相连材料扇。');
 fold.faces_vertices=triangles;fold.faces_edges=triangleRows;fold.edges_faces=incidence;for(const k of ['faces_holes','faces_holeEdges','faces_holeFaces','faces_faces','faceOrders'])delete fold[k];
 fold.zhezhi_simulation_mesh={schema:'zhezhi-simulation-mesh-v2',sourceEdgeCount:edgeCount,sourceFaceCount:faceCount,triangleSourceFaces:parents};return fold;
}

/** A mesh marker is only a request. Topology is revalidated before simulation. */
export function hasExplicitSimulationMesh(source:FoldDocument):boolean{
 const data=source.zhezhi_simulation_mesh as {schema?:unknown}|undefined;return data?.schema==='zhezhi-simulation-mesh-v2';
}
