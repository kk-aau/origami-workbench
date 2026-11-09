import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import {api} from './api';
import {makeGenericDarbouxEvaluator,matchesInitialFrameCompatibility,type InitialFrameCompatibility} from './curvedNativeGenericDarboux';
import type {GenericFoldFlattenResult} from './curvedNativeFoldFlatten';

type Point2=[number,number];type Point3=[number,number,number];
export type GenericFold3DQuery={family:'fold-3d-generic-native';foldCurve:[string,string];
  leftDirector:[string,string];rightDirector:[string,string];parameterStart:number;parameterEnd:number;
  transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number;initialParameter:number;
  initialFoldAngleRad:number;initialPoint:Point3;initialTangent:Point3;initialTopBinormal:Point3};
export const GENERIC_FOLD_3D_PRESET:GenericFold3DQuery={family:'fold-3d-generic-native',foldCurve:['s','s**2/4'],
  leftDirector:['0','2+.1*s'],rightDirector:['4*s*(1+.1*s)*sqrt(1+s**2/4)/(5+s**2)',
    '(s**2-5)*(1+.1*s)*sqrt(1+s**2/4)/(5+s**2)'],parameterStart:0,parameterEnd:1,
  transverseStart:0,transverseEnd:.15,segments:32,rulingSegments:16,initialParameter:0,
  initialFoldAngleRad:-2.214297435588181,initialPoint:[0,0,0],initialTangent:[1,0,0],
  initialTopBinormal:[0,-.8944271909999159,.4472135954999579]};
type SideCoefficient={p:number;q:number;pPrime:number;qPrime:number;normalizedP:number;normalizedQ:number;
  normalizedPPrime:number;normalizedQPrime:number;cotRho:number};
type Row=Omit<GenericFoldFlattenResult['sample']['rows'][number],'coefficients'>&{
  foldAngleRad:number;foldAngleDerivative:number;targetNormal:number[];targetBinormal:number[];targetRightNormal:number[];
  coefficients:{speed:number;normalizedSpeed:number;leftCurvature:number;normalizedLeftCurvature:number;
    curvature:number;normalizedCurvature:number;torsion:number;normalizedTorsion:number;angleCoefficient:number;
    sourceOrientation:number;left:SideCoefficient;right:SideCoefficient}};
type Strip=GenericFoldFlattenResult['domain']['sourceStripRegularity'];
export type GenericFold3DResult={family:'origamica-generic-fold-3d';query:GenericFold3DQuery;
  source:{functions:string[];definitionCells:string[];method:string;initialArgumentOrder:string[];binormalConvention:string;
    directorNormalized:false;interpolationReproduced:false;symbolicSolverReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};initial:{parameter:number;foldAngleRad:number;
    point:number[];tangent:number[];topBinormal:number[];binormal:number[];normal:number[];sourceOrientation:number}&InitialFrameCompatibility;
  diagnostics:{validationNodes:number;maximumFrameResidual:number;maximumLeftRelativeMetricDifference:number;
    maximumRightRelativeMetricDifference:number;maximumLeftRelativeDevelopabilityResidual:number;
    maximumRightRelativeDevelopabilityResidual:number;maximumAngleEquationResidual:number;metricTolerance:number;
    developabilityTolerance:number;integration:GenericFoldFlattenResult['diagnostics']['integration']};
  certification:{finiteLeftMetricVerified:boolean;finiteRightMetricVerified:boolean;finiteDevelopabilityVerified:boolean;
    finiteAngleEquationVerified:boolean;sourceRegularityCertified:boolean;angleBranchCertified:boolean;initialFrameCompatible:boolean;
    sourceLeftStripRegularityCertified:boolean;sourceRightStripRegularityCertified:boolean;
    formalLeftStripRegularityCertified:boolean;formalRightStripRegularityCertified:boolean;formalIsometryCertified:boolean;
    integrationErrorIntervalCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;speedLowerBound:number;
    absoluteCurvatureLowerBound:number;leftTransverseLowerBound:number;rightTransverseLowerBound:number;sourceOrientation:number;
    angleCoefficientBounds:number[];sourceLeftNormalizedJacobianBounds:number[];sourceRightNormalizedJacobianBounds:number[]}[];
    unresolved:number[][];minimumSpeedLowerBound:number|null;minimumAbsoluteCurvatureLowerBound:number|null;
    minimumLeftTransverseLowerBound:number|null;minimumRightTransverseLowerBound:number|null;roundingModel:string;reason:string|null;
    angleBranch:{certified:boolean;method:string;sineHalfAngleBounds:number[]|null;minimumAbsoluteSineHalfAngleLowerBound:number|null;
      minimumAbsoluteCosineHalfAngleLowerBound:number|null;cosineHalfAngleSign:number|null;reason:string|null};
    sourceStripRegularity:Strip;formalStripRegularity:Strip};sample:{rows:Row[]};grid:GenericFoldFlattenResult['grid']};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);const mul=(a:number[],w:number)=>a.map(x=>x*w);
function fail():never{throw Error('平面曲折恢复的原源、折角方程、初值、Frenet轨迹或左右度量回读不一致。');}
export function validateGenericFold3DQuery(raw:unknown):GenericFold3DQuery{
  if(!record(raw)||raw.family!=='fold-3d-generic-native'||!keys(raw,Object.keys(GENERIC_FOLD_3D_PRESET)))
    throw Error('平面曲折恢复的字段或参数类型无效。');
  for(const name of ['foldCurve','leftDirector','rightDirector']){
    if(!Array.isArray(raw[name])||raw[name].length!==2)throw Error('平面折痕及左右母线各需两个完整源表达式。');
    for(const expression of raw[name])compileGenericExpression(expression,'s');}
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('参数域须在−10…10内，跨度0.01–12。');
  if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||
    raw.transverseStart>=raw.transverseEnd)throw Error('母线横向域须为±10⁶内递增有限数。');
  if(!finite(raw.initialParameter)||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd)
    throw Error('初始参数须在完整闭参数域内。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||
    !Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128纵向段、2–64横向段。');
  if(!vector(raw.initialPoint,3)||raw.initialPoint.some(x=>Math.abs(x)>1e12))throw Error('初始空间点须为±10¹²内的三个有限数。');
  if(!vector(raw.initialTangent,3)||!vector(raw.initialTopBinormal,3)||
    Math.abs(Math.hypot(...raw.initialTangent)-1)>1e-10||Math.abs(Math.hypot(...raw.initialTopBinormal)-1)>1e-10||
    Math.abs(dot(raw.initialTangent,raw.initialTopBinormal))>1e-10)throw Error('原初始切向与顶面副法向须为正交单位向量。');
  if(!finite(raw.initialFoldAngleRad)||Math.abs(raw.initialFoldAngleRad)>100||
    raw.initialFoldAngleRad===Math.PI*Math.round(raw.initialFoldAngleRad/Math.PI))throw Error('原初始折角须为±100弧度内、避开Cot／Sec半角极点的有限数。');
  return {...raw,foldCurve:raw.foldCurve.slice(),leftDirector:raw.leftDirector.slice(),rightDirector:raw.rightDirector.slice(),
    initialPoint:raw.initialPoint.slice(),initialTangent:raw.initialTangent.slice(),initialTopBinormal:raw.initialTopBinormal.slice()} as GenericFold3DQuery;
}
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]);const tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);

/** Original signed planar source jets, independent of the numerical Frenet trajectory. */
export function makeGenericFold3DSource(input:unknown){
  const q=validateGenericFold3DQuery(input),f=q.foldCurve.map(s=>compileGenericExpression(s,'s')),
    directors=[q.leftDirector,q.rightDirector].map(side=>side.map(s=>compileGenericExpression(s,'s'))),
    helper=makeGenericDarbouxEvaluator({family:'flatten-generic-native',baseCurve:[...q.foldCurve,'0'],
      director:[...q.leftDirector,'0'],sigma:1,parameterStart:q.parameterStart,parameterEnd:q.parameterEnd,
      transverseStart:q.transverseStart,transverseEnd:q.transverseEnd,segments:q.segments,rulingSegments:q.rulingSegments,
      initialParameter:q.initialParameter,initialPoint:[0,0],initialTangent:[1,0]}),L=helper.normalization.scale;
  const evaluate=(s:number)=>{const variable=new GenericTaylor([s,1,0,0,0]),velocity=f.map(fn=>fn(variable).derivative().div(L)),
    speed=td(velocity,velocity).sqrt(),t=velocity.map(v=>v.div(speed)),l=[t[1].mul(-1),t[0]],acceleration=velocity.map(v=>v.derivative()),
    kappa=velocity[0].mul(acceleration[1]).sub(velocity[1].mul(acceleration[0])).div(speed.pow(3)),
    side=(i:number)=>{const d=directors[i].map(fn=>fn(variable).div(L)),p=td(t,d),qr=td(l,d).mul(i===1?-1:1);
      if(qr.c[0]===0)fail();return {director:tv(d),directorPrime:tp(d),p:p.c[0],q:qr.c[0],pPrime:p.c[1],qPrime:qr.c[1],cotRho:p.c[0]/qr.c[0]};},
    left=side(0),right=side(1),base=helper.evaluate(s).base.slice(0,2),orientation=Math.sign(kappa.c[0]);
    if(!orientation||!finite(speed.c[0])||!(speed.c[0]>0))fail();
    return {s,base,basePrime:tv(velocity),tangent:tv(t),leftNormal:tv(l),speed:speed.c[0],
      kappaL:kappa.c[0],orientation,left,right,angleCoefficient:speed.c[0]*kappa.c[0]*(left.cotRho-right.cotRho)};
  };
  return {query:q,normalization:{sourceOrigin:helper.normalization.sourceOrigin.slice(0,2),targetOrigin:q.initialPoint.slice(),scale:L},evaluate};
}

/** Separate DP54 bilateral replay of the original angle plus Frenet IVP. */
export function makeGenericFold3DReference(input:unknown,nodes:number[]){
  const source=makeGenericFold3DSource(input),q=source.query,cache=new Map<number,ReturnType<typeof source.evaluate>>(),
    at=(s:number)=>{let r=cache.get(s);if(!r){r=source.evaluate(s);cache.set(s,r);}return r;},
    B=mul(q.initialTopBinormal,at(q.initialParameter).orientation),N=cross(B,q.initialTangent),
    initial=[q.initialFoldAngleRad,0,0,0,...q.initialTangent,...N,...B];
  const derivative=(s:number,y:number[])=>{const r=at(s),angle=y[0],half=angle/2,c=Math.cos(half),h=Math.sin(half),
    k=Math.abs(r.kappaL)/c,tau=.5*h/c*r.kappaL*(r.left.cotRho+r.right.cotRho),
    T=y.slice(4,7),normal=y.slice(7,10),binormal=y.slice(10,13);
    return [r.angleCoefficient*h/c,...mul(T,r.speed),...mul(normal,r.speed*k),
      ...add(mul(T,-r.speed*k),mul(binormal,r.speed*tau)),...mul(normal,-r.speed*tau)];};
  const c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
    [19372/6561,-25360/2187,64448/6561,-212/729],
    [9017/3168,-355/33,46732/5247,49/176,-5103/18656],
    [35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40],
    results=new Map<number,number[]>([[q.initialParameter,initial.slice()]]);let budget=0;
  const walk=(ordered:number[])=>{let s=q.initialParameter,y=initial.slice(),step=(q.parameterEnd-q.parameterStart)/32;
    for(const end of ordered){const direction=Math.sign(end-s);if(!direction){results.set(end,y.slice());continue;}step=Math.abs(step)*direction;
      while(direction*(end-s)>0){if(++budget>16384)throw Error('独立Frenet回读超过有限计算预算。');
        if(direction*(s+step-end)>0)step=end-s;if(s+step===s)fail();const stages:number[][]=[];
        for(let k=0;k<7;k++)stages.push(derivative(k===6?s+step:s+c[k]*step,
          y.map((v,i)=>v+step*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0))));
        const high=y.map((v,i)=>v+step*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          small=y.map((v,i)=>v+step*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
        if(!finite(error)||high.some(v=>!finite(v)))fail();if(error<=1){s=direction*(s+step-end)>=0?end:s+step;y=high;}
        step*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));}
      results.set(end,y.slice());}}
  const sorted=[...new Set(nodes)].sort((a,b)=>a-b);walk(sorted.filter(s=>s<q.initialParameter).reverse());walk(sorted.filter(s=>s>=q.initialParameter));
  const target=(s:number)=>{const y=results.get(s);if(!y)fail();const r=at(s),d=derivative(s,y),half=y[0]/2,c=Math.cos(half),h=Math.sin(half),
    T=y.slice(4,7),normal=y.slice(7,10),binormal=y.slice(10,13),TPrime=d.slice(4,7),NPrime=d.slice(7,10),BPrime=d.slice(10,13),
    anglePrime=d[0],leftNormal=mul(add(mul(normal,c),mul(binormal,h)),r.orientation),
    rightNormal=mul(add(mul(normal,c),mul(binormal,-h)),r.orientation),
    leftNormalPrime=mul(add(add(mul(normal,-h*anglePrime/2),mul(NPrime,c)),add(mul(binormal,c*anglePrime/2),mul(BPrime,h))),r.orientation),
    rightNormalPrime=mul(add(add(mul(normal,-h*anglePrime/2),mul(NPrime,c)),add(mul(binormal,-c*anglePrime/2),mul(BPrime,-h))),r.orientation);
    const leftDirector=add(mul(T,r.left.p),mul(leftNormal,r.left.q)),rightDirector=add(mul(T,r.right.p),mul(rightNormal,-r.right.q)),
      leftDirectorPrime=add(add(mul(T,r.left.pPrime),mul(TPrime,r.left.p)),add(mul(leftNormal,r.left.qPrime),mul(leftNormalPrime,r.left.q))),
      rightDirectorPrime=add(add(mul(T,r.right.pPrime),mul(TPrime,r.right.p)),add(mul(rightNormal,-r.right.qPrime),mul(rightNormalPrime,-r.right.q)));
    return {base:y.slice(1,4),basePrime:d.slice(1,4),tangent:T,normal,binormal,leftNormal,rightNormal,
      leftDirector,rightDirector,leftDirectorPrime,rightDirectorPrime,angle:y[0],anglePrime,
      kappa:Math.abs(r.kappaL)/c,torsion:.5*h/c*r.kappaL*(r.left.cotRho+r.right.cotRho)};};
  return {...source,source:at,target};
}

const close=(a:unknown,b:number,tolerance=2e-8)=>finite(a)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
const nearVector=(a:unknown,b:number[],reference=1)=>vector(a,b.length)&&b.every((x,i)=>
  Math.abs(a[i]-x)<=2e-8*Math.max(reference,Math.hypot(...b),Number.MIN_VALUE));
const metric=(bp:number[],d:number[],dp:number[],w:number)=>{const v=add(bp,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricDifference=(a:number[],b:number[])=>{
  const E=Math.max(Math.abs(a[0]),Math.abs(b[0])),G=Math.max(Math.abs(a[2]),Math.abs(b[2]));
  return Math.max(...a.map((x,i)=>Math.abs(x-b[i])/Math.max([E,Math.sqrt(E)*Math.sqrt(G),G][i],Number.MIN_VALUE)));
};
const neverCertified=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
const rowFields=['s','foldAngleRad','foldAngleDerivative','sourceBase','sourceLeftDirector','sourceRightDirector','sourceBaseDerivative',
  'sourceLeftDirectorDerivative','sourceRightDirectorDerivative','targetBase','targetLeftDirector','targetRightDirector','targetBaseDerivative',
  'targetLeftDirectorDerivative','targetRightDirectorDerivative','normalizedSourceBase','normalizedSourceLeftDirector','normalizedSourceRightDirector',
  'normalizedSourceBaseDerivative','normalizedSourceLeftDirectorDerivative','normalizedSourceRightDirectorDerivative','normalizedTargetBase',
  'normalizedTargetLeftDirector','normalizedTargetRightDirector','normalizedTargetBaseDerivative','normalizedTargetLeftDirectorDerivative',
  'normalizedTargetRightDirectorDerivative','targetTangent','targetNormal','targetBinormal','targetLeftNormal','targetRightNormal','coefficients'];
const gridFields=['s','sourceLeft','sourceRight','targetLeft','targetRight','normalizedSourceLeft','normalizedSourceRight',
  'normalizedTargetLeft','normalizedTargetRight','sourceLeftEFG','sourceRightEFG','targetLeftEFG','targetRightEFG'];
const coefficientFields=['speed','normalizedSpeed','leftCurvature','normalizedLeftCurvature','curvature','normalizedCurvature',
  'torsion','normalizedTorsion','angleCoefficient','sourceOrientation','left','right'];
const sideFields=['p','q','pPrime','qPrime','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','cotRho'];
const cellFields=['start','end','speedLowerBound','absoluteCurvatureLowerBound','leftTransverseLowerBound','rightTransverseLowerBound',
  'sourceOrientation','angleCoefficientBounds','sourceLeftNormalizedJacobianBounds','sourceRightNormalizedJacobianBounds'];

export function parseGenericFold3DResult(raw:unknown,requested?:unknown):GenericFold3DResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid'])||
    raw.family!=='origamica-generic-fold-3d')fail();const q=validateGenericFold3DQuery(raw.query);
  if(requested){const wanted=validateGenericFold3DQuery(requested);if(Object.keys(q).some(k=>
    JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(wanted[k as keyof typeof wanted])))fail();}
  const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),
    ref=makeGenericFold3DReference(q,[...parameters,...validation,q.initialParameter]),norm=ref.normalization,L=norm.scale,
    world=(a:unknown,b:number[],origin:number[]|null,reference=1)=>vector(a,b.length)&&b.every((x,i)=>{
      const expected=(origin?.[i]??0)+L*x;return Math.abs(a[i]-expected)<=Math.max(2e-8*L*reference,4*Number.EPSILON*Math.abs(expected));});
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||
    !close(raw.normalization.scale/L,1,2e-12)||!world(raw.normalization.sourceOrigin,[0,0],norm.sourceOrigin)||
    !world(raw.normalization.targetOrigin,[0,0,0],norm.targetOrigin))fail();
  const source=raw.source;
  if(!record(source)||!keys(source,['functions','definitionCells','method','initialArgumentOrder','binormalConvention','directorNormalized',
    'interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
    JSON.stringify(source.functions)!==JSON.stringify(['FoldCurvedFold3D','NFoldCurvedFold3D'])||
    JSON.stringify(source.definitionCells)!==JSON.stringify(['In[3972]','In[3977]'])||
    JSON.stringify(source.initialArgumentOrder)!==JSON.stringify(['ui','gammai','ffi','tti','bbti'])||
    source.method!=='whitelist-AST/Taylor/original-angle-Frenet-DOP853'||
    source.binormalConvention!=='B(ui)=Sign(kappaL(ui))*bbti;N(ui)=B(ui).cross(tti)'||source.metricConvention!=='normalized-s/world-w'||
    ['directorNormalized','interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
  const initial=raw.initial,orientation=ref.source(q.initialParameter).orientation,B=mul(q.initialTopBinormal,orientation);
  if(!record(initial)||!keys(initial,['parameter','foldAngleRad','point','tangent','topBinormal','binormal','normal','sourceOrientation',
    'frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||
    !close(initial.parameter,q.initialParameter,1e-12)||!close(initial.foldAngleRad,q.initialFoldAngleRad,1e-12)||
    !world(initial.point,[0,0,0],norm.targetOrigin)||!nearVector(initial.tangent,q.initialTangent)||
    !nearVector(initial.topBinormal,q.initialTopBinormal)||!nearVector(initial.binormal,B)||!nearVector(initial.normal,cross(B,q.initialTangent))||
    !matchesInitialFrameCompatibility(initial,[q.initialTangent,cross(B,q.initialTangent),B])||
    initial.sourceOrientation!==orientation||!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||
    raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
  const d=raw.diagnostics,c=raw.certification,domain=raw.domain;
  const maximaFields=['maximumFrameResidual','maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference',
    'maximumLeftRelativeDevelopabilityResidual','maximumRightRelativeDevelopabilityResidual','maximumAngleEquationResidual'];
  if(!record(d)||!keys(d,['validationNodes',...maximaFields,'metricTolerance','developabilityTolerance','integration'])||
    d.validationNodes!==129||d.metricTolerance!==2e-8||d.developabilityTolerance!==2e-9||maximaFields.some(k=>!finite(d[k])||d[k]<0))fail();
  const integration=d.integration;
  if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','backwardEvaluations',
    'forwardEvaluations','integrationErrorIntervalCertified'])||integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||
    integration.absoluteTolerance!==2e-14||integration.initialParameter!==q.initialParameter||integration.integrationErrorIntervalCertified!==false||
    ['backwardEvaluations','forwardEvaluations'].some(k=>!Number.isInteger(integration[k])||integration[k]<0))fail();
  const certFields=['finiteLeftMetricVerified','finiteRightMetricVerified','finiteDevelopabilityVerified','finiteAngleEquationVerified',
    'sourceRegularityCertified','angleBranchCertified','initialFrameCompatible','sourceLeftStripRegularityCertified','sourceRightStripRegularityCertified',
    'formalLeftStripRegularityCertified','formalRightStripRegularityCertified','formalIsometryCertified',...neverCertified];
  if(!record(c)||!keys(c,certFields)||Object.values(c).some(v=>typeof v!=='boolean')||neverCertified.some(k=>c[k]!==false))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved','minimumSpeedLowerBound',
    'minimumAbsoluteCurvatureLowerBound','minimumLeftTransverseLowerBound','minimumRightTransverseLowerBound','roundingModel','reason',
    'angleBranch','sourceStripRegularity','formalStripRegularity'])||typeof domain.certified!=='boolean'||
    !Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||
    !Array.isArray(domain.unresolved)||domain.verifiedCells!==domain.cells.length||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==null&&typeof domain.reason!=='string')fail();
  const intervals:number[][]=[];
  for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellFields)||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    cell.start<q.initialParameter&&cell.end>q.initialParameter||cell.sourceOrientation!==orientation||
    cellFields.filter(k=>k.endsWith('LowerBound')).some(k=>!finite(cell[k])||cell[k]<=0)||
    cellFields.filter(k=>k.endsWith('Bounds')).some(k=>!vector(cell[k],2)||cell[k][0]>cell[k][1]))fail();intervals.push([cell.start,cell.end]);}
  for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();intervals.push(pair);}
  intervals.sort((a,b)=>a[0]-b[0]);if(!intervals.length||!close(intervals[0][0],q.parameterStart,1e-12)||
    !close(intervals.at(-1)![1],q.parameterEnd,1e-12)||intervals.some((x,i)=>i>0&&!close(intervals[i-1][1],x[0],1e-12))||
    domain.certified!==(domain.unresolved.length===0)||intervals.length>domain.evaluations)fail();
  for(const [global,local]of [['minimumSpeedLowerBound','speedLowerBound'],['minimumAbsoluteCurvatureLowerBound','absoluteCurvatureLowerBound'],
    ['minimumLeftTransverseLowerBound','leftTransverseLowerBound'],['minimumRightTransverseLowerBound','rightTransverseLowerBound']]){
    if(domain.certified){const value=Math.min(...domain.cells.map((cell:Record<string,number>)=>cell[local]));
      if(!finite(domain[global])||domain[global]<=0||Math.abs(domain[global]-value)>2e-12*value)fail();}
    else if(domain[global]!==null)fail();}
  const angle=domain.angleBranch;
  if(!record(angle)||!keys(angle,['certified','method','sineHalfAngleBounds','minimumAbsoluteSineHalfAngleLowerBound',
    'minimumAbsoluteCosineHalfAngleLowerBound','cosineHalfAngleSign','reason'])||typeof angle.certified!=='boolean'||
    angle.method!=='interval-integral-of-source-A/sine-half-angle-exponential'||angle.reason!==null&&typeof angle.reason!=='string'||
    angle.cosineHalfAngleSign!==Math.sign(Math.cos(q.initialFoldAngleRad/2)))fail();
  if(angle.sineHalfAngleBounds!==null&&(!vector(angle.sineHalfAngleBounds,2)||angle.sineHalfAngleBounds[0]>angle.sineHalfAngleBounds[1]))fail();
  if(angle.certified){const bounds=angle.sineHalfAngleBounds;if(!domain.certified||!vector(bounds,2)||bounds[0]<=-1||bounds[1]>=1||
    bounds[0]<=0&&bounds[1]>=0)fail();const zs=Math.min(Math.abs(bounds[0]),Math.abs(bounds[1])),cs=Math.sqrt(1-Math.max(...bounds.map(Math.abs))**2);
    if(!finite(angle.minimumAbsoluteSineHalfAngleLowerBound)||!finite(angle.minimumAbsoluteCosineHalfAngleLowerBound)||
      Math.abs(angle.minimumAbsoluteSineHalfAngleLowerBound-zs)>2e-12*zs||
      Math.abs(angle.minimumAbsoluteCosineHalfAngleLowerBound-cs)>2e-12*cs)fail();
  }else if(angle.minimumAbsoluteSineHalfAngleLowerBound!==null||angle.minimumAbsoluteCosineHalfAngleLowerBound!==null)fail();
  for(const stage of ['source','formal']){const strips=domain[`${stage}StripRegularity`];if(!record(strips)||!keys(strips,['left','right']))fail();
    for(const side of ['left','right']){const p=strips[side];if(!record(p)||!keys(p,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
      !['verified','unknown','degenerate'].includes(p.status)||p.reason!==null&&typeof p.reason!=='string')fail();
      if(stage==='formal'&&!initial.frameCompatible&&p.status!=='unknown')fail();
      if(p.status==='verified'){const bound=`source${side[0].toUpperCase()+side.slice(1)}NormalizedJacobianBounds`;
        if(!domain.certified||stage==='formal'&&!angle.certified||![-1,1].includes(p.orientation)||
          !finite(p.minimumAbsoluteJacobianLowerBound)||p.minimumAbsoluteJacobianLowerBound<=0||
          domain.cells.some((cell:Record<string,any>)=>p.orientation===1?cell[bound][0]<=0:cell[bound][1]>=0))fail();
        const lower=Math.min(...domain.cells.map((cell:Record<string,any>)=>p.orientation===1?cell[bound][0]:-cell[bound][1]));
        if(Math.abs(p.minimumAbsoluteJacobianLowerBound-lower)>2e-12*lower)fail();
      }else if(p.orientation!==null||p.minimumAbsoluteJacobianLowerBound!==null)fail();
      if(stage==='formal'&&p.status!=='unknown'&&JSON.stringify(p)!==JSON.stringify(domain.sourceStripRegularity[side]))fail();}}
  const max={frame:0,leftMetric:0,rightMetric:0,leftDevelop:0,rightDevelop:0,angle:0};
  const auditW=Array.from({length:q.rulingSegments+1},(_,i)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*i/q.rulingSegments);
  if(!auditW.includes((q.transverseStart+q.transverseEnd)/2))auditW.push((q.transverseStart+q.transverseEnd)/2);
  const inspect=(s:number)=>{const r=ref.source(s),t=ref.target(s),basis=[t.tangent,t.normal,t.binormal];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)max.frame=Math.max(max.frame,Math.abs(dot(basis[i],basis[j])-(i===j?1:0)));
    max.angle=Math.max(max.angle,Math.abs(t.anglePrime*Math.cos(t.angle/2)/Math.sin(t.angle/2)-r.angleCoefficient)/
      Math.max(Math.abs(r.angleCoefficient),1/(q.parameterEnd-q.parameterStart)));
    if(angle.certified){const z=Math.sin(t.angle/2),bounds=angle.sineHalfAngleBounds;
      if(z<bounds[0]-2e-9||z>bounds[1]+2e-9||Math.sign(Math.cos(t.angle/2))!==angle.cosineHalfAngleSign)fail();}
    for(const side of ['left','right'] as const){const d=t[`${side}Director`],dp=t[`${side}DirectorPrime`],sr=r[side],
      denominator=Math.hypot(...t.basePrime)*Math.hypot(...d)*Math.max(Math.hypot(...dp),Math.hypot(...d)),
      develop=Math.abs(dot(cross(t.basePrime,d),dp))/Math.max(denominator,Number.MIN_VALUE);
      max[side==='left'?'leftDevelop':'rightDevelop']=Math.max(max[side==='left'?'leftDevelop':'rightDevelop'],develop);
      for(const w of auditW){max[side==='left'?'leftMetric':'rightMetric']=Math.max(max[side==='left'?'leftMetric':'rightMetric'],
        metricDifference(metric(r.basePrime,sr.director,sr.directorPrime,w),metric(t.basePrime,d,dp,w)));
        const v=add(r.basePrime,sr.directorPrime,w),jac=v[0]*sr.director[1]-v[1]*sr.director[0];
        for(const cell of domain.cells){if(s<cell.start-1e-12||s>cell.end+1e-12)continue;const bounds=cell[`source${side[0].toUpperCase()+side.slice(1)}NormalizedJacobianBounds`];
          if(jac<bounds[0]-2e-9*Math.max(Math.abs(jac),Math.abs(bounds[0]),Number.MIN_VALUE)||
            jac>bounds[1]+2e-9*Math.max(Math.abs(jac),Math.abs(bounds[1]),Number.MIN_VALUE))fail();}}
    }
    for(const cell of domain.cells){if(s<cell.start-1e-12||s>cell.end+1e-12)continue;
      for(const [name,value]of [['speed',r.speed],['absoluteCurvature',Math.abs(r.kappaL)],
        ['leftTransverse',Math.abs(r.left.q)],['rightTransverse',Math.abs(r.right.q)]] as const){
        const low=cell[`${name}LowerBound`];if(value<low-2e-8*Math.max(value,low))fail();}
      const bounds=cell.angleCoefficientBounds;if(r.angleCoefficient<bounds[0]-2e-9*Math.max(1,Math.abs(bounds[0]))||
        r.angleCoefficient>bounds[1]+2e-9*Math.max(1,Math.abs(bounds[1])))fail();}
    return {r,t};};
  for(const s of validation)inspect(s);
  for(let i=0;i<parameters.length;i++){
    const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],{r,t}=inspect(s);
    if(!record(row)||!keys(row,rowFields)||!close(row.s,s,1e-12)||!close(row.foldAngleRad,t.angle)||
      !close(row.foldAngleDerivative,t.anglePrime)||!record(row.coefficients)||!keys(row.coefficients,coefficientFields))fail();
    const coeff=row.coefficients;
    for(const [name,value,divisor,natural]of [['speed',r.speed,L,r.speed],['normalizedSpeed',r.speed,1,r.speed],
      ['leftCurvature',r.kappaL,1/L,Math.abs(r.kappaL)],['normalizedLeftCurvature',r.kappaL,1,Math.abs(r.kappaL)],
      ['curvature',t.kappa,1/L,Math.abs(t.kappa)],['normalizedCurvature',t.kappa,1,Math.abs(t.kappa)],
      ['torsion',t.torsion,1/L,Math.abs(r.kappaL)],['normalizedTorsion',t.torsion,1,Math.abs(r.kappaL)],
      ['angleCoefficient',r.angleCoefficient,1,Math.max(1,Math.abs(r.angleCoefficient))]] as const)
      if(!finite(coeff[name])||Math.abs(coeff[name]/divisor-value)>2e-8*Math.max(natural,Number.MIN_VALUE))fail();
    if(coeff.sourceOrientation!==r.orientation)fail();
    for(const side of ['left','right'] as const){const e=r[side],a=coeff[side];if(!record(a)||!keys(a,sideFields))fail();
      for(const name of ['p','q','pPrime','qPrime'] as const){const value=e[name],reference=Math.max(Math.hypot(...e.director),
        name.includes('Prime')?Math.hypot(...e.directorPrime):0),normalized=`normalized${name[0].toUpperCase()+name.slice(1)}`;
        if(!finite(a[name])||!finite(a[normalized])||Math.abs(a[name]/L-value)>2e-8*reference||
          Math.abs(a[normalized]-value)>2e-8*reference)fail();}if(!close(a.cotRho,e.cotRho))fail();}
    for(const [name,expected,origin,reference]of [
      ['SourceBase',r.base,norm.sourceOrigin,1],['SourceBaseDerivative',r.basePrime,null,Math.hypot(...r.basePrime)],
      ['TargetBase',t.base,norm.targetOrigin,1],['TargetBaseDerivative',t.basePrime,null,Math.hypot(...t.basePrime)],
      ...(['left','right'] as const).flatMap(side=>{const label=side[0].toUpperCase()+side.slice(1),sr=r[side],d=t[`${side}Director`],dp=t[`${side}DirectorPrime`];
        return [[`Source${label}Director`,sr.director,null,Math.hypot(...sr.director)],
          [`Source${label}DirectorDerivative`,sr.directorPrime,null,Math.max(Math.hypot(...sr.directorPrime),Math.hypot(...sr.director)/(q.parameterEnd-q.parameterStart))],
          [`Target${label}Director`,d,null,Math.hypot(...d)],
          [`Target${label}DirectorDerivative`,dp,null,Math.max(Math.hypot(...dp),Math.hypot(...d)/(q.parameterEnd-q.parameterStart))]];})] as [string,number[],number[]|null,number][]){
      if(!nearVector(row[`normalized${name}`],expected,reference)||!world(row[name[0].toLowerCase()+name.slice(1)],expected,origin,reference))fail();}
    for(const [name,expected]of [['targetTangent',t.tangent],['targetNormal',t.normal],['targetBinormal',t.binormal],
      ['targetLeftNormal',t.leftNormal],['targetRightNormal',t.rightNormal]] as const)if(!nearVector(row[name],expected))fail();
    if(!record(grid)||!keys(grid,gridFields)||!close(grid.s,s,1e-12)||gridFields.filter(k=>k!=='s').some(k=>
      !Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
    for(let j=0;j<=q.rulingSegments;j++){const w=auditW[j];
      for(const side of ['left','right'] as const)for(const stage of ['source','target'] as const){
        const name=stage+side[0].toUpperCase()+side.slice(1),bp=stage==='source'?r.basePrime:t.basePrime,
          b=stage==='source'?r.base:t.base,d=stage==='source'?r[side].director:t[`${side}Director`],
          dp=stage==='source'?r[side].directorPrime:t[`${side}DirectorPrime`],p=add(b,d,w),m=metric(bp,d,dp,w),
          natural=Math.hypot(...bp)+Math.abs(w)*Math.hypot(...dp),dn=Math.hypot(...d),scales=[natural*natural,natural*dn,dn*dn],a=grid[`${name}EFG`][j];
        if(!nearVector(grid[`normalized${name[0].toUpperCase()+name.slice(1)}`][j],p)||
          !world(grid[name][j],p,stage==='source'?norm.sourceOrigin:norm.targetOrigin)||!vector(a,3)||
          m.some((x,k)=>Math.abs(a[k]-x)>2e-8*Math.max(scales[k],Number.MIN_VALUE)))fail();}
    }
  }
  for(const [local,reported]of [['frame','maximumFrameResidual'],['leftMetric','maximumLeftRelativeMetricDifference'],
    ['rightMetric','maximumRightRelativeMetricDifference'],['leftDevelop','maximumLeftRelativeDevelopabilityResidual'],
    ['rightDevelop','maximumRightRelativeDevelopabilityResidual'],['angle','maximumAngleEquationResidual']] as const)
    if(max[local]>d[reported]+2e-8)fail();
  if(c.finiteLeftMetricVerified!==(d.maximumLeftRelativeMetricDifference<=d.metricTolerance)||
    c.finiteRightMetricVerified!==(d.maximumRightRelativeMetricDifference<=d.metricTolerance)||
    c.finiteDevelopabilityVerified!==(Math.max(d.maximumLeftRelativeDevelopabilityResidual,d.maximumRightRelativeDevelopabilityResidual)<=d.developabilityTolerance)||
    c.finiteAngleEquationVerified!==(d.maximumAngleEquationResidual<=d.developabilityTolerance)||c.sourceRegularityCertified!==domain.certified||
    c.initialFrameCompatible!==initial.frameCompatible||c.angleBranchCertified!==angle.certified||
    c.formalIsometryCertified!==(domain.certified&&angle.certified&&initial.frameCompatible))fail();
  for(const stage of ['source','formal'])for(const side of ['left','right'])if(
    c[stage+side[0].toUpperCase()+side.slice(1)+'StripRegularityCertified']!==(domain[`${stage}StripRegularity`][side].status==='verified'))fail();
  return raw as GenericFold3DResult;
}

export async function fetchGenericFold3DWhenIdle(input:GenericFold3DQuery,signal:AbortSignal):Promise<GenericFold3DResult>{
  const query=validateGenericFold3DQuery(input);
  for(let attempt=0;attempt<160;attempt++){
    signal.throwIfAborted();try{
      return parseGenericFold3DResult(await api('tessellation/curved-fold-3d-generic',query,signal),query);
    }catch(cause){
      if(signal.aborted||!(cause instanceof Error)||!/(繁忙|已有镶嵌计算正在进行|busy|正在计算|计算器.*忙|稍后重试)/i.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const finish=()=>{signal.removeEventListener('abort',abort);resolve();},
        abort=()=>{clearTimeout(timer);reject(signal.reason);},timer=setTimeout(finish,300);signal.addEventListener('abort',abort,{once:true});});
    }
  }
  throw Error('镶嵌计算持续繁忙，请稍后重试。');
}
