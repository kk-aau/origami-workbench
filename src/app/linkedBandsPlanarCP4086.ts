/** Literal Next2D circle family with a declared local quartic interpretation.
 * Finite planar U/null material only. No correction or certification of saved 3D.
 */
import {uniformPolynomial} from './curvedUniformResample';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point} from '../core/types';
export type LinkedBandsPlanarCP4086Recipe={radius:number;bandSpacing:number;perturbation:number;firstFoldAngleDeg:number;parameterStart:number;parameterEnd:number;bands:number;segments:number;interpolationIntervals:number;unitSizeMm:number};
export const LINKED_BANDS_PLANAR_CP_4086_EXAMPLE:LinkedBandsPlanarCP4086Recipe={radius:1,bandSpacing:.1,perturbation:.1,firstFoldAngleDeg:120,parameterStart:0,parameterEnd:Math.PI,bands:4,segments:32,interpolationIntervals:32,unitSizeMm:1};
export type LinkedBandsPlanarCP4086ErrorCode='SOURCE_INPUT'|'NUMERIC_SOURCE'|'FINITE_PAPER'|'MATERIAL_INTERFACE';
export class LinkedBandsPlanarCP4086Error extends Error{constructor(public readonly code:LinkedBandsPlanarCP4086ErrorCode,message:string){super(message);this.name='LinkedBandsPlanarCP4086Error';}}
const issue=(code:LinkedBandsPlanarCP4086ErrorCode,message:string):never=>{throw new LinkedBandsPlanarCP4086Error(code,message);},
 finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v),object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v),
 keys=(v:Record<string,unknown>,ks:string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)),clone=<T>(x:T):T=>structuredClone(x),
 SCHEMA='original-in4086-planar-linked-bands-cp-v1',NS='originalLinkedBandsPlanar4086',EPS=Number.EPSILON;
export function validateLinkedBandsPlanarCP4086Recipe(raw:unknown):LinkedBandsPlanarCP4086Recipe{
 if(!object(raw)||!keys(raw,Object.keys(LINKED_BANDS_PLANAR_CP_4086_EXAMPLE))||!Object.values(raw).every(finite))issue('SOURCE_INPUT','请显式填写十个有限数值；不接受未知字段或隐式默认。');
 const r=raw as LinkedBandsPlanarCP4086Recipe;
 if(r.radius<=0||r.bandSpacing<=0||r.unitSizeMm<=0)issue('SOURCE_INPUT','初始半径、相邻带距和毫米单位倍率须为正。');
 if(!(0<=r.parameterStart&&r.parameterStart<r.parameterEnd&&r.parameterEnd<=Math.PI))issue('SOURCE_INPUT','当前原圆族工厂使用原 [0,π] 插值域的递增裁域；裁域不重置源参数。');
 if(!Number.isInteger(r.bands)||r.bands<2||r.bands>4)issue('SOURCE_INPUT','当前构造使用原5曲线链的2–4个相邻带。');
 if(!Number.isInteger(r.segments)||r.segments<8||r.segments>128||!Number.isInteger(r.interpolationIntervals)||r.interpolationIntervals<8||r.interpolationIntervals>64)issue('NUMERIC_SOURCE','当前有限工厂支持8–128弦及8–64插值区间；这是本地数值预算，未替代原函数域。');
 return {...r};
}
type Scalar=(s:number)=>{value:number;derivative:number};
export type LinkedBandsPlanarCP4086Frame={s:number;qValues:number[];qDerivatives:number[];gammaDegrees:number[];flatCurves:Point[]};
export type LinkedBandsPlanarCP4086Source={frames:LinkedBandsPlanarCP4086Frame[];maximumRootResidual:number;maximumEndpointExtrapolationRad:number;rawReplayBudget:number;numericPolicy:{model:string;intervalCertified:false;mathematicaListInterpolationEquivalent:false;sourceInputsExact:true;derivedReplayBudgetRaw:number;libmAccuracyCertified:false}};
/** Same finite stencil as shared Newton evaluator; extrapolation is explicit. */
function quartic(values:number[]):Scalar{
 const ip=values.length-1,inside=uniformPolynomial(0,Math.PI,values.map(x=>[x]),4),coefficients=(first:number)=>{
  const a=values.slice(first,first+5);for(let n=1;n<=4;n++)for(let j=4;j>=n;j--)a[j]=(a[j]-a[j-1])/n;return a;
 },left=coefficients(0),right=coefficients(ip-4);
 return s=>{if(s>=0&&s<=Math.PI){const x=inside(s);return {value:x.value[0],derivative:x.derivative[0]};}
  const first=s<0?0:ip-4,a=s<0?left:right,z=s/Math.PI*ip-first;let value=a[4],derivative=0;
  for(let j=3;j>=0;j--){derivative=derivative*(z-j)+value;value=value*(z-j)+a[j];}return {value,derivative:derivative*ip/Math.PI};};
}
export function evaluateLinkedBandsPlanarCP4086Source(raw:unknown):LinkedBandsPlanarCP4086Source{
 const r=validateLinkedBandsPlanarCP4086Recipe(raw),ip=r.interpolationIntervals,nodes=Array.from({length:ip+1},(_,i)=>i===ip?Math.PI:Math.PI*i/ip),
  g=r.firstFoldAngleDeg*(Math.PI/180),q:Scalar[]=[s=>({value:s,derivative:1}),s=>({value:s+r.perturbation*Math.sin(2*s),derivative:1+2*r.perturbation*Math.cos(2*s)})],
  gamma:Scalar[]=[()=>({value:g,derivative:0})];let maximumRootResidual=0;
 if(!finite(g)||g===0||Math.abs(g)>=Math.PI)issue('NUMERIC_SOURCE','当前原式中央分支工厂要求初角非零且绝对值<180°；0或半周奇点没有被改成新CP。');
 for(let i=0;i<r.bands-1;i++){
  const r0=r.radius+i*r.bandSpacing,r1=r.radius+(i+1)*r.bandSpacing,r2=r.radius+(i+2)*r.bandSpacing;
  if(![r0,r1,r2].every(finite)||!(r0<r1&&r1<r2))issue('NUMERIC_SOURCE','原半径序列在double中溢出或相邻值不分离；未缩放或吸附。');
  const values=nodes.map(s=>{const a=q[i](s),b=q[i+1](s),delta=b.value-a.value,den=r1*Math.cos(delta)-r0;
   if(!(a.derivative>0&&b.derivative>0&&den>0))issue('FINITE_PAPER','当前源节点的参数或横向分支不正则；请调整带距、扰动或带数，不会静默改点。');
   const ratio=(r1-r0*Math.cos(delta))/den,value=-2*Math.atan2(ratio*Math.tan(gamma[i](s).value/2),a.derivative/b.derivative);
   if(!finite(value))issue('NUMERIC_SOURCE','原字面ArcTan角在当前浮点中不可表示。');return value;
  }),nextGamma=quartic(values);gamma.push(nextGamma);
  const roots=nodes.map(s=>{const a=q[i](s),b=q[i+1](s),delta=b.value-a.value,
    previous=-r0*Math.sin(delta)/(r1-r0*Math.cos(delta)),target=nextGamma(b.value).derivative/(b.derivative*Math.tan(nextGamma(s).value/2))-previous,
    // Stable central root of the original circular rfn. No modulo or endpoint move.
    scale=Math.max(r1,r2),x=r1/scale,y=r2/scale,square=y*y+(y*y-x*x)*target*target,
    half=target*(x-y)/(y+Math.sqrt(square)),theta=2*Math.atan(half),
    residual=y*Math.sin(theta)/(x-y*Math.cos(theta))-target,value=b.value+theta;
   if(![target,square,half,theta,residual,value].every(finite)||square<=0)issue('NUMERIC_SOURCE','当前圆族中央根或源导数不可在double中稳定表示。');
   maximumRootResidual=Math.max(maximumRootResidual,Math.abs(residual));
   if(Math.abs(residual)>1e-9*Math.max(1,Math.abs(target)))issue('NUMERIC_SOURCE','当前有限节点的原rfn残差超出本地工厂预算。');return value;
  });q.push(quartic(roots));
 }
 const magnitude=Math.max(1,r.radius+r.bands*r.bandSpacing),rawReplayBudget=256*EPS*ip**(r.bands-1)*Math.max(1,Math.abs(r.perturbation),magnitude),frames:LinkedBandsPlanarCP4086Frame[]=[];
 if(!finite(rawReplayBudget)||rawReplayBudget>magnitude*1e-7)issue('NUMERIC_SOURCE','当前派生重放工程预算超出工厂能力；不是原数值参数非法。');
 for(let j=0;j<=r.segments;j++){
  const s=j===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*j/r.segments,vs=q.map(f=>f(s)),
   qValues=vs.map(x=>x.value),qDerivatives=vs.map(x=>x.derivative),gammaDegrees=gamma.map((f,i)=>i===0?r.firstFoldAngleDeg:f(s).value*180/Math.PI),
   flatCurves=qValues.map((v,i):Point=>[ (r.radius+i*r.bandSpacing)*Math.cos(v),(r.radius+i*r.bandSpacing)*Math.sin(v)]);
  if(!finite(s)||j>0&&s<=frames[j-1].s||![...qValues,...qDerivatives,...gammaDegrees,...flatCurves.flat()].every(finite))issue('NUMERIC_SOURCE','原节点、参数或二维世界坐标未分离/不可表示。');
  if(qDerivatives.some(v=>v<=0))issue('FINITE_PAPER','当前有限曲线采样存在非正参数速度；尚不能采用本带纸域。');
  if(s===0){qValues[0]=0;qValues[1]=0;flatCurves[0]=[r.radius,0];flatCurves[1]=[r.radius+r.bandSpacing,0];}
  frames.push({s,qValues,qDerivatives,gammaDegrees,flatCurves});
 }
 const maximumEndpointExtrapolationRad=Math.max(0,...[frames[0],frames.at(-1)!].flatMap(f=>f.qValues.flatMap(x=>[-x,x-Math.PI])));
 return {frames,maximumRootResidual,maximumEndpointExtrapolationRad,rawReplayBudget,numericPolicy:{model:'finite uniform local Newton degree4/right stencil/end-stencil polynomial extrapolation; derived engineering replay estimate, not rigorous forward error',intervalCertified:false,mathematicaListInterpolationEquivalent:false,sourceInputsExact:true,derivedReplayBudgetRaw:rawReplayBudget,libmAccuracyCertified:false}};
}

/** Exact binary64 orientations. Positive partition + simple boundary + Euler1
 * prove one finite material coverage. Transverse/diagonal edges are proof only. */
function partition(curves:Point[][]){
 const points=curves.flat(),bands=curves.length-1,n=curves[0].length-1,stride=n+1,buf=new ArrayBuffer(8),view=new DataView(buf),
  dyadic=(x:number):[bigint,number]=>{if(!finite(x))issue('FINITE_PAPER','有限点坐标不可表示。');if(x===0)return [0n,0];view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),ex=Number((bits>>52n)&2047n);let a=(bits&((1n<<52n)-1n))+(ex?1n<<52n:0n),e=ex?ex-1075:-1074;if(bits>>63n)a=-a;while(a!==0n&&a%2n===0n){a/=2n;e++;}return [a,e];},
  ratios=points.map(p=>p.map(dyadic)),power=Math.min(...ratios.flat().filter(([a])=>a!==0n).map(([,e])=>e)),p=ratios.map(row=>row.map(([a,e])=>a<<BigInt(e-power))),
  cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),
  dot=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),
  edgeMap=new Map<string,[number,number]>(),add=(a:number,b:number)=>edgeMap.set([a,b].sort((a,b)=>a-b).join(','),[a,b]);
 if(new Set(points.map(p=>p.join(','))).size!==points.length)issue('FINITE_PAPER','不同材料身份出现同坐标点；不会容差焊接。');
 for(let i=0;i<=bands;i++)for(let j=0;j<n;j++)add(i*stride+j,i*stride+j+1);
 let nonconvexCells=0,minimumTriangleCross=Infinity;
 for(let i=0;i<bands;i++){
  for(let j=0;j<=n;j++)add(i*stride+j,(i+1)*stride+j);
  for(let j=0;j<n;j++){
   const a=i*stride+j+1,b=i*stride+j,c=(i+1)*stride+j,d=c+1;
   if(cross(a,b,c)+cross(a,c,d)<=0n)issue('FINITE_PAPER','当前有限带cell面积非正；不会挪动或自动裁域。');
   if([cross(a,b,c),cross(b,c,d),cross(c,d,a),cross(d,a,b)].some(x=>x<=0n))nonconvexCells++;
   const triangles=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:cross(b,c,d)>0n&&cross(b,d,a)>0n?[[b,c,d],[b,d,a]]:null;
   if(!triangles)throw new LinkedBandsPlanarCP4086Error('FINITE_PAPER','当前有限cell没有正的简单三角剖分。');add(triangles[0][0],triangles[0][2]);
   for(const [a,b,c]of triangles){const pa=points[a],pb=points[b],pc=points[c];minimumTriangleCross=Math.min(minimumTriangleCross,(pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]));}
  }
 }
 const edges=[...edgeMap.values()];let testedPairs=0;
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const [a,b]=edges[i],[c,d]=edges[j];testedPairs++;
  if([0,1].some(k=>Math.max(points[a][k],points[b][k])<Math.min(points[c][k],points[d][k])||Math.max(points[c][k],points[d][k])<Math.min(points[a][k],points[b][k])))continue;
  const shared=[a,b].find(v=>v===c||v===d);
  if(shared!==undefined){const x=a===shared?b:a,y=c===shared?d:c;if(cross(shared,x,y)===0n&&dot(shared,x,y)>0n)issue('FINITE_PAPER','证明partition存在同射线重叠。');continue;}
  const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
  if(on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)||ac*ad<0n&&ca*cb<0n)issue('FINITE_PAPER','当前有限材料partition有非关联接触或交叉。');
 }
 return {proofCells:bands*n,proofTriangles:2*bands*n,nonconvexCells,minimumTriangleCross,partitionEdges:edges.length,partitionPairs:testedPairs,positivePartitionAndSimpleBoundary:true,proofEdgesAreNotCPEdges:true,exactOrientationModel:'binary64 converted to common-exponent bigint dyadics'};
}
function material(curves:Point[][]){
 const bands=curves.length-1,n=curves[0].length-1,s=n+1,points=curves.flat(),edges:[number,number][]=[],assignments:string[]=[],angles:(number|null)[]=[],ids:string[]=[],
  add=(a:number,b:number,k:'B'|'U',id:string)=>{edges.push([a,b]);assignments.push(k);angles.push(k==='B'?0:null);ids.push(id);};
 for(let i=0;i<=bands;i++)for(let j=0;j<n;j++)add(i*s+j,i*s+j+1,i===0||i===bands?'B':'U',`linked4086-curve-${i}-${j}`);
 for(let i=0;i<bands;i++)for(const j of [0,n])add(i*s+j,(i+1)*s+j,'B',`linked4086-cap-${i}-${j}`);
 const range=(i:number)=>Array.from({length:s},(_,j)=>i*s+j),faces=Array.from({length:bands},(_,i)=>[...range(i).reverse(),...range(i+1)]),map=new Map(edges.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces.map(f=>f.map((v,j)=>map.get([v,f[(j+1)%f.length]].sort((a,b)=>a-b).join(','))!)),edges_faces=edges.map((_,e)=>faces_edges.flatMap((f,i)=>f.includes(e)?[i]:[])),
  faces_faces=faces_edges.map((f,i)=>f.map(e=>edges_faces[e].find(v=>v!==i)??null)) as unknown as number[][];
 return {ids,graph:{vertices_coords:points,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:faces,faces_edges,edges_faces,faces_faces} as FoldGraph,proof:partition(curves)};
}
function fromSource(r:LinkedBandsPlanarCP4086Recipe,source:LinkedBandsPlanarCP4086Source,shared=false):Doc{
 const curves=Array.from({length:r.bands+1},(_,i)=>source.frames.map(f=>f.flatCurves[i].map(x=>x*r.unitSizeMm) as Point)),{graph,ids,proof}=material(curves),pts=graph.vertices_coords,
  paper={width:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),height:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))};
 if(pts.some(p=>p.some(x=>!finite(x)||Math.abs(x)>1e6))||!finite(paper.width)||!finite(paper.height))issue('MATERIAL_INTERFACE','源已计算；当前毫米材料核心的坐标/尺寸容量不足，不会自动平移、归一化或缩小。');
 const doc:Doc={schemaVersion:2,name:'关联曲折 · 多带二维 CP',paper,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(pts[a]),b:clone(pts[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};let topology;
 try{topology=createMaterialTopology(doc,graph,ids);validateDoc(doc);}catch(e){issue('MATERIAL_INTERFACE',`精确有限纸域已完成，但当前材料接口拒绝：${(e as Error).message}`);}
 doc.metadata={materialTopology:topology,[NS]:{schema:SCHEMA,recipe:r,
  source:{definitionCell:'In[4076]',exampleCell:'In[4086]',notebookSHA256:'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',
   circleFamily:'(radius+i*bandSpacing)*[cos(q_i(s)),sin(q_i(s))]',q0:'s',q1:'s+perturbation*sin(2*s)',
   literalReciprocalSpeedRatioRetained:true,literalAngleDerivativeAtNextCurveParameter:true,centralPoleFreeRootOnly:true,
   originalDefaults:{radius:1,bandSpacing:.1,perturbation:.1,firstFoldAngleDeg:120,parameterRange:[0,Math.PI],bands:4,interpolationOrder:4,interpolationIntervals:32,rulingLineDivisions:50},
   interpolation:'local uniform degree4 Newton/right stencil/end-stencil polynomial extrapolation',mathematicaListInterpolationEquivalent:false,
   existingReadonlySciPySplineReused:false,originalSaved3DNumericalOutputReproduced:false,currentStartReseeded:false,
   originalUnitsUnspecified:true,coordinateUnit:'mm',unitSizeMm:r.unitSizeMm,sourceCoordinateTransform:'single explicit unitSizeMm multiplication; no translation or normalization'},
  sourceFrames:shared?source.frames:clone(source.frames),numericPolicy:source.numericPolicy,
  finitePaperProof:proof,topology:{vertices:pts.length,edges:ids.length,faces:r.bands,boundaryEdges:2*r.segments+2*r.bands,unassignedEdges:(r.bands-1)*r.segments,
   edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,proofOnlyRulingEdges:r.bands*(r.segments-1),proofOnlyDiagonalEdges:r.bands*r.segments},
  evidence:{adoption:'finite-planar-u-null-cp-only',originalSavedWhole3DChainCertified:false,originalSecondBandIsometric:false,
   originalSavedSecondBandGeodesicMismatch:'396/665',sourceGammaIsFiniteEdgeAngle:false,mountainValleyAssigned:false,
   exactContinuousCurves:false,threeDimensionalMaterial:false,rigidMotion:false,flatFold:false,layerOrder:false,collisionFree:false}}};
 return doc;
}
export function linkedBandsPlanarCP4086Document(raw:unknown):Doc{const r=validateLinkedBandsPlanarCP4086Recipe(raw);return fromSource(r,evaluateLinkedBandsPlanarCP4086Source(r));}
export function prepareLinkedBandsPlanarCP4086Preview(raw:unknown){
 const recipe=validateLinkedBandsPlanarCP4086Recipe(raw),source=evaluateLinkedBandsPlanarCP4086Source(recipe),freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(source);
 return {source,build:(raw:unknown)=>{const r=validateLinkedBandsPlanarCP4086Recipe(raw);for(const k of Object.keys(recipe) as (keyof LinkedBandsPlanarCP4086Recipe)[])if(k!=='unitSizeMm'&&recipe[k]!==r[k])issue('SOURCE_INPUT','当前源参数已变，请重新建立snapshot；单位倍率可以复用原坐标。');return fromSource(r,source,true);}};
}
/** A hand-edited document retains the explicit source reconstruction entry. */
export function readLinkedBandsPlanarCP4086Recipe(doc:Doc):LinkedBandsPlanarCP4086Recipe|null{try{const raw=doc.metadata?.[NS];return object(raw)&&raw.schema===SCHEMA?validateLinkedBandsPlanarCP4086Recipe(raw.recipe):null;}catch{return null;}}
function same(a:unknown,b:unknown,path:string,budget:number):boolean{
 if(typeof a==='number'&&typeof b==='number'){if(!finite(a)||!finite(b))return false;return /^sourceFrames\.\d+\.(qValues|qDerivatives|gammaDegrees|flatCurves)(\.|$)/.test(path)?Math.abs(a-b)<=budget:a===b;}
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>same(a[i],x,`${path}.${i}`,budget));
 if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k],path?`${path}.${k}`:k,budget));return a===b;
}
export function linkedBandsPlanarCP4086SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const r=readLinkedBandsPlanarCP4086Recipe(doc),saved=doc.metadata?.[NS];if(!r||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const source=evaluateLinkedBandsPlanarCP4086Source(r),actual=inspectMaterialTopology(doc);if(!actual.ok||actual.foldedVertices||actual.startingFace!==undefined)return false;
  if(!Array.isArray(saved.sourceFrames)||saved.sourceFrames.length!==r.segments+1)return false;
  // Saved derived frames must replay within the stated engineering budget.
  // Actual graph and segments are then exactly bound to those saved world rows.
  const own=linkedBandsPlanarCP4086Document(r).metadata![NS] as any,curves=Array.from({length:r.bands+1},(_,i)=>saved.sourceFrames.map((f:any)=>{const p=f?.flatCurves?.[i];if(!Array.isArray(p)||p.length!==2||!p.every(finite))issue('FINITE_PAPER','缺少保存的原世界点。');return p.map((x:number)=>x*r.unitSizeMm) as Point;})),
   replay=material(curves),expectedGraph=replay.graph;
  if(!same(saved,{...own,finitePaperProof:replay.proof},'',source.rawReplayBudget)||!same(actual.graph,expectedGraph,'',0)||!same(actual.edgeSegmentIds,replay.ids,'',0)||doc.segments.length!==replay.ids.length)return false;
  for(let i=0;i<source.frames.length;i++){
   const row=saved.sourceFrames[i],f=source.frames[i];if(row.s!==f.s||row.qValues[0]!==row.s||row.qDerivatives[0]!==1||Math.abs(row.qValues[1]-(row.s+r.perturbation*Math.sin(2*row.s)))>source.rawReplayBudget||row.gammaDegrees[0]!==r.firstFoldAngleDeg)return false;
   if(f.s===0&&(row.qValues[0]!==0||row.qValues[1]!==0||row.qDerivatives[1]!==1+2*r.perturbation||JSON.stringify(row.flatCurves[0])!==JSON.stringify([r.radius,0])||JSON.stringify(row.flatCurves[1])!==JSON.stringify([r.radius+r.bandSpacing,0])))return false;
  }
  for(let i=0;i<replay.ids.length;i++){const segment=doc.segments.find(s=>s.id===replay.ids[i]),[a,b]=expectedGraph.edges_vertices[i];if(!segment||segment.assignment!==expectedGraph.edges_assignment[i]||segment.angle!==expectedGraph.edges_foldAngle[i]||JSON.stringify(segment.a)!==JSON.stringify(expectedGraph.vertices_coords[a])||JSON.stringify(segment.b)!==JSON.stringify(expectedGraph.vertices_coords[b]))return false;}
  const p=expectedGraph.vertices_coords,paper={width:Math.max(...p.map(x=>x[0]))-Math.min(...p.map(x=>x[0])),height:Math.max(...p.map(x=>x[1]))-Math.min(...p.map(x=>x[1]))};return same(doc.paper,paper,'',0);
 }catch{return false;}
}
