import type {Doc,FoldGraph,Point} from './types';
import {createMaterialTopology,inspectMaterialTopology,type MaterialTopologyInspection} from './materialTopology';
import {materialFaceVertices,materialFaceEdges,materialFaceRings,materialFaceEdgeRings} from './materialRings';
import {hasWeakMaterialRings,hasWeakMaterialBanks,hasUnresolvedMaterialHinge} from './materialWeak';

/** Finite rigid propagation only; this does not solve arbitrary edited CPs. */
export const MATERIAL_REFOLD_LIMITS={comparisons:2_000_000} as const;
type Pose={source:Point;target:Point;xx:number;xy:number;yx:number;yy:number;parity:1|-1};
function fail(message:string):never {throw new Error(`材料重新平折不支持：${message}`);}
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const sameEdge=(a:number[],b:number[])=>a[0]===b[0]&&a[1]===b[1]||a[0]===b[1]&&a[1]===b[0];
function area(points:Point[],face:number[]):number {const p=points[face[0]];return face.reduce((sum,v,k)=>{const q=points[v],r=points[face[(k+1)%face.length]];return sum+(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);},0)/2;}
function pointTolerance(points:Point[]):number {let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,magnitude=0;for(const [x,y]of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);magnitude=Math.max(magnitude,Math.abs(x),Math.abs(y));}return Math.max(1e-9,Math.max(maxX-minX,maxY-minY)*1e-9,magnitude*Number.EPSILON*32);}
function map(pose:Pose,p:Point):Point {const x=p[0]-pose.source[0],y=p[1]-pose.source[1];return [pose.target[0]+pose.xx*x+pose.xy*y,pose.target[1]+pose.yx*x+pose.yy*y];}
function pose(a:Point,b:Point,p:Point,q:Point,parity:1|-1):Pose {
 const cp=distance(a,b),ff=distance(p,q);if(!(cp>0&&ff>0&&Number.isFinite(cp)&&Number.isFinite(ff)))fail('固定面或铰接边没有可验证的方向。');
 const ux=(b[0]-a[0])/cp,uy=(b[1]-a[1])/cp,vx=(q[0]-p[0])/ff,vy=(q[1]-p[1])/ff;
 return {source:a,target:p,xx:vx*ux+parity*vy*uy,xy:vx*uy-parity*vy*ux,yx:vy*ux-parity*vx*uy,yy:vy*uy+parity*vx*ux,parity};
}
/** Face start and winding may change; indexed vertices and edge occurrences may not. */
function sameFace(before:FoldGraph,after:FoldGraph,f:number):boolean {
 const left=materialFaceRings(before,f),right=materialFaceRings(after,f),le=materialFaceEdgeRings(before,f),re=materialFaceEdgeRings(after,f);if(left.length!==right.length)return false;
 return left.every((a,h)=>{const b=right[h],ae=le[h],be=re[h];if(a.length!==b.length)return false;const start=a.indexOf(b[0]);if(start<0)return false;const n=a.length;return [1,-1].some(direction=>b.every((v,k)=>{const i=(start+direction*k+n)%n;return a[i]===v&&ae[direction===1?i:(i+n-1)%n]===be[k];}));});
}

/**
 * Re-fold an explicitly indexed material graph after a same-topology edit.
 * Each component keeps the old CP→FF rigid map of a stable source face, rather
 * than acquiring an independent origin. B edges never propagate a hinge.
 * Every loop, indexed vertex and final full material contract is revalidated.
 */
export function refoldMaterialGeometry(previous:Doc,next:Doc):Point[] {
 const old=inspectMaterialTopology(previous);if(!old.ok)fail(old.reason);
 if(!old.foldedVertices)fail('原材料工程没有已验证的折后位置，无法确定各部件的相对姿态。');
 const current=inspectMaterialTopology(next);if(!current.ok)fail(current.reason);
 if(current.foldedVertices)fail('待重新平折的材料图应先独立重建为没有折后位置的新合同。');
 const before=old.graph,graph=current.graph,faces=graph.faces_vertices!,root=old.startingFace??0;
 if((current.startingFace??0)!==root)fail('编辑不能同时更换原固定面；请单独使用固定面重定向操作。');
 if(before.vertices_coords.length!==graph.vertices_coords.length||before.edges_vertices.length!==graph.edges_vertices.length||before.faces_vertices!.length!==faces.length||
  old.edgeSegmentIds.some((id,e)=>id!==current.edgeSegmentIds[e])||before.edges_vertices.some((edge,e)=>!sameEdge(edge,graph.edges_vertices[e])||(before.edges_assignment[e]==='B')!==(graph.edges_assignment[e]==='B'))||faces.some((_,f)=>!sameFace(before,graph,f)))fail('材料顶点、边、面或切口的 indexed 拓扑已变化；没有推断或焊接重建。');
 if(JSON.stringify(old.components.map(c=>c.faces))!==JSON.stringify(current.components.map(c=>c.faces)))fail('材料部件归属已变化。');
 return propagate(old,current,root,next);
}

/** Fresh CP has no saved relative FF pose. Fix each material component's
 * chosen root in its actual CP coordinates, preserving separate identities. */
export function foldMaterialFromCP(doc:Doc,root=0):Point[]{
 const current=inspectMaterialTopology(doc);if(!current.ok)fail(current.reason);
 if(!Number.isInteger(root)||root<0||root>=current.graph.faces_vertices!.length)fail('起始面不存在。');
 if(hasWeakMaterialRings(current.graph)&&hasUnresolvedMaterialHinge(current.graph))fail(hasWeakMaterialBanks(current.graph)?'材料切口中仍有同面悬空山谷线，当前仅CP；先补齐分面或删除，再计算平折。':'材料含自由端点或单桥，当前仅CP；先连接或删除这些折痕，再计算平折。');
 return propagate(current,current,root,doc,undefined,true);
}

/** A declared join preserves every old face polygon and face ID, while
 * vertices/edges can be united. Source anchors come from old face occurrences,
 * not from an arbitrary representative of a newly united vertex. */
export function refoldMaterialJoinedFaces(previous:Doc,next:Doc):Point[]{
 const old=inspectMaterialTopology(previous),current=inspectMaterialTopology(next);
 if(!old.ok)fail(old.reason);if(!current.ok)fail(current.reason);
 if(!old.foldedVertices||current.foldedVertices)fail('粘合重新平折需要原FF和无FF的新材料合同。');
 const before=old.graph,after=current.graph,faces=after.faces_vertices!;
 if(before.faces_vertices!.length!==faces.length||faces.some((_,f)=>{const a=materialFaceRings(before,f),b=materialFaceRings(after,f);return a.length!==b.length||b.some((ring,h)=>ring.length!==a[h].length||ring.some((v,k)=>{const p=after.vertices_coords[v],q=before.vertices_coords[a[h][k]];return p[0]!==q[0]||p[1]!==q[1];}));}))fail('粘合不能同时移动或重排原材料面。');
 return propagate(old,current,current.startingFace??0,next);
}

type Checked=Extract<MaterialTopologyInspection,{ok:true}>;
/** Explicit face ancestry is supplied only by replayable subdivision/merge
 * transactions; each new component inherits an old face pose, never an origin. */
export function refoldMaterialRemeshedFaces(previous:Doc,next:Doc,sources:readonly number[][],oldRoot:number):Point[]{
 const old=inspectMaterialTopology(previous),current=inspectMaterialTopology(next);
 if(!old.ok)fail(old.reason);if(!current.ok)fail(current.reason);
 if(!old.foldedVertices||current.foldedVertices)fail('面细分重新平折需要原FF和无FF的新材料合同。');
 if(sources.length!==current.graph.faces_vertices!.length||sources.some(row=>!row.length||new Set(row).size!==row.length||row.some(f=>!Number.isInteger(f)||f<0||f>=old.graph.faces_vertices!.length))||new Set(sources.flat()).size!==old.graph.faces_vertices!.length)fail('新面缺少完整原面身份。');
 const root=current.startingFace??0;if(!sources[root].includes(oldRoot))fail('新固定面不属于原固定面。');
 return propagate(old,current,root,next,sources.map(row=>row.includes(oldRoot)?oldRoot:row[0]));
}
function propagate(old:Checked,current:Checked,root:number,next:Doc,anchors?:readonly number[],fromCP=false):Point[]{
 const before=old.graph,graph=current.graph,faces=graph.faces_vertices!;
 const anchorCoordinates=fromCP?before.vertices_coords:old.foldedVertices;if(!anchorCoordinates)fail('缺少原折后位置。');
 const tolerance=20*Math.max(old.tolerance,current.tolerance,pointTolerance(anchorCoordinates)),poses:(Pose|undefined)[]=Array(faces.length),pending:number[]=[],vertices:(Point|undefined)[]=Array(graph.vertices_coords.length);let comparisons=0;
 const compare=(a:Point,b:Point,label:string)=>{if(++comparisons>MATERIAL_REFOLD_LIMITS.comparisons)fail('闭环与顶点检查超过有界预算。');if(!a.every(Number.isFinite)||!b.every(Number.isFinite)||distance(a,b)>tolerance)fail(label);};
 for(const component of current.components){
  const fixed=component.faces.includes(root)?root:component.faces[0],face=before.faces_vertices![anchors?.[fixed]??fixed];
  // A longest original boundary edge is a deterministic, well-scaled frame.
  let k=0;for(let i=1;i<face.length;i++)if(distance(before.vertices_coords[face[i]],before.vertices_coords[face[(i+1)%face.length]])>distance(before.vertices_coords[face[k]],before.vertices_coords[face[(k+1)%face.length]]))k=i;
  const a=face[k],b=face[(k+1)%face.length],parity=Math.sign(area(anchorCoordinates,face)) as 1|-1;
  if(parity!==1&&parity!==-1)fail('原固定面折后朝向退化。');
  const frame:Pose=fromCP?{source:[0,0],target:[0,0],xx:1,xy:0,yx:0,yy:1,parity:1}:pose(before.vertices_coords[a],before.vertices_coords[b],anchorCoordinates[a],anchorCoordinates[b],parity);
  for(const v of face)compare(map(frame,before.vertices_coords[v]),anchorCoordinates[v],'原固定面没有唯一、可验证的 CP 到 FF 等距姿态。');
  poses[fixed]=frame;pending.push(fixed);
 }
 for(let i=0;i<pending.length;i++){
  const f=pending[i],frame=poses[f]!;
  for(const v of materialFaceVertices(graph,f)){const p=map(frame,graph.vertices_coords[v]);if(vertices[v])compare(vertices[v]!,p,'沿不同材料面路径得到的同一 indexed 顶点位置不一致，修改不能完全平折。');else vertices[v]=p;}
  for(const e of materialFaceEdges(graph,f)){
   const kind=graph.edges_assignment[e];if(kind==='B')continue;
   const neighbor=graph.edges_faces![e].find(other=>other!==f);if(neighbor===undefined){if(kind==='F'&&graph.edges_faces![e].every(other=>other===f))continue;fail('非切口铰接边丢失邻面。');}
   const [a,b]=graph.edges_vertices[e],candidate=kind==='F'?frame:pose(graph.vertices_coords[a],graph.vertices_coords[b],map(frame,graph.vertices_coords[a]),map(frame,graph.vertices_coords[b]),(-frame.parity) as 1|-1);
   if(poses[neighbor])for(const v of materialFaceVertices(graph,neighbor))compare(map(poses[neighbor]!,graph.vertices_coords[v]),map(candidate,graph.vertices_coords[v]),'材料铰接环不能闭合，修改没有一致的完全平折几何。');
   else{poses[neighbor]=candidate;pending.push(neighbor);}
  }
 }
 if(pending.length!==faces.length||Array.from(vertices).some(p=>p===undefined))fail('存在不能从原固定面到达的材料面或顶点。');
 const output=vertices as Point[];
 // Independent strict validation checks all face distances, winding, original
 // occurrences and source-document binding; no new certificate field is used.
 const verified=createMaterialTopology(next,graph,current.edgeSegmentIds,{foldedVertices:output,startingFace:root});
 return verified.foldedVertices!;
}
