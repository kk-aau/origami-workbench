/** In[4039] literal machine-angle four-mirror cone; original source apex or explicit local cut. */
import {fetchNativePlanarSequenceWhenIdle,makeNativePlanarSequenceReference,parseNativePlanarSequenceResult,
 type NativePlanarSequenceQuery,type NativePlanarSequenceResult} from './curvedNativePlanarSequence';
import {flatPoint} from './curvedPlanarReflectionSequence';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Assignment,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {distance,polygonArea} from '../core/geometry';

export type ConeFourPlaneCP4039Recipe={parameterStart:number;parameterEnd:number;innerRadius:number;segments:number;
 assignmentMode:'original-styles'|'unassigned';paperBoundaryMode:'original-apex'|'local-cut'};
type LegacyRecipe=Omit<ConeFourPlaneCP4039Recipe,'paperBoundaryMode'>;
export const CONE_FOUR_PLANE_CP_4039_EXAMPLE:ConeFourPlaneCP4039Recipe={parameterStart:0,parameterEnd:Math.PI,innerRadius:0,segments:100,assignmentMode:'original-styles',paperBoundaryMode:'original-apex'};
const SCHEMA='original-in4039-bounded-cone-cp-v2',LEGACY_SCHEMA='original-in4039-local-bounded-cone-cp-v1',BOUND=1e-13,PROOF_MARGIN=1e-10,
 SIN_THETA=Math.sin(Math.PI/6),COS_THETA=Math.cos(Math.PI/6),OUTER=4/COS_THETA;
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原 In[4039] 输入、原阶段、局部截顶纸域、赋型或实际材料不一致。'):never{throw Error(message);}
export function validateConeFourPlaneCP4039Recipe(raw:unknown):ConeFourPlaneCP4039Recipe{
 if(!object(raw)||!keys(raw,Object.keys(CONE_FOUR_PLANE_CP_4039_EXAMPLE))||
  ['parameterStart','parameterEnd','innerRadius','segments'].some(k=>!finite(raw[k]))||!['original-styles','unassigned'].includes(raw.assignmentMode as string)||
  !['original-apex','local-cut'].includes(raw.paperBoundaryMode as string))
  fail('请填写完整原角区间、纸域边界、内半径、弦段数及有限弦段赋型。');
 const r=raw as ConeFourPlaneCP4039Recipe;
 if(r.parameterStart<0||r.parameterEnd>Math.PI||r.parameterEnd-r.parameterStart<.1)fail('u 须在原 [0,π] 内，跨度至少 0.1 rad。');
 if(r.paperBoundaryMode==='original-apex'?r.innerRadius!==0:r.innerRadius<.05||r.innerRadius>1)
  fail('原锥顶纸域的内半径须为0；局部截顶内半径须为 0.05…1 mm。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('本地有限弦段数须为 16…128；原绘图密度默认100。');
 return {...r};
}
function legacyRecipe(value:unknown):ConeFourPlaneCP4039Recipe{
 if(!object(value)||!keys(value,['parameterStart','parameterEnd','innerRadius','segments','assignmentMode']))fail('旧v1须为完整五键截顶配方。');
 return validateConeFourPlaneCP4039Recipe({...value,paperBoundaryMode:'local-cut'});
}
function withoutBoundaryMode(r:ConeFourPlaneCP4039Recipe):LegacyRecipe{const {paperBoundaryMode:_,...rest}=r;return rest;}
export function coneFourPlaneCP4039Query(value:unknown):NativePlanarSequenceQuery{
 const r=validateConeFourPlaneCP4039Recipe(value),s=Math.sin(Math.PI/18),c=Math.cos(Math.PI/18);
 return {family:'planar-sequence-native',baseCurve:['0','0','0'],director:['sin(pi/6)*cos(s)','sin(pi/6)*sin(s)','cos(pi/6)'],
  mirrors:[{point:[0,0,1],normal:[0,0,1]},{point:[0,0,2],normal:[0,-s,c]},
   {point:[0,0,3],normal:[s,0,c]},{point:[0,0,4],normal:[0,0,1]}],composeReflections:true,
  parameterStart:r.parameterStart,parameterEnd:r.parameterEnd,transverseStart:0,transverseEnd:OUTER,segments:r.segments,rulingSegments:2};
}
/** Display reference only; source-qualified adoption requires the actual native sequence. */
export function coneFourPlaneCP4039Preview(value:unknown){
 const r=validateConeFourPlaneCP4039Recipe(value),h=SIN_THETA*Math.tan(Math.PI/18),
  parameters=Array.from({length:r.segments+1},(_,i)=>i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments),
  curves=Array.from({length:5},(_,c)=>parameters.map(u=>flatPoint('cone-symbolic',u,c===0?r.innerRadius:c===1?1/COS_THETA:
   c===2?2/(COS_THETA-h*Math.sin(u)):c===3?3/(COS_THETA+h*Math.cos(u)):OUTER)));
 return {recipe:r,curves};
}
/* Exact rational algebra of the binary64 input constants, with no unit-normal shortcut.
   Compose=True transforms the pending P/N before reflecting the next stage. */
type Q={n:bigint;d:bigint};type QV=[Q,Q,Q];type QM=[QV,QV,QV];
const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a||1n;};
const q=(n:bigint,d=1n):Q=>{if(d===0n)fail();if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};};
const qa=(a:Q,b:Q)=>q(a.n*b.d+b.n*a.d,a.d*b.d),qn=(a:Q)=>q(-a.n,a.d),qs=(a:Q,b:Q)=>qa(a,qn(b)),
 qm=(a:Q,b:Q)=>q(a.n*b.n,a.d*b.d),qd=(a:Q,b:Q)=>q(a.n*b.d,a.d*b.n),qabs=(a:Q)=>q(a.n<0n?-a.n:a.n,a.d),
 qc=(a:Q,b:Q)=>a.n*b.d-b.n*a.d;
function fromNumber(x:number):Q{
 if(!finite(x))fail();if(x===0)return q(0n);const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),
  exponent=Number((bits>>52n)&2047n),mantissa=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),power=(exponent?exponent-1023:-1022)-52,
  signed=bits>>63n?-mantissa:mantissa;return power>=0?q(signed<<BigInt(power)):q(signed,1n<<BigInt(-power));
}
function numberOf(a:Q):number{
 if(!a.n)return 0;const sign=a.n<0n?-1:1,n=a.n<0n?-a.n:a.n,shift=Math.max(0,Math.max(n.toString(2).length,a.d.toString(2).length)-1000);
 return sign*Number(n>>BigInt(shift))/Number(a.d>>BigInt(shift));
}
const zero=()=>q(0n),vector=(xs:number[])=>xs.map(fromNumber) as QV,
 dot=(a:QV,b:QV)=>a.reduce((v,x,i)=>qa(v,qm(x,b[i])),zero()),
 reflectVector=(a:QV,n:QV)=>{const twice=qm(q(2n),dot(a,n));return a.map((x,i)=>qs(x,qm(twice,n[i]))) as QV;},
 reflectPoint=(a:QV,p:QV,n:QV)=>{const twice=qm(q(2n),dot(a.map((x,i)=>qs(x,p[i])) as QV,n));return a.map((x,i)=>qs(x,qm(twice,n[i]))) as QV;},
 serial=(a:Q)=>a.n.toString()+'/'+a.d.toString();
function literalBounds(query:NativePlanarSequenceQuery){
 let pending=query.mirrors.map(m=>({p:vector(m.point),n:vector(m.normal)})),b=vector([0,0,0]),
  matrix:QM=[vector([1,0,0]),vector([0,1,0]),vector([0,0,1])];
 const rows:{numerator:Q;a:Q;b:Q;c:Q;lower:Q;upper:Q;second:number}[]=[];
 while(pending.length){
  const mirror=pending.shift()!,numerator=dot(mirror.p.map((x,i)=>qs(x,b[i])) as QV,mirror.n),
   coefficients=[0,1,2].map(k=>dot(matrix.map(row=>row[k]) as QV,mirror.n)),
   a=qm(coefficients[0],fromNumber(SIN_THETA)),bb=qm(coefficients[1],fromNumber(SIN_THETA)),c=qm(coefficients[2],fromNumber(COS_THETA)),
   dlo=qa(qs(c,qabs(a)),bb.n<0n?bb:zero()),dhi=qa(qa(c,qabs(a)),bb.n>0n?bb:zero()),h=qa(qabs(a),qabs(bb)),allLow=qs(c,h);
  if(numerator.n<=0n||dlo.n<=0n||allLow.n<=0n)fail('原机器输入的四阶段有全域奇点。');
  const lower=qd(numerator,dhi),upper=qd(numerator,dlo),rmax=numberOf(qd(numerator,allLow)),
   first=numberOf(qd(qm(numerator,h),qm(allLow,allLow))),
   secondRadius=numberOf(qm(numerator,qa(qd(qm(q(2n),qm(h,h)),qm(qm(allLow,allLow),allLow)),qd(h,qm(allLow,allLow))))),
   second=secondRadius+2*SIN_THETA*first+SIN_THETA*SIN_THETA*rmax+PROOF_MARGIN;
  if(!finite(second)||second<=0)fail();rows.push({numerator,a,b:bb,c,lower,upper,second});
  b=reflectPoint(b,mirror.p,mirror.n);
  matrix=[0,1,2].map(k=>reflectVector(matrix.map(row=>row[k]) as QV,mirror.n)).reduce((m,column,k)=>{
   column.forEach((x,i)=>m[i][k]=x);return m;},[vector([0,0,0]),vector([0,0,0]),vector([0,0,0])] as QM);
  pending=pending.map(m=>({p:reflectPoint(m.p,mirror.p,mirror.n),n:reflectVector(m.n,mirror.n)}));
 }
 const gaps=[qs(rows[0].lower,fromNumber(1)),...rows.slice(1).map((row,i)=>qs(row.lower,rows[i].upper))],safe=[.14,1.1,.5,.7];
 if(gaps.some((g,i)=>qc(g,fromNumber(safe[i]))<=0n))fail('原四切距未满足全域严格次序。');
 return {rows,safe,coefficients:rows.map(r=>({numerator:serial(r.numerator),cosCoefficient:serial(r.a),sinCoefficient:serial(r.b),constant:serial(r.c)}))};
}
function verifiedNative(value:unknown,r:ConeFourPlaneCP4039Recipe){
 const query=coneFourPlaneCP4039Query(r),native=parseNativePlanarSequenceResult(value,query),ref=makeNativePlanarSequenceReference(query),proof=literalBounds(query);
 if(!native.domain.certified||!native.certification.sourceDomainCertified||!native.certification.mirrorNormalsCompatible||
  !native.certification.conditionalReflectionIsometryCertified||!native.certification.finiteMetricVerified||native.normalization.origin.some(x=>x!==0))fail('完整原序列的原输入与域尚未通过。');
 for(const name of ['maximumRelativeMetricDifference','maximumNormalizedMirrorPlaneResidual','maximumMirrorNormalSquaredLengthError'] as const){
  const error=native.diagnostics[name];if(!finite(error)||error<0||error>BOUND)fail('原数值诊断的绝对误差须非负且不超过固定10⁻¹³。');
 }
 // The unchanged native certifier visits one complete binary subdivision tree.
 // These endpoints and partition identities are inputs, not approximate geometry.
 const cells=native.domain.cells;
 if(!cells.length||cells[0].start!==r.parameterStart||cells.at(-1)!.end!==r.parameterEnd||
  cells.some((cell,i)=>i>0&&cell.start!==cells[i-1].end)||native.domain.evaluations!==2*cells.length-1)
  fail('原域证明须精确覆盖输入首尾、无间隙或重叠，并保持实际二分树计数。');
 let maximumLiteralResidual=0;
 const check=(actual:number,expected:number)=>{if(!finite(actual)||!finite(expected))fail();const error=Math.abs(actual-expected);
  maximumLiteralResidual=Math.max(maximumLiteralResidual,error);if(error>BOUND)fail('原机器输入与派生数值超出固定10⁻¹³源单位舍入界。');};
 check(native.normalization.scale,ref.scale);
 native.effectiveMirrors.forEach((m,i)=>{for(let axis=0;axis<3;axis++){
  check(m.normal[axis],ref.mirrors[i].normal[axis]);check(m.normalizedPoint[axis],ref.mirrors[i].point[axis]);
  check(m.point[axis],ref.mirrors[i].point[axis]*ref.scale+ref.origin[axis]);}});
 const curves:Point[][]=[[],[],[],[],[]];
 native.sample.rows.forEach((row,i)=>{
  const expectedU=i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments;
  check(row.s,expectedU);if(i===0&&row.s!==r.parameterStart||i===r.segments&&row.s!==r.parameterEnd)fail('原采样端点须保输入原值。');
  const initial=row.stages[0];if(initial.parameter!==0||initial.parameterDerivative!==0||
   [initial.base,initial.fold,initial.baseDerivative,initial.foldDerivative,initial.normalizedBase,initial.normalizedFold,
    initial.normalizedBaseDerivative,initial.normalizedFoldDerivative].some(p=>p.some(x=>x!==0))||
   initial.directorDerivative[2]!==0||initial.normalizedDirectorDerivative[2]!==0)fail('原零B/B条目和恒定z导数须严格保留。');
  const reference=ref.evaluate(row.s);check(native.grid[i].s,row.s);
  row.stages.forEach((stage,j)=>{
   const target=reference.stages[j];check(stage.parameter,target.parameter.c[0]);check(stage.parameterDerivative,target.parameter.c[1]);
   for(const name of ['base','fold','director'] as const){const suffix=name[0].toUpperCase()+name.slice(1),jets=target[name];
    for(let axis=0;axis<3;axis++){
     check(stage['normalized'+suffix as 'normalizedBase'][axis],jets[axis].c[0]);
     check(stage['normalized'+suffix+'Derivative' as 'normalizedBaseDerivative'][axis],jets[axis].c[1]);
     check(stage[name][axis],jets[axis].c[0]*ref.scale);check(stage[name+'Derivative' as 'baseDerivative'][axis],jets[axis].c[1]*ref.scale);
    }
   }
   const grid=native.grid[i].stages[j];for(let k=0;k<3;k++){
    const w=OUTER*k/2,d=target.director.map(x=>x.c[0]),du=target.base.map((x,axis)=>x.c[1]+w*target.director[axis].c[1]),
     efg=[du.reduce((v,x)=>v+x*x,0),du.reduce((v,x,axis)=>v+x*d[axis],0),d.reduce((v,x)=>v+x*x,0)];
    for(let axis=0;axis<3;axis++){const point=target.base[axis].c[0]+w*target.director[axis].c[0];
     check(grid.normalizedPoints[k][axis],point);check(grid.points[k][axis],point*ref.scale);check(grid.EFG[k][axis],efg[axis]*ref.scale*ref.scale);}
   }
  });
  const cuts=[r.innerRadius,...row.stages.slice(1).map(s=>s.parameter)];
  proof.rows.forEach((p,j)=>{const den=numberOf(p.a)*Math.cos(row.s)+numberOf(p.b)*Math.sin(row.s)+numberOf(p.c);
   check(cuts[j+1],numberOf(p.numerator)/den);if(cuts[j+1]<numberOf(p.lower)-BOUND||cuts[j+1]>numberOf(p.upper)+BOUND)fail('原实际切距超出全域证明。');});
  const gaps=r.paperBoundaryMode==='original-apex'?[1.1,...proof.safe.slice(1)]:proof.safe;
  if(cuts.some((v,j)=>j>0&&v-cuts[j-1]<gaps[j-1]-BOUND))fail('实际有限切距次序不成立。');
  cuts.forEach((v,c)=>curves[c].push(flatPoint('cone-symbolic',row.s,v)));
 });
 return {native,curves,proof,maximumLiteralResidual};
}
function materialGraph(curves:Point[][],mode:ConeFourPlaneCP4039Recipe['assignmentMode'],apex=false){
 if(apex&&curves[0].some(p=>p.some(x=>x!==0)))fail('原stage0的全部像须严格为同一个源锥顶，不作坐标吸附。');
 const s=curves[0].length,n=s-1,vertices_coords=apex?[([0,0] as Point),...curves.slice(1).flat().map(clone)]:curves.flat().map(clone),edges_vertices:[number,number][]=[],
  edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const index=(c:number,i:number)=>apex?(c===0?0:1+(c-1)*s+i):c*s+i;
 const add=(a:number,b:number,k:Assignment,id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='B'?0:null);ids.push(id);};
 for(let c=apex?1:0;c<5;c++)for(let i=0;i<n;i++)add(index(c,i),index(c,i+1),c===0||c===4?'B':mode==='unassigned'?'U':c===2?'V':'M',`cone4039-curve-${c}-${i}`);
 for(const i of [0,n])for(let c=0;c<4;c++)add(index(c,i),index(c+1,i),'B',`cone4039-cap-${i}-${c}`);
 const range=(c:number)=>Array.from({length:s},(_,i)=>index(c,i)),faces_vertices=Array.from({length:4},(_,c)=>apex&&c===0?[0,...range(1)]:[...range(c).reverse(),...range(c+1)]),
  edgeIndex=new Map(edges_vertices.map((e,i)=>[[...e].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(f=>f.map((v,i)=>edgeIndex.get([v,f[(i+1)%f.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 let minimumCellCross=Infinity,minimumTriangleCross:number|null=null;
 for(let c=0;c<4;c++)for(let i=0;i<n;i++){
  const cell=apex&&c===0?[curves[0][i],curves[1][i],curves[1][i+1]]:[curves[c][i],curves[c+1][i],curves[c+1][i+1],curves[c][i+1]];
  for(let k=0;k<cell.length;k++){const a=cell[k],b=cell[(k+1)%cell.length],p=cell[(k+2)%cell.length],cross=(b[0]-a[0])*(p[1]-b[1])-(b[1]-a[1])*(p[0]-b[0]);
   if(!finite(cross)||cross<=1e-12)fail('实际三角或四边校验单元退化，未吸附或补径向缝。');minimumCellCross=Math.min(minimumCellCross,cross);}
  if(apex&&c===0){const cross=(cell[1][0]-cell[0][0])*(cell[2][1]-cell[0][1])-(cell[1][1]-cell[0][1])*(cell[2][0]-cell[0][0]);minimumTriangleCross=Math.min(minimumTriangleCross??Infinity,cross);}
 }
 if(faces_vertices.some(f=>polygonArea(f.map(v=>vertices_coords[v]))<=1e-10))fail('实际四带纸面退化或反向。');
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,minimumCellCross,minimumTriangleCross};
}
export function coneFourPlaneCP4039Document(value:unknown,rawNative:unknown):Doc{
 return documentWithSchema(validateConeFourPlaneCP4039Recipe(value),rawNative,false);
}
function documentWithSchema(recipe:ConeFourPlaneCP4039Recipe,rawNative:unknown,legacy:boolean):Doc{
 const apex=recipe.paperBoundaryMode==='original-apex',{native,curves,proof,maximumLiteralResidual}=verifiedNative(rawNative,recipe),
  {graph,ids,minimumCellCross,minimumTriangleCross}=materialGraph(curves,recipe.assignmentMode,apex),points=graph.vertices_coords,
  doc:Doc={schemaVersion:2,name:'原 In[4039] 圆锥四带有限 CP',paper:{width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),
   height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),
    assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}))},material=createMaterialTopology(doc,graph,ids),
  inspected=inspectMaterialTopology({...doc,metadata:{materialTopology:material}});
 if(!inspected.ok||inspected.components.length!==1||inspected.components[0].boundaryLoops.length!==1)fail('四带须构成单部件、单闭合纸边。');
 const step=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments,seconds=[apex?0:recipe.innerRadius*SIN_THETA*SIN_THETA+PROOF_MARGIN,...proof.rows.map(p=>p.second)];
 doc.metadata={materialTopology:material,originalConeFourPlane4039:{schema:legacy?LEGACY_SCHEMA:SCHEMA,recipe:legacy?withoutBoundaryMode(recipe):recipe,nativeSequence:clone(native),
  source:{inputCell:'In[4039]',sequenceDefinition:'In[4038]',numericDefinition:'In[4042]',thetaOriginal:'30.°',betaOriginal:'10.°',
   directorExpressions:['sin(pi/6)*cos(s)','sin(pi/6)*sin(s)','cos(pi/6)'],planarBase:'[0,0]',planarDirector:'[cos(u*sin(theta)),sin(u*sin(theta))]',
   composeReflections:true,normalNormalized:false,machineSinTheta:SIN_THETA,symbolicHalfSubstituted:false,symbolicSimplifyReproduced:false,
   originalParameterRange:[0,Math.PI],originalTransverseRange:[0,OUTER],originalApexIncludedInNativeDiagnostic:true,originalApexIncludedInPaper:false,
   coordinateUnit:'mm',coordinateTransform:'identity',originalCoordinateUnit:'unspecified',localCoordinateConvention:'1 original planar coordinate unit = 1 mm; no scaling or translation',
   originalStyleHints:{transverse:['B','M','V','M','B'],ruling:['ValleyRulingLine','MountainRulingLine','ValleyRulingLine','MountainRulingLine'],
    transverseMappingCell:'In[1906]',rulingMeaning:'positive/negative ruling curvature, not CP edge assignment',whiteFaceReference:true},
   originalStyleHintsAppliedToFiniteChords:recipe.assignmentMode==='original-styles',originalTargetAnglesSpecified:false,
   originalCurveDivisionsDefault:100,segmentsIsLocalFiniteChoice:true,previewRulingsAreCP:false,
   localChoices:['positive inner radius removes apex','bounded radial end caps','uniform parameter finite chords','explicit assignment mode']},
  intrinsicDomain:{method:'literal-input-compose-reflection-rational-bounds-and-positive-polar-chart',literalStageCoefficients:proof.coefficients,
   inverse:'u=atan2(y,x)/machineSinTheta; v=hypot(x,y)',jacobianSign:-1,jacobianAbsoluteLowerBound:.48*recipe.innerRadius,
   jacobianFormula:'-v*sin(theta)',jacobianAtIdealHalfNotClaimed:true,angleSpanUpperBound:1.61,globalGapLowerBounds:proof.safe,
   globallyInjective:true,boundarySimple:true,apexExcluded:true},
  sampling:{method:'actual-native-row-parameters-and-local-linear-chords',segments:recipe.segments,parameterStep:step,
   curveSecondDerivativeUpperBounds:seconds,curveChordErrorUpperBounds:seconds.map(v=>v*step*step/8+BOUND),unit:'mm',exactContinuousCurve:false},
  topology:{vertices:5*(recipe.segments+1),edges:5*recipe.segments+8,faces:4,components:1,boundaryLoops:1,boundaryEdges:2*recipe.segments+8,
   creaseEdges:3*recipe.segments,localConvexValidationCells:4*recipe.segments,radialInternalMaterialEdges:0,euler:1,
   vertexOrder:'local positive inner boundary, original cuts 1/2/3/4',edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false},
  numericalPolicy:{sourceCoordinateAbsoluteBoundMm:BOUND,derivedProofAbsoluteBound:BOUND,proofBoundArithmeticMargin:PROOF_MARGIN,
   parametersIndicesIdentityExact:true,maximumLiteralResidual,minimumCellCross},
  evidence:{adoption:'explicit-cp-only',mountainValleyLabelsApplied:recipe.assignmentMode==='original-styles',targetAnglesKnown:false,
   flatFold:false,layerOrder:false,threeDimensionalInitialCondition:false,finiteRigidIsometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 if(!legacy){
  const own=doc.metadata.originalConeFourPlane4039 as Record<string,any>;
  own.source.paperBoundaryMode=recipe.paperBoundaryMode;own.source.originalApexIncludedInPaper=apex;
  own.source.originalZeroTransverseBoundaryIsDegeneratePoint=true;own.source.originalZeroBoundaryGeneratesFiniteEdges=false;
  if(apex)own.source.localChoices=['bounded radial end caps','uniform parameter finite chords','explicit assignment mode'];
  own.paperNative={paperBoundaryMode:recipe.paperBoundaryMode,nativeTransverseStart:0,nativeTransverseEnd:OUTER,outerBoundary:'actual native cut4 samples',
   originalApexIncluded:apex,sourceApexIdentity:apex?'B2 + stage0.parameter(0) * D2 = [0,0]':null,
   sourceParameterInverseAtOrigin:apex?'not unique; original zero boundary is one source quotient vertex':'origin excluded',
   coordinateWelding:false};
  if(apex){
   own.intrinsicDomain={...own.intrinsicDomain,method:'literal-input-compose-reflection-rational-bounds-and-source-apex-polar-quotient',
    inverse:'v=hypot(x,y); u=atan2(y,x)/machineSinTheta for v>0; u nonunique at source apex',
    jacobianAbsoluteLowerBound:0,globalGapLowerBounds:[1.1,...proof.safe.slice(1)],globallyInjective:false,
    parameterRectangleGloballyInjective:false,quotientPaperGloballyInjective:true,regularOnEntireParameterDomain:false,
    regularAwayFromApex:true,boundarySimple:true,finiteMaterialSheetSimplePositiveArea:true,apexExcluded:false,
    sourceApexQuotient:{vertex:0,transverseParameter:0,originalZeroTrackSamples:recipe.segments+1,sourcePoint:[0,0],arbitraryCoordinateWelding:false}};
   own.sampling.curveChordErrorUpperBounds[0]=0;
   own.topology={...own.topology,vertices:4*recipe.segments+5,edges:4*recipe.segments+8,boundaryEdges:recipe.segments+8,
    localConvexValidationCells:3*recipe.segments,localPositiveTriangleValidationCells:recipe.segments,
    sourceApexVertex:0,sourceApexVertexCount:1,vertexOrder:'one original source apex, original cuts 1/2/3/4'};
   own.numericalPolicy.minimumTriangleCross=minimumTriangleCross;
  }else{
   own.intrinsicDomain.parameterRectangleGloballyInjective=true;
   own.intrinsicDomain.regularOnEntireParameterDomain=true;
  }
 }
 validateDoc(doc);return doc;
}
export async function fetchConeFourPlaneCP4039Document(value:unknown,signal?:AbortSignal):Promise<Doc>{
 const recipe=validateConeFourPlaneCP4039Recipe(value);return coneFourPlaneCP4039Document(recipe,await fetchNativePlanarSequenceWhenIdle(coneFourPlaneCP4039Query(recipe),signal));
}
export function readConeFourPlaneCP4039Recipe(doc:Doc):ConeFourPlaneCP4039Recipe|null{
 try{const own=doc.metadata?.originalConeFourPlane4039;if(!object(own))return null;
  if(own.schema===LEGACY_SCHEMA)return legacyRecipe(own.recipe);
  if(own.schema!==SCHEMA)return null;return validateConeFourPlaneCP4039Recipe(own.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(path==='numericalPolicy.maximumLiteralResidual')return a>=0&&a<=BOUND&&Math.abs(a-b)<=BOUND;
  if(path==='numericalPolicy.minimumCellCross'||path==='numericalPolicy.minimumTriangleCross')return a>1e-12&&Math.abs(a-b)<=BOUND;
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=BOUND;
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((v,i)=>same(a[i],v,`${path}.${i}`));
 if(object(a)||object(b)){if(!object(a)||!object(b)||!keys(a,Object.keys(b)))return false;return Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k));}
 return a===b;
}
function sameSegments(actual:Segment[],expected:Segment[]):boolean{
 if(actual.length!==expected.length||new Set(actual.map(s=>s.id)).size!==actual.length)return false;
 return expected.every(e=>{const a=actual.find(s=>s.id===e.id);return !!a&&a.assignment===e.assignment&&a.angle===e.angle&&a.a.length===2&&a.b.length===2&&distance(a.a,e.a)<=BOUND&&distance(a.b,e.b)<=BOUND;});
}
export function coneFourPlaneCP4039SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readConeFourPlaneCP4039Recipe(doc),own=doc.metadata?.originalConeFourPlane4039;
  if(!recipe||!object(own)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=documentWithSchema(recipe,own.nativeSequence,own.schema===LEGACY_SCHEMA),a=inspectMaterialTopology(doc),b=inspectMaterialTopology(expected);
  if(!a.ok||!b.ok||a.foldedVertices||a.startingFace!==undefined||!same(own,expected.metadata!.originalConeFourPlane4039)||
   !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||!same(a.edgeSegmentIds,b.edgeSegmentIds)||
   !sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),box={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>BOUND||Math.abs(doc.paper[key]-box[key])>BOUND)return false;
  if(recipe.paperBoundaryMode==='original-apex'){
   if(a.graph.vertices_coords[0].some(x=>x!==0))return false;
   for(const id of [`cone4039-cap-0-0`,`cone4039-cap-${recipe.segments}-0`]){
    const segment=doc.segments.find(s=>s.id===id);if(!segment||segment.a.some(x=>x!==0))return false;
   }
  }
  const {vertices_coords:av,...ag}=a.graph,{vertices_coords:bv,...bg}=b.graph;
  return same(ag,bg)&&av.length===bv.length&&av.every((p,i)=>distance(p,bv[i])<=BOUND);
 }catch{return false;}
}
