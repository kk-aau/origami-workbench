import {validateNDSolveStepOptions,validateNDSolveStepStamp,type NDSolveStepOptions,type NDSolveStepStamp} from './curvedNDSolveOptions';
export type LinkedFirst3DIntegration={callerFunction:'NLinkedFoldsFirst3D';callerDefinitionCell:'In[4081]';recoveryFunction:'NRecoverDarboux3D';
 controlledStages:['NRecoverDarboux3D'];optionPath:'opts/NRecoverDarboux3D/FilterRules[Options[NDSolve]]';method:'DOP853';rtol:2e-12;atol:2e-14;
 evaluations:number;initialParameter:number;initialState:number[];interpolationAndRootStagesControlled:false;stepOptions:NDSolveStepStamp};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 near=(a:number,b:number)=>Math.abs(a-b)<=2e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function linkedStepOptionsFromFields(maxSteps:string,maxStepSize:string,span:number):NDSolveStepOptions|undefined{
 if(!maxSteps.trim()&&!maxStepSize.trim())return undefined;
 return validateNDSolveStepOptions({...maxSteps.trim()?{MaxSteps:Number(maxSteps)}:{},...maxStepSize.trim()?{MaxStepSize:Number(maxStepSize)}:{}},span);
}
export function validateLinkedFirst3DIntegration(raw:any,options:NDSolveStepOptions,start:number,end:number,initial:number[]):boolean{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join('|')!==[
  'callerFunction','callerDefinitionCell','recoveryFunction','controlledStages','optionPath','method','rtol','atol','evaluations',
  'initialParameter','initialState','interpolationAndRootStagesControlled','stepOptions'].sort().join('|')||
  raw.callerFunction!=='NLinkedFoldsFirst3D'||raw.callerDefinitionCell!=='In[4081]'||raw.recoveryFunction!=='NRecoverDarboux3D'||
  JSON.stringify(raw.controlledStages)!=='["NRecoverDarboux3D"]'||raw.optionPath!=='opts/NRecoverDarboux3D/FilterRules[Options[NDSolve]]'||
  raw.method!=='DOP853'||raw.rtol!==2e-12||raw.atol!==2e-14||raw.interpolationAndRootStagesControlled!==false||
  raw.initialParameter!==start||!Array.isArray(raw.initialState)||raw.initialState.length!==12||raw.initialState.some((x:any,i:number)=>!finite(x)||!near(x,initial[i]))||
  !Number.isInteger(raw.evaluations)||raw.evaluations<1||raw.evaluations>24000)return false;
 return validateNDSolveStepStamp(raw.stepOptions,options,'In[3815]',start,end,start,raw.evaluations,end-start);
}
export function linkedCircleInitial(start=0,radius=1){return [radius*Math.cos(start),radius*Math.sin(start),0,-Math.sin(start),Math.cos(start),0,-Math.cos(start),-Math.sin(start),0,0,0,1];}
export function replayLinkedCircleFirst(nodes:number[],radii=[1,1.1],harmonics=[.1],angle=120,start=0){
 const initial=linkedCircleInitial(start,radii[0]),states=new Map<number,number[]>([[start,initial.slice()]]),
  derivative=(s:number,y:number[])=>{const delta=harmonics.reduce((sum,x,i)=>sum+x*Math.sin(2*(i+1)*s),0),
   n=Math.tan(angle*Math.PI/360),tau=-n*radii[1]*Math.sin(delta)/(radii[0]-radii[1]*Math.cos(delta)),T=y.slice(3,6),L=y.slice(6,9),U=y.slice(9,12);
   return [...T.map(x=>radii[0]*x),...L.map((x,i)=>x+n*U[i]),...T.map((x,i)=>-x+tau*U[i]),...T.map((x,i)=>-n*x-tau*L[i])];},
  c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],
   [9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
 let s=start,y=initial.slice(),h=((Math.max(...nodes)-start)||1)/32,budget=0;
 for(const end of [...new Set(nodes)].sort((a,b)=>a-b)){
  while(s<end){if(++budget>8192)throw Error('首First3D独立DP54回读超出有限预算。');if(s+h>end)h=end-s;if(s+h===s)throw Error('首First3D独立步长退化。');
   const stages:number[][]=[];for(let k=0;k<7;k++)stages.push(derivative(k===6?s+h:s+c[k]*h,y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0))));
   const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
    error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
   if(!finite(error)||high.some(x=>!finite(x)))throw Error('首First3D独立恢复非有限。');if(error<=1){s=s+h>=end?end:s+h;y=high;}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
  }states.set(end,y.slice());
 }
 const at=(s:number)=>{const value=states.get(s)??[...states].find(([x])=>Math.abs(x-s)<=2e-12*Math.max(1,Math.abs(s)))?.[1];if(!value)throw Error('首First3D独立恢复缺少原参数。');return value;};
 return {initial,at};
}
export function linkedPointMatches(actual:number[],expected:number[]){return actual.length===expected.length&&actual.every((x,i)=>finite(x)&&near(x,expected[i]));}
