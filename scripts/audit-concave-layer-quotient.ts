/** Experimental original-face quotient; production concave gate stays closed. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ear from 'rabbit-ear';
import {polygonArea} from '../src/core/geometry';
import {selectLayerSolution,type LayerNode} from '../src/core/layerSolutions';
import {makeQuotientExperiment,solveQuotientExperiment,verifyQuotientLift,orderSignature,quotientFaceOrders,type ExperimentGraph} from './experiments/concaveLayerQuotient';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {flatLayerOrder} from '../src/core/flatLayerOrder';
import type {FlatFoldResult} from '../src/core/types';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const cases=[
 {name:'cyclic-centered In[3042]',module:'tessellation_unit_cyclic_centered',call:'original_cyclic_centered_pair(False)'},
 {name:'cyclic-centered Alt In[3045]',module:'tessellation_unit_cyclic_centered',call:'original_cyclic_centered_pair(True)'},
 {name:'Brocard-offset In[3048]',module:'tessellation_unit_cyclic_brocard_offset',call:'original_cyclic_brocard_offset_pair()'},
];
for(const item of cases){
 const run=spawnSync(python,['-c',`import json;from ${item.module} import ${item.call.split('(')[0]};print(json.dumps(${item.call}))`],{cwd:path.join(root,'backend'),encoding:'utf8',timeout:30_000,maxBuffer:4*1024*1024,windowsHide:true,env});
 assert.equal(run.status,0,run.error?.message||run.stderr);
 const pair=JSON.parse(run.stdout),source:ExperimentGraph={...pair.fold,vertices_coords:pair.foldedForm,edges_foldAngle:pair.fold.edges_assignment.map((a:string)=>a==='M'?-180:a==='V'?180:0)};
 let expected:string[]|undefined;const metrics=[];
 for(const rotate of [0,1,2])for(const epsilon of [1e-8,1e-7,1e-6]){
  const start=performance.now(),problem=makeQuotientExperiment(source,epsilon,rotate),solved=solveQuotientExperiment(problem);
  for(const solution of solved.solutions)verifyQuotientLift(problem,solution);
  const visible=solved.solutions.map(solution=>{
   const faceOrders=quotientFaceOrders(source,solution),faceOrder=flatLayerOrder(source.vertices_coords,source.faces_vertices,faceOrders);
   const result:FlatFoldResult={geometry:{status:'ready',message:'EXPERIMENT',vertices:source.vertices_coords,faces:source.faces_vertices},layers:{status:'solved',message:'EXPERIMENT',faceOrders},warnings:[]};
   const analysis=modelOverlapRegions(result);
   for(const side of ['front','back'] as const)assert.ok(modelRegionLayers(result,analysis,side).every(r=>r.layers.status==='ordered'),`${item.name} original face orders leave unconfirmed visible regions`);
   return {originalOrderedRegions:analysis.cells.length,globalOrder:faceOrder.length===source.faces_vertices.length};
  });
  const signatures=solved.solutions.map(orderSignature).sort();if(expected)assert.deepEqual(signatures,expected,`${item.name} varies with triangulation/epsilon`);else expected=signatures;
  let enumerated:number|undefined,consistent:number|undefined;
  if(rotate===0&&epsilon===1e-7){
   let tree:LayerNode|undefined;
   try{tree=ear.layer(problem.tri,epsilon) as unknown as LayerNode;}catch(e){if(!String(e).includes('no solution possible'))throw e;}
   const count=tree?selectLayerSolution(tree,0).count:0n;
   // Exhaustive comparison only; a cap is explicitly reported, never silently
   // treated as a full count or proof that no uniform original-face solution exists.
   if(count<=100_000n){
    enumerated=Number(count);const projected=new Set<string>(),normals=problem.tri.faces_vertices.map(f=>Math.sign(polygonArea(f.map(v=>source.vertices_coords[v]))));
    for(let i=0;i<enumerated;i++){
     const result:Record<string,number>={};let conflict=false;
     for(const [a,b,sign]of selectLayerSolution(tree!,i).orders!){
      const pa=problem.parent[a],pb=problem.parent[b];assert.notEqual(pa,pb);
      const key=pa<pb?`${pa} ${pb}`:`${pb} ${pa}`,above=sign*normals[b]*(pa<pb?1:-1),value=above>0?1:2;
      if(result[key]&&result[key]!==value){conflict=true;break;}result[key]=value;
     }
     if(!conflict)projected.add(orderSignature(result));
    }
    consistent=projected.size;assert.deepEqual([...projected].sort(),signatures,'quotient must equal ALL uniformly tied triangle solutions');
   }
  }
  metrics.push({rotate,epsilon,triangles:problem.tri.faces_vertices.length,originalPairVariables:problem.variables.length,clauses:problem.clauses.length,constraints:problem.counts,solutions:String(solved.count),nodes:solved.nodes,enumeratedTriangleSolutions:enumerated,uniformProjectedSolutions:consistent,visible,ms:Math.round(performance.now()-start)});
 }
 console.log(JSON.stringify({name:item.name,faces:source.faces_vertices.length,metrics}));
}
