/** General original In[3951]/In[3945] on its principal real branch. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
export type UniformHelixGeneralCP3951Recipe={radius:number;helicityAngleDeg:number;foldAngleDeg:number;parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE:UniformHelixGeneralCP3951Recipe={radius:1,helicityAngleDeg:30,foldAngleDeg:90,parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100};
export type UniformHelixGeneralCP3951ErrorCode='SOURCE_INPUT'|'NUMERIC_SOURCE'|'PAPER_DOMAIN'|'FINITE_GEOMETRY'|'MATERIAL_INTERFACE';
export class UniformHelixGeneralCP3951Error extends Error{constructor(public readonly code:UniformHelixGeneralCP3951ErrorCode,message:string){super(message);this.name='UniformHelixGeneralCP3951Error';}}
const issue=(code:UniformHelixGeneralCP3951ErrorCode,message:string):never=>{throw new UniformHelixGeneralCP3951Error(code,message);},
 fail:(message?:string)=>never=(message='当前有限图与原源、材料身份不一致。')=>issue('FINITE_GEOMETRY',message),
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),
 clone=<T>(x:T):T=>structuredClone(x),EPS=Number.EPSILON,SCHEMA='original-in3951-general-analytic-uniform-helix-cp-v1';
export function validateUniformHelixGeneralCP3951Recipe(raw:unknown):UniformHelixGeneralCP3951Recipe{
 if(!object(raw)||!keys(raw,Object.keys(UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))issue('SOURCE_INPUT','须填写八个有限数值；未知字段、隐式默认和非数值均不接受。');
 const r=raw as UniformHelixGeneralCP3951Recipe;
 if(r.radius<=0||Math.abs(r.helicityAngleDeg)>=90||r.foldAngleDeg<=0||r.foldAngleDeg>=180)issue('SOURCE_INPUT','原主实分支须 r>0、−90°<θ<90°、0°<γ<180°；负 θ 可保留。');
 if(!(r.parameterStart<r.parameterEnd))issue('SOURCE_INPUT','原函数裁域须 uStart<uEnd；裁域可以为负或超过保存例 [0,π]。');
 if(r.leftWidth<=0||r.leftWidth>1||r.rightWidth<=0||r.rightWidth>1)issue('PAPER_DOMAIN','左右内切宽须为正且不超过原单位宽 1；小宽没有 .05 下限。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)issue('PAPER_DOMAIN','有限检查预算为整数 16…128 弦，默认 100；没有修改输入。');
 return {...r};
}
const ulp=(x:number):number=>{if(!finite(x))return Infinity;if(x===0)return Number.MIN_VALUE;const a=Math.abs(x);return a<2**-1022?Number.MIN_VALUE:2**(Math.floor(Math.log2(a))-52);};
export type UniformHelixGeneralCP3951Frame={u:number;phase:number;base:Point;basePrime:Point;leftDirector:Point;rightDirector:Point;spatialBase:[number,number,number];spatialLeftDirector:[number,number,number];spatialRightDirector:[number,number,number];phaseErrorEstimate:number;worldErrorEstimateMm:number;directorErrorEstimate:number;spatialErrorEstimateMm:number};
export type UniformHelixGeneralCP3951Source={recipe:UniformHelixGeneralCP3951Recipe;frames:UniformHelixGeneralCP3951Frame[];constants:{radius2D:number;angularRate:number;radialCoefficient:number;tangentialCoefficient:number;center:Point;leftFocalDistance:number;speed:number};numericPolicy:{model:string;intervalCertified:false;sourcePhaseStep:number;maximumPhaseErrorEstimate:number;maximumWorldErrorEstimateMm:number;worldErrorEstimateRole:string;maximumSpatialReferenceErrorEstimateMm:number;spatialReferenceAccuracyCertified:false;maximumDirectorErrorEstimate:number;leftFocusErrorEstimateMm:number;worldReplayULPBoundMm:number;directorReplayULPBound:number;maximumUnitDirectorResidual:number;relativeWorldAccuracyDemand:number;sourceInputParametersExact:true;libmAccuracyCertified:false}};

/** Source-only evaluator. A valid source can still fail material adoption. */
export function evaluateUniformHelixGeneralCP3951Source(raw:unknown):UniformHelixGeneralCP3951Source{
 const recipe=validateUniformHelixGeneralCP3951Recipe(raw),theta=recipe.helicityAngleDeg*(Math.PI/180),h=recipe.foldAngleDeg*(Math.PI/360),
  c=Math.cos(theta),s=Math.sin(theta),ch=Math.cos(h),sh=Math.sin(h),D=Math.hypot(s,c*sh),R=recipe.radius/(c*c*ch),K=c*ch,A=c*sh/D,B=s/D,FOCAL=R*A,speed=recipe.radius/c,
  ec=EPS*(8*Math.abs(c)+4*Math.abs(theta)),es=EPS*(8*Math.abs(s)+4*Math.abs(theta)),ech=EPS*(8*Math.abs(ch)+4*Math.abs(h)),esh=EPS*(8*Math.abs(sh)+4*Math.abs(h)),
  eD=Math.hypot(es,ec*Math.abs(sh)+Math.abs(c)*esh)+EPS*D,
  eR=R*(2*ec/c+ech/ch+8*EPS),eK=ec*ch+c*ech+4*EPS*K,
  eA=(ec*Math.abs(sh)+c*esh+Math.abs(A)*eD)/D+4*EPS*Math.abs(A),eB=(es+Math.abs(B)*eD)/D+4*EPS*Math.abs(B),focusError=eR*Math.abs(A)+R*eA+4*EPS*FOCAL,
  span=recipe.parameterEnd-recipe.parameterStart,phaseSpan=K*span,stepPhase=phaseSpan/recipe.segments;
 if(!(D>0&&R>0&&K>0&&FOCAL>0)||![theta,h,c,s,ch,sh,D,R,K,A,B,FOCAL,speed,span,phaseSpan,stepPhase,eD,eR,eK,eA,eB,focusError].every(finite))issue('NUMERIC_SOURCE','原输入在主分支内，但当前 double 的角度、半径/焦距或裁域运算不可表示；未改变参数。');
 const frames:UniformHelixGeneralCP3951Frame[]=[];let phaseError=0,worldError=0,spatialError=0,directorError=0,maxResidual=0,replayScale=1;
 for(let i=0;i<=recipe.segments;i++){
  const u=i===recipe.segments?recipe.parameterEnd:recipe.parameterStart+span*i/recipe.segments;
  if(!finite(u)||i&&u<=frames[i-1].u)issue('NUMERIC_SOURCE','原 u 网格在 double 中有重复或未分离参数；未补点或移动裁域。');
  const phase=K*u,co=Math.cos(phase),si=Math.sin(phase),halfSin=Math.sin(phase/2),dx=(R*halfSin)*halfSin*2,
   base:Point=u===0?[1,0]:[1-dx,R*si],basePrime:Point=[-speed*si,speed*co],
   leftDirector:Point=[-A*co-B*si,-A*si+B*co],rightDirector:Point=[A*co-B*si,A*si+B*co],
   cu=Math.cos(u),su=Math.sin(u),T=[-c*su,c*cu,s],N=[-cu,-su,0],Z=[s*su,-s*cu,c],
   spatialBase:[number,number,number]=[recipe.radius*cu,recipe.radius*su,recipe.radius*Math.tan(theta)*u],
   spatialLeftDirector=T.map((x,k)=>B*x+A*(ch*N[k]+sh*Z[k])) as [number,number,number],
   spatialRightDirector=T.map((x,k)=>B*x-A*(ch*N[k]-sh*Z[k])) as [number,number,number],
   eq=Math.abs(u)*eK+4*EPS*Math.abs(phase),esin=EPS*(8*Math.abs(si)+4*Math.abs(phase)),eshape=EPS*(8*Math.abs(halfSin)+2*Math.abs(phase)),
   ex=2*halfSin*halfSin*eR+4*(R*Math.abs(halfSin))*(eshape+eq/2)+4*EPS*Math.abs(dx)+ulp(base[0]),
   ey=Math.abs(si)*eR+R*(esin+eq)+4*EPS*Math.abs(base[1]),ed=eA+eB+(Math.abs(A)+Math.abs(B))*(eq+EPS*(8+4*Math.abs(phase)))+8*EPS,
   ew=u===0?0:Math.max(ex,ey),spatialXYError=recipe.radius*EPS*(8+4*Math.abs(u)),spatialZCoefficientError=(recipe.radius*es+Math.abs(recipe.radius*Math.tan(theta))*ec)/c+8*EPS*Math.abs(recipe.radius*Math.tan(theta)),esp=Math.max(spatialXYError+4*EPS*Math.abs(spatialBase[0]),spatialXYError+4*EPS*Math.abs(spatialBase[1]),spatialZCoefficientError*Math.abs(u)+4*EPS*Math.abs(spatialBase[2]));
  if(![phase,...base,...basePrime,...leftDirector,...rightDirector,...spatialBase,...spatialLeftDirector,...spatialRightDirector,eq,ew,ed,esp].every(finite))issue('NUMERIC_SOURCE','原世界 frames 或其工程误差预算发生溢出；此 source 暂不可在 double 中重放。');
  for(const d of [leftDirector,rightDirector,spatialLeftDirector,spatialRightDirector])maxResidual=Math.max(maxResidual,Math.abs(d.reduce((sum,x)=>sum+x*x,0)-1));
  phaseError=Math.max(phaseError,eq);worldError=Math.max(worldError,ew);spatialError=Math.max(spatialError,esp);directorError=Math.max(directorError,ed);replayScale=Math.max(replayScale,...base.map(Math.abs),Math.abs(dx),Math.abs(base[1]));
  frames.push({u,phase,base,basePrime,leftDirector,rightDirector,spatialBase,spatialLeftDirector,spatialRightDirector,phaseErrorEstimate:eq,worldErrorEstimateMm:ew,directorErrorEstimate:ed,spatialErrorEstimateMm:esp});
 }
 const scale=Math.max(1,...frames.flatMap(f=>f.base.map(Math.abs))),phaseDemand=Math.min(1e-4,stepPhase/16),relativeWorldAccuracyDemand=1e-7;
 if(!(phaseError<=phaseDemand&&worldError<=scale*relativeWorldAccuracyDemand&&directorError<=1e-7&&maxResidual<=64*EPS))issue('NUMERIC_SOURCE','原 source 有定义，但相位/角度条件使当前工程误差预算超限；这是数值复现能力不足，不是原参数非法。');
 return {recipe,frames,constants:{radius2D:R,angularRate:K,radialCoefficient:A,tangentialCoefficient:B,center:[1-R,0],leftFocalDistance:FOCAL,speed},
  numericPolicy:{model:'first-order IEEE double/angle/trig engineering estimate; not an interval libm certificate',intervalCertified:false,sourcePhaseStep:stepPhase,
   maximumPhaseErrorEstimate:phaseError,maximumWorldErrorEstimateMm:worldError,worldErrorEstimateRole:'planar source world coordinates only',maximumSpatialReferenceErrorEstimateMm:spatialError,spatialReferenceAccuracyCertified:false,maximumDirectorErrorEstimate:directorError,leftFocusErrorEstimateMm:focusError,
   worldReplayULPBoundMm:16*ulp(replayScale+1),directorReplayULPBound:32*ulp(1),maximumUnitDirectorResidual:maxResidual,
   relativeWorldAccuracyDemand,sourceInputParametersExact:true,libmAccuracyCertified:false}};
}
const offset=(p:Point,d:Point,w:number):Point=>[p[0]+w*d[0],p[1]+w*d[1]];

function finitePartition(curves:Point[][],edges:[number,number][],faces:number[][]){
 const points=curves.flat(),buf=new ArrayBuffer(8),view=new DataView(buf);
 const dyadic=(x:number):[bigint,number]=>{if(!finite(x))fail();if(x===0)return [0n,0];view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n);
  let n=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),e=exponent?exponent-1075:-1074;if(bits>>63n)n=-n;
  while(n!==0n&&n%2n===0n){n/=2n;e++;}return [n,e];};
 const ratios=points.map(p=>p.map(dyadic)),e=Math.min(...ratios.flat().filter(([n])=>n!==0n).map(([,x])=>x)),
  p=ratios.map(row=>row.map(([n,ex])=>n<<BigInt(ex-e))),cross=(a:number,b:number,c:number)=>
   (p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  dotAt=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>= (p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<= (p[a][k]>p[b][k]?p[a][k]:p[b][k])),
  sign=(x:bigint)=>x>0n?1:x<0n?-1:0,n=curves[0].length-1,s=n+1;
 if(new Set(points.map(x=>x.join(','))).size!==points.length)fail('有限源顶点出现不同身份同坐标，未容差吸附。');
 let minimumTriangleCross=Infinity,nonconvexCells=0;const diagonals:[number,number][]=[];
 for(let i=0;i<n;i++)for(const cell of [[i,i+1,s+i+1,s+i],[i+1,i,2*s+i,2*s+i+1]]){
  const [a,b,c,d]=cell,area=cross(a,b,c)+cross(a,c,d);
  if(area<=0n)fail('实际验证 cell 面积非正，未补点或添加加工缝。');
  if(cell.some((a,k)=>cross(a,cell[(k+1)%4],cell[(k+2)%4])<=0n))nonconvexCells++;
  const triangles=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:
   cross(b,c,d)>0n&&cross(b,d,a)>0n?[[b,c,d],[b,d,a]]:null;
  if(!triangles)fail('当前有限 cell 没有可靠正向对角三角剖分；未移动源点。');
  diagonals.push(triangles[0][0]===a?[a,c]:[b,d]);
  for(const triangle of triangles){const [a,b,c]=triangle.map(i=>points[i]);
   minimumTriangleCross=Math.min(minimumTriangleCross,(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));}
 }
 const partition=[...edges];for(let i=1;i<n;i++)partition.push([i,s+i],[i,2*s+i]);partition.push(...diagonals);let pairs=0,sharedPairs=0;
 const boxes=partition.map(([a,b])=>[Math.min(points[a][0],points[b][0]),Math.max(points[a][0],points[b][0]),Math.min(points[a][1],points[b][1]),Math.max(points[a][1],points[b][1])]);
 partition.forEach(([a,b])=>{if(p[a][0]===p[b][0]&&p[a][1]===p[b][1])fail('有限分区含零长边。');});
 // Shared pairs are enumerated once at their indexed vertex; distinct edges cannot share both ends.
 const incident=points.map(()=>[] as number[]);
 partition.forEach(([a,b],i)=>{incident[a].push(i);incident[b].push(i);});
 incident.forEach((es,shared)=>{for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
  sharedPairs++;const [a,b]=partition[es[i]],[c,d]=partition[es[j]],x=a===shared?b:a,y=c===shared?d:c;
  if(cross(shared,x,y)===0n&&dotAt(shared,x,y)>0n)fail('分区共顶点边有同射线重叠。');
 }});
 pairs=partition.length*(partition.length-1)/2-sharedPairs;
 // Sweep only strict-overlap boxes. Skipped boxes are exactly coordinate-separated on binary64 points.
 const order=Array.from({length:partition.length},(_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]||a-b);let active:number[]=[];
 for(const i of order){
  active=active.filter(j=>boxes[j][1]>=boxes[i][0]);
  for(const j of active){
   if(boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;
   const [a,b]=partition[i],[c,d]=partition[j];if(a===c||a===d||b===c||b===d)continue;
   if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))
    fail('有限分区有非相邻交叉、触点或重叠；拒绝采用，未修补原点。');
  }
  active.push(i);
 }
 const areas=faces.map(face=>{const origin=face[0],exact=face.reduce((a,b,i)=>a+cross(origin,b,face[(i+1)%face.length]),0n);if(exact<=0n)fail('实际两面面积必须严格为正。');const o=points[face[0]];return face.reduce((sum,a,i)=>{const b=points[face[(i+1)%face.length]];return sum+(points[a][0]-o[0])*(b[1]-o[1])-(points[a][1]-o[1])*(b[0]-o[0]);},0)/2;});
 if(!areas.every(x=>finite(x)&&x>0)||!finite(minimumTriangleCross)||minimumTriangleCross<=0)fail('有限纸域面积或三角剖分不可用。');
 return {arithmetic:'exact-dyadic-integer-signs-on-actual-binary64-points',validationCells:2*n,validationTriangles:4*n,nonconvexCells,minimumTriangleCross,
  partitionEdges:partition.length,validationOnlyRulingEdges:2*(n-1),validationOnlyDiagonals:diagonals.length,nonincidentPairs:pairs,sharedVertexPairs:sharedPairs,signedFaceAreas:areas,
  logicalFaces:2,validationRulingsAreCPEdges:false,validationDiagonalsAreCPEdges:false,coordinateWelding:false};
}
function materialGraph(curves:Point[][]){
 const n=curves[0].length-1,s=n+1,vertices_coords=curves.flat().map(clone),edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const add=(a:number,b:number,k:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='U'?null:0);ids.push(id);};
 for(let i=0;i<n;i++){add(i,i+1,'U',`uniform-general-crease-${i}`);add(s+i,s+i+1,'B',`uniform-general-left-${i}`);add(2*s+i,2*s+i+1,'B',`uniform-general-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`uniform-general-cap-left-${i}`);add(i,2*s+i,'B',`uniform-general-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}

function documentFromSource(recipe:UniformHelixGeneralCP3951Recipe,source:UniformHelixGeneralCP3951Source,shared=false):Doc{
 const {frames,constants:c,numericPolicy:np}=source,span=recipe.parameterEnd-recipe.parameterStart,phaseSpan=c.angularRate*span,
  focalMargin=c.leftFocalDistance-recipe.leftWidth;
 if(!(phaseSpan<2*Math.PI-(frames[0].phaseErrorEstimate+frames.at(-1)!.phaseErrorEstimate)))issue('PAPER_DOMAIN','原函数可以继续取样；当前两面纸域须少于一个完整圆周，近闭合裁域也须留下数值可分辨的间隙。');
 if(!(focalMargin>4*np.leftFocusErrorEstimateMm))issue('PAPER_DOMAIN',`当前左宽须在原焦距 ${c.leftFocalDistance.toPrecision(8)} mm 以内并留可分辨余量；这是纸域条件，原 source 仍有效。`);
 const curves=[frames.map(f=>clone(f.base)),frames.map(f=>offset(f.base,f.leftDirector,recipe.leftWidth)),frames.map(f=>offset(f.base,f.rightDirector,recipe.rightWidth))],
  {graph,ids,proof}=materialGraph(curves),points=graph.vertices_coords,
  bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},
  doc:Doc={schemaVersion:2,name:'原均匀螺旋 · 通用解析两面 CP',paper:bbox,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 if(points.some(p=>p.some(x=>Math.abs(x)>1e6)))issue('MATERIAL_INTERFACE','原 source 已计算；当前材料核心只支持绝对毫米坐标 ≤1e6，本裁域超过接口能力，未缩放或移动。');
 let material;
 try{material=createMaterialTopology(doc,graph,ids);}catch(e){issue('MATERIAL_INTERFACE',`原 source 与精确有限检查已完成；当前材料核心的坐标/epsilon 预算不支持该图：${(e as Error).message}`);}
 const step=span/recipe.segments,creaseAmplitude=recipe.radius*Math.cos(recipe.foldAngleDeg*(Math.PI/360)),delta=c.angularRate*step,
  convexLimit=c.radius2D*(c.radialCoefficient-Math.abs(c.tangentialCoefficient)*Math.tan(delta/2)),
  currentLeftJacobian=c.angularRate*focalMargin;
 if(!finite(currentLeftJacobian)||currentLeftJacobian<=0)issue('NUMERIC_SOURCE','当前左 Jacobian 数值下溢或不可表示；源与所需材料精度须进一步扩展。');
 doc.metadata={materialTopology:material,originalUniformHelixGeneral3951:{schema:SCHEMA,recipe,
  source:{inputCells:['In[3953]','In[3947]'],definitionCells:['In[3951]','In[3952]','In[3945]'],
   functions:['CurvedFoldUniformHelix2D','CurvedFoldUniformHelix3D'],radius:recipe.radius,helicityAngleDeg:recipe.helicityAngleDeg,foldAngleDeg:recipe.foldAngleDeg,
   branch:'r>0; -90<theta<90 degrees; 0<gamma<180 degrees',parameterIsOriginalU:true,parameterIsArcLength:false,
   initialParameter:0,initialPoint:[1,0],initialTangent:[0,1],currentStartReseeded:false,coordinateTransform:'identity',coordinateUnit:'mm',originalCoordinateUnit:'unspecified',
   localUnitConvention:'1 original world coordinate unit = 1 mm',unitWidthsIndependentOfRadius:true,originalGraphicsWidths:[1,1],originalGraphicsCurveDivisions:100,
   originalFoldLineStyle:'FoldedLine',originalRulingStyles:['UnfoldedLine','UnfoldedLine'],originalMVSpecified:false,rightDirectorReversed:false,
   sourceRole:'original general analytic frames; no native HTTP response',wolframInterpolationReproduced:false},
  analyticConstants:c,sourceFrames:shared?frames:clone(frames),numericalPolicy:np,
  paperDomain:{role:recipe.leftWidth===1&&recipe.rightWidth===1?'original-unit-width-on-selected-domain':'explicit-inset-of-original-unit-width',widths:[recipe.leftWidth,recipe.rightWidth],
   parameterRange:[recipe.parameterStart,recipe.parameterEnd],sourcePhaseSpan:phaseSpan,parameterRectangleQuotient:false,
   leftFocalMarginMm:focalMargin,leftFocalNumericalMarginMm:4*np.leftFocusErrorEstimateMm,leftJacobianLowerBound:currentLeftJacobian,
   rightSignedJacobianUpperBound:-c.angularRate*c.leftFocalDistance,continuousPrincipalSourceInjective:true,leftRightIntersection:'common crease only',
   convexSufficientWidthLimitMm:convexLimit,convexSufficientCondition:recipe.leftWidth<convexLimit,convexConditionRequiredForAdoption:false,
   sourceValiditySeparateFromMaterialAdoption:true,coreCoordinateMagnitudeLimitMm:1e6,coreGeometryEpsilonPolicy:'max(1e-9,span*1e-9,magnitude*EPS*32) retained'},
  sampling:{segments:recipe.segments,parameterStep:step,method:'original absolute parameter analytic frames, with finite straight chords',
   curveSegmentsAreInterpolationPoints:false,exactContinuousCurve:false,
   creaseChordErrorAnalyticApproximationMm:creaseAmplitude*step*step/8,
   leftBoundaryChordErrorAnalyticApproximationMm:(creaseAmplitude+recipe.leftWidth*c.angularRate*c.angularRate)*step*step/8,
   rightBoundaryChordErrorAnalyticApproximationMm:(creaseAmplitude+recipe.rightWidth*c.angularRate*c.angularRate)*step*step/8,
   errorBoundRole:'analytic source-to-chord formula evaluated in double; not a libm/Wolfram interval certificate'},
  finitePaperProof:proof,topology:{vertices:points.length,edges:ids.length,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,
   edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,interiorRulingSeams:0},
  evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,sourceConstantGammaIsFiniteEdgeAngle:false,flatFold:false,layerOrder:false,
   threeDimensionalInitialCondition:false,isometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 validateDoc(doc);return doc;
}
export function uniformHelixGeneralCP3951Document(raw:unknown):Doc{
 const recipe=validateUniformHelixGeneralCP3951Recipe(raw);return documentFromSource(recipe,evaluateUniformHelixGeneralCP3951Source(recipe));
}
/** Width-only preview retains the exact source snapshot; adoption clones it. */
export function prepareUniformHelixGeneralCP3951Preview(raw:unknown){
 const recipe=validateUniformHelixGeneralCP3951Recipe(raw),source=evaluateUniformHelixGeneralCP3951Source(recipe),freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};
 freeze(source);return {source,build:(nextRaw:unknown):Doc=>{const next=validateUniformHelixGeneralCP3951Recipe(nextRaw);
  for(const key of ['radius','helicityAngleDeg','foldAngleDeg','parameterStart','parameterEnd','segments'] as const)if(next[key]!==recipe[key])issue('SOURCE_INPUT','源参数或裁域已变化，须建立新的解析 snapshot。');
  return documentFromSource(next,source,true);}};
}
export function readUniformHelixGeneralCP3951Recipe(doc:Doc):UniformHelixGeneralCP3951Recipe|null{
 try{const raw=doc.metadata?.originalUniformHelixGeneral3951;if(!object(raw)||raw.schema!==SCHEMA)return null;return validateUniformHelixGeneralCP3951Recipe(raw.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path:string,worldBound:number):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  // Only this positive engineering estimate admits an eight-ULP replay;
  // exact u=0 has error zero. Policy limits, source inputs and indices stay exact.
  if(/^sourceFrames\.\d+\.worldErrorEstimateMm$/.test(path))return b===0?a===0:a>0&&b>0&&Math.abs(a-b)<=8*Math.max(ulp(a),ulp(b));
  if(/^sourceFrames\.\d+\.(basePrime|spatialBase)\.\d+$/.test(path))return Math.abs(a-b)<=16*Math.max(ulp(a),ulp(b));
  if(/^sourceFrames\.\d+\.(leftDirector|rightDirector|spatialLeftDirector|spatialRightDirector)\.\d+$/.test(path))return Math.abs(a-b)<=32*ulp(1);
  if(/^sourceFrames\.\d+\.base\.[01]$/.test(path))return Math.abs(a-b)<=Math.max(worldBound,16*ulp(a),16*ulp(b));
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=Math.max(worldBound,16*ulp(a),16*ulp(b));
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>same(a[i],x,`${path}.${i}`,worldBound));
 if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k,worldBound));
 return a===b;
}
/** Strict recipe/identity/policy; only known derived values admit ULP replay. */
export function uniformHelixGeneralCP3951SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readUniformHelixGeneralCP3951Recipe(doc),saved=doc.metadata?.originalUniformHelixGeneral3951;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=uniformHelixGeneralCP3951Document(recipe),own=expected.metadata!.originalUniformHelixGeneral3951 as any,bound=own.numericalPolicy.worldReplayULPBoundMm,
   actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||
   !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology',bound)||!same(actual.edgeSegmentIds,target.edgeSegmentIds,'',bound))return false;
  if(!same(actual.graph,target.graph,'materialTopology.graph',bound)||doc.segments.length!==expected.segments.length||new Set(doc.segments.map(s=>s.id)).size!==doc.segments.length)return false;
  // Geometry/proof metrics are replayed from the saved indexed binary64 graph,
  // not from this engine's independently rounded analytic frame coordinates.
  const count=recipe.segments+1,points=actual.graph.vertices_coords,
   actualProof=finitePartition([points.slice(0,count),points.slice(count,2*count),points.slice(2*count)],actual.graph.edges_vertices,actual.graph.faces_vertices!);
  if(!Array.isArray(saved.sourceFrames)||saved.sourceFrames.length!==count)return false;
  let actualResidual=0;
  for(const row of saved.sourceFrames)for(const key of ['leftDirector','rightDirector','spatialLeftDirector','spatialRightDirector']){
   const d=row?.[key],dimension=key.startsWith('spatial')?3:2;
   if(!Array.isArray(d)||d.length!==dimension||!d.every(finite))return false;
   actualResidual=Math.max(actualResidual,Math.abs(d.reduce((sum:number,x:number)=>sum+x*x,0)-1));
  }
  if(!finite(actualResidual)||actualResidual>64*EPS)return false;
  const replay={...own,finitePaperProof:actualProof,numericalPolicy:{...own.numericalPolicy,maximumUnitDirectorResidual:actualResidual}};
  if(!same(saved,replay,'',bound))return false;
  const near=(a:Point,b:Point)=>a.length===2&&a.every((x,i)=>finite(x)&&Math.abs(x-b[i])<=Math.max(bound,16*ulp(x),16*ulp(b[i])));
  for(const e of expected.segments){const a=doc.segments.find(s=>s.id===e.id);if(!a||a.assignment!==e.assignment||a.angle!==e.angle||!near(a.a,e.a)||!near(a.b,e.b))return false;}
  if(!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const pts=doc.segments.flatMap(s=>[s.a,s.b]),bbox={width:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),height:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>Math.max(bound,16*ulp(doc.paper[key]))||Math.abs(doc.paper[key]-bbox[key])>Math.max(bound,16*ulp(doc.paper[key])))return false;
  for(let i=0;i<own.sourceFrames.length;i++)if(own.sourceFrames[i].u===0){const row=saved.sourceFrames?.[i];
   if(JSON.stringify(row?.base)!=='[1,0]'||row?.basePrime?.[0]!==0||JSON.stringify(row?.spatialBase)!==JSON.stringify([recipe.radius,0,0])||JSON.stringify(actual.graph.vertices_coords[i])!=='[1,0]')return false;
   for(let e=0;e<target.graph.edges_vertices.length;e++){const edge=target.graph.edges_vertices[e],segment=doc.segments.find(s=>s.id===target.edgeSegmentIds[e])!;
    if(edge[0]===i&&JSON.stringify(segment.a)!=='[1,0]'||edge[1]===i&&JSON.stringify(segment.b)!=='[1,0]')return false;}
  }
  return true;
 }catch{return false;}
}
