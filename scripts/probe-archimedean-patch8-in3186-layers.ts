/** One-off bounded capacity probe. It never changes production layer limits. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {computeFlatGeometry} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import type {FlatFoldResult} from '../src/core/types';
import {prepareTessResult,tessPreset,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const code=[
  'import json,sys',"sys.path.insert(0,'backend')",
  'from tessellation_archimedean_patch8_in3186 import build_archimedean_patch8_in3186',
  'print(json.dumps(build_archimedean_patch8_in3186(),allow_nan=False))',
].join(';');
const generated=spawnSync(python,['-c',code],{cwd:root,encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
assert.equal(generated.status,0,generated.error?.message||generated.stderr);
const audited=JSON.parse(generated.stdout) as {fold:TessResponse['fold'];mother:NonNullable<TessResponse['mother']>;
  counts:{vertices:number;edges:number;faces:number;retainedTiles:number};
  checks:{geometry:{status:string};local:{status:string}}};
const response={fold:audited.fold,mother:audited.mother,warnings:[],source:{output:'tile-twists'},
  stats:{...audited.counts,tiles:audited.counts.retainedTiles,checks:audited.checks}} as TessResponse;
const prepared=prepareTessResult(response,tessPreset('custom'));
const graph=tessFlatInput(prepared,prepared.doc,'saved-in3186',true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready');
const folded=geometry.geometry.graph!;
const triangleCount=folded.faces_vertices!.reduce((sum,face)=>sum+face.length-2,0);
console.log(JSON.stringify({phase:'geometry',faces:folded.faces_vertices!.length,triangleCount}));

// Private constraint builder is loaded from a temporary, budgeted copy.
// The production src/core/concaveLayers.ts is never edited or imported with
// relaxed limits. The temporary script remains inside scripts/ and is removed.
const original=readFileSync(path.join(root,'src/core/concaveLayers.ts'),'utf8');
const budget='export const CONCAVE_LAYER_LIMITS={faces:36,triangles:80,pairs:192,clauses:2048,nodes:50_000} as const;';
assert.ok(original.includes(budget));
let probe=original.replace(budget,
  'export const CONCAVE_LAYER_LIMITS={faces:120,triangles:260,pairs:512,clauses:3200,nodes:50_000} as const;');
probe=probe.replace('function buildConstraints(', 'export function buildConstraints(')
  .replaceAll("from './geometry'", "from '../src/core/geometry'")
  .replaceAll("from './types'", "from '../src/core/types'")
  .replaceAll("from './layerSolutions'", "from '../src/core/layerSolutions'");
const temporary=path.join(root,'scripts',`.in3186-layer-probe-${process.pid}.ts`);
writeFileSync(temporary,probe,'utf8');
try{
  const module=await import(pathToFileURL(temporary).href) as typeof import('../src/core/concaveLayers')&{
    buildConstraints:(graph:typeof folded,epsilon:number,limits:{faces:number;triangles:number;
      pairs:number;clauses:number;nodes:number})=>{variables:string[];clauses:number[][];
      sourceAreas:number[]}};
  const start=performance.now();
  const problem=module.buildConstraints(folded,1e-6,module.SAVED_PATCH8_LAYER_LIMITS);
  const constraintMs=Math.round(performance.now()-start);
  console.log(JSON.stringify({phase:'constraints',variables:problem.variables.length,
    clauses:problem.clauses.length,constraintMs,bounds:{faces:120,triangles:260,
      pairs:512,clauses:3200,nodes:50000}}));
  const count=module.countOriginalLayerAssignments(problem.variables.length,problem.clauses,0n,50000,512,3200);
  console.log(JSON.stringify({phase:'count',status:count.status,nodes:count.nodes,
    count:count.status==='complete'?String(count.count):null,
    totalMs:Math.round(performance.now()-start)}));
  if(count.status==='complete'&&count.count===1n&&count.selected){
    const faceOrders=problem.variables.map((pair,i)=>{
      const [a,b]=pair.split(' ').map(Number);
      return [a,b,count.selected![i+1]*Math.sign(problem.sourceAreas[b])] as [number,number,number];
    });
    const solved={...geometry,layers:{status:'solved',message:'Bounded In[3186] probe only',
      faceOrders,solutionIndex:0,constraints:[],solutionCountExact:'1',solutionCount:1}} as FlatFoldResult;
    const regions=modelOverlapRegions(solved);
    const front=modelRegionLayers(solved,regions,'front');
    const back=modelRegionLayers(solved,regions,'back');
    console.log(JSON.stringify({phase:'visibility',frontRegions:front.length,
      backRegions:back.length,frontAllOrdered:front.every(region=>region.layers.status==='ordered'),
      backAllOrdered:back.every(region=>region.layers.status==='ordered'),
      totalMs:Math.round(performance.now()-start)}));
  }
}finally{unlinkSync(temporary);}
