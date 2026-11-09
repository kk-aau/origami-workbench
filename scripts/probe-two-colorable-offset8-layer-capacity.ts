/** Bounded read-only layer-capacity probe for the In[3183] n=8 local candidate. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {computeFlatGeometry} from '../src/core/flatFold';
import {prepareTessResult,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {twoColorableOffsetCandidate,twoColorableOffsetCandidateRequest} from '../src/app/twoColorableOffsetCandidate';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const spec=twoColorableOffsetCandidate(8),params=twoColorableOffsetCandidateRequest(spec);
const generated=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
  cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30_000,maxBuffer:8*1024*1024,
  windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(generated.status,0,generated.error?.message||generated.stderr);
const response=JSON.parse(generated.stdout) as TessResponse;
assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],[54,88,35]);
const prepared=prepareTessResult(response,params);
const graph=tessFlatInput(prepared,prepared.doc,'in3183-two-color-n8-capacity-probe',true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const folded=geometry.geometry.graph!;
const signature=JSON.stringify([folded.edges_vertices,folded.edges_assignment,folded.faces_vertices]);
let hash=0xcbf29ce484222325n;
for(const char of signature)hash=BigInt.asUintN(64,(hash^BigInt(char.charCodeAt(0)))*0x100000001b3n);
const dimensions={phase:'geometry',source:'In[3183] local n=8 candidate, no saved CP Out',
  vertices:folded.vertices_coords.length,edges:folded.edges_vertices.length,
  faces:folded.faces_vertices!.length,
  triangles:folded.faces_vertices!.reduce((sum,face)=>sum+face.length-2,0),
  topologyAssignmentHash:hash.toString(16)};
console.log(JSON.stringify(dimensions));

// Compile an exact copy of the solver with a bounded larger *probe* budget.
// The production layer solver and its gate are never mutated by this script.
const original=readFileSync(path.join(root,'src/core/concaveLayers.ts'),'utf8');
const header='export const CONCAVE_LAYER_LIMITS={faces:36,triangles:80,pairs:192,clauses:2048,nodes:50_000} as const;';
assert.ok(original.includes(header));
let copy=original.replace(header,
  'export const CONCAVE_LAYER_LIMITS={faces:36,triangles:80,pairs:512,clauses:3200,nodes:50_000} as const;');
copy=copy.replace('function buildConstraints(', 'export function buildConstraints(')
  .replaceAll("from './geometry'", "from '../src/core/geometry'")
  .replaceAll("from './types'", "from '../src/core/types'")
  .replaceAll("from './layerSolutions'", "from '../src/core/layerSolutions'");
const temporary=path.join(root,'scripts',`.two-color-offset8-layer-probe-${process.pid}.ts`);
writeFileSync(temporary,copy,'utf8');
try{
  const solver=await import(pathToFileURL(temporary).href) as typeof import('../src/core/concaveLayers')&{
    buildConstraints:(graph:typeof folded,epsilon:number,limits:{faces:number;triangles:number;
      pairs:number;clauses:number;nodes:number})=>{variables:string[];clauses:number[][];
      sourceAreas:number[]};
  };
  const limits={faces:36,triangles:80,pairs:512,clauses:3200,nodes:50_000};
  const start=performance.now();
  const problem=solver.buildConstraints(folded,1e-6,limits);
  console.log(JSON.stringify({phase:'constraints',variables:problem.variables.length,
    clauses:problem.clauses.length,elapsedMs:Math.round(performance.now()-start),limits}));
  const count=solver.countOriginalLayerAssignments(problem.variables.length,
    problem.clauses,0n,limits.nodes,limits.pairs,limits.clauses);
  console.log(JSON.stringify({phase:'search',status:count.status,nodes:count.nodes,
    count:count.status==='complete'?String(count.count):null,
    selected:count.status==='complete'&&count.selected!==null,
    elapsedMs:Math.round(performance.now()-start)}));
}finally{unlinkSync(temporary);}
