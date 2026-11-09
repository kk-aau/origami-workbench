/** High-sided numerical domain of Origamica's UnitRegularPolygonVertices[n] wrappers. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,
  tessConstructionKey,unitRegularCenteredParams,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {unitRegularCenteredPreset,unitRegularCenteredAltPreset,unitRegularOffsetPreset} from '../src/app/unitRegularCentered';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const backend=path.join(root,'backend','tessellate.py');

for(const sides of [13,16,24])for(const mode of ['center','alt','offset'] as const){
  const centralTypes=Array(sides).fill('M') as ('M'|'V')[];
  const spec=mode==='center'
    ?{...unitRegularCenteredPreset(),sides,arrangement:'single' as const,centralTypes}
    :mode==='alt'
      ?{...unitRegularCenteredAltPreset(),sides,arrangement:'single' as const,centralTypes}
      :{...unitRegularOffsetPreset(),sides,arrangement:'single' as const,
        tiles:[{offset:.15,centralTypes}]};
  const params=unitRegularCenteredParams(spec);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.equal(readTessParams({...params,unitRegularCentered:{...spec,width:.25}}),null);
  const {unitRegularCentered:_source,...request}=params;
  const run=spawnSync(python,[backend],{cwd:root,input:JSON.stringify(request),encoding:'utf8',
    timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(run.status,0,`n=${sides} ${mode}: ${run.error?.message||run.stderr}`);
  const response=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],
    [4*sides,6*sides,2*sides+1]);
  assert.equal(response.stats.checks.geometry.status,'passed');
  assert.equal(response.stats.checks.local.status,'passed');
  assert.equal(typeof response.source.closureError,'number');
  assert.ok((response.source.closureError as number)<1e-8);
  const key=tessConstructionKey(params),prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',`n=${sides} ${mode}: ${solved.layers.message}`);
  assert.equal(solved.layers.solutionCountExact,'1');
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,solved.layers.status),true);
  console.log(JSON.stringify({sides,mode,cp:[response.stats.vertices,response.stats.edges,response.stats.faces],
    closureError:response.source.closureError,layerOrder:solved.layers.status,
    solutions:solved.layers.solutionCountExact,projectRoundTrip:true}));
}
