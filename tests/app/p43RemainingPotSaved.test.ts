import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {exportDocument,importDocument} from '../../src/core/formats';
import {radialPotSavedParams,matchRadialPotSaved,upwardSineFiveSection} from '../../src/app/radialPotSaved';
import {rectangularPotSavedParams,matchRectangularPotSaved,type RectangularPotSavedCell} from '../../src/app/rectangularPotSaved';
import {radialPotPreset} from '../../src/app/radialPotParams';
import {rectangularPotPreset} from '../../src/app/rectangularPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';

const python=(params:unknown):TessResponse=>{
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],
    {input:JSON.stringify(params),encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout) as TessResponse;
};
const rectangularCases:[RectangularPotSavedCell,[number,number,number]][]=[
  [3489,[30,49,20]],[3490,[25,40,16]],[3491,[28,47,20]],
  [3492,[21,36,16]],[3493,[19,33,15]],[3494,[26,45,20]],
  [3503,[105,204,100]],
  [3504,[425,824,400]],[3505,[425,824,400]],[3506,[117,228,112]],
];

test('remaining P43 saved profile formulas, wedge/panel modes and older defaults are exact',()=>{
  const up=upwardSineFiveSection();
  assert.equal(up.length,5);
  for(let i=0;i<5;i++){
    assert.ok(Math.abs(up[i][0]-.5*Math.sin(Math.PI*i/6))<1e-15);
    assert.ok(Math.abs(up[i][1]-(1-Math.cos(Math.PI*i/6)))<1e-15);
  }
  const radial=radialPotSavedParams(3483);
  assert.deepEqual(radial.crossSection,up);
  assert.deepEqual([radial.sectors,radial.asymmetry,radial.flatFlangeInset],[5,-1,.1]);
  assert.equal(matchRadialPotSaved(radial),3483);
  assert.deepEqual(readTessParams(radialPotPreset()),radialPotPreset());
  assert.deepEqual(readTessParams(rectangularPotPreset()),rectangularPotPreset());
  for(const [cell] of rectangularCases){
    const params=rectangularPotSavedParams(cell);
    assert.equal(matchRectangularPotSaved(params),cell);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
    assert.equal(params.panels,cell>=3489&&cell<=3494?1:cell===3506?7:cell===3503?5:4);
  }
  assert.deepEqual(rectangularPotSavedParams(3506).crossSection,up);
  assert.deepEqual([rectangularPotSavedParams(3506).sectors,
    rectangularPotSavedParams(3506).asymmetry,
    rectangularPotSavedParams(3506).flatFlangeInset],[8,-1,.1]);
  assert.equal(rectangularPotSavedParams(3491).gapHalfAngleDeg,3);
  assert.equal(rectangularPotSavedParams(3494).gapHalfAngleDeg,4);
  assert.deepEqual(rectangularPotSavedParams(3503).crossSection,
    [[0,0],[1,1],[1,2],[1,3],[2,4]]);
  assert.deepEqual([rectangularPotSavedParams(3503).sectors,
    rectangularPotSavedParams(3503).typeMinimumAngleDeg],[5,10]);
  assert.equal(matchRectangularPotSaved({...rectangularPotSavedParams(3494),gapHalfAngleDeg:3}),null);
});

test('each remaining executed saved pot passes backend spatial gate and native project readback',()=>{
  const entries:[[number,number,number],ReturnType<typeof radialPotSavedParams>|ReturnType<typeof rectangularPotSavedParams>][]=[
    [[81,160,80],radialPotSavedParams(3483)],
    ...rectangularCases.map(([cell,expected])=>[expected,rectangularPotSavedParams(cell)] as const),
  ];
  for(const [expected,params] of entries){
    const response=python(params);
    assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],expected);
    assert.equal(response.stats.checks.geometry.status,'passed');
    assert.equal(response.source.staticGlobalIsometryChecked,true);
    const result=prepareTessResult(response,params);
    const scene=spatialMeshScene(result);
    assert.ok(scene);
    assert.equal(scene.faces.length,expected[2]);
    assert.equal(canAdoptTess(result,false,tessConstructionKey(params),params),true);
    const restored=importDocument(exportDocument(result.doc,'json').text,'json').doc;
    const source=restored.metadata?.tessellation as {parameters:unknown;source:Record<string,unknown>};
    assert.deepEqual(readTessParams(source.parameters),params);
    assert.ok(spatialMeshScene({fold:response.fold,source:source.source}));
    if(params.family==='rectangular-pot'&&params.gapHalfAngleDeg===4){
      const join=response.source.wedgeJoinVertices0Based as number[][];
      assert.deepEqual(join.map(row=>row.length),[5,5]);
      assert.ok(join.flat().every(index=>Number.isInteger(index)&&index>=0&&index<expected[0]));
    }
  }
});
