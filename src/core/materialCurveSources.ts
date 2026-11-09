/** Continuous curve parameters belong to an input curve and an indexed
 * material side. Discrete output IDs are proof links, never saved identities. */
import type {Doc,Point} from './types';
import type {MaterialCurve} from './materialCurves';
import type {MaterialNetworkGraph} from './materialNetworkGeometry';
import type {MaterialFaceEditResult} from './materialFaceCommon';
import {inspectMaterialTopology} from './materialTopology';
import {materialFaceEdgeRings,materialFaceRings} from './materialRings';

export type MaterialCurveInputInterval={curve:number;kind:MaterialCurve['kind'];segment:number;parts:number;count:number;from:number;to:number;nodes?:[string,string]};
export type MaterialCurveSource=MaterialCurveInputInterval&{identity:string;edgeId:string;inputFace:number;side:string;fromBanks:string[];toBanks:string[]};
type CurveReferenceBase={identity:string;side:string;banks?:string[]};
export type MaterialCurveReference=CurveReferenceBase&({kind:MaterialCurve['kind'];segment:number;parts:number}|{kind:'bezier-loop'|'bezier-path';nodes:[string,string]});
export type MaterialCurveAnchorBinding={source:string;curve:MaterialCurveReference;parameter:number};
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;};
const parameter=(p:Point,a:Point,b:Point)=>{if(p[0]===a[0]&&p[1]===a[1])return 0;if(p[0]===b[0]&&p[1]===b[1])return 1;const axis=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1;return (p[axis]-a[axis])/(b[axis]-a[axis]);};

/** Clipping explicitly supplies its input edge and indexed input face. Only
 * after those identities are known may geometry measure the subinterval. */
export function buildMaterialCurveSources(doc:Doc,result:MaterialFaceEditResult,graph:MaterialNetworkGraph,intervals:MaterialCurveInputInterval[],inputs:number[],faces:number[],identities:string[]):MaterialCurveSource[]{
 const before=material(doc),after=material(result.doc),ids=result.insertedIds??[];
 if(ids.length!==inputs.length||ids.length!==faces.length)throw Error('曲线缺少完整的输入段与材料侧来源。');
 const sides=before.graph.faces_vertices!.map((_,f)=>JSON.stringify(materialFaceEdgeRings(before.graph,f).flatMap((ring,h)=>ring.map((e,k)=>[before.edgeSegmentIds[e],materialFaceRings(before.graph,f)[h][k]===before.graph.edges_vertices[e][0]?0:1])).sort((a,b)=>(String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0)||Number(a[1])-Number(b[1]))));
 const banks=before.edgeSegmentIds.flatMap((id,e)=>before.graph.edges_assignment[e]==='B'?[{id,vertices:new Set((result.descendants.get(id)??[id]).flatMap(child=>{const index=after.edgeSegmentIds.indexOf(child);return index<0?[]:after.graph.edges_vertices[index];}))}]:[]);
 return ids.map((edgeId,i)=>{
  const input=inputs[i],interval=intervals[input],edge=after.edgeSegmentIds.indexOf(edgeId),face=faces[i];
  if(!interval||edge<0||!sides[face])throw Error('曲线输入段或材料侧来源不存在。');
  const [a,b]=graph.edges[input].map(v=>graph.vertices[v]),[v,w]=after.graph.edges_vertices[edge],lo=parameter(after.graph.vertices_coords[v],a,b),hi=parameter(after.graph.vertices_coords[w],a,b);
  if(![lo,hi].every(t=>Number.isFinite(t)&&t>=0&&t<=1)||lo===hi)throw Error('曲线裁剪区间不能证明属于原输入段。');
  const inputBanks=new Set(materialFaceEdgeRings(before.graph,face).flat().map(e=>before.edgeSegmentIds[e])),at=(vertex:number)=>banks.filter(bank=>inputBanks.has(bank.id)&&bank.vertices.has(vertex)).map(bank=>bank.id).sort();
  return {...interval,identity:identities[interval.curve],edgeId,inputFace:face,side:sides[face],from:interval.from+(interval.to-interval.from)*lo,to:interval.from+(interval.to-interval.from)*hi,fromBanks:at(v),toBanks:at(w)};
 });
}

export function readMaterialCurveReference(value:unknown):value is MaterialCurveReference{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const ref=value as MaterialCurveReference,owned=Object.hasOwn(ref,'banks');
 const keyed=Object.hasOwn(ref,'nodes');if(Object.keys(ref).sort().join(',')!==[...(owned?['banks']:[]),'identity','kind',...(keyed?['nodes']:['parts','segment']),'side'].join(',')||typeof ref.identity!=='string'||!/^curve-[1-9]\d{0,5}$/.test(ref.identity)||!['ellipse','bezier-loop','bezier-path'].includes(ref.kind)||typeof ref.side!=='string'||!ref.side.length)return false;
 if('nodes'in ref){if(!['bezier-loop','bezier-path'].includes(ref.kind)||!Array.isArray(ref.nodes)||ref.nodes.length!==2||ref.nodes.some(id=>typeof id!=='string'||!/^node-[1-9]\d{0,5}$/.test(id))||ref.nodes[0]===ref.nodes[1])return false;}
 else if(!Number.isInteger(ref.parts)||ref.parts<1||ref.parts>16||!Number.isInteger(ref.segment)||ref.segment<0||ref.segment>=ref.parts||ref.kind==='ellipse'&&(ref.parts!==1||ref.segment!==0))return false;
 return !owned||Array.isArray(ref.banks)&&ref.banks.length>0&&ref.banks.every(id=>typeof id==='string'&&id.length>0)&&new Set(ref.banks).size===ref.banks.length&&ref.banks.every((id,i)=>i===0||id>ref.banks![i-1]);
}
