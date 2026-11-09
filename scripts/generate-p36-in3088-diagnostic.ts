import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {p36In3088Params} from '../src/app/p36In3088Source';
import {prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput} from '../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const params=readTessParams(p36In3088Params());
if(!params)throw Error('In[3088] source parameters are invalid');
const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
  cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
if(run.status!==0)throw Error(run.error?.message||run.stderr);
const response=JSON.parse(run.stdout) as TessResponse;
const prepared=prepareTessResult(response,params);
const input=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true);
const flat=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});
if(flat.geometry.status!=='ready')throw Error(flat.geometry.message);
const solved=recomputeFlatLayers(flat);
if(solved.layers.status!=='no-solution')throw Error(`Unexpected layer state ${solved.layers.status}`);
const data={
  notebookInput:3088,
  sourceStationaryFace:17,
  graphStationaryFace:input.startingFace,
  count:[response.stats.vertices,response.stats.edges,response.stats.faces],
  closureError:Number(response.source.closureError),
  geometryStatus:flat.geometry.status,
  layerStatus:solved.layers.status,
  crease:{vertices:input.graph.vertices_coords,edges:input.graph.edges_vertices,
    assignment:input.graph.edges_assignment,faces:input.graph.faces_vertices},
  folded:{vertices:flat.geometry.vertices},
};
const target=path.join(root,'src','app','p36In3088DiagnosticData.json');
writeFileSync(target,`${JSON.stringify(data)}\n`,'utf8');
process.stdout.write(`${target}: ${data.count.join('/')} ${data.layerStatus}\n`);
