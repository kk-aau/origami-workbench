import {api} from './api';
import {validateNDSolveStepOptions,type NDSolveStepOptions} from './curvedNDSolveOptions';
import {validateLinkedFirst3DIntegration,type LinkedFirst3DIntegration} from './curvedLinkedNDSolveOptions';
import {validateExternalCurve2DSystems,type Curve2DSystemsOption,type Curve2DSystemsStamp,type Curve2DSystemsMode} from './curvedCurve2DSystems';
import type {LinkedCommonRow} from './curvedLinkedCommonParameter';

export type GenericLinkedRow=LinkedCommonRow&{normalizedFlatCurves:number[][];normalizedFlatDerivatives:number[][];
  normalizedFoldedCurves:number[][];normalizedFoldedDerivatives:number[][]};

export type GenericNativeCurve={x:string;y:string;parameterMin:number;parameterMax:number};
export type GenericLinkedQuery={family:'linked-concentric-first-band';variant:'generic-common-parameter';
  curves:GenericNativeCurve[];q0Expression:string;q1Expression:string;gamma0Expression:string;
  rootSeeds:number[];parameterStart:number;parameterEnd:number;segments:number;curve2DSystems?:Curve2DSystemsOption;curve2DSystemsMode?:Curve2DSystemsMode;ndsolveOptions?:NDSolveStepOptions};
export type GenericLinkedResult={family:'linked-generic-common-parameter';query:GenericLinkedQuery;first3DIntegration?:LinkedFirst3DIntegration;curve2DSystems?:Curve2DSystemsStamp;independentRules?:{mode:'independent-external';sourceIdentityAsserted:false;ruleDomains:number[][];
  initialState:number[];metricCompatibilityVerified:boolean;trajectoryMethod:string;rawImportedValuesPreserved:true};
  source:{notebookRows:number[];savedNumericalOut:false;savedPhysicalInputsPreserved:false;
    parameterContract:string;formulaCorrections:string[];method:string};
  diagnostics:{validationNodes:number;maxFrameGramError:number;maxMetricError:number;maxDevelopabilityError:number;
    maxGeodesicError:number;parameterDomain:{certified:true;evaluations:number;verifiedCells:number;
      minimumSpeedLowerBound:number;minimumTransverseLowerBound:number;minimumRootDerivativeLowerBound:number;
      minimumMonotonicityDeterminantLowerBound:number;planarPaperInjective:boolean;roundingModel:string;
      rootMethod:string;seamMethod:string;seamChecks:number;minimumSeamRootDerivativeLowerBound:number;paperMethod:string;paperAxes:number[][];bandWidths:number[];
      rootCharts:{start:number;end:number;seeds:number[];rootBounds:number[][]}[];coordinateNormalization:{origin:number[];scale:number}}};
  certification:{bandCount:number;singleCommonParameter:true;isometryIdentitiesApplied:boolean;
    finiteNumericalMetricVerified:boolean;fullIntervalRegularityCertified:boolean;planarPaperInjectivityCertified:boolean;
    allBandsAnalyticLocalIsometry:boolean;globalBoundaryInjectivityChecked:boolean;originalSavedFormulaReplayed:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;selfCollisionChecked:false;
    continuousFoldPathChecked:false;integrationErrorIntervalCertified:false};sample:{rows:GenericLinkedRow[]}};

export const GENERIC_LINKED_PRESET:GenericLinkedQuery={family:'linked-concentric-first-band',variant:'generic-common-parameter',
  curves:[0,.2,.4].map(y=>({x:'u',y:`0.3*u**2+${y.toFixed(1)}`,parameterMin:-1,parameterMax:2})),
  q0Expression:'s+0.03*sin(s)',q1Expression:'s+0.02*sin(2*s)',gamma0Expression:'1.8+0.1*sin(s)',
  rootSeeds:[0],parameterStart:0,parameterEnd:.35,segments:32};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const keys=(x:Record<string,unknown>,k:string[])=>Object.keys(x).length===k.length&&k.every(v=>Object.hasOwn(x,v));
const close=(a:number,b:number,tolerance=2e-8)=>Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
const sumExact=(numbers:number[])=>{const partials:number[]=[];for(let x of numbers){let i=0;
  for(let y of partials){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}partials.length=i;partials.push(x);
  }return partials.reduceRight((s,x)=>s+x,0);};
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]);
const mix=(a:number[],b:number[],v:number)=>a.map((x,i)=>(1-v)*x+v*b[i]);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normal=(a:number[])=>{const n=Math.hypot(...a);if(n<=1e-12)fail();return a.map(x=>x/n);};
function fail():never{throw Error('通用关联曲线的表达式、原生根、单纸来源或几何回读不一致。');}

/** No eval/Function: a small, independent scalar parser and Taylor evaluator. */
export class GenericTaylor{
  constructor(readonly c:number[]){}
  constant(x:number){return new GenericTaylor([x,...this.c.slice(1).map(()=>0)]);}
  other(x:number|GenericTaylor){return typeof x==='number'?this.constant(x):x;}
  add(x:number|GenericTaylor){const b=this.other(x);return new GenericTaylor(this.c.slice(0,b.c.length).map((v,i)=>v+b.c[i]));}
  neg(){return new GenericTaylor(this.c.map(x=>-x));}
  sub(x:number|GenericTaylor){return this.add(this.other(x).neg());}
  mul(x:number|GenericTaylor){const b=this.other(x),n=Math.min(this.c.length,b.c.length);
    return new GenericTaylor(Array.from({length:n},(_,j)=>this.c.slice(0,j+1).reduce((s,v,k)=>s+v*b.c[j-k],0)));}
  inv(){if(this.c[0]===0||!Number.isFinite(1/this.c[0]))fail();const c=[1/this.c[0]];
    for(let n=1;n<this.c.length;n++)c.push(-this.c.slice(1,n+1).reduce((s,v,k)=>s+v*c[n-k-1],0)/this.c[0]);return new GenericTaylor(c);}
  div(x:number|GenericTaylor){return this.mul(this.other(x).inv());}
  pow(n:number):GenericTaylor{if(n<0)return this.inv().pow(-n);let x=this.constant(1);for(let i=0;i<n;i++)x=x.mul(this);return x;}
  derivative(){if(this.c.length<2)fail();return new GenericTaylor(this.c.slice(1).map((x,i)=>x*(i+1)));}
  sincos(){const s=[Math.sin(this.c[0])],c=[Math.cos(this.c[0])];for(let n=1;n<this.c.length;n++){
    s.push(this.c.slice(1,n+1).reduce((v,x,k)=>v+(k+1)*x*c[n-k-1],0)/n);
    c.push(-this.c.slice(1,n+1).reduce((v,x,k)=>v+(k+1)*x*s[n-k-1],0)/n);
  }return [new GenericTaylor(s),new GenericTaylor(c)] as const;}
  tan(){const [s,c]=this.sincos();return s.div(c);}
  atan(){if(this.c.length===1)return new GenericTaylor([Math.atan(this.c[0])]);
    const d=this.derivative().div(this.mul(this).add(1));return new GenericTaylor([Math.atan(this.c[0]),...d.c.map((x,i)=>x/(i+1))]);}
  sqrt(){if(this.c[0]<=0)fail();const c=[Math.sqrt(this.c[0])];for(let n=1;n<this.c.length;n++)
    c.push((this.c[n]-c.slice(1,n).reduce((s,x,k)=>s+x*c[n-k-1],0))/(2*c[0]));return new GenericTaylor(c);}
  exp(){const c=[Math.exp(this.c[0])];for(let n=1;n<this.c.length;n++)
    c.push(this.c.slice(1,n+1).reduce((s,x,k)=>s+(k+1)*x*c[n-k-1],0)/n);return new GenericTaylor(c);}
  log(){if(this.c[0]<=0)fail();if(this.c.length===1)return new GenericTaylor([Math.log(this.c[0])]);
    const d=this.derivative().div(this);return new GenericTaylor([Math.log(this.c[0]),...d.c.map((x,i)=>x/(i+1))]);}
}
type Node={kind:'constant';value:number}|{kind:'variable'}|{kind:'unary';minus:boolean;a:Node}|
  {kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
type AffineParts={offsets:number[];dynamic:GenericTaylor};
type CompiledExpression=((u:GenericTaylor)=>GenericTaylor)&{parts:(u:GenericTaylor)=>AffineParts};

export function compileGenericExpression(source:string,variable:'u'|'s'):CompiledExpression{
  if(typeof source!=='string'||!source.length||source.length>240)throw Error('表达式须为 1–240 字符。');
  const tokens:string[]=[],names:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'};let offset=0;
  while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
    if(!m){if(source.slice(offset).trim()==='')break;throw Error('表达式包含不允许的字符。');}
    const token=names[m[1]]??m[1],previous=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);
    if(previous&&(word(previous)||previous===')')&&(word(token)||token==='(')&&!(['sin','cos','tan','atan','sqrt','exp','log'].includes(previous)&&token==='('))tokens.push('*');
    tokens.push(token);offset+=m[0].length;}
  let position=0,count=0;
  const peek=()=>tokens[position],take=()=>tokens[position++];
  const node=<T extends Node>(x:T):T=>{if(++count>96)throw Error('表达式过于复杂。');return x;};
  const integer=(n:Node):number=>{if(n.kind==='constant'&&Number.isInteger(n.value))return n.value;
    if(n.kind==='unary'&&n.a.kind==='constant'&&Number.isInteger(n.a.value))return n.minus?-n.a.value:n.a.value;
    throw Error('** 只允许 −8…8 的整数常数幂。');};
  const atom=():Node=>{const t=take();if(t==='('){const x=add();if(take()!==')')throw Error('表达式括号不匹配。');return x;}
    if(/^(?:\d|\.)/.test(t??'')){const v=Number(t);if(!finite(v)||Math.abs(v)>1e12)throw Error('表达式常数超出范围。');return node({kind:'constant',value:v});}
    if(t===variable)return node({kind:'variable'});
    if(t==='pi'||t==='e')return node({kind:'constant',value:t==='pi'?Math.PI:Math.E});
    if(['sin','cos','tan','atan','sqrt','exp','log'].includes(t)&&take()==='('){const a=add();if(take()!==')')throw Error('函数须使用一个标量参数。');return node({kind:'call',name:t,a});}
    throw Error(`只允许变量 ${variable}、pi/e 与白名单标量函数。`);};
  const power=():Node=>{let a=atom();if(peek()==='**'){take();const b=unary();if(Math.abs(integer(b))>8)throw Error('整数幂超出 −8…8。');a=node({kind:'binary',op:'**',a,b});}return a;};
  const unary=():Node=>{if(peek()==='+'||peek()==='-'){const minus=take()==='-';return node({kind:'unary',minus,a:unary()});}return power();};
  const multiply=():Node=>{let a=unary();while(peek()==='*'||peek()==='/'){const op=take();a=node({kind:'binary',op,a,b:unary()});}return a;};
  const add=():Node=>{let a=multiply();while(peek()==='+'||peek()==='-'){const op=take();a=node({kind:'binary',op,a,b:multiply()});}return a;};
  const ast=add();if(position!==tokens.length)throw Error('表达式包含未使用的语法。');
  const evaluate=(u:GenericTaylor)=>{const visit=(n:Node):GenericTaylor=>{if(n.kind==='constant')return u.constant(n.value);if(n.kind==='variable')return u;
    if(n.kind==='unary'){const a=visit(n.a);return n.minus?a.neg():a;}if(n.kind==='call'){const a=visit(n.a);
      if(n.name==='sin')return a.sincos()[0];if(n.name==='cos')return a.sincos()[1];return a[n.name as 'tan'|'atan'|'sqrt'|'exp'|'log']();}
    const a=visit(n.a);if(n.op==='**')return a.pow(integer(n.b));const b=visit(n.b);
    return n.op==='+'?a.add(b):n.op==='-'?a.sub(b):n.op==='*'?a.mul(b):a.div(b);};
    const r=visit(ast);if(!r.c.every(finite))fail();return r;};
  const parts=(u:GenericTaylor):AffineParts=>{
    type Parts={offsets:number[];dynamic:GenericTaylor|null};
    const dynamicAdd=(a:GenericTaylor|null,b:GenericTaylor|null)=>a===null?b:b===null?a:a.add(b),total=(p:Parts)=>(p.dynamic??u.constant(0)).add(sumExact(p.offsets));
    const multiply=(a:Parts,b:Parts):Parts=>{let offsets=a.offsets.flatMap(x=>b.offsets.map(y=>x*y));let dynamic:GenericTaylor|null=null;
      if(a.dynamic)dynamic=a.dynamic.mul(sumExact(b.offsets));if(b.dynamic)dynamic=dynamicAdd(dynamic,b.dynamic.mul(sumExact(a.offsets)));
      if(a.dynamic&&b.dynamic)dynamic=dynamicAdd(dynamic,a.dynamic.mul(b.dynamic));if(offsets.length>256)offsets=[sumExact(offsets)];return {offsets,dynamic};};
    const visit=(n:Node):Parts=>{if(n.kind==='constant')return {offsets:[n.value],dynamic:null};if(n.kind==='variable')return {offsets:[],dynamic:u};
      if(n.kind==='unary'){const p=visit(n.a);return n.minus?{offsets:p.offsets.map(x=>-x),dynamic:p.dynamic?.neg()??null}:p;}
      if(n.kind==='call'){const x=total(visit(n.a)),dynamic=n.name==='sin'?x.sincos()[0]:n.name==='cos'?x.sincos()[1]:x[n.name as 'tan'|'atan'|'sqrt'|'exp'|'log']();return {offsets:[],dynamic};}
      const a=visit(n.a);if(n.op==='**'){const exponent=integer(n.b);if(exponent<0)return {offsets:[],dynamic:total(a).pow(exponent)};
        let r:Parts={offsets:[1],dynamic:null};for(let k=0;k<exponent;k++)r=multiply(r,a);return r;}
      const b=visit(n.b);
      if(n.op==='+')return {offsets:[...a.offsets,...b.offsets],dynamic:dynamicAdd(a.dynamic,b.dynamic)};
      if(n.op==='-')return {offsets:[...a.offsets,...b.offsets.map(x=>-x)],dynamic:dynamicAdd(a.dynamic,b.dynamic?.neg()??null)};
      if(n.op==='*')return multiply(a,b);
      if(b.dynamic===null){const denominator=sumExact(b.offsets);if(denominator===0)fail();return {offsets:a.offsets.map(x=>x/denominator),dynamic:a.dynamic?.div(denominator)??null};}
      return {offsets:[],dynamic:total(a).div(total(b))};};
    const p=visit(ast);return {offsets:p.offsets,dynamic:p.dynamic??u.constant(0)};
  };
  return Object.assign(evaluate,{parts});
}

export function validateGenericLinkedQuery(raw:unknown):GenericLinkedQuery{
  if(!record(raw)||raw.family!==GENERIC_LINKED_PRESET.family||raw.variant!==GENERIC_LINKED_PRESET.variant||
    Object.keys(raw).some(k=>k!=='curve2DSystems'&&k!=='curve2DSystemsMode'&&k!=='ndsolveOptions'&&!Object.hasOwn(GENERIC_LINKED_PRESET,k)))throw Error('通用关联曲线类型或字段无效。');
  const q={...GENERIC_LINKED_PRESET,...raw};
  if(!Array.isArray(q.curves)||q.curves.length<3||q.curves.length>6)throw Error('原生曲线须为 3–6 条。');
  q.curves=q.curves.map((c:unknown)=>{if(!record(c)||!keys(c,['x','y','parameterMin','parameterMax'])||
    !finite(c.parameterMin)||!finite(c.parameterMax)||c.parameterMin< -20||c.parameterMax>20||c.parameterMax-c.parameterMin<.02)throw Error('原生域须在 −20…20 内且长度≥0.02。');
    compileGenericExpression(c.x,'u');compileGenericExpression(c.y,'u');return {...c} as GenericNativeCurve;});
  const mode=q.curve2DSystemsMode??'verified-same-source';if(mode!=='verified-same-source'&&mode!=='independent-external')throw Error('外部系统模式无效。');
  if(Object.hasOwn(q,'curve2DSystems'))q.curve2DSystems=validateExternalCurve2DSystems(q.curve2DSystems,q.curves,mode);
  else if(mode==='independent-external')throw Error('独立模式须显式提供外部规则或Automatic。');
  for(const k of ['q0Expression','q1Expression','gamma0Expression'] as const)compileGenericExpression(q[k],'s');
  if(!vector(q.rootSeeds,q.curves.length-2)||q.rootSeeds.some((v:number,i:number)=>v<=q.curves[i+2].parameterMin||v>=q.curves[i+2].parameterMax))throw Error('后续曲线的每个起点根种子须位于原生域内。');
  if(!finite(q.parameterStart)||!finite(q.parameterEnd)||q.parameterStart< -10||q.parameterEnd>10||q.parameterEnd-q.parameterStart<.01||q.parameterEnd-q.parameterStart>6)throw Error('共同 s 区间长度须为 0.01–6，范围 −10…10。');
  if(!finite(q.segments)||!Number.isInteger(q.segments)||q.segments<8||q.segments>128)throw Error('显示段数须为 8–128 整数。');
  return {...q,rootSeeds:q.rootSeeds.slice(),...(Object.hasOwn(q,'ndsolveOptions')?{ndsolveOptions:validateNDSolveStepOptions(q.ndsolveOptions,q.parameterEnd-q.parameterStart)}:{})} as GenericLinkedQuery;
}

const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const ts=(a:GenericTaylor[],b:GenericTaylor[])=>a.map((x,i)=>x.sub(b[i]));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>a[0].mul(b[1]).sub(a[1].mul(b[0]));
function makeEvaluator(query:GenericLinkedQuery){
  const systems=Array.isArray(query.curve2DSystems)?query.curve2DSystems.map(system=>['Speed2D','LeftCurvature2D','TangentVector2D','LeftNormalVector2D'].map(key=>system.rules.find(row=>row.key===key)!.expressions.map(source=>compileGenericExpression(source,'u')))):[];
  const native=query.curves.map(c=>[compileGenericExpression(c.x,'u'),compileGenericExpression(c.y,'u')]);
  const functions=[query.q0Expression,query.q1Expression,query.gamma0Expression].map(x=>compileGenericExpression(x,'s'));
  const start=new GenericTaylor([query.parameterStart,1,0]),startQ=[functions[0](start),functions[1](start)],
    originParts=native[0].map(fn=>fn.parts(startQ[0])),origin=originParts.map(p=>sumExact(p.offsets)+p.dynamic.c[0]),
    secondParts=native[1].map(fn=>fn.parts(startQ[1])),difference=secondParts.map((p,k)=>sumExact([...p.offsets,...originParts[k].offsets.map(x=>-x)])+p.dynamic.c[0]-originParts[k].dynamic.c[0]),
    scale=Math.hypot(...difference);
  if(!finite(scale)||scale===0)fail();
  const coords=(i:number,q:GenericTaylor)=>native[i].map((fn,k)=>{const p=fn.parts(q),shift=sumExact([...p.offsets,...originParts[k].offsets.map(x=>-x)]);
    return p.dynamic.sub(originParts[k].dynamic.c[0]).add(shift).div(scale);});
  const geometry=(i:number,q:GenericTaylor)=>{const p=coords(i,q),d=p.map(x=>x.derivative()),speed=td(d,d).sqrt(),
    sourceT=d.map(x=>x.div(speed)),sourceL=[sourceT[1].neg(),sourceT[0]],sourceG=tc(d,d.map(x=>x.derivative())).div(td(d,d));
    if(query.curve2DSystemsMode==='independent-external'&&i<systems.length){const domain=(query.curve2DSystems as Exclude<Curve2DSystemsOption,string>)[i].parameterDomain;if(q.c[0]<domain[0]||q.c[0]>domain[1])fail();}
    const system=systems[i],t=system?system[2].map(f=>f(q)):sourceT,l=system?system[3].map(f=>f(q)):sourceL,
      g=system?system[0][0](q).mul(system[1][0](q)).mul(q.derivative()):sourceG,
      curveSpeed=system?system[0][0](q).mul(q.derivative()).div(scale):speed;return {p,d,t,l,g,speed:curveSpeed};};
  const evaluate=(s:number,seeds:number[],boxes?:number[][])=>{
    const order=3*(query.curves.length-1)+1,u=new GenericTaylor([s,1,...Array(order-1).fill(0)]),
      q=[functions[0](u),functions[1](u)],angles=[functions[2](u)],geom=q.map((x,i)=>geometry(i,x));
    for(let i=0;i<query.curves.length-2;i++){
      const a=geom[i],b=geom[i+1],h=ts(b.p,a.p),angle=a.g.div(b.g).mul(td(h,b.l).div(td(h,a.l))).mul(angles[i].div(2).tan()).atan().mul(-2);
      angles.push(angle);const target=angle.derivative().div(b.g.mul(angle.div(2).tan())).sub(td(h,b.t).div(td(h,b.l)));
      const residual=(z:GenericTaylor)=>{const h=ts(coords(i+2,z),b.p);return td(h,b.t).sub(target.mul(td(h,b.l)));};
      const derivative=(z:number)=>{const p=coords(i+2,new GenericTaylor([z,1]));return p.reduce((sum,x,k)=>sum+x.c[1]*(b.t[k].c[0]-target.c[0]*b.l[k].c[0]),0);};
      const domain=query.curves[i+2],bounds=boxes?.[i]??[domain.parameterMin,domain.parameterMax];let z=seeds[i],done=false;
      for(let attempt=0;attempt<40;attempt++){
        const f=residual(new GenericTaylor([z])).c[0],d=derivative(z);if(Math.abs(d)<1e-9)fail();
        if(Math.abs(f)<2e-12){done=true;break;}let step=f/d,next=z-step,k=0;
        while(next<=bounds[0]||next>=bounds[1]||Math.abs(residual(new GenericTaylor([next])).c[0])>Math.abs(f)*1.1){step*=.5;next=z-step;if(++k>24)fail();}z=next;
      }if(!done||z<=bounds[0]||z>=bounds[1])fail();
      const n=Math.min(target.c.length,...b.t.map(x=>x.c.length),...b.p.map(x=>x.c.length)),c=[z,...Array(n-1).fill(0)],d=derivative(z);
      for(let k=1;k<n;k++)c[k]=-residual(new GenericTaylor(c.slice(0,k+1))).c[k]/d;
      q.push(new GenericTaylor(c));geom.push(geometry(i+2,q.at(-1)!));
    }
    return {q,angles,geom};
  };return Object.assign(evaluate,{normalization:{origin:[...origin,0],scale},coords});
}

/** Numerical replay of raw imported frames, without any normalization or
 * assumption that their projected geometry is isometric to the source. */
function replayIndependentLinked(query:GenericLinkedQuery,evaluate:ReturnType<typeof makeEvaluator>,charts:any[],nodes:number[]){
  const at=(s:number)=>{const chart=charts.find(c=>c.start-1e-13<=s&&s<=c.end+1e-13);if(!chart)fail();return evaluate(s,chart.seeds,chart.rootBounds);};
  const first=at(query.parameterStart).geom[0],v=(a:GenericTaylor[])=>a.map(x=>x.c[0]),
    initial=[...v(first.p),0,...v(first.t),0,...v(first.l),0,0,0,1],
    add=(a:number[],b:number[],factor=1)=>a.map((x,i)=>x+factor*b[i]),mul=(a:number[],k:number)=>a.map(x=>x*k);
  const derivative=(s:number,y:number[])=>{const r=at(s),a=r.geom[0],b=r.geom[1],h=v(ts(b.p,a.p)),t0=v(a.t),l0=v(a.l),
    g=a.g.c[0],n=g*Math.tan(r.angles[0].c[0]/2),tau=-n*dot(h,t0)/dot(h,l0),t=y.slice(3,6),l=y.slice(6,9),u=y.slice(9,12);
    return [...mul(t,a.speed.c[0]),...add(mul(l,g),mul(u,n)),...add(mul(t,-g),mul(u,tau)),...add(mul(t,-n),mul(l,-tau))];};
  const c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
    [19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],
    [35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  let s=query.parameterStart,y=initial.slice(),step=(query.parameterEnd-query.parameterStart)/32,budget=0;
  const states=new Map<number,number[]>([[s,y.slice()]]);
  for(const end of [...new Set(nodes)].sort((a,b)=>a-b)){
    while(s<end){if(++budget>8192)throw Error('独立外部规则轨迹回读超过有限积分预算。');if(s+step>end)step=end-s;if(s+step===s)fail();
      const stages:number[][]=[];for(let k=0;k<7;k++){
        const trial=y.map((v,i)=>v+step*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0));stages.push(derivative(k===6?s+step:s+c[k]*step,trial));}
      const high=y.map((v,i)=>v+step*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),
        small=y.map((v,i)=>v+step*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
        error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
      if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=s+step>=end?end:s+step;y=high;}
      step*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
    }states.set(end,y.slice());
  }
  const row=(s:number)=>{const state=states.get(s)??[...states.entries()].find(([x])=>Math.abs(x-s)<=2e-12*Math.max(1,Math.abs(s)))?.[1];if(!state)fail();const r=at(s),geom=r.geom,dy=derivative(s,state);
    let f=state.slice(0,3),t=state.slice(3,6),l=state.slice(6,9),n=state.slice(9,12),
      fp=dy.slice(0,3),tp=dy.slice(3,6),lp=dy.slice(6,9),np=dy.slice(9,12);
    const positions=[f.slice()],derivatives=[fp.slice()],diags={frame:0,developability:0,geodesic:0};
    for(let i=0;i<geom.length-1;i++){
      const gi=geom[i],gj=geom[i+1],h=ts(gj.p,gi.p),aa=td(h,gi.t),bb=td(h,gi.l),basis=[t,l,n];
      basis.forEach((a,j)=>basis.forEach((b,k)=>diags.frame=Math.max(diags.frame,Math.abs(dot(a,b)-(j===k?1:0)))));
      diags.developability=Math.max(diags.developability,Math.abs(aa.c[0]*dot(tp,n)+bb.c[0]*dot(lp,n)));
      diags.geodesic=Math.max(diags.geodesic,Math.abs(dot(tp,l)-gi.g.c[0]));
      f=add(add(f,mul(t,aa.c[0])),mul(l,bb.c[0]));
      fp=add(add(add(add(fp,mul(t,aa.c[1])),mul(tp,aa.c[0])),mul(l,bb.c[1])),mul(lp,bb.c[0]));
      positions.push(f.slice());derivatives.push(fp.slice());
      const cs=td(gi.t,gj.t),sn=tc(gi.t,gj.t),nt=add(mul(t,cs.c[0]),mul(l,sn.c[0])),
        ntp=add(add(add(mul(t,cs.c[1]),mul(tp,cs.c[0])),mul(l,sn.c[1])),mul(lp,sn.c[0])),
        left=add(mul(t,-sn.c[0]),mul(l,cs.c[0])),leftp=add(add(add(mul(t,-sn.c[1]),mul(tp,-sn.c[0])),mul(l,cs.c[1])),mul(lp,cs.c[0])),
        normalVector=cross(nt,left),normalPrime=add(cross(ntp,left),cross(nt,leftp));
      if(i+1<geom.length-1){const angle=r.angles[i+1],co=Math.cos(angle.c[0]),si=Math.sin(angle.c[0]),ap=angle.c[1],
        nl=add(mul(left,co),mul(normalVector,-si)),nlp=add(add(mul(leftp,co),mul(normalPrime,-si)),mul(add(mul(left,si),mul(normalVector,co)),-ap));
        t=nt;tp=ntp;l=nl;lp=nlp;n=cross(nt,nl);np=add(cross(ntp,nl),cross(nt,nlp));}
    }
    return {positions,derivatives,diags,geometry:r};
  };return {initial,row};
}

export function parseGenericLinkedResult(raw:unknown,requested:unknown):GenericLinkedResult{
  const query=validateGenericLinkedQuery(requested),bands=query.curves.length-1,independent=query.curve2DSystemsMode==='independent-external';
  if(!record(raw)||!keys(raw,['family','query','source','diagnostics','certification','sample',...(Object.hasOwn(query,'curve2DSystems')?['curve2DSystems']:[]),...(independent?['independentRules']:[]),...(query.ndsolveOptions?['first3DIntegration']:[])])||raw.family!=='linked-generic-common-parameter'||
    JSON.stringify(validateGenericLinkedQuery(raw.query))!==JSON.stringify(query)||!record(raw.source)||!record(raw.diagnostics)||!record(raw.certification)||!record(raw.sample))fail();
  if(Object.hasOwn(query,'curve2DSystems')){
    const stamp=raw.curve2DSystems,count=Array.isArray(query.curve2DSystems)?query.curve2DSystems.length:0;
    if(!record(stamp)||!keys(stamp,['option','definitionCell','systems','replacementIndices','next2DConsumedIndices','next2DThirdSystemUsed',
      'usageScope','identityProof','originalArbitrarySystemContractReproduced','numericalInterpolationReproduced','evaluations',
      ...(independent?['mode','rulesUnnormalized','originalSameSourceRequired']:[])])||
      stamp.option!=='Curve2DSystems'||stamp.definitionCell!=='In[4076]'||JSON.stringify(stamp.systems)!==JSON.stringify(query.curve2DSystems)||
      JSON.stringify(stamp.replacementIndices)!==JSON.stringify(Array.from({length:count},(_,i)=>i))||
      JSON.stringify(stamp.next2DConsumedIndices)!==JSON.stringify(Array.from({length:Math.min(count,2)},(_,i)=>i))||stamp.next2DThirdSystemUsed!==false||
      stamp.usageScope!==(independent?'independent-external/native-rule-values/linked-chain-and-three-dimensional-frames':'same-source/native-frame-coefficients/linked-chain-and-three-dimensional-frames')||
      stamp.identityProof!==(independent?'bounded-native-domain-finite-rules/no-source-identity-assertion':'bounded-symbolic-formula-identity/native-domain-interval')||
      independent&&(stamp.mode!=='independent-external'||stamp.rulesUnnormalized!==true||stamp.originalSameSourceRequired!==false)||stamp.originalArbitrarySystemContractReproduced!==false||
      stamp.numericalInterpolationReproduced!==false||!vector(stamp.evaluations,count)||stamp.evaluations.some((x:number)=>!Number.isInteger(x)||x<=0))fail();
  }
  const source=raw.source,d=raw.diagnostics,cert=raw.certification;
  if(!keys(source,['notebookRows','savedNumericalOut','savedPhysicalInputsPreserved','parameterContract','formulaCorrections','method'])||
    JSON.stringify(source.notebookRows)!=='[338484,340340]'||source.savedNumericalOut!==false||source.savedPhysicalInputsPreserved!==false||
    source.parameterContract!=='native-curves-composed-once/common-s'||JSON.stringify(source.formulaCorrections)!=='["geodesic-curvature-ratio","common-parameter-angle-derivative","composed-tangent-frame"]'||source.method!=='whitelist-AST/Taylor-implicit-root/Darboux-integration')fail();
  const yes=['singleCommonParameter','isometryIdentitiesApplied','finiteNumericalMetricVerified','fullIntervalRegularityCertified','allBandsAnalyticLocalIsometry'],paper=['planarPaperInjectivityCertified','globalBoundaryInjectivityChecked'],
    no=['originalSavedFormulaReplayed','exactStraightCreaseFOLD','adoptableCreasePattern','selfCollisionChecked','continuousFoldPathChecked','integrationErrorIntervalCertified'];
  if(!keys(cert,['bandCount',...yes,...paper,...no])||cert.bandCount!==bands||yes.some(k=>independent?k==='singleCommonParameter'?cert[k]!==true:k==='finiteNumericalMetricVerified'?typeof cert[k]!=='boolean':cert[k]!==false:cert[k]!==true)||paper.some(k=>typeof cert[k]!=='boolean')||no.some(k=>cert[k]!==false)||
    !keys(d,['validationNodes','maxFrameGramError','maxMetricError','maxDevelopabilityError','maxGeodesicError','parameterDomain'])||d.validationNodes!==129||!record(d.parameterDomain))fail();
  const domain=d.parameterDomain;
  if(!keys(domain,['certified','evaluations','verifiedCells','minimumSpeedLowerBound','minimumTransverseLowerBound','minimumRootDerivativeLowerBound','minimumMonotonicityDeterminantLowerBound','planarPaperInjective','roundingModel','rootMethod','seamMethod','seamChecks','minimumSeamRootDerivativeLowerBound','paperMethod','paperAxes','bandWidths','rootCharts','coordinateNormalization'])||
    domain.certified!==true||typeof domain.planarPaperInjective!=='boolean'||paper.some(k=>cert[k]!==domain.planarPaperInjective)||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||
    domain.rootMethod!=='parameterized-krawczyk/simple-root-overlapping-charts'||domain.paperMethod!=='positive-symmetric-Jacobian-on-common-rectangular-sheet'||
    domain.seamMethod!=='point-krawczyk/cell-root-hull-identity/shared-simple-root'||domain.seamChecks!==domain.verifiedCells-1||!finite(domain.minimumSeamRootDerivativeLowerBound)||domain.minimumSeamRootDerivativeLowerBound<=0||
    !finite(domain.evaluations)||!Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||domain.verifiedCells!==(domain.evaluations+1)/2||
    !Array.isArray(domain.rootCharts)||domain.rootCharts.length!==domain.verifiedCells||!vector(domain.bandWidths,bands)||domain.bandWidths.some(x=>x<=0)||
    !Array.isArray(domain.paperAxes)||domain.paperAxes.length!==2||!domain.paperAxes.every((v:unknown)=>vector(v,2))||
    !close(dot(domain.paperAxes[0],domain.paperAxes[0]),1,1e-12)||!close(dot(domain.paperAxes[1],domain.paperAxes[1]),1,1e-12)||!close(dot(domain.paperAxes[0],domain.paperAxes[1]),0,1e-12))fail();
  for(const k of ['minimumSpeedLowerBound','minimumTransverseLowerBound','minimumRootDerivativeLowerBound'])if(!finite(domain[k])||domain[k]<=0)fail();
  if(!finite(domain.minimumMonotonicityDeterminantLowerBound)||domain.planarPaperInjective&&domain.minimumMonotonicityDeterminantLowerBound<=0)fail();
  for(const [i,c] of domain.rootCharts.entries()){
    if(!record(c)||!keys(c,['start','end','seeds','rootBounds'])||!finite(c.start)||!finite(c.end)||c.start>=c.end||
      !close(c.start,i?domain.rootCharts[i-1].end:query.parameterStart,1e-12)||!vector(c.seeds,bands-1)||!Array.isArray(c.rootBounds)||c.rootBounds.length!==bands-1)fail();
    for(let j=0;j<bands-1;j++)if(!vector(c.rootBounds[j],2)||c.rootBounds[j][0]>=c.seeds[j]||c.rootBounds[j][1]<=c.seeds[j]||c.rootBounds[j][0]<=query.curves[j+2].parameterMin||c.rootBounds[j][1]>=query.curves[j+2].parameterMax)fail();
  }if(!close(domain.rootCharts.at(-1).end,query.parameterEnd,1e-12))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==query.segments+1)fail();
  const evaluate=makeEvaluator(query),replayNodes=[...Array.from({length:query.segments+1},(_,i)=>query.parameterStart+(query.parameterEnd-query.parameterStart)*i/query.segments),
    ...Array.from({length:129},(_,i)=>query.parameterStart+(query.parameterEnd-query.parameterStart)*i/128)],
    independentReplay=independent||query.ndsolveOptions?replayIndependentLinked(query,evaluate,domain.rootCharts,replayNodes):null;
  if(independent){const info=raw.independentRules,expectedDomains=Array.isArray(query.curve2DSystems)?query.curve2DSystems.map(x=>x.parameterDomain):[];
    if(!record(info)||!keys(info,['mode','sourceIdentityAsserted','ruleDomains','initialState','metricCompatibilityVerified','trajectoryMethod','rawImportedValuesPreserved'])||
      info.mode!=='independent-external'||info.sourceIdentityAsserted!==false||info.rawImportedValuesPreserved!==true||
      info.trajectoryMethod!=='raw-imported-frame/Darboux-and-original-frame-algebra'||JSON.stringify(info.ruleDomains)!==JSON.stringify(expectedDomains)||
      !vector(info.initialState,12)||info.initialState.some((x:number,i:number)=>!close(x,independentReplay!.initial[i],2e-10))||
      info.metricCompatibilityVerified!==cert.finiteNumericalMetricVerified||domain.planarPaperInjective!==false)fail();
  }
  let seeds=query.rootSeeds.slice(),maxMetric=0,minSpeed=Infinity,minJac=Infinity,minRoot=Infinity,minMono=Infinity;
  if(!record(domain.coordinateNormalization)||!keys(domain.coordinateNormalization,['origin','scale'])||!vector(domain.coordinateNormalization.origin,3)||!finite(domain.coordinateNormalization.scale)||
    domain.coordinateNormalization.scale<=0||!close(domain.coordinateNormalization.scale/evaluate.normalization.scale,1,1e-12)||
    domain.coordinateNormalization.origin.some((x:number,k:number)=>Math.abs(x-evaluate.normalization.origin[k])>
      Math.max(evaluate.normalization.scale*2e-12,4*Number.EPSILON*Math.abs(x))))fail();
  const worldScale=evaluate.normalization.scale,worldOrigin=evaluate.normalization.origin;
  let scale=1;
  for(const [index,world] of raw.sample.rows.entries()){
    if(!record(world)||!keys(world,['s','qValues','qDerivatives','foldAnglesDeg','flatCurves','flatDerivatives','foldedCurves','foldedDerivatives','normalizedFlatCurves','normalizedFlatDerivatives','normalizedFoldedCurves','normalizedFoldedDerivatives'])||
      !finite(world.s)||!close(world.s,query.parameterStart+(query.parameterEnd-query.parameterStart)*index/query.segments,1e-12)||
      !vector(world.qValues,bands+1)||!vector(world.qDerivatives,bands+1)||!vector(world.foldAnglesDeg,bands)||
      ['flatCurves','flatDerivatives','foldedCurves','foldedDerivatives','normalizedFlatCurves','normalizedFlatDerivatives','normalizedFoldedCurves','normalizedFoldedDerivatives'].some(k=>!Array.isArray(world[k])||world[k].length!==bands+1||!world[k].every((p:unknown)=>vector(p,k.toLowerCase().includes('flat')?2:3))))fail();
    if(independentReplay){const actual=independentReplay.row(world.s);
      for(const [key,expected] of [['normalizedFoldedCurves',actual.positions],['normalizedFoldedDerivatives',actual.derivatives]] as const)
        for(let j=0;j<expected.length;j++)for(let k=0;k<3;k++)if(!close(world[key][j][k],expected[j][k],2e-8))fail();
    }
    const row:Record<string,any>={...world,flatCurves:world.normalizedFlatCurves,flatDerivatives:world.normalizedFlatDerivatives,foldedCurves:world.normalizedFoldedCurves,foldedDerivatives:world.normalizedFoldedDerivatives};
    for(const name of ['flatCurves','flatDerivatives','foldedCurves','foldedDerivatives']){
      const normalized=row[name as 'flatCurves'];for(let j=0;j<=bands;j++)for(let k=0;k<normalized[j].length;k++){
        const expected=worldScale*normalized[j][k]+(name.includes('Derivatives')?0:worldOrigin[k]),actual=world[name][j][k],
          tolerance=Math.max(worldScale*2e-10,4*Number.EPSILON*Math.abs(expected));
        if(Math.abs(expected-actual)>tolerance)fail();
      }
    }
    const chart=domain.rootCharts.find((c:any)=>c.start-1e-13<=row.s&&row.s<=c.end+1e-13);if(!chart)fail();
    const expected=evaluate(row.s,seeds,chart.rootBounds);seeds=expected.q.slice(2).map(x=>x.c[0]);
    expected.q.forEach((q,j)=>{if(!close(q.c[0],row.qValues[j],2e-10)||!close(q.c[1],row.qDerivatives[j],2e-9)||
      q.c[0]<=query.curves[j].parameterMin||q.c[0]>=query.curves[j].parameterMax||q.c[1]<=1e-5)fail();minSpeed=Math.min(minSpeed,q.c[1]);});
    expected.angles.forEach((g,j)=>{if(!close(g.c[0]*180/Math.PI,row.foldAnglesDeg[j],2e-9))fail();});
    for(let j=0;j<=bands;j++){
      expected.geom[j].p.forEach((p,k)=>{if(!close(p.c[0],row.flatCurves[j][k],2e-10))fail();});
      expected.geom[j].d.forEach((p,k)=>{if(!close(p.c[0],row.flatDerivatives[j][k],2e-9))fail();});scale=Math.max(scale,Math.hypot(...row.flatCurves[j]));
    }
    for(let j=0;j<bands;j++){
      const h=sub(row.flatCurves[j+1],row.flatCurves[j]),dv=h.map(x=>x/domain.bandWidths[j]);
      for(const ds of [row.flatDerivatives[j],row.flatDerivatives[j+1]]){
        const x=dot(ds,domain.paperAxes[0]),y=dot(dv,domain.paperAxes[1]),off=(dot(dv,domain.paperAxes[0])+dot(ds,domain.paperAxes[1]))/2;
        if(domain.planarPaperInjective&&(x<=0||y<=0||x*y-off*off<=0))fail();minMono=Math.min(minMono,x*y-off*off);
        minJac=Math.min(minJac,dot(ds,domain.paperAxes[0])*dot(h,domain.paperAxes[1])-dot(ds,domain.paperAxes[1])*dot(h,domain.paperAxes[0]));
      }
      for(const v of [0,.25,.5,.75,1]){
        const a=mix(row.flatDerivatives[j],row.flatDerivatives[j+1],v),b=h,c=mix(row.foldedDerivatives[j],row.foldedDerivatives[j+1],v),e=sub(row.foldedCurves[j+1],row.foldedCurves[j]);
        maxMetric=Math.max(maxMetric,Math.abs(dot(a,a)-dot(c,c)),Math.abs(dot(a,b)-dot(c,e)),Math.abs(dot(b,b)-dot(e,e)));
      }
      if(j>0&&!independent){const t=normal(row.foldedDerivatives[j]),incoming=sub(row.foldedCurves[j],row.foldedCurves[j-1]),outgoing=sub(row.foldedCurves[j+1],row.foldedCurves[j]),
        nl=normal(cross(t,incoming)),nr=normal(cross(t,outgoing)),planarIncoming=sub(row.flatCurves[j],row.flatCurves[j-1]),planarOutgoing=sub(row.flatCurves[j+1],row.flatCurves[j]),
        tangent=row.flatDerivatives[j],orientation=Math.sign(tangent[0]*planarOutgoing[1]-tangent[1]*planarOutgoing[0]);
        // Incoming and outgoing rulers have the same native side sign.
        if(Math.sign(tangent[0]*planarIncoming[1]-tangent[1]*planarIncoming[0])!==orientation)fail();
        const left=cross(nl.map(x=>x*orientation),t),right=cross(nr.map(x=>x*orientation),t),angle=Math.atan2(-dot(right,nl.map(x=>x*orientation)),dot(right,left))*180/Math.PI;
        if(!close(angle,row.foldAnglesDeg[j],2e-7))fail();}
    }
    if(index===0){if(!independent)for(let j=0;j<2;j++)for(let k=0;k<3;k++)if(!close(row.foldedCurves[j][k],k===2?0:row.flatCurves[j][k],1e-10)||!close(row.foldedDerivatives[j][k],k===2?0:row.flatDerivatives[j][k],1e-10))fail();
      const t=normal(row.flatDerivatives[0]);if(t.some((x,k)=>!close(x,domain.paperAxes[0][k],1e-12)))fail();
      domain.bandWidths.forEach((w:number,j:number)=>{if(!close(w,Math.hypot(...sub(row.flatCurves[j+1],row.flatCurves[j])),1e-12))fail();});
    }
    for(let j=2;j<=bands;j++){
      const prev=expected.geom[j-1],angle=expected.angles[j-1],h=ts(prev.p,expected.geom[j-2].p),target=angle.derivative().div(prev.g.mul(angle.div(2).tan())).sub(td(h,prev.t).div(td(h,prev.l))),
        u=new GenericTaylor([row.qValues[j],1]),[cx,cy]=evaluate.coords(j,u),
        d=cx.c[1]*(prev.t[0].c[0]-target.c[0]*prev.l[0].c[0])+cy.c[1]*(prev.t[1].c[0]-target.c[0]*prev.l[1].c[0]);minRoot=Math.min(minRoot,Math.abs(d));
    }
  }
  for(const [k,limit] of [['maxFrameGramError',2e-7],['maxMetricError',scale*scale*2e-7],['maxDevelopabilityError',scale*2e-7],['maxGeodesicError',2e-7]] as const)
    if(!finite(d[k])||d[k]<0||!independent&&d[k]>limit)fail();
  if(!independent&&maxMetric>scale*scale*2e-7||maxMetric>d.maxMetricError+Math.max(1e-10*scale*scale,independent?d.maxMetricError*2e-8:0)||domain.minimumSpeedLowerBound>minSpeed+1e-12||
    domain.minimumTransverseLowerBound>minJac+1e-12||domain.minimumRootDerivativeLowerBound>minRoot+1e-12||domain.minimumMonotonicityDeterminantLowerBound>minMono+1e-12)fail();
  if(independentReplay){let frame=0,develop=0,geodesic=0;
    for(const s of [...new Set(replayNodes)]){const checked=independentReplay.row(s).diags;frame=Math.max(frame,checked.frame);develop=Math.max(develop,checked.developability);geodesic=Math.max(geodesic,checked.geodesic);}
    for(const [actual,reported] of [[frame,d.maxFrameGramError],[develop,d.maxDevelopabilityError],[geodesic,d.maxGeodesicError]])
      if(actual>reported+2e-8*Math.max(1,actual,reported))fail();
    const compatible=d.maxFrameGramError<=2e-7&&d.maxMetricError<=scale*scale*2e-7&&d.maxDevelopabilityError<=scale*2e-7&&d.maxGeodesicError<=2e-7;
    if(cert.finiteNumericalMetricVerified!==compatible)fail();
  }
  if(query.ndsolveOptions&&!validateLinkedFirst3DIntegration(raw.first3DIntegration,query.ndsolveOptions,query.parameterStart,query.parameterEnd,independentReplay!.initial))fail();
  return raw as GenericLinkedResult;
}

export async function fetchGenericLinked(value:unknown,signal?:AbortSignal){
  const query=validateGenericLinkedQuery(value);return parseGenericLinkedResult(await api('tessellation/curved-linked-first-band',query,signal),query);
}
