import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import type {FoldGraph} from '../../src/core/types';
import {wovenNotebookPreset,WOVEN_NOTEBOOK_EXAMPLES,type WovenParams} from '../../src/app/wovenParams';

const originalVariableWidths:Extract<WovenParams,{mode:'lines'}>={
 family:'woven-lines',mode:'lines',
 // Notebook In[3431]: y=.5/.9 and x=1/1.5, inset h=.2/.1 on the four lines.
 lines:[[0,.5,2],[0,.9,1],[90,-1,2],[90,-1.5,1]],
 width:.2,boundary:[[0,0],[2,0],[2,1.5],[0,1.5]],
 borderInset:'none',parity:-1,minPleat:1,minBorderPleat:.01,stationaryFace:0,
};
const originalThreeLines:Extract<WovenParams,{mode:'lines'}>={
 family:'woven-lines',mode:'lines',
 // Notebook In[3429]: x=1, y=1, x+y=3 within [0,4] square.
 lines:[[90,-1,2],[0,1,2],[-45,3/Math.sqrt(2),2]],
 width:.2,boundary:[[0,0],[4,0],[4,4],[0,4]],
 borderInset:'none',parity:1,minPleat:1,minBorderPleat:.01,stationaryFace:5,
};
const originalPeriodic:Extract<WovenParams,{mode:'lines'}>={
 ...originalVariableWidths,
 // Notebook In[3432]: uniform inset .15, four endpoint pairs on opposite edges.
 lines:[[0,.5,1.5],[0,.9,1.5],[90,-1,1.5],[90,-1.5,1.5]],
 borderInset:'auto',periodicity:[[4,14],[0,13],[7,2],[11,8]],
};
const originalSevenStar:Extract<WovenParams,{mode:'chord'}>={
 // Notebook In[3434] explicitly renders a generic FF owing to conflicting overlaps.
 family:'woven-lines',mode:'chord',lines:[[0,.15,1]],order:7,width:.06,
 parity:-1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0,
};

test('named notebook presets exactly match saved inputs and survive strict project reload',()=>{
 const expected={in3429:originalThreeLines,in3431:originalVariableWidths,
  in3432:originalPeriodic,in3434:originalSevenStar};
 assert.equal(WOVEN_NOTEBOOK_EXAMPLES.length,4);
 assert.match(WOVEN_NOTEBOOK_EXAMPLES.find(example=>example.id==='in3434')!.label,/层序冲突.*不可采用/);
 for(const {id} of WOVEN_NOTEBOOK_EXAMPLES){
  const preset=wovenNotebookPreset(id);
  assert.deepEqual(preset,expected[id]);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),expected[id]);
  assert.equal(readTessParams({...preset,unexpected:true}),null);
 }
 const changed=wovenNotebookPreset('in3432');
 changed.periodicity![0][0]=-1;
 assert.deepEqual(wovenNotebookPreset('in3432'),originalPeriodic,'loading a preset returns fresh nested inputs');
});

function generate(parameters:WovenParams[]):TessResponse[]{
 const python=path.resolve('.venv/Scripts/python.exe');
 const run=spawnSync(python,['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{
  input:JSON.stringify(parameters),encoding:'utf8',windowsHide:true,
  env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  timeout:30000,maxBuffer:8*1024*1024,
 });
 assert.equal(run.status,0,run.error?.message??run.stderr);
 return JSON.parse(run.stdout) as TessResponse[];
}

test('saved four-line variable widths produce verified front and back surfaces',()=>{
 const variants:Extract<WovenParams,{mode:'lines'}>[]=[originalVariableWidths,{...originalVariableWidths,width:.1},
  {...originalVariableWidths,width:.2,parity:1 as const},
  {...originalVariableWidths,lines:[[0,.5,2.99],[0,.9,1],[90,-1,2],[90,-1.5,1]]}];
 for(const [index,response] of generate(variants).entries()){
  const params=variants[index],result=prepareTessResult(response,params),key=tessConstructionKey(params);
  assert.equal(result.mother?.vertices_coords.length,16);
  assert.equal(result.mother?.edges_vertices.length,24);
  assert.equal(result.mother?.faces_vertices.length,9);
  assert.equal(result.source.edgeWidths instanceof Array,true);
  const widths=(result.source.edgeWidths as number[]).filter(width=>width>0).sort((a,b)=>a-b);
  assert.deepEqual(widths,params.lines.flatMap(line=>Array(3).fill(params.width*line[2])).sort((a,b)=>a-b));
  const stationaryFace=result.source.stationaryFoldFace as number;
  assert.ok(Number.isInteger(stationaryFace));
  const raw=computeFlatGeometry(response.fold as FoldGraph,1e-7,{startingFace:stationaryFace});
  assert.equal(raw.geometry.status,'ready',raw.geometry.message);
  const reference=response.source.foldedForm as [number,number][];
  reference.forEach((point,i)=>assert.ok(Math.hypot(point[0]-raw.geometry.vertices[i][0],point[1]-raw.geometry.vertices[i][1])<1e-6));
  const input=tessFlatInput(result,result.doc,key,true),graph=input.graph;
  assert.equal(input.startingFace,stationaryFace);
  // The adoption check currently uses its own centre-face root; it must agree
  // on existence of a solution with the saved stationary-face presentation.
  const gateGeometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  assert.equal(gateGeometry.geometry.status,'ready',gateGeometry.geometry.message);
  assert.equal(recomputeFlatLayers(gateGeometry).layers.status,'solved');
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:input.startingFace});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  const solved=recomputeFlatLayers(geometry);
  assert.equal(solved.layers.status,'solved',solved.layers.message);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'no-solution'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),true);
  const analysis=modelOverlapRegions(solved);
  assert.ok(analysis.maxDepth>1);
  const surfaces=[];
  for(const side of ['front','back'] as const){
   const surface=modelRegionLayers(solved,analysis,side);
   assert.ok(surface.length>0);
   assert.ok(surface.every(r=>r.layers.status==='ordered'));
   const boundaries=modelRegionBoundaries(solved,surface);
   assert.ok(boundaries.edges.length>0);
   assert.equal(boundaries.ambiguousEdges,0);
   surfaces.push(surface);
  }
  assert.ok(surfaces[0].some((front,i)=>{
   const back=surfaces[1][i];
   return front.layers.status==='ordered'&&back.layers.status==='ordered'&&
    front.layers.topToBottom.length>1&&front.layers.topToBottom[0]!==back.layers.topToBottom[0];
  }));
 }
});

test('saved three-line arbitrary arrangement retains graph and complete layer order',()=>{
 const response=generate([originalThreeLines])[0],params=originalThreeLines;
 const result=prepareTessResult(response,params),key=tessConstructionKey(params);
 assert.deepEqual([result.mother?.vertices_coords.length,result.mother?.edges_vertices.length,result.mother?.faces_vertices.length],[13,19,7]);
 const expected=[[0,0],[1,0],[3,0],[4,0],[0,1],[1,1],[2,1],[4,1],[1,2],[0,3],[0,4],[1,4],[4,4]];
 const encode=(points:number[][])=>points.map(point=>point.map(value=>value.toFixed(7)).join(',')).sort();
 assert.deepEqual(encode(result.mother!.vertices_coords),encode(expected));
 const fold=response.fold as FoldGraph;
 assert.deepEqual([fold.vertices_coords.length,fold.edges_vertices.length,fold.faces_vertices!.length],[40,64,25]);
 const stationaryFace=result.source.stationaryFoldFace as number;
 const raw=computeFlatGeometry(fold,1e-7,{startingFace:stationaryFace});
 assert.equal(raw.geometry.status,'ready',raw.geometry.message);
 (result.source.foldedForm as [number,number][]).forEach((point,i)=>
  assert.ok(Math.hypot(point[0]-raw.geometry.vertices[i][0],point[1]-raw.geometry.vertices[i][1])<1e-6));
 const input=tessFlatInput(result,result.doc,key,true),graph=input.graph;
 assert.equal(input.startingFace,stationaryFace);
 const gateGeometry=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
 assert.equal(gateGeometry.geometry.status,'ready',gateGeometry.geometry.message);
 assert.equal(recomputeFlatLayers(gateGeometry).layers.status,'solved');
 const geometry=computeFlatGeometry(graph,1e-6,{startingFace:input.startingFace});
 assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
 const solved=recomputeFlatLayers(geometry);
 assert.equal(solved.layers.status,'solved',solved.layers.message);
 assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),true);
 const overlap=modelOverlapRegions(solved);
 for(const side of ['front','back'] as const){
  const regions=modelRegionLayers(solved,overlap,side);
  assert.ok(regions.length>0&&regions.every(region=>region.layers.status==='ordered'));
  assert.equal(modelRegionBoundaries(solved,regions).ambiguousEdges,0);
 }
});

test('saved periodic four-line endpoints retain two folded repeat vectors',()=>{
 const response=generate([originalPeriodic])[0],params=originalPeriodic;
 const result=prepareTessResult(response,params),key=tessConstructionKey(params);
 const mother=result.mother!;
 const pairs=[[[1,0],[1,1.5]],[[1.5,0],[1.5,1.5]],[[0,.5],[2,.5]],[[0,.9],[2,.9]]];
 params.periodicity!.forEach(([a,b],i)=>{
  assert.ok(Math.hypot(...mother.vertices_coords[a].map((v,k)=>v-pairs[i][0][k]))<1e-8);
  assert.ok(Math.hypot(...mother.vertices_coords[b].map((v,k)=>v-pairs[i][1][k]))<1e-8);
 });
 assert.equal(result.source.borderInset,0);
 assert.equal((result.source.periodVectors as number[][]).length,2);
 assert.ok((result.source.closureError as number)<1e-7);
 const input=tessFlatInput(result,result.doc,key,true),graph=input.graph;
 const geometry=computeFlatGeometry(graph,1e-6,{startingFace:input.startingFace});
 assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
 const solved=recomputeFlatLayers(geometry);
 assert.equal(solved.layers.status,'solved',solved.layers.message);
 assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),true);
});

test('saved regular seven-star reports its irreconcilable global overlaps',()=>{
 const params=originalSevenStar,response=generate([params])[0],result=prepareTessResult(response,params);
 const key=tessConstructionKey(params),input=tessFlatInput(result,result.doc,key,true);
 assert.equal(response.stats.checks.geometry.status,'passed');
 assert.equal(response.stats.checks.local.status,'passed');
 assert.deepEqual([response.mother?.vertices_coords.length,response.mother?.faces_vertices.length],[35,29]);
 const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});
 assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
 assert.equal(geometry.geometry.faces.length,113);
 const solved=recomputeFlatLayers(geometry);
 assert.equal(solved.layers.status,'no-solution');
 assert.equal(canAdoptTessWithTileLayers(result,false,key,params,solved.layers.status),false);
});
