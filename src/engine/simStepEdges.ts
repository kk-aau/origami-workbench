import type {FoldAssignment,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {simulationStepFoldProfile,type SimulationStepAnimation} from './simStepAnimation';

type EdgeModel=Pick<PreparedOrigamiModel,'edgesAssignment'|'edgesFaces'|'facesVertices'|'triangleSourceFaces'>&{creaseParams?:readonly {edge:number}[]};
type EdgeCamera=Pick<CameraUniforms,'center'|'rotation'|'camDist'>;
const ANGLE_EPSILON=1e-8;

/** Captures need the authored F identity, which display assignments encode as V
 * merely to make it visible. A numerical sheet may curve across a zero-angle
 * mark; this does not turn that mark into a folded contour. Moving hinges keep
 * the geometry-based role, and the renderer gives actual silhouettes priority. */
export function simulationStepFlatCreases(animation:SimulationStepAnimation,progress:number):ReadonlySet<number> {
  return new Set(simulationStepFoldProfile(animation,progress).ranges
    .filter(range=>animation.targetCreases?.[range.edge]==='F'&&Math.abs(range.fromAngle)<=ANGLE_EPSILON)
    .map(range=>range.edge));
}

/** Render-only edge roles. F suppresses a stroke; B keeps the paper-outline
 * style. The caller uses the neutral crease style for remaining M/V strokes,
 * while retaining its normal depth/occlusion test for every visible edge. */
export function simulationStepDisplayAssignments(prepared:EdgeModel,animation:Pick<SimulationStepAnimation,'ranges'|'motion'|'flex'|'dynamic'|'retainedCreases'|'timings'|'targetCreases'>,positions:ArrayLike<number>,camera:EdgeCamera,progress:number,ink:'motion'|'target'='motion'):FoldAssignment[] {
  const assignments=[...prepared.edgesAssignment],ranges=new Map(animation.ranges.map(range=>[range.edge,range])),retained=new Set(animation.retainedCreases??[]);
  // Planned phases can fold and unfold separate batches at different times.
  // A future crease must stay hidden until its own first movement; rewinding
  // uses the same deterministic time lookup, without retaining playback state.
  const target=ink==='target'?animation.targetCreases:undefined;
  const firstMovement=new Map<number,number>();
  if(!target&&animation.motion){
    const edges=prepared.creaseParams?.map(crease=>crease.edge)??animation.ranges.map(range=>range.edge);
    for(const phase of animation.motion.phases)for(let i=0;i<edges.length;i++){
      if(!firstMovement.has(edges[i])&&Math.abs(phase.toAngles[i]-phase.fromAngles[i])>ANGLE_EPSILON)firstMovement.set(edges[i],phase.start);
    }
  }
  if(!target&&animation.flex?.batches)for(const batch of animation.flex.batches)for(const edge of batch.edges)firstMovement.set(edge,batch.start);
  const eye=camera.center.map((value,k)=>value+camera.camDist*camera.rotation[k+6]);
  const facing=prepared.facesVertices.map(face=>{
    if(face.length<3)return 0;
    const a=face[0]*3,b=face[1]*3,c=face[2]*3;
    const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
    const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const rx=eye[0]-positions[a],ry=eye[1]-positions[a+1],rz=eye[2]-positions[a+2];
    const value=nx*rx+ny*ry+nz*rz,tolerance=Math.hypot(nx,ny,nz)*Math.hypot(rx,ry,rz)*1e-9;
    return Number.isFinite(value)&&Number.isFinite(tolerance)&&Math.abs(value)>tolerance?Math.sign(value):0;
  });
  for(let edge=0;edge<assignments.length;edge++){
    const original=assignments[edge];
    if(original!=='M'&&original!=='V'&&original!=='F')continue;
    const neighbors=prepared.edgesFaces[edge]??[];
    const silhouette=neighbors.length===2&&facing[neighbors[0]]*facing[neighbors[1]]===-1;
    if(target){
      const mark=target[edge];
      // The renderers use F for a hidden facet. A real flat CP mark uses a
      // visible stroke, kept neutral by the target colour scope below.
      assignments[edge]=silhouette?'B':mark==='F'?'V':mark??'F';
      continue;
    }
    const range=ranges.get(edge),from=range?.fromAngle??0,to=range?.toAngle??0,via=range?.viaAngle??0;
    const newCrease=Math.abs(from)<=ANGLE_EPSILON&&(Math.abs(to)>ANGLE_EPSILON||Math.abs(via)>ANGLE_EPSILON);
    // Initial hiding has priority even when the candidate edge is a silhouette.
    const starts=animation.motion||animation.flex?.batches?firstMovement.get(edge):(animation.timings?.find(t=>t.edge===edge)?.start??0)*(animation.dynamic?.settleStart??1);
    if(newCrease&&!retained.has(edge)&&!(starts!==undefined&&Number.isFinite(progress)&&progress>starts)){assignments[edge]='F';continue;}
    if(original==='F'){
      const source=prepared.triangleSourceFaces;
      const sourceCrease=neighbors.length===2&&source&&source[neighbors[0]]!==source[neighbors[1]];
      const drivenCrease=newCrease||Math.abs(from)>ANGLE_EPSILON;
      // Generated triangulation diagonals and their zero-angle ranges are not
      // paper creases. A genuine F precrease remains visible after unfolding.
      if(!sourceCrease&&!drivenCrease&&!retained.has(edge))continue;
      assignments[edge]=(from||via||to)<0?'M':'V';
    }
    if(silhouette)assignments[edge]='B';
  }
  return assignments;
}


const targetColors=new WeakMap<object,ReadonlySet<number>>();
export function simulationStepTargetColors(prepared:Pick<EdgeModel,'creaseParams'>,animation:Pick<SimulationStepAnimation,'ranges'|'motion'|'flex'|'targetCreases'>):ReadonlySet<number> {
  const target=animation.targetCreases;
  if(!target)return simulationStepChangedCreases(prepared,animation);
  const cached=targetColors.get(animation);if(cached)return cached;
  const edges=new Set(animation.ranges.filter(r=>(target[r.edge]==='M'||target[r.edge]==='V')&&Math.abs(r.toAngle-r.fromAngle)>ANGLE_EPSILON).map(r=>r.edge));
  targetColors.set(animation,edges);return edges;
}

const changedCreases=new WeakMap<object,{prepared:object;edges:ReadonlySet<number>}>();
/** Display scope follows the whole authored motion, including fold-and-unfold passes. */
export function simulationStepChangedCreases(prepared:Pick<EdgeModel,'creaseParams'>,animation:Pick<SimulationStepAnimation,'ranges'|'motion'|'flex'>):ReadonlySet<number> {
  const cached=changedCreases.get(animation);if(cached?.prepared===prepared)return cached.edges;
  const edges=new Set<number>();
  for(const range of animation.ranges){
    if(Math.abs(range.toAngle-range.fromAngle)>ANGLE_EPSILON||range.viaAngle!==undefined&&Math.abs(range.viaAngle-range.fromAngle)>ANGLE_EPSILON)edges.add(range.edge);
  }
  if(animation.motion){
    const driven=prepared.creaseParams?.map(crease=>crease.edge)??animation.ranges.map(range=>range.edge);
    for(const phase of animation.motion.phases)for(let i=0;i<driven.length;i++){
      if(Math.abs(phase.toAngles[i]-phase.fromAngles[i])>ANGLE_EPSILON)edges.add(driven[i]);
    }
  }
  if(animation.flex?.foldLimit)for(const batch of animation.flex.batches??[])for(const edge of batch.edges)edges.add(edge);
  changedCreases.set(animation,{prepared,edges});return edges;
}
