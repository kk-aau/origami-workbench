/** Read-only audit: In[3183]'s formula applied locally to n=1,8,9 (no saved CP Out). */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS,TWO_COLORABLE_OFFSET_DIAGNOSTICS,
  twoColorableOffsetCandidate,twoColorableOffsetCandidateRequest} from '../src/app/twoColorableOffsetCandidate';
import {twoColorableArchimedeanParams,twoColorableArchimedeanPreset}
  from '../src/app/twoColorableArchimedeanPatchSource';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];edges_foldAngle:(number|null)[];faces_vertices:number[][];
  zhezhi_face_tile_instance:number[];zhezhi_face_tile_source:number[]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const executePython=(args:string[],input?:string)=>spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
const runPython=(args:string[],input?:string)=>{
  const run=executePython(args,input);
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};

const evidence=[];
for(const number of TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS){
  const spec=twoColorableOffsetCandidate(number),expected=TWO_COLORABLE_OFFSET_DIAGNOSTICS[number];
  const params=twoColorableOffsetCandidateRequest(spec);
  assert.equal('twoColorableArchimedeanPatch' in params,false);
  assert.equal('twoColorableOffsetCandidate' in params,false);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const namedCode=[
    'import json,sys',
    "sys.path.insert(0,'backend')",
    'from tessellation_archimedean_patch_catalog import two_colorable_archimedean_patch',
    'from tessellation_lattice_patch import twist_patch_options',
    'from tessellation_meshes import polygon_mesh',
    'from tessellation_tile_patch import construct_tile_patch',
    `source=two_colorable_archimedean_patch(${number})`,
    `twists=twist_patch_options(source['sourceTiles'],${JSON.stringify(spec.centralTypes)},${spec.width},variant='offset',offset=${spec.offsetMagnitude},parity=source['parity'])`,
    "mother=polygon_mesh(source['sourceTiles'])",
    "fold=construct_tile_patch(mother,twists,mother['vertices_coords'],mother['faces_vertices'],{'mergedEdges':'delete','samePtTolerance':1e-8,'collinearCleanup':True,'collinearTolerance':1e-8})",
    'print(json.dumps(fold))',
  ].join(';');
  if(number===9){
    // In[3183] delegates d<0 through In[3018]/[2919], fixing ccw=false.
    // Its six-sided source tile must retain V/M pleat pairs. The old free-U
    // mode reversed those rays, so its local-passed/layer-no-solution CP was
    // a different assignment and cannot represent the source candidate.
    const expected=TWO_COLORABLE_OFFSET_DIAGNOSTICS[9],named=executePython(['-c',namedCode]);
    assert.equal(named.status,1,named.error?.message||named.stderr);
    assert.ok(named.stderr.includes(`ValueError: ${expected.sourceRejection}`));
    assert.equal(named.stdout.trim(),'');
    const generic=executePython([path.join(root,'backend','tessellate.py')],JSON.stringify(params));
    assert.equal(generic.status,2,generic.error?.message||generic.stderr);
    assert.equal(generic.stderr.trim(),`镶嵌生成失败：${expected.sourceRejection}`);
    assert.equal(generic.stdout.trim(),'','source rejection must not emit a fake successful response');
    evidence.push({number,savedCpOut:false,cp:null,local:'source-rejected',flatGeometry:'not_computed',
      layerOrder:'not_computed',sourceRejection:expected.sourceRejection,
      namedGenericIdentity:'both reject the same fixed-source Maekawa seam; no successful TessResponse or layer computation'});
    continue;
  }
  const named=runPython(['-c',namedCode]) as Cp;
  const result=runPython([path.join(root,'backend','tessellate.py')],
    JSON.stringify(params)) as TessResponse;
  const cp=result.fold as Cp;
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],expected.cp);
  for(const field of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices',
    'zhezhi_face_tile_instance','zhezhi_face_tile_source'] as const)
    assert.deepEqual(cp[field],named[field],`n=${number} named CP ${field} differs`);
  assert.equal(cp.vertices_coords.length,named.vertices_coords.length);
  let maximumCoordinateError=0;
  cp.vertices_coords.forEach((point,index)=>{
    const error=Math.hypot(point[0]-named.vertices_coords[index][0],
      point[1]-named.vertices_coords[index][1]);
    maximumCoordinateError=Math.max(maximumCoordinateError,error);
    assert.ok(error<1e-8,`n=${number} named CP vertex ${index} differs`);
  });
  assert.equal(result.stats.checks.geometry.status,expected.geometry);
  assert.equal(result.stats.checks.local.status,expected.local);
  assert.equal(result.stats.checks.lff.status,expected.lff);
  const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
  const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(geometry.geometry.status,expected.flatGeometry,geometry.geometry.message);
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,expected.layers,layers.layers.message);
  let maximumFaceDistanceError:number|undefined,maximumRelativeFaceDistanceError:number|undefined,
    visibleRegions:number|undefined;
  if(number===8){
    assert.equal(layers.layers.solutionCountExact,'1');
    assert.equal(layers.layers.faceOrders?.length,171);
    maximumFaceDistanceError=0;maximumRelativeFaceDistanceError=0;
    for(const face of graph.faces_vertices??[])for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){
      const [a,b]=[face[i],face[j]],source=Math.hypot(
        graph.vertices_coords[a][0]-graph.vertices_coords[b][0],
        graph.vertices_coords[a][1]-graph.vertices_coords[b][1]);
      const folded=Math.hypot(
        layers.geometry.vertices[a][0]-layers.geometry.vertices[b][0],
        layers.geometry.vertices[a][1]-layers.geometry.vertices[b][1]);
      maximumFaceDistanceError=Math.max(maximumFaceDistanceError,Math.abs(source-folded));
      maximumRelativeFaceDistanceError=Math.max(maximumRelativeFaceDistanceError,
        Math.abs(source-folded)/Math.max(1,source));
    }
    assert.ok(maximumRelativeFaceDistanceError<1e-6&&maximumFaceDistanceError<2e-6,
      `n=8 maximum original-face metric error ${maximumFaceDistanceError}, relative ${maximumRelativeFaceDistanceError}`);
    const regions=modelOverlapRegions(layers);
    visibleRegions=regions.cells.length;
    for(const side of ['front','back'] as const)assert.ok(
      modelRegionLayers(layers,regions,side).every(region=>region.layers.status==='ordered'),
      `n=8 ${side} contains unconfirmed visible regions`);
    const sourced=twoColorableArchimedeanParams(
      twoColorableArchimedeanPreset(8,'in3183-offset-derived'));
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(sourced))),sourced);
    const {twoColorableArchimedeanPatch:_source,...generic}=sourced;
    assert.deepEqual(generic,params);
  }
  if(number===1)assert.match(layers.layers.message,/没有层序解/);
  evidence.push({number,savedCpOut:false,cp:expected.cp,
    namedGenericIdentity:'topology, assignments, fold angles and provenance equal; coordinates <1e-8',
    maximumCoordinateError,geometry:expected.geometry,local:expected.local,
    lff:expected.lff,flatGeometry:expected.flatGeometry,
    layerOrder:layers.layers.status,solutionCountExact:layers.layers.solutionCountExact,
    maximumFaceDistanceError,maximumRelativeFaceDistanceError,
    visibleRegions,layerMessage:layers.layers.message});
}
console.log(JSON.stringify(evidence));
