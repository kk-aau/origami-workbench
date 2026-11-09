/** General original In3959/In3966 source; product geometry is checked separately. */
import {GenericTaylor} from './curvedGenericLinked';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
export type NonuniformHelixGammaDefinition={kind:'expression';expression:string}|{kind:'natural-cubic-points';points:[number,number][]};
export type NonuniformHelixGeneralCP3966Recipe={radius:number;helicityAngleDeg:number;gammaFunction:NonuniformHelixGammaDefinition;parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const NONUNIFORM_HELIX_GENERAL_CP_3966_EXAMPLE:NonuniformHelixGeneralCP3966Recipe={radius:1,helicityAngleDeg:30,gammaFunction:{kind:'expression',expression:'pi/3+u/3'},parameterStart:0,parameterEnd:Math.PI,leftWidth:.5,rightWidth:1,segments:100};
export type NonuniformHelixGeneralCP3966ErrorCode='SOURCE_INPUT'|'NUMERIC_SOURCE'|'PAPER_DOMAIN'|'FINITE_GEOMETRY'|'MATERIAL_INTERFACE';
export class NonuniformHelixGeneralCP3966Error extends Error{constructor(public readonly code:NonuniformHelixGeneralCP3966ErrorCode,message:string){super(message);this.name='NonuniformHelixGeneralCP3966Error';}}
const issue=(code:NonuniformHelixGeneralCP3966ErrorCode,message:string):never=>{throw new NonuniformHelixGeneralCP3966Error(code,message);},
 fail:(message?:string)=>never=(message='原任意折角螺旋与实际有限纸域不一致。')=>issue('FINITE_GEOMETRY',message),
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x),EPS=Number.EPSILON,SCHEMA='original-in3966-general-function-local-cp-v1';
const ulp=(x:number):number=>x===0?Number.MIN_VALUE:Math.abs(x)<2**-1022?Number.MIN_VALUE:2**(Math.floor(Math.log2(Math.abs(x)))-52);
function adj(x:number,up:boolean){if(!finite(x))return x;if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;const b=new ArrayBuffer(8),v=new DataView(b);v.setFloat64(0,x);let bits=v.getBigUint64(0);bits+=(x>0===up)?1n:-1n;v.setBigUint64(0,bits);return v.getFloat64(0);}
const down=(x:number)=>adj(adj(x,false),false),up=(x:number)=>adj(adj(x,true),true);
/** Outward engineering enclosures; libm endpoint accuracy is assumed, not certified. */
class I{
 constructor(readonly lo:number,readonly hi:number=lo){if(!finite(lo)||!finite(hi)||lo>hi)issue('NUMERIC_SOURCE','函数区间运算溢出或不可表示；未改变原输入。');}
 static exact(x:number){return new I(x);}static around(x:number){return new I(down(x),up(x));}
 add(b:I){return new I(down(this.lo+b.lo),up(this.hi+b.hi));}neg(){return new I(-this.hi,-this.lo);}sub(b:I){return this.add(b.neg());}
 mul(b:I){const a=[this.lo*b.lo,this.lo*b.hi,this.hi*b.lo,this.hi*b.hi];return new I(down(Math.min(...a)),up(Math.max(...a)));}
 div(b:I){if(b.lo<=0&&b.hi>=0)issue('NUMERIC_SOURCE','函数完整域的分母尚不能证明非零；当前区间预算不足。');return this.mul(new I(down(1/b.hi),up(1/b.lo)));}
 pow(n:number):I{if(n<0)return I.exact(1).div(this).pow(-n);if(n===0)return I.exact(1);if(n===2){const a=this.lo*this.lo,b=this.hi*this.hi;return new I(this.lo<=0&&this.hi>=0?0:down(Math.min(a,b)),up(Math.max(a,b)));}let a=I.exact(1);for(let i=0;i<n;i++)a=a.mul(this);return a;}
 maxAbs(){return Math.max(Math.abs(this.lo),Math.abs(this.hi));}minAbs(){return this.lo<=0&&this.hi>=0?0:Math.min(Math.abs(this.lo),Math.abs(this.hi));}
 sincos(){if(this.maxAbs()*EPS*8>1e-7)issue('NUMERIC_SOURCE','三角函数参数条件超过当前工程误差预算；这不是原函数输入盒子。');const range=(cos:boolean)=>{if(this.hi-this.lo>=2*Math.PI)return new I(-1,1);const f=cos?Math.cos:Math.sin;let lo=Math.min(f(this.lo),f(this.hi)),hi=Math.max(f(this.lo),f(this.hi)),shift=cos?0:Math.PI/2;
  for(let n=Math.ceil((this.lo-shift)/Math.PI);n<=Math.floor((this.hi-shift)/Math.PI);n++){const value=n%2===0?1:-1;lo=Math.min(lo,value);hi=Math.max(hi,value);}return new I(Math.max(-1,down(lo)),Math.min(1,up(hi)));};return [range(false),range(true)] as const;}
 sqrt(){if(this.lo<=0)issue('NUMERIC_SOURCE','函数或导数区间的 sqrt 正分支尚不能验证。');return new I(down(Math.sqrt(this.lo)),up(Math.sqrt(this.hi)));}
 exp(){return new I(down(Math.exp(this.lo)),up(Math.exp(this.hi)));}log(){if(this.lo<=0)issue('NUMERIC_SOURCE','函数完整域的 log 正分支尚不能验证。');return new I(down(Math.log(this.lo)),up(Math.log(this.hi)));}
 atan(){return new I(down(Math.atan(this.lo)),up(Math.atan(this.hi)));}
}
class IJ{
 constructor(readonly c:I[]){}constant(x:I|number){return new IJ([typeof x==='number'?I.exact(x):x,...this.c.slice(1).map(()=>I.exact(0))]);}
 add(b:IJ){return new IJ(this.c.map((x,i)=>x.add(b.c[i])));}neg(){return new IJ(this.c.map(x=>x.neg()));}sub(b:IJ){return this.add(b.neg());}
 mul(b:IJ){return new IJ(this.c.map((_,n)=>this.c.slice(0,n+1).reduce((s,x,k)=>s.add(x.mul(b.c[n-k])),I.exact(0))));}
 inv(){const c=[I.exact(1).div(this.c[0])];for(let n=1;n<this.c.length;n++)c.push(this.c.slice(1,n+1).reduce((s,x,k)=>s.add(x.mul(c[n-k-1])),I.exact(0)).neg().div(this.c[0]));return new IJ(c);}
 div(b:IJ){return this.mul(b.inv());}pow(n:number):IJ{if(n<0)return this.inv().pow(-n);let x=this.constant(1);for(let i=0;i<n;i++)x=x.mul(this);return x;}
 derivative(){return new IJ(this.c.slice(1).map((x,i)=>x.mul(I.exact(i+1))));}
 sincos(){const [s0,c0]=this.c[0].sincos(),s=[s0],c=[c0];for(let n=1;n<this.c.length;n++){s.push(this.c.slice(1,n+1).reduce((a,x,k)=>a.add(x.mul(I.exact(k+1)).mul(c[n-k-1])),I.exact(0)).div(I.exact(n)));c.push(this.c.slice(1,n+1).reduce((a,x,k)=>a.add(x.mul(I.exact(k+1)).mul(s[n-k-1])),I.exact(0)).neg().div(I.exact(n)));}return [new IJ(s),new IJ(c)] as const;}
 tan(){const [s,c]=this.sincos();return s.div(c);}sqrt(){const c=[this.c[0].sqrt()];for(let n=1;n<this.c.length;n++)c.push(this.c[n].sub(c.slice(1,n).reduce((s,x,k)=>s.add(x.mul(c[n-k-1])),I.exact(0))).div(c[0].mul(I.exact(2))));return new IJ(c);}
 exp(){const c=[this.c[0].exp()];for(let n=1;n<this.c.length;n++)c.push(this.c.slice(1,n+1).reduce((s,x,k)=>s.add(x.mul(I.exact(k+1)).mul(c[n-k-1])),I.exact(0)).div(I.exact(n)));return new IJ(c);}
 log(){if(this.c.length===1)return new IJ([this.c[0].log()]);const d=this.derivative().div(new IJ(this.c.slice(0,-1)));return new IJ([this.c[0].log(),...d.c.map((x,i)=>x.div(I.exact(i+1)))]);}
 atan(){if(this.c.length===1)return new IJ([this.c[0].atan()]);const square=this.mul(this).add(this.constant(1)),d=this.derivative().div(new IJ(square.c.slice(0,-1)));return new IJ([this.c[0].atan(),...d.c.map((x,i)=>x.div(I.exact(i+1)))]);}
}
type Node={kind:'number';value:number;text:string}|{kind:'symbol';name:'pi'|'e'}|{kind:'u'}|{kind:'unary';minus:boolean;a:Node}|{kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
function parseExpression(source:string):Node{
 if(typeof source!=='string'||!source.trim()||source.length>240)issue('SOURCE_INPUT','表达式支持 1…240 字符的安全标量语法；没有 JS 求值。');
 const tokens:string[]=[],names:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'};let offset=0;
 while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));if(!m){if(!source.slice(offset).trim())break;issue('SOURCE_INPUT','表达式含不支持的字符、属性或代码。');}
  const token=names[m![1]]??m![1],previous=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);if(previous&&(word(previous)||previous===')')&&(word(token)||token==='(')&&!(['sin','cos','tan','atan','sqrt','exp','log'].includes(previous)&&token==='('))tokens.push('*');tokens.push(token);offset+=m![0].length;}
 let position=0,count=0;const peek=()=>tokens[position],take=()=>tokens[position++],node=<T extends Node>(x:T):T=>{if(++count>96)issue('SOURCE_INPUT','安全表达式超过 96 节点的有限计算预算。');return x;},integer=(n:Node):number=>{if(n.kind==='number'&&Number.isInteger(n.value))return n.value;if(n.kind==='unary'&&n.a.kind==='number'&&Number.isInteger(n.a.value))return n.minus?-n.a.value:n.a.value;return issue('SOURCE_INPUT','整数幂仅支持 −8…8；其他可微函数使用明确白名单。');};
 const atom=():Node=>{const t=take();if(t==='('){const x=add();if(take()!==')')issue('SOURCE_INPUT','表达式括号不匹配。');return x;}if(/^(?:\d|\.)/.test(t??'')){const value=Number(t);if(!finite(value))issue('SOURCE_INPUT','表达式数值常量须为有限数。');return node({kind:'number',value,text:t});}if(t==='u')return node({kind:'u'});if(t==='pi'||t==='e')return node({kind:'symbol',name:t});if(['sin','cos','tan','atan','sqrt','exp','log'].includes(t)&&take()==='('){const a=add();if(take()!==')')issue('SOURCE_INPUT','白名单函数须为一个标量参数。');return node({kind:'call',name:t,a});}return issue('SOURCE_INPUT','仅支持 u、pi/e、算术及 sin/cos/tan/atan/sqrt/exp/log。');};
 const power=():Node=>{let a=atom();if(peek()==='**'){take();const b=unary();if(Math.abs(integer(b))>8)issue('SOURCE_INPUT','整数幂超过 −8…8。');a=node({kind:'binary',op:'**',a,b});}return a;},unary=():Node=>{if(peek()==='+'||peek()==='-'){const minus=take()==='-';return node({kind:'unary',minus,a:unary()});}return power();},multiply=():Node=>{let a=unary();while(peek()==='*'||peek()==='/'){const op=take();a=node({kind:'binary',op,a,b:unary()});}return a;},add=():Node=>{let a=multiply();while(peek()==='+'||peek()==='-'){const op=take();a=node({kind:'binary',op,a,b:multiply()});}return a;};
 const ast=add();if(position!==tokens.length)issue('SOURCE_INPUT','表达式含未使用语法。');return ast;
}
function jetNode<J extends GenericTaylor|IJ>(ast:Node,u:J):J{
 const visit=(n:Node):any=>{if(n.kind==='number')return u.constant(n.value);if(n.kind==='symbol')return u instanceof IJ?u.constant(I.around(n.name==='pi'?Math.PI:Math.E)):u.constant(n.name==='pi'?Math.PI:Math.E);if(n.kind==='u')return u;if(n.kind==='unary'){const a=visit(n.a);return n.minus?a.neg():a;}if(n.kind==='call'){const a=visit(n.a);return n.name==='sin'?a.sincos()[0]:n.name==='cos'?a.sincos()[1]:a[n.name]();}
  const a=visit(n.a);if(n.op==='**'){const n0=n.b.kind==='number'?n.b.value:n.b.kind==='unary'&&n.b.a.kind==='number'?(n.b.minus?-n.b.a.value:n.b.a.value):NaN;return a.pow(n0);}const b=visit(n.b);return n.op==='+'?a.add(b):n.op==='-'?a.sub(b):n.op==='*'?a.mul(b):a.div(b);};return visit(ast);
}
function affine(ast:Node):[number,number]|null{if(ast.kind==='number')return [ast.value,0];if(ast.kind==='symbol')return [ast.name==='pi'?Math.PI:Math.E,0];if(ast.kind==='u')return [0,1];if(ast.kind==='unary'){const a=affine(ast.a);return a?(ast.minus?[-a[0],-a[1]]:a):null;}if(ast.kind==='call'){const a=affine(ast.a);if(!a||a[1]!==0)return null;return [jetNode(ast,new GenericTaylor([0,1,0])).c[0],0];}const a=affine(ast.a),b=affine(ast.b);if(!a||!b)return null;if(ast.op==='+')return [a[0]+b[0],a[1]+b[1]];if(ast.op==='-')return [a[0]-b[0],a[1]-b[1]];if(ast.op==='*')return a[1]===0?[a[0]*b[0],a[0]*b[1]]:b[1]===0?[a[0]*b[0],a[1]*b[0]]:null;if(ast.op==='/')return b[1]===0&&b[0]!==0?[a[0]/b[0],a[1]/b[0]]:null;if(ast.op==='**')return b[0]===1?a:b[0]===0?[1,0]:a[1]===0?[a[0]**b[0],0]:null;return null;}
type GammaKernel={definition:NonuniformHelixGammaDefinition;ast:Node|null;knots:number[];coefficients:number[][];affineSlope:number|null;evaluate:(u:number)=>{gamma:number;first:number;second:number;third:number};bound:(a:number,b:number)=>[I,I,I,I]};
export function compileNonuniformHelixGamma(raw:unknown):GammaKernel{
 if(!object(raw))return issue('SOURCE_INPUT','γ 须为明确表达式或本地自然三次样条点定义。');
 if(raw.kind==='expression'){
  if(!keys(raw,['kind','expression']))issue('SOURCE_INPUT','表达式 γ 定义仅含 kind/expression。');const ast=parseExpression(raw.expression),af=affine(ast),evaluate=(u:number)=>{try{const r=jetNode(ast,new GenericTaylor([u,1,0,0])).c;if(!r.every(finite))issue('NUMERIC_SOURCE','γ 值或三阶 Taylor 运算不可表示。');return {gamma:r[0],first:r[1],second:2*r[2],third:6*r[3]};}catch(e){if(e instanceof NonuniformHelixGeneralCP3966Error)throw e;return issue('NUMERIC_SOURCE','γ 在当前域的实值或导数暂不可计算；没有替代函数。');}},bound=(a:number,b:number)=>{const r=jetNode(ast,new IJ([new I(a,b),I.exact(1),I.exact(0),I.exact(0)])).c;return [r[0],r[1],r[2].mul(I.exact(2)),r[3].mul(I.exact(6))] as [I,I,I,I];};return {definition:clone(raw) as NonuniformHelixGammaDefinition,ast,knots:[],coefficients:[],affineSlope:af?.[1]??null,evaluate,bound};
 }
 if(raw.kind!=='natural-cubic-points'||!keys(raw,['kind','points'])||!Array.isArray(raw.points)||raw.points.length<2||raw.points.length>65||raw.points.some((p:unknown)=>!Array.isArray(p)||p.length!==2||!p.every(finite)))issue('SOURCE_INPUT','本地点模型须为 2…65 个有限 [u,γ(rad)] 点，不等同 Wolfram InterpolatingFunction。');
 const points=raw.points as [number,number][],n=points.length;if(points.some((p,i)=>i>0&&p[0]<=points[i-1][0]))issue('SOURCE_INPUT','γ 点的 u 须严格递增；未排序、焊点或移动端点。');
 const x=points.map(p=>p[0]),y=points.map(p=>p[1]),h=x.slice(1).map((v,i)=>v-x[i]),diag=Array(n).fill(1),rhs=Array(n).fill(0),lower=Array(n).fill(0),upper=Array(n).fill(0);
 for(let i=1;i<n-1;i++){lower[i]=h[i-1];diag[i]=2*(h[i-1]+h[i]);upper[i]=h[i];rhs[i]=6*((y[i+1]-y[i])/h[i]-(y[i]-y[i-1])/h[i-1]);}
 for(let i=1;i<n;i++){const m=lower[i]/diag[i-1];diag[i]-=m*upper[i-1];rhs[i]-=m*rhs[i-1];}const z=Array(n).fill(0);z[n-1]=rhs[n-1]/diag[n-1];for(let i=n-2;i>=0;i--)z[i]=(rhs[i]-upper[i]*z[i+1])/diag[i];
 const coefficients=h.map((a,i)=>[y[i],(y[i+1]-y[i])/a-a*(2*z[i]+z[i+1])/6,z[i]/2,(z[i+1]-z[i])/(6*a)]);if(!coefficients.flat().every(finite))issue('NUMERIC_SOURCE','点模型的自然三次系数溢出；没有改点。');
 const chart=(u:number)=>{if(u<x[0]||u>x.at(-1)!)issue('SOURCE_INPUT','当前原 u 裁域超出明确点模型的定义域；不外插或移动端点。');return Math.max(0,Math.min(n-2,x.findIndex(v=>v>=u)-1));},evaluate=(u:number)=>{const i=chart(u),t=u-x[i],[a,b,c,d]=coefficients[i],gamma=points.find(p=>p[0]===u)?.[1]??a+t*(b+t*(c+t*d));return {gamma,first:b+t*(2*c+3*d*t),second:2*c+6*d*t,third:6*d};},bound=(a:number,b:number)=>{if(a<x[0]||b>x.at(-1)!)issue('SOURCE_INPUT','当前 u 域超出点模型，没有外插。');const values:[I,I,I,I][]=[];
  for(let i=0;i<n-1;i++)if(a<=x[i+1]&&b>=x[i]){const t=new I(Math.max(a,x[i])-x[i],Math.min(b,x[i+1])-x[i]),[aa,bb,cc,dd]=coefficients[i].map(I.around);values.push([aa.add(t.mul(bb.add(t.mul(cc.add(t.mul(dd)))))),bb.add(t.mul(cc.mul(I.exact(2)).add(t.mul(dd.mul(I.exact(3)))))),cc.mul(I.exact(2)).add(t.mul(dd.mul(I.exact(6)))),dd.mul(I.exact(6))]);}return [0,1,2,3].map(k=>new I(Math.min(...values.map(v=>v[k].lo)),Math.max(...values.map(v=>v[k].hi)))) as [I,I,I,I];};
 return {definition:clone(raw) as NonuniformHelixGammaDefinition,ast:null,knots:x,coefficients,affineSlope:coefficients.every(c=>c[2]===0&&c[3]===0&&c[1]===coefficients[0][1])?coefficients[0][1]:null,evaluate,bound};
}
export function validateNonuniformHelixGeneralCP3966Recipe(raw:unknown):NonuniformHelixGeneralCP3966Recipe{
 if(!object(raw)||!keys(raw,Object.keys(NONUNIFORM_HELIX_GENERAL_CP_3966_EXAMPLE)))return issue('SOURCE_INPUT','须提供完整八字段，不接受未知键或隐式默认。');const r=raw as NonuniformHelixGeneralCP3966Recipe;
 if(['radius','helicityAngleDeg','parameterStart','parameterEnd','leftWidth','rightWidth','segments'].some(k=>!finite(raw[k]))||r.radius<=0||r.parameterStart>=r.parameterEnd)issue('SOURCE_INPUT','r 须为正有限数，原 u 裁域有限且递增；负 u/负 θ 与偏移域可以保留。');
 compileNonuniformHelixGamma(r.gammaFunction);
 if(r.leftWidth<=0||r.leftWidth>1||r.rightWidth<=0||r.rightWidth>1)issue('PAPER_DOMAIN','左右内切宽须为任意正数且不超过原单位宽 1；没有自动内切或 .05 下限。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)issue('PAPER_DOMAIN','当前实际有限验证预算为整数 16…128 弦，默认 100。');return clone(r);
}

type DomainCell={start:number;end:number;gamma:[number,number];first:[number,number];second:[number,number];third:[number,number];transverse:[number,number];leftDenominator:[number,number];rightDenominator:[number,number];curveRate:[number,number];leftRate:[number,number];rightRate:[number,number]};
export type NonuniformHelixGeneralCP3966Frame={u:number;gamma:number;gammaFirst:number;gammaSecond:number;deltaPhase:number;phase:number;base:Point;basePrime:Point;tangent:Point;leftDirector:Point;rightDirector:Point;spatialBase:[number,number,number];spatialPrime:[number,number,number];spatialLeftDirector:[number,number,number];spatialRightDirector:[number,number,number];leftAngularRate:number;rightAngularRate:number;leftTransverse:number;rightTransverse:number};
export type NonuniformHelixGeneralCP3966Source={recipe:NonuniformHelixGeneralCP3966Recipe;frames:NonuniformHelixGeneralCP3966Frame[];gammaPlot:{u:number;gamma:number;first:number;second:number}[];gammaRepresentation:{ast:Node|null;knots:number[];coefficients:number[][];model:string;wolframInterpolationEquivalent:false};domain:{cells:DomainCell[];evaluations:number;halfSineSign:number;originalDerivationBranch:boolean;roundingModel:string;intervalCertified:false};flattening:{status:'computed'|'source-singularity';reason:string|null};constants:{speed:number;sourceSpan:number;sourceExtent:number;cosTheta:number;sinTheta:number;sourceOrientation:number};numericalPolicy:{model:string;intervalCertified:false;libmAccuracyCertified:false;integrationErrorIntervalCertified:false;maximumWorldErrorEstimateMm:number;maximumDirectorErrorEstimate:number;maximumDerivativeRelativeErrorEstimate:number;maximumSpatialRelativeErrorEstimate:number;worldReplayULPBoundMm:number;sourceUnitResidual:number;integrationErrorEstimate:number;integrationSteps:number;phaseIsSeedRelative:true;parameterScalingOnlyInternal:true}};
function piLinear(ast:Node,u:number):{p:number;q:number}|null{
 if(ast.kind==='number')return {p:0,q:ast.value};if(ast.kind==='symbol')return ast.name==='pi'?{p:1,q:0}:null;if(ast.kind==='u')return {p:0,q:u};if(ast.kind==='call')return null;
 if(ast.kind==='unary'){const a=piLinear(ast.a,u);return a?(ast.minus?{p:-a.p,q:-a.q}:a):null;}const a=piLinear(ast.a,u),b=piLinear(ast.b,u);if(!a||!b)return null;
 if(ast.op==='+')return {p:a.p+b.p,q:a.q+b.q};if(ast.op==='-')return {p:a.p-b.p,q:a.q-b.q};if(ast.op==='*')return a.p===0?{p:a.q*b.p,q:a.q*b.q}:b.p===0?{p:b.q*a.p,q:b.q*a.q}:null;if(ast.op==='/'&&b.p===0&&b.q!==0)return {p:a.p/b.q,q:a.q/b.q};return null;
}
const pair=(x:I):[number,number]=>[x.lo,x.hi],from=(x:[number,number])=>new I(...x),sinc=(x:number)=>x===0?1:Math.sin(x)/x;
function encloseDomain(recipe:NonuniformHelixGeneralCP3966Recipe,g:GammaKernel,c:number,s:number,orientation:number){
 const theta=recipe.helicityAngleDeg*(Math.PI/180),ec=EPS*(8*Math.abs(c)+4*Math.abs(theta)),es=EPS*(8*Math.abs(s)+4*Math.abs(theta)),C=new I(c-ec,c+ec),S=new I(s-es,s+es);
 if(C.lo<=0&&C.hi>=0)issue('NUMERIC_SOURCE','原螺旋角当前不能在工程误差预算中分辨 cosθ 的符号；未归一化角度。');
 const exactConstant=g.ast?piLinear(g.ast,0):null,sourceHalfZero=exactConstant&&g.affineSlope===0&&exactConstant.q===0&&Number.isInteger(exactConstant.p/2);
 if(sourceHalfZero&&g.evaluate(recipe.parameterStart).gamma<=0)issue('SOURCE_INPUT','原 γ(u) 的正值条件失败；常量半角零点没有绕过原源条件。');
 if(sourceHalfZero)return {cells:[] as DomainCell[],evaluations:0,halfSineSign:0,originalDerivationBranch:false,roundingModel:'binary64-outward-2ulp/libm-endpoints-2ulp-assumed',intervalCertified:false as const,sourceHalfZero:true};
 const cells:DomainCell[]=[];let evaluations=0,sign=0;
 const visit=(a:number,b:number,depth:number):void=>{
  if(++evaluations>4095)issue('NUMERIC_SOURCE','原函数完整域包围超过当前 4095 单元预算；函数未被替换。');
  let values:[I,I,I,I]|null=null,error:unknown=null;try{values=g.bound(a,b);}catch(e){error=e;}
  if(values){const [G,G1,G2,G3]=values;if(G.hi<=0||g.evaluate((a+b)/2).gamma<=0)issue('SOURCE_INPUT','原 γ(u) 须在当前完整函数域为正；未裁掉失败位置。');
   const [hs,hc]=G.div(I.exact(2)).sincos(),B=C.mul(hs).mul(I.exact(2)),Bsign=B.lo>0?1:B.hi<0?-1:0;
   if(G.lo>0&&Bsign&&depth>=7){if(sign&&sign!==Bsign)issue('PAPER_DOMAIN','原二维 Normalize(T×r) 在完整域经过半角正弦零点；不能拼接成单张连续纸域。');sign=Bsign;const BB=Bsign>0?B:B.neg(),bp=C.mul(hc).mul(G1).mul(I.exact(Bsign)),K=C.mul(hc).mul(I.exact(orientation*Bsign)),qL=S.mul(I.exact(2)).add(G1),qR=S.mul(I.exact(2)).sub(G1),den=(q:I)=>new I(down(Math.hypot(q.minAbs(),BB.lo)),up(Math.hypot(q.maxAbs(),BB.hi))),DL=den(qL),DR=den(qR);
    if(DL.lo<=0||DR.lo<=0||BB.lo<=0)error=Error('denominator resolution');else{const ql=qL.mul(I.exact(orientation)),qr=qR.mul(I.exact(orientation)),gpp=G2.mul(I.exact(orientation)),omegaL=K.add(ql.div(DL).mul(bp.div(DL)).sub(BB.div(DL).mul(gpp.div(DL)))),omegaR=K.sub(qr.div(DR).mul(bp.div(DR)).add(BB.div(DR).mul(gpp.div(DR))));
     cells.push({start:a,end:b,gamma:pair(G),first:pair(G1),second:pair(G2),third:pair(G3),transverse:pair(BB),leftDenominator:pair(DL),rightDenominator:pair(DR),curveRate:pair(K),leftRate:pair(omegaL),rightRate:pair(omegaR)});return;}
   }
  }
  const m=a+(b-a)/2;if(depth>=20||m===a||m===b){if(values){const gamma=g.evaluate(m);if(gamma.gamma<=0)issue('SOURCE_INPUT','γ 原函数的正值条件失败。');}if(error instanceof NonuniformHelixGeneralCP3966Error&&error.code==='SOURCE_INPUT')throw error;issue('NUMERIC_SOURCE','原完整函数域、半角正弦或导数包围在当前数值预算中未能分辨；没有缩短域。');}
  visit(a,m,depth+1);visit(m,b,depth+1);
 };
 visit(recipe.parameterStart,recipe.parameterEnd,0);return {cells,evaluations,halfSineSign:sign,originalDerivationBranch:c>0&&sign>0,roundingModel:'binary64-outward-2ulp/libm-endpoints-2ulp-assumed',intervalCertified:false as const,sourceHalfZero:false};
}
function basicFrame(recipe:NonuniformHelixGeneralCP3966Recipe,g:GammaKernel,u:number,c:number,s:number,orientation:number){
 const jet=g.evaluate(u),pi=g.ast?piLinear(g.ast,u):null,integerPi=pi&&pi.q===0&&Number.isInteger(pi.p)?pi.p:null,h=jet.gamma/2,hs=integerPi!==null?integerPi%2===0?0:Math.sin(integerPi*Math.PI/2):Math.sin(h),hc=integerPi!==null&&Math.abs(integerPi%2)===1?0:Math.cos(h),B=2*c*hs,ql=2*s+jet.first,qr=2*s-jet.first,dl=Math.hypot(ql,B),dr=Math.hypot(qr,B),sign=Math.sign(B),b=Math.abs(B),bp=sign*c*hc*jet.first,K=orientation*c*sign*hc,
  alongL=orientation*ql,alongR=orientation*qr,omegaL=K+(alongL/dl)*(bp/dl)-(b/dl)*(orientation*jet.second/dl),omegaR=K-(alongR/dr)*(bp/dr)-(b/dr)*(orientation*jet.second/dr),cu=Math.cos(u),su=u===0?0:Math.sin(u),T=[-c*su,c*cu,s],N=[-cu,-su,0],Z=[s*su,-s*cu,c],spatialBase:[number,number,number]=u===0?[recipe.radius,0,0]:[recipe.radius*cu,recipe.radius*su,recipe.radius*Math.tan(recipe.helicityAngleDeg*(Math.PI/180))*u],spatialPrime:[number,number,number]=[u===0?0:-recipe.radius*su,u===0?recipe.radius:recipe.radius*cu,recipe.radius*Math.tan(recipe.helicityAngleDeg*(Math.PI/180))],
  spaceL=T.map((t,i)=>(ql/dl)*t+(B/dl)*(hc*N[i]+hs*Z[i])) as [number,number,number],spaceR=T.map((t,i)=>(qr/dr)*t-(B/dr)*(hc*N[i]-hs*Z[i])) as [number,number,number];
 if(![jet.gamma,jet.first,jet.second,B,dl,dr,...spatialBase,...spatialPrime,...spaceL,...spaceR].every(finite))issue('NUMERIC_SOURCE','原 γ、空间源或导数在 double 中不可表示；未替换原规则。');
 return {...jet,B,b,dl,dr,K,sign,alongL,alongR,omegaL,omegaR,spaceL,spaceR,spatialBase,spatialPrime};
}
function integrateSource(recipe:NonuniformHelixGeneralCP3966Recipe,g:GammaKernel,c:number,s:number,orientation:number,domain:ReturnType<typeof encloseDomain>,V:number){
 const L=recipe.parameterEnd-recipe.parameterStart,extent=(recipe.radius*L)/Math.abs(c),nodes=Array.from({length:recipe.segments+1},(_,i)=>i===recipe.segments?recipe.parameterEnd:recipe.parameterStart+L*i/recipe.segments),maxG1=Math.max(...domain.cells.map(x=>Math.max(Math.abs(x.first[0]),Math.abs(x.first[1])))),maxG2=Math.max(...domain.cells.map(x=>Math.max(Math.abs(x.second[0]),Math.abs(x.second[1])))),
  initialGamma=g.evaluate(recipe.parameterStart),sign=domain.halfSineSign,maxStep=Math.min(1/32,1/(32+Math.abs(maxG1*L)+Math.sqrt(maxG2)*L)),initial=[0,0,0],states=new Map<number,number[]>([[recipe.parameterStart,initial]]);
 if(!finite(extent)||extent<=0||nodes.some((u,i)=>i&&u<=nodes[i-1]))issue('NUMERIC_SOURCE','原裁域、世界积分尺度或 u 网格不能在 double 中分离；没有补点。');
 const knownConstantPi=g.ast?piLinear(g.ast,recipe.parameterStart):null,oddPiConstant=g.affineSlope===0&&knownConstantPi?.q===0&&Number.isInteger(knownConstantPi.p)&&Math.abs(knownConstantPi.p%2)===1;
 const phaseAt=g.affineSlope!==null?(u:number)=>{const du=u-recipe.parameterStart,a=g.affineSlope!*du/4;return oddPiConstant?0:(orientation*c*sign*du)*Math.cos(initialGamma.gamma/2+a)*sinc(a);}:null,
  derivative=(t:number,y:number[])=>{const u=t===1?recipe.parameterEnd:recipe.parameterStart+L*t,b=basicFrame(recipe,g,u,c,s,orientation),delta=phaseAt?phaseAt(u):y[0];return [L*b.K,-extent*Math.sin(delta),extent*Math.cos(delta)];},
  rkC=[0,1/5,3/10,4/5,8/9,1,1],rkA=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],rkLow=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
 let t=0,y=initial.slice(),h=maxStep,steps=0,totalError=0,maximumPhaseError=0;
 const tauNodes=nodes.map((u,i)=>i===nodes.length-1?1:(u-recipe.parameterStart)/L);
 for(let i=1;i<nodes.length;i++){
  const end=tauNodes[i],breaks=g.knots.filter(u=>u>nodes[i-1]&&u<nodes[i]).map(u=>(u-recipe.parameterStart)/L);breaks.push(end);
  for(const target of breaks)while(t<target){if(++steps>16384)issue('NUMERIC_SOURCE','原解析函数积分超过 16384 步预算；高频函数没有被降阶或替换。');h=Math.min(h,maxStep,target-t);if(t+h===t)issue('NUMERIC_SOURCE','原积分步在 double 中不能分离。');const stages:number[][]=[];
   for(let k=0;k<7;k++){const trial=y.map((v,j)=>v+h*rkA[k].reduce((sum,w,m)=>sum+w*stages[m][j],0));stages.push(derivative(k===6?t+h:t+rkC[k]*h,trial));}
   const high=y.map((v,j)=>v+h*rkA[6].reduce((sum,w,k)=>sum+w*stages[k][j],0)),low=y.map((v,j)=>v+h*rkLow.reduce((sum,w,k)=>sum+w*stages[k][j],0)),differences=high.map((v,j)=>Math.abs(v-low[j])),error=Math.max(...differences.map((v,j)=>v/(j===0?4e-16+4e-15*Math.abs(high[0]):2e-14*Math.max(1,Math.abs(high[j]),Math.abs(y[j]),extent))));
   if(!finite(error)||!high.every(finite))issue('NUMERIC_SOURCE','原积分状态或工程误差估计溢出。');if(error<=1){t=t+h>=target?target:t+h;y=high;totalError+=Math.max(differences[1],differences[2]);maximumPhaseError+=differences[0];}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
  }if(phaseAt)y[0]=phaseAt(nodes[i]);states.set(nodes[i],y.slice());
 }
 return {nodes,states,extent,steps,integrationErrorEstimate:Math.max(16*totalError,16*Math.abs(extent)*maximumPhaseError),maximumPhaseError};
}
export function evaluateNonuniformHelixGeneralCP3966Source(raw:unknown):NonuniformHelixGeneralCP3966Source{
 const recipe=validateNonuniformHelixGeneralCP3966Recipe(raw),g=compileNonuniformHelixGamma(recipe.gammaFunction),theta=recipe.helicityAngleDeg*(Math.PI/180),c=Math.cos(theta),s=Math.sin(theta),orientation=Math.sign(c),L=recipe.parameterEnd-recipe.parameterStart,V=recipe.radius/Math.abs(c);
 if(Math.abs(recipe.helicityAngleDeg%180)===90)issue('SOURCE_INPUT','cosθ=0 时原 Tanθ 空间规则奇异；这不是半角选择限制。');
 if(![theta,c,s,L,V].every(finite)||V<=0||EPS*Math.abs(theta)*8>1e-7||EPS*Math.max(Math.abs(recipe.parameterStart),Math.abs(recipe.parameterEnd))*8>1e-7)issue('NUMERIC_SOURCE','原角度、速度或裁域超过当前浮点条件/可表示预算；没有机械半径或角度盒。');
 const domain=encloseDomain(recipe,g,c,s,orientation),gammaPlot=Array.from({length:129},(_,i)=>{const u=i===128?recipe.parameterEnd:recipe.parameterStart+L*i/128,j=g.evaluate(u);return {u,gamma:j.gamma,first:j.first,second:j.second};}),representation={ast:g.ast,knots:g.knots,coefficients:g.coefficients,model:g.definition.kind,wolframInterpolationEquivalent:false as const};
 if(domain.sourceHalfZero)return {recipe,frames:[],gammaPlot,gammaRepresentation:representation,domain,flattening:{status:'source-singularity',reason:'原 γ 正，但半角正弦为零：Normalize(T×r) 无平面初值恢复；空间规则不能冒称有限纸域。'},constants:{speed:V,sourceSpan:L,sourceExtent:(recipe.radius*L)/Math.abs(c),cosTheta:c,sinTheta:s,sourceOrientation:orientation},numericalPolicy:{model:'source-only exact known flatten singularity; no material constructed',intervalCertified:false,libmAccuracyCertified:false,integrationErrorIntervalCertified:false,maximumWorldErrorEstimateMm:0,maximumDirectorErrorEstimate:0,maximumDerivativeRelativeErrorEstimate:0,maximumSpatialRelativeErrorEstimate:0,worldReplayULPBoundMm:0,sourceUnitResidual:0,integrationErrorEstimate:0,integrationSteps:0,phaseIsSeedRelative:true,parameterScalingOnlyInternal:true}};
 const integral=integrateSource(recipe,g,c,s,orientation,domain,V);let unitResidual=0,replayScale=1;const frames=integral.nodes.map((u,i)=>{const f=basicFrame(recipe,g,u,c,s,orientation),state=integral.states.get(u)!,delta=i===0?0:state[0],T:Point=i===0?[0,1]:[-Math.sin(delta),Math.cos(delta)],N:Point=[-T[1],T[0]],base:Point=i===0?[1,0]:[1+state[1],state[2]],leftDirector:Point=[(f.alongL/f.dl)*T[0]+(f.b/f.dl)*N[0],(f.alongL/f.dl)*T[1]+(f.b/f.dl)*N[1]],rightDirector:Point=[(f.alongR/f.dr)*T[0]-(f.b/f.dr)*N[0],(f.alongR/f.dr)*T[1]-(f.b/f.dr)*N[1]],basePrime:Point=i===0?[0,V]:[V*T[0],V*T[1]];
  for(const d of [leftDirector,rightDirector,f.spaceL,f.spaceR])unitResidual=Math.max(unitResidual,Math.abs(d.reduce((sum,x)=>sum+x*x,0)-1));replayScale=Math.max(replayScale,...base.map(Math.abs),Math.abs(state[1]),Math.abs(state[2]));
  if(![delta,...base,...basePrime,...leftDirector,...rightDirector,f.omegaL,f.omegaR].every(finite))issue('NUMERIC_SOURCE','原平面世界帧、母线角速或导数不可表示。');return {u,gamma:f.gamma,gammaFirst:f.first,gammaSecond:f.second,deltaPhase:delta,phase:Math.PI/2+delta,base,basePrime,tangent:T,leftDirector,rightDirector,spatialBase:f.spatialBase,spatialPrime:f.spatialPrime,spatialLeftDirector:f.spaceL,spatialRightDirector:f.spaceR,leftAngularRate:f.omegaL,rightAngularRate:f.omegaR,leftTransverse:f.b/f.dl,rightTransverse:f.b/f.dr};});
 // The saved policy depends on the literal recipe/domain and fixed tolerance budget,
 // not on an engine's adaptive high/low cancellation or accepted-step count.
 const magnitude=1+Math.abs(integral.extent),maxU=Math.max(Math.abs(recipe.parameterStart),Math.abs(recipe.parameterEnd)),maxGamma=Math.max(...domain.cells.map(x=>Math.max(Math.abs(x.gamma[0]),Math.abs(x.gamma[1])))),maxK=Math.max(...domain.cells.map(x=>Math.max(Math.abs(x.curveRate[0]),Math.abs(x.curveRate[1])))),angleEstimate=EPS*(64+16*Math.abs(theta)+8*maxU+8*maxGamma),phaseEstimate=16*16384*(4e-16+4e-15*L*maxK),directorEstimate=angleEstimate+phaseEstimate,worldEstimate=16*16384*2e-14*magnitude+Math.abs(integral.extent)*directorEstimate+256*EPS*magnitude;
 if(![worldEstimate,directorEstimate].every(finite)||worldEstimate>magnitude*1e-7||directorEstimate>1e-7||unitResidual>128*EPS)issue('NUMERIC_SOURCE','原 source 有定义，但当前世界积分/角度/母线工程误差预算超限；不是原函数参数非法。');
 return {recipe,frames,gammaPlot,gammaRepresentation:representation,domain,flattening:{status:'computed',reason:null},constants:{speed:V,sourceSpan:L,sourceExtent:integral.extent,cosTheta:c,sinTheta:s,sourceOrientation:orientation},numericalPolicy:{model:'fixed DP54 tolerance/16384-step accumulation plus angle/IEEE engineering estimates; not an interval/libm certificate; observed integration statistics are not saved binding fields',intervalCertified:false,libmAccuracyCertified:false,integrationErrorIntervalCertified:false,maximumWorldErrorEstimateMm:worldEstimate,maximumDirectorErrorEstimate:directorEstimate,maximumDerivativeRelativeErrorEstimate:directorEstimate+64*EPS,maximumSpatialRelativeErrorEstimate:angleEstimate+64*EPS,worldReplayULPBoundMm:Math.max(16*ulp(replayScale+1),256*EPS*magnitude*Math.max(1,L*maxK)),sourceUnitResidual:unitResidual,integrationErrorEstimate:integral.integrationErrorEstimate,integrationSteps:integral.steps,phaseIsSeedRelative:true,parameterScalingOnlyInternal:true}};
}

function finitePartition(curves:Point[][],edges:[number,number][],faces:number[][]){
 const points=curves.flat(),buf=new ArrayBuffer(8),view=new DataView(buf);
 const dyadic=(x:number):[bigint,number]=>{if(!finite(x))fail();if(x===0)return [0n,0];view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n);
  let n=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),e=exponent?exponent-1075:-1074;if(bits>>63n)n=-n;
  while(n!==0n&&n%2n===0n){n/=2n;e++;}return [n,e];};
 const ratios=points.map(p=>p.map(dyadic)),e=Math.min(...ratios.flat().filter(([n])=>n!==0n).map(([,x])=>x)),
  p=ratios.map(row=>row.map(([n,ex])=>n<<BigInt(ex-e))),cross=(a:number,b:number,c:number)=>
   (p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  dotAt=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>= (p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<= (p[a][k]>p[b][k]?p[a][k]:p[b][k])),
  sign=(x:bigint)=>x>0n?1:x<0n?-1:0,n=curves[0].length-1,s=n+1;
 if(new Set(points.map(x=>x.join(','))).size!==points.length)fail('有限源顶点出现不同身份同坐标，未容差吸附。');
 let minimumTriangleCross=Infinity,nonconvexCells=0;const diagonals:[number,number][]=[];
 for(let i=0;i<n;i++)for(const cell of [[i,i+1,s+i+1,s+i],[i+1,i,2*s+i,2*s+i+1]]){
  const [a,b,c,d]=cell,area=cross(a,b,c)+cross(a,c,d);
  if(area<=0n)fail('实际验证 cell 面积非正，未补点或添加加工缝。');
  if(cell.some((a,k)=>cross(a,cell[(k+1)%4],cell[(k+2)%4])<=0n))nonconvexCells++;
  const triangles=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:
   cross(b,c,d)>0n&&cross(b,d,a)>0n?[[b,c,d],[b,d,a]]:null;
  if(!triangles)fail('当前有限 cell 没有可靠正向对角三角剖分；未移动源点。');
  diagonals.push(triangles[0][0]===a?[a,c]:[b,d]);
  for(const triangle of triangles){const [a,b,c]=triangle.map(i=>points[i]);
   minimumTriangleCross=Math.min(minimumTriangleCross,(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));}
 }
 const partition=[...edges];for(let i=1;i<n;i++)partition.push([i,s+i],[i,2*s+i]);partition.push(...diagonals);let pairs=0,sharedPairs=0;
 const boxes=partition.map(([a,b])=>[Math.min(points[a][0],points[b][0]),Math.max(points[a][0],points[b][0]),Math.min(points[a][1],points[b][1]),Math.max(points[a][1],points[b][1])]);
 partition.forEach(([a,b])=>{if(p[a][0]===p[b][0]&&p[a][1]===p[b][1])fail('有限分区含零长边。');});
 // Shared pairs are enumerated once at their indexed vertex; distinct edges cannot share both ends.
 const incident=points.map(()=>[] as number[]);
 partition.forEach(([a,b],i)=>{incident[a].push(i);incident[b].push(i);});
 incident.forEach((es,shared)=>{for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
  sharedPairs++;const [a,b]=partition[es[i]],[c,d]=partition[es[j]],x=a===shared?b:a,y=c===shared?d:c;
  if(cross(shared,x,y)===0n&&dotAt(shared,x,y)>0n)fail('分区共顶点边有同射线重叠。');
 }});
 pairs=partition.length*(partition.length-1)/2-sharedPairs;
 // Sweep only strict-overlap boxes. Skipped boxes are exactly coordinate-separated on binary64 points.
 const order=Array.from({length:partition.length},(_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]||a-b);let active:number[]=[];
 for(const i of order){
  active=active.filter(j=>boxes[j][1]>=boxes[i][0]);
  for(const j of active){
   if(boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;
   const [a,b]=partition[i],[c,d]=partition[j];if(a===c||a===d||b===c||b===d)continue;
   if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))
    fail('有限分区有非相邻交叉、触点或重叠；拒绝采用，未修补原点。');
  }
  active.push(i);
 }
 const areas=faces.map(face=>{const origin=face[0],exact=face.reduce((a,b,i)=>a+cross(origin,b,face[(i+1)%face.length]),0n);if(exact<=0n)fail('实际两面面积必须严格为正。');const o=points[face[0]];return face.reduce((sum,a,i)=>{const b=points[face[(i+1)%face.length]];return sum+(points[a][0]-o[0])*(b[1]-o[1])-(points[a][1]-o[1])*(b[0]-o[0]);},0)/2;});
 if(!areas.every(x=>finite(x)&&x>0)||!finite(minimumTriangleCross)||minimumTriangleCross<=0)fail('有限纸域面积或三角剖分不可用。');
 return {arithmetic:'exact-dyadic-integer-signs-on-actual-binary64-points',validationCells:2*n,validationTriangles:4*n,nonconvexCells,minimumTriangleCross,
  partitionEdges:partition.length,validationOnlyRulingEdges:2*(n-1),validationOnlyDiagonals:diagonals.length,nonincidentPairs:pairs,sharedVertexPairs:sharedPairs,signedFaceAreas:areas,
  logicalFaces:2,validationRulingsAreCPEdges:false,validationDiagonalsAreCPEdges:false,coordinateWelding:false};
}
function materialGraph(curves:Point[][]){
 const n=curves[0].length-1,s=n+1,vertices_coords=curves.flat().map(clone),edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const add=(a:number,b:number,k:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='U'?null:0);ids.push(id);};
 for(let i=0;i<n;i++){add(i,i+1,'U',`nonuniform-general-crease-${i}`);add(s+i,s+i+1,'B',`nonuniform-general-left-${i}`);add(2*s+i,2*s+i+1,'B',`nonuniform-general-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`nonuniform-general-cap-left-${i}`);add(i,2*s+i,'B',`nonuniform-general-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}


function paperChecks(r:NonuniformHelixGeneralCP3966Recipe,source:NonuniformHelixGeneralCP3966Source){
 if(source.flattening.status!=='computed')issue('PAPER_DOMAIN',source.flattening.reason!);
 const V=source.constants.speed,margin=128*EPS*Math.max(1,V),g=compileNonuniformHelixGamma(r.gammaFunction),C=I.around(source.constants.cosTheta),S=I.around(source.constants.sinTheta),orientation=source.constants.sourceOrientation,sign=source.domain.halfSineSign;
 const boundCell=(a:number,b:number):DomainCell=>{const [G,G1,G2,G3]=g.bound(a,b),[hs,hc]=G.div(I.exact(2)).sincos(),B=C.mul(hs).mul(I.exact(2*sign)),bp=C.mul(hc).mul(G1).mul(I.exact(sign)),K=C.mul(hc).mul(I.exact(orientation*sign)),ql=S.mul(I.exact(2)).add(G1),qr=S.mul(I.exact(2)).sub(G1),den=(q:I)=>new I(down(Math.hypot(q.minAbs(),B.lo)),up(Math.hypot(q.maxAbs(),B.hi))),dl=den(ql),dr=den(qr),qL=ql.mul(I.exact(orientation)),qR=qr.mul(I.exact(orientation)),gpp=G2.mul(I.exact(orientation)),wl=K.add(qL.div(dl).mul(bp.div(dl)).sub(B.div(dl).mul(gpp.div(dl)))),wr=K.sub(qR.div(dr).mul(bp.div(dr)).add(B.div(dr).mul(gpp.div(dr))));return {start:a,end:b,gamma:pair(G),first:pair(G1),second:pair(G2),third:pair(G3),transverse:pair(B),leftDenominator:pair(dl),rightDenominator:pair(dr),curveRate:pair(K),leftRate:pair(wl),rightRate:pair(wr)};};
 let checked=0,leftMinimum=Infinity,rightMaximum=-Infinity,leftFocusLower=Infinity,rightFocusLower=Infinity;const adopted:DomainCell[]=[];
 const visit=(cell:DomainCell,depth:number):void=>{
  if(++checked>4095)issue('PAPER_DOMAIN','原 source 已计算；当前宽度的完整 Jacobian 数值包围超过预算，没有自动内切。');const B=from(cell.transverse),dl=from(cell.leftDenominator),dr=from(cell.rightDenominator),wl=from(cell.leftRate),wr=from(cell.rightRate),left=I.exact(V).mul(B.div(dl)).sub(I.exact(r.leftWidth).mul(new I(Math.max(0,wl.lo),Math.max(0,wl.hi)))),right=I.exact(-V).mul(B.div(dr)).sub(I.exact(r.rightWidth).mul(new I(Math.min(0,wr.lo),Math.min(0,wr.hi))));
  if(left.lo>margin&&right.hi<-margin){leftMinimum=Math.min(leftMinimum,left.lo);rightMaximum=Math.max(rightMaximum,right.hi);if(wl.hi>0)leftFocusLower=Math.min(leftFocusLower,V*B.lo/dl.hi/wl.hi);if(wr.lo<0)rightFocusLower=Math.min(rightFocusLower,V*B.lo/dr.hi/(-wr.lo));adopted.push(cell);return;}
  const mid=cell.start+(cell.end-cell.start)/2,point=basicFrame(r,g,mid,source.constants.cosTheta,source.constants.sinTheta,orientation),jl=V*point.b/point.dl-r.leftWidth*Math.max(0,point.omegaL),jr=-V*point.b/point.dr-r.rightWidth*Math.min(0,point.omegaR);
  if(jl<=margin||jr>=-margin)issue('PAPER_DOMAIN',`${jl<=margin?'左':'右'}宽越过完整原函数的局部焦点/数值余量；原单位宽参考保留，没有调整输入。`);
  if(depth>=20||mid===cell.start||mid===cell.end)issue('PAPER_DOMAIN','当前宽度尚不能在完整函数域留下可分辨的正 Jacobian 余量；原 source 仍有效。');visit(boundCell(cell.start,mid),depth+1);visit(boundCell(mid,cell.end),depth+1);
 };
 source.domain.cells.forEach(c=>visit(c,0));
 const maxK=Math.max(...adopted.map(c=>from(c.curveRate).maxAbs())),maxOmega=Math.max(...adopted.flatMap(c=>[from(c.leftRate).maxAbs(),from(c.rightRate).maxAbs()])),first=source.frames[0],bmin=Math.min(first.leftTransverse,first.rightTransverse),aMax=Math.sqrt(Math.max(0,1-bmin*bmin)),beta=1/Math.sqrt(1+(1+aMax*aMax)/(bmin*bmin)),L=r.parameterEnd-r.parameterStart,W=Math.max(r.leftWidth,r.rightWidth),eta=Math.hypot(maxK*L+W*maxOmega/V,maxOmega*L),
  unitLeftMinimum=Math.min(...source.domain.cells.map(c=>V*c.transverse[0]/c.leftDenominator[1]-Math.max(0,c.leftRate[1]))),unitRightMaximum=Math.max(...source.domain.cells.map(c=>-V*c.transverse[0]/c.rightDenominator[1]-Math.min(0,c.rightRate[0])));
 return {leftJacobianLowerEngineering:leftMinimum,rightJacobianUpperEngineering:rightMaximum,leftFocusLowerEngineeringMm:finite(leftFocusLower)?leftFocusLower:null,rightFocusLowerEngineeringMm:finite(rightFocusLower)?rightFocusLower:null,checkedCells:checked,
  idealCombinedEmbeddingSufficientEstimate:{eta,beta,positiveMargin:beta-eta,conditionMet:eta<beta,theorem:'source88 combined bi-Lipschitz perturbation sufficient condition',intervalCertified:false,ODEErrorIntervalCertified:false,conditionFalseDoesNotRejectFinitePaper:true},originalUnitWidthReference:{widths:[1,1],leftRegularUnderEngineeringBounds:unitLeftMinimum>margin,rightRegularUnderEngineeringBounds:unitRightMaximum<-margin,originalNativeFlagsAltered:false}};
}
function documentFromSource(recipe:NonuniformHelixGeneralCP3966Recipe,source:NonuniformHelixGeneralCP3966Source,shared=false):Doc{
 const {integrationErrorEstimate:_observedError,integrationSteps:_observedSteps,...savedNumericalPolicy}=source.numericalPolicy;
 const paper=paperChecks(recipe,source),frames=source.frames,curves=[frames.map(f=>clone(f.base)),frames.map(f=>[f.base[0]+recipe.leftWidth*f.leftDirector[0],f.base[1]+recipe.leftWidth*f.leftDirector[1]] as Point),frames.map(f=>[f.base[0]+recipe.rightWidth*f.rightDirector[0],f.base[1]+recipe.rightWidth*f.rightDirector[1]] as Point)],{graph,ids,proof}=materialGraph(curves),points=graph.vertices_coords,
  bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},doc:Doc={schemaVersion:2,name:'原非均匀螺旋 · 任意折角函数两面 CP',paper:bbox,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 if(points.some(p=>p.some(x=>Math.abs(x)>1e6)))issue('MATERIAL_INTERFACE','原 source 与当前有限图已计算；现材料核心绝对毫米坐标 ≤10⁶，不支持该域，未缩放或移点。');
 let material;try{material=createMaterialTopology(doc,graph,ids);}catch(e){issue('MATERIAL_INTERFACE',`实际有限图已检查；现材料核心坐标/epsilon 能力不支持该图：${(e as Error).message}`);}
 doc.metadata={materialTopology:material,originalNonuniformHelixGeneral3966:{schema:SCHEMA,recipe,
  source:{definitionCells:['In[3959]','In[3963]','In[3966]','In[3935]'],functions:['CurvedFoldHelix3D','NCurvedFoldHelix2D'],radius:recipe.radius,helicityAngleDeg:recipe.helicityAngleDeg,gammaFunction:recipe.gammaFunction,
   gammaIsOriginalFunction:true,affineEndpointsSubstituted:false,parameterIsOriginalU:true,parameterIsArcLength:false,currentStartReseeded:true,initialParameter:recipe.parameterStart,initialPoint:[1,0],initialTangent:[0,1],coordinateTransform:'identity',coordinateUnit:'mm',originalCoordinateUnit:'unspecified',localUnitConvention:'1 original world coordinate unit = 1 mm',originalGraphicsWidths:[1,1],unitWidthsIndependentOfRadius:true,originalGraphicsCurveDivisions:100,
   originalFoldLineStyle:'FoldedLine',originalRulingStyles:['UnfoldedLine','UnfoldedLine'],originalMVSpecified:false,rightDirectorReversed:false,originalDerivationAssumptions:['r>0','theta in Reals','cos(theta)>0','sin(gamma(u)/2)>0'],originalDerivationBranch:source.domain.originalDerivationBranch,
   sourceBranchRole:source.domain.originalDerivationBranch?'original-positive-half-sine-derivation-branch':'explicit-Cartesian-literal-extension-with-original-NormalizeReal-planar-projection',gammaBelowPiRequired:false,
   gammaRepresentationRole:recipe.gammaFunction.kind==='expression'?'safe scalar expression with value and derivatives':'explicit local natural C2 cubic points model',wolframInterpolatingFunctionEquivalent:false,originalWolframFunctionCoverageComplete:false,nativeHTTPInvoked:false,interpolationReproduced:false,wolframOptionsReproduced:false,symbolicSolverReproduced:false,originalSaved128OptionChainReproduced:false},
  sourceFrames:shared?frames:clone(frames),gammaRepresentation:clone(source.gammaRepresentation),gammaPlot:shared?source.gammaPlot:clone(source.gammaPlot),sourceDomain:clone(source.domain),sourceConstants:clone(source.constants),numericalPolicy:clone(savedNumericalPolicy),
  paperDomain:{role:recipe.leftWidth===1&&recipe.rightWidth===1?'original-unit-width-on-selected-domain':'explicit-user-inset-of-original-unit-width',widths:[recipe.leftWidth,recipe.rightWidth],parameterRange:[recipe.parameterStart,recipe.parameterEnd],sourceValiditySeparateFromMaterialAdoption:true,...paper,continuousGlobalInjectivityCertified:false,floatingSourceErrorIntervalCertified:false,actualFiniteTwoFaceCoverVerified:true,coreCoordinateMagnitudeLimitMm:1e6,coreGeometryEpsilonPolicy:'existing material core retained'},
  sampling:{segments:recipe.segments,parameterStep:(recipe.parameterEnd-recipe.parameterStart)/recipe.segments,method:'original u grid / current-uStart relative-phase DP54 source / finite chords',uniformParameterNodes:true,exactContinuousCurve:false,curveDivisionsAreInterpolationPoints:false,WolframInterpolationReproduced:false},
  finitePaperProof:proof,topology:{vertices:points.length,edges:ids.length,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,interiorRulingSeams:0},
  evidence:{adoption:'explicit-two-dimensional-cp-only',originalFoldedLineTreatedAsMV:false,finiteRigid3D:false,sourceSpaceReferenceIsRigidFoldedVertices:false,FF:false,layers:false,collisionCertified:false,sourceFunctionIntervalCertified:false}}};return doc;
}
export function nonuniformHelixGeneralCP3966Document(raw:unknown):Doc{const recipe=validateNonuniformHelixGeneralCP3966Recipe(raw);return documentFromSource(recipe,evaluateNonuniformHelixGeneralCP3966Source(recipe));}
export function prepareNonuniformHelixGeneralCP3966Preview(raw:unknown){const recipe=validateNonuniformHelixGeneralCP3966Recipe(raw),source=evaluateNonuniformHelixGeneralCP3966Source(recipe),freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(source);
 return {source,build:(nextRaw:unknown):Doc=>{const next=validateNonuniformHelixGeneralCP3966Recipe(nextRaw);for(const key of ['radius','helicityAngleDeg','gammaFunction','parameterStart','parameterEnd','segments'] as const)if(JSON.stringify(next[key])!==JSON.stringify(recipe[key]))issue('SOURCE_INPUT','原函数/源参数或裁域已变化，须重新求本次源；宽度缓存没有替换它。');return documentFromSource(next,source,true);}};
}
export function readNonuniformHelixGeneralCP3966Recipe(doc:Doc):NonuniformHelixGeneralCP3966Recipe|null{try{const saved=doc.metadata?.originalNonuniformHelixGeneral3966;if(!object(saved)||saved.schema!==SCHEMA)return null;return validateNonuniformHelixGeneralCP3966Recipe(saved.recipe);}catch{return null;}}
function same(a:unknown,b:unknown,path:string,bound:number,derivativeScale=0):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(/^sourceFrames\.\d+\.(base|basePrime|tangent|leftDirector|rightDirector|spatialBase|spatialPrime|spatialLeftDirector|spatialRightDirector)\.\d+$/.test(path))return Math.abs(a-b)<=Math.max(/Director|tangent/.test(path)?32*ulp(1):0,/Prime/.test(path)?32*ulp(derivativeScale):0,16*ulp(a),16*ulp(b),/\.base\./.test(path)?bound:0);
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=Math.max(bound,32*ulp(a),32*ulp(b));
  if(/^(?:sourceFrames\.\d+\.(?:gamma|gammaFirst|gammaSecond|deltaPhase|phase|leftAngularRate|rightAngularRate|leftTransverse|rightTransverse)|gammaPlot\.\d+\.(?:gamma|first|second)|gammaRepresentation\.coefficients\.\d+\.\d+|sourceDomain\.cells\.\d+\.(?:gamma|first|second|third|transverse|leftDenominator|rightDenominator|curveRate|leftRate|rightRate)\.[01]|sourceConstants\.(?:speed|sourceExtent|cosTheta|sinTheta)|paperDomain\.(?:leftJacobianLowerEngineering|rightJacobianUpperEngineering|leftFocusLowerEngineeringMm|rightFocusLowerEngineeringMm|idealCombinedEmbeddingSufficientEstimate\.(?:eta|beta|positiveMargin)))$/.test(path))return Math.abs(a-b)<=Math.max(64*EPS*Math.max(1,Math.abs(a),Math.abs(b)),16*ulp(a),16*ulp(b));
  if(/^numericalPolicy\.(?:maximumWorldErrorEstimateMm|maximumDirectorErrorEstimate|maximumDerivativeRelativeErrorEstimate|maximumSpatialRelativeErrorEstimate|worldReplayULPBoundMm)$/.test(path))return a>=0&&b>=0&&Math.abs(a-b)<=64*Math.max(ulp(a),ulp(b));return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i],path+'.'+i,bound,derivativeScale));
 if(object(a)||object(b)){if(!object(a)||!object(b)||!keys(a,Object.keys(b)))return false;return Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k,bound,derivativeScale));}return a===b;
}
/** Input/identity remain exact; ULP allowances only cover actual derived fields. */
export function nonuniformHelixGeneralCP3966SourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const recipe=readNonuniformHelixGeneralCP3966Recipe(doc),saved=doc.metadata?.originalNonuniformHelixGeneral3966;if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=nonuniformHelixGeneralCP3966Document(recipe),own=expected.metadata!.originalNonuniformHelixGeneral3966 as any,bound=own.numericalPolicy.worldReplayULPBoundMm,actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined)return false;
  // These proof metrics authenticate the actual stored graph, including cancellation
  // in its determinants. Comparing them to a fresh Node curve is the wrong binding.
  const size=recipe.segments+1,curves=[0,1,2].map(i=>actual.graph.vertices_coords.slice(i*size,(i+1)*size)),proof=finitePartition(curves,actual.graph.edges_vertices,actual.graph.faces_vertices!);
  if(JSON.stringify(saved.finitePaperProof)!==JSON.stringify(proof))return false;
  let residual=0;for(const f of saved.sourceFrames??[])for(const key of ['leftDirector','rightDirector','spatialLeftDirector','spatialRightDirector']){const d=f[key];if(!Array.isArray(d)||!d.every(finite))return false;residual=Math.max(residual,Math.abs(d.reduce((sum:number,x:number)=>sum+x*x,0)-1));}
  if(saved.numericalPolicy?.sourceUnitResidual!==residual||residual>128*EPS)return false;
  const normalized=clone(saved);normalized.finitePaperProof=own.finitePaperProof;normalized.numericalPolicy.sourceUnitResidual=own.numericalPolicy.sourceUnitResidual;
  if(!same(normalized,own,'',bound,own.sourceConstants.speed)||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology',bound)||!same(actual.graph,target.graph,'materialTopology.graph',bound)||!same(actual.edgeSegmentIds,target.edgeSegmentIds,'',bound)||doc.segments.length!==expected.segments.length||new Set(doc.segments.map(s=>s.id)).size!==doc.segments.length)return false;
  const near=(a:Point,b:Point)=>a.length===2&&a.every((v,i)=>finite(v)&&Math.abs(v-b[i])<=Math.max(bound,16*ulp(v),16*ulp(b[i])));
  for(const e of expected.segments){const s=doc.segments.find(x=>x.id===e.id);if(!s||s.assignment!==e.assignment||s.angle!==e.angle||!near(s.a,e.a)||!near(s.b,e.b))return false;}
  const first=saved.sourceFrames?.[0];if(JSON.stringify(first?.base)!=='[1,0]'||JSON.stringify(first?.tangent)!=='[0,1]'||first?.basePrime?.[0]!==0||first?.deltaPhase!==0||first?.phase!==Math.PI/2||JSON.stringify(actual.graph.vertices_coords[0])!=='[1,0]')return false;
  for(let e=0;e<target.graph.edges_vertices.length;e++){const [a,b]=target.graph.edges_vertices[e],s=doc.segments.find(x=>x.id===target.edgeSegmentIds[e])!;if(a===0&&JSON.stringify(s.a)!=='[1,0]'||b===0&&JSON.stringify(s.b)!=='[1,0]')return false;}
  for(let i=0;i<own.sourceFrames.length;i++)if(own.sourceFrames[i].u===0){const f=saved.sourceFrames?.[i];if(JSON.stringify(f?.spatialBase)!==JSON.stringify([recipe.radius,0,0])||f?.spatialPrime?.[0]!==0||f?.spatialPrime?.[1]!==recipe.radius)return false;}
  if(!object(doc.paper)||!keys(doc.paper,['width','height']))return false;const points=doc.segments.flatMap(s=>[s.a,s.b]),box={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};return (['width','height'] as const).every(k=>finite(doc.paper[k])&&doc.paper[k]>0&&Math.abs(doc.paper[k]-expected.paper[k])<=Math.max(bound,16*ulp(doc.paper[k]))&&Math.abs(doc.paper[k]-box[k])<=Math.max(bound,16*ulp(doc.paper[k])));
 }catch{return false;}
}
