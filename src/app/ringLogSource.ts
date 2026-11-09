import {inspectRingBuiltinLogInput} from './ringVectorFunctionDefinitions';
const inputKeys=['outerVectorTemplate','creaseVectorTemplate','outerVectorExpressions','creaseVectorExpressions','vectorFunctionDefinitions'];
export function ringLogSourceMatches(source:Record<string,unknown>,p:Record<string,unknown>):boolean{
 const present=inspectRingBuiltinLogInput(p),d=source.logNumericDomain;
 if(present===null)return false;if(!present)return d===undefined;
 if(!d||typeof d!=='object'||Array.isArray(d))return false;const q=d as Record<string,unknown>;
 const keys=['schema','function','definitionCell','parsedIntrinsicCalls','argumentPolicy','roundingModel','machineCheckedRealArithmetic','wolframExecuted','rawInputBinding'];
 if(Object.keys(q).sort().join('|')!==keys.sort().join('|')||q.schema!=='origamica-ring-log-numeric-domain-v1'||q.function!=='MakeRingTessellation'||q.definitionCell!=='In[2680]'||q.parsedIntrinsicCalls!==true||q.argumentPolicy!=='strict-positive-interval-for-evaluated-log-arguments'||q.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||q.machineCheckedRealArithmetic!==false||q.wolframExecuted!==false)return false;
 const binding=q.rawInputBinding;if(!binding||typeof binding!=='object'||Array.isArray(binding))return false;
 const expected=Object.fromEntries(inputKeys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),actual=binding as Record<string,unknown>;
 return Object.keys(actual).sort().join('|')===Object.keys(expected).sort().join('|')&&Object.entries(expected).every(([k,v])=>JSON.stringify(actual[k])===JSON.stringify(v));
}
