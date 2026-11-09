import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import type {FoldGraph} from '../../src/core/types';
import {prepareTessResult,tessConstructionKey,tessPreset,type TessParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';

type BoxParams=Extract<TessParams,{family:'woven'}>;
type BoxResponse=TessResponse&{fold:FoldGraph&{faces_vertices:number[][]}};
const layouts=['plain','basket','twill'] as const;
const parameters:BoxParams[]=[
  ...layouts.flatMap(weave=>[.1,.25,.45].flatMap(width=>
    [0,1].map(phase=>({...tessPreset('woven'),weave,width,phase})))),
  // A former numerical branch passed every default test but produced no
  // layer solution for the wide, non-square 2x4 staggered construction.
  ...layouts.flatMap(weave=>[0,1].map(phase=>
    ({...tessPreset('woven'),rows:2,columns:4,width:.45,weave,phase}))),
];
let responses:BoxResponse[]|undefined;
function generated():BoxResponse[]{
  if(responses)return responses;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{
    input:JSON.stringify(parameters),encoding:'utf8',windowsHide:true,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    timeout:60000,maxBuffer:12*1024*1024,
  });
  assert.equal(run.status,0,run.error?.message??run.stderr);
  responses=JSON.parse(run.stdout) as BoxResponse[];
  return responses;
}

test('box-pleat layouts and both phases have real whole-paper layer solutions across the width range',{timeout:90000},()=>{
  generated().forEach((response,index)=>{
    const params=parameters[index],label=`${params.rows}x${params.columns}, ${params.weave}, width=${params.width}, phase=${params.phase}`;
    assert.equal(response.stats.checks.geometry.status,'passed',label);
    assert.equal(response.stats.checks.local.status,'passed',label);
    assert.ok(response.mother,'the orthogonal line arrangement is a mother structure, not the CP');
    const result=prepareTessResult(response,params),input=tessFlatInput(result,result.doc,tessConstructionKey(params),true);
    assert.equal(input.startingFace,response.source.stationaryFoldFace,label);
    assert.deepEqual(input.graph.edges_assignment,response.fold.edges_assignment,label);
    const geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace});
    assert.equal(geometry.geometry.status,'ready',`${label}: ${geometry.geometry.message}`);
    const flat=recomputeFlatLayers(geometry);
    assert.equal(flat.layers.status,'solved',`${label}: ${flat.layers.message}`);
    const raw=computeFlatGeometry(response.fold as FoldGraph,1e-7,{startingFace:input.startingFace});
    assert.equal(raw.geometry.status,'ready',label);
    const reference=response.source.foldedForm as [number,number][];
    assert.equal(reference.length,response.fold.vertices_coords.length,label);
    reference.forEach((point,i)=>assert.ok(Math.hypot(point[0]-raw.geometry.vertices[i][0],point[1]-raw.geometry.vertices[i][1])<1e-6,
      `${label}: saved folded point ${i} disagrees with strict face reflection`));
    // Verify the displayed graph uses the same source anchor and scale, too.
    const cp=response.fold.vertices_coords,min=[Math.min(...cp.map(p=>p[0])),Math.min(...cp.map(p=>p[1]))];
    const scale=200/Math.max(Math.max(...cp.map(p=>p[0]))-min[0],Math.max(...cp.map(p=>p[1]))-min[1]);
    reference.forEach((point,i)=>assert.ok(Math.hypot((point[0]-min[0])*scale-geometry.geometry.vertices[i][0],
      (point[1]-min[1])*scale-geometry.geometry.vertices[i][1])<1e-5,`${label}: displayed folded point ${i}`));
  });
});

test('box-pleat phase reverses all creases without changing the sheet, and layouts produce distinct constructions',()=>{
  const results=generated();
  for(let index=0;index<results.length;index+=2){
    const front=results[index],back=results[index+1];
    assert.deepEqual(front.fold.vertices_coords,back.fold.vertices_coords);
    assert.deepEqual(front.fold.edges_vertices,back.fold.edges_vertices);
    assert.deepEqual(front.fold.faces_vertices,back.fold.faces_vertices);
    front.fold.edges_assignment.forEach((kind,i)=>assert.equal(back.fold.edges_assignment[i],kind==='M'?'V':kind==='V'?'M':kind));
  }
  const middle=layouts.map(weave=>results[parameters.findIndex(p=>p.weave===weave&&p.width===.25&&p.phase===0)]);
  for(let a=0;a<middle.length;a++)for(let b=a+1;b<middle.length;b++){
    assert.notDeepEqual(middle[a].mother!.vertices_coords,middle[b].mother!.vertices_coords);
    assert.notDeepEqual(middle[a].fold.vertices_coords,middle[b].fold.vertices_coords);
  }
});

test('box-pleat front and back expose complete, ordered surfaces rather than missing or invented faces',()=>{
  const results=generated();
  for(const weave of layouts){
    const index=parameters.findIndex(p=>p.weave===weave&&p.width===.25&&p.phase===0),params=parameters[index];
    const result=prepareTessResult(results[index],params),input=tessFlatInput(result,result.doc,tessConstructionKey(params),true);
    const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace}));
    assert.equal(flat.layers.status,'solved',weave);
    const overlap=modelOverlapRegions(flat);
    assert.ok(overlap.maxDepth>1,weave);
    const front=modelRegionLayers(flat,overlap,'front'),back=modelRegionLayers(flat,overlap,'back');
    assert.ok(front.length>0,weave);
    assert.equal(front.length,back.length,weave);
    front.forEach((region,i)=>{
      const opposite=back[i];
      assert.equal(region.layers.status,'ordered',weave);
      assert.equal(opposite.layers.status,'ordered',weave);
      if(region.layers.status==='ordered'&&opposite.layers.status==='ordered'){
        assert.deepEqual(region.layers.topToBottom,[...opposite.layers.topToBottom].reverse(),weave);
        assert.deepEqual([...region.layers.topToBottom].sort((a,b)=>a-b),[...region.faces].sort((a,b)=>a-b),weave);
      }
    });
    for(const surface of [front,back]){
      const boundaries=modelRegionBoundaries(flat,surface);
      assert.ok(boundaries.edges.length>0,weave);
      assert.equal(boundaries.ambiguousEdges,0,weave);
    }
  }
});

test('box-pleat presentation refuses a missing or stale construction anchor',()=>{
  const params=parameters[0],response=generated()[0];
  for(const face of [undefined,-1,1.5,response.fold.faces_vertices.length]){
    const result=prepareTessResult({...response,source:{...response.source,stationaryFoldFace:face}},params);
    assert.throws(()=>tessFlatInput(result,result.doc,'bad-anchor',true),/编织固定折痕面编号无效/);
  }
});
