/** Explicit finite-chord paper bridge from the existing original generic 3D→2D source. */
import {GENERIC_SPACE_CURVE_FOLD_PRESET,validateGenericSpaceCurveFoldQuery,parseGenericSpaceCurveFoldResult,fetchGenericSpaceCurveFoldWhenIdle,type GenericSpaceCurveFoldQuery,type GenericSpaceCurveFoldResult} from './curvedNativeSpaceCurveFold';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point} from '../core/types';

export type GenericSpacePaperRecipe={query:GenericSpaceCurveFoldQuery;unitSizeMm:number};
export const GENERIC_SPACE_PAPER_NAMESPACE='originalGenericSpaceFinitePaper';
export const GENERIC_SPACE_PAPER_SCHEMA='original-in3935-in3939-in3942-finite-chord-paper-v1';
const NS=GENERIC_SPACE_PAPER_NAMESPACE,SCHEMA=GENERIC_SPACE_PAPER_SCHEMA,SHA='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,any>,ks:string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function fail(message:string):never{throw Error(message);}
const same=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):object(b)?object(a)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
export function validateGenericSpacePaperRecipe(raw:unknown):GenericSpacePaperRecipe{
 if(!object(raw)||!keys(raw,['query','unitSizeMm'])||!finite(raw.unitSizeMm)||raw.unitSizeMm<.001||raw.unitSizeMm>10000)fail('有限曲折纸张须含完整源参数与 0.001–10000 mm 的显式源单位。');
 const query=validateGenericSpaceCurveFoldQuery(raw.query);
 if(query.transverseStart!==0||query.transverseEnd<=0)fail('有限纸张当前只采用从原曲折 w=0 开始的正左右带宽；没有移曲线或补空白纸。');
 return {query,unitSizeMm:raw.unitSizeMm};
}
export function genericSpacePaperPreset():GenericSpacePaperRecipe{return {query:{...GENERIC_SPACE_CURVE_FOLD_PRESET,foldCurve:[...GENERIC_SPACE_CURVE_FOLD_PRESET.foldCurve],segments:8,rulingSegments:3},unitSizeMm:1};}

/** Exact signs on actual binary64 vertices; proof-only rulings/diagonals never become CP edges. */
function partition(vertices:Point[],edges:[number,number][],faces:number[][],n:number){
 const view=new DataView(new ArrayBuffer(8)),dyadic=(x:number):[bigint,number]=>{if(!finite(x))fail('有限纸面包含非有限坐标。');if(x===0)return [0n,0];view.setFloat64(0,x);const bits=view.getBigUint64(0),exponent=Number((bits>>52n)&2047n);let v=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),e=exponent?exponent-1075:-1074;if(bits>>63n)v=-v;while(v!==0n&&v%2n===0n){v/=2n;e++;}return [v,e];};
 const ratios=vertices.map(p=>p.map(dyadic)),exponent=Math.min(...ratios.flat().filter(([v])=>v!==0n).map(([,e])=>e)),p=ratios.map(r=>r.map(([v,e])=>v<<BigInt(e-exponent))),
  cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  dot=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),sign=(v:bigint)=>v<0n?-1:v>0n?1:0,s=n+1;
 if(new Set(vertices.map(v=>v.join(','))).size!==vertices.length)fail('源顶点的不同参数身份出现同坐标；没有焊点或吸附。');
 const triangles:number[][]=[],diagonals:[number,number][]=[];let nonconvexCells=0,triangleCross=0n;
 for(let i=0;i<n;i++)for(const cell of [[i,i+1,s+i+1,s+i],[i,2*s+i,2*s+i+1,i+1]]){
  const [a,b,c,d]=cell;if(cell.some((x,k)=>cross(x,cell[(k+1)%4],cell[(k+2)%4])<=0n))nonconvexCells++;
  const t=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:cross(a,b,d)>0n&&cross(b,c,d)>0n?[[a,b,d],[b,c,d]]:null;
  if(!t)fail('原有限带含退化或反向小面，不能做正向分区；没有裁掉失败域。');
  triangles.push(...t);diagonals.push(t[0][2]===c?[a,c]:[b,d]);for(const [a,b,c] of t)triangleCross+=cross(a,b,c);
 }
 const proofEdges=[...edges];for(let i=1;i<n;i++)proofEdges.push([i,s+i],[i,2*s+i]);proofEdges.push(...diagonals);
 if(proofEdges.length*(proofEdges.length-1)/2>2000000)fail('有限纸面分区超过 2M 边对预算。');
 const incident=vertices.map(()=>[] as number[]),boxes=proofEdges.map(([a,b])=>{if(vertices[a][0]===vertices[b][0]&&vertices[a][1]===vertices[b][1])fail('纸域分区含零长边。');return [Math.min(vertices[a][0],vertices[b][0]),Math.max(vertices[a][0],vertices[b][0]),Math.min(vertices[a][1],vertices[b][1]),Math.max(vertices[a][1],vertices[b][1])];});
 proofEdges.forEach(([a,b],i)=>{incident[a].push(i);incident[b].push(i);});let sharedPairs=0,testedPairs=0;
 incident.forEach((row,v)=>{for(let i=0;i<row.length;i++)for(let j=0;j<i;j++){sharedPairs++;const e=proofEdges[row[i]],f=proofEdges[row[j]],a=e[0]===v?e[1]:e[0],b=f[0]===v?f[1]:f[0];if(cross(v,a,b)===0n&&dot(v,a,b)>0n)fail('纸域分区共有端点边同射线重叠。');}});
 const order=proofEdges.map((_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]||a-b);let active:number[]=[];
 for(const i of order){active=active.filter(j=>boxes[j][1]>=boxes[i][0]);for(const j of active){if(boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;const [a,b]=proofEdges[i],[c,d]=proofEdges[j];if(a===c||a===d||b===c||b===d)continue;testedPairs++;if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('有限纸域分区存在非相邻交叉、接触或重叠；没有移点、删边或补压痕。');}active.push(i);}
 const doubled=faces.map(f=>f.reduce((v,a,i)=>v+cross(f[0],a,f[(i+1)%f.length]),0n));
 if(doubled.some(a=>a<=0n)||triangleCross!==doubled.reduce((a,b)=>a+b,0n))fail('有限纸域三角分区没有一次完整覆盖两个实际纸面。');
 return {arithmetic:'exact binary64 dyadic integer signs and exact area coverage',vertices:vertices.length,CPedges:edges.length,logicalFaces:2,validationCells:2*n,validationTriangles:4*n,proofEdges:proofEdges.length,nonincidentPairs:proofEdges.length*(proofEdges.length-1)/2-sharedPairs,testedOverlappingBoxPairs:testedPairs,sharedPairs,nonconvexCells,exactDoubledFaceAreas:doubled.map(a=>a.toString()),exactAreaExponent:2*exponent-1,exactSingleCoverage:true,validationRulingsAreCPEdges:false,validationTrianglesAreCPEdges:false,coordinateWelding:false,maximumEdgePairs:2000000};
}

function checkedNative(raw:unknown,recipe:GenericSpacePaperRecipe):GenericSpaceCurveFoldResult{
 const native=parseGenericSpaceCurveFoldResult(raw,recipe.query),q=recipe.query,c=native.certification;
 const required=['finiteLeftMetricVerified','finiteRightMetricVerified','finiteDevelopabilityVerified','finiteSharedGeodesicCurvatureVerified','finiteUnitRulingsVerified','sourceRegularityCertified','unitRulingsAnalytic','sourceLeftStripRegularityCertified','sourceRightStripRegularityCertified','formalLeftStripRegularityCertified','formalRightStripRegularityCertified','formalCommonFlatteningCertified'] as const;
 if(!native.domain.certified||native.domain.unresolved.length||required.some(k=>c[k]!==true))fail('原源或整个带宽含焦点、未完成域、母线歧义或不相容；有限纸张不能采用，保留实际输入。');
 if(!same(native.initial,{parameter:q.parameterStart,point:[1,0],tangent:[0,1],argumentOrder:['ui','fi','ti']})||!same(native.normalization.targetOrigin,[1,0])||native.domain.cells[0]?.start!==q.parameterStart||native.domain.cells.at(-1)?.end!==q.parameterEnd||native.domain.cells.some((cell,i)=>i>0&&native.domain.cells[i-1].end!==cell.start)||native.domain.formalStripRegularity.left.orientation!==1||native.domain.formalStripRegularity.right.orientation!==-1)fail('原完整域、固定初值或左右纸面身份不一致；没有重排或镜像。');
 const L=native.normalization.scale;
 for(let i=0;i<native.sample.rows.length;i++){
  const r=native.sample.rows[i],g=native.grid[i];
  if(r.s!==g.s||i===0&&r.s!==q.parameterStart||i===q.segments&&r.s!==q.parameterEnd||i>0&&r.s<=native.sample.rows[i-1].s)fail('原采样参数身份、顺序或完整端点发生变化。');
  if(i===0&&(!same(r.normalizedTargetBase,[0,0])||!same(r.targetBase,[1,0])||!same(r.targetTangent,[0,1])||!same(r.targetLeftNormal,[-1,0])))fail('原二维恢复初值发生变化。');
  for(const side of ['Left','Right'] as const)for(const j of [0,q.rulingSegments]){
   const w=j===0?0:q.transverseEnd,base=r.normalizedTargetBase,d=r[('normalizedTarget'+side+'Director') as keyof typeof r] as number[],normalized=base.map((v,k)=>v+w*d[k]),world=normalized.map((v,k)=>v*L+native.normalization.targetOrigin[k]);
   const normalizedGrid=side==='Left'?g.normalizedTargetLeft:g.normalizedTargetRight,worldGrid=side==='Left'?g.targetLeft:g.targetRight;
   if(!same(normalizedGrid[j],normalized)||!same(worldGrid[j],world))fail('原 raw 二维网格与保存 ODE 帧的逐项乘加重放不一致；没有放宽 CP 坐标。');
  }
 }
 return native;
}
function material(native:GenericSpaceCurveFoldResult,unitSizeMm:number){
 const n=native.query.segments,s=n+1,center=native.grid.map(row=>row.targetLeft[0]),left=native.grid.map(row=>row.targetLeft.at(-1)!),right=native.grid.map(row=>row.targetRight.at(-1)!);
 if(center.some((p,i)=>!same(p,native.grid[i].targetRight[0])||!same(p,native.sample.rows[i].targetBase)))fail('原左右带没有精确共享同一曲折参数身份。');
 const vertices_coords=[...center,...left,...right].map(p=>p.map(v=>v*unitSizeMm) as Point),edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const edge=(a:number,b:number,t:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(t);edges_foldAngle.push(t==='B'?0:null);ids.push(id);};
 for(let i=0;i<n;i++){edge(i,i+1,'U','generic-space-curve-chord-'+i);edge(s+i,s+i+1,'B','generic-space-boundary-left-'+i);edge(2*s+i,2*s+i+1,'B','generic-space-boundary-right-'+i);}
 for(const i of [0,n]){edge(i,s+i,'B','generic-space-cap-left-'+i);edge(i,2*s+i,'B','generic-space-cap-right-'+i);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],lookup=new Map(edges_vertices.map((e,i)=>[[...e].sort((a,b)=>a-b).join(','),i])),faces_edges=faces_vertices.map(f=>f.map((a,i)=>{const e=lookup.get([a,f[(i+1)%f.length]].sort((a,b)=>a-b).join(','));if(e===undefined)fail('原纸面引用未知 CP 边。');return e;})),edges_faces=edges_vertices.map(()=>[] as number[]);
 faces_edges.forEach((row,f)=>row.forEach(e=>edges_faces[e].push(f)));const faces_faces=faces_edges.map((row,f)=>row.map(e=>edges_faces[e].find(v=>v!==f)??null));
 const graph:FoldGraph={vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces:faces_faces as unknown as number[][]};
 return {graph,ids,proof:partition(vertices_coords,edges_vertices,faces_vertices,n)};
}
function build(recipe:GenericSpacePaperRecipe,native:GenericSpaceCurveFoldResult):Doc{
 const {graph,ids,proof}=material(native,recipe.unitSizeMm),x=graph.vertices_coords.map(p=>p[0]),y=graph.vertices_coords.map(p=>p[1]);
 const source={schema:SCHEMA,recipe:structuredClone(recipe),native:structuredClone(native),finiteProof:proof,source:{notebookSHA256:SHA,functions:['FoldSpaceCurve3D','NSpaceCurveFold3D','NFlattenFold2D'],definitionCells:['In[3939]','In[3942]','In[3935]'],localInitialSource:'explicit In[3966] wrapper initial {s0,{1,0},{0,1}}',coordinateInput:'actual raw world target grid',unitConvention:'explicit unitSizeMm multiplied exactly once; no internal normalization scale repeated',originalUnitUnspecified:true,coordinateTranslation:false,coordinateMirror:false,coordinateWelding:false,DiscretizeSystem4093LinkClaimed:false,originalMVAssignmentProvided:false},
  sampling:{method:'finite ordered linear chords of raw original planar samples',parameterStart:recipe.query.parameterStart,parameterEnd:recipe.query.parameterEnd,segments:recipe.query.segments,exactContinuousCurve:false,chordApproximationErrorIntervalCertified:false,continuousFoldAngleRetainedOnlyAsSource:true,chordAngleAssigned:false,assignment:'U',targetAngle:null},
  numericPolicy:{model:'saved backend DOP853 raw samples with independent DP54 source replay; exact scalar reconstruction of grid/paper',sourceReplayRelativeBudget:2e-8,sourceIntegrationRelativeTolerance:2e-12,sourceIntegrationAbsoluteTolerance:2e-14,integrationErrorIntervalCertified:false,geometryToleranceApplied:false,primitiveInputAndInitialIdentityExact:true,maximumSegments:128,maximumVertices:387,maximumProofEdgePairs:2000000},
  scope:{adoption:'explicit finite-chord CP only',finiteSampledPaperVerified:true,sourceCertificationFlagsUnchanged:true,reference3DOnly:true,continuousSurfaceIsometryCertified:false,rigidFlatFoldCertified:false,continuousRigidMotionCertified:false,layerOrderCertified:false,selfCollisionCertified:false,sourceWholeContinuousInjectivityCertified:false}};
 const doc:Doc={schemaVersion:2,name:'原空间曲折二维有限弦纸张 CP',paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]})),metadata:{[NS]:source}};
 validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,graph,ids);return doc;
}
export function genericSpacePaperDocument(input:unknown,rawNative:unknown):Doc{const recipe=validateGenericSpacePaperRecipe(input);return build(recipe,checkedNative(rawNative,recipe));}
export function readGenericSpacePaperRecipe(doc:Doc):GenericSpacePaperRecipe|null{try{const s=doc.metadata?.[NS];return object(s)&&s.schema===SCHEMA?validateGenericSpacePaperRecipe(s.recipe):null;}catch{return null;}}
export function genericSpacePaperSourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const recipe=readGenericSpacePaperRecipe(doc),own=doc.metadata?.[NS];if(!recipe||!object(own)||Object.hasOwn(doc,'flatFold'))return false;const expected=genericSpacePaperDocument(recipe,own.native),m=inspectMaterialTopology(doc);if(!m.ok||m.foldedVertices||m.startingFace!==undefined)return false;
  return same(doc.paper,expected.paper)&&same(doc.segments,expected.segments)&&same(own,expected.metadata![NS])&&same(doc.metadata!.materialTopology,expected.metadata!.materialTopology);
 }catch{return false;}
}
function freeze(v:any):void{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}
export function prepareGenericSpacePaperPreview(input:unknown,rawNative:unknown){const recipe=validateGenericSpacePaperRecipe(input),native=structuredClone(checkedNative(rawNative,recipe)),doc=build(recipe,native);freeze(recipe);freeze(native);return {key:JSON.stringify(recipe),recipe,native,doc,build:(next:unknown=recipe)=>{if(!same(validateGenericSpacePaperRecipe(next),recipe))fail('参数已变化，请重新获取原二维恢复；旧快照不能采用。');return build(recipe,native);}};}
export async function fetchGenericSpacePaperPreview(input:unknown,signal?:AbortSignal){const recipe=validateGenericSpacePaperRecipe(input);signal?.throwIfAborted();const native=await fetchGenericSpaceCurveFoldWhenIdle(recipe.query,signal);signal?.throwIfAborted();return prepareGenericSpacePaperPreview(recipe,native);}
