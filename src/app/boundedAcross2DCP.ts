/** Intrinsic paper coordinates from In[3983]/In[3984], never a 3D projection. */
import {sampleLinearAcross,validateLinearAcrossParams,type LinearAcrossParams} from './curvedAcrossRightLinearAngle';
import {buildFold,distance,epsilonFor,polygonArea,segmentIntersection,collinearOverlap} from '../core/geometry';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {defaultProcessingSettings,type ProcessingSettingsDraft} from './cpProcessingSettings';

export type BoundedAcrossRecipe={parameters:LinearAcrossParams;includeRulingGuides:boolean};
export const BOUNDED_ACROSS_EXAMPLE:BoundedAcrossRecipe={parameters:{angleSlope:.5,parameterStart:.2,
  parameterEnd:1,leftWidth:.15,rightWidth:.15,curveSegments:16},includeRulingGuides:true};
const SCHEMA='original-across-right-2d-bounded-cp-v1';
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function validateBoundedAcrossRecipe(value:unknown):BoundedAcrossRecipe{
  if(!object(value)||Object.keys(value).some(k=>!['parameters','includeRulingGuides'].includes(k))||
      typeof value.includeRulingGuides!=='boolean')throw Error('二维纸带须含原参数与明确的辅助母线选项。');
  const parameters=validateLinearAcrossParams(value.parameters);
  if(parameters.curveSegments>128)throw Error('实际 CP 采用限 16–128 段，保持逐边几何检查在有限预算内。');
  return {parameters,includeRulingGuides:value.includeRulingGuides};
}
const pointKey=(p:Point)=>p.map(x=>Object.is(x,-0)?0:x).join(',');
const orient=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const CORE_ROUNDING_BOUND=1e-13; // Much smaller than the core's 1e-6 mm topology tolerance.
function sameSegments(a:Segment[],b:Segment[]):boolean{
  if(a.length!==b.length)return false;const used=new Set<number>();
  return a.every(s=>{const i=b.findIndex((t,i)=>!used.has(i)&&s.assignment===t.assignment&&s.angle===t.angle&&
    ((distance(s.a,t.a)<=CORE_ROUNDING_BOUND&&distance(s.b,t.b)<=CORE_ROUNDING_BOUND)||
      (distance(s.a,t.b)<=CORE_ROUNDING_BOUND&&distance(s.b,t.a)<=CORE_ROUNDING_BOUND)));
    if(i<0)return false;used.add(i);return true;});
}
function stable(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}

// Chrome and Node may evaluate analytic sin/cos/tan/hypot a few ulps apart.
// Only these derived sample/proof numbers use a fixed absolute source-unit bound.
// Recipe parameters, indices, identities, structure and error-policy values stay exact.
const SOURCE_EVALUATION_BOUND=1e-13;
function sourceNumberMayRound(path:string):boolean{
  return /^samples\.frames\.\d+\.(u|foldAngleRad|rightTangentCoefficient|rightLeftNormalCoefficient)$/.test(path)||
    /^samples\.frames\.\d+\.(crease|leftRuling|rightRuling)\.[01]$/.test(path)||
    /^samples\.(leftBoundary|rightBoundary)\.\d+\.[01]$/.test(path)||
    path==='intrinsicDomain.rightSignedJacobianUpperBound'||path==='topology.maximumCorePointRoundingError';
}
function sameSourceEvidence(actual:unknown,expected:unknown,path=''):boolean{
  if(typeof actual==='number'&&typeof expected==='number'){
    if(!Number.isFinite(actual)||!Number.isFinite(expected))return false;
    if(path==='topology.maximumCorePointRoundingError'&&(actual<0||actual>CORE_ROUNDING_BOUND))return false;
    if(path==='intrinsicDomain.rightSignedJacobianUpperBound'&&actual>=0)return false;
    return sourceNumberMayRound(path)?Math.abs(actual-expected)<=SOURCE_EVALUATION_BOUND:actual===expected;
  }
  if(Array.isArray(actual)||Array.isArray(expected))return Array.isArray(actual)&&Array.isArray(expected)&&
    actual.length===expected.length&&expected.every((value,i)=>sameSourceEvidence(actual[i],value,`${path}.${i}`));
  if(object(actual)||object(expected)){
    if(!object(actual)||!object(expected))return false;
    const a=Object.keys(actual).sort(),b=Object.keys(expected).sort();
    return a.length===b.length&&a.every((key,i)=>key===b[i]&&sameSourceEvidence(actual[key],expected[key],path?`${path}.${key}`:key));
  }
  return actual===expected;
}
/** Only this recipe's paper dimensions are an analytic-sample bounding box. */
function sameDerivedPaper(actual:Doc,expected:Doc):boolean{
  if(!object(actual.paper)||Object.keys(actual.paper).sort().join(',')!=='height,width')return false;
  const points=actual.segments.flatMap(s=>[s.a,s.b]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),
    current={width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  return (['width','height'] as const).every(key=>{const a=actual.paper[key],b=expected.paper[key],c=current[key];
    return typeof a==='number'&&Number.isFinite(a)&&a>0&&Number.isFinite(b)&&b>0&&Number.isFinite(c)&&c>0&&
      Math.abs(a-b)<=SOURCE_EVALUATION_BOUND&&Math.abs(a-c)<=SOURCE_EVALUATION_BOUND;});
}

/** Refuse crossings, touchings, tiny edges and any core coordinate welding/splitting. */
function checkPaper(doc:Doc,expectedVertices:Point[],leftFace:Point[],rightFace:Point[]){
  validateDoc(doc);
  const structural=doc.segments.filter(s=>s.assignment!=='A'),eps=epsilonFor(doc);
  for(const edge of structural)if(distance(edge.a,edge.b)<=eps*16)throw Error('采样纸带有小于可靠分辨率的边；未吸附、焊点或补线。');
  for(let i=0;i<structural.length;i++)for(let j=i+1;j<structural.length;j++){
    const a=structural[i],b=structural[j];
    if(orient(a.a,a.b,b.a)*orient(a.a,a.b,b.b)<0&&orient(b.a,b.b,a.a)*orient(b.a,b.b,a.b)<0)
      throw Error('采样纸带存在真正几何交叉，未采用。');
    if(collinearOverlap(a,b,eps))throw Error('采样纸带存在重叠边，未采用。');
    const hit=segmentIntersection(a,b,eps);if(!hit)continue;
    const shared=[a.a,a.b].filter(p=>[b.a,b.b].some(q=>pointKey(p)===pointKey(q)));
    if(shared.length!==1||distance(hit.point,shared[0])>eps)throw Error('采样纸带存在交叉或非共有端点接触，未采用。');
  }
  if(Math.abs(polygonArea(leftFace))<=eps*eps*16||Math.abs(polygonArea(rightFace))<=eps*eps*16)
    throw Error('采样纸带包含退化纸面，未采用。');
  const {graph}=buildFold(doc),vertices=graph.vertices_coords,matched=new Set<number>();let maximumCorePointRoundingError=0;
  const pointsMatch=vertices.every(p=>{const i=expectedVertices.findIndex((q,i)=>!matched.has(i)&&distance(p,q)<=CORE_ROUNDING_BOUND);
    if(i<0)return false;matched.add(i);maximumCorePointRoundingError=Math.max(maximumCorePointRoundingError,distance(p,expectedVertices[i]));return true;});
  if(vertices.length!==expectedVertices.length||graph.edges_vertices.length!==structural.length||graph.faces_vertices?.length!==2||
      vertices.length-graph.edges_vertices.length+graph.faces_vertices.length!==1||
      !pointsMatch)
    throw Error('实际 CP 顶点、边或纸面与原二维采样不一致，未焊点或补跨空白线。');
  return {vertices:vertices.length,edges:graph.edges_vertices.length,faces:2,components:1,
    boundarySimple:true,structuralEdgesUnchanged:true,coordinateWelding:false,maximumCorePointRoundingError,corePointRoundingBound:CORE_ROUNDING_BOUND};
}

/** Only explicit CP adoption calls this constructor. No fold pose or layer certificate is attached. */
export function boundedAcross2DDocument(value:unknown):Doc{
  const recipe=validateBoundedAcrossRecipe(value),sample=sampleLinearAcross(recipe.parameters),p=sample.params,
    n=p.curveSegments,crease=sample.frames.map(f=>f.crease),left=sample.leftBoundary,right=sample.rightBoundary,
    vertices=[...crease,...left,...right],segments:Segment[]=[];
  const add=(id:string,a:Point,b:Point,assignment:'B'|'U'|'A')=>segments.push({id,a:[...a],b:[...b],assignment,angle:assignment==='U'?null:0});
  for(let i=0;i<n;i++){
    add(`across-crease-${i}`,crease[i],crease[i+1],'U');
    add(`across-boundary-left-${i}`,left[i],left[i+1],'B');
    add(`across-boundary-right-${i}`,right[i],right[i+1],'B');
  }
  for(const i of [0,n]){add(`across-cap-left-${i}`,crease[i],left[i],'B');add(`across-cap-right-${i}`,crease[i],right[i],'B');}
  if(recipe.includeRulingGuides)for(let i=1;i<n;i++){
    add(`across-guide-left-${i}`,crease[i],left[i],'A');add(`across-guide-right-${i}`,crease[i],right[i],'A');
  }
  const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]),doc:Doc={schemaVersion:2,name:'原二维跨右侧有限纸带 CP',
    paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},segments};
  const topology=checkPaper(doc,vertices,[...crease,...left.slice().reverse()],[...crease.slice().reverse(),...right]),
    delta=(p.parameterEnd-p.parameterStart)/n,h0=Math.tan(p.angleSlope*p.parameterStart/2),b0=h0/Math.hypot(p.angleSlope,h0),
    sampling={method:'analytic-source-evaluation-and-linear-chords',segments:n,parameterStep:delta,
      creaseErrorUpperBound:delta*delta/8,leftBoundaryErrorUpperBound:(1-p.leftWidth)*delta*delta/8,
      rightBoundaryErrorUpperBound:(1+2.5*p.rightWidth)*delta*delta/8,unit:'mm',
      boundMethod:'C2 linear interpolation: sup(norm(second derivative))*step^2/8; norm(rR second derivative)<=5/2',
      exactContinuousCurve:false,wolfram64PointInterpolationReproduced:false};
  doc.metadata={originalAcross2D:{schema:SCHEMA,recipe,samples:sample,
    source:{definition:'FoldAcrossRight2D In[3983]',savedAnalyticInput:'In[3984]',numericReference:'NFoldAcrossRight2D In[3986]/In[3987]',
      curve:['Cos[u]','Sin[u]'],leftRuling:['-Cos[u]','-Sin[u]'],foldAngle:'k*u',
      returnedFunctions:['f','rL','rR'],rulingAmplitudePreserved:true,coordinateUnit:'mm',coordinateTransform:'identity',
      originalCoordinateUnit:'unspecified',localCoordinateConvention:'1 original planar coordinate unit = 1 mm; no scaling or translation',
      localChoices:['finite positive ruling coefficients','end caps','linear chord sampling','U assignment','optional A ruling guides'],
      originalDefinesPaperBoundary:false,originalDefinesMV:false},
    intrinsicDomain:{method:'circle-polar-chart-closed-form',leftSignedJacobianLowerBound:1-p.leftWidth,
      rightSignedJacobianUpperBound:-b0,leftNormalSign:1,rightNormalSign:-1,
      radiusSeparation:'left:1-v<1; right:sqrt(1+2*v*b+v^2)>1; common crease at v=0',
      rightInjectivity:'b(u) strictly increases; fixed radius has one v, a connected feasible u interval and strictly increasing polar angle',
      polarAngleRange:[p.parameterStart-Math.PI/2,p.parameterEnd],polarAngleSpanLessThanPi:true,
      derivativeBounds:{deltaPrimeUpper:.5,absoluteDeltaSecondUpper:.25,rightRulingSecondNormUpper:2.5},
      globallyInjective:true,flatPaperCoordinates:true},sampling,topology,
    evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,flatFold:false,layerOrder:false,
      threeDimensionalInitialCondition:false,isometryTo3D:false,continuousMotion:false,collisionFree:false}}};
  validateDoc(doc);return doc;
}

/** Read saved source choices for deliberate regeneration; hand-edited CPs retain their recipe. */
export function readBoundedAcrossRecipe(doc:Doc):BoundedAcrossRecipe|null{
  try{const value=doc.metadata?.originalAcross2D;if(!object(value)||value.schema!==SCHEMA)return null;
    return validateBoundedAcrossRecipe(value.recipe);}catch{return null;}
}
/** One current-document session only. No geometry mutation, storage, or unbounded preference map. */
let explicitAuxiliarySession:{segments:Doc['segments'];content:string;enabled:boolean}|null=null;
const processingContent=(doc:Doc)=>JSON.stringify({paper:doc.paper,segments:doc.segments,source:doc.metadata?.originalAcross2D});
/** Original ruling guides default excluded; keep only this current CP's explicit A choice. */
export function boundedAcrossProcessingSettings(doc:Doc):ProcessingSettingsDraft{
  const settings=defaultProcessingSettings();
  if(!boundedAcrossSourceMatches(doc)){explicitAuxiliarySession=null;return settings;}
  const content=processingContent(doc);
  if(explicitAuxiliarySession?.segments!==doc.segments||explicitAuxiliarySession.content!==content)explicitAuxiliarySession=null;
  settings.A.enabled=explicitAuxiliarySession?.enabled??false;return settings;
}
export function rememberBoundedAcrossAuxiliaryChoice(doc:Doc,enabled:boolean):boolean{
  if(typeof enabled!=='boolean'||!boundedAcrossSourceMatches(doc))return false;
  explicitAuxiliarySession={segments:doc.segments,content:processingContent(doc),enabled};return true;
}
/** A saved recipe is not a certificate for subsequently hand-edited geometry. */
export function boundedAcrossSourceMatches(doc:Doc):boolean{
  try{const recipe=readBoundedAcrossRecipe(doc);if(!recipe)return false;const expected=boundedAcross2DDocument(recipe);
    return sameSourceEvidence(doc.metadata?.originalAcross2D,expected.metadata?.originalAcross2D)&&
      sameSegments(doc.segments,expected.segments)&&sameDerivedPaper(doc,expected);
  }catch{return false;}
}
