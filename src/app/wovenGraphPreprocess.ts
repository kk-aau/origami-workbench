import {api} from './api';
import {readWovenGraph,wovenGraphEdgeKinds,type WovenGraph} from './wovenGraph';
import {readWovenGraphSource,readWovenIntersectionInput,recomputeWovenGraphSourceDetails,wovenGraphSourceMatches,type WovenGraphSource,type WovenMedial,type WovenWeld} from './wovenGraphSource';

export type WovenPreprocessSource=Extract<WovenGraphSource,{kind:'origamica-intersectify-native'}>;
export type WovenPreprocessQuery={family:'woven-graph-preprocess-native';inputGraph:WovenGraph;intersectionTolerance:number;samePtTolerance:number;invertFoldType:boolean};
export type WovenPreprocessResult={family:'origamica-native-woven-intersectify';source:WovenPreprocessSource;graph:WovenGraph;originalEdgeForSegment:number[];pairwiseMedials:WovenMedial[];welds:WovenWeld[];indexification:string;diagnostics:{inputVertices:number;inputEdges:number;outputVertices:number;outputEdges:number;wovenInput:{status:'accepted';sourceFaceCycles:number[][];edgeLines:number[]}|{status:'not_ready';reason:string}};original:{functions:string[];cells:number[];boundingBoxTolerance:number;chopTolerance:number;samePointSquaredDistance:true;firstEncounteredRepresentative:true;averagesRepresentatives:false};certificates:{creasePatternConstructed:false;flatFoldComputed:false;globalLayerOrder:false;adoptAsFold:false}};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(r:Record<string,unknown>,expected:string[])=>Object.keys(r).sort().join(',')===expected.sort().join(',');
export function readWovenPreprocessQuery(value:unknown):WovenPreprocessQuery|null{
 if(!record(value)||Object.keys(value).some(k=>!['family','inputGraph','intersectionTolerance','samePtTolerance','invertFoldType'].includes(k))||value.family!=='woven-graph-preprocess-native')return null;
 const source=readWovenGraphSource({kind:'origamica-intersectify-native',inputGraph:value.inputGraph,intersectionTolerance:'intersectionTolerance' in value?value.intersectionTolerance:0,samePtTolerance:'samePtTolerance' in value?value.samePtTolerance:1e-6,invertFoldType:'invertFoldType' in value?value.invertFoldType:false});
 if(!source||source.kind!=='origamica-intersectify-native')return null;
 return {family:'woven-graph-preprocess-native',inputGraph:source.inputGraph,intersectionTolerance:source.intersectionTolerance,samePtTolerance:source.samePtTolerance,invertFoldType:source.invertFoldType};
}
/** Native Indexify may collapse to one point or retain duplicate segments: show the actual primitive result. */
function readPrimitiveGraph(value:unknown):WovenGraph|null{
 if(!record(value)||!keys(value,['vertices','edges']))return null;const p=value.vertices,e=value.edges;
 if(!Array.isArray(p)||p.length<1||p.length>16384||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000))||!Array.isArray(e)||e.length>16384||e.some(q=>!Array.isArray(q)||q.length!==2||q[0]===q[1]||q.some(n=>!Number.isInteger(n)||n<0||n>=p.length)))return null;
 return structuredClone(value) as WovenGraph;
}
/** Independent In[1278] traversal; an accepted response must preserve original ordered face IDs. */
function sourceFaces(graph:WovenGraph):number[][]|null{
 const {vertices:p,edges}=graph,neighbors:number[][]=p.map(()=>[]),seen=new Set<string>(),faces:number[][]=[];
 edges.forEach(([a,b])=>{neighbors[a].push(b);neighbors[b].push(a);});
 neighbors.forEach((ns,v)=>ns.sort((a,b)=>Math.atan2(p[a][1]-p[v][1],p[a][0]-p[v][0])-Math.atan2(p[b][1]-p[v][1],p[b][0]-p[v][0])));
 for(const first of [...edges,...edges.map(([a,b])=>[b,a] as [number,number])]){
  if(seen.has(first.join(',')))continue;const face:number[]=[];let [a,b]=first;
  while(!seen.has(`${a},${b}`)){seen.add(`${a},${b}`);face.push(a);const ns=neighbors[b];[a,b]=[b,ns[(ns.indexOf(a)+ns.length-1)%ns.length]];}
  if(a!==first[0]||b!==first[1]||face.length<3||new Set(face).size!==face.length)return null;
  if(face.reduce((s,a,i)=>{const b=face[(i+1)%face.length];return s+p[a][0]*p[b][1]-p[a][1]*p[b][0];},0)>0)faces.push(face);
 }
 return faces;
}
/** Trust neither a source label nor a successful HTTP status: recompute split geometry and every source owner. */
export function readWovenPreprocessResult(value:unknown,query:WovenPreprocessQuery):WovenPreprocessResult|null{
 if(!record(value)||!keys(value,['family','source','graph','originalEdgeForSegment','pairwiseMedials','welds','indexification','diagnostics','original','certificates'])||value.family!=='origamica-native-woven-intersectify')return null;
 const source=readWovenGraphSource(value.source),graph=readPrimitiveGraph(value.graph),checked=readWovenPreprocessQuery(query);
 if(!source||source.kind!=='origamica-intersectify-native'||source.motherSelection||!graph||!checked||JSON.stringify(source.inputGraph)!==JSON.stringify(checked.inputGraph)||source.intersectionTolerance!==checked.intersectionTolerance||source.samePtTolerance!==checked.samePtTolerance||source.invertFoldType!==checked.invertFoldType||!wovenGraphSourceMatches(source,graph))return null;
 const expected=recomputeWovenGraphSourceDetails(source),p=expected.graph.vertices,span=Math.max(...[0,1].map(k=>Math.max(...p.map(q=>q[k]))-Math.min(...p.map(q=>q[k])))),tol=1e-9*Math.max(span,1)+16*Number.EPSILON*Math.max(...p.flat().map(Math.abs));
 const near=(a:unknown,b:unknown):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=tol:Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((q,i)=>near(a[i],q)):record(b)?record(a)&&keys(a,Object.keys(b))&&Object.entries(b).every(([k,q])=>k==='id'||k==='edges'?JSON.stringify(a[k])===JSON.stringify(q):near(a[k],q)):a===b;
 if(JSON.stringify(value.originalEdgeForSegment)!==JSON.stringify(expected.originalEdgeForSegment)||!near(value.pairwiseMedials,expected.pairwiseMedials)||!near(value.welds,expected.welds)||typeof value.indexification!=='string'||!value.indexification.startsWith('In[1094] first encountered representative, Euclidean SamePtTolerance='))return null;
 const d=value.diagnostics,o=value.original,c=value.certificates;
 if(!record(d)||!keys(d,['inputVertices','inputEdges','outputVertices','outputEdges','wovenInput'])||d.inputVertices!==source.inputGraph.vertices.length||d.inputEdges!==source.inputGraph.edges.length||d.outputVertices!==graph.vertices.length||d.outputEdges!==graph.edges.length||!record(d.wovenInput))return null;
 const w=d.wovenInput;
 if(w.status==='accepted'){
  if(!keys(w,['status','sourceFaceCycles','edgeLines'])||!readWovenGraph(graph)||JSON.stringify(w.edgeLines)!==JSON.stringify(wovenGraphEdgeKinds(graph))||JSON.stringify(w.sourceFaceCycles)!==JSON.stringify(sourceFaces(graph)))return null;
 }else if(w.status!=='not_ready'||!keys(w,['status','reason'])||typeof w.reason!=='string'||!w.reason.length||w.reason.length>3000)return null;
 if(!record(o)||!keys(o,['functions','cells','boundingBoxTolerance','chopTolerance','samePointSquaredDistance','firstEncounteredRepresentative','averagesRepresentatives'])||JSON.stringify(o.functions)!==JSON.stringify(['EmbeddedIntersectify','Intersectify','Indexify'])||JSON.stringify(o.cells)!==JSON.stringify([1117,1122,1094])||o.boundingBoxTolerance!==source.intersectionTolerance||o.chopTolerance!==1e-10||o.samePointSquaredDistance!==true||o.firstEncounteredRepresentative!==true||o.averagesRepresentatives!==false)return null;
 if(!record(c)||!keys(c,['creasePatternConstructed','flatFoldComputed','globalLayerOrder','adoptAsFold'])||Object.values(c).some(v=>v!==false))return null;
 return structuredClone(value) as WovenPreprocessResult;
}
export async function preprocessWovenGraph(query:WovenPreprocessQuery,signal?:AbortSignal):Promise<WovenPreprocessResult>{
 const checked=readWovenPreprocessQuery(query);if(!checked||!readWovenIntersectionInput(checked.inputGraph))throw new Error('原线网、容差或倒置设置无效。');
 let value:unknown;
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{value=await api<unknown>('tessellation/woven-graph-preprocess',checked,signal);break;}
  catch(error){
   if(signal?.aborted||attempt>=240||!(error instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(error.message))throw error;
   await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   });
  }
 }
 const result=readWovenPreprocessResult(value,checked);
 if(!result)throw new Error('拆分结果与源线网重算不一致，请重新拆分。');return result;
}
