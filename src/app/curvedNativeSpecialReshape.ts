import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import {matchesInitialFrameCompatibility,type InitialFrameCompatibility} from './curvedNativeGenericDarboux';

export type SpecialReshapeMode='cone'|'tandev';type Vector3=[number,number,number];
type Common={baseCurve:[string,string,string];director:[string,string,string];sigma:1|-1;psi:1|-1;
 initialParameter:number;initialPoint:Vector3;initialDirector:Vector3;initialNormal:Vector3;parameterStart:number;parameterEnd:number;
 transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number};
export type GenericSpecialReshapeQuery=Common&({family:'reshape-cone-generic-native';beta:string}|{family:'reshape-tandev-generic-native';torsion:string});
export const GENERIC_SPECIAL_CONE_PRESET:GenericSpecialReshapeQuery={family:'reshape-cone-generic-native',baseCurve:['0','0','0'],
 director:['2*s/(1+s**2+(.3+.2*s**2)**2)','2*(.3+.2*s**2)/(1+s**2+(.3+.2*s**2)**2)','(1-s**2-(.3+.2*s**2)**2)/(1+s**2+(.3+.2*s**2)**2)'],
 beta:'0',sigma:1,psi:1,initialParameter:0,initialPoint:[0,0,0],initialDirector:[0,0.5504587155963302,0.8348623853211009],initialNormal:[0,-0.8348623853211009,0.5504587155963302],
 parameterStart:0,parameterEnd:1,transverseStart:.2,transverseEnd:1,segments:32,rulingSegments:16};
export const GENERIC_SPECIAL_TANDEV_PRESET:GenericSpecialReshapeQuery={family:'reshape-tandev-generic-native',baseCurve:['sin(s)','s**2/4','1-cos(s)'],
 director:['cos(s)/sqrt(1+s**2/4)','(s/2)/sqrt(1+s**2/4)','sin(s)/sqrt(1+s**2/4)'],torsion:'-2*s*sqrt(1+s**2/4)/(5+s**2)',sigma:1,psi:-1,
 initialParameter:0,initialPoint:[0,0,0],initialDirector:[1,0,0],initialNormal:[0,-0.8944271909999159,0.4472135954999579],
 parameterStart:0,parameterEnd:1,transverseStart:.15,transverseEnd:.5,segments:32,rulingSegments:16};
type Row={s:number;sourceBase:number[];sourceDirector:number[];sourceBaseDerivative:number[];sourceDirectorDerivative:number[];
 targetBase:number[];targetDirector:number[];targetBaseDerivative:number[];targetDirectorDerivative:number[];
 normalizedSourceBase:number[];normalizedSourceDirector:number[];normalizedSourceBaseDerivative:number[];normalizedSourceDirectorDerivative:number[];
 normalizedTargetBase:number[];normalizedTargetDirector:number[];normalizedTargetBaseDerivative:number[];normalizedTargetDirectorDerivative:number[];
 sourceAuxiliaryTangent:number[];sourceAuxiliaryLeftNormal:number[];sourceAuxiliaryNormal:number[];sourceAuxiliaryFrameDefined:boolean;
 targetTangent:number[];targetLeftNormal:number[];targetNormal:number[];coefficients:{speed:number;normalizedSpeed:number;sourceBaseSpeed:number;
 sourceDirectorLength:number;sourceDirectorPrimeSpeed:number;g:number;h:number;z:number}};
type Strip={status:'verified'|'unknown'|'degenerate';minimumAreaSquaredLowerBound:number|null;reason:string|null};
type Cell={start:number;end:number;baseSpeedBounds:number[];directorLengthBounds:number[];directorPrimeSpeedBounds:number[];
 gBounds:number[];hBounds:number[];zBounds:number[];sourceNormalizedAreaSquaredBounds:number[];formalNormalizedAreaSquaredBounds:number[]};
export type GenericSpecialReshapeResult={family:'origamica-generic-cone-reshape'|'origamica-generic-tandev-reshape';query:GenericSpecialReshapeQuery;
 source:{functions:string[];definitionCells:string[];method:string;initialArgumentOrder:string[];normalConvention:string;directorConvention:string;
 discardedRecoveredCrossCurve:boolean;interpolationReproduced:false;symbolicSolverReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
 normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};initial:{parameter:number;point:number[];director:number[];normal:number[];
 tangent:number[];leftNormal:number[];zeta:number|null}&InitialFrameCompatibility;
 diagnostics:{validationNodes:number;maximumFrameResidual:number;maximumRelativeMetricDifference:number;maximumRelativeTargetDevelopabilityResidual:number;
 sourceCompatibility:{status:'analytic'|'numerical'|'incompatible'|'unknown';analyticIdentity:boolean;method:string;maximumRelativeResidual:number;tolerance:number};
 metricTolerance:number;compatibilityTolerance:number;integration:{method:string;relativeTolerance:number;absoluteTolerance:number;initialParameter:number;
 backwardEvaluations:number;forwardEvaluations:number;integrationErrorIntervalCertified:false}};
 certification:{finiteMetricVerified:boolean;finiteTargetDevelopabilityVerified:boolean;finiteSourceCompatibilityVerified:boolean;sourceDefinitionCertified:boolean;
 sourceCompatibilityAnalytic:boolean;initialFrameCompatible:boolean;formalIsometryCertified:boolean;sourceStripRegularityCertified:boolean;formalStripRegularityCertified:boolean;
 integrationErrorIntervalCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
 domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:Cell[];unresolved:number[][];minimumBaseSpeedLowerBound:number|null;
 minimumDirectorLengthLowerBound:number|null;minimumDirectorPrimeSpeedLowerBound:number|null;roundingModel:string;reason:string|null;sourceStripRegularity:Strip;formalStripRegularity:Strip};
 sample:{rows:Row[]};grid:{s:number;source:number[][];target:number[][];normalizedSource:number[][];normalizedTarget:number[][];sourceEFG:number[][];targetEFG:number[][]}[]};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a:number[],w:number)=>a.map(x=>x*w),add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tm=(a:GenericTaylor[],w:number|GenericTaylor)=>a.map(x=>x.mul(w)),tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]),tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);
const sumExact=(values:number[])=>{const parts:number[]=[];for(let x of values){let i=0;for(let y of parts){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];
 const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;}parts.length=i;parts.push(x);}return parts.reduceRight((s,x)=>s+x,0);};
const modeOf=(q:GenericSpecialReshapeQuery):SpecialReshapeMode=>q.family==='reshape-cone-generic-native'?'cone':'tandev';
function fail():never{throw Error('原专用重塑的源式、原初帧、Darboux轨迹、度量或形式证据回读不一致。');}

export function validateGenericSpecialReshapeQuery(raw:unknown):GenericSpecialReshapeQuery{
 if(!record(raw)||!['reshape-cone-generic-native','reshape-tandev-generic-native'].includes(raw.family)||!keys(raw,['family','baseCurve','director',
  raw.family==='reshape-cone-generic-native'?'beta':'torsion','sigma','psi','initialParameter','initialPoint','initialDirector','initialNormal',
  'parameterStart','parameterEnd','transverseStart','transverseEnd','segments','rulingSegments']))throw Error('专用重塑参数字段不完整。');
 for(const name of ['baseCurve','director']){if(!Array.isArray(raw[name])||raw[name].length!==3)throw Error('原基线与原母线各需三个源表达式。');
  for(const expression of raw[name])compileGenericExpression(expression,'s');}compileGenericExpression(raw[raw.family==='reshape-cone-generic-native'?'beta':'torsion'],'s');
 if(![1,-1].includes(raw.sigma)||![1,-1].includes(raw.psi))throw Error('σ与ψ须为固定±1。');
 if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)
  throw Error('s域须在±10内、跨度0.01–12。');
 if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||raw.transverseStart>=raw.transverseEnd)throw Error('w域须在±10⁶内递增。');
 if(!finite(raw.initialParameter)||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd)throw Error('ui须在原闭域内。');
 for(const name of ['initialPoint','initialDirector','initialNormal'])if(!vector(raw[name],3)||raw[name].some((v:number)=>Math.abs(v)>1e12))throw Error('原三维初值坐标须有限且在±10¹²内，保留含零原向量。');
 if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128和2–64。');
 return {...raw,baseCurve:raw.baseCurve.slice(),director:raw.director.slice(),initialPoint:raw.initialPoint.slice(),initialDirector:raw.initialDirector.slice(),initialNormal:raw.initialNormal.slice()} as GenericSpecialReshapeQuery;
}

/** Independent raw-source jets. Neither raw d nor any initial vector is normalized. */
export function makeGenericSpecialReshapeSource(input:unknown){
 const q=validateGenericSpecialReshapeQuery(input),mode=modeOf(q),bf=q.baseCurve.map(x=>compileGenericExpression(x,'s')),df=q.director.map(x=>compileGenericExpression(x,'s')),
  law=compileGenericExpression(q.family==='reshape-cone-generic-native'?q.beta:q.torsion,'s'),variable=(s:number)=>new GenericTaylor([s,1,0,0,0]),
  anchor=bf.map(f=>f.parts(variable(q.initialParameter))),sourceOrigin=anchor.map(p=>sumExact([...p.offsets,p.dynamic.c[0]])),
  nodes=Array.from({length:9},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8),baseSize=Math.max(...nodes.map(s=>Math.hypot(...bf.map(f=>f.parts(variable(s)).dynamic.c[1]))))*(q.parameterEnd-q.parameterStart),
  directorSize=Math.max(...nodes.map(s=>Math.hypot(...df.map(f=>f(variable(s)).c[0]))))*Math.max(Math.abs(q.transverseStart),Math.abs(q.transverseEnd),q.transverseEnd-q.transverseStart),
  scale=mode==='cone'?Math.max(baseSize,directorSize)||1:baseSize;
 if(!(scale>0)||!finite(scale))throw Error('原切线可展面基线速度为零或源尺度无效。');
 const evaluate=(s:number)=>{const arg=variable(s),b=bf.map((f,i)=>{const p=f.parts(arg);return new GenericTaylor(p.dynamic.c.map((x,k)=>k?x/scale:
  sumExact([...p.offsets,...anchor[i].offsets.map(v=>-v),x,-anchor[i].dynamic.c[0]])/scale));}),d=df.map(f=>f(arg)),bp=b.map(x=>x.derivative()),dp=d.map(x=>x.derivative()),
  basePrime=tp(b),director=mul(tv(d),1/scale),directorPrime=mul(tp(d),1/scale),baseSpeed=Math.hypot(...basePrime)*scale,dLength=Math.hypot(...tv(d)),dpSpeed=Math.hypot(...tp(d));
 let tangent:number[],leftNormal:number[],normal:number[],speed:number,g:number,h:number,z:number,frameDefined:boolean;
 if(mode==='cone'){leftNormal=mul(tv(d),q.sigma);tangent=dpSpeed?mul(tp(d),q.psi/dpSpeed):[0,0,0];normal=cross(tangent,leftNormal);
  speed=1/scale;g=-q.sigma*q.psi*dpSpeed;h=law(arg).c[0];z=0;frameDefined=dpSpeed>0;}
 else{if(!baseSpeed)throw Error('原Normalize(b′)在零速度处无定义。');if(!dpSpeed)throw Error('原Normalize(d′)在零母线导数处无定义。');
  const v=td(bp,bp).sqrt(),t=tm(bp,v.inv()),u=tm(tc(tm(dp,td(dp,dp).sqrt().inv()),d),q.sigma*q.psi),l=tc(u,t);
  tangent=tv(t);normal=tv(u);leftNormal=tv(l);speed=v.c[0];g=td(l,t.map(x=>x.derivative())).c[0];h=0;z=law(arg).c[0];frameDefined=true;}
 const sourceCompatibility=mode==='cone'?Math.max(baseSpeed/Math.max(dLength,Number.MIN_VALUE),Math.abs(dLength*dLength-1)):
  Math.max(Math.abs(dLength*dLength-1),Math.hypot(...cross(basePrime,tv(d)))/Math.max(Math.hypot(...basePrime)*dLength,Number.MIN_VALUE));
 if([speed,g,h,z,sourceCompatibility,...tv(b),...director,...directorPrime,...normal].some(x=>!finite(x)))fail();
 return {s,base:tv(b),basePrime,director,directorPrime,tangent,leftNormal,normal,frameDefined,speed,sourceBaseSpeed:baseSpeed,
  sourceDirectorLength:dLength,sourceDirectorPrimeSpeed:dpSpeed,g,h,z,sourceCompatibility};};
 const sourceAtInitial=evaluate(q.initialParameter),zeta=mode==='cone'?null:dot(sourceAtInitial.tangent,mul(sourceAtInitial.director,scale)),
  leftNormal=mode==='cone'?mul(q.initialDirector,q.sigma):cross(q.initialNormal,mul(q.initialDirector,zeta!)),
  tangent=mode==='cone'?cross(leftNormal,q.initialNormal):mul(q.initialDirector,zeta!);
 return {query:q,mode,normalization:{sourceOrigin,targetOrigin:q.initialPoint.slice(),scale},initial:{tangent,leftNormal,normal:q.initialNormal.slice(),zeta},evaluate};
}

/** Independent DP54 integration about ui. Cone returned base is the literal fixed apex, not recovered C. */
export function makeGenericSpecialReshapeReference(input:unknown,nodes:number[]){
 const evaluator=makeGenericSpecialReshapeSource(input),q=evaluator.query,cache=new Map<number,ReturnType<typeof evaluator.evaluate>>(),
  source=(s:number)=>{let r=cache.get(s);if(!r){r=evaluator.evaluate(s);cache.set(s,r);}return r;},
  initial=[0,0,0,...evaluator.initial.tangent,...evaluator.initial.leftNormal,...evaluator.initial.normal],results=new Map<number,number[]>([[q.initialParameter,initial.slice()]]),
  derivative=(s:number,y:number[])=>{const r=source(s),t=y.slice(3,6),l=y.slice(6,9),u=y.slice(9,12);return [...mul(t,r.speed),...add(mul(l,r.g),u,r.h),...add(mul(t,-r.g),u,r.z),...add(mul(t,-r.h),l,-r.z)];},
  c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],
  [9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
 let budget=0;const walk=(ordered:number[])=>{let s=q.initialParameter,y=initial.slice(),h=(q.parameterEnd-q.parameterStart)/32;
  for(const end of ordered){const direction=Math.sign(end-s);if(!direction){results.set(end,y.slice());continue;}h=Math.abs(h)*direction;
   while(direction*(end-s)>0){if(++budget>20000)throw Error('独立专用重塑积分回读超过有限预算。');if(direction*(s+h-end)>0)h=end-s;if(s+h===s)fail();const stages:number[][]=[];
    for(let k=0;k<7;k++)stages.push(derivative(k===6?s+h:s+c[k]*h,y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0))));
    const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
     error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
    if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=direction*(s+h-end)>=0?end:s+h;y=high;}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));}results.set(end,y.slice());}};
 const sorted=[...new Set(nodes)].sort((a,b)=>a-b);if(sorted.some(s=>!finite(s)||s<q.parameterStart||s>q.parameterEnd))fail();walk(sorted.filter(s=>s<q.initialParameter).reverse());walk(sorted.filter(s=>s>=q.initialParameter));
 const target=(s:number)=>{const y=results.get(s);if(!y)fail();const r=source(s),tangent=y.slice(3,6),leftNormal=y.slice(6,9),normal=y.slice(9,12),L=evaluator.normalization.scale,
  cone=evaluator.mode==='cone',factor=cone?q.sigma:evaluator.initial.zeta!,vector=cone?leftNormal:tangent,
  prime=cone?add(mul(tangent,-r.g),normal,r.z):add(mul(leftNormal,r.g),normal,r.h);
  return {base:cone?[0,0,0]:y.slice(0,3),basePrime:cone?[0,0,0]:mul(tangent,r.speed),director:mul(vector,factor/L),directorPrime:mul(prime,factor/L),tangent,leftNormal,normal};};
 return {...evaluator,source,target};
}

const close=(x:unknown,y:number,tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(1,Math.abs(x),Math.abs(y));
const nearVector=(x:unknown,y:number[],natural=1)=>vector(x,y.length)&&y.every((v,i)=>Math.abs(x[i]-v)<=2e-8*Math.max(natural,Math.hypot(...y),Number.MIN_VALUE));
const metric=(bp:number[],d:number[],dp:number[],w:number)=>{const v=add(bp,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricDifference=(a:number[],b:number[])=>{const E=Math.max(Math.abs(a[0]),Math.abs(b[0])),G=Math.max(Math.abs(a[2]),Math.abs(b[2]));
 return Math.max(...a.map((v,i)=>Math.abs(v-b[i])/Math.max([E,Math.sqrt(E)*Math.sqrt(G),G][i],Number.MIN_VALUE)));};
const rowKeys=['s','sourceBase','sourceDirector','sourceBaseDerivative','sourceDirectorDerivative','targetBase','targetDirector','targetBaseDerivative','targetDirectorDerivative',
 'normalizedSourceBase','normalizedSourceDirector','normalizedSourceBaseDerivative','normalizedSourceDirectorDerivative','normalizedTargetBase','normalizedTargetDirector',
 'normalizedTargetBaseDerivative','normalizedTargetDirectorDerivative','sourceAuxiliaryTangent','sourceAuxiliaryLeftNormal','sourceAuxiliaryNormal','sourceAuxiliaryFrameDefined',
 'targetTangent','targetLeftNormal','targetNormal','coefficients'],coefficientKeys=['speed','normalizedSpeed','sourceBaseSpeed','sourceDirectorLength','sourceDirectorPrimeSpeed','g','h','z'],
 gridKeys=['s','source','target','normalizedSource','normalizedTarget','sourceEFG','targetEFG'],boundsKeys=['baseSpeedBounds','directorLengthBounds','directorPrimeSpeedBounds','gBounds','hBounds','zBounds','sourceNormalizedAreaSquaredBounds','formalNormalizedAreaSquaredBounds'],
 cellKeys=['start','end',...boundsKeys],minimumKeys=['minimumBaseSpeedLowerBound','minimumDirectorLengthLowerBound','minimumDirectorPrimeSpeedLowerBound'],
 noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];

export function parseGenericSpecialReshapeResult(raw:unknown,requested?:unknown):GenericSpecialReshapeResult{
 if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid']))fail();
 const q=validateGenericSpecialReshapeQuery(raw.query),mode=modeOf(q),cone=mode==='cone';
 if(raw.family!==(cone?'origamica-generic-cone-reshape':'origamica-generic-tandev-reshape'))fail();
 if(requested){const wanted=validateGenericSpecialReshapeQuery(requested);if(Object.keys(q).some(k=>JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(wanted[k as keyof typeof wanted])))fail();}
 const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
  validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),domain=raw.domain;
 if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved',...minimumKeys,'roundingModel','reason','sourceStripRegularity','formalStripRegularity'])||
  typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||!Array.isArray(domain.unresolved)||
  domain.verifiedCells!==domain.cells.length||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==null&&typeof domain.reason!=='string')fail();
 for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellKeys)||!finite(cell.start)||!finite(cell.end)||cell.start<q.parameterStart||cell.end>q.parameterEnd||cell.start>=cell.end)fail();
  for(const name of boundsKeys)if(!vector(cell[name],2)||cell[name][0]>cell[name][1])fail();
  for(const name of ['baseSpeedBounds','directorLengthBounds','directorPrimeSpeedBounds'])if(cell[name][0]<0)fail();
  for(const name of ['sourceNormalizedAreaSquaredBounds','formalNormalizedAreaSquaredBounds'])if(cell[name][0]<-4*Number.MIN_VALUE)fail();
  if(!cone&&(cell.baseSpeedBounds[0]<=0||cell.directorPrimeSpeedBounds[0]<=0))fail();}
 const partitions=[...domain.cells.map((cell:Cell)=>[cell.start,cell.end]),...domain.unresolved.map((pair:unknown)=>{if(!vector(pair,2)||pair[0]<q.parameterStart||pair[1]>q.parameterEnd||pair[0]>=pair[1])fail();return pair;})].sort((a,b)=>a[0]-b[0]);
 if(!partitions.length||!close(partitions[0][0],q.parameterStart,1e-12)||!close(partitions.at(-1)![1],q.parameterEnd,1e-12)||
  partitions.some((pair,i)=>i>0&&!close(pair[0],partitions[i-1][1],1e-12))||domain.certified!==(domain.unresolved.length===0))fail();
 for(let i=0;i<minimumKeys.length;i++){const value=domain[minimumKeys[i]],lo=Math.min(...domain.cells.map((cell:Cell)=>cell[boundsKeys[i] as keyof Cell] as number[]).map((bounds:number[])=>bounds[0]));
  if(domain.certified?!finite(value)||value<0||Math.abs(value-lo)>2e-10*Math.max(Math.abs(value),Math.abs(lo),Number.MIN_VALUE):value!==null)fail();}
 for(const name of ['sourceStripRegularity','formalStripRegularity']){const strip=domain[name];if(!record(strip)||!keys(strip,['status','minimumAreaSquaredLowerBound','reason'])||
  !['verified','unknown','degenerate'].includes(strip.status)||strip.reason!==null&&typeof strip.reason!=='string')fail();
  if(strip.status==='verified'){const b=name.startsWith('source')?'sourceNormalizedAreaSquaredBounds':'formalNormalizedAreaSquaredBounds',lo=Math.min(...domain.cells.map((cell:Cell)=>cell[b][0]));
   if(!domain.certified||!finite(strip.minimumAreaSquaredLowerBound)||strip.minimumAreaSquaredLowerBound<=0||!close(strip.minimumAreaSquaredLowerBound/lo,1,2e-10))fail();}
  else if(strip.minimumAreaSquaredLowerBound!==null)fail();}
 const midpoints=domain.cells.map((cell:Cell)=>(cell.start+cell.end)/2),ref=makeGenericSpecialReshapeReference(q,[...parameters,...validation,...midpoints,q.initialParameter]),norm=ref.normalization,L=norm.scale,
  world=(x:unknown,y:number[],origin:number[]|null,natural=1)=>vector(x,y.length)&&y.every((v,i)=>{const expected=(origin?.[i]??0)+L*v;
   return Math.abs(x[i]-expected)<=Math.max(2e-8*L*Math.max(natural,Math.hypot(...y),Number.MIN_VALUE),4*Number.EPSILON*Math.abs(expected));});
 if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||!close(raw.normalization.scale/L,1,2e-12)||
  !world(raw.normalization.sourceOrigin,[0,0,0],norm.sourceOrigin)||!world(raw.normalization.targetOrigin,[0,0,0],norm.targetOrigin))fail();
 const source=raw.source;
 if(!record(source)||!keys(source,['functions','definitionCells','method','initialArgumentOrder','normalConvention','directorConvention','discardedRecoveredCrossCurve',
  'interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
  JSON.stringify(source.functions)!==JSON.stringify(cone?['ReshapeCone3D','NReshapeCone3D']:['ReshapeTandev3D','NReshapeTandev3D'])||
  JSON.stringify(source.definitionCells)!==JSON.stringify(cone?['In[3901]','In[3906]']:['In[3912]','In[3917]'])||
  JSON.stringify(source.initialArgumentOrder)!=='["ui","bbi","ddi","uui"]'||source.discardedRecoveredCrossCurve!==cone||source.metricConvention!=='normalized-s/world-w'||
  source.method!=='whitelist-AST/literal-special-source-frame/bilateral-DOP853'||
  source.normalConvention!==(cone?'cone diagnostic U=psi*Normalize(dprime) cross sigma*d':'U=sigma*psi*(Normalize(dprime) cross raw d), no cross normalization')||
  source.directorConvention!==(cone?'targetD=sigma*L':'zeta=Tsource(ui).dot(rawD(ui));targetD=zeta*T')||
  ['interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
 const initial=raw.initial;if(!record(initial)||!keys(initial,['parameter','point','director','normal','tangent','leftNormal','zeta','frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||
  initial.parameter!==q.initialParameter||!nearVector(initial.point,q.initialPoint)||!nearVector(initial.director,q.initialDirector)||!nearVector(initial.normal,q.initialNormal)||
  !nearVector(initial.tangent,ref.initial.tangent,Math.hypot(...ref.initial.tangent))||!nearVector(initial.leftNormal,ref.initial.leftNormal,Math.hypot(...ref.initial.leftNormal))||
  (cone?initial.zeta!==null:!finite(initial.zeta)||Math.abs(initial.zeta-ref.initial.zeta!)>2e-8*Math.max(ref.source(q.initialParameter).sourceDirectorLength,Number.MIN_VALUE))||
  !matchesInitialFrameCompatibility(initial,[ref.initial.tangent,ref.initial.leftNormal,ref.initial.normal]))fail();
 if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
 const d=raw.diagnostics,c=raw.certification,maxima=['maximumFrameResidual','maximumRelativeMetricDifference','maximumRelativeTargetDevelopabilityResidual'];
 if(!record(d)||!keys(d,['validationNodes',...maxima,'sourceCompatibility','metricTolerance','compatibilityTolerance','integration'])||d.validationNodes!==129||
  maxima.some(k=>!finite(d[k])||d[k]<0)||d.metricTolerance!==2e-8||d.compatibilityTolerance!==2e-9)fail();
 const compatibility=d.sourceCompatibility;if(!record(compatibility)||!keys(compatibility,['status','analyticIdentity','method','maximumRelativeResidual','tolerance'])||
  !['analytic','numerical','incompatible','unknown'].includes(compatibility.status)||compatibility.analyticIdentity!==(compatibility.status==='analytic')||
  compatibility.method!==(compatibility.analyticIdentity?(cone?'bounded-safe-symbolic-unit/constant-base':'bounded-safe-symbolic-unit/parallel-base-tangent'):'finite-source-Taylor')||
  !finite(compatibility.maximumRelativeResidual)||compatibility.maximumRelativeResidual<0||compatibility.tolerance!==d.compatibilityTolerance||
  !compatibility.analyticIdentity&&compatibility.status!==(compatibility.maximumRelativeResidual>d.compatibilityTolerance?'incompatible':domain.certified?'numerical':'unknown'))fail();
 const integration=d.integration;if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','backwardEvaluations','forwardEvaluations','integrationErrorIntervalCertified'])||
  integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||integration.absoluteTolerance!==2e-14||integration.initialParameter!==q.initialParameter||
  ['backwardEvaluations','forwardEvaluations'].some(k=>!Number.isInteger(integration[k])||integration[k]<0)||integration.integrationErrorIntervalCertified!==false)fail();
 const certKeys=['finiteMetricVerified','finiteTargetDevelopabilityVerified','finiteSourceCompatibilityVerified','sourceDefinitionCertified','sourceCompatibilityAnalytic','initialFrameCompatible',
  'formalIsometryCertified','sourceStripRegularityCertified','formalStripRegularityCertified',...noCertificates];if(!record(c)||!keys(c,certKeys)||Object.values(c).some(v=>typeof v!=='boolean')||noCertificates.some(k=>c[k]!==false))fail();
 let maxFrame=0,maxMetric=0,maxDev=0,maxCompatibility=0;const widths=Array.from({length:q.rulingSegments+1},(_,j)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments);widths.push((q.transverseStart+q.transverseEnd)/2);
 const inspect=(s:number)=>{const r=ref.source(s),t=ref.target(s),bases=[[t.tangent,t.leftNormal,t.normal],...(r.frameDefined?[[r.tangent,r.leftNormal,r.normal]]:[])];
  for(const basis of bases)for(let i=0;i<3;i++)for(let j=0;j<3;j++)maxFrame=Math.max(maxFrame,Math.abs(dot(basis[i],basis[j])-(i===j?1:0)));
  maxCompatibility=Math.max(maxCompatibility,r.sourceCompatibility);const dpn=Math.hypot(...t.directorPrime),devDen=Math.hypot(...t.basePrime)*Math.hypot(...t.director)*dpn;
  maxDev=Math.max(maxDev,devDen?Math.abs(dot(cross(t.basePrime,t.director),t.directorPrime))/devDen:0);
  const cells=domain.cells.filter((cell:Cell)=>cell.start-1e-12<=s&&s<=cell.end+1e-12),values=[r.sourceBaseSpeed,r.sourceDirectorLength,r.sourceDirectorPrimeSpeed,r.g,r.h,r.z];
  for(const cell of cells)for(let i=0;i<values.length;i++){const bounds=cell[boundsKeys[i]],tol=2e-8*Math.max(Math.abs(values[i]),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);
   if(values[i]<bounds[0]-tol||values[i]>bounds[1]+tol)fail();}
  for(const w of widths){maxMetric=Math.max(maxMetric,metricDifference(metric(r.basePrime,r.director,r.directorPrime,w),metric(t.basePrime,t.director,t.directorPrime,w)));
   const sourceAreaSquared=dot(cross(add(r.basePrime,r.directorPrime,w),r.director),cross(add(r.basePrime,r.directorPrime,w),r.director)),
    formalAreaSquared=w*w*r.g*r.g*(cone?1:ref.initial.zeta!**4)/L**4;
   for(const cell of cells)for(const [field,value]of [['sourceNormalizedAreaSquaredBounds',sourceAreaSquared],['formalNormalizedAreaSquaredBounds',formalAreaSquared]] as const){const bounds=cell[field],tol=2e-8*Math.max(Math.abs(value),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);
    if(value<bounds[0]-tol||value>bounds[1]+tol)fail();}}
  return {r,t};};
 for(const s of [...new Set([...parameters,...validation,...midpoints,q.initialParameter])])inspect(s);
 for(let i=0;i<parameters.length;i++){const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],{r,t}=inspect(s),coef=row?.coefficients;
  if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!record(coef)||!keys(coef,coefficientKeys)||row.sourceAuxiliaryFrameDefined!==r.frameDefined)fail();
  for(const key of coefficientKeys){const expected=key==='speed'?r.speed*L:key==='normalizedSpeed'?r.speed:r[key as keyof typeof r] as number,natural=key==='g'||key==='h'||key==='z'?Math.max(Math.abs(r.g),Math.abs(r.h),Math.abs(r.z),1/(q.parameterEnd-q.parameterStart)):Math.abs(expected);
   if(!finite(coef[key])||Math.abs(coef[key]-expected)>2e-8*Math.max(natural,Number.MIN_VALUE))fail();}
  for(const [name,value]of [['sourceAuxiliaryTangent',r.tangent],['sourceAuxiliaryLeftNormal',r.leftNormal],['sourceAuxiliaryNormal',r.normal],['targetTangent',t.tangent],['targetLeftNormal',t.leftNormal],['targetNormal',t.normal]] as const)
   if(!nearVector(row[name],value,Math.hypot(...value)))fail();
  for(const [name,value,origin,natural]of [['SourceBase',r.base,norm.sourceOrigin,1],['SourceBaseDerivative',r.basePrime,null,r.sourceBaseSpeed/L],
   ['SourceDirector',r.director,null,r.sourceDirectorLength/L],['SourceDirectorDerivative',r.directorPrime,null,r.sourceDirectorPrimeSpeed/L],
   ['TargetBase',t.base,norm.targetOrigin,1],['TargetBaseDerivative',t.basePrime,null,Math.hypot(...t.basePrime)],['TargetDirector',t.director,null,Math.hypot(...t.director)],
   ['TargetDirectorDerivative',t.directorPrime,null,Math.hypot(...t.directorPrime)]] as const)
   if(!nearVector(row['normalized'+name],value,natural)||!world(row[name[0].toLowerCase()+name.slice(1)],value,origin,natural))fail();
  if(cone&&(row.targetBaseDerivative.some((v:number)=>v!==0)||row.normalizedTargetBase.some((v:number)=>v!==0)))fail();
  if(!record(grid)||!keys(grid,gridKeys)||!close(grid.s,s,1e-12)||gridKeys.filter(k=>k!=='s').some(k=>!Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
  for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments;
   for(const stage of ['source','target']as const){const base=stage==='source'?r:t,point=add(base.base,base.director,w),m=metric(base.basePrime,base.director,base.directorPrime,w),
    bn=Math.hypot(...base.basePrime)+Math.abs(w)*Math.hypot(...base.directorPrime),dn=Math.hypot(...base.director),natural=[bn*bn,bn*dn,dn*dn],actual=grid[stage+'EFG'][j],reference=Math.max(1,Math.hypot(...point));
    if(!nearVector(grid['normalized'+stage[0].toUpperCase()+stage.slice(1)][j],point,reference)||!world(grid[stage][j],point,stage==='source'?norm.sourceOrigin:norm.targetOrigin,reference)||
     !vector(actual,3)||m.some((v,k)=>Math.abs(actual[k]-v)>2e-8*Math.max(natural[k],Number.MIN_VALUE)))fail();}}
 }
 if(maxFrame>d.maximumFrameResidual+2e-8*Math.max(1,initial.frameGramResidual)||maxMetric>d.maximumRelativeMetricDifference+2e-8||maxDev>d.maximumRelativeTargetDevelopabilityResidual+2e-9||
  maxCompatibility>compatibility.maximumRelativeResidual+2e-8)fail();
 if(c.finiteMetricVerified!==(d.maximumRelativeMetricDifference<=d.metricTolerance)||c.finiteTargetDevelopabilityVerified!==(d.maximumRelativeTargetDevelopabilityResidual<=d.compatibilityTolerance)||
  c.finiteSourceCompatibilityVerified!==(compatibility.maximumRelativeResidual<=d.compatibilityTolerance)||
  c.sourceDefinitionCertified!==domain.certified||c.sourceCompatibilityAnalytic!==compatibility.analyticIdentity||c.initialFrameCompatible!==initial.frameCompatible||
  c.formalIsometryCertified!==(domain.certified&&compatibility.analyticIdentity&&initial.frameCompatible))fail();
 for(const stage of ['source','formal'])if(c[stage+'StripRegularityCertified']!==(domain[stage+'StripRegularity'].status==='verified'))fail();
 if(!initial.frameCompatible&&domain.formalStripRegularity.status!=='unknown')fail();
 if(q.transverseStart<=0&&q.transverseEnd>=0){if(initial.frameCompatible&&domain.formalStripRegularity.status!=='degenerate'||compatibility.analyticIdentity&&domain.sourceStripRegularity.status!=='degenerate')fail();}
 return raw as GenericSpecialReshapeResult;
}

export async function fetchGenericSpecialReshapeWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericSpecialReshapeResult>{
 const query=validateGenericSpecialReshapeQuery(input),operation=modeOf(query)==='cone'?'curved-reshape-cone-generic':'curved-reshape-tandev-generic';
 while(true){signal?.throwIfAborted();try{return parseGenericSpecialReshapeResult(await api('tessellation/'+operation,query,signal),query);}
  catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
