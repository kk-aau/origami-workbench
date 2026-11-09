/** Independent binary big-float arithmetic for ill-conditioned parameter frames.
 * The input jets are computed by the TypeScript source interpreter. No server
 * matrix, eigenvector or claimed residual is used to construct this reference.
 */
function createFloat(precision:number){
  const memory=new DataView(new ArrayBuffer(8)),
    bits=(n:bigint)=>(n<0n?-n:n).toString(2).length;
  const integerSqrt=(n:bigint)=>{if(n<0n)throw Error('负根式');if(n===0n)return 0n;let x=1n<<BigInt(Math.ceil(bits(n)/2));
    for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}};
  class F{
    readonly m:bigint;readonly e:number;
    constructor(m:bigint,e=0){const shift=Math.max(0,bits(m)-precision);this.m=shift?m/(1n<<BigInt(shift)):m;this.e=m===0n?0:e+shift;}
    static number(x:number){if(!Number.isFinite(x))throw Error('非有限补偿源');if(x===0)return new F(0n);
      memory.setFloat64(0,x,false);const raw=memory.getBigUint64(0,false),sign=(raw>>63n)?-1n:1n,exponent=Number((raw>>52n)&2047n),fraction=raw&((1n<<52n)-1n);
      return new F(sign*(exponent?fraction+(1n<<52n):fraction),exponent?exponent-1023-52:-1074);}
    add(b:F){const e=Math.min(this.e,b.e);return new F((this.m<<BigInt(this.e-e))+(b.m<<BigInt(b.e-e)),e);}
    neg(){return new F(-this.m,this.e);}sub(b:F){return this.add(b.neg());}
    mul(b:F){return new F(this.m*b.m,this.e+b.e);}
    div(b:F){if(b.m===0n)throw Error('原参数框架零分母');if(this.m===0n)return new F(0n);
      const shift=precision+8+bits(b.m)-bits(this.m),numerator=shift>=0?this.m<<BigInt(shift):this.m/(1n<<BigInt(-shift));
      return new F(numerator/b.m,this.e-b.e-shift);}
    sqrt(){if(this.m<0n)throw Error('负根式');if(this.m===0n)return new F(0n);const odd=((this.e%2)+2)%2,m=odd?this.m*2n:this.m,e=this.e-odd;
      return new F(integerSqrt(m<<BigInt(2*precision)),e/2-precision);}
    number(){if(this.m===0n)return 0;const width=bits(this.m),shift=Math.max(0,width-53),topBits=width-shift,
      mantissa=Number(this.m/(1n<<BigInt(shift)))/2**(topBits-1),exponent=this.e+shift+topBits-1,
      value=exponent< -1022?mantissa*2**(exponent+1022)*2**(-1022):mantissa*2**exponent;
      if(!Number.isFinite(value))throw Error('原曲面规则超出有限数值范围');return value;}
  }
  return F;
}
export function surfaceCompensatedRoundTrip(value:number){return createFloat(256).number(value).number();}
export function compensatedSurfaceFrame(su:number[],sv:number[],suu:number[],suv:number[],svv:number[],sine:number){
  const F=createFloat(256+Math.max(0,Math.ceil(-2*Math.log2(sine))));
  type F=InstanceType<typeof F>;
  const zero=F.number(0),one=F.number(1),two=F.number(2),dot=(a:F[],b:F[])=>a.reduce((sum,x,i)=>sum.add(x.mul(b[i])),zero),
    cross=(a:F[],b:F[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))],
    vector=(a:number[])=>a.map(F.number),numbers=(a:F[])=>a.map(x=>x.number()),
    a=vector(su),b=vector(sv),c=vector(suu),d=vector(suv),e=vector(svv),area=cross(a,b),area2=dot(area,area),normal=area.map(x=>x.div(area2.sqrt())),
    E=dot(a,a),F0=dot(a,b),G=dot(b,b),L=dot(c,normal),M=dot(d,normal),N=dot(e,normal),length=E.sqrt(),e1=a.map(x=>x.div(length)),e2=cross(normal,e1),
    rb=dot(b,e1),rd=dot(b,e2),r00=one.div(length),r01=rb.neg().div(length.mul(rd)),r11=one.div(rd),
    B00=L.mul(r00).mul(r00),B01=r00.mul(L.mul(r01).add(M.mul(r11))),
    B11=r01.mul(L.mul(r01).add(M.mul(r11))).add(r11.mul(M.mul(r01).add(N.mul(r11)))),
    H=B00.add(B11).div(two),K=L.mul(N).sub(M.mul(M)).div(area2),
    A=[[G.mul(L).sub(F0.mul(M)).div(area2),G.mul(M).sub(F0.mul(N)).div(area2)],
      [E.mul(M).sub(F0.mul(L)).div(area2),E.mul(N).sub(F0.mul(M)).div(area2)]],
    halfDifference=B00.sub(B11).div(two),radius=halfDifference.mul(halfDifference).add(B01.mul(B01)).sqrt();
  return {normal:numbers(normal),EFG:numbers([E,F0,G]),LMN:numbers([L,M,N]),e1:numbers(e1),e2:numbers(e2),
    A:A.map(numbers),B:[[B00.number(),B01.number()],[B01.number(),B11.number()]],H:H.number(),K:K.number(),
    principalValues:numbers([H.add(radius),H.sub(radius)])};
}

type AST={kind:'constant';value:number;transcendental?:true}|{kind:'variable';name:'u'|'v'}|
  {kind:'unary';minus:boolean;a:AST}|{kind:'binary';op:string;a:AST;b:AST}|{kind:'call';name:string;a:AST};
/** Check domains of the original AST even after an exact identity cancels it.
 * This is value arithmetic, not derivative jets: sqrt(u*u) is defined at 0,
 * while 1/u is not. Tiny nonzero denominators remain nonzero before any
 * conversion to binary64. This path runs only for cancelled partial sources. */
export function assertCompensatedSurfaceDomains(
  obligations:{kind:'nonzero'|'nonnegative'|'positive'|'tan';node:AST}[],u:number,v:number,
  exactConstant:(node:AST)=>{n:bigint;d:bigint}|null){
  if(!obligations.length)return;
  const integer=(n:AST):number=>n.kind==='constant'?n.value:n.kind==='unary'?(n.minus?-1:1)*integer(n.a):NaN,
    budget=(n:AST):number=>n.kind==='constant'?n.value===0?0:Math.abs(Math.log2(Math.abs(n.value))):n.kind==='variable'?0:
      n.kind==='unary'||n.kind==='call'?budget(n.a):n.op==='**'?budget(n.a)*Math.abs(integer(n.b)):
        n.op==='*'||n.op==='/'?budget(n.a)+budget(n.b):Math.max(budget(n.a),budget(n.b)),
    F=createFloat(512+Math.ceil(Math.max(...obligations.map(o=>budget(o.node)),...([u,v].map(x=>x===0?0:Math.abs(Math.log2(Math.abs(x)))))))),
    one=F.number(1),cache=new Map<AST,InstanceType<typeof F>>();
  type F=InstanceType<typeof F>;
  const power=(a:F,n:number):F=>{if(n<0)return power(one.div(a),-n);let out=one;for(let i=0;i<n;i++)out=out.mul(a);return out;},
    evaluate=(n:AST):F=>{if(cache.has(n))return cache.get(n)!;
      const exact=exactConstant(n);let out:F;
      if(exact)out=new F(exact.n).div(new F(exact.d));
      else if(n.kind==='constant')out=F.number(n.value);
      else if(n.kind==='variable')out=F.number(n.name==='u'?u:v);
      else if(n.kind==='unary'){const a=evaluate(n.a);out=n.minus?a.neg():a;}
      else if(n.kind==='binary'){const a=evaluate(n.a);if(n.op==='**')out=power(a,integer(n.b));else{const b=evaluate(n.b);
        out=n.op==='+'?a.add(b):n.op==='-'?a.sub(b):n.op==='*'?a.mul(b):a.div(b);}}
      else {const a=evaluate(n.a);
        if(n.name==='sqrt'){if(a.m<0n)throw Error('原子表达式负根式');out=a.sqrt();}
        else if(n.name==='log'){
          if(a.m<=0n)throw Error('原子表达式log非正');
          const width=a.m.toString(2).length,shift=Math.max(0,width-53),top=Number(a.m/(1n<<BigInt(shift))),
            exponent=a.e+shift;out=F.number(Math.log(top)+exponent*Math.LN2);
        }else{const x=a.number();if(n.name==='sin')out=F.number(Math.sin(x));else if(n.name==='cos')out=F.number(Math.cos(x));
          else if(n.name==='tan')out=F.number(Math.sin(x)).div(F.number(Math.cos(x)));
          else if(n.name==='atan')out=F.number(Math.atan(x));else if(n.name==='exp')out=F.number(Math.exp(x));else throw Error('未知源函数');}}
      cache.set(n,out);return out;};
  for(const {kind,node} of obligations){
    // exp has a strictly positive real value for every defined real argument.
    // All partial operations inside that argument have their own obligations.
    if(kind!=='tan'&&node.kind==='call'&&node.name==='exp')continue;
    let x=evaluate(node);if(kind==='tan')x=F.number(Math.cos(x.number()));
    if(!(kind==='nonnegative'?x.m>=0n:kind==='positive'?x.m>0n:x.m!==0n))throw Error('消去前的原子表达式超出定义域');
  }
}
/** Compensate rare square-root chain cancellation from the actual AST. */
export function compensatedSurfaceJet(tree:AST,u:number,v:number){
  const integer=(n:AST):number=>n.kind==='constant'?n.value:n.kind==='unary'?(n.minus?-1:1)*integer(n.a):NaN,
    budget=(n:AST):number=>n.kind==='constant'?n.value===0?0:Math.abs(Math.log2(Math.abs(n.value))):n.kind==='variable'?0:
      n.kind==='unary'||n.kind==='call'?budget(n.a):n.op==='**'?budget(n.a)*Math.abs(integer(n.b)):
        n.op==='*'||n.op==='/'?budget(n.a)+budget(n.b):Math.max(budget(n.a),budget(n.b)),
    F=createFloat(256+Math.ceil(Math.max(budget(tree),...([u,v].map(x=>x===0?0:Math.abs(Math.log2(Math.abs(x)))))))),zero=F.number(0),one=F.number(1),two=F.number(2),four=F.number(4);
  type F=InstanceType<typeof F>;
  type Jet=F[];
  const constant=(x:F):Jet=>[x,zero,zero,zero,zero,zero],add=(a:Jet,b:Jet)=>a.map((x,i)=>x.add(b[i])),neg=(a:Jet)=>a.map(x=>x.neg()),
    multiply=(a:Jet,b:Jet):Jet=>[a[0].mul(b[0]),a[1].mul(b[0]).add(a[0].mul(b[1])),a[2].mul(b[0]).add(a[0].mul(b[2])),
      a[3].mul(b[0]).add(two.mul(a[1]).mul(b[1])).add(a[0].mul(b[3])),
      a[4].mul(b[0]).add(a[1].mul(b[2])).add(a[2].mul(b[1])).add(a[0].mul(b[4])),
      a[5].mul(b[0]).add(two.mul(a[2]).mul(b[2])).add(a[0].mul(b[5]))],
    compose=(a:Jet,value:F,first:F,second:F):Jet=>[value,first.mul(a[1]),first.mul(a[2]),
      first.mul(a[3]).add(second.mul(a[1]).mul(a[1])),first.mul(a[4]).add(second.mul(a[1]).mul(a[2])),first.mul(a[5]).add(second.mul(a[2]).mul(a[2]))],
    inverse=(a:Jet)=>{const x=one.div(a[0]);return compose(a,x,x.mul(x).neg(),two.mul(x).mul(x).mul(x));},
    power=(a:Jet,n:number):Jet=>{if(n<0)return power(inverse(a),-n);let r=constant(one);for(let i=0;i<n;i++)r=multiply(r,a);return r;},
    evaluate=(n:AST):Jet=>{
      if(n.kind==='constant')return constant(F.number(n.value));if(n.kind==='variable'){const a=constant(F.number(n.name==='u'?u:v));a[n.name==='u'?1:2]=one;return a;}
      if(n.kind==='unary'){const a=evaluate(n.a);return n.minus?neg(a):a;}
      if(n.kind==='binary'){const a=evaluate(n.a);if(n.op==='**')return power(a,integer(n.b));const b=evaluate(n.b);
        return n.op==='+'?add(a,b):n.op==='-'?add(a,neg(b)):n.op==='*'?multiply(a,b):multiply(a,inverse(b));}
      const a=evaluate(n.a),x=a[0],value=x.number();
      if(n.name==='sqrt'){if(x.m<=0n)throw Error('原根式导数未定义');const root=x.sqrt();return compose(a,root,one.div(two.mul(root)),one.div(four.mul(root).mul(x)).neg());}
      if(n.name==='sin'||n.name==='cos'){const s=F.number(Math.sin(value)),c=F.number(Math.cos(value));return n.name==='sin'?compose(a,s,c,s.neg()):compose(a,c,s.neg(),c.neg());}
      if(n.name==='tan'){const s=F.number(Math.sin(value)),c=F.number(Math.cos(value));return multiply(compose(a,s,c,s.neg()),inverse(compose(a,c,s.neg(),c.neg())));}
      if(n.name==='atan'){const d=one.div(one.add(x.mul(x)));return compose(a,F.number(Math.atan(value)),d,two.mul(x).mul(d).mul(d).neg());}
      if(n.name==='exp'){const y=F.number(Math.exp(value));return compose(a,y,y,y);}
      if(n.name==='log'){const d=one.div(x);return compose(a,F.number(Math.log(value)),d,d.mul(d).neg());}
      throw Error('未知补偿函数');
    };
  return evaluate(tree).map(x=>x.number());
}
