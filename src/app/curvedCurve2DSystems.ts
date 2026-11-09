import {api} from './api';
import {compileGenericExpression,GenericTaylor,type GenericNativeCurve} from './curvedGenericLinked';

export const CURVE2D_SYSTEM_RULES=['Speed2D','LeftCurvature2D','TangentVector2D','LeftNormalVector2D'] as const;
export type Curve2DSystemDescription={family:'origamica-curve2d-system-description';
  source:{function:'Curve2DSystem';definitionCell:'In[3627]';subset:'linked-required-rules/safe-expression'};
  curve:GenericNativeCurve;parameterDomain:[number,number];rules:{key:typeof CURVE2D_SYSTEM_RULES[number];expressions:string[]}[]};
export type IndependentCurve2DSystemDescription={family:'origamica-independent-curve2d-system';
  source:{function:'Curve2DSystems';definitionCell:'In[4076]';kind:'caller-supplied-safe-rules/no-source-identity'};
  parameterDomain:[number,number];rules:Curve2DSystemDescription['rules']};
export type Curve2DSystemsMode='verified-same-source'|'independent-external';
export type Curve2DSystemsOption='Automatic'|(Curve2DSystemDescription|IndependentCurve2DSystemDescription)[];
export type Curve2DSystemsResult={family:'origamica-curve2d-systems';systems:Curve2DSystemDescription[];
  proof:{method:'bounded-symbolic-formula-identity/native-domain-interval';sourceIdentitiesVerified:true;numericalInterpolationReproduced:false}};
export type Curve2DSystemsStamp={option:'Curve2DSystems';definitionCell:'In[4076]';systems:Curve2DSystemsOption;
  replacementIndices:number[];next2DConsumedIndices:number[];next2DThirdSystemUsed:false;usageScope:string;
  identityProof:string;originalArbitrarySystemContractReproduced:false;numericalInterpolationReproduced:false;evaluations:number[];
  mode?:'independent-external';rulesUnnormalized?:true;originalSameSourceRequired?:false};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,list:string[])=>Object.keys(x).length===list.length&&list.every(k=>Object.hasOwn(x,k));
const curveKeys=['x','y','parameterMin','parameterMax'];
function fail():never{throw Error('外部Curve2DSystems的来源、原生域、有序规则或标架回读不一致。');}

/** Independent finite jets check. The whole-domain identity proof belongs to
 * the backend bounded symbolic check, never to these numeric audit samples. */
export function validateCurve2DSystem(raw:unknown,curve:GenericNativeCurve):Curve2DSystemDescription{
  if(!record(raw)||!keys(raw,['family','source','curve','parameterDomain','rules'])||raw.family!=='origamica-curve2d-system-description'||
    !record(raw.source)||!keys(raw.source,['function','definitionCell','subset'])||raw.source.function!=='Curve2DSystem'||
    raw.source.definitionCell!=='In[3627]'||raw.source.subset!=='linked-required-rules/safe-expression'||
    !record(raw.curve)||!keys(raw.curve,curveKeys)||curveKeys.some(k=>raw.curve[k]!==curve[k as keyof GenericNativeCurve])||
    !Array.isArray(raw.parameterDomain)||raw.parameterDomain.length!==2||raw.parameterDomain[0]!==curve.parameterMin||raw.parameterDomain[1]!==curve.parameterMax||
    !Array.isArray(raw.rules)||raw.rules.length!==4)fail();
  const compiled=raw.rules.map((row:unknown,i:number)=>{
    if(!record(row)||!keys(row,['key','expressions'])||row.key!==CURVE2D_SYSTEM_RULES[i]||!Array.isArray(row.expressions)||row.expressions.length!==(i<2?1:2))fail();
    return row.expressions.map((source:string)=>compileGenericExpression(source,'u'));
  }),native=[compileGenericExpression(curve.x,'u'),compileGenericExpression(curve.y,'u')];
  for(let i=0;i<=32;i++){
    const u=curve.parameterMin+(curve.parameterMax-curve.parameterMin)*i/32,
      arg=new GenericTaylor([u,1,0,0,0,0,0]),p=native.map(f=>f(arg)),d=p.map(x=>x.derivative()),dd=d.map(x=>x.derivative()),
      speed=d[0].mul(d[0]).add(d[1].mul(d[1])).sqrt(),t=d.map(x=>x.div(speed)),
      curvature=d[0].mul(dd[1]).sub(d[1].mul(dd[0])).div(speed.pow(3)),expected=[[speed],[curvature],t,[t[1].neg(),t[0]]];
    const targetArg=new GenericTaylor([u,1,0,0]);
    compiled.forEach((group:any[],j:number)=>group.forEach((f:any,k:number)=>{
      const actual=f(targetArg).c,reference=expected[j][k].c.slice(0,4);
      actual.forEach((v:number,n:number)=>{if(Math.abs(v-reference[n])>2e-8*Math.max(Math.abs(reference[n]),j===0?Math.abs(speed.c[0]):1))fail();});
    }));
  }
  return {family:raw.family,source:{...raw.source},curve:{...raw.curve},parameterDomain:raw.parameterDomain.slice(),
    rules:raw.rules.map((row:any)=>({key:row.key,expressions:row.expressions.slice()}))} as Curve2DSystemDescription;
}

export function validateCurve2DSystems(raw:unknown,curves:GenericNativeCurve[]):Curve2DSystemsOption{
  if(raw==='Automatic')return raw;
  if(!Array.isArray(raw)||raw.length>3||raw.length>curves.length)fail();
  return raw.map((system,i)=>validateCurve2DSystem(system,curves[i]));
}

export function validateIndependentCurve2DSystem(raw:unknown):IndependentCurve2DSystemDescription{
  if(!record(raw)||!keys(raw,['family','source','parameterDomain','rules'])||raw.family!=='origamica-independent-curve2d-system'||
    !record(raw.source)||!keys(raw.source,['function','definitionCell','kind'])||raw.source.function!=='Curve2DSystems'||
    raw.source.definitionCell!=='In[4076]'||raw.source.kind!=='caller-supplied-safe-rules/no-source-identity'||
    !Array.isArray(raw.parameterDomain)||raw.parameterDomain.length!==2||raw.parameterDomain.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v))||
    raw.parameterDomain[0]< -20||raw.parameterDomain[1]>20||raw.parameterDomain[1]-raw.parameterDomain[0]<.02||
    !Array.isArray(raw.rules)||raw.rules.length!==4)fail();
  const compiled=new Map<string,ReturnType<typeof compileGenericExpression>[]>();
  for(const row of raw.rules){if(!record(row)||!keys(row,['key','expressions'])||!CURVE2D_SYSTEM_RULES.includes(row.key)||
    compiled.has(row.key)||!Array.isArray(row.expressions)||row.expressions.length!==(['Speed2D','LeftCurvature2D'].includes(row.key)?1:2))fail();
    compiled.set(row.key,row.expressions.map((source:string)=>compileGenericExpression(source,'u')));}
  // Finite independent audit only; backend encloses the entire declared domain.
  for(let i=0;i<=32;i++){const u=raw.parameterDomain[0]+(raw.parameterDomain[1]-raw.parameterDomain[0])*i/32,arg=new GenericTaylor([u,1,0,0]);
    for(const row of compiled.values())for(const f of row)f(arg);}
  return {family:raw.family,source:{...raw.source},parameterDomain:raw.parameterDomain.slice(),
    rules:raw.rules.map((row:any)=>({key:row.key,expressions:row.expressions.slice()}))} as IndependentCurve2DSystemDescription;
}

export function validateExternalCurve2DSystems(raw:unknown,curves:GenericNativeCurve[],mode:Curve2DSystemsMode):Curve2DSystemsOption{
  if(mode==='verified-same-source')return validateCurve2DSystems(raw,curves);
  if(mode!=='independent-external')fail();if(raw==='Automatic')return raw;
  if(!Array.isArray(raw)||raw.length>3||raw.length>curves.length)fail();return raw.map(validateIndependentCurve2DSystem);
}

export function parseCurve2DSystemsResult(raw:unknown,curves:GenericNativeCurve[]):Curve2DSystemsResult{
  if(!record(raw)||!keys(raw,['family','systems','proof'])||raw.family!=='origamica-curve2d-systems'||!Array.isArray(raw.systems)||raw.systems.length!==curves.length||
    !record(raw.proof)||!keys(raw.proof,['method','sourceIdentitiesVerified','numericalInterpolationReproduced'])||
    raw.proof.method!=='bounded-symbolic-formula-identity/native-domain-interval'||raw.proof.sourceIdentitiesVerified!==true||raw.proof.numericalInterpolationReproduced!==false)fail();
  return {...raw,systems:validateCurve2DSystems(raw.systems,curves)} as Curve2DSystemsResult;
}

export async function fetchCurve2DSystems(curves:GenericNativeCurve[],signal?:AbortSignal){
  const first=curves.slice(0,3);return parseCurve2DSystemsResult(await api('tessellation/curved-curve2d-systems-native',
    {family:'curve2d-systems-native',curves:first},signal),first);
}

export function parseCurve2DSystemsFile(raw:unknown,curves:GenericNativeCurve[],mode:Curve2DSystemsMode='verified-same-source'):Curve2DSystemsOption{
  if(!record(raw)||!keys(raw,['family','systems'])||raw.family!==(mode==='independent-external'?'origamica-independent-curve2d-systems-file':'origamica-curve2d-systems-file'))fail();
  return validateExternalCurve2DSystems(raw.systems,curves,mode);
}

export function independentConstantSystems(domains:[number,number][]){
  return domains.slice(0,3).map(domain=>({family:'origamica-independent-curve2d-system',
    source:{function:'Curve2DSystems',definitionCell:'In[4076]',kind:'caller-supplied-safe-rules/no-source-identity'},parameterDomain:domain.slice(),
    rules:[{key:'Speed2D',expressions:['1']},{key:'LeftCurvature2D',expressions:['.6']},
      {key:'TangentVector2D',expressions:['2','0']},{key:'LeftNormalVector2D',expressions:['0','3']}]}) as IndependentCurve2DSystemDescription);
}
