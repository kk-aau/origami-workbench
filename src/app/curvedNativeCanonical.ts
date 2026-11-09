import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

type V3=[number,number,number];
type S3=[string,string,string];
type CommonQuery={family:'canonical-developable-native';baseCurve:S3;parameterStart:number;parameterEnd:number;
  rulingStart:number;rulingEnd:number;crossParameterStart:number;crossParameterEnd:number;segments:number;rulingSegments:number};
export type GenericCanonicalQuery=CommonQuery&({operation:'tangent';director?:never}|
  {operation:'cylinder'|'cone'|'general';director:S3});
export type CanonicalIdentity={status:'zero'|'nonzero'|'unknown'|'not-applicable';analyticIdentity:boolean;method:string};
export type CanonicalMetric={E:number;F:number;G:number;normalizedArea:number;regular:boolean};
type Bounds=[number,number];
type Regularity={status:'verified'|'unknown'|'singular';minimumNormalizedJacobianLowerBound:number|null};
type DomainCell={start:number;end:number;arcSpeedBounds:Bounds}|{start:number;end:number;areaBounds:Bounds;
  directorDerivativeBounds:Bounds;baseSpeedBounds:Bounds;arcSpeedBounds:Bounds|null};
export type GenericCanonicalResult={family:'origamica-generic-canonical';query:GenericCanonicalQuery;
  source:{definitionCell:string;function:string;canonicalBranch:'cylinder'|'cone'|'tangent';coneOriginalUnassignedBbCheck:boolean;
    numericWolframOutAvailable:false;flatDevelopmentReturnedByOriginal:false;rulingParameterMeaning:'signed-unit-ruling-length';
    crossParameterMeaning:'signed-unit-ruling-length'|'source-base-parameter-in-arc-length-difference';generalBaseShiftFraction:string|null};
  certification:{cylinderBranchIdentity:CanonicalIdentity;apexIdentity:CanonicalIdentity;edgeOfRegressionIdentity:CanonicalIdentity;
    developabilityIdentity:CanonicalIdentity;sourceDomain:{certified:boolean;roundingModel:string;evaluations:number;verifiedCells:number;
      cells:DomainCell[];unresolved:Bounds[];reason:string|null;canonicalRegularity:Regularity;crossRegularity:Regularity};
    unitDirectorFiniteMaximumError:number;finiteDevelopabilityMaximumRelativeResidual:number;sameRuledSurfaceSetByFormula:true;
    sameFiniteRawPatch:'not-asserted';integrationErrorIntervalCertified:false;sampledMeshExactFOLD:false;adoptableCreasePattern:false;
    motionVerified:false;selfCollisionVerified:false};
  normalization:{rawOrigin:V3;canonicalOrigin:V3;scale:number;rawDirectorScale:number};
  integration:null|{method:'DOP853-arc-length';evaluations:number;relativeTolerance:2e-12;absoluteTolerance:2e-14;errorIntervalCertified:false};
  uValues:number[];rulingValues:number[];crossParameterValues:number[];
  samples:{s:number;rawBase:V3;rawDirector:V3;canonicalBase:V3;canonicalDirector:V3;canonicalBaseDerivative:V3;
    canonicalDirectorDerivative:V3;canonicalEFG:CanonicalMetric[];crossEFG:CanonicalMetric[]}[];
  rawGrid:V3[][];canonicalGrid:V3[][];crossGrid:V3[][];
  normalizedRawGrid:V3[][];normalizedCanonicalGrid:V3[][];normalizedCrossGrid:V3[][]};

export const CANONICAL_NATIVE_PRESETS:Record<GenericCanonicalQuery['operation'],GenericCanonicalQuery>={
  cylinder:{family:'canonical-developable-native',operation:'cylinder',baseCurve:['cos(s)','sin(s)','2*s'],director:['0','0','2'],
    parameterStart:-Math.PI/4,parameterEnd:3*Math.PI/4,rulingStart:0,rulingEnd:1,crossParameterStart:0,crossParameterEnd:1,segments:32,rulingSegments:8},
  cone:{family:'canonical-developable-native',operation:'cone',baseCurve:['0','0','.5'],director:['sqrt(3)','sin(s)','-cos(s)'],
    parameterStart:0,parameterEnd:Math.PI,rulingStart:0,rulingEnd:1,crossParameterStart:0,crossParameterEnd:1,segments:32,rulingSegments:8},
  tangent:{family:'canonical-developable-native',operation:'tangent',baseCurve:['sqrt(3)/2*cos(s)','sqrt(3)/2*sin(s)','.5*s'],
    parameterStart:0,parameterEnd:Math.PI,rulingStart:-.5,rulingEnd:.5,crossParameterStart:0,crossParameterEnd:Math.PI,segments:32,rulingSegments:8},
  general:{family:'canonical-developable-native',operation:'general',baseCurve:['sqrt(3)/2*(cos(s)-s*sin(s))','sqrt(3)/2*(sin(s)+s*cos(s))','s'],
    director:['-sqrt(3)/2*sin(s)','sqrt(3)/2*cos(s)','.5'],parameterStart:0,parameterEnd:Math.PI,rulingStart:-.5,rulingEnd:.5,
    crossParameterStart:0,crossParameterEnd:Math.PI,segments:32,rulingSegments:8}};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const commonKeys=['family','operation','baseCurve','parameterStart','parameterEnd','rulingStart','rulingEnd',
  'crossParameterStart','crossParameterEnd','segments','rulingSegments'];
function fail(detail=''):never{throw Error(`原规范构造的来源、分支证据、三维规则或度量回读不一致。${detail}`);}
export function validateGenericCanonicalQuery(raw:unknown):GenericCanonicalQuery{
  if(!record(raw)||raw.family!=='canonical-developable-native'||!['cylinder','cone','tangent','general'].includes(raw.operation)||
    !keys(raw,[...commonKeys,...(raw.operation==='tangent'?[]:['director'])]))throw Error('规范构造须有完整原来源和两个独立参数域；切线来源仅接受基线。');
  for(const name of ['baseCurve',...(raw.operation==='tangent'?[]:['director'])]){
    if(!Array.isArray(raw[name])||raw[name].length!==3)throw Error('三维函数须有三个安全标量表达式。');
    for(const source of raw[name]){compileGenericExpression(source,'s');
      if(name==='director'&&raw.operation==='cylinder'&&/\bs\b/.test(source))throw Error('原柱面母线源不得含参数s，即使表达式可抵消或幅度恒向。');}}
  for(const [start,end] of [['parameterStart','parameterEnd'],['crossParameterStart','crossParameterEnd']])
    if(!finite(raw[start])||!finite(raw[end])||raw[start]< -10||raw[end]>10||raw[end]-raw[start]<.01||raw[end]-raw[start]>12)
      throw Error('两个参数域须各在−10…10内，跨度0.01–12。');
  if(!finite(raw.rulingStart)||!finite(raw.rulingEnd)||raw.rulingStart< -1e6||raw.rulingEnd>1e6||raw.rulingStart>=raw.rulingEnd)
    throw Error('普通母线长度域须为±10⁶内的递增有限数。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>32)
    throw Error('显示密度须为8–128纵向段、2–32横向段。');
  return {...raw,baseCurve:raw.baseCurve.slice(),...(raw.operation==='tangent'?{}:{director:raw.director.slice()})} as GenericCanonicalQuery;
}

const sumExact=(numbers:number[])=>{const parts:number[]=[];for(let x of numbers){let i=0;for(let y of parts){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;
}parts.length=i;parts.push(x);}return parts.reduceRight((s,x)=>s+x,0);};
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a:number[],b:number[],factor=1)=>a.map((x,i)=>x+factor*b[i]);
const mul=(a:number[],factor:number)=>a.map(x=>x*factor);
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tm=(a:GenericTaylor[],factor:number|GenericTaylor)=>a.map(x=>x.mul(factor));
const tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]);
const tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);
const linspace=(lo:number,hi:number,count:number)=>Array.from({length:count},(_,i)=>i===count-1?hi:lo+(hi-lo)*i/(count-1));
const relative=(x:unknown,y:number,reference=Math.abs(y),tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(reference,Math.abs(y),Number.MIN_VALUE);
const coordinate=(x:unknown,y:number,reference:number)=>finite(x)&&Math.abs(x-y)<=2e-8*Math.max(reference,Number.MIN_VALUE)+8*Number.EPSILON*Math.abs(y);
const checkVector=(x:unknown,y:number[],reference:number[])=>vector(x,y.length)&&y.every((v,i)=>coordinate(x[i],v,reference[i]));
const crossRoundoff=(a:number[],b:number[])=>[Math.abs(a[1]*b[2])+Math.abs(a[2]*b[1]),Math.abs(a[2]*b[0])+Math.abs(a[0]*b[2]),Math.abs(a[0]*b[1])+Math.abs(a[1]*b[0])].map(x=>64*Number.EPSILON*x);
const hasCrossWitness=(a:number[],b:number[])=>cross(a,b).some((x,i)=>Math.abs(x)>crossRoundoff(a,b)[i]);

/** Source Taylor jets are replayed independently; branch certificates remain backend
 * bounded symbolic evidence, never replaced by a near-zero sampling decision. */
function makeEvaluator(q:GenericCanonicalQuery,branch:GenericCanonicalResult['source']['canonicalBranch']){
  const bf=q.baseCurve.map(x=>compileGenericExpression(x,'s')),df=q.operation==='tangent'?[]:q.director.map(x=>compileGenericExpression(x,'s')),
    variable=(s:number)=>new GenericTaylor([s,1,0,0]),anchor=bf.map(f=>f.parts(variable(q.parameterStart))),
    rawOrigin=anchor.map(p=>sumExact([...p.offsets,p.dynamic.c[0]])),nodes=linspace(q.parameterStart,q.parameterEnd,17),
    velocities=nodes.map(s=>Math.hypot(...bf.map(f=>f.parts(variable(s)).dynamic.c[1]))),
    dscale=Math.max(...(df.length?nodes.map(s=>Math.hypot(...df.map(f=>f(variable(s)).c[0]))):velocities)),
    scale=Math.max(Math.max(...velocities)*(q.parameterEnd-q.parameterStart),dscale,Math.abs(q.rulingStart),Math.abs(q.rulingEnd));
  if(!(scale>0)||!(dscale>0)||!finite(scale)||!finite(dscale))fail();
  const raw=(s:number)=>{
    const t=variable(s),parts=bf.map(f=>f.parts(t)),b=parts.map((p,i)=>new GenericTaylor(p.dynamic.c.map((x,k)=>k?x/scale:
      sumExact([x,-anchor[i].dynamic.c[0],...p.offsets,...anchor[i].offsets.map(v=>-v)])/scale))),
      bRound=parts.map((p,i)=>(Math.abs(p.dynamic.c[0])+Math.abs(anchor[i].dynamic.c[0])+Math.abs(sumExact([...p.offsets,...anchor[i].offsets.map(v=>-v)])))/scale),
      rd=df.length?df.map(f=>f(t).div(dscale)):tm(b.map(x=>x.derivative()),scale/dscale),norm=td(rd,rd).sqrt(),
      rawPrime=rd.map(x=>x.derivative()),c=tc(rd,rawPrime),Q=tm(tc(rd,c),-1),initialD=tm(rd,norm.inv());
    if(branch==='cylinder'&&hasCrossWitness(tv(rd),tv(rawPrime)))fail();
    const d=branch==='cylinder'?initialD.map(x=>x.constant(x.c[0])):(()=>{
      const dp=tm(Q,norm.pow(3).inv());return initialD.map((x,i)=>new GenericTaylor([x.c[0],...dp[i].c.map((v,j)=>v/(j+1))]));})();
    const qRound=crossRoundoff(tv(rd),tv(c)).map(x=>x/(norm.c[0]**3)+256*Number.EPSILON*Math.hypot(...crossRoundoff(tv(rd),tv(rawPrime)))*Math.hypot(...tv(rd))/(norm.c[0]**3));
    return {b,d,rd,norm,c,Q,bRound,qRound};
  };
  const first=raw(q.parameterStart),beta=(p:ReturnType<typeof raw>)=>td(p.b.map(x=>x.derivative()),p.Q).mul(p.norm).div(td(p.c,p.c)),
    betaAnchor=q.operation==='general'&&branch!=='cylinder'?mul(tv(first.d),beta(first).c[0]):[0,0,0],
    canonicalOrigin=branch==='cylinder'?add(rawOrigin,tv(first.d),-dot(rawOrigin,tv(first.d))):add(rawOrigin,betaAnchor,-scale);
  const cache=new Map<number,ReturnType<typeof evaluate>>();
  function evaluate(s:number){
    const p=raw(s);let b=p.b,bRound=p.bRound.slice(),bpRound=p.b.map(x=>Math.abs(x.c[1]));
    if(branch==='cylinder'){
      const projection=td(b,p.d),projected=tm(p.d,projection);b=b.map((x,i)=>x.sub(projected[i]));
      bRound=bRound.map((x,i)=>x+Math.abs(projected[i].c[0]));bpRound=bpRound.map((x,i)=>x+Math.abs(projected[i].c[1]));
    }else if(q.operation==='general'){
      const shift=tm(p.d,beta(p));b=b.map((x,i)=>x.sub(shift[i]).add(betaAnchor[i]));
      bRound=bRound.map((x,i)=>x+Math.abs(shift[i].c[0])+Math.abs(betaAnchor[i]));
      bpRound=bpRound.map((x,i)=>x+Math.abs(shift[i].c[1]));
    }
    const result={s,rawB:tv(p.b),rawD:q.operation==='tangent'?tv(p.d):mul(tv(p.rd),dscale),b:tv(b),d:tv(p.d),bp:tp(b),dp:tp(p.d),
      bRound,bpRound,dpRound:p.qRound,rawBRound:p.bRound,rawBP:tp(p.b),rawRD:tv(p.rd),rawRDPrime:tp(p.rd)};
    if(Object.values(result).some(x=>Array.isArray(x)&&!x.every(finite)))fail();return result;
  }
  const point=(s:number)=>{let p=cache.get(s);if(!p){p=evaluate(s);cache.set(s,p);}return p;},
    speed=(s:number)=>q.operation==='tangent'?Math.hypot(...raw(s).b.map(x=>x.c[1])):Math.hypot(...point(s).bp);
  const canonicalOriginRound=rawOrigin.map((x,i)=>64*Number.EPSILON*(Math.abs(x)+
    (branch==='cylinder'?rawOrigin.reduce((a,b,j)=>a+Math.abs(b*tv(first.d)[j]),0)*Math.abs(tv(first.d)[i]):Math.abs(scale*betaAnchor[i]))));
  return {point,speed,scale,dscale,rawOrigin,canonicalOrigin,canonicalOriginRound};
}
type SourceJet=ReturnType<ReturnType<typeof makeEvaluator>['point']>;

/** Independent adaptive quadrature, rather than the backend DOP853 trajectory. */
function replayArc(k:ReturnType<typeof makeEvaluator>,nodes:number[]){
  const ordered=[...new Set(nodes)].sort((a,b)=>a-b),lo=ordered[0],hi=ordered.at(-1)!,
    arcScale=Math.max(...linspace(lo,hi,17).map(k.speed))*(hi-lo);if(!(arcScale>0)||!finite(arcScale))fail();
  let evaluations=0;const f=(s:number)=>{if(++evaluations>24000)throw Error('独立弧长回读超过有限积分预算。');return k.speed(s)/arcScale;};
  function integrate(a:number,b:number,fa:number,fm:number,fb:number,whole:number,tol:number,depth:number):number{
    const mid=(a+b)/2,lm=(a+mid)/2,rm=(mid+b)/2,fl=f(lm),fr=f(rm),left=(mid-a)*(fa+4*fl+fm)/6,right=(b-mid)*(fm+4*fr+fb)/6,
      change=left+right-whole;if(Math.abs(change)<=15*tol)return left+right+change/15;
    if(depth<=0||lm===a||rm===b)throw Error('独立弧长回读未达到有限积分精度。');
    return integrate(a,mid,fa,fl,fm,left,tol/2,depth-1)+integrate(mid,b,fm,fr,fb,right,tol/2,depth-1);
  }
  const arc=new Map<number,number>([[lo,0]]);let total=0;
  for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i],fa=f(a),fm=f((a+b)/2),fb=f(b),whole=(b-a)*(fa+4*fm+fb)/6;
    total+=integrate(a,b,fa,fm,fb,whole,1e-12*(b-a)/(hi-lo),20);arc.set(b,total*arcScale);}
  return (u:number,v:number)=>arc.get(v)!-arc.get(u)!;
}

function identity(x:unknown):x is CanonicalIdentity{
  if(!record(x)||!keys(x,['status','analyticIdentity','method'])||!['zero','nonzero','unknown','not-applicable'].includes(x.status)||
    x.analyticIdentity!==(x.status==='zero'))return false;
  return x.status==='zero'?['bounded-safe-symbolic-identity','source-constant-AST','literal-derivative-normalization','literal-construction-identity'].includes(x.method):
    x.status==='nonzero'?x.method==='outward-singleton-witness':x.status==='unknown'?x.method==='identity-budget-unresolved':x.method==='constant-apex-branch';
}
function metric(raw:unknown,su:number[],sv:number[],units:number[],round:number[],singular:boolean){
  if(!record(raw)||!keys(raw,['E','F','G','normalizedArea','regular'])||!finite(raw.E)||!finite(raw.F)||!finite(raw.G)||!finite(raw.normalizedArea)||
    raw.E<0||raw.G<0||raw.normalizedArea<0||typeof raw.regular!=='boolean'||raw.regular!==(raw.normalizedArea>0))fail();
  const e=dot(su,su)*units[0],f=dot(su,sv)*units[1],g=dot(sv,sv)*units[2],area=singular?0:Math.hypot(...cross(su,sv)),
    suSize=Math.hypot(...round),svSize=Math.hypot(...sv),areaSize=Math.hypot(...cross(round.map(Math.abs),sv.map(Math.abs)))+
      Math.hypot(...crossRoundoff(su,sv));
  if(!relative(raw.E,e,suSize**2*units[0])||!relative(raw.F,f,suSize*svSize*units[1])||!relative(raw.G,g,Math.abs(g))||
    !relative(raw.normalizedArea,area,Math.max(area,areaSize))||singular&&(raw.normalizedArea!==0||raw.regular))fail();
}

function intervalBounds(x:unknown):x is Bounds{return vector(x,2)&&x[0]>=0&&x[1]>=x[0];}
function regularity(x:unknown):x is Regularity{return record(x)&&keys(x,['status','minimumNormalizedJacobianLowerBound'])&&
  ['verified','unknown','singular'].includes(x.status)&&(x.status==='verified'?finite(x.minimumNormalizedJacobianLowerBound)&&x.minimumNormalizedJacobianLowerBound>0:x.minimumNormalizedJacobianLowerBound===null);}
function within(bounds:Bounds,value:number,reference=Math.abs(value)){
  return value>=bounds[0]-2e-8*Math.max(reference,Number.MIN_VALUE)&&value<=bounds[1]+2e-8*Math.max(reference,Number.MIN_VALUE);
}

export function parseGenericCanonicalResult(input:unknown,request?:unknown):GenericCanonicalResult{
  if(!record(input)||!keys(input,['family','query','source','certification','normalization','integration','uValues','rulingValues','crossParameterValues','samples',
    'rawGrid','canonicalGrid','crossGrid','normalizedRawGrid','normalizedCanonicalGrid','normalizedCrossGrid'])||input.family!=='origamica-generic-canonical')fail();
  const q=validateGenericCanonicalQuery(input.query);if(request){const expected=validateGenericCanonicalQuery(request);
    if(Object.keys(expected).some(name=>JSON.stringify(q[name as keyof GenericCanonicalQuery])!==JSON.stringify(expected[name as keyof GenericCanonicalQuery])))fail();}
  const src=input.source,cert=input.certification,n=input.normalization;
  if(!record(src)||!keys(src,['definitionCell','function','canonicalBranch','coneOriginalUnassignedBbCheck','numericWolframOutAvailable','flatDevelopmentReturnedByOriginal',
    'rulingParameterMeaning','crossParameterMeaning','generalBaseShiftFraction'])||!['cylinder','cone','tangent'].includes(src.canonicalBranch))fail();
  const branch=src.canonicalBranch as GenericCanonicalResult['source']['canonicalBranch'],arc=branch==='tangent',
    cells={cylinder:'In[3825]',cone:'In[3829]',tangent:'In[3832]',general:'In[3836]'},
    names={cylinder:'CanonicalCylinderDevelopableSystem',cone:'CanonicalConeDevelopableSystem',tangent:'CanonicalTangentDevelopableSystem',general:'CanonicalDevelopableSystem'};
  if(src.definitionCell!==cells[q.operation]||src.function!==names[q.operation]||src.coneOriginalUnassignedBbCheck!==(q.operation==='cone')||
    src.numericWolframOutAvailable!==false||src.flatDevelopmentReturnedByOriginal!==false||src.rulingParameterMeaning!=='signed-unit-ruling-length'||
    src.crossParameterMeaning!==(arc?'source-base-parameter-in-arc-length-difference':'signed-unit-ruling-length')||
    src.generalBaseShiftFraction!==(q.operation==='general'&&branch!=='cylinder'?'(rawBPrime.dot(unitDPrime))/(unitDPrime.dot(unitDPrime))':null)||
    q.operation!=='general'&&branch!==q.operation)fail();
  if(!record(cert)||!keys(cert,['cylinderBranchIdentity','apexIdentity','edgeOfRegressionIdentity','developabilityIdentity','sourceDomain','unitDirectorFiniteMaximumError',
    'finiteDevelopabilityMaximumRelativeResidual','sameRuledSurfaceSetByFormula','sameFiniteRawPatch','integrationErrorIntervalCertified','sampledMeshExactFOLD','adoptableCreasePattern','motionVerified','selfCollisionVerified'])||
    !['cylinderBranchIdentity','apexIdentity','edgeOfRegressionIdentity','developabilityIdentity'].every(name=>identity(cert[name]))||
    cert.sameRuledSurfaceSetByFormula!==true||cert.sameFiniteRawPatch!=='not-asserted'||
    ['integrationErrorIntervalCertified','sampledMeshExactFOLD','adoptableCreasePattern','motionVerified','selfCollisionVerified'].some(name=>cert[name]!==false)||
    !finite(cert.unitDirectorFiniteMaximumError)||cert.unitDirectorFiniteMaximumError<0||cert.unitDirectorFiniteMaximumError>1e-12||
    !finite(cert.finiteDevelopabilityMaximumRelativeResidual)||cert.finiteDevelopabilityMaximumRelativeResidual<0||cert.finiteDevelopabilityMaximumRelativeResidual>1+1e-12)fail();
  const ci=cert.cylinderBranchIdentity as CanonicalIdentity,ai=cert.apexIdentity as CanonicalIdentity,
    ti=cert.edgeOfRegressionIdentity as CanonicalIdentity,di=cert.developabilityIdentity as CanonicalIdentity;
  if(q.operation==='cylinder'&&(ci.status!=='zero'||ci.method!=='source-constant-AST')||
    q.operation==='tangent'&&(ti.status!=='zero'||ti.method!=='literal-derivative-normalization')||
    ['cylinder','tangent'].includes(q.operation)&&(di.status!=='zero'||di.method!=='literal-construction-identity')||
    q.operation!=='general'&&q.operation!=='cylinder'&&ci.status!=='unknown'||
    q.operation==='general'&&(ci.status!==(branch==='cylinder'?'zero':'nonzero')||branch!=='cylinder'&&ai.status!==(branch==='cone'?'zero':'nonzero')||
      branch==='cone'&&ti.status!=='not-applicable')||q.operation!=='general'&&ti.status==='not-applicable'||
    ['cylinder','tangent'].includes(q.operation)&&ai.status!=='unknown'||q.operation==='cone'&&ti.status!=='unknown')fail();
  const k=makeEvaluator(q,branch);
  if(!record(n)||!keys(n,['rawOrigin','canonicalOrigin','scale','rawDirectorScale'])||!relative(n.scale,k.scale,k.scale,2e-12)||
    !relative(n.rawDirectorScale,k.dscale,k.dscale,2e-12)||!checkVector(n.rawOrigin,k.rawOrigin,[k.scale,k.scale,k.scale])||
    !vector(n.canonicalOrigin,3)||k.canonicalOrigin.some((x,i)=>Math.abs(n.canonicalOrigin[i]-x)>2e-8*k.scale+k.canonicalOriginRound[i]))fail();
  const u=linspace(q.parameterStart,q.parameterEnd,q.segments+1),w=linspace(q.rulingStart,q.rulingEnd,q.rulingSegments+1),
    v=linspace(q.crossParameterStart,q.crossParameterEnd,q.rulingSegments+1),parameters=(x:unknown,expected:number[])=>
      vector(x,expected.length)&&expected.every((y,i)=>relative(x[i],y,Math.abs(expected[0])+Math.abs(expected.at(-1)!)+Math.abs(y),2e-14));
  if(!parameters(input.uValues,u)||!parameters(input.rulingValues,w)||!parameters(input.crossParameterValues,v)||
    !Array.isArray(input.samples)||input.samples.length!==u.length)fail();
  if(arc){const integ=input.integration;if(!record(integ)||!keys(integ,['method','evaluations','relativeTolerance','absoluteTolerance','errorIntervalCertified'])||
    integ.method!=='DOP853-arc-length'||!Number.isInteger(integ.evaluations)||integ.evaluations<1||integ.evaluations>24000||integ.relativeTolerance!==2e-12||integ.absoluteTolerance!==2e-14||integ.errorIntervalCertified!==false)fail();
  }else if(input.integration!==null)fail();
  const arcDelta=arc?replayArc(k,[...u,...v]):null;
  for(const name of ['rawGrid','canonicalGrid','crossGrid','normalizedRawGrid','normalizedCanonicalGrid','normalizedCrossGrid'])
    if(!Array.isArray(input[name])||input[name].length!==u.length||input[name].some((row:unknown)=>!Array.isArray(row)||row.length!==w.length||row.some(p=>!vector(p,3))))fail();
  let maximumUnit=0,maximumDevelop=0,directionWitness=false,baseWitness=false,regressionWitness=false,developWitness=false;
  for(let i=0;i<u.length;i++){
    const s=u[i],p=k.point(s),row=input.samples[i],worldRaw=add(k.rawOrigin,p.rawB,k.scale),worldBase=add(k.canonicalOrigin,p.b,k.scale);
    if(!record(row)||!keys(row,['s','rawBase','rawDirector','canonicalBase','canonicalDirector','canonicalBaseDerivative','canonicalDirectorDerivative','canonicalEFG','crossEFG'])||
      !relative(row.s,s,Math.abs(q.parameterStart)+Math.abs(q.parameterEnd),2e-14)||
      !checkVector(row.rawBase,worldRaw,p.rawBRound.map((x,j)=>x*k.scale+Math.abs(worldRaw[j])*Number.EPSILON))||
      !checkVector(row.canonicalBase,worldBase,p.bRound.map((x,j)=>x*k.scale+Math.abs(worldBase[j])*Number.EPSILON+k.canonicalOriginRound[j]/2e-8))||
      !checkVector(row.rawDirector,p.rawD,p.rawD.map(Math.abs))||!checkVector(row.canonicalDirector,p.d,p.d.map(Math.abs))||
      !checkVector(row.canonicalBaseDerivative,mul(p.bp,k.scale),mul(p.bpRound,k.scale))||
      !vector(row.canonicalDirectorDerivative,3)||p.dp.some((x,j)=>Math.abs(row.canonicalDirectorDerivative[j]-x)>2e-8*Math.abs(x)+p.dpRound[j])||
      !Array.isArray(row.canonicalEFG)||row.canonicalEFG.length!==w.length||!Array.isArray(row.crossEFG)||row.crossEFG.length!==v.length)fail();
    maximumUnit=Math.max(maximumUnit,Math.abs(dot(p.d,p.d)-1));const den=Math.hypot(...p.bp)*Math.hypot(...p.dp),triple=dot(cross(p.bp,p.d),p.dp);
    maximumDevelop=Math.max(maximumDevelop,den===0||ai.analyticIdentity?0:Math.abs(triple)/den);
    directionWitness ||= hasCrossWitness(p.rawRD,p.rawRDPrime);
    baseWitness ||= p.bp.some((x,j)=>Math.abs(x)>128*Number.EPSILON*p.bpRound[j]);
    const bpUncertainty=p.bpRound.map(x=>128*Number.EPSILON*x),bpCrossUncertainty=add(crossRoundoff(p.bp,p.d),crossRoundoff(bpUncertainty,p.d).map(x=>x/(64*Number.EPSILON)));
    regressionWitness ||= cross(p.bp,p.d).some((x,j)=>Math.abs(x)>bpCrossUncertainty[j]);
    const products=cross(p.bp,p.d).map((x,j)=>x*p.dp[j]),tripleRound=dot(bpCrossUncertainty,p.dp.map(Math.abs))+128*Number.EPSILON*products.reduce((a,b)=>a+Math.abs(b),0)+dot(cross(p.bp,p.d).map(Math.abs),p.dpRound);
    developWitness ||= Math.abs(triple)>tripleRound;
    const exactBaseZero=ai.analyticIdentity,exactTangent=ti.analyticIdentity,dpZero=branch==='cylinder'||p.dp.every(x=>x===0);
    for(let j=0;j<w.length;j++){
      const wn=w[j]/k.scale,raw=add(p.rawB,p.rawD,wn),normal=add(p.b,p.d,wn),rawRound=p.rawBRound.map((x,h)=>x+Math.abs(wn*p.rawD[h])),normalRound=p.bRound.map((x,h)=>x+Math.abs(wn*p.d[h])),
        su=add(p.bp,p.dp,wn),round=p.bpRound.map((x,h)=>x+Math.abs(wn*p.dp[h]));
      for(const [name,point,origin,ref] of [['raw',raw,k.rawOrigin,rawRound],['canonical',normal,k.canonicalOrigin,normalRound]] as const){
        const world=add(origin,point,k.scale);if(!checkVector(input[`normalized${name==='raw'?'Raw':'Canonical'}Grid`][i][j],point,ref)||
          !checkVector(input[`${name}Grid`][i][j],world,ref.map((x,h)=>x*k.scale+Math.abs(world[h])*Number.EPSILON+(name==='canonical'?k.canonicalOriginRound[h]/2e-8:0))))fail();}
      metric(row.canonicalEFG[j],su,p.d,[k.scale**2,k.scale,1],round,(dpZero&&(exactBaseZero||exactTangent))||(w[j]===0&&(exactBaseZero||exactTangent)));
    }
    for(let j=0;j<v.length;j++){
      const delta=arc?arcDelta!(s,v[j]):v[j]/k.scale,normal=add(p.b,p.d,delta),normalRound=p.bRound.map((x,h)=>x+Math.abs(delta*p.d[h])),
        world=add(k.canonicalOrigin,normal,k.scale),speedU=arc?k.speed(s):0,speedV=arc?k.speed(v[j]):1,
        su=add(add(p.bp,p.dp,delta),p.d,-speedU),sv=mul(p.d,speedV),round=p.bpRound.map((x,h)=>x+Math.abs(delta*p.dp[h])+Math.abs(speedU*p.d[h]));
      if(!checkVector(input.normalizedCrossGrid[i][j],normal,normalRound)||!checkVector(input.crossGrid[i][j],world,normalRound.map((x,h)=>x*k.scale+Math.abs(world[h])*Number.EPSILON+k.canonicalOriginRound[h]/2e-8)))fail();
      metric(row.crossEFG[j],su,sv,[k.scale**2,arc?k.scale**2:k.scale,arc?k.scale**2:1],round,
        arc?exactTangent&&s===v[j]:dpZero&&exactBaseZero||v[j]===0&&exactBaseZero);
    }
  }
  if(ci.status==='zero'&&directionWitness||ci.status==='nonzero'&&!directionWitness||ai.status==='zero'&&baseWitness||ai.status==='nonzero'&&!baseWitness||
    ti.status==='zero'&&regressionWitness||ti.status==='nonzero'&&!regressionWitness||di.status==='zero'&&developWitness||di.status==='nonzero'&&!developWitness||
    !relative(cert.unitDirectorFiniteMaximumError,maximumUnit,1,2e-14)||!relative(cert.finiteDevelopabilityMaximumRelativeResidual,maximumDevelop,1,2e-10))fail();
  validateDomain(cert.sourceDomain,q,k,arc,ci,ai,ti);
  return input as GenericCanonicalResult;
}

function validateDomain(raw:unknown,q:GenericCanonicalQuery,k:ReturnType<typeof makeEvaluator>,arc:boolean,ci:CanonicalIdentity,ai:CanonicalIdentity,ti:CanonicalIdentity){
  if(!record(raw)||!keys(raw,['certified','roundingModel','evaluations','verifiedCells','cells','unresolved','reason','canonicalRegularity','crossRegularity'])||
    typeof raw.certified!=='boolean'||raw.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||!Number.isInteger(raw.evaluations)||raw.evaluations<1||raw.evaluations>1024||
    !Number.isInteger(raw.verifiedCells)||!Array.isArray(raw.cells)||raw.cells.length!==raw.verifiedCells||raw.cells.length>raw.evaluations||
    !Array.isArray(raw.unresolved)||raw.unresolved.length>1024||!regularity(raw.canonicalRegularity)||!regularity(raw.crossRegularity)||
    raw.certified!==(raw.unresolved.length===0)||raw.reason!==(raw.certified?null:'complete source interval subdivision budget unresolved; original domains retained'))fail();
  const lo=arc?Math.min(q.parameterStart,q.crossParameterStart):q.parameterStart,hi=arc?Math.max(q.parameterEnd,q.crossParameterEnd):q.parameterEnd,
    pieces:Bounds[]=[],areaCells:Record<string,any>[]=[],arcCells:Record<string,any>[]=[];
  for(const cell of raw.cells){
    if(!record(cell)||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||cell.start<lo||cell.end>hi)fail();
    pieces.push([cell.start,cell.end]);const ua=Math.max(cell.start,q.parameterStart),ub=Math.min(cell.end,q.parameterEnd),hasArea=ua<=ub;
    if(!keys(cell,hasArea?['start','end','areaBounds','directorDerivativeBounds','baseSpeedBounds','arcSpeedBounds']:['start','end','arcSpeedBounds']))fail();
    if(arc){if(!intervalBounds(cell.arcSpeedBounds)||!within(cell.arcSpeedBounds,k.speed((cell.start+cell.end)/2)))fail();arcCells.push(cell);}
    else if(cell.arcSpeedBounds!==null)fail();
    if(hasArea){const p=k.point((ua+ub)/2);if(!intervalBounds(cell.areaBounds)||!intervalBounds(cell.directorDerivativeBounds)||!intervalBounds(cell.baseSpeedBounds)||
      !within(cell.directorDerivativeBounds,Math.hypot(...p.dp))||!within(cell.baseSpeedBounds,Math.hypot(...p.bp),Math.hypot(...p.bpRound)))fail();
      for(const w of [q.rulingStart,(q.rulingStart+q.rulingEnd)/2,q.rulingEnd]){
        const su=add(p.bp,p.dp,w/k.scale),area=Math.hypot(...cross(su,p.d)),round=Math.hypot(...p.bpRound)+Math.abs(w/k.scale)*Math.hypot(...p.dp);
        if(!within(cell.areaBounds,area,round))fail();}areaCells.push(cell);
    }
  }
  for(const pair of raw.unresolved){if(!vector(pair,2)||pair[0]>=pair[1]||pair[0]<lo||pair[1]>hi)fail();pieces.push(pair as Bounds);}
  pieces.sort((a,b)=>a[0]-b[0]);let edge=lo;for(const pair of pieces){if(!relative(pair[0],edge,Math.abs(lo)+Math.abs(hi),2e-14))fail();edge=pair[1];}
  if(!pieces.length||!relative(edge,hi,Math.abs(lo)+Math.abs(hi),2e-14))fail();
  const minArea=raw.certified&&areaCells.length?Math.min(...areaCells.map(c=>c.areaBounds[0])):null,
    zeroArea=raw.certified&&areaCells.length>0&&areaCells.every(c=>c.areaBounds[1]<=2*Number.MIN_VALUE),
    zeroDirector=raw.certified&&areaCells.length>0&&areaCells.every(c=>c.directorDerivativeBounds[1]<=2*Number.MIN_VALUE),
    collapsed=ci.analyticIdentity&&(ai.analyticIdentity||ti.analyticIdentity)||zeroArea&&zeroDirector,
    canonicalSingular=collapsed||zeroArea||(ai.analyticIdentity||ti.analyticIdentity)&&q.rulingStart<=0&&q.rulingEnd>=0,
    canonicalStatus=canonicalSingular?'singular':raw.certified&&minArea!==null&&minArea>0?'verified':'unknown';
  if(raw.canonicalRegularity.status!==canonicalStatus||canonicalStatus==='verified'&&!relative(raw.canonicalRegularity.minimumNormalizedJacobianLowerBound,minArea!,minArea!,2e-14))fail();
  let crossStatus='unknown',crossMin:number|null=null;
  if(!arc&&q.rulingStart===q.crossParameterStart&&q.rulingEnd===q.crossParameterEnd){crossStatus=canonicalStatus;crossMin=canonicalStatus==='verified'?minArea:null;}
  if(collapsed)crossStatus='singular';
  if(arc&&ti.analyticIdentity&&Math.max(q.parameterStart,q.crossParameterStart)<=Math.min(q.parameterEnd,q.crossParameterEnd))crossStatus='singular';
  else if(arc&&ti.analyticIdentity&&raw.certified&&arcCells.length&&areaCells.length){
    const gap=Math.max(q.crossParameterStart-q.parameterEnd,q.parameterStart-q.crossParameterEnd),speed=Math.min(...arcCells.map(c=>c.arcSpeedBounds[0])),
      director=Math.min(...areaCells.map(c=>c.directorDerivativeBounds[0]));
    if(gap>0&&speed>0&&director>0){crossStatus='verified';crossMin=gap*speed*speed*director;}}
  if(raw.crossRegularity.status!==crossStatus||crossStatus==='verified'&&!relative(raw.crossRegularity.minimumNormalizedJacobianLowerBound,crossMin!,crossMin!,2e-14))fail();
}

export async function fetchGenericCanonicalWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericCanonicalResult>{
  const query=validateGenericCanonicalQuery(input);
  while(true){signal?.throwIfAborted();try{return parseGenericCanonicalResult(await api('tessellation/curved-canonical-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
