/** Full-pipeline layer check for Origamica's saved unit-triangle pairs. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');
const base=tessPreset('custom');
assert.equal(base.family,'custom');
const a=50*Math.PI/180,b=60*Math.PI/180,c=70*Math.PI/180;
const length=Math.sin(b)/Math.sin(c);
const x=length*Math.cos(a),y=length*Math.sin(a);

for(const [alternate,angle,type,example] of [
  [false,80,'UnitTriangleCenteredTwistTile','In[3025]'],
  [true,25,'UnitTriangleCenteredTwistAltTile','In[3028]'],
] as const){
  const tile=(types:('M'|'V')[])=>({width:.1,offset:0,centralTypes:types,
    ...(alternate?{angleMode:'twist' as const,twistAngle:angle}:{tilt:angle})});
  const params=readTessParams({...base,vertices:[[0,0],[1,0],[x,y],[1+x,y]],
    faces:[[0,1,2],[3,2,1]],repeatX:1,repeatY:1,
    customOutput:'tile-twists',tileTwists:[tile(['M','M','M']),tile(['V','V','V'])],
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8}});
  assert.ok(params&&params.family==='custom');
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(params),
    encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const result=JSON.parse(run.stdout) as TessResponse;
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[18,28,11]);
  const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,alternate?'solved':'no-solution',solved.layers.message);
  if(alternate)assert.equal(solved.layers.solutionCountExact,'1');
  console.log(JSON.stringify({type,example,cp:{vertices:result.stats.vertices,
    edges:result.stats.edges,faces:result.stats.faces},
    flatGeometry:geometry.geometry.status,layerOrder:solved.layers.status,
    solutions:solved.layers.solutionCountExact,message:solved.layers.message}));
}
