import {api} from './api';
import {validateNDSolveStepOptions,type NDSolveStepOptions} from './curvedNDSolveOptions';
import {validateLinkedFirst3DIntegration,replayLinkedCircleFirst,linkedPointMatches,type LinkedFirst3DIntegration} from './curvedLinkedNDSolveOptions';


export type LinkedCommonQuery={family:'linked-concentric-first-band';variant:'common-parameter';
  radii:number[];q1Harmonics:number[];firstFoldAngleDeg:number;
  parameterStart:number;parameterEnd:number;segments:number;ndsolveOptions?:NDSolveStepOptions};
export type LinkedCommonRow={s:number;qValues:number[];qDerivatives:number[];foldAnglesDeg:number[];
  flatCurves:number[][];flatDerivatives:number[][];foldedCurves:number[][];foldedDerivatives:number[][]};
export type LinkedCommonResult={family:'linked-concentric-common-parameter';query:LinkedCommonQuery;first3DIntegration?:LinkedFirst3DIntegration;
  source:{notebookRows:number[];savedNumericalOut:false;savedPhysicalInputsPreserved:boolean;
    parameterContract:string;formulaCorrections:string[];method:string};
  diagnostics:{validationNodes:number;maxFrameGramError:number;maxMetricError:number;
    maxDevelopabilityError:number;maxGeodesicError:number;minimumSampledParameterSpeed:number;
    minimumSampledTransverseMargin:number;endpointSpatialSeparation:number;
    parameterDomain:{certified:true;evaluations:number;verifiedCells:number;roundingModel:string;
      minimumSpeedLowerBound:number;minimumTransverseLowerBound:number;
      planarAngularSpanUpperBound:number;planarPaperInjective:true;reason:string}};
  certification:{bandCount:number;singleCommonParameter:true;isometryIdentitiesApplied:true;
    finiteNumericalMetricVerified:true;fullIntervalRegularityCertified:true;
    planarPaperInjectivityCertified:true;allBandsAnalyticLocalIsometry:true;
    globalBoundaryInjectivityChecked:false;originalSavedFormulaReplayed:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;selfCollisionChecked:false;
    continuousFoldPathChecked:false};sample:{rows:LinkedCommonRow[]}};

export const LINKED_COMMON_PRESET:LinkedCommonQuery={family:'linked-concentric-first-band',
  variant:'common-parameter',radii:[1,1.1,1.2,1.3,1.4],q1Harmonics:[.1],
  firstFoldAngleDeg:120,parameterStart:0,parameterEnd:Math.PI,segments:32};
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const exactKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const vector=(v:unknown,n?:number):v is number[]=>Array.isArray(v)&&(n===undefined||v.length===n)&&v.every(finite);
const close=(a:number,b:number,epsilon=2e-7)=>Math.abs(a-b)<=epsilon*Math.max(1,Math.abs(a),Math.abs(b));
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]);
const mix=(a:number[],b:number[],v:number)=>a.map((x,i)=>(1-v)*x+v*b[i]);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=(a:number[])=>{const n=Math.hypot(...a);if(!Number.isFinite(n)||n<=0)fail();return a.map(x=>x/n);};
function fail():never{throw Error('共同参数关联多带的参数、来源或度量回读不一致。');}

/** Truncated Taylor arithmetic verifies parameter transport independently in
 * the client; the server's claimed q_i and angles are not accepted on trust. */
class Taylor{
  constructor(readonly c:number[]){}
  constant(v:number){return new Taylor([v,...this.c.slice(1).map(()=>0)]);}
  other(v:number|Taylor){return typeof v==='number'?this.constant(v):v;}
  add(v:number|Taylor){const b=this.other(v);return new Taylor(this.c.slice(0,b.c.length).map((x,i)=>x+b.c[i]));}
  neg(){return new Taylor(this.c.map(x=>-x));}
  sub(v:number|Taylor){return this.add(this.other(v).neg());}
  mul(v:number|Taylor){const b=this.other(v),n=Math.min(this.c.length,b.c.length);
    return new Taylor(Array.from({length:n},(_,k)=>this.c.slice(0,k+1).reduce((s,x,i)=>s+x*b.c[k-i],0)));}
  inverse(){const c=[1/this.c[0]];for(let k=1;k<this.c.length;k++)c.push(-this.c.slice(1,k+1).reduce((s,x,i)=>s+x*c[k-i-1],0)/this.c[0]);return new Taylor(c);}
  div(v:number|Taylor){return this.mul(this.other(v).inverse());}
  derivative(){return new Taylor(this.c.slice(1).map((x,i)=>x*(i+1)));}
  sincos(){const sn=[Math.sin(this.c[0])],cs=[Math.cos(this.c[0])];
    for(let k=1;k<this.c.length;k++){
      sn.push(this.c.slice(1,k+1).reduce((s,x,i)=>s+(i+1)*x*cs[k-i-1],0)/k);
      cs.push(-this.c.slice(1,k+1).reduce((s,x,i)=>s+(i+1)*x*sn[k-i-1],0)/k);
    }return [new Taylor(sn),new Taylor(cs)] as const;}
  tan(){const [s,c]=this.sincos();return s.div(c);}
  atan(){const d=this.derivative().div(this.mul(this).add(1));
    return new Taylor([Math.atan(this.c[0]),...d.c.map((x,i)=>x/(i+1))]);}
  sqrt(){const c=[Math.sqrt(this.c[0])];for(let k=1;k<this.c.length;k++)
    c.push((this.c[k]-c.slice(1,k).reduce((s,x,i)=>s+x*c[k-i-1],0))/(2*c[0]));return new Taylor(c);}
}
export function linkedCommonParametersAt(query:LinkedCommonQuery,s:number){
  const bands=query.radii.length-1,order=2*bands+2,u=new Taylor([s,1,...Array(order-1).fill(0)]);
  let perturb=u.constant(0);query.q1Harmonics.forEach((a,k)=>{perturb=perturb.add(u.mul(2*(k+1)).sincos()[0].mul(a));});
  const dev=[u.constant(0),perturb],q=[u,u.add(perturb)],gamma=[u.constant(query.firstFoldAngleDeg*Math.PI/180)];
  for(let i=0;i<bands-1;i++){
    const [r0,r1,r2]=query.radii.slice(i,i+3),[sn,cs]=dev[i+1].sub(dev[i]).sincos();
    const angle=q[i].derivative().div(q[i+1].derivative()).mul(cs.mul(-r0).add(r1).div(cs.mul(r1).sub(r0)))
      .mul(gamma[i].div(2).tan()).atan().mul(-2);gamma.push(angle);
    const previous=sn.mul(-r0).div(cs.mul(-r0).add(r1));
    const target=angle.derivative().div(q[i+1].derivative().mul(angle.div(2).tan())).sub(previous);
    const half=target.mul(r1-r2).div(target.mul(target).mul(r2*r2-r1*r1).add(r2*r2).sqrt().add(r2));
    dev.push(dev[i+1].add(half.atan().mul(2)));q.push(u.add(dev.at(-1)!));
  }
  return {qValues:q.map(x=>x.c[0]),qDerivatives:q.map(x=>x.c[1]),foldAnglesDeg:gamma.map(x=>x.c[0]*180/Math.PI)};
}

export function validateLinkedCommonQuery(raw:unknown):LinkedCommonQuery{
  if(!isRecord(raw)||raw.family!==LINKED_COMMON_PRESET.family||raw.variant!=='common-parameter'||
    Object.keys(raw).some(k=>k!=='ndsolveOptions'&&!Object.hasOwn(LINKED_COMMON_PRESET,k)))
    throw Error('共同参数关联多带类型或字段无效。');
  const q={...LINKED_COMMON_PRESET,...raw},r=q.radii,h=q.q1Harmonics;
  if(!vector(r)||r.length<3||r.length>6||r.some((v,i)=>v<.2||v>10||i>0&&v-r[i-1]<.02))
    throw Error('半径需为 3–6 个递增数，范围 0.2–10、间隔至少 0.02。');
  if(!vector(h)||h.length<1||h.length>3||h.some(v=>Math.abs(v)>.2)||
    h.reduce((s,v,i)=>s+2*(i+1)*Math.abs(v),0)>.75)
    throw Error('扰动为 1–3 个正弦系数，绝对值≤0.2、导数扰动≤0.75。');
  if(!finite(q.firstFoldAngleDeg)||Math.abs(q.firstFoldAngleDeg)<5||Math.abs(q.firstFoldAngleDeg)>170)
    throw Error('初始折角绝对值需为 5°–170°。');
  if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart<0||q.parameterEnd>Math.PI||q.parameterEnd-q.parameterStart<.05)
    throw Error('共同参数区间需在 0–π 内，长度至少 0.05。');
  if(!finite(q.segments)||!Number.isInteger(q.segments)||q.segments<8||q.segments>128)
    throw Error('采样段数需为 8–128 的整数。');
  if(h.reduce((s,v)=>s+Math.abs(v),0)>=Math.acos(r[0]/r[1])-.01)
    throw Error('扰动使首带母线失去横向正则性。');
  return {...q,radii:r.slice(),q1Harmonics:h.slice(),...(Object.hasOwn(q,'ndsolveOptions')?{ndsolveOptions:validateNDSolveStepOptions(q.ndsolveOptions,q.parameterEnd-q.parameterStart)}:{})} as LinkedCommonQuery;
}

export function parseLinkedCommonResult(raw:unknown,requested?:LinkedCommonQuery):LinkedCommonResult{
  if(!isRecord(raw)||!exactKeys(raw,['family','query','source','diagnostics','certification','sample',...(Object.hasOwn(raw,'first3DIntegration')?['first3DIntegration']:[])])||
    raw.family!=='linked-concentric-common-parameter'||!isRecord(raw.query)||!isRecord(raw.source)||
    !isRecord(raw.diagnostics)||!isRecord(raw.certification)||!isRecord(raw.sample))fail();
  const q=validateLinkedCommonQuery(raw.query);
  if(!exactKeys(raw.query,[...Object.keys(LINKED_COMMON_PRESET),...(q.ndsolveOptions?['ndsolveOptions']:[])])||requested&&JSON.stringify(q)!==JSON.stringify(validateLinkedCommonQuery(requested)))fail();
  const source=raw.source,cert=raw.certification,d=raw.diagnostics,bands=q.radii.length-1;
  const physical=JSON.stringify(q.radii)===JSON.stringify(LINKED_COMMON_PRESET.radii)&&
    JSON.stringify(q.q1Harmonics)===JSON.stringify([.1])&&q.firstFoldAngleDeg===120&&q.parameterStart===0&&q.parameterEnd===Math.PI;
  if(!exactKeys(source,['notebookRows','savedNumericalOut','savedPhysicalInputsPreserved','parameterContract','formulaCorrections','method'])||
    JSON.stringify(source.notebookRows)!==JSON.stringify([338484,340340])||source.savedNumericalOut!==false||
    source.savedPhysicalInputsPreserved!==physical||source.parameterContract!=='native-curves-composed-once/common-s'||
    JSON.stringify(source.formulaCorrections)!==JSON.stringify(['geodesic-curvature-ratio','common-parameter-angle-derivative','composed-tangent-frame'])||
    source.method!=='automatic-taylor-jet/central-analytic-root/Darboux-integration')fail();
  const yes=['singleCommonParameter','isometryIdentitiesApplied','finiteNumericalMetricVerified',
    'fullIntervalRegularityCertified','planarPaperInjectivityCertified','allBandsAnalyticLocalIsometry'];
  const no=['globalBoundaryInjectivityChecked','originalSavedFormulaReplayed','exactStraightCreaseFOLD',
    'adoptableCreasePattern','selfCollisionChecked','continuousFoldPathChecked'];
  if(!exactKeys(cert,['bandCount',...yes,...no])||cert.bandCount!==bands||yes.some(k=>cert[k]!==true)||no.some(k=>cert[k]!==false))fail();
  if(!exactKeys(d,['validationNodes','maxFrameGramError','maxMetricError','maxDevelopabilityError',
    'maxGeodesicError','minimumSampledParameterSpeed','minimumSampledTransverseMargin','endpointSpatialSeparation','parameterDomain'])||
    d.validationNodes!==257||!isRecord(d.parameterDomain))fail();
  const scale=Math.max(...q.radii),domain=d.parameterDomain;
  for(const [key,limit] of [['maxFrameGramError',2e-7],['maxMetricError',scale*scale*2e-7],
    ['maxDevelopabilityError',scale*2e-7],['maxGeodesicError',2e-7]] as const)
    if(!finite(d[key])||d[key]<0||d[key]>limit)fail();
  if(!finite(d.minimumSampledParameterSpeed)||d.minimumSampledParameterSpeed<=.02||
    !finite(d.minimumSampledTransverseMargin)||d.minimumSampledTransverseMargin<=1e-5||
    !finite(d.endpointSpatialSeparation)||d.endpointSpatialSeparation<0)fail();
  if(!exactKeys(domain,['certified','evaluations','verifiedCells','roundingModel','minimumSpeedLowerBound',
    'minimumTransverseLowerBound','planarAngularSpanUpperBound','planarPaperInjective','reason'])||
    domain.certified!==true||domain.planarPaperInjective!==true||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||
    !finite(domain.evaluations)||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>4096||
    domain.verifiedCells!==(domain.evaluations+1)/2||
    !finite(domain.minimumSpeedLowerBound)||domain.minimumSpeedLowerBound<=.01||domain.minimumSpeedLowerBound>d.minimumSampledParameterSpeed||
    !finite(domain.minimumTransverseLowerBound)||domain.minimumTransverseLowerBound<=1e-6||domain.minimumTransverseLowerBound>d.minimumSampledTransverseMargin||
    !finite(domain.planarAngularSpanUpperBound)||domain.planarAngularSpanUpperBound<=0||domain.planarAngularSpanUpperBound>=2*Math.PI-.05||
    domain.reason!=='outward-rounded interval Taylor evaluation covers complete parameter interval')fail();
  if(!exactKeys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==q.segments+1)fail();
  let minSpeed=Infinity,minTransverse=Infinity,maxMetric=0;
  for(const [i,row] of raw.sample.rows.entries()){
    if(!isRecord(row)||!exactKeys(row,['s','qValues','qDerivatives','foldAnglesDeg','flatCurves','flatDerivatives','foldedCurves','foldedDerivatives'])||
      !finite(row.s)||!close(row.s,q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments,1e-12)||
      !vector(row.qValues,bands+1)||!vector(row.qDerivatives,bands+1)||!vector(row.foldAnglesDeg,bands)||
      ['flatCurves','flatDerivatives','foldedCurves','foldedDerivatives'].some(k=>!Array.isArray(row[k])||
        row[k].length!==bands+1||!row[k].every((p:unknown)=>vector(p,k.startsWith('flat')?2:3))))fail();
    const values=row.qValues as number[],speed=row.qDerivatives as number[],s=row.s as number;
    const expected=linkedCommonParametersAt(q,s);
    if(values.some((v,j)=>!close(v,expected.qValues[j],2e-10))||
      speed.some((v,j)=>!close(v,expected.qDerivatives[j],2e-9))||
      (row.foldAnglesDeg as number[]).some((v,j)=>!close(v,expected.foldAnglesDeg[j],2e-9)))fail();
    const planar=row.flatCurves as number[][],pd=row.flatDerivatives as number[][],
      spatial=row.foldedCurves as number[][],sd=row.foldedDerivatives as number[][];
    if(!close(values[0],s,1e-12)||!close(speed[0],1,1e-12)||
      !close(values[1],s+q.q1Harmonics.reduce((sum,v,k)=>sum+v*Math.sin(2*(k+1)*s),0),1e-12)||
      !close(speed[1],1+q.q1Harmonics.reduce((sum,v,k)=>sum+2*(k+1)*v*Math.cos(2*(k+1)*s),0),1e-12)||
      !close((row.foldAnglesDeg as number[])[0],q.firstFoldAngleDeg,1e-12))fail();
    for(let j=0;j<=bands;j++){
      if(speed[j]<=.02)fail();minSpeed=Math.min(minSpeed,speed[j]);
      if(!close(planar[j][0],q.radii[j]*Math.cos(values[j]),1e-10)||!close(planar[j][1],q.radii[j]*Math.sin(values[j]),1e-10)||
        !close(pd[j][0],-q.radii[j]*speed[j]*Math.sin(values[j]),1e-10)||!close(pd[j][1],q.radii[j]*speed[j]*Math.cos(values[j]),1e-10))fail();
    }
    for(let j=0;j<bands;j++){
      minTransverse=Math.min(minTransverse,q.radii[j+1]*Math.cos(values[j+1]-values[j])-q.radii[j]);
      for(const v of [0,.25,.5,.75,1]){
        const a=mix(pd[j],pd[j+1],v),b=sub(planar[j+1],planar[j]),c=mix(sd[j],sd[j+1],v),e=sub(spatial[j+1],spatial[j]);
        maxMetric=Math.max(maxMetric,Math.abs(dot(a,a)-dot(c,c)),Math.abs(dot(a,b)-dot(c,e)),Math.abs(dot(b,b)-dot(e,e)));
      }
    }
  }
  // Intrinsic EFG also accepts a completely flat spatial picture. Check the
  // actual signed dihedral from incoming/outgoing ruling plane normals.
  for(const row of raw.sample.rows as LinkedCommonRow[])for(let j=1;j<bands;j++){
    const spatial=row.foldedCurves,t=normalize(row.foldedDerivatives[j]),
      incoming=sub(spatial[j],spatial[j-1]),outgoing=sub(spatial[j+1],spatial[j]);
    const nl=normalize(cross(t,incoming)).map(x=>-x),nr=normalize(cross(t,outgoing)).map(x=>-x),
      ll=cross(nl,t),lr=cross(nr,t),angle=Math.atan2(-dot(lr,nl),dot(lr,ll))*180/Math.PI;
    if(!close(angle,row.foldAnglesDeg[j],2e-7))fail();
  }
  if(maxMetric>scale*scale*2e-7||maxMetric>(d.maxMetricError as number)+1e-10*scale*scale||
    minSpeed<(d.minimumSampledParameterSpeed as number)-1e-10||minTransverse<(d.minimumSampledTransverseMargin as number)-1e-10)fail();
  const rows=raw.sample.rows as LinkedCommonRow[],angular=Math.max(...rows.flatMap(r=>r.qValues))-Math.min(...rows.flatMap(r=>r.qValues));
  for(let j=0;j<2;j++)if(rows[0].foldedCurves[j].some((x,k)=>!close(x,k===2?0:rows[0].flatCurves[j][k],1e-10))||
    rows[0].foldedDerivatives[j].some((x,k)=>!close(x,k===2?0:rows[0].flatDerivatives[j][k],1e-10)))fail();
  if(angular>(domain.planarAngularSpanUpperBound as number)+1e-12||
    !close(Math.max(...rows[0].foldedCurves.map((p,i)=>Math.hypot(...sub(p,rows.at(-1)!.foldedCurves[i])))),d.endpointSpatialSeparation as number,1e-10))fail();
  if(!!q.ndsolveOptions!==Object.hasOwn(raw,'first3DIntegration'))fail();
  if(q.ndsolveOptions){const replay=replayLinkedCircleFirst(rows.map(r=>r.s),q.radii,q.q1Harmonics,q.firstFoldAngleDeg,q.parameterStart);
    if(!validateLinkedFirst3DIntegration(raw.first3DIntegration,q.ndsolveOptions,q.parameterStart,q.parameterEnd,replay.initial))fail();
    for(const row of rows){const y=replay.at(row.s);if(!linkedPointMatches(row.foldedCurves[0],y.slice(0,3))||!linkedPointMatches(row.foldedDerivatives[0],y.slice(3,6).map(x=>q.radii[0]*x)))fail();}}
  return raw as LinkedCommonResult;
}

export async function fetchLinkedCommon(value:unknown,signal?:AbortSignal){
  const query=validateLinkedCommonQuery(value);
  return parseLinkedCommonResult(await api('tessellation/curved-linked-first-band',query,signal),query);
}
