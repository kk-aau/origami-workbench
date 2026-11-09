import type {Doc,Point} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {buildMaterialSegment} from './materialTrace';
import {finishMaterialFaces,materialFaceFail as fail} from './materialFaceCommon';
import {appendMaterialReflectGroup} from './materialCurveModel';
import {materialOrientation} from './materialTraceGeometry';

export type MaterialEdgeReflectIntent={kind:'material-edge-reflect';sourceId:string;axisId:string;sourceIds?:readonly string[];axisIds?:readonly string[];component:'source'|'all';fixedSide:'left'|'right';cpOnly:boolean;parametric?:boolean};
/** A saved finite edge may be subdivided. Only an indexed, ordered straight
 * chain is accepted; coincident banks and gaps do not form a source span. */
export function materialReflectSpan(doc:Doc,ids:readonly string[]){
 const m=inspectMaterialTopology(doc);if(!m.ok)fail(m.reason);if(!Array.isArray(ids)||!ids.length||ids.length>16384||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))fail('镜像来源区间无效。');
 const lines=ids.map(id=>{const s=doc.segments.find(s=>s.id===id);if(!s)fail('镜像来源边已不存在。');return s;});if(ids.length===1)return {a:lines[0].a,b:lines[0].b,segment:lines[0],ids:[...ids]};
 const edges=ids.map(id=>{const e=m.edgeSegmentIds.indexOf(id);if(e<0)fail('多段镜像来源须属于材料边。');return m.graph.edges_vertices[e];}),first=edges[0],second=edges[1],start=first.find(v=>!second.includes(v));if(start===undefined)fail('镜像来源不能为闭环或重合切口侧。');let cursor=start;const vertices=[start];
 for(const edge of edges){if(!edge.includes(cursor))fail('镜像来源不是连续的同一材料侧，未跨空白连接。');cursor=edge[0]===cursor?edge[1]:edge[0];if(vertices.includes(cursor))fail('镜像来源包含回绕或重复材料点。');vertices.push(cursor);}
 const a=m.graph.vertices_coords[start],b=m.graph.vertices_coords[cursor];if(vertices.some(v=>materialOrientation(a,b,m.graph.vertices_coords[v])!==0))fail('镜像来源分段已不共线，未用直线代替原几何。');if(lines.some(s=>s.assignment!==lines[0].assignment||s.angle!==lines[0].angle))fail('镜像来源分段的线型或折角不一致。');return {a,b,segment:lines[0],ids:[...ids]};
}
/** Unnormalized reflection avoids introducing sqrt rounding at 45-degree
 * axes. This evaluates the reflection, never snaps to nearby vertices. */
function reflected(p:Point,a:Point,b:Point,tolerance:number):Point{
 const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;if(!(den>tolerance*tolerance))fail('对称轴零长或低于可验证精度。');
 const x=p[0]-a[0],y=p[1]-a[1],r:Point=[a[0]+((dx*dx-dy*dy)*x+2*dx*dy*y)/den,a[1]+(2*dx*dy*x+(dy*dy-dx*dx)*y)/den];
 if(r.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))fail('镜像坐标超出有限毫米范围。');return r;
}
/** Reflect one finite material crease, then subdivide material identities.
 * The source remains unchanged. Never reuse ordinary duplicate trimming. */
export function reflectMaterialEdge(doc:Doc,intent:MaterialEdgeReflectIntent){
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent??{};return intent?.parametric?appendMaterialReflectGroup(doc,recipe as MaterialEdgeReflectIntent):buildMaterialEdgeReflect(doc,recipe as MaterialEdgeReflectIntent);
}
export function buildMaterialEdgeReflect(doc:Doc,intent:MaterialEdgeReflectIntent){
 validateDoc(doc);const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);
 const fields=['axisId','component','cpOnly','fixedSide','kind','sourceId',...(Object.hasOwn(intent??{},'sourceIds')?['sourceIds']:[]),...(Object.hasOwn(intent??{},'axisIds')?['axisIds']:[])].sort().join(',');if(!intent||Object.keys(intent).sort().join(',')!==fields||intent.kind!=='material-edge-reflect'||typeof intent.sourceId!=='string'||typeof intent.axisId!=='string'||!['source','all'].includes(intent.component)||!['left','right'].includes(intent.fixedSide)||typeof intent.cpOnly!=='boolean')fail('镜像材料折痕的来源、轴、部件和固定侧意图无效。');
 const e=old.edgeSegmentIds.indexOf(intent.sourceId),source=doc.segments.find(s=>s.id===intent.sourceId),axis=doc.segments.find(s=>s.id===intent.axisId);
 if(e<0||!source||!axis)fail('镜像原线或对称轴已变化，请重新选择。');
 if(source.assignment==='B'||source.assignment==='A')fail('原线必须为材料折痕，不能把纸边或辅助线作为新的面内边界。');
 const sourceSpan=materialReflectSpan(doc,intent.sourceIds??[intent.sourceId]),axisSpan=materialReflectSpan(doc,intent.axisIds??[intent.axisId]);if(sourceSpan.ids[0]!==source.id||axisSpan.ids[0]!==axis.id)fail('镜像原线/轴与区间首边不一致。');
 const from=reflected(sourceSpan.a,axisSpan.a,axisSpan.b,old.tolerance),to=reflected(sourceSpan.b,axisSpan.a,axisSpan.b,old.tolerance),component=intent.component==='all'?'all':old.components.findIndex(c=>c.edges.includes(e));
 const built=buildMaterialSegment(doc,old,{component,assignment:'F',fixedSide:intent.fixedSide},from,to),inserted=new Set(built.extra.insertedIds),graph=built.graph;
 for(const id of inserted){const k=built.ids.indexOf(id);graph.edges_assignment[k]=source.assignment;graph.edges_foldAngle[k]=source.angle;}
 const segments=built.segments.map(s=>inserted.has(s.id)?{...s,assignment:source.assignment,angle:source.angle,...(source.displayColor?{displayColor:source.displayColor}:{})}:s);
 const result=finishMaterialFaces(doc,old,graph,built.ids,segments,built.sources,built.root,built.oldRoot,intent.cpOnly?undefined:built.ff,built.descendants,built.extra);
 return {...result,reflection:{from:[...from] as Point,to:[...to] as Point,sourceId:source.id,axisId:axis.id,cpOnly:intent.cpOnly}};
}
