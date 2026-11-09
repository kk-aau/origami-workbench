import {api} from './api';
import {assertCompensatedSurfaceDomains,compensatedSurfaceFrame,compensatedSurfaceJet} from './curvedSurfaceCompensatedFrame';

export type GenericSurfaceSystemQuery={family:'surface-system-generic-native';surface:[string,string,string];
  uStart:number;uEnd:number;vStart:number;vEnd:number;uSegments:number;vSegments:number;principalAnalysis:boolean};
export type GenericSurfaceNormalQuery=Omit<GenericSurfaceSystemQuery,'family'|'principalAnalysis'>&{
  family:'surface-normal-generic-native';surfaceOrientation:1|-1};
export const SURFACE_SYSTEM_NATIVE_PRESET:GenericSurfaceSystemQuery={family:'surface-system-generic-native',
  surface:['2*u','2*sin(v)','2*(1-cos(v))'],uStart:0,uEnd:1,vStart:0,vEnd:1.5,uSegments:16,vSegments:16,principalAnalysis:true};
export const SURFACE_NORMAL_NATIVE_PRESET:GenericSurfaceNormalQuery={family:'surface-normal-generic-native',
  surface:[...SURFACE_SYSTEM_NATIVE_PRESET.surface],uStart:0,uEnd:1,vStart:0,vEnd:1.5,uSegments:16,vSegments:16,surfaceOrientation:1};
export const SURFACE_BASIC_RULES=['SurfaceTangentU','SurfaceTangentV','SurfaceNormal','FundamentalFormE','FundamentalFormF',
  'FundamentalFormG','FundamentalFormL','FundamentalFormM','FundamentalFormN','GaussianCurvature','MeanCurvature','CurvatureMatrix'];
export const SURFACE_PRINCIPAL_RULES=['PrincipalCurvatures','PrincipalDirectionsUV','PrincipalDirections'];
type Rules={SurfaceTangentU:number[];SurfaceTangentV:number[];SurfaceNormal:number[];FundamentalFormE:number;FundamentalFormF:number;
  FundamentalFormG:number;FundamentalFormL:number;FundamentalFormM:number;FundamentalFormN:number;GaussianCurvature:number;MeanCurvature:number;
  CurvatureMatrix:number[][];PrincipalCurvatures?:number[];PrincipalDirectionsUV?:number[][];PrincipalDirections?:number[][]};
export type GenericSurfaceRow={u:number;v:number;sourcePoint:number[];normalizedPoint:number[];sourceSecondDerivatives:number[][];
  normalizedSecondDerivatives:number[][];rules:Rules;normalizedRules:Rules;principalChoice:'non-unique-identity'|'separated-numeric'|'unresolved-numeric'|null;
  principalEigenResidual:number;principalWorldOrthogonalityResidual:number};
type Cell={rectangle:number[];normalizedAreaSquaredBounds:number[];normalizedBasicRuleBounds:number[][]};
export type GenericSurfaceSystemResult={family:'origamica-generic-surface-system';query:GenericSurfaceSystemQuery;
  source:{function:'SurfaceSystem';definitionCell:'In[3777]';argumentOrder:string[];ruleOrder:string[];simplification:'None';
    principalPairConvention:string;principalUmbilicIdentity:boolean;symbolicWolframReproduced:false;interpolationReproduced:false};
  normalization:{sourceOrigin:number[];scale:number};domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:Cell[];
    unresolved:number[][];minimumNormalizedAreaSquaredLowerBound:number|null;roundingModel:string;reason:string|null};
  sample:{rows:GenericSurfaceRow[]};grid:{u:number[];v:number[];rows:GenericSurfaceRow[][]};
  diagnostics:{validationNodes:25;maximumPrincipalEigenResidual:number;maximumPrincipalWorldOrthogonalityResidual:number};
  certification:{mixedDerivativesEvaluated:true;allRequestedRulesEvaluated:true;finiteGridVerified:true;fullRectangleRegularityCertified:boolean;
    principalDirectionsUniqueCertified:false;principalDirectionsContinuousCertified:false;globalSurfaceInjectivityChecked:false;
    selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false}};
export type GenericSurfaceNormalRow={u:number;v:number;sourcePoint:number[];normalizedPoint:number[];
  sourceTangents:number[][];normalizedTangents:number[][];normal:number[]};
export type GenericSurfaceNormalResult={family:'origamica-generic-surface-normal';query:GenericSurfaceNormalQuery;
  source:{function:'SurfaceNormalFromSurface';definitionCell:'In[3746]';argumentOrder:string[];
    originalOrientationOption:'SurfaceOrientation';simplification:'None';symbolicWolframReproduced:false;interpolationReproduced:false;
    numericalWrapperFunction:'NSurfaceNormalFromSurface';numericalWrapperDefinitionCell:'In[3750]';numericalWrapperInterpolationReproduced:false};
  normalization:GenericSurfaceSystemResult['normalization'];domain:GenericSurfaceSystemResult['domain'];
  sample:{rows:GenericSurfaceNormalRow[]};grid:{u:number[];v:number[];rows:GenericSurfaceNormalRow[][]};
  certification:{finiteGridVerified:true;fullRectangleRegularityCertified:boolean;globalSurfaceInjectivityChecked:false;
    selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false}};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
  record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
  keys=(x:Record<string,unknown>,k:string[])=>Object.keys(x).length===k.length&&k.every(v=>Object.hasOwn(x,v)),
  vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite),
  matrix=(x:unknown,n:number,m:number):x is number[][]=>Array.isArray(x)&&x.length===n&&x.every(v=>vector(v,m)),
  dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a:number[],b:number[])=>[
    a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  mul=(a:number[],k:number)=>a.map(x=>x*k),unit=(a:number[])=>{const n=Math.hypot(...a);if(!finite(n)||n===0)fail();return mul(a,1/n);};
function fail():never{throw Error('原双变量曲面的安全源、混合导数、全部规则、主方向或完整矩形证据回读不一致。');}
const near=(x:unknown,y:number,natural=Math.abs(y),tol=3e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE,
  nearV=(x:unknown,y:number[],natural=Math.hypot(...y),tol=3e-8)=>vector(x,y.length)&&y.every((v,i)=>near(x[i],v,natural,tol));
const sumExact=(values:number[])=>{const partials:number[]=[];for(let x of values){let i=0;for(let y of partials){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi;}partials.length=i;partials.push(x);}
  return partials.reduceRight((s,x)=>s+x,0);};

/** Independent outward arithmetic; no backend bounds serve as a reference. */
const memory=new DataView(new ArrayBuffer(8));
function next(x:number,positive:boolean){if(Number.isNaN(x)||x===(positive?Infinity:-Infinity))return x;
  if(x===0)return positive?Number.MIN_VALUE:-Number.MIN_VALUE;memory.setFloat64(0,x,false);let bits=memory.getBigUint64(0,false);
  bits+=(x>0)===positive?1n:-1n;memory.setBigUint64(0,bits,false);return memory.getFloat64(0,false);}
const down=(x:number)=>next(next(x,false),false),up=(x:number)=>next(next(x,true),true);
export class SurfaceInterval{
  constructor(readonly lo:number,readonly hi=lo){}
  static cast(x:Scalar){return x instanceof SurfaceInterval?x:new SurfaceInterval(x);}
  add(x:Scalar){const b=SurfaceInterval.cast(x);if(this.lo===0&&this.hi===0)return b;if(b.lo===0&&b.hi===0)return this;
    return new SurfaceInterval(down(this.lo+b.lo),up(this.hi+b.hi));}
  neg(){return new SurfaceInterval(-this.hi,-this.lo);}
  sub(x:Scalar){return this.add(SurfaceInterval.cast(x).neg());}
  mul(x:Scalar){const b=SurfaceInterval.cast(x);if(this.lo===0&&this.hi===0||b.lo===0&&b.hi===0)return new SurfaceInterval(0);
    const ends=[this.lo*b.lo,this.lo*b.hi,this.hi*b.lo,this.hi*b.hi];return new SurfaceInterval(down(Math.min(...ends)),up(Math.max(...ends)));}
  inv(){if(this.lo<=0&&this.hi>=0)throw Error('区间零分母');return new SurfaceInterval(down(1/this.hi),up(1/this.lo));}
  div(x:Scalar){return this.mul(SurfaceInterval.cast(x).inv());}
  square(){const a=this.lo*this.lo,b=this.hi*this.hi,lo=this.lo<=0&&this.hi>=0?0:Math.min(a,b);
    return new SurfaceInterval(lo===0?0:down(lo),up(Math.max(a,b)));}
  sqrt(){if(this.lo<=0)throw Error('区间根式非正');return new SurfaceInterval(down(Math.sqrt(this.lo)),up(Math.sqrt(this.hi)));}
  sincos(){if(!finite(this.lo+this.hi)||this.hi-this.lo>=2*Math.PI)return [new SurfaceInterval(-1,1),new SurfaceInterval(-1,1)];
    const s=[Math.sin(this.lo),Math.sin(this.hi)],c=[Math.cos(this.lo),Math.cos(this.hi)];
    if(Math.ceil((this.lo-Math.PI/2)/(2*Math.PI))<=Math.floor((this.hi-Math.PI/2)/(2*Math.PI)))s.push(1);
    if(Math.ceil((this.lo+Math.PI/2)/(2*Math.PI))<=Math.floor((this.hi+Math.PI/2)/(2*Math.PI)))s.push(-1);
    if(Math.ceil(this.lo/(2*Math.PI))<=Math.floor(this.hi/(2*Math.PI)))c.push(1);
    if(Math.ceil((this.lo-Math.PI)/(2*Math.PI))<=Math.floor((this.hi-Math.PI)/(2*Math.PI)))c.push(-1);
    return [new SurfaceInterval(Math.max(-1,down(Math.min(...s))),Math.min(1,up(Math.max(...s)))),
      new SurfaceInterval(Math.max(-1,down(Math.min(...c))),Math.min(1,up(Math.max(...c))))];}
  atan(){return new SurfaceInterval(down(Math.atan(this.lo)),up(Math.atan(this.hi)));}
  exp(){return new SurfaceInterval(down(Math.exp(this.lo)),up(Math.exp(this.hi)));}
  log(){if(this.lo<=0)throw Error('区间log非正');return new SurfaceInterval(down(Math.log(this.lo)),up(Math.log(this.hi)));}
}
type Scalar=number|SurfaceInterval;
const sa=(a:Scalar,b:Scalar):Scalar=>typeof a==='number'&&typeof b==='number'?a+b:SurfaceInterval.cast(a).add(b),
  sn=(a:Scalar):Scalar=>typeof a==='number'?-a:a.neg(),sm=(a:Scalar,b:Scalar):Scalar=>typeof a==='number'&&typeof b==='number'?a*b:SurfaceInterval.cast(a).mul(b),
  si=(a:Scalar):Scalar=>{if(typeof a!=='number')return a.inv();if(a===0||!finite(1/a))fail();return 1/a;},
  ss=(a:Scalar):Scalar=>typeof a==='number'?a*a:a.square(),sd=(a:Scalar,b:Scalar)=>sm(a,si(b));
export class SurfaceJet{
  constructor(readonly c:Scalar[]){}
  static variable(x:Scalar,axis:0|1){const j=SurfaceJet.constant(x,x instanceof SurfaceInterval);j.c[axis+1]=x instanceof SurfaceInterval?new SurfaceInterval(1):1;return j;}
  static constant(x:Scalar,interval=false){return new SurfaceJet([interval?SurfaceInterval.cast(x):x,...Array.from({length:5},()=>interval?new SurfaceInterval(0):0)]);}
  constant(x:Scalar){return SurfaceJet.constant(x,this.c[0] instanceof SurfaceInterval);}
  other(x:Scalar|SurfaceJet){return x instanceof SurfaceJet?x:this.constant(x);}
  add(x:Scalar|SurfaceJet){const b=this.other(x);return new SurfaceJet(this.c.map((v,i)=>sa(v,b.c[i])));}
  neg(){return new SurfaceJet(this.c.map(sn));}
  sub(x:Scalar|SurfaceJet){return this.add(this.other(x).neg());}
  mul(x:Scalar|SurfaceJet){const a=this.c,b=this.other(x).c;return new SurfaceJet([
    sm(a[0],b[0]),sa(sm(a[1],b[0]),sm(a[0],b[1])),sa(sm(a[2],b[0]),sm(a[0],b[2])),
    sa(sa(sm(a[3],b[0]),sm(2,sm(a[1],b[1]))),sm(a[0],b[3])),
    sa(sa(sa(sm(a[4],b[0]),sm(a[1],b[2])),sm(a[2],b[1])),sm(a[0],b[4])),
    sa(sa(sm(a[5],b[0]),sm(2,sm(a[2],b[2]))),sm(a[0],b[5]))]);}
  compose(value:Scalar,first:Scalar,second:Scalar){const a=this.c;return new SurfaceJet([value,sm(first,a[1]),sm(first,a[2]),
    sa(sm(first,a[3]),sm(second,ss(a[1]))),sa(sm(first,a[4]),sm(second,sm(a[1],a[2]))),sa(sm(first,a[5]),sm(second,ss(a[2])))]);}
  inv(){const value=this.c[0],x=si(value);if(typeof value==='number'){
    const a=this.c as number[],y=x as number,yu=-(a[1]/value)*y,yv=-(a[2]/value)*y;
    return new SurfaceJet([y,yu,yv,-((a[3]/value)*y+2*(a[1]/value)*yu),
      -((a[4]/value)*y+(a[1]/value)*yv+(a[2]/value)*yu),-((a[5]/value)*y+2*(a[2]/value)*yv)]);}
    return this.compose(x,sn(ss(x)),sm(2,sm(x,ss(x))));}
  div(x:Scalar|SurfaceJet){return this.mul(this.other(x).inv());}
  pow(n:number):SurfaceJet{if(n<0)return this.inv().pow(-n);let out=this.constant(1);for(let i=0;i<n;i++)out=out.mul(this);return out;}
  sincos(){const x=this.c[0],[s,c]=typeof x==='number'?[Math.sin(x),Math.cos(x)]:x.sincos();return [this.compose(s,c,sn(s)),this.compose(c,sn(s),sn(c))];}
  tan(){const [s,c]=this.sincos();return s.div(c);}
  atan(){const x=this.c[0],d=si(sa(1,ss(x)));return this.compose(typeof x==='number'?Math.atan(x):x.atan(),d,sm(-2,sm(x,ss(d))));}
  sqrt(){const x=this.c[0];if(typeof x==='number'&&x<=0)fail();const y=typeof x==='number'?Math.sqrt(x):x.sqrt();
    if(typeof x==='number'){const a=this.c as number[],r=y as number,yu=a[1]/(2*r),yv=a[2]/(2*r);
      return new SurfaceJet([r,yu,yv,(a[3]-2*yu*yu)/(2*r),(a[4]-2*yu*yv)/(2*r),(a[5]-2*yv*yv)/(2*r)]);}
    return this.compose(y,sd(1,sm(2,y)),sd(-1,sm(4,sm(y,x))));}
  exp(){const x=this.c[0],y=typeof x==='number'?Math.exp(x):x.exp();return this.compose(y,y,y);}
  log(){const x=this.c[0];if(typeof x==='number'&&x<=0)fail();const y=typeof x==='number'?Math.log(x):x.log(),inv=si(x);return this.compose(y,inv,sn(ss(inv)));}
}

type Node={kind:'constant';value:number;transcendental?:true}|{kind:'variable';name:'u'|'v'}|{kind:'unary';minus:boolean;a:Node}|
  {kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
type Parts={offsets:Scalar[];dynamic:SurfaceJet|null};
type Rational={n:bigint;d:bigint};
type DomainObligation={kind:'nonzero'|'nonnegative'|'positive'|'tan';node:Node};
/** Exact rational normal forms; analytic calls are atoms with explicit real
 * relations. Domain obligations are retained from the original AST, separately
 * from all cancellation. Budgets mirror SurfaceExactIdentity in Python. */
function makeSurfaceIdentity(point?:Record<'u'|'v',number>){
  type Poly=Map<string,Rational>;type Form=[Poly,Poly];
  const cache=new Map<Node,Form|null>(),atoms=new Map<string,number>(),relations=new Map<number,Poly>(),expArguments=new Map<number,Form>();let steps=0;
  const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b)[a,b]=[b,a%b];return a;},
    q=(n:bigint,d=1n):Rational=>{if(!d)throw Error('未定义的形式分母');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};},
    plus=(a:Rational,b:Rational,sign=1)=>q(a.n*b.d+BigInt(sign)*b.n*a.d,a.d*b.d),
    times=(a:Rational,b:Rational)=>q(a.n*b.n,a.d*b.d),divide=(a:Rational,b:Rational)=>q(a.n*b.d,a.d*b.n),
    mono=(m:string):[number,number][]=>m?m.split(',').map(t=>t.split('^').map(Number) as [number,number]):[],
    monoKey=(m:Map<number,number>)=>[...m].sort((a,b)=>a[0]-b[0]).filter(([,e])=>e).map(([k,e])=>k+'^'+e).join(','),
    bounded=(p:Poly):Poly=>{if(p.size>256||[...p].some(([m,c])=>mono(m).reduce((s,[,e])=>s+e,0)>64||
      Math.max((c.n<0n?-c.n:c.n).toString(2).length,c.d.toString(2).length)>4096))throw Error('精确恒等式超预算');return p;},
    add=(a:Poly,b:Poly,sign=1):Poly=>{const out=new Map(a);for(const [m,c] of b){const v=plus(out.get(m)??q(0n),c,sign);if(v.n)out.set(m,v);else out.delete(m);}return bounded(out);},
    multiply=(a:Poly,b:Poly):Poly=>{const out:Poly=new Map();
      const term=(m:string,c:Rational)=>{if(++steps>32768)throw Error('精确恒等式超预算');
        const powers=mono(m),exponentials=powers.filter(([k])=>expArguments.has(k));
        if(exponentials.reduce((s,[,e])=>s+e,0)>=2){let argument=groundForm(q(0n));
          for(const [k,e] of exponentials)argument=combine(argument,combine(groundForm(q(BigInt(e))),expArguments.get(k)!,'*'),'+');
          const rest=new Map(powers.filter(([k])=>!expArguments.has(k)));
          if(ground(argument)?.n!==0n){const [,k]=atom('call:exp:'+formKey(argument));expArguments.set(k,argument);rest.set(k,(rest.get(k)??0)+1);}
          term(monoKey(rest),c);return;}
        for(const [atom,exponent] of powers)if(exponent>=2&&relations.has(atom)){
          const rest=new Map(powers);rest.set(atom,exponent-2);
          for(const [rm,rc] of relations.get(atom)!){const combined=new Map(rest);for(const [k,e] of mono(rm))combined.set(k,(combined.get(k)??0)+e);term(monoKey(combined),times(c,rc));}return;}
        const v=plus(out.get(m)??q(0n),c);if(v.n)out.set(m,v);else out.delete(m);bounded(out);};
      for(const [am,ac] of a)for(const [bm,bc] of b){const combined=new Map(mono(am));for(const [k,e] of mono(bm))combined.set(k,(combined.get(k)??0)+e);term(monoKey(combined),times(ac,bc));}return out;},
    groundForm=(x:Rational):Form=>[new Map(x.n?[['',x]]:[]),new Map([['',q(1n)]])],
    sorted=(p:Poly)=>[...p.keys()].sort(),
    normal=(num:Poly,den:Poly):Form=>{if(!den.size)throw Error('未定义的形式分母');if(!num.size)return groundForm(q(0n));
      const leading=den.get(sorted(den)[0])!;num=new Map([...num].map(([m,c])=>[m,divide(c,leading)]));den=new Map([...den].map(([m,c])=>[m,divide(c,leading)]));
      if(num.size===den.size&&[...num.keys()].every(m=>den.has(m))){const m=sorted(num)[0],ratio=divide(num.get(m)!,den.get(m)!);
        if([...num].every(([m,c])=>c.n*times(ratio,den.get(m)!).d===times(ratio,den.get(m)!).n*c.d))return groundForm(ratio);}
      return [bounded(num),bounded(den)];},
    combine=(a:Form,b:Form,op:string):Form=>{const [an,ad]=a,[bn,bd]=b;return op==='+'||op==='-'?
      normal(add(multiply(an,bd),multiply(bn,ad),op==='+'?1:-1),multiply(ad,bd)):
      normal(multiply(an,op==='*'?bn:bd),multiply(ad,op==='*'?bd:bn));},
    atom=(key:string):[Form,number]=>{if(!atoms.has(key))atoms.set(key,atoms.size);const k=atoms.get(key)!;return [[new Map([[k+'^1',q(1n)]]),new Map([['',q(1n)]])],k];},
    formKey=(a:Form)=>a.map(p=>sorted(p).map(m=>m+':'+p.get(m)!.n+'/'+p.get(m)!.d).join(';')).join('|'),
    ground=(a:Form):Rational|null=>a[0].size<=1&&(!a[0].size||a[0].has(''))&&a[1].size===1&&a[1].has('')?divide(a[0].get('')??q(0n),a[1].get('')!):null,
    integer=(n:Node):number=>n.kind==='constant'?n.value:n.kind==='unary'?(n.minus?-1:1)*integer(n.a):NaN,
    decimal=(x:number):Rational=>{const [raw,power='0']=String(x).toLowerCase().split('e'),digits=raw.replace('.',''),places=(raw.split('.')[1]?.length??0)-Number(power);
      return places>=0?q(BigInt(digits),10n**BigInt(places)):q(BigInt(digits)*10n**BigInt(-places));},
    isqrt=(n:bigint)=>{if(!n)return 0n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}},
    call=(name:string,a:Form,node:Node):Form=>{const value=ground(a),zero=groundForm(q(0n)),one=groundForm(q(1n));
      if(value?.n===0n){if(['sin','tan','atan','sqrt'].includes(name))return zero;if(['cos','exp'].includes(name))return one;}
      if(value&&value.n===value.d&&name==='log')return zero;
      if(name==='sqrt'&&value&&value.n>0n){const n=isqrt(value.n),d=isqrt(value.d);if(n*n===value.n&&d*d===value.d)return groundForm(q(n,d));}
      if((name==='exp'||name==='log')&&node.kind==='call'&&node.name===(name==='exp'?'log':'exp'))return form(node.a)!;
      if(['sin','cos','tan','atan'].includes(name)){
        const first=a[0].get(sorted(a[0])[0]);if(first&&first.n<0n){const positive:Form=[new Map([...a[0]].map(([m,c])=>[m,q(-c.n,c.d)])),a[1]],out=call(name,positive,node);return name==='cos'?out:combine(zero,out,'-');}
        const pi=atoms.get('name:pi'),monomial=pi+'^1';
        if(pi!==undefined&&a[0].size===1&&a[0].has(monomial)&&a[1].size===1&&a[1].has('')){const half=divide(times(q(2n),a[0].get(monomial)!),a[1].get('')!);
          if(half.d===1n){const k=Number(half.n%4n);if(name==='sin'||name==='cos')return groundForm(q(BigInt((name==='sin'?[0,1,0,-1]:[1,0,-1,0])[k])));
            if(name==='tan'){if(k%2)throw Error('原精确Tan极点');return zero;}}}
        if(name==='tan')return combine(call('sin',a,node),call('cos',a,node),'/');}
      const [result,k]=atom('call:'+name+':'+formKey(a));
      if(name==='exp')expArguments.set(k,a);
      else if(name==='cos'){const [sine]=atom('call:sin:'+formKey(a));relations.set(k,add(one[0],multiply(sine[0],sine[0]),-1));}
      else if(name==='sqrt'&&a[1].size===1&&a[1].has(''))relations.set(k,new Map([...a[0]].map(([m,c])=>[m,divide(c,a[1].get('')!)])));
      return result;},
    form=(node:Node):Form|null=>{if(cache.has(node))return cache.get(node)!;try{let out:Form;
      if(node.kind==='constant'){if(node.transcendental)out=atom('name:'+(node.value===Math.PI?'pi':'e'))[0];else{
        out=groundForm(decimal(node.value));}}
      else if(node.kind==='variable')out=point?groundForm(decimal(point[node.name])):atom('name:'+node.name)[0];
      else if(node.kind==='unary')out=node.minus?combine(groundForm(q(0n)),form(node.a)!,'-'):form(node.a)!;
      else if(node.kind==='call')out=call(node.name,form(node.a)!,node.a);
      else {let a=form(node.a)!;if(node.op==='**'){const n=integer(node.b);out=groundForm(q(1n));if(n<0)a=combine(out,a,'/');for(let i=0;i<Math.abs(n);i++)out=combine(out,a,'*');}
        else out=combine(a,form(node.b)!,node.op);}
      if(!out)throw Error('未知恒等式');cache.set(node,out);return out;
    }catch{cache.set(node,null);return null;}};
  return {constant:(node:Node)=>{const a=form(node);return a?ground(a):null;},
    nonnegative:(node:Node)=>{const a=form(node);return !!a&&a.every(p=>[...p].every(([m,c])=>c.n>=0n&&mono(m).every(([,e])=>e%2===0)));}};
}
function surfaceDomainObligations(tree:Node):DomainObligation[]{
  const out:DomainObligation[]=[];
  const walk=(n:Node)=>{if(n.kind==='unary')walk(n.a);else if(n.kind==='binary'){
    if(n.op==='/')out.push({kind:'nonzero',node:n.b});else if(n.op==='**'&&(n.b.kind==='unary'&&n.b.minus||n.b.kind==='constant'&&n.b.value<0))out.push({kind:'nonzero',node:n.a});walk(n.a);walk(n.b);}
    else if(n.kind==='call'){if(n.name==='sqrt'||n.name==='log'||n.name==='tan')out.push({kind:n.name==='sqrt'?'nonnegative':n.name==='log'?'positive':'tan',node:n.a});walk(n.a);}};
  walk(tree);return out;
}
export function compileSurfaceExpression(source:string){
  if(typeof source!=='string'||!source.length||source.length>240)throw Error('表达式须为1–240字符。');
  const names:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'},
    tokens:string[]=[],functions=['sin','cos','tan','atan','sqrt','exp','log'];let offset=0;
  while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
    if(!m){if(!source.slice(offset).trim())break;throw Error('表达式含不允许的字符。');}const t=names[m[1]]??m[1],previous=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);
    if(previous&&(word(previous)||previous===')')&&(word(t)||t==='(')&&!(functions.includes(previous)&&t==='('))tokens.push('*');tokens.push(t);offset+=m[0].length;}
  let pos=0,count=0;const peek=()=>tokens[pos],take=()=>tokens[pos++],node=<T extends Node>(x:T):T=>{if(++count>96)throw Error('表达式AST超96节点。');return x;},
    integer=(n:Node):number=>{if(n.kind==='constant'&&Number.isInteger(n.value)&&!n.transcendental)return n.value;
      if(n.kind==='unary'&&n.a.kind==='constant'&&Number.isInteger(n.a.value)&&!n.a.transcendental)return n.minus?-n.a.value:n.a.value;throw Error('幂仅允许−8…8整数常数。');};
  const atom=():Node=>{const t=take();if(t==='('){const x=add();if(take()!==')')throw Error('括号不匹配。');return x;}
    if(/^(?:\d|\.)/.test(t??'')){const x=Number(t);if(!finite(x)||Math.abs(x)>1e12)throw Error('常数超预算。');return node({kind:'constant',value:x});}
    if(t==='u'||t==='v')return node({kind:'variable',name:t});if(t==='pi'||t==='e')return node({kind:'constant',value:t==='pi'?Math.PI:Math.E,transcendental:true});
    if(functions.includes(t)&&take()==='('){const a=add();if(take()!==')')throw Error('函数需一个标量参数。');return node({kind:'call',name:t,a});}
    throw Error('只允许u/v、pi/e和白名单标量函数。');};
  const power=():Node=>{let a=atom();if(peek()==='**'){take();const b=unary();if(Math.abs(integer(b))>8)throw Error('幂超预算。');a=node({kind:'binary',op:'**',a,b});}return a;},
    unary=():Node=>{if(peek()==='+'||peek()==='-'){const minus=take()==='-';return node({kind:'unary',minus,a:unary()});}return power();},
    multiply=():Node=>{let a=unary();while(peek()==='*'||peek()==='/'){const op=take();a=node({kind:'binary',op,a,b:unary()});}return a;},
    add=():Node=>{let a=multiply();while(peek()==='+'||peek()==='-'){const op=take();a=node({kind:'binary',op,a,b:multiply()});}return a;};
  const tree=add();if(pos!==tokens.length)throw Error('表达式有未使用语法。');
  const identity=makeSurfaceIdentity(),zeroRoots=new Map<Node,DomainObligation[]>();
  const prove=(n:Node)=>{if(n.kind==='call'){if(n.name==='sqrt'&&identity.constant(n.a)?.n===0n)zeroRoots.set(n,surfaceDomainObligations(n.a));prove(n.a);}
    else if(n.kind==='unary')prove(n.a);else if(n.kind==='binary'){prove(n.a);prove(n.b);}};prove(tree);
  const checkIntervalDomains=(obligations:DomainObligation[],u:SurfaceInterval,v:SurfaceInterval)=>{
    const value=(n:Node):SurfaceInterval=>{if(n.kind==='constant')return new SurfaceInterval(n.transcendental?down(n.value):n.value,n.transcendental?up(n.value):n.value);
      const exact=identity.constant(n);if(exact){if(exact.n===0n)return new SurfaceInterval(0);const x=Number(exact.n)/Number(exact.d);return new SurfaceInterval(down(x),up(x));}
      if(n.kind==='variable')return n.name==='u'?u:v;if(n.kind==='unary'){const x=value(n.a);return n.minus?x.neg():x;}
      if(n.kind==='binary'){let a=value(n.a);if(n.op==='**'){let k=integer(n.b);if(k<0){a=a.inv();k=-k;}let r=new SurfaceInterval(1);for(let i=0;i<k;i++)r=r.mul(a);return r;}
        const b=value(n.b);return n.op==='+'?a.add(b):n.op==='-'?a.sub(b):n.op==='*'?a.mul(b):a.div(b);}
      const a=value(n.a);if(n.name==='sin'||n.name==='cos')return a.sincos()[n.name==='sin'?0:1];if(n.name==='tan'){const [s,c]=a.sincos();return s.div(c);}
      if(n.name==='sqrt'){if(a.lo<0)fail();return new SurfaceInterval(a.lo===0?0:down(Math.sqrt(a.lo)),up(Math.sqrt(a.hi)));}
      return a[n.name as 'atan'|'log'|'exp']();};
    for(const {kind,node} of obligations){if(kind==='nonnegative'&&identity.nonnegative(node))continue;let x=value(node);if(kind==='tan')x=x.sincos()[1];
      if(!finite(x.lo)||!finite(x.hi)||!(kind==='nonnegative'?x.lo>=0:kind==='positive'?x.lo>0:x.lo>0||x.hi<0))fail();}
  };
  const parts=(u:SurfaceJet,v:SurfaceJet):Parts=>{const interval=u.c[0] instanceof SurfaceInterval,zero=u.constant(0),
    total=(p:Parts)=>(p.dynamic??zero).add(interval?p.offsets.reduce<Scalar>(sa,new SurfaceInterval(0)):sumExact(p.offsets as number[])),
    dynamicAdd=(a:SurfaceJet|null,b:SurfaceJet|null)=>a===null?b:b===null?a:a.add(b),
    sum=(a:Scalar[])=>interval?a.reduce<Scalar>(sa,new SurfaceInterval(0)):sumExact(a as number[]),
    multiply=(a:Parts,b:Parts):Parts=>{const aSum=sum(a.offsets),bSum=sum(b.offsets),zero=(x:Scalar)=>typeof x==='number'?x===0:x.lo===0&&x.hi===0;
      if(a.dynamic===null&&zero(aSum)||b.dynamic===null&&zero(bSum))return {offsets:[interval?new SurfaceInterval(0):0],dynamic:null};
      let offsets=a.offsets.flatMap(x=>b.offsets.map(y=>sm(x,y))),dynamic:SurfaceJet|null=null;
      if(a.dynamic)dynamic=a.dynamic.mul(sum(b.offsets));if(b.dynamic)dynamic=dynamicAdd(dynamic,b.dynamic.mul(sum(a.offsets)));
      if(a.dynamic&&b.dynamic)dynamic=dynamicAdd(dynamic,a.dynamic.mul(b.dynamic));if(offsets.length>256)offsets=[sum(offsets)];return {offsets,dynamic};},
    visit=(n:Node):Parts=>{if(n.kind==='constant')return {offsets:[interval?new SurfaceInterval(n.transcendental?down(n.value):n.value,n.transcendental?up(n.value):n.value):n.value],dynamic:null};
      if(n.kind==='variable')return {offsets:[],dynamic:n.name==='u'?u:v};if(n.kind==='unary'){const p=visit(n.a);return n.minus?{offsets:p.offsets.map(sn),dynamic:p.dynamic?.neg()??null}:p;}
      if(n.kind==='call'){
        if(zeroRoots.has(n)){
          const obligations=zeroRoots.get(n)!;if(interval)checkIntervalDomains(obligations,u.c[0] as SurfaceInterval,v.c[0] as SurfaceInterval);
          else {
            // Exact point substitution is used only to reject undefined child
            // domains (e.g. cos(pi*u/2)=0 at u=1), never to prove an identity.
            const pointProof=makeSurfaceIdentity({u:u.c[0] as number,v:v.c[0] as number});
            for(const o of obligations)if(o.kind==='tan'&&pointProof.constant({kind:'call',name:'cos',a:o.node})?.n===0n)fail();
            assertCompensatedSurfaceDomains(obligations.filter(o=>o.kind!=='nonnegative'||!identity.nonnegative(o.node)),u.c[0] as number,v.c[0] as number,pointProof.constant);}
          return {offsets:[interval?new SurfaceInterval(0):0],dynamic:null};}
        const argument=visit(n.a);
        const x=total(argument);
        if(n.name==='sqrt'&&!interval){const a=x.c as number[],root=Math.sqrt(a[0]),yu=a[1]/(2*root),yv=a[2]/(2*root),pairs=[[a[3],2*yu*yu],[a[4],2*yu*yv],[a[5],2*yv*yv]];
          if(a[0]<=0||pairs.some(([x,y])=>x!==0&&y!==0&&Math.abs(x-y)<=1e-8*Math.max(Math.abs(x),Math.abs(y))))
            return {offsets:[],dynamic:new SurfaceJet(compensatedSurfaceJet(n,u.c[0] as number,v.c[0] as number))};}
        const dynamic=n.name==='sin'?x.sincos()[0]:n.name==='cos'?x.sincos()[1]:x[n.name as 'tan'|'atan'|'sqrt'|'exp'|'log']();return {offsets:[],dynamic};}
      const a=visit(n.a);if(n.op==='**'){const exponent=integer(n.b);if(exponent<0)return {offsets:[],dynamic:total(a).pow(exponent)};
        let r:Parts={offsets:[interval?new SurfaceInterval(1):1],dynamic:null};for(let i=0;i<exponent;i++)r=multiply(r,a);return r;}
      const b=visit(n.b);if(n.op==='+')return {offsets:[...a.offsets,...b.offsets],dynamic:dynamicAdd(a.dynamic,b.dynamic)};
      if(n.op==='-')return {offsets:[...a.offsets,...b.offsets.map(sn)],dynamic:dynamicAdd(a.dynamic,b.dynamic?.neg()??null)};
      if(n.op==='*')return multiply(a,b);if(b.dynamic===null){const denominator=sum(b.offsets);return {offsets:a.offsets.map(x=>sd(x,denominator)),dynamic:a.dynamic?.div(denominator)??null};}
      return {offsets:[],dynamic:total(a).div(total(b))};};
    const p=visit(tree);return {offsets:p.offsets,dynamic:p.dynamic??zero};};
  const evaluate=(u:Scalar,v:Scalar)=>{const a=SurfaceJet.variable(u,0),b=SurfaceJet.variable(v,1),p=parts(a,b),
    jet=p.dynamic!.add(u instanceof SurfaceInterval?p.offsets.reduce<Scalar>(sa,new SurfaceInterval(0)):sumExact(p.offsets as number[]));
    if(jet.c.some(x=>typeof x==='number'?!finite(x):!finite(x.lo)||!finite(x.hi)))fail();return jet;};
  return {evaluate,parts};
}

export function validateGenericSurfaceSystemQuery(raw:unknown):GenericSurfaceSystemQuery{
  if(!record(raw)||!keys(raw,Object.keys(SURFACE_SYSTEM_NATIVE_PRESET))||raw.family!=='surface-system-generic-native'||
    !Array.isArray(raw.surface)||raw.surface.length!==3)throw Error('需完整S(u,v)三式、两个独立域、密度和主曲率开关，不接受其它字段。');
  for(const x of raw.surface)compileSurfaceExpression(x);
  for(const axis of ['u','v']){const a=raw[axis+'Start'],b=raw[axis+'End'],n=raw[axis+'Segments'];
    if(!finite(a)||!finite(b)||a< -10||b>10||b-a<.01||b-a>12)throw Error('两个域均须在±10内、跨度0.01–12，不交换或剪裁。');
    if(!Number.isInteger(n)||n<8||n>64)throw Error('两个密度均须为8–64整数。');}
  if(typeof raw.principalAnalysis!=='boolean')throw Error('主曲率开关须为布尔值。');return {...raw,surface:[...raw.surface]} as GenericSurfaceSystemQuery;
}

export function makeGenericSurfaceSystemReference(input:unknown){
  const q=validateGenericSurfaceSystemQuery(input),expressions=q.surface.map(compileSurfaceExpression),
    originParts=expressions.map(e=>e.parts(SurfaceJet.variable(q.uStart,0),SurfaceJet.variable(q.vStart,1))),
    sourceOrigin=originParts.map(p=>sumExact(p.offsets as number[])+(p.dynamic!.c[0] as number)),
    first=[1,2].map(k=>originParts.map(p=>p.dynamic!.c[k] as number)),
    scale=Math.max(Math.hypot(...first[0])*(q.uEnd-q.uStart),Math.hypot(...first[1])*(q.vEnd-q.vStart));
  if(!finite(scale)||scale<=0||!sourceOrigin.every(finite))fail();
  const jets=(u:Scalar,v:Scalar)=>{const a=SurfaceJet.variable(u,0),b=SurfaceJet.variable(v,1);return expressions.map((e,i)=>{
    const p=e.parts(a,b),shift=u instanceof SurfaceInterval?0:sumExact([...(p.offsets as number[]),...(originParts[i].offsets as number[]).map(x=>-x)]);
    return p.dynamic!.sub(originParts[i].dynamic!.c[0]).add(shift).div(scale);});};
  const evaluate=(u:number,v:number)=>{const js=jets(u,v),coords=Array.from({length:6},(_,k)=>js.map(x=>x.c[k] as number)),
    sine=Math.hypot(...cross(unit(coords[1]),unit(coords[2])));
    if(sine<1e-4){const [point,su,sv,suu,suv,svv]=coords,p=compensatedSurfaceFrame(su,sv,suu,suv,svv,sine),
      [E,F,G]=p.EFG,[L,M,N]=p.LMN,rules:Rules={SurfaceTangentU:su,SurfaceTangentV:sv,SurfaceNormal:p.normal,
        FundamentalFormE:E,FundamentalFormF:F,FundamentalFormG:G,FundamentalFormL:L,FundamentalFormM:M,FundamentalFormN:N,
        GaussianCurvature:p.K,MeanCurvature:p.H,CurvatureMatrix:p.A};
      if(q.principalAnalysis)rules.PrincipalCurvatures=p.principalValues;
      return {point,su,sv,suu,suv,svv,rules,B:p.B,e1:p.e1,e2:p.e2,
        curvatureScale:Math.max(Math.hypot(...p.B.flat()),Number.MIN_VALUE),area:Math.hypot(...cross(su,sv))};}
    const
    [point,su,sv,suu,suv,svv]=coords,n=unit(cross(unit(su),unit(sv))),E=dot(su,su),F=dot(su,sv),G=dot(sv,sv),
    L=dot(suu,n),M=dot(suv,n),N=dot(svv,n),a=Math.hypot(...su),e1=unit(su),e2=cross(n,e1),b=dot(sv,e1),d=dot(sv,e2);
    if(!finite(d)||d<=0)fail();const r00=1/a,r01=-b/(a*d),r11=1/d,
      B00=L*r00*r00,B01=r00*(L*r01+M*r11),B11=L*r01*r01+2*M*r01*r11+N*r11*r11,
      B=[[B00,B01],[B01,B11]],A=[[(r00*B00+r01*B01)*a,(r00*B00+r01*B01)*b+(r00*B01+r01*B11)*d],
        [r11*B01*a,r11*B01*b+r11*B11*d]],H=(B00+B11)/2,K=B00*B11-B01*B01,
      curvatureScale=Math.max(Math.hypot(B00,B01,B01,B11),Number.MIN_VALUE),area=Math.hypot(...cross(su,sv)),
      rules:Rules={SurfaceTangentU:su,SurfaceTangentV:sv,SurfaceNormal:n,FundamentalFormE:E,FundamentalFormF:F,FundamentalFormG:G,
        FundamentalFormL:L,FundamentalFormM:M,FundamentalFormN:N,GaussianCurvature:K,MeanCurvature:H,CurvatureMatrix:A};
    if(q.principalAnalysis){const radius=Math.hypot((B00-B11)/2,B01);rules.PrincipalCurvatures=[H+radius,H-radius];}
    return {point,su,sv,suu,suv,svv,rules,B,e1,e2,curvatureScale,area};};
  const evaluateNormal=(u:number,v:number)=>{const js=jets(u,v),[point,su,sv]=[0,1,2].map(k=>js.map(x=>x.c[k] as number));
    if(![...point,...su,...sv].every(finite))fail();return {point,su,sv,normal:unit(cross(unit(su),unit(sv)))};};
  const intervalCell=(rect:number[],normalOnly=false,orientation=1)=>{const [a,b,c,d]=rect,js=jets(new SurfaceInterval(a,b),new SurfaceInterval(c,d)),
    su=js.map(x=>x.c[1] as SurfaceInterval),sv=js.map(x=>x.c[2] as SurfaceInterval),
    icross=(a:SurfaceInterval[],b:SurfaceInterval[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))],
    idot=(a:SurfaceInterval[],b:SurfaceInterval[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),new SurfaceInterval(0)),
    area=icross(su,sv),area2=area.reduce((s,x)=>s.add(x.square()),new SurfaceInterval(0));if(area2.lo<=0)throw Error('区间面积未证正');
    const n=area.map(x=>x.div(area2.sqrt()));
    if(normalOnly){const fields=[...su,...sv,...n.map(x=>x.mul(orientation))];
      for(const x of [...js.map(j=>j.c[0] as SurfaceInterval),...fields])if(!finite(x.lo)||!finite(x.hi))throw Error('区间法向非有限');
      return {area2,fields};}
    const E=idot(su,su),F=idot(su,sv),G=idot(sv,sv),
      [L,M,N]=[3,4,5].map(k=>idot(js.map(x=>x.c[k] as SurfaceInterval),n)),
      K=L.mul(N).sub(M.square()).div(area2),H=E.mul(N).sub(F.mul(M).mul(2)).add(G.mul(L)).div(area2.mul(2)),
      A=[G.mul(L).sub(F.mul(M)).div(area2),G.mul(M).sub(F.mul(N)).div(area2),E.mul(M).sub(F.mul(L)).div(area2),E.mul(N).sub(F.mul(M)).div(area2)],
      fields=[...su,...sv,...n,E,F,G,L,M,N,K,H,...A];
    for(const x of [...js.flatMap(j=>j.c) as SurfaceInterval[],...fields])if(!finite(x.lo)||!finite(x.hi))throw Error('区间规则非有限');
    return {area2,fields};};
  const originRoundingMagnitude=originParts.map(p=>sumExact((p.offsets as number[]).map(Math.abs))+Math.abs(p.dynamic!.c[0] as number));
  return {query:q,normalization:{sourceOrigin,scale},originRoundingMagnitude,evaluate,evaluateNormal,intervalCell};
}

const scaled=(r:Rules,scale:number)=>{const out:Record<string,unknown>={};for(const [key,value] of Object.entries(r)){
  const f=['SurfaceTangentU','SurfaceTangentV','FundamentalFormL','FundamentalFormM','FundamentalFormN'].includes(key)?scale:
    ['FundamentalFormE','FundamentalFormF','FundamentalFormG'].includes(key)?scale*scale:key==='GaussianCurvature'?1/(scale*scale):
      ['MeanCurvature','CurvatureMatrix','PrincipalCurvatures'].includes(key)?1/scale:1;
  const convert=(x:any):any=>Array.isArray(x)?x.map(convert):x*f;out[key]=convert(value);}return out as Rules;};

export function parseGenericSurfaceSystemResult(raw:unknown,requested:unknown):GenericSurfaceSystemResult{
  const q=validateGenericSurfaceSystemQuery(requested),k=makeGenericSurfaceSystemReference(q),order=SURFACE_BASIC_RULES.concat(q.principalAnalysis?SURFACE_PRINCIPAL_RULES:[]);
  if(!record(raw)||!keys(raw,['family','query','source','normalization','domain','sample','grid','diagnostics','certification'])||
    raw.family!=='origamica-generic-surface-system'||JSON.stringify(validateGenericSurfaceSystemQuery(raw.query))!==JSON.stringify(q))fail();
  const s=raw.source,n=raw.normalization,c=raw.certification,d=raw.diagnostics;
  if(!record(s)||!keys(s,['function','definitionCell','argumentOrder','ruleOrder','simplification','principalPairConvention','principalUmbilicIdentity',
    'symbolicWolframReproduced','interpolationReproduced'])||s.function!=='SurfaceSystem'||s.definitionCell!=='In[3777]'||
    JSON.stringify(s.argumentOrder)!=='["u","v"]'||JSON.stringify(s.ruleOrder)!==JSON.stringify(order)||s.simplification!=='None'||
    s.principalPairConvention!=='numeric-descending-value/modulo-synchronized-sign-and-permutation'||typeof s.principalUmbilicIdentity!=='boolean'||
    !q.principalAnalysis&&s.principalUmbilicIdentity||s.symbolicWolframReproduced!==false||s.interpolationReproduced!==false||
    !record(n)||!keys(n,['sourceOrigin','scale'])||!near(n.scale,k.normalization.scale,k.normalization.scale,2e-12)||
    !vector(n.sourceOrigin,3)||!n.sourceOrigin.every((x:number,i:number)=>near(x,k.normalization.sourceOrigin[i],k.originRoundingMagnitude[i],2e-15)))fail();
  const scale=k.normalization.scale;
  function checkRow(r:unknown,u:number,v:number){if(!record(r)||!keys(r,['u','v','sourcePoint','normalizedPoint','sourceSecondDerivatives','normalizedSecondDerivatives',
    'rules','normalizedRules','principalChoice','principalEigenResidual','principalWorldOrthogonalityResidual'])||!near(r.u,u,Math.max(Math.abs(q.uStart),Math.abs(q.uEnd)),2e-14)||
    !near(r.v,v,Math.max(Math.abs(q.vStart),Math.abs(q.vEnd)),2e-14))fail();const own=k.evaluate(u,v);
    if(!nearV(r.normalizedPoint,own.point,Math.max(Math.hypot(...own.point),Math.hypot(...own.su)*(q.uEnd-q.uStart),Math.hypot(...own.sv)*(q.vEnd-q.vStart)))||
      !vector(r.sourcePoint,3)||!r.sourcePoint.every((x:number,i:number)=>near(x,k.normalization.sourceOrigin[i]+own.point[i]*scale,
        Math.max(k.originRoundingMagnitude[i],Math.abs(own.point[i]*scale)),3e-15))||
      !matrix(r.normalizedSecondDerivatives,3,3)||!matrix(r.sourceSecondDerivatives,3,3))fail();
    [own.suu,own.suv,own.svv].forEach((row,i)=>{if(!nearV(r.normalizedSecondDerivatives[i],row)||!nearV(r.sourceSecondDerivatives[i],mul(row,scale)))fail();});
    for(const [rules,reference,factor] of [[r.normalizedRules,own.rules,1],[r.rules,scaled(own.rules,scale),scale]] as const){
      if(!record(rules)||!keys(rules,order))fail();const E=reference.FundamentalFormE,G=reference.FundamentalFormG,curv=own.curvatureScale/factor;
      for(const key of SURFACE_BASIC_RULES){const a=rules[key],b=reference[key as keyof Rules];
        if(['SurfaceTangentU','SurfaceTangentV','SurfaceNormal'].includes(key)){if(!nearV(a,b as number[],key==='SurfaceNormal'?1:Math.hypot(...b as number[])))fail();}
        else if(key==='CurvatureMatrix'){if(!matrix(a,2,2)||!matrix(b,2,2)||!a.every((row:number[],i:number)=>nearV(row,b[i],Math.max(Math.hypot(...b.flat()),curv))))fail();}
        else {const secondIndex=['FundamentalFormL','FundamentalFormM','FundamentalFormN'].indexOf(key),
          natural=secondIndex>=0?Math.hypot(...[own.suu,own.suv,own.svv][secondIndex])*factor:key==='FundamentalFormF'?Math.sqrt(E)*Math.sqrt(G):key==='GaussianCurvature'?curv*curv:
          key==='MeanCurvature'?curv:Math.abs(b as number);if(!near(a,b as number,natural))fail();}}
      if(q.principalAnalysis){if(!nearV(rules.PrincipalCurvatures,reference.PrincipalCurvatures!,curv)||!matrix(rules.PrincipalDirectionsUV,2,2)||
        !matrix(rules.PrincipalDirections,2,3))fail();for(let i=0;i<2;i++){const uv=rules.PrincipalDirectionsUV[i],dir=rules.PrincipalDirections[i],
          mapped=reference.SurfaceTangentU.map((x,j)=>x*uv[0]+reference.SurfaceTangentV[j]*uv[1]),world=unit(mapped),
          components=[dot(dir,own.e1),dot(dir,own.e2)],lambda=rules.PrincipalCurvatures[i]*factor,
          residual=own.B.map((row,j)=>dot(row,components)-lambda*components[j]);
          const uvResidual=reference.CurvatureMatrix.map((row,j)=>dot(row,uv)-rules.PrincipalCurvatures[i]*uv[j]),
            uvNatural=Math.max(Math.hypot(...reference.CurvatureMatrix.flat()),...rules.PrincipalCurvatures.map(Math.abs),Number.MIN_VALUE);
          if(!near(Math.hypot(...uv),1,1,2e-10)||!near(Math.hypot(...dir),1,1,2e-10)||!nearV(dir,world,1)||
            !near(dot(dir,reference.SurfaceNormal),0,1)||Math.hypot(...residual)>3e-8*own.curvatureScale||Math.hypot(...uvResidual)>3e-8*uvNatural)fail();}}
    }
    if(!finite(r.principalEigenResidual)||r.principalEigenResidual<0||r.principalEigenResidual>1e-9||
      !finite(r.principalWorldOrthogonalityResidual)||r.principalWorldOrthogonalityResidual<0||r.principalWorldOrthogonalityResidual>1e-9)fail();
    if(!q.principalAnalysis){if(r.principalChoice!==null||r.principalEigenResidual!==0||r.principalWorldOrthogonalityResidual!==0)fail();}
    else {const values=own.rules.PrincipalCurvatures!,gap=Math.abs(values[0]-values[1]),expected=s.principalUmbilicIdentity?'non-unique-identity':
        gap>128*Number.EPSILON*own.curvatureScale?'separated-numeric':'unresolved-numeric';
      if(r.principalChoice!==expected||s.principalUmbilicIdentity&&gap>512*Number.EPSILON*own.curvatureScale)fail();
      const ortho=Math.abs(dot(r.rules.PrincipalDirections[0],r.rules.PrincipalDirections[1]));if(!near(r.principalWorldOrthogonalityResidual,ortho,1,2e-12))fail();}
    return r as GenericSurfaceRow;
  }
  if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==25||
    !record(raw.grid)||!keys(raw.grid,['u','v','rows'])||!vector(raw.grid.u,q.uSegments+1)||!vector(raw.grid.v,q.vSegments+1)||
    !Array.isArray(raw.grid.rows)||raw.grid.rows.length!==q.uSegments+1)fail();
  const sample:GenericSurfaceRow[]=[];for(let i=0;i<5;i++)for(let j=0;j<5;j++)sample.push(checkRow(raw.sample.rows[i*5+j],
    q.uStart+(q.uEnd-q.uStart)*i/4,q.vStart+(q.vEnd-q.vStart)*j/4));
  for(let i=0;i<=q.uSegments;i++){const u=q.uStart+(q.uEnd-q.uStart)*i/q.uSegments;
    if(!near(raw.grid.u[i],u,Math.max(Math.abs(q.uStart),Math.abs(q.uEnd)),2e-14)||!Array.isArray(raw.grid.rows[i])||raw.grid.rows[i].length!==q.vSegments+1)fail();
    for(let j=0;j<=q.vSegments;j++){const v=q.vStart+(q.vEnd-q.vStart)*j/q.vSegments;
      if(!near(raw.grid.v[j],v,Math.max(Math.abs(q.vStart),Math.abs(q.vEnd)),2e-14))fail();checkRow(raw.grid.rows[i][j],u,v);}}
  checkDomain(raw.domain,q,k);
  const no=['principalDirectionsUniqueCertified','principalDirectionsContinuousCertified','globalSurfaceInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
  if(!record(c)||!keys(c,['mixedDerivativesEvaluated','allRequestedRulesEvaluated','finiteGridVerified','fullRectangleRegularityCertified',...no])||
    c.mixedDerivativesEvaluated!==true||c.allRequestedRulesEvaluated!==true||c.finiteGridVerified!==true||
    c.fullRectangleRegularityCertified!==raw.domain.certified||no.some(key=>c[key]!==false)||!record(d)||
    !keys(d,['validationNodes','maximumPrincipalEigenResidual','maximumPrincipalWorldOrthogonalityResidual'])||d.validationNodes!==25||
    !near(d.maximumPrincipalEigenResidual,Math.max(...sample.map(r=>r.principalEigenResidual)),1,2e-12)||
    !near(d.maximumPrincipalWorldOrthogonalityResidual,Math.max(...sample.map(r=>r.principalWorldOrthogonalityResidual)),1,2e-12))fail();
  return raw as GenericSurfaceSystemResult;
}

function checkDomain(raw:unknown,q:GenericSurfaceSystemQuery,k:ReturnType<typeof makeGenericSurfaceSystemReference>,normalOnly=false,orientation=1){
  if(!record(raw)||!keys(raw,['certified','evaluations','verifiedCells','cells','unresolved','minimumNormalizedAreaSquaredLowerBound','roundingModel','reason'])||
    typeof raw.certified!=='boolean'||!Number.isInteger(raw.evaluations)||raw.evaluations<1||raw.evaluations>1023||!Array.isArray(raw.cells)||
    !Array.isArray(raw.unresolved)||raw.verifiedCells!==raw.cells.length||raw.verifiedCells>raw.evaluations||
    raw.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||raw.certified!==(raw.unresolved.length===0)||
    (raw.certified?raw.reason!==null:typeof raw.reason!=='string'||raw.reason.length<4))fail();
  const rects:number[][]=[],bounds=(x:unknown)=>vector(x,2)&&x[0]<=x[1],
    nearBounds=(x:number[],y:SurfaceInterval)=>{const natural=Math.max(Math.abs(y.lo),Math.abs(y.hi),Number.MIN_VALUE);
      return near(x[0],y.lo,natural,1e-11)&&near(x[1],y.hi,natural,1e-11);};
  const addRect=(r:unknown)=>{if(!vector(r,4)||r[0]<q.uStart||r[1]>q.uEnd||r[2]<q.vStart||r[3]>q.vEnd||r[0]>=r[1]||r[2]>=r[3])fail();rects.push(r);};
  for(const cell of raw.cells){if(!record(cell)||!keys(cell,['rectangle','normalizedAreaSquaredBounds','normalizedBasicRuleBounds'])||
    !bounds(cell.normalizedAreaSquaredBounds)||cell.normalizedAreaSquaredBounds[0]<=0||!matrix(cell.normalizedBasicRuleBounds,normalOnly?9:21,2)||
    cell.normalizedBasicRuleBounds.some((x:number[])=>x[0]>x[1]))fail();addRect(cell.rectangle);const own=k.intervalCell(cell.rectangle,normalOnly,orientation);
    if(!nearBounds(cell.normalizedAreaSquaredBounds,own.area2)||!own.fields.every((x,i)=>nearBounds(cell.normalizedBasicRuleBounds[i],x)))fail();}
  for(const r of raw.unresolved)addRect(r);
  if(!rects.length||rects.length>1024)fail();let area=0;for(let i=0;i<rects.length;i++){const [a,b,c,d]=rects[i];area+=(b-a)*(d-c);
    for(let j=0;j<i;j++){const t=rects[j];if(Math.min(b,t[1])>Math.max(a,t[0])&&Math.min(d,t[3])>Math.max(c,t[2]))fail();}}
  if(!near(area,(q.uEnd-q.uStart)*(q.vEnd-q.vStart),(q.uEnd-q.uStart)*(q.vEnd-q.vStart),3e-12))fail();
  const minimum=raw.cells.length?Math.min(...raw.cells.map((c:Cell)=>c.normalizedAreaSquaredBounds[0])):null;
  if(minimum===null?raw.minimumNormalizedAreaSquaredLowerBound!==null:!near(raw.minimumNormalizedAreaSquaredLowerBound,minimum,minimum,2e-14))fail();
}

export async function fetchGenericSurfaceSystemWhenIdle(query:GenericSurfaceSystemQuery,signal?:AbortSignal){
  const q=validateGenericSurfaceSystemQuery(query);for(let attempt=0;;attempt++){signal?.throwIfAborted();try{return parseGenericSurfaceSystemResult(await api('tessellation/curved-surface-system-generic',q,signal),q);}
    catch(error){if(signal?.aborted)throw error;if(attempt>=240||!(error instanceof Error)||!/busy|繁忙|429|正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试/.test(error.message))throw error;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(id);reject(new DOMException('Aborted','AbortError'));},id=setTimeout(()=>{
        signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}

const normalAsSystem=(q:GenericSurfaceNormalQuery):GenericSurfaceSystemQuery=>{
  const {surfaceOrientation:_orientation,family:_family,...rest}=q;
  return {...rest,family:'surface-system-generic-native',principalAnalysis:false};
};
export function validateGenericSurfaceNormalQuery(raw:unknown):GenericSurfaceNormalQuery{
  if(!record(raw)||!keys(raw,Object.keys(SURFACE_NORMAL_NATIVE_PRESET))||raw.family!=='surface-normal-generic-native'||
    raw.surfaceOrientation!==1&&raw.surfaceOrientation!==-1)throw Error('独立曲面法向须为完整S(u,v)、两个域、密度和±1方向，不接受主曲率或其它字段。');
  const q=validateGenericSurfaceSystemQuery(normalAsSystem(raw as GenericSurfaceNormalQuery));
  const {principalAnalysis:_principal,family:_family,...rest}=q;
  return {...rest,family:'surface-normal-generic-native',surfaceOrientation:raw.surfaceOrientation};
}
export function parseGenericSurfaceNormalResult(raw:unknown,requested:unknown):GenericSurfaceNormalResult{
  const q=validateGenericSurfaceNormalQuery(requested),system=normalAsSystem(q),k=makeGenericSurfaceSystemReference(system);
  if(!record(raw)||!keys(raw,['family','query','source','normalization','domain','sample','grid','certification'])||
    raw.family!=='origamica-generic-surface-normal'||JSON.stringify(validateGenericSurfaceNormalQuery(raw.query))!==JSON.stringify(q))fail();
  const s=raw.source,n=raw.normalization,c=raw.certification;
  if(!record(s)||!keys(s,['function','definitionCell','argumentOrder','originalOrientationOption','simplification',
    'symbolicWolframReproduced','interpolationReproduced','numericalWrapperFunction','numericalWrapperDefinitionCell','numericalWrapperInterpolationReproduced'])||
    s.function!=='SurfaceNormalFromSurface'||s.definitionCell!=='In[3746]'||JSON.stringify(s.argumentOrder)!=='["u","v"]'||
    s.originalOrientationOption!=='SurfaceOrientation'||s.simplification!=='None'||s.symbolicWolframReproduced!==false||
    s.interpolationReproduced!==false||s.numericalWrapperFunction!=='NSurfaceNormalFromSurface'||s.numericalWrapperDefinitionCell!=='In[3750]'||
    s.numericalWrapperInterpolationReproduced!==false||!record(n)||!keys(n,['sourceOrigin','scale'])||
    !near(n.scale,k.normalization.scale,k.normalization.scale,2e-12)||!vector(n.sourceOrigin,3)||
    !n.sourceOrigin.every((x:number,i:number)=>near(x,k.normalization.sourceOrigin[i],k.originRoundingMagnitude[i],2e-15)))fail();
  function checkRow(raw:unknown,u:number,v:number){
    if(!record(raw)||!keys(raw,['u','v','sourcePoint','normalizedPoint','sourceTangents','normalizedTangents','normal'])||
      !near(raw.u,u,Math.max(Math.abs(q.uStart),Math.abs(q.uEnd)),2e-14)||
      !near(raw.v,v,Math.max(Math.abs(q.vStart),Math.abs(q.vEnd)),2e-14))fail();
    const own=k.evaluateNormal(u,v),scale=k.normalization.scale;
    if(!nearV(raw.normalizedPoint,own.point,Math.max(Math.hypot(...own.point),Math.hypot(...own.su)*(q.uEnd-q.uStart),Math.hypot(...own.sv)*(q.vEnd-q.vStart)))||
      !vector(raw.sourcePoint,3)||!raw.sourcePoint.every((x:number,i:number)=>near(x,k.normalization.sourceOrigin[i]+own.point[i]*scale,
        Math.max(k.originRoundingMagnitude[i],Math.abs(own.point[i]*scale)),3e-15))||
      !matrix(raw.normalizedTangents,2,3)||!matrix(raw.sourceTangents,2,3)||
      !nearV(raw.normalizedTangents[0],own.su)||!nearV(raw.normalizedTangents[1],own.sv)||
      !nearV(raw.sourceTangents[0],mul(own.su,scale))||!nearV(raw.sourceTangents[1],mul(own.sv,scale))||
      !nearV(raw.normal,mul(own.normal,q.surfaceOrientation),1))fail();
  }
  if(!record(raw.sample)||!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==25||
    !record(raw.grid)||!keys(raw.grid,['u','v','rows'])||!vector(raw.grid.u,q.uSegments+1)||!vector(raw.grid.v,q.vSegments+1)||
    !Array.isArray(raw.grid.rows)||raw.grid.rows.length!==q.uSegments+1)fail();
  for(let i=0;i<5;i++)for(let j=0;j<5;j++)checkRow(raw.sample.rows[i*5+j],q.uStart+(q.uEnd-q.uStart)*i/4,q.vStart+(q.vEnd-q.vStart)*j/4);
  for(let i=0;i<=q.uSegments;i++){const u=q.uStart+(q.uEnd-q.uStart)*i/q.uSegments;
    if(!near(raw.grid.u[i],u,Math.max(Math.abs(q.uStart),Math.abs(q.uEnd)),2e-14)||!Array.isArray(raw.grid.rows[i])||raw.grid.rows[i].length!==q.vSegments+1)fail();
    for(let j=0;j<=q.vSegments;j++){const v=q.vStart+(q.vEnd-q.vStart)*j/q.vSegments;
      if(!near(raw.grid.v[j],v,Math.max(Math.abs(q.vStart),Math.abs(q.vEnd)),2e-14))fail();checkRow(raw.grid.rows[i][j],u,v);}}
  checkDomain(raw.domain,system,k,true,q.surfaceOrientation);
  const no=['globalSurfaceInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
  if(!record(c)||!keys(c,['finiteGridVerified','fullRectangleRegularityCertified',...no])||c.finiteGridVerified!==true||
    c.fullRectangleRegularityCertified!==raw.domain.certified||no.some(key=>c[key]!==false))fail();
  return raw as GenericSurfaceNormalResult;
}
export async function fetchGenericSurfaceNormalWhenIdle(query:GenericSurfaceNormalQuery,signal?:AbortSignal){
  const q=validateGenericSurfaceNormalQuery(query);for(let attempt=0;;attempt++){signal?.throwIfAborted();try{return parseGenericSurfaceNormalResult(await api('tessellation/curved-surface-normal-generic',q,signal),q);}
    catch(error){if(signal?.aborted)throw error;if(attempt>=240||!(error instanceof Error)||!/busy|繁忙|429|正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试/.test(error.message))throw error;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(id);reject(new DOMException('Aborted','AbortError'));},id=setTimeout(()=>{
        signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
