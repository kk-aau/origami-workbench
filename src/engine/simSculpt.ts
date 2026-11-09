import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';

type SculptMesh=Pick<PreparedOrigamiModel,'vertexCount'|'originalPositions'|'edgesVertices'|'facesVertices'>;
type Pins=SolverPoseSnapshot['pins'];

/** Choose a remote support in material space, even when distant paper layers
 * overlap in the folded view. The caller installs these temporary pins in one
 * batch, then removes only these pins when the gesture ends. null means there
 * is no usable support; [] means existing user pins already provide it. */
export function simulationSculptSupports(model:SculptMesh,positions:ArrayLike<number>,grabbedIndex:number,existingPins:readonly Pins[number][]=[]):Pins|null {
  const count=model.vertexCount,rest=model.originalPositions;
  if(!Number.isInteger(grabbedIndex)||grabbedIndex<0||grabbedIndex>=count||positions.length!==count*3||rest.length!==positions.length)return null;
  for(let i=0;i<positions.length;i++)if(!Number.isFinite(positions[i])||!Number.isFinite(rest[i]))return null;
  const pinned=new Set(existingPins.map(pin=>pin.index));
  if(pinned.has(grabbedIndex))return null;
  const neighbours=Array.from({length:count},():Array<[number,number]>=>[]);
  for(const [a,b] of model.edgesVertices){
    if(a<0||a>=count||b<0||b>=count||!Number.isInteger(a)||!Number.isInteger(b))return null;
    const length=Math.hypot(rest[a*3]-rest[b*3],rest[a*3+1]-rest[b*3+1],rest[a*3+2]-rest[b*3+2]);
    if(length>0){neighbours[a].push([b,length]);neighbours[b].push([a,length]);}
  }
  // Dijkstra with a small binary heap. A breadth-first distance would prefer
  // dense triangulations over genuinely remote material on uneven meshes.
  const distances=new Float64Array(count).fill(Infinity),heap:Array<[number,number]>=[];
  const push=(entry:[number,number])=>{
    let at=heap.length;heap.push(entry);
    while(at>0){const parent=(at-1)>>1;if(heap[parent][1]<=entry[1])break;heap[at]=heap[parent];at=parent;}
    heap[at]=entry;
  };
  const pop=()=>{
    const first=heap[0],last=heap.pop()!;
    if(heap.length){
      let at=0;
      while(at*2+1<heap.length){let child=at*2+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;
        if(heap[child][1]>=last[1])break;heap[at]=heap[child];at=child;}
      heap[at]=last;
    }
    return first;
  };
  distances[grabbedIndex]=0;push([grabbedIndex,0]);
  while(heap.length){
    const [vertex,distance]=pop();if(distance!==distances[vertex])continue;
    for(const [next,length] of neighbours[vertex]){const candidate=distance+length;if(candidate<distances[next]){distances[next]=candidate;push([next,candidate]);}}
  }
  let support:number[]|null=null,bestNear=-1,bestSum=-1;
  for(const face of model.facesVertices){
    if(face.length!==3||face.includes(grabbedIndex)||face.some(v=>!Number.isInteger(v)||v<0||v>=count||!Number.isFinite(distances[v])))continue;
    const [a,b,c]=face;
    const ux=positions[b*3]-positions[a*3],uy=positions[b*3+1]-positions[a*3+1],uz=positions[b*3+2]-positions[a*3+2];
    const vx=positions[c*3]-positions[a*3],vy=positions[c*3+1]-positions[a*3+1],vz=positions[c*3+2]-positions[a*3+2];
    const longest=Math.max(ux*ux+uy*uy+uz*uz,vx*vx+vy*vy+vz*vz,(ux-vx)**2+(uy-vy)**2+(uz-vz)**2);
    const area=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
    // Three collinear or collapsed points do not prevent rigid rotation.
    if(!(longest>0)||!Number.isFinite(longest)||area<=longest*1e-8)continue;
    const near=Math.min(distances[a],distances[b],distances[c]),sum=distances[a]+distances[b]+distances[c];
    if(near>bestNear||near===bestNear&&sum>bestSum){support=face;bestNear=near;bestSum=sum;}
  }
  // A deliberately placed user pin can support a very small or degenerate
  // component. A pin on a disconnected sheet cannot support this component.
  if(!support&&!existingPins.some(pin=>Number.isFinite(distances[pin.index])))return null;
  const indices=new Set(support??[]);
  // Other disconnected sheets must retain their current poses while this
  // component temporarily runs without its original crease-angle forces.
  for(let vertex=0;vertex<count;vertex++)if(!Number.isFinite(distances[vertex]))indices.add(vertex);
  return Array.from(indices).filter(index=>!pinned.has(index)).map(index=>({index,position:[positions[index*3],positions[index*3+1],positions[index*3+2]]}));
}
