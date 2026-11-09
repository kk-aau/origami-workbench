/** Read-only diagnostics for the saved cyclic/Brocard concave-face layer gate. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ear from 'rabbit-ear';
import earcut from 'earcut';

type Pair={fold:{vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];faces_vertices:number[][]};foldedForm:[number,number][]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const cases=[
  {name:'cyclic-centered In[3042]',module:'tessellation_unit_cyclic_centered',
    call:'original_cyclic_centered_pair(False)'},
  {name:'cyclic-centered Alt In[3045]',module:'tessellation_unit_cyclic_centered',
    call:'original_cyclic_centered_pair(True)'},
  {name:'Brocard-offset In[3048]',module:'tessellation_unit_cyclic_brocard_offset',
    call:'original_cyclic_brocard_offset_pair()'},
] as const;
const pairKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(' ');
const faceArea=(points:[number,number][])=>points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];
},0)/2;
const concave=(points:[number,number][])=>{
  const turns=points.map((p,i)=>{
    const q=points[(i+1)%points.length],r=points[(i+2)%points.length];
    return (q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);
  });
  return turns.some(value=>value>1e-9)&&turns.some(value=>value< -1e-9);
};
const overlaps=(lists:number[][])=>new Set(lists.flatMap((others,a)=>others
  .filter(b=>a<b).map(b=>pairKey(a,b))));

for(const item of cases){
  const code=`import json;from ${item.module} import ${item.call.split('(')[0]};print(json.dumps(${item.call}))`;
  const run=spawnSync(python,['-c',code],{cwd:path.join(root,'backend'),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const pair=JSON.parse(run.stdout) as Pair;
  const folded={...pair.fold,vertices_coords:pair.foldedForm,
    edges_foldAngle:pair.fold.edges_assignment.map(a=>a==='M'?-180:a==='V'?180:0)};
  const epsilon=1e-7;
  const bad=pair.fold.faces_vertices.flatMap((face,i)=>
    concave(face.map(v=>pair.foldedForm[v]))?[i]:[]);
  const originalOverlap=overlaps(ear.graph.getFacesFacesOverlap(folded,epsilon));
  const {result:tri,changes}=ear.graph.triangulate(folded,earcut);
  const map=changes.faces?.map;
  assert.ok(map&&tri.faces_vertices);
  assert.deepEqual(tri.edges_assignment?.slice(0,pair.fold.edges_assignment.length),
    pair.fold.edges_assignment);
  assert.ok(changes.edges?.new.every(edge=>tri.edges_assignment?.[edge]==='J'
    && tri.edges_foldAngle?.[edge]===0));
  const parent:number[]=[];
  map.forEach((children,f)=>children.forEach(child=>{parent[child]=f;}));
  assert.equal(parent.length,tri.faces_vertices.length);
  const areaErrors=map.map((children,f)=>{
    const original=Math.abs(faceArea(pair.fold.faces_vertices[f].map(v=>pair.foldedForm[v])));
    const split=children.reduce((sum,t)=>sum+Math.abs(faceArea(
      tri.faces_vertices![t].map(v=>pair.foldedForm[v] as [number,number]))),0);
    return Math.abs(original-split);
  });
  assert.ok(Math.max(...areaErrors)<1e-10);
  const triangularOverlap=ear.graph.getFacesFacesOverlap(tri,epsilon);
  const projectedOverlap=new Set<string>();
  // Project triangle pairs directly: a split face can meet an external face
  // in several disjoint regions, so this union records *coverage only*.
  triangularOverlap.forEach((others,t)=>others.forEach(u=>{
    if(parent[t]!==parent[u])projectedOverlap.add(pairKey(parent[t],parent[u]));
  }));
  for(const alternative of [1e-8,1e-6]){
    const native=overlaps(ear.graph.getFacesFacesOverlap(folded,alternative));
    const projected=new Set<string>();
    ear.graph.getFacesFacesOverlap(tri,alternative)
      .forEach((others,t)=>others.forEach(u=>{
        if(parent[t]!==parent[u])projected.add(pairKey(parent[t],parent[u]));
      }));
    assert.deepEqual([...native].sort(),[...originalOverlap].sort());
    assert.deepEqual([...projected].sort(),[...projectedOverlap].sort());
  }
  const nativeOnly=[...originalOverlap].filter(key=>!projectedOverlap.has(key));
  const triangulatedOnly=[...projectedOverlap].filter(key=>!originalOverlap.has(key));
  assert.equal(nativeOnly.length,0);
  assert.ok(triangulatedOnly.every(key=>key.split(' ').some(f=>bad.includes(Number(f)))));
  console.log(JSON.stringify({name:item.name,faces:pair.fold.faces_vertices.length,
    concaveFaces:bad,triangles:tri.faces_vertices.length,
    joinEdges:changes.edges?.new.length??0,
    maxAreaError:Math.max(...areaErrors),
    originalOverlapPairs:originalOverlap.size,
    projectedTriangleOverlapPairs:projectedOverlap.size,
    nativeOnly,triangulatedOnly}));
}
