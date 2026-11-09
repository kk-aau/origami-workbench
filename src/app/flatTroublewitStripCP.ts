import {validateDoc,type Doc,type FoldGraph,type Point,type Assignment} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';

export type FlatTroublewitStripRecipe=
 |{model:'flat-strip';pathMm:Point[];widthMm:number;spreadAngleDeg:number;edgeTypes:'automatic'|('M'|'V')[]}
 |{model:'troublewit';originMm:Point;lengthsMm:number[];directionsDeg:number[]}
 |{model:'canonical-troublewit';originMm:Point;directionsDeg:number[]};
type Matrix=[number,number,number,number,number,number];
type FoldingTrace={firstAngleRad:number;alignmentUnit:Point;axisLengthsMm:number[]};
export type FlatTroublewitStripTrace={directionUnits:Point[]|null;distancesMm:number[];bendAnglesDeg:number[];boundaryUnits:[Point,Point];sectorUnits:Point[];folding:FoldingTrace};
const NS='originalFlatTroublewitStrip',SCHEMA='original-in2366-in2374-in2376-finite-cp-v1',DEG=Math.PI/180,MAX_SEGMENTS=128;
const NOTEBOOK_SHA='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9';
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const point=(x:unknown):x is Point=>Array.isArray(x)&&x.length===2&&x.every(n=>finite(n)&&Math.abs(n)<=100000);
const length=(x:unknown)=>finite(x)&&x>=.00001&&x<=10000;
const exact=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k])):typeof a===typeof b&&a===b;
const near=(a:unknown,b:number)=>finite(a)&&Math.abs(a-b)<=Math.max(2e-11,256*Number.EPSILON*Math.max(1,Math.abs(b)));
const numeric=(a:unknown,b:unknown):boolean=>typeof b==='number'?near(a,b):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>numeric(a[i],v)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>numeric(a[k],b[k])):exact(a,b);
function keys(o:Record<string,any>,ks:string[]){if(Object.keys(o).length!==ks.length||ks.some(k=>!Object.hasOwn(o,k)))throw Error('原纸带参数字段不完整或含未支持字段。');}
export function validateFlatTroublewitStripRecipe(raw:unknown):FlatTroublewitStripRecipe{
 if(!record(raw)||!['flat-strip','troublewit','canonical-troublewit'].includes(raw.model))throw Error('需要原折叠纸带或 Troublewit 类型。');
 const ks=raw.model==='flat-strip'?['model','pathMm','widthMm','spreadAngleDeg','edgeTypes']:raw.model==='troublewit'?['model','originMm','lengthsMm','directionsDeg']:['model','originMm','directionsDeg'];keys(raw,ks);
 if(raw.model==='flat-strip'){
  if(!Array.isArray(raw.pathMm)||raw.pathMm.length<2||raw.pathMm.length>MAX_SEGMENTS+1||!raw.pathMm.every(point))throw Error('原目标路径须为 2–129 个有限二维毫米点，坐标绝对值不超过 100000。');
  if(!finite(raw.widthMm)||raw.widthMm<0||raw.widthMm>200||!finite(raw.spreadAngleDeg)||Math.abs(raw.spreadAngleDeg)>60||raw.widthMm===0&&raw.spreadAngleDeg<=0)throw Error('初始宽须为 0–200 mm，展角为 −60–60°；零宽三角纸带须有正展角。');
  if(raw.widthMm>0&&raw.widthMm<.00001)throw Error('非零初始宽须至少为 0.00001 mm。');
  if(raw.edgeTypes!=='automatic'&&(!Array.isArray(raw.edgeTypes)||raw.edgeTypes.length!==raw.pathMm.length-2||raw.edgeTypes.some(t=>t!=='M'&&t!=='V')))throw Error('原 EdgeTypes 在此有限入口须为 Automatic，或每个内部点一个 M/V；没有猜测其他类型的材料语义。');
 }else{
  if(!point(raw.originMm))throw Error('原起点须为有限二维毫米点，坐标绝对值不超过 100000。');
  if(!Array.isArray(raw.directionsDeg)||raw.directionsDeg.length<1||raw.directionsDeg.length>MAX_SEGMENTS||raw.directionsDeg.some(a=>!finite(a)||Math.abs(a)>3600))throw Error('绝对方向须为 1–128 个有限角，绝对值不超过 3600°。');
  if(raw.model==='canonical-troublewit'&&raw.directionsDeg.length!==5)throw Error('原 Canonical Troublewit 须有 5 个绝对方向角。');
  if(raw.model==='troublewit'&&(!Array.isArray(raw.lengthsMm)||raw.lengthsMm.length!==raw.directionsDeg.length||!raw.lengthsMm.every(length)))throw Error('原 Troublewit 长度与方向数须相等，每段长度为 0.00001–10000 mm。');
 }
 return Object.fromEntries(ks.map(k=>[k,structuredClone(raw[k])])) as FlatTroublewitStripRecipe;
}
// Exact U quadrant values are source trigonometric identities, never endpoint snapping.
function unit(a:number):Point{const q=((a%360)+360)%360;if(q===0)return [1,0];if(q===90)return [0,1];if(q===180)return [-1,0];if(q===270)return [0,-1];return [Math.cos(a*DEG),Math.sin(a*DEG)];}
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]],cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
function intersection(a:Point,u:Point,b:Point,v:Point):Point{const det=cross(u,v);if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('原 LineInt2D 平行极点或近极点，无法生成当前有限纸面；未改角或删点。');const t=cross(sub(b,a),v)/det,p:Point=[a[0]+t*u[0],a[1]+t*u[1]];if(!p.every(n=>finite(n)&&Math.abs(n)<=1e6))throw Error('原交线结果超出有限毫米坐标预算。');return p.map(n=>n===0?0:n) as Point;}
function sourcePath(p:FlatTroublewitStripRecipe,units:Point[]|null){if(p.model==='flat-strip')return structuredClone(p.pathMm);const lengths=p.model==='canonical-troublewit'?[3,3,7,3,3]:p.lengthsMm,path:Point[]=[[...p.originMm]];p.directionsDeg.forEach((_,i)=>{const u=units![i],q=path.at(-1)!;path.push([q[0]+lengths[i]*u[0],q[1]+lengths[i]*u[1]]);});return path;}
function graphFromRows(bottom:Point[],top:Point[],folds:('M'|'V')[]){
 const vertices:Point[]=[],add=(p:Point)=>{const existing=vertices.findIndex(q=>exact(p,q));if(existing>=0)return existing;const close=vertices.find(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=1e-6);if(close)throw Error('原 SamePtQ 会合并近邻顶点；此有限入口保留不同端点并拒绝该纸面，未吸附或合缝。');vertices.push([...p]);return vertices.length-1;};
 const bottomRow=bottom.map(add),topRow=top.map(add),edges:[number,number][]=[],assignments:Assignment[]=[],angles:number[]=[],edge=(a:number,b:number,t:Assignment)=>{if(a===b)return;edges.push([a,b]);assignments.push(t);angles.push(t==='V'?180:t==='M'?-180:0);};
 for(let i=0;i<bottomRow.length-1;i++)edge(bottomRow[i],bottomRow[i+1],'B');
 for(let i=0;i<bottomRow.length;i++)edge(bottomRow[i],topRow[i],i===0||i===bottomRow.length-1?'B':folds[i-1]);
 for(let i=0;i<topRow.length-1;i++)edge(topRow[i],topRow[i+1],'B');
 const faces:number[][]=[];for(let i=0;i<bottomRow.length-1;i++){const f=[bottomRow[i],bottomRow[i+1],topRow[i+1],topRow[i]].filter((v,k,a)=>k===0||v!==a[k-1]);if(f.at(-1)===f[0])f.pop();if(f.length<3||new Set(f).size!==f.length)throw Error('原行顶点产生退化纸面，未补边或合缝。');faces.push(f);}
 const lookup=new Map(edges.map(([a,b],i)=>[[Math.min(a,b),Math.max(a,b)].join(','),i] as const)),faceEdges=faces.map(f=>f.map((a,k)=>{const b=f[(k+1)%f.length],e=lookup.get([Math.min(a,b),Math.max(a,b)].join(','));if(e===undefined)throw Error('原纸带面缺少原边。');return e;})),owners=edges.map(()=>[] as number[]);faceEdges.forEach((es,f)=>es.forEach(e=>owners[e].push(f)));
 const neighbors=faceEdges.map((es,f)=>es.map(e=>owners[e].find(g=>g!==f)??null)) as unknown as number[][];
 const graph:FoldGraph={vertices_coords:vertices,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:neighbors};
 return {graph,bottomRow,topRow,bottomVertices:[...new Set(bottomRow)].sort((a,b)=>a-b),topVertices:[...new Set(topRow)].sort((a,b)=>a-b)};
}
const apply=(m:Matrix,p:Point):Point=>[m[0]*p[0]+m[1]*p[1]+m[4],m[2]*p[0]+m[3]*p[1]+m[5]];
function compose(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[0]*b[4]+a[1]*b[5]+a[4],a[2]*b[4]+a[3]*b[5]+a[5]];}
function reflection(a:Point,b:Point,l:number):Matrix{const d=sub(b,a);if(l<=1e-9)throw Error('原静态半转轴退化。');const x=d[0]/l,y=d[1]/l,m:Matrix=[2*x*x-1,2*x*y,2*x*y,2*y*y-1,0,0];m[4]=a[0]-m[0]*a[0]-m[1]*a[1];m[5]=a[1]-m[2]*a[0]-m[3]*a[1];return m;}
function principalAngle(y:number,x:number){const a=Math.atan2(y,x);return a===-Math.PI?Math.PI:a;}
function foldedState(g:FoldGraph,bottomRow:number[],topRow:number[],path:Point[],saved?:FoldingTrace){
 const faces=g.faces_vertices!,coords=g.vertices_coords,local:Point[]=Array(coords.length),first=sub(path[1],path[0]),theta=saved?.firstAngleRad??principalAngle(first[1],first[0]),u:Point=saved?.alignmentUnit??unit(theta/DEG),axisLengthsMm=saved?.axisLengthsMm??bottomRow.slice(1,-1).map((v,i)=>Math.hypot(...sub(coords[topRow[i+1]],coords[v]))),alignment:Matrix=[u[0],-u[1],u[1],u[0],path[0][0],path[0][1]],transforms:Matrix[]=[];
 let m:Matrix=[1,0,0,1,0,0],maxClosure=0,maxMetric=0,maxOrthogonality=0,minEdge=Infinity;
 for(let f=0;f<faces.length;f++){
  if(f>0)m=compose(m,reflection(coords[bottomRow[f]],coords[topRow[f]],axisLengthsMm[f-1]));transforms.push(compose(alignment,m));
  maxOrthogonality=Math.max(maxOrthogonality,Math.abs(m[0]*m[0]+m[2]*m[2]-1),Math.abs(m[1]*m[1]+m[3]*m[3]-1),Math.abs(m[0]*m[1]+m[2]*m[3]));
  for(const v of faces[f]){const q=apply(transforms[f],coords[v]);if(local[v])maxClosure=Math.max(maxClosure,Math.hypot(...sub(local[v],q)));else local[v]=q;}
 }
 for(const face of faces)for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){const a=face[i],b=face[j];maxMetric=Math.max(maxMetric,Math.abs(Math.hypot(...sub(coords[a],coords[b]))-Math.hypot(...sub(local[a],local[b]))));}
 for(const [a,b] of g.edges_vertices)minEdge=Math.min(minEdge,Math.hypot(...sub(local[a],local[b])));
 const signedArea=(points:Point[],face:number[])=>{const o=points[face[0]];return face.reduce((sum,a,i)=>sum+cross(sub(points[a],o),sub(points[face[(i+1)%face.length]],o)),0)/2;};
 const normals=faces.map(face=>Math.sign(signedArea(local,face)/signedArea(coords,face))),hinges=g.edges_vertices.flatMap((_,e)=>{
  const owners=g.edges_faces![e];if(owners.length!==2)return [];const normalDot=normals[owners[0]]*normals[owners[1]],error=Math.abs(Math.acos(Math.max(-1,Math.min(1,normalDot)))/DEG-Math.abs(g.edges_foldAngle[e]!));
  if(normalDot!==-1||error>1e-10||Math.abs(g.edges_foldAngle[e]!)!==180)throw Error('原 M/V 有符号半转终态与面法向不符。');
  return [{edgeIndex:e,signedTargetDeg:g.edges_foldAngle[e],exactRodriguesEndpoint:'cos(+/-pi)=-1; sin(+/-pi)=0',normalDot,endpointAngleErrorDeg:error}];
 });
 const scale=Math.max(1,...coords.flat().map(Math.abs),...local.flat().map(Math.abs)),limit=Math.max(2e-9,scale*2e-10);
 if(!local.every(q=>q?.every(Number.isFinite))||maxClosure>limit||maxMetric>limit||maxOrthogonality>2e-10||minEdge<=1e-9)throw Error('原静态平折的等距或共享轴检查未通过。');
 return {vertices2D:local,faceTransforms:transforms,faceNormalsZ:normals,hinges,trace:{firstAngleRad:theta,alignmentUnit:[...u] as Point,axisLengthsMm:[...axisLengthsMm]},proof:{staticFaceIsometryChecked:true,sharedAxisClosureChecked:true,exactSignedHalfTurnEndpointApplied:true,signedHalfTurnGeometryAmbiguityRetained:true,maximumFaceDistanceErrorMm:maxMetric,maximumSharedAxisErrorMm:maxClosure,maximumOrthogonalityError:maxOrthogonality,maximumEndpointAngleErrorDeg:0,minimumEdgeLengthMm:minEdge,absoluteGeometricBudgetMm:limit,stationaryPanelIndex:0,stationaryPanelConvention:'original first CCW material panel from first bottom halfedge',originalStationaryFaceOption:1,sourceFoldEmbeddingCell:'In[1336]',sourceTypeToFlatFoldAngleCell:'In[1813]',continuousRigidPathChecked:false,selfCollisionChecked:false,wholeSheetLayerOrderChecked:false,wolframExecuted:false}};
}
export function flatTroublewitStripPreset(model:FlatTroublewitStripRecipe['model']='flat-strip'):FlatTroublewitStripRecipe{
 if(model==='flat-strip')return {model,pathMm:[[0,0],[1,.2],[1,1],[.5,.5]],widthMm:.3,spreadAngleDeg:0,edgeTypes:'automatic'};
 if(model==='troublewit')return {model,originMm:[1.1,0],lengthsMm:[3,3,7,3,3],directionsDeg:[179,0,80,170,50]};
 return {model,originMm:[1.1,0],directionsDeg:[179,0,80,170,50]};
}
function evaluateSource(recipe:FlatTroublewitStripRecipe,saved?:FlatTroublewitStripTrace){
 const directionUnits=saved?saved.directionUnits:recipe.model==='flat-strip'?null:recipe.directionsDeg.map(unit),pathMm=sourcePath(recipe,directionUnits),w=recipe.model==='flat-strip'?recipe.widthMm:1,phi=recipe.model==='flat-strip'?recipe.spreadAngleDeg:0,vectors=pathMm.slice(1).map((p,i)=>sub(p,pathMm[i])),distancesMm=saved?.distancesMm??vectors.map(v=>Math.hypot(...v));
 if(distancesMm.some(d=>!length(d)))throw Error('原路径含零长或超出有限段长预算的段。');
 const bendAnglesDeg=saved?.bendAnglesDeg??vectors.slice(1).map((v,i)=>principalAngle(cross(vectors[i],v),vectors[i][0]*v[0]+vectors[i][1]*v[1])/DEG),sectorAnglesDeg=[90,...bendAnglesDeg.map((b,k)=>k%2===0?b>=0?b/2:180+b/2:180-b/2),90],centersMm=[0];distancesMm.forEach(d=>centersMm.push(centersMm.at(-1)!+d));
 const boundaryUnits=saved?.boundaryUnits??[unit(-phi/2),unit(phi/2)] as [Point,Point],sectorUnits=saved?.sectorUnits??sectorAnglesDeg.map(unit),bottom=centersMm.map((x,i)=>intersection([0,-w/2],boundaryUnits[0],[x,0],sectorUnits[i])),top=centersMm.map((x,i)=>intersection([0,w/2],boundaryUnits[1],[x,0],sectorUnits[i]));
 for(const [name,row] of [['Bottom',bottom],['Top',top]] as const)if(row.some((p,i)=>i&&p[0]<row[i-1][0]))throw Error(`原 MakeFlatFoldedStrip bad${name.toLowerCase()}：行顶点必须不递减，未改路径或缩小纸张。`);
 const foldTypes=recipe.model==='flat-strip'&&recipe.edgeTypes!=='automatic'?[...recipe.edgeTypes]:bendAnglesDeg.map((_,i):'M'|'V'=>i%2===0?'V':'M'),rows=graphFromRows(bottom,top,foldTypes),ff=foldedState(rows.graph,rows.bottomRow,rows.topRow,pathMm,saved?.folding),sourceTrace:FlatTroublewitStripTrace={directionUnits:structuredClone(directionUnits),distancesMm:[...distancesMm],bendAnglesDeg:[...bendAnglesDeg],boundaryUnits:structuredClone(boundaryUnits),sectorUnits:structuredClone(sectorUnits),folding:structuredClone(ff.trace)};
 return {recipe,sourceTrace,pathMm,widthMm:w,spreadAngleDeg:phi,distancesMm,bendAnglesDeg,sectorAnglesDeg,centersMm,bottomCoordinatesMm:bottom,topCoordinatesMm:top,foldTypes,...rows,foldedState:ff,source:{constructor:recipe.model==='flat-strip'?'MakeFlatFoldedStrip':recipe.model==='troublewit'?'MakeTroublewitStrip':'MakeCanonicalTroublewitStrip',definitionCell:recipe.model==='flat-strip'?'In[2366]':recipe.model==='troublewit'?'In[2374]':'In[2376]',rectangularOverloadCell:'In[2372]',lineIntersectionCell:'In[217]',samePtDefaultCell:'In[194]',samePtAliasCell:'In[1076]',notebookSHA256:NOTEBOOK_SHA,sourceRecipeKey:JSON.stringify(recipe),unitConvention:'1 original parameter unit = 1 mm; CP at origin, source folded alignment follows the raw path',vertexOrder:'all bottom row then top row; exact coincident identities reuse first index',edgeOrder:'bottom, cross, top',faceOrder:'original In[1278] forward-then-reversed half-edge CCW material panels, left-to-right',planeFaceBuilderCell:'In[1278]',absoluteAngleCell:'In[270]',rotationAngleCell:'In[272]',originalSamePtTolerance:1e-6,localDifferentNearVerticesPolicy:'reject instead of welding',originalMonotonicTolerance:1e-6,localMonotonicPolicy:'strict nondecreasing, no vertex relocation',supportedExplicitEdgeTypes:['M','V'],exactTriangleApexIdentityRetained:true,rawBottomVertices1Based:rows.bottomRow.map(i=>i+1),rawTopVertices1Based:rows.topRow.map(i=>i+1),BottomVertices1Based:rows.bottomVertices.map(i=>i+1),TopVertices1Based:rows.topVertices.map(i=>i+1),budget:{maximumSegments:MAX_SEGMENTS,maximumVertices:2*(MAX_SEGMENTS+1),maximumFaces:MAX_SEGMENTS},replayTolerance:{scope:'transcendental leaves and proof residuals only',leafRelativeEPS:256,leafAbsolute:0,proofAbsolute:2e-11,proofRelativeEPS:256,geometry:'exact original arithmetic replay of saved leaf trace',primitiveIdentities:'exact'}}};
}
export function evaluateFlatTroublewitStripSource(raw:FlatTroublewitStripRecipe){return evaluateSource(validateFlatTroublewitStripRecipe(raw));}
// Only transcendental leaf results have a replay budget. Every geometry-producing
// addition, multiplication, determinant, face incidence and endpoint binding is exact.
const leafNear=(a:unknown,b:number)=>finite(a)&&Math.abs(a-b)<=256*Number.EPSILON*Math.max(1,Math.abs(b));
function leafValues(a:unknown,b:unknown):boolean{return typeof b==='number'?leafNear(a,b):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>leafValues(a[i],v)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>leafValues(a[k],b[k])):exact(a,b);}
function checkedUnit(a:unknown,angle:number):boolean{const expected=unit(angle);return angle%90===0?exact(a,expected):leafValues(a,expected)&&Array.isArray(a)&&Math.abs(a[0]*a[0]+a[1]*a[1]-1)<=512*Number.EPSILON;}
function replayCheckedSource(recipe:FlatTroublewitStripRecipe,raw:unknown){
 const fresh=evaluateSource(recipe);if(!leafValues(raw,fresh.sourceTrace))throw Error('原 transcendental trace 缺失、失配或超出明确浮点预算。');
 const trace=structuredClone(raw) as FlatTroublewitStripTrace;
 if(recipe.model==='flat-strip'){if(trace.directionUnits!==null)throw Error('原路径没有方向 U trace。');}
 else if(!recipe.directionsDeg.every((a,i)=>checkedUnit(trace.directionUnits![i],a)))throw Error('原绝对方向 U trace 或象限恒等失配。');
 const path=sourcePath(recipe,trace.directionUnits),vectors=path.slice(1).map((p,i)=>sub(p,path[i]));
 if(!trace.distancesMm.every((d,i)=>leafNear(d,Math.hypot(...vectors[i]))))throw Error('原 Mag 距离 trace 与原目标路径不符。');
 if(!trace.bendAnglesDeg.every((b,i)=>{const c=cross(vectors[i],vectors[i+1]),dot=vectors[i][0]*vectors[i+1][0]+vectors[i][1]*vectors[i+1][1],expected=principalAngle(c,dot)/DEG;return c===0?b===expected:leafNear(b,expected);}))throw Error('原 RotationAngle trace 或字面回头角不符。');
 const sectors=[90,...trace.bendAnglesDeg.map((b,k)=>k%2===0?b>=0?b/2:180+b/2:180-b/2),90],phi=recipe.model==='flat-strip'?recipe.spreadAngleDeg:0;
 if(!checkedUnit(trace.boundaryUnits[0],-phi/2)||!checkedUnit(trace.boundaryUnits[1],phi/2)||!sectors.every((a,i)=>checkedUnit(trace.sectorUnits[i],a)))throw Error('原边缘／折轴 U trace 或象限恒等失配。');
 const first=vectors[0],angle=principalAngle(first[1],first[0]);
 if((first[0]===0||first[1]===0?trace.folding.firstAngleRad!==angle:!leafNear(trace.folding.firstAngleRad,angle))||!checkedUnit(trace.folding.alignmentUnit,trace.folding.firstAngleRad/DEG))throw Error('原 AbsoluteAngle／平折定位 trace 不符。');
 const replay=evaluateSource(recipe,trace);
 if(!trace.folding.axisLengthsMm.every((l,i)=>leafNear(l,Math.hypot(...sub(replay.graph.vertices_coords[replay.topRow[i+1]],replay.graph.vertices_coords[replay.bottomRow[i+1]])))))throw Error('原 NormalizeReal 半转轴长度 trace 不符。');
 return replay;
}
function metadata(ev:ReturnType<typeof evaluateFlatTroublewitStripSource>){return {schema:SCHEMA,recipe:structuredClone(ev.recipe),source:ev.source,derived:{sourceTrace:ev.sourceTrace,pathMm:ev.pathMm,widthMm:ev.widthMm,spreadAngleDeg:ev.spreadAngleDeg,distancesMm:ev.distancesMm,bendAnglesDeg:ev.bendAnglesDeg,sectorAnglesDeg:ev.sectorAnglesDeg,centersMm:ev.centersMm,bottomCoordinatesMm:ev.bottomCoordinatesMm,topCoordinatesMm:ev.topCoordinatesMm,foldTypes:ev.foldTypes,bottomRow:ev.bottomRow,topRow:ev.topRow,bottomVertices:ev.bottomVertices,topVertices:ev.topVertices,sourceGraph:ev.graph,foldedState:ev.foldedState},evidence:{finiteMaterialValidated:true,staticFaceIsometryChecked:true,sharedAxisClosureChecked:true,exactSignedHalfTurnEndpointApplied:true,signedHalfTurnGeometryAmbiguityRetained:true,continuousRigidPathChecked:false,selfCollisionChecked:false,wholeSheetLayerOrderChecked:false,wolframExecuted:false}};}
function documentFromSource(ev:ReturnType<typeof evaluateFlatTroublewitStripSource>):Doc{
 const g=ev.graph,x=g.vertices_coords.map(p=>p[0]),y=g.vertices_coords.map(p=>p[1]),doc:Doc={schemaVersion:2,name:ev.recipe.model==='flat-strip'?'原路径折叠纸带 CP':'原 Troublewit 纸带 CP',paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:g.edges_vertices.map(([a,b],i)=>({id:'original-flat-troublewit-'+i,a:[...g.vertices_coords[a]],b:[...g.vertices_coords[b]],assignment:g.edges_assignment[i] as Assignment,angle:g.edges_foldAngle[i]})),metadata:{[NS]:metadata(ev)}};
 validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,g,doc.segments.map(s=>s.id),{foldedVertices:ev.foldedState.vertices2D,startingFace:0});return doc;
}
export function generateFlatTroublewitStripDocument(raw:FlatTroublewitStripRecipe):Doc{return documentFromSource(evaluateFlatTroublewitStripSource(raw));}
export function readFlatTroublewitStripRecipe(doc:Doc):FlatTroublewitStripRecipe|null{try{const own=doc.metadata?.[NS];return record(own)&&own.schema===SCHEMA?validateFlatTroublewitStripRecipe(own.recipe):null;}catch{return null;}}
export function flatTroublewitStripSourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const recipe=readFlatTroublewitStripRecipe(doc);if(!recipe||doc.flatFold!==undefined||doc.background!==undefined||!exact(doc.objects??[],[]))return false;
  const own=doc.metadata![NS],material=inspectMaterialTopology(doc);if(!material.ok||!record(own)||!record(own.derived))return false;
  const ev=replayCheckedSource(recipe,own.derived.sourceTrace),expected=metadata(ev);
  if(!exact(Object.keys(own).sort(),Object.keys(expected).sort())||!exact(own.schema,expected.schema)||!exact(own.recipe,expected.recipe)||!exact(own.source,expected.source)||!exact(own.evidence,expected.evidence)||!record(own.derived.foldedState))return false;
  const {foldedState:actualPose,...actualDerived}=own.derived,{foldedState:expectedPose,...expectedDerived}=expected.derived;
  const {proof:actualProof,...actualPoseGeometry}=actualPose,{proof:expectedProof,...expectedPoseGeometry}=expectedPose;
  if(!exact(actualDerived,expectedDerived)||!exact(actualPoseGeometry,expectedPoseGeometry)||!numeric(actualProof,expectedProof))return false;
  const seed=own.derived.sourceGraph,g=material.graph;if(!record(seed)||!exact(seed,g)||!exact(material.foldedVertices,own.derived.foldedState.vertices2D)||material.startingFace!==0)return false;
  const rawMaterial=doc.metadata!.materialTopology;if(!record(rawMaterial)||rawMaterial.schema!=='zhezhi-material-topology-v1'||!exact(Object.keys(rawMaterial).sort(),['edgeSegmentIds','foldedVertices','graph','schema','startingFace'])||!exact(rawMaterial.graph,g))return false;
  if(!exact(own.derived.widthMm,ev.widthMm)||!exact(own.derived.spreadAngleDeg,ev.spreadAngleDeg)||!exact(own.derived.foldTypes,ev.foldTypes)||!exact(own.derived.bottomRow,ev.bottomRow)||!exact(own.derived.topRow,ev.topRow)||!exact(own.derived.bottomVertices,ev.bottomVertices)||!exact(own.derived.topVertices,ev.topVertices))return false;
  if(recipe.model==='flat-strip'&&!exact(own.derived.pathMm,recipe.pathMm)||!exact(g.edges_vertices,ev.graph.edges_vertices)||!exact(g.edges_assignment,ev.graph.edges_assignment)||!exact(g.edges_foldAngle,ev.graph.edges_foldAngle)||!exact(g.faces_vertices,ev.graph.faces_vertices)||!exact(g.faces_edges,ev.graph.faces_edges)||!exact(g.edges_faces,ev.graph.edges_faces)||!exact(g.faces_faces,ev.graph.faces_faces))return false;
  if(!exact(own.derived.sectorAnglesDeg[0],90)||!exact(own.derived.sectorAnglesDeg.at(-1),90)||own.derived.centersMm[0]!==0)return false;
  if(!exact(g.vertices_coords[ev.bottomRow[0]],[0,-ev.widthMm/2])||!exact(g.vertices_coords[ev.topRow[0]],[0,ev.widthMm/2])||!exact(own.derived.foldedState.faceNormalsZ,ev.foldedState.faceNormalsZ))return false;
  if(recipe.model!=='flat-strip'&&!exact(own.derived.pathMm[0],recipe.originMm))return false;
  if(!exact(own.derived.foldedState.hinges.map((h:any)=>[h.edgeIndex,h.signedTargetDeg,h.exactRodriguesEndpoint,h.normalDot]),ev.foldedState.hinges.map(h=>[h.edgeIndex,h.signedTargetDeg,h.exactRodriguesEndpoint,h.normalDot])))return false;
  if(doc.segments.length!==g.edges_vertices.length||!exact(material.edgeSegmentIds,doc.segments.map(s=>s.id)))return false;
  if(doc.segments.some((s,i)=>{const [a,b]=g.edges_vertices[i];return s.id!=='original-flat-troublewit-'+i||s.assignment!==g.edges_assignment[i]||s.angle!==g.edges_foldAngle[i]||!exact(s.a,g.vertices_coords[a])||!exact(s.b,g.vertices_coords[b]);}))return false;
  const xs=g.vertices_coords.map(p=>p[0]),ys=g.vertices_coords.map(p=>p[1]);return doc.paper.width===Math.max(...xs)-Math.min(...xs)&&doc.paper.height===Math.max(...ys)-Math.min(...ys);
 }catch{return false;}
}
function sceneFromSource(ev:ReturnType<typeof evaluateFlatTroublewitStripSource>){const p=ev.foldedState.proof;return {vertices:ev.foldedState.vertices2D.map(([x,y]):[number,number,number]=>[x,y,0]),edges:ev.graph.edges_vertices,assignments:ev.graph.edges_assignment as Assignment[],faces:ev.graph.faces_vertices!,maximumFaceDistanceError:p.maximumFaceDistanceErrorMm,maximumGridClosureError:p.maximumSharedAxisErrorMm,maximumFoldAngleErrorRad:p.maximumEndpointAngleErrorDeg*DEG,minimumSpatialEdgeLength:p.minimumEdgeLengthMm,label:'原路径纸带静态平折端点；层序与连续运动未验证',motion:false as const,layers:false as const};}
export function flatTroublewitStripScene(raw:FlatTroublewitStripRecipe){const ev=evaluateFlatTroublewitStripSource(raw);documentFromSource(ev);return sceneFromSource(ev);}
export function prepareFlatTroublewitStripPreview(raw:FlatTroublewitStripRecipe){const recipe=validateFlatTroublewitStripRecipe(raw),source=evaluateFlatTroublewitStripSource(recipe),doc=documentFromSource(source),scene=sceneFromSource(source);return {recipe,doc,source,scene,summary:`${source.graph.faces_vertices!.length} 面 · ${doc.segments.length} 原边 · ${recipe.model==='flat-strip'?recipe.widthMm===0?'三角纸带':recipe.spreadAngleDeg===0?'矩形纸带':'梯形纸带':'宽 1 mm 的原 Troublewit 纸带'}`,build:(next:unknown=recipe)=>generateFlatTroublewitStripDocument(validateFlatTroublewitStripRecipe(next))};}
