/** Local probe: source-derived n=6 cyclic centered twist, no Wolfram CP Out. */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {prepareTessResult,tessPreset,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const code=[
  'import itertools,json,math,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_unit_cyclic_polygon import unit_cyclic_polygon_info',
  'from tessellate import generate',
  'side=1.',
  'vertices=unit_cyclic_polygon_info([128,119,118,115,0,0],side,2)["vertices"]',
  'base={"family":"custom","vertices":vertices,"faces":[list(range(6))],"repeatX":1,"repeatY":1,"customOutput":"tile-twists","angle":36,"scale":.3}',
  'out=[]',
  'for valleys in itertools.combinations(range(6),2):\n types=["V" if i in valleys else "M" for i in range(6)]\n try:\n  result=generate({**base,"tileTwists":[{"width":.1,"offset":0,"tilt":80,"centralTypes":types}]})\n  out.append({"types":"".join(types),"result":result})\n except Exception as error:\n  out.append({"types":"".join(types),"error":str(error)})',
  'print(json.dumps(out))',
].join('\n');
const run=spawnSync(python,['-c',code],{cwd:root,encoding:'utf8',timeout:60000,
  maxBuffer:16*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
if(run.status!==0)throw Error(run.error?.message||run.stderr);
const rows=JSON.parse(run.stdout) as {types:string;error?:string;result?:TessResponse}[];
const params=tessPreset('custom');
for(const row of rows){
  if(!row.result){console.log(row.types,row.error);continue;}
  const result=row.result;
  const prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,'probe',true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  const layers=recomputeFlatLayers(geometry);
  console.log(JSON.stringify({types:row.types,geometry:geometry.geometry.status,
    layers:layers.layers.status,solutions:layers.layers.solutionCountExact,
    checks:[result.stats.checks.geometry.status,result.stats.checks.local.status],
    counts:[result.stats.vertices,result.stats.edges,result.stats.faces]}));
}
