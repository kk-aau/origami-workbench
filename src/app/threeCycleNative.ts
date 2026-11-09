import {apiWhenIdle} from './api';
import type {XY} from './tessellation';
import {originalThreeCycleEvaluations,type ThreeCycleEvaluation} from './twistAnalysis';
export type ThreeCycleQuery={family:'three-cycle-critical-native';edges:[[XY,XY],[XY,XY],[XY,XY]];checkHalfPlane:boolean};
export type ThreeCycleResult={schema:'origamica-three-cycle-critical-v1';query:ThreeCycleQuery;source:{function:'ThreeCycleCriticalTwistAngles';definitionCell:'In[2700]';counterclockwiseCell:'In[2696]';clockwiseCell:'In[2698]';defaultOptionsCell:'In[2695]';sameHalfPlaneCell:'In[2691]';definitionLines:[200504,200536];checkHalfPlaneDefault:true;originalArcTanRatio:true;originalReversedEdgeCW:true;wolframExecuted:false;symbolicExpressionRuntime:false;paperCertification:false};data:{status:'evaluated'|'numeric-evaluation-incomplete';anglesRad:[number|null,number|null];anglesDeg:[number|null,number|null];evaluations:[ThreeCycleEvaluation,ThreeCycleEvaluation];noMathematicalInfeasibilityClaim:true}};
export const THREE_CYCLE_FALSE_EXAMPLE:ThreeCycleQuery={family:'three-cycle-critical-native',edges:[[[0,-1],[0,3]],[[-3,0],[0,-3]],[[-3,2],[0,2]]],checkHalfPlane:false};
export function readThreeCycleQuery(raw:unknown):ThreeCycleQuery|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>,edges=r.edges===undefined?THREE_CYCLE_FALSE_EXAMPLE.edges:r.edges,checkHalfPlane=r.checkHalfPlane===undefined?true:r.checkHalfPlane;
 if(r.family!=='three-cycle-critical-native'||Object.keys(r).some(k=>!['family','edges','checkHalfPlane'].includes(k))||typeof checkHalfPlane!=='boolean'||!Array.isArray(edges)||edges.length!==3||edges.some(e=>!Array.isArray(e)||e.length!==2||e.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1000))))return null;
 return{family:'three-cycle-critical-native',edges:structuredClone(edges) as ThreeCycleQuery['edges'],checkHalfPlane};
}
export function threeCycleReference(query:ThreeCycleQuery):ThreeCycleResult{
 const q=readThreeCycleQuery(query);if(!q)throw Error('原三边角域输入无效。');const evaluations=originalThreeCycleEvaluations(q.edges,q.checkHalfPlane),a=evaluations[0].angleRad,b=evaluations[1].angleRad,anglesRad:[number|null,number|null]=[a,b===null?null:Math.PI+b];
 return{schema:'origamica-three-cycle-critical-v1',query:q,source:{function:'ThreeCycleCriticalTwistAngles',definitionCell:'In[2700]',counterclockwiseCell:'In[2696]',clockwiseCell:'In[2698]',defaultOptionsCell:'In[2695]',sameHalfPlaneCell:'In[2691]',definitionLines:[200504,200536],checkHalfPlaneDefault:true,originalArcTanRatio:true,originalReversedEdgeCW:true,wolframExecuted:false,symbolicExpressionRuntime:false,paperCertification:false},data:{status:anglesRad.every(a=>a!==null)?'evaluated':'numeric-evaluation-incomplete',anglesRad,anglesDeg:anglesRad.map(a=>a===null?null:a*180/Math.PI) as [number|null,number|null],evaluations,noMathematicalInfeasibilityClaim:true}};
}
export function readThreeCycleResult(raw:unknown,q:ThreeCycleQuery):ThreeCycleResult{
 const expected=threeCycleReference(q),same=(a:unknown,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=3e-10*Math.max(1,Math.abs(a),Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same((a as any)[k],v)):a===b;
 if(!same(raw,expected))throw Error('原三边角域分支、原边、交点、ArcTan或来源独立回读失败。');return raw as ThreeCycleResult;
}
export async function fetchThreeCycle(q:ThreeCycleQuery,signal?:AbortSignal){return readThreeCycleResult(await apiWhenIdle('tessellation/three-cycle-critical',q,signal),q);}
