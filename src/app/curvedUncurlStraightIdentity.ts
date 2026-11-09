import {compileGenericExpression} from './curvedGenericLinked';
import {uncurlSum} from './curvedUncurlSource';

/** Exact source relation, conditional on the original value/C'/C'' domains.
 * No sample, epsilon or rounded jet can prove C' x C'' = 0. Calls are opaque
 * structural atoms after chain-rule differentiation; no trigonometric CAS is
 * implied. Unknown preserves the existing numeric path and source domain. */
export const UNCURL_STRAIGHT_IDENTITY_LIMITS={terms:256,degree:64,coefficientBits:4096,
  multiplicationSteps:32768,derivedNodes:8192,offsetProducts:262144};
type Node={kind:'constant';value:number}|{kind:'variable'}|{kind:'unary';negative:boolean;a:Node}|
  {kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
type Rational={n:bigint;d:bigint};
type Poly=Map<string,Rational>;
type Form=[Poly,Poly];
class UnknownIdentity extends Error{}
const unknown=():never=>{throw new UnknownIdentity();};

/** true: proved zero; false: proved nonzero purely rational source; null:
 * unsupported atom relation or exceeded proof budget. Caller must separately
 * require finite C/C'/C'' and positive speed before changing Frenet rules. */
export function proveUncurlStraightIdentity(curve:readonly string[]):boolean|null{
  if(!Array.isArray(curve)||curve.length!==3)return null;
  try{
    let derivedNodes=0,products=0,steps=0,hasCalls=false;
    const node=<T extends Node>(n:T):T=>{if(++derivedNodes>UNCURL_STRAIGHT_IDENTITY_LIMITS.derivedNodes)unknown();return n;},
      c=(value:number)=>node({kind:'constant',value}),zero=c(0),one=c(1),
      integer=(n:Node):number=>n.kind==='constant'?n.value:n.kind==='unary'?(n.negative?-1:1)*integer(n.a):unknown(),
      binary=(op:string,a:Node,b:Node):Node=>{
        if((op==='+'||op==='-')&&b.kind==='constant'&&b.value===0)return a;
        if(op==='+'&&a.kind==='constant'&&a.value===0)return b;
        if(op==='*'&&(a.kind==='constant'&&a.value===0||b.kind==='constant'&&b.value===0))return zero;
        if(op==='*'&&a.kind==='constant'&&a.value===1)return b;if(op==='*'&&b.kind==='constant'&&b.value===1)return a;
        if(op==='**'&&integer(b)===0)return one;if(op==='**'&&integer(b)===1)return a;
        return node({kind:'binary',op,a,b});},
      neg=(a:Node):Node=>a.kind==='constant'?c(-a.value):node({kind:'unary',negative:true,a}),
      call=(name:string,a:Node):Node=>node({kind:'call',name,a});
    const parse=(source:string):Node=>{
      compileGenericExpression(source,'s');
      const aliases:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'},
        functions=['sin','cos','tan','atan','sqrt','exp','log'],tokens:string[]=[];let offset=0,index=0;
      while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
        if(!m){if(source.slice(offset).trim())unknown();break;}const t=aliases[m[1]]??m[1],last=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);
        if(last&&(word(last)||last===')')&&(word(t)||t==='(')&&!(functions.includes(last)&&t==='('))tokens.push('*');tokens.push(t);offset+=m[0].length;}
      const take=()=>tokens[index++],peek=()=>tokens[index],atom=():Node=>{const t=take();if(t==='('){const n=add();if(take()!==')')unknown();return n;}
        if(t==='s')return node({kind:'variable'});if(t==='pi'||t==='e')return c(t==='pi'?Math.PI:Math.E);
        if(functions.includes(t)){if(take()!=='(')unknown();const a=add();if(take()!==')')unknown();return call(t,a);}
        if(!/^(?:\d|\.)/.test(t??''))unknown();return c(Number(t));},
        power=():Node=>{let a=atom();if(peek()==='**'){take();a=node({kind:'binary',op:'**',a,b:unary()});}return a;},
        unary=():Node=>peek()==='-'||peek()==='+'?node({kind:'unary',negative:take()==='-',a:unary()}):power(),
        multiply=():Node=>{let a=unary();while(peek()==='*'||peek()==='/')a=node({kind:'binary',op:take(),a,b:unary()});return a;},
        add=():Node=>{let a=multiply();while(peek()==='+'||peek()==='-')a=node({kind:'binary',op:take(),a,b:multiply()});return a;};
      const tree=add();if(index!==tokens.length)unknown();return tree;
    };
    const containsVariable=(n:Node):boolean=>n.kind==='variable'||n.kind==='unary'&&containsVariable(n.a)||
      n.kind==='call'&&containsVariable(n.a)||n.kind==='binary'&&(containsVariable(n.a)||containsVariable(n.b));
    // Fold only a maximal variable-free subtree, using the original compensated
    // zero-order offset arithmetic. Inner constants are not rounded first.
    const ground=(tree:Node):number=>{
      type Parts={offsets:number[];dynamic:number};
      const total=(p:Parts)=>uncurlSum([...p.offsets,p.dynamic]),
        mul=(a:Parts,b:Parts):Parts=>{if((products+=a.offsets.length*b.offsets.length)>UNCURL_STRAIGHT_IDENTITY_LIMITS.offsetProducts)unknown();
          let offsets=a.offsets.flatMap(x=>b.offsets.map(y=>x*y));if(offsets.length>256)offsets=[uncurlSum(offsets)];
          return {offsets,dynamic:uncurlSum([uncurlSum(a.offsets)*b.dynamic,uncurlSum(b.offsets)*a.dynamic,a.dynamic*b.dynamic])};},
        visit=(n:Node):Parts=>{
          if(n.kind==='constant')return {offsets:[n.value],dynamic:0};if(n.kind==='variable')return unknown();
          if(n.kind==='unary'){const p=visit(n.a);return n.negative?{offsets:p.offsets.map(x=>-x),dynamic:-p.dynamic}:p;}
          if(n.kind==='call'){const a=total(visit(n.a)),value=Math[n.name as 'sin'|'cos'|'tan'|'atan'|'sqrt'|'exp'|'log'](a);if(!Number.isFinite(value))unknown();return {offsets:[],dynamic:value};}
          const a=visit(n.a);if(n.op==='**'){const k=integer(n.b);if(k<0){const value=total(a)**k;if(!Number.isFinite(value))unknown();return {offsets:[],dynamic:value};}
            let out:Parts={offsets:[1],dynamic:0};for(let i=0;i<k;i++)out=mul(out,a);return out;}
          const b=visit(n.b);if(n.op==='+'||n.op==='-'){const sign=n.op==='+'?1:-1;return {offsets:[...a.offsets,...b.offsets.map(x=>sign*x)],dynamic:uncurlSum([a.dynamic,sign*b.dynamic])};}
          if(n.op==='*')return mul(a,b);const den=total(b);if(!den)unknown();return b.dynamic===0?{offsets:a.offsets.map(x=>x/den),dynamic:a.dynamic/den}:{offsets:[],dynamic:total(a)/den};
        };
      const p=visit(tree),value=total(p);if(!p.offsets.every(Number.isFinite)||!Number.isFinite(p.dynamic)||!Number.isFinite(value))unknown();return value;
    };
    const fold=(n:Node):Node=>{if(!containsVariable(n))return c(ground(n));
      if(n.kind==='unary')return node({...n,a:fold(n.a)});if(n.kind==='call')return node({...n,a:fold(n.a)});
      if(n.kind==='binary')return node({...n,a:fold(n.a),b:fold(n.b)});return n;};
    const derivativeCache=new Map<Node,Node>(),derivative=(n:Node):Node=>{if(derivativeCache.has(n))return derivativeCache.get(n)!;let d:Node;
      if(n.kind==='constant')d=zero;else if(n.kind==='variable')d=one;
      else if(n.kind==='unary')d=n.negative?neg(derivative(n.a)):derivative(n.a);
      else if(n.kind==='binary'){const da=derivative(n.a);if(n.op==='**'){const k=integer(n.b);d=k===0?zero:binary('*',binary('*',c(k),binary('**',n.a,c(k-1))),da);}
        else {const db=derivative(n.b);d=n.op==='+'||n.op==='-'?binary(n.op,da,db):n.op==='*'?binary('+',binary('*',da,n.b),binary('*',n.a,db)):
          binary('/',binary('-',binary('*',da,n.b),binary('*',n.a,db)),binary('**',n.b,c(2)));}}
      else {const da=derivative(n.a),a=n.a;d=n.name==='sin'?binary('*',call('cos',a),da):n.name==='cos'?neg(binary('*',call('sin',a),da)):
        n.name==='tan'?binary('/',da,binary('**',call('cos',a),c(2))):n.name==='atan'?binary('/',da,binary('+',one,binary('**',a,c(2)))):
          n.name==='sqrt'?binary('/',da,binary('*',c(2),call('sqrt',a))):n.name==='exp'?binary('*',call('exp',a),da):binary('/',da,a);}
      derivativeCache.set(n,d);return d;};
    const gcd=(a:bigint,b:bigint)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b)[a,b]=[b,a%b];return a;},
      q=(n:bigint,d=1n):Rational=>{if(!d)unknown();if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};},
      addQ=(a:Rational,b:Rational,sign=1)=>q(a.n*b.d+BigInt(sign)*b.n*a.d,a.d*b.d),mulQ=(a:Rational,b:Rational)=>q(a.n*b.n,a.d*b.d),
      memory=new DataView(new ArrayBuffer(8)),dyadic=(x:number):Rational=>{if(!Number.isFinite(x))return unknown();if(x===0)return q(0n);
        memory.setFloat64(0,x,false);const bits=memory.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n),
          m=(bits>>63n?-1n:1n)*(exponent?fraction+(1n<<52n):fraction),e=exponent?exponent-1075:-1074;
        return e>=0?q(m<<BigInt(e)):q(m,1n<<BigInt(-e));},
      monomial=(m:string):[number,number][]=>m?m.split(',').map(x=>x.split('^').map(Number) as [number,number]):[],
      key=(p:Map<number,number>)=>[...p].sort((a,b)=>a[0]-b[0]).filter(([,e])=>e).map(([k,e])=>k+'^'+e).join(','),
      bounded=(p:Poly)=>{if(p.size>256||[...p].some(([m,c])=>monomial(m).reduce((a,[,e])=>a+e,0)>64||
        Math.max((c.n<0n?-c.n:c.n).toString(2).length,c.d.toString(2).length)>4096))unknown();return p;},
      addP=(a:Poly,b:Poly,sign=1)=>{const out=new Map(a);for(const [m,c] of b){const value=addQ(out.get(m)??q(0n),c,sign);if(value.n)out.set(m,value);else out.delete(m);}return bounded(out);},
      mulP=(a:Poly,b:Poly)=>{const out:Poly=new Map();for(const [am,ac] of a)for(const [bm,bc] of b){if(++steps>32768)unknown();const powers=new Map(monomial(am));for(const [k,e] of monomial(bm))powers.set(k,(powers.get(k)??0)+e);
        const m=key(powers),value=addQ(out.get(m)??q(0n),mulQ(ac,bc));if(value.n)out.set(m,value);else out.delete(m);bounded(out);}return out;},
      constantForm=(x:Rational):Form=>[new Map(x.n?[['',x]]:[]),new Map([['',q(1n)]])],
      normal=(n:Poly,d:Poly):Form=>{if(!d.size)unknown();return n.size?[bounded(n),bounded(d)]:constantForm(q(0n));},
      combine=(a:Form,b:Form,op:string):Form=>{const [an,ad]=a,[bn,bd]=b;return op==='+'||op==='-'?
        normal(addP(mulP(an,bd),mulP(bn,ad),op==='+'?1:-1),mulP(ad,bd)):normal(mulP(an,op==='*'?bn:bd),mulP(ad,op==='*'?bd:bn));},
      structural=(n:Node):string=>n.kind==='constant'?'n'+dyadic(n.value).n+'/'+dyadic(n.value).d:n.kind==='variable'?'s':
        n.kind==='unary'?'unary:'+(n.negative?'-':'+')+'('+structural(n.a)+')':n.kind==='binary'?'binary:'+n.op+'('+structural(n.a)+','+structural(n.b)+')':
          'call:'+n.name+'('+structural(n.a)+')',atoms=new Map<string,number>(),forms=new Map<Node,Form>(),
      form=(n:Node):Form=>{if(forms.has(n))return forms.get(n)!;let out:Form;
        if(n.kind==='constant')out=constantForm(dyadic(n.value));else if(n.kind==='variable'||n.kind==='call'){
          if(n.kind==='call')hasCalls=true;const name=structural(n);if(!atoms.has(name))atoms.set(name,atoms.size);out=[new Map([[atoms.get(name)+'^1',q(1n)]]),new Map([['',q(1n)]])];}
        else if(n.kind==='unary')out=n.negative?combine(constantForm(q(0n)),form(n.a),'-'):form(n.a);
        else if(n.op==='**'){let a=form(n.a),k=integer(n.b);out=constantForm(q(1n));if(k<0){a=combine(out,a,'/');k=-k;}for(let i=0;i<k;i++)out=combine(out,a,'*');}
        else out=combine(form(n.a),form(n.b),n.op);
        forms.set(n,out);return out;};
    const sources=curve.map(x=>fold(parse(x))),first=sources.map(derivative),second=first.map(derivative),a=first.map(form),b=second.map(form),
      pairs=[[1,2],[2,0],[0,1]],cross=pairs.map(([i,j])=>combine(combine(a[i],b[j],'*'),combine(a[j],b[i],'*'),'-'));
    if(cross.every(([n])=>n.size===0))return true;
    return hasCalls?null:false;
  }catch{return null;}
}
