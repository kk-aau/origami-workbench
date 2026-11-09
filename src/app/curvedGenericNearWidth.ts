import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type NearWidthQuery={family:'near-constant-width-generic';baseCurve:string[];director:string[];
  parameterStart:number;parameterEnd:number;width:number;segments:number};
export const GENERIC_NEAR_WIDTH_PRESET:NearWidthQuery={family:'near-constant-width-generic',
  baseCurve:['s','0'],director:['sin(s)','cos(s)'],parameterStart:0,parameterEnd:Math.PI/3,width:.5,segments:64};
export type GenericNearWidthRow={s:number;base:number[];outer:number[];normalizedBase:number[];normalizedOuter:number[];
  baseDerivative:number[];director:number[];tangentProjection:number;radicand:number;scale:number;
  scaleDerivative:number;rulingLength:number;localPerpendicularDistance:number};
export type GenericNearWidthResult={family:'origamica-generic-near-width';query:NearWidthQuery;
  source:{definitionCell:'In[3871]';numericalDefinitionCell:'In[3874]';function:string;formula:string;
    directorNormalized:false;wolframInterpolationReproduced:false;machineReadableWolframOut:false};
  normalization:{origin:number[];scale:number};
  certification:{fullDomainFormulaCertified:boolean;nearestFootDistanceChecked:false;paperRegularityChecked:false;
    globalInjectivityChecked:false;spatialDevelopabilityChecked:false;selfCollisionChecked:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  proof:{status:'verified'|'unknown';evaluations:number;cells:{start:number;end:number;normalizedSpeedLowerBound:number;
    radicandLowerBound:number;scaleUpperBound:number}[];unresolved:number[][];roundingModel:string;method:string};
  sample:{rows:GenericNearWidthRow[]}};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const near=(x:number,y:number,tol=2e-9)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(1,Math.abs(x),Math.abs(y));
const vector=(v:unknown,n:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const sum=(a:number[])=>{const p:number[]=[];for(let x of a){let j=0;for(let y of p){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const h=x+y,l=y-(h-x);if(l)p[j++]=l;x=h;}p.length=j;p.push(x);}return p.reduceRight((s,x)=>s+x,0);};
function fail():never{throw Error('近恒宽比例的源函数、数值结果或验证范围回读不一致。');}

export function validateGenericNearWidthQuery(raw:unknown):NearWidthQuery{
  if(!record(raw)||raw.family!==GENERIC_NEAR_WIDTH_PRESET.family||Object.keys(raw).some(x=>!Object.hasOwn(GENERIC_NEAR_WIDTH_PRESET,x)))
    throw Error('近恒宽通用参数的类型或字段无效。');
  const q={...GENERIC_NEAR_WIDTH_PRESET,...raw};
  for(const k of ['baseCurve','director'] as const){if(!Array.isArray(q[k])||![2,3].includes(q[k].length))throw Error('基线与母线须为二维或三维函数。');
    q[k]=q[k].map((x:unknown)=>{if(typeof x!=='string')throw Error('坐标函数须为字符串。');compileGenericExpression(x,'s');return x;});}
  if(q.baseCurve.length!==q.director.length)throw Error('基线与母线方向须使用相同维数。');
  if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart< -20||q.parameterEnd>20||
    q.parameterEnd-q.parameterStart<.001||q.parameterEnd-q.parameterStart>12)throw Error('s 区间须在 −20…20，长度为 0.001–12。');
  if(!finite(q.width)||Math.abs(q.width)>1000)throw Error('宽度倍率须在 −1000…1000；负值反转母线侧。');
  if(!finite(q.segments)||!Number.isInteger(q.segments)||q.segments<8||q.segments>128)throw Error('显示段数须为 8–128 整数。');
  return q as NearWidthQuery;
}

export function makeNearWidthEvaluator(input:unknown){
  const q=validateGenericNearWidthQuery(input),base=q.baseCurve.map(x=>compileGenericExpression(x,'s')),
    director=q.director.map(x=>compileGenericExpression(x,'s'));
  const jet=(s:number)=>new GenericTaylor([s,1,0]);
  const origins=base.map(x=>x.parts(jet(q.parameterStart))),origin=origins.map(x=>sum(x.offsets)+x.dynamic.c[0]);
  const speeds=Array.from({length:9},(_,i)=>Math.hypot(...base.map(x=>x.parts(jet(q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8)).dynamic.c[1])));
  const scale=Math.max(Math.abs(q.width),Math.max(...speeds)*(q.parameterEnd-q.parameterStart));
  if(!finite(scale)||scale<=0)fail();
  const evaluate=(s:number):GenericNearWidthRow=>{
    const u=jet(s),b=base.map((fn,k)=>{const p=fn.parts(u);return p.dynamic.sub(origins[k].dynamic.c[0]).add(sum([...p.offsets,...origins[k].offsets.map(x=>-x)])).div(scale);}),
      velocity=b.map(x=>x.derivative()),speed=velocity.reduce((a,x)=>a.add(x.mul(x)),u.constant(0)).sqrt(),
      tangent=velocity.map(x=>x.div(speed)),d=director.map(x=>x(u)),projection=tangent.reduce((a,x,k)=>a.add(x.mul(d[k])),u.constant(0)),
      rad=projection.mul(projection).neg().add(1),factor=rad.sqrt().inv(),outer=b.map((x,k)=>x.add(factor.mul(d[k]).mul(q.width/scale))),
      normalizedBase=b.map(x=>x.c[0]),normalizedOuter=outer.map(x=>x.c[0]),dv=d.map(x=>x.c[0]);
    return {s,normalizedBase,normalizedOuter,base:normalizedBase.map((x,k)=>origin[k]+scale*x),outer:normalizedOuter.map((x,k)=>origin[k]+scale*x),
      baseDerivative:velocity.map(x=>x.c[0]*scale),director:dv,tangentProjection:projection.c[0],radicand:rad.c[0],scale:factor.c[0],scaleDerivative:factor.c[1],
      rulingLength:q.width*factor.c[0]*Math.hypot(...dv),localPerpendicularDistance:Math.abs(q.width)*factor.c[0]*Math.sqrt(Math.max(0,dot(dv,dv)-projection.c[0]**2))};
  };return Object.assign(evaluate,{normalization:{origin,scale},query:q});
}

export function parseGenericNearWidthResult(raw:unknown,input:unknown):GenericNearWidthResult{
  const query=validateGenericNearWidthQuery(input),evaluate=makeNearWidthEvaluator(query),n=query.baseCurve.length;
  if(!record(raw)||!keys(raw,['family','query','source','normalization','certification','proof','sample'])||raw.family!=='origamica-generic-near-width'||
    JSON.stringify(validateGenericNearWidthQuery(raw.query))!==JSON.stringify(query)||!record(raw.source)||!record(raw.normalization)||
    !record(raw.certification)||!record(raw.proof)||!record(raw.sample))fail();
  if(!keys(raw.query,Object.keys(query))||JSON.stringify(raw.query)!==JSON.stringify(query))fail();
  const source=raw.source;
  if(!keys(source,['definitionCell','numericalDefinitionCell','function','formula','directorNormalized','wolframInterpolationReproduced','machineReadableWolframOut'])||
    source.definitionCell!=='In[3871]'||source.numericalDefinitionCell!=='In[3874]'||source.function!=='NearConstantWidthScale/NNearConstantWidthScale'||
    source.formula!=='1/sqrt(1-(normalize(bprime).d)^2)'||['directorNormalized','wolframInterpolationReproduced','machineReadableWolframOut'].some(k=>source[k]!==false))fail();
  const norm=raw.normalization;
  if(!keys(norm,['origin','scale'])||!vector(norm.origin,n)||!finite(norm.scale)||norm.scale<=0||!near(norm.scale/evaluate.normalization.scale,1,1e-12)||
    norm.origin.some((x:number,k:number)=>Math.abs(x-evaluate.normalization.origin[k])>Math.max(norm.scale*2e-12,4*Number.EPSILON*Math.abs(x))))fail();
  const proof=raw.proof,cert=raw.certification,no=['nearestFootDistanceChecked','paperRegularityChecked','globalInjectivityChecked',
    'spatialDevelopabilityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
  if(!keys(cert,['fullDomainFormulaCertified',...no])||no.some(k=>cert[k]!==false)||!keys(proof,['status','evaluations','cells','unresolved','roundingModel','method'])||
    !['verified','unknown'].includes(proof.status)||cert.fullDomainFormulaCertified!==(proof.status==='verified')||
    !finite(proof.evaluations)||!Number.isInteger(proof.evaluations)||proof.evaluations<1||proof.evaluations>1023||
    proof.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||proof.method!=='safe-AST/Taylor/adaptive-interval-domain'||
    !Array.isArray(proof.cells)||!Array.isArray(proof.unresolved)||proof.status==='verified'&&proof.unresolved.length||proof.status==='unknown'&&!proof.unresolved.length)fail();
  const coverage:number[][]=[];
  for(const cell of proof.cells){if(!record(cell)||!keys(cell,['start','end','normalizedSpeedLowerBound','radicandLowerBound','scaleUpperBound'])||
    !['start','end','normalizedSpeedLowerBound','radicandLowerBound','scaleUpperBound'].every(k=>finite(cell[k]))||cell.start>=cell.end||
    cell.normalizedSpeedLowerBound<=0||cell.radicandLowerBound<=0||cell.scaleUpperBound<=0)fail();
    const r=evaluate((cell.start+cell.end)/2);
    if(cell.radicandLowerBound>r.radicand+2e-10||cell.normalizedSpeedLowerBound>Math.hypot(...r.baseDerivative)/norm.scale+2e-10||
      cell.scaleUpperBound<r.scale-2e-10)fail();coverage.push([cell.start,cell.end]);}
  for(const range of proof.unresolved){if(!vector(range,2)||range[0]>=range[1])fail();coverage.push(range);}
  coverage.sort((a,b)=>a[0]-b[0]);
  if(!coverage.length||proof.evaluations!==2*coverage.length-1)fail();
  let end=query.parameterStart;for(const [a,b] of coverage){if(!near(a,end,1e-12))fail();end=b;}if(!near(end,query.parameterEnd,1e-12))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==query.segments+1)fail();
  const rowKeys=['s','normalizedBase','normalizedOuter','base','outer','baseDerivative','director','tangentProjection','radicand','scale',
    'scaleDerivative','rulingLength','localPerpendicularDistance'];
  for(const [i,r] of raw.sample.rows.entries()){
    const expected=evaluate(query.parameterStart+(query.parameterEnd-query.parameterStart)*i/query.segments);
    if(!record(r)||!keys(r,rowKeys))fail();
    for(const key of ['normalizedBase','normalizedOuter','director'] as const){if(!vector(r[key],n)||r[key].some((x:number,k:number)=>!near(x,expected[key][k])))fail();}
    if(!vector(r.baseDerivative,n)||r.baseDerivative.some((x:number,k:number)=>!near(x/norm.scale,expected.baseDerivative[k]/norm.scale)))fail();
    for(const key of ['base','outer'] as const){if(!vector(r[key],n)||r[key].some((x:number,k:number)=>Math.abs(x-expected[key][k])>Math.max(norm.scale*2e-9,4*Number.EPSILON*Math.abs(x))))fail();}
    for(const key of ['s','tangentProjection','radicand','scale','scaleDerivative'] as const)
      if(!near(r[key],expected[key]))fail();
    for(const key of ['rulingLength','localPerpendicularDistance'] as const)
      if(!near(r[key]/norm.scale,expected[key]/norm.scale))fail();
  }
  return raw as GenericNearWidthResult;
}

export async function fetchGenericNearWidth(input:unknown,signal?:AbortSignal){
  const query=validateGenericNearWidthQuery(input);
  return parseGenericNearWidthResult(await api('tessellation/curved-near-width',query,signal),query);
}
