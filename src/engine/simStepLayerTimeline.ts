import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import type {SimulationStepInitialOrder} from './simStepContactOrder';
import {createSimulationStepTangentProjector} from './simStepCollision';
import {compileSimulationStepRigidMechanism} from './simStepRigid';
import type {SimulationStepMotionPhase} from './simStepPath';

export interface SimulationStepLayerFrame {progress:number;faceOrders:[number,number,number][]}
export interface SimulationStepLayerTimelineOptions {
  /** Bounds include rejected broad-phase pairs, so an unusually large mesh
   * cannot turn display preparation into an unbounded all-pairs operation. */
  maxPairsPerPhase?:number;
  maxTotalPairs?:number;
  maxOverlapPairsPerPhase?:number;
}
type V=[number,number,number];
type P=[number,number];
type Row=[number,number,number];
type Weights=Array<[number,number]>;
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const point=(p:ArrayLike<number>,i:number):V=>[p[i*3],p[i*3+1],p[i*3+2]];
const cross2=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const unchanged=(phase:SimulationStepMotionPhase,i:number)=>Math.abs(phase.fromAngles[i]-phase.toAngles[i])<1e-10;
function clipTriangle(polygon:P[],triangle:P[]):P[]{
  let output=polygon;const orientation=Math.sign(cross2(triangle[0],triangle[1],triangle[2]));if(!orientation)return [];
  for(let k=0;k<3;k++){
    const a=triangle[k],b=triangle[(k+1)%3],input=output;output=[];
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length],first=orientation*cross2(a,b,p),last=orientation*cross2(a,b,q);
      if(first>=0)output.push(p);
      if(first>=0&&last<0||first<0&&last>=0){const t=first/(first-last);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    if(output.length<3)return [];
  }
  return output;
}
const polygonArea=(p:P[])=>Math.abs(p.reduce((sum,q,i)=>sum+q[0]*p[(i+1)%p.length][1]-q[1]*p[(i+1)%p.length][0],0))/2;
function barycentric(p:P,t:P[],indices:readonly number[]):Weights|null{
  const area=cross2(t[0],t[1],t[2]);if(Math.abs(area)<1e-20)return null;
  const w=[cross2(p,t[1],t[2])/area,cross2(t[0],p,t[2])/area,cross2(t[0],t[1],p)/area];
  if(w.some(n=>!Number.isFinite(n)||n< -1e-9||n>1+1e-9))return null;
  const clamped=w.map(n=>Math.max(0,Math.min(1,n))),total=clamped.reduce((a,b)=>a+b,0);
  return clamped.map((n,i)=>[indices[i],n/total]);
}
function initialRows(prepared:PreparedOrigamiModel,order:SimulationStepInitialOrder|null|undefined):Row[]{
  const source=prepared.triangleSourceFaces??prepared.facesVertices.map((_,i)=>i),count=prepared.sourceFaceCount??Math.max(...source)+1;
  if(!order||order.sourceFaceCount!==count||!Array.isArray(order.faceOrders)||order.faceOrders.length>1_000_000)return [];
  const seen=new Set<string>(),rows:Row[]=[];
  for(const row of order.faceOrders){
    if(!Array.isArray(row)||row.length!==3||!Number.isSafeInteger(row[0])||!Number.isSafeInteger(row[1])||row[0]<0||row[1]<0||row[0]>=count||row[1]>=count||row[0]===row[1]||row[2]!==1&&row[2]!==-1||seen.has(key(row[0],row[1])))return [];
    seen.add(key(row[0],row[1]));rows.push([row[0],row[1],row[2]]);
  }
  return rows;
}

/** The current phase can keep old folded stacks together even when a hinge
 * elsewhere will move in a later phase. Constant 180-degree hinges therefore
 * join the same assembly, just as unchanged F triangulation seams do. */
function phaseSourceBodies(prepared:PreparedOrigamiModel,phase:SimulationStepMotionPhase):number[]{
  const parents=prepared.facesVertices.map((_,i)=>i),find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const creaseIndex=new Map(prepared.creaseParams.map((c,i)=>[c.edge,i]));
  prepared.edgesFaces.forEach((faces,e)=>{const i=creaseIndex.get(e);if(faces.length===2&&(i===undefined||unchanged(phase,i)))parents[find(faces[1])]=find(faces[0]);});
  const source=prepared.triangleSourceFaces??parents.map((_,i)=>i),count=prepared.sourceFaceCount??Math.max(...source)+1,result=Array<number>(count).fill(-2);
  source.forEach((f,t)=>{const b=find(t);if(result[f]===-2)result[f]=b;else if(result[f]!==b)result[f]=-1;});
  return result;
}
const sameBody=(row:readonly number[],bodies:readonly number[])=>bodies[row[0]]>=0&&bodies[row[0]]===bodies[row[1]];

/** A scheduled phase can start or end at a partial fold angle. Such a linear
 * phase is outside the full-half-turn polynomial projector's supported family.
 * Its first material velocity at contact still has an analytic expression:
 * sum each ancestor hinge's angular velocity crossed with its lever arm.
 * Only a clearly nonzero first derivative supplies a display order. A tangent
 * departure, cancellation, or zero velocity remains unknown; this is never a
 * replacement for a continuous collision certificate. */
function linearContactSide(prepared:PreparedOrigamiModel,mechanism:ReturnType<typeof compileSimulationStepRigidMechanism>,phase:SimulationStepMotionPhase){
  if(phase.kind!=='linear')return ()=>null;
  const seed=mechanism.seedPositions,velocities:V[]=[],magnitudes:number[]=[];
  const axes=prepared.creaseParams.map(c=>{
    const [a,b]=prepared.edgesVertices[c.edge],origin=point(seed,a),direction=sub(point(seed,b),origin),length=Math.hypot(...direction);
    return {origin,axis:direction.map(v=>v/length) as V};
  });
  mechanism.vertexBodies.forEach((owner,v)=>{
    const p=point(seed,v),velocity:V=[0,0,0];let magnitude=0;
    for(let body=owner;mechanism.components[body].parent!==null;body=mechanism.components[body].parent!){
      const component=mechanism.components[body],i=component.parentCrease!,omega=(phase.toAngles[i]-phase.fromAngles[i])*component.rotationSign*Math.PI/180;
      if(omega===0)continue;
      const {origin,axis}=axes[i],lever=sub(p,origin),term=cross(axis,lever);
      for(let k=0;k<3;k++)velocity[k]+=omega*term[k];
      magnitude+=Math.abs(omega)*Math.hypot(...lever);
    }
    velocities.push(velocity);magnitudes.push(magnitude);
  });
  return (triangleB:readonly number[],weightsA:readonly (readonly [number,number])[],weightsB:readonly (readonly [number,number])[]):1|-1|null=>{
    const [a,b,c]=triangleB.map(v=>point(seed,v)),normal=cross(sub(b,a),sub(c,a)),length=Math.hypot(...normal);
    if(!(length>0)||!Number.isFinite(length))return null;
    const difference:V=[0,0,0];let scale=0;
    for(const [weights,sign] of [[weightsA,1],[weightsB,-1]] as const)for(const [v,w] of weights){
      for(let k=0;k<3;k++)difference[k]+=sign*w*velocities[v][k];
      scale+=Math.abs(w)*magnitudes[v];
    }
    const derivative=dot(normal,difference)/length;
    // The deliberately conservative relative guard rejects cancellation rather
    // than promoting floating-point noise to a material-side relation.
    return Number.isFinite(derivative)&&Math.abs(derivative)>scale*1e-10?derivative>0?1:-1:null;
  };
}

/** Derive contact order from the actual material approach, rather than asking
 * the final flat-fold solver to select a possibly different stacking solution.
 * Reversing each phase makes its last contact an initial departure, allowing
 * the existing analytic half-angle first-term proof to identify the side.
 * Unproved or budget-limited relations remain absent; face IDs never decide
 * which sheet is on top. Only same-assembly relations inherit an earlier row. */
export function buildSimulationStepLayerTimeline(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,initialOrder:SimulationStepInitialOrder|null|undefined,options:SimulationStepLayerTimelineOptions={}):SimulationStepLayerFrame[]{
  const motion=animation.motion;if(!motion)throw Error('纸层时间线需要已规划的步骤动画路径。');
  const frames:SimulationStepLayerFrame[]=[{progress:0,faceOrders:initialRows(prepared,initialOrder)}];
  const mechanism=compileSimulationStepRigidMechanism(prepared,animation),triangles=prepared.facesVertices,source=prepared.triangleSourceFaces??triangles.map((_,i)=>i);
  const maxPairs=Math.max(1,Math.trunc(options.maxPairsPerPhase??Infinity)),maxTotal=Math.max(1,Math.trunc(options.maxTotalPairs??Infinity)),maxOverlaps=Math.max(1,Math.trunc(options.maxOverlapPairsPerPhase??Infinity));
  let total=0;
  for(const phase of motion.phases){
    const bodies=phaseSourceBodies(prepared,phase),previous=frames.at(-1)!.faceOrders,carried=previous.filter(row=>sameBody(row,bodies)).map(row=>[...row] as Row);
    const old=new Map(previous.map(row=>[key(row[0],row[1]),row])),inherited=new Map(carried.map(row=>[key(row[0],row[1]),row]));
    const seed=mechanism.evaluateAngles(phase.toAngles).positions;
    const reversed:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:phase.toAngles[i],toAngle:phase.fromAngles[i]}))};
    delete reversed.motion;
    const reverseMechanism=compileSimulationStepRigidMechanism(prepared,reversed),reversePhase:SimulationStepMotionPhase={...phase,start:0,end:1,fromAngles:[...phase.toAngles],toAngles:[...phase.fromAngles]};
    const projector=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:reverseMechanism.vertexBodies,fromAngles:reverseMechanism.fromAngles,bodies:reverseMechanism.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},[reversePhase]),firstDerivative=linearContactSide(prepared,reverseMechanism,reversePhase);
    const vertices=triangles.map(t=>t.map(v=>point(seed,v))),normals=vertices.map(t=>{const n=cross(sub(t[1],t[0]),sub(t[2],t[0])),length=Math.hypot(...n);return n.map(v=>v/length) as V;});
    const bounds=vertices.map(t=>[0,1,2].map(axis=>({min:Math.min(...t.map(v=>v[axis])),max:Math.max(...t.map(v=>v[axis]))})));
    const proved=new Map<string,Row>(),unknown=new Set<string>();let work=0,overlaps=0,exhausted=false;
    outer:for(let first=0;first<triangles.length;first++)for(let second=first+1;second<triangles.length;second++){
      if(++work>maxPairs||++total>maxTotal){exhausted=true;break outer;}
      const fa=source[first],fb=source[second],pair=key(fa,fb);if(fa===fb||inherited.has(pair))continue;
      if(unknown.has(pair)||bounds[first].some((b,axis)=>b.max<bounds[second][axis].min-1e-7||bounds[second][axis].max<b.min-1e-7))continue;
      const nb=normals[second];if(normals[first].some(v=>!Number.isFinite(v))||nb.some(v=>!Number.isFinite(v))||Math.hypot(...cross(normals[first],nb))>1e-7||vertices[first].some(p=>Math.abs(dot(sub(p,vertices[second][0]),nb))>1e-7))continue;
      const drop=nb.reduce((axis,v,i)=>Math.abs(v)>Math.abs(nb[axis])?i:axis,0),axes=[0,1,2].filter(a=>a!==drop),project=(p:V):P=>[p[axes[0]],p[axes[1]]];
      const a=vertices[first].map(project),b=vertices[second].map(project),overlap=clipTriangle(a,b);if(overlap.length<3||polygonArea(overlap)<=1e-12)continue;
      if(++overlaps>maxOverlaps){exhausted=true;break outer;}
      // Preserve a trusted row's orientation. For a new relation sorting IDs is
      // only serialization; its sign always comes from the material proof.
      const row=old.get(pair),faceA=row?.[0]??Math.min(fa,fb),faceB=row?.[1]??Math.max(fa,fb),ia=faceA===fa?first:second,ib=faceB===fb?second:first,ta=ia===first?a:b,tb=ib===second?b:a;
      const center:P=[overlap.reduce((s,p)=>s+p[0],0)/overlap.length,overlap.reduce((s,p)=>s+p[1],0)/overlap.length],probes=[center,...overlap.map(p=>[center[0]*.1+p[0]*.9,center[1]*.1+p[1]*.9] as P)];
      let sign:1|-1|undefined,complete=true;
      for(const p of probes){
        const wa=barycentric(p,ta,triangles[ia]),wb=barycentric(p,tb,triangles[ib]);if(!wa||!wb){complete=false;break;}
        let side:1|-1|0|null=null;try{side=projector.initialContactSide(triangles[ib],wa,wb);}catch{/* Try the analytic linear first derivative below. */}
        if(side===null)side=firstDerivative(triangles[ib],wa,wb);
        if(side===null||side===0||sign!==undefined&&side!==sign){complete=false;break;}sign=side;
      }
      if(!complete||sign===undefined){unknown.add(pair);proved.delete(pair);continue;}
      const existing=proved.get(pair);if(existing&&existing[2]!==sign){unknown.add(pair);proved.delete(pair);}else proved.set(pair,[faceA,faceB,sign]);
    }
    // If traversal was cut short, unseen triangles could contradict a new row.
    // Constant-assembly inheritance is independent of this traversal budget.
    frames.push({progress:phase.end,faceOrders:exhausted?carried:[...carried,...proved.values()]});
  }
  return frames;
}

/** A numerical press is rendered by linearly interpolating its recorded last
 * segment. At a genuinely planar contact its endpoint normal and barycentric
 * material coordinates therefore make the pre-contact normal gap affine on
 * every convex overlap. Checking every polygon vertex proves a display side
 * over the entire overlap; it is not a continuous collision certificate.
 * Coincident trajectories, mixed sides and contradictory daughter triangles
 * remain unknown instead of selecting an arbitrary flat stacking solution. */
export function buildSimulationStepDynamicLayerTimeline(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,initialOrder:SimulationStepInitialOrder|null|undefined):SimulationStepLayerFrame[]{
  const frames:SimulationStepLayerFrame[]=[{progress:0,faceOrders:initialRows(prepared,initialOrder)},{progress:1,faceOrders:[]}];
  const recorded=animation.dynamic?.keyframes,last=recorded?.at(-1),previous=recorded?.slice(0,-1).reverse().find(frame=>frame.progress<1);
  if(!last||!previous||last.progress!==1||last.positions.length!==prepared.vertexCount*3||previous.positions.length!==last.positions.length||last.positions.some(v=>!Number.isFinite(v))||previous.positions.some(v=>!Number.isFinite(v)))return frames;
  const triangles=prepared.facesVertices,source=prepared.triangleSourceFaces??triangles.map((_,i)=>i),vertices=triangles.map(t=>t.map(v=>point(last.positions,v)));
  const normals=vertices.map(t=>{const n=cross(sub(t[1],t[0]),sub(t[2],t[0])),length=Math.hypot(...n);return n.map(v=>v/length) as V;});
  const bounds=vertices.map(t=>[0,1,2].map(axis=>({min:Math.min(...t.map(v=>v[axis])),max:Math.max(...t.map(v=>v[axis]))})));
  const proved=new Map<string,Row>(),unknown=new Set<string>();let work=0;
  for(let first=0;first<triangles.length;first++)for(let second=first+1;second<triangles.length;second++){
    // This path has the same public 2,400-triangle limit as the numerical
    // recording. Refuse partial traversal results if that invariant changes.
    if(++work>3_000_000)return frames;
    const fa=source[first],fb=source[second],pair=key(fa,fb);if(fa===fb||unknown.has(pair))continue;
    if(bounds[first].some((b,axis)=>b.max<bounds[second][axis].min-1e-7||bounds[second][axis].max<b.min-1e-7))continue;
    const nb=normals[second];
    if(normals[first].some(v=>!Number.isFinite(v))||nb.some(v=>!Number.isFinite(v))||Math.hypot(...cross(normals[first],nb))>1e-7||vertices[first].some(p=>Math.abs(dot(sub(p,vertices[second][0]),nb))>1e-7))continue;
    const drop=nb.reduce((axis,v,i)=>Math.abs(v)>Math.abs(nb[axis])?i:axis,0),axes=[0,1,2].filter(a=>a!==drop),project=(p:V):P=>[p[axes[0]],p[axes[1]]];
    const a=vertices[first].map(project),b=vertices[second].map(project),overlap=clipTriangle(a,b);if(overlap.length<3||polygonArea(overlap)<=1e-12)continue;
    // ID order only gives one serialization orientation. The normal of the
    // actual second material face, rather than its ID, determines its sign.
    const faceA=Math.min(fa,fb),faceB=Math.max(fa,fb),ia=faceA===fa?first:second,ib=faceB===fb?second:first,ta=ia===first?a:b,tb=ib===second?b:a;
    let sign:1|-1|undefined,complete=true;
    for(const p of overlap){
      const wa=barycentric(p,ta,triangles[ia]),wb=barycentric(p,tb,triangles[ib]);if(!wa||!wb){complete=false;break;}
      const difference:V=[0,0,0];let magnitude=0;
      for(const [weights,direction] of [[wa,1],[wb,-1]] as const)for(const [v,w] of weights){
        const displacement=sub(point(previous.positions,v),point(last.positions,v));
        for(let k=0;k<3;k++)difference[k]+=direction*w*displacement[k];
        magnitude+=Math.abs(w)*Math.hypot(...displacement);
      }
      const gap=dot(normals[ib],difference),epsilon=Math.max(1e-12,magnitude*1e-10);
      if(!Number.isFinite(gap)){complete=false;break;}
      // Zero gaps are legitimate along a common hinge. At least one strictly
      // signed vertex is required, so a fully coincident pair stays unknown.
      if(Math.abs(gap)<=epsilon)continue;
      const side=gap>0?1:-1;if(sign!==undefined&&side!==sign){complete=false;break;}sign=side;
    }
    const existing=proved.get(pair);
    if(!complete||sign===undefined||existing&&existing[2]!==sign){unknown.add(pair);proved.delete(pair);}else proved.set(pair,[faceA,faceB,sign]);
  }
  frames[1].faceOrders=[...proved.values()];return frames;
}

/** Mid-motion zero-gap overlaps retain order only inside a current rigid
 * assembly. The moving assembly may itself contain many old folded layers.
 * Relations between independently moving assemblies are used only at their
 * proved contact endpoint, never to force one sheet through another. */
export function simulationStepLayerOrderAt(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,timeline:readonly SimulationStepLayerFrame[],progress:number,positions?:Float32Array):Row[]{
  if(!Number.isFinite(progress)||!timeline.length)return [];
  const p=Math.max(0,Math.min(1,progress)),endpoint=timeline.find(frame=>Math.abs(frame.progress-p)<=1e-12);
  if(endpoint){
    if(!animation.motion&&positions){const known=new Set(endpoint.faceOrders.map(r=>key(r[0],r[1])));return [...endpoint.faceOrders,...retainedRigidContacts(prepared,animation.initialPositions,positions,timeline[0].faceOrders).filter(r=>!known.has(key(r[0],r[1])))];}
    return endpoint.faceOrders;
  }
  if(!animation.motion)return positions?retainedRigidContacts(prepared,animation.initialPositions,positions,timeline[0].faceOrders):[];
  const phase=animation.motion.phases.find(item=>p>item.start&&p<item.end);if(!phase)return [];
  const previous=timeline.filter(frame=>frame.progress<=phase.start+1e-12).at(-1);if(!previous)return [];
  const bodies=phaseSourceBodies(prepared,phase);return previous.faceOrders.filter(row=>sameBody(row,bodies));
}

/** Numerical/flexible playback has no analytic phase bodies. Retain a seed
 * contact only when every vertex of both source faces still shares one rigid
 * transform. Sliding, bending and independently moving faces fail this test. */
function retainedRigidContacts(prepared:PreparedOrigamiModel,initial:readonly number[],current:Float32Array,rows:readonly Row[]):Row[]{
 if(initial.length!==current.length)return [];
 const source=prepared.triangleSourceFaces??prepared.facesVertices.map((_,i)=>i),faces=new Map<number,Set<number>>(),seeds=new Map<number,readonly number[]>();
 prepared.facesVertices.forEach((t,i)=>{const face=source[i],ids=faces.get(face)??new Set<number>();t.forEach(v=>ids.add(v));faces.set(face,ids);if(!seeds.has(face))seeds.set(face,t);});
 const basis=(positions:ArrayLike<number>,ids:readonly number[])=>{
  const o=point(positions,ids[0]),u=sub(point(positions,ids[1]),o),v=sub(point(positions,ids[2]),o),n=cross(u,v),lu=Math.hypot(...u),ln=Math.hypot(...n);
  if(!(lu>0&&ln>lu*lu*1e-12))return null;
  const x=u.map(a=>a/lu) as V,z=n.map(a=>a/ln) as V,y=cross(z,x);return {o,x,y,z,condition:Math.max(1,lu*Math.hypot(...v)/ln)};
 };
 const checks=new Map<number,{before:NonNullable<ReturnType<typeof basis>>;after:NonNullable<ReturnType<typeof basis>>}|null>();
 const frame=(face:number)=>{if(checks.has(face))return checks.get(face)!;const ids=seeds.get(face),before=ids?basis(initial,ids):null,after=ids?basis(current,ids):null,result=before&&after?{before,after}:null;checks.set(face,result);return result;};
 return rows.filter(([a,b])=>{
  const f=frame(a),first=faces.get(a),second=faces.get(b);if(!f||!first||!second)return false;
  const ids=[...first,...second];let scale=0;
  for(const v of ids)for(let k=0;k<3;k++)scale=Math.max(scale,Math.abs(initial[v*3+k]),Math.abs(current[v*3+k]));
  const tolerance=Math.max(2**-140,scale*2**-20)*Math.max(f.before.condition,f.after.condition);
  return ids.every(v=>{const p=sub(point(initial,v),f.before.o),q=sub(point(current,v),f.after.o);return ['x','y','z'].every(key=>Math.abs(dot(p,f.before[key as 'x'])-dot(q,f.after[key as 'x']))<=tolerance);});
 });
}
