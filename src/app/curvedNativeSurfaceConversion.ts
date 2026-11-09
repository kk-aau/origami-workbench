import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import {api} from './api';

export type NativeSurfaceConversionMode='cone'|'cylinder';
type Vector2=[number,number];type Vector3=[number,number,number];
type CommonQuery={sourceFlatBase:[string,string];sourceFlatDirector:[string,string];sourceSpaceBase:[string,string,string];sourceSpaceDirector:[string,string,string];
 literalMode:'normalized-symbolic'|'raw-numerical';parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number};
export type GenericSurfaceConversionQuery=CommonQuery&({family:'surface-to-cone-generic-native';initialParameter:number;flatApex:Vector2;spaceApex:Vector3}|
 {family:'surface-to-cylinder-generic-native';flatReferencePoint:Vector2;flatDirector:Vector2;spaceReferencePoint:Vector3;spaceDirector:Vector3});
const commonPreset={sourceFlatBase:['s','s**2/4']as[string,string],sourceFlatDirector:['0','1']as[string,string],sourceSpaceBase:['sin(s)','s**2/4','1-cos(s)']as[string,string,string],sourceSpaceDirector:['0','1','0']as[string,string,string],
 literalMode:'raw-numerical'as const,parameterStart:0,parameterEnd:1,transverseStart:.2,transverseEnd:1,segments:32,rulingSegments:16};
export const GENERIC_SURFACE_TO_CONE_PRESET:GenericSurfaceConversionQuery={...commonPreset,family:'surface-to-cone-generic-native',initialParameter:0,flatApex:[0,2],spaceApex:[0,1,0]};
export const GENERIC_SURFACE_TO_CYLINDER_PRESET:GenericSurfaceConversionQuery={...commonPreset,family:'surface-to-cylinder-generic-native',flatReferencePoint:[0,0],flatDirector:[0,1],spaceReferencePoint:[0,0,0],spaceDirector:[0,0,1]};
type StageName='sourceFlat'|'sourceSpace'|'targetFlat'|'targetSpace';
type Stage={base:number[];director:number[];baseDerivative:number[];directorDerivative:number[]|null;normalizedBase:number[];normalizedDirector:number[];
 normalizedBaseDerivative:number[];normalizedDirectorDerivative:number[]|null};
type Row={s:number;offsetParameter:number;offsetParameterDerivative:number;branchArgument:number|null;branchSign:number|null;targetJetsDefined:boolean;
 sourceFlat:Stage;sourceSpace:Stage;targetFlat:Stage;targetSpace:Stage;foldFlat:number[];foldSpace:number[];normalizedFoldFlat:number[];normalizedFoldSpace:number[];
 foldFlatDerivative:number[];foldSpaceDerivative:number[];normalizedFoldFlatDerivative:number[];normalizedFoldSpaceDerivative:number[]};
type Strip={status:'verified'|'unknown'|'degenerate';minimumAreaSquaredLowerBound:number|null;reason:string|null};
type Cell={start:number;end:number;denominatorBounds:number[];offsetParameterBounds:number[];flatRadiusBounds:number[]|null;spaceRadiusBounds:number[]|null;
 branchArgumentBounds:number[]|null;branchSignBounds:number[]|null;sourceFlatNormalizedAreaSquaredBounds:number[];sourceSpaceNormalizedAreaSquaredBounds:number[];
 targetFlatNormalizedAreaSquaredBounds:number[]|null;targetSpaceNormalizedAreaSquaredBounds:number[]|null};
export type GenericSurfaceConversionResult={family:'origamica-generic-surface-to-cone'|'origamica-generic-surface-to-cylinder';query:GenericSurfaceConversionQuery;
 source:{functions:string[];definitionCells:string[];selectedFunction:string;method:string;initialArgumentOrder:string[];directorConvention:string;signConvention:string;
 interpolationReproduced:false;symbolicObjectsReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
 normalization:{flatOrigin:number[];spaceOrigin:number[];scale:number};initial:{parameter:number;flatApex:number[];spaceApex:number[];flatSeedDirector:number[];spaceSeedDirector:number[];branchArgumentAtInitial:number;branchSignAtInitial:number}|
 {flatReferencePoint:number[];flatDirector:number[];spaceReferencePoint:number[];spaceDirector:number[];unitDirectorResidual:number;unitDirectorCompatibilityTolerance:number;unitDirectorsCompatible:boolean};
 diagnostics:{validationNodes:number;targetDerivativeNodes:number;maximumSourcePairRelativeMetricDifference:number;maximumTargetPairRelativeMetricDifference:number|null;
 maximumFoldSpeedRelativeDifference:number;maximumConstraintRelativeResidual:number;sourcePairMetricIdentity:{analyticIdentity:boolean;method:string};symbolicZeroSignAnalytic:boolean;metricTolerance:number};
 certification:{finiteSourcePairMetricVerified:boolean;finiteTargetPairMetricVerified:boolean;sourcePairMetricAnalytic:boolean;sourceDefinitionCertified:boolean;signBranchCertified:boolean;
 initialDirectorsUnitCompatible:boolean;formalTargetPairMetricCertified:boolean;sourceFlatStripRegularityCertified:boolean;sourceSpaceStripRegularityCertified:boolean;
 targetFlatStripRegularityCertified:boolean;targetSpaceStripRegularityCertified:boolean;globalInjectivityChecked:false;selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
 domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:Cell[];unresolved:number[][];minimumAbsDenominatorLowerBound:number|null;
 minimumFlatRadiusLowerBound:number|null;minimumSpaceRadiusLowerBound:number|null;minimumAbsBranchArgumentLowerBound:number|null;roundingModel:string;reason:string|null;
 signBranch:{status:'verified'|'unknown'|'constant-zero';sign:number|null;reason:string|null};strips:Record<StageName,Strip>};
 sample:{rows:Row[]};grid:({s:number}&Record<StageName,{points:number[][];normalizedPoints:number[][];EFG:number[][]|null}>)[]};
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite),keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const sumExact=(values:number[])=>{const parts:number[]=[];for(let x of values){let i=0;for(let y of parts){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;}
 parts.length=i;parts.push(x);}return parts.reduceRight((sum,x)=>sum+x,0);};
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((sum,x,i)=>sum.add(x.mul(b[i])),a[0].constant(0)),tm=(a:GenericTaylor[],w:number|GenericTaylor)=>a.map(x=>x.mul(w)),
 ta=(a:GenericTaylor[],b:GenericTaylor[],w:number|GenericTaylor=1)=>a.map((x,i)=>x.add(b[i].mul(w))),tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]),tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]),
 normalize=(a:GenericTaylor[])=>{const squared=td(a,a);if(!(squared.c[0]>0))throw Error('原Normalize的母线向量为零，无定义。');return tm(a,squared.sqrt().inv());};
export function validateGenericSurfaceConversionQuery(raw:unknown):GenericSurfaceConversionQuery{
 if(!record(raw)||!['surface-to-cone-generic-native','surface-to-cylinder-generic-native'].includes(raw.family))throw Error('十源折向曲面的类型无效。');
 const cone=raw.family==='surface-to-cone-generic-native',fields=['family','literalMode','sourceFlatBase','sourceFlatDirector','sourceSpaceBase','sourceSpaceDirector','parameterStart','parameterEnd','transverseStart','transverseEnd','segments','rulingSegments',
  ...(cone?['initialParameter','flatApex','spaceApex']:['flatReferencePoint','flatDirector','spaceReferencePoint','spaceDirector'])];
 if(!keys(raw,fields))throw Error('十源折向曲面的原参数字段不完整。');
 for(const [name,n]of [['sourceFlatBase',2],['sourceFlatDirector',2],['sourceSpaceBase',3],['sourceSpaceDirector',3]]as const){if(!Array.isArray(raw[name])||raw[name].length!==n)throw Error('原四组源函数维数必须为2/2/3/3。');for(const expression of raw[name])compileGenericExpression(expression,'s');}
 if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('s域须在±10内、跨度0.01–12。');
 if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||raw.transverseStart>=raw.transverseEnd)throw Error('w域须在±10⁶内递增。');
 if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128和2–64。');
 const coordinates=cone?[['flatApex',2],['spaceApex',3]]as const:[['flatReferencePoint',2],['flatDirector',2],['spaceReferencePoint',3],['spaceDirector',3]]as const;
 for(const [name,n]of coordinates)if(!vector(raw[name],n)||raw[name].some((x:number)=>Math.abs(x)>1e12))throw Error('原初值必须为±10¹²内有限坐标，未规范化原方向。');
 if(!['normalized-symbolic','raw-numerical'].includes(raw.literalMode)||cone&&(!finite(raw.initialParameter)||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd))throw Error('原函数模式或ui无效。');
 return {...raw,...Object.fromEntries([...['sourceFlatBase','sourceFlatDirector','sourceSpaceBase','sourceSpaceDirector'],...coordinates.map(([k])=>k)].map(k=>[k,raw[k].slice()]))}as GenericSurfaceConversionQuery;
}

/** Independent literal ten-source algebra before any returned curve is normalized for display. */
export function makeGenericSurfaceConversionAlgebra(input:unknown){
 const q=validateGenericSurfaceConversionQuery(input),cone=q.family==='surface-to-cone-generic-native',anchor=cone?q.initialParameter:q.parameterStart,
  names=['sourceFlatBase','sourceFlatDirector','sourceSpaceBase','sourceSpaceDirector']as const,functions=Object.fromEntries(names.map(name=>[name,q[name].map(x=>compileGenericExpression(x,'s'))])),
  variable=(s:number)=>new GenericTaylor([s,1,0,0,0]),argument=variable(anchor),
  raw=(name:typeof names[number],arg:GenericTaylor)=>functions[name].map(f=>f(arg)),
  offset=(name:'sourceFlatBase'|'sourceSpaceBase',arg:GenericTaylor,point:number[])=>functions[name].map((f,i)=>{const p=f.parts(arg);return p.dynamic.constant(sumExact([point[i],...p.offsets.map(x=>-x)])).sub(p.dynamic);});
 const at=(s:number)=>{const arg=variable(s),b=raw('sourceFlatBase',arg),d=raw('sourceFlatDirector',arg),B=raw('sourceSpaceBase',arg),D=raw('sourceSpaceDirector',arg);
  if(cone){const a=offset('sourceFlatBase',arg,q.flatApex),A=offset('sourceSpaceBase',arg,q.spaceApex),numerator=td(a,a).sub(td(A,A)),denominator=td(a,d).sub(td(A,D)).mul(2);
   if(denominator.c[0]===0)throw Error('原折向圆锥的分母为零，无定义。');const v=numerator.div(denominator),flatDifference=ta(a,d,v.mul(-1)),spaceDifference=ta(A,D,v.mul(-1));
   return {s,arg,b,d,B,D,a,A,v,denominator,flatDifference,spaceDifference,flatFold:ta(b,d,v),spaceFold:ta(B,D,v)};}
  const a=offset('sourceFlatBase',arg,q.flatReferencePoint),A=offset('sourceSpaceBase',arg,q.spaceReferencePoint),di=q.flatDirector.map(x=>arg.constant(x)),Di=q.spaceDirector.map(x=>arg.constant(x)),
   numerator=td(a,di).sub(td(A,Di)),denominator=td(d,di).sub(td(D,Di));if(denominator.c[0]===0)throw Error('原折向圆柱的分母为零，无定义。');
  const v=numerator.div(denominator),flatFold=ta(b,d,v),spaceFold=ta(B,D,v),flatDelta=ta(a,d,v.mul(-1)).map(x=>x.mul(-1)),spaceDelta=ta(A,D,v.mul(-1)).map(x=>x.mul(-1)),
   flatBase=ta(flatFold,di,td(flatDelta,di).mul(-1)),spaceBase=ta(spaceFold,Di,td(spaceDelta,Di).mul(-1));
  return {s,arg,b,d,B,D,a,A,v,denominator,flatFold,spaceFold,flatBase,spaceBase,flatDirector:di,spaceDirector:Di};};
 const initial=at(anchor);let fixedFlatDirection:GenericTaylor[]|null=null,fixedSpaceDirection:GenericTaylor[]|null=null,fixedPsi:number|null=null,fixedProjection:number|null=null;
 if(cone&&'flatDifference'in initial){fixedFlatDirection=normalize(initial.flatDifference!);fixedSpaceDirection=normalize(initial.spaceDifference!);
  fixedProjection=td(initial.d,fixedFlatDirection).c[0]-td(initial.D,fixedSpaceDirection).c[0];fixedPsi=Math.sign(fixedProjection);}
 const evaluate=(s:number)=>{const r=at(s);if(!cone||!('flatDifference'in r))return {...r,psi:null,derivativeDefined:true};
  const normalizedSpace=q.literalMode==='normalized-symbolic'?normalize(r.spaceDifference!):null,projection=q.literalMode==='raw-numerical'?r.arg.constant(fixedProjection!):
   r.arg.constant(td(initial.d,fixedFlatDirection!).c[0]).sub(td(initial.D.map(x=>r.arg.constant(x.c[0])),normalizedSpace!)),
   psi=q.literalMode==='raw-numerical'?fixedPsi!:Math.sign(projection.c[0]),
   flatDirector=q.literalMode==='raw-numerical'?tm(r.flatDifference!,psi):tm(normalize(r.flatDifference!),psi),spaceDirector=q.literalMode==='raw-numerical'?tm(r.spaceDifference!,psi):tm(normalizedSpace!,psi),
   derivativeDefined=q.literalMode==='raw-numerical'||psi!==0||names.every(name=>q[name].every(sourceConstantIdentity));
  return {...r,psi,projection,flatBase:q.flatApex.map(x=>r.arg.constant(x)),spaceBase:q.spaceApex.map(x=>r.arg.constant(x)),flatDirector,spaceDirector,
   derivativeDefined,flatDirectorDerivative:derivativeDefined?tp(flatDirector):null,spaceDirectorDerivative:derivativeDefined?tp(spaceDirector):null};};
 return {query:q,anchor,initialPsi:fixedPsi,initialProjection:fixedProjection,initialFlatSeed:fixedFlatDirection?tv(fixedFlatDirection):null,initialSpaceSeed:fixedSpaceDirection?tv(fixedSpaceDirection):null,evaluate};
}

function sourceConstantIdentity(source:string){
  if(!/\bs\b/.test(source))return true;
  type Fraction=[bigint,bigint];type Polynomial=Map<string,Fraction>;
  const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a<0n?-a:a,
    fraction=(a:bigint,b=1n):Fraction=>{if(!b)throw Error('zero');const d=gcd(a,b),sign=b<0n?-1n:1n;return[a/d*sign,b/d*sign];},
    plus=(a:Fraction,b:Fraction)=>fraction(a[0]*b[1]+b[0]*a[1],a[1]*b[1]),times=(a:Fraction,b:Fraction)=>fraction(a[0]*b[0],a[1]*b[1]),
    single=(x:Fraction):Polynomial=>new Map(x[0]?[['',x]]:[]),atoms=new Map<string,boolean>([['s',true],['pi',false],['e',false]]),
    key=(a:Polynomial)=>JSON.stringify([...a].sort(([x],[y])=>x.localeCompare(y)).map(([k,v])=>[k,v.map(String)])),
    factors=(k:string):string[]=>k?JSON.parse(k):[],hasVariable=(a:Polynomial)=>[...a.keys()].some(k=>factors(k).some(x=>atoms.get(x)!==false)),
    atom=(name:string,variable:boolean):Polynomial=>{atoms.set(name,variable);return new Map([[JSON.stringify([name]),[1n,1n]]]);},
    addPolynomial=(a:Polynomial,b:Polynomial,sign=1n)=>{const r=new Map(a);for(const [k,v]of b){const n=plus(r.get(k)??[0n,1n],[v[0]*sign,v[1]]);
      if(n[0])r.set(k,n);else r.delete(k);}if(r.size>64)throw Error('budget');return r;},
    multiply=(a:Polynomial,b:Polynomial)=>{let r:Polynomial=new Map();for(const [ka,va]of a)for(const [kb,vb]of b){const k=JSON.stringify([...factors(ka),...factors(kb)].sort());
      r=addPolynomial(r,new Map([[k==='[]'?'':k,times(va,vb)]]));}return r;},
    rationalValue=(a:Polynomial)=>a.size===0?[0n,1n] as Fraction:a.size===1&&a.has('')?a.get('')!:null;
  const number=(text:string):Fraction=>{const parts=Number(text).toString().toLowerCase().split('e'),d=parts[0].split('.'),
    exponent=Number(parts[1]??0)-(d[1]?.length??0),n=BigInt(d.join(''));return exponent>=0?fraction(n*10n**BigInt(exponent)):fraction(n,10n**BigInt(-exponent));};
  try{
    const aliases:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'},
      tokens:string[]=[];let offset=0,position=0,budget=0;
    while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
      if(!m){if(!source.slice(offset).trim())break;return false;}const token=aliases[m[1]]??m[1],last=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);
      if(last&&(word(last)||last===')')&&(word(token)||token==='(')&&!(['sin','cos','tan','atan','sqrt','exp','log'].includes(last)&&token==='('))tokens.push('*');
      tokens.push(token);offset+=m[0].length;}
    const peek=()=>tokens[position],take=()=>tokens[position++],count=()=>{if(++budget>96)throw Error('budget');};
    const primary=():Polynomial=>{count();const t=take();if(t==='('){const a=sum();if(take()!==')')throw Error('parenthesis');return a;}
      if(/^(?:\d|\.)/.test(t??''))return single(number(t));if(['s','pi','e'].includes(t))return atom(t,t==='s');
      if(['sin','cos','tan','atan','sqrt','exp','log'].includes(t)&&take()==='('){const a=sum();if(take()!==')')throw Error('parenthesis');
        const n=rationalValue(a);if(n&&n[0]===0n){if(['sin','tan','atan'].includes(t))return single([0n,1n]);if(['cos','exp'].includes(t))return single([1n,1n]);}
        return atom(t+'('+key(a)+')',hasVariable(a));}throw Error('syntax');};
    const power=():Polynomial=>{let a=primary();if(peek()==='**'){take();const p=rationalValue(unary());if(!p||p[1]!==1n||p[0]< -8n||p[0]>8n)throw Error('power');
      let r=single([1n,1n]);for(let i=0n;i<(p[0]<0n?-p[0]:p[0]);i++)r=multiply(r,a);
      if(p[0]<0n){const n=rationalValue(r);a=n?single(fraction(n[1],n[0])):atom('inv('+key(r)+')',hasVariable(r));}else a=r;}return a;};
    const unary=():Polynomial=>{if(peek()==='+'||peek()==='-'){const minus=take()==='-',a=unary();return minus?multiply(single([-1n,1n]),a):a;}return power();};
    const product=():Polynomial=>{let a=unary();while(peek()==='*'||peek()==='/'){count();const op=take(),b=unary();
      if(op==='*')a=multiply(a,b);else if(key(a)===key(b))a=single([1n,1n]);else{const n=rationalValue(b);
        a=multiply(a,n?single(fraction(n[1],n[0])):atom('inv('+key(b)+')',hasVariable(b)));}}return a;};
    const sum=():Polynomial=>{let a=product();while(peek()==='+'||peek()==='-'){count();const minus=take()==='-';a=addPolynomial(a,product(),minus?-1n:1n);}return a;};
    const result=sum();if(position!==tokens.length)return false;
    for(const [k,v]of [...result]){const f=factors(k);if(f.length!==2||f[0]!==f[1]||!f[0].startsWith('sin('))continue;
      const partner='cos('+f[0].slice(4),cosKey=JSON.stringify([partner,partner]),other=result.get(cosKey);
      if(other&&other[0]===v[0]&&other[1]===v[1]){result.delete(k);result.delete(cosKey);const c=plus(result.get('')??[0n,1n],v);if(c[0])result.set('',c);else result.delete('');}}
    return !hasVariable(result);
  }catch{return false;}
}

/** Every displayed point is replayed from independent source jets relative to the original raw anchors. */
export function makeGenericSurfaceConversionReference(input:unknown){
 const algebra=makeGenericSurfaceConversionAlgebra(input),q=algebra.query,cone=q.family==='surface-to-cone-generic-native',flatOrigin=cone?q.flatApex:q.flatReferencePoint,spaceOrigin=cone?q.spaceApex:q.spaceReferencePoint,
  names=['sourceFlatBase','sourceFlatDirector','sourceSpaceBase','sourceSpaceDirector']as const,functions=Object.fromEntries(names.map(key=>[key,q[key].map(x=>compileGenericExpression(x,'s'))])),
  variable=(s:number)=>new GenericTaylor([s,1,0,0,0]),baseJets=(key:'sourceFlatBase'|'sourceSpaceBase',arg:GenericTaylor,scale:number)=>functions[key].map((f,i)=>{const p=f.parts(arg),origin=key==='sourceFlatBase'?flatOrigin:spaceOrigin;
   return new GenericTaylor(p.dynamic.c.map((x,k)=>k?x/scale:sumExact([...p.offsets,-origin[i],x])/scale));}),
  nodes=Array.from({length:9},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8),magnitudes=nodes.flatMap(s=>['sourceFlatBase','sourceSpaceBase'].map(key=>Math.hypot(...tv(baseJets(key as 'sourceFlatBase'|'sourceSpaceBase',variable(s),1))))),
  speeds=nodes.flatMap(s=>['sourceFlatBase','sourceSpaceBase'].map(key=>Math.hypot(...tp(baseJets(key as 'sourceFlatBase'|'sourceSpaceBase',variable(s),1))))),
  scale=Math.max(...magnitudes,...speeds.map(v=>v*(q.parameterEnd-q.parameterStart)))||1;
 if(!finite(scale)||scale<=0)throw Error('原十源尺度无法归一化。');
 const initialUnitResidual=cone?null:Math.max(Math.abs(q.flatDirector.reduce((sum,x)=>sum+x*x,0)-1),Math.abs(q.spaceDirector.reduce((sum,x)=>sum+x*x,0)-1)),
  initialUnitCompatible=cone||initialUnitResidual!<=64*Number.EPSILON,
  symbolicZeroSignAnalytic=cone&&q.literalMode==='normalized-symbolic'&&algebra.initialProjection===0&&names.every(name=>q[name].every(sourceConstantIdentity));
 const evaluate=(s:number)=>{const r=algebra.evaluate(s),arg=variable(s),b=baseJets('sourceFlatBase',arg,scale),B=baseJets('sourceSpaceBase',arg,scale),d=functions.sourceFlatDirector.map(f=>f(arg).div(scale)),D=functions.sourceSpaceDirector.map(f=>f(arg).div(scale)),
  foldFlat=ta(b,d,r.v),foldSpace=ta(B,D,r.v),flatTargetD=r.flatDirector!.map(x=>x.div(scale)),spaceTargetD=r.spaceDirector!.map(x=>x.div(scale)),
  flatTargetB=cone?b.map(x=>x.constant(0)):ta(foldFlat,q.flatDirector.map(x=>arg.constant(x)),td(foldFlat,q.flatDirector.map(x=>arg.constant(x))).mul(-1)),
  spaceTargetB=cone?B.map(x=>x.constant(0)):ta(foldSpace,q.spaceDirector.map(x=>arg.constant(x)),td(foldSpace,q.spaceDirector.map(x=>arg.constant(x))).mul(-1)),
  stage=(base:GenericTaylor[],director:GenericTaylor[],defined=true)=>({base:tv(base),basePrime:tp(base),director:tv(director),directorPrime:defined?tp(director):null}),
  targetJetsDefined=r.derivativeDefined;
  return {s,offsetParameter:r.v.c[0],offsetParameterDerivative:r.v.c[1],denominator:r.denominator.c[0],branchArgument:'projection'in r?r.projection!.c[0]:null,branchSign:r.psi,
   flatRadius:cone?Math.hypot(...tv(r.flatDifference!)):null,spaceRadius:cone?Math.hypot(...tv(r.spaceDifference!)):null,targetJetsDefined,
   sourceFlat:stage(b,d),sourceSpace:stage(B,D),targetFlat:stage(flatTargetB,flatTargetD,targetJetsDefined),targetSpace:stage(spaceTargetB,spaceTargetD,targetJetsDefined),
   foldFlat:tv(foldFlat),foldSpace:tv(foldSpace),foldFlatPrime:tp(foldFlat),foldSpacePrime:tp(foldSpace)};};
 return {...algebra,normalization:{flatOrigin:flatOrigin.slice(),spaceOrigin:spaceOrigin.slice(),scale},initialUnitResidual,initialUnitCompatible,symbolicZeroSignAnalytic,evaluate};
}

const stages=['sourceFlat','sourceSpace','targetFlat','targetSpace']as const,
 stageKeys=['base','director','baseDerivative','directorDerivative','normalizedBase','normalizedDirector','normalizedBaseDerivative','normalizedDirectorDerivative'],
 rowKeys=['s','offsetParameter','offsetParameterDerivative','branchArgument','branchSign','targetJetsDefined',...stages,'foldFlat','foldSpace','normalizedFoldFlat','normalizedFoldSpace',
  'foldFlatDerivative','foldSpaceDerivative','normalizedFoldFlatDerivative','normalizedFoldSpaceDerivative'],
 boundKeys=['denominatorBounds','offsetParameterBounds','flatRadiusBounds','spaceRadiusBounds','branchArgumentBounds','branchSignBounds',...stages.map(stage=>stage+'NormalizedAreaSquaredBounds')],
 cellKeys=['start','end',...boundKeys],minimumKeys=['minimumAbsDenominatorLowerBound','minimumFlatRadiusLowerBound','minimumSpaceRadiusLowerBound','minimumAbsBranchArgumentLowerBound'],
 falseCertificates=['globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0),mul=(a:number[],w:number)=>a.map(x=>x*w),add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);
const areaSquared=(a:number[],b:number[])=>a.length===2?(a[0]*b[1]-a[1]*b[0])**2:(a[1]*b[2]-a[2]*b[1])**2+(a[2]*b[0]-a[0]*b[2])**2+(a[0]*b[1]-a[1]*b[0])**2;
const metrics=(stage:{basePrime:number[];director:number[];directorPrime:number[]|null},w:number)=>{if(stage.directorPrime===null)return null;const ds=add(stage.basePrime,stage.directorPrime,w);return[dot(ds,ds),dot(ds,stage.director),dot(stage.director,stage.director)];};
const metricDifference=(a:number[],b:number[])=>{const E=Math.max(a[0],b[0]),G=Math.max(a[2],b[2]);return Math.max(...a.map((x,i)=>Math.abs(x-b[i])/Math.max([E,Math.sqrt(E)*Math.sqrt(G),G][i],Number.MIN_VALUE)));};
const close=(x:unknown,y:number,natural=Math.abs(y),tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(Math.abs(y),natural,Number.MIN_VALUE);
const nearVector=(x:unknown,y:number[],natural=1)=>vector(x,y.length)&&y.every((v,i)=>close(x[i],v,Math.max(Math.hypot(...y),natural)));
const absLower=(bounds:number[])=>bounds[0]<=0&&bounds[1]>=0?0:Math.min(Math.abs(bounds[0]),Math.abs(bounds[1]));
function fail():never{throw Error('原十源折向圆锥／圆柱的源式、自由参数Sign、原初值、曲面jets、网格或度量回读不一致。');}

export function parseGenericSurfaceConversionResult(raw:unknown,requested?:unknown):GenericSurfaceConversionResult{
 if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid']))fail();const q=validateGenericSurfaceConversionQuery(raw.query),cone=q.family==='surface-to-cone-generic-native',symbolic=q.literalMode==='normalized-symbolic';
 if(raw.family!==(cone?'origamica-generic-surface-to-cone':'origamica-generic-surface-to-cylinder'))fail();if(requested){const wanted=validateGenericSurfaceConversionQuery(requested);if(Object.keys(q).some(k=>JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(wanted[k as keyof typeof wanted])))fail();}
 const ref=makeGenericSurfaceConversionReference(q),norm=ref.normalization,L=norm.scale,world=(x:unknown,y:number[],origin:number[]|null,natural=1)=>vector(x,y.length)&&y.every((v,i)=>{
  const expected=(origin?.[i]??0)+L*v;return Math.abs(x[i]-expected)<=Math.max(2e-8*L*Math.max(natural,Math.hypot(...y),Number.MIN_VALUE),4*Number.EPSILON*Math.abs(expected));});
 if(!record(raw.normalization)||!keys(raw.normalization,['flatOrigin','spaceOrigin','scale'])||!close(raw.normalization.scale/L,1,1,2e-12)||!nearVector(raw.normalization.flatOrigin,norm.flatOrigin)||!nearVector(raw.normalization.spaceOrigin,norm.spaceOrigin))fail();
 const source=raw.source,functions=cone?['FoldSurfaceToCone','NFoldSurfaceToCone']:['FoldSurfaceToCylinder','NFoldSurfaceToCylinder'];
 if(!record(source)||!keys(source,['functions','definitionCells','selectedFunction','method','initialArgumentOrder','directorConvention','signConvention','interpolationReproduced','symbolicObjectsReproduced','wolframOptionsReproduced','metricConvention'])||
  JSON.stringify(source.functions)!==JSON.stringify(functions)||JSON.stringify(source.definitionCells)!==JSON.stringify(cone?['In[4046]','In[4049]']:['In[4053]','In[4056]'])||source.selectedFunction!==functions[symbolic?0:1]||
  source.method!=='whitelist-AST/literal-ten-source-algebraic-formulas'||JSON.stringify(source.initialArgumentOrder)!==JSON.stringify(cone?['ui','b2i','bb2i']:['p2i','d2i','pp2i','dd2i'])||
  source.directorConvention!==(cone?symbolic?'Psi(s)*unit(apex-fold)':'Psi(ui)*(apex-fold), no Normalize':'raw d2i/dd2i; raw projection coefficient')||
  source.signConvention!==(cone?symbolic?'symbolic dd2i uses ff[s]; Psi(s) preserved':'fixed original ui sign':'no sign branch')||source.metricConvention!=='normalized-s/world-w'||
  ['interpolationReproduced','symbolicObjectsReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
 const initial=raw.initial;if(!record(initial))fail();if(q.family==='surface-to-cone-generic-native'){
  if(!keys(initial,['parameter','flatApex','spaceApex','flatSeedDirector','spaceSeedDirector','branchArgumentAtInitial','branchSignAtInitial'])||initial.parameter!==q.initialParameter||
   !nearVector(initial.flatApex,q.flatApex)||!nearVector(initial.spaceApex,q.spaceApex)||!nearVector(initial.flatSeedDirector,ref.initialFlatSeed!)||!nearVector(initial.spaceSeedDirector,ref.initialSpaceSeed!)||
   !close(initial.branchArgumentAtInitial,ref.initialProjection!,Math.max(...q.sourceFlatDirector.map((_,i)=>Math.abs(ref.evaluate(q.initialParameter).sourceFlat.director[i]*L)),...q.sourceSpaceDirector.map((_,i)=>Math.abs(ref.evaluate(q.initialParameter).sourceSpace.director[i]*L))))||initial.branchSignAtInitial!==ref.initialPsi)fail();
 }else if(!keys(initial,['flatReferencePoint','flatDirector','spaceReferencePoint','spaceDirector','unitDirectorResidual','unitDirectorCompatibilityTolerance','unitDirectorsCompatible'])||
  !nearVector(initial.flatReferencePoint,q.flatReferencePoint)||!nearVector(initial.spaceReferencePoint,q.spaceReferencePoint)||!nearVector(initial.flatDirector,q.flatDirector,Math.hypot(...q.flatDirector))||
  !nearVector(initial.spaceDirector,q.spaceDirector,Math.hypot(...q.spaceDirector))||!close(initial.unitDirectorResidual,ref.initialUnitResidual!,Math.max(ref.initialUnitResidual!,Number.EPSILON),1e-10)||
  initial.unitDirectorCompatibilityTolerance!==64*Number.EPSILON||initial.unitDirectorsCompatible!==ref.initialUnitCompatible)fail();
 const d=raw.diagnostics,c=raw.certification,domain=raw.domain;
 if(!record(d)||!keys(d,['validationNodes','targetDerivativeNodes','maximumSourcePairRelativeMetricDifference','maximumTargetPairRelativeMetricDifference','maximumFoldSpeedRelativeDifference',
  'maximumConstraintRelativeResidual','sourcePairMetricIdentity','symbolicZeroSignAnalytic','metricTolerance'])||d.validationNodes!==129||!Number.isInteger(d.targetDerivativeNodes)||d.targetDerivativeNodes<0||d.metricTolerance!==2e-8||
  ['maximumSourcePairRelativeMetricDifference','maximumFoldSpeedRelativeDifference','maximumConstraintRelativeResidual'].some(k=>!finite(d[k])||d[k]<0)||d.maximumTargetPairRelativeMetricDifference!==null&&(!finite(d.maximumTargetPairRelativeMetricDifference)||d.maximumTargetPairRelativeMetricDifference<0)||
  typeof d.symbolicZeroSignAnalytic!=='boolean'||d.symbolicZeroSignAnalytic!==ref.symbolicZeroSignAnalytic)fail();
 const identity=d.sourcePairMetricIdentity;if(!record(identity)||!keys(identity,['analyticIdentity','method'])||typeof identity.analyticIdentity!=='boolean'||identity.method!==(identity.analyticIdentity?'bounded-safe-symbolic-six-EFG-coefficients':'finite-original-source-pair'))fail();
 const certKeys=['finiteSourcePairMetricVerified','finiteTargetPairMetricVerified','sourcePairMetricAnalytic','sourceDefinitionCertified','signBranchCertified','initialDirectorsUnitCompatible','formalTargetPairMetricCertified',
  ...stages.map(stage=>stage+'StripRegularityCertified'),...falseCertificates];if(!record(c)||!keys(c,certKeys)||Object.values(c).some(v=>typeof v!=='boolean')||falseCertificates.some(k=>c[k]!==false))fail();
 if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved',...minimumKeys,'roundingModel','reason','signBranch','strips'])||typeof domain.certified!=='boolean'||
  !Number.isInteger(domain.evaluations)||domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||domain.verifiedCells!==domain.cells.length||!Array.isArray(domain.unresolved)||
  domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||domain.reason!==null&&typeof domain.reason!=='string')fail();
 for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellKeys)||!finite(cell.start)||!finite(cell.end)||cell.start<q.parameterStart||cell.end>q.parameterEnd||cell.start>=cell.end)fail();
  for(const name of boundKeys){const value=cell[name],nullable=!cone&&['flatRadiusBounds','spaceRadiusBounds','branchArgumentBounds','branchSignBounds'].includes(name)||cone&&symbolic&&name.startsWith('target');
   if(value===null){if(!nullable)fail();continue;}if(!vector(value,2)||value[0]>value[1])fail();if(name.endsWith('AreaSquaredBounds')&&value[0]< -4*Number.MIN_VALUE)fail();
   if(name.includes('Radius')&&(value[0]<0||cone&&symbolic&&value[0]<=0))fail();}
  if(absLower(cell.denominatorBounds)<=0||cone&&(!vector(cell.branchSignBounds,2)||![[1,1],[-1,-1],[0,0],[-1,1]].some(pair=>JSON.stringify(pair)===JSON.stringify(cell.branchSignBounds))))fail();
  if(cone&&symbolic&&!ref.symbolicZeroSignAnalytic&&JSON.stringify(cell.branchSignBounds)==='[-1,1]'&&(cell.targetFlatNormalizedAreaSquaredBounds!==null||cell.targetSpaceNormalizedAreaSquaredBounds!==null))fail();}
 const partition=[...domain.cells.map((cell:Cell)=>[cell.start,cell.end]),...domain.unresolved.map((pair:unknown)=>{if(!vector(pair,2)||pair[0]<q.parameterStart||pair[1]>q.parameterEnd||pair[0]>=pair[1])fail();return pair;})].sort((a,b)=>a[0]-b[0]);
 if(!partition.length||!close(partition[0][0],q.parameterStart,1,1e-12)||!close(partition.at(-1)![1],q.parameterEnd,1,1e-12)||partition.some((pair,i)=>i>0&&!close(pair[0],partition[i-1][1],1,1e-12))||domain.certified!==(domain.unresolved.length===0))fail();
 for(let i=0;i<minimumKeys.length;i++){const key=['denominatorBounds','flatRadiusBounds','spaceRadiusBounds','branchArgumentBounds'][i],all=domain.cells.map((cell:Cell)=>cell[key as keyof Cell]),minimum=domain.certified&&all.length&&all.every((x:unknown)=>x!==null)?Math.min(...all.map((x:any)=>i===0||i===3?absLower(x):x[0])):null;
  if(minimum===null?domain[minimumKeys[i]]!==null:!close(domain[minimumKeys[i]],minimum,minimum,2e-10))fail();}
 const branch=domain.signBranch;if(!record(branch)||!keys(branch,['status','sign','reason'])||!['verified','unknown','constant-zero'].includes(branch.status)||branch.sign!==null&&![-1,0,1].includes(branch.sign)||branch.reason!==null&&typeof branch.reason!=='string')fail();
 const constantZero=cone&&(ref.symbolicZeroSignAnalytic||!symbolic&&ref.initialPsi===0);if((branch.status==='constant-zero')!==constantZero||branch.status==='verified'&&!domain.certified||!cone&&branch.sign!==null)fail();
 if(branch.status==='verified'&&cone&&domain.cells.some((cell:Cell)=>!vector(cell.branchSignBounds,2)||cell.branchSignBounds[0]!==branch.sign||cell.branchSignBounds[1]!==branch.sign))fail();
 if(!record(domain.strips)||!keys(domain.strips,[...stages]))fail();for(const stage of stages){const strip=domain.strips[stage];if(!record(strip)||!keys(strip,['status','minimumAreaSquaredLowerBound','reason'])||!['verified','unknown','degenerate'].includes(strip.status)||strip.reason!==null&&typeof strip.reason!=='string')fail();
  if(strip.status==='verified'){const bounds=domain.cells.map((cell:Cell)=>cell[stage+'NormalizedAreaSquaredBounds'as keyof Cell]);if(!domain.certified||bounds.some((b:any)=>!b||b[0]<=0)||!close(strip.minimumAreaSquaredLowerBound,Math.min(...bounds.map((b:any)=>b[0])),Math.min(...bounds.map((b:any)=>b[0])),2e-10))fail();}
  else if(strip.minimumAreaSquaredLowerBound!==null)fail();}
 const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),validation=[...new Set([...parameters,...Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128)])],
  midpoints=domain.cells.map((cell:Cell)=>(cell.start+cell.end)/2),widths=Array.from({length:q.rulingSegments+1},(_,i)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*i/q.rulingSegments);widths.push((q.transverseStart+q.transverseEnd)/2);
 let maxSource=0,maxTarget=0,maxFold=0,maxConstraint=0,defined=0;
 const inspect=(s:number,count:boolean)=>{const r=ref.evaluate(s);if(count){if(r.targetJetsDefined)defined++;const a=dot(r.foldFlatPrime,r.foldFlatPrime),b=dot(r.foldSpacePrime,r.foldSpacePrime);maxFold=Math.max(maxFold,Math.abs(a-b)/Math.max(a,b,Number.MIN_VALUE));
   const A=cone?dot(r.foldFlat,r.foldFlat):dot(r.foldFlat,(q as Extract<GenericSurfaceConversionQuery,{family:'surface-to-cylinder-generic-native'}>).flatDirector),B=cone?dot(r.foldSpace,r.foldSpace):dot(r.foldSpace,(q as Extract<GenericSurfaceConversionQuery,{family:'surface-to-cylinder-generic-native'}>).spaceDirector),
    den=cone?Math.max(Math.abs(A),Math.abs(B)):Math.max(Math.hypot(...r.foldFlat)*Math.hypot(...(q as any).flatDirector),Math.hypot(...r.foldSpace)*Math.hypot(...(q as any).spaceDirector));
   maxConstraint=Math.max(maxConstraint,Math.abs(A-B)/Math.max(den,Number.MIN_VALUE));}
  const cells=domain.cells.filter((cell:Cell)=>cell.start-1e-12<=s&&s<=cell.end+1e-12),values=[r.denominator,r.offsetParameter,r.flatRadius,r.spaceRadius,r.branchArgument,r.branchSign];
  for(const cell of cells)for(let i=0;i<values.length;i++){const bounds=cell[boundKeys[i]],value=values[i];if(bounds===null){if(value!==null)fail();continue;}if(value===null||!finite(value))fail();
   const tol=2e-8*Math.max(Math.abs(value),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);if(value<bounds[0]-tol||value>bounds[1]+tol)fail();}
  for(const w of widths){if(count){maxSource=Math.max(maxSource,metricDifference(metrics(r.sourceFlat,w)!,metrics(r.sourceSpace,w)!));if(r.targetJetsDefined)maxTarget=Math.max(maxTarget,metricDifference(metrics(r.targetFlat,w)!,metrics(r.targetSpace,w)!));}
   for(const cell of cells)for(const stage of stages){const bounds=cell[stage+'NormalizedAreaSquaredBounds'];if(bounds===null)continue;const p=r[stage];if(p.directorPrime===null)fail();const area=areaSquared(add(p.basePrime,p.directorPrime,w),p.director),tol=2e-8*Math.max(Math.abs(area),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);if(area<bounds[0]-tol||area>bounds[1]+tol)fail();}}
  return r;};
 validation.forEach(s=>inspect(s,true));midpoints.forEach(s=>inspect(s,false));
 if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
 for(let i=0;i<parameters.length;i++){const s=parameters[i],r=inspect(s,false),row=raw.sample.rows[i],grid=raw.grid[i];if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1,1e-12)||
  !close(row.offsetParameter,r.offsetParameter,Math.max(1,Math.abs(r.offsetParameter)))||!close(row.offsetParameterDerivative,r.offsetParameterDerivative,Math.max(Math.abs(r.offsetParameterDerivative),1/(q.parameterEnd-q.parameterStart)))||
  row.targetJetsDefined!==r.targetJetsDefined||row.branchSign!==r.branchSign||(r.branchArgument===null?row.branchArgument!==null:!close(row.branchArgument,r.branchArgument,Math.max(1,Math.abs(r.branchArgument)))))fail();
  for(const stage of stages){const item=row[stage],p=r[stage],origin=stage.endsWith('Space')?norm.spaceOrigin:norm.flatOrigin,n=origin.length;if(!record(item)||!keys(item,stageKeys))fail();
   for(const [label,value]of [['Base',p.base],['Director',p.director],['BaseDerivative',p.basePrime],['DirectorDerivative',p.directorPrime]]as const){const actual=item[label[0].toLowerCase()+label.slice(1)],normalized=item['normalized'+label];
    if(value===null){if(actual!==null||normalized!==null)fail();continue;}const natural=label==='Base'?Math.max(1,Math.hypot(...value)):Math.hypot(...value);
    if(!nearVector(normalized,value,natural)||!world(actual,value,label==='Base'?origin:null,natural)||!vector(normalized,n))fail();}}
  for(const [label,value]of [['FoldFlat',r.foldFlat],['FoldSpace',r.foldSpace],['FoldFlatDerivative',r.foldFlatPrime],['FoldSpaceDerivative',r.foldSpacePrime]]as const){const origin=label.includes('Space')?norm.spaceOrigin:norm.flatOrigin,natural=label.endsWith('Derivative')?Math.hypot(...value):Math.max(1,Math.hypot(...value));
   if(!nearVector(row['normalized'+label],value,natural)||!world(row[label[0].toLowerCase()+label.slice(1)],value,label.endsWith('Derivative')?null:origin,natural))fail();}
  if(!record(grid)||!keys(grid,['s',...stages])||!close(grid.s,s,1,1e-12))fail();for(const stage of stages){const entry=grid[stage],p=r[stage],origin=stage.endsWith('Space')?norm.spaceOrigin:norm.flatOrigin;
   if(!record(entry)||!keys(entry,['points','normalizedPoints','EFG'])||!Array.isArray(entry.points)||entry.points.length!==q.rulingSegments+1||!Array.isArray(entry.normalizedPoints)||entry.normalizedPoints.length!==q.rulingSegments+1||
    (p.directorPrime===null?entry.EFG!==null:!Array.isArray(entry.EFG)||entry.EFG.length!==q.rulingSegments+1))fail();
   for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments,point=add(p.base,p.director,w),natural=Math.max(1,Math.hypot(...point));
    if(!nearVector(entry.normalizedPoints[j],point,natural)||!world(entry.points[j],point,origin,natural))fail();const m=metrics(p,w);if(m){const bp=Math.hypot(...p.basePrime)+Math.abs(w)*Math.hypot(...p.directorPrime!),dn=Math.hypot(...p.director),units=[bp*bp,bp*dn,dn*dn];
     if(!vector(entry.EFG[j],3)||m.some((v,k)=>!close(entry.EFG[j][k],v,units[k])))fail();}}
  }
 }
 if(d.targetDerivativeNodes!==defined||defined<validation.length&&d.maximumTargetPairRelativeMetricDifference!==null||defined===validation.length&&d.maximumTargetPairRelativeMetricDifference===null||
  maxSource>d.maximumSourcePairRelativeMetricDifference+2e-8||defined===validation.length&&maxTarget>d.maximumTargetPairRelativeMetricDifference+2e-8||maxFold>d.maximumFoldSpeedRelativeDifference+2e-8||maxConstraint>d.maximumConstraintRelativeResidual+2e-8)fail();
 if(c.finiteSourcePairMetricVerified!==(d.maximumSourcePairRelativeMetricDifference<=d.metricTolerance)||c.finiteTargetPairMetricVerified!==(d.maximumTargetPairRelativeMetricDifference!==null&&d.maximumTargetPairRelativeMetricDifference<=d.metricTolerance)||
  c.sourcePairMetricAnalytic!==identity.analyticIdentity||c.sourceDefinitionCertified!==domain.certified||c.signBranchCertified!==['verified','constant-zero'].includes(branch.status)||c.initialDirectorsUnitCompatible!==ref.initialUnitCompatible||
  c.formalTargetPairMetricCertified!==(domain.certified&&identity.analyticIdentity&&branch.status==='verified'&&ref.initialUnitCompatible))fail();
 for(const stage of stages){if(c[stage+'StripRegularityCertified']!==(domain.strips[stage].status==='verified'))fail();if(stage.startsWith('target')&&cone&&(constantZero||q.transverseStart<=0&&q.transverseEnd>=0)&&domain.strips[stage].status!=='degenerate')fail();}
 return raw as GenericSurfaceConversionResult;
}
export async function fetchGenericSurfaceConversionWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericSurfaceConversionResult>{const q=validateGenericSurfaceConversionQuery(input),operation=q.family==='surface-to-cone-generic-native'?'curved-surface-to-cone-generic':'curved-surface-to-cylinder-generic';
 while(true){signal?.throwIfAborted();try{return parseGenericSurfaceConversionResult(await api('tessellation/'+operation,q,signal),q);}catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
