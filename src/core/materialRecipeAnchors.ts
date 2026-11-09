/** Anchors follow an indexed source edge through subdivision, never nearby
 * coordinates. Coincident cut banks therefore remain separate identities. */
import type {Doc,Point} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialMix,type MaterialFaceAnchor,type MaterialFaceEditResult} from './materialFaceCommon';
import {readMaterialCurveReference,type MaterialCurveAnchorBinding,type MaterialCurveSource} from './materialCurveSources';
import {materialFaceEdgeRings} from './materialRings';
export type MaterialLegacyAnchorBinding={source:string;edgeId:string;fraction:number;edgeCount:number;sourcePart?:number};
export type MaterialAnchorBinding=MaterialLegacyAnchorBinding|MaterialCurveAnchorBinding;
export type MaterialEdgeBinding={source:string;edgeId:string;from:number;to:number;edgeCount:number;sourcePart?:number};
export type MaterialAnchorStage={id:string;doc:Doc;result?:MaterialFaceEditResult};
// The provenance walk is synchronous and read-only. Reuse each inspected
// snapshot within that walk; discard the cache before any geometry mutation.
let materialReadCache:WeakMap<Doc,Extract<ReturnType<typeof inspectMaterialTopology>,{ok:true}>>|undefined;
function withMaterialReads<T>(read:()=>T):T{const previous=materialReadCache;materialReadCache=new WeakMap();try{return read();}finally{materialReadCache=previous;}}
const material=(doc:Doc)=>{const cached=materialReadCache?.get(doc);if(cached)return cached;const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);materialReadCache?.set(doc,m);return m;};
const endpoints=(doc:Doc,id:string):[Point,Point]=>{const m=material(doc),e=m.edgeSegmentIds.indexOf(id);if(e<0)throw Error('端点来源边不存在，未绑定其它材料边。');return m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]) as [Point,Point];};
const descendants=(id:string,stages:MaterialAnchorStage[],after:number)=>[...new Set(stages.slice(after+1).reduce((ids,s)=>ids.flatMap(i=>s.result?.descendants.get(i)??[i]),[id]))];
const sourceEdges=(s:MaterialAnchorStage,part?:number)=>{const empty=!Object.hasOwn(s.doc.metadata??{},'materialTopology')&&!s.doc.segments.some(e=>e.assignment!=='A');const edges=s.result?.referenceEdges??s.result?.insertedIds??(empty?[]:material(s.doc).edgeSegmentIds);if(part===undefined)return edges;const copies=s.result?.copy?.copies;if(!Number.isInteger(part)||part<0||!copies||part>=copies||edges.length%copies)throw Error('引用的副本已删除或来源分组无效。');const count=edges.length/copies;return edges.slice(part*count,(part+1)*count);};
const parameter=(p:Point,a:Point,b:Point)=>{const axis=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1;return (p[axis]-a[axis])/(b[axis]-a[axis]);};
type CurveInterval={id:string;from:number;to:number};
/** Follow explicit descendants one stage at a time, carrying parameters through
 * identity-preserving transforms. Measuring a declared split is safe; looking
 * for a nearby edge or projecting through several coordinate frames is not. */
function curveDescendants(source:MaterialCurveSource,stages:MaterialAnchorStage[],index:number):CurveInterval[]{
 let intervals:CurveInterval[]=[{id:source.edgeId,from:source.from,to:source.to}];
 for(let i=index+1;i<stages.length;i++){
  const before=material(stages[i-1].doc),after=material(stages[i].doc),result=stages[i].result;
  intervals=intervals.flatMap(interval=>{
   const old=before.edgeSegmentIds.indexOf(interval.id);if(old<0)throw Error('曲线连续来源的原材料边已不存在。');
   const children=result?.descendants.get(interval.id);if(!children)throw Error('曲线后代来源证据缺失，未沿用旧ID猜测区间。');const [a,b]=before.graph.edges_vertices[old].map(v=>before.graph.vertices_coords[v]);
   return children.flatMap(id=>{
    const edge=after.edgeSegmentIds.indexOf(id);if(edge<0)return [];
    const [p,q]=after.graph.edges_vertices[edge].map(v=>after.graph.vertices_coords[v]),same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
    if(children.length===1&&id===interval.id){if(result?.transform||result?.locationMove||same(a,p)&&same(b,q))return [{...interval}];if(same(a,q)&&same(b,p))return [{id,from:interval.to,to:interval.from}];throw Error('曲线区间发生未声明的端点变更，未沿旧ID转绑。');}
    const at=(p:Point)=>same(p,a)?0:same(p,b)?1:parameter(p,a,b),from=at(p),to=at(q);
    if(![from,to].every(t=>Number.isFinite(t)&&t>=0&&t<=1)||from===to)throw Error('曲线后代缺少可证明的原输入段区间。');
    return [{id,from:interval.from+(interval.to-interval.from)*from,to:interval.from+(interval.to-interval.from)*to}];
   });
  });
 }
 return intervals;
}
const sameBanks=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
function bindCurveAnchor(anchor:MaterialFaceAnchor,stages:MaterialAnchorStage[],index:number,source:MaterialCurveSource):MaterialCurveAnchorBinding{
 const matches=curveDescendants(source,stages,index).filter(interval=>interval.id===anchor.edgeId);
 if(matches.length!==1)throw Error('曲线端点没有唯一连续材料侧来源。');
 const interval=matches[0],value=interval.from+(interval.to-interval.from)*anchor.fraction,banks=value===source.from?source.fromBanks:value===source.to?source.toBanks:[];
 const input=source.kind!=='ellipse'&&source.nodes?{kind:source.kind,nodes:[...source.nodes] as [string,string]}:{kind:source.kind,segment:source.segment,parts:source.parts};
 return {source:stages[index].id,curve:{identity:source.identity,...input,side:source.side,...(banks.length?{banks:[...banks]}:{})},parameter:value};
}
function resolveCurveAnchor(binding:MaterialCurveAnchorBinding,stages:MaterialAnchorStage[]):MaterialFaceAnchor{
 if(Object.keys(binding).sort().join(',')!=='curve,parameter,source'||typeof binding.source!=='string'||!readMaterialCurveReference(binding.curve)||!Number.isFinite(binding.parameter)||binding.parameter<0||binding.parameter>1)throw Error('保存端点的连续曲线来源引用无效。');
 const index=stages.findIndex(s=>s.id===binding.source);if(index<0)throw Error('端点依赖的前组已删除，未转绑其它材料边。');
 const stage=stages[index],ref=binding.curve,sources=stage.result?.curveSources;
 if(!sources||!stage.result?.curves)throw Error('连续曲线来源证据缺失，未按旧ID或坐标绑定。');
 const materialSource=material(stage.doc),current=material(stages.at(-1)!.doc),hits:MaterialFaceAnchor[]=[];
 for(const source of sources){
  if(source.identity!==ref.identity||source.side!==ref.side)continue;
  let reverse=false;if('nodes'in ref){if(source.kind==='ellipse'||!source.nodes)continue;if(source.nodes[0]===ref.nodes[0]&&source.nodes[1]===ref.nodes[1])reverse=false;else if(source.nodes[0]===ref.nodes[1]&&source.nodes[1]===ref.nodes[0])reverse=true;else continue;}else if(source.kind!==ref.kind||source.segment!==ref.segment||source.parts!==ref.parts)continue;
  const intervalSource=reverse?{...source,from:1-source.from,to:1-source.to}:source;
  if(!stage.result.insertedIds?.includes(source.edgeId)||!materialSource.edgeSegmentIds.includes(source.edgeId)||![source.from,source.to].every(t=>Number.isFinite(t)&&t>=0&&t<=1)||source.from===source.to)throw Error('连续曲线输入段或材料侧证据无效。');
  if(ref.banks&&!sameBanks(ref.banks,binding.parameter===intervalSource.from?source.fromBanks:binding.parameter===intervalSource.to?source.toBanks:[]))continue;
  for(const interval of curveDescendants(intervalSource,stages,index)){
   if(binding.parameter<Math.min(interval.from,interval.to)||binding.parameter>Math.max(interval.from,interval.to))continue;
   const fraction=binding.parameter===interval.from?0:binding.parameter===interval.to?1:(binding.parameter-interval.from)/(interval.to-interval.from);
   if(Number.isFinite(fraction)&&fraction>=0&&fraction<=1)hits.push({edgeId:interval.id,fraction});
  }
 }
 if(hits.length===1)return hits[0];
 if(hits.length>1&&hits.every(h=>h.fraction===0||h.fraction===1)){
  const vertices=hits.map(h=>current.graph.edges_vertices[current.edgeSegmentIds.indexOf(h.edgeId)][h.fraction]);if(new Set(vertices).size===1)return hits[0];
 }
 throw Error('连续曲线参数没有唯一当前材料侧；来源缺失、进入空白或切口身份不明确。');
}
export function bindMaterialAnchor(anchor:MaterialFaceAnchor,stages:MaterialAnchorStage[],continuous:false):MaterialLegacyAnchorBinding;
export function bindMaterialAnchor(anchor:MaterialFaceAnchor,stages:MaterialAnchorStage[],continuous?:true):MaterialAnchorBinding;
export function bindMaterialAnchor(anchor:MaterialFaceAnchor,stages:MaterialAnchorStage[],continuous=true):MaterialAnchorBinding{
 const current=stages.at(-1)!.doc,[a,b]=endpoints(current,anchor.edgeId),p=materialMix(a,b,anchor.fraction);
 // A cut/join explicitly replaces edge-side identity, including the retained
 // ID. Its newest source takes precedence over the pre-cut common crease.
 const order=[...stages.keys()].filter(i=>stages[i].result?.referenceEdges).reverse().concat([...stages.keys()].filter(i=>!stages[i].result?.referenceEdges));
 for(const i of order)for(const id of sourceEdges(stages[i])){
  if(!descendants(id,stages,i).includes(anchor.edgeId))continue;
  if(continuous&&(stages[i].result?.transform||stages[i].result?.locationMove)&&stages.slice(0,i).some((stage,j)=>stage.result?.curveSources?.some(source=>descendants(source.edgeId,stages,j).includes(anchor.edgeId))))continue;
  if(continuous&&stages[i].result?.curves){const source=stages[i].result?.curveSources?.find(source=>source.edgeId===id);if(!source)throw Error('曲线输入段与材料侧来源证据缺失，未按旧ID推断。');return bindCurveAnchor(anchor,stages,i,source);}
  const [v,w]=endpoints(stages[i].doc,id),fraction=parameter(p,v,w);
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('端点来源比例无法确认，未吸附端点。');
  const edges=sourceEdges(stages[i]),copies=stages[i].result?.copy?.copies,sourcePart=copies?Math.floor(edges.indexOf(id)/(edges.length/copies)):undefined;
  return {source:stages[i].id,edgeId:id,fraction,edgeCount:sourceEdges(stages[i],sourcePart).length,...(sourcePart===undefined?{}:{sourcePart})};
 }
 throw Error('端点没有已保存的来源边，未按坐标推断身份。');
}
export function bindMaterialEdge(id:string,stages:MaterialAnchorStage[]):MaterialEdgeBinding{
 const a=bindMaterialAnchor({edgeId:id,fraction:0},stages,false),b=bindMaterialAnchor({edgeId:id,fraction:1},stages,false);
 if(a.source!==b.source||a.edgeId!==b.edgeId||a.sourcePart!==b.sourcePart||a.fraction===b.fraction)throw Error('整条边没有一致的来源区间。');
 return {source:a.source,edgeId:a.edgeId,edgeCount:a.edgeCount,from:a.fraction,to:b.fraction,...(a.sourcePart===undefined?{}:{sourcePart:a.sourcePart})};
}
/** Normalize the input face's actual boundary through saved source lineage.
 * A prior curve may acquire more chords without changing this material side.
 * Cut banks retain their separate creator/edge identities in the proof. */
export function materialCurveSideProofs(doc:Doc,stages:MaterialAnchorStage[]){
 return withMaterialReads(()=>{
 const m=material(doc),proofs=new Map<string,string>();
 for(const edgeId of m.edgeSegmentIds){
  const binding=bindMaterialAnchor({edgeId,fraction:.5},stages),proof='curve'in binding?['curve',binding.source,binding.curve.identity,binding.curve.kind,...('nodes'in binding.curve?[]:[binding.curve.segment]),binding.curve.side]:['edge',binding.source,binding.sourcePart??null,binding.edgeId];proofs.set(edgeId,JSON.stringify(proof));
 }
 const faces=m.graph.faces_vertices!.map((_,face)=>JSON.stringify([...new Set(materialFaceEdgeRings(m.graph,face).flat().map(edge=>proofs.get(m.edgeSegmentIds[edge])!))].sort()));
 return {faces,banks:proofs};
 });
}
/** Resolve the complete declared interval as a contiguous chain of current
 * descendants. Partial edge coverage is rejected, never rounded or split. */
export function resolveMaterialEdge(binding:MaterialEdgeBinding,stages:MaterialAnchorStage[]):string[]{
 if(!binding||Object.keys(binding).sort().join(',')!==(Object.hasOwn(binding,'sourcePart')?'edgeCount,edgeId,from,source,sourcePart,to':'edgeCount,edgeId,from,source,to')||Object.hasOwn(binding,'sourcePart')&&(!Number.isInteger(binding.sourcePart)||binding.sourcePart!<0)||![binding.from,binding.to].every(t=>Number.isFinite(t)&&t>=0&&t<=1)||binding.from===binding.to||typeof binding.source!=='string'||typeof binding.edgeId!=='string'||!Number.isInteger(binding.edgeCount)||binding.edgeCount<1)throw Error('材料边来源区间无效。');
 const index=stages.findIndex(s=>s.id===binding.source);if(index<0)throw Error('材料边依赖的前组已删除。');
 const source=stages[index],edges=sourceEdges(source,binding.sourcePart);if(edges.length!==binding.edgeCount||!edges.includes(binding.edgeId))throw Error('材料边来源分段身份已变化，请重新选择。');
 const [a,b]=endpoints(source.doc,binding.edgeId),m=material(stages.at(-1)!.doc),lo=Math.min(binding.from,binding.to),hi=Math.max(binding.from,binding.to),parts:{id:string;lo:number;hi:number;v:number;w:number}[]=[];
 for(const id of descendants(binding.edgeId,stages,index)){
  const e=m.edgeSegmentIds.indexOf(id);if(e<0)continue;const [v,w]=m.graph.edges_vertices[e],p=parameter(m.graph.vertices_coords[v],a,b),q=parameter(m.graph.vertices_coords[w],a,b),start=Math.min(p,q),end=Math.max(p,q);
  if(end<=lo||start>=hi)continue;
  if(start<lo||end>hi)throw Error('来源区间端点落在当前边内部，未自动切短或吸附。');
  parts.push({id,lo:start,hi:end,v:p<q?v:w,w:p<q?w:v});
 }
 parts.sort((p,q)=>p.lo-q.lo);
 if(!parts.length||parts[0].lo!==lo||parts.at(-1)!.hi!==hi||parts.some((p,i)=>i>0&&(p.lo!==parts[i-1].hi||p.v!==parts[i-1].w)))throw Error('来源区间不是唯一连续材料侧，未合并重合切口或跨空白连接。');
 return (binding.from<binding.to?parts:[...parts].reverse()).map(p=>p.id);
}
export function resolveMaterialAnchor(binding:MaterialAnchorBinding,stages:MaterialAnchorStage[]):MaterialFaceAnchor{
 if(binding&&Object.hasOwn(binding,'curve'))return withMaterialReads(()=>resolveCurveAnchor(binding as MaterialCurveAnchorBinding,stages));
 binding=binding as MaterialLegacyAnchorBinding;
 if(!binding||Object.keys(binding).sort().join(',')!==(Object.hasOwn(binding,'sourcePart')?'edgeCount,edgeId,fraction,source,sourcePart':'edgeCount,edgeId,fraction,source')||Object.hasOwn(binding,'sourcePart')&&(!Number.isInteger(binding.sourcePart)||binding.sourcePart!<0)||typeof binding.source!=='string'||typeof binding.edgeId!=='string'||!Number.isFinite(binding.fraction)||binding.fraction<0||binding.fraction>1||!Number.isInteger(binding.edgeCount)||binding.edgeCount<1)throw Error('保存端点的来源引用无效。');
 const i=stages.findIndex(s=>s.id===binding.source);if(i<0)throw Error('端点依赖的前组已删除，未转绑其它材料边。');
 const source=stages[i],edges=sourceEdges(source,binding.sourcePart);
 if(edges.length!==binding.edgeCount||!edges.includes(binding.edgeId))throw Error('端点来源构造的分段身份已变化，请重新选择后组端点。');
 const [a,b]=endpoints(source.doc,binding.edgeId),point=materialMix(a,b,binding.fraction),current=material(stages.at(-1)!.doc),hits:MaterialFaceAnchor[]=[];
 for(const id of descendants(binding.edgeId,stages,i)){
  const e=current.edgeSegmentIds.indexOf(id);if(e<0)continue;const [v,w]=current.graph.edges_vertices[e].map(v=>current.graph.vertices_coords[v]),lo=parameter(v,a,b),hi=parameter(w,a,b);
  if(binding.fraction<Math.min(lo,hi)||binding.fraction>Math.max(lo,hi))continue;
  const fraction=point[0]===v[0]&&point[1]===v[1]?0:point[0]===w[0]&&point[1]===w[1]?1:(binding.fraction-lo)/(hi-lo);
  if(Number.isFinite(fraction)&&fraction>=0&&fraction<=1)hits.push({edgeId:id,fraction});
 }
 // Two descendants may share the exact indexed vertex. Either incident edge
 // denotes that same material corner; otherwise ambiguous intervals reject.
 if(hits.length===1)return hits[0];
 if(hits.length>1&&hits.every(h=>h.fraction===0||h.fraction===1)){
  const vertices=hits.map(h=>current.graph.edges_vertices[current.edgeSegmentIds.indexOf(h.edgeId)][h.fraction]);
  if(new Set(vertices).size===1)return hits[0];
 }
 throw Error('端点在来源边细分后没有唯一材料区间，未移动或吸附端点。');
}
