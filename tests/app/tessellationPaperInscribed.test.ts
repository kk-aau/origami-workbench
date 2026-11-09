import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {polygonArea} from '../../src/core/geometry';
import type {FoldGraph} from '../../src/core/types';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,tessConstructionKey,tessPreset,
  type TessGraph,type TessParams,type TessPaperSpec,type TessResponse,type XY} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {wovenNotebookPreset} from '../../src/app/wovenParams';
import {exportDocument,importDocument} from '../../src/core/formats';

const papers:TessPaperSpec[]=[
  {fit:'inscribed',shape:'square',margin:.1},
  {fit:'inscribed',shape:'rectangle',aspect:1.5,margin:.1},
  {fit:'inscribed',shape:'regular',sides:6,margin:.1},
];
const cases:TessParams[]=[
  ...papers.flatMap(paper=>[0,1].map(phase=>({...tessPreset('woven'),phase,paper}))),
  {...wovenNotebookPreset('in3431'),paper:papers[0]},
  {...tessPreset('polygon-tile'),paper:papers[0]},
  {...tessPreset('periodic'),paper:papers[0]},
  {...tessPreset('primal-dual'),paper:papers[0]},
  {...tessPreset('brocard'),paper:papers[0]},
  {...tessPreset('split'),paper:papers[0]},
  {...tessPreset('polygon-tile'),polygon:[[0,0],[1e-8,0],[1e-8,1e-8],[0,1e-8]],paper:papers[0]},
];
type Pair={core:TessResponse;cropped:TessResponse};
let pairs:Pair[]|undefined;
function generated():Pair[]{
  if(pairs)return pairs;
  const code=`import sys,json
sys.path.insert(0,'backend')
from tessellate import generate
from tessellation_paper_inscribed import generate_inscribed_paper
from unittest.mock import patch
out=[]
captured=[]
def tracked(params,builder):
    def capture(base):
        core=builder(base)
        captured.append(core)
        return core
    return generate_inscribed_paper(params,capture)
# Source graph IDs in some upstream mother meshes are not deterministic.
# Verify provenance against the core actually used by the public crop route,
# rather than comparing IDs with an independently regenerated graph.
with patch('tessellation_paper_inscribed.generate_inscribed_paper',side_effect=tracked):
    for params in json.load(sys.stdin):
        captured.clear()
        cropped=generate(params)
        assert len(captured)==1
        out.append({'core':captured[0],'cropped':cropped})
print(json.dumps(out))`;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    timeout:60000,maxBuffer:20*1024*1024,
  });
  assert.equal(run.status,0,run.error?.message??run.stderr);
  pairs=JSON.parse(run.stdout) as Pair[];
  return pairs;
}
function onSegment(p:XY,a:XY,b:XY,eps:number):boolean{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(!length)return false;
  const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length);
  return t>=-eps/length&&t<=1+eps/length&&Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))<=eps*length;
}

test('inscribed paper is a complete cropped sheet with every crease and new boundary traced to its source',{timeout:70000},()=>{
  generated().forEach(({core,cropped},i)=>{
    const source=core.fold as TessGraph,fold=cropped.fold as TessGraph,params=cases[i],label=`${params.family} ${params.paper!.shape}`;
    assert.equal(cropped.source.paperMethod,'inscribed-pattern-clip-v1',label);
    assert.equal(cropped.stats.checks.geometry.status,'passed',label);
    const paper=cropped.source.paperPolygon as XY[],span=Math.max(...[0,1].map(k=>Math.max(...source.vertices_coords.map(p=>p[k]))-Math.min(...source.vertices_coords.map(p=>p[k]))));
    const eps=span*1e-7;
    assert.ok(paper.length>=3,label);
    assert.equal(fold.vertices_coords.length-fold.edges_vertices.length+fold.faces_vertices.length,1,label);
    const area=fold.faces_vertices.reduce((sum,face)=>sum+Math.abs(polygonArea(face.map(v=>fold.vertices_coords[v]))),0);
    assert.ok(Math.abs(area-Math.abs(polygonArea(paper)))<=span*span*1e-7,label);
    fold.edges_vertices.forEach(([a,b],edge)=>{
      const x=fold.vertices_coords[a],y=fold.vertices_coords[b],kind=fold.edges_assignment[edge];
      if(kind==='B')assert.ok(paper.some((u,j)=>onSegment(x,u,paper[(j+1)%paper.length],eps)&&onSegment(y,u,paper[(j+1)%paper.length],eps)),label);
      else{
        const originals=source.edges_vertices.flatMap(([u,v],j)=>source.edges_assignment[j]===kind&&
          onSegment(x,source.vertices_coords[u],source.vertices_coords[v],eps)&&onSegment(y,source.vertices_coords[u],source.vertices_coords[v],eps)?[j]:[]);
        assert.equal(originals.length,1,`${label}: cropped edge ${edge} must inherit its exact original crease assignment`);
      }
    });
    const faceMap=cropped.source.sourceFaceMap as number[];
    assert.equal(faceMap.length,fold.faces_vertices.length,label);
    assert.ok(faceMap.every(v=>Number.isInteger(v)&&v>=0&&v<source.faces_vertices.length),label);
    const vertexMap=cropped.source.sourceVertexMap as {vertices:number[];weights:number[]}[];
    assert.equal(vertexMap.length,fold.vertices_coords.length,label);
    vertexMap.forEach((map,vertex)=>{
      assert.equal(map.vertices.length,map.weights.length,label);
      assert.ok(Math.abs(map.weights.reduce((a,b)=>a+b,0)-1)<1e-7,label);
      const point=[0,1].map(axis=>map.vertices.reduce((sum,v,j)=>sum+source.vertices_coords[v][axis]*map.weights[j],0));
      assert.ok(Math.hypot(point[0]-fold.vertices_coords[vertex][0],point[1]-fold.vertices_coords[vertex][1])<=eps,label);
    });
  });
});

test('clipped anchors and saved FF agree with strict face reflection, with actual layer outcomes governing adoption',()=>{
  generated().forEach(({cropped},i)=>{
    const params=cases[i],key=tessConstructionKey(params),result=prepareTessResult(cropped,params),input=tessFlatInput(result,result.doc,key,true);
    assert.equal(input.startingFace,cropped.source.paperStartingFace,params.family);
    const sourceFold=cropped.fold as FoldGraph;
    const min=[0,1].map(k=>Math.min(...sourceFold.vertices_coords.map(p=>p[k])));
    const span=Math.max(...[0,1].map(k=>Math.max(...sourceFold.vertices_coords.map(p=>p[k]))-min[k]));
    const raw=computeFlatGeometry(sourceFold,span*1e-8,{startingFace:input.startingFace});
    assert.equal(raw.geometry.status,'ready',`${params.family}: ${raw.geometry.message}`);
    (cropped.source.foldedForm as XY[]).forEach((point,v)=>assert.ok(Math.hypot(point[0]-raw.geometry.vertices[v][0],point[1]-raw.geometry.vertices[v][1])<span*1e-6,`${params.family}: FF point ${v}`));
    const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace}));
    assert.equal(flat.geometry.status,'ready',params.family);
    assert.ok(['solved','no-solution','incomplete'].includes(flat.layers.status),params.family);
    assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'checking'),false);
    assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'no-solution'),false);
    (cropped.source.foldedForm as XY[]).forEach((point,v)=>assert.ok(Math.hypot(
      (point[0]-min[0])*200/span-flat.geometry.vertices[v][0],(point[1]-min[1])*200/span-flat.geometry.vertices[v][1])<1e-5,
      `${params.family}: displayed FF point ${v}`));
    const local=cropped.stats.checks.local;
    const locallyValid=local.status==='passed'||local.status==='not_applicable'&&local.interiorVertices===0;
    assert.equal(canAdoptTessWithTileLayers(result,false,key,params,flat.layers.status),flat.layers.status==='solved'&&locallyValid);
    // A crop of these already verified ribbon/unit examples must retain a
    // positive solution; other families still report their actual outcome.
    if(['woven','woven-lines','polygon-tile'].includes(params.family))assert.equal(flat.layers.status,'solved',`${params.family} ${params.paper!.shape}: ${flat.layers.message}`);
  });
});

test('cropped box weaving retains complete front and back surfaces and native paper parameters',()=>{
  generated().slice(0,6).forEach(({cropped},i)=>{
    const params=cases[i],result=prepareTessResult(cropped,params),input=tessFlatInput(result,result.doc,tessConstructionKey(params),true);
    const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:input.startingFace})),regions=modelOverlapRegions(flat);
    assert.equal(flat.layers.status,'solved');
    for(const side of ['front','back'] as const){
      const surface=modelRegionLayers(flat,regions,side);
      assert.ok(surface.length>0&&surface.every(r=>r.layers.status==='ordered'));
      assert.equal(modelRegionBoundaries(flat,surface).ambiguousEdges,0);
    }
    const restored=importDocument(exportDocument(result.doc,'json').text,'json').doc;
    assert.deepEqual(readTessParams((restored.metadata?.tessellation as {parameters:unknown}).parameters),params);
    assert.deepEqual((restored.metadata?.tessellation as {source:unknown}).source,(result.doc.metadata?.tessellation as {source:unknown}).source);
  });
});

test('paper anchor overrides removed legacy anchors and rejects missing or invalid current face IDs',()=>{
  const params=cases[0],response=generated()[0].cropped;
  const result=prepareTessResult({...response,source:{...response.source,stationaryFoldFace:99999,foldedFormStationaryFace:99999}},params);
  assert.equal(tessFlatInput(result,result.doc,'valid-crop-anchor',true).startingFace,response.source.paperStartingFace);
  const faces=(response.fold as TessGraph).faces_vertices.length;
  for(const face of [undefined,-1,1.5,faces]){
    const invalid=prepareTessResult({...response,source:{...response.source,paperStartingFace:face}},params);
    assert.throws(()=>tessFlatInput(invalid,invalid.doc,'invalid-crop-anchor',true),/内切纸张固定折痕面编号无效/);
  }
});
