/** Minimal two-sheet diagnostic: a U face overlaps a bar in two lobes. */
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import earcut from 'earcut';
import {selectLayerSolution,type LayerNode} from '../src/core/layerSolutions';
import {flatLayerEdges} from '../src/core/flatLayerOrder';

const vertices_coords=[
  [0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],
  [.5,2],[3.5,2],[3.5,2.5],[.5,2.5],
];
const faces_vertices=[[0,1,2,3,4,5,6,7],[8,9,10,11]];
const edges_vertices=faces_vertices.flatMap(face=>face.map((v,i)=>
  [v,face[(i+1)%face.length]]));
const source={vertices_coords,faces_vertices,edges_vertices,
  edges_assignment:edges_vertices.map(()=>'B'),
  edges_foldAngle:edges_vertices.map(()=>0)};
const {result:split,changes}=ear.graph.triangulate(source,earcut);
assert.deepEqual(split.edges_assignment?.slice(0,edges_vertices.length),
  source.edges_assignment);
assert.ok(changes.edges!.new.every(e=>split.edges_assignment?.[e]==='J'));
const parent:number[]=[];
changes.faces!.map.forEach((children,f)=>children.forEach(child=>{parent[child]=f;}));
const tree=ear.layer(split,1e-7) as unknown as LayerNode;
const all=selectLayerSolution(tree,0);
const normals=split.faces_vertices!.map(f=>{
  const p=f.map(v=>split.vertices_coords![v]);
  const area=p.reduce((sum,q,i)=>{
    const r=p[(i+1)%p.length];return sum+q[0]*r[1]-q[1]*r[0];
  },0);
  return Math.sign(area);
});
let conflicting=0,consistent=0;
const conflictingIndices:number[]=[];
for(let i=0;i<Math.min(Number(all.count),10000);i++){
  const candidate=selectLayerSolution(tree,i).orders!;
  const directions=new Set(flatLayerEdges(candidate,normals)
    .filter(([a,b])=>parent[a]!==parent[b])
    .map(([a])=>parent[a]));
  if(directions.size===2){conflicting++;conflictingIndices.push(i);}
  else consistent++;
}
assert.equal(all.count,4n);
assert.deepEqual([conflicting,consistent],[2,2]);
console.log(JSON.stringify({sourceFaces:2,splitFaces:split.faces_vertices!.length,
  joinEdges:changes.edges!.new.length,solutionCount:String(all.count),
  first10000:{conflicting,consistent,conflictingIndices}}));
