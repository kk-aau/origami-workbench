import type {XY} from './tessellation';

type Edge=[XY,XY];
type Range=[number,number];
export type ThreeCycleCriticalOptions={checkHalfPlane?:boolean};
export type ThreeCycleEvaluation={sameHalfPlane:boolean;halfPlaneEarlyReturnUsed:boolean;route:'half-plane-return'|'original-line-intersections';angleRad:number|null;intersections:[XY|null,XY|null];u2:XY|null;numerator:number|null;denominator:number|null;reason:'line-intersection-not-numerically-certified'|'atan-ratio-not-finite'|null};
const rad=180/Math.PI;
const sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:XY,b:XY)=>a[0]*b[0]+a[1]*b[1];
const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0];
const right=(a:XY):XY=>[a[1],-a[0]];
const reverse=([a,b]:Edge):Edge=>[b,a];
const deg=(v:number)=>v*rad;
const finite=(v:number)=>Number.isFinite(v);

/** Origamica TwoCycleCriticalTwistAngleCCW, notebook 199403–199464. */
export function twoCycleCriticalAngles([a,b]:Edge,[c,d]:Edge):Range|null{
  const ccw=(e1:Edge,e2:Edge)=>{
    const q1=sub(e1[0],e1[1]),q2=sub(e2[0],e2[1]);
    const p=sub(e2[1],e1[1]);
    const x=Math.atan(dot(p,right(q1))/dot(p,q1));
    const y=Math.atan(dot([-p[0],-p[1]],right(q2))/dot([-p[0],-p[1]],q2));
    return Math.max(x,y);
  };
  const lo=ccw([a,b],[c,d]),hi=Math.PI+ccw([b,a],[d,c]);
  return finite(lo)&&finite(hi)?[deg(lo),deg(hi)]:null;
}

// The source's block tensor {{R(-π/2), -I}, {I, R(-π/2)}} is
// contracted first with p, then sOther and sOwn. Its two outputs form a line direction.
function pleatDirection(p:XY,other:XY,own:XY):XY{
  const a:XY=[p[0]*right(own)[0]+p[1]*own[0],p[0]*right(own)[1]+p[1]*own[1]];
  const b:XY=[-p[0]*own[0]+p[1]*right(own)[0],-p[0]*own[1]+p[1]*right(own)[1]];
  return [dot(other,a),dot(other,b)];
}
function lineIntersection(p:XY,u:XY,q:XY,v:XY):XY|null{
  const denominator=cross(u,v);
  // The pleat directions are cubic in the input scale, so an absolute
  // determinant cutoff changes the result when the same polygon is resized.
  const scale=Math.hypot(...u)*Math.hypot(...v);
  if(!finite(scale)||scale===0||Math.abs(denominator)<=1e-12*scale)return null;
  const t=cross(sub(q,p),v)/denominator;
  const hit:XY=[p[0]+t*u[0],p[1]+t*u[1]];
  return hit.every(finite)?hit:null;
}
function sameHalfPlane(s1:XY,s2:XY,s3:XY){
  const lengths=[s1,s2,s3].map(s=>Math.hypot(...s));
  if(lengths.some(length=>length===0))return true;
  const sign=(v:number)=>Math.abs(v)<1e-12?0:Math.sign(v);
  return sign(cross(s1,s2)/(lengths[0]*lengths[1]))===
    sign(cross(s1,s3)/(lengths[0]*lengths[2]));
}
/** Origamica ThreeCycleCriticalTwistAngleCCW/CW, notebook 200158–200397. */
export function threeCycleCriticalAngles(e1:Edge,e2:Edge,e3:Edge,options:ThreeCycleCriticalOptions={}):Range|null{
  // False explicitly selects the original algebraic branch, including signed
  // clockwise triangles. The default legacy UI triangle shortcut stays intact.
  if(options.checkHalfPlane===false){const e=originalThreeCycleEvaluations([e1,e2,e3],false),a=e[0].angleRad,b=e[1].angleRad;return a!==null&&b!==null?[deg(a),deg(Math.PI+b)]:null;}
  // At a right triangle the line-intersection form can have a removable
  // singularity. The notebook gives this equivalent interior-angle form.
  const edgeScale=Math.max(Math.hypot(...sub(e1[1],e1[0])),Math.hypot(...sub(e2[1],e2[0])),Math.hypot(...sub(e3[1],e3[0])));
  const samePoint=(a:XY,b:XY)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=1e-10*edgeScale;
  if(samePoint(e1[1],e2[0])&&samePoint(e2[1],e3[0])&&samePoint(e3[1],e1[0])){
    const angle=(a:XY,b:XY,c:XY)=>Math.acos(Math.max(-1,Math.min(1,dot(sub(a,b),sub(c,b))/(Math.hypot(...sub(a,b))*Math.hypot(...sub(c,b))))))*rad;
    const angles:[number,number,number]=[angle(e3[0],e1[0],e1[1]),angle(e1[0],e2[0],e2[1]),angle(e2[0],e3[0],e3[1])];
    return triangleCriticalAngles(angles);
  }
  const ccw=(a:Edge,b:Edge,c:Edge):number|null=>{
    const s1=sub(a[1],a[0]),s2=sub(b[1],b[0]),s3=sub(c[1],c[0]);
    if(sameHalfPlane(s1,s2,s3))return Math.PI/2;
    const p12=sub(b[1],a[1]),p23=sub(c[1],b[1]);
    const t12=lineIntersection(a[1],pleatDirection(p12,s2,s1),b[1],pleatDirection(p12,s1,s2));
    const t23=lineIntersection(b[1],pleatDirection(p23,s3,s2),c[1],pleatDirection(p23,s2,s3));
    if(!t12||!t23)return null;
    const u2=right(sub(t12,t23));
    const angle=Math.atan(dot(u2,right(s2))/dot(u2,s2));
    return finite(angle)?angle:null;
  };
  const lo=ccw(e1,e2,e3),reversed=ccw(reverse(e1),reverse(e2),reverse(e3));
  return lo!==null&&reversed!==null?[deg(lo),deg(Math.PI+reversed)]:null;
}

/** In[2696]/[2698], independent of the closed-triangle display shortcut. */
export function originalThreeCycleEvaluations(edges:[Edge,Edge,Edge],checkHalfPlane=true):[ThreeCycleEvaluation,ThreeCycleEvaluation]{
 const evaluate=(a:Edge,b:Edge,c:Edge):ThreeCycleEvaluation=>{
  const s1=sub(a[1],a[0]),s2=sub(b[1],b[0]),s3=sub(c[1],c[0]);
  const half=[s1,s2,s3].some(s=>dot(s,s)===0)||Math.sign(cross(s1,s2))===Math.sign(cross(s1,s3));
  const out:ThreeCycleEvaluation={sameHalfPlane:half,halfPlaneEarlyReturnUsed:checkHalfPlane&&half,route:checkHalfPlane&&half?'half-plane-return':'original-line-intersections',angleRad:null,intersections:[null,null],u2:null,numerator:null,denominator:null,reason:null};
  if(checkHalfPlane&&half){out.angleRad=Math.PI/2;return out;}
  const p12=sub(b[1],a[1]),p23=sub(c[1],b[1]),t12=lineIntersection(a[1],pleatDirection(p12,s2,s1),b[1],pleatDirection(p12,s1,s2)),t23=lineIntersection(b[1],pleatDirection(p23,s3,s2),c[1],pleatDirection(p23,s2,s3));out.intersections=[t12,t23];
  if(!t12||!t23){out.reason='line-intersection-not-numerically-certified';return out;}
  const u2=right(sub(t12,t23)),num=dot(u2,right(s2)),den=dot(u2,s2);out.u2=u2;out.numerator=num;out.denominator=den;
  if(!finite(num)||!finite(den)||den===0){out.reason='atan-ratio-not-finite';return out;}
  const angle=Math.atan(num/den);if(!finite(angle)){out.reason='atan-ratio-not-finite';return out;}out.angleRad=angle;return out;
 };
 return[evaluate(...edges),evaluate(...edges.map(reverse) as [Edge,Edge,Edge])];
}

/** Notebook 200936–200964. Triangle angles and output are in degrees. */
export function triangleCriticalAngles(angles:[number,number,number]):Range|null{
  if(angles.some(a=>!finite(a)||a<=0||a>=180)||Math.abs(angles.reduce((a,b)=>a+b,0)-180)>1e-6)return null;
  const [a,b,c]=angles.map(a=>a/rad),alpha=Math.atan((Math.sin(a)*Math.sin(b)*Math.sin(c))/(1+Math.cos(a)*Math.cos(b)*Math.cos(c)));
  return [deg(alpha),180-deg(alpha)];
}

/** Original ordered edge-pair and edge-triple loops; the polygon is counterclockwise. */
export function polygonCriticalAngles(points:XY[],options:ThreeCycleCriticalOptions={}):{twoCycle:Range|null;threeCycle:Range|null}{
  if(points.length<3||points.some(p=>p.length!==2||p.some(x=>!finite(x))))return {twoCycle:null,threeCycle:null};
  const n=points.length,edge=(i:number):Edge=>[points[i],points[(i+1)%n]];
  const pairs:Range[]=[],triples:Range[]=[];
  for(let i=0;i<n-2;i++){
    for(let j=i+2;j<=Math.min(n-1,n+i-2);j++){
      const a=twoCycleCriticalAngles(edge(i),edge(j));if(a)pairs.push(a);
    }
    for(let j=i+1;j<=Math.min(n-1,n+i-2);j++)for(let k=j+1;k<=Math.min(n-1,n+i-1);k++){
      const a=threeCycleCriticalAngles(edge(i),edge(j),edge(k),options);
      if(a&&a[0]>0&&a[1]<180)triples.push(a);
    }
  }
  const range=(values:Range[]):Range|null=>values.length?[Math.min(...values.map(a=>a[0])),Math.max(...values.map(a=>a[1]))]:null;
  return {twoCycle:range(pairs),threeCycle:range(triples)};
}

export type TwistTypes=('M'|'V')[];
function anyThreeInSemiNecklace(types:TwistTypes,m:'M'|'V'){
  const pos=types.flatMap((type,i)=>type===m?[i]:[]),n=types.length;
  if(pos.length<3)return true;
  for(let i=0;i<pos.length-2;i++)for(let j=i+1;j<pos.length-1;j++)for(let k=j+1;k<pos.length;k++){
    const [a,b,c]=[pos[i],pos[j],pos[k]];
    const gaps=[b-a,c-b,n+a-c].filter(g=>g<=n/2);
    for(let g=0;g<gaps.length;g++)if(gaps[g]+gaps[(g+1)%gaps.length]>=n/2)return false;
  }
  return true;
}
/** Direct form of RegularPolygonTwistValidQ, notebook 201241–201328. */
export function regularPolygonTwistValid(n:number,angle:number,types:TwistTypes):boolean{
  if(!Number.isInteger(n)||n<3||!finite(angle)||angle<=0||angle>=180||types.length!==n||types.some(t=>t!=='M'&&t!=='V'))return false;
  const alpha=Math.min(angle,180-angle),cyclic=90-180/n;
  const same=types.some((t,i)=>t===types[(i+1)%n]),mixed=types.some((t,i)=>t!==types[(i+1)%n]);
  if((n===4||n===5)&&alpha>cyclic){
    if(!anyThreeInSemiNecklace(types,'M')||!anyThreeInSemiNecklace(types,'V'))return false;
    if(n%2===0&&types.some((t,i)=>t===types[(i+n/2)%n]))return false;
  }
  if(same&&!mixed&&alpha>cyclic)return false;
  if(mixed&&!same&&alpha>360/n)return false;
  if(same&&mixed&&n<=4&&alpha>180-360/n)return false;
  if(same&&mixed&&n>=4&&alpha>360/n)return false;
  return true;
}
export const TWIST_ASSIGNMENT_LIST_LIMIT=100_000;
const assignmentOrder=(n:number)=>{
  if(!Number.isInteger(n)||n<3||n>64)throw Error('赋型查询支持 3–64 边。');
};
/** Burnside's count for the original rotation-only equivalence, without rounding. */
export function cyclicTwistTypeCount(n:number):bigint{
  assignmentOrder(n);
  const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
  let sum=0n;
  for(let rotation=0;rotation<n;rotation++)sum+=1n<<BigInt(gcd(n,rotation));
  return sum/BigInt(n);
}
/** Lexicographic binary necklaces. Only rotations merge; mirrors and inversions do not.
 * The prefix recurrence visits representatives directly, rather than all 2^n words.
 * Callers can consume the whole finite sequence or stop without building a huge array.
 */
export function* cyclicTwistTypes(n:number):Generator<TwistTypes>{
  assignmentOrder(n);
  const bits=new Uint8Array(n+1);
  function* visit(t:number,period:number):Generator<TwistTypes>{
    if(t>n){
      if(n%period===0)yield Array.from(bits.slice(1),bit=>bit?'V':'M') as TwistTypes;
      return;
    }
    bits[t]=bits[t-period];
    yield* visit(t+1,period);
    if(bits[t-period]===0){bits[t]=1;yield* visit(t+1,t);}
  }
  yield* visit(1,1);
}
export function validTwistTypeCount(n:number,angle:number):bigint{
  assignmentOrder(n);
  if(!finite(angle)||angle<=0||angle>=180)return 0n;
  if(n<6)return BigInt([...cyclicTwistTypes(n)].filter(types=>regularPolygonTwistValid(n,angle,types)).length);
  // In[2713]: for n>=6 every nonconstant necklace has the same 360/n bound.
  const alpha=Math.min(angle,180-angle),mixed=alpha<=360/n,constant=alpha<=90-180/n;
  return (mixed?cyclicTwistTypeCount(n)-2n:0n)+(constant?2n:0n);
}
export function* validTwistTypes(n:number,angle:number):Generator<TwistTypes>{
  assignmentOrder(n);
  if(!finite(angle)||angle<=0||angle>=180)return;
  if(n>=6&&Math.min(angle,180-angle)>360/n){
    if(Math.min(angle,180-angle)<=90-180/n){yield Array(n).fill('M');yield Array(n).fill('V');}
    return;
  }
  for(const types of cyclicTwistTypes(n))if(regularPolygonTwistValid(n,angle,types))yield types;
}
function assignmentList(values:Iterable<TwistTypes>,count:bigint):TwistTypes[]{
  if(count>BigInt(TWIST_ASSIGNMENT_LIST_LIMIT))throw Error(`结果包含 ${count} 个旋转等价赋型，请使用逐项迭代或缩小查询范围。`);
  return [...values];
}
/** Complete materialized lists retain a memory budget; the iterator has no list cutoff. */
export function allCyclicTwistTypes(n:number):TwistTypes[]{
  return assignmentList(cyclicTwistTypes(n),cyclicTwistTypeCount(n));
}
export function allValidTwistTypes(n:number,angle:number):TwistTypes[]{
  return assignmentList(validTwistTypes(n,angle),validTwistTypeCount(n,angle));
}

/** Origamica's UnitRegularPolygonCenteredTwistSelfContainedQ, 223510–223527.
 *  The source predicate combines assignment validity with a strict geometric
 *  containment inequality. Angles are in degrees in this application.
 */
export function centeredTwistSelfContained(n:number,width:number,tilt:number,types:TwistTypes):boolean{
  if(!finite(width)||!finite(tilt)||width<=0||tilt<=0||tilt>=180)return false;
  const tau=tilt/rad,alpha=deg(Math.atan2(width*Math.sin(tau),Math.cos(tau))); 
  return regularPolygonTwistValid(n,alpha,types)&&
    Math.abs(Math.tan(tau))>Math.tan(Math.PI/n)/(1-2*width);
}

/** Same query with the original alternate input α instead of pleat tilt τ. */
export function centeredTwistAngleSelfContained(n:number,width:number,angle:number,types:TwistTypes):boolean{
  if(!finite(width)||!finite(angle)||width<=0||angle<=0||angle>=180)return false;
  const alpha=angle/rad,tau=deg(Math.atan2(Math.sin(alpha),width*Math.cos(alpha)));
  return centeredTwistSelfContained(n,width,tau,types);
}

export function centeredTwistSelfContainedTypes(n:number,width:number,tilt:number):TwistTypes[]{
  return assignmentList(centeredTwistTypes(n,width,tilt,'pleat'),centeredTwistTypeCount(n,width,tilt,'pleat'));
}

export function centeredTwistAngleSelfContainedTypes(n:number,width:number,angle:number):TwistTypes[]{
  return assignmentList(centeredTwistTypes(n,width,angle,'twist'),centeredTwistTypeCount(n,width,angle,'twist'));
}

function centeredAssignmentParameters(n:number,width:number,value:number,form:'pleat'|'twist'):{angle:number;contained:boolean}{
  assignmentOrder(n);
  if(!finite(width)||width<=0||!finite(value)||value<=0||value>=180)return {angle:0,contained:false};
  const tilt=form==='pleat'?value:deg(Math.atan2(Math.sin(value/rad),width*Math.cos(value/rad)));
  const tau=tilt/rad,angle=deg(Math.atan2(width*Math.sin(tau),Math.cos(tau)));
  return {angle,contained:Math.abs(Math.tan(tau))>Math.tan(Math.PI/n)/(1-2*width)};
}
export function centeredTwistTypeCount(n:number,width:number,value:number,form:'pleat'|'twist'):bigint{
  const {angle,contained}=centeredAssignmentParameters(n,width,value,form);
  return contained?validTwistTypeCount(n,angle):0n;
}
export function* centeredTwistTypes(n:number,width:number,value:number,form:'pleat'|'twist'):Generator<TwistTypes>{
  const {angle,contained}=centeredAssignmentParameters(n,width,value,form);
  if(contained)yield* validTwistTypes(n,angle);
}
export type TwistAssignmentCatalog={enumerated:boolean;all:TwistTypes[];valid:TwistTypes[];centered:TwistTypes[];counts:{all:string;valid:string;centered:string}|null};
/** Exact counts and bounded previews keep every supported order queryable without 2^n work. */
export function twistAssignmentCatalog(n:number,angle:number,width:number,tilt:number,form:'pleat'|'twist'):TwistAssignmentCatalog{
  if(!Number.isInteger(n)||n<3)throw Error('扭转分析至少需要三条边。');
  if(n>64)return {enumerated:false,all:[],valid:[],centered:[],counts:null};
  assignmentOrder(n);
  const value=form==='pleat'?tilt:angle;
  const counts={all:cyclicTwistTypeCount(n),valid:validTwistTypeCount(n,angle),centered:centeredTwistTypeCount(n,width,value,form)};
  const limit=n<=12?TWIST_ASSIGNMENT_LIST_LIMIT:24;
  const take=(items:Iterable<TwistTypes>)=>{
    const result:TwistTypes[]=[];
    for(const types of items){result.push(types);if(result.length>=limit)break;}
    return result;
  };
  const all=take(cyclicTwistTypes(n));
  return {enumerated:BigInt(all.length)===counts.all,all,
    valid:take(validTwistTypes(n,angle)),centered:take(centeredTwistTypes(n,width,value,form)),
    counts:{all:counts.all.toString(),valid:counts.valid.toString(),centered:counts.centered.toString()}};
}

/** Origamica UnitRegularPolygonOffsetTwistSelfContainedQ, 224612–224629. */
export function offsetTwistSelfContained(n:number,width:number,offset:number,types:TwistTypes):boolean{
  if(!Number.isInteger(n)||n<3||!finite(width)||!finite(offset)||width<=0)return false;
  // UnitRegularPolygonOffsetTwistOffset = (w/2) cot(π/n) cot(α), so
  // tan(α) = w cot(π/n)/(2d). atan2 preserves the sign branch at d=0.
  const alpha=deg(Math.atan2(width/Math.tan(Math.PI/n),2*offset));
  const angle=(alpha+180)%180;
  return regularPolygonTwistValid(n,angle,types)&&width<=(1-2*Math.abs(offset))/3;
}

/** Same offset query with original alternate input α instead of d. */
export function offsetTwistAngleSelfContained(n:number,width:number,angle:number,types:TwistTypes):boolean{
  if(!Number.isInteger(n)||n<3||!finite(width)||!finite(angle)||width<=0||angle<=0||angle>=180)return false;
  const alpha=angle/rad,offset=width/(2*Math.tan(Math.PI/n)*Math.tan(alpha));
  return offsetTwistSelfContained(n,width,offset,types);
}
