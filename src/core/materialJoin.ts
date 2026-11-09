import {appendMaterialTopologyGroup} from './materialCurveModel';
import {hasWeakMaterialBanks} from './materialWeak';
import type {Doc,FoldGraph,Point,Segment} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {refoldMaterialJoinedFaces} from './materialRefold';
import {resolveStartingFace} from '../app/flatFoldSettings';
import {materialFaceRings,materialFaceEdgeRings,materialHoles,materialHoleEdges} from './materialRings';
import {materialCanonical} from './materialFaceCommon';

export type MaterialJoinPair={first:string;second:string;assignment:'M'|'V'|'F'|'U'};
export type MaterialJoinIntent={kind:'material-join';pairs:readonly MaterialJoinPair[];parametric?:boolean};
export type MaterialJoinResult={doc:Doc;descendants:Map<string,string[]>;joinedPairs:number;mergedVertices:number;componentsBefore:number;componentsAfter:number;placement:'preserved'|'recomputed'|'unavailable'};
const same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
function fail(reason:string):never{throw new Error(`材料粘合失败：${reason}`);}

/** Only the explicitly chosen banks are united; all CP coordinates are exact.
 * No endpoint snapping, automatic placement, or inferred extra seams. */
export function joinMaterialEdges(doc:Doc,intent:MaterialJoinIntent):MaterialJoinResult{
 if(Object.hasOwn(intent??{},'parametric')){if(typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric){const r=appendMaterialTopologyGroup(doc,intent);return {doc:r.doc,descendants:r.descendants,...r.join!};}const {parametric:_,...recipe}=intent;return buildMaterialJoinGeometry(doc,recipe);}
 return buildMaterialJoinGeometry(doc,intent);
}
export function buildMaterialJoinGeometry(doc:Doc,intent:MaterialJoinIntent):MaterialJoinResult{
 validateDoc(doc);
 if(!intent||intent.kind!=='material-join'||Object.keys(intent).some(k=>!['kind','pairs'].includes(k))||!Array.isArray(intent.pairs)||!intent.pairs.length||intent.pairs.length>256)fail('需要1–256对明确的材料边界。');
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);
 const graph=old.graph,coords=graph.vertices_coords,faces=graph.faces_vertices!,faceEdges=graph.faces_edges!,edgeById=new Map(old.edgeSegmentIds.map((id,e)=>[id,e]));
 const parent=coords.map((_,v)=>v),find=(v:number):number=>{let r=v;while(parent[r]!==r)r=parent[r];while(parent[v]!==v){const next=parent[v];parent[v]=r;v=next;}return r;};
 const union=(a:number,b:number)=>{const x=find(a),y=find(b);if(x!==y)parent[Math.max(x,y)]=Math.min(x,y);};
 const used=new Set<number>(),removed=new Map<number,number>(),seams=new Map<number,MaterialJoinPair>();
 const side=(e:number)=>{const owners=graph.edges_faces![e];if(graph.edges_assignment[e]!=='B'||owners.length!==1)fail('只能粘合具有一个材料面的边界或切口边。');const f=owners[0],rs=materialFaceEdgeRings(graph,f),h=rs.findIndex(r=>r.includes(e)),k=rs[h]?.indexOf(e);if(k===undefined||k<0)fail('原材料边的角槽失效。');const ring=materialFaceRings(graph,f)[h];return {f,a:ring[k],b:ring[(k+1)%ring.length]};};
 for(const pair of intent.pairs){
  if(!pair||Object.keys(pair).sort().join(',')!=='assignment,first,second'||typeof pair.first!=='string'||typeof pair.second!=='string'||pair.first===pair.second||!['M','V','F','U'].includes(pair.assignment))fail('粘合配对或连接线型无效。');
  const first=edgeById.get(pair.first),second=edgeById.get(pair.second);if(first===undefined||second===undefined)fail('材料边ID不存在或已经失效。');
  if(used.has(first)||used.has(second))fail('同一边界不能重复参加多个粘合。');used.add(first);used.add(second);
  const a=side(first),b=side(second);if(a.f===b.f&&!hasWeakMaterialBanks(graph))fail('不能把同一材料面的两条边粘合成自接面。');
  if(!same(coords[a.a],coords[b.b])||!same(coords[a.b],coords[b.a]))fail('两侧边界必须从相反方向使用完全重合的CP端点；请先明确调整部件，粘合不会吸附或移动坐标。');
  union(a.a,b.b);union(a.b,b.a);removed.set(second,first);seams.set(first,pair);
 }
 const roots=new Map<number,number>(),vertexSource:number[]=[],vertexMap=coords.map((_,v)=>{
  const root=find(v);let id=roots.get(root);if(id===undefined){id=vertexSource.length;roots.set(root,id);vertexSource.push(root);}return id;
 });
 const edgeMap:number[]=[],edges:[number,number][]=[],kinds:string[]=[],angles:(number|null)[]=[],ids:string[]=[];
 graph.edges_vertices.forEach(([a,b],e)=>{if(removed.has(e))return;edgeMap[e]=edges.length;edges.push([vertexMap[a],vertexMap[b]]);const seam=seams.get(e),kind=seam?.assignment??graph.edges_assignment[e];kinds.push(kind);angles.push(seam?(kind==='M'?-180:kind==='V'?180:kind==='F'?0:null):graph.edges_foldAngle[e]);ids.push(old.edgeSegmentIds[e]);});
 removed.forEach((first,second)=>{edgeMap[second]=edgeMap[first];});
 const newFaces=faces.map(face=>face.map(v=>vertexMap[v])),newFaceEdges=faceEdges.map(row=>row.map(e=>edgeMap[e])),owners=edges.map(()=>[] as number[]);
 newFaceEdges.forEach((row,f)=>row.forEach(e=>owners[e].push(f)));
 const rebuilt=materialCanonical(vertexSource.map(v=>[...coords[v]]),edges,kinds,angles,newFaces,newFaceEdges,materialHoles(graph).map(rs=>rs.map(r=>r.map(v=>vertexMap[v]))),materialHoleEdges(graph).map(rs=>rs.map(r=>r.map(e=>edgeMap[e]))));
 const removedIDs=new Map([...removed].map(([second,first])=>[old.edgeSegmentIds[second],old.edgeSegmentIds[first]])),newByID=new Map(ids.map((id,e)=>[id,e]));
 const next:Doc={...structuredClone(doc),segments:doc.segments.filter(s=>!removedIDs.has(s.id)).map(s=>{
  const e=newByID.get(s.id);return e===undefined?structuredClone(s):{...s,assignment:kinds[e] as Segment['assignment'],angle:angles[e]};
 })};
 const root=resolveStartingFace(doc,graph);if(root.stale)fail('原固定面身份已失效，请先重选固定面。');
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,rebuilt,ids,{startingFace:root.face})};
 let placement:MaterialJoinResult['placement']='unavailable';
 if(old.foldedVertices){
  const sourceFF=old.foldedVertices,ff=vertexSource.map(v=>[...sourceFF[v]] as Point);
  const preservesAll=sourceFF.every((p,v)=>same(p,ff[vertexMap[v]]));
  let verified:ReturnType<typeof createMaterialTopology>|undefined;
  if(preservesAll){try{verified=createMaterialTopology(next,rebuilt,ids,{foldedVertices:ff,startingFace:old.startingFace??0});placement='preserved';}catch{/* Different hinge orientation requires an independently validated refold. */}}
  if(!verified){const folded=refoldMaterialJoinedFaces(doc,next);verified=createMaterialTopology(next,rebuilt,ids,{foldedVertices:folded,startingFace:old.startingFace??0});placement='recomputed';}
  next.metadata.materialTopology=verified;
 }
 validateDoc(next);const checked=inspectMaterialTopology(next);if(!checked.ok)fail(checked.reason);
 const descendants=new Map(doc.segments.map(s=>[s.id,[removedIDs.get(s.id)??s.id]]));
 return {doc:next,descendants,joinedPairs:intent.pairs.length,mergedVertices:coords.length-vertexSource.length,componentsBefore:old.components.length,componentsAfter:checked.components.length,placement};
}
