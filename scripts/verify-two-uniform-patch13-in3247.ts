/** Origamica In[3245–3251]: two distinct original JoinTiling cells and 2×2 layouts. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import {changeTessParams,readTessParams,type TessResponse}
  from '../src/app/tessellation';
import {readCustomMeshJson} from '../src/app/customMeshJson';
import {twoUniformPatchGeometry,twoUniformPatchParams,twoUniformPatchPreset}
  from '../src/app/twoUniformPatchSource';
import {TWO_UNIFORM_PATCH_CATALOG,type TwoUniformPatchNumber}
  from '../src/app/twoUniformPatchCatalog';

const source=twoUniformPatchPreset(13);
const geometry=twoUniformPatchGeometry(13);
assert.deepEqual(geometry.tileSpecs.map(item=>item.sides),[4,4,3,3]);
assert.deepEqual(geometry.tileSpecs.slice(1).map(item=>[
  item.join?.targetTile,item.join?.targetVertex,item.join?.sourceVertex]),
  [[0,1,0],[1,1,0],[2,1,1]]);
assert.equal(geometry.sourceTiles.length,4);
assert.equal(geometry.vertices.length,8);
assert.equal(geometry.faces.length,4);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
near(geometry.lattice[0][0],2+Math.sqrt(3)/2);
near(geometry.lattice[0][1],.5);
near(geometry.lattice[1][0],0);
near(geometry.lattice[1][1],1);
const params=readTessParams(JSON.parse(JSON.stringify(twoUniformPatchParams(source))));
assert.ok(params&&params.family==='custom');
assert.deepEqual(params.twoUniformPatch,source);
assert.deepEqual([params.range1,params.range2],[[0,1],[0,1]]);
assert.equal(params.customOutput,'tiling');
for(const [key,changed] of [
  ['faces',params.faces.map((face,i)=>i===0?[...face].reverse():face)],
  ['vertices',params.vertices.map((point,i)=>i===0?[point[0]+.01,point[1]]:point)],
  ['lattice',[[geometry.lattice[0][0]+.01,geometry.lattice[0][1]],geometry.lattice[1]]],
  ['range1',[0,2]],['tileSpecs',params.tileSpecs?.map((item,i)=>i===2?{...item,sides:4}:item)],
  ['customOutput','twist'],
] as const){
  assert.equal(readTessParams({...params,[key]:changed}),null,`forged ${key}`);
}
const edited=changeTessParams(params,{vertices:params.vertices.map((point,i)=>
  i===0?[point[0]+.01,point[1]]:point)});
assert.equal(edited.family==='custom'&&edited.twoUniformPatch,undefined);
const unchanged=readCustomMeshJson(params,JSON.stringify({vertices:params.vertices,faces:params.faces}));
assert.deepEqual(unchanged.twoUniformPatch,source);
const changed=readCustomMeshJson(params,JSON.stringify({vertices:params.vertices.map((point,i)=>
  i===0?[point[0]+.01,point[1]]:point),faces:params.faces}));
assert.equal(changed.twoUniformPatch,undefined);

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const {twoUniformPatch:_name,tileSpecs:_specs,...request}=params;
const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
  cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(run.status,0,run.error?.message||run.stderr);
const result=JSON.parse(run.stdout) as TessResponse;
assert.deepEqual([result.stats.tiles,result.stats.vertices,result.stats.edges,result.stats.faces],
  [16,21,36,16]);
assert.equal(result.stats.checks.geometry.status,'passed');
assert.equal(result.stats.checks.local.status,'not_applicable');
assert.equal(result.stats.checks.layerOrder.status,'not_checked');
assert.equal(result.stats.foldability,'not_applicable');
assert.equal(result.source.output,'tiling');
const expectedCells=[] as number[][],expectedSources=[] as number[];
for(const y of [0,1])for(const x of [0,1])for(const sourceTile of [0,1,2,3]){
  expectedCells.push([x,y]);expectedSources.push(sourceTile);
}
assert.deepEqual(result.mother.zhezhi_lattice_cells,expectedCells);
assert.deepEqual(result.mother.zhezhi_custom_face_index,expectedSources);
console.log(JSON.stringify({example:'In[3245–3247]',sourceTiles:4,outputTiles:16,
  vertices:21,edges:36,lattice:geometry.lattice,
  geometry:result.stats.checks.geometry.status,
  local:result.stats.checks.local.status,
  foldability:result.stats.foldability}));

const source14=twoUniformPatchPreset(14),geometry14=twoUniformPatchGeometry(14);
assert.deepEqual(geometry14.tileSpecs.map(item=>item.sides),[4,4,4,3,3]);
assert.deepEqual(geometry14.tileSpecs.slice(1).map(item=>[
  item.join?.targetTile,item.join?.targetVertex,item.join?.sourceVertex]),
  [[0,1,0],[1,1,0],[2,1,0],[3,1,1]]);
assert.equal(geometry14.sourceTiles.length,5);
assert.equal(geometry14.vertices.length,10);
assert.equal(geometry14.faces.length,5);
near(geometry14.lattice[0][0],3+Math.sqrt(3)/2);
near(geometry14.lattice[0][1],.5);
near(geometry14.lattice[1][0],0);
near(geometry14.lattice[1][1],1);
const params14=readTessParams(JSON.parse(JSON.stringify(twoUniformPatchParams(source14))));
assert.ok(params14&&params14.family==='custom');
assert.deepEqual(params14.twoUniformPatch,source14);
assert.equal(readTessParams({...params14,twoUniformPatch:{...source14,source:source.source}}),null);
for(const [key,changed] of [
  ['vertices',params14.vertices.map((point,i)=>i===0?[point[0]+.01,point[1]]:point)],
  ['lattice',[[geometry14.lattice[0][0]+.01,geometry14.lattice[0][1]],geometry14.lattice[1]]],
  ['tileSpecs',params14.tileSpecs?.map((item,i)=>i===3?{...item,sides:4}:item)],
  ['customOutput','twist'],
] as const)assert.equal(readTessParams({...params14,[key]:changed}),null,`n=14 forged ${key}`);
const {twoUniformPatch:_name14,tileSpecs:_specs14,...request14}=params14;
const run14=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
  cwd:root,input:JSON.stringify(request14),encoding:'utf8',timeout:30000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(run14.status,0,run14.error?.message||run14.stderr);
const result14=JSON.parse(run14.stdout) as TessResponse;
assert.deepEqual([result14.stats.tiles,result14.stats.vertices,result14.stats.edges,result14.stats.faces],
  [20,27,46,20]);
assert.equal(result14.stats.checks.geometry.status,'passed');
assert.equal(result14.stats.checks.local.status,'not_applicable');
assert.equal(result14.stats.checks.layerOrder.status,'not_checked');
assert.equal(result14.stats.foldability,'not_applicable');
assert.equal(result14.source.output,'tiling');
assert.deepEqual(readCustomMeshJson(params14,JSON.stringify({
  vertices:params14.vertices,faces:params14.faces})).twoUniformPatch,source14);
assert.equal(readCustomMeshJson(params14,JSON.stringify({
  vertices:params14.vertices.map((point,i)=>i===0?[point[0]+.01,point[1]]:point),
  faces:params14.faces})).twoUniformPatch,undefined);
const expected14Cells=[] as number[][],expected14Sources=[] as number[];
for(const y of [0,1])for(const x of [0,1])for(const sourceTile of [0,1,2,3,4]){
  expected14Cells.push([x,y]);expected14Sources.push(sourceTile);
}
assert.deepEqual(result14.mother.zhezhi_lattice_cells,expected14Cells);
assert.deepEqual(result14.mother.zhezhi_custom_face_index,expected14Sources);
console.log(JSON.stringify({example:'In[3249–3251]',sourceTiles:5,outputTiles:20,
  vertices:27,edges:46,lattice:geometry14.lattice,
  geometry:result14.stats.checks.geometry.status,
  local:result14.stats.checks.local.status,
  foldability:result14.stats.foldability}));

const requests:Record<string,unknown>[]=[],geometries=[] as ReturnType<typeof twoUniformPatchGeometry>[];
for(let index=1;index<=20;index++){
  const number=index as TwoUniformPatchNumber,row=TWO_UNIFORM_PATCH_CATALOG[number];
  assert.equal(row.joins.length,row.sides.length-1);
  assert.equal(row.vectors.length,2);
  const mesh=twoUniformPatchGeometry(number),named=twoUniformPatchPreset(number);
  geometries.push(mesh);
  assert.deepEqual(mesh.tileSpecs.map(item=>item.sides),row.sides);
  assert.deepEqual(mesh.tileSpecs.slice(1).map(item=>[
    item.join!.targetTile+1,item.join!.targetVertex+1,item.join!.sourceVertex+1]),row.joins);
  const restored=readTessParams(JSON.parse(JSON.stringify(twoUniformPatchParams(named))));
  assert.ok(restored&&restored.family==='custom',`n=${number} source readback`);
  assert.deepEqual(restored.twoUniformPatch,named);
  assert.equal(readTessParams({...restored,twoUniformPatch:{...named,source:'forged'}}),null);
  assert.equal(readTessParams({...restored,vertices:restored.vertices.map((point,i)=>
    i===0?[point[0]+.01,point[1]]:point)}),null);
  const {twoUniformPatch:_source,tileSpecs:_tiles,...request}=restored;
  requests.push(request);
}

// The reference notebook is not shipped with the app; audit its saved inputs
// when the local audit copy is present, without making packaged tests depend on it.
const notebook=path.join(root,'tmp','Origamica-15.0-reference.nb');
let sourceCompared=false;
if(existsSync(notebook)){
  const text=readFileSync(notebook,'utf8');
  const section=text.slice(text.indexOf('Cell["2-uniform tilings"'),
    text.indexOf('Cell["Periodic equilateral pentagon tilings"'));
  for(let index=1;index<=20;index++){
    const number=index as TwoUniformPatchNumber,row=TWO_UNIFORM_PATCH_CATALOG[number];
    const patchStart=section.indexOf(`RowBox[{"TwoUniformPatch", "[", "${number}", "]"}], "="`);
    const vectorStart=section.indexOf(`RowBox[{"TwoUniformPatchLatticeVectors", "[", "${number}", "]"}], "="`);
    assert.ok(patchStart>=0&&vectorStart>=0,`n=${number} saved definitions`);
    const patchCell=section.slice(patchStart,section.indexOf(']], "Input"',patchStart));
    const vectorCell=section.slice(vectorStart,section.indexOf(']], "Input"',vectorStart));
    const sideMatches=[...patchCell.matchAll(/RowBox\[\{"UnitRegularPolygonTile", ",", "(\d+)"\}\]/g)];
    assert.deepEqual(sideMatches.map(match=>Number(match[1])),row.sides);
    const joins=sideMatches.slice(1).map((match,i)=>{
      const chunk=patchCell.slice(match.index!+match[0].length,
        sideMatches[i+2]?.index??patchCell.length);
      const triples=[...chunk.matchAll(/RowBox\[\{"(\d+)", ",", "(\d+)", ",", "(\d+)"\}\]/g)];
      assert.equal(triples.length,1,`n=${number} join ${i+2}`);
      return triples[0].slice(1).map(Number);
    });
    assert.deepEqual(joins,row.joins);
    const refs=[...vectorCell.matchAll(/RowBox\[\{"(\d+)", ",", "(\d+)"\}\]/g)]
      .map(match=>[Number(match[1]),Number(match[2])]);
    const vectors=vectorCell.includes('"PatchVectors"')
      ?[[refs[0],refs[1]],[refs[0],refs[2]]]
      :[[refs[0],refs[1]],[refs[2],refs[3]]];
    assert.deepEqual(vectors,row.vectors);
  }
  sourceCompared=true;
}

const batchCode=`import json,sys
sys.path.insert(0,'backend')
from tessellate import generate
out=[]
for request in json.load(sys.stdin):
    result=generate(request)
    stats=result['stats'];mother=result['mother']
    out.append({'tiles':stats['tiles'],'vertices':stats['vertices'],'edges':stats['edges'],
        'geometry':stats['checks']['geometry']['status'],
        'local':stats['checks']['local']['status'],
        'layers':stats['checks']['layerOrder']['status'],
        'foldability':stats['foldability'],'output':result['source']['output'],
        'cells':mother['zhezhi_lattice_cells'],
        'indices':mother['zhezhi_custom_face_index'],
        'lattice':mother['zhezhi_lattice_vectors']})
print(json.dumps(out))`;
const batch=spawnSync(python,['-c',batchCode],{
  cwd:root,input:JSON.stringify(requests),encoding:'utf8',timeout:60000,
  maxBuffer:8*1024*1024,windowsHide:true,
  env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
});
assert.equal(batch.status,0,batch.error?.message||batch.stderr);
const summaries=JSON.parse(batch.stdout) as {
  tiles:number;vertices:number;edges:number;geometry:string;local:string;layers:string;
  foldability:string;output:string;cells:number[][];indices:number[];lattice:number[][];
}[];
assert.equal(summaries.length,20);
summaries.forEach((summary,i)=>{
  const number=(i+1) as TwoUniformPatchNumber,count=geometries[i].faces.length;
  assert.equal(summary.tiles,count*4,`n=${number} tiles`);
  assert.equal(summary.geometry,'passed',`n=${number} geometry`);
  assert.equal(summary.local,'not_applicable',`n=${number} local`);
  assert.equal(summary.layers,'not_checked',`n=${number} layers`);
  assert.equal(summary.foldability,'not_applicable',`n=${number} foldability`);
  assert.equal(summary.output,'tiling',`n=${number} output`);
  const cells=[] as number[][],indices=[] as number[];
  for(const y of [0,1])for(const x of [0,1])for(let sourceTile=0;sourceTile<count;sourceTile++){
    cells.push([x,y]);indices.push(sourceTile);
  }
  assert.deepEqual(summary.cells,cells,`n=${number} cells`);
  assert.deepEqual(summary.indices,indices,`n=${number} source order`);
  summary.lattice.forEach((vector,j)=>vector.forEach((value,k)=>
    near(value,geometries[i].lattice[j][k])));
});
console.log(JSON.stringify({catalog:'TwoUniformPatch[1..20]',sources:20,
  savedNotebookCompared:sourceCompared,geometryPassed:summaries.length,
  sourceFaces:summaries.map(item=>item.tiles/4),
  largestOutputTiles:Math.max(...summaries.map(item=>item.tiles))}));
