import {appendWovenEllipseHole,wovenCurveHolesMatch,type WovenEllipseHole} from './wovenCurveHoles';
import {readWovenHoleIds,readWovenRingHoles,wovenGraphFaceCycles,wovenGraphComponents,type WovenGraph} from './wovenGraph';
import type {XY} from './tessellation';
import {wovenMotherRegions} from './wovenMotherRings';

/** A draft can be incomplete. Only readWovenGraph may authorize submission. */
export function readWovenGraphDraft(value:unknown,maxEdges=1024):WovenGraph|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>,p=r.vertices,e=r.edges;
 if(Object.keys(r).some(k=>!['edges','vertices','holeFaces','nestedSheets','ringHoles','curveHoles'].includes(k))||Object.hasOwn(r,'ringHoles')&&!readWovenRingHoles(r.ringHoles)||Object.hasOwn(r,'nestedSheets')&&r.nestedSheets!==true||!Array.isArray(p)||p.length>512||Array.from(p).some(q=>!Array.isArray(q)||q.length!==2||Array.from(q).some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000))||!Array.isArray(e)||e.length>maxEdges||Array.from(e).some(q=>!Array.isArray(q)||q.length!==2||q[0]===q[1]||Array.from(q).some(n=>!Number.isInteger(n)||n<0||n>=p.length))||new Set(e.map(q=>[...q].sort((a:number,b:number)=>a-b).join(','))).size!==e.length||r.holeFaces!==undefined&&!readWovenHoleIds(r.holeFaces))return null;
 if(Object.hasOwn(r,'curveHoles')&&!wovenCurveHolesMatch(r.curveHoles,{vertices:p as XY[],edges:e as [number,number][],ringHoles:r.ringHoles as WovenGraph['ringHoles']}))return null;
 return structuredClone(value) as WovenGraph;
}
export type WovenGraphEditCommand=
 |{kind:'add-ellipse-hole';face:number;curve:WovenEllipseHole;maxError:number}|{kind:'move';vertex:number;point:XY}|{kind:'add-point';point:XY}|{kind:'delete-point';vertex:number}
 |{kind:'add-edge';from:number;to:number}|{kind:'delete-edge';edge:number}|{kind:'split-edge';edge:number;fraction:number}|{kind:'toggle-hole';face:number}|{kind:'nested-sheets';enabled:boolean}|{kind:'toggle-ring-hole';face:number;component:number};
export function editWovenGraphDraft(graph:WovenGraph,command:WovenGraphEditCommand,maxEdges=1024):{graph:WovenGraph;vertex?:number;edge?:number} {
 const next=readWovenGraphDraft(graph,maxEdges);if(!next)throw Error('母图草图格式无效，未修改。');
 const vertex=(v:number)=>{if(!Number.isInteger(v)||v<0||v>=next.vertices.length)throw Error('母图点编号无效。');};
 const edge=(e:number)=>{if(!Number.isInteger(e)||e<0||e>=next.edges.length)throw Error('母图边编号无效。');};
 const point=(p:XY)=>{if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1000))throw Error('母图点坐标须为 −1000…1000 的有限数值。');};
 let selectedVertex:number|undefined,selectedEdge:number|undefined;
 if((next.holeFaces?.length||next.ringHoles?.length)&&!['move','toggle-hole','toggle-ring-hole','nested-sheets','add-ellipse-hole'].includes(command.kind))throw Error('先恢复孔洞实面及独立轮廓，再改变点边拓扑；避免孔洞编号绑定到另一个面。');
 switch(command.kind){
  case 'add-ellipse-hole':{
   const appended=appendWovenEllipseHole(next,command.face,command.curve,command.maxError);wovenMotherRegions(appended);return {graph:appended,vertex:next.vertices.length};
  }
  case 'toggle-ring-hole':{
   if(!Number.isInteger(command.face)||!Number.isInteger(command.component))throw Error('环孔原面及源轮廓编号无效。');
   const bindings=next.ringHoles??[],existing=bindings.find(b=>b.component===command.component);
   if(existing){if(next.curveHoles?.some(h=>h.component===command.component))throw Error('解析曲线孔须保留来源绑定；请撤销曲线孔创建后恢复轮廓。');if(existing.face!==command.face)throw Error('该轮廓已绑定另一原面，先恢复独立圈再重新绑定。');next.ringHoles=bindings.filter(b=>b!==existing);if(!next.ringHoles.length)delete next.ringHoles;}
   else{if(bindings.length>=32)throw Error('最多32个独立环孔。');next.ringHoles=[...bindings,{face:command.face,component:command.component}];wovenMotherRegions({...next,nestedSheets:true});}
   break;
  }
  case 'nested-sheets':if(typeof command.enabled!=='boolean')throw Error('独立纸片选择无效。');if(command.enabled)next.nestedSheets=true;else delete next.nestedSheets;break;
  case 'toggle-hole':{
   const cycles=wovenGraphFaceCycles(next);if(!cycles||!Number.isInteger(command.face)||!cycles.inner[command.face])throw Error('先完成闭合母图，再选择原面孔洞。');
   const holes=next.holeFaces??[];
   if(holes.includes(command.face)){next.holeFaces=holes.filter(f=>f!==command.face);if(!next.holeFaces.length)delete next.holeFaces;}
   else{
    if(holes.length>=32)throw Error('母图最多32个孔洞。');
    const face=cycles.inner[command.face],border=new Set(cycles.outer.flat());
    if(face.some(v=>border.has(v)))throw Error('孔洞必须位于纸面内部，不能接触外边界。');
    if(holes.some(f=>cycles.inner[f]?.some(v=>face.includes(v))))throw Error('孔洞不能相接或共用顶点。');
    next.holeFaces=[...holes,command.face];
   }
   break;
  }
  case 'move':vertex(command.vertex);point(command.point);if(next.curveHoles?.some(h=>wovenGraphComponents(next)[h.component]?.includes(command.vertex)))throw Error('曲线采样点由解析参数确定；请撤销后按新参数重建，未移动点。');next.vertices[command.vertex]=[...command.point];selectedVertex=command.vertex;break;
  case 'add-point':point(command.point);if(next.vertices.length>=512)throw Error('母图最多512个点，未截断。');selectedVertex=next.vertices.length;next.vertices.push([...command.point]);break;
  case 'delete-point':vertex(command.vertex);next.vertices.splice(command.vertex,1);next.edges=next.edges.filter(e=>!e.includes(command.vertex)).map(e=>e.map(v=>v>command.vertex?v-1:v) as [number,number]);selectedVertex=Math.min(command.vertex,next.vertices.length-1);break;
  case 'add-edge':vertex(command.from);vertex(command.to);if(command.from===command.to)throw Error('一条边需要两个不同的点。');if(next.edges.some(([a,b])=>a===command.from&&b===command.to||a===command.to&&b===command.from))throw Error('这两个点已有连边，未添加重复边。');if(next.edges.length>=maxEdges)throw Error(`当前母图最多${maxEdges}条边，未截断。`);selectedEdge=next.edges.length;next.edges.push([command.from,command.to]);break;
  case 'delete-edge':edge(command.edge);next.edges.splice(command.edge,1);selectedEdge=Math.min(command.edge,next.edges.length-1);break;
  case 'split-edge':{
   edge(command.edge);if(!Number.isFinite(command.fraction)||command.fraction<=0||command.fraction>=1)throw Error('分边比例必须严格在0与1之间。');
   if(next.vertices.length>=512||next.edges.length>=maxEdges)throw Error('分边会超过母图点边容量，未修改。');
   const [a,b]=next.edges[command.edge],p=next.vertices[a],q=next.vertices[b];selectedVertex=next.vertices.length;
   next.vertices.push([p[0]+(q[0]-p[0])*command.fraction,p[1]+(q[1]-p[1])*command.fraction]);next.edges[command.edge]=[a,selectedVertex];next.edges.push([selectedVertex,b]);selectedEdge=command.edge;break;
  }
 }
 return {graph:next,vertex:selectedVertex,edge:selectedEdge};
}
