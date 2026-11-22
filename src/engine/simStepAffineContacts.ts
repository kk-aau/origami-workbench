import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {createContactEmbeddingVerifier} from './simContactEmbedding';
import {closedHingesDuring,coincidentStepCoordinates} from './simStepClosedHinges';
import {trianglePlaneLookup,reliablePlane,sameTrianglePlane,vectorDot} from './simTrianglePlane';
import {findSimulationStepCoincidentLayers} from './simStepCoincidentLayers';

type Triangle=readonly number[];
type Packet={vertices:number[];basis:Triangle;weights:number[][]};
type Recording=NonNullable<SimulationStepAnimation['dynamic']>;

function groups(prepared:PreparedOrigamiModel,closed:ReadonlySet<number>,seed:ReturnType<typeof trianglePlaneLookup>){
  const triangles=prepared.facesVertices,source=prepared.triangleSourceFaces??triangles.map((_,i)=>i);
  const parents=triangles.map((_,i)=>i);
  const root=(i:number):number=>{while(i!==parents[i]){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(const [i,{face1:a,face2:b}] of prepared.creaseParams.entries()){
    if(source[a]!==source[b]&&!closed.has(i))continue;
    const p=seed(a),q=seed(b);
    // Consistently wound incident faces point in opposite directions only
    // after actually folding back over their common material hinge.
    if(!reliablePlane(p)||!reliablePlane(q)||!sameTrianglePlane(p,q)||
      (source[a]!==source[b]&&vectorDot(p.normal,q.normal)>=0))continue;
    parents[root(a)]=root(b);
  }
  const bySource=new Map<number,number>(),members=new Map<number,Triangle[]>();
  triangles.forEach((tri,i)=>{
    const face=source[i],group=root(i),known=bySource.get(face);
    bySource.set(face,known===undefined||known===group?group:-1);
    const list=members.get(group)??[];list.push(tri);members.set(group,list);
  });
  return {bySource,members};
}

function planePacket(triangles:Triangle[],initial:ArrayLike<number>):Packet|null{
  const vertices=[...new Set(triangles.flatMap(triangle=>[...triangle]))];
  const anchor=vertices[0],a=3*anchor;
  let end=anchor,maxLength=0;
  for(const v of vertices){
    const i=3*v,length=Math.hypot(initial[i]-initial[a],initial[i+1]-initial[a+1],initial[i+2]-initial[a+2]);
    if(length>maxLength){end=v;maxLength=length;}
  }
  // Span the packet itself; using a small subdivision triangle as a basis
  // would amplify the uncertainty of coordinates far beyond that triangle.
  const b=3*end;
  let third=anchor,axes:number[]=[],greatest=0;
  for(const v of vertices){
    const c=3*v;
    for(const [x,y] of [[0,1],[0,2],[1,2]]){
      const det=(initial[b+x]-initial[a+x])*(initial[c+y]-initial[a+y])-(initial[c+x]-initial[a+x])*(initial[b+y]-initial[a+y]);
      if(Math.abs(det)>Math.abs(greatest)){third=v;axes=[x,y];greatest=det;}
    }
  }
  if(!greatest)return null;
  const c=3*third,[x,y]=axes;
  const weights=vertices.map(i=>{
    const v=3*i,dx=initial[v+x]-initial[a+x],dy=initial[v+y]-initial[a+y];
    const u=(dx*(initial[c+y]-initial[a+y])-dy*(initial[c+x]-initial[a+x]))/greatest;
    const w=(dy*(initial[b+x]-initial[a+x])-dx*(initial[b+y]-initial[a+y]))/greatest;
    return [1-u-w,u,w];
  });
  const packet={basis:[anchor,end,third],vertices,weights};
  return matchesPacket(packet,initial)?packet:null;
}

function matchesPacket(packet:Packet,positions:ArrayLike<number>){
  const [a,b,c]=packet.basis.map(v=>3*v);
  return packet.vertices.every((v,i)=>{
    const [u,w,t]=packet.weights[i];
    for(let k=0;k<3;k++){
      const x=u*positions[a+k],y=w*positions[b+k],z=t*positions[c+k],actual=positions[3*v+k];
      // Coordinate-local Float32 storage errors, scaled by the actual weights.
      // A large coordinate on another sheet cannot hide real slip at this one.
      const tolerance=Math.max(2**-145,(Math.abs(x)+Math.abs(y)+Math.abs(z)+Math.abs(actual))*2**-22);
      if(!Number.isFinite(actual)||Math.abs(x+y+z-actual)>tolerance)return false;
    }
    return true;
  });
}

function track(packet:Packet,frames:Recording['keyframes']){
  const basis=(p:ArrayLike<number>)=>packet.basis.flatMap(v=>[p[v*3],p[v*3+1],p[v*3+2]]);
  const staysInvertible=createContactEmbeddingVerifier([0,1,2]);
  let through=-1,failedAt=Infinity;
  return (frame:number,current:Float32Array)=>{
    while(through<frame&&failedAt===Infinity){
      const i=through+1,p=frames[i].positions;
      if(!matchesPacket(packet,p)||i>0&&!staysInvertible(basis(frames[i-1].positions),basis(p),0)){failedAt=i;break;}
      through=i;
    }
    // Every recorded segment interpolates vertices linearly. Fixed weights
    // valid at both ends remain valid throughout, provided the common basis
    // never collapses. Seeking back before a failed segment still works.
    return frame<failedAt&&matchesPacket(packet,current)&&staysInvertible(basis(frames[frame].positions),basis(current),0);
  };
}

function prepare(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation){
  const seed=trianglePlaneLookup(Float32Array.from(animation.initialPositions),prepared.indices);
  const initial=new Set<number>(),closed=new Set<number>(),closedRanges=closedHingesDuring(animation,0,1);
  const indices=new Map(prepared.creaseParams.map((c,i)=>[c.edge,i]));
  animation.ranges.forEach((r,i)=>{
    const hinge=indices.get(r.edge);if(hinge===undefined||Math.abs(r.fromAngle)!==180)return;
    initial.add(hinge);if(closedRanges.has(i))closed.add(hinge);
  });
  if(!initial.size)return;
  const held=groups(prepared,closed,seed),start=initial.size===closed.size?held:groups(prepared,initial,seed);
  const frames=animation.dynamic!.keyframes,checks=new Map<number,ReturnType<typeof track>|null>();
  const trianglesByFace=new Map<number,Triangle[]>();
  prepared.facesVertices.forEach((triangle,i)=>{
    const face=prepared.triangleSourceFaces?.[i]??i;
    const list=trianglesByFace.get(face)??[];list.push(triangle);trianglesByFace.set(face,list);
  });
  // A remote flap can open in the same connected stack. The two pinned
  // sheets keep their own initial order throughout every stationary segment.
  const pins=new Set(animation.fixedVertices),stationary=new Map<number,{vertices:number[];until:number}>();
  const atSeed=(p:ArrayLike<number>,v:number)=>[0,1,2].every(k=>Math.fround(p[3*v+k])===Math.fround(animation.initialPositions[3*v+k]));
  for(const [face,triangles] of trianglesByFace){
    const vertices=[...new Set(triangles.flat())];
    if(!vertices.every(v=>pins.has(v)))continue;
    const firstMove=frames.findIndex(f=>vertices.some(v=>!atSeed(f.positions,v)));
    stationary.set(face,{vertices,until:firstMove<0?frames.length:firstMove});
  }
  const pairs=new Map<string,ReturnType<typeof track>|null>();
  return (progress:number,current:Float32Array)=>{
    let frame=0;
    while(frame+1<frames.length&&frames[frame].progress<progress)frame++;
    const result=new Map<number,boolean>();
    const still=new Map<number,boolean>();
    function isStationary(face:number){
      if(!still.has(face)){
        const sheet=stationary.get(face);
        still.set(face,!!sheet&&frame<sheet.until&&sheet.vertices.every(v=>atSeed(current,v)));
      }
      return still.get(face);
    }
    return (a:number,b:number):boolean|undefined=>{
      if(isStationary(a)&&isStationary(b))return true;
      const first=start.bySource.get(a);
      if(first===undefined||first<0||first!==start.bySource.get(b))return undefined;
      const group=held.bySource.get(a);
      if(group===undefined||group<0||group!==held.bySource.get(b)||!frames.length)return false;
      if(!result.has(group)){
        if(!checks.has(group)){
          const packet=planePacket(held.members.get(group)!,animation.initialPositions);
          checks.set(group,packet?track(packet,frames):null);
        }
        result.set(group,checks.get(group)?.(frame,current)??false);
      }
      if(result.get(group))return true;
      // Even a permanently closed chain may strain elsewhere. Test the
      // two actual panels with the same continuous affine-contact proof.
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(!pairs.has(key)){
        const local=planePacket([...trianglesByFace.get(a)!,...trianglesByFace.get(b)!],animation.initialPositions);
        pairs.set(key,local?track(local,frames):null);
      }
      return pairs.get(key)?.(frame,current)??false;
    };
  };
}

const cache=new WeakMap<SimulationStepAnimation,{prepared:PreparedOrigamiModel;lookup:ReturnType<typeof prepare>}>();

/** Called only for an established initial layer relation. Undefined delegates
 * unrelated sheets to the existing common-rigid-transform display test. */
export function dynamicPacketContact(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,progress:number,current:Float32Array){
  if(!animation.dynamic)return;
  let entry=cache.get(animation);
  if(!entry||entry.prepared!==prepared){entry={prepared,lookup:prepare(prepared,animation)};cache.set(animation,entry);}
  return entry.lookup?.(progress,current);
}

function prepareMergedFaces(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation){
  const {faceBodies,vertexGroups}=findSimulationStepCoincidentLayers(prepared,animation);
  const classes=new Map<number,Set<number>>(),vertexClass=new Map<number,number>();
  vertexGroups.forEach((ids,c)=>ids.forEach(v=>vertexClass.set(v,c)));
  prepared.facesVertices.forEach((triangle,t)=>{
    const group=faceBodies[prepared.triangleSourceFaces?.[t]??t];
    if(group===undefined||group<0)return;
    const involved=classes.get(group)??new Set<number>();classes.set(group,involved);
    for(const v of triangle){
      const c=vertexClass.get(v);if(c!==undefined)involved.add(c);
    }
  });
  const weldedByBody=new Map(Array.from(classes,([body,ids])=>[body,Array.from(ids,c=>vertexGroups[c])] as const));
  return {faceBodies,weldedByBody};
}

const mergedFaceCache=new WeakMap<SimulationStepAnimation,{prepared:PreparedOrigamiModel;faces:ReturnType<typeof prepareMergedFaces>}>();

/** Only recordings validated as using shared simulation vertices carry this
 * guarantee. Their union can bend out of plane while each layer continues to
 * occupy the same material patch. Screen-space overlap alone proves nothing. */
export function mergedStepContactAt(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,current:Float32Array){
  if(!animation.dynamic?.mergedLayers)return;
  let entry=mergedFaceCache.get(animation);
  if(!entry||entry.prepared!==prepared){
    entry={prepared,faces:prepareMergedFaces(prepared,animation)};mergedFaceCache.set(animation,entry);
  }
  const {faceBodies,weldedByBody}=entry.faces;
  if(!weldedByBody.size)return;
  // Captures and the stationary-layer switch can supply different displayed
  // positions. Check the same local coincidence bound used at import.
  const seed=animation.initialPositions;
  const matches=new Map<number,boolean>();
  return (a:number,b:number)=>{
    const group=faceBodies[a];
    if(group===undefined||group<0||group!==faceBodies[b])return false;
    if(!matches.has(group)){
      const welded=weldedByBody.get(group);
      const valid=!!welded?.length&&coincidentStepCoordinates(current,welded,seed);
      matches.set(group,valid);
    }
    return matches.get(group)!;
  };
}
