import type {Doc,Point,Segment} from '../core/types';
import {distance} from '../core/geometry';
import {circleGeometry,type CircleGeometry,type CircleObject} from './circleTools';
import type {SnapPoint} from './snapPoints';

const EPS=1e-7;
type Edge=Pick<Segment,'a'|'b'>;
export interface Tangent extends Edge {direction:Point;label:string}
const add=(a:Point,b:Point,k=1):Point=>[a[0]+b[0]*k,a[1]+b[1]*k];
function check(c:CircleGeometry){circleGeometry(c.center,c.radius);}

export function separateCircle(center:Point,a:Point,b:Point):CircleGeometry {
  return circleGeometry(center,distance(a,b));
}
export function concentricCircle(c:CircleGeometry,a:Point,b:Point):CircleGeometry {
  check(c);const delta=distance(a,b);
  if(!Number.isFinite(delta)||delta<EPS)throw new Error('半径增量不能为零，请另选长度终点。');
  return circleGeometry(c.center,c.radius+delta);
}
export function externallyTangentPair(a:CircleGeometry,b:CircleGeometry):CircleGeometry[] {
  check(a);check(b);const d=distance(a.center,b.center),delta=(d-a.radius-b.radius)/2;
  if(d<EPS)throw new Error('同心圆不能作此调整，请另选一个圆。');
  if(Math.abs(delta)<EPS)throw new Error('两圆已外切，无需重复生成。');
  if(Math.min(a.radius+delta,b.radius+delta)<1e-6)throw new Error('调整后半径不为正，请选择非内含的两个圆。');
  return[circleGeometry(a.center,a.radius+delta),circleGeometry(b.center,b.radius+delta)];
}
export function pointTangents(p:Point,c:CircleGeometry):Tangent[] {
  check(c);if(!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))throw new Error('请选择有效起点。');
  const v:Point=[p[0]-c.center[0],p[1]-c.center[1]],d=Math.hypot(...v);
  if(d<c.radius-EPS)throw new Error('起点在圆内，没有实切线，请另选参考圆或取消后重选起点。');
  if(Math.abs(d-c.radius)<=EPS){const contact=add(c.center,v,c.radius/d);return[{a:contact,b:contact,direction:[-v[1]/d,v[0]/d],label:'圆上点切线'}];}
  const unit:Point=[v[0]/d,v[1]/d],foot=c.radius*c.radius/d,h=c.radius*Math.sqrt(Math.max(0,1-(c.radius/d)**2));
  return [-1,1].map(sign=>{const b=add(add(c.center,unit,foot),[-unit[1],unit[0]],sign*h),length=distance(p,b);return{a:p,b,direction:[(b[0]-p[0])/length,(b[1]-p[1])/length] as Point,label:'点圆切线'};});
}
export function commonTangents(a:CircleGeometry,b:CircleGeometry):Tangent[] {
  check(a);check(b);const delta:Point=[b.center[0]-a.center[0],b.center[1]-a.center[1]],d=Math.hypot(...delta);
  if(d<EPS)throw new Error('同心或重合圆没有唯一公切线，请另选第二个圆。');
  const e:Point=[delta[0]/d,delta[1]/d],result:Tangent[]=[];
  for(const side of [1,-1]){
    const k=(a.radius-side*b.radius)/d;if(Math.abs(k)>1+EPS/d)continue;
    const clamped=Math.max(-1,Math.min(1,k)),h=Math.sqrt(Math.max(0,1-clamped*clamped));
    for(const sign of h<EPS?[1]:[-1,1]){
      const n:Point=[e[0]*clamped-e[1]*h*sign,e[1]*clamped+e[0]*h*sign];
      result.push({a:add(a.center,n,a.radius),b:add(b.center,n,side*b.radius),direction:[-n[1],n[0]],label:side===1?'外公切线':'内公切线'});
    }
  }
  if(!result.length)throw new Error('一圆在另一圆内部，没有实公切线，请另选第二个圆。');
  return result;
}

export function circleLineIntersections(c:CircleGeometry,s:Edge):Point[] {
  const v:Point=[s.b[0]-s.a[0],s.b[1]-s.a[1]],len=Math.hypot(...v);if(len<EPS)return[];
  const unit:Point=[v[0]/len,v[1]/len],offset:Point=[c.center[0]-s.a[0],c.center[1]-s.a[1]];
  const along=offset[0]*unit[0]+offset[1]*unit[1],perp=offset[0]*unit[1]-offset[1]*unit[0];
  if(Math.abs(perp)>c.radius+EPS)return[];
  const h=Math.sqrt(Math.max(0,(c.radius-Math.abs(perp))*(c.radius+Math.abs(perp))));
  return (h<EPS?[along]:[along-h,along+h]).filter(t=>t>=-EPS&&t<=len+EPS).map(t=>add(s.a,unit,Math.max(0,Math.min(len,t))));
}
export function circleCircleIntersections(a:CircleGeometry,b:CircleGeometry):Point[] {
  const delta:Point=[b.center[0]-a.center[0],b.center[1]-a.center[1]],d=Math.hypot(...delta);
  if(d<EPS||d>a.radius+b.radius+EPS||d<Math.abs(a.radius-b.radius)-EPS)return[];
  const x=(d+(a.radius-b.radius)*(a.radius+b.radius)/d)/2,h=Math.sqrt(Math.max(0,(a.radius-x)*(a.radius+x)));
  const e:Point=[delta[0]/d,delta[1]/d],foot=add(a.center,e,x);
  return(h<EPS?[0]:[-h,h]).map(t=>add(foot,[-e[1],e[0]],t));
}
/** Derived snap geometry only: never splits crease edges or changes document data. */
export function circleIntersectionPoints(doc:Doc,maxPoints=20000):SnapPoint[] {
  const circles=(doc.objects??[]).filter((o):o is CircleObject=>o.kind==='circle'),result:SnapPoint[]=[],keys=new Set<string>();
  const put=(p:Point)=>{
    if(!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))return;
    const key=p.map(n=>n.toFixed(7)).join(',');if(keys.has(key))return;keys.add(key);
    result.push({id:'circle-intersection:'+key,point:p,kind:'circle-intersection',segmentIds:[]});
  };
  for(let i=0;i<circles.length;i++){
    const a=circles[i];
    for(const s of doc.segments){
      if(Math.max(s.a[0],s.b[0])<a.center[0]-a.radius||Math.min(s.a[0],s.b[0])>a.center[0]+a.radius||Math.max(s.a[1],s.b[1])<a.center[1]-a.radius||Math.min(s.a[1],s.b[1])>a.center[1]+a.radius)continue;
      circleLineIntersections(a,s).forEach(put);if(result.length>=maxPoints)return result.slice(0,maxPoints);
    }
    for(let j=i+1;j<circles.length;j++){circleCircleIntersections(a,circles[j]).forEach(put);if(result.length>=maxPoints)return result.slice(0,maxPoints);}
  }
  return result;
}
