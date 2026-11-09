/** Zero-thickness material collision checks for step-animation previews.
 *
 * This is a conservative path certificate, not a contact-force simulator. A
 * path is `clear` only when every triangle pair has a separating certificate
 * over every time interval. Exhausting a budget produces `inconclusive`.
 */
export type StepCollisionVector = readonly [number, number, number];
type V = [number, number, number];
type Triangle = [number, number, number];
export interface SimulationStepCollisionMesh {
  indices: ArrayLike<number>;
  /** Equal identifiers mean a single rigid material component, not a layer. */
  triangleBodies?: readonly number[];
  triangleSourceFaces?: readonly number[];
}
export interface SimulationStepCollisionPair {
  triangles: [number, number];
  faces: [number, number];
  kind: 'penetration' | 'coplanar-contact' | 'material-contact' | 'touch';
  sharedVertices: number[];
}
export interface SimulationStepCollisionInspection {
  status: 'clear' | 'collision' | 'inconclusive';
  pairs: SimulationStepCollisionPair[];
  checkedPairs: number;
  reason?: string;
}
export interface SimulationStepProjectionBounds {
  min: ArrayLike<number>;
  max: ArrayLike<number>;
}
export interface SimulationStepCollisionPath {
  evaluate(progress: number): ArrayLike<number>;
  /** For each vertex, an upper bound on its displacement from evaluate((a+b)/2)
   * at ANY time in [a,b]. A scalar may bound all vertices. End-point distances
   * alone are not a valid bound for a rotating or otherwise nonlinear path. */
  motionBound(a: number, b: number): number | ArrayLike<number>;
  /** Optional certified projection ranges over the ENTIRE interval. When an
   * origin is supplied, ranges describe position(v)-position(origin).
   * This is necessary to certify many paths starting with zero-gap contact. */
  projectionBounds?(a: number, b: number, axis: StepCollisionVector, originVertex?: number): SimulationStepProjectionBounds;
  /** Optional analytic separating-surface certificate. The axis may rotate
   * with the path; returning true must prove opposite half-spaces throughout
   * the entire interval, including any zero-gap endpoint. */
  contactSeparation?(a:number,b:number,triangleA:readonly number[],triangleB:readonly number[],sharedVertices:readonly number[],tolerance:number):boolean;
  contactTransition?(progress:number,triangleA:readonly number[],triangleB:readonly number[]):'same-side'|'crossing'|'inconclusive';
}
export interface SimulationStepCollisionOptions {
  tolerance?: number;
  maxPairs?: number;
  maxEvaluations?: number;
  maxDepth?: number;
  minInterval?: number;
  maxTimeMs?:number;
}
export interface SimulationStepPathCertificate extends SimulationStepCollisionInspection {
  interval?: [number, number];
  progress?: number;
  evaluations: number;
  certifiedIntervals: number;
}
const sub = (a: V, b: V): V => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a: V, b: V): V => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scale = (a: V, s: number): V => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a: readonly number[], b: readonly number[]) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const length = (a: V) => Math.hypot(...a);
const point = (p: ArrayLike<number>, v: number): V => [p[3*v],p[3*v+1],p[3*v+2]];
const edges = (t: readonly V[]): V[] => [sub(t[1],t[0]),sub(t[2],t[1]),sub(t[0],t[2])];
const normal = (t: readonly V[]) => cross(sub(t[1],t[0]),sub(t[2],t[0]));
const unit = (v: V): V | null => {const n=length(v); return n>1e-14 ? scale(v,1/n) : null;};
function triangles(mesh: SimulationStepCollisionMesh): Triangle[] {
  if(mesh.indices.length%3)throw Error('碰撞网格的三角形索引不完整。');
  const out: Triangle[]=[];
  for(let i=0;i<mesh.indices.length;i+=3){
    const t:Triangle=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]];
    if(t.some(v=>!Number.isInteger(v)||v<0)||new Set(t).size!==3)throw Error('碰撞网格包含无效三角形。');
    out.push(t);
  }
  if(mesh.triangleBodies&&mesh.triangleBodies.length!==out.length)throw Error('碰撞网格的刚体编号数量不匹配。');
  if(mesh.triangleSourceFaces&&mesh.triangleSourceFaces.length!==out.length)throw Error('碰撞网格的纸面编号数量不匹配。');
  return out;
}
function validPositions(p: ArrayLike<number>, ts: Triangle[]) {
  if(p.length%3||Array.from(p).some(v=>!Number.isFinite(v)))throw Error('碰撞检查收到无效纸面坐标。');
  if(ts.some(t=>t.some(v=>v*3+2>=p.length)))throw Error('碰撞检查的坐标与网格不匹配。');
  for(const t of ts)if(length(normal(t.map(v=>point(p,v))))<1e-13)throw Error('碰撞检查遇到退化纸面。');
}
function intervalOnPlane(t: V[], origin: V, n: V, axis: V, tolerance: number): [number,number] | null {
  const distances=t.map(p=>dot(sub(p,origin),n)), hits:V[]=[];
  for(let i=0;i<3;i++){
    const j=(i+1)%3, a=distances[i], b=distances[j];
    if(Math.abs(a)<=tolerance)hits.push(t[i]);
    if(a < -tolerance&&b > tolerance||a > tolerance&&b < -tolerance)hits.push(add(t[i],scale(sub(t[j],t[i]),a/(a-b))));
  }
  if(!hits.length)return null;
  const values=hits.map(p=>dot(p,axis));return [Math.min(...values),Math.max(...values)];
}
function projection(t: readonly V[], axis: V): [number,number] {
  const v=t.map(p=>dot(p,axis));return [Math.min(...v),Math.max(...v)];
}
function candidateAxes(a: V[], b: V[]): V[] {
  const na=normal(a),nb=normal(b),ea=edges(a),eb=edges(b);
  return [na,nb,...ea.flatMap(x=>eb.map(y=>cross(x,y))),...ea.map(e=>cross(na,e)),...eb.map(e=>cross(nb,e))].flatMap(v=>{const n=unit(v);return n?[n]:[];});
}
function pairKind(a:V[],b:V[],shared:number[],positions:ArrayLike<number>,tolerance:number):SimulationStepCollisionPair['kind']|null {
  const na=unit(normal(a))!,nb=unit(normal(b))!,axis=unit(cross(na,nb));
  if(!axis){
    if(Math.abs(dot(sub(a[0],b[0]),nb))>tolerance)return null;
    for(const n of candidateAxes(a,b)){
      const [amin,amax]=projection(a,n),[bmin,bmax]=projection(b,n);
      if(amax<bmin-tolerance||bmax<amin-tolerance)return null;
    }
    return shared.length?'material-contact':'coplanar-contact';
  }
  const ia=intervalOnPlane(a,b[0],nb,axis,tolerance),ib=intervalOnPlane(b,a[0],na,axis,tolerance);
  if(!ia||!ib)return null;
  const lo=Math.max(ia[0],ib[0]),hi=Math.min(ia[1],ib[1]);
  if(hi<lo-tolerance)return null;
  if(shared.length){
    const allowed=shared.map(v=>dot(point(positions,v),axis)),slo=Math.min(...allowed),shi=Math.max(...allowed);
    if(lo>=slo-tolerance&&hi<=shi+tolerance)return 'material-contact';
  }
  const crosses=(t:V[],origin:V,n:V)=>{const d=t.map(p=>dot(sub(p,origin),n));return Math.min(...d)<-tolerance&&Math.max(...d)>tolerance;};
  // A single tangent point does not cut either zero-thickness surface. A
  // crossing vertex/face trajectory is caught in its neighbouring intervals.
  return hi-lo<=tolerance||!crosses(a,b[0],nb)||!crosses(b,a[0],na)?'touch':'penetration';
}
function pointTriangleDistance(p:V,t:V[]):number {
  const [a,b,c]=t,ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return length(ap);
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3)return length(bp);
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0)return length(sub(p,add(a,scale(ab,d1/(d1-d3)))));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6)return length(cp);
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0)return length(sub(p,add(a,scale(ac,d2/(d2-d6)))));
  const va=d3*d6-d5*d4;
  if(va<=0&&d4-d3>=0&&d5-d6>=0)return length(sub(p,add(b,scale(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))))));
  return Math.abs(dot(ap,unit(cross(ab,ac))!));
}
function segmentDistance(a:V,b:V,c:V,d:V):number {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),den=aa*cc-bb*bb;
  let s=den>1e-20?Math.max(0,Math.min(1,(bb*ee-cc*dd)/den)):0;
  let t=cc>1e-20?(bb*s+ee)/cc:0;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-dd/aa));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(bb-dd)/aa));}
  return length(sub(add(a,scale(u,s)),add(c,scale(v,t))));
}
function triangleDistance(a:V[],b:V[]):number {
  let d=Math.min(...a.map(p=>pointTriangleDistance(p,b)),...b.map(p=>pointTriangleDistance(p,a)));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)d=Math.min(d,segmentDistance(a[i],a[(i+1)%3],b[j],b[(j+1)%3]));
  return d;
}
function coplanarAreaOverlap(a:V[],b:V[],tolerance:number):boolean {
  const n=unit(normal(a))!,nb=unit(normal(b))!;if(length(cross(n,nb))>1e-8||Math.abs(dot(sub(a[0],b[0]),n))>tolerance)return false;
  const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(i=>i!==drop),project=(p:V):[number,number]=>[p[axes[0]],p[axes[1]]];
  let polygon=a.map(project);const clip=b.map(project),signed=(p:[number,number],q:[number,number],r:[number,number])=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]),orientation=Math.sign(signed(clip[0],clip[1],clip[2]));
  for(let edge=0;edge<3;edge++){
    const u=clip[edge],v=clip[(edge+1)%3],next:typeof polygon=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length],sp=orientation*signed(u,v,p),sq=orientation*signed(u,v,q),insideP=sp>=0,insideQ=sq>=0;
      if(insideP)next.push(p);
      if(insideP!==insideQ){const ratio=sp/(sp-sq);next.push([p[0]+ratio*(q[0]-p[0]),p[1]+ratio*(q[1]-p[1])]);}
    }
    polygon=next;if(polygon.length<3)return false;
  }
  let twiceArea=0;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];twiceArea+=p[0]*q[1]-p[1]*q[0];}
  return Math.abs(twiceArea)>tolerance*tolerance;
}
type Pair={a:number;b:number;shared:number[];rigid:boolean;edge:boolean};
/** Sweep broad phase. Displacement radii enclose every intermediate vertex,
 * rather than merely the two end-point bounding boxes. */
function* broadPairs(mesh:SimulationStepCollisionMesh,ts:Triangle[],positions:ArrayLike<number>,bounds?:number|ArrayLike<number>,skipRigidEdges=false,tick?:()=>void):Generator<Pair>{
  const boxes=ts.map((t,index)=>{
    const lo:V=[Infinity,Infinity,Infinity],hi:V=[-Infinity,-Infinity,-Infinity];
    for(const v of t){const p=point(positions,v),r=bounds===undefined?0:typeof bounds==='number'?bounds:bounds[v];if(!Number.isFinite(r)||r<0)throw Error('invalid-bound');for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]-r);hi[k]=Math.max(hi[k],p[k]+r);}}
    return {index,lo,hi};
  });
  boxes.sort((a,b)=>a.lo[0]-b.lo[0]);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    tick?.();
    const x=boxes[i],y=boxes[j];if(y.lo[0]>x.hi[0]+1e-8)break;
    if(y.lo[1]>x.hi[1]+1e-8||x.lo[1]>y.hi[1]+1e-8||y.lo[2]>x.hi[2]+1e-8||x.lo[2]>y.hi[2]+1e-8)continue;
    const a=Math.min(x.index,y.index),b=Math.max(x.index,y.index),rigid=!!mesh.triangleBodies&&mesh.triangleBodies[a]===mesh.triangleBodies[b];
    if(skipRigidEdges&&rigid)continue;
    const shared=ts[a].filter(v=>ts[b].includes(v)),edge=shared.length>=2;
    if(skipRigidEdges&&edge)continue;
    yield {a,b,shared,edge,rigid};
  }
}
const describe=(mesh:SimulationStepCollisionMesh,p:Pair,kind:SimulationStepCollisionPair['kind']):SimulationStepCollisionPair=>({triangles:[p.a,p.b],faces:[mesh.triangleSourceFaces?.[p.a]??p.a,mesh.triangleSourceFaces?.[p.b]??p.b],kind,sharedVertices:[...p.shared]});

/** Inspect actual triangles. Shared vertices are not grounds for dropping a
 * pair: only intersections confined to that material vertex/edge are legal. */
export function inspectSimulationStepCollisions(mesh:SimulationStepCollisionMesh,positions:ArrayLike<number>,options:SimulationStepCollisionOptions={}):SimulationStepCollisionInspection {
  const ts=triangles(mesh);validPositions(positions,ts);
  const tolerance=options.tolerance??1e-8,maxPairs=options.maxPairs??500_000,pairs:SimulationStepCollisionPair[]=[];
  let checkedPairs=0;
  for(const p of broadPairs(mesh,ts,positions)){
    if(++checkedPairs>maxPairs)return {status:'inconclusive',pairs,checkedPairs:checkedPairs-1,reason:'碰撞检查超出纸面对预算。'};
    const kind=pairKind(ts[p.a].map(v=>point(positions,v)),ts[p.b].map(v=>point(positions,v)),p.shared,positions,tolerance);
    if(kind)pairs.push(describe(mesh,p,kind));
  }
  return {status:pairs.some(p=>p.kind==='penetration')?'collision':'clear',pairs,checkedPairs};
}

/** Adaptive continuous certificate. Positive-gap intervals use a Lipschitz
 * displacement bound. Contact intervals use fixed separating-axis projection
 * bounds; no interval is accepted simply because its end points are legal. */
export function certifySimulationStepPath(mesh:SimulationStepCollisionMesh,path:SimulationStepCollisionPath,options:SimulationStepCollisionOptions={}):SimulationStepPathCertificate {
  const ts=triangles(mesh),tolerance=options.tolerance??1e-8,maxPairs=options.maxPairs??500_000,maxEvaluations=options.maxEvaluations??4097,maxDepth=options.maxDepth??24,minInterval=options.minInterval??1e-8;
  const cache=new Map<number,ArrayLike<number>>();let checkedPairs=0,certifiedIntervals=0;
  const deadline=Date.now()+(options.maxTimeMs??8000);let broadTicks=0;
  const tick=()=>{if((++broadTicks&255)===1&&Date.now()>=deadline)throw Error('budget');};
  const base=()=>({evaluations:cache.size,checkedPairs,certifiedIntervals});
  const evaluate=(t:number)=>{let p=cache.get(t);if(p)return p;if(cache.size>=maxEvaluations)throw Error('budget');p=path.evaluate(t);validPositions(p,ts);cache.set(t,p);return p;};
  const test=(p:Pair,positions:ArrayLike<number>)=>{
    if(++checkedPairs>maxPairs)throw Error('budget');
    return pairKind(ts[p.a].map(v=>point(positions,v)),ts[p.b].map(v=>point(positions,v)),p.shared,positions,tolerance);
  };
  const failure=(reason:string,interval?:[number,number]):SimulationStepPathCertificate=>({status:'inconclusive',pairs:[],reason,interval,...base()});
  let currentInterval:[number,number]=[0,1];
  try{
    // Check every initial pair before allowing same-rigid-component exclusion.
    // A rigid body preserves existing legal contact, but cannot cure a mesh
    // that was already penetrated when the preview began.
    for(const progress of [0,1]){
      const pose=evaluate(progress);
      for(const p of broadPairs(mesh,ts,pose,undefined,false,tick)){
        // Parallel zero-thickness planes cannot pierce one another. Avoid
        // spending the narrow-phase budget on large coincident flat stacks.
        const na=unit(normal(ts[p.a].map(v=>point(pose,v))))!,nb=unit(normal(ts[p.b].map(v=>point(pose,v))))!;
        if(length(cross(na,nb))<1e-12)continue;
        const kind=test(p,pose);if(kind==='penetration')return {status:'collision',pairs:[describe(mesh,p,kind)],progress,interval:[progress,progress],...base()};
      }
    }
    const middle=evaluate(.5),fullBound=path.motionBound(0,1),active:Pair[]=[];
    for(const p of broadPairs(mesh,ts,middle,fullBound,true,tick)){
      if(active.length>=maxPairs)throw Error('budget');
      active.push(p);
    }
    const visit=(a:number,b:number,pending:Pair[],depth:number):SimulationStepPathCertificate|null=>{
      currentInterval=[a,b];const m=(a+b)/2,pose=evaluate(m),bound=path.motionBound(a,b),unresolved:Pair[]=[];
      const vertexBound=(v:number)=>{const x=typeof bound==='number'?bound:bound[v];if(!Number.isFinite(x)||x<0)throw Error('invalid-bound');return x;};
      for(const p of pending){
        tick();
        const kind=test(p,pose);if(kind==='penetration')return {status:'collision',pairs:[describe(mesh,p,kind)],progress:m,interval:[a,b],...base()};
        const at=ts[p.a].map(v=>point(pose,v)),bt=ts[p.b].map(v=>point(pose,v));
        if(kind&&m>0&&m<1&&coplanarAreaOverlap(at,bt,tolerance)){
          const transition=path.contactTransition?.(m,ts[p.a],ts[p.b])??'inconclusive';
          if(transition==='crossing')return {status:'collision',pairs:[describe(mesh,p,'penetration')],progress:m,interval:[a,b],reason:'两张纸面在中途共面接触后交换了所在侧。',...base()};
          if(transition==='inconclusive')return {...failure('内部共面接触尚未证明纸层保持在原侧。',[a,b]),pairs:[describe(mesh,p,'coplanar-contact')]};
        }
        const movement=Math.max(...ts[p.a].map(vertexBound))+Math.max(...ts[p.b].map(vertexBound));
        if(!kind&&triangleDistance(at,bt)>movement+tolerance)continue;
        let separated=path.contactSeparation?.(a,b,ts[p.a],ts[p.b],p.shared,tolerance)??false;
        if(!separated&&path.projectionBounds){
          const origin=p.shared.length===1?p.shared[0]:undefined;
          for(const axis of candidateAxes(at,bt)){
            const bounds=path.projectionBounds(a,b,axis,origin);
            const values=[...ts[p.a],...ts[p.b]].map(v=>[bounds.min[v],bounds.max[v]]);
            if(values.some(([lo,hi])=>!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi))throw Error('invalid-bound');
            const amin=Math.min(...ts[p.a].map(v=>bounds.min[v])),amax=Math.max(...ts[p.a].map(v=>bounds.max[v])),bmin=Math.min(...ts[p.b].map(v=>bounds.min[v])),bmax=Math.max(...ts[p.b].map(v=>bounds.max[v]));
            if(amax<=bmin+tolerance||bmax<=amin+tolerance){separated=true;break;}
          }
        }
        if(!separated)unresolved.push(p);
      }
      if(!unresolved.length){certifiedIntervals++;return null;}
      if(depth>=maxDepth||b-a<=minInterval)return {...failure('零间距接触或复杂轨迹尚未获得全区间分离证明。',[a,b]),pairs:unresolved.map(p=>describe(mesh,p,'touch'))};
      return visit(a,m,unresolved,depth+1)??visit(m,b,unresolved,depth+1);
    };
    const result=visit(0,1,active,0);return result??{status:'clear',pairs:[],...base()};
  }catch(error){
    if(error instanceof Error&&error.message==='budget')return failure('连续碰撞检查达到计算预算，尚未证明整条路径安全。',currentInterval);
    if(error instanceof Error&&error.message==='invalid-bound')return failure('轨迹位移或投影界无效，无法证明安全。',currentInterval);
    throw error;
  }
}

type Interval=[number,number];
type IV=[Interval,Interval,Interval];
const outward=(lo:number,hi:number):Interval=>{const e=8*Number.EPSILON*(1+Math.max(Math.abs(lo),Math.abs(hi)));return [lo-e,hi+e];};
const intervalAdd=(a:Interval,b:Interval):Interval=>outward(a[0]+b[0],a[1]+b[1]);
const intervalScale=(a:Interval,s:number):Interval=>s<0?outward(a[1]*s,a[0]*s):outward(a[0]*s,a[1]*s);
const intervalMultiply=(a:Interval,b:Interval):Interval=>{const v=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return outward(Math.min(...v),Math.max(...v));};
function trigonometricBounds(a:Interval,sine:boolean):Interval {
  if(a[1]-a[0]>=2*Math.PI)return [-1,1];
  const f=sine?Math.sin:Math.cos,v=[f(a[0]),f(a[1])],offset=sine?Math.PI/2:0;
  for(let k=Math.ceil((a[0]-offset)/Math.PI);k<=Math.floor((a[1]-offset)/Math.PI);k++)v.push(k%2===0?1:-1);
  return outward(Math.min(...v),Math.max(...v));
}
export interface SimulationStepProjectionBody {
  parent:number|null;
  crease:number|null;
  axisVertices?:readonly [number,number];
  sign:1|-1;
}
export interface SimulationStepIntervalProjectorInput {
  initialPositions:ArrayLike<number>;
  vertexBodies:readonly number[];
  bodies:readonly SimulationStepProjectionBody[];
  fromAngles:readonly number[];
}
/** Interval Rodrigues transforms for a rigid hinge tree. All angle ranges must
 * bound the actual path, including any nonlinear closed-chain continuation.
 * The routine does not infer such bounds from just two endpoint poses. */
export function createSimulationStepIntervalProjector(input:SimulationStepIntervalProjectorInput) {
  const {initialPositions:seed,vertexBodies,bodies,fromAngles}=input;
  const chains=bodies.map((_,body)=>{const chain:number[]=[],seen=new Set<number>();for(let b=body;bodies[b].parent!==null;b=bodies[b].parent!){if(seen.has(b))throw Error('区间投影刚体树存在循环。');seen.add(b);chain.unshift(b);}return chain;});
  const vector=(v:V):IV=>v.map(x=>[x,x] as Interval) as IV;
  const rotateInterval=(value:IV,body:number,angles:readonly {min:number;max:number}[],directionOnly:boolean):IV=>{
    const joint=bodies[body],axisVertices=joint.axisVertices;
    if(joint.crease===null||!axisVertices)throw Error('区间投影缺少铰链数据。');
    const start=point(seed,axisVertices[0]),axis=unit(sub(point(seed,axisVertices[1]),start));if(!axis)throw Error('区间投影遇到退化铰链。');
    const range=angles[joint.crease];if(!range||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min>range.max)throw Error('区间投影角度界无效。');
    const angle=intervalScale([(range.min-fromAngles[joint.crease])*Math.PI/180,(range.max-fromAngles[joint.crease])*Math.PI/180],joint.sign),c=trigonometricBounds(angle,false),s=trigonometricBounds(angle,true);
    const local=value.map((v,i)=>directionOnly?v:intervalAdd(v,[-start[i],-start[i]])) as IV;
    const skew=[[0,-axis[2],axis[1]],[axis[2],0,-axis[0]],[-axis[1],axis[0],0]];
    return local.map((_,i)=>{let result:Interval=[0,0];for(let j=0;j<3;j++){
      // Combine identical sin/cos coefficients before interval arithmetic.
      // In particular, rotating around Z leaves the Z coordinate exactly fixed.
      const product=axis[i]*axis[j],coefficient=intervalAdd([product,product],intervalAdd(intervalScale(c,(i===j?1:0)-product),intervalScale(s,skew[i][j])));
      result=intervalAdd(result,intervalMultiply(coefficient,local[j]));
    }if(!directionOnly)result=intervalAdd(result,[start[i],start[i]]);return result;}) as IV;
  };
  const transform=(p:V,chain:readonly number[],angles:readonly {min:number;max:number}[],directionOnly=false):IV=>{let result=vector(p);for(let i=chain.length-1;i>=0;i--)result=rotateInterval(result,chain[i],angles,directionOnly);return result;};
  return (angles:readonly {min:number;max:number}[],axis:StepCollisionVector,originVertex?:number):SimulationStepProjectionBounds=>{
    const min:number[]=[],max:number[]=[],origin=originVertex===undefined?null:point(seed,originVertex),originChain=originVertex===undefined?null:chains[vertexBodies[originVertex]],originValue=origin&&originChain?transform(origin,originChain,angles):null;
    for(let v=0;v<vertexBodies.length;v++){
      if(v===originVertex){min.push(0);max.push(0);continue;}
      const chain=chains[vertexBodies[v]];let value:IV;
      // Equal rigid transforms preserve relative vectors; cancelling their
      // common translation is essential at shared material vertex contacts.
      if(origin&&originChain&&chain.length===originChain.length&&chain.every((c,i)=>c===originChain[i]))value=transform(sub(point(seed,v),origin),chain,angles,true);
      else {value=transform(point(seed,v),chain,angles);if(originValue)value=value.map((x,i)=>intervalAdd(x,[-originValue[i][1],-originValue[i][0]])) as IV;}
      const range=value.reduce<Interval>((sum,x,i)=>intervalAdd(sum,intervalScale(x,axis[i])),[0,0]);
      // Floating-point roundoff is included, much smaller than collision
      // tolerance; the interval arithmetic itself is outward-conservative.
      const roundoff=2e-13*(1+Math.max(Math.abs(range[0]),Math.abs(range[1])));
      min.push(range[0]-roundoff);max.push(range[1]+roundoff);
    }
    return {min,max};
  };
}

export interface SimulationStepTangentProjectionPhase {
  start:number;end:number;fromAngles:readonly number[];toAngles:readonly number[];
  kind:'linear'|'tangent';coefficients?:readonly number[];
}
type Polynomial=number[];
type RationalVector={n:[Polynomial,Polynomial,Polynomial];d:Polynomial};
const coefficientErrors=new WeakMap<Polynomial,number[]>();
const roundingError=(v:number)=>16*Number.EPSILON*Math.abs(v);
const errors=(p:Polynomial)=>coefficientErrors.get(p)??p.map(roundingError);
const withErrors=(p:Polynomial,e:number[])=>{coefficientErrors.set(p,e);return p;};
const polynomialAdd=(a:Polynomial,b:Polynomial):Polynomial=>{
  const ae=errors(a),be=errors(b),p=Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]??0)+(b[i]??0));
  return withErrors(p,p.map((v,i)=>(ae[i]??0)+(be[i]??0)+roundingError(v)));
};
const polynomialScale=(a:Polynomial,s:number):Polynomial=>{const e=errors(a),p=a.map(v=>v*s);return withErrors(p,p.map((v,i)=>Math.abs(s)*e[i]+roundingError(v)));};
function polynomialMultiply(a:Polynomial,b:Polynomial):Polynomial {
  const result=Array(a.length+b.length-1).fill(0),e=[...result],ae=errors(a),be=errors(b);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    const product=a[i]*b[j];result[i+j]+=product;
    e[i+j]+=Math.abs(a[i])*be[j]+Math.abs(b[j])*ae[i]+ae[i]*be[j]+roundingError(product)+roundingError(result[i+j]);
  }
  return withErrors(result,e);
}
// polynomialBernstein rejects degrees above 128. The coefficient caches are
// therefore bounded independently of model count; interval factors retain at
// most 128 recent degree/range combinations and never retain source geometry.
const binomialCache:number[][]=[];
const binomial=(n:number,k:number)=>{
  const row=binomialCache[n]??(binomialCache[n]=[]);if(row[k]!==undefined)return row[k];
  let x=1;for(let i=1;i<=k;i++)x=x*(n-i+1)/i;row[k]=x;return x;
};
const bernsteinShiftCache=new Map<string,{factors:number[][];errors:number[][]}>();
const bernsteinFactors:number[][][]=[];
function polynomialBernstein(p:Polynomial,lo:number,hi:number):{coefficients:number[];errors:number[]} {
  if(p.length>129)throw Error('区间投影的关节链过长。');
  const degree=p.length-1,shifted=Array(p.length).fill(0),shiftErrors=[...shifted],width=hi-lo,pe=errors(p);
  const key=`${degree}:${lo}:${hi}`;let shift=bernsteinShiftCache.get(key);
  if(!shift){
    const factors=Array.from({length:p.length},()=>[] as number[]),factorErrors=factors.map(()=>[] as number[]);
    for(let j=0;j<=degree;j++)for(let i=j;i<=degree;i++){
      const factor=binomial(i,j)*lo**(i-j)*width**j;factors[j][i]=factor;factorErrors[j][i]=roundingError(factor)*(degree+4);
    }
    shift={factors,errors:factorErrors};
    if(bernsteinShiftCache.size>=128)bernsteinShiftCache.delete(bernsteinShiftCache.keys().next().value!);
    bernsteinShiftCache.set(key,shift);
  }
  const factors=bernsteinFactors[degree]??(bernsteinFactors[degree]=Array.from({length:p.length},(_,k)=>Array.from({length:k+1},(_,j)=>binomial(k,j)/binomial(degree,j))));
  for(let j=0;j<=degree;j++)for(let i=j;i<=degree;i++){
    const factor=shift.factors[j][i],term=p[i]*factor;shifted[j]+=term;
    const factorError=shift.errors[j][i];
    shiftErrors[j]+=Math.abs(factor)*pe[i]+Math.abs(p[i])*factorError+pe[i]*factorError+roundingError(term)+roundingError(shifted[j]);
  }
  const bernstein:number[]=[],bernsteinErrors:number[]=[];
  for(let k=0;k<=degree;k++){
    let x=0,error=0;for(let j=0;j<=k;j++){
      const factor=factors[k][j],term=shifted[j]*factor;x+=term;
      error+=Math.abs(factor)*shiftErrors[j]+Math.abs(shifted[j])*roundingError(factor)*(degree+4)+roundingError(term)+roundingError(x);
    }
    bernstein.push(x);bernsteinErrors.push(error);
  }
  return {coefficients:bernstein,errors:bernsteinErrors};
}
function polynomialBounds(p:Polynomial,lo:number,hi:number):Interval {const r=polynomialBernstein(p,lo,hi);return [Math.min(...r.coefficients.map((v,i)=>v-r.errors[i])),Math.max(...r.coefficients.map((v,i)=>v+r.errors[i]))];}
/** A tighter projector for the one-DOF half-angle folding families. Expressing
 * every joint in the SAME half-angle parameter preserves closed-chain
 * correlations that independent angle intervals lose near the flat endpoint.
 * Matrix entries are rational polynomials with positive denominators; Bernstein
 * coefficient ranges bound their entire interval, including zero-gap contact.
 * Unsupported partial linear sweeps fall back to the general angle projector. */
export function createSimulationStepTangentProjector(input:SimulationStepIntervalProjectorInput,phases:readonly SimulationStepTangentProjectionPhase[]) {
  const {initialPositions:seed,vertexBodies,bodies,fromAngles}=input,general=createSimulationStepIntervalProjector(input);
  const chains=bodies.map((_,body)=>{const chain:number[]=[];for(let b=body;bodies[b].parent!==null;b=bodies[b].parent!)chain.unshift(b);return chain;});
  const one=withErrors([1],[0]),denominatorProducts=new WeakMap<Polynomial,WeakMap<Polynomial,Polynomial>>();
  // Denominators describe an exact symbolic half-angle expression. Preserve
  // its identity across vertices in one moving assembly, so subtraction does
  // not manufacture squared/cubed copies of a shared denominator.
  const multiplyDenominators=(a:Polynomial,b:Polynomial):Polynomial=>{
    if(a===one)return b;if(b===one)return a;
    let byRight=denominatorProducts.get(a);if(!byRight){byRight=new WeakMap();denominatorProducts.set(a,byRight);}
    let result=byRight.get(b);if(!result){result=polynomialMultiply(a,b);byRight.set(b,result);}return result;
  };
  const cache=new Map<string,RationalVector[]>();
  const build=(phase:SimulationStepTangentProjectionPhase,inverse:boolean,commonDepth=0):RationalVector[]|null=>{
    const key=`${phases.indexOf(phase)}:${inverse}:${commonDepth}`;if(cache.has(key))return cache.get(key)!;
    const elementaryDenominators=new Map<string,Polynomial>();
    const matrices=bodies.map((body,index)=>{
      if(body.parent===null)return null;
      const crease=body.crease!,a=phase.fromAngles[crease],b=phase.toAngles[crease],changed=Math.abs(a-b)>1e-10;
      // A phase-static joint still inherits every ancestor transform. Its own
      // seed-to-phase transform is exactly the identity only at the seed angle.
      if(a===b&&a===fromAngles[crease])return null;
      let d:Polynomial,c:Polynomial,s:Polynomial;
      if(!changed){d=one;c=[a===0?1:Math.abs(a)===180?-1:Math.cos(a*Math.PI/180)];s=[a===0||Math.abs(a)===180?0:Math.sin(a*Math.PI/180)];}
      else {
        const opening=Math.abs(a)<1e-8,closing=Math.abs(b)<1e-8;
        if(!(opening&&Math.abs(Math.abs(b)-180)<1e-8||closing&&Math.abs(Math.abs(a)-180)<1e-8))return false;
        const k=phase.kind==='tangent'?phase.coefficients![crease]:1,sign=Math.sign(opening?b:a),reciprocal=opening===inverse;
        const denominatorKey=`${reciprocal}:${k}`,known=elementaryDenominators.get(denominatorKey);
        d=known??(reciprocal?[k*k,0,1]:[1,0,k*k]);if(!known)elementaryDenominators.set(denominatorKey,d);
        c=reciprocal?[-k*k,0,1]:[1,0,-k*k];s=[0,2*sign*k,0];
      }
      const old=fromAngles[crease]*Math.PI/180,cosOld=Math.abs(Math.cos(old))<1e-14?0:Math.cos(old),sinOld=Math.abs(Math.sin(old))<1e-14?0:Math.sin(old);
      const deltaCos=polynomialAdd(polynomialScale(c,cosOld),polynomialScale(s,sinOld)),deltaSin=polynomialScale(polynomialAdd(polynomialScale(s,cosOld),polynomialScale(c,-sinOld)),body.sign);
      const start=point(seed,body.axisVertices![0]),axis=unit(sub(point(seed,body.axisVertices![1]),start))!,skew=[[0,-axis[2],axis[1]],[axis[2],0,-axis[0]],[-axis[1],axis[0],0]];
      const q=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>polynomialAdd(polynomialScale(d,axis[i]*axis[j]),polynomialAdd(polynomialScale(deltaCos,(i===j?1:0)-axis[i]*axis[j]),polynomialScale(deltaSin,skew[i][j])))));
      return {d,q,start,index};
    });
    if(matrices.some(m=>m===false))return null;
    const result=vertexBodies.map((body,v)=>{
      let value:RationalVector={n:point(seed,v).map(x=>[x]) as RationalVector['n'],d:one};
      const chain=chains[body];
      for(let i=chain.length-1;i>=commonDepth;i--){
        const matrix=matrices[chain[i]];if(!matrix)continue;
        const local=value.n.map((p,j)=>polynomialAdd(p,polynomialScale(value.d,-matrix.start[j]))),denominator=multiplyDenominators(value.d,matrix.d);
        const numerator=matrix.q.map((row,j)=>row.reduce((sum,q,k)=>polynomialAdd(sum,polynomialMultiply(q,local[k])),polynomialScale(denominator,matrix.start[j]))) as RationalVector['n'];
        value={n:numerator,d:denominator};
      }
      return value;
    });
    cache.set(key,result);return result;
  };
  let lastInterval='',projectionCache=new Map<string,SimulationStepProjectionBounds>();
  const intervalDenominators=new Map<string,WeakMap<Polynomial,Interval>>();
  const project=(a:number,b:number,axis:StepCollisionVector,originVertex?:number,angleBounds?:readonly {min:number;max:number}[]):SimulationStepProjectionBounds=>{
    const interval=`${a}:${b}`;if(interval!==lastInterval){lastInterval=interval;projectionCache=new Map();}
    const projectionKey=`${axis[0]}:${axis[1]}:${axis[2]}:${originVertex??''}`,known=projectionCache.get(projectionKey);if(known)return known;
    const direction:[number,number,number]=[axis[0],axis[1],axis[2]];
    const min=Array(vertexBodies.length).fill(Infinity),max=Array(vertexBodies.length).fill(-Infinity),computed=new Uint8Array(vertexBodies.length);
    const chunks:Array<{vectors:RationalVector[];q0:number;q1:number;denominators:WeakMap<Polynomial,Interval>}>=[];
    for(const phase of phases){
      const left=Math.max(a,phase.start),right=Math.min(b,phase.end);if(right<left)continue;
      const localA=(left-phase.start)/(phase.end-phase.start),localB=(right-phase.start)/(phase.end-phase.start);
      for(const inverse of [false,true]){
        const lo=Math.max(localA,inverse?.5:0),hi=Math.min(localB,inverse?1:.5);if(hi<lo)continue;
        const vectors=build(phase,inverse);
        if(!vectors){if(!angleBounds)throw Error('该线性折角路径需要通用区间投影界。');return general(angleBounds,axis,originVertex);}
        const parameter=(p:number)=>Math.tan(Math.PI*(inverse?1-p:p)/2),q0=parameter(inverse?hi:lo),q1=parameter(inverse?lo:hi);
        const rangeKey=`${phases.indexOf(phase)}:${inverse}:${q0}:${q1}`;
        let denominators=intervalDenominators.get(rangeKey);if(!denominators){denominators=new WeakMap();if(intervalDenominators.size>=4096)intervalDenominators.clear();intervalDenominators.set(rangeKey,denominators);}
        chunks.push({vectors,q0,q1,denominators});
      }
    }
    const compute=(v:number)=>{
      if(computed[v])return;computed[v]=1;
      for(const {vectors,q0,q1,denominators} of chunks){
          if(v===originVertex){min[v]=Math.min(min[v],0);max[v]=Math.max(max[v],0);continue;}
          const value=originVertex===undefined?vectors[v]:relative(vectors[v],vectors[originVertex]);
          const numerator=value.n.reduce((sum,p,i)=>polynomialAdd(sum,polynomialScale(p,direction[i])),[0]),denominator=value.d;
          const n=polynomialBounds(numerator,q0,q1);
          // Every elementary denominator is 1+k²u² or k²+u².
          // Its polynomial has nonnegative coefficients, so direct endpoint
          // evaluation gives a positive lower bound even when Bernstein
          // roundoff padding would swamp a very small k².
          let d=denominators.get(denominator);if(!d){const bound=polynomialBounds(denominator,q0,q1),positiveLower=polynomialBounds(denominator,q0,q0)[0];d=[Math.max(bound[0],positiveLower),bound[1]];if(!(d[0]>0))throw Error('联动区间投影的分母未保持正值。');denominators.set(denominator,d);}
          const values=[n[0]/d[0],n[0]/d[1],n[1]/d[0],n[1]/d[1]];min[v]=Math.min(min[v],...values);max[v]=Math.max(max[v],...values);
      }
    };
    // A separating-axis query consumes only the two triangles' vertices.
    // Keep the full ArrayLike contract, evaluating other material vertices
    // only if a caller actually requests their conservative ranges.
    const lazy=(values:number[])=>new Proxy(values,{get(target,property,receiver){if(typeof property==='string'){const index=Number(property);if(Number.isInteger(index)&&index>=0&&index<target.length)compute(index);}return Reflect.get(target,property,receiver);}});
    const result={min:lazy(min),max:lazy(max)};
    if(projectionCache.size>=512)projectionCache.delete(projectionCache.keys().next().value!);
    projectionCache.set(projectionKey,result);return result;
  };
  const relatives=new WeakMap<RationalVector,WeakMap<RationalVector,RationalVector>>();
  const relative=(value:RationalVector,origin:RationalVector):RationalVector=>{
    let byOrigin=relatives.get(value);if(!byOrigin){byOrigin=new WeakMap();relatives.set(value,byOrigin);}
    let result=byOrigin.get(origin);if(!result){result=value===origin?{n:[[0],[0],[0]],d:one}:value.d===origin.d?{n:value.n.map((p,i)=>polynomialAdd(p,polynomialScale(origin.n[i],-1))) as RationalVector['n'],d:value.d}:({n:value.n.map((p,i)=>polynomialAdd(polynomialMultiply(p,origin.d),polynomialScale(polynomialMultiply(origin.n[i],value.d),-1))) as RationalVector['n'],d:multiplyDenominators(value.d,origin.d)});byOrigin.set(origin,result);}return result;
  };
  const crossRational=(a:RationalVector,b:RationalVector):RationalVector=>({n:[polynomialAdd(polynomialMultiply(a.n[1],b.n[2]),polynomialScale(polynomialMultiply(a.n[2],b.n[1]),-1)),polynomialAdd(polynomialMultiply(a.n[2],b.n[0]),polynomialScale(polynomialMultiply(a.n[0],b.n[2]),-1)),polynomialAdd(polynomialMultiply(a.n[0],b.n[1]),polynomialScale(polynomialMultiply(a.n[1],b.n[0]),-1))],d:multiplyDenominators(a.d,b.d)});
  const dotNumerator=(a:RationalVector,b:RationalVector)=>a.n.reduce((sum,p,i)=>polynomialAdd(sum,polynomialMultiply(p,b.n[i])),[0]);
  const separates=(a:number,b:number,triangleA:readonly number[],triangleB:readonly number[],sharedVertices:readonly number[],tolerance=1e-8):boolean=>{
    if(sharedVertices.length>1)return false;
    const originVertex=sharedVertices[0];
    // Removing the same ancestor rigid transform from all six material
    // vertices preserves signed distances and half-spaces. It avoids carrying
    // high-degree common rotations through every moving-plane polynomial.
    const vertexChains=[...triangleA,...triangleB].map(v=>chains[vertexBodies[v]]);
    let commonDepth=0;
    while(vertexChains.every(chain=>chain.length>commonDepth&&chain[commonDepth]===vertexChains[0][commonDepth]))commonDepth++;
    // One continuously oriented MATERIAL plane and the same side must work
    // over every phase. Picking A/positive for one phase and A/negative (or
    // another plane) for the next could hide a coplanar side exchange exactly
    // at an internal phase boundary which adaptive sampling has not visited.
    let possiblePlaneASides=3,possiblePlaneBSides=3,checked=false;
    // Shared-origin SAT axes retain the same material edge-pair definition
    // and orientation over every phase as well. A common vertex alone does
    // not authorize a side exchange through a positive-area contact.
    const possibleSharedAxes=Array(6).fill(3);
    for(const phase of phases){
      const left=Math.max(a,phase.start),right=Math.min(b,phase.end);if(right<=left)continue;
      const localA=(left-phase.start)/(phase.end-phase.start),localB=(right-phase.start)/(phase.end-phase.start);
      for(const inverse of [false,true]){
        const lo=Math.max(localA,inverse?.5:0),hi=Math.min(localB,inverse?1:.5);if(hi<=lo)continue;
        checked=true;
        const vectors=build(phase,inverse,commonDepth);if(!vectors)return false;
        const parameter=(p:number)=>Math.tan(Math.PI*(inverse?1-p:p)/2),q0=parameter(inverse?hi:lo),q1=parameter(inverse?lo:hi);
        if(sharedVertices.length===0){
          // A real material triangle supplies a continuously moving plane.
          // Its own three vertices lie on that plane identically; proving all
          // THREE vertices of the unrelated triangle remain in one closed
          // half-space certifies separation without a shared welded origin.
          // Never replace these interval signs by legal endpoint samples.
          const planeSides=(plane:readonly number[],other:readonly number[])=>{
            const origin=vectors[plane[0]],edgeA=relative(vectors[plane[1]],origin),edgeB=relative(vectors[plane[2]],origin),axis=crossRational(edgeA,edgeB);
            const axisLower=Math.max(...axis.n.map(p=>{const range=polynomialBounds(p,q0,q1);return range[0]>0?range[0]:range[1]<0?-range[1]:0;}));
            if(!(axisLower>0))return 0;
            const sides=other.map(vertex=>{
              const value=relative(vectors[vertex],origin),range=polynomialBounds(dotNumerator(axis,value),q0,q1),denominatorLower=polynomialBounds(value.d,q0,q0)[0];
              if(!(denominatorLower>0))return {positive:false,negative:false};
              const allowance=tolerance*denominatorLower*axisLower;return {positive:range[0]>=-allowance,negative:range[1]<=allowance};
            });
            return (sides.every(s=>s.positive)?1:0)|(sides.every(s=>s.negative)?2:0);
          };
          possiblePlaneASides&=planeSides(triangleA,triangleB);possiblePlaneBSides&=planeSides(triangleB,triangleA);
          if(!possiblePlaneASides&&!possiblePlaneBSides)return false;
          continue;
        }
        const origin=vectors[originVertex];
        const av=triangleA.filter(v=>v!==originVertex).map(v=>relative(vectors[v],origin)),bv=triangleB.filter(v=>v!==originVertex).map(v=>relative(vectors[v],origin));
        const axes=[crossRational(av[0],av[1]),crossRational(bv[0],bv[1]),...av.flatMap(x=>bv.map(y=>crossRational(x,y)))];
        let certified=false;
        for(const [index,axis] of axes.entries()){
          if(!possibleSharedAxes[index])continue;
          // A zero vector is never a separating plane. At least one component
          // must stay strictly separated from zero throughout this interval.
          const axisLower=Math.max(...axis.n.map(p=>{const range=polynomialBounds(p,q0,q1);return range[0]>0?range[0]:range[1]<0?-range[1]:0;}));
          if(!(axisLower>0)){possibleSharedAxes[index]=0;continue;}
          const sign=(v:RationalVector)=>{
            const range=polynomialBounds(dotNumerator(axis,v),q0,q1),denominatorLower=polynomialBounds(v.d,q0,q0)[0],allowance=tolerance*denominatorLower*axisLower;
            if(!(denominatorLower>0))return {positive:false,negative:false};
            // dot(axisNumerator,pointNumerator)/(pointDenominator*|axisNumerator|)
            // is the world-space signed distance. The allowance is therefore
            // in length units, independent of k or polynomial scaling.
            return {positive:range[0]>=-allowance,negative:range[1]<=allowance};
          };
          const sa=av.map(sign),sb=bv.map(sign);
          const sides=(sa.every(s=>s.positive)&&sb.every(s=>s.negative)?1:0)|(sa.every(s=>s.negative)&&sb.every(s=>s.positive)?2:0);
          possibleSharedAxes[index]&=sides;if(possibleSharedAxes[index])certified=true;
        }
        if(!certified)return false;
      }
    }
    return checked;
  };
  const contactTransition=(progress:number,triangleA:readonly number[],triangleB:readonly number[]):'same-side'|'crossing'|'inconclusive'=>{
    const incoming=phases.find(p=>p.end===progress),outgoing=phases.find(p=>p.start===progress);
    // An exact parameter reversal returns through identical material poses.
    // This is a stronger contact-side proof than differentiating an almost
    // zero coefficient at a fully folded precrease apex. Do not approximate
    // these comparisons: independently fitted near-equal branches are not a
    // certified retrace.
    if(incoming&&outgoing&&incoming.kind===outgoing.kind&&incoming.fromAngles.every((angle,i)=>angle===outgoing.toAngles[i])&&incoming.toAngles.every((angle,i)=>angle===outgoing.fromAngles[i])&&(incoming.kind==='linear'||incoming.coefficients?.every((k,i)=>k===outgoing.coefficients?.[i])))return 'same-side';
    const side=(before:boolean):Array<-1|0|1>|null=>{
      const firstIndex=before?phases.map(p=>p.start<progress&&p.end>=progress).lastIndexOf(true):phases.findIndex(p=>p.start<=progress&&p.end>progress);
      if(firstIndex<0)return null;
      const result:Array<-1|0|1>=[];
      for(const vertex of triangleB){
        let sign:-1|0|1=0;
        // A contact may remain stuck for several phases. Keep its incoming
        // side until it actually departs, rather than forgetting the side at
        // a constant-contact phase and allowing a later wrong-side exit.
        for(let index=firstIndex;index>=0&&index<phases.length;index+=before?-1:1){
          const phase=phases[index],at=index===firstIndex?progress:before?phase.end:phase.start,local=(at-phase.start)/(phase.end-phase.start),inverse=local>.5,vectors=build(phase,inverse);if(!vectors)return null;
          const parameter=Math.tan(Math.PI*(inverse?1-local:local)/2),direction=(before?-1:1)*(inverse?-1:1),origin=vectors[triangleA[0]],av=triangleA.slice(1).map(v=>relative(vectors[v],origin)),axis=crossRational(av[0],av[1]);
          const polynomial=dotNumerator(axis,relative(vectors[vertex],origin)),pe=errors(polynomial);
          for(let order=0;order<polynomial.length;order++){
            let coefficient=0,error=0;for(let i=order;i<polynomial.length;i++){
              const factor=binomial(i,order)*parameter**(i-order),term=polynomial[i]*factor;coefficient+=term;
              error+=Math.abs(factor)*pe[i]+Math.abs(polynomial[i])*roundingError(factor)*(polynomial.length+4)+roundingError(term)+roundingError(coefficient);
            }
            // The zero-order term is a verified contact. Higher coefficients
            // determine the actual side immediately before/after it.
            if(order===0)continue;
            if(Math.abs(coefficient)>error){sign=Math.sign(coefficient)*(direction**order) as -1|1;break;}
            if(coefficient!==0||error!==0)return null;
          }
          if(sign!==0)break;
        }
        result.push(sign);
      }
      return result;
    };
    const before=side(true),after=side(false);if(!before||!after)return 'inconclusive';
    if(before.every((s,i)=>s===after[i]||s===0||after[i]===0))return 'same-side';
    const moving=before.map((s,i)=>({a:s,b:after[i]})).filter(({a,b})=>a!==0||b!==0);
    if(moving.length&&moving.every(({a,b})=>a!==0&&b===-a))return 'crossing';
    return 'inconclusive';
  };
  const weighted=(vectors:RationalVector[],weights:readonly (readonly [number,number])[]):RationalVector=>{
    let value:RationalVector|null=null;
    for(const [vertex,weight] of weights){
      if(weight===0)continue;
      const addend=vectors[vertex];
      if(!value){value={n:addend.n.map(p=>polynomialScale(p,weight)) as RationalVector['n'],d:addend.d};continue;}
      if(value.d===addend.d){value={n:value.n.map((p,i)=>polynomialAdd(p,polynomialScale(addend.n[i],weight))) as RationalVector['n'],d:value.d};continue;}
      const denominator=multiplyDenominators(value.d,addend.d);
      value={n:value.n.map((p,i)=>polynomialAdd(polynomialMultiply(p,addend.d),polynomialScale(polynomialMultiply(addend.n[i],value!.d),weight))) as RationalVector['n'],d:denominator};
    }
    return value??{n:[[0],[0],[0]],d:one};
  };
  /** First normal separation of a material overlap anchor relative to B's
   * continuously oriented material normal. A null result is unproved; an
   * uncertain low Taylor coefficient is never skipped for a later one. */
  const initialContactSide=(triangleB:readonly number[],weightsA:readonly (readonly [number,number])[],weightsB:readonly (readonly [number,number])[]):-1|0|1|null=>{
    for(const phase of phases){
      const vectors=build(phase,false);if(!vectors)return null;
      const origin=vectors[triangleB[0]],normalB=crossRational(relative(vectors[triangleB[1]],origin),relative(vectors[triangleB[2]],origin)),difference=relative(weighted(vectors,weightsA),weighted(vectors,weightsB)),p=dotNumerator(normalB,difference),pe=errors(p);
      for(let order=1;order<p.length;order++){
        if(p[order]-pe[order]>0)return 1;
        if(p[order]+pe[order]<0)return -1;
        if(p[order]!==0||pe[order]!==0)return null;
      }
      // A constant phase cannot separate an initially coincident anchor.
      // Continue to the first actual normal movement in a later phase.
    }
    return 0;
  };
  return Object.assign(project,{separates,contactTransition,initialContactSide});
}
