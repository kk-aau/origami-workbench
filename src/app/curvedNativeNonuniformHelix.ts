import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import type {GenericFoldFlattenResult} from './curvedNativeFoldFlatten';

export type GenericNonuniformHelixQuery={family:'nonuniform-helix-generic-native';radius:number;pitchAngle:number;
  foldAngle:string;parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number};
export const NONUNIFORM_HELIX_NATIVE_PRESET:GenericNonuniformHelixQuery={family:'nonuniform-helix-generic-native',radius:1,
  pitchAngle:Math.PI/6,foldAngle:'pi/3+s/3',parameterStart:0,parameterEnd:Math.PI,transverseStart:0,transverseEnd:.2,segments:48,rulingSegments:16};
type RawRow={s:number;foldAngleRad:number;foldAngleDerivative:number;leftDenominator:number;rightDenominator:number;
  sourceBase:number[];sourceBaseDerivative:number[];sourceLeftDirector:number[];sourceRightDirector:number[];
  sourceLeftDirectorDerivative:number[];sourceRightDirectorDerivative:number[];normalizedSourceBase:number[];
  normalizedSourceBaseDerivative:number[];normalizedSourceLeftDirector:number[];normalizedSourceRightDirector:number[];
  normalizedSourceLeftDirectorDerivative:number[];normalizedSourceRightDirectorDerivative:number[]};
type RawGrid=Pick<GenericFoldFlattenResult['grid'][number],'s'|'sourceLeft'|'sourceRight'|'normalizedSourceLeft'|'normalizedSourceRight'|'sourceLeftEFG'|'sourceRightEFG'>;
type FlatResult=Pick<GenericFoldFlattenResult,'normalization'|'diagnostics'|'certification'|'domain'|'sample'|'grid'>;
type RawCell={start:number;end:number;leftDenominatorLowerBound:number;rightDenominatorLowerBound:number;
  normalizedRuleBounds:[number,number][][];halfAngleFactorBounds:[number,number]};
export type GenericNonuniformHelixResult={family:'origamica-generic-nonuniform-helix';query:GenericNonuniformHelixQuery;
  source:{functions:string[];definitionCells:string[];argumentOrder:string[];rulingConstruction:string;flatteningFunctions:string[];
    flatteningDefinitionCells:string[];interpolationReproduced:false;wolframOptionsReproduced:false;symbolicSolverReproduced:false;metricConvention:string};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};domain:{certified:boolean;evaluations:number;verifiedCells:number;
    cells:RawCell[];unresolved:number[][];minimumLeftDenominatorLowerBound:number|null;minimumRightDenominatorLowerBound:number|null;
    roundingModel:string;reason:string|null};sample:{rows:RawRow[]};grid:RawGrid[];
  flattening:{status:'computed'|'source-singularity'|'unknown'|'integration-failed';stage:'NFlattenFold2D/In[3935]';
    initial:{parameter:number;point:number[];tangent:number[];argumentOrder:string[]};reason:string|null;result:FlatResult|null};
  diagnostics:{validationNodes:129;maximumUnitRulingResidual:number;maximumRelativeDevelopabilityResidual:number};
  certification:{literalSpatialRulesEvaluated:true;sourceRulesCertified:boolean;finiteUnitRulingsVerified:boolean;finiteDevelopabilityVerified:boolean;
    unitRulingsAnalytic:boolean;developabilityAnalytic:boolean;sourceStripRegularityChecked:boolean;integrationErrorIntervalCertified:false;
    globalInjectivityChecked:false;selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false}};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
  keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k)),
  vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a:number[],w:number)=>a.map(x=>x*w),
  add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]),cross=(a:number[],b:number[])=>[
    a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]),tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]),
  td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0)),
  tm=(a:GenericTaylor[],w:number|GenericTaylor)=>a.map(x=>x.mul(w));
function fail():never{throw Error('原非均匀螺旋的r、θ、γ源、闭式母线、固定初值展开或阶段证据回读不一致。');}
const near=(x:unknown,y:number,natural=Math.abs(y),tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE,
  nearV=(x:unknown,y:number[],natural=Math.hypot(...y),tol=2e-8)=>vector(x,y.length)&&y.every((v,i)=>near(x[i],v,natural,tol));
const bounded=(x:unknown):x is [number,number]=>vector(x,2)&&x[0]<=x[1],
  inside=(bounds:number[],value:number,natural=Math.abs(value))=>value>=bounds[0]-2e-8*Math.max(natural,Number.MIN_VALUE)&&value<=bounds[1]+2e-8*Math.max(natural,Number.MIN_VALUE);
const metric=(bp:number[],d:number[],dp:number[],w:number)=>{const v=add(bp,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];},
  difference=(a:number[],b:number[])=>{const E=Math.max(a[0],b[0]),G=Math.max(a[2],b[2]),n=[E,Math.sqrt(E)*Math.sqrt(G),G];
    return Math.max(...a.map((x,i)=>Math.abs(x-b[i])/Math.max(n[i],Number.MIN_VALUE)));};
export function validateGenericNonuniformHelixQuery(raw:unknown):GenericNonuniformHelixQuery{
  if(!record(raw)||!keys(raw,Object.keys(NONUNIFORM_HELIX_NATIVE_PRESET))||raw.family!=='nonuniform-helix-generic-native')
    throw Error('需完整原r、θ、γ(s)、所有域与密度；不接受初值、ς或其它未知字段。');
  compileGenericExpression(raw.foldAngle,'s');
  if(!finite(raw.radius)||Math.abs(raw.radius)>1e6||!finite(raw.pitchAngle)||Math.abs(raw.pitchAngle)>10)
    throw Error('r须在±10⁶内；θ须在±10弧度内，r可为0或负数。');
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('s域须在−10…10内且跨度0.01–12。');
  if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||
    raw.transverseStart>=raw.transverseEnd)throw Error('完整w域须递增且在±10⁶内。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||
    raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128纵向段、2–64横向段。');
  return {...raw} as GenericNonuniformHelixQuery;
}

/** Direct Taylor jets of In3959, not the Space4 Sign/Abs construction. */
export function makeGenericNonuniformHelixSource(input:unknown){
  const q=validateGenericNonuniformHelixQuery(input),angle=compileGenericExpression(q.foldAngle,'s'),c=Math.cos(q.pitchAngle),a=Math.sin(q.pitchAngle),
    slope=Math.tan(q.pitchAngle),ui=q.parameterStart,sourceOrigin=[q.radius*Math.cos(ui),q.radius*Math.sin(ui),q.radius*slope*ui],
    scale=Math.max(Math.abs(q.radius/c)*(q.parameterEnd-ui),Math.abs(q.transverseStart),Math.abs(q.transverseEnd));
  if(!finite(scale)||scale<=0||sourceOrigin.some(x=>!finite(x))||c===0)fail();
  const evaluate=(s:number)=>{
    const t=new GenericTaylor([s,1,0,0,0]),[sn,cs]=t.sincos(),gamma=angle(t),gp=gamma.derivative(),[sg,cg]=gamma.sincos(),[hs,hc]=gamma.div(2).sincos(),
      dl=gp.add(2*a).pow(2).add(hs.pow(2).mul(4*c*c)).sqrt(),dr=gp.neg().add(2*a).pow(2).add(hs.pow(2).mul(4*c*c)).sqrt(),
      base=[cs.sub(Math.cos(ui)).mul(q.radius/scale),sn.sub(Math.sin(ui)).mul(q.radius/scale),t.sub(ui).mul(q.radius*slope/scale)],
      z=hs.pow(2).mul(2*c*c).add(2*a*a),az=cg.add(1).mul(a),left=[az.mul(sn).add(cs.mul(sg)).add(sn.mul(gp)).mul(-c).div(dl),
        cs.mul(az).sub(sn.mul(sg)).add(cs.mul(gp)).mul(c).div(dl),z.add(gp.mul(a)).div(dl)],
      right=[az.mul(sn).neg().add(cs.mul(sg)).add(sn.mul(gp)).mul(c).div(dr),
        cs.mul(az).add(sn.mul(sg)).sub(cs.mul(gp)).mul(c).div(dr),z.sub(gp.mul(a)).div(dr)],
      directions=[tm(left,1/scale),tm(right,1/scale)],prime=directions.map(tp),zero=t.constant(0),
      t0=[sn.mul(-c),cs.mul(c),zero.add(a)],n0=[cs.neg(),sn.neg(),zero],b0=[sn.mul(a),cs.mul(-a),zero.add(c)];
    return {s,base:tv(base),basePrime:tp(base),angle:gamma.c[0],anglePrime:gp.c[0],halfSine:hs.c[0],halfCosine:hc.c[0],
      leftDenominator:dl.c[0],rightDenominator:dr.c[0],left:{director:tv(directions[0]),directorPrime:prime[0]},
      right:{director:tv(directions[1]),directorPrime:prime[1]},jets:{t0,n0,b0,hs,hc,gp,dl,dr,directions}};
  };
  const frame=(s:number)=>{const r=evaluate(s),j=r.jets,sign=Math.sign(c*r.halfSine),orientation=Math.sign(q.radius*c);
    if(!sign||!orientation)throw Error('原NFlatten速度或Normalize(T×D)帧退化。');
    const tangent=tm(j.t0,orientation),tprime=tangent.map(x=>x.derivative()),side=(right:boolean)=>{
      const l=tm(j.n0.map((x,i)=>x.mul(j.hc).add(j.b0[i].mul(right?j.hs.neg():j.hs))),sign),
        u=cross(tv(tangent),tv(l)),den=right?j.dr:j.dl,p=(right?j.gp.neg():j.gp).add(2*a).mul(orientation).div(den).div(scale),
        transverse=j.hs.mul((right?-1:1)*2*sign*c).div(den).div(scale),g=td(l,tprime);
      return {...r[right?'right':'left'],leftNormal:tv(l),surfaceNormal:u,p:p.c[0],q:transverse.c[0],pPrime:p.c[1],qPrime:transverse.c[1],g:g.c[0]};};
    return {...r,tangent:tv(tangent),speed:Math.abs(q.radius/c)/scale,left:side(false),right:side(true)};};
  return {query:q,normalization:{sourceOrigin,targetOrigin:[1,0],scale},evaluate,frame};
}

/** Independent DP54 replay of the original fixed-IC NFlattenFold2D. */
export function makeGenericNonuniformHelixReference(input:unknown,nodes:number[]){
  const evaluator=makeGenericNonuniformHelixSource(input),q=evaluator.query,cache=new Map<number,ReturnType<typeof evaluator.frame>>(),
    source=(s:number)=>{let r=cache.get(s);if(!r){r=evaluator.frame(s);cache.set(s,r);}return r;},initial=[0,0,0,1,-1,0],
    results=new Map<number,number[]>([[q.parameterStart,initial.slice()]]),derivative=(s:number,y:number[])=>{
      const r=source(s),t=y.slice(2,4),l=y.slice(4,6);return [...mul(t,r.speed),...mul(l,r.left.g),...mul(t,-r.left.g)];},
    c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
      [19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],
      [35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  let s=q.parameterStart,y=initial.slice(),h=(q.parameterEnd-q.parameterStart)/32,budget=0;
  for(const end of [...new Set(nodes)].sort((a,b)=>a-b)){
    if(!finite(end)||end<q.parameterStart||end>q.parameterEnd)fail();
    while(s<end){if(++budget>16384)throw Error('原螺旋独立DP54回读超过有限计算预算。');if(s+h>end)h=end-s;if(s+h===s)fail();const stages:number[][]=[];
      for(let k=0;k<7;k++){const trial=y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0));stages.push(derivative(k===6?s+h:s+c[k]*h,trial));}
      const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
        error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
      if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=s+h>=end?end:s+h;y=high;}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
    }results.set(end,y.slice());
  }
  const target=(s:number)=>{const y=results.get(s);if(!y)fail();const r=source(s),t=y.slice(2,4),l=y.slice(4,6),side=(name:'left'|'right')=>{
    const d=r[name];return {director:add(mul(t,d.p),mul(l,d.q)),directorPrime:add(mul(t,d.pPrime-d.q*r.left.g),mul(l,d.qPrime+d.p*r.left.g))};};
    return {base:y.slice(0,2),basePrime:mul(t,r.speed),tangent:t,leftNormal:l,left:side('left'),right:side('right')};};
  return {...evaluator,source,target};
}

const rawSuffixes=['Base','BaseDerivative','LeftDirector','RightDirector','LeftDirectorDerivative','RightDirectorDerivative'];
const rawRowKeys=['s','foldAngleRad','foldAngleDerivative','leftDenominator','rightDenominator',...rawSuffixes.flatMap(k=>['source'+k,'normalizedSource'+k])];
const rawGridKeys=['s','sourceLeft','sourceRight','normalizedSourceLeft','normalizedSourceRight','sourceLeftEFG','sourceRightEFG'];
const noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
function validateCoverage(cells:Record<string,any>[],unresolved:unknown[],q:GenericNonuniformHelixQuery){
  const all=[...cells.map(x=>[x.start,x.end]),...unresolved];if(all.some(x=>!vector(x,2)||x[0]>=x[1]||x[0]<q.parameterStart||x[1]>q.parameterEnd))fail();
  const pairs=(all as number[][]).sort((a,b)=>a[0]-b[0]);let edge=q.parameterStart;for(const [a,b] of pairs){if(!near(a,edge,q.parameterEnd-q.parameterStart,1e-13))fail();edge=b;}
  if(!pairs.length||!near(edge,q.parameterEnd,q.parameterEnd-q.parameterStart,1e-13))fail();
}

export function parseGenericNonuniformHelixResult(raw:unknown,requested?:unknown):GenericNonuniformHelixResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','domain','sample','grid','flattening','diagnostics','certification'])||raw.family!=='origamica-generic-nonuniform-helix')fail();
  const q=validateGenericNonuniformHelixQuery(raw.query);if(requested){const request=validateGenericNonuniformHelixQuery(requested);
    if(Object.keys(q).some(k=>q[k as keyof typeof q]!==request[k as keyof typeof request]))fail();}
  const evaluator=makeGenericNonuniformHelixSource(q),norm=evaluator.normalization,L=norm.scale,
    world=(x:unknown,v:number[],origin:number[]|null,natural:number)=>vector(x,v.length)&&v.every((a,i)=>{
      const expected=a*L+(origin?.[i]??0);return Math.abs(x[i]-expected)<=2e-8*L*Math.max(natural,Number.MIN_VALUE)+4*Number.EPSILON*Math.abs(expected);}),
    source=raw.source;
  if(!record(source)||!keys(source,['functions','definitionCells','argumentOrder','rulingConstruction','flatteningFunctions','flatteningDefinitionCells',
    'interpolationReproduced','wolframOptionsReproduced','symbolicSolverReproduced','metricConvention'])||
    JSON.stringify(source.functions)!==JSON.stringify(['CurvedFoldHelix3D','NCurvedFoldHelix3D','NCurvedFoldHelix2D'])||
    JSON.stringify(source.definitionCells)!==JSON.stringify(['In[3959]','In[3963]','In[3966]'])||JSON.stringify(source.argumentOrder)!==JSON.stringify(['r','theta','gamma'])||
    source.rulingConstruction!=='literal In3959 square-root closed directions; no Space4 Sign/Abs substitution'||
    JSON.stringify(source.flatteningFunctions)!==JSON.stringify(['NFlattenFold2D'])||JSON.stringify(source.flatteningDefinitionCells)!==JSON.stringify(['In[3935]'])||
    source.metricConvention!=='normalized-s/world-w'||['interpolationReproduced','wolframOptionsReproduced','symbolicSolverReproduced'].some(k=>source[k]!==false))fail();
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||!near(raw.normalization.scale,L,L,2e-12)||
    !nearV(raw.normalization.sourceOrigin,norm.sourceOrigin,Math.abs(q.radius)*(1+Math.abs(Math.tan(q.pitchAngle))*Math.abs(q.parameterStart)),2e-12)||
    !nearV(raw.normalization.targetOrigin,[1,0],1,1e-14))fail();
  const d=raw.domain;if(!record(d)||!keys(d,['certified','evaluations','verifiedCells','cells','unresolved','minimumLeftDenominatorLowerBound','minimumRightDenominatorLowerBound','roundingModel','reason'])||
    typeof d.certified!=='boolean'||!Number.isInteger(d.evaluations)||d.evaluations<1||d.evaluations>1024||!Array.isArray(d.cells)||d.cells.length!==d.verifiedCells||
    d.cells.length>d.evaluations||!Array.isArray(d.unresolved)||d.unresolved.length>1024||d.certified!==(d.unresolved.length===0)||
    d.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||d.reason!==(d.certified?null:'literal helix rule interval budget unresolved; complete original domain retained'))fail();
  validateCoverage(d.cells,d.unresolved,q);for(const cell of d.cells){
    if(!record(cell)||!keys(cell,['start','end','leftDenominatorLowerBound','rightDenominatorLowerBound','normalizedRuleBounds','halfAngleFactorBounds'])||
      !finite(cell.leftDenominatorLowerBound)||cell.leftDenominatorLowerBound<=0||!finite(cell.rightDenominatorLowerBound)||cell.rightDenominatorLowerBound<=0||
      !bounded(cell.halfAngleFactorBounds)||!Array.isArray(cell.normalizedRuleBounds)||cell.normalizedRuleBounds.length!==3||
      cell.normalizedRuleBounds.some((row:unknown)=>!Array.isArray(row)||row.length!==3||row.some(x=>!bounded(x))))fail();
    for(const s of [cell.start,(cell.start+cell.end)/2,cell.end]){const r=evaluator.evaluate(s);
      if(r.leftDenominator<cell.leftDenominatorLowerBound*(1-2e-8)||r.rightDenominator<cell.rightDenominatorLowerBound*(1-2e-8)||!inside(cell.halfAngleFactorBounds,r.halfSine))fail();
      [r.base,r.left.director,r.right.director].forEach((row,k)=>row.forEach((v,i)=>{if(!inside(cell.normalizedRuleBounds[k][i],v,Math.hypot(...row)))fail();}));}
  }
  for(const side of ['Left','Right']){const minimum=d.certified?Math.min(...d.cells.map((c:Record<string,any>)=>c[side[0].toLowerCase()+side.slice(1)+'DenominatorLowerBound'])):null;
    if(minimum===null?d['minimum'+side+'DenominatorLowerBound']!==null:!near(d['minimum'+side+'DenominatorLowerBound'],minimum,minimum,2e-12))fail();}
  if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==q.segments+1||!Array.isArray(raw.grid)||raw.grid.length!==q.segments+1)fail();
  const parameters=Array.from({length:q.segments+1},(_,i)=>i===q.segments?q.parameterEnd:q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128);let unit=0,develop=0;
  for(const s of [...new Set([...parameters,...validation])]){const r=evaluator.evaluate(s);for(const side of ['left','right'] as const){const f=r[side],dn=Math.hypot(...f.director),dpn=Math.hypot(...f.directorPrime),bn=Math.hypot(...r.basePrime),den=bn*dn*dpn;
    unit=Math.max(unit,Math.abs(dn*L-1));develop=Math.max(develop,den?Math.abs(dot(cross(r.basePrime,f.director),f.directorPrime))/den:0);}}
  for(let i=0;i<parameters.length;i++){const s=parameters[i],r=evaluator.evaluate(s),row=raw.sample.rows[i],grid=raw.grid[i];
    if(!record(row)||!keys(row,rawRowKeys)||!near(row.s,s,q.parameterEnd-q.parameterStart,1e-12)||
      !near(row.foldAngleRad,r.angle,Math.abs(r.angle)+Math.abs(r.anglePrime)*(q.parameterEnd-q.parameterStart))||
      !near(row.foldAngleDerivative,r.anglePrime)||!near(row.leftDenominator,r.leftDenominator)||!near(row.rightDenominator,r.rightDenominator))fail();
    const values=[r.base,r.basePrime,r.left.director,r.right.director,r.left.directorPrime,r.right.directorPrime],naturals=[1,Math.hypot(...r.basePrime),1/L,1/L,
      Math.max(1/L,Math.hypot(...r.left.directorPrime)),Math.max(1/L,Math.hypot(...r.right.directorPrime))];
    rawSuffixes.forEach((suffix,k)=>{if(!nearV(row['normalizedSource'+suffix],values[k],naturals[k])||!world(row['source'+suffix],values[k],k===0?norm.sourceOrigin:null,naturals[k]))fail();});
    if(!record(grid)||!keys(grid,rawGridKeys)||!near(grid.s,s,q.parameterEnd-q.parameterStart,1e-12))fail();
    for(const side of ['Left','Right']){const f=r[side.toLowerCase() as 'left'|'right'];for(const key of ['source'+side,'normalizedSource'+side,'source'+side+'EFG'])
      if(!Array.isArray(grid[key])||grid[key].length!==q.rulingSegments+1)fail();
      for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments,v=add(r.base,f.director,w),
        natural=1+Math.abs(w)/L,m=metric(r.basePrime,f.director,f.directorPrime,w),bn=Math.hypot(...r.basePrime)+Math.abs(w)*Math.hypot(...f.directorPrime),n=[bn*bn,bn/L,1/(L*L)];
        if(!nearV(grid['normalizedSource'+side][j],v,natural)||!world(grid['source'+side][j],v,norm.sourceOrigin,natural)||!vector(grid['source'+side+'EFG'][j],3)||
          m.some((x,k)=>!near(grid['source'+side+'EFG'][j][k],x,n[k])))fail();}
    }
  }
  const diag=raw.diagnostics,cert=raw.certification;if(!record(diag)||!keys(diag,['validationNodes','maximumUnitRulingResidual','maximumRelativeDevelopabilityResidual'])||diag.validationNodes!==129||
    !near(diag.maximumUnitRulingResidual,unit,1,2e-12)||!near(diag.maximumRelativeDevelopabilityResidual,develop,1,2e-12)||
    !record(cert)||!keys(cert,['literalSpatialRulesEvaluated','sourceRulesCertified','finiteUnitRulingsVerified','finiteDevelopabilityVerified','unitRulingsAnalytic','developabilityAnalytic','sourceStripRegularityChecked',...noCertificates])||
    Object.values(cert).some(x=>typeof x!=='boolean')||cert.literalSpatialRulesEvaluated!==true||noCertificates.some(k=>cert[k]!==false)||
    cert.sourceRulesCertified!==d.certified||cert.unitRulingsAnalytic!==d.certified||cert.developabilityAnalytic!==d.certified||
    cert.finiteUnitRulingsVerified!==(diag.maximumUnitRulingResidual<=2e-9)||cert.finiteDevelopabilityVerified!==(diag.maximumRelativeDevelopabilityResidual<=2e-9))fail();
  const flat=raw.flattening;if(!record(flat)||!keys(flat,['status','stage','initial','reason','result'])||!['computed','source-singularity','unknown','integration-failed'].includes(flat.status)||
    flat.stage!=='NFlattenFold2D/In[3935]'||!record(flat.initial)||!keys(flat.initial,['parameter','point','tangent','argumentOrder'])||flat.initial.parameter!==q.parameterStart||
    JSON.stringify(flat.initial.argumentOrder)!==JSON.stringify(['ui','fi','ti'])||!nearV(flat.initial.point,[1,0],1,1e-14)||!nearV(flat.initial.tangent,[0,1],1,1e-14)||
    cert.sourceStripRegularityChecked!==(flat.status==='computed'))fail();
  const frameAllowed=d.certified&&q.radius!==0&&d.cells.every((cell:RawCell)=>cell.halfAngleFactorBounds[0]>0||cell.halfAngleFactorBounds[1]<0);
  if(flat.status==='computed'){if(!frameAllowed||flat.reason!==null)fail();validateFlatResult(flat.result,q,evaluator,parameters,validation);}
  else {if(flat.result!==null||typeof flat.reason!=='string'||!flat.reason.length)fail();
    if(flat.status==='source-singularity'&&q.radius!==0&&!raw.sample.rows.some((row:RawRow)=>row.foldAngleRad===0))fail();
    if(flat.status==='unknown'&&frameAllowed||flat.status==='integration-failed'&&!frameAllowed)fail();}
  return raw as GenericNonuniformHelixResult;
}

function validateFlatResult(raw:unknown,q:GenericNonuniformHelixQuery,evaluator:ReturnType<typeof makeGenericNonuniformHelixSource>,parameters:number[],validation:number[]){
  if(!record(raw)||!keys(raw,['normalization','diagnostics','certification','domain','sample','grid']))fail();
  const L=evaluator.normalization.scale,norm=evaluator.normalization,world=(x:unknown,v:number[],origin:number[]|null,natural:number)=>vector(x,v.length)&&
    v.every((a,i)=>Math.abs(x[i]-(a*L+(origin?.[i]??0)))<=2e-8*L*Math.max(natural,Number.MIN_VALUE)+4*Number.EPSILON*Math.abs(a*L+(origin?.[i]??0))),domain=raw.domain;
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||!near(raw.normalization.scale,L,L,2e-12)||
    !nearV(raw.normalization.sourceOrigin,norm.sourceOrigin,Math.abs(q.radius)*(1+Math.abs(Math.tan(q.pitchAngle))*Math.abs(q.parameterStart)),2e-12)||!nearV(raw.normalization.targetOrigin,[1,0],1,1e-14))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved','minimumSpeedLowerBound','minimumLeftTransverseLowerBound','minimumRightTransverseLowerBound',
    'roundingModel','reason','sourceStripRegularity','formalStripRegularity'])||typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||
    !Array.isArray(domain.cells)||domain.cells.length!==domain.verifiedCells||domain.cells.length>domain.evaluations||!Array.isArray(domain.unresolved)||domain.certified!==(domain.unresolved.length===0)||
    domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==(domain.certified?null:'two-source frame interval budget unresolved; original domain retained'))fail();
  validateCoverage(domain.cells,domain.unresolved,q);const labels=['sourceLeft','sourceRight','formalLeft','formalRight'];
  for(const cell of domain.cells)if(!record(cell)||!keys(cell,['start','end','speedLowerBound','leftTransverseLowerBound','rightTransverseLowerBound','leftDirectorLengthLowerBound','rightDirectorLengthLowerBound',
    ...labels.map(k=>k+'NormalizedJacobianBounds')])||['speedLowerBound','leftTransverseLowerBound','rightTransverseLowerBound','leftDirectorLengthLowerBound','rightDirectorLengthLowerBound'].some(k=>!finite(cell[k])||cell[k]<=0)||
    labels.some(k=>!bounded(cell[k+'NormalizedJacobianBounds'])))fail();
  for(const key of ['Speed','LeftTransverse','RightTransverse']){const expected=domain.certified?Math.min(...domain.cells.map((c:Record<string,any>)=>c[key[0].toLowerCase()+key.slice(1)+'LowerBound'])):null;
    if(expected===null?domain['minimum'+key+'LowerBound']!==null:!near(domain['minimum'+key+'LowerBound'],expected,expected,2e-12))fail();}
  const midpoints=domain.cells.map((x:Record<string,any>)=>(x.start+x.end)/2),ref=makeGenericNonuniformHelixReference(q,[...parameters,...validation,...midpoints]);
  let frameResidual=0,leftMetric=0,rightMetric=0,leftDev=0,rightDev=0,shared=0;
  const witnesses={sourceLeft:false,sourceRight:false,formalLeft:false,formalRight:false};
  const inspect=(s:number)=>{const r=ref.source(s),t=ref.target(s),matching=domain.cells.filter((c:Record<string,any>)=>c.start<=s&&s<=c.end);
    for(const basis of [[t.tangent,t.leftNormal],[r.tangent,r.left.leftNormal,r.left.surfaceNormal],[r.tangent,r.right.leftNormal,r.right.surfaceNormal]])
      for(let i=0;i<basis.length;i++)for(let j=0;j<basis.length;j++)frameResidual=Math.max(frameResidual,Math.abs(dot(basis[i],basis[j])-(i===j?1:0)));
    shared=Math.max(shared,Math.abs(r.left.g-r.right.g)/Math.max(Math.abs(r.left.g),Math.abs(r.right.g),1/(q.parameterEnd-q.parameterStart)));
    for(const side of ['left','right'] as const){const f=r[side],b=t[side],label=side==='left'?'Left':'Right',dn=Math.hypot(...f.director),dpn=Math.hypot(...f.directorPrime),
      dev=Math.abs(dot(f.surfaceNormal,f.directorPrime))/Math.max(dn,dpn,Number.MIN_VALUE);
      if(side==='left')leftDev=Math.max(leftDev,dev);else rightDev=Math.max(rightDev,dev);
      const jac=(w:number)=>({source:dot(cross(add(r.basePrime,f.directorPrime,w),f.director),f.surfaceNormal),
        formal:r.speed*f.q+w*(f.q*f.pPrime-f.p*f.qPrime-r.left.g*(f.p*f.p+f.q*f.q))}),ends=[jac(q.transverseStart),jac(q.transverseEnd)];
      // Literal helix developability makes the source projected Jacobian
      // equal this affine scalar. Each endpoint has its own arithmetic scale:
      // a large opposite endpoint cannot swallow a real tiny positive value.
      const error=(w:number)=>64*Number.EPSILON*(Math.abs(r.speed*f.q)+Math.abs(w)*(
        Math.abs(f.q*f.pPrime)+Math.abs(f.p*f.qPrime)+Math.abs(r.left.g)*(f.p*f.p+f.q*f.q))),
        lo=ends[0].formal,hi=ends[1].formal,el=error(q.transverseStart),eh=error(q.transverseEnd);
      if(lo< -el&&hi>eh||hi< -eh&&lo>el)for(const stage of ['source','formal'])witnesses[(stage+label) as keyof typeof witnesses]=true;
      for(const cell of matching){const lower=side==='left'?cell.leftTransverseLowerBound:cell.rightTransverseLowerBound;
        if(r.speed<cell.speedLowerBound*(1-2e-8)||Math.abs(f.q)<lower*(1-2e-8)||1/L<cell[side+'DirectorLengthLowerBound']*(1-2e-8))fail();}
      const widths=Array.from({length:q.rulingSegments+1},(_,j)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments);widths.push((q.transverseStart+q.transverseEnd)/2);
      for(const w of widths){const delta=difference(metric(r.basePrime,f.director,f.directorPrime,w),metric(t.basePrime,b.director,b.directorPrime,w));
        if(side==='left')leftMetric=Math.max(leftMetric,delta);else rightMetric=Math.max(rightMetric,delta);const js=jac(w);
        for(const cell of matching)for(const stage of ['source','formal'] as const)if(!inside(cell[stage+label+'NormalizedJacobianBounds'],js[stage]))fail();}
    }return {r,t};};
  [...new Set([...validation,...midpoints])].forEach(inspect);
  const suffixes=['Base','LeftDirector','RightDirector','BaseDerivative','LeftDirectorDerivative','RightDirectorDerivative'],
    rowKeys=['s',...suffixes.flatMap(k=>['source'+k,'target'+k,'normalizedSource'+k,'normalizedTarget'+k]),'targetTangent','targetLeftNormal','coefficients'],
    gridKeys=['s','sourceLeft','sourceRight','targetLeft','targetRight','normalizedSourceLeft','normalizedSourceRight','normalizedTargetLeft','normalizedTargetRight','sourceLeftEFG','sourceRightEFG','targetLeftEFG','targetRightEFG'];
  if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
  for(let i=0;i<parameters.length;i++){const s=parameters[i],{r,t}=inspect(s),row=raw.sample.rows[i],grid=raw.grid[i];if(!record(row)||!keys(row,rowKeys)||!near(row.s,s,q.parameterEnd-q.parameterStart,1e-12)||
    !nearV(row.targetTangent,t.tangent,1)||!nearV(row.targetLeftNormal,t.leftNormal,1)||!record(row.coefficients)||!keys(row.coefficients,['speed','normalizedSpeed','left','right'])||
    !near(row.coefficients.speed,r.speed*L,r.speed*L)||!near(row.coefficients.normalizedSpeed,r.speed,r.speed))fail();
    for(const side of ['left','right'] as const){const a=r[side],actual=row.coefficients[side],fields=['p','q','pPrime','qPrime','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','g'];
      if(!record(actual)||!keys(actual,fields))fail();for(const name of fields){const normalized=name.startsWith('normalized'),key=normalized?name[10].toLowerCase()+name.slice(11):name,
        value=a[key as keyof typeof a] as number,factor=name==='g'||normalized?1:L,natural=key==='g'?Math.abs(value):Math.max(1/L,Math.hypot(...a.directorPrime));
        if(!near(actual[name],value*factor,natural*factor))fail();}}
    for(const stage of ['Source','Target']){const f=stage==='Source'?r:t,values=[f.base,f.left.director,f.right.director,f.basePrime,f.left.directorPrime,f.right.directorPrime],
      naturals=[1,1/L,1/L,r.speed,Math.max(1/L,Math.hypot(...f.left.directorPrime)),Math.max(1/L,Math.hypot(...f.right.directorPrime))];
      suffixes.forEach((suffix,k)=>{if(!nearV(row['normalized'+stage+suffix],values[k],naturals[k])||!world(row[stage[0].toLowerCase()+stage.slice(1)+suffix],values[k],k===0?stage==='Source'?norm.sourceOrigin:norm.targetOrigin:null,naturals[k]))fail();});}
    if(!record(grid)||!keys(grid,gridKeys)||!near(grid.s,s,q.parameterEnd-q.parameterStart,1e-12))fail();
    for(const stage of ['source','target'])for(const side of ['left','right'] as const){const label=stage+(side==='left'?'Left':'Right'),f=stage==='source'?r:t,a=f[side];
      for(const key of [label,'normalized'+label[0].toUpperCase()+label.slice(1),label+'EFG'])if(!Array.isArray(grid[key])||grid[key].length!==q.rulingSegments+1)fail();
      for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments,p=add(f.base,a.director,w),m=metric(f.basePrime,a.director,a.directorPrime,w),
        bn=Math.hypot(...f.basePrime)+Math.abs(w)*Math.hypot(...a.directorPrime),natural=[bn*bn,bn/L,1/(L*L)];
        if(!nearV(grid['normalized'+label[0].toUpperCase()+label.slice(1)][j],p,1+Math.abs(w)/L)||!world(grid[label][j],p,stage==='source'?norm.sourceOrigin:norm.targetOrigin,1+Math.abs(w)/L)||
          !vector(grid[label+'EFG'][j],3)||m.some((v,k)=>!near(grid[label+'EFG'][j][k],v,natural[k])))fail();}}
  }
  const d=raw.diagnostics,c=raw.certification;if(!record(d)||!keys(d,['validationNodes','maximumFrameResidual','maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference',
    'leftSourceDevelopability','rightSourceDevelopability','sharedGeodesicCurvature','metricTolerance','integration'])||d.validationNodes!==129||d.metricTolerance!==2e-8||
    !finite(d.maximumFrameResidual)||d.maximumFrameResidual<0||frameResidual>d.maximumFrameResidual+2e-8||!finite(d.maximumLeftRelativeMetricDifference)||d.maximumLeftRelativeMetricDifference<0||
    !finite(d.maximumRightRelativeMetricDifference)||d.maximumRightRelativeMetricDifference<0||leftMetric>d.maximumLeftRelativeMetricDifference+2e-8||rightMetric>d.maximumRightRelativeMetricDifference+2e-8)fail();
  for(const [key,residual,method] of [['leftSourceDevelopability',leftDev,'literal-helix-closed-rule-triple-product'],['rightSourceDevelopability',rightDev,'literal-helix-closed-rule-triple-product'],
    ['sharedGeodesicCurvature',shared,'literal-helix-original-normalized-cross-frame']] as const){const e=d[key];if(!record(e)||!keys(e,['status','method','analyticIdentity','tolerance','maximumRelativeResidual'])||
    e.status!=='analytic'||e.analyticIdentity!==true||e.method!==method||e.tolerance!==2e-9||!finite(e.maximumRelativeResidual)||e.maximumRelativeResidual<0||residual>e.maximumRelativeResidual+2e-9)fail();}
  const integration=d.integration;if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','backwardEvaluations','forwardEvaluations','integrationErrorIntervalCertified'])||
    integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||integration.absoluteTolerance!==2e-14||integration.initialParameter!==q.parameterStart||
    integration.backwardEvaluations!==0||!Number.isInteger(integration.forwardEvaluations)||integration.forwardEvaluations<=0||integration.integrationErrorIntervalCertified!==false)fail();
  const certKeys=['finiteLeftMetricVerified','finiteRightMetricVerified','finiteSourceDevelopabilityVerified','finiteSharedGeodesicCurvatureVerified','leftSourceDevelopabilityAnalytic',
    'rightSourceDevelopabilityAnalytic','sharedGeodesicCurvatureAnalytic','sourceRegularityCertified','initialFrameCompatible','sourceLeftStripRegularityCertified','sourceRightStripRegularityCertified',
    'formalLeftStripRegularityCertified','formalRightStripRegularityCertified','formalCommonFlatteningCertified',...noCertificates];
  if(!record(c)||!keys(c,certKeys)||Object.values(c).some(x=>typeof x!=='boolean')||noCertificates.some(k=>c[k]!==false)||
    c.finiteLeftMetricVerified!==(d.maximumLeftRelativeMetricDifference<=d.metricTolerance)||c.finiteRightMetricVerified!==(d.maximumRightRelativeMetricDifference<=d.metricTolerance)||
    c.finiteSourceDevelopabilityVerified!==(Math.max(d.leftSourceDevelopability.maximumRelativeResidual,d.rightSourceDevelopability.maximumRelativeResidual)<=2e-9)||
    c.finiteSharedGeodesicCurvatureVerified!==(d.sharedGeodesicCurvature.maximumRelativeResidual<=2e-9)||
    !c.leftSourceDevelopabilityAnalytic||!c.rightSourceDevelopabilityAnalytic||!c.sharedGeodesicCurvatureAnalytic||!c.initialFrameCompatible||
    c.sourceRegularityCertified!==domain.certified||c.formalCommonFlatteningCertified!==domain.certified)fail();
  for(const stage of ['source','formal']){const strips=domain[stage+'StripRegularity'];if(!record(strips)||!keys(strips,['left','right']))fail();
    for(const side of ['left','right']){const label=stage+(side==='left'?'Left':'Right'),strip=strips[side],bounds=domain.cells.map((x:Record<string,any>)=>x[label+'NormalizedJacobianBounds']);
      if(!record(strip)||!keys(strip,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||!['verified','unknown','degenerate'].includes(strip.status)||
        c[label+'StripRegularityCertified']!==(strip.status==='verified'))fail();
      if(strip.status==='verified'){const orientation=strip.orientation;if(!domain.certified||![1,-1].includes(orientation)||strip.reason!==null||
        bounds.some((b:number[])=>orientation===1?b[0]<=0:b[1]>=0))fail();const minimum=Math.min(...bounds.map((b:number[])=>orientation===1?b[0]:-b[1]));
        if(!near(strip.minimumAbsoluteJacobianLowerBound,minimum,minimum,2e-12))fail();}
      else if(strip.orientation!==null||strip.minimumAbsoluteJacobianLowerBound!==null||typeof strip.reason!=='string')fail();
      if(witnesses[label as keyof typeof witnesses]&&strip.status!=='degenerate'||strip.status==='degenerate'&&!witnesses[label as keyof typeof witnesses])fail();}}
}

export async function fetchGenericNonuniformHelixWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericNonuniformHelixResult>{
  const query=validateGenericNonuniformHelixQuery(input);while(true){signal?.throwIfAborted();try{return parseGenericNonuniformHelixResult(await api('tessellation/curved-nonuniform-helix-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
