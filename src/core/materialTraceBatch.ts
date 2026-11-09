import {materialOuterContour} from './materialWeak';
import type {Doc,Point,Segment} from './types';
import {validateDoc,LIMITS} from './types';
import {inspectMaterialTopology,createMaterialTopology} from './materialTopology';
import {materialFaceFail as fail,materialMix,materialRoot,finishMaterialFaces,type MaterialFaceAnchor} from './materialFaceCommon';
import {buildMaterialTrace} from './materialTrace';
import {materialPointInside} from './materialTraceGeometry';
import {materialFaceInside} from './materialRings';
import {appendMaterialTraceGroup} from './materialCurveModel';

export type MaterialBatchAssignment='M'|'V'|'F'|'U';
export type MaterialBatchLine={from:MaterialFaceAnchor;to:MaterialFaceAnchor;assignment:MaterialBatchAssignment};
export type MaterialBatchDetails={lines:number;pieces:{line:number;piece:number;id:string;from:Point;to:Point;assignment:MaterialBatchAssignment}[];blankLength:number;length:number;fixedPoint:Point;cpOnly:boolean};
export type MaterialTraceBatchIntent={kind:'material-face-traces';component:number|'all';lines:readonly MaterialBatchLine[];fixedPoint:Point;cpOnly:boolean;overrides:readonly {line:number;piece:number;assignment:MaterialBatchAssignment}[];parametric?:boolean};
export const MATERIAL_BATCH_LIMITS={lines:32,pieces:4096};
const keys=(v:object,allowed:string)=>Object.keys(v).sort().join(',')===allowed,types=['M','V','F','U'],same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
const read=(doc:Doc)=>{validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok)fail(m.reason);return m;};

/** Build all geometric subdivisions first. Intermediate F hinges never
 * invoke the M/V refolder; only the final complete graph is folded/committed. */
export function traceMaterialBatch(doc:Doc,intent:MaterialTraceBatchIntent):import('./materialFaceCommon').MaterialFaceEditResult & {batch:MaterialBatchDetails}{
 if(Object.hasOwn(intent??{},'parametric')){if(typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric)return appendMaterialTraceGroup(doc,intent) as import('./materialFaceCommon').MaterialFaceEditResult & {batch:MaterialBatchDetails};const {parametric:_,...recipe}=intent;return traceMaterialBatch(doc,recipe);}
 const old=read(doc);
 if(!intent||!keys(intent,'component,cpOnly,fixedPoint,kind,lines,overrides')||intent.kind!=='material-face-traces'||typeof intent.cpOnly!=='boolean'||!(intent.component==='all'||Number.isInteger(intent.component)&&intent.component>=0&&intent.component<old.components.length)||!Array.isArray(intent.lines)||!intent.lines.length||intent.lines.length>MATERIAL_BATCH_LIMITS.lines||Array.from(intent.lines).some(line=>!line||!keys(line,'assignment,from,to')||!types.includes(line.assignment)||[line.from,line.to].some(a=>!a||!keys(a,'edgeId,fraction')||typeof a.edgeId!=='string'||!Number.isFinite(a.fraction)||a.fraction<0||a.fraction>1))||!Array.isArray(intent.fixedPoint)||intent.fixedPoint.length!==2||Array.from(intent.fixedPoint).some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||!Array.isArray(intent.overrides)||intent.overrides.length>MATERIAL_BATCH_LIMITS.pieces||Array.from(intent.overrides).some(o=>!o||!keys(o,'assignment,line,piece')||!Number.isInteger(o.line)||o.line<0||o.line>=intent.lines.length||!Number.isInteger(o.piece)||o.piece<0||!types.includes(o.assignment))||new Set(intent.overrides.map(o=>`${o.line}:${o.piece}`)).size!==intent.overrides.length)fail('批量构造需要1–32条有效直线、固定面内点及明确的线段赋型。');
 const oldRoot=materialRoot(doc,old),original=old.graph,rootPolygon=materialOuterContour(original,oldRoot).map(v=>original.vertices_coords[v]);
 if(!materialFaceInside(original,oldRoot,intent.fixedPoint))fail('固定点必须严格位于当前起始面内部，不能落在面边或空白。');
 const selected=intent.component==='all'?old.components:[old.components[intent.component]],selectedEdges=new Set(selected.flatMap(c=>c.edges)),originalIndex=new Map(old.edgeSegmentIds.map((id,e)=>[id,e]));
 const endpoints=intent.lines.map(line=>[line.from,line.to].map(a=>{const e=originalIndex.get(a.edgeId);if(e===undefined||!selectedEdges.has(e))fail('批量端点边不属于指定材料部件。');const [v,w]=original.edges_vertices[e];return a.fraction===0?[...original.vertices_coords[v]] as Point:a.fraction===1?[...original.vertices_coords[w]] as Point:materialMix(original.vertices_coords[v],original.vertices_coords[w],a.fraction);}) as [Point,Point]);
 let stage=structuredClone(doc),sources=original.faces_vertices!.map((_,f)=>[f]),descendants=new Map(doc.segments.map(s=>[s.id,[s.id]])),lineIds:string[][]=[],sync=0,blank=0;
 if(intent.cpOnly)delete (stage.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;
 const remap=(anchor:MaterialFaceAnchor,p:Point):MaterialFaceAnchor=>{
  const current=read(stage),e=originalIndex.get(anchor.edgeId)!,[a,b]=original.edges_vertices[e].map(v=>original.vertices_coords[v]),axis=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1,param=(q:Point)=>(q[axis]-a[axis])/(b[axis]-a[axis]);
  for(const id of descendants.get(anchor.edgeId)??[]){const k=current.edgeSegmentIds.indexOf(id);if(k<0)continue;const [v,w]=current.graph.edges_vertices[k],x=current.graph.vertices_coords[v],y=current.graph.vertices_coords[w];if(same(p,x))return {edgeId:id,fraction:0};if(same(p,y))return {edgeId:id,fraction:1};const t=param(x),u=param(y);if(anchor.fraction>Math.min(t,u)&&anchor.fraction<Math.max(t,u))return {edgeId:id,fraction:(anchor.fraction-t)/(u-t)};}
  return fail('原边锚点在细分后没有唯一可用区间；未吸附端点。');
 };
 for(let i=0;i<intent.lines.length;i++){
  const m=read(stage),line=intent.lines[i],[p,q]=endpoints[i],from=remap(line.from,p),to=remap(line.to,q),built=buildMaterialTrace(stage,m,{kind:'material-face-trace',component:intent.component,from,to,assignment:'F',fixedSide:'left'},{from:p,to:q});
  const nextSources=built.sources.map(row=>[...new Set(row.flatMap(f=>sources[f]))]),expand=(ids:string[])=>ids.flatMap(id=>built.descendants.get(id)??[id]);
  descendants=new Map([...descendants].map(([id,ids])=>[id,expand(ids)]));lineIds=lineIds.map(expand);lineIds.push(built.extra.insertedIds);sources=nextSources;sync+=built.extra.synchronizedBanks;blank+=built.extra.trace.blankLength;
  if(lineIds.reduce((n,row)=>n+row.length,0)>MATERIAL_BATCH_LIMITS.pieces)fail('批量分段超过4096段或工程容量，未截断构造。');
  stage={...stage,segments:built.segments};const reference=built.sources.findIndex(row=>row.includes(m.startingFace??0));if(stage.flatFold)stage.flatFold={startingFace:materialOuterContour(built.graph,built.root).map(v=>[...built.graph.vertices_coords[v]]),materialFace:built.root};
  stage.metadata={...stage.metadata,materialTopology:createMaterialTopology(stage,built.graph,built.ids,{startingFace:reference<0?built.root:reference,...(built.ff?{foldedVertices:built.ff}:{})})};
 }
 const current=read(stage),g=structuredClone(current.graph),byId=new Map(stage.segments.map(s=>[s.id,s])),pieces:{line:number;piece:number;id:string;from:Point;to:Point;assignment:MaterialBatchAssignment}[]=[];
 lineIds.forEach((ids,line)=>{const [p,q]=endpoints[line],axis=Math.abs(q[0]-p[0])>=Math.abs(q[1]-p[1])?0:1,param=(x:Point)=>(x[axis]-p[axis])/(q[axis]-p[axis]);ids.sort((a,b)=>{const x=byId.get(a)!,y=byId.get(b)!;return Math.min(param(x.a),param(x.b))-Math.min(param(y.a),param(y.b))||current.edgeSegmentIds.indexOf(a)-current.edgeSegmentIds.indexOf(b);});ids.forEach((id,piece)=>{const s=byId.get(id)!,assignment=intent.overrides.find(o=>o.line===line&&o.piece===piece)?.assignment??intent.lines[line].assignment,forward=param(s.a)<param(s.b);pieces.push({line,piece,id,from:[...(forward?s.a:s.b)],to:[...(forward?s.b:s.a)],assignment});});});
 if(intent.overrides.some(o=>!pieces.some(p=>p.line===o.line&&p.piece===o.piece)))fail('线段赋型引用了不存在的分段，请重新预览。');
 for(const p of pieces){const e=current.edgeSegmentIds.indexOf(p.id);g.edges_assignment[e]=p.assignment;g.edges_foldAngle[e]=p.assignment==='M'?-180:p.assignment==='V'?180:p.assignment==='F'?0:null;}
 const rootCandidates=sources.flatMap((row,f)=>row.includes(oldRoot)&&materialFaceInside(g,f,intent.fixedPoint)?[f]:[]);if(rootCandidates.length!==1)fail('固定点位于新增折痕上或没有唯一材料子面，请移到待固定区域内部。');
 const kindById=new Map(pieces.map(p=>[p.id,p])),segments=stage.segments.map(s=>{const p=kindById.get(s.id);return p?{...s,assignment:p.assignment,angle:p.assignment==='M'?-180:p.assignment==='V'?180:p.assignment==='F'?0:null}:s;});
 const insertedIds=pieces.map(p=>p.id),result=finishMaterialFaces(doc,old,g,current.edgeSegmentIds,segments,sources,rootCandidates[0],oldRoot,intent.cpOnly?undefined:current.foldedVertices,descendants,{addedVertices:g.vertices_coords.length-original.vertices_coords.length,removedEdges:0,synchronizedBanks:sync,insertedIds});
 return {...result,batch:{lines:intent.lines.length,pieces,blankLength:blank,length:pieces.reduce((n,p)=>n+Math.hypot(p.to[0]-p.from[0],p.to[1]-p.from[1]),0),fixedPoint:[...intent.fixedPoint] as Point,cpOnly:intent.cpOnly}};
}
