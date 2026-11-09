import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type NativePlanarSequenceQuery={family:'planar-sequence-native';baseCurve:[string,string,string];director:[string,string,string];
 mirrors:{point:number[];normal:number[]}[];composeReflections:boolean;parameterStart:number;parameterEnd:number;
 transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number};
type Stage={parameter:number;parameterDerivative:number;base:number[];fold:number[];director:number[];
 baseDerivative:number[];foldDerivative:number[];directorDerivative:number[];normalizedBase:number[];normalizedFold:number[];
 normalizedDirector:number[];normalizedBaseDerivative:number[];normalizedFoldDerivative:number[];normalizedDirectorDerivative:number[]};
export type NativePlanarSequenceResult={family:'origamica-native-planar-sequence';query:NativePlanarSequenceQuery;
 source:{functions:string[];definitionCells:string[];reflectuDefinitionCell:string;initialEntry:string[];stageEntry:string[];
 normalNormalized:false;interpolationReproduced:false;symbolicOptionsReproduced:false};normalization:{origin:number[];scale:number};
 effectiveMirrors:{point:number[];normalizedPoint:number[];normal:number[]}[];
 domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;normalizedDenominatorBounds:number[][]}[];
 unresolved:number[][];roundingModel:string;reason:string|null};
 diagnostics:{validationNodes:129;maximumRelativeMetricDifference:number;maximumNormalizedMirrorPlaneResidual:number;
 maximumMirrorNormalSquaredLengthError:number;normalCompatibilityTolerance:number};
 certification:{literalOriginalSequenceEvaluated:true;sourceDomainCertified:boolean;mirrorNormalsCompatible:boolean;
 conditionalReflectionIsometryCertified:boolean;finiteMetricVerified:boolean;cutOrderVerified:false;globalInjectivityChecked:false;
 selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
 sample:{rows:{s:number;stages:Stage[]}[]};grid:{s:number;stages:{normalizedPoints:number[][];points:number[][];EFG:number[][]}[]}[]};
export const NATIVE_PLANAR_SEQUENCE_PRESET:NativePlanarSequenceQuery={family:'planar-sequence-native',baseCurve:['s','.2*s**2','0'],
 director:['0','0','1'],mirrors:[{point:[0,0,1],normal:[0,0,1]},{point:[0,0,2],normal:[0,-Math.sin(Math.PI/12),Math.cos(Math.PI/12)]}],
 composeReflections:true,parameterStart:-.5,parameterEnd:.8,transverseStart:0,transverseEnd:3,segments:32,rulingSegments:8};
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const td=(a:GenericTaylor[],b:number[])=>a.reduce((sum,x,i)=>sum.add(x.mul(b[i])),a[0].constant(0));
const rv=(x:number[],n:number[])=>x.map((a,i)=>a-2*dot(x,n)*n[i]);
const rp=(x:number[],p:number[],n:number[])=>x.map((a,i)=>a-2*dot(x.map((v,k)=>v-p[k]),n)*n[i]);
const sum=(values:number[])=>{const p:number[]=[];for(let x of values){let i=0;for(let y of p){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];
 const hi=x+y,lo=y-(hi-x);if(lo)p[i++]=lo;x=hi;}p.length=i;p.push(x);}return p.reduceRight((a,b)=>a+b,0);};
function fail():never{throw Error('原镜像序列的六源、镜面顺序、原交线／导数、网格或条件证据回读不一致。');}
export function validateNativePlanarSequenceQuery(raw:unknown):NativePlanarSequenceQuery{
 if(!record(raw)||!keys(raw,Object.keys(NATIVE_PLANAR_SEQUENCE_PRESET))||raw.family!=='planar-sequence-native')throw Error('原镜像序列字段无效。');
 for(const key of ['baseCurve','director']){if(!Array.isArray(raw[key])||raw[key].length!==3)throw Error('B／D各需三个完整表达式。');
  raw[key].forEach((source:string)=>compileGenericExpression(source,'s'));}
 if(!Array.isArray(raw.mirrors)||raw.mirrors.length>8)throw Error('原镜面列表须为0–8个。');
 for(const m of raw.mirrors)if(!record(m)||!keys(m,['point','normal'])||!vector(m.point,3)||!vector(m.normal,3)||[...m.point,...m.normal].some(v=>Math.abs(v)>1e12))
  throw Error('每个镜面须完整point／normal三坐标，不Normalize。');
 if(typeof raw.composeReflections!=='boolean')throw Error('反射组合须为布尔值。');
 if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)
  throw Error('s域须在−10…10且跨度0.01–12。');
 if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||raw.transverseStart>=raw.transverseEnd)throw Error('w域须在±10⁶内递增。');
 if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>32)
  throw Error('密度须为8–128纵向、2–32横向段。');
 return structuredClone(raw) as NativePlanarSequenceQuery;
}
export function makeNativePlanarSequenceReference(input:unknown){
 const q=validateNativePlanarSequenceQuery(input),base=q.baseCurve.map(x=>compileGenericExpression(x,'s')),director=q.director.map(x=>compileGenericExpression(x,'s')),
  parts=base.map(f=>f.parts(new GenericTaylor([q.parameterStart,1]))),origin=parts.map(p=>sum(p.offsets)+p.dynamic.c[0]),extent:number[]=[];
 for(let i=0;i<=8;i++){const s=q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8,u=new GenericTaylor([s,1]);
  extent.push(Math.hypot(...base.map(f=>f(u).c[1]))*(q.parameterEnd-q.parameterStart),Math.hypot(...director.map(f=>f(u).c[0]))*(q.transverseEnd-q.transverseStart));}
 const scale=Math.max(...extent)||1;if(!finite(scale))fail();
 let pending=q.mirrors.map(m=>({point:m.point.map((x,i)=>(sum([x,...parts[i].offsets.map(v=>-v)])-parts[i].dynamic.c[0])/scale),normal:m.normal.slice()}));
 const mirrors:typeof pending=[];
 while(pending.length){const m=pending.shift()!;mirrors.push(m);if(q.composeReflections)pending=pending.map(x=>({point:rp(x.point,m.point,m.normal),normal:rv(x.normal,m.normal)}));}
 const evaluate=(s:number)=>{const u=new GenericTaylor([s,1]);let b=base.map((f,i)=>{const p=f.parts(u);return p.dynamic.sub(parts[i].dynamic.c[0]).add(sum([...p.offsets,...parts[i].offsets.map(v=>-v)])).div(scale);}),
  d=director.map(f=>f(u).div(scale));const stages=[{parameter:u.constant(0),base:b,fold:b,director:d}],denominators:GenericTaylor[]=[];
  for(const m of mirrors){const n=m.normal,den=td(d,n),parameter=td(b.map((x,i)=>u.constant(m.point[i]).sub(x)),n).div(den),fold=b.map((x,i)=>x.add(parameter.mul(d[i]))),
   scalar=td(b.map((x,i)=>x.sub(m.point[i])),n).mul(2),vector=td(d,n).mul(2);
   b=b.map((x,i)=>x.sub(scalar.mul(n[i])));d=d.map((x,i)=>x.sub(vector.mul(n[i])));
   stages.push({parameter,base:b,fold,director:d});denominators.push(den);}
  return {stages,denominators};};
 return {query:q,origin,scale,mirrors,evaluate};
}
export function parseNativePlanarSequenceResult(raw:unknown,requested?:unknown):NativePlanarSequenceResult{
 if(!record(raw)||!keys(raw,['family','query','source','normalization','effectiveMirrors','domain','diagnostics','certification','sample','grid'])||raw.family!=='origamica-native-planar-sequence')fail();
 const q=validateNativePlanarSequenceQuery(raw.query);if(requested){const expected=validateNativePlanarSequenceQuery(requested);for(const key of Object.keys(q))if(JSON.stringify(q[key as keyof typeof q])!==JSON.stringify(expected[key as keyof typeof q]))fail();}
 const ref=makeNativePlanarSequenceReference(q),L=ref.scale,close=(a:unknown,b:number,scale=1)=>finite(a)&&Math.abs(a-b)<=Math.max(3e-9*Math.max(scale,Math.abs(b)),6*Number.EPSILON*Math.abs(b)),
  vec=(a:unknown,b:number[],scale=1)=>vector(a,b.length)&&b.every((v,i)=>close(a[i],v,scale)),source=raw.source;
 if(!record(source)||!keys(source,['functions','definitionCells','reflectuDefinitionCell','initialEntry','stageEntry','normalNormalized','interpolationReproduced','symbolicOptionsReproduced'])||
  JSON.stringify(source.functions)!=='["PlanarCurvedFold3DSequence","NPlanarCurvedFold3DSequence"]'||JSON.stringify(source.definitionCells)!=='["In[4038]","In[4042]"]'||source.reflectuDefinitionCell!=='In[152]'||
  JSON.stringify(source.initialEntry)!=='["0","B","B","D"]'||JSON.stringify(source.stageEntry)!=='["v","reflectedB","fold","reflectedD"]'||['normalNormalized','interpolationReproduced','symbolicOptionsReproduced'].some(k=>source[k]!==false))fail();
 if(!record(raw.normalization)||!keys(raw.normalization,['origin','scale'])||!vec(raw.normalization.origin,ref.origin,L)||!close(raw.normalization.scale,L,L)||!Array.isArray(raw.effectiveMirrors)||raw.effectiveMirrors.length!==q.mirrors.length)fail();
 ref.mirrors.forEach((m,i)=>{const actual=raw.effectiveMirrors[i];if(!record(actual)||!keys(actual,['point','normalizedPoint','normal'])||!vec(actual.normal,m.normal)||!vec(actual.normalizedPoint,m.point)||!vec(actual.point,m.point.map((v,k)=>v*L+ref.origin[k]),L))fail();});
 const parameters=Array.from({length:q.segments+1},(_,i)=>i===q.segments?q.parameterEnd:q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
  widths=Array.from({length:q.rulingSegments+1},(_,i)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*i/q.rulingSegments);
 if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
 const stageKeys=['parameter','parameterDerivative',...['base','fold','director'].flatMap(k=>[k,k+'Derivative','normalized'+k[0].toUpperCase()+k.slice(1),'normalized'+k[0].toUpperCase()+k.slice(1)+'Derivative'])];
 const metric=(stage:ReturnType<typeof ref.evaluate>['stages'][number],w:number)=>{const ds=stage.base.map((x,k)=>x.c[1]+w*stage.director[k].c[1]),d=stage.director.map(x=>x.c[0]);return [dot(ds,ds),dot(ds,d),dot(d,d)];};
 parameters.forEach((s,i)=>{const row=raw.sample.rows[i],grid=raw.grid[i],expected=ref.evaluate(s);if(!record(row)||!keys(row,['s','stages'])||!close(row.s,s)||!Array.isArray(row.stages)||row.stages.length!==q.mirrors.length+1||
  !record(grid)||!keys(grid,['s','stages'])||!close(grid.s,s)||!Array.isArray(grid.stages)||grid.stages.length!==row.stages.length)fail();
  expected.stages.forEach((stage,j)=>{const actual=row.stages[j],g=grid.stages[j];if(!record(actual)||!keys(actual,stageKeys)||!close(actual.parameter,stage.parameter.c[0])||!close(actual.parameterDerivative,stage.parameter.c[1]))fail();
   for(const name of ['base','fold','director'] as const){const jets=stage[name],coords=jets.map(x=>x.c[0]),prime=jets.map(x=>x.c[1]),suffix=name[0].toUpperCase()+name.slice(1);
    if(!vec(actual['normalized'+suffix],coords)||!vec(actual['normalized'+suffix+'Derivative'],prime)||!vec(actual[name],coords.map((x,k)=>x*L+(name==='director'?0:ref.origin[k])),L)||!vec(actual[name+'Derivative'],prime.map(x=>x*L),L))fail();}
   if(!record(g)||!keys(g,['normalizedPoints','points','EFG'])||[g.normalizedPoints,g.points,g.EFG].some(x=>!Array.isArray(x)||x.length!==widths.length))fail();
   widths.forEach((w,k)=>{const point=stage.base.map((x,n)=>x.c[0]+w*stage.director[n].c[0]),efg=metric(stage,w).map(x=>x*L*L),refScale=[Math.abs(efg[0]),Math.sqrt(Math.abs(efg[0]*efg[2])),Math.abs(efg[2])];
    if(!vec(g.normalizedPoints[k],point)||!vec(g.points[k],point.map((x,n)=>x*L+ref.origin[n]),L)||!vector(g.EFG[k],3)||!efg.every((x,n)=>close(g.EFG[k][n],x,refScale[n])))fail();});
  });});
 const domain=raw.domain,diagnostic=raw.diagnostics,cert=raw.certification;
 if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved','roundingModel','reason'])||typeof domain.certified!=='boolean'||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||
  !Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||domain.verifiedCells!==domain.cells.length||!Array.isArray(domain.unresolved)||domain.certified!==(domain.unresolved.length===0)||
  (domain.certified?domain.reason!==null:typeof domain.reason!=='string'))fail();
 const charts:number[][]=[];for(const cell of domain.cells){if(!record(cell)||!keys(cell,['start','end','normalizedDenominatorBounds'])||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||!Array.isArray(cell.normalizedDenominatorBounds)||cell.normalizedDenominatorBounds.length!==q.mirrors.length)fail();
  for(const [j,bounds] of cell.normalizedDenominatorBounds.entries()){if(!vector(bounds,2)||bounds[0]>bounds[1]||bounds[0]<=0&&bounds[1]>=0)fail();
   for(const s of [cell.start,(cell.start+cell.end)/2,cell.end]){const v=ref.evaluate(s).denominators[j].c[0];if(v<bounds[0]-2e-12*Math.abs(v)||v>bounds[1]+2e-12*Math.abs(v))fail();}}
  charts.push([cell.start,cell.end]);}
 for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();charts.push(pair);}
 charts.sort((a,b)=>a[0]-b[0]);if(!charts.length||!close(charts[0][0],q.parameterStart)||!close(charts.at(-1)![1],q.parameterEnd)||charts.some((r,i)=>i>0&&!close(charts[i-1][1],r[0])))fail();
 if(!record(diagnostic)||!keys(diagnostic,['validationNodes','maximumRelativeMetricDifference','maximumNormalizedMirrorPlaneResidual','maximumMirrorNormalSquaredLengthError','normalCompatibilityTolerance'])||diagnostic.validationNodes!==129||
  Object.keys(diagnostic).some(k=>!finite(diagnostic[k])||diagnostic[k]<0)||diagnostic.normalCompatibilityTolerance!==64*Number.EPSILON)fail();
 const normalError=Math.max(0,...ref.mirrors.map(m=>Math.abs(dot(m.normal,m.normal)-1))),normalCompatible=normalError<=64*Number.EPSILON;
 if(!close(diagnostic.maximumMirrorNormalSquaredLengthError,normalError,Math.max(normalError,Number.EPSILON)))fail();
 let maximumMetric=0;const auditNodes=new Set([...parameters,...Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128)]),auditWidths=new Set([...widths,(q.transverseStart+q.transverseEnd)/2]);
 for(const s of auditNodes){const stages=ref.evaluate(s).stages;for(const w of auditWidths){const original=metric(stages[0],w);for(const stage of stages.slice(1)){
  const actual=metric(stage,w),scales=[Math.max(Math.abs(original[0]),Math.abs(actual[0])),Math.sqrt(Math.max(Math.abs(original[0]),Math.abs(actual[0]))*Math.max(Math.abs(original[2]),Math.abs(actual[2]))),Math.max(Math.abs(original[2]),Math.abs(actual[2]))];
  maximumMetric=Math.max(maximumMetric,...actual.map((x,i)=>scales[i]>0?Math.abs(x-original[i])/scales[i]:0));}}}
 if(!finite(maximumMetric)||!close(diagnostic.maximumRelativeMetricDifference,maximumMetric)||cert.finiteMetricVerified!==(maximumMetric<=2e-8))fail();
 if(!record(cert)||!keys(cert,['literalOriginalSequenceEvaluated','sourceDomainCertified','mirrorNormalsCompatible','conditionalReflectionIsometryCertified','finiteMetricVerified','cutOrderVerified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'])||
  cert.literalOriginalSequenceEvaluated!==true||cert.sourceDomainCertified!==domain.certified||cert.mirrorNormalsCompatible!==normalCompatible||cert.conditionalReflectionIsometryCertified!==normalCompatible||
  cert.finiteMetricVerified!==(diagnostic.maximumRelativeMetricDifference<=2e-8)||['cutOrderVerified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'].some(k=>cert[k]!==false))fail();
 return raw as NativePlanarSequenceResult;
}
export async function fetchNativePlanarSequenceWhenIdle(input:unknown,signal?:AbortSignal):Promise<NativePlanarSequenceResult>{
 const q=validateNativePlanarSequenceQuery(input);while(true){signal?.throwIfAborted();try{return parseNativePlanarSequenceResult(await api('tessellation/curved-planar-sequence-generic',q,signal),q);}
  catch(e){if(!/已有镶嵌计算正在进行/.test((e as Error).message))throw e;await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(signal?.reason);},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},90);signal?.addEventListener('abort',stop,{once:true});});}}
}
