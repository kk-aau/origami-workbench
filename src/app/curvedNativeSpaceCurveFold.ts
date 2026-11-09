import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import type {GenericFoldFlattenResult} from './curvedNativeFoldFlatten';

export type GenericSpaceCurveFoldQuery={family:'space-curve-fold-generic-native';foldCurve:[string,string,string];
  foldAngle:string;orientation:1|-1;parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;
  segments:number;rulingSegments:number};
export const GENERIC_SPACE_CURVE_FOLD_PRESET:GenericSpaceCurveFoldQuery={family:'space-curve-fold-generic-native',
  foldCurve:['sin(s)','s**2/4','1-cos(s)'],foldAngle:'-2*atan(sqrt(4+s**2))',orientation:1,
  parameterStart:0,parameterEnd:1,transverseStart:0,transverseEnd:.15,segments:32,rulingSegments:16};
type SideCoefficient={p:number;q:number;pPrime:number;qPrime:number;normalizedP:number;normalizedQ:number;
  normalizedPPrime:number;normalizedQPrime:number;normalDerivativeLength:number;normalTangentProjection:number;normalLeftProjection:number};
type Row=Omit<GenericFoldFlattenResult['sample']['rows'][number],'coefficients'>&{foldAngleRad:number;foldAngleDerivative:number;
  sourceTangent:number[];sourceNormal:number[];sourceBinormal:number[];sourceLeftNormal:number[];sourceRightNormal:number[];
  sourceLeftSurfaceNormal:number[];sourceRightSurfaceNormal:number[];coefficients:{speed:number;normalizedSpeed:number;
    curvature:number;normalizedCurvature:number;torsion:number;normalizedTorsion:number;g:number;left:SideCoefficient;right:SideCoefficient}};
type Strip=GenericFoldFlattenResult['domain']['sourceStripRegularity'];
type Cell={start:number;end:number;speedLowerBound:number;curvatureLowerBound:number;leftNormalDerivativeLowerBound:number;
  rightNormalDerivativeLowerBound:number;leftSignProjectionLowerBound:number;rightSignProjectionLowerBound:number;leftSign:1|-1;rightSign:1|-1;
  sourceLeftNormalizedJacobianBounds:number[];sourceRightNormalizedJacobianBounds:number[];
  formalLeftNormalizedJacobianBounds:number[];formalRightNormalizedJacobianBounds:number[]};
export type GenericSpaceCurveFoldResult={family:'origamica-generic-space-curve-fold';query:GenericSpaceCurveFoldQuery;
  source:{functions:string[];definitionCells:string[];method:string;argumentOrder:string[];rulingConstruction:string;
    flatteningFunctions:string[];flatteningDefinitionCells:string[];flatteningInitialSource:string;
    interpolationReproduced:false;symbolicSolverReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};
  initial:{parameter:number;point:number[];tangent:number[];argumentOrder:string[]};
  diagnostics:{validationNodes:number;maximumFrameResidual:number;maximumUnitRulingResidual:number;
    maximumLeftRelativeMetricDifference:number;maximumRightRelativeMetricDifference:number;
    maximumLeftRelativeDevelopabilityResidual:number;maximumRightRelativeDevelopabilityResidual:number;
    maximumSharedGeodesicCurvatureResidual:number;metricTolerance:number;developabilityTolerance:number;
    integration:Omit<GenericFoldFlattenResult['diagnostics']['integration'],'backwardEvaluations'>};
  certification:{finiteLeftMetricVerified:boolean;finiteRightMetricVerified:boolean;finiteDevelopabilityVerified:boolean;
    finiteSharedGeodesicCurvatureVerified:boolean;finiteUnitRulingsVerified:boolean;sourceRegularityCertified:boolean;unitRulingsAnalytic:boolean;
    sourceLeftStripRegularityCertified:boolean;sourceRightStripRegularityCertified:boolean;
    formalLeftStripRegularityCertified:boolean;formalRightStripRegularityCertified:boolean;formalCommonFlatteningCertified:boolean;
    integrationErrorIntervalCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:Cell[];unresolved:number[][];
    minimumSpeedLowerBound:number|null;minimumCurvatureLowerBound:number|null;minimumLeftNormalDerivativeLowerBound:number|null;
    minimumRightNormalDerivativeLowerBound:number|null;minimumLeftSignProjectionLowerBound:number|null;minimumRightSignProjectionLowerBound:number|null;
    roundingModel:string;reason:string|null;sourceStripRegularity:Strip;formalStripRegularity:Strip};sample:{rows:Row[]};grid:GenericFoldFlattenResult['grid']};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a:number[],w:number)=>a.map(x=>x*w),
  add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tm=(a:GenericTaylor[],x:number|GenericTaylor)=>a.map(v=>v.mul(x)),tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]),tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);
const sumExact=(numbers:number[])=>{const parts:number[]=[];for(let x of numbers){let i=0;for(let y of parts){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;}parts.length=i;parts.push(x);}
  return parts.reduceRight((s,x)=>s+x,0);};
function fail():never{throw Error('四源空间曲折的原源、Sign/Abs母线、固定展开初值、轨迹或度量回读不一致。');}
export function validateGenericSpaceCurveFoldQuery(raw:unknown):GenericSpaceCurveFoldQuery{
  if(!record(raw)||!keys(raw,Object.keys(GENERIC_SPACE_CURVE_FOLD_PRESET))||raw.family!=='space-curve-fold-generic-native')
    throw Error('四源空间曲折的字段或类型无效。');
  if(!Array.isArray(raw.foldCurve)||raw.foldCurve.length!==3)throw Error('原空间折痕ff须有三个完整源表达式。');
  for(const expression of [...raw.foldCurve,raw.foldAngle])compileGenericExpression(expression,'s');
  if(raw.orientation!==1&&raw.orientation!==-1)throw Error('原方向ς须为固定整数−1或+1。');
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('参数域须在−10…10内，跨度0.01–12。');
  if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||
    raw.transverseStart>=raw.transverseEnd)throw Error('母线横向域须为±10⁶内递增有限数。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||
    raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128纵向段、2–64横向段。');
  return {...raw,foldCurve:raw.foldCurve.slice()} as GenericSpaceCurveFoldQuery;
}

/** Four source jets, original Frenet frame and literal Sign/Abs rulings; no returned geometry is used. */
export function makeGenericSpaceCurveFoldSource(input:unknown){
  const q=validateGenericSpaceCurveFoldQuery(input),curves=q.foldCurve.map(x=>compileGenericExpression(x,'s')),
    angle=compileGenericExpression(q.foldAngle,'s'),variable=(s:number)=>new GenericTaylor([s,1,0,0,0]),
    anchor=curves.map(f=>f.parts(variable(q.parameterStart))),sourceOrigin=anchor.map(p=>sumExact([...p.offsets,p.dynamic.c[0]])),
    scale=Math.max(...Array.from({length:9},(_,i)=>Math.hypot(...curves.map(f=>f.parts(variable(
      q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8)).dynamic.c[1]))))*(q.parameterEnd-q.parameterStart);
  if(!(scale>0)||!finite(scale))fail();
  const evaluate=(s:number)=>{const arg=variable(s),b=curves.map((f,i)=>{const p=f.parts(arg);return new GenericTaylor(p.dynamic.c.map((x,k)=>
    k?x/scale:sumExact([...p.offsets,...anchor[i].offsets.map(v=>-v),x,-anchor[i].dynamic.c[0]])/scale));}),
    bp=b.map(x=>x.derivative()),v=td(bp,bp).sqrt(),t=tm(bp,v.inv()),tPrime=t.map(x=>x.derivative()),
    turn=td(tPrime,tPrime).sqrt(),normal=tm(tPrime,turn.inv()),binormal=tc(t,normal),
    curvature=turn.div(v),torsion=td(normal,binormal.map(x=>x.derivative())).neg().div(v),gamma=angle(arg);
    if(gamma.c[0]===2*Math.PI*Math.round(gamma.c[0]/(2*Math.PI)))fail();
    const [sin,cos]=gamma.div(2).sincos(),side=(right:boolean)=>{
      const sine=right?sin.neg():sin,l=tm(normal.map((x,i)=>x.mul(cos).add(binormal[i].mul(sine))),q.orientation),
        u=tm(normal.map((x,i)=>x.mul(sine).neg().add(binormal[i].mul(cos))),q.orientation),uPrime=u.map(x=>x.derivative()),
        length=td(uPrime,uPrime).sqrt(),A=td(uPrime,t),beta=td(uPrime,l),sign=Math.sign(A.c[0]);
      if(!sign)fail();
      const p=beta.mul((right?1:-1)*sign).div(length).div(scale),qr=A.mul(sign*(right?-1:1)).div(length).div(scale),
        director=t.map((x,i)=>x.mul(p).add(l[i].mul(qr))),g=td(l,tPrime);
      return {director:tv(director),directorPrime:tp(director),leftNormal:tv(l),surfaceNormal:tv(u),
        p:p.c[0],q:qr.c[0],pPrime:p.c[1],qPrime:qr.c[1],g:g.c[0],normalDerivativeLength:length.c[0],
        normalTangentProjection:A.c[0],normalLeftProjection:beta.c[0],sign};};
    return {s,base:tv(b),basePrime:tv(bp),speed:v.c[0],tangent:tv(t),normal:tv(normal),binormal:tv(binormal),
      curvature:curvature.c[0],torsion:torsion.c[0],angle:gamma.c[0],anglePrime:gamma.c[1],left:side(false),right:side(true)};
  };
  return {query:q,normalization:{sourceOrigin,targetOrigin:[1,0],scale},evaluate};
}

/** Independent DP54 replay of NFlattenFold2D with the In[3966] wrapper's fixed initial frame. */
export function makeGenericSpaceCurveFoldReference(input:unknown,nodes:number[]){
  const evaluator=makeGenericSpaceCurveFoldSource(input),q=evaluator.query,cache=new Map<number,ReturnType<typeof evaluator.evaluate>>(),
    source=(s:number)=>{let r=cache.get(s);if(!r){r=evaluator.evaluate(s);cache.set(s,r);}return r;},
    initial=[0,0,0,1,-1,0],results=new Map<number,number[]>([[q.parameterStart,initial.slice()]]),
    derivative=(s:number,y:number[])=>{const r=source(s),t=y.slice(2,4),l=y.slice(4,6);
      return [...mul(t,r.speed),...mul(l,r.left.g),...mul(t,-r.left.g)];},
    c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
      [19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],
      [35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  let s=q.parameterStart,y=initial.slice(),h=(q.parameterEnd-q.parameterStart)/32,budget=0;
  for(const end of [...new Set(nodes)].sort((a,b)=>a-b)){
    if(!finite(end)||end<q.parameterStart||end>q.parameterEnd)fail();
    while(s<end){if(++budget>16384)throw Error('独立空间曲折展开回读超过有限计算预算。');
      if(s+h>end)h=end-s;if(s+h===s)fail();const stages:number[][]=[];
      for(let k=0;k<7;k++){const trial=y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0));
        stages.push(derivative(k===6?s+h:s+c[k]*h,trial));}
      const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),
        small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
        error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
      if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=s+h>=end?end:s+h;y=high;}
      h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
    }results.set(end,y.slice());
  }
  const target=(s:number)=>{const y=results.get(s);if(!y)fail();const r=source(s),t=y.slice(2,4),l=y.slice(4,6),
    side=(i:'left'|'right')=>{const d=r[i];return {director:add(mul(t,d.p),mul(l,d.q)),
      directorPrime:add(mul(t,d.pPrime-d.q*r.left.g),mul(l,d.qPrime+d.p*r.left.g))};};
    return {base:y.slice(0,2),basePrime:mul(t,r.speed),tangent:t,leftNormal:l,left:side('left'),right:side('right')};};
  return {...evaluator,source,target};
}

const close=(x:unknown,y:number,tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(1,Math.abs(x),Math.abs(y));
const nearVector=(x:unknown,y:number[],reference=1)=>vector(x,y.length)&&y.every((v,i)=>
  Math.abs(x[i]-v)<=2e-8*Math.max(reference,Math.hypot(...y),Number.MIN_VALUE));
const metric=(bp:number[],d:number[],dp:number[],w:number)=>{const v=add(bp,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricDifference=(a:number[],b:number[])=>{const E=Math.max(Math.abs(a[0]),Math.abs(b[0])),G=Math.max(Math.abs(a[2]),Math.abs(b[2]));
  return Math.max(...a.map((x,i)=>Math.abs(x-b[i])/Math.max([E,Math.sqrt(E)*Math.sqrt(G),G][i],Number.MIN_VALUE)));};
const noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
const rowKeys=['s','foldAngleRad','foldAngleDerivative','sourceBase','sourceLeftDirector','sourceRightDirector','sourceBaseDerivative',
  'sourceLeftDirectorDerivative','sourceRightDirectorDerivative','targetBase','targetLeftDirector','targetRightDirector','targetBaseDerivative',
  'targetLeftDirectorDerivative','targetRightDirectorDerivative','normalizedSourceBase','normalizedSourceLeftDirector','normalizedSourceRightDirector',
  'normalizedSourceBaseDerivative','normalizedSourceLeftDirectorDerivative','normalizedSourceRightDirectorDerivative','normalizedTargetBase',
  'normalizedTargetLeftDirector','normalizedTargetRightDirector','normalizedTargetBaseDerivative','normalizedTargetLeftDirectorDerivative',
  'normalizedTargetRightDirectorDerivative','sourceTangent','sourceNormal','sourceBinormal','sourceLeftNormal','sourceRightNormal',
  'sourceLeftSurfaceNormal','sourceRightSurfaceNormal','targetTangent','targetLeftNormal','coefficients'];
const gridKeys=['s','sourceLeft','sourceRight','targetLeft','targetRight','normalizedSourceLeft','normalizedSourceRight',
  'normalizedTargetLeft','normalizedTargetRight','sourceLeftEFG','sourceRightEFG','targetLeftEFG','targetRightEFG'];
const sideFields=['p','q','pPrime','qPrime','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime',
  'normalDerivativeLength','normalTangentProjection','normalLeftProjection'];
const localLowers=['speedLowerBound','curvatureLowerBound','leftNormalDerivativeLowerBound','rightNormalDerivativeLowerBound',
  'leftSignProjectionLowerBound','rightSignProjectionLowerBound'];
const globalLowers=localLowers.map(k=>'minimum'+k[0].toUpperCase()+k.slice(1));
const jacobianKeys=['sourceLeft','sourceRight','formalLeft','formalRight'].map(k=>k+'NormalizedJacobianBounds');
const cellKeys=['start','end',...localLowers,'leftSign','rightSign',...jacobianKeys];

export function parseGenericSpaceCurveFoldResult(raw:unknown,requested?:unknown):GenericSpaceCurveFoldResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid'])||
    raw.family!=='origamica-generic-space-curve-fold')fail();const q=validateGenericSpaceCurveFoldQuery(raw.query);
  if(requested){const wanted=validateGenericSpaceCurveFoldQuery(requested);if(Object.keys(q).some(k=>
    JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(wanted[k as keyof typeof wanted])))fail();}
  const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),
    cellMidpoints=record(raw.domain)&&Array.isArray(raw.domain.cells)?raw.domain.cells.map((cell:unknown)=>{
      if(!record(cell)||!finite(cell.start)||!finite(cell.end)||cell.start<q.parameterStart||cell.end>q.parameterEnd||cell.start>=cell.end)fail();
      return (cell.start+cell.end)/2;}):[],
    ref=makeGenericSpaceCurveFoldReference(q,[...parameters,...validation,...cellMidpoints]),norm=ref.normalization,L=norm.scale,
    world=(x:unknown,y:number[],origin:number[]|null,reference=1)=>vector(x,y.length)&&y.every((v,i)=>{
      const expected=(origin?.[i]??0)+L*v;return Math.abs(x[i]-expected)<=Math.max(2e-8*L*reference,4*Number.EPSILON*Math.abs(expected));});
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||
    !close(raw.normalization.scale/L,1,2e-12)||!world(raw.normalization.sourceOrigin,[0,0,0],norm.sourceOrigin)||
    !world(raw.normalization.targetOrigin,[0,0],norm.targetOrigin))fail();
  const source=raw.source;
  if(!record(source)||!keys(source,['functions','definitionCells','method','argumentOrder','rulingConstruction','flatteningFunctions',
    'flatteningDefinitionCells','flatteningInitialSource','interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
    JSON.stringify(source.functions)!=='["FoldSpaceCurve3D","NSpaceCurveFold3D"]'||JSON.stringify(source.definitionCells)!=='["In[3939]","In[3942]"]'||
    source.method!=='whitelist-AST/fourth-order-Frenet/original-sign-abs-rulings/planar-DOP853'||JSON.stringify(source.argumentOrder)!=='["ff","gamma","varsigma"]'||
    source.rulingConstruction!=='literal Sign/Abs(Uprime dot T, Uprime dot L)/norm(Uprime), no extra ruling normalization'||
    JSON.stringify(source.flatteningFunctions)!=='["NFlattenFold2D"]'||JSON.stringify(source.flatteningDefinitionCells)!=='["In[3935]"]'||
    source.flatteningInitialSource!=='NCurvedFoldHelix2D/In[3966]: {u0,{1,0},{0,1}}; explicit generic view extension'||
    source.metricConvention!=='normalized-s/world-w'||['interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
  if(!record(raw.initial)||!keys(raw.initial,['parameter','point','tangent','argumentOrder'])||raw.initial.parameter!==q.parameterStart||
    !nearVector(raw.initial.point,[1,0])||!nearVector(raw.initial.tangent,[0,1])||JSON.stringify(raw.initial.argumentOrder)!=='["ui","fi","ti"]'||
    !record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||
    !Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
  const d=raw.diagnostics,c=raw.certification,domain=raw.domain,maxima=['maximumFrameResidual','maximumUnitRulingResidual',
    'maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference','maximumLeftRelativeDevelopabilityResidual',
    'maximumRightRelativeDevelopabilityResidual','maximumSharedGeodesicCurvatureResidual'];
  if(!record(d)||!keys(d,['validationNodes',...maxima,'metricTolerance','developabilityTolerance','integration'])||d.validationNodes!==129||
    d.metricTolerance!==2e-8||d.developabilityTolerance!==2e-9||maxima.some(k=>!finite(d[k])||d[k]<0))fail();
  const integration=d.integration;
  if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','forwardEvaluations','integrationErrorIntervalCertified'])||
    integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||integration.absoluteTolerance!==2e-14||
    integration.initialParameter!==q.parameterStart||!Number.isInteger(integration.forwardEvaluations)||integration.forwardEvaluations<0||
    integration.integrationErrorIntervalCertified!==false)fail();
  const certKeys=['finiteLeftMetricVerified','finiteRightMetricVerified','finiteDevelopabilityVerified','finiteSharedGeodesicCurvatureVerified',
    'finiteUnitRulingsVerified','sourceRegularityCertified','unitRulingsAnalytic','sourceLeftStripRegularityCertified','sourceRightStripRegularityCertified',
    'formalLeftStripRegularityCertified','formalRightStripRegularityCertified','formalCommonFlatteningCertified',...noCertificates];
  if(!record(c)||!keys(c,certKeys)||Object.values(c).some(v=>typeof v!=='boolean')||noCertificates.some(k=>c[k]!==false))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved',...globalLowers,'roundingModel','reason',
    'sourceStripRegularity','formalStripRegularity'])||typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||
    domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||!Array.isArray(domain.unresolved)||
    domain.verifiedCells!==domain.cells.length||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||
    (domain.reason!==null&&typeof domain.reason!=='string')||domain.certified&&domain.reason!==null)fail();
  const intervals:number[][]=[];
  for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellKeys)||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    localLowers.some(k=>!finite(cell[k])||cell[k]<=0)||![-1,1].includes(cell.leftSign)||![-1,1].includes(cell.rightSign)||
    jacobianKeys.some(k=>!vector(cell[k],2)||cell[k][0]>cell[k][1]))fail();intervals.push([cell.start,cell.end]);}
  for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();intervals.push(pair);}
  intervals.sort((a,b)=>a[0]-b[0]);if(!intervals.length||!close(intervals[0][0],q.parameterStart,1e-12)||
    !close(intervals.at(-1)![1],q.parameterEnd,1e-12)||intervals.some((x,i)=>i>0&&!close(intervals[i-1][1],x[0],1e-12))||
    domain.certified!==(domain.unresolved.length===0)||intervals.length>domain.evaluations)fail();
  for(let i=0;i<localLowers.length;i++){const global=globalLowers[i],local=localLowers[i];
    if(domain.certified){const lower=Math.min(...domain.cells.map((x:Record<string,number>)=>x[local]));
      if(!finite(domain[global])||domain[global]<=0||Math.abs(domain[global]-lower)>2e-12*lower)fail();}else if(domain[global]!==null)fail();}
  for(const stage of ['source','formal']){const map=domain[stage+'StripRegularity'];if(!record(map)||!keys(map,['left','right']))fail();
    for(const side of ['left','right']){const strip=map[side];if(!record(strip)||!keys(strip,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
      !['verified','unknown','degenerate'].includes(strip.status)||strip.reason!==null&&typeof strip.reason!=='string')fail();
      if(strip.status==='verified'){const bound=stage+side[0].toUpperCase()+side.slice(1)+'NormalizedJacobianBounds';
        if(!domain.certified||![-1,1].includes(strip.orientation)||!finite(strip.minimumAbsoluteJacobianLowerBound)||strip.minimumAbsoluteJacobianLowerBound<=0||
          strip.reason!==null||domain.cells.some((cell:Record<string,any>)=>strip.orientation===1?cell[bound][0]<=0:cell[bound][1]>=0))fail();
        const expected=Math.min(...domain.cells.map((cell:Record<string,any>)=>strip.orientation===1?cell[bound][0]:-cell[bound][1]));
        if(Math.abs(strip.minimumAbsoluteJacobianLowerBound-expected)>2e-12*expected)fail();
      }else if(strip.orientation!==null||strip.minimumAbsoluteJacobianLowerBound!==null||typeof strip.reason!=='string')fail();
    }
  }
  let maxFrame=0,maxUnit=0,maxLeftMetric=0,maxRightMetric=0,maxLeftDev=0,maxRightDev=0,maxShared=0;
  const witnesses={sourceLeft:false,sourceRight:false,formalLeft:false,formalRight:false};
  const inspect=(s:number)=>{const r=ref.source(s),t=ref.target(s);
    for(const basis of [[r.tangent,r.normal,r.binormal],[t.tangent,t.leftNormal]])for(let i=0;i<basis.length;i++)for(let j=0;j<basis.length;j++)
      maxFrame=Math.max(maxFrame,Math.abs(dot(basis[i],basis[j])-(i===j?1:0)));
    maxShared=Math.max(maxShared,Math.abs(r.left.g-r.right.g)/Math.max(Math.abs(r.left.g),Math.abs(r.right.g),1/(q.parameterEnd-q.parameterStart)));
    const cell=domain.cells.filter((cell:Record<string,any>)=>cell.start-1e-12<=s&&s<=cell.end+1e-12);
    const values=[r.speed,r.curvature,r.left.normalDerivativeLength,r.right.normalDerivativeLength,
      Math.abs(r.left.normalTangentProjection),Math.abs(r.right.normalTangentProjection)];
    for(const item of cell){for(let i=0;i<localLowers.length;i++)if(values[i]<item[localLowers[i]]-2e-8*Math.max(values[i],item[localLowers[i]]))fail();
      if(item.leftSign!==r.left.sign||item.rightSign!==r.right.sign)fail();}
    for(const side of ['left','right'] as const){const a=r[side],b=t[side],dn=Math.hypot(...a.director),
      dev=Math.abs(dot(a.surfaceNormal,a.directorPrime))/Math.max(dn,Math.hypot(...a.directorPrime),Number.MIN_VALUE);
      maxUnit=Math.max(maxUnit,Math.abs(dn*L-1));if(side==='left')maxLeftDev=Math.max(maxLeftDev,dev);else maxRightDev=Math.max(maxRightDev,dev);
      const jacobians=(w:number)=>({source:dot(cross(add(r.basePrime,a.directorPrime,w),a.director),a.surfaceNormal),
        formal:r.speed*a.q+w*(a.q*a.pPrime-a.p*a.qPrime-r.left.g*(a.p*a.p+a.q*a.q))});
      const ends=[jacobians(q.transverseStart),jacobians(q.transverseEnd)];
      for(const stage of ['source','formal'] as const){const label=(stage+(side==='left'?'Left':'Right')) as keyof typeof witnesses,
        lo=ends[0][stage],hi=ends[1][stage],natural=Math.max(Math.abs(lo),Math.abs(hi),Number.MIN_VALUE),epsilon=1e-10*natural;
        if(lo< -epsilon&&hi>epsilon||hi< -epsilon&&lo>epsilon)witnesses[label]=true;}
      const auditW=Array.from({length:q.rulingSegments+1},(_,j)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments);
      auditW.push((q.transverseStart+q.transverseEnd)/2);
      for(const w of auditW){const difference=metricDifference(metric(r.basePrime,a.director,a.directorPrime,w),metric(t.basePrime,b.director,b.directorPrime,w));
        if(side==='left')maxLeftMetric=Math.max(maxLeftMetric,difference);else maxRightMetric=Math.max(maxRightMetric,difference);
        const js=jacobians(w);for(const item of cell)for(const stage of ['source','formal'] as const){
          const bounds=item[stage+(side==='left'?'Left':'Right')+'NormalizedJacobianBounds'],value=js[stage],epsilon=2e-9*Math.max(
            Math.abs(value),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);
          if(value<bounds[0]-epsilon||value>bounds[1]+epsilon)fail();}
      }
    }return {r,t};};
  for(const s of [...new Set([...validation,...cellMidpoints])])inspect(s);
  for(let i=0;i<parameters.length;i++){
    const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],{r,t}=inspect(s),coef=row?.coefficients;
    if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!close(row.foldAngleRad,r.angle)||!close(row.foldAngleDerivative,r.anglePrime)||
      !record(coef)||!keys(coef,['speed','normalizedSpeed','curvature','normalizedCurvature','torsion','normalizedTorsion','g','left','right']))fail();
    for(const [name,value,factor,natural] of [['speed',r.speed,L,r.speed],['normalizedSpeed',r.speed,1,r.speed],
      ['curvature',r.curvature,1/L,r.curvature],['normalizedCurvature',r.curvature,1,r.curvature],
      ['torsion',r.torsion,1/L,Math.max(r.curvature,Math.abs(r.torsion))],['normalizedTorsion',r.torsion,1,Math.max(r.curvature,Math.abs(r.torsion))],
      ['g',r.left.g,1,Math.max(Math.abs(r.left.g),1/(q.parameterEnd-q.parameterStart))]] as const)
      if(!finite(coef[name])||Math.abs(coef[name]/factor-value)>2e-8*natural)fail();
    for(const side of ['left','right'] as const){const a=r[side],actual=coef[side];if(!record(actual)||!keys(actual,sideFields))fail();
      for(const name of sideFields){const isNormalized=name.startsWith('normalized'),jetName=isNormalized?
        name[10].toLowerCase()+name.slice(11):name,factor=!isNormalized&&['p','q','pPrime','qPrime'].includes(name)?L:1,
        expected=a[jetName as keyof typeof a] as number,natural=['p','q','pPrime','qPrime'].includes(jetName)?Math.max(
          Math.hypot(...a.director),Math.hypot(...a.directorPrime)):Math.max(a.normalDerivativeLength,Math.abs(expected));
        if(!finite(actual[name])||Math.abs(actual[name]/factor-expected)>2e-8*natural)fail();}
    }
    for(const [name,value] of [['sourceTangent',r.tangent],['sourceNormal',r.normal],['sourceBinormal',r.binormal],
      ['sourceLeftNormal',r.left.leftNormal],['sourceRightNormal',r.right.leftNormal],['sourceLeftSurfaceNormal',r.left.surfaceNormal],
      ['sourceRightSurfaceNormal',r.right.surfaceNormal],['targetTangent',t.tangent],['targetLeftNormal',t.leftNormal]] as const)
      if(!nearVector(row[name],value))fail();
    for(const [name,value,origin,natural] of [['SourceBase',r.base,norm.sourceOrigin,1],['SourceBaseDerivative',r.basePrime,null,r.speed],
      ['TargetBase',t.base,norm.targetOrigin,1],['TargetBaseDerivative',t.basePrime,null,r.speed],
      ...(['left','right'] as const).flatMap(side=>{const label=side==='left'?'Left':'Right',a=r[side],b=t[side];return [
        [`Source${label}Director`,a.director,null,1/L],[`Source${label}DirectorDerivative`,a.directorPrime,null,Math.max(1/L,Math.hypot(...a.directorPrime))],
        [`Target${label}Director`,b.director,null,1/L],[`Target${label}DirectorDerivative`,b.directorPrime,null,Math.max(1/L,Math.hypot(...b.directorPrime))]] as const;})
      ] as readonly (readonly [string,number[],number[]|null,number])[]){
      if(!nearVector(row['normalized'+name],value,natural)||!world(row[name[0].toLowerCase()+name.slice(1)],value,origin,natural))fail();}
    if(!record(grid)||!keys(grid,gridKeys)||!close(grid.s,s,1e-12)||gridKeys.filter(k=>k!=='s').some(k=>
      !Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
    for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments;
      for(const stage of ['source','target'])for(const side of ['left','right'] as const){const label=stage+(side==='left'?'Left':'Right'),
        base=stage==='source'?r.base:t.base,bp=stage==='source'?r.basePrime:t.basePrime,a=stage==='source'?r[side]:t[side],
        point=add(base,a.director,w),m=metric(bp,a.director,a.directorPrime,w),bn=Math.hypot(...bp)+Math.abs(w)*Math.hypot(...a.directorPrime),
        dn=Math.hypot(...a.director),natural=[bn*bn,bn*dn,dn*dn],actual=grid[label+'EFG'][j],reference=Math.max(1,Math.hypot(...point));
        if(!nearVector(grid['normalized'+label[0].toUpperCase()+label.slice(1)][j],point,reference)||
          !world(grid[label][j],point,stage==='source'?norm.sourceOrigin:norm.targetOrigin,reference)||!vector(actual,3)||
          m.some((v,k)=>Math.abs(actual[k]-v)>2e-8*Math.max(natural[k],Number.MIN_VALUE)))fail();
      }
    }
  }
  if(maxFrame>2e-7||maxFrame>d.maximumFrameResidual+2e-8||maxUnit>d.maximumUnitRulingResidual+2e-9||
    maxLeftMetric>d.maximumLeftRelativeMetricDifference+2e-8||maxRightMetric>d.maximumRightRelativeMetricDifference+2e-8||
    maxLeftDev>d.maximumLeftRelativeDevelopabilityResidual+2e-9||maxRightDev>d.maximumRightRelativeDevelopabilityResidual+2e-9||
    maxShared>d.maximumSharedGeodesicCurvatureResidual+2e-9)fail();
  if(c.finiteLeftMetricVerified!==(d.maximumLeftRelativeMetricDifference<=d.metricTolerance)||
    c.finiteRightMetricVerified!==(d.maximumRightRelativeMetricDifference<=d.metricTolerance)||
    c.finiteDevelopabilityVerified!==(Math.max(d.maximumLeftRelativeDevelopabilityResidual,d.maximumRightRelativeDevelopabilityResidual)<=d.developabilityTolerance)||
    c.finiteSharedGeodesicCurvatureVerified!==(d.maximumSharedGeodesicCurvatureResidual<=d.developabilityTolerance)||
    c.finiteUnitRulingsVerified!==(d.maximumUnitRulingResidual<=d.developabilityTolerance)||c.sourceRegularityCertified!==domain.certified||
    c.unitRulingsAnalytic!==domain.certified||c.formalCommonFlatteningCertified!==domain.certified)fail();
  for(const stage of ['source','formal'])for(const side of ['Left','Right']){const strip=domain[stage+'StripRegularity'][side.toLowerCase()],
    label=(stage+side) as keyof typeof witnesses;if(c[label+'StripRegularityCertified']!==(strip.status==='verified')||
      witnesses[label]&&strip.status!=='degenerate')fail();}
  return raw as GenericSpaceCurveFoldResult;
}

export async function fetchGenericSpaceCurveFoldWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericSpaceCurveFoldResult>{
  const query=validateGenericSpaceCurveFoldQuery(input);
  while(true){signal?.throwIfAborted();try{return parseGenericSpaceCurveFoldResult(await api('tessellation/curved-space-curve-fold-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
