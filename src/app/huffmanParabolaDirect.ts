import {apiWhenIdle} from './api';
import type {HuffmanParabolaRow} from './huffmanParabola';
import {replayParabola} from './huffmanCircle4Independent';
export type ParabolaDirectQuery={family:'huffman-parabola-in4060';mode:'direct-four-arguments';parametersDeg:[number,number,number,number];divisions:number};
type OriginalItem={name:string;kind:string;dimension?:number;domain?:number[];values?:number[]|number[][];value?:number[]};
export type ParabolaDirectResult={family:'origamica-huffman-parabola-direct';query:ParabolaDirectQuery;source:Record<string,unknown>;originalItems:OriginalItem[];sample:{rows:HuffmanParabolaRow[];pairedBlocks:2};diagnostics:{terminalParabolaParameterDeg:number;closureConditionsSaved:false;thirdRulingLengthDifference:1e-6;parabolaEquation:'x + y^2/8 = 2'};certification:Record<string,unknown>;numerics:{method:string;evaluationCount:number;evaluationBudget:12000;initialDarboux:number[][]}};
export const PARABOLA_DIRECT_DEFAULT:ParabolaDirectQuery={family:'huffman-parabola-in4060',mode:'direct-four-arguments',parametersDeg:[5,85,60,-90],divisions:25};
export const PARABOLA_RETURN_NAMES=['f0','f1','f2','f3','ff0','ff1','ff2','ff3','xL','xR','yL','yR','z','pv','q','gamma1','gamma2'] as const;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const equal=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'?Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=3e-5*Math.max(1,Math.abs(b)):Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>equal(x,b[i])):a===b;
const sameNative=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'?Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-12+32*Number.EPSILON*Math.max(1,Math.abs(b)):Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>sameNative(x,b[i])):a===b;
const exactKeys=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
function fail():never{throw Error('HCwCParabola 原17项、参数来源或原方程回读不一致。');}
export function readParabolaDirectQuery(raw:unknown):ParabolaDirectQuery{
 if(!record(raw)||!exactKeys(raw,['family','mode','parametersDeg','divisions'])||raw.family!=='huffman-parabola-in4060'||raw.mode!=='direct-four-arguments'||!Array.isArray(raw.parametersDeg)||raw.parametersDeg.length!==4||!raw.parametersDeg.every(finite))throw Error('四参数需要四个有限角度数值。');
 const [a,b,c,d]=raw.parametersDeg;if(!(a>0&&a<b&&b<90&&c>0&&c<180&&d>-180&&d<0))throw Error('本地实数域：0<t₁<t₂<90°，0<γ₁<180°，−180<γ₂<0°。原NumericQ其它域未实现。');
 if(!finite(raw.divisions)||!Number.isInteger(raw.divisions)||raw.divisions<8||raw.divisions>64)throw Error('采样段数须为8–64整数。');return {family:'huffman-parabola-in4060',mode:'direct-four-arguments',parametersDeg:[a,b,c,d],divisions:raw.divisions};
}
/** All 17 original items are checked against a separate fixed-step RK4 solve. */
export function readParabolaDirectResult(raw:unknown,requested?:ParabolaDirectQuery):ParabolaDirectResult{
 if(!record(raw)||!exactKeys(raw,['family','query','source','originalItems','sample','diagnostics','certification','numerics'])||raw.family!=='origamica-huffman-parabola-direct')fail();
 const query=readParabolaDirectQuery(raw.query);if(requested&&JSON.stringify(query)!==JSON.stringify(readParabolaDirectQuery(requested)))fail();
 if(!record(raw.source)||!record(raw.sample)||!record(raw.diagnostics)||!record(raw.certification)||!record(raw.numerics))fail();
 const s=raw.source;
 if(!exactKeys(s,['function','constructionCell','argumentUnits','arguments','originalArgumentPredicate','implementedDomain','originalNumericQDomainComplete','originalCompletionStatus','originalReturnNames','representation','wolframExecuted'])||s.function!=='HCwCParabola'||s.constructionCell!=='In[4058]'||s.argumentUnits!=='radians'||!sameNative(s.arguments,query.parametersDeg.map(x=>x*(Math.PI/180)))||s.originalArgumentPredicate!=='NumericQ'||s.implementedDomain!=='0<ti1<ti2<pi/2;0<gamma1i<pi;-pi<gamma2i<0;finite-real-and-nonsingular'||s.originalNumericQDomainComplete!==false||s.originalCompletionStatus!=='partially-worked-out'||!equal(s.originalReturnNames,[...PARABOLA_RETURN_NAMES])||s.representation!=='sampled-original-17-return-items'||s.wolframExecuted!==false)fail();
 const cert=raw.certification;if(!exactKeys(cert,['thirdRulingOffset','completeBlockExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern','deploymentPathChecked','selfCollisionChecked'])||cert.thirdRulingOffset!==1e-6||Object.keys(cert).some(k=>k!=='thirdRulingOffset'&&cert[k]!==false))fail();
 const diag=raw.diagnostics;if(!exactKeys(diag,['terminalParabolaParameterDeg','closureConditionsSaved','thirdRulingLengthDifference','parabolaEquation'])||!finite(diag.terminalParabolaParameterDeg)||diag.closureConditionsSaved!==false||diag.thirdRulingLengthDifference!==1e-6||diag.parabolaEquation!=='x + y^2/8 = 2')fail();
 const n=raw.numerics;if(!exactKeys(n,['method','evaluationCount','evaluationBudget','initialDarboux'])||n.method!=='existing-RK45-angle-and-Darboux'||n.evaluationBudget!==12000||!Number.isSafeInteger(n.evaluationCount)||Number(n.evaluationCount)<=0||Number(n.evaluationCount)>12000||!equal(n.initialDarboux,[[1,0,0],[0,0,1],[-1,0,0],[0,-1,0]]))fail();
 const sample=raw.sample;if(!exactKeys(sample,['rows','pairedBlocks'])||sample.pairedBlocks!==2||!Array.isArray(sample.rows)||sample.rows.length!==query.divisions+1||!Array.isArray(raw.originalItems)||raw.originalItems.length!==17)fail();
 const replay=replayParabola(query.parametersDeg),expected=sample.rows.map((_,i)=>replay.at(i*Math.PI/(2*query.divisions))),constants=replay.constants;
 if(!sameNative(diag.terminalParabolaParameterDeg,sample.rows.at(-1).anglesDeg[0]))fail();
 for(const [i,r]of sample.rows.entries()){
  if(!record(r)||!exactKeys(r,['t','anglesDeg','flat','folded','flatMirror','foldedMirror','flatThirdRulingLength','foldedThirdRulingLength'])||!equal(r.t,i*Math.PI/(2*query.divisions))||!equal(r.anglesDeg,expected[i].angles.map(x=>x*180/Math.PI))||!equal(r.flat,expected[i].flat)||!equal(r.folded,expected[i].folded))fail();
  const q=expected[i].angles[0],length=2-4/(1+Math.cos(q))*Math.cos(q);if(!equal(r.flatThirdRulingLength,length)||!equal(r.foldedThirdRulingLength,length+1e-6)||!sameNative(Number(r.foldedThirdRulingLength)-Number(r.flatThirdRulingLength),1e-6))fail();
  const nativeFolded=r.folded as number[][],nativeFlat=r.flat as number[][];if(!sameNative(nativeFlat[2][0]+nativeFlat[2][1]**2/8,2))fail();if(!sameNative(Math.hypot(...nativeFolded[3].map((x,k)=>x-nativeFolded[2][k])),r.foldedThirdRulingLength)||!sameNative(Math.hypot(...nativeFlat[3].map((x,k)=>x-nativeFlat[2][k])),r.flatThirdRulingLength))fail();
  const mirrorFlat=expected[i].flat.map(p=>[2-p[0],-p[1]]),center=expected[0].folded[1],axis=constants.pv,mirrorFolded=expected[i].folded.map(p=>{const delta=p.map((x,k)=>x-center[k]),dot=delta.reduce((v,x,k)=>v+x*axis[k],0);return center.map((x,k)=>x+2*dot*axis[k]-delta[k]);});if(!equal(r.flatMirror,mirrorFlat)||!equal(r.foldedMirror,mirrorFolded))fail();
 }
 for(const [i,item]of raw.originalItems.entries()){
  const name=PARABOLA_RETURN_NAMES[i];if(!record(item)||item.name!==name)fail();
  if(name in constants){if(!exactKeys(item,['name','kind','dimension','value'])||item.kind!=='constant-vector'||item.dimension!==3||!equal(item.value,constants[name as keyof typeof constants]))fail();}
  else if(i>=14){if(!exactKeys(item,['name','kind','domain','values'])||item.kind!=='scalar-function-samples'||!sameNative(item.domain,[0,Math.PI/2])||!equal(item.values,expected.map(x=>x.angles[i-14]))||!sameNative(item.values,sample.rows.map(row=>row.anglesDeg[i-14]*(Math.PI/180))))fail();}
  else{if(!exactKeys(item,['name','kind','dimension','domain','values'])||item.kind!=='vector-function-samples'||item.dimension!==(i<4?2:3)||!sameNative(item.domain,[0,Math.PI/2])||!equal(item.values,expected.map(x=>(i<4?x.flat:x.folded)[i%4]))||!sameNative(item.values,sample.rows.map(row=>(i<4?row.flat:row.folded)[i%4])))fail();}
 }
 return raw as ParabolaDirectResult;
}
export async function fetchParabolaDirect(raw:unknown,signal?:AbortSignal){const query=readParabolaDirectQuery(raw);return readParabolaDirectResult(await apiWhenIdle('tessellation/huffman-parabola',query,signal),query);}
export function parabolaParameterFile(query:ParabolaDirectQuery){return {format:'origamica-hcw-parabola-arguments',version:1,units:'degrees',query:readParabolaDirectQuery(query)};}
export function readParabolaParameterFile(raw:unknown){if(!record(raw)||!exactKeys(raw,['format','version','units','query'])||raw.format!=='origamica-hcw-parabola-arguments'||raw.version!==1||raw.units!=='degrees')throw Error('参数文件类型或单位错误。');return readParabolaDirectQuery(raw.query);}
