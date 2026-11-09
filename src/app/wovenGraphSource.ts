import type {XY} from './tessellation';
import {readWovenGraph,wovenGraphEdgeKinds,type WovenGraph} from './wovenGraph';
import {wovenMotherRegions} from './wovenMotherRings';
/** Explicit region choices are stamped against immutable, independently replayed split geometry. */
export type WovenMotherSelection={geometry:Pick<WovenGraph,'vertices'|'edges'>}&Pick<WovenGraph,'holeFaces'|'ringHoles'|'nestedSheets'>;
export type WovenGraphSource={kind:'origamica-in3437';inputGraph:WovenGraph;intersectionTolerance:2;samePtTolerance:2;invertFoldType:true}|{kind:'origamica-intersectify-native';inputGraph:WovenGraph;intersectionTolerance:number;samePtTolerance:number;invertFoldType:boolean;motherSelection?:WovenMotherSelection};
/** The source primitive accepts open and unsplit lines, including distinct coincident endpoints. */
export function readWovenIntersectionInput(value:unknown):WovenGraph|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>,p=r.vertices,e=r.edges;
 if(Object.keys(r).sort().join(',')!=='edges,vertices'||!Array.isArray(p)||p.length<2||p.length>512||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000))||!Array.isArray(e)||e.length<1||e.length>128||e.some(q=>!Array.isArray(q)||q.length!==2||q[0]===q[1]||q.some(n=>!Number.isInteger(n)||n<0||n>=p.length)||p[q[0]][0]===p[q[1]][0]&&p[q[0]][1]===p[q[1]][1]))return null;
 return structuredClone(value) as WovenGraph;
}
/** Changing the geometric input route cannot silently fill a chosen void or
 * reconnect independent paper. Region IDs cannot survive arbitrary Indexify. */
export function wovenNativeInputFromMother(graph:WovenGraph,roles:WovenGraph=graph):WovenGraph{
 if(['holeFaces','ringHoles','nestedSheets','curveHoles'].some(k=>Object.hasOwn(roles,k)))throw Error('母图已声明孔洞、内环或独立纸片；仅拆分点边会丢失材料身份。请先明确恢复实面／独立圈并取消纸片声明，再切换原线网来源。原图未修改。');
 const input=readWovenIntersectionInput({vertices:graph.vertices,edges:graph.edges});
 if(!input)throw Error('原线网需要2–512点、1–128条非零原段；未删边或截断输入。');
 return input;
}
const INPUT:WovenGraph={"vertices":[[1.2423,1.1112],[1.2423,353.20419999999996],[77.6633,1.1112],[77.6633,353.20419999999996],[144.0843,1.1112],[144.0843,353.20419999999996],[210.50530000000003,1.1112],[210.50530000000003,353.20419999999996],[276.92530000000005,1.1112],[276.92530000000005,353.20419999999996],[353.34630000000004,1.1112],[353.34630000000004,353.20419999999996],[1.2424000000000335,77.5322],[353.34540000000004,77.5222],[1.2415000000000336,143.9532],[353.34450000000004,143.94320000000002],[1.2403000000000335,210.37420000000003],[353.34330000000006,210.36420000000004],[1.2394000000000336,276.7952],[353.34240000000005,276.78520000000003],[39.001500000000036,353.21520000000004],[353.34650000000005,32.00220000000007]],"edges":[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[0,10],[12,13],[14,15],[16,17],[18,19],[1,11],[20,21]]};
export function wovenIn3437Source():WovenGraphSource{return {kind:'origamica-in3437',inputGraph:structuredClone(INPUT),intersectionTolerance:2,samePtTolerance:2,invertFoldType:true};}
export function readWovenGraphSource(value:unknown):WovenGraphSource|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 const required=['inputGraph','intersectionTolerance','invertFoldType','kind','samePtTolerance'];
 if(required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!(r.kind==='origamica-intersectify-native'&&k==='motherSelection')))return null;
 if(r.kind==='origamica-intersectify-native'){
  if(!readWovenIntersectionInput(r.inputGraph)||typeof r.invertFoldType!=='boolean'||[r.intersectionTolerance,r.samePtTolerance].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>100))return null;
  if(Object.hasOwn(r,'motherSelection')){
   const s=r.motherSelection as Record<string,unknown>;if(!s||typeof s!=='object'||Array.isArray(s)||!Object.hasOwn(s,'geometry')||Object.keys(s).some(k=>!['geometry','holeFaces','ringHoles','nestedSheets'].includes(k))||Object.keys(s).length<2)return null;
   const g=s.geometry as Record<string,unknown>;if(!g||typeof g!=='object'||Object.keys(g).sort().join(',')!=='edges,vertices'||!readWovenGraph({...g,...selectionRoles(s)}))return null;
  }
  const result=structuredClone(value) as WovenGraphSource;try{recomputeWovenGraphSource(result);}catch{return null;}return result;
 }
 if(r.kind!=='origamica-in3437'||r.intersectionTolerance!==2||r.samePtTolerance!==2||r.invertFoldType!==true)return null;
 const graph=readWovenGraph(r.inputGraph);if(!graph||Object.keys(graph).sort().join(',')!=='edges,vertices'||JSON.stringify(graph.vertices)!==JSON.stringify(INPUT.vertices)||JSON.stringify(graph.edges)!==JSON.stringify(INPUT.edges))return null;
 return structuredClone(value) as WovenGraphSource;
}
/** In[179]: closest pair candidates, returning their midpoint and parameters. */
function medial(p:XY,q:XY,r:XY,s:XY):{point:XY;distance:number;t:number;u:number}{
 const d:XY=[q[0]-p[0],q[1]-p[1]],e:XY=[s[0]-r[0],s[1]-r[1]],dot=(a:XY,b:XY)=>a[0]*b[0]+a[1]*b[1],sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]],aa=dot(d,d),bb=dot(d,e),cc=dot(e,e),det=bb*bb-aa*cc;
 const candidates:{point:XY;distance:number;t:number;u:number}[]=[];
 const add=(t:number,u:number)=>{if(t>=0&&t<=1&&u>=0&&u<=1){const x:XY=[p[0]+t*d[0],p[1]+t*d[1]],y:XY=[r[0]+u*e[0],r[1]+u*e[1]];candidates.push({point:[(x[0]+y[0])/2,(x[1]+y[1])/2],distance:Math.hypot(x[0]-y[0],x[1]-y[1])/2,t,u});}};
 if(Math.abs(det)<=1e-10){const [lo,hi]=[dot(sub(r,p),d)/aa,dot(sub(s,p),d)/aa].sort((a,b)=>a-b);if(lo<=1&&hi>=0){const t=(Math.max(0,lo)+Math.min(1,hi))/2;add(t,dot(sub([p[0]+t*d[0],p[1]+t*d[1]],r),e)/cc);return candidates[0];}}
 else {const delta=sub(r,p),ap=dot(d,delta),cq=dot(e,delta);add((bb*cq-ap*cc)/det,(aa*cq-bb*ap)/det);}
 for(const [t,u] of [[0,0],[0,1],[1,0],[1,1]])add(t,u);
 add(0,dot(sub(p,r),e)/cc);add(1,dot(sub(q,r),e)/cc);add(dot(sub(r,p),d)/aa,0);add(dot(sub(s,p),d)/aa,1);
 return candidates.reduce((a,b)=>a.distance<=b.distance?a:b);
}
/** In[1117]/[1122]/[1094]: source edge traversal and first representative weld. */
export function recomputeWovenGraphSource(source:WovenGraphSource):{graph:WovenGraph;originalEdgeForSegment:number[]}{
 const {graph,originalEdgeForSegment}=recomputeWovenGraphSourceDetails(source);return {graph,originalEdgeForSegment};
}
export type WovenMedial={edges:[number,number];halfDistance:number;parameters:[number,number];point:XY};
export type WovenWeld={point:XY;representative:XY;distance:number;id:number};
export function recomputeWovenGraphSourceDetails(source:WovenGraphSource):{graph:WovenGraph;originalEdgeForSegment:number[];pairwiseMedials:WovenMedial[];welds:WovenWeld[]}{
 const {vertices:p,edges}=source.inputGraph,items=edges.map(([a,b])=>[{point:p[a],t:0},{point:p[b],t:1}]);
 const native=source.kind==='origamica-intersectify-native',pairwiseMedials:WovenMedial[]=[],welds:WovenWeld[]=[];
 edges.forEach(([a,b],i)=>{for(let j=i+1;j<edges.length;j++){
  const [c,d]=edges[j];
  if(native&&[0,1].some(k=>Math.max(p[a][k],p[b][k])<Math.min(p[c][k],p[d][k])-source.intersectionTolerance||Math.max(p[c][k],p[d][k])<Math.min(p[a][k],p[b][k])-source.intersectionTolerance))continue;
  const m=medial(p[a],p[b],p[c],p[d]),accepted=native?(Math.abs(m.distance)<1e-10?0:m.distance)<=source.intersectionTolerance/2:m.distance<=source.intersectionTolerance/2+1e-10;
  if(accepted){pairwiseMedials.push({edges:[i,j],halfDistance:m.distance,parameters:[m.t,m.u],point:m.point});if(Math.min(Math.abs(m.t),Math.abs(m.t-1))>1e-10)items[i].push({point:m.point,t:m.t});if(Math.min(Math.abs(m.u),Math.abs(m.u-1))>1e-10)items[j].push({point:m.point,t:m.u});}
 }});
 const vertices:XY[]=[],result:[number,number][]=[],owners:number[]=[];
 const index=(point:XY)=>{const found=vertices.findIndex(q=>native?(point[0]-q[0])**2+(point[1]-q[1])**2<=source.samePtTolerance**2:Math.hypot(point[0]-q[0],point[1]-q[1])<=source.samePtTolerance);if(found>=0){const distance=Math.hypot(point[0]-vertices[found][0],point[1]-vertices[found][1]);if(distance>1e-12)welds.push({point:[...point],representative:[...vertices[found]],distance,id:found});return found;}vertices.push([...point]);return vertices.length-1;};
 items.forEach((item,owner)=>{item.sort((a,b)=>a.t-b.t);for(let k=0;k<item.length-1;k++){const a=index(item[k].point),b=index(item[k+1].point);if(a!==b){result.push([a,b]);owners.push(owner);}}});
 const graph:WovenGraph={vertices,edges:result};
 if(source.kind==='origamica-intersectify-native'&&source.motherSelection){
  if(!sameGeometry(graph,source.motherSelection.geometry))throw Error('母图区域声明的点边戳与源线网重算不一致；请重新拆分并选择区域。');
  Object.assign(graph,selectionRoles(source.motherSelection));
 }
 return {graph,originalEdgeForSegment:owners,pairwiseMedials,welds};
}
function selectionRoles(value:Record<string,unknown>|WovenGraph|WovenMotherSelection):Pick<WovenGraph,'holeFaces'|'ringHoles'|'nestedSheets'>{
 return Object.fromEntries(['holeFaces','ringHoles','nestedSheets'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,structuredClone((value as Record<string,unknown>)[k])]));
}
function sameGeometry(expected:Pick<WovenGraph,'vertices'|'edges'>,graph:Pick<WovenGraph,'vertices'|'edges'>):boolean{
 if(expected.vertices.length!==graph.vertices.length||JSON.stringify(expected.edges)!==JSON.stringify(graph.edges))return false;
 const p=expected.vertices,span=Math.max(...[0,1].map(k=>Math.max(...p.map(q=>q[k]))-Math.min(...p.map(q=>q[k])))),mag=Math.max(...p.flat().map(Math.abs)),ulp=mag?2**(Math.floor(Math.log2(mag))-52):Number.MIN_VALUE;
 return p.every((q,i)=>Math.hypot(q[0]-graph.vertices[i][0],q[1]-graph.vertices[i][1])<=1e-9*span+16*ulp);
}
export function wovenGraphSourceMatches(source:WovenGraphSource,graph:WovenGraph):boolean{
 const key=(g:WovenGraph)=>JSON.stringify([g.holeFaces??null,g.ringHoles?.map(b=>[b.face,b.component])??null,g.nestedSheets??null,g.curveHoles??null]);
 try{const expected=recomputeWovenGraphSource(source).graph;return sameGeometry(expected,graph)&&key(expected)===key(graph);}catch{return false;}
}
/** Only region edits can preserve a native source; derived coordinates/indices are never editable. */
export function withWovenMotherSelection(source:Extract<WovenGraphSource,{kind:'origamica-intersectify-native'}>,graph:WovenGraph):Extract<WovenGraphSource,{kind:'origamica-intersectify-native'}>{
 const {motherSelection:_,...base}=source,geometry=recomputeWovenGraphSource(base).graph;
 if(graph.curveHoles)throw Error('附加解析曲线孔须使用手工母图来源；原线网来源不会静默删除曲线参数。');
 if(!readWovenGraph(graph)||!sameGeometry(geometry,graph))throw Error('派生母图只能选择区域；修改点边须返回原输入重新拆分。');
 const roles=selectionRoles(graph);return {...base,...(Object.keys(roles).length?{motherSelection:{geometry:structuredClone({vertices:graph.vertices,edges:graph.edges}),...roles}}:{})};
}
/** A saveable mother is not a certificate of CP, flat folding or global layers. */
export function wovenNativeMotherReady(source:WovenGraphSource,graph:WovenGraph):boolean{
 try{if(!readWovenGraph(graph)||!wovenGraphSourceMatches(source,graph))return false;wovenMotherRegions(graph);return !!wovenGraphEdgeKinds(graph)?.some(k=>k===0);}catch{return false;}
}
