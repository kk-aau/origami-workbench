/** A material cut changes explicit face-corner identity, never coordinates. */
import type {Doc,FoldGraph,Point,Segment} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {materialFaceVertices,materialFaceEdges,materialFaceRings} from './materialRings';
import {appendMaterialTopologyGroup} from './materialCurveModel';
import {materialCanonical} from './materialFaceCommon';

export type MaterialCutIntent={kind:'material-cut';segmentIds:readonly string[];parametric?:boolean};
export type MaterialCutResult={doc:Doc;descendants:Map<string,string[]>;cutEdges:number;addedVertices:number;componentsBefore:number;componentsAfter:number};
function fail(message:string):never{throw new Error(`材料切开失败：${message}`);}

/** Split corner fans across the selected indexed hinges. Existing parallel
 * banks use faces_edges; endpoint equality never identifies their owners.
 * Faces keep their IDs and all CP/FF coordinates retain exact source values. */
export function cutMaterialEdges(doc:Doc,intent:MaterialCutIntent):MaterialCutResult{
 if(Object.hasOwn(intent??{},'parametric')){if(typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric){const r=appendMaterialTopologyGroup(doc,intent);return {doc:r.doc,descendants:r.descendants,...r.cut!};}const {parametric:_,...recipe}=intent;return buildMaterialCutGeometry(doc,recipe);}
 return buildMaterialCutGeometry(doc,intent);
}
export function buildMaterialCutGeometry(doc:Doc,intent:MaterialCutIntent):MaterialCutResult{
 validateDoc(doc);
 if(!intent||intent.kind!=='material-cut'||Object.keys(intent).some(k=>!['kind','segmentIds'].includes(k))||
  !Array.isArray(intent.segmentIds)||!intent.segmentIds.length||intent.segmentIds.length>16384||
  intent.segmentIds.some(id=>typeof id!=='string'||!id)||new Set(intent.segmentIds).size!==intent.segmentIds.length)fail('请选择不同的有效材料内边 ID。');
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);
 const graph=old.graph,faces=graph.faces_vertices!.map((_,f)=>materialFaceVertices(graph,f)),faceEdges=graph.faces_vertices!.map((_,f)=>materialFaceEdges(graph,f)),owners=graph.edges_faces!;
 const edgeByID=new Map(old.edgeSegmentIds.map((id,e)=>[id,e]));
 const cuts=new Set(intent.segmentIds.map(id=>{const e=edgeByID.get(id);if(e===undefined)fail('选择含辅助线或已经失效的材料边。');if(graph.edges_assignment[e]==='B'||owners[e].length!==2)fail('已经是切口或外边界的材料边不能再次切开。');return e;}));
 const starts:number[]=[];let cornerCount=0;faces.forEach(face=>{starts.push(cornerCount);cornerCount+=face.length;});
 const darts=graph.edges_vertices.map(()=>[] as {f:number;k:number;next:number}[]);
 faces.forEach((_,f)=>{let offset=0;for(const ring of materialFaceRings(graph,f)){for(let i=0;i<ring.length;i++){const k=offset+i;darts[faceEdges[f][k]].push({f,k,next:offset+(i+1)%ring.length});}offset+=ring.length;}});
 const parent=Array.from({length:cornerCount},(_,i)=>i);
 const find=(v:number):number=>{let r=v;while(parent[r]!==r)r=parent[r];while(parent[v]!==v){const p=parent[v];parent[v]=r;v=p;}return r;};
 const join=(a:number,b:number)=>{const x=find(a),y=find(b);if(x!==y)parent[Math.max(x,y)]=Math.min(x,y);};
 darts.forEach((ds,e)=>{if(ds.length!==2||cuts.has(e))return;const [a,b]=ds;if(faces[a.f][a.k]!==faces[b.f][b.next]||faces[a.f][a.next]!==faces[b.f][b.k])fail('原共享边的相反面角失效。');join(starts[a.f]+a.k,starts[b.f]+b.next);join(starts[a.f]+a.next,starts[b.f]+b.k);});
 const coords:Point[]=graph.vertices_coords.map(p=>[...p]);
 const folded=old.foldedVertices?.map(p=>[...p] as Point),roots=new Map<number,number>(),usedVertices=new Set<number>();
 const newFaces=faces.map((face,f)=>face.map((v,k)=>{
  const root=find(starts[f]+k);let id=roots.get(root);
  if(id===undefined){
   if(!usedVertices.has(v)){id=v;usedVertices.add(v);}else{id=coords.length;coords.push([...graph.vertices_coords[v]]);folded?.push([...old.foldedVertices![v]]);}
   roots.set(root,id);
  }
  return id;
 }));
 const edges=graph.edges_vertices.map(e=>[...e] as [number,number]),kinds=[...graph.edges_assignment],angles=[...graph.edges_foldAngle];
 const newFaceEdges=faceEdges.map(row=>[...row]);
 const edgeSegmentIds=[...old.edgeSegmentIds],byID=new Map(doc.segments.map(s=>[s.id,s])),usedIDs=new Set([...byID.keys(),...(doc.objects??[]).map(o=>o.id)]);
 const descendants=new Map(doc.segments.map(s=>[s.id,[s.id]])),bankSource=new Map<number,number>();
 const verticesFor=(e:number,d:{f:number;k:number;next:number}):[number,number]=>{const a=newFaces[d.f][d.k],b=newFaces[d.f][d.next];return faces[d.f][d.k]===graph.edges_vertices[e][0]?[a,b]:[b,a];};
 darts.forEach((ds,e)=>{
  edges[e]=verticesFor(e,ds[0]);
  if(!cuts.has(e)){
   if(ds.some(d=>JSON.stringify(verticesFor(e,d))!==JSON.stringify(edges[e])))fail('未切开的共享边分离了材料角点。');
   return;
  }
  const [first,second]=ds,newEdge=edges.length,originalID=edgeSegmentIds[e];
  let n=1,newID=`${originalID}::cut-bank-${n}`;while(usedIDs.has(newID))newID=`${originalID}::cut-bank-${++n}`;usedIDs.add(newID);
  kinds[e]='B';angles[e]=0;
  edges.push(verticesFor(e,second));kinds.push('B');angles.push(0);edgeSegmentIds.push(newID);bankSource.set(newEdge,e);
  newFaceEdges[first.f][first.k]=e;newFaceEdges[second.f][second.k]=newEdge;descendants.set(originalID,[originalID,newID]);
 });
 const rings=newFaces.map((r,f)=>{let start=0;return materialFaceRings(graph,f).map(loop=>{const part=r.slice(start,start+loop.length);start+=loop.length;return part;});}),edgeRings=newFaceEdges.map((r,f)=>{let start=0;return materialFaceRings(graph,f).map(loop=>{const part=r.slice(start,start+loop.length);start+=loop.length;return part;});});
 const rebuilt=materialCanonical(coords,edges,kinds,angles,rings.map(rs=>rs[0]),edgeRings.map(rs=>rs[0]),rings.map(rs=>rs.slice(1)),edgeRings.map(rs=>rs.slice(1)));
 const updated=new Map<string,Segment>();
 edgeSegmentIds.forEach((id,e)=>{
  const source=bankSource.get(e)??e,original=byID.get(old.edgeSegmentIds[source])!,[a,b]=edges[e];
  const oldStart=graph.vertices_coords[graph.edges_vertices[source][0]],forward=original.a[0]===oldStart[0]&&original.a[1]===oldStart[1];
  updated.set(id,{...original,id,a:[...coords[forward?a:b]],b:[...coords[forward?b:a]],assignment:kinds[e] as Segment['assignment'],angle:angles[e]});
 });
 const next:Doc={...structuredClone(doc),segments:[...doc.segments.map(s=>updated.get(s.id)??structuredClone(s)),...edgeSegmentIds.slice(old.edgeSegmentIds.length).map(id=>updated.get(id)!)]};
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,rebuilt,edgeSegmentIds,{
  ...(folded?{foldedVertices:folded}:{}),...(old.startingFace===undefined?{}:{startingFace:old.startingFace}),
 })};
 validateDoc(next);const checked=inspectMaterialTopology(next);if(!checked.ok)fail(checked.reason);
 return {doc:next,descendants,cutEdges:cuts.size,addedVertices:coords.length-graph.vertices_coords.length,componentsBefore:old.components.length,componentsAfter:checked.components.length};
}
