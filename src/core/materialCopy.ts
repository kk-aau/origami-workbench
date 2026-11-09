/** Duplicate full indexed material components, including holes and slit banks. */
import type {Doc,Point,Segment} from './types';
import {validateDoc} from './types';
import {createMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {materialCanonical,materialRoot} from './materialFaceCommon';
import {materialHoles,materialHoleEdges} from './materialRings';
import {appendMaterialCopyGroup} from './materialCurveModel';

export type MaterialCopyPlacement={dx:number;dy:number;rotation:number;scale:number;mirror:'none'|'x'|'y'};
export type MaterialCopyIntent={kind:'material-copy';segmentIds:readonly string[];placements:readonly MaterialCopyPlacement[];parametric?:boolean};
export type MaterialCopyResult={doc:Doc;descendants:Map<string,string[]>;copiedIds:string[];sourceComponents:number;copies:number;componentsBefore:number;componentsAfter:number;pivot:Point};
function fail(reason:string):never{throw new Error(`材料复制失败：${reason}`);}
const keys=(v:object,allowed:string)=>Object.keys(v).sort().join(',')===allowed;

export function copyMaterialComponents(doc:Doc,intent:MaterialCopyIntent):MaterialCopyResult{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');
 const {parametric:_,...recipe}=intent??{};
 if(intent?.parametric){const r=appendMaterialCopyGroup(doc,recipe as MaterialCopyIntent);return {...r.copy!,doc:r.doc,descendants:r.descendants};}
 return buildMaterialCopyComponents(doc,recipe as MaterialCopyIntent);
}
export function buildMaterialCopyComponents(doc:Doc,intent:MaterialCopyIntent):MaterialCopyResult{
 validateDoc(doc);
 if(!intent||!keys(intent,'kind,placements,segmentIds')||intent.kind!=='material-copy'||!Array.isArray(intent.segmentIds)||!intent.segmentIds.length||Array.from(intent.segmentIds).some(id=>typeof id!=='string'||!id)||new Set(intent.segmentIds).size!==intent.segmentIds.length||!Array.isArray(intent.placements)||!intent.placements.length||intent.placements.length>64||Array.from(intent.placements).some(p=>!p||!keys(p,'dx,dy,mirror,rotation,scale')||![p.dx,p.dy,p.rotation,p.scale].every(Number.isFinite)||p.scale<=0||p.scale>1000||Math.abs(p.dx)>1e6||Math.abs(p.dy)>1e6||Math.abs(p.rotation)>36000||!['none','x','y'].includes(p.mirror)))fail('需要明确边身份和1–64个有限复制变换；比例必须为正。');
 return copyMaterialMappedComponents(doc,intent.segmentIds,intent.placements.map(placement=>pivot=>{const rad=placement.rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);return {mirrored:placement.mirror!=='none',point:(p:Point):Point=>{if(placement.rotation===0&&placement.scale===1&&placement.mirror==='none')return [p[0]+placement.dx,p[1]+placement.dy];let x=p[0]-pivot[0],y=p[1]-pivot[1];if(placement.mirror==='x')x=-x;if(placement.mirror==='y')y=-y;return [pivot[0]+placement.scale*(c*x-s*y)+placement.dx,pivot[1]+placement.scale*(s*x+c*y)+placement.dy];}};}));
}

/** Trusted point maps from explicit editor formulas. Not a user expression API.
 * Every new graph and FF is still validated before any document is committed. */
export function copyMaterialMappedComponents(doc:Doc,segmentIds:readonly string[],maps:readonly ((pivot:Point)=>{point:(p:Point)=>Point;mirrored:boolean})[]):MaterialCopyResult{
 validateDoc(doc);
 if(!Array.isArray(segmentIds)||!segmentIds.length||Array.from(segmentIds).some(id=>typeof id!=='string'||!id)||new Set(segmentIds).size!==segmentIds.length||!Array.isArray(maps)||!maps.length||maps.length>64||Array.from(maps).some(map=>typeof map!=='function'))fail('复制源或变换数量无效。');
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);
 const chosen=new Set(segmentIds),byId=new Map(doc.segments.map(s=>[s.id,s]));if(segmentIds.some(id=>!byId.has(id)))fail('选区含失效线段。');
 const selected=old.components.filter(c=>{const count=c.edges.filter(e=>chosen.has(old.edgeSegmentIds[e])).length;if(count&&count!==c.edges.length)fail('必须选择完整材料部件及其全部边界；部分折痕不能作为材料副本。');return count>0;});
 if(!selected.length)fail('请选择至少一个完整材料部件。');
 const vs=[...new Set(selected.flatMap(c=>c.vertices))].sort((a,b)=>a-b),es=[...new Set(selected.flatMap(c=>c.edges))].sort((a,b)=>a-b),fs=[...new Set(selected.flatMap(c=>c.faces))].sort((a,b)=>a-b),g=old.graph;
 const sourcePoints=vs.map(v=>g.vertices_coords[v]),pivot:Point=[(Math.min(...sourcePoints.map(p=>p[0]))+Math.max(...sourcePoints.map(p=>p[0])))/2,(Math.min(...sourcePoints.map(p=>p[1]))+Math.max(...sourcePoints.map(p=>p[1])))/2];
 const auxiliaries=doc.segments.filter(s=>s.assignment==='A'&&chosen.has(s.id)),n=maps.length;
 if(g.vertices_coords.length+vs.length*n>8192||g.faces_vertices!.length+fs.length*n>8192||g.faces_vertices!.reduce((sum,row)=>sum+row.length,0)+fs.reduce((sum,f)=>sum+g.faces_vertices![f].length,0)*n>65536)fail('复制结果超过材料或工程容量，未截断副本。');
 const coords=g.vertices_coords.map(p=>[...p] as Point),folded=old.foldedVertices?.map(p=>[...p] as Point),edges=g.edges_vertices.map(e=>[...e] as [number,number]),kinds=[...g.edges_assignment],angles=[...g.edges_foldAngle],faces=g.faces_vertices!.map(row=>[...row]),faceEdges=g.faces_edges!.map(row=>[...row]),holes=materialHoles(g),holeEdges=materialHoleEdges(g),ids=[...old.edgeSegmentIds],segments=doc.segments.map(s=>structuredClone(s)),descendants=new Map(doc.segments.map(s=>[s.id,[s.id]])),used=new Set([...byId.keys(),...(doc.objects??[]).map(o=>o.id)]),copiedIds:string[]=[];
 const unique=(base:string)=>{let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;used.add(id);return id;};
 for(const factory of maps){
  const {point,mirrored}=factory([...pivot]);
  const vertexMap=new Map<number,number>(),edgeMap=new Map<number,number>();
  for(const v of vs){vertexMap.set(v,coords.length);coords.push(point(g.vertices_coords[v]));folded?.push(point(old.foldedVertices![v]));}
  for(const e of es){const [a,b]=g.edges_vertices[e],id=unique(`${old.edgeSegmentIds[e]}::material-copy`),source=byId.get(old.edgeSegmentIds[e])!;edgeMap.set(e,edges.length);edges.push([vertexMap.get(a)!,vertexMap.get(b)!]);kinds.push(g.edges_assignment[e]);angles.push(g.edges_foldAngle[e]);ids.push(id);segments.push({...source,id,a:point([...source.a]),b:point([...source.b])});descendants.get(source.id)!.push(id);copiedIds.push(id);}
  for(const f of fs){const face=g.faces_vertices![f].map(v=>vertexMap.get(v)!),row=g.faces_edges![f].map(e=>edgeMap.get(e)!);faces.push(!mirrored?face:[face[0],...face.slice(1).reverse()]);faceEdges.push(!mirrored?row:[...row].reverse());holes.push((g.faces_holes?.[f]??[]).map(r=>{const vs=r.map(v=>vertexMap.get(v)!);return mirrored?[vs[0],...vs.slice(1).reverse()]:vs;}));holeEdges.push((g.faces_holeEdges?.[f]??[]).map(r=>{const es=r.map(e=>edgeMap.get(e)!);return mirrored?es.reverse():es;}));}
  for(const source of auxiliaries){const id=unique(`${source.id}::material-copy`);segments.push({...source,id,a:point(source.a),b:point(source.b)});descendants.get(source.id)!.push(id);copiedIds.push(id);}
 }
 const graph=materialCanonical(coords,edges,kinds,angles,faces,faceEdges,holes,holeEdges),root=materialRoot(doc,old),next:Doc={...structuredClone(doc),segments};
 // Bind legacy manual contours before an in-place copy makes them ambiguous.
 if(next.flatFold)next.flatFold={...next.flatFold,materialFace:root};
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,graph,ids,{startingFace:old.startingFace??0,...(folded?{foldedVertices:folded}:{})})};
 validateDoc(next);const checked=inspectMaterialTopology(next);if(!checked.ok)fail(checked.reason);
 return {doc:next,descendants,copiedIds,sourceComponents:selected.length,copies:maps.length,componentsBefore:old.components.length,componentsAfter:checked.components.length,pivot};
}
