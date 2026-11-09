import {appendWovenEllipseHole} from './wovenCurveHoles';
import {readWovenGraphSource,wovenGraphSourceMatches,wovenIn3437Source,recomputeWovenGraphSource,type WovenGraphSource} from './wovenGraphSource';
import type {XY} from './tessellation';
import {readWovenGraph,wovenGraphPreset,wovenGraphEdgeKinds,type WovenGraph} from './wovenGraph';

export type WovenLine=[number,number,number];
export const WOVEN_HIGH_EVEN_EXAMPLES=[10,12,16,32] as const;
/** Certified local star mothers, preserving every radial and boundary edge.
 * These are reproducible original-objective inputs, not saved Wolfram Out.
 */
export function wovenHighEvenPreset(degree=10):WovenParams&{mode:'graph'} {
 if(!Number.isInteger(degree)||degree<10||degree>32||degree%2)throw Error('高偶度星形示例需要 10–32 度偶数。');
 const vertices:XY[]=[[0,0],...Array.from({length:degree},(_,i)=>{const r=i%2?.1:1,a=2*Math.PI*i/degree;return [r*Math.cos(a),r*Math.sin(a)] as XY;})],
  edges:[number,number][]=[...Array.from({length:degree},(_,i)=>[i+1,(i+1)%degree+1] as [number,number]),...Array.from({length:degree},(_,i)=>[0,i+1] as [number,number])];
 return {family:'woven-lines',mode:'graph',graph:{vertices,edges},width:.01,parity:1,minPleat:.1,minBorderPleat:.001,borderInset:'auto',stationaryFace:0,optimization:'origamica-merit'};
}
/** Two actual separate mother pieces; local example, not a saved Wolfram Out. */
export function wovenIndependentPreset():WovenParams {
 const a=wovenGraphPreset(),n=a.vertices.length,graph:WovenGraph={vertices:[...a.vertices,...a.vertices.map(([x,y])=>[x+8,y] as XY)],edges:[...a.edges,...a.edges.map(([u,v])=>[u+n,v+n] as [number,number])]};
 return {family:'woven-lines',mode:'graph',graph,width:.08,parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0};
}
/** Nested source contours are explicitly independent sheets, never voids. */
export function wovenNestedSheetsPreset():WovenParams&{mode:'graph'} {
 const edges:[number,number][]=[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]];
 return {family:'woven-lines',mode:'graph',graph:{vertices:[[.008,.008],[8,0],[0,8],[-8,0],[0,-8],[2.5001,2.5001],[3,2.5],[2.5,3],[2,2.5],[2.5,2]],edges:[...edges,...edges.map(([a,b])=>[a+5,b+5] as [number,number])],nestedSheets:true},width:.06,parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0};
}
/** A true mother face with an explicitly attached interior boundary ring. */
export function wovenMultiRingPreset():WovenParams&{mode:'graph'}{return {family:'woven-lines',mode:'graph',graph:{vertices:[[.008,.008],[8,0],[0,8],[-8,0],[0,-8],[2,2],[3,2],[3,3],[2,3]],edges:[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4],[5,6],[6,7],[7,8],[8,5]],ringHoles:[{face:0,component:1}]},width:.06,parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0};}
/** Analytic circle boundary plus bounded chords; local example, not Wolfram Out. */
export function wovenCurveHolePreset():WovenParams&{mode:'graph'}{
 const p=wovenMultiRingPreset(),graph={vertices:p.graph.vertices.slice(0,5),edges:p.graph.edges.slice(0,8)};
 return {...p,graph:appendWovenEllipseHole(graph,0,{kind:'ellipse',center:[2.5,2.5],radii:[.4,.4],rotation:0},.015)};
}
export type WovenSegmentInset={line:number;from:XY;to:XY;inset:number};
export type WovenFullEdgeInsets={edgeCount:number;entries:(WovenSegmentInset&{edge:number})[]};
export function readWovenFullEdgeInsets(value:unknown,graphMode=false):WovenFullEdgeInsets|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>,entries=r.entries;
 if(Object.keys(r).sort().join(',')!=='edgeCount,entries'||!Number.isInteger(r.edgeCount)||Number(r.edgeCount)<3||Number(r.edgeCount)>1024||!Array.isArray(entries)||entries.length!==r.edgeCount)return null;
 const point=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=(graphMode?1000:10));
 if(entries.some((item,i)=>!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='edge,from,inset,line,to'||item.edge!==i||!Number.isInteger(item.line)||item.line< -1||item.line>31||!point(item.from)||!point(item.to)||Math.hypot(item.from[0]-item.to[0],item.from[1]-item.to[1])===0||typeof item.inset!=='number'||!Number.isFinite(item.inset)||item.inset<0||item.inset>(graphMode?10:1)))return null;
 return structuredClone(value) as WovenFullEdgeInsets;
}
export type WovenOptimization='legacy'|'origamica-merit';
/** Local finite mother example, using the original objective; not a saved Out. */
export function wovenMeritPreset():WovenParams&{mode:'graph'}{return {
 family:'woven-lines',mode:'graph',width:.06,parity:1,minPleat:.1,minBorderPleat:.001,
 borderInset:'auto',stationaryFace:0,optimization:'origamica-merit',
 graph:{vertices:[[-1,-1],[1,-1],[1,1],[-1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[0,2]]},
};}
/** Reflex mother cell with bounds that retain an accepted whole-paper layer. */
export function wovenMeritConcavePreset():WovenParams&{mode:'graph'}{return {
 ...wovenMeritPreset(),minPleat:.3,minBorderPleat:.05,
 graph:{vertices:[[0,0],[1,0],[.2,.2],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],
 edges:[...Array.from({length:8},(_,k)=>[k+1,(k+1)%8+1] as [number,number]),...[1,3,5,7].map(v=>[0,v] as [number,number])]},
};}
/** In[3432] saved inputs with the original periodic objective, not saved Out. */
export function wovenMeritPeriodicPreset():WovenParams{return {...wovenNotebookPreset('in3432'),optimization:'origamica-merit'};}
/** Explicit central-cell excision; source face order follows In[1278]. */
export function wovenHolePreset():WovenParams&{mode:'graph'}{return {...wovenPreset('graph'),mode:'graph',graph:{vertices:[[-2,-2],[2,-2],[2,2],[-2,2],[-1,-1],[1,-1],[1,1],[-1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],holeFaces:[4]}};}
export function wovenHoleMeritPreset():WovenParams&{mode:'graph'}{const p=wovenHolePreset();p.graph.vertices[0][0]=-2.01;return {...p,optimization:'origamica-merit'};}
type Shared={family:'woven-lines';width:number;parity:1|-1;minPleat:number;minBorderPleat:number;borderInset:'auto'|'none';stationaryFace:number;periodicity?:[number,number][];periodicityEnabled?:boolean;optimization?:WovenOptimization;segmentInsets?:WovenSegmentInset[];fullEdgeInsets?:WovenFullEdgeInsets;wovenVersion?:'original-old'};
export type WovenParams=Shared&({mode:'lines';lines:WovenLine[];boundary:XY[]}|{mode:'chord';lines:WovenLine[];order:number;boundary?:XY[]}|{mode:'random';boundary:XY[];count:number;minDistance:number;seed:number;maxTries:number;randomVersion?:'original-courteous'|'original-courteous-graph';samePtTolerance?:number;intersectionTolerance?:number}|{mode:'graph';graph:WovenGraph;graphSource?:WovenGraphSource});
export function wovenPeriodicityEnabled(params:Pick<WovenParams,'periodicity'|'periodicityEnabled'>):boolean{return params.periodicityEnabled===true||!!params.periodicity?.length;}
export const WOVEN_MODES={lines:'自定义线组',chord:'旋转弦星',random:'随机线组',graph:'有限母图'};
export const WOVEN_BOX:XY[]=[[-1,-1],[1,-1],[1,1],[-1,1]];
export const WOVEN_NOTEBOOK_EXAMPLES=[
 {id:'in3429',label:'In[3429] 三线'},
 {id:'in3431',label:'In[3431] 四线变宽'},
 {id:'in3432',label:'In[3432] 四线周期'},
 {id:'in3434',label:'In[3434] 七角星 · 层序冲突，不可采用'},
] as const;
export type WovenNotebookExampleId=(typeof WOVEN_NOTEBOOK_EXAMPLES)[number]['id'];
/** Physical inputs from the saved Origamica 15.0 §42 examples. */
export function wovenNotebookPreset(id:WovenNotebookExampleId):WovenParams{
 const base:Shared={family:'woven-lines',width:.2,parity:-1,minPleat:1,minBorderPleat:.01,borderInset:'none',stationaryFace:0};
 const box:XY[]=[[0,0],[2,0],[2,1.5],[0,1.5]];
 switch(id){
  case 'in3429':return {...base,mode:'lines',lines:[[90,-1,2],[0,1,2],[-45,3/Math.sqrt(2),2]],
   boundary:[[0,0],[4,0],[4,4],[0,4]],parity:1,stationaryFace:5};
  case 'in3431':return {...base,mode:'lines',lines:[[0,.5,2],[0,.9,1],[90,-1,2],[90,-1.5,1]],boundary:box};
  case 'in3432':return {...base,mode:'lines',lines:[[0,.5,1.5],[0,.9,1.5],[90,-1,1.5],[90,-1.5,1.5]],
   boundary:box,borderInset:'auto',periodicity:[[4,14],[0,13],[7,2],[11,8]]};
  case 'in3434':return {...base,mode:'chord',lines:[[0,.15,1]],order:7,width:.06,borderInset:'auto'};
 }
 throw new Error('未知的 Origamica 编织保存样例。');
}
export function wovenPreset(mode:WovenParams['mode']='lines'):WovenParams{
 const shared:Shared={family:'woven-lines',width:mode==='chord'?.035:mode==='random'?.04:.08,parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0};
 if(mode==='graph')return {...shared,mode,graph:wovenGraphPreset()};
 if(mode==='chord')return {...shared,mode,lines:[[0,.4,1]],order:7};
 if(mode==='random')return {...shared,mode,boundary:structuredClone(WOVEN_BOX),count:5,minDistance:.15,seed:12,maxTries:500};
 return {...shared,mode,lines:[[0,-.25,1],[90,-.25,1.5],[45,.4,.7]],boundary:structuredClone(WOVEN_BOX)};
}
export function wovenIn3437Preset():WovenParams&{mode:'graph'}{const graphSource=wovenIn3437Source();return {...wovenPreset('graph'),mode:'graph',width:16,graph:recomputeWovenGraphSource(graphSource).graph,graphSource};}
export function readWovenParams(raw:Record<string,unknown>):WovenParams|null{
 const mode=raw.mode??'lines';if(mode!=='lines'&&mode!=='chord'&&mode!=='random'&&mode!=='graph')return null;
 const base=wovenPreset(mode) as unknown as Record<string,unknown>;
 const courteousGraph=mode==='random'&&raw.randomVersion==='original-courteous-graph',courteous=mode==='random'&&(raw.randomVersion==='original-courteous'||courteousGraph);
 if(courteous){base.seed=0;base.maxTries=20000;}
 if(courteousGraph){base.samePtTolerance=1e-6;base.intersectionTolerance=1e-6;}
 const allowed=new Set([...Object.keys(base),'periodicity','periodicityEnabled','optimization','segmentInsets','fullEdgeInsets','wovenVersion',...(mode==='chord'?['boundary']:mode==='graph'?['graphSource']:mode==='random'?['randomVersion']:[])]);
 if(Object.keys(raw).some(k=>!allowed.has(k)))return null;
 const next={...base,...raw};
 if(mode==='graph'){const graph=readWovenGraph(next.graph);if(!graph||'segmentInsets' in next)return null;next.graph=graph;if('graphSource' in next){const source=readWovenGraphSource(next.graphSource);if(!source||!wovenGraphSourceMatches(source,graph))return null;next.graphSource=source;}}
 if('randomVersion' in next&&next.randomVersion!=='original-courteous'&&next.randomVersion!=='original-courteous-graph')return null;
 const bounds:Record<string,[number,number,boolean?]>={width:[.005,mode==='graph'?20:.2],parity:[-1,1,true],minPleat:[.1,6],minBorderPleat:[.001,2],stationaryFace:[0,255,true],order:[1,12,true],count:[1,24,true],minDistance:[.001,2],seed:[0,999999,true],maxTries:[1,courteous?20000:5000,true]};
 if(courteousGraph){bounds.samePtTolerance=[0,.1];bounds.intersectionTolerance=[0,.1];}
 for(const [key,[lo,hi,integer]] of Object.entries(bounds))if(key in next){const n=next[key];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi||integer&&!Number.isInteger(n))return null;}
 if(next.parity===0||!['auto','none'].includes(String(next.borderInset)))return null;
 if('optimization' in next&&!['legacy','origamica-merit'].includes(String(next.optimization)))return null;
 if('wovenVersion' in next&&(next.wovenVersion!=='original-old'||mode!=='graph'||next.borderInset!=='auto'||['periodicity','periodicityEnabled','segmentInsets','fullEdgeInsets'].some(k=>k in next)||'optimization' in next&&next.optimization!=='origamica-merit'||Object.keys(next.graph as object).sort().join(',')!=='edges,vertices'))return null;
 if('lines' in next){
  const lines=next.lines;if(!Array.isArray(lines)||lines.length<1||lines.length>32)return null;
  if(lines.some(row=>!Array.isArray(row)||row.length!==3||row.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(row[0])>360||Math.abs(row[1])>10||row[2]<.2||row[2]>5))return null;
  if(mode==='chord'&&lines.length*Number(next.order)>32)return null;
 }
 if('boundary' in next){
  const p=next.boundary;if(!Array.isArray(p)||p.length<(mode==='chord'?1:3)||p.length>32||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>10)))return null;
  if(p.some((a,i)=>p.slice(i+1).some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)))return null;
  if(mode!=='chord'){
   const area=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0);
   if(Math.abs(area)<1e-7)return null;
   if(p.some((a,i)=>{const b=p[(i+1)%p.length];return p.some(q=>Math.sign(area)*((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))< -1e-9);}))return null;
  }
 }
 if('periodicity' in next){const p=next.periodicity;if(!Array.isArray(p)||p.length>64||p.some(x=>!Array.isArray(x)||x.length!==2||x[0]===x[1]||x.some(n=>!Number.isInteger(n)||n<0||n>2047)))return null;}
 if('periodicityEnabled' in next&&(typeof next.periodicityEnabled!=='boolean'||next.periodicityEnabled===false&&Array.isArray(next.periodicity)&&next.periodicity.length))return null;
 if('segmentInsets' in next){
  const entries=next.segmentInsets;
  if(!Array.isArray(entries)||entries.length>128||entries.some(entry=>{
   if(!entry||typeof entry!=='object'||Array.isArray(entry))return true;
   const item=entry as Record<string,unknown>;
   if(Object.keys(item).sort().join(',')!=='from,inset,line,to'||!Number.isInteger(item.line)||Number(item.line)<0||Number(item.line)>31||typeof item.inset!=='number'||!Number.isFinite(item.inset)||item.inset<.0025||item.inset>1)return true;
   const point=(value:unknown)=>Array.isArray(value)&&value.length===2&&value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10);
   return !point(item.from)||!point(item.to)||Math.hypot((item.from as XY)[0]-(item.to as XY)[0],(item.from as XY)[1]-(item.to as XY)[1])<1e-7;
  }))return null;
 }
 if('fullEdgeInsets' in next){
  if('segmentInsets' in next)return null;
  const full=readWovenFullEdgeInsets(next.fullEdgeInsets,mode==='graph');if(!full)return null;next.fullEdgeInsets=full;
  if(mode==='graph'){
   const graph=next.graph as WovenGraph,kinds=wovenGraphEdgeKinds(graph);if(!kinds||full.edgeCount!==graph.edges.length)return null;
   const p=graph.vertices,span=Math.max(...[0,1].map(k=>Math.max(...p.map(q=>q[k]))-Math.min(...p.map(q=>q[k])))),mag=Math.max(...p.flat().map(Math.abs)),ulp=mag?2**(Math.floor(Math.log2(mag))-52):Number.MIN_VALUE,tol=1e-9*span+16*ulp;
   if(full.entries.some((e,i)=>{const [a,b]=graph.edges[i];return e.line!==kinds[i]||Math.min(Math.max(Math.hypot(e.from[0]-p[a][0],e.from[1]-p[a][1]),Math.hypot(e.to[0]-p[b][0],e.to[1]-p[b][1])),Math.max(Math.hypot(e.from[0]-p[b][0],e.from[1]-p[b][1]),Math.hypot(e.to[0]-p[a][0],e.to[1]-p[a][1])))>tol;}))return null;
  }
 }
 return next as WovenParams;
}
