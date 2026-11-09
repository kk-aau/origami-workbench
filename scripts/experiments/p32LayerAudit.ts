import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {centeredUnitTriangleVertices,unitRegularCircularTwist} from '../../src/app/circularTwistOriginal';
import {prepareTessResult,type CircularTwistParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {flatPresentation} from '../../src/app/flatPresentation';
import {modelRenderMode} from '../../src/app/modelRenderMode';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {polygonArea} from '../../src/core/geometry';

const cases:{name:string;params:CircularTwistParams}[]=[
  {name:'regular n=4, m=3',params:{family:'circular-twist',...unitRegularCircularTwist(4,3),angle:30,circleDivisions:64,centralTypes:['M','M','V','V'],stationaryFace:'auto'}},
  {name:'regular n=6, m=3',params:{family:'circular-twist',...unitRegularCircularTwist(6,3),angle:30,circleDivisions:64,centralTypes:['M','V','M','V','M','V'],stationaryFace:'auto'}},
  {name:'triangle 40/60/80',params:{family:'circular-twist',polygon:centeredUnitTriangleVertices(40,60),angle:20,radius:1.5,circleDivisions:64,centralTypes:['M','M','M'],stationaryFace:'auto'}},
];
const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
  "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],
  {input:JSON.stringify(cases.map(c=>c.params)),encoding:'utf8',windowsHide:true,
   env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
if(run.status!==0)throw Error(run.stderr||`backend exited ${run.status}`);
const responses=JSON.parse(run.stdout) as TessResponse[];
for(let i=0;i<cases.length;i++){
  const {name,params}=cases[i],response=responses[i];
  const result=prepareTessResult(response,params);
  const input=tessFlatInput(result,result.doc,JSON.stringify(params),true);
  const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace});
  const flat=geometry.geometry.status==='ready'?recomputeFlatLayers(geometry):geometry;
  const regions=flat.layers.status==='solved'?modelOverlapRegions(flat):null;
  const front=regions?modelRegionLayers(flat,regions,'front'):[];
  const back=regions?modelRegionLayers(flat,regions,'back'):[];
  const boundaries=front.length?modelRegionBoundaries(flat,front):null;
  const count=(rows:typeof front)=>Object.fromEntries([...new Set(rows.map(r=>r.layers.status==='ordered'?r.layers.topToBottom[0]:r.layers.status))]
    .map(key=>[key,rows.filter(r=>(r.layers.status==='ordered'?r.layers.topToBottom[0]:r.layers.status)===key).length]));
  const display=flat.layers.status==='solved'?flatPresentation(flat,'front'):null;
  const normals=flat.geometry.faces.map(face=>Math.sign(polygonArea(face.map(id=>flat.geometry.vertices[id]))));
  const directed=flat.layers.faceOrders?flatLayerEdges(flat.layers.faceOrders,normals):[];
  console.log(JSON.stringify({name,faces:input.graph.faces_vertices?.length,
    backend:Object.fromEntries(Object.entries(response.stats.checks).map(([key,value])=>[key,value.status])),geometry:flat.geometry.status,
    layers:flat.layers.status,message:flat.layers.message,
    count:flat.layers.solutionCountExact,
    faceOrder:flat.layers.faceOrder,
    ...(i===2?{directed}:{}),
    front:count(front),back:count(back),
    maxDepth:regions?.maxDepth,regionCount:regions?.cells.length,
    visibleEdges:boundaries?.edges.length,ambiguousEdges:boundaries?.ambiguousEdges,
    display:display?modelRenderMode(flat,display.hasOrder,{regionsReady:true}):null}));
}
