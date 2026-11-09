/** Explicit face subdivision and face-union transactions. No coordinate welding. */
import type {Doc,FoldGraph,Point,Segment} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialCanonical as canonical,materialRoot as rootOf,finishMaterialFaces as finish,materialMix as mix,materialFaceFail as fail,type CheckedMaterial as Checked,type MaterialFaceAnchor,type MaterialFaceEditResult} from './materialFaceCommon';
import {traceMaterialFaces,traceMaterialRay,buildMaterialTrace,type MaterialFaceTraceIntent,type MaterialFaceRayIntent} from './materialTrace';
import {traceMaterialBatch,type MaterialTraceBatchIntent} from './materialTraceBatch';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from './materialReflect';
import {editMaterialCurveModel,appendMaterialTopologyGroup,appendMaterialFaceOperationGroup,type MaterialCurveModelIntent} from './materialCurveModel';
import {constructMaterialCurves,type MaterialCurveIntent} from './materialCurves';
import {constructMaterialNetwork,type MaterialFaceNetworkIntent} from './materialNetwork';
import {buildMaterialTopologyGeometry,type MaterialTopologyRecipe} from './materialTopologyRecipe';
import {transformMaterialComponents,type MaterialComponentTransformIntent} from './materialComponentTransform';
import {appendMaterialCopyGroup} from './materialCurveModel';
import {buildMaterialCopyGeometry} from './materialCopyRecipe';
import type {MaterialCopyIntent} from './materialCopy';
import type {MaterialConstructionCopyIntent} from '../app/materialConstructionCopy';
import {buildMaterialConstructionCopyGeometry} from './materialConstructionCopyRecipe';
import {appendMaterialConstructionCopyGroup} from './materialCurveModel';
import {materialFaceRings,materialFaceEdgeRings,materialHoles,materialHoleEdges} from './materialRings';
import {hasWeakMaterialRings,hasWeakMaterialFaceRings} from './materialWeak';
import {walkMaterialFaceDarts} from './materialHoleSplit';
import {buildMaterialClipboardGeometry,type MaterialClipboardRecipe} from './materialClipboardRecipe';
import type {MaterialConstructionMoveIntent} from '../app/materialConstructionMove';
import {buildMaterialConstructionMoveGeometry} from './materialConstructionMoveRecipe';
import {editMaterialLineProperties,type MaterialLinePropertiesIntent} from './materialLineProperties';
import {editMaterialReferenceFace,type MaterialReferenceFaceIntent} from './materialReferenceFace';
import {editMaterialAuxiliary,type MaterialAuxiliaryIntent} from './materialAuxiliary';
import {appendMaterialConstructionMoveGroup} from './materialCurveModel';
import {appendMaterialClipboardGroup} from './materialCurveModel';
export type {MaterialFaceAnchor,MaterialFaceEditResult} from './materialFaceCommon';
export type {MaterialFaceTraceIntent} from './materialTrace';
export type {MaterialFaceRayIntent} from './materialTrace';
export type {MaterialCurveIntent} from './materialCurves';
export type {MaterialFaceNetworkIntent} from './materialNetwork';
export type {MaterialTraceBatchIntent} from './materialTraceBatch';

export type MaterialFaceInsertIntent={kind:'material-face-insert';face:number;from:MaterialFaceAnchor;to:MaterialFaceAnchor;assignment:'M'|'V'|'F'|'U';fixedPart:0|1;cpOnly?:boolean;parametric?:boolean};
export type MaterialFaceRemoveIntent={kind:'material-face-remove';segmentIds:readonly string[];parametric?:boolean};
export type MaterialFaceEditIntent=MaterialAuxiliaryIntent|MaterialReferenceFaceIntent|MaterialLinePropertiesIntent|MaterialConstructionMoveIntent|MaterialClipboardRecipe|MaterialConstructionCopyIntent|MaterialCopyIntent|MaterialComponentTransformIntent|MaterialTopologyRecipe|MaterialCurveModelIntent|MaterialCurveIntent|MaterialFaceInsertIntent|MaterialFaceRemoveIntent|MaterialFaceTraceIntent|MaterialFaceRayIntent|MaterialFaceNetworkIntent|MaterialTraceBatchIntent|MaterialEdgeReflectIntent;
const keys=(v:object,wanted:string)=>Object.keys(v).sort().join(',')===wanted;

/** Linear position along the indexed edge, not along its screen orientation. */
export function materialAnchorPoint(graph:FoldGraph,ids:readonly string[],anchor:MaterialFaceAnchor):Point{
 const e=ids.indexOf(anchor.edgeId);if(e<0||!Number.isFinite(anchor.fraction)||anchor.fraction<0||anchor.fraction>1)fail('端点边或沿边比例无效。');
 const [a,b]=graph.edges_vertices[e];return anchor.fraction===0?[...graph.vertices_coords[a]]:anchor.fraction===1?[...graph.vertices_coords[b]]:mix(graph.vertices_coords[a],graph.vertices_coords[b],anchor.fraction);
}

export function editMaterialFaces(doc:Doc,intent:MaterialFaceEditIntent):MaterialFaceEditResult{
 validateDoc(doc);if(!intent||typeof intent!=='object')fail('缺少明确编辑意图。');
 if(['material-curve-group-edit','material-curve-group-remove','material-curves-rebase'].includes(intent.kind))return editMaterialCurveModel(doc,intent as MaterialCurveModelIntent);
 if(intent.kind==='material-clipboard-paste'||intent.kind==='material-clipboard-cut'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent;return intent.parametric?appendMaterialClipboardGroup(doc,recipe):buildMaterialClipboardGeometry(doc,recipe);}
 if(intent.kind==='material-auxiliary')return editMaterialAuxiliary(doc,intent);
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);
 if(intent.kind==='material-reference-face')return editMaterialReferenceFace(doc,intent);
 if(intent.kind==='material-line-properties')return editMaterialLineProperties(doc,intent);
 if(intent.kind==='material-construction-move'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent;return intent.parametric?appendMaterialConstructionMoveGroup(doc,recipe):buildMaterialConstructionMoveGeometry(doc,recipe);}
 if(intent.kind==='material-transform')return transformMaterialComponents(doc,intent);
 if(intent.kind==='material-construction-copy'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent;return intent.parametric?appendMaterialConstructionCopyGroup(doc,recipe):buildMaterialConstructionCopyGeometry(doc,recipe);}
 if(intent.kind==='material-copy'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent;return intent.parametric?appendMaterialCopyGroup(doc,recipe):buildMaterialCopyGeometry(doc,recipe);}
 if(intent.kind==='material-cut'||intent.kind==='material-join'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric)return appendMaterialTopologyGroup(doc,intent);const {parametric:_,...recipe}=intent;return buildMaterialTopologyGeometry(doc,recipe);}
 if(intent.kind==='material-face-insert'||intent.kind==='material-face-remove'){if(Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent;return intent.parametric?appendMaterialFaceOperationGroup(doc,recipe):recipe.kind==='material-face-insert'?insert(doc,old,recipe):remove(doc,old,recipe);}
 if(intent.kind==='material-face-trace')return traceMaterialFaces(doc,old,intent);
 if(intent.kind==='material-face-ray')return traceMaterialRay(doc,old,intent);
 if(['material-curve-group-edit','material-curve-group-remove','material-curves-rebase'].includes(intent.kind))return editMaterialCurveModel(doc,intent as MaterialCurveModelIntent);
 if(intent.kind==='material-face-curves')return constructMaterialCurves(doc,intent);
 if(intent.kind==='material-face-network')return constructMaterialNetwork(doc,intent);
 if(intent.kind==='material-face-traces')return traceMaterialBatch(doc,intent);
 if(intent.kind==='material-edge-reflect')return reflectMaterialEdge(doc,intent);
 return fail('未知面编辑操作。');
}
export function buildMaterialFaceInsert(doc:Doc,intent:MaterialFaceInsertIntent):MaterialFaceEditResult{validateDoc(doc);const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);return insert(doc,old,intent);}
export function buildMaterialFaceRemove(doc:Doc,intent:MaterialFaceRemoveIntent):MaterialFaceEditResult{validateDoc(doc);const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);return remove(doc,old,intent);}
function insert(doc:Doc,old:Checked,intent:MaterialFaceInsertIntent):MaterialFaceEditResult{
 if(!(keys(intent,'assignment,face,fixedPart,from,kind,to')||typeof intent.cpOnly==='boolean'&&keys(intent,'assignment,cpOnly,face,fixedPart,from,kind,to'))||!Number.isInteger(intent.face)||intent.face<0||intent.face>=old.graph.faces_vertices!.length||![0,1].includes(intent.fixedPart)||!['M','V','F','U'].includes(intent.assignment)||[intent.from,intent.to].some(a=>!a||!keys(a,'edgeId,fraction')||typeof a.edgeId!=='string'||!Number.isFinite(a.fraction)||a.fraction<0||a.fraction>1))fail('面、端点、线型或固定侧参数无效。');
 if(old.graph.faces_holes?.[intent.face]?.length||hasWeakMaterialFaceRings(old.graph,intent.face)){const edges=new Set(materialFaceEdgeRings(old.graph,intent.face).flat().map(e=>old.edgeSegmentIds[e]));if(!edges.has(intent.from.edgeId)||!edges.has(intent.to.edgeId))fail('端点必须属于选定材料面的内外边界。');const component=old.components.findIndex(c=>c.faces.includes(intent.face)),b=buildMaterialTrace(doc,old,{kind:'material-face-trace',component,from:intent.from,to:intent.to,assignment:intent.assignment,fixedSide:intent.fixedPart===0?'left':'right',...(intent.cpOnly!==undefined?{cpOnly:intent.cpOnly}:{})},undefined,intent.face);return finish(doc,old,b.graph,b.ids,b.segments,b.sources,b.root,b.oldRoot,intent.cpOnly?undefined:b.ff,b.descendants,b.extra);}
 const g=old.graph,coords=g.vertices_coords.map(p=>[...p] as Point),ff=intent.cpOnly?undefined:old.foldedVertices?.map(p=>[...p] as Point),edges=g.edges_vertices.map(e=>[...e] as [number,number]),kinds=[...g.edges_assignment],angles=[...g.edges_foldAngle],ids=[...old.edgeSegmentIds];
 const face=intent.face,at=g.faces_edges![face],edgeIndex=new Map(ids.map((id,e)=>[id,e])),oldRoot=rootOf(doc,old),used=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]);
 const unique=(base:string)=>{let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;used.add(id);return id;};
 const additions=new Map<number,{v:number;t:number}>(),anchor=(a:MaterialFaceAnchor)=>{
  const e=edgeIndex.get(a.edgeId);if(e===undefined||!at.includes(e))fail('端点必须明确属于选中材料面的边，不能取其他切口侧或其他部件。');
  const [v,w]=g.edges_vertices[e];if(a.fraction===0)return v;if(a.fraction===1)return w;
  if(additions.has(e))fail('同一边的两个端点不能生成面内折痕。');
  const p=materialAnchorPoint(g,ids,a),next=coords.length;coords.push(p);if(ff)ff.push(mix(old.foldedVertices![v],old.foldedVertices![w],a.fraction));additions.set(e,{v:next,t:a.fraction});return next;
 };
 const a=anchor(intent.from),b=anchor(intent.to);if(a===b)fail('新折痕的两个端点相同。');
 // A slit bank in the SAME component must have a matching geometric
 // partition, or the strict embedding contract would have a point-on-edge.
 // Partition the opposite bank with a SEPARATE indexed vertex and old FF:
 // this does not glue it, add a crease there, or merge either material fan.
 const components:number[]=[];old.components.forEach((c,i)=>c.faces.forEach(f=>components[f]=i));let synchronizedBanks=0;
 for(const [e,addition]of [...additions])if(g.edges_assignment[e]==='B'){
  const [a,b]=g.edges_vertices[e].map(v=>g.vertices_coords[v]),same=(p:Point,q:Point)=>p[0]===q[0]&&p[1]===q[1];
  g.edges_vertices.forEach(([v,w],other)=>{
   if(other===e||g.edges_assignment[other]!=='B'||components[g.edges_faces![e][0]]!==components[g.edges_faces![other][0]])return;
   const forward=same(a,g.vertices_coords[v])&&same(b,g.vertices_coords[w]),reverse=same(a,g.vertices_coords[w])&&same(b,g.vertices_coords[v]);if(!forward&&!reverse)return;
   if(additions.has(other))fail('重合切口两侧的端点细分存在歧义，请分别编辑。');
   const t=forward?addition.t:1-addition.t,id=coords.length;coords.push([...coords[addition.v]]);if(ff)ff.push(mix(old.foldedVertices![v],old.foldedVertices![w],t));additions.set(other,{v:id,t});synchronizedBanks++;
  });
 }
 const paths=new Map<number,{vertices:number[];edges:number[]}>(),sources=ids.map((_,e)=>e),descendants=new Map(doc.segments.map(s=>[s.id,[s.id]]));
 additions.forEach(({v},e)=>{const [start,end]=g.edges_vertices[e],ne=edges.length,newID=unique(`${ids[e]}::face-part`);edges[e]=[start,v];edges.push([v,end]);kinds.push(kinds[e]);angles.push(angles[e]);ids.push(newID);sources.push(e);paths.set(e,{vertices:[start,v,end],edges:[e,ne]});descendants.set(old.edgeSegmentIds[e],[ids[e],newID]);});
 const faces:number[][]=[],faceEdges:number[][]=[],holes=materialHoles(g),holeEdges=materialHoleEdges(g);
 g.faces_vertices!.forEach((row,f)=>{const vs:number[]=[],es:number[]=[];row.forEach((v,k)=>{const e=g.faces_edges![f][k],path=paths.get(e);if(!path){vs.push(v);es.push(e);return;}const forward=path.vertices[0]===v;vs.push(v,path.vertices[1]);es.push(...(forward?path.edges:[...path.edges].reverse()));});faces.push(vs);faceEdges.push(es);});
 holes.forEach((rs,f)=>rs.forEach((row,h)=>{const vs:number[]=[],es:number[]=[];row.forEach((v,k)=>{const e=holeEdges[f][h][k],path=paths.get(e);if(!path){vs.push(v);es.push(e);return;}vs.push(v,path.vertices[1]);es.push(...(path.vertices[0]===v?path.edges:[...path.edges].reverse()));});holes[f][h]=vs;holeEdges[f][h]=es;}));
 const row=faces[face],es=faceEdges[face],i=row.indexOf(a),j=row.indexOf(b);if(i<0||j<0)fail('端点未写入原面。');
 const branch=(start:number,end:number)=>{const vs:number[]=[],ee:number[]=[];for(let k=start;k!==end;k=(k+1)%row.length){vs.push(row[k]);ee.push(es[k]);}vs.push(row[end]);return {vs,ee};};
 const first=branch(i,j),second=branch(j,i);if(first.vs.length<3||second.vs.length<3)fail('新折痕沿已有边或未把面分成两个非退化面。');
 const ne=edges.length,newID=unique('material-face-crease');edges.push([a,b]);kinds.push(intent.assignment);angles.push(intent.assignment==='M'?-180:intent.assignment==='V'?180:intent.assignment==='F'?0:null);ids.push(newID);
 faces[face]=first.vs;faceEdges[face]=[...first.ee,ne];faces.push(second.vs);faceEdges.push([...second.ee,ne]);holes.push([]);holeEdges.push([]);
 const ancestry=g.faces_vertices!.map((_,f)=>[f]);ancestry.push([face]);const root=oldRoot===face&&intent.fixedPart===1?faces.length-1:oldRoot;
 const byID=new Map(doc.segments.map(s=>[s.id,s])),updated=new Map<string,Segment>();ids.slice(0,-1).forEach((id,e)=>{const source=sources[e],s=byID.get(old.edgeSegmentIds[source])!,[v,w]=edges[e],p=g.vertices_coords[g.edges_vertices[source][0]],forward=s.a[0]===p[0]&&s.a[1]===p[1];updated.set(id,{...s,id,a:[...coords[forward?v:w]],b:[...coords[forward?w:v]]});});
 const segments=[...doc.segments.map(s=>updated.get(s.id)??structuredClone(s)),...ids.slice(old.edgeSegmentIds.length,-1).map(id=>updated.get(id)!),{id:newID,a:[...coords[a]] as Point,b:[...coords[b]] as Point,assignment:intent.assignment,angle:angles[ne]}];
 return finish(doc,old,canonical(coords,edges,kinds,angles,faces,faceEdges,holes,holeEdges),ids,segments,ancestry,root,oldRoot,ff,descendants,{addedVertices:coords.length-g.vertices_coords.length,removedEdges:0,synchronizedBanks,insertedId:newID});
}

function remove(doc:Doc,old:Checked,intent:MaterialFaceRemoveIntent):MaterialFaceEditResult{
 if(!keys(intent,'kind,segmentIds')||!Array.isArray(intent.segmentIds)||!intent.segmentIds.length||intent.segmentIds.length>16384||intent.segmentIds.some(id=>typeof id!=='string'||!id)||new Set(intent.segmentIds).size!==intent.segmentIds.length)fail('需要不同的材料内边ID。');
 const g=old.graph,faces=g.faces_vertices!,fe=g.faces_edges!,index=new Map(old.edgeSegmentIds.map((id,e)=>[id,e])),parent=faces.map((_,f)=>f),find=(f:number):number=>{let root=f;while(parent[root]!==root)root=parent[root];while(parent[f]!==f){const p=parent[f];parent[f]=root;f=p;}return root;},removed=new Set(intent.segmentIds.map(id=>{const e=index.get(id);if(e===undefined||g.edges_assignment[e]==='B'||g.edges_faces![e].length!==2)fail('只能删除材料内部折痕；纸边和切口边请用独立切开或粘合操作。');return e;}));
 removed.forEach(e=>{const [a,b]=g.edges_faces![e].map(find);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);});
 const groups=new Map<number,number[]>();faces.forEach((_,f)=>{const root=find(f),group=groups.get(root);if(group)group.push(f);else groups.set(root,[f]);});
 const newFaces:number[][]=[],newFE:number[][]=[],newHoles:number[][][]=[],newHoleEdges:number[][][]=[],ancestry:number[][]=[],faceMap:number[]=[];
 for(const fs of groups.values()){
  const rows: {a:number;b:number;e:number}[]=[];
  for(const f of fs)materialFaceRings(g,f).forEach((ring,h)=>ring.forEach((a,k)=>{const e=materialFaceEdgeRings(g,f)[h][k];if(removed.has(e))return;if(!hasWeakMaterialRings(g)&&g.edges_faces![e].length===2&&find(g.edges_faces![e][0])===find(g.edges_faces![e][1]))fail('合并区域内仍有未删除折痕，请明确选中该区域全部需要合并的内边。');rows.push({a,b:ring[(k+1)%ring.length],e});}));
  if(hasWeakMaterialRings(g)){
   const parts=walkMaterialFaceDarts(g.vertices_coords,rows,true);if(parts.length!==1)fail('删除后的原区域没有唯一材料面，未推断或丢弃剩余折痕。');const p=parts[0],f=newFaces.length;fs.forEach(oldFace=>faceMap[oldFace]=f);newFaces.push(p.vertices);newFE.push(p.edges);newHoles.push((p.holes??[]).map(h=>h.vertices));newHoleEdges.push((p.holes??[]).map(h=>h.edges));ancestry.push(fs);continue;
  }
  const byStart=new Map<number,typeof rows[number]>();for(const row of rows){if(byStart.has(row.a))fail('合并面含孔洞、切口重复角或多重边界，不能表示为单个简单面。');byStart.set(row.a,row);}
  if(!rows.length)fail('删除后没有有效面边界。');const visited=new Set<number>(),loops:{vs:number[];es:number[];area:number}[]=[];
  for(const seed of rows){if(visited.has(seed.a))continue;const vs:number[]=[],es:number[]=[],start=seed.a;let v=start;do{const row=byStart.get(v);if(!row||visited.has(v)||vs.length>=rows.length)fail('合并面边界无法闭合。');visited.add(v);vs.push(v);es.push(row.e);v=row.b;}while(v!==start);const p=vs.map(v=>g.vertices_coords[v]),origin=p[0],area=p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+(a[0]-origin[0])*(b[1]-origin[1])-(a[1]-origin[1])*(b[0]-origin[0]);},0);loops.push({vs,es,area});}
  const outer=loops.filter(r=>r.area>0),holes=loops.filter(r=>r.area<0);if(outer.length!==1||outer.length+holes.length!==loops.length)fail('合并区域必须有唯一非退化外圈，不能把断开区域当作一个面。');
  const f=newFaces.length;fs.forEach(oldFace=>faceMap[oldFace]=f);newFaces.push(outer[0].vs);newFE.push(outer[0].es);newHoles.push(holes.map(r=>r.vs));newHoleEdges.push(holes.map(r=>r.es));ancestry.push(fs);
 }
 const kept=new Set([...newFaces.flat(),...newHoles.flat(2)]),vertexSources=g.vertices_coords.flatMap((_,v)=>kept.has(v)?[v]:[]),vertexMap=new Map(vertexSources.map((v,i)=>[v,i])),edgeMap:number[]=[],ids:string[]=[],edges:[number,number][]=[],kinds:string[]=[],angles:(number|null)[]=[];
 g.edges_vertices.forEach(([a,b],e)=>{if(removed.has(e))return;edgeMap[e]=edges.length;edges.push([vertexMap.get(a)!,vertexMap.get(b)!]);ids.push(old.edgeSegmentIds[e]);kinds.push(g.edges_assignment[e]);angles.push(g.edges_foldAngle[e]);});
 const coords=vertexSources.map(v=>[...g.vertices_coords[v]] as Point),ff=old.foldedVertices?vertexSources.map(v=>[...old.foldedVertices![v]] as Point):undefined;
 const removedIDs=new Set(intent.segmentIds),segments=doc.segments.filter(s=>!removedIDs.has(s.id)).map(s=>structuredClone(s)),descendants=new Map(doc.segments.map(s=>[s.id,removedIDs.has(s.id)?[]:[s.id]]));
 const oldRoot=rootOf(doc,old),graph=canonical(coords,edges,kinds,angles,newFaces.map(face=>face.map(v=>vertexMap.get(v)!)),newFE.map(row=>row.map(e=>edgeMap[e])),newHoles.map(rs=>rs.map(r=>r.map(v=>vertexMap.get(v)!))),newHoleEdges.map(rs=>rs.map(r=>r.map(e=>edgeMap[e]))));
 return {...finish(doc,old,graph,ids,segments,ancestry,faceMap[oldRoot],oldRoot,ff,descendants,{addedVertices:0,removedEdges:removed.size,synchronizedBanks:0}),faceSources:ancestry};
}
