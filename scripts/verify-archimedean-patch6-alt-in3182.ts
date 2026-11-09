/** Full-workspace layer audit of the single saved ArchimedeanPatch[6] Alt patch. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {modelOverlapRegions} from '../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../src/app/modelRegionLayers';
import {prepareTessResult,readTessParams,tessConstructionKey,
  type TessResponse} from '../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../src/app/tessellationFlat';
import {archimedeanPatchIn3182Preset,archimedeanPatchParams}
  from '../src/app/archimedeanPatchSource';

type Cp={vertices_coords:[number,number][];edges_vertices:[number,number][];
  edges_assignment:string[];edges_foldAngle:(number|null)[];faces_vertices:number[][];
  zhezhi_face_tile_instance:number[];zhezhi_face_tile_source:number[]};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};
const runPython=(args:string[],input?:string)=>{
  const run=spawnSync(python,args,{cwd:root,input,encoding:'utf8',timeout:30000,
    maxBuffer:4*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout);
};

// Independent notebook-join reconstruction in the backend test module is sent
// directly to the tile constructor, bypassing the JSON request/dispatch path.
const namedCode=[
  'import json,sys',
  "sys.path.insert(0,'backend')",
  'from test_tessellation_archimedean_patch6_lattice import source_patch6,SOURCE_TYPES',
  'from tessellation_lattice_patch import twist_patch_options',
  'from tessellation_meshes import polygon_mesh',
  'from tessellation_tile_patch import construct_tile_patch',
  'patch=source_patch6()',
  "twists=twist_patch_options(patch,SOURCE_TYPES,.2,variant='centered-angle',angle=25)",
  'mother=polygon_mesh(patch)',
  "fold=construct_tile_patch(mother,twists,mother['vertices_coords'],mother['faces_vertices'])",
  'print(json.dumps(fold))',
].join(';');
const named=runPython(['-c',namedCode]) as Cp;

// Analytic source vertices: UnitRegularPolygonVertex and the saved joins
// {1,2,1}, {2,2,2}; the two source triangles share one edge with the square.
const h=Math.sqrt(3)/2;
const vertices:[number,number][]=[[0,0],[1,0],[.5,h],[1.5,h],[1.5,1+h],[.5,1+h]];
const faces=[[0,1,2],[1,3,2],[2,3,4,5]];
const saved=archimedeanPatchParams(archimedeanPatchIn3182Preset());
assert.deepEqual(saved.faces,faces);
assert.deepEqual([saved.range1,saved.range2],[[0,0],[0,0]]);
saved.vertices.forEach((point,index)=>assert.ok(
  Math.hypot(point[0]-vertices[index][0],point[1]-vertices[index][1])<1e-11));
assert.deepEqual(saved.tileTwists?.map(option=>option.centralTypes.join('')),
  ['MMM','VVV','MMMM']);
const params=readTessParams(JSON.parse(JSON.stringify(saved)));
assert.ok(params&&params.family==='custom');
assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
assert.deepEqual(params.archimedeanPatch,archimedeanPatchIn3182Preset());
const {archimedeanPatch:_source,...request}=params;
const result=runPython([path.join(root,'backend','tessellate.py')],JSON.stringify(request)) as TessResponse;
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'passed');
assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[32,48,17]);
const cp=result.fold as Cp;
for(const field of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices',
  'zhezhi_face_tile_instance','zhezhi_face_tile_source'] as const){
  assert.deepEqual(cp[field],named[field],`named CP ${field} differs`);
}
assert.equal(cp.vertices_coords.length,named.vertices_coords.length);
let maximumCoordinateError=0;
cp.vertices_coords.forEach((point,index)=>{
  const error=Math.hypot(point[0]-named.vertices_coords[index][0],
    point[1]-named.vertices_coords[index][1]);
  maximumCoordinateError=Math.max(maximumCoordinateError,error);
  assert.ok(error<1e-8,`named CP vertex ${index} differs`);
});
const key=tessConstructionKey(params),prepared=prepareTessResult(result,params);
const graph=tessFlatInput(prepared,prepared.doc,key,true).graph;
const geometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
const cross=(a:[number,number],b:[number,number])=>a[0]*b[1]-a[1]*b[0];
const faceIssues=(coords:[number,number][],polygons:number[][],eps=1e-6)=>polygons.flatMap((face,index)=>{
  const points=face.map(vertex=>coords[vertex]);
  const area=sum(points.map((point,i)=>cross(point,points[(i+1)%points.length])))/2;
  const turns=points.map((point,i)=>{
    const next=points[(i+1)%points.length],end=points[(i+2)%points.length];
    const a:[number,number]=[next[0]-point[0],next[1]-point[1]];
    const b:[number,number]=[end[0]-next[0],end[1]-next[1]];
    return {value:cross(a,b),tolerance:eps*Math.max(Math.hypot(...a),Math.hypot(...b))};
  });
  const properCrossing=points.some((a,i)=>points.some((c,j)=>{
    if(i===j||(i+1)%points.length===j||(j+1)%points.length===i)return false;
    const b=points[(i+1)%points.length],d=points[(j+1)%points.length];
    const orient=(p:[number,number],q:[number,number],r:[number,number])=>
      cross([q[0]-p[0],q[1]-p[1]],[r[0]-p[0],r[1]-p[1]]);
    return orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
  }));
  const significant=turns.filter(turn=>Math.abs(turn.value)>turn.tolerance).map(turn=>turn.value);
  const reason=Math.abs(area)<1e-12?'degenerate':properCrossing?'self-crossing':
    significant.some(value=>value>0)&&significant.some(value=>value<0)?'concave':null;
  return reason?[{index,reason,area,minimumTurn:Math.min(...significant),
    maximumTurn:Math.max(...significant)}]:[];
});
const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);
const unfoldedIssues=faceIssues(graph.vertices_coords as [number,number][],graph.faces_vertices??[]);
const foldedIssues=faceIssues(geometry.geometry.vertices as [number,number][],geometry.geometry.faces);
assert.deepEqual(unfoldedIssues.map(({index,reason})=>({index,reason})),
  [{index:2,reason:'concave'}]);
assert.deepEqual(foldedIssues.map(({index,reason})=>({index,reason})),
  [{index:2,reason:'concave'}]);
const layers=recomputeFlatLayers(geometry);
assert.equal(layers.layers.status,'solved',layers.layers.message);
assert.equal(layers.layers.solutionCountExact,'1');
assert.deepEqual(layers.geometry,geometry.geometry);
assert.ok(layers.layers.faceOrders!.every(([a,b])=>a<geometry.geometry.faces.length&&b<geometry.geometry.faces.length));
const regions=modelOverlapRegions(layers);
const regionCounts={} as Record<'front'|'back',number>;
for(const side of ['front','back'] as const){
  const ordered=modelRegionLayers(layers,regions,side);
  assert.ok(ordered.every(region=>region.layers.status==='ordered'),`${side} region order incomplete`);
  regionCounts[side]=ordered.length;
}
console.log(JSON.stringify({example:'In[3182]',scope:'single patch',
  cp:{vertices:result.stats.vertices,edges:result.stats.edges,faces:result.stats.faces,
    identity:'same topology/assignments/fold angles/face provenance; coordinates within 1e-8',
    maximumCoordinateError},flatGeometry:geometry.geometry.status,
  layerOrder:layers.layers.status,solutions:layers.layers.solutionCountExact,
  unfoldedIssues,foldedIssues,regionCounts,message:layers.layers.message}));
