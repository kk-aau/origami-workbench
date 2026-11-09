/** Original uniform literal outside its simplification branch and explicit odd-pi continuation. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
export type UniformHelixExtendedCP3951Recipe={radius:number;helicityAngleDeg:number;foldAngleDeg:number;parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const UNIFORM_HELIX_EXTENDED_CP_3951_EXAMPLE:UniformHelixExtendedCP3951Recipe={radius:1,helicityAngleDeg:30,foldAngleDeg:270,parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100};
export type UniformHelixExtendedCP3951ErrorCode='SOURCE_INPUT'|'NUMERIC_SOURCE'|'PAPER_DOMAIN'|'FINITE_GEOMETRY'|'MATERIAL_INTERFACE';
export class UniformHelixExtendedCP3951Error extends Error{constructor(public readonly code:UniformHelixExtendedCP3951ErrorCode,message:string){super(message);this.name='UniformHelixExtendedCP3951Error';}}
const issue=(c:UniformHelixExtendedCP3951ErrorCode,m:string):never=>{throw new UniformHelixExtendedCP3951Error(c,m);},fail:(m?:string)=>never=(m='原扩展源与实际有限纸图不一致。')=>issue('FINITE_GEOMETRY',m),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x),EPS=Number.EPSILON,SCHEMA='original-in3951-extended-uniform-helix-cp-v2';
const ulp=(x:number)=>x===0?Number.MIN_VALUE:Math.abs(x)<2**-1022?Number.MIN_VALUE:2**(Math.floor(Math.log2(Math.abs(x)))-52),sinc=(x:number)=>x===0?1:Math.sin(x)/x;
export function validateUniformHelixExtendedCP3951Recipe(raw:unknown):UniformHelixExtendedCP3951Recipe{
 if(!object(raw)||!keys(raw,Object.keys(UNIFORM_HELIX_EXTENDED_CP_3951_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))return issue('SOURCE_INPUT','须提供八个有限数值；没有未知字段、隐式默认或夹取。');const r=raw as UniformHelixExtendedCP3951Recipe;
 if(r.radius<=0||r.parameterStart>=r.parameterEnd)issue('SOURCE_INPUT','本正半径构造合同须r>0及递增有限原u域；未限制原θ/γ为保存例主区间。');
 if(r.leftWidth<=0||r.leftWidth>1||r.rightWidth<=0||r.rightWidth>1)issue('PAPER_DOMAIN','内切宽须为任意正数且不超过原单位宽1；没有自动内切或.05下限。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)issue('PAPER_DOMAIN','当前实际有限验证预算为整数16…128弦；不是原函数u定义域。');return clone(r);
}
/** Exact quarter identities only stabilize libm evaluation. Raw angles/constant gamma are retained. */
function degreeTrig(d:number,half=false){const unit=half?180:90,n=Math.round(d/unit),residualDegrees=d-n*unit,a=residualDegrees*(Math.PI/(half?360:180)),ss=residualDegrees===0?0:Math.sin(a),cc=residualDegrees===0?1:Math.cos(a),q=((n%4)+4)%4;
 const [s,c]=q===0?[ss,cc]:q===1?[cc,-ss]:q===2?[-ss,-cc]:[-cc,ss];return {s,c,residualDegrees,residualRadians:a,errorS:EPS*(4*Math.abs(a)+8*Math.abs(s)),errorC:EPS*(4*Math.abs(a)+8*Math.abs(c)),knownSineZero:residualDegrees===0&&q%2===0,knownCosineZero:residualDegrees===0&&q%2===1};}
export type UniformHelixExtendedCP3951Frame={u:number;phase:number;base:Point;basePrime:Point;canonicalPhaseTangent:Point;normalizedPrimeTangent:Point;leftDirector:Point;rightDirector:Point;spatialBase:[number,number,number];spatialPrime:[number,number,number];spatialLeftDirector:[number,number,number];spatialRightDirector:[number,number,number];phaseErrorEstimate:number;worldErrorEstimateMm:number;derivativeErrorEstimateMm:Point;directorErrorEstimate:number;spatialErrorEstimateMm:number};
export type UniformHelixExtendedCP3951Source={recipe:UniformHelixExtendedCP3951Recipe;frames:UniformHelixExtendedCP3951Frame[];classification:{status:string;originalPlaneLiteralDefined:boolean;originalSpatialLiteralDefined:boolean;originalDerivationAssumptionsSatisfied:boolean;explicitAnalyticContinuation:boolean;paperTransverseDegenerate:boolean};constants:{cosTheta:number;sinTheta:number;cosHalf:number;sinHalf:number;speed:number;angularRate:number;radialCoefficient:number;tangentialCoefficient:number;transverseSignedJacobian:number;faceOrientation:number;signedCircleRadiusRepresentedMm:number|null;circleCenterRepresentedMm:Point|null;leftFocalDistanceRepresentedMm:number|null;rightFocalDistanceRepresentedMm:number|null;focusPositiveSide:'left'|'right'|'none';focusOverflowsBinary64:boolean};numericalPolicy:{model:string;intervalCertified:false;libmAccuracyCertified:false;sourcePhaseStep:number;maximumPhaseErrorEstimate:number;maximumWorldErrorEstimateMm:number;maximumDirectorErrorEstimate:number;maximumSpatialReferenceErrorEstimateMm:number;worldReplayULPBoundMm:number;maximumUnitDirectorResidual:number;sourceInputParametersExact:true;sourceAnglesOrEndpointsChanged:false;quarterIdentityInternalOnly:true}};
export function evaluateUniformHelixExtendedCP3951Source(raw:unknown):UniformHelixExtendedCP3951Source{
 const recipe=validateUniformHelixExtendedCP3951Recipe(raw),theta=recipe.helicityAngleDeg*(Math.PI/180),h=recipe.foldAngleDeg*(Math.PI/360),L=recipe.parameterEnd-recipe.parameterStart,maxU=Math.max(Math.abs(recipe.parameterStart),Math.abs(recipe.parameterEnd));
 if(![theta,h,L].every(finite)||EPS*Math.max(Math.abs(theta),Math.abs(h),maxU)*8>1e-7)issue('NUMERIC_SOURCE','原输入不在当前角度/相位工程条件预算内；不是原numeric参数非法，没有改原角或端点。');
 const tc=degreeTrig(recipe.helicityAngleDeg),gc=degreeTrig(recipe.foldAngleDeg,true),c=tc.c,s=tc.s,ch=gc.c,sh=gc.s,D=gc.knownCosineZero?1:Math.hypot(s,c*sh);
 if(tc.knownCosineZero)issue('SOURCE_INPUT','原θ的Sec/Tan literal未定义；γ延续不能去掉θ奇点。');
 if(D===0)issue('SOURCE_INPUT','原单位母线radical为零，原2D/3D literal未定义；没有把γ0/2π塞成CP。');
 const V=recipe.radius/c,K=c*ch,A=c*sh/D,B=s/D,S=recipe.radius*(sh/D),orientation=Math.sign(S),limit=gc.knownCosineZero,degenerate=gc.knownSineZero,assumptions=recipe.foldAngleDeg>0&&c>0&&sh>0&&ch>0,R=limit?null:V/K,representedR=R!==null&&finite(R)?R:null,F=K===0||degenerate?null:Math.abs(S/K),focusSide=degenerate||K===0?'none':orientation*K>0?'left':'right',eD=Math.hypot(tc.errorS,Math.abs(sh)*tc.errorC+Math.abs(c)*gc.errorS)+EPS*D,eA=(Math.abs(sh)*tc.errorC+Math.abs(c)*gc.errorS+Math.abs(A)*eD)/D+8*EPS*Math.abs(A),eB=(tc.errorS+Math.abs(B)*eD)/D+8*EPS*Math.abs(B),eK=Math.abs(ch)*tc.errorC+Math.abs(c)*gc.errorC+8*EPS*Math.abs(K),eV=Math.abs(V)*(tc.errorC/Math.abs(c)+8*EPS),step=K*L/recipe.segments;
 if(![V,K,A,B,S,eA,eB,eK,eV,step].every(finite)||V===0)issue('NUMERIC_SOURCE','原source有定义，但速度/母线/工程预算当前double不可表示；R的机器溢出不单独判非法。');
 const frames:UniformHelixExtendedCP3951Frame[]=[];let maxPhase=0,maxWorld=0,maxDirector=0,maxSpace=0,maxNorm=0,scale=1;
 for(let i=0;i<=recipe.segments;i++){
  const u=i===recipe.segments?recipe.parameterEnd:recipe.parameterStart+L*i/recipe.segments;if(!finite(u)||i&&u<=frames[i-1].u)issue('NUMERIC_SOURCE','原u网格在double不能分离；没有补点或移动起终点。');
  const q=limit?0:K*u,co=Math.cos(q),si=q===0?0:Math.sin(q),hc=sinc(q/2),sc=sinc(q),xCoefficient=(u*(q/2))*hc*hc,yCoefficient=u*sc,dx=V*xCoefficient,by=V*yCoefficient,base:Point=u===0?[1,0]:[1-dx,by],basePrime:Point=[u===0||limit?0:-V*si,V*co],left:Point=[-A*co-B*si,-A*si+B*co],right:Point=[A*co-B*si,A*si+B*co],cu=Math.cos(u),su=u===0?0:Math.sin(u),T=[-c*su,c*cu,s],N=[-cu,-su,0],Z=[s*su,-s*cu,c],vz=V*s,
   spacePoint:[number,number,number]=u===0?[recipe.radius,0,0]:[recipe.radius*cu,recipe.radius*su,vz*u],spacePrime:[number,number,number]=[u===0?0:-recipe.radius*su,u===0?recipe.radius:recipe.radius*cu,vz],sl=limit?[0,0,1] as [number,number,number]:T.map((t,k)=>B*t+A*(ch*N[k]+sh*Z[k])) as [number,number,number],sr=limit?[0,0,1] as [number,number,number]:T.map((t,k)=>B*t-A*(ch*N[k]-sh*Z[k])) as [number,number,number],eq=limit?0:Math.abs(u)*eK+4*EPS*Math.abs(q)+Number.MIN_VALUE,
   phaseSensitivity=Math.abs(V)*Math.min(Math.abs(u),q===0?Math.abs(u):(1+2/Math.abs(q))/Math.abs(K)),ew=u===0?0:Math.abs(xCoefficient)*eV+Math.abs(yCoefficient)*eV+phaseSensitivity*eq+Math.abs(V)*(32*EPS*(Math.abs(xCoefficient)+Math.abs(yCoefficient))+Number.MIN_VALUE)+32*EPS*Math.max(1,Math.abs(dx),Math.abs(by)),ed=eA+eB+(Math.abs(A)+Math.abs(B))*(eq+EPS*(16+8*Math.abs(q)))+16*EPS,
   ep:Point=[u===0||limit?0:Math.abs(si)*eV+Math.abs(V)*(eq+EPS*(8*Math.abs(si)+4*Math.abs(q))+Number.MIN_VALUE),Math.abs(co)*eV+Math.abs(V)*(Math.abs(si)*eq+EPS*(8*Math.abs(co)+4*Math.abs(q)))],espace=recipe.radius*EPS*(16+8*Math.abs(u))+Math.abs(u)*(Math.abs(s)*eV+Math.abs(V)*tc.errorS)+16*EPS*Math.max(1,...spacePoint.map(Math.abs));
  if(![q,...base,...basePrime,...left,...right,...spacePoint,...spacePrime,...sl,...sr,eq,ew,ed,...ep,espace].every(finite))issue('NUMERIC_SOURCE','原世界帧或工程预算当前不可表示；没有缩放世界坐标。');
  for(const d of [left,right,sl,sr])maxNorm=Math.max(maxNorm,Math.abs(d.reduce((sum,x)=>sum+x*x,0)-1));maxPhase=Math.max(maxPhase,eq);maxWorld=Math.max(maxWorld,ew);maxDirector=Math.max(maxDirector,ed);maxSpace=Math.max(maxSpace,espace);scale=Math.max(scale,...base.map(Math.abs),Math.abs(dx),Math.abs(by));
  frames.push({u,phase:q,base,basePrime,canonicalPhaseTangent:[-si,co],normalizedPrimeTangent:[-Math.sign(V)*si,Math.sign(V)*co],leftDirector:left,rightDirector:right,spatialBase:spacePoint,spatialPrime:spacePrime,spatialLeftDirector:sl,spatialRightDirector:sr,phaseErrorEstimate:eq,worldErrorEstimateMm:ew,derivativeErrorEstimateMm:ep,directorErrorEstimate:ed,spatialErrorEstimateMm:espace});
 }
 if(maxPhase>(K===0?1e-7:Math.min(1e-7,Math.abs(step)/16))||maxWorld>scale*1e-7||maxDirector>1e-7||maxNorm>128*EPS)issue('NUMERIC_SOURCE','原source仍可定义，但当前相位/世界坐标/母线工程误差超预算；未把它当作原输入非法。');
 return {recipe,frames,classification:{status:limit?'explicit-analytic-continuation-original-plane-literal-undefined':degenerate?'original-literal-defined-paper-degenerate':assumptions?'original-literal-defined-under-assumptions':'original-literal-defined-outside-assumptions',originalPlaneLiteralDefined:!limit,originalSpatialLiteralDefined:true,originalDerivationAssumptionsSatisfied:assumptions,explicitAnalyticContinuation:limit,paperTransverseDegenerate:degenerate},constants:{cosTheta:c,sinTheta:s,cosHalf:ch,sinHalf:sh,speed:V,angularRate:K,radialCoefficient:A,tangentialCoefficient:B,transverseSignedJacobian:S,faceOrientation:orientation,signedCircleRadiusRepresentedMm:representedR,circleCenterRepresentedMm:representedR===null?null:[1-representedR,0],leftFocalDistanceRepresentedMm:focusSide==='left'&&F!==null&&finite(F)?F:null,rightFocalDistanceRepresentedMm:focusSide==='right'&&F!==null&&finite(F)?F:null,focusPositiveSide:focusSide,focusOverflowsBinary64:F!==null&&!finite(F)},numericalPolicy:{model:'signed quarter identities/sinc equivalent real source; component IEEE/angle/libm engineering estimates, not a certificate',intervalCertified:false,libmAccuracyCertified:false,sourcePhaseStep:step,maximumPhaseErrorEstimate:maxPhase,maximumWorldErrorEstimateMm:maxWorld,maximumDirectorErrorEstimate:maxDirector,maximumSpatialReferenceErrorEstimateMm:maxSpace,worldReplayULPBoundMm:32*ulp(scale+1),maximumUnitDirectorResidual:maxNorm,sourceInputParametersExact:true,sourceAnglesOrEndpointsChanged:false,quarterIdentityInternalOnly:true}};
}

function finitePartition(curves:Point[][],edges:[number,number][],faces:number[][],orientation=1){
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
 for(let i=0;i<n;i++)for(let cell of [[i,i+1,s+i+1,s+i],[i+1,i,2*s+i,2*s+i+1]]){
  cell=orientation>0?cell:cell.slice().reverse();const [a,b,c,d]=cell,area=cross(a,b,c)+cross(a,c,d);
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
function materialGraph(curves:Point[][],orientation:number){
 const n=curves[0].length-1,s=n+1,vertices_coords=curves.flat().map(clone),edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const add=(a:number,b:number,k:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='U'?null:0);ids.push(id);};
 for(let i=0;i<n;i++){add(i,i+1,'U',`uniform-extended-crease-${i}`);add(s+i,s+i+1,'B',`uniform-extended-left-${i}`);add(2*s+i,2*s+i+1,'B',`uniform-extended-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`uniform-extended-cap-left-${i}`);add(i,2*s+i,'B',`uniform-extended-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=(orientation<0?faces_vertices.map(f=>f.reverse()):faces_vertices).map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices,orientation);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}



function documentFromSource(recipe:UniformHelixExtendedCP3951Recipe,source:UniformHelixExtendedCP3951Source,shared=false):Doc{
 const {speed:V,angularRate:K,transverseSignedJacobian:S,faceOrientation:orientation}=source.constants,L=recipe.parameterEnd-recipe.parameterStart,margin=128*EPS*Math.max(1,Math.abs(S),Math.abs(K)),jl=orientation*(S-recipe.leftWidth*K),jr=orientation*(-S-recipe.rightWidth*K);
 if(source.classification.paperTransverseDegenerate)issue('PAPER_DOMAIN','原literal源可以定义，但半角正弦为零、左右同母线，横向纸域退化；仅保源，不能采用两面CP。');
 if(jl<=margin||jr>=-margin)issue('PAPER_DOMAIN',`${jl<=margin?'左':'右'}宽抵达对应有符号原焦点或数值余量；未自动内切。`);
 if(K!==0&&Math.abs(K)*L>=2*Math.PI-128*EPS)issue('PAPER_DOMAIN','原source允许此u域，但当前带符号圆形纸域绕多圈或不能分离完整一圈，未证明一次覆盖；不把原函数u域裁成保存例。');
 const rows=source.frames,curves=[rows.map(f=>clone(f.base)),rows.map(f=>[f.base[0]+recipe.leftWidth*f.leftDirector[0],f.base[1]+recipe.leftWidth*f.leftDirector[1]] as Point),rows.map(f=>[f.base[0]+recipe.rightWidth*f.rightDirector[0],f.base[1]+recipe.rightWidth*f.rightDirector[1]] as Point)],{graph,ids,proof}=materialGraph(curves,orientation),pts=graph.vertices_coords,
  doc:Doc={schemaVersion:2,name:'原均匀螺旋 · literal扩展与π解析延续CP',paper:{width:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),height:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(pts[a]),b:clone(pts[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 if(pts.some(p=>p.some(x=>Math.abs(x)>1e6)))issue('MATERIAL_INTERFACE','原source及实际有限图已计算；现核心绝对mm坐标≤10⁶，不支持此域，未缩放或移点。');
 let material;try{material=createMaterialTopology(doc,graph,ids);}catch(e){issue('MATERIAL_INTERFACE',`实际有限图已验证，但现材料epsilon/表示能力不足：${(e as Error).message}`);}
 const {maximumUnitDirectorResidual:_,...policy}=source.numericalPolicy;
 const delta=L/recipe.segments,M=recipe.radius*Math.abs(source.constants.cosHalf),chord=(w:number)=>M===0&&K===0?0:Math.max(Number.MIN_VALUE,((M*delta/8)*delta+(w*K*K*delta/8)*delta)*(1+32*EPS));
 doc.metadata={materialTopology:material,originalUniformHelixExtended3951:{schema:SCHEMA,recipe,classification:clone(source.classification),source:{definitionCells:['In[3945]','In[3951]','In[3952]'],originalFunctions:['CurvedFoldUniformHelix3D','CurvedFoldUniformHelix2D'],rawParameters:[recipe.radius,recipe.helicityAngleDeg,recipe.foldAngleDeg],parameterIsOriginalU:true,parameterIsArcLength:false,currentStartReseeded:false,sourceInitialParameter:0,initialPoint:[1,0],literalDerivativeAtZero:[0,V],originalDerivationInitialUnitTangent:[0,1],coordinateTransform:'identity',coordinateUnit:'mm',originalWorldUnit:'unspecified',unitConvention:'1 original world unit = 1 mm',originalGraphicsWidths:[1,1],unitWidthsIndependentOfRadius:true,originalCurveDivisions:100,foldStyle:'FoldedLine',rulingStyles:['UnfoldedLine','UnfoldedLine'],originalMVSpecified:false,gammaRawDegrees:recipe.foldAngleDeg,gammaConstantRadians:recipe.foldAngleDeg*(Math.PI/180),rawAnglesPreserved:true,inputAnglesOrEndpointsMoved:false,originalPlanarLiteralAtOddPiDefined:false,explicitContinuationRole:source.classification.explicitAnalyticContinuation?'new removable analytic extension of original plane literal':'none',wolframExecuted:false,originalNCInterpolationReproduced:false,finiteSpatialFramesProduced:false},sourceFrames:shared?rows:clone(rows),sourceConstants:clone(source.constants),numericalPolicy:clone(policy),actualSourceUnitResidual:source.numericalPolicy.maximumUnitDirectorResidual,
  paperDomain:{widths:[recipe.leftWidth,recipe.rightWidth],parameterRange:[recipe.parameterStart,recipe.parameterEnd],leftSignedJacobianLower:Math.min(Math.abs(S),jl),rightSignedJacobianUpper:Math.max(-Math.abs(S),jr),signedOrientation:orientation,completeIdealSourceGlobalEmbeddingCondition:K===0?'invertible affine half-plane maps':'strict single angular turn plus radial monotonicity and side separation',idealMathematicalTheoremProved:true,floatingSourceErrorIntervalCertified:false,actualFiniteTwoFaceCoverVerified:true,faceWindingReversedOnly:orientation<0,originalDirectorsReversed:false,originalLeftRightSwapped:false,sourceCoordinatesUnaltered:true,coreAbsoluteCoordinateLimitMm:1e6},
  sampling:{segments:recipe.segments,method:'absolute-zero-phase stable analytic source / original-u finite chords',uniformOriginalUNodes:true,chordErrorBoundRole:'ideal continuous source formula, engineering floating evaluation; excludes source/Wolfram error',chordFormula:'(r*abs(cos(gamma/2))+width*K^2)*deltaU^2/8',chordEvaluationUnderflowProtected:true,chordEvaluationIntervalCertified:false,idealCreaseChordBoundMm:chord(0),idealLeftBoundaryChordBoundMm:chord(recipe.leftWidth),idealRightBoundaryChordBoundMm:chord(recipe.rightWidth)},finitePaperProof:proof,topology:{vertices:pts.length,edges:ids.length,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,edgeSegmentIds:ids,interiorRulingSeams:0,coordinateWelding:false},evidence:{CPOnly:true,finiteRigid3D:false,FF:false,layers:false,collisionCertified:false,sourceSpaceReferencesAreFoldedMaterialVertices:false,originalLiteralBranchesComplete:false,allSymbolicWolframInputsSupported:false}}};return doc;
}
export function uniformHelixExtendedCP3951Document(raw:unknown):Doc{const recipe=validateUniformHelixExtendedCP3951Recipe(raw);return documentFromSource(recipe,evaluateUniformHelixExtendedCP3951Source(recipe));}
export function readUniformHelixExtendedCP3951Recipe(doc:Doc):UniformHelixExtendedCP3951Recipe|null{try{const s=doc.metadata?.originalUniformHelixExtended3951;if(!object(s)||s.schema!==SCHEMA)return null;return validateUniformHelixExtendedCP3951Recipe(s.recipe);}catch{return null;}}
export function prepareUniformHelixExtendedCP3951Preview(raw:unknown){const recipe=validateUniformHelixExtendedCP3951Recipe(raw),source=evaluateUniformHelixExtendedCP3951Source(recipe),freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(source);return {source,build:(nextRaw:unknown)=>{const next=validateUniformHelixExtendedCP3951Recipe(nextRaw);for(const k of ['radius','helicityAngleDeg','foldAngleDeg','parameterStart','parameterEnd','segments'] as const)if(next[k]!==recipe[k])issue('SOURCE_INPUT','源参数或绝对裁域已变化，须重新求源；仅宽度缓存未替换原帧。');return documentFromSource(next,source,true);}};}
function same(a:any,b:any,path:string,bound:number,rows:UniformHelixExtendedCP3951Frame[]):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;const m=/^sourceFrames\.(\d+)\.(\w+)(?:\.(\d+))?$/.exec(path);
  if(m){const f=rows[Number(m[1])],key=m[2],component=Number(m[3]);if(key==='u')return a===b;let budget=0;if(key==='phase')budget=2*f.phaseErrorEstimate;if(key==='base')budget=Math.max(bound,2*f.worldErrorEstimateMm);if(key==='basePrime')budget=2*f.derivativeErrorEstimateMm[component];if(/Director|Tangent/.test(key))budget=Math.max(32*ulp(1),2*f.directorErrorEstimate);if(key==='spatialBase')budget=2*f.spatialErrorEstimateMm;if(key==='spatialPrime')budget=Math.max(32*ulp(a),32*ulp(b));if(/ErrorEstimate/.test(key))return a>=0&&b>=0&&Math.abs(a-b)<=64*Math.max(ulp(a),ulp(b));return Math.abs(a-b)<=Math.max(budget,16*ulp(a),16*ulp(b));}
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=Math.max(bound,16*ulp(a),16*ulp(b));
  if(path==='sourceConstants.faceOrientation')return a===b;
  if(/^sourceConstants\./.test(path)||path==='source.literalDerivativeAtZero.1'||/^paperDomain\.(leftSignedJacobianLower|rightSignedJacobianUpper)$/.test(path)||/^sampling\.ideal\w+ChordBoundMm$/.test(path))return Math.abs(a-b)<=32*Math.max(ulp(a),ulp(b));
  if(/^numericalPolicy\.(sourcePhaseStep|maximumPhaseErrorEstimate|maximumWorldErrorEstimateMm|maximumDirectorErrorEstimate|maximumSpatialReferenceErrorEstimateMm|worldReplayULPBoundMm)$/.test(path))return a>=0&&b>=0?Math.abs(a-b)<=64*Math.max(ulp(a),ulp(b)):path.endsWith('sourcePhaseStep')&&Math.abs(a-b)<=64*Math.max(ulp(a),ulp(b));return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i],path+'.'+i,bound,rows));if(object(a)||object(b)){if(!object(a)||!object(b)||!keys(a,Object.keys(b)))return false;return Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k,bound,rows));}return a===b;
}
export function uniformHelixExtendedCP3951SourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const recipe=readUniformHelixExtendedCP3951Recipe(doc),saved=doc.metadata?.originalUniformHelixExtended3951;if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=uniformHelixExtendedCP3951Document(recipe),own=expected.metadata!.originalUniformHelixExtended3951 as any,a=inspectMaterialTopology(doc),b=inspectMaterialTopology(expected);if(!a.ok||!b.ok||a.foldedVertices||a.startingFace!==undefined)return false;
  if(!object(saved.source)||!object(saved.sourceConstants)||!finite(saved.sourceConstants.speed)||saved.sourceConstants.speed===0||JSON.stringify(saved.source.literalDerivativeAtZero)!==JSON.stringify([0,saved.sourceConstants.speed]))return false;
  const thetaQuarter=recipe.helicityAngleDeg-Math.round(recipe.helicityAngleDeg/90)*90===0,halfQuarter=recipe.foldAngleDeg-Math.round(recipe.foldAngleDeg/180)*180===0;
  if(thetaQuarter&&(saved.sourceConstants.sinTheta!==own.sourceConstants.sinTheta||saved.sourceConstants.cosTheta!==own.sourceConstants.cosTheta)||halfQuarter&&(saved.sourceConstants.sinHalf!==own.sourceConstants.sinHalf||saved.sourceConstants.cosHalf!==own.sourceConstants.cosHalf)||own.classification.explicitAnalyticContinuation&&saved.sourceConstants.angularRate!==0)return false;
  const n=recipe.segments+1,curves=[0,1,2].map(i=>a.graph.vertices_coords.slice(i*n,(i+1)*n)),proof=finitePartition(curves,a.graph.edges_vertices,a.graph.faces_vertices!,own.sourceConstants.faceOrientation);if(JSON.stringify(proof)!==JSON.stringify(saved.finitePaperProof))return false;
  let norm=0;for(const f of saved.sourceFrames??[])for(const key of ['leftDirector','rightDirector','spatialLeftDirector','spatialRightDirector']){const d=f[key];if(!Array.isArray(d)||!d.every(finite))return false;norm=Math.max(norm,Math.abs(d.reduce((s:number,x:number)=>s+x*x,0)-1));}if(norm!==saved.actualSourceUnitResidual||norm>128*EPS)return false;
  const normalized=clone(saved);normalized.finitePaperProof=own.finitePaperProof;normalized.actualSourceUnitResidual=own.actualSourceUnitResidual;const bound=Math.max(own.numericalPolicy.worldReplayULPBoundMm,...own.sourceFrames.map((f:UniformHelixExtendedCP3951Frame)=>2*f.worldErrorEstimateMm)),rows=own.sourceFrames;
  if(!same(normalized,own,'',bound,rows)||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology',bound,rows)||!same(a.graph,b.graph,'materialTopology.graph',bound,rows)||JSON.stringify(a.edgeSegmentIds)!==JSON.stringify(b.edgeSegmentIds)||doc.segments.length!==expected.segments.length||new Set(doc.segments.map(s=>s.id)).size!==doc.segments.length)return false;
  const near=(p:Point,q:Point)=>p.length===2&&p.every((x,i)=>finite(x)&&Math.abs(x-q[i])<=Math.max(bound,16*ulp(x),16*ulp(q[i])));for(const e of expected.segments){const s=doc.segments.find(s=>s.id===e.id);if(!s||s.assignment!==e.assignment||s.angle!==e.angle||!near(s.a,e.a)||!near(s.b,e.b))return false;}
  for(let i=0;i<rows.length;i++){
   const f=saved.sourceFrames[i],expectedFrame=rows[i];if(expectedFrame.u===0||own.classification.explicitAnalyticContinuation){const savedSpeed=saved.sourceConstants.speed;if(!finite(savedSpeed)||savedSpeed===0||JSON.stringify(f.canonicalPhaseTangent)!=='[0,1]'||JSON.stringify(f.normalizedPrimeTangent)!==JSON.stringify([0,Math.sign(savedSpeed)])||f.basePrime[0]!==0||f.basePrime[1]!==savedSpeed)return false;}
   if(expectedFrame.u===0){if(JSON.stringify(f.base)!=='[1,0]'||f.phase!==0||f.basePrime[0]!==0||JSON.stringify(f.spatialBase)!==JSON.stringify([recipe.radius,0,0])||f.spatialPrime[0]!==0||f.spatialPrime[1]!==recipe.radius||JSON.stringify(a.graph.vertices_coords[i])!=='[1,0]')return false;for(let e=0;e<a.graph.edges_vertices.length;e++){const [x,y]=a.graph.edges_vertices[e],s=doc.segments.find(s=>s.id===a.edgeSegmentIds[e])!;if(x===i&&JSON.stringify(s.a)!=='[1,0]'||y===i&&JSON.stringify(s.b)!=='[1,0]')return false;}}
   if(own.classification.explicitAnalyticContinuation&&(f.phase!==0||f.base[0]!==1||f.basePrime[0]!==0||a.graph.vertices_coords[i][0]!==1||JSON.stringify(f.spatialLeftDirector)!=='[0,0,1]'||JSON.stringify(f.spatialRightDirector)!=='[0,0,1]'))return false;
  }
  if(!object(doc.paper)||!keys(doc.paper,['width','height']))return false;const pts=doc.segments.flatMap(s=>[s.a,s.b]),box={width:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),height:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))};return (['width','height'] as const).every(k=>finite(doc.paper[k])&&doc.paper[k]>0&&Math.abs(doc.paper[k]-box[k])<=bound&&Math.abs(doc.paper[k]-expected.paper[k])<=bound);
 }catch{return false;}
}
