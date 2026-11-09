import {api} from './api';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';
import {matchesInitialFrameCompatibility,type InitialFrameCompatibility,type GenericDarbouxRow,type GenericDarbouxResult} from './curvedNativeGenericDarboux';

export type GenericRibbonQuery={family:'ribbon-generic-native';spaceCurve:[string,string,string];normalAngle:string;sigma:1|-1;
  parameterStart:number;parameterEnd:number;transverseStart:number;transverseEnd:number;segments:number;rulingSegments:number;
  initialParameter:number;initialPoint:[number,number];initialTangent:[number,number]};
export const GENERIC_RIBBON_PRESET:GenericRibbonQuery={family:'ribbon-generic-native',spaceCurve:['sin(s)','s**2/4','1-cos(s)'],
  normalAngle:'atan(sqrt(4+s**2))',sigma:1,parameterStart:0,parameterEnd:1,transverseStart:-.15,transverseEnd:.15,
  segments:32,rulingSegments:16,initialParameter:0,initialPoint:[0,0],initialTangent:[1,0]};
type RibbonRow=Omit<GenericDarbouxRow,'coefficients'|'targetNormal'>&{normalAngleRad:number;normalAngleDerivative:number;
  sourceTangent:number[];sourceNormal:number[];sourceBinormal:number[];sourceLeftNormal:number[];sourceSurfaceNormal:number[];
  coefficients:{speed:number;normalizedSpeed:number;curvature:number;normalizedCurvature:number;torsion:number;normalizedTorsion:number;
    g:number;p:number;q:number;pPrime:number;qPrime:number;normalizedP:number;normalizedQ:number;normalizedPPrime:number;normalizedQPrime:number;
    normalDerivativeLength:number;normalTangentProjection:number;normalLeftProjection:number}};
type Strip=GenericDarbouxResult['domain']['formalStripRegularity'];
export type GenericRibbonResult={family:'origamica-generic-ribbon-pair';query:GenericRibbonQuery;
  source:{functions:string[];definitionCells:string[];method:string;initialArgumentOrder:string[];rulingConstruction:string;
    interpolationReproduced:false;symbolicSolverReproduced:false;wolframOptionsReproduced:false;metricConvention:string};
  normalization:{sourceOrigin:number[];targetOrigin:number[];scale:number};
  initial:{parameter:number;point:number[];tangent:number[];leftNormal:number[]}&InitialFrameCompatibility;
  diagnostics:{validationNodes:number;maximumFrameResidual:number;maximumUnitRulingResidual:number;maximumRelativeMetricDifference:number;
    maximumRelativeDevelopabilityResidual:number;metricTolerance:number;developabilityTolerance:number;
    integration:GenericDarbouxResult['diagnostics']['integration']};
  certification:{finiteMetricVerified:boolean;finiteDevelopabilityVerified:boolean;finiteUnitRulingsVerified:boolean;
    sourceRegularityCertified:boolean;sourceUnitRulingsAnalytic:boolean;sourceDevelopabilityAnalytic:boolean;initialFrameCompatible:boolean;
    formalIsometryCertified:boolean;sourceStripRegularityCertified:boolean;formalStripRegularityCertified:boolean;
    integrationErrorIntervalCertified:false;globalInjectivityChecked:false;selfCollisionChecked:false;exactStraightCreaseFOLD:false;adoptableCreasePattern:false};
  domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;speedLowerBound:number;curvatureLowerBound:number;
    normalDerivativeLowerBound:number;signProjectionLowerBound:number;sign:1|-1;sourceNormalizedJacobianBounds:number[];formalNormalizedJacobianBounds:number[]}[];
    unresolved:number[][];minimumSpeedLowerBound:number|null;minimumCurvatureLowerBound:number|null;minimumNormalDerivativeLowerBound:number|null;
    minimumSignProjectionLowerBound:number|null;roundingModel:string;reason:string|null;sourceStripRegularity:Strip;formalStripRegularity:Strip};
  sample:{rows:RibbonRow[]};grid:GenericDarbouxResult['grid']};

const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a:number[],w:number)=>a.map(x=>x*w),
  add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const td=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0));
const tc=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const tm=(a:GenericTaylor[],x:number|GenericTaylor)=>a.map(v=>v.mul(x)),tv=(a:GenericTaylor[])=>a.map(x=>x.c[0]),tp=(a:GenericTaylor[])=>a.map(x=>x.c[1]);
const sumExact=(numbers:number[])=>{const parts:number[]=[];for(let x of numbers){let i=0;for(let y of parts){
  if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;}parts.length=i;parts.push(x);}
  return parts.reduceRight((s,x)=>s+x,0);};
function fail():never{throw Error('原四源Ribbon的Frenet/η、Sign/Abs母线、初值、轨迹或度量回读不一致。');}

/** Bounded independent exact-rational/structural proof; original eta is still evaluated at every source point. */
function constantAngleIdentity(source:string){
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
export function validateGenericRibbonQuery(raw:unknown):GenericRibbonQuery{
  if(!record(raw)||!keys(raw,Object.keys(GENERIC_RIBBON_PRESET))||raw.family!=='ribbon-generic-native')throw Error('通用Ribbon的字段或类型无效。');
  if(!Array.isArray(raw.spaceCurve)||raw.spaceCurve.length!==3)throw Error('原空间基线cc须有三个完整源表达式。');
  for(const expression of [...raw.spaceCurve,raw.normalAngle])compileGenericExpression(expression,'s');
  if(raw.sigma!==1&&raw.sigma!==-1)throw Error('原σ须为固定整数−1或+1。');
  if(!finite(raw.parameterStart)||!finite(raw.parameterEnd)||raw.parameterStart< -10||raw.parameterEnd>10||
    raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('参数域须在−10…10内，跨度0.01–12。');
  if(!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1e6||raw.transverseEnd>1e6||
    raw.transverseStart>=raw.transverseEnd)throw Error('母线横向域须为±10⁶内递增有限数。');
  if(!finite(raw.initialParameter)||raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd)throw Error('原ui须在完整闭参数域内。');
  if(!Number.isInteger(raw.segments)||raw.segments<8||raw.segments>128||!Number.isInteger(raw.rulingSegments)||
    raw.rulingSegments<2||raw.rulingSegments>64)throw Error('显示密度须为8–128纵向段、2–64横向段。');
  if(!vector(raw.initialPoint,2)||raw.initialPoint.some(x=>Math.abs(x)>1e12)||!vector(raw.initialTangent,2)||
    raw.initialTangent.some(x=>Math.abs(x)>1e12))throw Error('原二维ci、ti须为±10¹²内有限坐标，含零初始切向；原值不自动归一化。');
  return {...raw,spaceCurve:raw.spaceCurve.slice(),initialPoint:raw.initialPoint.slice(),initialTangent:raw.initialTangent.slice()} as GenericRibbonQuery;
}

/** Literal eta/Frenet four-source Ribbon jets, independent of the returned points and derivative fields. */
export function makeGenericRibbonSource(input:unknown){
  const q=validateGenericRibbonQuery(input),curves=q.spaceCurve.map(x=>compileGenericExpression(x,'s')),
    angle=compileGenericExpression(q.normalAngle,'s'),variable=(s:number)=>new GenericTaylor([s,1,0,0,0]),
    anchor=curves.map(f=>f.parts(variable(q.initialParameter))),sourceOrigin=anchor.map(p=>sumExact([...p.offsets,p.dynamic.c[0]])),
    scale=Math.max(...Array.from({length:9},(_,i)=>Math.hypot(...curves.map(f=>f.parts(variable(
      q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8)).dynamic.c[1]))))*(q.parameterEnd-q.parameterStart),
    etaInitial=angle(variable(q.initialParameter)).c[0],zeroRuling=etaInitial===Math.PI*Math.round(etaInitial/Math.PI)&&constantAngleIdentity(q.normalAngle);
  if(!(scale>0)||!finite(scale))fail();
  const evaluate=(s:number)=>{const arg=variable(s),b=curves.map((f,i)=>{const p=f.parts(arg);return new GenericTaylor(p.dynamic.c.map((x,k)=>
    k?x/scale:sumExact([...p.offsets,...anchor[i].offsets.map(v=>-v),x,-anchor[i].dynamic.c[0]])/scale));}),
    bp=b.map(x=>x.derivative()),v=td(bp,bp).sqrt(),t=tm(bp,v.inv()),tPrime=t.map(x=>x.derivative()),
    turn=td(tPrime,tPrime).sqrt(),normal=tm(tPrime,turn.inv()),binormal=tc(t,normal),
    curvature=turn.div(v),torsion=td(normal,binormal.map(x=>x.derivative())).neg().div(v),eta=angle(arg);
    if(!zeroRuling&&eta.c[0]===Math.PI*Math.round(eta.c[0]/Math.PI))
      throw Error('原变η零点的Sign/Abs母线零值可算，但其一阶导数一般不定义；当前一阶Ribbon合同不能在跳支点继续。');
    const [sin,cos]=zeroRuling?[arg.constant(0),arg.constant((-1)**Math.round(etaInitial/Math.PI))]:eta.sincos(),l=normal.map((x,i)=>x.mul(cos).sub(binormal[i].mul(sin))),
      u=normal.map((x,i)=>x.mul(sin).add(binormal[i].mul(cos))),uPrime=u.map(x=>x.derivative()),
      length=td(uPrime,uPrime).sqrt(),A=zeroRuling?length.mul(0):td(uPrime,t),beta=td(uPrime,l),sign=Math.sign(A.c[0]);
    if(!sign&&!zeroRuling)throw Error('原U′·T=0使Sign/Abs母线零值可算，但该变η点的原母线一阶导数一般不定义。');
    const p=zeroRuling?length.mul(0):beta.mul(-sign).div(length).div(scale),qr=zeroRuling?length.mul(0):A.mul(sign).div(length).div(scale),
      director=tm(t.map((x,i)=>x.mul(p).add(l[i].mul(qr))),q.sigma),g=td(l,tPrime);
    return {s,base:tv(b),basePrime:tv(bp),speed:v.c[0],tangent:tv(t),normal:tv(normal),binormal:tv(binormal),leftNormal:tv(l),surfaceNormal:tv(u),
      curvature:curvature.c[0],torsion:torsion.c[0],angle:eta.c[0],anglePrime:eta.c[1],director:tv(director),directorPrime:tp(director),
      p:p.c[0],q:qr.c[0],pPrime:p.c[1],qPrime:qr.c[1],g:g.c[0],normalDerivativeLength:length.c[0],
      normalTangentProjection:A.c[0],normalLeftProjection:beta.c[0],sign};
  };
  return {query:q,normalization:{sourceOrigin,targetOrigin:q.initialPoint.slice(),scale},zeroRuling,evaluate};
}

/** Separate DP54 replay, bilateral about the raw original ui/ci/ti; no implicit frame normalization. */
export function makeGenericRibbonReference(input:unknown,nodes:number[]){
  const evaluator=makeGenericRibbonSource(input),q=evaluator.query,cache=new Map<number,ReturnType<typeof evaluator.evaluate>>(),
    source=(s:number)=>{let r=cache.get(s);if(!r){r=evaluator.evaluate(s);cache.set(s,r);}return r;},
    initial=[0,0,...q.initialTangent,-q.initialTangent[1],q.initialTangent[0]],
    results=new Map<number,number[]>([[q.initialParameter,initial.slice()]]),
    derivative=(s:number,y:number[])=>{const r=source(s),t=y.slice(2,4),l=y.slice(4,6);
      return [...mul(t,r.speed),...mul(l,r.g),...mul(t,-r.g)];},
    c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],
      [19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],
      [35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
  let budget=0;
  const walk=(ordered:number[])=>{let s=q.initialParameter,y=initial.slice(),h=(q.parameterEnd-q.parameterStart)/32;
    for(const end of ordered){const direction=Math.sign(end-s);if(!direction){results.set(end,y.slice());continue;}h=Math.abs(h)*direction;
      while(direction*(end-s)>0){if(++budget>16384)throw Error('独立Ribbon展开回读超过有限计算预算。');
        if(direction*(s+h-end)>0)h=end-s;if(s+h===s)fail();const stages:number[][]=[];
        for(let k=0;k<7;k++){const trial=y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0));
          stages.push(derivative(k===6?s+h:s+c[k]*h,trial));}
        const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),
          error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-12+5e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
        if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=direction*(s+h-end)>=0?end:s+h;y=high;}
        h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));
      }results.set(end,y.slice());
    }
  };
  const sorted=[...new Set(nodes)].sort((a,b)=>a-b);if(sorted.some(s=>!finite(s)||s<q.parameterStart||s>q.parameterEnd))fail();
  walk(sorted.filter(s=>s<q.initialParameter).reverse());walk(sorted.filter(s=>s>=q.initialParameter));
  const target=(s:number)=>{const y=results.get(s);if(!y)fail();const r=source(s),t=y.slice(2,4),l=y.slice(4,6);
    return {base:y.slice(0,2),basePrime:mul(t,r.speed),tangent:t,leftNormal:l,
      director:mul(add(mul(t,r.p),mul(l,r.q)),q.sigma),
      directorPrime:mul(add(mul(t,r.pPrime-r.q*r.g),mul(l,r.qPrime+r.p*r.g)),q.sigma)};};
  return {...evaluator,source,target};
}

const close=(x:unknown,y:number,tol=2e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(1,Math.abs(x),Math.abs(y));
const nearVector=(x:unknown,y:number[],reference=1)=>vector(x,y.length)&&y.every((v,i)=>
  Math.abs(x[i]-v)<=2e-8*Math.max(reference,Math.hypot(...y),Number.MIN_VALUE));
const metric=(bp:number[],d:number[],dp:number[],w:number)=>{const v=add(bp,dp,w);return [dot(v,v),dot(v,d),dot(d,d)];};
const metricDifference=(a:number[],b:number[])=>{const E=Math.max(Math.abs(a[0]),Math.abs(b[0])),G=Math.max(Math.abs(a[2]),Math.abs(b[2]));
  return Math.max(...a.map((x,i)=>Math.abs(x-b[i])/Math.max([E,Math.sqrt(E)*Math.sqrt(G),G][i],Number.MIN_VALUE)));};
const noCertificates=['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'];
const rowKeys=['s','normalAngleRad','normalAngleDerivative','sourceBase','sourceDirector','sourceBaseDerivative','sourceDirectorDerivative',
  'targetBase','targetDirector','targetBaseDerivative','targetDirectorDerivative','normalizedSourceBase','normalizedSourceDirector',
  'normalizedSourceBaseDerivative','normalizedSourceDirectorDerivative','normalizedTargetBase','normalizedTargetDirector',
  'normalizedTargetBaseDerivative','normalizedTargetDirectorDerivative','sourceTangent','sourceNormal','sourceBinormal',
  'sourceLeftNormal','sourceSurfaceNormal','targetTangent','targetLeftNormal','coefficients'];
const gridKeys=['s','source','target','normalizedSource','normalizedTarget','sourceEFG','targetEFG'];
const localLowers=['speedLowerBound','curvatureLowerBound','normalDerivativeLowerBound','signProjectionLowerBound'];
const globalLowers=localLowers.map(k=>'minimum'+k[0].toUpperCase()+k.slice(1));
const cellKeys=['start','end',...localLowers,'sign','sourceNormalizedJacobianBounds','formalNormalizedJacobianBounds'];
const coefficientKeys=['speed','normalizedSpeed','curvature','normalizedCurvature','torsion','normalizedTorsion','g','p','q','pPrime','qPrime',
  'normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','normalDerivativeLength','normalTangentProjection','normalLeftProjection'];

export function parseGenericRibbonResult(raw:unknown,requested?:unknown):GenericRibbonResult{
  if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','diagnostics','certification','domain','sample','grid'])||
    raw.family!=='origamica-generic-ribbon-pair')fail();const q=validateGenericRibbonQuery(raw.query);
  if(requested){const wanted=validateGenericRibbonQuery(requested);if(Object.keys(q).some(k=>
    JSON.stringify(q[k as keyof typeof q])!==JSON.stringify(wanted[k as keyof typeof wanted])))fail();}
  const parameters=Array.from({length:q.segments+1},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/q.segments),
    validation=Array.from({length:129},(_,i)=>q.parameterStart+(q.parameterEnd-q.parameterStart)*i/128),
    cellMidpoints=record(raw.domain)&&Array.isArray(raw.domain.cells)?raw.domain.cells.map((cell:unknown)=>{
      if(!record(cell)||!finite(cell.start)||!finite(cell.end)||cell.start<q.parameterStart||cell.end>q.parameterEnd||cell.start>=cell.end)fail();
      return (cell.start+cell.end)/2;}):[],
    ref=makeGenericRibbonReference(q,[...parameters,...validation,...cellMidpoints,q.initialParameter]),norm=ref.normalization,L=norm.scale,
    world=(x:unknown,y:number[],origin:number[]|null,reference=1)=>vector(x,y.length)&&y.every((v,i)=>{
      const expected=(origin?.[i]??0)+L*v;return Math.abs(x[i]-expected)<=Math.max(2e-8*L*reference,4*Number.EPSILON*Math.abs(expected));});
  if(!record(raw.normalization)||!keys(raw.normalization,['sourceOrigin','targetOrigin','scale'])||!close(raw.normalization.scale/L,1,2e-12)||
    !world(raw.normalization.sourceOrigin,[0,0,0],norm.sourceOrigin)||!world(raw.normalization.targetOrigin,[0,0],norm.targetOrigin))fail();
  const source=raw.source;
  if(!record(source)||!keys(source,['functions','definitionCells','method','initialArgumentOrder','rulingConstruction',
    'interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced','metricConvention'])||
    JSON.stringify(source.functions)!=='["RibbonPair","NRibbonPair"]'||JSON.stringify(source.definitionCells)!=='["In[3854]","In[3858]"]'||
    source.method!=='whitelist-AST/fourth-order-Frenet/original-eta-sign-abs-ruling/bilateral-DOP853'||
    JSON.stringify(source.initialArgumentOrder)!=='["ui","ci","ti"]'||
    source.rulingConstruction!=='L=cos(eta)N-sin(eta)B;U=sin(eta)N+cos(eta)B;cRho=-Sign(Uprime dot T)*(Uprime dot L)/norm(Uprime);sRho=Abs(Uprime dot T)/norm(Uprime);D=sigma*(cRho*T+sRho*L), no extra Normalize'||
    source.metricConvention!=='normalized-s/world-w'||['interpolationReproduced','symbolicSolverReproduced','wolframOptionsReproduced'].some(k=>source[k]!==false))fail();
  const left=[-q.initialTangent[1],q.initialTangent[0]],initial=raw.initial;
  if(!record(initial)||!keys(initial,['parameter','point','tangent','leftNormal','frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||
    initial.parameter!==q.initialParameter||!nearVector(initial.point,q.initialPoint)||!nearVector(initial.tangent,q.initialTangent)||
    !nearVector(initial.leftNormal,left)||!matchesInitialFrameCompatibility(initial,[q.initialTangent,left])||!record(raw.sample)||
    !keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==parameters.length||!Array.isArray(raw.grid)||raw.grid.length!==parameters.length)fail();
  const d=raw.diagnostics,c=raw.certification,domain=raw.domain,maxima=['maximumFrameResidual','maximumUnitRulingResidual','maximumRelativeMetricDifference','maximumRelativeDevelopabilityResidual'];
  if(!record(d)||!keys(d,['validationNodes',...maxima,'metricTolerance','developabilityTolerance','integration'])||d.validationNodes!==129||
    d.metricTolerance!==2e-8||d.developabilityTolerance!==2e-9||maxima.some(k=>!finite(d[k])||d[k]<0))fail();
  const integration=d.integration;
  if(!record(integration)||!keys(integration,['method','relativeTolerance','absoluteTolerance','initialParameter','backwardEvaluations','forwardEvaluations','integrationErrorIntervalCertified'])||
    integration.method!=='DOP853'||integration.relativeTolerance!==2e-12||integration.absoluteTolerance!==2e-14||integration.initialParameter!==q.initialParameter||
    ['backwardEvaluations','forwardEvaluations'].some(k=>!Number.isInteger(integration[k])||integration[k]<0)||integration.integrationErrorIntervalCertified!==false)fail();
  const certKeys=['finiteMetricVerified','finiteDevelopabilityVerified','finiteUnitRulingsVerified','sourceRegularityCertified','sourceUnitRulingsAnalytic',
    'sourceDevelopabilityAnalytic','initialFrameCompatible','formalIsometryCertified','sourceStripRegularityCertified','formalStripRegularityCertified',...noCertificates];
  if(!record(c)||!keys(c,certKeys)||Object.values(c).some(v=>typeof v!=='boolean')||noCertificates.some(k=>c[k]!==false))fail();
  if(!record(domain)||!keys(domain,['certified','evaluations','verifiedCells','cells','unresolved',...globalLowers,'roundingModel','reason',
    'sourceStripRegularity','formalStripRegularity'])||typeof domain.certified!=='boolean'||!Number.isInteger(domain.evaluations)||
    domain.evaluations<1||domain.evaluations>1024||!Array.isArray(domain.cells)||!Array.isArray(domain.unresolved)||
    domain.verifiedCells!==domain.cells.length||domain.roundingModel!=='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'||
    (domain.reason!==null&&typeof domain.reason!=='string')||domain.certified&&domain.reason!==null)fail();
  const intervals:number[][]=[];
  for(const cell of domain.cells){if(!record(cell)||!keys(cell,cellKeys)||!finite(cell.start)||!finite(cell.end)||cell.start>=cell.end||
    localLowers.some(k=>!finite(cell[k])||cell[k]<=0)||![-1,1].includes(cell.sign)||
    ['sourceNormalizedJacobianBounds','formalNormalizedJacobianBounds'].some(k=>!vector(cell[k],2)||cell[k][0]>cell[k][1]))fail();intervals.push([cell.start,cell.end]);}
  for(const pair of domain.unresolved){if(!vector(pair,2)||pair[0]>=pair[1])fail();intervals.push(pair);}
  intervals.sort((a,b)=>a[0]-b[0]);if(!intervals.length||!close(intervals[0][0],q.parameterStart,1e-12)||!close(intervals.at(-1)![1],q.parameterEnd,1e-12)||
    intervals.some((x,i)=>i>0&&!close(intervals[i-1][1],x[0],1e-12))||domain.certified!==(domain.unresolved.length===0)||intervals.length>domain.evaluations)fail();
  for(let i=0;i<localLowers.length;i++){const global=globalLowers[i],local=localLowers[i];
    if(domain.certified){const lower=Math.min(...domain.cells.map((x:Record<string,number>)=>x[local]));
      if(!finite(domain[global])||domain[global]<=0||Math.abs(domain[global]-lower)>2e-12*lower)fail();}else if(domain[global]!==null)fail();}
  for(const stage of ['source','formal']){const strip=domain[stage+'StripRegularity'];
    if(!record(strip)||!keys(strip,['status','orientation','minimumAbsoluteJacobianLowerBound','reason'])||
      !['verified','unknown','degenerate'].includes(strip.status)||strip.reason!==null&&typeof strip.reason!=='string'||
      stage==='formal'&&!initial.frameCompatible&&strip.status!=='unknown')fail();
    if(strip.status==='verified'){const bound=stage+'NormalizedJacobianBounds';
      if(!domain.certified||![-1,1].includes(strip.orientation)||!finite(strip.minimumAbsoluteJacobianLowerBound)||strip.minimumAbsoluteJacobianLowerBound<=0||
        strip.reason!==null||domain.cells.some((cell:Record<string,any>)=>strip.orientation===1?cell[bound][0]<=0:cell[bound][1]>=0))fail();
      const expected=Math.min(...domain.cells.map((cell:Record<string,any>)=>strip.orientation===1?cell[bound][0]:-cell[bound][1]));
      if(Math.abs(strip.minimumAbsoluteJacobianLowerBound-expected)>2e-12*expected)fail();
    }else if(strip.orientation!==null||strip.minimumAbsoluteJacobianLowerBound!==null||typeof strip.reason!=='string')fail();
  }
  let maxFrame=0,maxUnit=0,maxMetric=0,maxDev=0;const witness={source:false,formal:false};
  const inspect=(s:number)=>{const r=ref.source(s),t=ref.target(s);
    for(const basis of [[r.tangent,r.normal,r.binormal],[t.tangent,t.leftNormal]])for(let i=0;i<basis.length;i++)for(let j=0;j<basis.length;j++)
      maxFrame=Math.max(maxFrame,Math.abs(dot(basis[i],basis[j])-(i===j?1:0)));
    const cell=domain.cells.filter((cell:Record<string,any>)=>cell.start-1e-12<=s&&s<=cell.end+1e-12),values=[r.speed,r.curvature,r.normalDerivativeLength,Math.abs(r.normalTangentProjection)];
    for(const item of cell){for(let i=0;i<localLowers.length;i++)if(values[i]<item[localLowers[i]]-2e-8*Math.max(values[i],item[localLowers[i]]))fail();if(item.sign!==r.sign)fail();}
    const dn=Math.hypot(...r.director),dev=Math.abs(dot(r.surfaceNormal,r.directorPrime))/Math.max(dn,Math.hypot(...r.directorPrime),Number.MIN_VALUE);
    maxUnit=Math.max(maxUnit,Math.abs(dn*L-1),Math.abs(Math.hypot(...t.director)*L-1));maxDev=Math.max(maxDev,dev);
    const jacobians=(w:number)=>({source:dot(cross(add(r.basePrime,r.directorPrime,w),r.director),r.surfaceNormal),
      formal:q.sigma*r.speed*r.q+w*(r.q*r.pPrime-r.p*r.qPrime-r.g*(r.p*r.p+r.q*r.q))}),
      ends=[jacobians(q.transverseStart),jacobians(q.transverseEnd)];
    for(const stage of ['source','formal'] as const){const lo=ends[0][stage],hi=ends[1][stage],epsilon=1e-10*Math.max(Math.abs(lo),Math.abs(hi),Number.MIN_VALUE);
      if(ref.zeroRuling||lo< -epsilon&&hi>epsilon||hi< -epsilon&&lo>epsilon)witness[stage]=true;}
    const widths=Array.from({length:q.rulingSegments+1},(_,j)=>q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments);
    widths.push((q.transverseStart+q.transverseEnd)/2);
    for(const w of widths){maxMetric=Math.max(maxMetric,metricDifference(metric(r.basePrime,r.director,r.directorPrime,w),metric(t.basePrime,t.director,t.directorPrime,w)));
      const js=jacobians(w);for(const item of cell)for(const stage of ['source','formal'] as const){const bounds=item[stage+'NormalizedJacobianBounds'],value=js[stage],
        epsilon=2e-9*Math.max(Math.abs(value),Math.abs(bounds[0]),Math.abs(bounds[1]),Number.MIN_VALUE);
        if(value<bounds[0]-epsilon||value>bounds[1]+epsilon)fail();}
    }return {r,t};};
  for(const s of [...new Set([...validation,...cellMidpoints,q.initialParameter])])inspect(s);
  for(let i=0;i<parameters.length;i++){const s=parameters[i],row=raw.sample.rows[i],grid=raw.grid[i],{r,t}=inspect(s),coef=row?.coefficients;
    if(!record(row)||!keys(row,rowKeys)||!close(row.s,s,1e-12)||!close(row.normalAngleRad,r.angle)||!close(row.normalAngleDerivative,r.anglePrime)||
      !record(coef)||!keys(coef,coefficientKeys))fail();
    if(ref.zeroRuling){for(const name of ['sourceDirector','sourceDirectorDerivative','targetDirector','targetDirectorDerivative',
      'normalizedSourceDirector','normalizedSourceDirectorDerivative','normalizedTargetDirector','normalizedTargetDirectorDerivative'])
      if(!vector(row[name],name.toLowerCase().includes('source')?3:2)||row[name].some((v:number)=>v!==0))fail();
      if(['p','q','pPrime','qPrime','normalizedP','normalizedQ','normalizedPPrime','normalizedQPrime','normalTangentProjection'].some(name=>coef[name]!==0))fail();}
    const jets={speed:r.speed,curvature:r.curvature,torsion:r.torsion,p:r.p,q:r.q,pPrime:r.pPrime,qPrime:r.qPrime};
    for(const name of coefficientKeys){const isNormalized=name.startsWith('normalized'),jetName=isNormalized?name[10].toLowerCase()+name.slice(11):name,
      value=jetName in jets?jets[jetName as keyof typeof jets]:r[jetName as keyof typeof r] as number,
      factor=isNormalized?1:['curvature','torsion'].includes(name)?1/L:['speed','p','q','pPrime','qPrime'].includes(name)?L:1,
      natural=jetName==='speed'?r.speed:['curvature','torsion'].includes(jetName)?Math.max(r.curvature,Math.abs(r.torsion)):
      ['p','q','pPrime','qPrime'].includes(jetName)?Math.max(1/L,Math.hypot(...r.directorPrime)):
      jetName==='g'?Math.max(Math.abs(r.g),1/(q.parameterEnd-q.parameterStart)):Math.max(r.normalDerivativeLength,Math.abs(value));
      if(!finite(coef[name])||Math.abs(coef[name]/factor-value)>2e-8*natural)fail();}
    for(const [name,value] of [['sourceTangent',r.tangent],['sourceNormal',r.normal],['sourceBinormal',r.binormal],
      ['sourceLeftNormal',r.leftNormal],['sourceSurfaceNormal',r.surfaceNormal],['targetTangent',t.tangent],['targetLeftNormal',t.leftNormal]] as const)
      if(!nearVector(row[name],value))fail();
    for(const [name,value,origin,natural] of [['SourceBase',r.base,norm.sourceOrigin,1],['SourceBaseDerivative',r.basePrime,null,r.speed],
      ['TargetBase',t.base,norm.targetOrigin,1],['TargetBaseDerivative',t.basePrime,null,r.speed],
      ['SourceDirector',r.director,null,1/L],['SourceDirectorDerivative',r.directorPrime,null,Math.max(1/L,Math.hypot(...r.directorPrime))],
      ['TargetDirector',t.director,null,1/L],['TargetDirectorDerivative',t.directorPrime,null,Math.max(1/L,Math.hypot(...t.directorPrime))]] as const)
      if(!nearVector(row['normalized'+name],value,natural)||!world(row[name[0].toLowerCase()+name.slice(1)],value,origin,natural))fail();
    if(!record(grid)||!keys(grid,gridKeys)||!close(grid.s,s,1e-12)||gridKeys.filter(k=>k!=='s').some(k=>!Array.isArray(grid[k])||grid[k].length!==q.rulingSegments+1))fail();
    for(let j=0;j<=q.rulingSegments;j++){const w=q.transverseStart+(q.transverseEnd-q.transverseStart)*j/q.rulingSegments;
      for(const stage of ['source','target'] as const){const base=stage==='source'?r:t,point=add(base.base,base.director,w),
        m=metric(base.basePrime,base.director,base.directorPrime,w),bn=Math.hypot(...base.basePrime)+Math.abs(w)*Math.hypot(...base.directorPrime),
        dn=Math.hypot(...base.director),natural=[bn*bn,bn*dn,dn*dn],actual=grid[stage+'EFG'][j],reference=Math.max(1,Math.hypot(...point));
        if(!nearVector(grid['normalized'+stage[0].toUpperCase()+stage.slice(1)][j],point,reference)||
          !world(grid[stage][j],point,stage==='source'?norm.sourceOrigin:norm.targetOrigin,reference)||!vector(actual,3)||
          m.some((v,k)=>Math.abs(actual[k]-v)>2e-8*Math.max(natural[k],Number.MIN_VALUE)))fail();
      }
    }
  }
  if(maxFrame>d.maximumFrameResidual+2e-8*Math.max(1,initial.frameGramResidual)||maxUnit>d.maximumUnitRulingResidual+2e-9||
    maxMetric>d.maximumRelativeMetricDifference+2e-8||maxDev>d.maximumRelativeDevelopabilityResidual+2e-9)fail();
  if(c.finiteMetricVerified!==(d.maximumRelativeMetricDifference<=d.metricTolerance)||
    c.finiteDevelopabilityVerified!==(d.maximumRelativeDevelopabilityResidual<=d.developabilityTolerance)||
    c.finiteUnitRulingsVerified!==(d.maximumUnitRulingResidual<=d.developabilityTolerance)||c.sourceRegularityCertified!==domain.certified||
    c.sourceUnitRulingsAnalytic!==domain.certified||c.sourceDevelopabilityAnalytic!==domain.certified||c.initialFrameCompatible!==initial.frameCompatible||
    c.formalIsometryCertified!==(domain.certified&&initial.frameCompatible))fail();
  for(const stage of ['source','formal']){const strip=domain[stage+'StripRegularity'];if(c[stage+'StripRegularityCertified']!==(strip.status==='verified')||
    witness[stage as keyof typeof witness]&&(stage==='source'||initial.frameCompatible)&&strip.status!=='degenerate')fail();}
  return raw as GenericRibbonResult;
}

export async function fetchGenericRibbonWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericRibbonResult>{
  const query=validateGenericRibbonQuery(input);
  while(true){signal?.throwIfAborted();try{return parseGenericRibbonResult(await api('tessellation/curved-ribbon-generic',query,signal),query);}
    catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}
}
