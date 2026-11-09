import type {WovenParams} from './wovenParams';
import type {WovenMeritReport} from './wovenMeritReport';
import type {Point} from '../core/types';
export function wovenOldIn3442Preset():WovenParams&{mode:'graph'}{return {family:'woven-lines',mode:'graph',wovenVersion:'original-old',width:.4,parity:1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:5,
 graph:{vertices:[[0,0],[1,0],[3,0],[4,0],[0,1],[1,1],[2,1],[4,1],[1,2],[0,3],[0,4],[1,4],[4,4]],edges:[[0,1],[1,2],[2,3],[0,4],[1,5],[2,6],[3,7],[4,5],[5,6],[6,7],[4,9],[5,8],[6,8],[7,12],[8,9],[9,10],[8,11],[10,11],[11,12]]}};}
export type WovenOldState={rawD:number[];rawDD:number[];topologyInitialCP:Point[]};
const record=(v:unknown):Record<string,any>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;
const equal=(a:number,b:number)=>Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
const substitutions=(value:unknown,h:number,d:number,dd:number)=>{const q=record(value);return !!q&&Object.keys(q).sort().join('|')==='d|dd|h'&&q.h===h&&q.d===d&&q.dd===dd;};
export function readWovenOldState(source:Record<string,unknown>,p:WovenParams):WovenOldState|null{
 const c=record(source.oldWoven),q=record(source.oldMeritReport),h=p.width/2,keys=['schema','function','definitionCell','inset','rawD','rawDD','originalStationaryFace','signedStartFace','topologyInitialCP','cpSubstitutions','unoptimizedFFSubstitutions','originalOptimizer','wolframExecuted'];
 if(p.wovenVersion!=='original-old'||source.optimization!=='original-old-findminimum'||source.pleatFactors!==undefined||source.meritReport!==undefined||!c||!q||Object.keys(c).sort().join('|')!==keys.sort().join('|')||c.schema!=='origamica-woven-old-v1'||c.function!=='MakeSimpleWovenTessellationOld'||c.definitionCell!=='In[3441]'||c.inset!==h||c.originalStationaryFace!==p.stationaryFace+1||c.signedStartFace!==p.parity*(p.stationaryFace+1)||c.originalOptimizer!=='FindMinimum'||c.wolframExecuted!==false||!substitutions(c.cpSubstitutions,.45*h,-.45*h,-.05*h)||!substitutions(c.unoptimizedFFSubstitutions,h,.8*h,.2*h))return null;
 if(!Array.isArray(c.rawD)||!Array.isArray(c.rawDD)||!c.rawD.length||c.rawD.length+c.rawDD.length>512||c.rawD.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<p.minPleat*h)||c.rawDD.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<p.minBorderPleat*h)||!Array.isArray(c.topologyInitialCP)||c.topologyInitialCP.some(v=>!Array.isArray(v)||v.length!==2||v.some(x=>typeof x!=='number'||!Number.isFinite(x))))return null;
 const raw=[...c.rawD,...c.rawDD],lower=[...c.rawD.map(()=>p.minPleat*h),...c.rawDD.map(()=>p.minBorderPleat*h)];
 const reportKeys=['schema','objective','certificate','lowerBounds','lowerMerit','merit','maximumResidual','kktResidual','activeBounds','iterations','evaluationCount','evaluationBudget','noArtificialUpperBound','periodicContract','wolframExecuted','variableUnits'];
 if(Object.keys(q).sort().join('|')!==reportKeys.sort().join('|')||q.schema!=='origamica-woven-old-merit-v1'||q.objective!=='sum-raw-d-dd-squared'||q.variableUnits!=='source-length'||q.noArtificialUpperBound!==true||q.wolframExecuted!==false||q.periodicContract!=='not-in-original-old-definition'||JSON.stringify(q.lowerBounds)!==JSON.stringify(lower)||!['feasible-lower-bound','local-numerical-candidate'].includes(q.certificate))return null;
 for(const k of ['merit','lowerMerit','maximumResidual','kktResidual'])if(typeof q[k]!=='number'||!Number.isFinite(q[k])||q[k]<0)return null;
 for(const k of ['activeBounds','iterations','evaluationCount','evaluationBudget'])if(!Number.isSafeInteger(q[k])||q[k]<0)return null;
 if(q.maximumResidual>1e-7||q.evaluationBudget!==12000||q.evaluationCount<=0||q.evaluationCount>q.evaluationBudget||q.activeBounds!==raw.filter((v,i)=>Math.abs(v-lower[i])<=1e-9+1e-9*Math.abs(lower[i])).length||!equal(q.merit,raw.reduce((s,x)=>s+x*x,0))||!equal(q.lowerMerit,lower.reduce((s,x)=>s+x*x,0)))return null;
 if(q.certificate==='feasible-lower-bound'&&(raw.some((v,i)=>v!==lower[i])||q.iterations!==0||q.maximumResidual>1e-12))return null;
 return c as WovenOldState;
}
export function readWovenOldMeritReport(source:Record<string,unknown>,p:WovenParams):WovenMeritReport|null{return readWovenOldState(source,p)?source.oldMeritReport as WovenMeritReport:null;}
