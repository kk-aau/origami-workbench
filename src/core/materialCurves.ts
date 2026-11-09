import {hasWeakMaterialRings} from './materialWeak';
import {inspectMaterialTopology} from './materialTopology';
/** Analytic curves become bounded-error LINE CP; source controls never move. */
import type {Doc,Point} from './types';
import {appendMaterialCurveGroup} from './materialCurveModel';
import {buildMaterialNetworkGeometry} from './materialNetwork';
import {constructMaterialNetworkAcross} from './materialNetworkAcross';
import {splitMaterialNetwork,MATERIAL_NETWORK_LIMITS,type MaterialNetworkGraph} from './materialNetworkGeometry';
import {buildMaterialCurveSources,type MaterialCurveInputInterval} from './materialCurveSources';
type Kind='F'|'M'|'V'|'U';
export type MaterialCurve={kind:'ellipse';center:Point;radii:Point;rotation:number;assignment:Kind}|{kind:'bezier-loop'|'bezier-path';nodes:{point:Point;incoming:Point;outgoing:Point}[];nodeIds?:string[];assignment:Kind};
export type MaterialCurveIntent={kind:'material-face-curves';face:number;curves:MaterialCurve[];curveIds?:string[];deviation:number;fixedPoint:Point;cpOnly:boolean;scope?:'component'|'all'};
const keys=(v:object,k:string)=>Object.keys(v).sort().join(',')===k;
const point=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&Array.from(p).every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6);
function bad(message:string):never{throw Error(message);}
/** Legacy arrays acquire deterministic identities from their saved original
 * order exactly once. New edits must carry these IDs with each curve. */
export function materialCurveIdentities(intent:MaterialCurveIntent):string[]{
 const ids=Object.hasOwn(intent,'curveIds')?intent.curveIds:intent.curves.map((_,i)=>`curve-${i+1}`);
 if(!Array.isArray(ids)||ids.length!==intent.curves.length||ids.some(id=>typeof id!=='string'||!/^curve-[1-9]\d{0,5}$/.test(id))||new Set(ids).size!==ids.length)bad('曲线持久来源编号必须完整、唯一且有效。');return [...ids];
}
export function materialCurveNodeIdentities(curve:Exclude<MaterialCurve,{kind:'ellipse'}>):string[]{
 const ids=Object.hasOwn(curve,'nodeIds')?curve.nodeIds:curve.nodes.map((_,i)=>`node-${i+1}`);
 if(!Array.isArray(ids)||ids.length!==curve.nodes.length||ids.some(id=>typeof id!=='string'||!/^node-[1-9]\d{0,5}$/.test(id))||new Set(ids).size!==ids.length)bad('贝塞尔持久节点编号必须完整、唯一且有效。');return [...ids];
}
export function materialCurvesWithNodeIdentities(curves:MaterialCurve[]):MaterialCurve[]{return curves.map(curve=>curve.kind==='ellipse'?structuredClone(curve):{...structuredClone(curve),nodeIds:materialCurveNodeIdentities(curve)});}
export function readMaterialCurves(value:unknown):MaterialCurve[]|null{
 if(!Array.isArray(value)||value.length<1||value.length>16)return null;
 for(const c of value){if(!c||typeof c!=='object'||!['F','M','V','U'].includes(c.assignment))return null;
  if(c.kind==='ellipse'){if(!keys(c,'assignment,center,kind,radii,rotation')||!point(c.center)||!point(c.radii)||c.radii.some((r:number)=>r<=0)||typeof c.rotation!=='number'||!Number.isFinite(c.rotation)||Math.abs(c.rotation)>36000)return null;}
  else if(c.kind==='bezier-loop'||c.kind==='bezier-path'){if(!keys(c,Object.hasOwn(c,'nodeIds')?'assignment,kind,nodeIds,nodes':'assignment,kind,nodes')||!Array.isArray(c.nodes)||c.nodes.length<2||c.nodes.length>16||Array.from(c.nodes).some((n:any)=>!n||typeof n!=='object'||!keys(n,'incoming,outgoing,point')||!point(n.point)||!point(n.incoming)||!point(n.outgoing)))return null;if(Object.hasOwn(c,'nodeIds'))try{materialCurveNodeIdentities(c);}catch{return null;}}
  else return null;
 }
 return structuredClone(value) as MaterialCurve[];
}
const mix=(a:Point,b:Point):Point=>[a[0]/2+b[0]/2,a[1]/2+b[1]/2];
const segmentDistance=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
/** Fixed arithmetic for replay across browser/worker/Node engines. Native
 * sin/cos may differ by an ulp. On [-pi/4,pi/4] the retained series remainder
 * is below 3e-18; rounding/reduction are covered by the coordinate allowance. */
function stableTrig(angle:number):[number,number]{
 const q=Math.round(angle/(Math.PI/2)),x=angle-q*(Math.PI/2),s=x*x,
  sin=x*(1+s*(-1/6+s*(1/120+s*(-1/5040+s*(1/362880+s*(-1/39916800+s*(1/6227020800+s*(-1/1307674368000+s/355687428096000)))))))),
  cos=1+s*(-1/2+s*(1/24+s*(-1/720+s*(1/40320+s*(-1/3628800+s*(1/479001600+s*(-1/87178291200+s/20922789888000)))))));
 switch((q%4+4)%4){case 0:return [cos,sin];case 1:return [-sin,cos];case 2:return [-cos,-sin];default:return [sin,-cos];}
}
export function sampleMaterialCurves(curves:MaterialCurve[],deviation:number){
 const checked=readMaterialCurves(curves);if(!checked||typeof deviation!=='number'||!Number.isFinite(deviation)||deviation<=0||deviation>1e4)bad('需要1–16条有效曲线及有限正毫米误差（≤10000）。');
 const graph:MaterialNetworkGraph={vertices:[],edges:[]},assignments:Kind[]=[],curveForEdge:number[]=[],curveIntervals:MaterialCurveInputInterval[]=[],errorBounds:number[]=[];
 const append=(p:Point)=>{if(!point(p))bad('曲线超出有限毫米坐标范围。');if(graph.vertices.length>=MATERIAL_NETWORK_LIMITS.vertices)bad('曲线离散超过128点容量，请调整误差或减少曲线；未自动降低精度。');graph.vertices.push([...p]);};
 for(const [index,c]of checked.entries()){
  const raw=c.kind==='ellipse'?[c.center,c.radii]:c.nodes.flatMap(n=>[n.point,n.incoming,n.outgoing]),roundoff=64*Number.EPSILON*Math.max(1,...raw.flat().map(Math.abs)),available=deviation-roundoff;
  if(available<=0)bad('指定误差低于当前曲线坐标的可验证精度。');
  const offset=graph.vertices.length,parameters:{segment:number;parameter:number}[]=[];let bound=0;
  if(c.kind==='ellipse'){
   // ||gamma''(t)|| <= max(rx,ry); linear interpolation error <= M dt²/8.
   const r=Math.max(...c.radii);let count=8;
   while(r*(Math.PI*2/count)**2/8>available){count+=4;if(count>MATERIAL_NETWORK_LIMITS.vertices-graph.vertices.length)break;}
   if(count>MATERIAL_NETWORK_LIMITS.vertices-graph.vertices.length)bad('曲线离散超过128点容量，请调整误差或减少曲线；未自动降低精度。');
   const a=(c.rotation%360)*Math.PI/180,[co,si]=stableTrig(a);bound=r*(Math.PI*2/count)**2/8;
   for(let i=0;i<count;i++){parameters.push({segment:0,parameter:i/count});const t=Math.PI*2*i/count,[ct,st]=stableTrig(t),x=c.radii[0]*ct,y=c.radii[1]*st;append([c.center[0]+co*x-si*y,c.center[1]+si*x+co*y]);}
  }else{
   const subdivide=(a:Point,b:Point,c:Point,d:Point,depth:number,segment:number,from:number,to:number)=>{
    const flat=Math.max(segmentDistance(b,a,d),segmentDistance(c,a,d));
    if(flat<=available){bound=Math.max(bound,flat);append(a);parameters.push({segment,parameter:from});return;}
    if(depth>=24)bad('贝塞尔细分超过深度预算，未降低指定精度。');
    const ab=mix(a,b),bc=mix(b,c),cd=mix(c,d),abc=mix(ab,bc),bcd=mix(bc,cd),middle=mix(abc,bcd);const parameter=(from+to)/2;subdivide(a,ab,abc,middle,depth+1,segment,from,parameter);subdivide(middle,bcd,cd,d,depth+1,segment,parameter,to);
   };
   c.nodes.forEach((n,i)=>{if(c.kind==='bezier-path'&&i===c.nodes.length-1)return;const next=c.nodes[(i+1)%c.nodes.length];subdivide(n.point,n.outgoing,next.incoming,next.point,0,i,0,1);});
   if(c.kind==='bezier-path')append(c.nodes.at(-1)!.point);
  }
  const count=graph.vertices.length-offset,open=c.kind==='bezier-path';if(count<(open?2:3))bad('曲线离散点数不足，请减小误差。');
  for(let i=0;i<count-(open?1:0);i++){graph.edges.push([offset+i,offset+(i+1)%count]);assignments.push(c.assignment);curveForEdge.push(index);const start=parameters[i],next=parameters[i+1];curveIntervals.push({curve:index,kind:c.kind,segment:start.segment,parts:c.kind==='ellipse'?1:c.nodes.length-(open?1:0),count:checked.length,from:start.parameter,to:next?.segment===start.segment?next.parameter:1,...(c.kind!=='ellipse'&&c.nodeIds?{nodes:[c.nodeIds[start.segment],c.nodeIds[(start.segment+1)%c.nodes.length]] as [string,string]}:{})});}
  errorBounds.push(bound+roundoff);
 }
 const open=checked.some(c=>c.kind==='bezier-path');
 if(open){const index=new Map<string,number>(),vertices:Point[]=[],mapping=graph.vertices.map(p=>{const key=p.join(',');let i=index.get(key);if(i===undefined){i=vertices.length;vertices.push(p);index.set(key,i);}return i;});graph.vertices=vertices;graph.edges=graph.edges.map(([a,b])=>[mapping[a],mapping[b]]);}
 return {graph,assignments,curveForEdge,curveIntervals,errorBounds,maximumError:Math.max(...errorBounds),open};
}
/** Exact SVG source paths; the cyan LINE preview is the bounded-error output. */
export function materialCurvePaths(curves:MaterialCurve[]):string[]{
 const checked=readMaterialCurves(curves);if(!checked)return [];
 return checked.map(c=>{if(c.kind!=='ellipse')return `M ${c.nodes[0].point.join(' ')} `+c.nodes.slice(0,c.kind==='bezier-path'?-1:undefined).map((n,i)=>`C ${n.outgoing.join(' ')} ${c.nodes[(i+1)%c.nodes.length].incoming.join(' ')} ${c.nodes[(i+1)%c.nodes.length].point.join(' ')}`).join(' ')+(c.kind==='bezier-path'?'':' Z');
  const a=c.rotation*Math.PI/180,u:Point=[c.radii[0]*Math.cos(a),c.radii[0]*Math.sin(a)],p:Point=[c.center[0]+u[0],c.center[1]+u[1]],q:Point=[c.center[0]-u[0],c.center[1]-u[1]];return `M ${p.join(' ')} A ${c.radii.join(' ')} ${c.rotation} 0 1 ${q.join(' ')} A ${c.radii.join(' ')} ${c.rotation} 0 1 ${p.join(' ')} Z`;});
}
export function buildMaterialCurveGeometry(doc:Doc,intent:MaterialCurveIntent){
 if(!intent||!keys(intent,['cpOnly','curves',...(Object.hasOwn(intent,'curveIds')?['curveIds']:[]),'deviation','face','fixedPoint','kind',...(Object.hasOwn(intent,'scope')?['scope']:[])].sort().join(','))||Object.hasOwn(intent,'scope')&&!['component','all'].includes(intent.scope!)||intent.kind!=='material-face-curves'||!Number.isInteger(intent.face)||typeof intent.cpOnly!=='boolean'||!point(intent.fixedPoint))bad('曲线批量的面、范围、固定点或仅CP设置无效。');
 const sampled=sampleMaterialCurves(intent.curves,intent.deviation),material=inspectMaterialTopology(doc);if(!material.ok)bad(material.reason);const result=intent.scope||sampled.open||hasWeakMaterialRings(material.graph)?constructMaterialNetworkAcross(doc,{face:intent.face,scope:intent.scope??'face',openCurves:sampled.open,graph:sampled.graph,assignments:sampled.assignments,fixedPoint:intent.fixedPoint,cpOnly:intent.cpOnly}):buildMaterialNetworkGeometry(doc,{kind:'material-face-network',face:intent.face,graph:sampled.graph,assignments:sampled.assignments,fixedPoint:intent.fixedPoint,cpOnly:intent.cpOnly});
 const inputs='across' in result?result.across.insertedSource:splitMaterialNetwork(sampled.graph,material.tolerance).edgeSource,faces='across' in result?result.across.insertedFaces:result.insertedIds!.map(()=>intent.face),curveSources=buildMaterialCurveSources(doc,result,sampled.graph,sampled.curveIntervals,inputs,faces,materialCurveIdentities(intent));
 result.doc.metadata={...result.doc.metadata,materialCurveConstruction:{schema:'zhezhi-material-curves-v1',intent:structuredClone(intent),sampledGraph:structuredClone(sampled.graph),errorBounds:[...sampled.errorBounds],insertedSegmentIds:[...result.insertedIds!]}};
 return {...result,curveSources,curves:{count:intent.curves.length,inputSegments:sampled.graph.edges.length,deviation:intent.deviation,maximumError:sampled.maximumError,errorBounds:sampled.errorBounds,curveForInputEdge:sampled.curveForEdge,...('across' in result?{clipping:{faces:result.across.faces,components:result.across.components,materialLength:result.across.materialLength,blankLength:result.across.blankLength,curveForInsertedSegment:result.across.insertedSource.map(e=>sampled.curveForEdge[e])}}:{})}};
}

export function constructMaterialCurves(doc:Doc,intent:MaterialCurveIntent){return appendMaterialCurveGroup(doc,intent);}
