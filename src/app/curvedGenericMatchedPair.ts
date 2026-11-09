import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type GenericMatchedQuery={family:'curved-matched-pair';variant:'generic-native';
  flatCurve:[string,string];spaceCurve:[string,string,string];psi:1|-1;sigma:1|-1;
  parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;
  segments:number;rulingSegments:number};
export type GenericMatchedRow={s:number;c:number[];d:number[];cc:number[];dd:number[];
  cPrime:number[];dPrime:number[];ccPrime:number[];ddPrime:number[];
  normalizedC:number[];normalizedD:number[];normalizedCC:number[];normalizedDD:number[];
  normalizedCPrime:number[];normalizedDPrime:number[];normalizedCCPrime:number[];normalizedDDPrime:number[]};
export type GenericMatchedGridPoint={s:number;w:number;flat:number[];space:number[];normalizedFlat:number[];normalizedSpace:number[]};
export type GenericMatchedDomain={certified:boolean;evaluations:number;verifiedCells:number;intervals:{start:number;end:number}[];
  minimumSpeedLowerBound:number|null;minimumCurvatureLowerBound:number|null;minimumCurvatureGapLowerBound:number|null;
  minimumUDerivativeLowerBound:number|null;minimumJacobianLowerBound:number|null;jacobianOrientation:1|-1;
  roundingModel:string;reason:string|null;planarPaperInjective:boolean;minimumPaperSymmetricDeterminantLowerBound:number|null;
  paperMethod:string;paperAxes:number[][];coordinateNormalization:{flatOrigin:number[];spaceOrigin:number[];scale:number}};
export type GenericMatchedResult={family:'curved-matched-pair';query:GenericMatchedQuery;
  source:{notebookCells:number[];savedExampleCells:number[];savedNumericalOut:false;method:string;parameterContract:string;interpolationContract:string};
  diagnostics:{validationNodes:number;maximumFrameError:number;maximumMetricDifference:number;maximumDevelopabilityError:number;
    maximumSpeedSquareDifference:number;speedEquality:{status:'analytic'|'numerical'|'unknown';method:string;analyticIdentity:boolean;
      maximumRelativeSquareDifferenceUpperBound:number|null;tolerance:number};parameterDomain:GenericMatchedDomain};
  certification:Record<string,boolean>;
  sample:{rows:GenericMatchedRow[];grid:GenericMatchedGridPoint[][]}};

export const GENERIC_MATCHED_PRESET:GenericMatchedQuery={family:'curved-matched-pair',variant:'generic-native',
  flatCurve:['2-4 Log[1+s^2/16]','8 ArcTan[s/4]-s'],
  spaceCurve:['0.5+0.5 Cos[4s/Sqrt[5]]','Sin[4s/Sqrt[5]]/Sqrt[5]+s/5','1-Sin[4s/Sqrt[5]]/(2 Sqrt[5])+2s/5'],
  psi:1,sigma:1,parameterStart:0,parameterEnd:Math.PI,transverseStart:-1,transverseEnd:1,segments:32,rulingSegments:8};
export const GENERIC_MATCHED_CIRCLE_QUERY:GenericMatchedQuery={...GENERIC_MATCHED_PRESET,
  flatCurve:['2 Cos[s/2]','2 Sin[s/2]'],spaceCurve:['Cos[s]','Sin[s]','1']};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const exactKeys=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const close=(a:number,b:number,tolerance=2e-8)=>Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const mix=(a:number[],b:number[],w:number)=>a.map((x,i)=>x+w*b[i]);
function fail():never{throw Error('一般匹配曲线的来源、分支、导数、有限带或度量回读不一致。');}
const sumExact=(numbers:number[])=>{const partials:number[]=[];for(let x of numbers){let i=0;for(let y of partials){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}partials.length=i;partials.push(x);
  }return partials.reduceRight((sum,x)=>sum+x,0);};

export function validateGenericMatchedQuery(raw:unknown):GenericMatchedQuery{
  if(!record(raw)||raw.family!=='curved-matched-pair'||raw.variant!=='generic-native'||!exactKeys(raw,Object.keys(GENERIC_MATCHED_PRESET)))
    throw Error('一般匹配曲线的类型或字段无效。');
  const q={...GENERIC_MATCHED_PRESET,...raw};
  for(const [key,length] of [['flatCurve',2],['spaceCurve',3]] as const){if(!Array.isArray(q[key])||q[key].length!==length)
    throw Error('平面曲线需两个源表达式，空间曲线需三个源表达式。');
    for(const source of q[key])compileGenericExpression(source,'s');}
  if(q.psi!==1&&q.psi!==-1||q.sigma!==1&&q.sigma!==-1)throw Error('ψ 与 σ 须为固定的 +1 或 −1。');
  if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart< -10||q.parameterEnd>10||q.parameterEnd-q.parameterStart<.01||q.parameterEnd-q.parameterStart>12)
    throw Error('共同 s 区间须在 −10…10 内，长度 0.01–12。');
  if(!finite(q.transverseStart)||!finite(q.transverseEnd)||q.transverseStart>=q.transverseEnd||q.transverseStart< -1e6||q.transverseEnd>1e6)
    throw Error('母线横向区间须为 ±10⁶ 内的递增有限数。');
  if(!finite(q.segments)||!Number.isInteger(q.segments)||q.segments<8||q.segments>128||
    !finite(q.rulingSegments)||!Number.isInteger(q.rulingSegments)||q.rulingSegments<2||q.rulingSegments>64||q.rulingSegments%2)
    throw Error('显示密度须为 8–128 纵向段及 2–64 偶数横向段。');
  return {...q,flatCurve:q.flatCurve.slice() as [string,string],spaceCurve:q.spaceCurve.slice() as [string,string,string]} as GenericMatchedQuery;
}

const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const cross2=(a:GenericTaylor[],b:GenericTaylor[])=>a[0].mul(b[1]).sub(a[1].mul(b[0]));
const norm=(a:GenericTaylor[])=>td(a,a).sqrt();
const value=(a:GenericTaylor[])=>a.map(x=>x.c[0]);
const prime=(a:GenericTaylor[])=>a.map(x=>x.c[1]);
const scale=(a:GenericTaylor[],b:GenericTaylor|number)=>a.map(x=>x.mul(b));
const add=(a:GenericTaylor[],b:GenericTaylor[])=>a.map((x,i)=>x.add(b[i]));

/** The original pair has explicit source positions; no invented frame IVP. */
export function makeGenericMatchedEvaluator(query:GenericMatchedQuery){
  const functions=[query.flatCurve,query.spaceCurve].map(curve=>curve.map(source=>compileGenericExpression(source,'s'))),
    start=new GenericTaylor([query.parameterStart,1,0,0,0]),originParts=functions.map(curve=>curve.map(fn=>fn.parts(start))),
    flatOrigin=originParts[0].map(p=>sumExact(p.offsets)+p.dynamic.c[0]),spaceOrigin=originParts[1].map(p=>sumExact(p.offsets)+p.dynamic.c[0]),
    lengthScale=Math.hypot(...originParts[0].map(p=>p.dynamic.c[1]));
  if(!finite(lengthScale)||lengthScale<=0)fail();
  const coordinates=(side:number,u:GenericTaylor)=>functions[side].map((fn,k)=>{const p=fn.parts(u),initial=originParts[side][k],
    offset=sumExact([...p.offsets,...initial.offsets.map(x=>-x)]);return p.dynamic.sub(initial.dynamic.c[0]).add(offset).div(lengthScale);});
  const evaluate=(s:number)=>{
    const u=new GenericTaylor([s,1,0,0,0]),c=coordinates(0,u),cc=coordinates(1,u),cp=c.map(x=>x.derivative()),ccp=cc.map(x=>x.derivative()),
      cpp=cp.map(x=>x.derivative()),ccpp=ccp.map(x=>x.derivative()),flatSpeed=norm(cp),spaceSpeed=norm(ccp),
      t=cp.map(x=>x.div(flatSpeed)),l=[t[1].neg(),t[0]],T=ccp.map(x=>x.div(spaceSpeed)),
      Tp=T.map(x=>x.derivative()),N=Tp.map(x=>x.div(norm(Tp))),B=tc(T,N),
      kappaFlat=cross2(cp,cpp).div(flatSpeed.pow(3)),kappaSpace=norm(tc(ccp,ccpp)).div(spaceSpeed.pow(3)),
      cosine=kappaFlat.div(kappaSpace),sine=kappaSpace.mul(kappaSpace).sub(kappaFlat.mul(kappaFlat)).sqrt().div(kappaSpace).mul(query.psi),
      L=add(scale(N,cosine),scale(B,sine.neg())),U=add(scale(N,sine),scale(B,cosine)),Up=U.map(x=>x.derivative()),
      A=td(Up,T),Q=td(Up,L),H=norm(Up),rhoCos=Q.div(H).mul(query.psi),rhoSin=A.div(H).mul(-query.psi),
      d=add(scale(t,rhoCos),scale(l,rhoSin)).map(x=>x.mul(query.sigma)),dd=add(scale(T,rhoCos),scale(L,rhoSin)).map(x=>x.mul(query.sigma));
    if(A.c[0]*query.psi>=0||rhoSin.c[0]<=0)fail();
    const unitD=value(d),unitDD=value(dd),unitDPrime=prime(d),unitDDPrime=prime(dd),
      normalizedC=value(c),normalizedCC=value(cc),normalizedCPrime=value(cp),normalizedCCPrime=value(ccp);
    return {s,flatSpeed:flatSpeed.c[0]*lengthScale,spaceSpeed:spaceSpeed.c[0]*lengthScale,
      normalizedFlatSpeed:flatSpeed.c[0],normalizedSpaceSpeed:spaceSpeed.c[0],
      flatCurvature:kappaFlat.c[0]/lengthScale,spaceCurvature:kappaSpace.c[0]/lengthScale,
      normalizedFlatCurvature:kappaFlat.c[0],normalizedSpaceCurvature:kappaSpace.c[0],
      curvatureGap:kappaSpace.c[0]**2-kappaFlat.c[0]**2,uDerivativeNorm:H.c[0],
      unitD,unitDD,unitDPrime,unitDDPrime,
      c:normalizedC.map((x,k)=>flatOrigin[k]+lengthScale*x),cc:normalizedCC.map((x,k)=>spaceOrigin[k]+lengthScale*x),
      d:unitD,dd:unitDD,cPrime:normalizedCPrime.map(x=>lengthScale*x),ccPrime:normalizedCCPrime.map(x=>lengthScale*x),dPrime:unitDPrime,ddPrime:unitDDPrime,
      normalizedC,normalizedCC,normalizedCPrime,normalizedCCPrime,
      normalizedD:unitD.map(x=>x/lengthScale),normalizedDD:unitDD.map(x=>x/lengthScale),
      normalizedDPrime:unitDPrime.map(x=>x/lengthScale),normalizedDDPrime:unitDDPrime.map(x=>x/lengthScale),
      jacobian:(w:number)=>{const ds=mix(normalizedCPrime,unitDPrime,w/lengthScale);return ds[0]*unitD[1]-ds[1]*unitD[0];},
      canonicalMetric:(w:number)=>{const x=mix(normalizedCPrime,unitDPrime,w/lengthScale),y=mix(normalizedCCPrime,unitDDPrime,w/lengthScale);
        return {flat:[dot(x,x),dot(x,unitD),dot(unitD,unitD)],space:[dot(y,y),dot(y,unitDD),dot(unitDD,unitDD)]};}
    };
  };return Object.assign(evaluate,{normalization:{flatOrigin,spaceOrigin,scale:lengthScale}});
}

// Certificate metadata is bound to the exact source and independently checked
// at 129 parameters. The backend's outward interval and symbolic proofs remain
// distinct from this finite numerical browser verification.
export function parseGenericMatchedResult(raw:unknown,requested:unknown):GenericMatchedResult{
  const query=validateGenericMatchedQuery(requested);
  if(!record(raw)||!exactKeys(raw,['family','query','source','diagnostics','certification','sample'])||raw.family!=='curved-matched-pair'||
    JSON.stringify(validateGenericMatchedQuery(raw.query))!==JSON.stringify(query)||!record(raw.source)||!record(raw.diagnostics)||!record(raw.certification)||!record(raw.sample)||
    !exactKeys(raw.sample,['rows','grid'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==query.segments+1||
    !Array.isArray(raw.sample.grid)||raw.sample.grid.length!==query.segments+1)fail();
  const source=raw.source,d=raw.diagnostics,cert=raw.certification,domain=d.parameterDomain,speed=d.speedEquality;
  if(!exactKeys(source,['notebookCells','savedExampleCells','savedNumericalOut','method','parameterContract','interpolationContract'])||
    JSON.stringify(source.notebookCells)!=='[3864,3867]'||JSON.stringify(source.savedExampleCells)!=='[3865,3868]'||source.savedNumericalOut!==false||
    source.method!=='whitelist-AST/Taylor/Frenet-Darboux-ruling'||source.parameterContract!=='same-common-s/same-speed-required'||source.interpolationContract!=='source-derivatives/finite-numerical'||
    !exactKeys(d,['validationNodes','maximumFrameError','maximumMetricDifference','maximumDevelopabilityError','maximumSpeedSquareDifference','speedEquality','parameterDomain'])||
    d.validationNodes!==129||!record(domain)||!record(speed)||
    !exactKeys(speed,['status','method','analyticIdentity','maximumRelativeSquareDifferenceUpperBound','tolerance'])||speed.tolerance!==1e-9||
    !['analytic','numerical','unknown'].includes(speed.status)||speed.method!==({analytic:'bounded-safe-symbolic',numerical:'interval-relative-tolerance',unknown:'interval-unresolved'} as Record<string,string>)[speed.status]||
    speed.analyticIdentity!==(speed.status==='analytic'))fail();
  const no=['originalSavedFormulaReplayed','exactStraightCreaseFOLD','adoptableCreasePattern','selfCollisionChecked','continuousFoldPathChecked'],
    flags=['analyticSpeedEquality','finiteNumericalMetricVerified','numericalIsometryToleranceCertified','fullIntervalRegularityCertified','analyticLocalIsometry',
      'planarPaperInjectivityCertified','globalBoundaryInjectivityChecked'];
  if(!exactKeys(cert,[...flags,...no])||no.some(k=>cert[k]!==false)||flags.some(k=>typeof cert[k]!=='boolean')||cert.finiteNumericalMetricVerified!==true||
    !exactKeys(domain,['certified','evaluations','verifiedCells','intervals','minimumSpeedLowerBound','minimumCurvatureLowerBound','minimumCurvatureGapLowerBound',
      'minimumUDerivativeLowerBound','minimumJacobianLowerBound','jacobianOrientation','roundingModel','reason','planarPaperInjective',
      'minimumPaperSymmetricDeterminantLowerBound','paperMethod','paperAxes','coordinateNormalization'])||
    typeof domain.certified!=='boolean'||typeof domain.planarPaperInjective!=='boolean'||domain.jacobianOrientation!==1&&domain.jacobianOrientation!==-1||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.paperMethod!=='positive-symmetric-Jacobian/common-rectangle'||
    !Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||!Number.isInteger(domain.verifiedCells)||domain.verifiedCells<0||
    !Array.isArray(domain.intervals)||domain.intervals.length!==domain.verifiedCells||domain.verifiedCells>domain.evaluations||
    (domain.certified?domain.reason!==null:typeof domain.reason!=='string'||!domain.reason.length)||
    !Array.isArray(domain.paperAxes)||domain.paperAxes.length!==2||!domain.paperAxes.every((x:unknown)=>vector(x,2))||
    !close(dot(domain.paperAxes[0],domain.paperAxes[0]),1,1e-12)||!close(dot(domain.paperAxes[1],domain.paperAxes[1]),1,1e-12)||
    !close(dot(domain.paperAxes[0],domain.paperAxes[1]),0,1e-12))fail();
  if(cert.analyticSpeedEquality!==speed.analyticIdentity||cert.fullIntervalRegularityCertified!==domain.certified||
    cert.analyticLocalIsometry!==(speed.analyticIdentity&&domain.certified)||
    cert.numericalIsometryToleranceCertified!==(speed.status!=='unknown'&&domain.certified)||
    cert.planarPaperInjectivityCertified!==domain.planarPaperInjective||cert.globalBoundaryInjectivityChecked!==domain.planarPaperInjective||
    !domain.certified&&domain.planarPaperInjective)fail();
  const relativeBound=speed.maximumRelativeSquareDifferenceUpperBound;
  if(relativeBound!==null&&(!finite(relativeBound)||relativeBound<0)||speed.status==='analytic'&&relativeBound!==0||
    speed.status==='numerical'&&(!finite(relativeBound)||relativeBound>speed.tolerance)||!domain.certified&&!speed.analyticIdentity&&relativeBound!==null)fail();
  const intervals=domain.intervals;
  for(const [i,cell] of intervals.entries())if(!record(cell)||!exactKeys(cell,['start','end'])||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    cell.start<query.parameterStart-1e-12||cell.end>query.parameterEnd+1e-12||i&&cell.start<intervals[i-1].end-1e-12||
    domain.certified&&!close(cell.start,i?intervals[i-1].end:query.parameterStart,1e-12))fail();
  if(domain.certified&&(!intervals.length||!close(intervals.at(-1).end,query.parameterEnd,1e-12)||domain.evaluations!==2*domain.verifiedCells-1))fail();
  const lowerFields=['minimumSpeedLowerBound','minimumCurvatureLowerBound','minimumCurvatureGapLowerBound','minimumUDerivativeLowerBound','minimumJacobianLowerBound'] as const;
  for(const key of lowerFields)if(domain.certified? !finite(domain[key])||domain[key]<=0:domain[key]!==null)fail();
  if(domain.certified?!finite(domain.minimumPaperSymmetricDeterminantLowerBound):domain.minimumPaperSymmetricDeterminantLowerBound!==null)fail();
  if(domain.planarPaperInjective&&domain.minimumPaperSymmetricDeterminantLowerBound<=0)fail();
  const evaluate=makeGenericMatchedEvaluator(query),fields=['c','d','cc','dd','cPrime','dPrime','ccPrime','ddPrime',
    'normalizedC','normalizedD','normalizedCC','normalizedDD','normalizedCPrime','normalizedDPrime','normalizedCCPrime','normalizedDDPrime'] as const;
  const normalization=domain.coordinateNormalization,expectedNormalization=evaluate.normalization;
  if(!record(normalization)||!exactKeys(normalization,['flatOrigin','spaceOrigin','scale'])||!vector(normalization.flatOrigin,2)||!vector(normalization.spaceOrigin,3)||
    !finite(normalization.scale)||normalization.scale<=0||!close(normalization.scale/expectedNormalization.scale,1,2e-12))fail();
  for(const key of ['flatOrigin','spaceOrigin'] as const)if(normalization[key].some((x:number,k:number)=>
    Math.abs(x-expectedNormalization[key][k])>Math.max(normalization.scale*2e-12,4*Number.EPSILON*Math.abs(x))))fail();
  const lengthScale=evaluate.normalization.scale;
  let maxMetric=0,maxFrame=0,maxDevelop=0,maxSpeed=0,maxRelativeSpeed=0,minJacobian=Infinity,minSpeed=Infinity,minCurvature=Infinity,minGap=Infinity,minU=Infinity,minPaper=Infinity;
  const inspect=(expected:ReturnType<typeof evaluate>,row?:GenericMatchedRow)=>{
    const cp=row?.normalizedCPrime??expected.normalizedCPrime,ccp=row?.normalizedCCPrime??expected.normalizedCCPrime,
      ud=row?row.normalizedD.map(x=>x*lengthScale):expected.unitD,udd=row?row.normalizedDD.map(x=>x*lengthScale):expected.unitDD,
      udp=row?row.normalizedDPrime.map(x=>x*lengthScale):expected.unitDPrime,uddp=row?row.normalizedDDPrime.map(x=>x*lengthScale):expected.unitDDPrime,
      a2=dot(cp,cp),b2=dot(ccp,ccp),speedDifference=Math.abs(a2-b2),relativeSpeed=speedDifference/Math.max(1,a2,b2);
    maxSpeed=Math.max(maxSpeed,speedDifference);maxRelativeSpeed=Math.max(maxRelativeSpeed,relativeSpeed);
    maxFrame=Math.max(maxFrame,Math.abs(dot(ud,ud)-1),Math.abs(dot(udd,udd)-1));
    const cross=[ccp[1]*udd[2]-ccp[2]*udd[1],ccp[2]*udd[0]-ccp[0]*udd[2],ccp[0]*udd[1]-ccp[1]*udd[0]];
    maxDevelop=Math.max(maxDevelop,Math.abs(dot(cross,uddp)));
    minSpeed=Math.min(minSpeed,Math.sqrt(a2),Math.sqrt(b2));minCurvature=Math.min(minCurvature,expected.normalizedSpaceCurvature);
    minGap=Math.min(minGap,expected.curvatureGap);minU=Math.min(minU,expected.uDerivativeNorm);
    for(let j=0;j<=query.rulingSegments;j++){
      const w=query.transverseStart+(query.transverseEnd-query.transverseStart)*j/query.rulingSegments,
        xs=mix(cp,udp,w/lengthScale),ys=mix(ccp,uddp,w/lengthScale),m2=[dot(xs,xs),dot(xs,ud),dot(ud,ud)],m3=[dot(ys,ys),dot(ys,udd),dot(udd,udd)];
      maxMetric=Math.max(maxMetric,...m2.map((x,k)=>Math.abs(x-m3[k])));
      const jac=(xs[0]*ud[1]-xs[1]*ud[0])*domain.jacobianOrientation;if(jac<=0)fail();minJacobian=Math.min(minJacobian,jac);
      const x=dot(xs,domain.paperAxes[0]),y=dot(ud,domain.paperAxes[1]),off=(dot(ud,domain.paperAxes[0])+dot(xs,domain.paperAxes[1]))/2,det=x*y-off*off;
      minPaper=Math.min(minPaper,det);if(domain.planarPaperInjective&&(x<=0||y<=0||det<=0))fail();
    }
  };
  for(let i=0;i<=query.segments;i++){
    const row=raw.sample.rows[i],s=query.parameterStart+(query.parameterEnd-query.parameterStart)*i/query.segments;
    if(!record(row)||!exactKeys(row,['s',...fields])||!finite(row.s)||!close(row.s,s,1e-12))fail();
    const expected=evaluate(s);
    for(const field of fields){const n=['c','d','cPrime','dPrime','normalizedC','normalizedD','normalizedCPrime','normalizedDPrime'].includes(field)?2:3;
      if(!vector(row[field],n))fail();
      for(let k=0;k<n;k++){
        const calculated=expected[field][k],actual=row[field][k];
        if(field==='c'||field==='cc'){
          if(Math.abs(calculated-actual)>Math.max(evaluate.normalization.scale*2e-9,4*Number.EPSILON*Math.abs(calculated)))fail();
        }else if(field.startsWith('normalized')||field==='d'||field==='dd'||field==='dPrime'||field==='ddPrime'){
          if(!close(calculated,actual,2e-8))fail();
        }else if(Math.abs(calculated-actual)>Math.max(evaluate.normalization.scale*2e-9,Math.abs(calculated)*2e-9))fail();
      }
    }
    inspect(expected,row as GenericMatchedRow);
    const grid=raw.sample.grid[i];if(!Array.isArray(grid)||grid.length!==query.rulingSegments+1)fail();
    for(let j=0;j<=query.rulingSegments;j++){
      const w=query.transverseStart+(query.transverseEnd-query.transverseStart)*j/query.rulingSegments,p=grid[j];
      if(!record(p)||!exactKeys(p,['s','w','flat','space','normalizedFlat','normalizedSpace'])||!finite(p.s)||!finite(p.w)||!close(p.s,s,1e-12)||
        Math.abs(p.w-w)>Math.max(lengthScale*2e-12,4*Number.EPSILON*Math.max(Math.abs(w),Math.abs(query.transverseStart),Math.abs(query.transverseEnd)))||
        !vector(p.flat,2)||!vector(p.space,3)||!vector(p.normalizedFlat,2)||!vector(p.normalizedSpace,3))fail();
      for(const [name,origin] of [['flat',evaluate.normalization.flatOrigin],['space',evaluate.normalization.spaceOrigin]] as const){
        const normalized=name==='flat'?mix(expected.normalizedC,expected.normalizedD,w):mix(expected.normalizedCC,expected.normalizedDD,w),actualNormalized=name==='flat'?p.normalizedFlat:p.normalizedSpace;
        normalized.forEach((x,k)=>{if(!close(x,actualNormalized[k],2e-8))fail();const world=origin[k]+evaluate.normalization.scale*x;
          if(Math.abs(world-p[name][k])>Math.max(evaluate.normalization.scale*2e-9,4*Number.EPSILON*Math.abs(world)))fail();});
      }
    }
  }
  for(let i=0;i<=128;i++)inspect(evaluate(query.parameterStart+(query.parameterEnd-query.parameterStart)*i/128));
  const initial=evaluate(query.parameterStart),initialT=initial.normalizedCPrime.map(x=>x/initial.normalizedFlatSpeed),axis1=[-initialT[1],initialT[0]].map(x=>x*domain.jacobianOrientation);
  if(initialT.some((x,k)=>!close(x,domain.paperAxes[0][k],1e-12))||axis1.some((x,k)=>!close(x,domain.paperAxes[1][k],1e-12)))fail();
  for(const key of ['maximumFrameError','maximumMetricDifference','maximumDevelopabilityError','maximumSpeedSquareDifference'])if(!finite(d[key])||d[key]<0||d[key]>2e-7)fail();
  if(maxFrame>2e-7||maxMetric>2e-7||maxDevelop>2e-7||maxRelativeSpeed>2e-8||maxMetric>d.maximumMetricDifference+2e-10||
    maxFrame>d.maximumFrameError+2e-10||maxDevelop>d.maximumDevelopabilityError+2e-10||maxSpeed>d.maximumSpeedSquareDifference+2e-10||
    speed.status!=='unknown'&&maxRelativeSpeed>speed.tolerance+2e-12)fail();
  if(domain.certified){const minima=[minSpeed,minCurvature,minGap,minU,minJacobian];for(let i=0;i<lowerFields.length;i++)
    if(domain[lowerFields[i]]>minima[i]+2e-10*Math.max(1,Math.abs(minima[i])))fail();
    if(domain.minimumPaperSymmetricDeterminantLowerBound>minPaper+2e-10*Math.max(1,Math.abs(minPaper)))fail();}
  if(!finite(maxMetric)||!finite(minJacobian))fail();
  return raw as GenericMatchedResult;
}

export async function fetchGenericMatched(value:unknown,signal?:AbortSignal){
  const query=validateGenericMatchedQuery(value);return parseGenericMatchedResult(await api('tessellation/curved-matched-pair',query,signal),query);
}
