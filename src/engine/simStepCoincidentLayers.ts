import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';

type MaterialMesh=Pick<PreparedOrigamiModel,'facesVertices'|'sourceFaceCount'|'triangleSourceFaces'|'vertexCount'|'edgesVertices'>&{
  creaseParams:Pick<PreparedOrigamiModel['creaseParams'][number],'edge'|'face1'|'face2'>[];
};
export interface SimulationStepCoincidentLayers {
  /** Original material vertex indices with the same seed position and motion. */
  vertexGroups:number[][];
  /** Same ID proves common motion, not overlap. -1 means unproved. */
  faceBodies:number[];
}

function partitions(count:number){
  const parent=Array.from({length:count},(_,i)=>i);
  function root(i:number):number{
    while(i!==parent[i]){parent[i]=parent[parent[i]];i=parent[i];}
    return i;
  }
  function join(a:number,b:number){
    a=root(a);b=root(b);
    if(a===b)return false;
    parent[Math.max(a,b)]=Math.min(a,b);return true;
  }
  return {root,join};
}

// Work in the radius-normalised simulation seed. Only cover roundoff of
// earlier rigid transforms. A real gap along the viewing axis stays a gap.
function seedPoints(positions:readonly number[]){
  const order=Array.from({length:positions.length/3},(_,i)=>i).sort((a,b)=>positions[a*3]-positions[b*3]);
  const scale=positions.reduce((max,n)=>Math.max(max,Math.abs(n)),0),epsilon=scale*128*Number.EPSILON;
  const representatives:number[]=[];
  for(let i=0;i<order.length;i++){
    const v=order[i];representatives[v]=v;
    for(let j=i-1;j>=0;j--){
      const w=order[j];if(positions[v*3]-positions[w*3]>epsilon)break;
      if(representatives[w]!==w)continue;
      if(Math.abs(positions[w*3+1]-positions[v*3+1])<=epsilon&&Math.abs(positions[w*3+2]-positions[v*3+2])<=epsilon){
        representatives[v]=w;break;
      }
    }
  }
  return representatives;
}

/** Certify common material motion starting from connected constant-angle
 * triangles. Relative rotations match only when their parent already moves
 * together, the two axis endpoints coincide and the complete signed angle
 * law is identical. Repeat because the matched children can drive further
 * superposed hinges. Neither camera depth nor a sorted face ID is evidence. */
export function findSimulationStepCoincidentLayers(prepared:MaterialMesh,animation:SimulationStepAnimation):SimulationStepCoincidentLayers{
  const triangles=prepared.facesVertices,source=prepared.triangleSourceFaces??triangles.map((_,i)=>i);
  const faceCount=prepared.sourceFaceCount??Math.max(-1,...source)+1;
  const faceBodies=Array<number>(faceCount).fill(-1);
  const empty={vertexGroups:[],faceBodies};
  if(animation.materialMode==='bendable'||animation.flex||animation.initialPositions.length!==3*prepared.vertexCount)return empty;
  const byEdge=new Map(animation.ranges.map(r=>[r.edge,r]));
  const timing=new Map(animation.timings?.map(t=>[t.edge,t]));
  const point=seedPoints(animation.initialPositions);
  const bodies=partitions(triangles.length);
  const active:Array<{a:number;b:number;axis:string;forward:string;reverse:string}>=[];
  for(const [i,c] of prepared.creaseParams.entries()){
    const r=byEdge.get(c.edge);if(!r)return empty;
    const startAngle=r.fromAngle;
    const t=timing.get(c.edge);
    const ds=[(r.viaAngle??(r.fromAngle+r.toAngle)/2)-r.fromAngle,r.toAngle-r.fromAngle];
    const phases=animation.dynamic?undefined:animation.motion?.phases;
    const moving=phases?phases.some(p=>p.fromAngles[i]!==p.toAngles[i]):ds.some(x=>x!==0);
    if(!moving){bodies.join(c.face1,c.face2);continue;}
    const [v,w]=prepared.edgesVertices[c.edge].map(index=>point[index]);if(v===w)return empty;
    // FOLD signs describe rotation relative to face1 and to the directed
    // edge. Reversing either one reverses the world angular displacement.
    function law(sign:number){
      if(phases)return JSON.stringify(phases.map(p=>{
        const from=p.fromAngles[i],to=p.toAngles[i];
        return [sign*(from-startAngle),sign*(to-startAngle),
          ...(p.kind==='tangent'&&from!==to?[p.coefficients![i],Math.abs(from)<1e-8]:[])];
      }));
      return JSON.stringify([t?.start??0,t?.end??1,...ds.map(x=>sign*x)]);
    }
    const sign=v<w?-1:1;
    active.push({a:c.face1,b:c.face2,axis:Math.min(v,w)+','+Math.max(v,w),forward:law(sign),reverse:law(-sign)});
  }
  let changed=true;
  while(changed){
    changed=false;
    const children=new Map<string,number>();
    for(const {a,b,axis,forward,reverse} of active){
      for(const [parent,child,law] of [[a,b,forward],[b,a,reverse]] as const){
        const k=bodies.root(parent)+'/'+axis+'/'+law,other=children.get(k);
        if(other===undefined)children.set(k,child);
        else if(bodies.join(other,child))changed=true;
      }
    }
  }
  // A nonzero hinge inside its own proposed rigid body contradicts the
  // motion proof; a flexible numerical loop must retain its independent DOFs.
  const invalid=new Set(active.filter(h=>bodies.root(h.a)===bodies.root(h.b)).map(h=>bodies.root(h.a)));
  const vertices=partitions(prepared.vertexCount),atPoint=new Map<string,number>();
  const ambiguous=new Set<number>();
  for(const [i,tri] of triangles.entries()){
    const body=bodies.root(i),f=source[i];
    if(invalid.has(body)){ambiguous.add(f);continue;}
    if(faceBodies[f]>=0&&faceBodies[f]!==body)ambiguous.add(f);
    faceBodies[f]=body;
    for(const v of tri){
      const key=body+'/'+point[v],other=atPoint.get(key);
      if(other===undefined)atPoint.set(key,v);else vertices.join(v,other);
    }
  }
  for(const f of ambiguous)faceBodies[f]=-1;
  const vertexSets=new Map<number,number[]>();
  for(let v=0;v<prepared.vertexCount;v++){
    const id=vertices.root(v),list=vertexSets.get(id);
    if(list)list.push(v);else vertexSets.set(id,[v]);
  }
  return {vertexGroups:[...vertexSets.values()].filter(row=>row.length>1),faceBodies};
}
