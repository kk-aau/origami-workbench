/** In[4019]/In[4021] literal circle data, with explicit finite planar paper assembly. */
import {parseGenericConicSectionResult,type GenericConicSectionQuery,type GenericConicSectionResult} from './curvedNativeConicSection';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {polygonArea,distance} from '../core/geometry';

export type ConicCircleCPRecipe={leftCoefficient:number;rightCoefficient:number;parameterStart:number;parameterEnd:number;segments:number};
export const CONIC_CIRCLE_CP_EXAMPLE:ConicCircleCPRecipe={leftCoefficient:.5,rightCoefficient:-.5,parameterStart:0,parameterEnd:Math.PI/2,segments:16};
const SCHEMA='original-conic-circle-bounded-cp-v1',FLOAT_BOUND=1e-13;
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原圆例的当前参数、九规则、二维纸域或材料身份不一致。'):never{throw Error(message);}
export function validateConicCircleCPRecipe(raw:unknown):ConicCircleCPRecipe{
 if(!object(raw)||!keys(raw,Object.keys(CONIC_CIRCLE_CP_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))fail('请填写完整原圆例的两侧有向系数、弧域和采样段数。');
 const r=raw as ConicCircleCPRecipe;
 if(r.leftCoefficient<.05||r.leftCoefficient>.95||r.rightCoefficient< -2||r.rightCoefficient> -.05)
  fail('左原母线系数须在0.05…0.95，右原母线系数须在−2…−0.05；保原方向，右侧以负系数截取。');
 if(r.parameterStart<0||r.parameterEnd>Math.PI/2||r.parameterEnd-r.parameterStart<.1)
  fail('圆例弧域须在[0,π/2]且跨度至少0.1 rad；不补跨空白线或裁剪原源。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('有限原圆例CP须为16…128个弦段。');
 return {...r};
}
export function conicCircleCPQuery(value:unknown):GenericConicSectionQuery{
 const r=validateConicCircleCPRecipe(value);
 return {family:'conic-section-2d-native',leftFocus:-1,rightFocus:-1,leftCross:-r.leftCoefficient,rightCross:-r.rightCoefficient,
  parameterRanges:[[r.parameterStart,r.parameterEnd]],segments:r.segments};
}
/** Original directors are both inward. The right second cross curve uses a negative coefficient. */
export function conicCirclePreview(value:unknown){
 const r=validateConicCircleCPRecipe(value),rows=Array.from({length:r.segments+1},(_,i)=>{
  const t=i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments,
   s=Math.sin(t),c=Math.cos(t),d:Point=[-c,-s],f:Point=[-2*Math.sin(t/2)**2,s];
  return {t,crease:f,leftDirector:[...d] as Point,rightDirector:[...d] as Point,
   left: [-1+(1-r.leftCoefficient)*c,(1-r.leftCoefficient)*s] as Point,
   right:[-1+(1-r.rightCoefficient)*c,(1-r.rightCoefficient)*s] as Point};
 });
 return {recipe:r,rows};
}
function verifiedNative(value:unknown,r:ConicCircleCPRecipe):{native:GenericConicSectionResult;maximumLiteralResidual:number}{
 const native=parseGenericConicSectionResult(value,conicCircleCPQuery(r)),reference=conicCirclePreview(r);let maximumLiteralResidual=0;
 if(native.source.branch!=='circle'||native.components.length!==1||!native.domain.certified||native.domain.foldRegularity!=='verified')
  fail('完整原九规则与单闭域核验尚未通过，不能采用纸面。');
 if(native.normalization.scale!==Math.max(1,r.leftCoefficient,-r.rightCoefficient)||
    native.normalization.origin.length!==2||native.normalization.origin.some(x=>x!==0))fail('原圆例归一化原点与输入尺度必须严格一致。');
 const rows=native.components[0].samples;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],e=reference.rows[i],t=e.t,s=Math.sin(t),c=Math.cos(t),focus:Point=[-1,0],zero:Point=[0,0],
   values=[e.crease,focus,e.leftDirector,focus,e.left,focus,e.rightDirector,focus,e.right],
   derivatives=[[-s,c],zero,[s,-c],zero,[-(1-r.leftCoefficient)*s,(1-r.leftCoefficient)*c],zero,[s,-c],zero,[-(1-r.rightCoefficient)*s,(1-r.rightCoefficient)*c]],
   positional=(k:number)=>k!==2&&k!==6;
  if(row.t!==t)fail('原圆例采样参数与当前弧域索引不一致。');
  for(let k=0;k<9;k++)for(let axis=0;axis<2;axis++){
   for(const [actual,expected]of [[row.rules[k][axis],values[k][axis]],
     [row.derivatives[k][axis],derivatives[k][axis]],
     [row.normalizedRules[k][axis],values[k][axis]/(positional(k)?native.normalization.scale:1)],
     [row.normalizedDerivatives[k][axis],derivatives[k][axis]/(positional(k)?native.normalization.scale:1)]]){
    if(!finite(actual)||!finite(expected))fail();const error=Math.abs(actual-expected);
    maximumLiteralResidual=Math.max(maximumLiteralResidual,error);if(error>FLOAT_BOUND)fail('原圆例九规则超出固定机器舍入界；未替换原点或母线。');
   }
  }
 }
 return {native,maximumLiteralResidual};
}
function materialGraph(native:GenericConicSectionResult):FoldGraph{
 const rows=native.components[0].samples,s=rows.length,n=s-1,vertices_coords=[...rows.map(r=>clone(r.rules[0]) as Point),
  ...rows.map(r=>clone(r.rules[4]) as Point),...rows.map(r=>clone(r.rules[8]) as Point)],
  edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[];
 const add=(a:number,b:number,k:'U'|'B')=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='U'?null:0);};
 for(let i=0;i<n;i++){add(i,i+1,'U');add(s+i,s+i+1,'B');add(2*s+i,2*s+i+1,'B');}
 for(const i of [0,n]){add(i,s+i,'B');add(i,2*s+i,'B');}
 const range=(begin:number)=>Array.from({length:s},(_,i)=>begin+i),faces_vertices=[
  [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)]],
  edgeIndex=new Map(edges_vertices.map((e,i)=>[[...e].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>edgeIndex.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((ids,f)=>ids.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 if(vertices_coords.some(p=>p.length!==2||p.some(x=>!finite(x)))||faces_vertices.some(f=>polygonArea(f.map(v=>vertices_coords[v]))<=1e-10))fail('原圆例出现退化或反向面；没有焊点、移动端点或补面。');
 return {vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces};
}
function segmentIds(n:number):string[]{
 const ids:string[]=[];
 for(let i=0;i<n;i++)ids.push(`conic-circle-crease-${i}`,`conic-circle-left-${i}`,`conic-circle-right-${i}`);
 for(const i of [0,n])ids.push(`conic-circle-cap-left-${i}`,`conic-circle-cap-right-${i}`);
 return ids;
}
/** Source points remain millimetres with identity transform. No 3D/FF frame or layer certificate. */
export function conicCircleCPDocument(value:unknown,rawNative:unknown):Doc{
 const recipe=validateConicCircleCPRecipe(value),{native,maximumLiteralResidual}=verifiedNative(rawNative,recipe),graph=materialGraph(native),
  points=graph.vertices_coords,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),ids=segmentIds(recipe.segments),
  doc:Doc={schemaVersion:2,name:'原圆例二维纸域 CP',paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},
   segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 const material=createMaterialTopology(doc,graph,ids),inspected=inspectMaterialTopology({...doc,metadata:{materialTopology:material}});
 if(!inspected.ok||inspected.components.length!==1||inspected.components[0].boundaryLoops.length!==1)fail('原圆例不是一个有闭合纸边的实际材料部件。');
 const delta=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments,
  metadata={schema:SCHEMA,recipe,nativeConic:clone(native),
   source:{definition:'ConicSection2DSystem In[4019]',savedCircleInput:'In[4021]',
    originalFocus:[-1,-1],originalDirectors:['[-Cos[t],-Sin[t]]','[-Cos[t],-Sin[t]]'],
    selectedRules:['CurvedFold2D','SecondCrossCurveLeft2D','SecondCrossCurveRight2D'],
    fullNineRulesPreserved:true,rightDirectorReversed:false,coordinateUnit:'mm',coordinateTransform:'identity',
    originalCoordinateUnit:'unspecified',localCoordinateConvention:'1 original planar coordinate unit = 1 mm; no scaling or translation',
    localChoices:['finite second-cross-curve boundary','end caps','linear chord sampling','U crease assignment'],
    originalDefinesPaperBoundary:false,originalDefinesMV:false,symbolicSimplifyReproduced:false},
   intrinsicDomain:{method:'positive-radius-no-wrap-polar-chart',center:[-1,0],
    radii:[1-recipe.leftCoefficient,1,1-recipe.rightCoefficient],jacobianMagnitudeLowerBound:1-recipe.leftCoefficient,
    angleRange:[recipe.parameterStart,recipe.parameterEnd],angleSpanAtMostPiOverTwo:true,globallyInjective:true,
    radiusOrder:'inner < crease < outer; no pole or angle wrap',flatPaperCoordinates:true},
   sampling:{method:'literal-nine-rule-source-values-and-linear-chords',segments:recipe.segments,parameterStep:delta,
    creaseErrorUpperBound:delta*delta/8,leftBoundaryErrorUpperBound:(1-recipe.leftCoefficient)*delta*delta/8,
    rightBoundaryErrorUpperBound:(1-recipe.rightCoefficient)*delta*delta/8,unit:'mm',exactContinuousCurve:false},
   topology:{vertices:3*(recipe.segments+1),edges:3*recipe.segments+4,faces:2,components:1,
    boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,
    vertexOrder:'crease, left second cross curve, right second cross curve',faceOrder:'inner strip, outer strip',
    edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false},
   numericalPolicy:{sourceCoordinateAbsoluteBoundMm:FLOAT_BOUND,derivedProofAbsoluteBound:FLOAT_BOUND,
    parametersIndicesIdentityExact:true,maximumLiteralCircleResidual:maximumLiteralResidual},
   evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,flatFold:false,layerOrder:false,
    threeDimensionalInitialCondition:false,isometryTo3D:false,continuousMotion:false,collisionFree:false}};
 doc.metadata={originalConicCircle2D:metadata,materialTopology:material};validateDoc(doc);return doc;
}
export function readConicCircleCPRecipe(doc:Doc):ConicCircleCPRecipe|null{
 try{const raw=doc.metadata?.originalConicCircle2D;if(!object(raw)||raw.schema!==SCHEMA)return null;return validateConicCircleCPRecipe(raw.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(path==='numericalPolicy.maximumLiteralCircleResidual')return a>=0&&a<=FLOAT_BOUND&&Math.abs(a-b)<=FLOAT_BOUND;
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=FLOAT_BOUND;
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((v,i)=>same(a[i],v,`${path}.${i}`));
 if(object(a)||object(b)){if(!object(a)||!object(b)||!keys(a,Object.keys(b)))return false;return Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k));}
 return a===b;
}
function sameSegments(actual:Segment[],expected:Segment[]):boolean{
 if(actual.length!==expected.length||new Set(actual.map(s=>s.id)).size!==actual.length)return false;
 return expected.every(e=>{const a=actual.find(s=>s.id===e.id);return !!a&&a.assignment===e.assignment&&a.angle===e.angle&&
  a.a.length===2&&a.b.length===2&&distance(a.a,e.a)<=FLOAT_BOUND&&distance(a.b,e.b)<=FLOAT_BOUND;});
}
/** A saved recipe is never a certificate for a hand-edited CP or a fabricated source result. */
export function conicCircleCPSourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);
  const recipe=readConicCircleCPRecipe(doc),saved=doc.metadata?.originalConicCircle2D;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=conicCircleCPDocument(recipe,saved.nativeConic),actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(saved,expected.metadata!.originalConicCircle2D)||
     !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||
     !same(actual.edgeSegmentIds,target.edgeSegmentIds)||!sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),current={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),
    height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||
    Math.abs(doc.paper[key]-expected.paper[key])>FLOAT_BOUND||Math.abs(doc.paper[key]-current[key])>FLOAT_BOUND)return false;
  const {vertices_coords:a,...ag}=actual.graph,{vertices_coords:b,...bg}=target.graph;
  return same(ag,bg)&&a.length===b.length&&a.every((p,i)=>distance(p,b[i])<=FLOAT_BOUND);
 }catch{return false;}
}
