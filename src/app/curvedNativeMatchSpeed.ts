import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type NativeMatchSpeedQuery={family:'match-curve-speed-native';sourceCurve:string[];targetCurve:string[];
  initialParameter:number;parameterStart:number;parameterEnd:number;segments:number};
export const MATCH_SPEED_NATIVE_PRESET:NativeMatchSpeedQuery={family:'match-curve-speed-native',sourceCurve:['s','s**2/4'],
  targetCurve:['2*s','0'],initialParameter:0,parameterStart:-.5,parameterEnd:1,segments:32};
type Row={s:number;mappedParameter:number;mappedParameterDerivative:number;sourcePoint:number[];sourceDerivative:number[];
  originalTargetPoint:number[]|null;matchedTargetPoint:number[];matchedTargetDerivative:number[];sourceSpeed:number;
  targetSpeedAtMappedParameter:number;matchedTargetSpeed:number;normalizedSourcePoint:number[];
  normalizedOriginalTargetPoint:number[]|null;normalizedMatchedTargetPoint:number[]};
export type NativeMatchSpeedResult={family:'origamica-native-match-curve-speed';query:NativeMatchSpeedQuery;
  source:{functions:string[];definitionCells:string[];equation:string;returnedFunction:string;speedEquationRepaired:false;
    interpolationReproduced:false;symbolicOptionsReproduced:false};initial:{parameter:number;mappedParameter:number};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};
  diagnostics:{validationNodes:129;integrationEvaluations:number;maximumRelativeSquaredTransportResidual:number;maximumRelativeActualSpeedDifference:number};
  certification:{originalSquaredSpeedEquationEvaluated:true;finiteSquaredTransportVerified:boolean;finiteActualSpeedMatchVerified:boolean;
    integrationErrorIntervalCertified:false;sourceWholeDomainCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;
    adoptableCreasePattern:false;exactStraightCreaseFOLD:false};sample:{rows:Row[]}};
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
  finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
  vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite),
  keys=(x:Record<string,unknown>,k:string[])=>Object.keys(x).length===k.length&&k.every(v=>Object.hasOwn(x,v));
const near=(x:unknown,y:number,natural=Math.abs(y),tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE,
  nearV=(x:unknown,y:number[],natural=Math.hypot(...y),tol=2e-8)=>vector(x,y.length)&&y.every((v,i)=>near(x[i],v,natural,tol));
function fail():never{throw Error('原平方速度匹配的完整源、重参数ODE、返回曲线或数值证据不一致。');}
const sumExact=(numbers:number[])=>{const partials:number[]=[];for(let x of numbers){let i=0;
  for(let y of partials){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}
  partials.length=i;partials.push(x);}return partials.reduceRight((s,x)=>s+x,0);};
export function validateNativeMatchSpeedQuery(raw:unknown):NativeMatchSpeedQuery{
  if(!record(raw)||!keys(raw,Object.keys(MATCH_SPEED_NATIVE_PRESET))||raw.family!=='match-curve-speed-native')
    throw Error('须提供两条完整向量曲线、原ui和s域。');
  for(const key of ['sourceCurve','targetCurve']){
    if(!Array.isArray(raw[key])||raw[key].length<1||raw[key].length>8)throw Error('两曲线各须1–8维，维数可以不同。');
    for(const expression of raw[key])compileGenericExpression(expression,'s');}
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||!finite(raw.initialParameter)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd)
    throw Error('s域须在−10…10，跨度0.01–12，ui须在域内。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128)throw Error('显示段数须为8–128。');
  return {...raw,sourceCurve:[...raw.sourceCurve],targetCurve:[...raw.targetCurve]} as NativeMatchSpeedQuery;
}

/** Independent DP54 integration of the literal square-speed equation in both directions. */
export function makeNativeMatchSpeedReference(input:unknown,nodes:number[]){
  const q=validateNativeMatchSpeedQuery(input),source=q.sourceCurve.map(s=>compileGenericExpression(s,'s')),
    target=q.targetCurve.map(s=>compileGenericExpression(s,'s')),ui=q.initialParameter,
    evaluate=(fs:typeof source,s:number)=>{if(!finite(s)||Math.abs(s)>1e6)fail();const jets=fs.map(f=>f(new GenericTaylor([s,1])));
      if(jets.some(j=>j.c.some(x=>!finite(x))))fail();return jets;},
    rhs=(s:number,f:number)=>{const a=Math.hypot(...evaluate(source,s).map(j=>j.c[1])),b=Math.hypot(...evaluate(target,f).map(j=>j.c[1]));
      if(b===0)fail();const value=(a/b)**2;if(!finite(value))fail();return value;},
    values=new Map<number,number>([[ui,ui]]),c=[0,1/5,3/10,4/5,8/9,1,1],
    a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],
      [9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],
    low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  if(nodes.some(s=>!finite(s)||s<q.parameterStart||s>q.parameterEnd))fail();rhs(ui,ui);let budget=0;
  for(const direction of [-1,1]){let s=ui,y=ui,h=direction*(q.parameterEnd-q.parameterStart)/64;
    const ends=[...new Set(nodes)].filter(v=>direction*(v-ui)>0).sort((x,y)=>direction*(x-y));
    for(const end of ends){while(direction*(end-s)>0){if(++budget>24000)throw Error('原平方速度独立积分超出数值预算。');
        if(direction*(s+h-end)>0)h=end-s;if(s+h===s)fail();const stages:number[]=[];
        for(let k=0;k<7;k++)stages.push(rhs(k===6?s+h:s+c[k]*h,y+h*a[k].reduce((v,w,j)=>v+w*stages[j],0)));
        const high=y+h*a[6].reduce((v,w,j)=>v+w*stages[j],0),small=y+h*low.reduce((v,w,j)=>v+w*stages[j],0),
          error=Math.abs(high-small)/(2e-13+3e-12*Math.max(Math.abs(high),Math.abs(y)));
        if(!finite(error)||!finite(high))fail();if(error<=1){s=direction*(s+h-end)>=0?end:s+h;y=high;}
        h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));}
      values.set(end,y);}}
  const sourceInitial=source.map(f=>f.parts(new GenericTaylor([ui,1]))),targetInitial=target.map(f=>f.parts(new GenericTaylor([ui,1]))),
    origin=(parts:typeof sourceInitial)=>parts.map(p=>sumExact(p.offsets)+p.dynamic.c[0]),
    sample=(s:number)=>{const mapped=values.get(s);if(mapped===undefined)fail();const a=evaluate(source,s),b=evaluate(target,mapped),fp=rhs(s,mapped);
      let original:GenericTaylor[]|null;try{original=evaluate(target,s);}catch{original=null;}
      const speed=Math.hypot(...a.map(j=>j.c[1])),targetSpeed=Math.hypot(...b.map(j=>j.c[1]));
      return {s,mappedParameter:mapped,mappedParameterDerivative:fp,sourcePoint:a.map(j=>j.c[0]),sourceDerivative:a.map(j=>j.c[1]),
        originalTargetPoint:original?.map(j=>j.c[0])??null,matchedTargetPoint:b.map(j=>j.c[0]),matchedTargetDerivative:b.map(j=>j.c[1]*fp),
        sourceSpeed:speed,targetSpeedAtMappedParameter:targetSpeed,matchedTargetSpeed:targetSpeed*fp};},
    normalized=(fs:typeof source,initial:typeof sourceInitial,s:number,scale:number)=>fs.map((f,i)=>{const p=f.parts(new GenericTaylor([s,1])),p0=initial[i];
      return (sumExact([...p.offsets,...p0.offsets.map(x=>-x)])+p.dynamic.c[0]-p0.dynamic.c[0])/scale;});
  return {query:q,sample,sourceOrigin:origin(sourceInitial),targetOrigin:origin(targetInitial),
    normalizedSource:(s:number,scale:number)=>normalized(source,sourceInitial,s,scale),
    normalizedTarget:(s:number,scale:number)=>normalized(target,targetInitial,s,scale)};
}

export function parseNativeMatchSpeedResult(raw:unknown,requested?:unknown):NativeMatchSpeedResult{
  if(!record(raw)||raw.family!=='origamica-native-match-curve-speed'||!record(raw.source)||!record(raw.sample)||!record(raw.certification)||
    !record(raw.normalization)||!record(raw.diagnostics)||!record(raw.initial))fail();
  const q=validateNativeMatchSpeedQuery(raw.query);if(requested&&JSON.stringify(q)!==JSON.stringify(validateNativeMatchSpeedQuery(requested)))fail();
  const s=raw.source;if(JSON.stringify(s.functions)!==JSON.stringify(['MatchCurveSpeed','NMatchCurveSpeed'])||
    JSON.stringify(s.definitionCells)!==JSON.stringify(['In[3729]','In[3734]'])||s.equation!=='fPrime*dot(c2Prime(f),c2Prime(f))=dot(c1Prime,c1Prime)'||
    s.returnedFunction!=='c2(f(s))'||s.speedEquationRepaired!==false||s.interpolationReproduced!==false||s.symbolicOptionsReproduced!==false)fail();
  if(raw.initial.parameter!==q.initialParameter||raw.initial.mappedParameter!==q.initialParameter||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==q.segments+1)fail();
  const span=q.parameterEnd-q.parameterStart,display=Array.from({length:q.segments+1},(_,i)=>i===q.segments?q.parameterEnd:q.parameterStart+span*i/q.segments),
    audits=[...new Set([...display,...Array.from({length:129},(_,i)=>i===128?q.parameterEnd:q.parameterStart+span*i/128),q.initialParameter])],
    reference=makeNativeMatchSpeedReference(q,audits),auditRows=audits.map(reference.sample),
    scale=Math.max(...auditRows.flatMap(r=>[r.sourceSpeed*span,r.matchedTargetSpeed*span]))||1,
    fNatural=Math.max(Math.abs(q.initialParameter),span,...auditRows.map(r=>Math.abs(r.mappedParameter)));
  if(!near(raw.normalization.scale,scale,scale)||!nearV(raw.normalization.sourceOrigin,reference.sourceOrigin)||!nearV(raw.normalization.targetOrigin,reference.targetOrigin))fail();
  for(let i=0;i<display.length;i++){const r=raw.sample.rows[i],e=reference.sample(display[i]);if(!record(r)||!near(r.s,e.s,span,1e-12))fail();
    for(const name of ['mappedParameter','mappedParameterDerivative','sourceSpeed','targetSpeedAtMappedParameter','matchedTargetSpeed'] as const)
      if(!near(r[name],e[name],name==='mappedParameter'?fNatural:Math.abs(e[name])))fail();
    for(const name of ['sourcePoint','sourceDerivative','matchedTargetPoint','matchedTargetDerivative'] as const)
      if(!nearV(r[name],e[name]))fail();
    if(e.originalTargetPoint===null){if(r.originalTargetPoint!==null||r.normalizedOriginalTargetPoint!==null)fail();}
    else if(!nearV(r.originalTargetPoint,e.originalTargetPoint)||!nearV(r.normalizedOriginalTargetPoint,reference.normalizedTarget(e.s,scale)))fail();
    if(!nearV(r.normalizedSourcePoint,reference.normalizedSource(e.s,scale))||
      !nearV(r.normalizedMatchedTargetPoint,reference.normalizedTarget(e.mappedParameter,scale)))fail();}
  const speedDifference=Math.max(...auditRows.map(r=>Math.abs(r.matchedTargetSpeed-r.sourceSpeed)/Math.max(r.sourceSpeed,r.matchedTargetSpeed,1e-300))),
    d=raw.diagnostics,cert=raw.certification;
  if(d.validationNodes!==129||!Number.isInteger(d.integrationEvaluations)||d.integrationEvaluations<1||d.integrationEvaluations>24000||
    !finite(d.maximumRelativeSquaredTransportResidual)||d.maximumRelativeSquaredTransportResidual<0||d.maximumRelativeSquaredTransportResidual>2e-8||
    !near(d.maximumRelativeActualSpeedDifference,speedDifference,speedDifference))fail();
  if(cert.originalSquaredSpeedEquationEvaluated!==true||cert.finiteSquaredTransportVerified!==true||cert.finiteActualSpeedMatchVerified!==(speedDifference<=2e-8))fail();
  for(const key of ['integrationErrorIntervalCertified','sourceWholeDomainCertified','globalInjectivityChecked','selfCollisionChecked','adoptableCreasePattern','exactStraightCreaseFOLD'])
    if(cert[key]!==false)fail();return raw as NativeMatchSpeedResult;
}
export async function fetchNativeMatchSpeedWhenIdle(input:unknown,signal?:AbortSignal):Promise<NativeMatchSpeedResult>{
  const q=validateNativeMatchSpeedQuery(input);while(true){signal?.throwIfAborted();try{return parseNativeMatchSpeedResult(await api('tessellation/curved-match-speed-generic',q,signal),q);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
