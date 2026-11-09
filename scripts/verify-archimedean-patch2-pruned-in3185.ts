/** Saved In[3185]: source-preserving 4x4 tiling, whole-tile prune, and FF/layers. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {polygonArea} from '../src/core/geometry';
import {archimedeanPatchIn3185Preset,archimedeanPatchParams}
  from '../src/app/archimedeanPatchSource';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];edges_foldAngle:(number|null)[];faces_vertices:number[][];
  zhezhi_face_tile_instance:number[];zhezhi_face_tile_source:number[]};
type Mother={vertices_coords:[number,number][];faces_vertices:number[][];
  zhezhi_custom_polygons:[number,number][][]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const runPython=(args:string[],input?:string)=>{
  const run=spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};
const boundary:[[number,number],[number,number],[number,number],[number,number]]=
  [[0,0],[2.9,0],[2.9,2.9],[0,2.9]];
const monolithic={mergedEdges:'delete' as const,samePtTolerance:1e-8,
  collinearCleanup:true,collinearTolerance:1e-8};

// This path starts from the source JoinTiling/PatchVectors catalog, bypassing
// the public JSON request. The generic request below must produce the same CP.
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from tessellation_archimedean_patch_catalog import archimedean_patch,archimedean_lattice_mesh',
  'from tessellation_lattice_patch import twist_patch_options',
  'from tessellation_prune import prune_mesh',
  'from tessellation_tile_patch import construct_tile_patch',
  'source=archimedean_patch(2)',
  "twists=twist_patch_options(source['sourceTiles'],[['V','V','M','M']],.2,variant='centered-angle',angle=30)",
  'full=archimedean_lattice_mesh(2,[0,3],[0,3])',
  'pruned=prune_mesh(full,[[0,0],[2.9,0],[2.9,2.9],[0,2.9]])',
  `options=${JSON.stringify(monolithic).replace(/true/g,'True')}`,
  "folds={tag:construct_tile_patch(mesh,twists,source['sourceTiles'][0],[[0,1,2,3]],options) for tag,mesh in [('full',full),('pruned',pruned)]}",
  "print(json.dumps({'folds':folds,'mothers':{'full':full,'pruned':pruned}}))",
].join(';');
const named=runPython(['-c',namedCode]) as
  {folds:Record<'full'|'pruned',Cp>;mothers:Record<'full'|'pruned',Mother>};

const base=tessPreset('custom');
assert.equal(base.family,'custom');
const common={...base,vertices:[[0,0],[1,0],[1,1],[0,1]] as [number,number][],
  faces:[[0,1,2,3]],repeatX:1,repeatY:1,lattice:[[1,0],[0,1]] as
  [[number,number],[number,number]],range1:[0,3] as [number,number],
  range2:[0,3] as [number,number],customOutput:'tile-twists' as const,
  tileTwists:[{width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
    centralTypes:['V','V','M','M'] as ('V'|'M')[]}],monolithicOptions:monolithic};

const compare=(actual:Cp,expected:Cp,label:string)=>{
  for(const field of ['edges_vertices','edges_assignment','edges_foldAngle',
    'faces_vertices','zhezhi_face_tile_instance','zhezhi_face_tile_source'] as const)
    assert.deepEqual(actual[field],expected[field],`${label} ${field}`);
  assert.equal(actual.vertices_coords.length,expected.vertices_coords.length);
  let maximumCoordinateError=0;
  actual.vertices_coords.forEach((point,index)=>{
    const error=Math.hypot(point[0]-expected.vertices_coords[index][0],
      point[1]-expected.vertices_coords[index][1]);
    maximumCoordinateError=Math.max(maximumCoordinateError,error);
    assert.ok(error<1e-8,`${label} vertex ${index}: ${error}`);
  });
  return maximumCoordinateError;
};
const outputs:Record<string,unknown>={example:'In[3185] ordinary ArchimedeanPatch[2] Alt'};
for(const [tag,pruneBoundary] of [['full',undefined],['pruned',boundary]] as const){
  const params=readTessParams(tag==='pruned'
    ?archimedeanPatchParams(archimedeanPatchIn3185Preset())
    :{...common,...(pruneBoundary?{pruneBoundary}:{})});
  assert.ok(params&&params.family==='custom');
  if(tag==='pruned')assert.deepEqual(params.archimedeanPatch,archimedeanPatchIn3185Preset());
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const {archimedeanPatch:_source,...request}=params;
  const result=runPython([path.join(root,'backend','tessellate.py')],
    JSON.stringify(request)) as TessResponse;
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const expected=tag==='full'?[16,100,180,81]:[9,64,112,49];
  assert.deepEqual([result.stats.tiles,result.stats.vertices,result.stats.edges,
    result.stats.faces],expected);
  const mother=result.mother as Mother;
  assert.equal(mother.faces_vertices.length,named.mothers[tag].faces_vertices.length);
  assert.deepEqual(mother.faces_vertices,named.mothers[tag].faces_vertices);
  const cp=result.fold as Cp;
  const maximumCoordinateError=compare(cp,named.folds[tag],tag);
  const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'solved',layers.layers.message);
  assert.equal(layers.layers.solutionCountExact,'1');
  const regions=modelOverlapRegions(layers);
  const paperArea=graph.faces_vertices!.reduce((sum,face)=>sum+
    Math.abs(polygonArea(face.map(v=>graph.vertices_coords[v]))),0);
  const visibleFor=(side:'front'|'back')=>{
    const visible=modelRegionLayers(layers,regions,side);
    assert.ok(visible.length>0);
    assert.ok(visible.every(cell=>cell.layers.status==='ordered'),
      `${tag}/${side}: visible regions need an unambiguous layer order`);
    const faces=[...new Set(visible.map(cell=>
      cell.layers.status==='ordered'?cell.layers.topToBottom[0]:-1))].sort((a,b)=>a-b);
    const area=visible.reduce((sum,cell)=>sum+cell.area,0);
    assert.ok(area>0&&area<=paperArea*(1+1e-7));
    return {regions:visible.length,faces,areaRatioToPaper:area/paperArea};
  };
  const coords=cp.vertices_coords;
  const bounds=[0,1].map(axis=>[Math.min(...coords.map(p=>p[axis])),
    Math.max(...coords.map(p=>p[axis]))]);
  outputs[tag]={motherTiles:mother.faces_vertices.length,cp:{vertices:result.stats.vertices,
    edges:result.stats.edges,faces:result.stats.faces,identity:'named = generic',
    maximumCoordinateError,bounds},flatGeometry:geometry.geometry.status,
    layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
    relationCount:layers.layers.faceOrders?.length,
    faceOrderLength:layers.layers.faceOrder?.length,
    visible:{front:visibleFor('front'),back:visibleFor('back'),
      maxDepth:regions.maxDepth,omittedThinRegions:regions.omittedThinRegions},
    message:layers.layers.message};
}
assert.deepEqual((outputs.pruned as {cp:{bounds:number[][]}}).cp.bounds,[[0,3],[0,3]]);
console.log(JSON.stringify(outputs));
