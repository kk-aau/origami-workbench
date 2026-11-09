import {api} from './api';
import {compileUncurlSource,UncurlSourceBudget,UncurlSourceUndefined,uncurlSum} from './curvedUncurlSource';
import {uncurlTripleDivided,uncurlExactDarboux} from './curvedUncurlCompensated';
import {proveUncurlStraightIdentity} from './curvedUncurlStraightIdentity';

export type NativeUncurlQuery={family:'uncurl-generic-native';curve:string[];normal:string[];parameterStart:number;parameterEnd:number;segments:number;initialPoint:number[];initialTangent:number[]};
export const UNCURL_NATIVE_PRESET:NativeUncurlQuery={family:'uncurl-generic-native',curve:['sin(s)','1-cos(s)','0'],normal:['0','0','1'],parameterStart:-.5,parameterEnd:.5,segments:32,initialPoint:[0,0],initialTangent:[1,0]};
export const UNCURL_NATIVE_RULE_ORDER=['Speed3D','Curvature3D','Torsion3D','NormalCurvature3D','GeodesicCurvature3D','FrenetDarbouxAngle','GeodesicTorsion3D','Curve3D','TangentVector3D','NormalVector3D','BinormalVector3D','SurfaceNormalVector3D','TangentNormalVector3D','Curve2D','Speed2D','LeftCurvature2D','Curvature2D','TangentVector2D','LeftNormalVector2D','NormalVector2D'];
type RuleValue=number|number[]|null;
type NullableVector=Array<number|null>;
export type NativeUncurlRow={s:number;rules:Record<string,RuleValue>;sourceJets:{curve:NullableVector[];normal:NullableVector[]};sourceCurve:number[]|null;normalizedSourceCurve:number[]|null;recoveredCurve:number[]|null;normalizedRecoveredCurve:number[]|null;angle2D:number|null;undefined:{key:string;code:string}[];undefinedSourceJets:{system:string;order:number;component:number;code:string}[]};
export type NativeUncurlResult={family:'origamica-generic-uncurl';query:NativeUncurlQuery;source:{functions:string[];definitionCells:string[];ruleOrder:string[];[key:string]:unknown};normalization:{sourceOrigin:number[]|null;sourceScale:number;recoveredOrigin:number[];recoveredScale:number;anchorParameter:0;sourceScaleConvention:string;recoveredScaleConvention:string};domain:{requestedInterval:number[];integrationInterval:number[];anchorParameter:0;recoveryStatus:'ready'|'partial'|'undefined';branches:{direction:number;endParameter:number;status:'ready'|'undefined';code:string|null;message:string|null;evaluations:number;parameter?:number}[];continuousDomainCertified:false};diagnostics:Record<string,any>;limits:Record<string,number>;certification:Record<string,boolean>;sample:{parameters:number[];rows:NativeUncurlRow[]}};
export const UNCURL_NATIVE_LIMITS={maximumSourceCharacters:240,maximumSourceAstNodes:96,maximumDerivedAstNodes:8192,maximumParameterMagnitude:10,minimumDisplayedSpan:.01,maximumDisplayedSpan:12,minimumSegments:8,maximumSegments:128,maximumInitialCoordinateMagnitude:1e12,maximumScalarEvaluations:524288,maximumAstWeightedEvaluations:16000000,maximumOffsetProducts:262144,maximumIntegrationEvaluations:24000};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=(a:number[],s:number)=>a.map(x=>x*s);
const clean=(x:number):number|null=>finite(x)?x:null;
const cleanVector=(v:number[]):number[]|null=>v.every(finite)?v:null;
function fail(message='展开构造的源、旧式规则或二维恢复回读不一致。'):never{throw Error(message);}
export function validateNativeUncurlQuery(raw:unknown):NativeUncurlQuery{
  if(!record(raw)||!keys(raw,Object.keys(UNCURL_NATIVE_PRESET))||raw.family!=='uncurl-generic-native')fail('展开构造须提供六个源、完整区间与原二维初值。');
  for(const key of ['curve','normal']){if(!Array.isArray(raw[key])||raw[key].length!==3)fail('曲线与原法向均须三维。');raw[key].forEach((x:string)=>compileUncurlSource(x));}
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)fail('参数域须在±10内，跨度0.01–12。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128)fail('显示段数须为8–128。');
  for(const key of ['initialPoint','initialTangent'])if(!vector(raw[key],2)||raw[key].some((x:number)=>Math.abs(x)>1e12))fail('初值须为±10¹²内有限二维向量。');
  return Object.fromEntries(Object.keys(UNCURL_NATIVE_PRESET).map(k=>[k,Array.isArray(raw[k])?raw[k].slice():raw[k]])) as NativeUncurlQuery;
}

/** Literal In[3802] rules, not the modern seven-rule Darboux system. */
export function replayUncurlOldDarboux(jets:{curve:NullableVector[];normal:NullableVector[]},straightIdentity=false){
  const [C,cp,cpp,cppp]=jets.curve.map(v=>v.every(finite)?v as number[]:null),[U,Up]=jets.normal.map(v=>v.every(finite)?v as number[]:null);
  const rules:Record<string,RuleValue>=Object.fromEntries(UNCURL_NATIVE_RULE_ORDER.slice(0,13).map(k=>[k,null]));rules.Curve3D=C;rules.SurfaceNormalVector3D=U;
  if(!cp)return rules;const v=Math.hypot(...cp);rules.Speed3D=clean(v);if(!v||!finite(v))return rules;
  const T=cp.map(x=>x/v);rules.TangentVector3D=T;const L=U?cross(U,T):null;rules.TangentNormalVector3D=L?cleanVector(L):null;
  if(!cpp)return rules;
  // Exact binary products precede division. Rounding a raw frame must not
  // turn zero curvature into an arbitrary normal or change Sign[kg].
  const exact=uncurlExactDarboux(cp,cpp,cppp,U,Up,v);
  // A source identity is independent of rounded jets. Keep all original
  // value/derivative domain gates and the old raw-normal kn rule.
  if(straightIdentity&&C){exact.curvature=0;exact.B=null;exact.tau=null;exact.tg=null;exact.kg=U?0:null;}
  rules.Curvature3D=clean(exact.curvature);
  if(exact.B){rules.BinormalVector3D=exact.B;rules.NormalVector3D=cross(exact.B,T);}
  const kn=exact.kn===null?null:clean(exact.kn),kg=exact.kg===null?null:clean(exact.kg);
  rules.NormalCurvature3D=kn;rules.GeodesicCurvature3D=kg;
  if(kn!==null&&kg!==null&&(kn!==0||kg!==0))rules.FrenetDarbouxAngle=Math.atan2(kn,kg);
  rules.Torsion3D=exact.tau===null?null:clean(exact.tau);
  rules.GeodesicTorsion3D=exact.tg===null?null:clean(exact.tg);
  return rules;
}

export function makeNativeUncurlReference(input:unknown){
  const query=validateNativeUncurlQuery(input),budget=new UncurlSourceBudget(),sources={curve:query.curve.map(compileUncurlSource),normal:query.normal.map(compileUncurlSource)};
  const straightIdentity=proveUncurlStraightIdentity(query.curve)===true;
  const scalar=(key:'curve'|'normal',component:number,s:number,order:number)=>{try{return sources[key][component].jet(s,order,budget);}catch(e){if(e instanceof UncurlSourceUndefined)return null;throw e;}};
  const jets=(s:number)=>({curve:Array.from({length:4},(_,k)=>[0,1,2].map(i=>scalar('curve',i,s,k))),normal:Array.from({length:2},(_,k)=>[0,1,2].map(i=>scalar('normal',i,s,k)))});
  const recoveryCoefficient=(s:number)=>{
    const C=[0,1,2].map(i=>scalar('curve',i,s,0)),cp=[0,1,2].map(i=>scalar('curve',i,s,1)),cpp=[0,1,2].map(i=>scalar('curve',i,s,2)),U=[0,1,2].map(i=>scalar('normal',i,s,0));
    if(!cp.every(finite)||!cpp.every(finite)||!U.every(finite))throw new UncurlSourceUndefined();
    const v=Math.hypot(...cp);if(!v||!finite(v))throw new UncurlSourceUndefined();const kg=straightIdentity&&C.every(finite)?0:uncurlTripleDivided(U,cp,cpp,v,3),angleSpeed=v*kg;
    if(!finite(kg))throw new UncurlSourceUndefined();
    if(!finite(angleSpeed))throw new UncurlSourceUndefined();return {speed:v,angleSpeed};
  };
  const originParts=sources.curve.map(f=>{try{return f.parts(0,0,budget);}catch(e){if(e instanceof UncurlSourceUndefined)return null;throw e;}}),origin=originParts.every(p=>p!==null)?originParts.map(p=>uncurlSum([...p!.offsets,p!.dynamic.c[0]])):null;
  const relative=(s:number)=>origin===null?null:sources.curve.map((f,i)=>{try{const p=f.parts(s,0,budget),o=originParts[i]!;return uncurlSum([...p.offsets,...o.offsets.map(x=>-x),p.dynamic.c[0],-o.dynamic.c[0]]);}catch(e){if(e instanceof UncurlSourceUndefined)return null;throw e;}});
  const nodes=Array.from({length:query.segments+1},(_,i)=>i===query.segments?query.parameterEnd:query.parameterStart+(query.parameterEnd-query.parameterStart)*i/query.segments);
  const rows=nodes.map(s=>{const sourceJets=jets(s);return {s,sourceJets,rules:replayUncurlOldDarboux(sourceJets,straightIdentity)};});
  const speeds=rows.flatMap(r=>finite(r.rules.Speed3D)?[r.rules.Speed3D]:[]),span=query.parameterEnd-query.parameterStart,recoverySpan=Math.max(0,query.parameterEnd)-Math.min(0,query.parameterStart),
    sourceScale=Math.max(0,...nodes.flatMap(s=>{const r=relative(s);return r?.every(finite)?[Math.hypot(...r)]:[];}),...speeds.map(v=>v*span))||1,recoveredScale=Math.max(0,...speeds)*recoverySpan||1;
  /** Independent Dormand–Prince 5(4), backend uses DOP853. States contain a
   * normalized displacement and the angle; initial tangent length is ignored. */
  const recover=(targets:number[])=>{
    const states=new Map<number,number[]>(),angle=Math.atan2(query.initialTangent[1],query.initialTangent[0]);
    if(query.initialTangent.every(x=>x===0))return states;
    states.set(0,[0,0,angle]);const c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
    let steps=0;const derivative=(s:number,y:number[])=>{const r=recoveryCoefficient(s);return [r.speed/recoveredScale*Math.cos(y[2]),r.speed/recoveredScale*Math.sin(y[2]),r.angleSpeed];};
    for(const sign of [-1,1]){let s=0,y=[0,0,angle],h=sign*recoverySpan/32;
      for(const end of [...new Set(targets)].filter(x=>sign*x>0).sort((a,b)=>sign*(a-b))){
        try{while(sign*(end-s)>0){if(++steps>16384)fail('展开恢复独立积分超过预算。');if(sign*(s+h-end)>0)h=end-s;if(s+h===s)throw new UncurlSourceUndefined();
          const stages:number[][]=[];for(let k=0;k<7;k++)stages.push(derivative(k===6?s+h:s+c[k]*h,y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0))));
          const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-13+2e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
          if(!finite(error)||high.some(x=>!finite(x)))throw new UncurlSourceUndefined();if(error<=1){s=sign*(s+h-end)>=0?end:s+h;y=high;}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
        }states.set(end,y.slice());}catch(e){if(e instanceof UncurlSourceUndefined)break;throw e;}
      }
    }
    return states;
  };
  return {query,budget,nodes,rows,relative,recover,recoveryCoefficient,normalization:{sourceOrigin:origin,sourceScale,recoveredOrigin:query.initialPoint,recoveredScale,anchorParameter:0 as const}};
}

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a:unknown,b:number,natural=Math.abs(b),tolerance=4e-8)=>finite(a)&&finite(natural)&&Math.abs(a-b)<=tolerance*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE;
const nearVector=(a:unknown,b:number[],natural=Math.max(0,...b.map(Math.abs)),tolerance=4e-8)=>vector(a,b.length)&&b.every((v,i)=>near(a[i],v,natural,tolerance));
const nearValue=(a:unknown,b:RuleValue,natural?:number):boolean=>b===null?a===null:typeof b==='number'?near(a,b,natural):nearVector(a,b,natural);
export function parseNativeUncurlResult(raw:unknown,requested?:unknown):NativeUncurlResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','sample','domain','limits','diagnostics','certification'])||raw.family!=='origamica-generic-uncurl')fail();
  const q=validateNativeUncurlQuery(raw.query);if(requested&&!equal(q,validateNativeUncurlQuery(requested)))fail();
  const source={functions:['UncurlCurveInDevelopableSystem','Darboux3DSystemOld','RecoverCurve2DSystemOld'],definitionCells:['In[3841]','In[3802]','In[3645]'],ruleOrder:UNCURL_NATIVE_RULE_ORDER,wolframNumericOutAvailable:false,simplification:'None',assumptions:[],sourceJetsConvention:'physical-derivatives',expressionDerivativeConvention:'safe-ast-chain-rule-constant-only-folding'};
  if(!record(raw.source)||!keys(raw.source,Object.keys(source))||Object.entries(source).some(([k,v])=>!equal(raw.source[k],v))||!record(raw.limits)||!keys(raw.limits,Object.keys(UNCURL_NATIVE_LIMITS))||Object.entries(UNCURL_NATIVE_LIMITS).some(([k,v])=>raw.limits[k]!==v))fail();
  const reference=makeNativeUncurlReference(q),norm=reference.normalization,normalization=raw.normalization;
  if(!record(normalization)||!keys(normalization,['sourceOrigin','sourceScale','recoveredOrigin','recoveredScale','anchorParameter','sourceScaleConvention','recoveredScaleConvention'])||!nearValue(normalization.sourceOrigin,norm.sourceOrigin)||!near(normalization.sourceScale,norm.sourceScale,norm.sourceScale,1e-11)||!equal(normalization.recoveredOrigin,q.initialPoint)||!near(normalization.recoveredScale,norm.recoveredScale,norm.recoveredScale,1e-11)||normalization.anchorParameter!==0||normalization.sourceScaleConvention!=='max-sampled-relative-radius-or-displayed-speed-span-or-one'||normalization.recoveredScaleConvention!=='sampled-maximum-speed-times-full-integration-span-or-one')fail();
  const domain=raw.domain,ends=[Math.min(0,q.parameterStart),Math.max(0,q.parameterEnd)],angle0=q.initialTangent.some(x=>x!==0)?Math.atan2(q.initialTangent[1],q.initialTangent[0]):null;
  if(!record(domain)||!keys(domain,['requestedInterval','integrationInterval','anchorParameter','recoveryStatus','branches','continuousDomainCertified'])||!equal(domain.requestedInterval,[q.parameterStart,q.parameterEnd])||!equal(domain.integrationInterval,ends)||domain.anchorParameter!==0||domain.continuousDomainCertified!==false||!Array.isArray(domain.branches)||domain.branches.length!==ends.filter(x=>x!==0).length)fail();
  const states=reference.recover([...reference.nodes,...ends]),ready=new Set<number>();let branchEvaluations=0;
  let bIndex=0;
  for(const [i,end] of ends.entries())if(end!==0){const branch=domain.branches[bIndex++],direction=i===0?-1:1;
    if(!record(branch)||!keys(branch,['direction','endParameter','status','code','message','evaluations',...('parameter' in branch?['parameter']:[])])||branch.direction!==direction||branch.endParameter!==end||!Number.isInteger(branch.evaluations)||branch.evaluations<0||branch.evaluations>24000)fail();branchEvaluations+=branch.evaluations;
    if(branch.status==='ready'){if(branch.code!==null||branch.message!==null||!states.has(end)||angle0===null||branch.evaluations===0||'parameter' in branch)fail();ready.add(direction);}
    else if(branch.status==='undefined'){
      if(typeof branch.message!=='string'||!branch.message)fail();
      if(angle0===null){if(branch.code!=='initial-angle-undefined'||branch.evaluations!==0)fail();}
      else if(branch.code==='recovery-source-undefined'){
        if(!finite(branch.parameter)||branch.parameter<Math.min(0,end)||branch.parameter>Math.max(0,end)||branch.evaluations===0)fail();
        let singular=false;try{reference.recoveryCoefficient(branch.parameter);}catch(e){if(e instanceof UncurlSourceUndefined)singular=true;else throw e;}if(!singular)fail();
      }else if(!['integration-failed','integration-nonfinite'].includes(branch.code)||states.has(end))fail();
    }else fail();
  }
  const status=ready.size===domain.branches.length&&angle0!==null?'ready':ready.size?'partial':'undefined';if(domain.recoveryStatus!==status)fail();
  if(!record(raw.sample)||!keys(raw.sample,['parameters','rows'])||!nearVector(raw.sample.parameters,reference.nodes,Math.max(Math.abs(q.parameterStart),Math.abs(q.parameterEnd)),1e-13)||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==reference.nodes.length)fail();
  let undefinedRuleCount=0,undefinedJetCount=0;
  reference.rows.forEach((expected,i)=>{
    const row=raw.sample.rows[i],s=expected.s;
    if(!record(row)||!keys(row,['s','rules','sourceJets','sourceCurve','normalizedSourceCurve','recoveredCurve','normalizedRecoveredCurve','angle2D','undefined','undefinedSourceJets'])||row.s!==s||!record(row.sourceJets)||!keys(row.sourceJets,['curve','normal'])||!record(row.rules)||!equal(Object.keys(row.rules),UNCURL_NATIVE_RULE_ORDER))fail();
    const undefinedJets:NativeUncurlRow['undefinedSourceJets']=[];
    for(const system of ['curve','normal'] as const){const values=expected.sourceJets[system];if(!Array.isArray(row.sourceJets[system])||row.sourceJets[system].length!==values.length)fail();
      values.forEach((v,order)=>{const actual=row.sourceJets[system][order],natural=Math.max(0,...v.filter(finite).map(Math.abs));if(!Array.isArray(actual)||actual.length!==3)fail();v.forEach((x,component)=>{if(x===null){if(actual[component]!==null)fail();undefinedJets.push({system,order,component,code:'source-jet-undefined'});}else if(!near(actual[component],x,natural,2e-9))fail();});});
    }
    if(!equal(row.undefinedSourceJets,undefinedJets))fail();undefinedJetCount+=undefinedJets.length;
    const rules={...expected.rules},v=rules.Speed3D as number|null,kg=rules.GeodesicCurvature3D as number|null,
      state=s===0?states.get(0):ready.has(s<0?-1:1)?states.get(s):undefined,
      angle=state?state[2]:null,recovered=state?state.slice(0,2).map((x,j)=>uncurlSum([q.initialPoint[j],x*norm.recoveredScale])):null,
      T=angle===null?null:[Math.cos(angle),Math.sin(angle)],L=T?[-T[1],T[0]]:null;
    Object.assign(rules,{Curve2D:recovered,Speed2D:v,LeftCurvature2D:kg,Curvature2D:kg===null?null:Math.abs(kg),TangentVector2D:T,LeftNormalVector2D:L,NormalVector2D:L&&kg!==null?mul(L,Math.sign(kg)):null});
    const curvatureMagnitude=Math.max(0,...['Curvature3D','NormalCurvature3D','GeodesicCurvature3D'].map(k=>rules[k]).filter(finite).map(Math.abs));
    for(const key of UNCURL_NATIVE_RULE_ORDER){const natural=key==='FrenetDarbouxAngle'?Math.PI:key==='GeodesicTorsion3D'?Math.max(Math.abs(rules.GeodesicTorsion3D as number??0),curvatureMagnitude):undefined;
      if(!nearValue(row.rules[key],rules[key],natural))fail(`旧式规则 ${key} 在 s=${s} 的独立回读不一致。`);}
    const relative=reference.relative(s),normalized=relative?.every(finite)?relative.map(x=>x/norm.sourceScale):null;
    if(!nearValue(row.sourceCurve,rules.Curve3D)||!nearValue(row.normalizedSourceCurve,normalized)||!nearValue(row.recoveredCurve,recovered)||!nearValue(row.normalizedRecoveredCurve,state?state.slice(0,2):null,1)||!nearValue(row.angle2D,angle,Math.max(1,Math.abs(angle??0))))fail();
    const undefinedRules=UNCURL_NATIVE_RULE_ORDER.filter(key=>rules[key]===null).map(key=>({key,code:['Curve2D','TangentVector2D','LeftNormalVector2D','NormalVector2D'].includes(key)?'recovery-undefined':'source-rule-undefined'}));
    if(!equal(row.undefined,undefinedRules))fail();undefinedRuleCount+=undefinedRules.length;
  });
  const d=raw.diagnostics,diagnosticKeys=['initialTangentAngle','initialTangentMagnitude','initialTangentMagnitudePreserved','sourceNormalNormalized','sourceNormalOrthogonalized','undefinedRuleCount','undefinedSourceJetCount','budget','integrationMethod','relativeTolerance','absoluteTolerance'];
  if(!record(d)||!keys(d,diagnosticKeys)||!nearValue(d.initialTangentAngle,angle0,Math.PI)||!near(d.initialTangentMagnitude,Math.hypot(...q.initialTangent))||d.initialTangentMagnitudePreserved!==false||d.sourceNormalNormalized!==false||d.sourceNormalOrthogonalized!==false||d.undefinedRuleCount!==undefinedRuleCount||d.undefinedSourceJetCount!==undefinedJetCount||d.integrationMethod!=='DOP853'||d.relativeTolerance!==2e-12||d.absoluteTolerance!==2e-14||!record(d.budget)||!keys(d.budget,['scalarEvaluations','astWeightedEvaluations','offsetProducts','integrationEvaluations']))fail();
  for(const [key,max] of Object.entries({scalarEvaluations:524288,astWeightedEvaluations:16000000,offsetProducts:262144,integrationEvaluations:24000}))if(!Number.isInteger(d.budget[key])||d.budget[key]<0||d.budget[key]>max)fail();if(d.budget.integrationEvaluations!==branchEvaluations||d.budget.astWeightedEvaluations<d.budget.scalarEvaluations)fail();
  const truths=['sourceFormulaEvaluated','originalRuleOrderPreserved','recoveryFixedAtParameterZero','rawSurfaceNormalPreserved','initialTangentDirectionOnly'],falses=['continuousDomainCertified','integrationErrorIntervalCertified','symbolicObjectsReproduced','wolframOptionsReproduced','exactStraightCreaseFOLD','adoptableCreasePattern','globalFoldingCertified'],samples={allSampledSourceValuesFinite:raw.sample.rows.every((r:NativeUncurlRow)=>r.sourceCurve!==null&&r.rules.SurfaceNormalVector3D!==null),allSampledRulesFinite:undefinedRuleCount===0,allSampledRecoveredPointsFinite:raw.sample.rows.every((r:NativeUncurlRow)=>r.recoveredCurve!==null)};
  if(!record(raw.certification)||!keys(raw.certification,[...Object.keys(samples),...truths,...falses])||truths.some(k=>raw.certification[k]!==true)||falses.some(k=>raw.certification[k]!==false)||Object.entries(samples).some(([k,v])=>raw.certification[k]!==v))fail();
  return raw as NativeUncurlResult;
}

export async function fetchNativeUncurlWhenIdle(input:unknown,signal?:AbortSignal):Promise<NativeUncurlResult>{
  const query=validateNativeUncurlQuery(input);for(let attempt=0;attempt<240;attempt++){
    signal?.throwIfAborted();try{return parseNativeUncurlResult(await api('tessellation/curved-uncurl-generic',query,signal),query);}
    catch(e){if(signal?.aborted||!(e instanceof Error)||!/busy|繁忙|429|正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试/.test(e.message)||attempt===239)throw e;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});
    }
  }throw Error('展开构造等待计算器超时。');
}
