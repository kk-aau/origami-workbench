import {apiWhenIdle} from './api';
import {fetchGenericConicSectionWhenIdle,parseGenericConicSectionResult,CONIC_NATIVE_RULE_KEYS,type GenericConicSectionQuery} from './curvedNativeConicSection';
import {fetchNativeDiscretizationWhenIdle,parseNativeDiscretizationResult,type DiscretizationUniformQuery,type DiscretizationSystemQuery,type DiscretizationSystemSample,type DiscretizationUniformSample} from './curvedNativeDiscretization';
import {prepareTessResult,type TessResponse} from './tessellation';
import {discreteCurveCPGraph,discreteCurveCPDocument,readDiscreteCurveCPParams,type DiscreteCurveCPParams} from './discreteCurveCP';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type Point} from '../core/types';

export type ConicNoncircleRecipe={leftFocus:number|{infinity:-1};rightFocus:number;leftCross:number;rightCross:number;parameterStart:number;parameterEnd:number;divisions:number};
export type ConicNoncircleProofs={nativeConic:unknown;nativeUniform:unknown;nativeSystem:unknown;nativeCP:TessResponse};
export const CONIC_NONCIRCLE_PRESETS:ConicNoncircleRecipe[]=[
 {leftFocus:-2,rightFocus:-1,leftCross:-1.5,rightCross:1,parameterStart:0,parameterEnd:Math.PI/2,divisions:5},
 {leftFocus:{infinity:-1},rightFocus:-1,leftCross:-1.5,rightCross:1.5,parameterStart:0,parameterEnd:Math.PI/2,divisions:5},
 {leftFocus:-2,rightFocus:1,leftCross:-1.5,rightCross:.5,parameterStart:0,parameterEnd:Math.PI/4,divisions:5},
];
const SCHEMA='original-conic-noncircle-finite-cp-v1',BOUND=1e-13;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clone=<T>(v:T):T=>structuredClone(v);
function fail(message='当前非圆原参数、驻定采样、九规则或真实有限材料不一致。'):never{throw Error(message);}
export function validateConicNoncircleRecipe(raw:unknown):ConicNoncircleRecipe{
 if(!object(raw)||!keys(raw,Object.keys(CONIC_NONCIRCLE_PRESETS[0])))fail('请提供完整原四参数、闭域和弦段数。');
 const r=raw as ConicNoncircleRecipe;
 if(![r.rightFocus,r.leftCross,r.rightCross,r.parameterStart,r.parameterEnd,r.divisions].every(finite)||
  !(finite(r.leftFocus)||object(r.leftFocus)&&keys(r.leftFocus,['infinity'])&&r.leftFocus.infinity===-1))fail();
 const L=typeof r.leftFocus==='number'?-r.leftFocus:0,R=Math.abs(r.rightFocus),a=r.parameterStart,b=r.parameterEnd;
 if(R<.5||R>3||Math.abs(r.leftCross)>3||Math.abs(r.rightCross)>3||a<0||b-a<.1||!Number.isInteger(r.divisions)||r.divisions<2||r.divisions>15)fail('当前有限域要求焦点幅度0.5…3、截线参数±3、跨度至少0.1、2…15弦。');
 if(typeof r.leftFocus==='object'){
  if(r.rightFocus>=0||b>2||-r.leftCross-b*b/(4*R)<=.05||r.rightCross-b*b/(4*R)<=.05)fail('左抛物两侧原系数必须在完整域保持正/负且有0.05余量；不截断变号域。');
 }else if(L<.5||L>3||L<=R)fail('本次有限非圆域要求左负焦点幅度大于右焦点幅度。');
 else if(r.rightFocus<0){
  const rho=2*L*R/(L+R-(L-R)*Math.cos(b)),inner=r.leftCross+L,outer=r.rightCross+R;
  if(b>Math.PI/2||inner<=.05||rho-inner<=.05||outer-(L+R-rho)<=.05)fail('椭圆原左右第二截线须在完整域分居折曲线两侧；不移点或翻director。');
 }else{
  const den=-(L-R)+(L+R)*Math.cos(b),inner=r.leftCross+L,radius=R-r.rightCross;
  if(b>Math.PI/4||den<=.1||inner<=.05||inner>=L-.05||radius<=.05||radius>=R-.05)fail('双曲原域必须避真实分母极点，且两原边界半径保持严格分离。');
 }
 return clone(r);
}
export function conicNoncircleQuery(raw:unknown):GenericConicSectionQuery{
 const r=validateConicNoncircleRecipe(raw);return {family:'conic-section-2d-native',leftFocus:r.leftFocus,rightFocus:r.rightFocus,leftCross:r.leftCross,rightCross:r.rightCross,parameterRanges:[[r.parameterStart,r.parameterEnd]],segments:8};
}
function literalRows(r:ConicNoncircleRecipe,t:number):number[][]{
 const l=typeof r.leftFocus==='number'?r.leftFocus:0,b=r.rightFocus,h=r.leftCross,k=r.rightCross,s=Math.sin(t),c=Math.cos(t),z=Math.tan(t/2);
 let f:number[],L:number[],D:number[],E:number[],R:number[],F:number[],H:number[];
 if(typeof r.leftFocus==='object'){
  const d=4*b*b+t*t;f=[t*t/(4*b),t];L=E=[h,t];D=[-1,0];R=[b,0];F=[1-8*b*b/d,4*b*t/d];H=[(4*b*b*k+(2*b-k)*t*t)/d,4*b*(b-k)*t/d];
 }else{
  const den=l+b+(b-l)*c,d=b*b+l*l*z*z;f=[l-2*l*b*c/den,-2*l*b*s/den];L=[l,0];D=[-c,-s];E=[l+(h-l)*c,(h-l)*s];R=[b,0];F=[1-2*b*b/d,-2*l*b*z/d];H=[-k+2*b*(1+b*(k-b)/d),2*l*b*(k-b)*z/d];
 }
 return [f,L,D,L,E,R,F,R,H];
}
/** Literal original nine-rule expressions; no interpreter or original numeric algorithm changes. */
export function conicNoncircleExpressions(raw:unknown):string[][]{
 const q=validateConicNoncircleRecipe(raw),n=(v:number)=>'('+(Number.isInteger(v)?v.toFixed(1):String(v))+')',r=n(q.rightFocus),h=n(q.leftCross),k=n(q.rightCross);
 let f:string[],L:string[],D:string[],E:string[],R:string[],F:string[],H:string[];
 if(typeof q.leftFocus==='object'){
  const d=`(4*${r}**2+s**2)`;f=[`s**2/(4*${r})`,'s'];L=E=[h,'s'];D=['-1','0'];R=[r,'0'];F=[`1-8*${r}**2/${d}`,`4*${r}*s/${d}`];H=[`(4*${r}**2*${k}+(2*${r}-${k})*s**2)/${d}`,`4*${r}*(${r}-${k})*s/${d}`];
 }else{
  const l=n(q.leftFocus),den=`(${l}+${r}+(${r}-${l})*cos(s))`,d=`(${r}**2+${l}**2*tan(s/2)**2)`;
  f=[`${l}-2*${l}*${r}*cos(s)/${den}`,`-2*${l}*${r}*sin(s)/${den}`];L=[l,'0'];D=['-cos(s)','-sin(s)'];E=[`${l}+(${h}-${l})*cos(s)`,`(${h}-${l})*sin(s)`];R=[r,'0'];F=[`1-2*${r}**2/${d}`,`-2*${l}*${r}*tan(s/2)/${d}`];H=[`-${k}+2*${r}*(1+${r}*(${k}-${r})/${d})`,`2*${l}*${r}*(${k}-${r})*tan(s/2)/${d}`];
 }
 return [f,L,D,L,E,R,F,R,H];
}
export function conicNoncircleUniformQuery(raw:unknown):DiscretizationUniformQuery{
 const r=validateConicNoncircleRecipe(raw);return {family:'discretization-generic-native',mode:'uniform',curve:conicNoncircleExpressions(r)[0],divisions:r.divisions,parameterStart:r.parameterStart,parameterEnd:r.parameterEnd};
}
function validatedChain(raw:unknown,proofs:ConicNoncircleProofs){
 const cpChecks=proofs.nativeCP?.stats?.checks as unknown as Record<string,any>|undefined,local=cpChecks?.local,geometry=cpChecks?.geometry;
 if(!object(local)||!object(geometry)||!finite(local.maxKawasakiErrorDeg)||local.maxKawasakiErrorDeg<0||!finite(local.toleranceDeg)||local.toleranceDeg<=0||!finite(geometry.tolerance)||geometry.tolerance<=0)fail('原离散证明的绝对误差必须非负，局部与几何阈值必须为正有限数。');
 const recipe=validateConicNoncircleRecipe(raw),conic=parseGenericConicSectionResult(proofs.nativeConic,conicNoncircleQuery(recipe)),
  uniform=parseNativeDiscretizationResult(proofs.nativeUniform,conicNoncircleUniformQuery(recipe)),u=uniform.sample as DiscretizationUniformSample;
 if(!conic.domain.certified||!conic.certification.fullOriginalDomainsCertified||!u.strictlyOrderedAlongRequestedInterval||u.outsideRequestedInterval.length||u.stationaryVertices.length||!finite(u.maximumDirectionResidual)||u.maximumDirectionResidual<0||u.maximumDirectionResidual>1e-12)fail('完整原域或原耦合驻定未通过；不以等参数替代或剪域。');
 const systemQuery:DiscretizationSystemQuery={family:'discretization-generic-native',mode:'system',rules:CONIC_NATIVE_RULE_KEYS.map((key,i)=>({key,expression:conicNoncircleExpressions(recipe)[i]})),parameters:u.parameters},
  system=parseNativeDiscretizationResult(proofs.nativeSystem,systemQuery),sample=system.sample as DiscretizationSystemSample;
 if(!sample.allSamplesFiniteReal||sample.undefined.length)fail();
 const values=sample.rules.map(rule=>rule.values as number[][]),n=recipe.divisions+1;let residual=0;
 for(let i=0;i<n;i++){
  const reference=literalRows(recipe,u.parameters[i]);
  for(let rule=0;rule<9;rule++)for(let axis=0;axis<2;axis++){const error=Math.abs(values[rule][i][axis]-reference[rule][axis]);if(!Number.isFinite(error)||error>BOUND)fail('九规则真实采样超过固定舍入界。');residual=Math.max(residual,error);}
 }
 const p=readDiscreteCurveCPParams({family:'discrete-curve-cp',source:{family:'discretization-generic-native',mode:'multipliers',foldPoints:values[0],leftRulings:values[4].map((v,i)=>v.map((x,k)=>x-values[0][i][k])),rightRulings:values[8].map((v,i)=>v.map((x,k)=>x-values[0][i][k]))},leftWidth:1,rightWidth:1,assignments:Array(3*n-5).fill('U')});
 if(!p)fail();const result=prepareTessResult(proofs.nativeCP,p);discreteCurveCPDocument(result,p);
 const rawGraph={...discreteCurveCPGraph(p),vertices_coords:clone([...values[0],...values[4],...values[8]]) as Point[]},fold=proofs.nativeCP.fold as Record<string,any>;
 if(Object.hasOwn(fold,'file_frames')||Object.hasOwn(fold,'frame_unit')||JSON.stringify(fold.frame_classes)!=='["creasePattern"]'||JSON.stringify(fold.frame_attributes)!=='["2D"]')fail('原离散CP必须保持真实二维原坐标帧，不携带假FF或替换单位。');
 for(const [field,expected]of Object.entries(rawGraph)){
  if(field==='vertices_coords'){
   const actual=fold[field];if(!Array.isArray(actual)||actual.length!==n*3||actual.some((p:any,i:number)=>!Array.isArray(p)||p.length!==2||p.some((x:any,k:number)=>!finite(x)||Math.abs(x-rawGraph.vertices_coords[i][k])>BOUND)))fail();
  }else if(JSON.stringify(fold[field])!==JSON.stringify(expected))fail('原有限CP拓扑索引、赋型或折角必须严格同一。');
 }
 const pts=rawGraph.vertices_coords,span=Math.max(...[0,1].map(k=>Math.max(...pts.map(p=>p[k]))-Math.min(...pts.map(p=>p[k]))));
 for(const face of rawGraph.faces_vertices)for(let j=0;j<4;j++){
  const a=pts[face[j]],b=pts[face[(j+1)%4]],c=pts[face[(j+2)%4]];
  if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=1e-10*span*span)fail('实际有限纸面不严格凸；不补造面。');
 }
 return {recipe,conic,uniform,system,params:p,graph:rawGraph,maximumLiteralResidual:residual};
}
export function conicNoncircleCPDocument(raw:unknown,proofs:ConicNoncircleProofs):Doc{
 const v=validatedChain(raw,proofs),graph=v.graph,points=graph.vertices_coords,ids=graph.edges_vertices.map((_,i)=>`conic-noncircle-${i}`),
  doc:Doc={schemaVersion:2,name:'原非圆截线 · 有限二维 CP',paper:{width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]) as Point,b:clone(points[b]) as Point,assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 const material=createMaterialTopology(doc,graph,ids);doc.metadata={materialTopology:material,originalConicNoncircleCP:{schema:SCHEMA,recipe:v.recipe,proofs:clone(proofs),
  source:{originalDefinition:'ConicSection2DSystem In[4019]',originalDiscreteMethod:'In[4087]/In[4089]/In[4092]',originalEllipseCall:'In[4093]',parabolaHyperbolaChordCall:'local finite application, not a saved Out',fullNineRulesPreserved:true,rightDirectorReversed:false,rawRulingsNormalized:false,originalCoordinateUnit:'unspecified',coordinateConvention:'1 original planar coordinate unit = 1 mm',coordinateTransform:'identity',originalDefinesPaperBoundary:false,originalDefinesMountainValley:false,localChoices:['actual second-cross boundaries','finite end caps','original sampled ruling lines as U internal seams','strictly convex quadrilateral cells']},
  domain:{signedCoefficients:'(secondCross-f) dot originalDirector; left positive, right negative',injectivity:'separate focal polar/y charts, opposite sides of literal conic',nativeFoldRegularity:v.conic.domain.foldRegularity,supplementalRegularity:'parabola speed >=1; finite conic speed >=positive focal radius',finiteStrictConvexDiskVerified:true},
  sampling:{method:'original coupled chord stationarity',parameters:(v.uniform.sample as DiscretizationUniformSample).parameters,equalParameterSubstitution:false,linearFinitePaperOnly:true},
  numericalPolicy:{absoluteCoordinateBoundMm:BOUND,maximumLiteralResidual:v.maximumLiteralResidual,indicesAssignmentsIdentityExact:true},
  evidence:{adoption:'explicit-cp-only',flatFold:false,layerOrder:false,threeDimensionalPose:false,continuousPath:false,collision:false,WolframExecuted:false}}};
 validateDoc(doc);const inspected=inspectMaterialTopology(doc);if(!inspected.ok||inspected.components.length!==1||inspected.components[0].boundaryLoops.length!==1)fail('实际原坐标材料未通过单部件闭合纸边检验。');return doc;
}
export function readConicNoncircleRecipe(doc:Doc):ConicNoncircleRecipe|null{try{const m=doc.metadata?.originalConicNoncircleCP;if(!object(m)||m.schema!==SCHEMA)return null;return validateConicNoncircleRecipe(m.recipe);}catch{return null;}}
function same(a:unknown,b:unknown,p=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){if(!finite(a)||!finite(b))return false;if(p==='originalConicNoncircleCP.numericalPolicy.maximumLiteralResidual')return a>=0&&a<=BOUND&&b>=0&&b<=BOUND&&Math.abs(a-b)<=BOUND;if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(p))return Math.abs(a-b)<=BOUND;return a===b;}
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>same(a[i],x,`${p}.${i}`));
 if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k],p?p+'.'+k:k));return a===b;
}
export function conicNoncircleCPSourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readConicNoncircleRecipe(doc),saved=doc.metadata?.originalConicNoncircleCP;
  if(!recipe||!object(saved)||doc.flatFold!==undefined)return false;const expected=conicNoncircleCPDocument(recipe,saved.proofs),actual=inspectMaterialTopology(doc);
  if(!actual.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(saved,expected.metadata!.originalConicNoncircleCP,'originalConicNoncircleCP')||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||doc.segments.length!==expected.segments.length||!keys(doc.paper,['width','height']))return false;
  for(const e of expected.segments){const a=doc.segments.find(s=>s.id===e.id);if(!a||a.assignment!==e.assignment||a.angle!==e.angle||[0,1].some(k=>Math.abs(a.a[k]-e.a[k])>BOUND||Math.abs(a.b[k]-e.b[k])>BOUND))return false;}
  const points=doc.segments.flatMap(s=>[s.a,s.b]);return ['width','height'].every((k,i)=>Math.abs(doc.paper[k as 'width'|'height']-expected.paper[k as 'width'|'height'])<=BOUND&&Math.abs(doc.paper[k as 'width'|'height']-(Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))))<=BOUND);
 }catch{return false;}
}
export async function fetchConicNoncircleCP(raw:unknown,signal?:AbortSignal):Promise<Doc>{
 const recipe=validateConicNoncircleRecipe(raw),nativeConic=await fetchGenericConicSectionWhenIdle(conicNoncircleQuery(recipe),signal),nativeUniform=await fetchNativeDiscretizationWhenIdle(conicNoncircleUniformQuery(recipe),signal),
  parameters=(nativeUniform.sample as DiscretizationUniformSample).parameters,nativeSystem=await fetchNativeDiscretizationWhenIdle({family:'discretization-generic-native',mode:'system',rules:CONIC_NATIVE_RULE_KEYS.map((key,i)=>({key,expression:conicNoncircleExpressions(recipe)[i]})),parameters},signal),
  values=(nativeSystem.sample as DiscretizationSystemSample).rules.map(r=>r.values as number[][]),params:DiscreteCurveCPParams={family:'discrete-curve-cp',source:{family:'discretization-generic-native',mode:'multipliers',foldPoints:values[0],leftRulings:values[4].map((v,i)=>v.map((x,k)=>x-values[0][i][k])),rightRulings:values[8].map((v,i)=>v.map((x,k)=>x-values[0][i][k]))},leftWidth:1,rightWidth:1,assignments:Array(3*parameters.length-5).fill('U')},
  nativeCP=await apiWhenIdle<TessResponse>('tessellate',params,signal);
 return conicNoncircleCPDocument(recipe,{nativeConic,nativeUniform,nativeSystem,nativeCP});
}
