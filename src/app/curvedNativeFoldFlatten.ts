import {api} from './api';
import {compileGenericExpression} from './curvedGenericLinked';
import {makeGenericDarbouxReference,makeGenericDarbouxEvaluator,validateGenericDarbouxQuery,matchesInitialFrameCompatibility,
  type GenericDarbouxQuery,type GenericDarbouxResult,type InitialFrameCompatibility} from './curvedNativeGenericDarboux';
export type GenericFoldFlattenQuery=Omit<Extract<GenericDarbouxQuery,{family:'flatten-generic-native'}>,
  'family'|'baseCurve'|'director'|'sigma'>&{family:'fold-flatten-generic-native';foldCurve:[string,string,string];
  leftDirector:[string,string,string];rightDirector:[string,string,string]};
export const GENERIC_FOLD_FLATTEN_PRESET:GenericFoldFlattenQuery={family:'fold-flatten-generic-native',
  foldCurve:['sin(s)','s**2/4','1-cos(s)'],leftDirector:['0','2+.1*s','0'],rightDirector:[
    '4*(1+.1*s)*sqrt(1+s**2/4)*sin(s)/(5+s**2)',
    '(1+.1*s)*sqrt(1+s**2/4)*(3+s**2)/(5+s**2)',
    '-4*(1+.1*s)*sqrt(1+s**2/4)*cos(s)/(5+s**2)'],parameterStart:0,parameterEnd:1,
  transverseStart:0,transverseEnd:.15,segments:32,rulingSegments:16,initialParameter:0,initialPoint:[0,0],initialTangent:[1,0]};
type Evidence=GenericDarbouxResult['diagnostics']['sourceDevelopability'];
type Strip=GenericDarbouxResult['domain']['formalStripRegularity'];
type StripMap={left:Strip;right:Strip};
type SideCoefficients={p:number;q:number;pPrime:number;qPrime:number;normalizedP:number;normalizedQ:number;
  normalizedPPrime:number;normalizedQPrime:number;g:number};
export type GenericFoldFlattenRow={s:number;sourceBase:number[];sourceLeftDirector:number[];sourceRightDirector:number[];
  sourceBaseDerivative:number[];sourceLeftDirectorDerivative:number[];sourceRightDirectorDerivative:number[];
  targetBase:number[];targetLeftDirector:number[];targetRightDirector:number[];targetBaseDerivative:number[];
  targetLeftDirectorDerivative:number[];targetRightDirectorDerivative:number[];normalizedSourceBase:number[];
  normalizedSourceLeftDirector:number[];normalizedSourceRightDirector:number[];normalizedSourceBaseDerivative:number[];
  normalizedSourceLeftDirectorDerivative:number[];normalizedSourceRightDirectorDerivative:number[];normalizedTargetBase:number[];
  normalizedTargetLeftDirector:number[];normalizedTargetRightDirector:number[];normalizedTargetBaseDerivative:number[];
  normalizedTargetLeftDirectorDerivative:number[];normalizedTargetRightDirectorDerivative:number[];targetTangent:number[];targetLeftNormal:number[];
  coefficients:{speed:number;normalizedSpeed:number;left:SideCoefficients;right:SideCoefficients}};
export type GenericFoldFlattenResult={family:'origamica-generic-fold-flatten';query:GenericFoldFlattenQuery;
  source:{functions:string[];definitionCells:string[];method:string;initialArgumentOrder:string[];rightNormalConvention:string;
    rightDirectorConvention:string;directorNormalized:false;interpolationReproduced:false;symbolicSolverReproduced:false;
    wolframOptionsReproduced:false;metricConvention:string};normalization:GenericDarbouxResult['normalization'];
  initial:{parameter:number;point:number[];tangent:number[]}&InitialFrameCompatibility;diagnostics:{validationNodes:number;maximumFrameResidual:number;
    maximumLeftRelativeMetricDifference:number;maximumRightRelativeMetricDifference:number;leftSourceDevelopability:Evidence;
    rightSourceDevelopability:Evidence;sharedGeodesicCurvature:Evidence;metricTolerance:number;integration:GenericDarbouxResult['diagnostics']['integration']};
  certification:{finiteLeftMetricVerified:boolean;finiteRightMetricVerified:boolean;finiteSourceDevelopabilityVerified:boolean;
    finiteSharedGeodesicCurvatureVerified:boolean;leftSourceDevelopabilityAnalytic:boolean;rightSourceDevelopabilityAnalytic:boolean;
    sharedGeodesicCurvatureAnalytic:boolean;sourceRegularityCertified:boolean;initialFrameCompatible:boolean;sourceLeftStripRegularityCertified:boolean;
    sourceRightStripRegularityCertified:boolean;formalLeftStripRegularityCertified:boolean;formalRightStripRegularityCertified:boolean;
    formalCommonFlatteningCertified:boolean;integrationErrorIntervalCertified:false;globalInjectivityChecked:false;
    selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;speedLowerBound:number;
    leftTransverseLowerBound:number;rightTransverseLowerBound:number;leftDirectorLengthLowerBound:number;rightDirectorLengthLowerBound:number;
    sourceLeftNormalizedJacobianBounds:number[];sourceRightNormalizedJacobianBounds:number[];
    formalLeftNormalizedJacobianBounds:number[];formalRightNormalizedJacobianBounds:number[]}[];
    unresolved:number[][];minimumSpeedLowerBound:number|null;minimumLeftTransverseLowerBound:number|null;
    minimumRightTransverseLowerBound:number|null;roundingModel:string;reason:string|null;
    sourceStripRegularity:StripMap;formalStripRegularity:StripMap};sample:{rows:GenericFoldFlattenRow[]};
  grid:{s:number;sourceLeft:number[][];sourceRight:number[][];targetLeft:number[][];targetRight:number[][];
    normalizedSourceLeft:number[][];normalizedSourceRight:number[][];normalizedTargetLeft:number[][];normalizedTargetRight:number[][];
    sourceLeftEFG:number[][];sourceRightEFG:number[][];targetLeftEFG:number[][];targetRightEFG:number[][]}[]};

const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const keys=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const vector=(v:unknown,n:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(finite);
const close=(a:number,b:number,tol=2e-8)=>finite(a)&&finite(b)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b));
const vec=(a:unknown,b:number[],reference=1)=>vector(a,b.length)&&b.every((x,i)=>Math.abs(a[i]-x)<=2e-8*Math.max(reference,Math.hypot(...b),Number.MIN_VALUE));
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);
const mul=(a:number[],w:number)=>a.map(x=>x*w);
function fail():never{throw Error('双侧曲折展开的原源、左右母线、共有曲率或恢复轨迹回读不一致。');}
function mappedQuery(q:GenericFoldFlattenQuery,right=false):GenericDarbouxQuery{
  const {foldCurve,leftDirector,rightDirector,family:_,...rest}=q;
  return {...rest,family:'flatten-generic-native',baseCurve:foldCurve,director:right?rightDirector:leftDirector,sigma:right?-1:1};
}
export function validateGenericFoldFlattenQuery(raw:unknown):GenericFoldFlattenQuery{
  if(!record(raw)||raw.family!=='fold-flatten-generic-native'||!keys(raw,Object.keys(GENERIC_FOLD_FLATTEN_PRESET)))
    throw Error('双侧曲折展开的参数类型或字段无效。');
  for(const key of ['foldCurve','leftDirector','rightDirector']){if(!Array.isArray(raw[key])||raw[key].length!==3)
    throw Error('空间折痕及左右母线各需三个完整源表达式。');for(const source of raw[key])compileGenericExpression(source,'s');}
  validateGenericDarbouxQuery(mappedQuery(raw as GenericFoldFlattenQuery));validateGenericDarbouxQuery(mappedQuery(raw as GenericFoldFlattenQuery,true));
  return {...raw,foldCurve:raw.foldCurve.slice(),leftDirector:raw.leftDirector.slice(),rightDirector:raw.rightDirector.slice(),
    initialPoint:raw.initialPoint.slice(),initialTangent:raw.initialTangent.slice()} as GenericFoldFlattenQuery;
}
const rowKeys=['s','sourceBase','sourceLeftDirector','sourceRightDirector','sourceBaseDerivative','sourceLeftDirectorDerivative',
  'sourceRightDirectorDerivative','targetBase','targetLeftDirector','targetRightDirector','targetBaseDerivative','targetLeftDirectorDerivative',
  'targetRightDirectorDerivative','normalizedSourceBase','normalizedSourceLeftDirector','normalizedSourceRightDirector','normalizedSourceBaseDerivative',
  'normalizedSourceLeftDirectorDerivative','normalizedSourceRightDirectorDerivative','normalizedTargetBase','normalizedTargetLeftDirector',
  'normalizedTargetRightDirector','normalizedTargetBaseDerivative','normalizedTargetLeftDirectorDerivative','normalizedTargetRightDirectorDerivative',
  'targetTangent','targetLeftNormal','coefficients'];
const sideCoefficientKeys=['p','q','pPrime','qPrime','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','g'];
const gridKeys=['s','sourceLeft','sourceRight','targetLeft','targetRight','normalizedSourceLeft','normalizedSourceRight',
  'normalizedTargetLeft','normalizedTargetRight','sourceLeftEFG','sourceRightEFG','targetLeftEFG','targetRightEFG'];
const cellKeys=['start','end','speedLowerBound','leftTransverseLowerBound','rightTransverseLowerBound','leftDirectorLengthLowerBound',
  'rightDirectorLengthLowerBound','sourceLeftNormalizedJacobianBounds','sourceRightNormalizedJacobianBounds',
  'formalLeftNormalizedJacobianBounds','formalRightNormalizedJacobianBounds'];
const noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
const metric=(b:number[],d:number[],dp:number[],w:number)=>{const v=add(b,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricDifference=(a:number[],b:number[])=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])))/Math.max(...a.map(Math.abs),...b.map(Math.abs),Number.MIN_VALUE);

export function parseGenericFoldFlattenResult(raw:unknown,requested?:unknown):GenericFoldFlattenResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid'])||
    raw.family!=='origamica-generic-fold-flatten')fail();
  const q=validateGenericFoldFlattenQuery(raw.query);
  if(requested){const r=validateGenericFoldFlattenQuery(requested);if(Object.keys(q).some(k=>
    JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(r[k as keyof typeof r])))fail();}
  const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),
    ref=makeGenericDarbouxReference(mappedQuery(q),[...parameters,...validation,q.initialParameter]),
    right=makeGenericDarbouxEvaluator(mappedQuery(q,true)),norm=ref.evaluator.normalization,L=norm.scale;
  const world=(a:unknown,b:number[],origin:number[]|null,reference=1)=>vector(a,b.length)&&b.every((x,i)=>{
    const expected=(origin?.[i]??0)+L*x;return Math.abs(a[i]-expected)<=Math.max(L*reference*2e-8,4*Number.EPSILON*Math.abs(expected));});
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||
    !close(raw.normalization.scale/L,1,2e-12)||!world(raw.normalization.sourceOrigin,[0,0,0],norm.sourceOrigin)||
    !world(raw.normalization.targetOrigin,[0,0],norm.targetOrigin))fail();
  const source=raw.source;
  if(!record(source)||!keys(source,['functions','definitionCells','method','initialArgumentOrder','rightNormalConvention',
    'rightDirectorConvention','directorNormalized','interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
    JSON.stringify(source.functions)!==JSON.stringify(['FlattenFold2D','NFlattenFold2D'])||
    JSON.stringify(source.definitionCells)!==JSON.stringify(['In[3932]','In[3935]'])||
    JSON.stringify(source.initialArgumentOrder)!==JSON.stringify(['ui','fi','ti'])||
    source.method!=='whitelist-AST/Taylor/two-source-Darboux/left-frame-DOP853'||
    source.rightNormalConvention!=='UR=normalize(-T.cross(rrR));LR=UR.cross(T)'||
    source.rightDirectorConvention!=='pR=rrR.dot(T);qR=rrR.dot(LR);rR=pR*t+qR*l'||source.metricConvention!=='normalized-s/world-w'||
    ['directorNormalized','interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
  if(!record(raw.initial)||!keys(raw.initial,['parameter','point','tangent','frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||
    !matchesInitialFrameCompatibility(raw.initial,[q.initialTangent,[-q.initialTangent[1],q.initialTangent[0]]])||!close(raw.initial.parameter,q.initialParameter,1e-12)||
    !world(raw.initial.point,[0,0],norm.targetOrigin)||!vec(raw.initial.tangent,q.initialTangent)||
    !record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||
    !Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
  const d=raw.diagnostics,c=raw.certification,domain=raw.domain;
  if(!record(d)||!keys(d,['validationNodes','maximumFrameResidual','maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference',
    'leftSourceDevelopability','rightSourceDevelopability','sharedGeodesicCurvature','metricTolerance','integration'])||d.validationNodes!==129||
    d.metricTolerance!==2e-8||['maximumFrameResidual','maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference'].some(k=>!finite(d[k])||d[k]<0))fail();
  const evidenceNames=['leftSourceDevelopability','rightSourceDevelopability','sharedGeodesicCurvature'];
  for(const name of evidenceNames){const e=d[name];if(!record(e)||!keys(e,['status','method','analyticIdentity','tolerance','maximumRelativeResidual'])||
    !['analytic','numerical','unknown','incompatible'].includes(e.status)||typeof e.method!=='string'||typeof e.analyticIdentity!=='boolean'||
    e.analyticIdentity!==(e.status==='analytic')||e.tolerance!==2e-9||!finite(e.maximumRelativeResidual)||e.maximumRelativeResidual<0)fail();}
  const integration=d.integration;
  if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','backwardEvaluations',
    'forwardEvaluations','integrationErrorIntervalCertified'])||integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||
    integration.absoluteTolerance!==2e-14||integration.initialParameter!==q.initialParameter||integration.integrationErrorIntervalCertified!==false||
    ['backwardEvaluations','forwardEvaluations'].some(k=>!Number.isInteger(integration[k])||integration[k]<0))fail();
  const certKeys=['finiteLeftMetricVerified','finiteRightMetricVerified','finiteSourceDevelopabilityVerified','finiteSharedGeodesicCurvatureVerified',
    'leftSourceDevelopabilityAnalytic','rightSourceDevelopabilityAnalytic','sharedGeodesicCurvatureAnalytic','sourceRegularityCertified','initialFrameCompatible',
    'sourceLeftStripRegularityCertified','sourceRightStripRegularityCertified','formalLeftStripRegularityCertified',
    'formalRightStripRegularityCertified','formalCommonFlatteningCertified',...noCertificates];
  if(!record(c)||!keys(c,certKeys)||Object.values(c).some(v=>typeof v!=='boolean')||noCertificates.some(k=>c[k]!==false))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved','minimumSpeedLowerBound',
    'minimumLeftTransverseLowerBound','minimumRightTransverseLowerBound','roundingModel','reason','sourceStripRegularity','formalStripRegularity'])||
    typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||
    !Array.isArray(domain.cells)||!Array.isArray(domain.unresolved)||domain.verifiedCells!==domain.cells.length||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==null&&typeof domain.reason!=='string')fail();
  const intervals:number[][]=[];
  for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellKeys)||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    cellKeys.filter(k=>k.endsWith('LowerBound')).some(k=>!finite(cell[k])||cell[k]<=0)||
    cellKeys.filter(k=>k.endsWith('JacobianBounds')).some(k=>!vector(cell[k],2)||cell[k][0]>cell[k][1]))fail();intervals.push([cell.start,cell.end]);}
  for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();intervals.push(pair);}
  intervals.sort((a,b)=>a[0]-b[0]);if(!intervals.length||!close(intervals[0][0],q.parameterStart,1e-12)||
    !close(intervals.at(-1)![1],q.parameterEnd,1e-12)||intervals.some((x,i)=>i>0&&!close(intervals[i-1][1],x[0],1e-12))||
    domain.certified!==(domain.unresolved.length===0)||intervals.length>domain.evaluations)fail();
  for(const [global,local] of [['minimumSpeedLowerBound','speedLowerBound'],['minimumLeftTransverseLowerBound','leftTransverseLowerBound'],
    ['minimumRightTransverseLowerBound','rightTransverseLowerBound']]){
    if(domain.certified){const expected=Math.min(...domain.cells.map((x:Record<string,number>)=>x[local]));
      if(!finite(domain[global])||domain[global]<=0||Math.abs(domain[global]-expected)>2e-12*expected)fail();}
    else if(domain[global]!==null)fail();
  }
  for(const stage of ['source','formal']){const map=domain[`${stage}StripRegularity`];if(!record(map)||!keys(map,['left','right']))fail();
    for(const side of ['left','right']){const p=map[side];if(!record(p)||!keys(p,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
      !['verified','unknown','degenerate'].includes(p.status)||p.reason!==null&&typeof p.reason!=='string')fail();
      if(stage==='formal'&&!raw.initial.frameCompatible&&p.status!=='unknown')fail();
      if(p.status==='verified'){
        const bound=stage+side[0].toUpperCase()+side.slice(1)+'NormalizedJacobianBounds';
        if(!domain.certified||![-1,1].includes(p.orientation)||!finite(p.minimumAbsoluteJacobianLowerBound)||p.minimumAbsoluteJacobianLowerBound<=0||
          domain.cells.some((x:Record<string,any>)=>p.orientation===1?x[bound][0]<=0:x[bound][1]>=0))fail();
        const expected=Math.min(...domain.cells.map((x:Record<string,any>)=>p.orientation===1?x[bound][0]:-x[bound][1]));
        if(Math.abs(p.minimumAbsoluteJacobianLowerBound-expected)>2e-12*expected)fail();
      }else if(p.orientation!==null||p.minimumAbsoluteJacobianLowerBound!==null)fail();
    }
  }
  let maxFrame=0,maxLeftMetric=0,maxRightMetric=0,maxShared=0,maxLeftDevelop=0,maxRightDevelop=0;
  const inspect=(s:number)=>{
    const left=ref.source(s),r=right.evaluate(s),target=ref.target(s),p=-r.p,qr=-r.q,pp=-r.pPrime,qp=-r.qPrime,
      rightTarget=add(mul(target.tangent,p),mul(target.leftNormal,qr)),
      rightTargetPrime=add(mul(target.tangent,pp-qr*left.g),mul(target.leftNormal,qp+p*left.g));
    maxLeftDevelop=Math.max(maxLeftDevelop,left.developability);maxRightDevelop=Math.max(maxRightDevelop,r.developability);
    maxShared=Math.max(maxShared,Math.abs(left.g-r.g)/Math.max(Math.abs(left.g),Math.abs(r.g),1/(q.parameterEnd-q.parameterStart)));
    for(const [a,b,e] of [[target.tangent,target.tangent,1],[target.leftNormal,target.leftNormal,1],[target.tangent,target.leftNormal,0]] as const)
      maxFrame=Math.max(maxFrame,Math.abs(dot(a,b)-e));
    const jac=(v:number,p:number,q:number,pp:number,qp:number,g:number,w:number)=>v*q+w*(q*pp-p*qp-g*(p*p+q*q));
    for(const w of [q.transverseStart,(q.transverseStart+q.transverseEnd)/2,q.transverseEnd]){
      maxLeftMetric=Math.max(maxLeftMetric,metricDifference(metric(left.basePrime,left.director,left.directorPrime,w),
        metric(target.basePrime,target.director,target.directorPrime,w)));
      maxRightMetric=Math.max(maxRightMetric,metricDifference(metric(r.basePrime,r.director,r.directorPrime,w),metric(target.basePrime,rightTarget,rightTargetPrime,w)));
      const js={sourceLeft:jac(left.speed,left.p,left.q,left.pPrime,left.qPrime,left.g,w),
        formalLeft:jac(left.speed,left.p,left.q,left.pPrime,left.qPrime,left.g,w),
        sourceRight:jac(left.speed,p,qr,pp,qp,r.g,w),formalRight:jac(left.speed,p,qr,pp,qp,left.g,w)};
      for(const cell of domain.cells){if(s<cell.start-1e-12||s>cell.end+1e-12)continue;
        for(const [name,value] of [['speed',left.speed],['leftTransverse',Math.abs(left.q)],['rightTransverse',Math.abs(r.q)],
          ['leftDirectorLength',Math.hypot(...left.director)],['rightDirectorLength',Math.hypot(...r.director)]] as const){
          const low=cell[`${name}LowerBound`];if(value<low-2e-8*Math.max(value,low))fail();}
        for(const name of Object.keys(js) as (keyof typeof js)[]){const bounds=cell[`${name}NormalizedJacobianBounds`],value=js[name];
          if(value<bounds[0]-2e-9*Math.max(Math.abs(value),Math.abs(bounds[0]),Number.MIN_VALUE)||
            value>bounds[1]+2e-9*Math.max(Math.abs(value),Math.abs(bounds[1]),Number.MIN_VALUE))fail();}
      }
    }
    return {left,right:r,target,rightTarget,rightTargetPrime,p,qr,pp,qp};
  };
  for(const s of validation)inspect(s);
  for(let i=0;i<parameters.length;i++){
    const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],r=inspect(s);
    if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!record(row.coefficients)||
      !keys(row.coefficients,['speed','normalizedSpeed','left','right'])||
      Math.abs(row.coefficients.speed/L-r.left.speed)>2e-8*r.left.speed||
      Math.abs(row.coefficients.normalizedSpeed-r.left.speed)>2e-8*r.left.speed)fail();
    for(const [side,p,qr,pp,qp,g,source] of [['left',r.left.p,r.left.q,r.left.pPrime,r.left.qPrime,r.left.g,r.left],
      ['right',r.p,r.qr,r.pp,r.qp,r.right.g,r.right]] as const){
      const coefficients=row.coefficients[side],expected={p:p*L,q:qr*L,pPrime:pp*L,qPrime:qp*L,
        normalizedP:p,normalizedQ:qr,normalizedPPrime:pp,normalizedQPrime:qp,g};
      if(!record(coefficients)||!keys(coefficients,sideCoefficientKeys))fail();
      for(const name of sideCoefficientKeys){const divisor=['p','q','pPrime','qPrime'].includes(name)?L:1,
        natural=name==='g'?Math.max(1,Math.abs(g)):name.includes('Prime')?Math.max(Math.hypot(...source.directorPrime),
          Math.hypot(...source.director)/(q.parameterEnd-q.parameterStart)):Math.hypot(...source.director);
        if(!finite(coefficients[name])||Math.abs(coefficients[name]/divisor-expected[name as keyof typeof expected]/divisor)>2e-8*natural)fail();}
    }
    for(const [name,expected,origin,directorRef] of [
      ['SourceBase',r.left.base,norm.sourceOrigin,1],['SourceBaseDerivative',r.left.basePrime,null,1],
      ['SourceLeftDirector',r.left.director,null,Math.hypot(...r.left.director)],
      ['SourceRightDirector',r.right.director,null,Math.hypot(...r.right.director)],
      ['SourceLeftDirectorDerivative',r.left.directorPrime,null,Math.hypot(...r.left.director)/(q.parameterEnd-q.parameterStart)],
      ['SourceRightDirectorDerivative',r.right.directorPrime,null,Math.hypot(...r.right.director)/(q.parameterEnd-q.parameterStart)],
      ['TargetBase',r.target.base,norm.targetOrigin,1],['TargetBaseDerivative',r.target.basePrime,null,1],
      ['TargetLeftDirector',r.target.director,null,Math.hypot(...r.target.director)],
      ['TargetRightDirector',r.rightTarget,null,Math.hypot(...r.rightTarget)],
      ['TargetLeftDirectorDerivative',r.target.directorPrime,null,Math.hypot(...r.target.director)/(q.parameterEnd-q.parameterStart)],
      ['TargetRightDirectorDerivative',r.rightTargetPrime,null,Math.hypot(...r.rightTarget)/(q.parameterEnd-q.parameterStart)]] as const){
      const reference=Math.max(directorRef,Math.hypot(...expected));
      if(!vec(row[`normalized${name}`],expected,reference)||!world(row[name[0].toLowerCase()+name.slice(1)],expected,origin,reference))fail();
    }
    if(!vec(row.targetTangent,r.target.tangent)||!vec(row.targetLeftNormal,r.target.leftNormal)||!record(grid)||!keys(grid,gridKeys)||
      !close(grid.s,s,1e-12)||gridKeys.filter(k=>k!=='s').some(k=>!Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
    for(let j=0;j<=q.rulingSegments;j++){
      const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments;
      for(const [name,b,dp,director,origin] of [
        ['sourceLeft',r.left.base,r.left.directorPrime,r.left.director,norm.sourceOrigin],
        ['sourceRight',r.right.base,r.right.directorPrime,r.right.director,norm.sourceOrigin],
        ['targetLeft',r.target.base,r.target.directorPrime,r.target.director,norm.targetOrigin],
        ['targetRight',r.target.base,r.rightTargetPrime,r.rightTarget,norm.targetOrigin]] as const){
        const point=add(b,director,w),bp=name.startsWith('source')?r.left.basePrime:r.target.basePrime,
          m=metric(bp,director,dp,w),natural=Math.hypot(...bp)+Math.abs(w)*Math.hypot(...dp),dn=Math.hypot(...director),
          scale=[natural*natural,natural*dn,dn*dn],actual=grid[`${name}EFG`][j];
        if(!vec(grid[`normalized${name[0].toUpperCase()+name.slice(1)}`][j],point)||!world(grid[name][j],point,origin)||
          !vector(actual,3)||m.some((x,k)=>Math.abs(actual[k]-x)>2e-8*Math.max(scale[k],Number.MIN_VALUE)))fail();
      }
      maxLeftMetric=Math.max(maxLeftMetric,metricDifference(grid.sourceLeftEFG[j],grid.targetLeftEFG[j]));
      maxRightMetric=Math.max(maxRightMetric,metricDifference(grid.sourceRightEFG[j],grid.targetRightEFG[j]));
    }
  }
  if(maxFrame>2e-7||maxFrame>d.maximumFrameResidual+2e-8||
    maxLeftMetric>d.maximumLeftRelativeMetricDifference+2e-8||maxRightMetric>d.maximumRightRelativeMetricDifference+2e-8||
    maxLeftDevelop>d.leftSourceDevelopability.maximumRelativeResidual+2e-10||maxRightDevelop>d.rightSourceDevelopability.maximumRelativeResidual+2e-10||
    maxShared>d.sharedGeodesicCurvature.maximumRelativeResidual+2e-10)fail();
  if(c.finiteLeftMetricVerified!==(d.maximumLeftRelativeMetricDifference<=d.metricTolerance)||
    c.finiteRightMetricVerified!==(d.maximumRightRelativeMetricDifference<=d.metricTolerance)||
    c.finiteSourceDevelopabilityVerified!==([d.leftSourceDevelopability,d.rightSourceDevelopability].every(e=>e.maximumRelativeResidual<=e.tolerance))||
    c.finiteSharedGeodesicCurvatureVerified!==(d.sharedGeodesicCurvature.maximumRelativeResidual<=d.sharedGeodesicCurvature.tolerance)||
    c.sourceRegularityCertified!==domain.certified||c.initialFrameCompatible!==raw.initial.frameCompatible||
    c.formalCommonFlatteningCertified!==(domain.certified&&raw.initial.frameCompatible&&evidenceNames.every(k=>d[k].analyticIdentity)))fail();
  for(const [name,e] of [['leftSourceDevelopabilityAnalytic',d.leftSourceDevelopability],['rightSourceDevelopabilityAnalytic',d.rightSourceDevelopability],
    ['sharedGeodesicCurvatureAnalytic',d.sharedGeodesicCurvature]] as const)if(c[name]!==e.analyticIdentity)fail();
  for(const stage of ['source','formal'])for(const side of ['Left','Right']){
    if(c[`${stage}${side}StripRegularityCertified`]!==(domain[`${stage}StripRegularity`][side.toLowerCase()].status==='verified'))fail();}
  return raw as GenericFoldFlattenResult;
}

export async function fetchGenericFoldFlattenWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericFoldFlattenResult>{
  const query=validateGenericFoldFlattenQuery(input);
  while(true){signal?.throwIfAborted();try{return parseGenericFoldFlattenResult(await api('tessellation/curved-fold-flatten-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
