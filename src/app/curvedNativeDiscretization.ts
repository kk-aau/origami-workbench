import {api} from './api';

export type DiscretizationNativeMode='system'|'uniform'|'multipliers';
export type DiscretizationExpression=string|DiscretizationExpression[];
export type DiscretizationValue=number|null|DiscretizationValue[];
type CommonQuery={family:'discretization-generic-native'};
export type DiscretizationSystemQuery=CommonQuery&{mode:'system';rules:{key:string;expression:DiscretizationExpression}[];parameters:number[]};
export type DiscretizationUniformQuery=CommonQuery&{mode:'uniform';curve:string[];divisions:number;parameterStart:number;parameterEnd:number};
export type DiscretizationMultipliersQuery=CommonQuery&{mode:'multipliers';foldPoints:number[][];leftRulings:number[][];rightRulings:number[][]};
export type NativeDiscretizationQuery=DiscretizationSystemQuery|DiscretizationUniformQuery|DiscretizationMultipliersQuery;
export const DISCRETIZATION_NATIVE_LIMITS={maximumRules:64,maximumExpressionLeaves:256,maximumNestingDepth:4,maximumListEntries:256,maximumStructureNodes:2048,maximumParameters:256,maximumCurveDimension:64,maximumDivisions:64,maximumFoldVertices:512,maximumScalarEvaluations:262144,maximumAstWeightedEvaluations:8000000,maximumRootEvaluations:4096,maximumOffsetProducts:262144,maximumSourceAstNodes:96,maximumSourceCharacters:240,maximumParameterMagnitude:1e6} as const;
const common={family:'discretization-generic-native' as const},ray=(degrees:number)=>[Math.cos(degrees*Math.PI/180),Math.sin(degrees*Math.PI/180)];
export const DISCRETIZATION_NATIVE_PRESETS:Record<DiscretizationNativeMode,NativeDiscretizationQuery>={
 system:{...common,mode:'system',rules:[{key:'Curve2D',expression:['s','s**2']},{key:'Curve2D',expression:'s+1'}],parameters:[0,.25,.5,.75,1]},
 uniform:{...common,mode:'uniform',curve:['-s**2','s'],divisions:4,parameterStart:0,parameterEnd:1},
 multipliers:{...common,mode:'multipliers',foldPoints:[[-Math.cos(Math.PI/9),Math.sin(Math.PI/9)],[0,0],[Math.cos(Math.PI/9),Math.sin(Math.PI/9)]],leftRulings:[ray(100),ray(100),ray(100)],rightRulings:[ray(260),ray(260),ray(260)]},
};
export const DISCRETIZATION_NATIVE_NAMES:Record<DiscretizationNativeMode,string>={system:'有序系统采样',uniform:'原弦向方程离散化',multipliers:'二维折角倍率'};
export type DiscretizationBudget={scalarEvaluations:number;astWeightedEvaluations:number;offsetProducts:number};
export type DiscretizationSystemSample={parameters:number[];rules:{key:string;values:DiscretizationValue[]}[];undefined:{ruleIndex:number;sampleIndex:number;path:number[];parameter:number;state:'not-finite-real';code:'source-undefined'}[];allSamplesFiniteReal:boolean;ruleOrderPreserved:true;parameterOrderPreserved:true;budget:DiscretizationBudget};
export type DiscretizationUniformSample={parameters:number[];initialGuess:number[];points:number[][];normalizedPoints:number[][];normalization:{origin:number[];scale:number};normalizedChordLengths:number[];equations:{vertex:number;parameter:number;derivative:number[];equationResidualDividedByCommonScale:number;directionResidual:number;stationaryDerivative:boolean}[];maximumDirectionResidual:number;residualTolerance:2e-10;strictlyOrderedAlongRequestedInterval:boolean;outsideRequestedInterval:number[];stationaryVertices:number[];unconstrainedParameters:true;solver:{method:string;success:boolean;status:number;nfev:number};equationEvaluations:number;budget:DiscretizationBudget};
export type DiscretizationMultipliersSample={foldPoints:number[][];leftRulings:number[][];rightRulings:number[][];sectors:{vertex:number;a1:number|null;a2:number|null;a3:number|null;a4:number|null}[];kawasaki:{vertex:number;alternatingAngle:number;choppedAngle:number}[];chopTolerance:1e-10;chopComparison:string;chopAppliedToDenominator:false;multipliers:(number|null)[];quotients:{vertex:number;numerator:number;denominator:number;value:number|null;state:string;originalDenominatorNonzero:boolean}[];allMultipliersFinite:boolean;rawDirectionsPreserved:true};
export type NativeDiscretizationResult={family:'origamica-generic-discretization';query:NativeDiscretizationQuery;source:{function:string;definitionCell:string;origin:'notebook-definition';wolframNumericOutAvailable:false;numericModel:'finite-real-binary64';chopDocumentation:string|null};limits:typeof DISCRETIZATION_NATIVE_LIMITS;certification:{sourceFormulaEvaluated:true;allSampledValuesFinite:boolean;rootEquationNumericallyVerified:boolean;rootBranchEquivalentToWolfram:false;allRootsEnumerated:false;continuousDomainCertified:false;symbolicObjectsReproduced:false;wolframOptionsReproduced:false;integrationErrorIntervalCertified:false;adoptableCreasePattern:false;globalFoldingCertified:false};sample:DiscretizationSystemSample|DiscretizationUniformSample|DiscretizationMultipliersSample};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const integer=(x:unknown,lo:number,hi:number)=>finite(x)&&Number.isInteger(x)&&x>=lo&&x<=hi;
const sum=(values:number[])=>{const partials:number[]=[];for(let x of values){let i=0;for(let y of partials){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}partials.length=i;partials.push(x);}return partials.reduceRight((a,b)=>a+b,0);};
function fail(message='原离散化来源、方程、规则次序或未定义状态回读不一致。'):never{throw Error(message);}
class SourceUndefined extends Error{}
class WorkBudget{scalar=0;weighted=0;offsets=0;
 charge(cost:number){this.scalar++;this.weighted+=cost;if(this.scalar>262144||this.weighted>8000000)fail('独立回读超过求值预算。');}
 product(a:number,b:number){const count=a*b;if(count>262144-this.offsets)fail('独立回读超过补偿常数乘积预算。');this.offsets+=count;}
 report():DiscretizationBudget{return {scalarEvaluations:this.scalar,astWeightedEvaluations:this.weighted,offsetProducts:this.offsets};}}
type Node={kind:'constant';value:number}|{kind:'variable'}|{kind:'unary';minus:boolean;a:Node}|{kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
type Parts={offsets:number[];value:number;derivative:number};
/** Independent recursive-descent AST and forward derivative; no eval or Function. */
function compile(source:string){
 if(typeof source!=='string'||source.length<1||source.length>240)fail('表达式须为1–240字符。');
 const aliases:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'},functions=['sin','cos','tan','atan','sqrt','exp','log'],tokens:string[]=[];
 let offset=0,pos=0,cost=0;
 while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
  if(!m){if(!source.slice(offset).trim())break;fail('表达式包含非数学语法。');}const token=aliases[m[1]]??m[1],previous=tokens.at(-1),word=(t:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(t);
  if(previous&&(word(previous)||previous===')')&&(word(token)||token==='(')&&!(functions.includes(previous)&&token==='('))tokens.push('*');tokens.push(token);offset+=m[0].length;}
 const addCost=(n:number)=>{cost+=n;if(cost>96)fail('单个源超过96个AST节点。');},take=()=>tokens[pos++],peek=()=>tokens[pos],exponent=(n:Node):number=>n.kind==='constant'&&Number.isInteger(n.value)?n.value:n.kind==='unary'&&n.a.kind==='constant'&&Number.isInteger(n.a.value)?(n.minus?-1:1)*n.a.value:fail('指数须为−8…8的整数字面量。');
 const atom=():Node=>{const t=take();if(t==='('){const n=add();if(take()!==')')fail('括号不匹配。');return n;}if(/^(?:\d|\.)/.test(t??'')){const value=Number(t);if(!finite(value)||Math.abs(value)>1e12)fail('源常数须为±10¹²内有限数。');addCost(1);return {kind:'constant',value};}
  if(t==='s'){addCost(2);return {kind:'variable'};}if(t==='pi'||t==='e'){addCost(2);return {kind:'constant',value:t==='pi'?Math.PI:Math.E};}
  if(functions.includes(t)&&take()==='('){addCost(3);const a=add();if(take()!==')')fail('函数仅接受一个参数。');return {kind:'call',name:t,a};}return fail('只允许s、pi/e与白名单数学函数。');};
 const power=():Node=>{let a=atom();if(peek()==='**'){take();const b=unary();if(Math.abs(exponent(b))>8)fail('整数幂超出−8…8。');addCost(2);a={kind:'binary',op:'**',a,b};}return a;};
 const unary=():Node=>{if(peek()==='+'||peek()==='-'){const minus=take()==='-';addCost(2);return {kind:'unary',minus,a:unary()};}return power();};
 const product=():Node=>{let a=unary();while(peek()==='*'||peek()==='/'){const op=take();addCost(2);a={kind:'binary',op,a,b:unary()};}return a;};
 const add=():Node=>{let a=product();while(peek()==='+'||peek()==='-'){const op=take();addCost(2);a={kind:'binary',op,a,b:product()};}return a;};
 const tree=add();if(pos!==tokens.length)fail('表达式有未使用的语法。');
 const variableNodes=new WeakMap<Node,boolean>(),hasVariable=(n:Node):boolean=>{const known=variableNodes.get(n);if(known!==undefined)return known;const v=n.kind==='variable'||n.kind==='binary'&&(hasVariable(n.a)||hasVariable(n.b))||(n.kind==='unary'||n.kind==='call')&&hasVariable(n.a);variableNodes.set(n,v);return v;};hasVariable(tree);
 return {cost,parts(s:number,budget:WorkBudget,withDerivative=false):Parts{
  budget.charge(cost);const total=(p:Parts)=>sum([...p.offsets,p.value]),check=(p:Parts)=>{if(![...p.offsets,p.value,p.derivative].every(finite))throw new SourceUndefined();return p;};
  const mul=(a:Parts,b:Parts):Parts=>{budget.product(a.offsets.length,b.offsets.length);let offsets=a.offsets.flatMap(x=>b.offsets.map(y=>x*y));if(offsets.length>256)offsets=[sum(offsets)];const ca=sum(a.offsets),cb=sum(b.offsets);
   return check({offsets,value:sum([ca*b.value,cb*a.value,a.value*b.value]),derivative:withDerivative?sum([ca*b.derivative,cb*a.derivative,a.derivative*b.value,a.value*b.derivative]):0});};
  const visit=(n:Node):Parts=>{
   // Pure constants have zero derivative, including sqrt(0). Only syntax
   // establishes constancy: no stationary-sample or cancellation heuristic.
   if(withDerivative&&!hasVariable(n)){withDerivative=false;try{return visit(n);}finally{withDerivative=true;}}
   if(n.kind==='constant')return {offsets:[n.value],value:0,derivative:0};if(n.kind==='variable')return {offsets:[],value:s,derivative:withDerivative?1:0};
   if(n.kind==='unary'){const p=visit(n.a);return n.minus?{offsets:p.offsets.map(x=>-x),value:-p.value,derivative:-p.derivative}:p;}
   if(n.kind==='call'){const a=visit(n.a),x=total(a);if(n.name==='sqrt'&&(x<0||withDerivative&&x===0)||n.name==='log'&&x<=0)throw new SourceUndefined();
    const value=Math[n.name as 'sin'|'cos'|'tan'|'atan'|'sqrt'|'exp'|'log'](x),factor=!withDerivative?0:n.name==='sin'?Math.cos(x):n.name==='cos'?-Math.sin(x):n.name==='tan'?1/Math.cos(x)**2:n.name==='atan'?1/(1+x*x):n.name==='sqrt'?1/(2*value):n.name==='exp'?value:1/x;
    return check({offsets:[],value,derivative:withDerivative?factor*a.derivative:0});}
   const a=visit(n.a);if(n.op==='**'){const k=exponent(n.b);if(k<0){const v=total(a);if(!v)throw new SourceUndefined();return check({offsets:[],value:v**k,derivative:withDerivative?k*v**(k-1)*a.derivative:0});}let p:Parts={offsets:[1],value:0,derivative:0};for(let i=0;i<k;i++)p=mul(p,a);return p;}
   const b=visit(n.b);if(n.op==='+'||n.op==='-'){const sign=n.op==='+'?1:-1;return check({offsets:[...a.offsets,...b.offsets.map(x=>sign*x)],value:sum([a.value,sign*b.value]),derivative:sum([a.derivative,sign*b.derivative])});}if(n.op==='*')return mul(a,b);
   const den=total(b);if(!den)throw new SourceUndefined();if(b.value===0&&b.derivative===0)return check({offsets:a.offsets.map(x=>x/den),value:a.value/den,derivative:a.derivative/den});const num=total(a);
   return check({offsets:[],value:num/den,derivative:withDerivative?(a.derivative-num/den*b.derivative)/den:0});};
  return check(visit(tree));
 }};
}

export function validateNativeDiscretizationQuery(raw:unknown):NativeDiscretizationQuery{
 if(!record(raw)||raw.family!==common.family||!['system','uniform','multipliers'].includes(raw.mode))fail('一般离散化模式无效。');
 const bounded=(x:unknown)=>finite(x)&&Math.abs(x)<=1e6;
 if(raw.mode==='system'){
  if(!keys(raw,['family','mode','rules','parameters'])||!Array.isArray(raw.rules)||raw.rules.length>64||!Array.isArray(raw.parameters)||raw.parameters.length>256||!raw.parameters.every(bounded))fail('有序规则／采样超出输入预算。');
  let nodes=0,leaves=0;const visit=(x:unknown,depth:number)=>{if(++nodes>2048||depth>4)fail('规则超过2048节点／4层。');if(Array.isArray(x)){if(x.length>256)fail('单列表最多256项。');x.forEach(v=>visit(v,depth+1));}else{if(++leaves>256)fail('总源标量超过256。');compile(x as string);}};
  for(const r of raw.rules){if(!record(r)||!keys(r,['key','expression'])||typeof r.key!=='string'||r.key.length<1||r.key.length>128)fail('规则须为key与expression，key允许重复。');visit(r.expression,0);}
  return {family:common.family,mode:'system',rules:clone(raw.rules),parameters:raw.parameters.slice()};
 }
 if(raw.mode==='uniform'){
  if(!keys(raw,['family','mode','curve','divisions','parameterStart','parameterEnd'])||!Array.isArray(raw.curve)||raw.curve.length<1||raw.curve.length>64||!integer(raw.divisions,1,64)||!bounded(raw.parameterStart)||!bounded(raw.parameterEnd)||raw.parameterStart===raw.parameterEnd)fail('曲线需1–64维、1–64段、±10⁶内不同端点。');raw.curve.forEach((s:string)=>compile(s));
  return {family:common.family,mode:'uniform',curve:raw.curve.slice(),divisions:raw.divisions,parameterStart:raw.parameterStart,parameterEnd:raw.parameterEnd};
 }
 if(!keys(raw,['family','mode','foldPoints','leftRulings','rightRulings'])||!Array.isArray(raw.foldPoints)||raw.foldPoints.length<2||raw.foldPoints.length>512)fail('倍率需2–512个二维顶点。');
 for(const k of ['foldPoints','leftRulings','rightRulings'])if(!Array.isArray(raw[k])||raw[k].length!==raw.foldPoints.length||raw[k].some((v:unknown)=>!vector(v,2)||v.some(x=>Math.abs(x)>1e150)))fail('左右方向与点数须对应，二维坐标限±10¹⁵⁰。');
 return {family:common.family,mode:'multipliers',foldPoints:clone(raw.foldPoints),leftRulings:clone(raw.leftRulings),rightRulings:clone(raw.rightRulings)};
}

const near=(a:unknown,b:number,natural=Math.abs(b),tol=3e-8)=>finite(a)&&finite(b)&&finite(natural)&&Math.abs(a-b)<=tol*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE;
const nearVector=(a:unknown,b:number[],natural=Math.hypot(...b),tol=3e-8)=>{
 // Finite components can have an overflowing Euclidean norm. Such a norm
 // must not become an infinite acceptance tolerance for forged coordinates.
 const scale=finite(natural)?natural:Math.max(0,...b.map(Math.abs));return vector(a,b.length)&&b.every((v,i)=>near(a[i],v,scale,tol));
};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function budgetValid(raw:unknown){if(!record(raw)||!keys(raw,['scalarEvaluations','astWeightedEvaluations','offsetProducts'])||!integer(raw.scalarEvaluations,0,262144)||!integer(raw.astWeightedEvaluations,raw.scalarEvaluations,8000000)||!integer(raw.offsetProducts,0,262144))fail();}
function replaySystem(q:DiscretizationSystemQuery):DiscretizationSystemSample{
 const budget=new WorkBudget(),undefinedRows:DiscretizationSystemSample['undefined']=[];
 type CompiledTree=ReturnType<typeof compile>|CompiledTree[];
 const compileTree=(x:DiscretizationExpression):CompiledTree=>Array.isArray(x)?x.map(compileTree):compile(x);
 const evaluate=(tree:CompiledTree,s:number,ruleIndex:number,sampleIndex:number,path:number[]):DiscretizationValue=>{
  if(Array.isArray(tree))return tree.map((child,i)=>evaluate(child,s,ruleIndex,sampleIndex,[...path,i]));
  try{const p=tree.parts(s,budget),v=sum([...p.offsets,p.value]);if(!finite(v))throw new SourceUndefined();return v;}
  catch(e){if(!(e instanceof SourceUndefined))throw e;undefinedRows.push({ruleIndex,sampleIndex,path,parameter:s,state:'not-finite-real',code:'source-undefined'});return null;}
 };
 const rules=q.rules.map((r,i)=>{const tree=compileTree(r.expression);return {key:r.key,values:q.parameters.map((s,j)=>evaluate(tree,s,i,j,[]))};});
 return {parameters:q.parameters,rules,undefined:undefinedRows,allSamplesFiniteReal:undefinedRows.length===0,ruleOrderPreserved:true,parameterOrderPreserved:true,budget:budget.report()};
}
export function flattenDiscretizationValue(value:DiscretizationValue):Array<number|null>{return Array.isArray(value)?value.flatMap(flattenDiscretizationValue):[value];}

function verifySystem(raw:unknown,q:DiscretizationSystemQuery){
 const expected=replaySystem(q);if(!record(raw)||!keys(raw,Object.keys(expected))||!equal(raw.parameters,expected.parameters)||!equal(raw.undefined,expected.undefined)||raw.allSamplesFiniteReal!==expected.allSamplesFiniteReal||raw.ruleOrderPreserved!==true||raw.parameterOrderPreserved!==true||!Array.isArray(raw.rules)||raw.rules.length!==expected.rules.length)fail();
 const values=(a:unknown,b:DiscretizationValue):boolean=>b===null?a===null:Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>values(a[i],v)):near(a,b);
 expected.rules.forEach((r,i)=>{const a=raw.rules[i];if(!record(a)||!keys(a,['key','values'])||a.key!==r.key||!Array.isArray(a.values)||a.values.length!==r.values.length||r.values.some((v,j)=>!values(a.values[j],v)))fail();});
 budgetValid(raw.budget);if(!equal(raw.budget,expected.budget))fail();return expected.allSamplesFiniteReal;
}
function verifyUniform(raw:unknown,q:DiscretizationUniformQuery){
 const names=['parameters','initialGuess','points','normalizedPoints','normalization','normalizedChordLengths','equations','maximumDirectionResidual','residualTolerance','strictlyOrderedAlongRequestedInterval','outsideRequestedInterval','stationaryVertices','unconstrainedParameters','solver','equationEvaluations','budget'];
 if(!record(raw)||!keys(raw,names))fail();const n=q.divisions,dim=q.curve.length,a=q.parameterStart,b=q.parameterEnd,initial=Array.from({length:n+1},(_,i)=>i===n?b:a+(b-a)*i/n),ts=raw.parameters;
 if(!vector(ts,n+1)||ts.some(t=>Math.abs(t)>1e6)||ts[0]!==a||ts[n]!==b||!nearVector(raw.initialGuess,initial,Math.max(Math.abs(a),Math.abs(b),Math.abs(b-a)),1e-12))fail();
 const budget=new WorkBudget(),expressions=q.curve.map(compile),originParts=expressions.map(f=>f.parts(a,budget)),origin=originParts.map(p=>sum([...p.offsets,p.value])),
  relative=(s:number)=>expressions.map((f,i)=>{const p=f.parts(s,budget),o=originParts[i];return sum([...p.offsets,...o.offsets.map(x=>-x),p.value,-o.value]);}),
  initialPoints=initial.map(relative),scale=Math.max(...initialPoints.map(p=>Math.hypot(...p)))||1,points=ts.map(t=>relative(t).map(x=>x/scale));
 if(!record(raw.normalization)||!keys(raw.normalization,['origin','scale'])||!nearVector(raw.normalization.origin,origin,Math.hypot(...origin),1e-14)||!near(raw.normalization.scale,scale,scale,1e-12)||!Array.isArray(raw.points)||raw.points.length!==n+1||!Array.isArray(raw.normalizedPoints)||raw.normalizedPoints.length!==n+1)fail();
 points.forEach((p,i)=>{if(!nearVector(raw.normalizedPoints[i],p)||!vector(raw.points[i],dim))fail();for(let j=0;j<dim;j++){const world=sum([origin[j],scale*p[j]]),tolerance=8*Number.EPSILON*Math.max(Math.abs(world),Math.abs(origin[j]))+3e-8*scale;if(Math.abs(raw.points[i][j]-world)>tolerance)fail();}});
 const chords=points.slice(1).map((p,i)=>p.map((x,j)=>x-points[i][j])),lengths=chords.map(p=>Math.hypot(...p));
 if(n>1&&lengths.some(l=>!l))fail();if(!nearVector(raw.normalizedChordLengths,lengths)||!Array.isArray(raw.equations)||raw.equations.length!==n-1)fail();
 let maximum=0;const stationary:number[]=[];
 for(let i=1;i<n;i++){const derivative=expressions.map(f=>f.parts(ts[i],budget,true).derivative),normalized=derivative.map(x=>x/scale),speed=Math.hypot(...normalized),
   delta=chords[i-1].map((x,j)=>x/lengths[i-1]-chords[i][j]/lengths[i]),residual=sum(delta.map((x,j)=>x*normalized[j])),direction=speed?residual/speed:0,row=raw.equations[i-1];
  if(!record(row)||!keys(row,['vertex','parameter','derivative','equationResidualDividedByCommonScale','directionResidual','stationaryDerivative'])||row.vertex!==i+1||row.parameter!==ts[i]||!nearVector(row.derivative,derivative)||!near(row.equationResidualDividedByCommonScale,residual,speed,1e-12)||!near(row.directionResidual,direction,1,1e-12)||row.stationaryDerivative!==(speed===0)||Math.abs(direction)>2e-10)fail();
  if(speed===0)stationary.push(i+1);maximum=Math.max(maximum,Math.abs(direction));
 }
 if(!near(raw.maximumDirectionResidual,maximum,1,1e-12)||raw.residualTolerance!==2e-10||raw.strictlyOrderedAlongRequestedInterval!==ts.slice(1).every((t,i)=>(t-ts[i])*(b-a)>0)||!equal(raw.outsideRequestedInterval,ts.flatMap((t,i)=>t<Math.min(a,b)||t>Math.max(a,b)?[i]:[]))||!equal(raw.stationaryVertices,stationary)||raw.unconstrainedParameters!==true)fail();
 const solver=raw.solver;if(!record(solver)||!keys(solver,['method','success','status','nfev'])||typeof solver.success!=='boolean'||!integer(raw.equationEvaluations,1,4096))fail();
 if(n===1){if(solver.method!=='fixed-endpoints-no-interior-equations'||solver.success!==true||solver.status!==0||solver.nfev!==0||raw.equationEvaluations!==1)fail();}
 else if(solver.method!=='MINPACK-hybr-unconstrained-original-parameters'||!integer(solver.status,1,5)||solver.success!==(solver.status===1)||!integer(solver.nfev,1,4095)||![1,3].includes(raw.equationEvaluations-solver.nfev))fail();
 budgetValid(raw.budget);return true;
}
function rotation(a:number[],b:number[]){const ma=Math.max(...a.map(Math.abs)),mb=Math.max(...b.map(Math.abs));if(!ma||!mb)fail('原RotationAngle方向为零。');const x=a.map(v=>v/ma),y=b.map(v=>v/mb),angle=Math.atan2(x[0]*y[1]-x[1]*y[0],sum(x.map((v,i)=>v*y[i])));return angle===-Math.PI?Math.PI:angle;}
function verifyMultipliers(raw:unknown,q:DiscretizationMultipliersQuery){
 if(!record(raw)||!keys(raw,['foldPoints','leftRulings','rightRulings','sectors','kawasaki','chopTolerance','chopComparison','chopAppliedToDenominator','multipliers','quotients','allMultipliersFinite','rawDirectionsPreserved'])||!equal(raw.foldPoints,q.foldPoints)||!equal(raw.leftRulings,q.leftRulings)||!equal(raw.rightRulings,q.rightRulings))fail();
 const n=q.foldPoints.length;if(!Array.isArray(raw.sectors)||raw.sectors.length!==n||!Array.isArray(raw.quotients)||raw.quotients.length!==n||!Array.isArray(raw.multipliers)||raw.multipliers.length!==n||!Array.isArray(raw.kawasaki)||raw.kawasaki.length!==n-2)fail();let allFinite=true;
 for(let i=0;i<n;i++){const p=q.foldPoints[i],prev=i?q.foldPoints[i-1].map((x,j)=>x-p[j]):null,next=i+1<n?q.foldPoints[i+1].map((x,j)=>x-p[j]):null,
  angles=[prev?rotation(q.leftRulings[i],prev):null,prev?rotation(prev,q.rightRulings[i]):null,next?rotation(q.rightRulings[i],next):null,next?rotation(next,q.leftRulings[i]):null],sector=raw.sectors[i];
  if(!record(sector)||!keys(sector,['vertex','a1','a2','a3','a4'])||sector.vertex!==i+1||angles.some((a,j)=>a===null?sector['a'+(j+1)]!==null:!near(sector['a'+(j+1)],a,1,1e-13)))fail();
  if(i>0&&i+1<n){const alternating=sum([angles[0]!, -angles[1]!,angles[2]!, -angles[3]!]),chopped=Math.abs(alternating)<1e-10?0:alternating,k=raw.kawasaki[i-1];
   if(chopped!==0)fail('原Kawasaki条件应Abort，拒绝成功倍率。');if(!record(k)||!keys(k,['vertex','alternatingAngle','choppedAngle'])||k.vertex!==i+1||!near(k.alternatingAngle,alternating,1,1e-13)||k.choppedAngle!==0)fail();}
  const first=i?angles[0]!:angles[3]!,second=i?angles[1]!:angles[2]!,numerator=Math.sin((first+second)/2),denominator=Math.sin((first-second)/2),quotient=denominator?numerator/denominator:null,
   expected=quotient!==null&&finite(quotient)?quotient:null,state=!denominator?'original-zero-denominator':expected===null?'finite-quotient-outside-binary64':'finite',r=raw.quotients[i];
  if(!record(r)||!keys(r,['vertex','numerator','denominator','value','state','originalDenominatorNonzero'])||r.vertex!==i+1||!near(r.numerator,numerator,1,1e-13)||!near(r.denominator,denominator,1,1e-13)||r.state!==state||r.originalDenominatorNonzero!==(denominator!==0))fail();
  // Near-zero denominators are never replaced by zero. Bind the quotient both
  // to independent angles and to its returned numerator/denominator.
  if(expected===null){if(r.value!==null||raw.multipliers[i]!==null)fail();allFinite=false;}
  else{const errorBound=1e-13/Math.abs(denominator)*Math.max(1,Math.abs(expected));if(!finite(r.value)||Math.abs(r.value-expected)>Math.min(errorBound,1e-3*Math.max(1,Math.abs(expected)))||!near(r.value,r.numerator/r.denominator,Math.abs(r.value),1e-12)||raw.multipliers[i]!==r.value)fail();}
 }
 if(raw.chopTolerance!==1e-10||raw.chopComparison!=='abs(approximate-real-angle) < 1e-10'||raw.chopAppliedToDenominator!==false||raw.rawDirectionsPreserved!==true||raw.allMultipliersFinite!==allFinite)fail();return allFinite;
}

export function parseNativeDiscretizationResult(raw:unknown,requested?:unknown):NativeDiscretizationResult{
 if(!record(raw)||!keys(raw,['family','query','source','limits','certification','sample'])||raw.family!=='origamica-generic-discretization')fail();const q=validateNativeDiscretizationQuery(raw.query);
 if(requested&&!equal(q,validateNativeDiscretizationQuery(requested)))fail();const names={system:['DiscretizeSystem','In[4087]'],uniform:['DiscretizeCurveUniformly','In[4089]'],multipliers:['FoldAngleMultipliers2D','In[4092]']}[q.mode],source=raw.source;
 if(!record(source)||!keys(source,['function','definitionCell','origin','wolframNumericOutAvailable','numericModel','chopDocumentation'])||source.function!==names[0]||source.definitionCell!==names[1]||source.origin!=='notebook-definition'||source.wolframNumericOutAvailable!==false||source.numericModel!=='finite-real-binary64'||source.chopDocumentation!==(q.mode==='multipliers'?'https://reference.wolfram.com/language/ref/Chop.html':null)||!record(raw.limits)||!keys(raw.limits,Object.keys(DISCRETIZATION_NATIVE_LIMITS))||Object.entries(DISCRETIZATION_NATIVE_LIMITS).some(([k,v])=>raw.limits[k]!==v))fail();
 const allFinite=q.mode==='system'?verifySystem(raw.sample,q):q.mode==='uniform'?verifyUniform(raw.sample,q):verifyMultipliers(raw.sample,q),cert=raw.certification,falseFlags=['rootBranchEquivalentToWolfram','allRootsEnumerated','continuousDomainCertified','symbolicObjectsReproduced','wolframOptionsReproduced','integrationErrorIntervalCertified','adoptableCreasePattern','globalFoldingCertified'];
 if(!record(cert)||!keys(cert,['sourceFormulaEvaluated','allSampledValuesFinite','rootEquationNumericallyVerified',...falseFlags])||cert.sourceFormulaEvaluated!==true||cert.allSampledValuesFinite!==allFinite||cert.rootEquationNumericallyVerified!==(q.mode==='uniform')||falseFlags.some(k=>cert[k]!==false))fail();return raw as NativeDiscretizationResult;
}
export async function fetchNativeDiscretizationWhenIdle(input:unknown,signal?:AbortSignal):Promise<NativeDiscretizationResult>{const query=validateNativeDiscretizationQuery(input);for(let attempt=0;;attempt++){signal?.throwIfAborted();try{return parseNativeDiscretizationResult(await api('tessellation/curved-discretization-generic',query,signal),query);}catch(e){if(signal?.aborted||attempt>=240||!(e instanceof Error)||!/(busy|繁忙|429|正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/i.test(e.message))throw e;
 await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}}
