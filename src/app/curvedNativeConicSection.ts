import {api} from './api';
import {GenericTaylor} from './curvedGenericLinked';

export type ConicFocus=number|{infinity:-1|1};
type V2=[number,number];
type Bounds=[number,number];
export type GenericConicSectionQuery={family:'conic-section-2d-native';leftFocus:ConicFocus;rightFocus:ConicFocus;
  leftCross:number;rightCross:number;parameterRanges:Bounds[];segments:number};
export type ConicNativeBranch='line'|'circle'|'parabola-left'|'parabola-right'|'ellipse'|'hyperbola'|'degenerate-line';
export type GenericConicSectionResult={family:'origamica-conic-section-2d';query:GenericConicSectionQuery;
  source:{definitionCell:'In[4019]';optionsCell:'In[4018]';function:'ConicSection2DSystem';ruleKeys:string[];branch:ConicNativeBranch;
    simplification:'None';unreachableRepeatedCircleConditionPreserved:true;numericWolframOutAvailable:false;
    halfAngleContinuationApplied:false;parameterMeaning:'signed-length'|'angle-radians'};
  normalization:{origin:V2;scale:number};poleEnclosures:{kind:'literal-half-angle'|'fold-denominator';parameterEnclosure:Bounds}[];
  domain:{certified:boolean;roundingModel:string;evaluations:number;verifiedCells:number;cells:{rangeIndex:number;start:number;end:number;
    normalizedRuleBounds:[Bounds,Bounds][];normalizedFoldSpeedBounds:Bounds}[];unresolved:{rangeIndex:number;start:number;end:number}[];
    minimumNormalizedFoldSpeedLowerBound:number|null;foldRegularity:'verified'|'unknown';reason:string|null};
  components:{rangeIndex:number;parameterRange:Bounds;samples:{t:number;rules:V2[];derivatives:V2[];normalizedRules:V2[];normalizedDerivatives:V2[]}[]}[];
  diagnostics:{maximumRelativeImplicitConicResidual:number;maximumDirectorUnitError:number;maximumRayCollinearityResidual:number;
    maximumSquaredOpticalProjectionResidual:number};
  certification:{literalNineRulesEvaluated:true;independentRangesPreserved:true;finiteNumericalRulesVerified:true;fullOriginalDomainsCertified:boolean;
    selfCollisionVerified:false;motionVerified:false;sampledMeshExactFOLD:false;adoptableCreasePattern:false}};

export const CONIC_NATIVE_RULE_KEYS=['CurvedFold2D','DirectrixLeft2D','DirectorLeft2D','CrossCurveLeft2D','SecondCrossCurveLeft2D',
  'DirectrixRight2D','DirectorRight2D','CrossCurveRight2D','SecondCrossCurveRight2D'] as const;
export const CONIC_NATIVE_PRESET:GenericConicSectionQuery={family:'conic-section-2d-native',leftFocus:-2.5,rightFocus:-.75,
  leftCross:-1.2,rightCross:.9,parameterRanges:[[-.7,1]],segments:48};
export const CONIC_NATIVE_SAVED_PRESETS:GenericConicSectionQuery[]=[
  [{infinity:-1},{infinity:1},-1,1,Math.PI/2],[-1,-1,-.5,.5,Math.PI/2],
  [{infinity:-1},-1,-1.5,1.5,Math.PI/2],[-1,{infinity:1},-.5,1,Math.PI/2],
  [-2,-1,-1.5,1,Math.PI/2],[-2,1,-1.5,.5,Math.PI/4]
].map(row=>({family:'conic-section-2d-native',leftFocus:row[0] as ConicFocus,rightFocus:row[1] as ConicFocus,
  leftCross:row[2] as number,rightCross:row[3] as number,parameterRanges:[[0,row[4] as number]],segments:48}));

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
function fail():never{throw Error('原圆锥曲线的四参数、九规则、独立域或源证据回读不一致。');}
function focus(value:unknown,side:'left'|'right'):ConicFocus{
  if(record(value)&&keys(value,['infinity'])&&value.infinity===(side==='left'?-1:1))return {infinity:value.infinity};
  if(!finite(value)||value===0||Math.abs(value)>1e6)throw Error('焦点须为±10⁶内的非零有限实数，或左−∞／右+∞显式标签。');return value;
}
export function validateGenericConicSectionQuery(raw:unknown):GenericConicSectionQuery{
  if(!record(raw)||raw.family!=='conic-section-2d-native'||!keys(raw,['family','leftFocus','rightFocus','leftCross','rightCross','parameterRanges','segments']))
    throw Error('需完整四个原光学参数、所有独立闭域与显示密度。');
  const l=focus(raw.leftFocus,'left'),r=focus(raw.rightFocus,'right');
  if(!finite(raw.leftCross)||Math.abs(raw.leftCross)>1e6||!finite(raw.rightCross)||Math.abs(raw.rightCross)>1e6)
    throw Error('hL/hR须为±10⁶内的有限实数，符号和顺序不限。');
  if(!Array.isArray(raw.parameterRanges)||raw.parameterRanges.length<1||raw.parameterRanges.length>4||
    raw.parameterRanges.some(x=>!vector(x,2)||x[0]< -10||x[1]>10||x[1]-x[0]<.01||x[1]-x[0]>12))throw Error('须有1–4个独立递增闭域，各在−10…10内、跨度0.01–12。');
  const ranges=raw.parameterRanges as Bounds[];
  if(ranges.some((a,i)=>ranges.slice(i+1).some(b=>Math.max(a[0],b[0])<=Math.min(a[1],b[1]))))throw Error('独立闭域不能重叠；输入域索引和次序保留。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128)throw Error('每域显示段数须为8–128。');
  return {...raw,leftFocus:l,rightFocus:r,parameterRanges:ranges.map(x=>x.slice())} as GenericConicSectionQuery;
}
const branchOf=(q:GenericConicSectionQuery):ConicNativeBranch=>typeof q.leftFocus==='object'?
  typeof q.rightFocus==='object'?'line':'parabola-left':typeof q.rightFocus==='object'?'parabola-right':
  q.leftFocus===q.rightFocus?'circle':(q.leftFocus>0)===(q.rightFocus>0)?'ellipse':q.leftFocus+q.rightFocus===0?'degenerate-line':'hyperbola';
const positional=(i:number)=>![2,6].includes(i);
const scaleOf=(q:GenericConicSectionQuery,b:ConicNativeBranch)=>Math.max(Math.abs(q.leftCross),Math.abs(q.rightCross),
  typeof q.leftFocus==='number'?Math.abs(q.leftFocus):0,typeof q.rightFocus==='number'?Math.abs(q.rightFocus):0,
  ...(['line','parabola-left','parabola-right'].includes(b)?q.parameterRanges.flat().map(Math.abs):[]));
const near=(x:unknown,y:number,reference=Math.abs(y),tolerance=2e-8)=>finite(x)&&Math.abs(x-y)<=tolerance*Math.max(Math.abs(y),reference,Number.MIN_VALUE);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:number[],b:number[])=>a[0]*b[1]-a[1]*b[0];
const sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]);
const sumExact=(numbers:number[])=>{const partials:number[]=[];for(let x of numbers){let i=0;for(let y of partials){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;
}partials.length=i;partials.push(x);}return partials.reduceRight((s,x)=>s+x,0);};

/** Independent Taylor evaluation of all nine literal rules, not a saved-case table. */
function evaluate(q:GenericConicSectionQuery,branch:ConicNativeBranch,scale:number,s:number){
  const t=new GenericTaylor([s,1]),zero=t.constant(0),l=typeof q.leftFocus==='number'?q.leftFocus/scale:0,
    r=typeof q.rightFocus==='number'?q.rightFocus/scale:0,h=q.leftCross/scale,k=q.rightCross/scale,
    [sin,cos]=t.sincos(),[sh,ch]=t.div(2).sincos();
  let f:GenericTaylor[],L:GenericTaylor[],d:GenericTaylor[],E:GenericTaylor[],R:GenericTaylor[],e:GenericTaylor[],H:GenericTaylor[];
  if(branch==='line'){const y=t.div(scale);f=[zero,y];L=E=[zero.add(h),y];R=H=[zero.add(k),y];d=e=[zero.sub(1),zero];}
  else if(branch==='circle'){
    f=[sh.mul(sh).mul(2*l),sin.mul(-l)];L=R=[zero.add(l),zero];d=e=[cos.neg(),sin.neg()];
    E=[cos.mul(h-l).add(l),sin.mul(h-l)];H=[cos.mul(k-l).add(l),sin.mul(k-l)];
  }else if(branch==='parabola-left'||branch==='parabola-right'){
    const y=t.div(scale),a=branch==='parabola-left'?r:l,z=y.mul(y).add(4*a*a),offset=branch==='parabola-left'?k:h,
      fixed=[zero.add(a),zero],direction=[zero.add(1).sub(z.inv().mul(8*a*a)),y.mul(4*a).div(z)],
      second=[y.mul(y).mul(2*a-offset).add(4*a*a*offset).div(z),y.mul(4*a*(a-offset)).div(z)];
    f=[y.mul(y).div(4*a),y];if(branch==='parabola-left'){L=E=[zero.add(h),y];d=[zero.sub(1),zero];R=fixed;e=direction;H=second;}
    else{R=H=[zero.add(k),y];e=[zero.sub(1),zero];L=fixed;d=direction;E=second;}
  }else{
    const z=sh.mul(sh).mul(2*l).add(ch.mul(ch).mul(2*r)),v=t.div(2).tan(),D=v.mul(v).mul(l*l).add(r*r);
    f=[sh.mul(sh).mul(2*l*(l+r)).div(z),sin.mul(-2*l*r).div(z)];L=[zero.add(l),zero];d=[cos.neg(),sin.neg()];
    E=[cos.mul(h-l).add(l),sin.mul(h-l)];R=[zero.add(r),zero];e=[zero.add(1).sub(D.inv().mul(2*r*r)),v.mul(-2*l*r).div(D)];
    H=[D.inv().mul(r*(k-r)).add(1).mul(2*r).sub(k),v.mul(2*l*r*(k-r)).div(D)];
  }
  const jets=[f,L,d,L,E,R,e,R,H],values=jets.map(row=>row.map(x=>x.c[0])),derivatives=jets.map(row=>row.map(x=>x.c[1]));
  if(!values.concat(derivatives).flat().every(finite))fail();
  const arithmetic=values.map(row=>row.map(Math.abs));
  // Only cancellation terms receive an arithmetic ULP allowance; small sine
  // components and small source geometry keep their own relative scale.
  for(const i of [4,8])arithmetic[i][0]+=Math.abs(i===4?l:r)+Math.abs(i===4?h:k);
  arithmetic[6][0]+=2;
  return {values,derivatives,arithmetic};
}
function residuals(q:GenericConicSectionQuery,branch:ConicNativeBranch,scale:number,values:number[][],prime:number[]){
  const [x,y]=values[0],l=typeof q.leftFocus==='number'?q.leftFocus/scale:0,r=typeof q.rightFocus==='number'?q.rightFocus/scale:0;
  let implicit=0;
  if(branch==='line')implicit=Math.abs(x);
  else{
    let terms:number[];if(branch==='parabola-left'||branch==='parabola-right')terms=[4*(branch==='parabola-left'?r:l)*x,-y*y];
    else{const local=Math.max(Math.abs(l),Math.abs(r),Math.abs(x),Math.abs(y)),a=l/local,b=r/local,z=x/local,w=y/local;
      terms=[4*a*b*z*z,-4*a*b*(a+b)*z,(a+b)**2*w*w];}
    const den=terms.reduce((n,x)=>n+Math.abs(x),0);implicit=den?Math.abs(sumExact(terms))/den:0;
  }
  let unit=0,collinearity=0;
  for(const [base,second,d] of [[values[1],values[4],values[2]],[values[5],values[8],values[6]]]){
    unit=Math.max(unit,Math.abs(Math.hypot(...d)-1));for(const point of [values[0],second]){
      const ray=sub(point,base),den=Math.hypot(...ray);collinearity=Math.max(collinearity,den?Math.abs(cross(ray,d))/den:0);}}
  const speed=Math.hypot(...prime),t=prime.map(x=>speed?x/speed:0);
  return [implicit,unit,collinearity,Math.abs(dot(t,values[2])**2-dot(t,values[6])**2)];
}
const bounded=(x:unknown):x is Bounds=>vector(x,2)&&x[0]<=x[1];
const inBounds=(x:Bounds,y:number,reference=Math.abs(y))=>y>=x[0]-2e-8*Math.max(reference,Number.MIN_VALUE)&&y<=x[1]+2e-8*Math.max(reference,Number.MIN_VALUE);

export function parseGenericConicSectionResult(input:unknown,request?:unknown):GenericConicSectionResult{
  if(!record(input)||input.family!=='origamica-conic-section-2d'||!keys(input,['family','query','source','normalization','domain','poleEnclosures','components','diagnostics','certification']))fail();
  const q=validateGenericConicSectionQuery(input.query);if(request){const expected=validateGenericConicSectionQuery(request);
    if(Object.keys(expected).some(k=>JSON.stringify(q[k as keyof GenericConicSectionQuery])!==JSON.stringify(expected[k as keyof GenericConicSectionQuery])))fail();}
  const branch=branchOf(q),scale=scaleOf(q,branch),src=input.source,n=input.normalization,c=input.certification,diag=input.diagnostics;
  if(!record(src)||!keys(src,['definitionCell','optionsCell','function','ruleKeys','branch','simplification','unreachableRepeatedCircleConditionPreserved','numericWolframOutAvailable','halfAngleContinuationApplied','parameterMeaning'])||
    src.definitionCell!=='In[4019]'||src.optionsCell!=='In[4018]'||src.function!=='ConicSection2DSystem'||src.branch!==branch||src.simplification!=='None'||
    JSON.stringify(src.ruleKeys)!==JSON.stringify(CONIC_NATIVE_RULE_KEYS)||src.unreachableRepeatedCircleConditionPreserved!==true||src.numericWolframOutAvailable!==false||
    src.halfAngleContinuationApplied!==false||src.parameterMeaning!==( ['line','parabola-left','parabola-right'].includes(branch)?'signed-length':'angle-radians'))fail();
  if(!record(n)||!keys(n,['origin','scale'])||!vector(n.origin,2)||n.origin.some(x=>x!==0)||!near(n.scale,scale,scale,2e-12))fail();
  if(!record(c)||!keys(c,['literalNineRulesEvaluated','independentRangesPreserved','finiteNumericalRulesVerified','fullOriginalDomainsCertified','selfCollisionVerified','motionVerified','sampledMeshExactFOLD','adoptableCreasePattern'])||
    ['literalNineRulesEvaluated','independentRangesPreserved','finiteNumericalRulesVerified'].some(k=>c[k]!==true)||
    ['selfCollisionVerified','motionVerified','sampledMeshExactFOLD','adoptableCreasePattern'].some(k=>c[k]!==false))fail();
  const diagnosticKeys=['maximumRelativeImplicitConicResidual','maximumDirectorUnitError','maximumRayCollinearityResidual','maximumSquaredOpticalProjectionResidual'];
  if(!record(diag)||!keys(diag,diagnosticKeys)||diagnosticKeys.some(k=>!finite(diag[k])||diag[k]<0)||!Array.isArray(input.components)||input.components.length!==q.parameterRanges.length)fail();
  const maximum=[0,0,0,0];
  for(let index=0;index<q.parameterRanges.length;index++){
    const pair=q.parameterRanges[index],component=input.components[index];if(!record(component)||!keys(component,['rangeIndex','parameterRange','samples'])||component.rangeIndex!==index||
      JSON.stringify(component.parameterRange)!==JSON.stringify(pair)||!Array.isArray(component.samples)||component.samples.length!==q.segments+1)fail();
    for(let j=0;j<=q.segments;j++){
      const t=j===q.segments?pair[1]:pair[0]+(pair[1]-pair[0])*j/q.segments,row=component.samples[j],p=evaluate(q,branch,scale,t);
      if(!record(row)||!keys(row,['t','rules','derivatives','normalizedRules','normalizedDerivatives'])||!near(row.t,t,Math.abs(pair[0])+Math.abs(pair[1]),2e-14))fail();
      for(const key of ['rules','derivatives','normalizedRules','normalizedDerivatives']){
        if(!Array.isArray(row[key])||row[key].length!==9||row[key].some((x:unknown)=>!vector(x,2)))fail();
        const derivative=key.includes('erivatives'),normalized=key.startsWith('normalized'),expected=derivative?p.derivatives:p.values;
        for(let k=0;k<9;k++)for(let i=0;i<2;i++){
          const units=!normalized&&positional(k)?scale:1,value=expected[k][i]*units,
            rounding=derivative?128*Number.EPSILON*Math.abs(value):128*Number.EPSILON*p.arithmetic[k][i]*units;
          if(Math.abs(row[key][k][i]-value)>2e-8*Math.abs(value)+rounding+Number.MIN_VALUE)fail();}
      }
      residuals(q,branch,scale,p.values,p.derivatives[0]).forEach((x,k)=>{maximum[k]=Math.max(maximum[k],x);});
    }
  }
  if(diagnosticKeys.some((key,i)=>!near(diag[key],maximum[i],1,2e-12)))fail();
  validatePoles(input.poleEnclosures,q,branch);
  validateDomain(input.domain,q,branch,scale);if(c.fullOriginalDomainsCertified!==input.domain.certified)fail();
  return input as GenericConicSectionResult;
}

function validatePoles(raw:unknown,q:GenericConicSectionQuery,branch:ConicNativeBranch){
  if(!Array.isArray(raw))fail();const expected:{kind:string;t:number}[]=[];
  if(['ellipse','hyperbola','degenerate-line'].includes(branch)){
    for(let k=-3;k<3;k++)expected.push({kind:'literal-half-angle',t:Math.PI+2*k*Math.PI});
    const l=q.leftFocus as number,r=q.rightFocus as number;
    if((l>0)!==(r>0)){const a=2*Math.atan2(Math.sqrt(Math.abs(r)),Math.sqrt(Math.abs(l)));
      for(let k=-3;k<3;k++)for(const sign of [-1,1])expected.push({kind:'fold-denominator',t:sign*a+2*k*Math.PI});}
  }
  const points=expected.filter(x=>x.t>= -10&&x.t<=10).sort((a,b)=>a.t-b.t);if(raw.length!==points.length)fail();
  for(let i=0;i<points.length;i++){const item=raw[i],e=points[i];if(!record(item)||!keys(item,['kind','parameterEnclosure'])||item.kind!==e.kind||!bounded(item.parameterEnclosure)||
    item.parameterEnclosure[1]-item.parameterEnclosure[0]>32*Number.EPSILON*Math.abs(e.t)||
    !inBounds(item.parameterEnclosure,e.t,Math.abs(e.t)*Number.EPSILON))fail();
    if(q.parameterRanges.some(([a,b])=>a<item.parameterEnclosure[0]&&item.parameterEnclosure[1]<b))fail();}
}
function validateDomain(raw:unknown,q:GenericConicSectionQuery,branch:ConicNativeBranch,scale:number){
  if(!record(raw)||!keys(raw,['certified','roundingModel','evaluations','verifiedCells','cells','unresolved','minimumNormalizedFoldSpeedLowerBound','foldRegularity','reason'])||
    typeof raw.certified!=='boolean'||raw.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||!Number.isInteger(raw.evaluations)||raw.evaluations<1||raw.evaluations>1024||
    !Number.isInteger(raw.verifiedCells)||!Array.isArray(raw.cells)||raw.cells.length!==raw.verifiedCells||raw.cells.length>raw.evaluations||!Array.isArray(raw.unresolved)||raw.unresolved.length>1024||
    raw.certified!==(raw.unresolved.length===0)||raw.reason!==(raw.certified?null:'complete original domains retained; interval subdivision budget unresolved'))fail();
  const pieces:Bounds[][]=q.parameterRanges.map(()=>[]),range=(cell:Record<string,any>)=>{
    if(!Number.isInteger(cell.rangeIndex)||cell.rangeIndex<0||cell.rangeIndex>=pieces.length||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end)fail();
    const pair=q.parameterRanges[cell.rangeIndex];if(cell.start<pair[0]||cell.end>pair[1])fail();pieces[cell.rangeIndex].push([cell.start,cell.end]);};
  for(const cell of raw.cells){
    if(!record(cell)||!keys(cell,['rangeIndex','start','end','normalizedRuleBounds','normalizedFoldSpeedBounds'])||!Array.isArray(cell.normalizedRuleBounds)||cell.normalizedRuleBounds.length!==9||
      cell.normalizedRuleBounds.some((row:unknown)=>!Array.isArray(row)||row.length!==2||row.some(x=>!bounded(x)))||!bounded(cell.normalizedFoldSpeedBounds)||cell.normalizedFoldSpeedBounds[0]<0)fail();
    range(cell);const p=evaluate(q,branch,scale,(cell.start+cell.end)/2);
    for(let k=0;k<9;k++)for(let i=0;i<2;i++)if(!inBounds(cell.normalizedRuleBounds[k][i],p.values[k][i],p.arithmetic[k][i]))fail();
    if(!inBounds(cell.normalizedFoldSpeedBounds,Math.hypot(...p.derivatives[0])))fail();
  }
  for(const cell of raw.unresolved){if(!record(cell)||!keys(cell,['rangeIndex','start','end']))fail();range(cell);}
  pieces.forEach((rows,i)=>{rows.sort((a,b)=>a[0]-b[0]);let edge=q.parameterRanges[i][0],ref=q.parameterRanges[i].reduce((a,b)=>a+Math.abs(b),0);
    for(const pair of rows){if(!near(pair[0],edge,ref,2e-14))fail();edge=pair[1];}if(!rows.length||!near(edge,q.parameterRanges[i][1],ref,2e-14))fail();});
  const minimum=raw.certified?Math.min(...raw.cells.map((x:Record<string,any>)=>x.normalizedFoldSpeedBounds[0])):null;
  if(minimum===null?raw.minimumNormalizedFoldSpeedLowerBound!==null:!near(raw.minimumNormalizedFoldSpeedLowerBound,minimum,minimum,2e-14)||
    raw.foldRegularity!==(minimum>0?'verified':'unknown'))fail();
  if(minimum===null&&raw.foldRegularity!=='unknown')fail();
}

export async function fetchGenericConicSectionWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericConicSectionResult>{
  const query=validateGenericConicSectionQuery(input);
  while(true){signal?.throwIfAborted();try{return parseGenericConicSectionResult(await api('tessellation/curved-conic-section-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
