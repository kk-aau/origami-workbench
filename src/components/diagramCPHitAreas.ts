import type {Point} from '../core/types';

/** Sizes are in the same 256-unit viewBox as the paper, never screen pixels. */
export function diagramCPHitAreas(vertices:readonly Point[],edges:readonly (readonly [number,number])[],faces:readonly {rings:readonly (readonly number[])[];clearance:number}[]){
  const vertexRadii=vertices.map(()=>4.5),edgeWidths=edges.map(()=>5);
  const edgeIndices=new Map<string,number[]>();
  const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
  edges.forEach(([a,b],index)=>{
    if(!vertices[a]||!vertices[b])return;
    const length=Math.hypot(vertices[a][0]-vertices[b][0],vertices[a][1]-vertices[b][1]);
    if(length>1e-6){
      vertexRadii[a]=Math.min(vertexRadii[a],length*.22);
      vertexRadii[b]=Math.min(vertexRadii[b],length*.22);
      edgeWidths[index]=Math.min(edgeWidths[index],length*.24);
    }
    const pair=key(a,b),indices=edgeIndices.get(pair)??[];indices.push(index);edgeIndices.set(pair,indices);
  });
  for(const {rings,clearance} of faces){
    if(!Number.isFinite(clearance)||clearance<=0)continue;
    for(const ring of rings)ring.forEach((v,i)=>{
      // Leave a clear interior around every face's label point, including slivers.
      vertexRadii[v]=Math.min(vertexRadii[v],clearance*.4);
      for(const edge of edgeIndices.get(key(v,ring[(i+1)%ring.length]))??[])
        edgeWidths[edge]=Math.min(edgeWidths[edge],clearance*.8);
    });
  }
  return {vertexRadii,edgeWidths};
}
