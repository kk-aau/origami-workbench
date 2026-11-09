import {GenericTaylor,compileGenericExpression} from './curvedGenericLinked';

type Node={kind:'constant';value:number}|{kind:'variable'}|{kind:'unary';negative:boolean;a:Node}|{kind:'binary';op:string;a:Node;b:Node}|{kind:'call';name:string;a:Node};
export type UncurlSourceParts={offsets:number[];dynamic:GenericTaylor};
export class UncurlSourceUndefined extends Error{}
export class UncurlSourceBudget {
  evaluations=0;weighted=0;products=0;
  charge(cost:number){if(++this.evaluations>524288||(this.weighted+=cost)>16000000)throw Error('展开构造独立求值超过预算。');}
  product(a:number,b:number){if(a*b>262144-this.products)throw Error('展开构造补偿乘积超过预算。');this.products+=a*b;}
}
export const uncurlSum=(values:number[])=>{const parts:number[]=[];for(let x of values){let i=0;for(let y of parts){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)parts[i++]=lo;x=hi;}parts.length=i;parts.push(x);}return parts.reduceRight((s,x)=>s+x,0);};

/** Bounded source replay. Each derivative order is evaluated separately so an
 * undefined high derivative does not erase a defined point or lower jet. */
export function compileUncurlSource(source:string){
  compileGenericExpression(source,'s');
  const aliases:Record<string,string>={Sin:'sin',Cos:'cos',Tan:'tan',ArcTan:'atan',Sqrt:'sqrt',Exp:'exp',Log:'log',Pi:'pi',E:'e','[':'(',']':')','^':'**'},tokens:string[]=[];
  const functions=['sin','cos','tan','atan','sqrt','exp','log'];let offset=0,index=0,cost=0;
  while(offset<source.length){const m=/^\s*(\*\*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[\[\]()+*/^,-])/.exec(source.slice(offset));
    if(!m)break;const t=aliases[m[1]]??m[1],last=tokens.at(-1),word=(x:string)=>/^(?:[A-Za-z_]|\d|\.)/.test(x);
    if(last&&(word(last)||last===')')&&(word(t)||t==='(')&&!(functions.includes(last)&&t==='('))tokens.push('*');tokens.push(t);offset+=m[0].length;
  }
  const take=()=>tokens[index++],peek=()=>tokens[index],node=<T extends Node>(n:T):T=>{cost++;return n;};
  const atom=():Node=>{const t=take();if(t==='('){const a=add();take();return a;}if(t==='s')return node({kind:'variable'});
    if(t==='pi'||t==='e')return node({kind:'constant',value:t==='pi'?Math.PI:Math.E});
    if(functions.includes(t)){take();const a=add();take();return node({kind:'call',name:t,a});}return node({kind:'constant',value:Number(t)});};
  const power=():Node=>{let a=atom();if(peek()==='**'){take();a=node({kind:'binary',op:'**',a,b:unary()});}return a;};
  const unary=():Node=>peek()==='-'||peek()==='+'?node({kind:'unary',negative:take()==='-',a:unary()}):power();
  const multiply=():Node=>{let a=unary();while(peek()==='*'||peek()==='/')a=node({kind:'binary',op:take(),a,b:unary()});return a;};
  const add=():Node=>{let a=multiply();while(peek()==='+'||peek()==='-')a=node({kind:'binary',op:take(),a,b:multiply()});return a;};
  const tree=add(),exponent=(n:Node):number=>n.kind==='constant'?n.value:n.kind==='unary'?(n.negative?-1:1)*exponent(n.a):NaN;
  const dependence=new Map<Node,boolean>(),depends=(n:Node):boolean=>{if(dependence.has(n))return dependence.get(n)!;const result=n.kind==='variable'?true:n.kind==='constant'?false:n.kind==='binary'?depends(n.a)||depends(n.b):depends(n.a);dependence.set(n,result);return result;};
  const parts=(s:number,order:number,budget:UncurlSourceBudget,subtree:Node=tree):UncurlSourceParts=>{
    budget.charge(cost);const u=new GenericTaylor([s,...Array.from({length:order},(_,i)=>i===0?1:0)]);
    const check=(p:UncurlSourceParts)=>{if(!p.offsets.every(Number.isFinite)||!p.dynamic.c.every(Number.isFinite))throw new UncurlSourceUndefined();return p;};
    const total=(p:UncurlSourceParts)=>p.dynamic.add(uncurlSum(p.offsets));
    const constantZero=(n:Node)=>{if(depends(n))return false;if(n.kind==='constant')return n.value===0;const value=parts(s,0,budget,n);return uncurlSum([...value.offsets,value.dynamic.c[0]])===0;};
    const mul=(a:UncurlSourceParts,b:UncurlSourceParts)=>{budget.product(a.offsets.length,b.offsets.length);let offsets=a.offsets.flatMap(x=>b.offsets.map(y=>x*y));if(offsets.length>256)offsets=[uncurlSum(offsets)];
      return check({offsets,dynamic:a.dynamic.mul(uncurlSum(b.offsets)).add(b.dynamic.mul(uncurlSum(a.offsets))).add(a.dynamic.mul(b.dynamic))});};
    const visit=(n:Node):UncurlSourceParts=>{
      if(n.kind==='constant')return {offsets:[n.value],dynamic:u.constant(0)};if(n.kind==='variable')return {offsets:[],dynamic:u};
      if(order>0&&!depends(n)){const value=parts(s,0,budget,n);return {offsets:value.offsets,dynamic:u.constant(value.dynamic.c[0])};}
      // The backend's literal derivative drops 0*f and f**0. Check the whole
      // original value first: 0*sqrt(s*s) is defined at 0, 0*log(-1) is not.
      // This is a structural rule, never a vanishing sampled-jet proof.
      if(order>0&&n.kind==='binary'&&(n.op==='*'&&(constantZero(n.a)||constantZero(n.b))||n.op==='**'&&exponent(n.b)===0)){
        const value=parts(s,0,budget,n);return {offsets:value.offsets,dynamic:u.constant(value.dynamic.c[0])};
      }
      if(n.kind==='unary'){const a=visit(n.a);return n.negative?{offsets:a.offsets.map(x=>-x),dynamic:a.dynamic.neg()}:a;}
      if(n.kind==='call'){const x=total(visit(n.a));let dynamic:GenericTaylor;
        if(n.name==='sqrt'&&x.c[0]===0){if(order>0)throw new UncurlSourceUndefined();dynamic=u.constant(0);}
        else dynamic=n.name==='sin'?x.sincos()[0]:n.name==='cos'?x.sincos()[1]:x[n.name as 'tan'|'atan'|'sqrt'|'exp'|'log']();
        return check({offsets:[],dynamic});
      }
      const a=visit(n.a);if(n.op==='**'){const k=exponent(n.b);if(k<0)return check({offsets:[],dynamic:total(a).pow(k)});let r={offsets:[1],dynamic:u.constant(0)};for(let i=0;i<k;i++)r=mul(r,a);return r;}
      const b=visit(n.b);if(n.op==='+'||n.op==='-'){const sign=n.op==='+'?1:-1;return check({offsets:[...a.offsets,...b.offsets.map(x=>sign*x)],dynamic:a.dynamic.add(b.dynamic.mul(sign))});}
      if(n.op==='*')return mul(a,b);
      if(b.dynamic.c.every(x=>x===0)){const d=uncurlSum(b.offsets);if(d===0)throw new UncurlSourceUndefined();return check({offsets:a.offsets.map(x=>x/d),dynamic:new GenericTaylor(a.dynamic.c.map(x=>x/d))});}
      return check({offsets:[],dynamic:total(a).div(total(b))});
    };
    try{return check(visit(subtree));}catch(e){if(e instanceof UncurlSourceUndefined)throw e;if(e instanceof Error&&/超过预算/.test(e.message))throw e;throw new UncurlSourceUndefined();}
  };
  return {parts,jet(s:number,order:number,budget:UncurlSourceBudget){const p=parts(s,order,budget);return order===0?uncurlSum([...p.offsets,p.dynamic.c[0]]):p.dynamic.c[order]*[1,1,2,6][order];}};
}
