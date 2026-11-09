import {materialOuterContour} from '../core/materialWeak';
import type {Doc,Point,Segment,FoldGraph} from '../core/types';
import {validateDoc} from '../core/types';
import {hasMaterialTopology,inspectMaterialTopology,createMaterialTopology} from '../core/materialTopology';
import {materialCanonical,materialRoot,type CheckedMaterial} from '../core/materialFaceCommon';
import {materialFaceVertices,materialFaceEdges,materialHoles,materialHoleEdges} from '../core/materialRings';
import {buildFold,epsilonFor} from '../core/geometry';
import {computeFlatGeometry} from '../core/flatFold';
import {resolveStartingFace} from './flatFoldSettings';
import {selectionContainsMaterial} from './materialConstructionCopy';
import {copySelectedSegments,copySelectedDrawingObjects,geometryClipboardCounts,type ClipboardSegment,type DrawingClipboard} from './selectionClipboard';
import {splitEditableSegmentsWithMap} from './planarize';
import {materialOrientation} from '../core/materialTraceGeometry';
import {materialViewFrame} from './materialFrame';
import {appendMaterialClipboardGroup} from '../core/materialCurveModel';

export type MaterialClipboard={kind:'material-clipboard';doc:Doc};
export type WorkbenchClipboard=ClipboardSegment[]|DrawingClipboard|MaterialClipboard;
export type MaterialPasteIntent={kind:'material-clipboard-paste';clipboard:MaterialClipboard;offset:Point;cpOnly:boolean;splitTarget:boolean;parametric?:boolean};
export type MaterialClipboardCutIntent={kind:'material-clipboard-cut';segmentIds:readonly string[];lockBoundary:boolean;parametric?:boolean};
const keys=(v:object,allowed:string)=>Object.keys(v).sort().join(',')===allowed;
function fail(message:string):never{throw new Error(`材料剪贴板：${message}`);}
function checked(doc:Doc):CheckedMaterial{validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok)fail(m.reason);return m;}
export const isMaterialClipboard=(clip:WorkbenchClipboard|null):clip is MaterialClipboard=>!!clip&&!Array.isArray(clip)&&clip.kind==='material-clipboard';
export const clipboardSize=(clip:WorkbenchClipboard|null)=>{if(!clip)return 0;if(isMaterialClipboard(clip))return clip.doc.segments.length;const count=geometryClipboardCounts(clip);return count.segments+count.circles;};
export function clipboardDescription(clip:WorkbenchClipboard|null):string {
 if(!clip)return '剪贴板为空';if(isMaterialClipboard(clip))return `${clip.doc.segments.length} 条完整材料边`;
 const counts=geometryClipboardCounts(clip);return [counts.segments?`${counts.segments} 条线段`:'',counts.circles?`${counts.circles} 个辅助圆`:''].filter(Boolean).join('、');
}
function choose(doc:Doc,ids:readonly string[]){
 const m=checked(doc);if(!Array.isArray(ids)||!ids.length||Array.from(ids).some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('请选择有效且不重复的完整材料部件。');
 const chosen=new Set(ids);if(ids.some(id=>!doc.segments.some(s=>s.id===id)))fail('选区含失效线段。');
 const components=m.components.filter(c=>{const n=c.edges.filter(e=>chosen.has(m.edgeSegmentIds[e])).length;if(n&&n!==c.edges.length)fail('必须选择完整材料部件及全部边界，不能只复制或剪切部分折痕。');return n>0;});
 if(!components.length)fail('请选择至少一个完整材料部件。');return {m,chosen,components};
}
/** Exact induced graph: parallel banks and common slit tips use their original
 * indices, never endpoint-coordinate matching. */
function extract(doc:Doc,m:CheckedMaterial,fs:number[],segmentIds:Set<string>,root:number,visibleFF?:Point[],snapshot=false){
 const g=m.graph,vs=[...new Set(fs.flatMap(f=>materialFaceVertices(g,f)))].sort((a,b)=>a-b),es=[...new Set(fs.flatMap(f=>materialFaceEdges(g,f)))].sort((a,b)=>a-b),vm=new Map(vs.map((v,i)=>[v,i])),em=new Map(es.map((e,i)=>[e,i])),face=root===-1?0:fs.indexOf(root),next=structuredClone(doc);
 next.segments=next.segments.filter(s=>segmentIds.has(s.id));
 const graph=materialCanonical(vs.map(v=>[...g.vertices_coords[v]]),es.map(e=>g.edges_vertices[e].map(v=>vm.get(v)!) as [number,number]),es.map(e=>g.edges_assignment[e]),es.map(e=>g.edges_foldAngle[e]),fs.map(f=>g.faces_vertices![f].map(v=>vm.get(v)!)),fs.map(f=>g.faces_edges![f].map(e=>em.get(e)!)),fs.map(f=>(g.faces_holes?.[f]??[]).map(r=>r.map(v=>vm.get(v)!))),fs.map(f=>(g.faces_holeEdges?.[f]??[]).map(r=>r.map(e=>em.get(e)!)))),ids=es.map(e=>m.edgeSegmentIds[e]),selectedRoot=face<0?0:face,reference=fs.indexOf(m.startingFace??0),normalize=snapshot||reference<0||face<0,ff=m.foldedVertices?vs.map(v=>[...(normalize&&visibleFF?visibleFF[v]:m.foldedVertices![v])] as Point):undefined;
 if(next.flatFold)next.flatFold={startingFace:materialOuterContour(graph,selectedRoot).map(v=>[...graph.vertices_coords[v]]),materialFace:selectedRoot};
 next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,graph,ids,{startingFace:normalize?selectedRoot:reference,...(ff?{foldedVertices:ff}:{})})};checked(next);return next;
}
export function copyMaterialSelection(doc:Doc,ids:readonly string[]):MaterialClipboard{
 const {m,chosen,components}=choose(doc,ids),root=materialRoot(doc,m),fs=components.flatMap(c=>c.faces).sort((a,b)=>a-b);
 // A session clipboard deliberately contains selected material, not the source
 // project's unrelated settings, embedded image, objects or stale certificates.
 const base:Doc={schemaVersion:2,name:doc.name,paper:{...doc.paper},segments:structuredClone(doc.segments)};
 const frame=materialViewFrame(doc),snapshot=extract(base,m,fs,chosen,root,m.foldedVertices?.map(frame.toView),true);return {kind:'material-clipboard',doc:snapshot};
}
export function copyWorkbenchSelection(doc:Doc,ids:ReadonlySet<string>,circleIds:ReadonlySet<string>=new Set()):WorkbenchClipboard{
 const hasCircles=doc.objects?.some(object=>object.kind==='circle'&&circleIds.has(object.id));
 if(selectionContainsMaterial(doc,[...ids])){
  // Material snapshots are replayable topology recipes, whose independent
  // construction objects are intentionally excluded. Never silently drop the
  // selected circles, or convert the component into disconnected CP strokes.
  if(hasCircles)fail('完整材料部件与辅助圆不能混合复制或剪切，请分开选择；本次未修改工程或剪贴板。');
  return copyMaterialSelection(doc,[...ids]);
 }
 return hasCircles?copySelectedDrawingObjects(doc,{segments:ids,circles:circleIds}):copySelectedSegments(doc,ids);
}
function clipboard(clip:MaterialClipboard){if(!clip||!keys(clip,'doc,kind')||clip.kind!=='material-clipboard')fail('材料快照格式无效。');return checked(clip.doc);}
export function cutMaterialSelection(doc:Doc,intent:MaterialClipboardCutIntent){
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent??{};if(intent?.parametric){const r=appendMaterialClipboardGroup(doc,recipe as MaterialClipboardCutIntent);return {...r.clipboardCut!,doc:r.doc,descendants:r.descendants};}return buildMaterialClipboardCut(doc,recipe as MaterialClipboardCutIntent);
}
export function buildMaterialClipboardCut(doc:Doc,intent:MaterialClipboardCutIntent){
 if(!intent||!keys(intent,'kind,lockBoundary,segmentIds')||intent.kind!=='material-clipboard-cut'||typeof intent.lockBoundary!=='boolean')fail('剪切意图无效。');
 const {m,chosen,components}=choose(doc,intent.segmentIds);if(intent.lockBoundary&&doc.segments.some(s=>chosen.has(s.id)&&s.assignment==='B'))fail('边界保护已开启，请先取消保护，再剪切完整材料。');
 const oldRoot=materialRoot(doc,m),removedFaces=new Set(components.flatMap(c=>c.faces)),fs=m.graph.faces_vertices!.flatMap((_,f)=>removedFaces.has(f)?[]:[f]),remaining=new Set(doc.segments.filter(s=>!chosen.has(s.id)).map(s=>s.id));let next:Doc;
 if(fs.length){const frame=materialViewFrame(doc);next=extract(doc,m,fs,remaining,oldRoot,m.foldedVertices?.map(frame.toView));}
 else{next=structuredClone(doc);next.segments=next.segments.filter(s=>remaining.has(s.id));delete next.flatFold;delete next.metadata!.materialTopology;validateDoc(next);}
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,remaining.has(s.id)?[s.id]:[]])),removedIds:[...chosen],rootChanged:removedFaces.has(oldRoot),empty:!fs.length};
}

/** Ordinary targets must map their existing segments exactly. Do not quietly
 * merge duplicates, snap endpoints or split/replace the user's source lines. */
export function prepareMaterialClipboardTarget(original:Doc,splitTarget:boolean):{material:CheckedMaterial;derivedFF:boolean;doc:Doc;descendants:Map<string,string[]>}|null{
 let doc=original;validateDoc(doc);const unchanged=new Map(doc.segments.map(s=>[s.id,[s.id]]));if(hasMaterialTopology(doc))return {material:checked(doc),derivedFF:false,doc,descendants:unchanged};if(!doc.segments.some(s=>s.assignment!=='A'))return null;
 let descendants=unchanged;
 if(splitTarget){
  const built=buildFold(doc);if(built.edgeSourceIds.some(ids=>ids.length!==1)||doc.segments.filter(s=>s.assignment!=='A').some(s=>!built.edgeSourceIds.some(ids=>ids[0]===s.id)))fail('目标含重复或零长线，请先明确整理；不会静默删除。');
  const split=splitEditableSegmentsWithMap({...doc,segments:doc.segments.filter(s=>s.assignment!=='A')}),byId=new Map(split.doc.segments.map(s=>[s.id,s])),same=(p:Point,q:Point)=>p[0]===q[0]&&p[1]===q[1];
  doc={...doc,segments:doc.segments.flatMap(s=>{if(s.assignment==='A')return [s];const ids=split.descendants.get(s.id)!,pieces=ids.map(id=>byId.get(id)!);if(!same(pieces[0].a,s.a)||!same(pieces.at(-1)!.b,s.b)||pieces.some((p,i)=>materialOrientation(s.a,s.b,p.a)!==0||materialOrientation(s.a,s.b,p.b)!==0||i>0&&!same(pieces[i-1].b,p.a)))fail('目标交点无法在原直线上精确表示，请先检查；本次不移动原端点。');return pieces;})};
  descendants=new Map(original.segments.map(s=>[s.id,s.assignment==='A'?[s.id]:split.descendants.get(s.id)!]));
 }
 const built=buildFold(doc),g=built.graph,ids:string[]=[],used=new Set<string>();
 for(let e=0;e<g.edges_vertices.length;e++){
  const [a,b]=g.edges_vertices[e].map(v=>g.vertices_coords[v]),same=(p:Point,q:Point)=>p[0]===q[0]&&p[1]===q[1],matches=doc.segments.filter(s=>s.assignment===g.edges_assignment[e]&&s.angle===g.edges_foldAngle[e]&&(same(s.a,a)&&same(s.b,b)||same(s.a,b)&&same(s.b,a)));
  if(matches.length!==1||used.has(matches[0].id))fail('普通目标需先整理交点与重复线；本次不会静默分段、吸附或删除原线。');ids.push(matches[0].id);used.add(matches[0].id);
 }
 if(used.size!==doc.segments.filter(s=>s.assignment!=='A').length)fail('普通目标含未绑定材料面边，请先完成纸面和交点。');
 const root=resolveStartingFace(doc,g);if(root.stale)fail('目标起始面已失效，请先重新选择。');
 const contract=createMaterialTopology(doc,g,ids,{startingFace:root.face}),geometry=computeFlatGeometry(g,epsilonFor(doc),{startingFace:root.face});let derivedFF=false;
 if(geometry.geometry.status==='ready'){Object.assign(contract,createMaterialTopology(doc,g,ids,{startingFace:root.face,foldedVertices:geometry.geometry.vertices}));derivedFF=true;}
 const material=checked({...doc,metadata:{...doc.metadata,materialTopology:contract}});return {material,derivedFF,doc,descendants};
}
export function pasteMaterialSelection(doc:Doc,intent:MaterialPasteIntent){
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=intent??{};if(intent?.parametric){const r=appendMaterialClipboardGroup(doc,recipe as MaterialPasteIntent);return {...r.paste!,doc:r.doc,descendants:r.descendants,placement:r.placement==='unavailable'?'unavailable' as const:'preserved' as const};}return buildMaterialClipboardPaste(doc,recipe as MaterialPasteIntent);
}
export function buildMaterialClipboardPaste(doc:Doc,intent:MaterialPasteIntent){
 validateDoc(doc);if(!intent||!keys(intent,'clipboard,cpOnly,kind,offset,splitTarget')||intent.kind!=='material-clipboard-paste'||typeof intent.cpOnly!=='boolean'||typeof intent.splitTarget!=='boolean'||!Array.isArray(intent.offset)||intent.offset.length!==2||Array.from(intent.offset).some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))fail('粘贴需要有效材料快照、毫米偏移及明确的CP与目标分段选择。');
 if(doc.metadata?.curveDesign)fail('请先新建或打开折痕工程，再粘贴材料。');
 const source=clipboard(intent.clipboard),target=prepareMaterialClipboardTarget(doc,intent.splitTarget),targetDoc=target?.doc??doc,old=target?.material,sg=source.graph,tg=old?.graph,offset=intent.offset,point=([x,y]:Point):Point=>[x+offset[0],y+offset[1]],nv=tg?.vertices_coords.length??0,ne=tg?.edges_vertices.length??0,nf=tg?.faces_vertices!.length??0;
 if(nv+sg.vertices_coords.length>8192||nf+sg.faces_vertices!.length>8192||(tg?.faces_vertices!.reduce((n,f)=>n+f.length,0)??0)+sg.faces_vertices!.reduce((n,f)=>n+f.length,0)>65536)fail('粘贴结果超过材料或工程容量，未截断副本。');
 let ff:Point[]|undefined;
 if(!intent.cpOnly){if(!old)ff=source.foldedVertices?.map(point);else if(old.foldedVertices&&source.foldedVertices){const frameDoc={...targetDoc,metadata:{...targetDoc.metadata,materialTopology:createMaterialTopology(targetDoc,old.graph,old.edgeSegmentIds,{startingFace:old.startingFace??0,foldedVertices:old.foldedVertices})}},frame=materialViewFrame(frameDoc);ff=[...old.foldedVertices.map(p=>[...p] as Point),...source.foldedVertices.map(p=>frame.toStored(point(p)))];}else if(old.foldedVertices||source.foldedVertices)fail('目标或剪贴板缺少折后位置；如只需要展开图，请明确勾选“仅粘贴 CP”。');}
 const used=new Set([...targetDoc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]),idMap=new Map<string,string>(),unique=(base:string)=>{let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;used.add(id);return id;};
 const added=intent.clipboard.doc.segments.map(s=>{const id=unique(`${s.id}::material-paste`);idMap.set(s.id,id);return {...structuredClone(s),id,a:point(s.a),b:point(s.b)};}),g:FoldGraph=materialCanonical([...(tg?.vertices_coords??[]).map(p=>[...p] as Point),...sg.vertices_coords.map(point)],[...(tg?.edges_vertices??[]).map(e=>[...e] as [number,number]),...sg.edges_vertices.map(([a,b]):[number,number]=>[a+nv,b+nv])],[...(tg?.edges_assignment??[]),...sg.edges_assignment],[...(tg?.edges_foldAngle??[]),...sg.edges_foldAngle],[...(tg?.faces_vertices??[]).map(f=>[...f]),...sg.faces_vertices!.map(f=>f.map(v=>v+nv))],[...(tg?.faces_edges??[]).map(f=>[...f]),...sg.faces_edges!.map(f=>f.map(e=>e+ne))],[...(tg?materialHoles(tg):[]),...materialHoles(sg).map(rs=>rs.map(r=>r.map(v=>v+nv)))],[...(tg?materialHoleEdges(tg):[]),...materialHoleEdges(sg).map(rs=>rs.map(r=>r.map(e=>e+ne)))]),ids=[...(old?.edgeSegmentIds??[]),...source.edgeSegmentIds.map(id=>idMap.get(id)!)],root=old?materialRoot(doc,old):(source.startingFace??0),next=structuredClone(targetDoc);
 next.segments.push(...added);if(next.flatFold)next.flatFold={startingFace:materialOuterContour(g,root).map(v=>[...g.vertices_coords[v]]),materialFace:root};next.metadata={...next.metadata,materialTopology:createMaterialTopology(next,g,ids,{startingFace:old?.startingFace??root,...(ff?{foldedVertices:ff}:{})})};checked(next);
 return {doc:next,descendants:target?.descendants??new Map(doc.segments.map(s=>[s.id,[s.id]])),pastedIds:added.map(s=>s.id),componentsBefore:old?.components.length??0,componentsAfter:checked(next).components.length,placement:ff?'preserved' as const:'unavailable' as const,derivedTargetFF:!!target?.derivedFF,targetSegmentsBefore:doc.segments.length,targetSegmentsAfter:targetDoc.segments.length};
}
