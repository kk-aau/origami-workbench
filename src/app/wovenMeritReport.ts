import {readWovenGraph} from './wovenGraph';
export type WovenMeritReport={
 certificate:'feasible-lower-bound'|'local-numerical-candidate';
 lowerBounds:number[];lowerMerit:number;merit:number;maximumResidual:number;kktResidual:number;
 activeBounds:number;iterations:number;evaluationCount:number;evaluationBudget:number;
 periodicEquationCount?:number;droppedPeriodicResidual?:number;
 holeClosureEquationCount?:number;holeClosureMaximumResidual?:number;equalityEquationCount?:number;independentEquationCount?:number;
};

/** A display report must agree with the actual returned factors. */
export function readWovenMeritReport(source:Record<string,unknown>):WovenMeritReport|null{
 const q=source.meritReport as Record<string,unknown>|undefined,f=source.pleatFactors;
 if(source.optimization!=='origamica-merit'||!q||!['origamica-woven-nonperiodic-merit-v1','origamica-woven-periodic-merit-v1'].includes(String(q.schema))||q.objective!=='sum-pleat-factors-squared'||q.noArtificialUpperBound!==true||q.wolframExecuted!==false)return null;
 const periodic=q.schema==='origamica-woven-periodic-merit-v1';
 if(q.periodicContract!==(periodic?'ordered-perconds-drop-last-v1':'not-supported'))return null;
 const certificate=q.certificate;if(certificate!=='feasible-lower-bound'&&certificate!=='local-numerical-candidate')return null;
 const lower=q.lowerBounds;
 if(!Array.isArray(f)||!f.length||f.length>512||!Array.isArray(lower)||lower.length!==f.length||f.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||typeof lower[i]!=='number'||!Number.isFinite(lower[i])||lower[i]<=0||v<lower[i]))return null;
 for(const k of ['lowerMerit','merit','maximumResidual','kktResidual'])if(typeof q[k]!=='number'||!Number.isFinite(q[k])||Number(q[k])<0)return null;
 for(const k of ['activeBounds','iterations','evaluationCount','evaluationBudget'])if(!Number.isSafeInteger(q[k])||Number(q[k])<0)return null;
 if(Number(q.activeBounds)>f.length||Number(q.evaluationBudget)<=0||Number(q.evaluationCount)>Number(q.evaluationBudget)||Number(q.maximumResidual)>1e-7)return null;
 const sum=(v:number[])=>v.reduce((s,x)=>s+x*x,0),equal=(a:number,b:number)=>Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
 if(!Number.isFinite(sum(f))||!Number.isFinite(sum(lower))||!equal(Number(q.merit),sum(f))||!equal(Number(q.lowerMerit),sum(lower))||typeof source.merit!=='number'||!equal(source.merit,Number(q.merit)))return null;
 if(q.activeBounds!==f.filter((v,i)=>Math.abs(v-lower[i])<=1e-9+1e-9*Math.abs(lower[i])).length)return null;
 if(certificate==='feasible-lower-bound'&&(f.some((v,i)=>v!==lower[i])||q.iterations!==0||Number(q.maximumResidual)>1e-12))return null;
 if(source.wovenMotherHoles!==undefined){
  const graph=readWovenGraph(source.graph),holes=source.wovenMotherHoles as Record<string,unknown>|null,raw=q.holeClosureRawResiduals,selected=q.equalityRowIndices;
  if(!graph?.holeFaces?.length||!holes||holes.schema!=='zhezhi-woven-mother-holes-v1'||JSON.stringify(holes.faceIds)!==JSON.stringify(graph.holeFaces)||q.holeClosureContract!=='whole-unfold-repeated-corners-v1'||q.constraintReduction!=='fixed-pivoted-jacobian-basis-full-output-check')return null;
  for(const k of ['holeClosureEquationCount','equalityEquationCount','independentEquationCount'])if(!Number.isSafeInteger(q[k])||Number(q[k])<0||Number(q[k])>512)return null;
  const count=Number(q.holeClosureEquationCount),total=Number(q.equalityEquationCount),rank=Number(q.independentEquationCount);
  if(count<2||count%2||total<count||rank>total||rank>f.length||!Array.isArray(raw)||raw.length!==count||raw.some(v=>typeof v!=='number'||!Number.isFinite(v))||!Array.isArray(selected)||selected.length!==rank||selected.some(v=>!Number.isSafeInteger(v)||v<0||v>=total)||new Set(selected).size!==rank)return null;
  if(typeof q.rankTolerance!=='number'||!Number.isFinite(q.rankTolerance)||q.rankTolerance<0||typeof q.holeClosureMaximumResidual!=='number'||!Number.isFinite(q.holeClosureMaximumResidual)||q.holeClosureMaximumResidual<0||!equal(q.holeClosureMaximumResidual,Math.max(...raw.map(Math.abs)))||q.holeClosureMaximumResidual>Number(q.maximumResidual)+1e-12)return null;
  const span=Math.max(...[0,1].map(k=>Math.max(...graph.vertices.map(p=>p[k]))-Math.min(...graph.vertices.map(p=>p[k]))));
  const actualClosure=Math.max(...Array.from({length:count/2},(_,i)=>Math.hypot(raw[2*i],raw[2*i+1])))*span;
  if(typeof source.closureError!=='number'||!Number.isFinite(source.closureError)||source.closureError<0||Math.abs(source.closureError-actualClosure)>1e-12*Math.max(1,span))return null;
 }else if(q.holeClosureContract!==undefined||q.holeClosureEquationCount!==undefined||q.constraintReduction!==undefined)return null;
 if(periodic){
  const records=q.periodicRecords,raw=q.periodicRawResiduals,points=source.foldedForm;
  if(!Array.isArray(records)||!records.length||records.length>128||records.length%2||!Array.isArray(raw)||raw.length!==records.length*2||!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))))return null;
  if(q.periodicEquationCount!==raw.length-1||q.droppedPeriodicEquation!==raw.length-1||q.droppedPeriodicResidual!==raw.at(-1)||raw.some(v=>typeof v!=='number'||!Number.isFinite(v)))return null;
  if(raw.slice(0,-1).some(v=>Math.abs(v)>Number(q.maximumResidual)+1e-12))return null;
  for(const [i,r] of records.entries()){
   if(!r||r.color!==(i%2?-1:1)||!Array.isArray(r.delta)||r.delta.length!==2||r.delta.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v))||!Math.hypot(...r.delta))return null;
   for(const key of ['mother','corners','far'])if(!Array.isArray(r[key])||r[key].length!==2||r[key].some((v:unknown)=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>=(key==='mother'?3000:points.length)))return null;
   if(i%2&&(JSON.stringify(r.mother)!==JSON.stringify(records[i-1].mother)||JSON.stringify(r.delta)!==JSON.stringify(records[i-1].delta)))return null;
   const [a,b]=r.corners,[c,d]=r.far,[dx,dy]=r.delta;
   const shiftX=points[b][0]-points[a][0]-dx,shiftY=points[b][1]-points[a][1]-dy;
   const tx=points[c][0]+dx,ty=points[c][1]+dy,ux=points[b][0]-tx,uy=points[b][1]-ty,vx=points[d][0]-tx,vy=points[d][1]-ty;
   const value=[-shiftX*dy+shiftY*dx,(ux*vy-uy*vx)/2],scale=[Math.abs(shiftX*dy)+Math.abs(shiftY*dx),Math.abs(ux*vy)+Math.abs(uy*vx)];
   if(value.some((v,k)=>!Number.isFinite(v)||Math.abs(v-raw[2*i+k])>1e-12+64*Number.EPSILON*Math.max(1,scale[k])))return null;
  }
 }
 return q as WovenMeritReport;
}
