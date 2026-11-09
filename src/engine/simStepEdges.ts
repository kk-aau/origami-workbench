import type {FoldAssignment,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {SimulationStepAnimation} from './simStepAnimation';

type EdgeModel=Pick<PreparedOrigamiModel,'edgesAssignment'|'edgesFaces'|'facesVertices'|'triangleSourceFaces'>&{creaseParams?:readonly {edge:number}[]};
type EdgeCamera=Pick<CameraUniforms,'center'|'rotation'|'camDist'>;
const ANGLE_EPSILON=1e-8;

/** Render-only edge roles. F suppresses a stroke; B keeps the paper-outline
 * style. The caller uses the neutral crease style for remaining M/V strokes,
 * while retaining its normal depth/occlusion test for every visible edge. */
export function simulationStepDisplayAssignments(prepared:EdgeModel,animation:Pick<SimulationStepAnimation,'ranges'|'motion'|'flex'|'dynamic'|'retainedCreases'|'timings'>,positions:ArrayLike<number>,camera:EdgeCamera,progress:number):FoldAssignment[] {
  const assignments=[...prepared.edgesAssignment],ranges=new Map(animation.ranges.map(range=>[range.edge,range])),retained=new Set(animation.retainedCreases??[]);
  // Planned phases can fold and unfold separate batches at different times.
  // A future crease must stay hidden until its own first movement; rewinding
  // uses the same deterministic time lookup, without retaining playback state.
  const firstMovement=new Map<number,number>();
  if(animation.motion){
    const edges=prepared.creaseParams?.map(crease=>crease.edge)??animation.ranges.map(range=>range.edge);
    for(const phase of animation.motion.phases)for(let i=0;i<edges.length;i++){
      if(!firstMovement.has(edges[i])&&Math.abs(phase.toAngles[i]-phase.fromAngles[i])>ANGLE_EPSILON)firstMovement.set(edges[i],phase.start);
    }
  }
  if(animation.flex?.batches)for(const batch of animation.flex.batches)for(const edge of batch.edges)firstMovement.set(edge,batch.start);
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
    const range=ranges.get(edge),from=range?.fromAngle??0,to=range?.toAngle??0,via=range?.viaAngle??0;
    const newCrease=Math.abs(from)<=ANGLE_EPSILON&&(Math.abs(to)>ANGLE_EPSILON||Math.abs(via)>ANGLE_EPSILON);
    // Initial hiding has priority even when the candidate edge is a silhouette.
    const starts=animation.motion||animation.flex?.batches?firstMovement.get(edge):(animation.timings?.find(t=>t.edge===edge)?.start??0)*(animation.dynamic?.settleStart??1);
    if(newCrease&&!retained.has(edge)&&!(starts!==undefined&&Number.isFinite(progress)&&progress>starts)){assignments[edge]='F';continue;}
    const neighbors=prepared.edgesFaces[edge]??[];
    if(original==='F'){
      const source=prepared.triangleSourceFaces;
      const sourceCrease=neighbors.length===2&&source&&source[neighbors[0]]!==source[neighbors[1]];
      const drivenCrease=newCrease||Math.abs(from)>ANGLE_EPSILON;
      // Generated triangulation diagonals and their zero-angle ranges are not
      // paper creases. A genuine F precrease remains visible after unfolding.
      if(!sourceCrease&&!drivenCrease&&!retained.has(edge))continue;
      assignments[edge]=(from||via||to)<0?'M':'V';
    }
    if(neighbors.length===2&&facing[neighbors[0]]*facing[neighbors[1]]===-1)assignments[edge]='B';
  }
  return assignments;
}
