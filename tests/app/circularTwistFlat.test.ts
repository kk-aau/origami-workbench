import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {prepareTessResult,type CircularTwistParams,type TessResponse,type XY} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatStartingFace} from '../../src/app/tessellationFlat';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {centeredUnitTriangleVertices,unitRegularCircularTwist} from '../../src/app/circularTwistOriginal';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {flatPresentation} from '../../src/app/flatPresentation';
import {modelRenderMode} from '../../src/app/modelRenderMode';
import {defaultModelColors} from '../../src/app/modelColors';
import ModelRegionSurface from '../../src/components/ModelRegionSurface';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const basic:CircularTwistParams={family:'circular-twist',polygon:[[0,0],[1,0],[.5,.4]],angle:30,radius:2,circleDivisions:16,centralTypes:['M','M','V'],stationaryFace:1};

test('circular stationary face selects the real flat-fold anchor and never uses visual boundary rounding',()=>{
  const params=[basic,{...basic,stationaryFace:7}];
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],
  {input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as TessResponse[];
  const inputs=params.map((p,index)=>{
    const result=prepareTessResult(responses[index],p);
    return tessFlatInput(result,result.doc,JSON.stringify(p),true);
  });
  assert.deepEqual(inputs.map(input=>input.startingFace),[0,6]);
  assert.deepEqual(inputs[0].graph,inputs[1].graph);

  const first=computeFlatGeometry(inputs[0].graph,2e-6,{startingFace:tessFlatStartingFace(inputs[0],null)});
  assert.equal(first.geometry.status,'ready',first.geometry.message);
  assert.equal(tessFlatStartingFace(inputs[1],first),6,'an explicit new face must override the previous frame');
  const second=computeFlatGeometry(inputs[1].graph,2e-6,{startingFace:tessFlatStartingFace(inputs[1],first)});
  assert.equal(second.geometry.status,'ready',second.geometry.message);
  assert.equal(second.geometry.startingFace,6);
  assert.ok(first.geometry.vertices.some((point,i)=>distance(point,second.geometry.vertices[i])>1));

  responses.forEach((response,index)=>{
    const original=(response.fold as {vertices_coords:XY[]}).vertices_coords;
    const strict=response.source.foldedForm as XY[];
    const minX=Math.min(...original.map(p=>p[0])),minY=Math.min(...original.map(p=>p[1]));
    const span=Math.max(Math.max(...original.map(p=>p[0]))-minX,Math.max(...original.map(p=>p[1]))-minY);
    const scale=200/span;
    const actual=index===0?first.geometry.vertices:second.geometry.vertices;
    strict.forEach((point,i)=>assert.ok(distance(actual[i],[(point[0]-minX)*scale,(point[1]-minY)*scale])<1e-5,
      `vertex ${i} differs from the notebook's strict face reflection`));
  });

  const altered=structuredClone(responses[1]);
  altered.source.circularizedFoldedForm=Array(inputs[1].graph.vertices_coords.length).fill([999,999]);
  const rewritten=prepareTessResult(altered,params[1]),roundingIgnored=tessFlatInput(rewritten,rewritten.doc,'rounding-ignored',true);
  assert.deepEqual(roundingIgnored.graph,inputs[1].graph);
  assert.equal(roundingIgnored.startingFace,6);
});

test('saved P32 examples solve layer order and show only verified visible faces',()=>{
  const cases:{name:string;params:CircularTwistParams;order?:number[];frontTops:number[];backTops:number[]}[]=[
    {name:'regular n=4, m=3',params:{family:'circular-twist',...unitRegularCircularTwist(4,3),angle:30,circleDivisions:64,centralTypes:['M','M','V','V'],stationaryFace:'auto'},
      order:[7,2,6,1,0,3,8,4,5],frontTops:[0,3,4,5,6,7,8],backTops:[0,1,2,5,6,7,8]},
    {name:'regular n=6, m=3',params:{family:'circular-twist',...unitRegularCircularTwist(6,3),angle:30,circleDivisions:64,centralTypes:['M','V','M','V','M','V'],stationaryFace:'auto'},
      order:[8,1,10,3,12,5,0,2,4,6,7,9,11],frontTops:[0,2,4,6,7,8,9,10,11,12],backTops:[0,1,3,5,7,8,9,10,11,12]},
    {name:'triangle 40/60/80',params:{family:'circular-twist',polygon:centeredUnitTriangleVertices(40,60),angle:20,radius:1.5,circleDivisions:64,centralTypes:['M','M','M'],stationaryFace:'auto'},
      frontTops:[0,1,4,5,6],backTops:[0,1,2,3,4,5,6]},
  ];
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],
  {input:JSON.stringify(cases.map(item=>item.params)),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const responses=JSON.parse(run.stdout) as TessResponse[];
  cases.forEach(({name,params,order,frontTops,backTops},index)=>{
    const response=responses[index],result=prepareTessResult(response,params);
    assert.equal(response.stats.checks.layerOrder.status,'not_checked',name);
    const input=tessFlatInput(result,result.doc,JSON.stringify(params),true);
    const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace});
    assert.equal(geometry.geometry.status,'ready',`${name}: ${geometry.geometry.message}`);
    const folded=recomputeFlatLayers(geometry);
    assert.equal(folded.layers.status,'solved',`${name}: ${folded.layers.message}`);
    assert.equal(folded.layers.solutionCountExact,'1',name);
    assert.deepEqual(folded.layers.faceOrder,order,name);
    const display=flatPresentation(folded,'front');
    assert.equal(display.hasOrder,!!order,name);
    assert.equal(modelRenderMode(folded,display.hasOrder,{regionsReady:true}),order?'ordered':'regions',name);

    const analysis=modelOverlapRegions(folded);
    assert.equal(analysis.maxDepth,5,name);
    const front=modelRegionLayers(folded,analysis,'front'),back=modelRegionLayers(folded,analysis,'back');
    for(const regions of [front,back])assert.ok(regions.every(region=>region.layers.status==='ordered'),`${name}: incomplete local visibility`);
    const tops=(regions:typeof front)=>[...new Set(regions.map(region=>region.layers.status==='ordered'?region.layers.topToBottom[0]:-1))].sort((a,b)=>a-b);
    assert.deepEqual(tops(front),frontTops,`${name}: front visible faces`);
    assert.deepEqual(tops(back),backTops,`${name}: back visible faces`);
    assert.ok(front.some((region,i)=>region.faces.length>1&&region.layers.status==='ordered'&&back[i].layers.status==='ordered'&&
      region.layers.topToBottom[0]!==back[i].layers.topToBottom[0]),`${name}: front and back must reveal different layers`);
    if(!order){
      const boundaries=modelRegionBoundaries(folded,front);
      assert.equal(boundaries.ambiguousEdges,0);
      assert.ok(boundaries.edges.length>0);
      const svg=renderToStaticMarkup(createElement(ModelRegionSurface,{result:folded,regions:front,boundaries,
        side:'front',rotation:0,colors:defaultModelColors(),face:null,onSelect(){},interactive:false}));
      assert.match(svg,/data-model-region-surface="true"/);
      assert.match(svg,/data-region-top="5"/);
      assert.doesNotMatch(svg,/data-region-status="(?:unconfirmed|conflict)"/);
    }
  });
});
