import type {Point} from './types';

/** Exact orientation of the represented IEEE-754 inputs. Never turn a small
 * nonzero determinant into a vertex hit or a collinear duplicate. */
const memory=new DataView(new ArrayBuffer(8));
function dyadic(x:number):[bigint,number]{
 if(x===0)return [0n,0];memory.setFloat64(0,x);const bits=memory.getBigUint64(0),exponent=Number((bits>>52n)&2047n),mantissa=(bits&((1n<<52n)-1n))|(exponent?1n<<52n:0n);
 return [(bits>>63n?-1n:1n)*mantissa,exponent?exponent-1075:-1074];
}
export function materialOrientation(a:Point,b:Point,c:Point):number{
 const all=[...a,...b,...c].map(dyadic),e=Math.min(...all.filter(([m])=>m!==0n).map(([,e])=>e));
 const [ax,ay,bx,by,cx,cy]=all.map(([m,shift])=>m===0n?0n:m<<BigInt(shift-e)),det=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);return det<0n?-1:det>0n?1:0;
}
export function materialPointInside(p:Point,points:readonly Point[]):boolean{
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[j],b=points[i],sign=materialOrientation(a,b,p);
  if(!sign&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]))return false;
  if(a[1]<=p[1]&&b[1]>p[1]&&sign>0||b[1]<=p[1]&&a[1]>p[1]&&sign<0)inside=!inside;
 }return inside;
}
