import {api} from './api';
import {compileGenericExpression,GenericTaylor as J} from './curvedGenericLinked';

export type GenericAcrossQuery={family:'curved-across-right';variant:'generic-native';mode:'2d'|'3d'|'both';
 flatCurve:[string,string];flatLeftRuling:[string,string];spaceCurve:[string,string,string];spaceLeftRuling:[string,string,string];
 foldAngleExpression:string;parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number;rulingSegments:number};
export type AcrossFields={c:number[];rL:number[];rR:number[];cPrime:number[];rLPrime:number[];rRPrime:number[];
 normalizedC:number[];normalizedRL:number[];normalizedRR:number[];normalizedCPrime:number[];normalizedRLPrime:number[];normalizedRRPrime:number[]};
export type AcrossRow={s:number;flat:AcrossFields|null;space:AcrossFields|null;branch:{sign:1|-1;cosine:number;sine:number;selector:number;denominator:number}};
export type AcrossGrid={s:number;side:'left'|'right';v:number;flat:number[]|null;space:number[]|null;normalizedFlat:number[]|null;normalizedSpace:number[]|null};
export type AcrossDomain={certified:boolean;evaluations:number;verifiedCells:number;intervals:{start:number;end:number}[];
 minimumAreaProjectionLowerBound:number|null;minimumBranchSelectorLowerBound:number|null;branchSign:1|-1;roundingModel:string;method:string;reason:string|null;
 coordinateNormalization:{flatOrigin:number[]|null;spaceOrigin:number[]|null;scale:number}};
export type GenericAcrossResult={family:'curved-across-right';query:GenericAcrossQuery;source:Record<string,any>;
 diagnostics:{validationNodes:number;maximumPairMetricDifference:number|null;maximumLeftDevelopabilityError:number|null;maximumRightDevelopabilityError:number|null;
 maximumRightUnitError:number;minimumSampleAreaRatio:number;pairStatus:'finite-numerical'|'incompatible'|'not-applicable';pairReason:string|null;parameterDomain:AcrossDomain};
 certification:Record<string,boolean|null>;sample:{rows:AcrossRow[];grid:AcrossGrid[][]}};
export const GENERIC_ACROSS_PRESET:GenericAcrossQuery={family:'curved-across-right',variant:'generic-native',mode:'both',
 flatCurve:['s','s^2/4'],flatLeftRuling:['0','1'],spaceCurve:['Sin[s]','s^2/4','1-Cos[s]'],spaceLeftRuling:['0','1','0'],
 foldAngleExpression:'2 ArcTan[2 Sqrt[1+s^2/4]]',parameterStart:.2,parameterEnd:1,leftWidth:.15,rightWidth:.15,segments:32,rulingSegments:8};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const keys=(x:Record<string,unknown>,a:string[])=>Object.keys(x).length===a.length&&a.every(k=>Object.hasOwn(x,k));
const close=(a:number,b:number,t=2e-8)=>Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b));
const dot=(a:number[],b:number[])=>a.reduce((r,x,i)=>r+x*b[i],0);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a:number[],b:number[],v:number)=>a.map((x,i)=>x+v*b[i]);
function fail():never{throw Error('一般跨右侧的原式、母线幅度、分支、导数、度量或完整有限带回读不一致。');}
const sumExact=(numbers:number[])=>{const partials:number[]=[];for(let x of numbers){let i=0;for(let y of partials){
 if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}partials.length=i;partials.push(x);}
 return partials.reduceRight((s,x)=>s+x,0);};

export function validateGenericAcrossQuery(raw:unknown):GenericAcrossQuery{
 if(!record(raw)||!keys(raw,Object.keys(GENERIC_ACROSS_PRESET))||raw.family!=='curved-across-right'||raw.variant!=='generic-native'||!['2d','3d','both'].includes(raw.mode))
  throw Error('一般跨右侧须为完整原源参数对象。');
 const q={...raw} as GenericAcrossQuery;
 for(const [key,n] of [['flatCurve',2],['flatLeftRuling',2],['spaceCurve',3],['spaceLeftRuling',3]] as const){
  if(!Array.isArray(q[key])||q[key].length!==n)throw Error('原曲线和左母线需完整二维或三维分量。');
  for(const source of q[key])compileGenericExpression(source,'s');q[key]=q[key].slice() as any;}
 compileGenericExpression(q.foldAngleExpression,'s');
 if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart< -10||q.parameterEnd>10||q.parameterEnd-q.parameterStart<.01-1e-12||q.parameterEnd-q.parameterStart>12)
  throw Error('共同 s 域须在 −10…10 内，长度 0.01–12。');
 if(!finite(q.leftWidth)||!finite(q.rightWidth)||q.leftWidth<=0||q.rightWidth<=0||q.leftWidth>1e6||q.rightWidth>1e6)throw Error('母线系数上限须在 0…10⁶ 内。');
 if(!Number.isInteger(q.segments)||q.segments<8||q.segments>128||!Number.isInteger(q.rulingSegments)||q.rulingSegments<2||q.rulingSegments>32)
  throw Error('显示纵向段须 8–128，横向段须 2–32。');
 return q;
}

const td=(a:J[],b:J[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:J[],b:J[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tc2=(a:J[],b:J[])=>a[0].mul(b[1]).sub(a[1].mul(b[0]));
const norm=(a:J[])=>td(a,a).sqrt();const scale=(a:J[],b:J|number)=>a.map(x=>x.mul(b));const add=(a:J[],b:J[])=>a.map((x,i)=>x.add(b[i]));
const value=(a:J[])=>a.map(x=>x.c[0]);

/** Direct, independent source Frenet → UL → UR derivative; no ODE or seed. */
export function makeGenericAcrossEvaluator(q:GenericAcrossQuery){
 const active=[q.mode!=='3d',q.mode!=='2d'],curves=[q.flatCurve,q.spaceCurve].map(g=>g.map(x=>compileGenericExpression(x,'s'))),
  left=[q.flatLeftRuling,q.spaceLeftRuling].map(g=>g.map(x=>compileGenericExpression(x,'s'))),gamma=compileGenericExpression(q.foldAngleExpression,'s'),
  initial=new J([q.parameterStart,1,0,0,0]),parts=curves.map((g,i)=>active[i]?g.map(f=>f.parts(initial)):null),
  origins=parts.map(g=>g?g.map(p=>sumExact(p.offsets)+p.dynamic.c[0]):null),L=Math.hypot(...parts[active[0]?0:1]!.map(p=>p.dynamic.c[1]));
 if(!finite(L)||L<=0)fail();const initialHalfSign=q.mode==='2d'?Math.sign(gamma(initial).div(2).tan().c[0]):null;
 const coords=(i:number,s:J)=>curves[i].map((f,k)=>{const p=f.parts(s),origin=parts[i]![k];
  return p.dynamic.sub(origin.dynamic.c[0]).add(sumExact([...p.offsets,...origin.offsets.map(x=>-x)])).div(L);});
 const evaluate=(s:number):AcrossRow=>{
  const u=new J([s,1,0,0,0]),result:any={s,flat:null,space:null},frames:any={};let cos!:J,sin!:J,selector!:J,denominator!:J,sign!:1|-1;
  for(let i=0;i<2;i++){
   if(!active[i])continue;
   const name=i?'space':'flat',c=coords(i,u),cp=c.map(x=>x.derivative()),speed=norm(cp),t=scale(cp,speed.inv()),rL=left[i].map(f=>f(u).div(L));
   frames[name]={c,cPrime:cp,rL,rLPrime:rL.map(x=>x.derivative())};
   if(i===0)frames.plane={t,l:[t[1].neg(),t[0]]};
   else{
    const tp=t.map(x=>x.derivative()),N=scale(tp,norm(tp).inv()),B=tc(t,N),txl=tc(t,rL),UL=scale(txl,norm(txl).inv()),LL=tc(UL,t),
     C=td(LL,N),S=td(UL,N),UR=add(scale(N,S.neg()),scale(B,C)),LR=add(scale(N,C),scale(B,S)),Up=UR.map(x=>x.derivative()),A=td(Up,t),Q=td(Up,LR),H=norm(Up);
    if(A.c[0]===0)fail();sign=Math.sign(A.c[0]) as 1|-1;cos=Q.div(H).mul(sign);sin=A.div(H).mul(sign);selector=A;denominator=H;
    const rR=scale(add(scale(t,cos),scale(LR,sin.neg())),1/L);frames[name].rR=rR;frames[name].rRPrime=rR.map(x=>x.derivative());
   }
  }
  if(q.mode==='2d'){
   const f=frames.flat,{t,l}=frames.plane,speed=norm(f.cPrime),cpp=f.cPrime.map((x:J)=>x.derivative()),g=tc2(f.cPrime,cpp).div(speed.mul(speed)),
    angle=gamma(u),h=angle.div(2).tan(),z=h.mul(td(t,f.rL)).div(td(l,f.rL)).sub(angle.derivative().div(g)),D=h.mul(h).add(z.mul(z)).sqrt();
   if(angle.c[0]===0||h.c[0]===0||Math.sign(h.c[0])!==initialHalfSign)fail();sign=Math.sign(angle.c[0]) as 1|-1;cos=z.div(D).mul(sign);sin=h.div(D).mul(Math.sign(h.c[0]));selector=angle;denominator=D;
  }
  if(active[0]){const {t,l}=frames.plane,rR=scale(add(scale(t,cos),scale(l,sin.neg())),1/L);frames.flat.rR=rR;frames.flat.rRPrime=rR.map(x=>x.derivative());}
  for(let i=0;i<2;i++){
   if(!active[i])continue;const name=i?'space':'flat',f=frames[name],fields:any={};
   for(const key of ['c','rL','rR','cPrime','rLPrime','rRPrime']){const n=value(f[key]);
    if(!n.every(finite))fail();fields['normalized'+key[0].toUpperCase()+key.slice(1)]=n;
    fields[key]=n.map((x,k)=>L*x+(key==='c'?origins[i]![k]:0));}
   result[name]=fields;
  }
  result.branch={sign,cosine:cos.c[0],sine:sin.c[0],selector:selector.c[0],denominator:denominator.c[0]};
  if(!Object.values(result.branch).every(finite)||result.branch.sine<=0)fail();return result;
 };
 return Object.assign(evaluate,{normalization:{flatOrigin:origins[0],spaceOrigin:origins[1],scale:L}});
}

export function inspectGenericAcrossRow(q:GenericAcrossQuery,row:AcrossRow,L:number){
 let metric=0,devL=0,devR=0,unit=0,minArea=Infinity;
 for(const name of ['flat','space'] as const){const f=row[name];if(!f)continue;
  const cp=f.normalizedCPrime;unit=Math.max(unit,Math.abs(Math.hypot(...f.normalizedRR)*L-1));
  for(const [key,prime,width] of [['normalizedRL','normalizedRLPrime',q.leftWidth],['normalizedRR','normalizedRRPrime',q.rightWidth]] as const){
   const r=f[key],rp=f[prime],a=name==='space'?cross(cp,r):[cp[0]*r[1]-cp[1]*r[0]],b=name==='space'?cross(rp,r):[rp[0]*r[1]-rp[1]*r[0]],
    b2=dot(b,b),at=b2?Math.min(width,Math.max(0,-dot(a,b)/b2)):0,area=Math.hypot(...mix(a,b,at)),den=Math.hypot(...cp)*Math.hypot(...r);
   if(area===0||name==='flat'&&a[0]*(a[0]+width*b[0])<0)fail();minArea=Math.min(minArea,area/Math.max(1,den));
   if(name==='space'){const dev=Math.abs(dot(a,rp))/Math.max(1,den*Math.hypot(...rp));if(key==='normalizedRL')devL=Math.max(devL,dev);else devR=Math.max(devR,dev);}
  }
 }
 if(q.mode==='both')for(const [key,prime,width] of [['normalizedRL','normalizedRLPrime',q.leftWidth],['normalizedRR','normalizedRRPrime',q.rightWidth]] as const)
  for(const v of [0,width/2,width]){const pair=([row.flat!,row.space!]).map(f=>{const ds=mix(f.normalizedCPrime,f[prime],v),r=f[key].map(x=>x*L);return [dot(ds,ds),dot(ds,r),dot(r,r)];});
   metric=Math.max(metric,...pair[0].map((x,i)=>Math.abs(x-pair[1][i])/Math.max(1,...pair.flat().map(Math.abs))));}
 return {metric,devL,devR,unit,minArea};
}

/** Source recomputation verifies finite data; the backend interval claim is labelled separately. */
export function parseGenericAcrossResult(raw:unknown,requested:unknown):GenericAcrossResult{
 const q=validateGenericAcrossQuery(requested);
 if(!record(raw)||!keys(raw,['family','query','source','diagnostics','certification','sample'])||raw.family!==q.family||
  JSON.stringify(validateGenericAcrossQuery(raw.query))!==JSON.stringify(q)||!record(raw.source)||!record(raw.diagnostics)||!record(raw.certification)||!record(raw.sample)||
  !keys(raw.sample,['rows','grid'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==q.segments+1||!Array.isArray(raw.sample.grid)||raw.sample.grid.length!==q.segments+1)fail();
 const source=raw.source,d=raw.diagnostics,cert=raw.certification,domain=d.parameterDomain,
  cells={ '2d':[3983,3986],'3d':[3991,3994],both:[3998,4001]}[q.mode];
 if(!keys(source,['notebookCells','savedNumericalOut','method','interpolationContract','leftAmplitudeContract','widthContract'])||JSON.stringify(source.notebookCells)!==JSON.stringify(cells)||
  source.savedNumericalOut!==false||source.method!=='whitelist-AST/Taylor/original-AcrossRight-algebra'||source.interpolationContract!=='direct-source-derivatives/not-Wolfram-FunctionInterpolationAlt'||
  source.leftAmplitudeContract!=='original-rL-returned/only-T-cross-rrL-normalized'||source.widthContract!=='positive-coefficient-v/each-side-0-to-width'||
  !keys(d,['validationNodes','maximumPairMetricDifference','maximumLeftDevelopabilityError','maximumRightDevelopabilityError','maximumRightUnitError','minimumSampleAreaRatio','pairStatus','pairReason','parameterDomain'])||d.validationNodes!==129||
  !record(domain)||!keys(domain,['certified','evaluations','verifiedCells','intervals','minimumAreaProjectionLowerBound','minimumBranchSelectorLowerBound','branchSign','roundingModel','method','reason','coordinateNormalization'])||
  typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>512||!Number.isInteger(domain.verifiedCells)||domain.verifiedCells<0||domain.verifiedCells>domain.evaluations||
  domain.branchSign!==1&&domain.branchSign!==-1||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.method!=='outward-Taylor/source-branch/affine-width-area-projection'||
  (domain.certified?domain.reason!==null:typeof domain.reason!=='string'||!domain.reason)||!Array.isArray(domain.intervals)||domain.intervals.length!==domain.verifiedCells)fail();
 for(const key of ['minimumAreaProjectionLowerBound','minimumBranchSelectorLowerBound'])if(domain.certified?!finite(domain[key])||domain[key]<=0:domain[key]!==null)fail();
 for(const [i,cell] of domain.intervals.entries())if(!record(cell)||!keys(cell,['start','end'])||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
  cell.start<q.parameterStart-1e-12||cell.end>q.parameterEnd+1e-12||i&&cell.start<domain.intervals[i-1].end-1e-12||domain.certified&&!close(cell.start,i?domain.intervals[i-1].end:q.parameterStart,1e-12))fail();
 if(domain.certified&&(!domain.intervals.length||!close(domain.intervals.at(-1).end,q.parameterEnd,1e-12)||domain.evaluations!==2*domain.verifiedCells-1))fail();
 const evaluate=makeGenericAcrossEvaluator(q),normalization=domain.coordinateNormalization,L=evaluate.normalization.scale;
 if(!record(normalization)||!keys(normalization,['flatOrigin','spaceOrigin','scale'])||!finite(normalization.scale)||normalization.scale<=0||!close(normalization.scale/L,1,2e-12))fail();
 for(const [key,n] of [['flatOrigin',2],['spaceOrigin',3]] as const){const expected=evaluate.normalization[key];
  if(expected===null?normalization[key]!==null:!vector(normalization[key],n)||normalization[key].some((x:number,k:number)=>Math.abs(x-expected[k])>Math.max(L*2e-12,4*Number.EPSILON*Math.abs(x))))fail();}
 const fields=['c','rL','rR','cPrime','rLPrime','rRPrime','normalizedC','normalizedRL','normalizedRR','normalizedCPrime','normalizedRLPrime','normalizedRRPrime'];
 const inspectRow=(row:unknown,expected:AcrossRow)=>{
  if(!record(row)||!keys(row,['s','flat','space','branch'])||!finite(row.s)||!close(row.s,expected.s,1e-12)||!record(row.branch)||!keys(row.branch,['sign','cosine','sine','selector','denominator']))fail();
  for(const key of ['sign','cosine','sine','selector','denominator'] as const)if(!finite(row.branch[key])||!close(row.branch[key],expected.branch[key],2e-9)||key==='sign'&&row.branch[key]!==domain.branchSign)fail();
  if(row.branch.sine<=0||row.branch.denominator<=0)fail();
  for(const [name,n] of [['flat',2],['space',3]] as const){const f=row[name],e=expected[name];if(e===null){if(f!==null)fail();continue;}
   if(!record(f)||!keys(f,fields))fail();for(const key of fields){const x=f[key],v=e[key as keyof AcrossFields];if(!vector(x,n))fail();
    for(let k=0;k<n;k++){const absolute=key==='c'?Math.max(L*2e-8,4*Number.EPSILON*Math.abs(v[k])):key.startsWith('normalized')?2e-8*Math.max(1,Math.abs(v[k])):2e-8*Math.max(L,Math.abs(v[k]));if(Math.abs(x[k]-v[k])>absolute)fail();}}
  }
  return row as AcrossRow;
 };
 let maximum={metric:0,devL:0,devR:0,unit:0,minArea:Infinity},minimumSelector=Infinity,minimumProjection=Infinity;
 const start=evaluate(q.parameterStart),axes:Record<string,number[]>={};
 for(const name of ['flat','space'] as const){const f=start[name];if(!f)continue;for(const key of ['normalizedRL','normalizedRR'] as const){
  const a=name==='space'?cross(f.normalizedCPrime,f[key]):[f.normalizedCPrime[0]*f[key][1]-f.normalizedCPrime[1]*f[key][0]],n=Math.hypot(...a);if(n===0)fail();axes[name+key]=a.map(x=>x/n);}}
 const inspect=(r:AcrossRow)=>{if(r.branch.sign!==domain.branchSign)fail();const p=inspectGenericAcrossRow(q,r,L);
  minimumSelector=Math.min(minimumSelector,r.branch.selector*domain.branchSign);
  for(const name of ['flat','space'] as const){const f=r[name];if(!f)continue;
   for(const [key,prime,width] of [['normalizedRL','normalizedRLPrime',q.leftWidth],['normalizedRR','normalizedRRPrime',q.rightWidth]] as const)
    for(const v of [0,width]){const ds=mix(f.normalizedCPrime,f[prime],v),a=name==='space'?cross(ds,f[key]):[ds[0]*f[key][1]-ds[1]*f[key][0]];
     minimumProjection=Math.min(minimumProjection,dot(a,axes[name+key]));}}
  for(const key of ['metric','devL','devR','unit'] as const)maximum[key]=Math.max(maximum[key],p[key]);maximum.minArea=Math.min(maximum.minArea,p.minArea);};
 for(let i=0;i<129;i++)inspect(evaluate(q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128));
 for(let i=0;i<=q.segments;i++){
  const s=q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments,expected=evaluate(s),row=inspectRow(raw.sample.rows[i],expected);inspect(row);
  const g=raw.sample.grid[i];if(!Array.isArray(g)||g.length!==2*(q.rulingSegments+1))fail();
  for(let j=0;j<g.length;j++){
   const side=j<=q.rulingSegments?'left':'right',v=(side==='left'?q.leftWidth:q.rightWidth)*(j%(q.rulingSegments+1))/q.rulingSegments,p=g[j];
   if(!record(p)||!keys(p,['s','side','v','flat','space','normalizedFlat','normalizedSpace'])||!finite(p.s)||!finite(p.v)||!close(p.s,s,1e-12)||p.side!==side||!close(p.v,v,1e-12))fail();
   for(const [name,n] of [['flat',2],['space',3]] as const){const f=expected[name],nk='normalized'+name[0].toUpperCase()+name.slice(1);if(f===null){if(p[name]!==null||p[nk]!==null)fail();continue;}
    if(!vector(p[name],n)||!vector(p[nk],n))fail();const nv=mix(f.normalizedC,side==='left'?f.normalizedRL:f.normalizedRR,v),origin=evaluate.normalization[name==='flat'?'flatOrigin':'spaceOrigin']!;
    for(let k=0;k<n;k++){const world=origin[k]+L*nv[k];if(!close(p[nk][k],nv[k])||Math.abs(p[name][k]-world)>Math.max(L*2e-8,4*Number.EPSILON*Math.abs(world)))fail();}}
  }
 }
 for(const [key,v] of [['maximumPairMetricDifference',q.mode==='both'?maximum.metric:null],['maximumLeftDevelopabilityError',q.mode!=='2d'?maximum.devL:null],
  ['maximumRightDevelopabilityError',q.mode!=='2d'?maximum.devR:null],['maximumRightUnitError',maximum.unit],['minimumSampleAreaRatio',maximum.minArea]] as const)
  if(v===null?d[key]!==null:!finite(d[key])||d[key]<0||!close(d[key],v,2e-9))fail();
 if(domain.certified&&(minimumSelector<=0||minimumProjection<=0||domain.minimumBranchSelectorLowerBound>minimumSelector+2e-10*Math.abs(minimumSelector)||
  domain.minimumAreaProjectionLowerBound>minimumProjection+2e-10*Math.abs(minimumProjection)))fail();
 const compatible=q.mode==='both'?maximum.metric<=2e-8:null;
 if(d.pairStatus!==(compatible?'finite-numerical':q.mode==='both'?'incompatible':'not-applicable')||d.pairReason!==(compatible||q.mode!=='both'?null:'supplied left pair or source right pair has unequal EFG; original inputs retained'))fail();
 const flags={finiteSourceReadbackVerified:true,finitePairMetricVerified:compatible,fullIntervalRegularityCertified:domain.certified,continuousSourceBranchCertified:domain.certified,
  analyticPairIsometry:false,fullIntervalPairIsometryCertified:false,leftInputDevelopabilityVerifiedAtNodes:q.mode!=='2d'?maximum.devL<=2e-8:null,
  planarPaperInjectivityCertified:false,selfCollisionChecked:false,continuousFoldPathChecked:false,exactStraightCreaseFOLD:false,adoptableCreasePattern:false};
 if(!keys(cert,Object.keys(flags))||Object.entries(flags).some(([k,v])=>cert[k]!==v))fail();
 return raw as GenericAcrossResult;
}

export async function fetchGenericAcross(q:GenericAcrossQuery,signal?:AbortSignal):Promise<GenericAcrossResult>{
 const query=validateGenericAcrossQuery(q),raw=await api('tessellation/curved-generic-across-right',query,signal);
 return parseGenericAcrossResult(raw,query);
}
