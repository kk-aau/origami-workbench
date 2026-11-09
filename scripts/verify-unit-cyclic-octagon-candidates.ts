/** Formula-derived n=8 candidate search; the notebook has no saved n=8 CP Out. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const runPython=(args:string[],input?:string)=>{
  const run=spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};
const cases=[
  {name:'irregular',angles:[140,135,135,135,130,135,0,0]},
  {name:'regular',angles:[135,135,135,135,135,135,0,0]},
];
for(const sample of cases){
  const code=[
    'import json,sys',
    "sys.path.insert(0,'backend')",
    'from tessellation_unit_cyclic_polygon import unit_cyclic_polygon_info',
    `print(json.dumps(unit_cyclic_polygon_info(${JSON.stringify(sample.angles)},1.,2)))`,
  ].join(';');
  const mother=runPython(['-c',code]) as {vertices:[number,number][];
    effectiveAngles:number[];centerAngles:number[];alternatingAdjustment:number};
  const base=tessPreset('custom');assert.equal(base.family,'custom');
  const params=readTessParams({...base,vertices:mother.vertices,
    faces:[[0,1,2,3,4,5,6,7]],repeatX:1,repeatY:1,
    customOutput:'tile-twists',tileTwists:[{width:.1,offset:0,tilt:80,
      centralTypes:['M','M','M','M','M','M','V','V']}],
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8}});
  assert.ok(params&&params.family==='custom');
  const response=runPython([path.join(root,'backend','tessellate.py')],
    JSON.stringify(params)) as TessResponse;
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  const layers=geometry.geometry.status==='ready'?recomputeFlatLayers(geometry):geometry;
  const regionCounts={} as Record<'front'|'back',number>;
  if(layers.layers.status==='solved'){
    const regions=modelOverlapRegions(layers);
    for(const side of ['front','back'] as const){
      const ordered=modelRegionLayers(layers,regions,side);
      regionCounts[side]=ordered.length;
      assert.ok(ordered.every(region=>region.layers.status==='ordered'));
    }
  }
  console.log(JSON.stringify({name:sample.name,angles:sample.angles,
    effective:mother.effectiveAngles,centerAngles:mother.centerAngles,
    shift:mother.alternatingAdjustment,
    cp:[response.stats.vertices,response.stats.edges,response.stats.faces],
    geometry:geometry.geometry.status,layerStatus:layers.layers.status,
    solutions:layers.layers.solutionCountExact,regionCounts,
    message:layers.layers.message}));
}
