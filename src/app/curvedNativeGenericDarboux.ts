import {api} from './api';
import {uniformPolynomial} from './curvedUniformResample';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import {validateNDSolveStepOptions,validateNDSolveStepStamp,type NDSolveStepOptions,type NDSolveStepStamp} from './curvedNDSolveOptions';

type Vector3=[number,number,number];
export type InitialFrameCompatibility={frameGramResidual:number;frameCompatibilityTolerance:number;frameCompatible:boolean};
type CommonQuery={baseCurve:[string,string,string];director:[string,string,string];sigma:1|-1;
  parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;
  segments:number;rulingSegments:number;initialParameter:number;resample?:boolean;interpolationPoints?:number;interpolationOrder?:1|2|3|4;ndsolveOptions?:NDSolveStepOptions};
export type GenericDarbouxQuery=CommonQuery&({family:'flatten-generic-native';initialPoint:[number,number];initialTangent:[number,number]}|
  {family:'reshape-generic-native';normalCurvature:string;initialPoint:Vector3;initialDirector:Vector3;initialTangent:Vector3});
export const GENERIC_DARBOUX_FLATTEN_PRESET:GenericDarbouxQuery={family:'flatten-generic-native',
  baseCurve:['s','.1*s**2','.2*s**3'],director:['0','0','1'],sigma:1,parameterStart:0,parameterEnd:1,
  transverseStart:-.2,transverseEnd:.2,segments:32,rulingSegments:16,initialParameter:0,initialPoint:[0,0],initialTangent:[1,0]};
export const GENERIC_DARBOUX_RESHAPE_PRESET:GenericDarbouxQuery={family:'reshape-generic-native',
  baseCurve:['s+.4','.2*s**2+.16*s','.1*s**3+.12*s**2'],director:[
    '(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
    '.4*s*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
    '.3*s**2*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)'],
  normalCurvature:'.05+.02*sin(s)',sigma:1,parameterStart:0,parameterEnd:1,
  transverseStart:-.1,transverseEnd:.1,segments:32,rulingSegments:16,initialParameter:0,
  initialPoint:[0,0,0],initialTangent:[1,0,0],initialDirector:[0.9874406319167053,0.15799050110667284,0]};

export type GenericDarbouxRow={s:number;sourceBase:number[];sourceDirector:number[];sourceBaseDerivative:number[];
  sourceDirectorDerivative:number[];targetBase:number[];targetDirector:number[];targetBaseDerivative:number[];
  targetDirectorDerivative:number[];normalizedSourceBase:number[];normalizedSourceDirector:number[];
  normalizedSourceBaseDerivative:number[];normalizedSourceDirectorDerivative:number[];normalizedTargetBase:number[];
  normalizedTargetDirector:number[];normalizedTargetBaseDerivative:number[];normalizedTargetDirectorDerivative:number[];
  targetTangent:number[];targetLeftNormal:number[];targetNormal:number[]|null;coefficients:{speed:number;p:number;q:number;
    pPrime:number;qPrime:number;normalizedSpeed:number;normalizedP:number;normalizedQ:number;
    normalizedPPrime:number;normalizedQPrime:number;g:number;h:number;z:number}};
export type GenericResampling={function:'FunctionInterpolationAlt';definitionCell:'In[124]';
  options:{Resample:true;InterpolationPoints:number;InterpolationOrder:1|2|3|4};method:string;derivativeConvention:string;
  explicitUniformLinearSubsetReproduced:boolean;underlyingAdaptiveInterpolationReproduced:false;defaultInterpolationReproduced:false;stages:string[];
  parameters:number[];normalizedBase:number[][];tangent:number[][];leftNormal:number[][];normalizedDirector:number[][];
  initialNormalizedPointResidual:number;initialTangentResidual:number;polynomial?:{degree:number;stencil:string;continuity:string;
    normalizedBaseDerivativeJump:number;normalizedDirectorDerivativeJump:number;frameDerivativeJump:number;auditedKnotSides:number;
    wolframDefaultAlgorithmReproduced:false;originalAutomaticPointsReproduced:false}};
export type GenericDarbouxResult={family:'origamica-generic-darboux';query:GenericDarbouxQuery;resampling?:GenericResampling;
  source:{functions:string[];definitionCells:string[];method:string;initialArgumentOrder:string[];
    directorNormalized:false;interpolationReproduced:false;symbolicSolverReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};
  initial:{parameter:number;point:number[];tangent:number[];requestedDirector:number[]|null;computedDirector:number[];
    computedNormal:number[]|null;normalizedComputedDirector:number[];directorResidual:number|null;
    normalizedDirectorResidual:number|null;directorCompatible:boolean|null}&InitialFrameCompatibility;
  diagnostics:{validationNodes:number;maximumRelativeMetricDifference:number;maximumFrameResidual:number;
    maximumRelativeSourceDevelopabilityResidual:number;maximumTargetDevelopabilityResidual:number;metricTolerance:number;
    sourceDevelopability:{status:'analytic'|'numerical'|'unknown'|'incompatible';method:string;analyticIdentity:boolean;
      tolerance:number;maximumRelativeResidual:number};integration:{method:string;relativeTolerance:number;absoluteTolerance:number;
      initialParameter:number;backwardEvaluations:number;forwardEvaluations:number;integrationErrorIntervalCertified:false;stepOptions?:NDSolveStepStamp}};
  certification:{finiteMetricVerified:boolean;finiteSourceDevelopabilityVerified:boolean;sourceDevelopabilityAnalytic:boolean;
    sourceRegularityCertified:boolean;initialFrameCompatible:boolean;formalStripRegularityCertified:boolean;formalIsometryCertified:boolean;
    integrationErrorIntervalCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;speedLowerBound:number;
    transverseLowerBound:number;directorLengthLowerBound:number;normalizedJacobianBounds:number[]}[];unresolved:number[][];
    minimumSpeedLowerBound:number|null;minimumTransverseLowerBound:number|null;minimumDirectorLengthLowerBound:number|null;
    roundingModel:string;reason:string|null;formalStripRegularity:{status:'verified'|'unknown'|'degenerate';orientation:number|null;
      minimumAbsoluteJacobianLowerBound:number|null;reason:string|null}};
  sample:{rows:GenericDarbouxRow[]};grid:{s:number;source:number[][];target:number[][];normalizedSource:number[][];
    normalizedTarget:number[][];sourceEFG:number[][];targetEFG:number[][]}[]};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,k:string[])=>Object.keys(x).length===k.length&&k.every(y=>Object.hasOwn(x,y));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const close=(a:number,b:number,tol=2e-8)=>finite(a)&&finite(b)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b));
const equalVector=(x:unknown,y:number[],tol=2e-8)=>vector(x,y.length)&&y.every((v,i)=>close(x[i],v,tol));
const scaledVector=(x:unknown,y:number[],reference:number,tol=2e-8)=>vector(x,y.length)&&
  y.every((v,i)=>Math.abs(x[i]-v)<=tol*Math.max(reference,Math.hypot(...y),Number.MIN_VALUE));
const unit=(x:number[])=>{const n=Math.hypot(...x);if(n===0||!finite(1/n))fail();return x.map(v=>v/n);};
function fail():never{throw Error('通用展开／重塑的原式、初值、积分轨迹或度量回读不一致。');}
export function initialFrameCompatibility(basis:number[][]):InitialFrameCompatibility{
  const residual=Math.max(...basis.flatMap((a,i)=>basis.map((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))))),tolerance=64*Number.EPSILON;
  return {frameGramResidual:residual,frameCompatibilityTolerance:tolerance,frameCompatible:residual<=tolerance};
}
export function matchesInitialFrameCompatibility(raw:Record<string,any>,basis:number[][]){
  const expected=initialFrameCompatibility(basis);
  return finite(raw.frameGramResidual)&&raw.frameGramResidual>=0&&raw.frameCompatibilityTolerance===expected.frameCompatibilityTolerance&&
    typeof raw.frameCompatible==='boolean'&&raw.frameCompatible===expected.frameCompatible&&
    raw.frameCompatible===(raw.frameGramResidual<=raw.frameCompatibilityTolerance)&&
    Math.abs(raw.frameGramResidual-expected.frameGramResidual)<=1e-15+2e-10*expected.frameGramResidual;
}
const commonKeys=['family','baseCurve','director','sigma','parameterStart','parameterEnd','transverseStart','transverseEnd',
  'segments','rulingSegments','initialParameter','initialPoint','initialTangent'];

export function validateGenericDarbouxQuery(raw:unknown):GenericDarbouxQuery{
  if(!record(raw)||!['flatten-generic-native','reshape-generic-native'].includes(raw.family)||
    !keys(raw,[...commonKeys,...(raw.family==='reshape-generic-native'?['normalCurvature','initialDirector']:[]),
      ...['resample','interpolationPoints','interpolationOrder','ndsolveOptions'].filter(k=>Object.hasOwn(raw,k))]))
    throw Error('通用展开／重塑的参数类型或字段无效。');
  if(Object.hasOwn(raw,'resample')){
    if(typeof raw.resample!=='boolean'||raw.family!=='flatten-generic-native')throw Error('Resample仅用于当前二维展开入口，须为布尔值。');
    if(raw.resample){if(!Number.isInteger(raw.interpolationPoints)||raw.interpolationPoints<4||raw.interpolationPoints>256||![1,2,3,4].includes(raw.interpolationOrder))
      throw Error('均匀重采样须指定InterpolationPoints为4–256，InterpolationOrder为1–4；原Automatic默认点数未确认。');}
    else if(Object.hasOwn(raw,'interpolationPoints')||Object.hasOwn(raw,'interpolationOrder'))throw Error('关闭Resample时不接受自适应插值选项。');
  }else if(Object.hasOwn(raw,'interpolationPoints')||Object.hasOwn(raw,'interpolationOrder'))throw Error('插值选项须同时显式启用Resample。');
  if(Object.hasOwn(raw,'ndsolveOptions'))validateNDSolveStepOptions(raw.ndsolveOptions,raw.parameterEnd-raw.parameterStart);
  for(const name of ['baseCurve','director']){if(!Array.isArray(raw[name])||raw[name].length!==3)
    throw Error('空间基线与母线各需三个完整表达式。');for(const source of raw[name])compileGenericExpression(source,'s');}
  if(raw.sigma!==1&&raw.sigma!==-1)throw Error('σ须为固定的+1或−1。');
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)
    throw Error('共同参数域须在−10…10内，跨度0.01–12。');
  if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||
    raw.transverseStart>=raw.transverseEnd)throw Error('母线横向域须为±10⁶内的递增有限数。');
  if(!finite(raw.initialParameter)||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd)
    throw Error('初始参数须在闭参数域内。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||
    !Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>64)
    throw Error('显示密度须为8–128纵向段、2–64横向段。');
  const n=raw.family==='flatten-generic-native'?2:3;
  if(!vector(raw.initialPoint,n)||raw.initialPoint.some(x=>Math.abs(x)>1e12))throw Error('初始点各分量须为±10¹²内的有限数。');
  if(!vector(raw.initialTangent,n)||Math.abs(Math.hypot(...raw.initialTangent)-1)>1e-10)
    throw Error('初始切向须为单位向量。');
  if(raw.family==='reshape-generic-native'){
    compileGenericExpression(raw.normalCurvature,'s');
    if(!vector(raw.initialDirector,3)||raw.initialDirector.some(x=>Math.abs(x)>1e12)||
      Math.hypot(...cross(raw.initialTangent,raw.initialDirector))===0)
      throw Error('初始母线须为有限非零向量，且不能与切向平行。');
  }
  return {...raw,baseCurve:raw.baseCurve.slice(),director:raw.director.slice(),initialPoint:raw.initialPoint.slice(),
    initialTangent:raw.initialTangent.slice(),...(n===3?{initialDirector:raw.initialDirector.slice()}: {}),
    ...(raw.ndsolveOptions?{ndsolveOptions:{...raw.ndsolveOptions}}:{})} as GenericDarbouxQuery;
}

const sumExact=(numbers:number[])=>{const parts:number[]=[];for(let x of numbers){let i=0;for(let y of parts){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;
}parts.length=i;parts.push(x);}return parts.reduceRight((s,x)=>s+x,0);};
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tm=(a:GenericTaylor[],s:GenericTaylor|number)=>a.map(x=>x.mul(s));
const tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]);
const tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);

/** Independent source jets retain additive constants separately at small scale. */
export function makeGenericDarbouxEvaluator(input:unknown){
  const q=validateGenericDarbouxQuery(input),bf=q.baseCurve.map(x=>compileGenericExpression(x,'s')),
    df=q.director.map(x=>compileGenericExpression(x,'s')),kf=q.family==='reshape-generic-native'?compileGenericExpression(q.normalCurvature,'s'):null,
    variable=(s:number)=>new GenericTaylor([s,1,0,0,0]);
  const anchor=bf.map(f=>f.parts(variable(q.initialParameter))),sourceOrigin=anchor.map(p=>sumExact([...p.offsets,p.dynamic.c[0]]));
  const scale=Math.max(...Array.from({length:9},(_,i)=>{const s=q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8;
    return Math.hypot(...bf.map(f=>f(variable(s)).c[1]));}))*(q.parameterEnd-q.parameterStart);
  if(!(scale>0)||!finite(scale))fail();
  const evaluate=(s:number)=>{const arg=variable(s),b=bf.map((f,i)=>{const a=f.parts(arg);return new GenericTaylor(a.dynamic.c.map((x,k)=>
    k?x/scale:sumExact([...a.offsets,...anchor[i].offsets.map(v=>-v),x,-anchor[i].dynamic.c[0]])/scale));}),
    d=df.map(f=>f(arg).div(scale)),velocity=b.map(x=>x.derivative()),speed=td(velocity,velocity).sqrt(),
    t=tm(velocity,speed.inv()),normal=tc(t,d),u=tm(normal,td(normal,normal).sqrt().inv().mul(q.sigma)),l=tc(u,t),
    p=td(t,d).mul(q.sigma),r=td(l,d).mul(q.sigma),g=td(l,t.map(x=>x.derivative()));
    const h=kf?speed.c[0]*scale*kf(arg).c[0]:0,z=kf?-h*p.c[0]/r.c[0]:0;
    if(!finite(z))fail();
    const basePrime=tp(b),director=tv(d),directorPrime=tp(d),dev=dot(tv(u),directorPrime),
      devDen=Math.max(Math.hypot(...director),Math.hypot(...directorPrime)),
      developability=devDen===0?0:Math.abs(dev)/devDen;
    return {s,base:tv(b),director,basePrime,directorPrime,tangent:tv(t),normal:tv(u),leftNormal:tv(l),
      speed:speed.c[0],p:p.c[0],q:r.c[0],pPrime:p.c[1],qPrime:r.c[1],g:g.c[0],h,z,developability};
  };
  return {query:q,normalization:{sourceOrigin,targetOrigin:q.initialPoint.slice(),scale},evaluate};
}

type SourceJet=ReturnType<ReturnType<typeof makeGenericDarbouxEvaluator>['evaluate']>;
type TargetJet={base:number[];director:number[];basePrime:number[];directorPrime:number[];
  tangent:number[];leftNormal:number[];normal:number[]|null};
const add=(a:number[],b:number[],factor=1)=>a.map((x,i)=>x+factor*b[i]);
const mul=(a:number[],k:number)=>a.map(x=>x*k);

/** A separate Dormand–Prince replay checks the returned trajectory and initial frame.
 * This is finite numerical validation, without a rigorous ODE error enclosure. */
function replayDarboux(input:ReturnType<typeof makeGenericDarbouxEvaluator>,nodes:number[]){
  const q=input.query,flat=q.family==='flatten-generic-native',initial=flat?
    [0,0,...q.initialTangent,-q.initialTangent[1],q.initialTangent[0]]:
    (()=>{const t=q.initialTangent,u=mul(unit(cross(t,q.initialDirector)),q.sigma),l=cross(u,t);
      return [0,0,0,...t,...l,...u];})();
  const cache=new Map<number,SourceJet>(),source=(s:number)=>{let r=cache.get(s);if(!r){r=input.evaluate(s);cache.set(s,r);}return r;};
  const derivative=(s:number,y:number[])=>{const r=source(s);if(flat){const t=y.slice(2,4),l=y.slice(4,6);
    return [...mul(t,r.speed),...mul(l,r.g),...mul(t,-r.g)];}
    const t=y.slice(3,6),l=y.slice(6,9),u=y.slice(9,12);
    return [...mul(t,r.speed),...add(mul(l,r.g),mul(u,r.h)),
      ...add(mul(t,-r.g),mul(u,r.z)),...add(mul(t,-r.h),mul(l,-r.z))];};
  const c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
    [19372/6561,-25360/2187,64448/6561,-212/729],
    [9017/3168,-355/33,46732/5247,49/176,-5103/18656],
    [35/384,0,500/1113,125/192,-2187/6784,11/84]],
    low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  let budget=0;
  const results=new Map<number,number[]>([[q.initialParameter,initial.slice()]]);
  const walk=(ordered:number[])=>{let s=q.initialParameter,y=initial.slice(),h=(q.parameterEnd-q.parameterStart)/32;
    for(const end of ordered){const direction=Math.sign(end-s);if(!direction){results.set(end,y.slice());continue;}
      h=Math.abs(h)*direction;
      while(direction*(end-s)>0){if(++budget>16384)throw Error('独立积分回读超过有限计算预算。');
        if(direction*(s+h-end)>0)h=end-s;
        if(s+h===s)throw Error('独立积分回读的参数精度不足。');
        const stages:number[][]=[];for(let k=0;k<7;k++){
          const trial=y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0));
          stages.push(derivative(k===6?s+h:s+c[k]*h,trial));
        }
        const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
        if(!finite(error)||high.some(v=>!finite(v)))fail();
        if(error<=1){s=direction*(s+h-end)>=0?end:s+h;y=high;}
        h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
      }
      results.set(end,y.slice());
    }
  };
  const sampleNodes=q.resample?Array.from({length:q.interpolationPoints!+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.interpolationPoints!):[];
  const sorted=[...new Set([...nodes,...sampleNodes])].sort((a,b)=>a-b);
  walk(sorted.filter(s=>s<q.initialParameter).reverse());walk(sorted.filter(s=>s>=q.initialParameter));
  const continuousTarget=(s:number):TargetJet=>{const y=results.get(s);if(!y)fail();const r=source(s);
    let base:number[],t:number[],l:number[],u:number[]|null;
    if(flat){base=y.slice(0,2);t=y.slice(2,4);l=y.slice(4,6);u=null;}
    else{base=y.slice(0,3);t=y.slice(3,6);l=y.slice(6,9);u=y.slice(9,12);}
    return {base,tangent:t,leftNormal:l,normal:u,director:mul(add(mul(t,r.p),mul(l,r.q)),q.sigma),
      basePrime:mul(t,r.speed),directorPrime:mul(add(add(mul(t,r.pPrime-r.q*r.g),mul(l,r.qPrime+r.p*r.g)),
        u?mul(u,r.p*r.h+r.q*r.z):mul(t,0)),q.sigma)};
  };
  if(!q.resample)return {target:continuousTarget,continuousTarget,source,resampling:undefined};
  const order=q.interpolationOrder!,interpolate=(values:number[][])=>uniformPolynomial(q.parameterStart,q.parameterEnd,values,order);
  const samples=sampleNodes.map(continuousTarget),base=interpolate(samples.map(x=>x.base)),
    tangent=interpolate(samples.map(x=>x.tangent)),
    left=interpolate(samples.map(x=>x.leftNormal)),
    directors=sampleNodes.map(s=>{const r=source(s);return mul(add(mul(tangent(s).value,r.p),mul(left(s).value,r.q)),q.sigma);}),
    director=interpolate(directors);
  const target=(s:number,side:'left'|'right'='right'):TargetJet=>({base:base(s,side).value,basePrime:base(s,side).derivative,director:director(s,side).value,
    directorPrime:director(s,side).derivative,tangent:tangent(s,side).value,leftNormal:left(s,side).value,normal:null});
  const actual=target(q.initialParameter),resampling:GenericResampling={function:'FunctionInterpolationAlt',definitionCell:'In[124]',
    options:{Resample:true,InterpolationPoints:q.interpolationPoints!,InterpolationOrder:order},
    method:order===1?'inclusive-uniform/componentwise-piecewise-linear':'inclusive-uniform/componentwise-local-polynomial',derivativeConvention:'right-at-interior-knots/left-at-end',
    explicitUniformLinearSubsetReproduced:order===1,underlyingAdaptiveInterpolationReproduced:false,defaultInterpolationReproduced:false,
    stages:['recovered-base','recovered-tangent','recovered-left-normal','final-director'],parameters:sampleNodes,
    normalizedBase:samples.map(x=>x.base),tangent:samples.map(x=>x.tangent),leftNormal:samples.map(x=>x.leftNormal),
    normalizedDirector:directors,initialNormalizedPointResidual:Math.max(...actual.base.map(Math.abs)),
    initialTangentResidual:Math.max(...actual.tangent.map((x,i)=>Math.abs(x-q.initialTangent[i])))};
  if(order>1){const jumps=[base,director,tangent,left].map(f=>Math.max(0,...sampleNodes.slice(1,-1).flatMap(s=>{
    const a=f(s,'left').derivative,b=f(s,'right').derivative;return a.map((x,i)=>Math.abs(x-b[i]));}))); 
    resampling.polynomial={degree:order,stencil:'cell-floor(order/2)/clamped/order+1-consecutive-nodes',
      continuity:'C0/first-derivative-continuity-not-guaranteed',normalizedBaseDerivativeJump:jumps[0],
      normalizedDirectorDerivativeJump:jumps[1],frameDerivativeJump:Math.max(...jumps.slice(2)),auditedKnotSides:2*(sampleNodes.length-2),
      wolframDefaultAlgorithmReproduced:false,originalAutomaticPointsReproduced:false};}
  return {target,continuousTarget,source,resampling};
}

const metric=(bPrime:number[],d:number[],dPrime:number[],w:number)=>{
  const v=add(bPrime,dPrime,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricError=(a:number[],b:number[])=>{
  const denominator=Math.max(...a.map(Math.abs),...b.map(Math.abs),Number.MIN_VALUE);
  return Math.max(...a.map((v,i)=>Math.abs(v-b[i])/denominator));};

export function makeGenericDarbouxReference(input:unknown,parameters:number[]){
  const evaluator=makeGenericDarbouxEvaluator(input);
  return {evaluator,...replayDarboux(evaluator,parameters)};
}

const rowKeys=['s','sourceBase','sourceDirector','sourceBaseDerivative','sourceDirectorDerivative','targetBase','targetDirector',
  'targetBaseDerivative','targetDirectorDerivative','normalizedSourceBase','normalizedSourceDirector','normalizedSourceBaseDerivative',
  'normalizedSourceDirectorDerivative','normalizedTargetBase','normalizedTargetDirector','normalizedTargetBaseDerivative',
  'normalizedTargetDirectorDerivative','targetTangent','targetLeftNormal','targetNormal','coefficients'];
const coefficientKeys=['speed','p','q','pPrime','qPrime','normalizedSpeed','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','g','h','z'];
const noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];

export function parseGenericDarbouxResult(raw:unknown,requested?:unknown):GenericDarbouxResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid',
      ...(record(raw.query)&&raw.query.resample===true?['resampling']:[])])||
    raw.family!=='origamica-generic-darboux')fail();
  const q=validateGenericDarbouxQuery(raw.query),flat=q.family==='flatten-generic-native',n=flat?2:3;
  if(JSON.stringify(q)!==JSON.stringify(raw.query)&&Object.keys(q).some(k=>JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(raw.query[k])))fail();
  if(requested){const r=validateGenericDarbouxQuery(requested);if(Object.keys(q).some(k=>JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(r[k as keyof typeof r])))fail();}
  const evaluator=makeGenericDarbouxEvaluator(q),norm=evaluator.normalization,scale=norm.scale;
  const world=(x:unknown,v:number[],origin:number[]|null,reference=1)=>vector(x,v.length)&&v.every((t,i)=>{
    const expected=(origin?.[i]??0)+scale*t;
    return Math.abs(x[i]-expected)<=Math.max(scale*reference*2e-8,4*Number.EPSILON*Math.abs(expected));});
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||
    !close(raw.normalization.scale/scale,1,2e-12)||
    !world(raw.normalization.sourceOrigin,[0,0,0],norm.sourceOrigin)||
    !world(raw.normalization.targetOrigin,Array(n).fill(0),norm.targetOrigin))fail();
  const source=raw.source,functions=flat?['FlattenGeneric2D','NFlattenGeneric2D']:['ReshapeGeneric3D','NReshapeGeneric3D'],
    cells=flat?['In[3882]','In[3885]']:['In[3890]','In[3895]'],order=flat?['ui','bi','ti']:['ui','bbi','ddi','tti'];
  if(!record(source)||!keys(source,['functions','definitionCells','method','initialArgumentOrder','directorNormalized',
    'interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
    JSON.stringify(source.functions)!==JSON.stringify(functions)||JSON.stringify(source.definitionCells)!==JSON.stringify(cells)||
    JSON.stringify(source.initialArgumentOrder)!==JSON.stringify(order)||source.method!=='whitelist-AST/Taylor/Darboux/DOP853'||
    source.metricConvention!=='normalized-s/world-w'||source.interpolationReproduced!==false||
    ['directorNormalized','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
  if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==q.segments+1||
    !Array.isArray(raw.grid)||raw.grid.length!==q.segments+1)fail();
  const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    checkNodes=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),
    replay=replayDarboux(evaluator,[...parameters,...checkNodes,q.initialParameter]);
  if(q.resample){const stamp=raw.resampling,expected=replay.resampling!;
    if(!record(stamp)||!keys(stamp,Object.keys(expected)))fail();
    for(const key of ['function','definitionCell','options','method','derivativeConvention','underlyingAdaptiveInterpolationReproduced',
      'defaultInterpolationReproduced','explicitUniformLinearSubsetReproduced','stages'])if(JSON.stringify(stamp[key])!==JSON.stringify(expected[key as keyof GenericResampling]))fail();
    if(!vector(stamp.parameters,expected.parameters.length)||stamp.parameters.some((x:number,i:number)=>!close(x,expected.parameters[i],1e-12)))fail();
    for(const key of ['normalizedBase','tangent','leftNormal','normalizedDirector'] as const){
      if(!Array.isArray(stamp[key])||stamp[key].length!==expected[key].length||stamp[key].some((x:unknown,i:number)=>
        !scaledVector(x,expected[key][i],key==='normalizedDirector'?Math.hypot(...expected[key][i]):1)))fail();}
    if(expected.polynomial){const p=stamp.polynomial,e=expected.polynomial;
      if(!record(p)||!keys(p,Object.keys(e)))fail();
      for(const key of ['degree','stencil','continuity','auditedKnotSides','wolframDefaultAlgorithmReproduced','originalAutomaticPointsReproduced'])
        if(p[key]!==e[key as keyof typeof e])fail();
      for(const key of ['normalizedBaseDerivativeJump','normalizedDirectorDerivativeJump','frameDerivativeJump'] as const)
        if(!finite(p[key])||p[key]<0||!close(p[key],e[key],2e-8))fail();
    }
    for(const key of ['initialNormalizedPointResidual','initialTangentResidual'] as const)
      if(!finite(stamp[key])||stamp[key]<0||!close(stamp[key],expected[key],2e-8))fail();
  }
  const firstTarget=replay.target(q.initialParameter),seedTarget=replay.continuousTarget(q.initialParameter),initial=raw.initial;
  if(!record(initial)||!keys(initial,['parameter','point','tangent','requestedDirector','computedDirector','computedNormal',
    'normalizedComputedDirector','directorResidual','normalizedDirectorResidual','directorCompatible',
    'frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||
    !close(initial.parameter,q.initialParameter,1e-12)||!world(initial.point,Array(n).fill(0),norm.targetOrigin)||
    !equalVector(initial.tangent,q.initialTangent,1e-10)||!world(initial.computedDirector,firstTarget.director,null)||
    !scaledVector(initial.normalizedComputedDirector,firstTarget.director,Math.hypot(...firstTarget.director))||
    !world(initial.computedDirector,firstTarget.director,null,Math.hypot(...firstTarget.director)))fail();
  if(!matchesInitialFrameCompatibility(initial,[seedTarget.tangent,seedTarget.leftNormal,...(flat?[]:[seedTarget.normal!])]))fail();
  if(flat){if(['requestedDirector','computedNormal','directorResidual','normalizedDirectorResidual','directorCompatible'].some(k=>initial[k]!==null))fail();}
  else{const request=q.initialDirector,residual=Math.max(...firstTarget.director.map((v,i)=>Math.abs(v-request[i]/scale))),
    reference=Math.max(Math.hypot(...firstTarget.director),Math.hypot(...request)/scale);
    if(!equalVector(initial.requestedDirector,request,1e-12)||!equalVector(initial.computedNormal,firstTarget.normal!)||
      !finite(initial.directorResidual)||!finite(initial.normalizedDirectorResidual)||
      !close(initial.directorResidual/scale,residual)||!close(initial.normalizedDirectorResidual,residual)||
      typeof initial.directorCompatible!=='boolean'||initial.directorCompatible!==(residual<=2e-9*reference))fail();}
  const diagnostics=raw.diagnostics,cert=raw.certification,domain=raw.domain;
  if(!record(diagnostics)||!keys(diagnostics,['validationNodes','maximumRelativeMetricDifference','maximumFrameResidual',
    'maximumRelativeSourceDevelopabilityResidual','maximumTargetDevelopabilityResidual','metricTolerance','sourceDevelopability','integration'])||
    !Number.isInteger(diagnostics.validationNodes)||diagnostics.validationNodes<129||diagnostics.validationNodes>q.segments+130||
    diagnostics.metricTolerance!==2e-8||!record(cert)||!keys(cert,['finiteMetricVerified','finiteSourceDevelopabilityVerified',
      'sourceDevelopabilityAnalytic','sourceRegularityCertified','initialFrameCompatible','formalStripRegularityCertified','formalIsometryCertified',...noCertificates])||
    Object.values(cert).some(x=>typeof x!=='boolean')||noCertificates.some(k=>cert[k]!==false))fail();
  for(const key of ['maximumRelativeMetricDifference','maximumFrameResidual','maximumRelativeSourceDevelopabilityResidual','maximumTargetDevelopabilityResidual'])
    if(!finite(diagnostics[key])||diagnostics[key]<0)fail();
  const develop=diagnostics.sourceDevelopability,integration=diagnostics.integration;
  if(!record(develop)||!keys(develop,['status','method','analyticIdentity','tolerance','maximumRelativeResidual'])||
    !['analytic','numerical','unknown','incompatible'].includes(develop.status)||typeof develop.method!=='string'||
    typeof develop.analyticIdentity!=='boolean'||develop.analyticIdentity!==(develop.status==='analytic')||develop.tolerance!==2e-9||
    !finite(develop.maximumRelativeResidual)||develop.maximumRelativeResidual<0||
    !close(develop.maximumRelativeResidual,diagnostics.maximumRelativeSourceDevelopabilityResidual,2e-12))fail();
  if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter',
    'backwardEvaluations','forwardEvaluations','integrationErrorIntervalCertified',...(q.ndsolveOptions?['stepOptions']:[])])||integration.method!=='DOP853'||
    integration.relativeTolerance!==2e-12||integration.absoluteTolerance!==2e-14||
    !close(integration.initialParameter,q.initialParameter,1e-12)||integration.integrationErrorIntervalCertified!==false||
    ['backwardEvaluations','forwardEvaluations'].some(k=>!Number.isInteger(integration[k])||integration[k]<0))fail();
  if(q.ndsolveOptions&&!validateNDSolveStepStamp(integration.stepOptions,q.ndsolveOptions,flat,q.parameterStart,q.parameterEnd,q.initialParameter,
    integration.backwardEvaluations+integration.forwardEvaluations))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved','minimumSpeedLowerBound',
    'minimumTransverseLowerBound','minimumDirectorLengthLowerBound','roundingModel','reason','formalStripRegularity'])||
    typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||
    !Array.isArray(domain.cells)||!Array.isArray(domain.unresolved)||domain.verifiedCells!==domain.cells.length||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==null&&typeof domain.reason!=='string')fail();
  const strip=domain.formalStripRegularity;
  if(!record(strip)||!keys(strip,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
    !['verified','unknown','degenerate'].includes(strip.status)||strip.reason!==null&&typeof strip.reason!=='string'||
    (strip.status==='verified'?(![-1,1].includes(strip.orientation)||!finite(strip.minimumAbsoluteJacobianLowerBound)||
      !(strip.minimumAbsoluteJacobianLowerBound>0)):(strip.orientation!==null||strip.minimumAbsoluteJacobianLowerBound!==null)))fail();
  const intervals:number[][]=[];
  for(const cell of domain.cells){if(!record(cell)||!keys(cell,['start','end','speedLowerBound','transverseLowerBound','directorLengthLowerBound',
    'normalizedJacobianBounds'])||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    ['speedLowerBound','transverseLowerBound','directorLengthLowerBound'].some(k=>!finite(cell[k])||cell[k]<=0)||
    !vector(cell.normalizedJacobianBounds,2)||cell.normalizedJacobianBounds[0]>cell.normalizedJacobianBounds[1])fail();
    intervals.push([cell.start,cell.end]);}
  for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();intervals.push(pair);}
  intervals.sort((a,b)=>a[0]-b[0]);if(!intervals.length||!close(intervals[0][0],q.parameterStart,1e-12)||
    !close(intervals.at(-1)![1],q.parameterEnd,1e-12)||intervals.some((x,i)=>i>0&&!close(intervals[i-1][1],x[0],1e-12))||
    domain.certified!==(domain.unresolved.length===0))fail();
  for(const field of ['minimumSpeedLowerBound','minimumTransverseLowerBound','minimumDirectorLengthLowerBound'])
    if(domain.certified?(!finite(domain[field])||!(domain[field]>0)):domain[field]!==null)fail();
  if(domain.cells.length+domain.unresolved.length>domain.evaluations)fail();
  if(domain.certified){for(const [global,local] of [['minimumSpeedLowerBound','speedLowerBound'],
    ['minimumTransverseLowerBound','transverseLowerBound'],['minimumDirectorLengthLowerBound','directorLengthLowerBound']]){
    const actual=domain[global],expected=Math.min(...domain.cells.map((c:Record<string,number>)=>c[local]));
    if(!finite(actual)||Math.abs(actual-expected)>2e-12*Math.max(Math.abs(expected),Number.MIN_VALUE))fail();}}
  if(strip.status==='verified'){
    if(!domain.certified||domain.cells.some((c:Record<string,any>)=>strip.orientation===1?
      c.normalizedJacobianBounds[0]<=0:c.normalizedJacobianBounds[1]>=0))fail();
    const expected=Math.min(...domain.cells.map((c:Record<string,any>)=>strip.orientation===1?
      c.normalizedJacobianBounds[0]:-c.normalizedJacobianBounds[1]));
    if(Math.abs(strip.minimumAbsoluteJacobianLowerBound-expected)>2e-12*Math.max(expected,Number.MIN_VALUE))fail();
  }
  let maxMetric=0,maxFrame=0,maxDevelop=0,maxTargetDevelop=0,minStrip=Infinity;
  const inspect=(s:number,side:'left'|'right'='right')=>{const r=replay.source(s),t=replay.target(s,side);
    maxDevelop=Math.max(maxDevelop,r.developability);
    const frame=[t.tangent,t.leftNormal,...(t.normal?[t.normal]:[])];
    frame.forEach((a,i)=>frame.forEach((b,j)=>{maxFrame=Math.max(maxFrame,Math.abs(dot(a,b)-(i===j?1:0)));}));
    const area=t.normal?dot(cross(t.basePrime,t.director),t.directorPrime):0,
      den=Math.hypot(...t.basePrime)*Math.hypot(...t.director)*Math.max(Math.hypot(...t.directorPrime),Math.hypot(...t.director));
    maxTargetDevelop=Math.max(maxTargetDevelop,den===0?0:Math.abs(area)/den);
    for(const w of [q.transverseStart,(q.transverseStart+q.transverseEnd)/2,q.transverseEnd]){
      maxMetric=Math.max(maxMetric,metricError(metric(r.basePrime,r.director,r.directorPrime,w),metric(t.basePrime,t.director,t.directorPrime,w)));
      const jac=q.sigma*r.speed*r.q+w*(r.q*r.pPrime-r.p*r.qPrime-r.g*(r.p*r.p+r.q*r.q));
      if(strip.orientation!==null)minStrip=Math.min(minStrip,strip.orientation*jac);
      for(const cell of domain.cells){if(s<cell.start-1e-12||s>cell.end+1e-12)continue;
        if(r.speed<cell.speedLowerBound-2e-8*Math.max(r.speed,cell.speedLowerBound)||
          Math.abs(r.q)<cell.transverseLowerBound-2e-8*Math.max(Math.abs(r.q),cell.transverseLowerBound)||
          Math.hypot(...r.director)<cell.directorLengthLowerBound-2e-8*Math.max(Math.hypot(...r.director),cell.directorLengthLowerBound)||
          jac<cell.normalizedJacobianBounds[0]-2e-9*Math.max(1,Math.abs(jac))||
          jac>cell.normalizedJacobianBounds[1]+2e-9*Math.max(1,Math.abs(jac)))fail();}
    }
    return {r,t};
  };
  if(q.resample&&q.interpolationOrder!>1)for(const s of replay.resampling!.parameters.slice(1,-1)){inspect(s,'left');inspect(s,'right');}
  for(const s of checkNodes)inspect(s);
  for(let i=0;i<parameters.length;i++){
    const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],{r,t}=inspect(s);
    if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!record(row.coefficients)||!keys(row.coefficients,coefficientKeys))fail();
    const coefficients={speed:r.speed*scale,p:r.p*scale,q:r.q*scale,pPrime:r.pPrime*scale,qPrime:r.qPrime*scale,
      normalizedSpeed:r.speed,normalizedP:r.p,normalizedQ:r.q,normalizedPPrime:r.pPrime,normalizedQPrime:r.qPrime,g:r.g,h:r.h,z:r.z};
    for(const key of coefficientKeys){const value=row.coefficients[key],expected=coefficients[key as keyof typeof coefficients],
      divisor=['speed','p','q','pPrime','qPrime'].includes(key)?scale:1,
      reference=['speed','normalizedSpeed'].includes(key)?r.speed:
        /Prime/.test(key)?Math.max(Math.hypot(...r.directorPrime),Math.hypot(...r.director)/(q.parameterEnd-q.parameterStart)):
        ['p','q','normalizedP','normalizedQ'].includes(key)?Math.hypot(...r.director):Math.max(1,Math.abs(expected));
      if(!finite(value)||Math.abs(value/divisor-expected/divisor)>2e-8*Math.max(reference,Number.MIN_VALUE))fail();}
    for(const [name,expected,origin] of [
      ['SourceBase',r.base,norm.sourceOrigin],['SourceDirector',r.director,null],['SourceBaseDerivative',r.basePrime,null],
      ['SourceDirectorDerivative',r.directorPrime,null],['TargetBase',t.base,norm.targetOrigin],['TargetDirector',t.director,null],
      ['TargetBaseDerivative',t.basePrime,null],['TargetDirectorDerivative',t.directorPrime,null]] as const){
      const directorReference=Math.hypot(...(name.startsWith('Source')?r.director:t.director)),
        reference=name.includes('Director')?Math.max(Math.hypot(...expected),directorReference/(name.includes('Derivative')?q.parameterEnd-q.parameterStart:1)):1;
      if(!scaledVector(row[`normalized${name}`],expected,reference)||
        !world(row[name[0].toLowerCase()+name.slice(1)],expected,origin,reference))fail();}
    if(!equalVector(row.targetTangent,t.tangent)||!equalVector(row.targetLeftNormal,t.leftNormal)||
      (flat?row.targetNormal!==null:!equalVector(row.targetNormal,t.normal!)))fail();
    if(!record(grid)||!keys(grid,['s','source','target','normalizedSource','normalizedTarget','sourceEFG','targetEFG'])||
      !close(grid.s,s,1e-12)||['source','target','normalizedSource','normalizedTarget','sourceEFG','targetEFG'].some(k=>
        !Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
    for(let j=0;j<=q.rulingSegments;j++){
      const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments,
        sourcePoint=add(r.base,r.director,w),targetPoint=add(t.base,t.director,w),
        sm=metric(r.basePrime,r.director,r.directorPrime,w),tm=metric(t.basePrime,t.director,t.directorPrime,w);
      const smScale=[(Math.hypot(...r.basePrime)+Math.abs(w)*Math.hypot(...r.directorPrime))**2,
        (Math.hypot(...r.basePrime)+Math.abs(w)*Math.hypot(...r.directorPrime))*Math.hypot(...r.director),dot(r.director,r.director)],
        tmScale=[(Math.hypot(...t.basePrime)+Math.abs(w)*Math.hypot(...t.directorPrime))**2,
        (Math.hypot(...t.basePrime)+Math.abs(w)*Math.hypot(...t.directorPrime))*Math.hypot(...t.director),dot(t.director,t.director)],
        checkMetric=(actual:unknown,expected:number[],reference:number[])=>vector(actual,3)&&expected.every((v,k)=>
          Math.abs(actual[k]-v)<=2e-8*Math.max(reference[k],Number.MIN_VALUE));
      if(!equalVector(grid.normalizedSource[j],sourcePoint)||!equalVector(grid.normalizedTarget[j],targetPoint)||
        !world(grid.source[j],sourcePoint,norm.sourceOrigin)||!world(grid.target[j],targetPoint,norm.targetOrigin)||
        !checkMetric(grid.sourceEFG[j],sm,smScale)||!checkMetric(grid.targetEFG[j],tm,tmScale))fail();
      maxMetric=Math.max(maxMetric,metricError(sm,tm));
    }
  }
  if(!q.resample&&maxFrame>2e-7||maxTargetDevelop>2e-7||
    maxMetric>diagnostics.maximumRelativeMetricDifference+2e-8||maxFrame>diagnostics.maximumFrameResidual+2e-8||
    maxDevelop>diagnostics.maximumRelativeSourceDevelopabilityResidual+2e-8||maxTargetDevelop>diagnostics.maximumTargetDevelopabilityResidual+2e-8||
    cert.finiteMetricVerified!==(diagnostics.maximumRelativeMetricDifference<=diagnostics.metricTolerance)||
    cert.finiteSourceDevelopabilityVerified!==(develop.maximumRelativeResidual<=develop.tolerance)||
    cert.sourceDevelopabilityAnalytic!==develop.analyticIdentity||cert.sourceRegularityCertified!==domain.certified||
    cert.initialFrameCompatible!==initial.frameCompatible||!initial.frameCompatible&&strip.status!=='unknown'||
    cert.formalStripRegularityCertified!==(strip.status==='verified')||cert.formalIsometryCertified!==(!q.resample&&develop.analyticIdentity&&domain.certified&&initial.frameCompatible)||
    q.resample&&strip.status!=='unknown'||
    cert.finiteMetricVerified&&maxMetric>diagnostics.metricTolerance+2e-9||
    cert.finiteSourceDevelopabilityVerified&&maxDevelop>develop.tolerance+2e-10||
    strip.status==='verified'&&minStrip<strip.minimumAbsoluteJacobianLowerBound-2e-9)fail();
  return raw as GenericDarbouxResult;
}

export async function fetchGenericDarbouxWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericDarbouxResult>{
  const query=validateGenericDarbouxQuery(input),operation=query.family==='flatten-generic-native'?'curved-flatten-generic':'curved-reshape-generic';
  while(true){signal?.throwIfAborted();try{return parseGenericDarbouxResult(await api(`tessellation/${operation}`,query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
