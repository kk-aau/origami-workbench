import type {WovenParams,WovenLine} from './wovenParams';
import type {TessGraph,XY} from './tessellation';
import {courteousPythonRandom} from './courteousRandomStream';
import {recomputeWovenCourteousGraph} from './wovenCourteousGraph';
import {readWovenGraph,wovenGraphEdgeKinds,wovenGraphFaceCycles} from './wovenGraph';
import {wovenFullInsetsMatch} from './wovenFullInsets';

type Segment=[XY,XY];
type RandomParams=Extract<WovenParams,{mode:'random'}>;
export function wovenCourteousPreset():RandomParams{
 return {family:'woven-lines',mode:'random',randomVersion:'original-courteous',boundary:[[-1,-1],[1,-1],[1,1],[-1,1]],
  count:2,minDistance:.05,seed:0,maxTries:20000,width:.02,parity:1,minPleat:.1,minBorderPleat:.001,
  borderInset:'auto',stationaryFace:0,optimization:'origamica-merit'};
}
export function wovenCourteousGraphPreset():RandomParams{
 return {...wovenCourteousPreset(),randomVersion:'original-courteous-graph',samePtTolerance:1e-6,intersectionTolerance:1e-6};
}
const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0],sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]],
 distance=(a:XY,b:XY)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const sign=(p:XY[])=>p.reduce((s,a,i)=>s+cross(a,p[(i+1)%p.length]),0)>0?1:-1;
const near=(a:unknown,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)):
 Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>near(a[i],v)):
 b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>near((a as any)[k],v)):a===b;
const inside=(q:XY,boundary:XY[])=>{
 const scale=Math.max(1,...boundary.flat().map(Math.abs)),epsilon=32*2**(Math.floor(Math.log2(scale*scale))-52),orientation=sign(boundary);
 return q.every(Number.isFinite)&&boundary.every((a,i)=>orientation*cross(sub(boundary[(i+1)%boundary.length],a),sub(q,a))>=-epsilon);
};
function clip(a:XY,b:XY,boundary:XY[]):Segment|null{
 const direction=sub(b,a),orientation=sign(boundary);let low=0,high=1;
 for(let i=0;i<boundary.length;i++){
  const p=boundary[i],edge=sub(boundary[(i+1)%boundary.length],p),value=orientation*cross(edge,sub(a,p)),slope=orientation*cross(edge,direction);
  if(slope===0){if(value<0)return null;}else if(slope>0)low=Math.max(low,-value/slope);else high=Math.min(high,-value/slope);
 }
 return low<high?[[a[0]+low*direction[0],a[1]+low*direction[1]],[a[0]+high*direction[0],a[1]+high*direction[1]]]:null;
}
function intersections(segment:Segment,existing:Segment[],boundary:XY[]):XY[]{
 const [a,b]=segment,direction=sub(b,a),points:XY[]=[];
 for(const [p,q] of existing){
  const edge=sub(q,p),det=cross(direction,edge);if(det===0)continue;
  const t=cross(sub(p,a),edge)/det,point:XY=[a[0]+t*direction[0],a[1]+t*direction[1]];
  if(inside(point,boundary))points.push(point);
 }
 return points;
}
/** Replay recorded uniform draws, retaining source order and original fails quirk. */
export function replayCourteousDraws(p:RandomParams,values:number[]){
 const boundary=p.boundary,existing:Segment[]=boundary.map((a,i)=>[[...a],[...boundary[(i+1)%boundary.length]]]),oldPoints=boundary.map(a=>[...a] as XY),lines:WovenLine[]=[];
 const low:XY=[Math.min(...boundary.map(a=>a[0])),Math.min(...boundary.map(a=>a[1]))],high:XY=[Math.max(...boundary.map(a=>a[0])),Math.max(...boundary.map(a=>a[1]))],
  center:XY=[(low[0]+high[0])/2,(low[1]+high[1])/2],radius=distance(low,high);
 let consumed=0,attempts=0,failures=0,nonintersection=0,stop:string|undefined,
  providerAttempts=0,outsideCenterRejections=0,resourceAttempts=0,candidateGeometryRejections=0;
 const draw=()=>{
  if(consumed>=10000)return undefined;
  const value=values[consumed++];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>=1)throw Error('原随机流不完整。');return value;
 };
 while(lines.length<p.count&&failures<p.maxTries&&resourceAttempts<5000){
  let candidateCenter:XY|undefined;
  while(!candidateCenter){
   if(resourceAttempts>=5000){stop='resource-attempts';break;}providerAttempts++;resourceAttempts++;
   const r=draw(),theta=draw();if(r===undefined||theta===undefined){stop='resource-draws';break;}
   const point:XY=[center[0]+radius*r*Math.cos(2*Math.PI*theta),center[1]+radius*r*Math.sin(2*Math.PI*theta)];
   if(inside(point,boundary))candidateCenter=point;else outsideCenterRejections++;
  }
  if(stop)break;
  if(resourceAttempts>=5000){stop='resource-attempts';break;}resourceAttempts++;
  const theta=draw();if(theta===undefined){stop='resource-draws';break;}
  const direction:XY=[radius*Math.cos(2*Math.PI*theta),radius*Math.sin(2*Math.PI*theta)],point=candidateCenter!;
  const segment=clip(sub(point,direction),[point[0]+direction[0],point[1]+direction[1]],boundary);attempts++;
  if(!segment){candidateGeometryRejections++;continue;}
  const ints=intersections(segment,existing,boundary);
  if(ints.length<=2&&existing.length!==boundary.length){nonintersection++;continue;}
  if(ints.some((a,i)=>ints.slice(i+1).some(b=>distance(a,b)<p.minDistance))||ints.some(a=>oldPoints.some(b=>distance(a,b)<p.minDistance))){failures++;continue;}
  existing.push(segment);oldPoints.push(...ints);
  const [a,b]=segment,angle=(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI%180+180)%180,rad=angle*Math.PI/180;
  lines.push([angle,-a[0]*Math.sin(rad)+a[1]*Math.cos(rad),p.width]);
 }
 stop??=lines.length===p.count?'goal':failures>=p.maxTries?'distance-failures':'resource-attempts';
 if(consumed!==values.length)throw Error('原随机流含未使用的追加数据。');
 return {lines,completeLines:existing,attempts,distanceFailures:failures,noInteriorIntersectionRejections:nonintersection,stopReason:stop,
  providerAttempts,outsideCenterRejections,resourceAttempts,candidateGeometryRejections};
}

/** Original Lines must correspond to every actual local-arrangement edge. */
function motherMatches(complete:Segment[],boundaryCount:number,mother:TessGraph):boolean{
 const expected:{a:XY;b:XY;border:boolean}[]=[],all:XY[]=[];
 for(let i=0;i<complete.length;i++){
  const [a,b]=complete[i],d=sub(b,a),length2=d[0]**2+d[1]**2,points:[number,XY][]=[[0,a],[1,b]];
  for(let j=0;j<complete.length;j++)if(i!==j){
   const [p,q]=complete[j],e=sub(q,p),det=cross(d,e);if(det===0)continue;
   const t=cross(sub(p,a),e)/det,u=cross(sub(p,a),d)/det;
   if(t>=-1e-10&&t<=1+1e-10&&u>=-1e-10&&u<=1+1e-10)points.push([Math.max(0,Math.min(1,t)),[a[0]+t*d[0],a[1]+t*d[1]]]);
  }
  points.sort((a,b)=>a[0]-b[0]);const unique:XY[]=[];
  for(const [,point] of points)if(!unique.length||distance(unique.at(-1)!,point)>1e-8)unique.push(point);
  for(const point of unique)if(!all.some(q=>distance(q,point)<=1e-8))all.push(point);
  for(let j=0;j<unique.length-1;j++)expected.push({a:unique[j],b:unique[j+1],border:i<boundaryCount});
  if(length2===0)return false;
 }
 const coords=mother.vertices_coords,edges=mother.edges_vertices;
 if(coords.length!==all.length||edges.length!==expected.length||!coords.every(p=>all.some(q=>distance(p,q)<=1e-8)))return false;
 const used=new Set<number>();
 return edges.every(([a,b],i)=>{
  if(!coords[a]||!coords[b])return false;
  const found=expected.findIndex((s,j)=>!used.has(j)&&(s.border===(mother.edges_assignment[i]==='B'))&&
   Math.min(Math.max(distance(coords[a],s.a),distance(coords[b],s.b)),Math.max(distance(coords[a],s.b),distance(coords[b],s.a)))<=1e-8);
  if(found<0)return false;used.add(found);return true;
 });
}
function readSource(source:Record<string,unknown>,p:WovenParams,mother?:TessGraph|null){
 if(p.mode!=='random'||p.randomVersion!=='original-courteous'&&p.randomVersion!=='original-courteous-graph')return null;
 const graphMode=p.randomVersion==='original-courteous-graph';
 const raw=source.courteousAnarchy;if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const s=raw as Record<string,any>,draws=s.randomDraws;
 if(!Array.isArray(draws)||draws.length>10000)return null;
 const rng=courteousPythonRandom(p.seed);if(draws.some(v=>typeof v!=='number'||v!==rng()))return null;
 let replay;try{replay=replayCourteousDraws(p,draws);}catch{return null;}
 const expected={schema:'origamica-courteous-lines-v1',function:'MakeCourteousAnarchyLines',definitionCells:['In[3407]','In[3408]'],
  definitionLines:[[251806,251819],[251821,252110]],boundary:p.boundary,goal:p.count,minimumDistance:p.minDistance,randSeed:p.seed,maxDistanceFailures:p.maxTries,
  totalAttemptLimit:5000,totalRandomDrawLimit:10000,attempts:replay.attempts,distanceFailures:replay.distanceFailures,
  providerAttempts:replay.providerAttempts,outsideCenterRejections:replay.outsideCenterRejections,resourceAttempts:replay.resourceAttempts,candidateGeometryRejections:replay.candidateGeometryRejections,
  noInteriorIntersectionRejections:replay.noInteriorIntersectionRejections,stopReason:replay.stopReason,randomEngine:'Python random.Random',
  randomDraws:draws,completeLines:replay.completeLines,wolframSeedSequenceReproduced:false,wolframExecuted:false,
  motherGraphRoute:graphMode?'original-indexify-maketgraph-intersectify':'local-arrangement-from-accepted-lines',originalGraphOptionsReproduced:graphMode};
 if(!replay.lines.length||!near(s,expected)||source.requested!==p.count||source.generated!==replay.lines.length||source.attempts!==replay.attempts||source.seed!==p.seed||
  !near(source.lines,replay.lines)||!mother)return null;
 if(graphMode){
  if(s.completeLines.some((segment:Segment,i:number)=>segment.some((point:XY,j:number)=>point.some((n,k)=>Math.abs(n-replay.completeLines[i][j][k])>1e-12))))return null;
  const proof=recomputeWovenCourteousGraph(s.completeLines,p.samePtTolerance??1e-6,p.intersectionTolerance??1e-6),rawProof=source.courteousGraph as Record<string,any>|undefined;
  const exact=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v)):
   b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>exact((a as Record<string,unknown>)[k],v)):a===b;
  const edgeLines=proof.edgeOrigins.map(i=>i<p.boundary.length?-1:i-p.boundary.length);
  const checkedGraph=readWovenGraph({vertices:proof.graph.vertices,edges:proof.graph.edges}),kinds=checkedGraph&&wovenGraphEdgeKinds(checkedGraph),cycles=checkedGraph&&wovenGraphFaceCycles(checkedGraph);
  if(!kinds||!cycles||!exact(kinds.map(i=>i<0?'B':'U'),edgeLines.map(i=>i<0?'B':'U'))||!exact(mother.faces_vertices,cycles.inner.map(f=>f.slice().reverse())))return null;
  const widths=edgeLines.map(i=>i<0?0:p.width),periodic=p.periodicityEnabled===true||!!p.periodicity?.length;
  if(source.borderInset!==(p.borderInset==='auto'&&!periodic?p.width/2:0)||!exact(source.segmentInsets,p.segmentInsets??[]))return null;
  if(p.fullEdgeInsets){
   const edges=proof.graph.edges.map(([a,b],edge)=>({edge,line:edgeLines[edge],from:proof.graph.vertices[a],to:proof.graph.vertices[b],current:widths[edge]/2,base:widths[edge]/2}));
   if(!wovenFullInsetsMatch(p.fullEdgeInsets,edges,false)||!exact(source.fullEdgeInsets,p.fullEdgeInsets))return null;
   const requested=p.fullEdgeInsets.entries.map(e=>e.inset),effective=requested.map((h,i)=>edgeLines[i]<0&&(p.borderInset==='none'||periodic)?0:h);
   if(!exact(source.requestedEdgeInsets,requested)||!exact(source.effectiveEdgeInsets,effective))return null;
   effective.forEach((h,i)=>widths[i]=2*h);
  }else{
   if(['fullEdgeInsets','requestedEdgeInsets','effectiveEdgeInsets'].some(k=>k in source))return null;
   const used=new Set<number>();
   for(const entry of p.segmentInsets??[]){
    const matches=proof.graph.edges.flatMap(([a,b],i)=>{
     if(edgeLines[i]!==entry.line)return [];
     const q=proof.graph.vertices[a],r=proof.graph.vertices[b],error=Math.min(Math.max(distance(q,entry.from),distance(r,entry.to)),Math.max(distance(q,entry.to),distance(r,entry.from)));
     return error<1e-7?[i]:[];
    });
    if(matches.length!==1||used.has(matches[0]))return null;used.add(matches[0]);widths[matches[0]]=2*entry.inset;
   }
  }
  if(!near(rawProof,proof)||!rawProof||rawProof.samePtTolerance!==proof.samePtTolerance||rawProof.intersectionTolerance!==proof.intersectionTolerance||
   rawProof.chopTolerance!==proof.chopTolerance||rawProof.medialTieBranchesChecked!==proof.medialTieBranchesChecked||rawProof.medialTieBranchLimit!==proof.medialTieBranchLimit||
   !exact(rawProof.definitionLines,proof.definitionLines)||
   !exact(rawProof.firstIndex.edges,proof.firstIndex.edges)||!exact(rawProof.secondIndex.edges,proof.secondIndex.edges)||
   !exact(rawProof.graph.edges,proof.graph.edges)||!exact(rawProof.embeddedEdgeOrigins,proof.embeddedEdgeOrigins)||
   !exact(rawProof.removedSelfLoopSegments,proof.removedSelfLoopSegments)||!exact(rawProof.edgeOrigins,proof.edgeOrigins)||
   !near(mother.vertices_coords,proof.graph.vertices)||!exact(mother.edges_vertices,proof.graph.edges)||
   !exact(mother.edges_assignment,edgeLines.map(i=>i<0?'B':'U'))||!exact(source.edgeLines,edgeLines)||
   !exact(source.edgeWidths,widths))return null;
 }else if(!motherMatches(replay.completeLines,p.boundary.length,mother))return null;
 return expected;
}
export function readWovenCourteousSource(source:Record<string,unknown>,p:WovenParams,mother?:TessGraph|null){
 try{return readSource(source,p,mother);}catch{return null;}
}
