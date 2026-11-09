/** Exact products/sums of the finite binary64 source jets. In particular the
 * sign of a zero scalar triple product cannot be created by rounding a frame.
 * Conversion back to binary64 happens only after division by the speed power. */
type Binary={m:bigint;e:number};
const memory=new DataView(new ArrayBuffer(8));
function binary(x:number):Binary{
  if(!Number.isFinite(x))throw Error('展开构造的补偿输入非有限。');if(x===0)return {m:0n,e:0};
  memory.setFloat64(0,x,false);const bits=memory.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
  return {m:(bits>>63n?-1n:1n)*(exponent?fraction+(1n<<52n):fraction),e:exponent?exponent-1075:-1074};
}
const product=(a:Binary,b:Binary):Binary=>({m:a.m*b.m,e:a.e+b.e});
const plus=(a:Binary,b:Binary):Binary=>{const e=Math.min(a.e,b.e);return {m:(a.m<<BigInt(a.e-e))+(b.m<<BigInt(b.e-e)),e};};
const minus=(a:Binary,b:Binary)=>plus(a,{m:-b.m,e:b.e});
const cross=(a:Binary[],b:Binary[])=>[minus(product(a[1],b[2]),product(a[2],b[1])),minus(product(a[2],b[0]),product(a[0],b[2])),minus(product(a[0],b[1]),product(a[1],b[0]))];
const dot=(a:Binary[],b:Binary[])=>a.reduce((sum,x,i)=>plus(sum,product(x,b[i])),{m:0n,e:0});
function quotient(a:Binary,b:Binary){
  if(!b.m)throw Error('展开构造的原速度为零。');if(!a.m)return 0;
  const sign=(a.m<0n)!==(b.m<0n)?-1:1,am=a.m<0n?-a.m:a.m,bm=b.m<0n?-b.m:b.m,shift=64+bm.toString(2).length-am.toString(2).length,
    q=shift>=0?(am<<BigInt(shift))/bm:am/(bm<<BigInt(-shift)),width=q.toString(2).length,
    mantissa=Number(q)/2**(width-1),exponent=a.e-b.e-shift+width-1;
  return sign*(exponent< -1022?mantissa*2**(exponent+1022)*2**(-1022):mantissa*2**exponent);
}
function ratio(a:Binary,denominator:number,power:number){let b={m:1n,e:0};const den=binary(denominator);for(let i=0;i<power;i++)b=product(b,den);return quotient(a,b);}
export function uncurlTripleDivided(a:number[],b:number[],c:number[],denominator:number,power:number){return ratio(dot(a.map(binary),cross(b.map(binary),c.map(binary))),denominator,power);}
export function uncurlExactDarboux(cp:number[],cpp:number[],cppp:number[]|null,U:number[]|null,Up:number[]|null,speed:number){
  const a=cp.map(binary),b=cpp.map(binary),v=binary(speed),v2=product(v,v),v3=product(v2,v),W=cross(a,b),W2=dot(W,W),zero={m:0n,e:0};
  const absolute=(x:Binary):Binary=>({m:x.m<0n?-x.m:x.m,e:x.e});let maximum=zero;
  for(const x of W){const positive=absolute(x);if(minus(positive,maximum).m>0n)maximum=positive;}
  const direction=maximum.m?W.map(x=>quotient(x,maximum)):null,magnitude=direction?Math.hypot(...direction):null,
    B=direction&&magnitude?direction.map(x=>x/magnitude):null,
    curvature=Math.hypot(...W.map(x=>quotient(x,v3))),c=cppp?.map(binary)??null,u=U?.map(binary)??null,up=Up?.map(binary)??null,
    tauNumerator=c?dot(W,c):null,tau=tauNumerator&&W2.m?quotient(tauNumerator,W2):null,N=u?dot(b,u):null,G=u?dot(u,W):null;
  let tg:number|null=null;
  if(c&&u&&up&&W2.m&&tauNumerator&&N&&G){
    const Nd=plus(dot(c,u),dot(b,up)),Gd=plus(dot(up,W),dot(u,cross(a,c))),D=dot(a,b),
      numerator=minus(product(minus(tauNumerator,minus(product(G,Nd),product(N,Gd))),v2),product(product(G,N),D));
    tg=quotient(numerator,product(W2,v2));
  }
  return {B,curvature,tau,kn:N?quotient(N,v2):null,kg:G?quotient(G,v3):null,tg};
}
