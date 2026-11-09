import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type GenericConstantWidthQuery={family:'constant-width-generic-native';baseCurve:[string,string];director:[string,string];
  signedOffset:number;parameterStart:number;parameterEnd:number;footEvaluationStart:number;footEvaluationEnd:number;segments:number};
export const GENERIC_CONSTANT_WIDTH_PRESET:GenericConstantWidthQuery={family:'constant-width-generic-native',
  baseCurve:['Cos[s]','Sin[s]'],director:['-1','0'],signedOffset:.1,parameterStart:0,parameterEnd:.35*Math.PI,
  footEvaluationStart:-.5,footEvaluationEnd:2,segments:64};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a:number[],b:number[])=>a[0]*b[1]-a[1]*b[0];
const keys=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const close=(a:unknown,b:number,tolerance=2e-8)=>finite(a)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
const pair=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===2&&v.every(finite);
function fail():never{throw Error('恒宽求垂足的源函数、原方程、根分支或数值结果回读不一致。');}
const sum=(a:number[])=>{const p:number[]=[];for(let x of a){let j=0;for(let y of p){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const h=x+y,l=y-(h-x);if(l)p[j++]=l;x=h;}p.length=j;p.push(x);}return p.reduceRight((s,x)=>s+x,0);};
export function validateGenericConstantWidthQuery(value:unknown):GenericConstantWidthQuery{
  if(!record(value)||value.family!==GENERIC_CONSTANT_WIDTH_PRESET.family||Object.keys(value).some(k=>!Object.hasOwn(GENERIC_CONSTANT_WIDTH_PRESET,k)))
    throw Error('通用恒宽参数的类型或字段无效。');
  const q={...GENERIC_CONSTANT_WIDTH_PRESET,...value};
  for(const key of ['baseCurve','director'] as const){
    if(!Array.isArray(q[key])||q[key].length!==2)throw Error('恒宽求垂足使用二维基线与母线。');
    q[key]=q[key].map((x:unknown)=>{if(typeof x!=='string')throw Error('坐标函数须为字符串。');compileGenericExpression(x,'s');return x;}) as [string,string];
  }
  if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart< -20||q.parameterEnd>20||
    q.parameterEnd-q.parameterStart<.001||q.parameterEnd-q.parameterStart>12)throw Error('s 区间须在 −20…20，长度 0.001–12。');
  if(!finite(q.footEvaluationStart)||!finite(q.footEvaluationEnd)||q.footEvaluationStart< -40||q.footEvaluationEnd>40||
    q.footEvaluationEnd-q.footEvaluationStart<=0||q.footEvaluationEnd-q.footEvaluationStart>40)throw Error('垂足求值区间须在 −40…40，跨度不超过40。');
  if(!finite(q.signedOffset)||Math.abs(q.signedOffset)>1000)throw Error('有向垂距须在 −1000…1000。');
  if(!Number.isInteger(q.segments)||q.segments<8||q.segments>128)throw Error('显示段数须为 8–128 整数。');
  return q as GenericConstantWidthQuery;
}

/** Recompute the literal vector equation, including d evaluated at the foot. */
export function makeConstantWidthEvaluator(value:unknown){
  const query=validateGenericConstantWidthQuery(value),base=query.baseCurve.map(s=>compileGenericExpression(s,'s')),
    directors=query.director.map(s=>compileGenericExpression(s,'s')),jet=(s:number)=>new GenericTaylor([s,1,0,0]);
  const initial=base.map(f=>f.parts(jet(query.parameterStart))),origin=initial.map(p=>sum([...p.offsets,p.dynamic.c[0]]));
  const speeds=Array.from({length:9},(_,i)=>Math.hypot(...base.map(f=>f.parts(jet(query.parameterStart+
    (query.parameterEnd-query.parameterStart)*i/8)).dynamic.c[1])));
  const scale=Math.max(Math.abs(query.signedOffset),Math.max(...speeds)*(query.parameterEnd-query.parameterStart));
  if(!finite(scale)||scale<=0)throw Error('恒宽基线尺度无效。');
  const curve=(s:number)=>{const v=jet(s),b=base.map((f,i)=>{const p=f.parts(v);
    return p.dynamic.sub(initial[i].dynamic.c[0]).add(sum([...p.offsets,...initial[i].offsets.map(x=>-x)])).div(scale);});
    const velocity=b.map(x=>x.c[1]),speed=Math.hypot(...velocity);
    if(!finite(speed)||speed<=0)throw Error('恒宽基线存在零速度。');
    const acceleration=b.map(x=>2*x.c[2]),tangent=velocity.map(x=>x/speed),normal=[-tangent[1],tangent[0]],
      td=acceleration.map((x,i)=>(x-tangent[i]*dot(tangent,acceleration))/speed),normalDerivative=[-td[1],td[0]],
      d=directors.map(f=>f(v).c[0]),directorDerivative=directors.map(f=>f(v).c[1]);
    return {base:b.map(x=>x.c[0]),velocity,tangent,normal,normalDerivative,director:d,directorDerivative};};
  const evaluate=(s:number,footParameter:number,width:number)=>{
    const at=curve(s),foot=curve(footParameter),sign=Math.sign(dot(foot.normal,foot.director)),
      outer=at.base.map((x,i)=>x+width/scale*at.director[i]),
      expected=foot.base.map((x,i)=>x+query.signedOffset/scale*sign*foot.normal[i]),
      delta=outer.map((x,i)=>x-foot.base[i]),targetDerivative=foot.velocity.map((x,i)=>x+query.signedOffset/scale*sign*foot.normalDerivative[i]),
      sourceDerivative=at.velocity.map((x,i)=>x+width/scale*at.directorDerivative[i]),den=cross(at.director,targetDerivative);
    const zeroDistance=query.signedOffset===0&&width===0&&footParameter===s;
    if(!finite(den)||den===0&&!zeroDistance)fail();
    const normalizedScaleDerivative=zeroDistance?0:-cross(sourceDerivative,targetDerivative)/den,footParameterDerivative=zeroDistance?1:cross(at.director,sourceDerivative)/den,
      normalizedOuterDerivative=sourceDerivative.map((x,i)=>x+normalizedScaleDerivative*at.director[i]);
    return {at,foot,sign,outer,expected,residual:Math.hypot(...outer.map((x,i)=>x-expected[i])),
      normalDistance:dot(delta,foot.normal)*scale,tangentResidual:dot(delta,foot.tangent),
      normalizedScaleDerivative,footParameterDerivative,normalizedOuterDerivative,den};
  };
  return {query,normalization:{origin,scale},curve,evaluate};
}

export type GenericConstantWidthRow={s:number;scale:number;scaleDerivative:number;footParameter:number;footParameterDerivative:number;
  branchSign:number;base:number[];director:number[];outer:number[];foot:number[];normal:number[];baseDerivative:number[];directorDerivative:number[];
  outerDerivative:number[];normalizedBase:number[];normalizedOuter:number[];normalizedFoot:number[];normalizedNormal:number[];
  normalizedBaseDerivative:number[];normalizedOuterDerivative:number[];normalizedScale:number;normalizedScaleDerivative:number;
  rootResidual:number;perpendicularDistance:number};
export type GenericConstantWidthResult={family:'origamica-generic-constant-width';query:GenericConstantWidthQuery;
  source:Record<string,any>;normalization:{origin:number[];scale:number};diagnostics:Record<string,any>;
  certification:{finiteNumericalDistanceVerified:boolean;fullIntervalDistanceCertified:boolean;continuousRootBranchCertified:boolean;
    paperRegularityCertified:boolean;nearestFootDistanceChecked:false;globalInjectivityChecked:false;spatialDevelopabilityChecked:false;
    selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  proof:{status:'verified'|'unknown';evaluations:number;verifiedCells:number;cells:Record<string,any>[];unresolved:number[][];seamChecks:number;
    seamMethod:string;minimumSeamRootDerivativeLowerBound:number|null;roundingModel:string;method:string;reason:string|null};
  sample:{rows:GenericConstantWidthRow[]}};

export function parseGenericConstantWidthResult(raw:unknown,input:unknown):GenericConstantWidthResult{
  const query=validateGenericConstantWidthQuery(input),evaluate=makeConstantWidthEvaluator(query),normExpected=evaluate.normalization;
  if(!record(raw)||!keys(raw,['family','query','source','normalization','diagnostics','certification','proof','sample'])||
    raw.family!=='origamica-generic-constant-width'||!record(raw.query)||!keys(raw.query,Object.keys(query))||
    Object.keys(query).some(k=>JSON.stringify(raw.query[k])!==JSON.stringify(query[k as keyof GenericConstantWidthQuery]))||
    !record(raw.source)||!record(raw.normalization)||!record(raw.diagnostics)||!record(raw.certification)||!record(raw.proof)||!record(raw.sample))fail();
  const source=raw.source;
  if(!keys(source,['definitionCell','savedCell','function','method','equation','actualEquationUsesUnextendedCurve','declaredTangentExtensionUnused',
    'findRootOptionsForwarded','findRootSeedRecipe','interpolationReproduced','machineReadableWolframOut'])||source.definitionCell!=='In[3878]'||
    source.savedCell!=='In[3879]'||source.function!=='NConstantWidthScale2D'||source.method!=='whitelist-AST/Taylor/source-seeded-Newton/interval-root-chart'||
    source.equation!=='b(s)+w*d(s)=b(u)+signedOffset*l(u)*sign(l(u).d(u))'||source.actualEquationUsesUnextendedCurve!==true||
    source.declaredTangentExtensionUnused!==true||['findRootOptionsForwarded','interpolationReproduced','machineReadableWolframOut'].some(k=>source[k]!==false)||
    !record(source.findRootSeedRecipe)||!keys(source.findRootSeedRecipe,['widthStartMultiplier','widthSecondMultiplier','footSecondStepRatio'])||
    source.findRootSeedRecipe.widthStartMultiplier!==.5||source.findRootSeedRecipe.widthSecondMultiplier!==1||source.findRootSeedRecipe.footSecondStepRatio!==.01)fail();
  const norm=raw.normalization;
  if(!keys(norm,['origin','scale'])||!pair(norm.origin)||!finite(norm.scale)||norm.scale<=0||!close(norm.scale/normExpected.scale,1,1e-12)||
    norm.origin.some((x:number,i:number)=>Math.abs(x-normExpected.origin[i])>Math.max(norm.scale*2e-12,4*Number.EPSILON*Math.abs(x))))fail();
  const world=(a:unknown,b:number[])=>pair(a)&&a.every((x,i)=>Math.abs(x-b[i])<=Math.max(norm.scale*2e-8,4*Number.EPSILON*Math.abs(x))),
    vector=(a:unknown,b:number[])=>pair(a)&&a.every((x,i)=>close(x,b[i]));
  const cert=raw.certification,proof=raw.proof,no=['nearestFootDistanceChecked','globalInjectivityChecked','spatialDevelopabilityChecked',
    'selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
  if(!keys(cert,['finiteNumericalDistanceVerified','fullIntervalDistanceCertified','continuousRootBranchCertified','paperRegularityCertified',...no])||
    cert.finiteNumericalDistanceVerified!==true||no.some(k=>cert[k]!==false)||
    !keys(proof,['status','evaluations','verifiedCells','cells','unresolved','seamChecks','seamMethod','minimumSeamRootDerivativeLowerBound','roundingModel','method','reason'])||
    !['verified','unknown'].includes(proof.status)||cert.fullIntervalDistanceCertified!==(proof.status==='verified')||
    cert.continuousRootBranchCertified!==(proof.status==='verified')||!Number.isInteger(proof.evaluations)||proof.evaluations<0||proof.evaluations>1024||
    !Array.isArray(proof.cells)||!Array.isArray(proof.unresolved)||proof.verifiedCells!==proof.cells.length||!Number.isInteger(proof.seamChecks)||proof.seamChecks<0||
    proof.seamMethod!=='point-krawczyk/cell-root-hull-identity/shared-simple-root'||
    proof.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||proof.method!=='parameterized-krawczyk/source-seeded-simple-root'||
    !(proof.reason===null||typeof proof.reason==='string')||
    proof.status==='verified'&&proof.unresolved.length||proof.status==='unknown'&&!proof.unresolved.length)fail();
  if(proof.seamChecks===0?proof.minimumSeamRootDerivativeLowerBound!==null:
    !finite(proof.minimumSeamRootDerivativeLowerBound)||proof.minimumSeamRootDerivativeLowerBound<=0)fail();
  const coverage:number[][]=[];
  for(const c of proof.cells){
    const scalar=['start','end','rootDerivativeLowerBound','signProjectionLowerBound','footSpeedLowerBound','sourceSpeedLowerBound','directorLengthLowerBound'];
    if(!record(c)||!keys(c,[...scalar,'footBounds','normalizedWidthBounds','branchSign'])||!scalar.every(k=>finite(c[k]))||c.start>=c.end||
      scalar.slice(2).some(k=>c[k]<=0)||!pair(c.footBounds)||c.footBounds[0]>=c.footBounds[1]||!pair(c.normalizedWidthBounds)||
      c.normalizedWidthBounds[0]>c.normalizedWidthBounds[1]||![-1,1].includes(c.branchSign)||
      c.footBounds[0]<query.footEvaluationStart-1e-12||c.footBounds[1]>query.footEvaluationEnd+1e-12)fail();
    const at=evaluate.curve((c.start+c.end)/2),foot=evaluate.curve((c.footBounds[0]+c.footBounds[1])/2),
      td=foot.velocity.map((x,i)=>x+query.signedOffset/norm.scale*c.branchSign*foot.normalDerivative[i]);
    if(c.rootDerivativeLowerBound>Math.abs(cross(td,at.director))+2e-8||
      c.signProjectionLowerBound>c.branchSign*dot(foot.normal,foot.director)+2e-8||
      c.footSpeedLowerBound>Math.hypot(...foot.velocity)+2e-8||c.sourceSpeedLowerBound>Math.hypot(...at.velocity)+2e-8||
      c.directorLengthLowerBound>Math.hypot(...at.director)+2e-8)fail();coverage.push([c.start,c.end]);
  }
  for(const r of proof.unresolved){if(!pair(r)||r[0]>=r[1])fail();coverage.push(r);}
  coverage.sort((a,b)=>a[0]-b[0]);let end=query.parameterStart;
  if(!coverage.length)fail();for(const [a,b] of coverage){if(!close(a,end,1e-12))fail();end=b;}if(!close(end,query.parameterEnd,1e-12))fail();
  if(proof.status==='verified'&&proof.seamChecks<proof.cells.length-1)fail();
  const diagnostic=raw.diagnostics,paper=diagnostic.paperRegularity;
  if(!keys(diagnostic,['validationNodes','maximumNormalizedRootResidual','maximumNormalizedPerpendicularResidual','maximumSourceSeedRootDifference','paperRegularity'])||
    !Number.isInteger(diagnostic.validationNodes)||diagnostic.validationNodes<query.segments+1||diagnostic.validationNodes>1025||
    !['maximumNormalizedRootResidual','maximumNormalizedPerpendicularResidual','maximumSourceSeedRootDifference'].every(k=>finite(diagnostic[k])&&diagnostic[k]>=0)||
    diagnostic.maximumNormalizedRootResidual>2e-7||diagnostic.maximumNormalizedPerpendicularResidual>2e-7||
    !record(paper)||!keys(paper,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
    !['verified','unknown','degenerate'].includes(paper.status)||![null,-1,1].includes(paper.orientation)||
    !(paper.reason===null||typeof paper.reason==='string')||cert.paperRegularityCertified!==(paper.status==='verified')||
    (paper.status==='verified'?proof.status!=='verified'||query.signedOffset===0||!finite(paper.minimumAbsoluteJacobianLowerBound)||paper.minimumAbsoluteJacobianLowerBound<=0||paper.orientation===null:
      paper.minimumAbsoluteJacobianLowerBound!==null))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==query.segments+1)fail();
  const rowKeys=['s','scale','scaleDerivative','footParameter','footParameterDerivative','branchSign','base','director','outer','foot','normal',
    'baseDerivative','directorDerivative','outerDerivative','normalizedBase','normalizedOuter','normalizedFoot','normalizedNormal',
    'normalizedBaseDerivative','normalizedOuterDerivative','normalizedScale','normalizedScaleDerivative','rootResidual','perpendicularDistance'];
  for(const [i,row] of raw.sample.rows.entries()){
    const s=query.parameterStart+(query.parameterEnd-query.parameterStart)*i/query.segments;
    if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!finite(row.scale)||!finite(row.footParameter)||
      row.footParameter<query.footEvaluationStart||row.footParameter>query.footEvaluationEnd)fail();
    const r=evaluate.evaluate(s,row.footParameter,row.scale),worldAt=(p:number[])=>p.map((x,k)=>norm.origin[k]+x*norm.scale);
    if(paper.status==='verified'){
      const w=row.scale/norm.scale,j0=w*cross(r.at.velocity,r.at.director),j1=j0+w*w*cross(r.at.directorDerivative,r.at.director);
      if(Math.min(paper.orientation*j0,paper.orientation*j1)<paper.minimumAbsoluteJacobianLowerBound-2e-10)fail();
    }
    if(r.residual>3e-7||Math.abs(Math.abs(r.normalDistance)-Math.abs(query.signedOffset))/norm.scale>2e-7||
      row.branchSign!==r.sign||!vector(row.normalizedBase,r.at.base)||!vector(row.normalizedOuter,r.outer)||!vector(row.normalizedFoot,r.foot.base)||
      !vector(row.normal,r.foot.normal)||!vector(row.normalizedNormal,r.foot.normal)||!vector(row.director,r.at.director)||
      !world(row.base,worldAt(r.at.base))||!world(row.outer,worldAt(r.outer))||!world(row.foot,worldAt(r.foot.base))||
      !vector(row.normalizedBaseDerivative,r.at.velocity)||!vector(row.normalizedOuterDerivative,r.normalizedOuterDerivative)||
      !vector(row.directorDerivative,r.at.directorDerivative)||!pair(row.baseDerivative)||!pair(row.outerDerivative)||
      !vector(row.baseDerivative.map(x=>x/norm.scale),r.at.velocity)||!vector(row.outerDerivative.map(x=>x/norm.scale),r.normalizedOuterDerivative)||
      !close(row.normalizedScale,row.scale/norm.scale)||!close(row.normalizedScaleDerivative,r.normalizedScaleDerivative)||
      !close(row.scaleDerivative/norm.scale,r.normalizedScaleDerivative)||!close(row.footParameterDerivative,r.footParameterDerivative)||
      !finite(row.rootResidual)||row.rootResidual<0||row.rootResidual>2e-7||!close(row.rootResidual,Math.max(...r.outer.map((x,k)=>Math.abs(x-r.expected[k]))),2e-10)||
      !close(row.perpendicularDistance/norm.scale,Math.abs(query.signedOffset)/norm.scale,2e-7))fail();
    for(const c of proof.cells){if(s<c.start-1e-12||s>c.end+1e-12)continue;
      if(row.footParameter<c.footBounds[0]-2e-10||row.footParameter>c.footBounds[1]+2e-10||row.branchSign!==c.branchSign||
        row.normalizedScale<c.normalizedWidthBounds[0]-2e-10||row.normalizedScale>c.normalizedWidthBounds[1]+2e-10)fail();}
  }
  return raw as GenericConstantWidthResult;
}

export async function fetchGenericConstantWidth(input:unknown,signal?:AbortSignal){
  const query=validateGenericConstantWidthQuery(input);
  return parseGenericConstantWidthResult(await api('tessellation/curved-constant-width',query,signal),query);
}
