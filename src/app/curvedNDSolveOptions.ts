export type NDSolveStepOptions={MaxSteps?:number;MaxStepSize?:number};
export type NDSolveDefinitionCell='In[3640]'|'In[3685]'|'In[3815]';
export type NDSolveStepStamp={optionSource:'Options[NDSolve]/FilterRules/recovery';definitionCell:NDSolveDefinitionCell;
 options:NDSolveStepOptions;effectiveMaxStepSize:number;backwardSteps:number;forwardSteps:number;backwardParameters:number[];forwardParameters:number[];
 counting:'accepted-DOP853-steps/shared-backward-forward';rhsEvaluationBudget:24000;sourceInputsPreserved:true;
 originalAutomaticDefaultsReproduced:false;wolframStepControllerReproduced:false;workingPrecisionReproduced:false;errorGoalNormReproduced:false};
export function validateNDSolveStepOptions(raw:unknown,span:number):NDSolveStepOptions{
 if(!Number.isFinite(span)||span<=0)throw Error('NDSolve步选项须绑定有限递增原参数域。');
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.keys(raw).length||Object.keys(raw).some(k=>!['MaxSteps','MaxStepSize'].includes(k)))
  throw Error('当前有限NDSolve选项仅接受显式MaxSteps／MaxStepSize；精度目标、Automatic、Infinity和内核默认未替代。');
 const q=raw as NDSolveStepOptions;
 if(Object.hasOwn(q,'MaxSteps')&&(!Number.isInteger(q.MaxSteps)||q.MaxSteps!<1||q.MaxSteps!>4096))throw Error('MaxSteps须为1–4096的显式整数。');
 if(Object.hasOwn(q,'MaxStepSize')&&(typeof q.MaxStepSize!=='number'||!Number.isFinite(q.MaxStepSize)||q.MaxStepSize<1e-6||q.MaxStepSize>span))
  throw Error('MaxStepSize须为1e-6至完整原s域长度的显式步长。');
 return {...q};
}
export function validateNDSolveStepStamp(raw:any,options:NDSolveStepOptions,definition:boolean|NDSolveDefinitionCell,start:number,end:number,ui:number,evaluations:number,defaultMaxStep=(end-start)/32):boolean{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw.options)!==JSON.stringify(options)||
  Object.keys(raw).sort().join('|')!==['optionSource','definitionCell','options','effectiveMaxStepSize','backwardSteps','forwardSteps','backwardParameters','forwardParameters',
   'counting','rhsEvaluationBudget','sourceInputsPreserved','originalAutomaticDefaultsReproduced','wolframStepControllerReproduced','workingPrecisionReproduced','errorGoalNormReproduced'].sort().join('|')||
  raw.optionSource!=='Options[NDSolve]/FilterRules/recovery'||raw.definitionCell!==(typeof definition==='boolean'?(definition?'In[3640]':'In[3815]'):definition)||
  raw.counting!=='accepted-DOP853-steps/shared-backward-forward'||raw.rhsEvaluationBudget!==24000||raw.sourceInputsPreserved!==true||
  ['originalAutomaticDefaultsReproduced','wolframStepControllerReproduced','workingPrecisionReproduced','errorGoalNormReproduced'].some(k=>raw[k]!==false)||
  raw.effectiveMaxStepSize!==(options.MaxStepSize??defaultMaxStep))return false;
 let steps=0;
 for(const [key,bound] of [['backward',start],['forward',end]] as const){
  const nodes=raw[key+'Parameters'],count=raw[key+'Steps'],direction=Math.sign(bound-ui);
  if(!Array.isArray(nodes)||!Number.isInteger(count)||count<0||count>4096||nodes.length!==count+1||nodes.some(x=>typeof x!=='number'||!Number.isFinite(x))||
   nodes[0]!==ui||nodes.at(-1)!==bound||!direction&&count!==0||direction&&count===0)return false;
  for(let i=1;i<nodes.length;i++)if(direction*(nodes[i]-nodes[i-1])<=0||Math.abs(nodes[i]-nodes[i-1])>raw.effectiveMaxStepSize*(1+1e-12))return false;
  steps+=count;
 }
 return steps<=4096&&steps<evaluations&&(!options.MaxSteps||steps<=options.MaxSteps)&&evaluations<=24000;
}
