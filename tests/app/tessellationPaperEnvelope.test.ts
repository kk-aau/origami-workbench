import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,tessPreset,type TessFamily,type TessParams,type TessResponse,type TessGraph,type XY} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {previewEnvelopeCoordinates,type PaperPreviewRecipe} from '../../src/app/tessellationPaperPreview';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

type Paper={shape:'square'|'rectangle'|'regular';aspect?:number;sides?:number;margin:number};
type Case={family:TessFamily;paper:Paper;expected:'solved'|'no-solution';seed?:number};

test('independent paper preserves real layer solutions and rejects plausible but impossible wraps',{timeout:60000},()=>{
  const square:Paper={shape:'square',margin:.1};
  const rectangle:Paper={shape:'rectangle',aspect:1.5,margin:.1};
  const hexagon:Paper={shape:'regular',sides:6,margin:.1};
  const cases:Case[]=[
    {family:'primal-dual',paper:square,expected:'solved'},
    {family:'primal-dual',paper:rectangle,expected:'solved'},
    {family:'primal-dual',paper:hexagon,expected:'solved'},
    {family:'custom',paper:square,expected:'solved'},
    {family:'ring',paper:rectangle,expected:'solved'},
    {family:'flagstone',paper:hexagon,expected:'solved'},
    // The original Voronoi dual uses its input seeds. With that source mapping,
    // the default seed has no layer order; another explicit seed still tests
    // that this paper wrapper can preserve a positive nonperiodic solution.
    {family:'nonperiodic',paper:square,expected:'no-solution'},
    {family:'nonperiodic',paper:square,seed:2,expected:'solved'},
    {family:'periodic',paper:square,expected:'no-solution'},
  ];
  // This tests the older envelope prototype against legacy source folds.
  // New presets already extend to independent paper and must not be wrapped twice.
  const params:TessParams[]=cases.map(({family,seed})=>{
    const value=tessPreset(family);delete value.paper;
    if(family==='nonperiodic'&&value.family==='nonperiodic'&&seed!==undefined)value.seed=seed;
    return value;
  });
  const code=`import sys,json
sys.path.insert(0,'backend')
from tessellate import generate,check_geometry
from tessellation_paper import envelope_paper,paper_local_conditions
results=[]
for entry in json.load(sys.stdin):
    result=generate(entry['params'])
    paper=entry['paper']
    result['testOriginalCoords']=result['fold']['vertices_coords']
    fold=envelope_paper(result['fold'],**paper)
    recipe=fold['zhezhi_paper_recipe']
    result['fold']=fold
    result['source']['paperPreview']={key:recipe[key] for key in ('originalVertices','outlineVertices','shape','aspect','sides','margin')}
    result['stats']['checks']['geometry']=check_geometry(fold)
    result['stats']['checks']['local']=paper_local_conditions(fold)
    results.append(result)
print(json.dumps(results))`;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:JSON.stringify(cases.map((item,i)=>({params:params[i],paper:item.paper}))),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:50000,maxBuffer:20*1024*1024,
  });
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as (TessResponse&{testOriginalCoords:XY[]})[];
  assert.equal(responses.length,cases.length);
  cases.forEach(({family,paper,expected},i)=>{
    const label=family==='nonperiodic'?`${family} seed=${(params[i] as Extract<TessParams,{family:'nonperiodic'}>).seed}`:family;
    const response=responses[i];
    assert.equal(response.stats.checks.geometry.status,'passed',`${label} ${paper.shape} geometry`);
    assert.equal(response.stats.checks.local.status,'passed',`${label} ${paper.shape} local`);
    const fold=response.fold as TessGraph;
    const preview=previewEnvelopeCoordinates(fold,response.testOriginalCoords,response.source.paperPreview as PaperPreviewRecipe);
    assert.ok(preview,`${label} ${paper.shape} preview topology`);
    fold.vertices_coords.forEach((point,j)=>{
      assert.ok(Math.hypot(preview[j][0]-point[0],preview[j][1]-point[1])<1e-7,
        `${label} ${paper.shape} preview vertex ${j}`);
    });
    const prepared=prepareTessResult(response,params[i]);
    const input=tessFlatInput(prepared,prepared.doc,'paper-envelope',true);
    const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});
    assert.equal(geometry.geometry.status,'ready',`${label} ${paper.shape}: ${geometry.geometry.message}`);
    const layers=recomputeFlatLayers(geometry);
    assert.equal(layers.layers.status,expected,`${label} ${paper.shape}: ${layers.layers.message}`);
  });
});

test('the legacy ray-envelope prototype rejects crossings around the corrected woven construction',()=>{
  // The former orthogonal-grid approximation admitted a locally plausible
  // envelope with no layer order. The real woven CP has folded junctions;
  // extending its perimeter rays blindly creates crossings and must fail.
  const code=`import sys,json
sys.path.insert(0,'backend')
from tessellate import generate
from tessellation_paper import envelope_paper
result=generate({'family':'woven'})
try:
    envelope_paper(result['fold'],shape='square',margin=.1)
except ValueError as exc:
    print(json.dumps({'error':str(exc)}))
else:
    raise AssertionError('legacy envelope unexpectedly accepted intersecting woven rays')`;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    encoding:'utf8',windowsHide:true,timeout:15000,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr);
  assert.match(JSON.parse(run.stdout).error,/延伸折痕.*相交/);
});
