import type {Point} from '../core/types';

/** Homogeneous coordinates in one shared binary unit. W is positive. The
 * rounded Point is for rendering/broad-phase bounds, never point identity. */
export interface ExactPoint {x:bigint;y:bigint;w:bigint;point:Point}
export type Fraction=readonly [bigint,bigint];
export const exactGcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a;};
export const fraction=(n:bigint,d=1n):Fraction=>{if(!d)throw Error('精确分区出现零分母。');if(d<0n){n=-n;d=-d;}const g=exactGcd(n,d);return [n/g,d/g];};
export const addFraction=(a:Fraction,b:Fraction):Fraction=>{const g=exactGcd(a[1],b[1]);return fraction(a[0]*(b[1]/g)+b[0]*(a[1]/g),a[1]*(b[1]/g));};
const memory=new DataView(new ArrayBuffer(8));
export function binaryCoordinate(value:number):readonly [bigint,number]{
 if(!Number.isFinite(value))throw Error('精确分区需要有限坐标。');
 if(value===0)return [0n,0];memory.setFloat64(0,value);const bits=memory.getBigUint64(0),exponent=Number((bits>>52n)&2047n),mantissa=(bits&((1n<<52n)-1n))|(exponent?1n<<52n:0n);
 return [(bits>>63n?-1n:1n)*mantissa,exponent?exponent-1075:-1074];
}
/** Correct nearest-even conversion, including subnormal values. */
export function fractionNumber(n:bigint,d:bigint,exponent=0):number{
 if(!n)return 0;if(d<0n){n=-n;d=-d;}const sign=n<0n?-1:1;n=n<0n?-n:n;
 let k=n.toString(2).length-d.toString(2).length;if(k>=0?n<(d<<BigInt(k)):(n<<BigInt(-k))<d)k--;
 const subnormal=k+exponent< -1022,shift=subnormal?exponent+1074:52-k,a=shift>=0?n<<BigInt(shift):n,b=shift>=0?d:d<<BigInt(-shift),q=a/b,r=a%b,rounded=q+(r*2n>b||r*2n===b&&(q&1n)!==0n?1n:0n);
 return sign*Number(rounded)*2**(subnormal?-1074:k+exponent-52);
}
export const compareCoordinate=(a:ExactPoint,b:ExactPoint,axis:0|1):number=>{const d=(axis?a.y:a.x)*b.w-(axis?b.y:b.x)*a.w;return d<0n?-1:d>0n?1:0;};
export function exactOrientation(a:ExactPoint,b:ExactPoint,c:ExactPoint):bigint{
 const bx=b.x*a.w-a.x*b.w,by=b.y*a.w-a.y*b.w,cx=c.x*a.w-a.x*c.w,cy=c.y*a.w-a.y*c.w;return bx*cy-by*cx;
}
/** Standard orient2d error filter. Only certified signs bypass the integer
 * predicate; small nonzero determinants are never declared collinear. */
export function inputOrientation(a:ExactPoint,b:ExactPoint,c:ExactPoint):number{
 const [ax,ay]=a.point,[bx,by]=b.point,[cx,cy]=c.point,left=(ax-cx)*(by-cy),right=(ay-cy)*(bx-cx),det=left-right,bound=Number.EPSILON*4*(Math.abs(left)+Math.abs(right));
 if(Number.isFinite(det)&&Number.isFinite(bound)&&bound>=Number.MIN_VALUE*16&&Math.abs(det)>bound)return Math.sign(det);
 const value=exactOrientation(a,b,c);return value<0n?-1:value>0n?1:0;
}
/** Exact parity, including an explicit boundary answer. */
export function exactRingContains(p:ExactPoint,ring:ArrayLike<number>,points:readonly ExactPoint[]):-1|0|1{
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=points[ring[j]],b=points[ring[i]],ay=compareCoordinate(a,p,1),by=compareCoordinate(b,p,1),orientation=exactOrientation(a,b,p);
  if(!orientation&&compareCoordinate(a,p,0)*compareCoordinate(b,p,0)<=0&&ay*by<=0)return 0;
  if(ay<=0&&by>0&&orientation>0n||by<=0&&ay>0&&orientation<0n)inside=!inside;
 }
 return inside?1:-1;
}
export function exactRingArea(ring:ArrayLike<number>,points:readonly ExactPoint[]):Fraction{
 let area:Fraction=[0n,1n];if(!ring.length)return area;const origin=points[ring[0]];
 for(let i=1;i+1<ring.length;i++){
  const b=points[ring[i]],c=points[ring[i+1]];
  area=addFraction(area,fraction(exactOrientation(origin,b,c),origin.w*origin.w*b.w*c.w*2n));
 }
 return area;
}
/** Each triangle determinant is exact; the running bound certifies the sign
 * of the numerical sum. Near cancellation falls back to a full rational sum. */
export function ringArea(ring:ArrayLike<number>,points:readonly ExactPoint[],exponent:number):{area:number;sign:number}{
 if(ring.length<3)return {area:0,sign:0};const origin=points[ring[0]];let sum=0,correction=0,error=0;
 for(let i=1;i+1<ring.length;i++){
  const b=points[ring[i]],c=points[ring[i+1]],term=fractionNumber(exactOrientation(origin,b,c),origin.w*origin.w*b.w*c.w*2n,exponent*2),adjusted=term-correction,next=sum+adjusted;
  correction=(next-sum)-adjusted;error+=Number.EPSILON*4*(Math.abs(term)+Math.abs(sum)+Math.abs(next))+Number.MIN_VALUE*4;sum=next;
 }
 if(Number.isFinite(sum)&&Math.abs(sum)>error)return {area:sum,sign:Math.sign(sum)};
 const [n,d]=exactRingArea(ring,points);return {area:fractionNumber(n,d,exponent*2),sign:n<0n?-1:n>0n?1:0};
}
/** Outward one-ULP bound for correctly-rounded display coordinates. */
export function nextNumber(value:number,up:boolean):number{
 if(value===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;
 if(!Number.isFinite(value))return value;
 memory.setFloat64(0,value);let bits=memory.getBigUint64(0);bits+=(value>0)===up?1n:-1n;memory.setBigUint64(0,bits);return memory.getFloat64(0);
}
