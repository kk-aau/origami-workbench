import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSurfaceLayers,selectSimulationSurfaceBaseGap,resizeSimulationSurfaceGap,type SimulationSurfaceMesh} from '../../src/engine/simSurfaceLayers';
import type {PreparedOrigamiModel,FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

const camera={center:[0,0,0] as [number,number,number],camDist:3.2,depthRange:2};
const close=(a:number,b:number,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
function threeLayerHinge(){
  const vertices=[[0,0,0],[1,0,0],[0,1,0],[0,1,0],[0,0,0],[1,0,0],[0,1,0]],faces=[[0,1,2],[1,0,3],[4,5,6]],positions=Float32Array.from(vertices.flat());
  const edgesVertices:[number,number][]=[],edgesFaces:number[][]=[],facesEdges:number[][]=[],lookup=new Map<string,number>();
  for(const [f,face] of faces.entries())facesEdges.push(face.map((a,k)=>{
    const b=face[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');let e=lookup.get(key);
    if(e===undefined){e=edgesVertices.length;lookup.set(key,e);edgesVertices.push([a,b]);edgesFaces.push([]);}edgesFaces[e].push(f);return e;
  }));
  const edgesAssignment:FoldAssignment[]=edgesFaces.map(f=>f.length===2?'M':'B'),edgesFoldAngle=edgesAssignment.map(a=>a==='M'?-180:0);
  const prepared:PreparedOrigamiModel={fold:{vertices_coords:vertices,edges_vertices:edgesVertices,edges_assignment:edgesAssignment,edges_foldAngle:edgesFoldAngle,faces_vertices:faces},
    positions,originalPositions:positions.slice(),colors:new Float32Array(positions.length),indices:Uint32Array.from(faces.flat()),vertexCount:vertices.length,edgeCount:edgesVertices.length,faceCount:faces.length,
    edgesVertices,edgesFaces,facesEdges,edgesAssignment,edgesFoldAngle,facesVertices:faces,creaseParams:[],diagnostics:{warnings:[],errors:[]},triangleSourceFaces:[0,1,2],sourceFaceCount:3};
  const layers=new SimulationSurfaceLayers(prepared,1);
  // Canonical heights: face 0 < face 2 < face 1. The direct material
  // hinge connects faces 0/1 across one intervening physical sheet.
  layers.setLayerOrder({sourceSignature:'explicit-three-layer-order',sourceFaceCount:3,faceOrders:[[0,2,-1],[2,1,1]]});
  return {prepared,layers};
}

test('doubled display spacing covers Float32 coordinates and sixteen real perspective depth quanta',()=>{
  const gap=selectSimulationSurfaceBaseGap(camera,1,24,1);
  assert.ok(gap>=16*2**-23);assert.ok(gap<2e-5,'the doubled normal-view gap remains smaller than the former 5e-5');
  const depth=(distance:number)=>5.2/4*(1-1.2/distance),atFarModel=4.2;
  assert.ok((depth(atFarModel)-depth(atFarModel-gap))*(2**24-1)>15.999,'even the farthest paper gets sixteen depth quanta');
  assert.ok(Math.fround(1+gap)>1,'the offset survives the position buffer');
  const cpu=selectSimulationSurfaceBaseGap(camera,1,53,1);
  close(cpu,16*2**-23);assert.ok(cpu<gap,'software depth can use the smaller position precision floor');
});

test('spacing follows view alignment, precision and world scale with an invisible grazing cap',()=>{
  const direct=selectSimulationSurfaceBaseGap(camera,1,24,1),slanted=selectSimulationSurfaceBaseGap(camera,1,24,.6);
  assert.ok(slanted>direct);close(slanted,direct/.6);
  close(selectSimulationSurfaceBaseGap(camera,1,24,1e-12),4e-5);
  close(selectSimulationSurfaceBaseGap(camera,1,16,1),4e-5);
  close(selectSimulationSurfaceBaseGap({...camera,camDist:32,depthRange:20,center:[0,0,0]},10,24,1),direct*10);
  const translated=selectSimulationSurfaceBaseGap({...camera,center:[10,0,0]},1,53,1);
  assert.ok(translated>selectSimulationSurfaceBaseGap(camera,1,53,1),'world-coordinate Float32 ULPs are not assumed to equal radius ULPs');
  for(const value of [NaN,Infinity,-1,0])assert.ok(Number.isFinite(selectSimulationSurfaceBaseGap(camera,value,24,.5)));
});

test('rank distance includes intervening layers while custom display spacing preserves all solver data',()=>{
  const {prepared,layers}=threeLayerHinge(),before=structuredClone(prepared),gap=selectSimulationSurfaceBaseGap(camera,1,24,.75);
  const display=layers.build(prepared.positions,gap)!;
  assert.ok(display);assert.equal(display.layerGap,gap);assert.equal(display.layerCount,3);
  assert.equal(display.hingeLayerSpans!.length,1);
  const span=display.hingeLayerSpans![0];assert.equal(span.layersApart,2);assert.equal(span.interveningLayers,1);close(span.distance,2*gap);
  for(const source of span.sourceVertices){
    const banks=Array.from(display.sourceVertices).flatMap((v,i)=>v===source?[i]:[]);assert.equal(banks.length,2);
    const a=banks[0],b=banks[1],actual=Math.hypot(...[0,1,2].map(k=>display.positions[a*3+k]-display.positions[b*3+k]));
    close(actual,span.distance,1e-10);
  }
  assert.deepEqual(prepared,before,'display thickness changes neither rest, solver, CP nor topology');
  assert.deepEqual(layers.build(prepared.positions,gap)!.positions,display.positions);
  assert.equal(layers.build(prepared.positions)!.layerGap,5e-5,'default remains compatible');
});

test('invalid or oversized requested gaps cannot manufacture a thick display stack',()=>{
  const {prepared,layers}=threeLayerHinge();
  for(const gap of [0,-1,NaN,Infinity])assert.equal(layers.build(prepared.positions,gap),null);
  const capped=layers.build(prepared.positions,.1)!;assert.equal(capped.layerGap,5e-5);
  assert.ok(capped.hingeLayerSpans!.every(h=>h.distance===h.layersApart*capped.layerGap));
});

test('resizing a global stack preserves the full zero-gap plane correction and shared topology',()=>{
  const {prepared,layers}=threeLayerHinge();prepared.positions[3*3+2]=1e-4;
  for(let v=4;v<7;v++)prepared.positions[v*3+2]=-1e-4;
  const before=prepared.positions.slice(),base=layers.build(prepared.positions,8e-6)!;assert.ok(base);
  for(const gap of [1e-6,2e-5,8.1e-6]){
    const resized=resizeSimulationSurfaceGap(base,gap)!;assert.ok(resized);assert.equal(resized.layerGap,gap);
    for(const name of ['indices','edgesVertices','edgesAssignment','sourceVertices','sourceVertexWeights','sourceTriangles','gapBasePositions','gapDirections'] as const)assert.equal(resized[name],base[name],`${name} remains cached`);
    for(let f=0;f<resized.indices.length/3;f++)for(const v of resized.indices.slice(f*3,f*3+3)){
      const rank=[0,2,1][resized.sourceTriangles![f]];close(resized.positions[v*3+2],rank*gap,1e-10);
    }
    assert.equal(resized.hingeLayerSpans![0].distance,2*gap);
  }
  assert.deepEqual(prepared.positions,before);assert.equal(base.layerGap,8e-6);
  for(const invalid of [0,-1,NaN,Infinity,1e-3])assert.equal(resizeSimulationSurfaceGap(base,invalid),null);
});

test('a Float32-collapsed winding rejects a resize atomically without changing cached triangles',()=>{
  const width=2**-23,positions=Float32Array.from([1,0,0,1+width,0,0,1,1,0]);
  const mesh:SimulationSurfaceMesh={positions,indices:Uint32Array.from([0,1,2]),edgesVertices:[],edgesAssignment:[],sourceVertices:Uint32Array.from([0,1,2]),layerCount:2,layerNormals:[[0,0,1]],layerGap:1e-6,
    gapBasePositions:Float64Array.from(positions),gapDirections:Float64Array.from([1,0,0,1,0,0,1,0,0]),gapLimit:2,gapTriangleNormals:Float64Array.from([0,0,width])};
  const before=positions.slice(),indices=mesh.indices.slice();
  assert.equal(resizeSimulationSurfaceGap(mesh,1),null,'translation across an exponent boundary collapses a narrow Float32 triangle');
  assert.deepEqual(mesh.positions,before);assert.deepEqual(mesh.indices,indices);assert.equal(mesh.layerGap,1e-6);
});

test('an explicit display domain permits visible separation without changing the paper-plane tolerance',()=>{
  const {prepared,layers}=threeLayerHinge(),before=structuredClone(prepared),layout=layers.build(prepared.positions,4e-5,{maxGap:4e-2})!;
  assert.ok(layout);assert.equal(layout.layerGap,4e-5);assert.equal(layout.gapLimit,4e-2);
  const wide=resizeSimulationSurfaceGap(layout,4e-2)!;assert.ok(wide);assert.equal(wide.layerGap,4e-2);
  close(wide.hingeLayerSpans![0].distance,.08);assert.ok(Math.max(...wide.positions)-Math.max(...layout.positions)>=0);
  for(let f=0;f<wide.indices.length/3;f++)for(const v of wide.indices.slice(f*3,f*3+3))close(wide.positions[v*3+2],[0,2,1][wide.sourceTriangles![f]]*.04,1e-8);
  assert.deepEqual(prepared,before);for(const maxGap of [NaN,Infinity,0,-1])assert.equal(layers.build(prepared.positions,4e-5,{maxGap}),null);
  for(let v=4;v<7;v++)prepared.positions[v*3+2]=.01;
  assert.equal(layers.build(prepared.positions,4e-5,{maxGap:4e-2}),null,'a display domain cannot make distinct material planes coplanar');
});

test('wide-domain Float32 repairs obey each original source triangle area budget and remain atomic',()=>{
  const width=2**-23,positions=Float32Array.from([0,0,0,1,0,0,0,1,0,1,0,0,1+width,0,0,1,1,0]),indices=Uint32Array.from([0,1,2,3,4,5]),tinyArea=width/2;
  const mesh:SimulationSurfaceMesh={positions,indices,edgesVertices:[],edgesAssignment:[],sourceVertices:Uint32Array.from([0,1,2,3,4,5]),layerCount:2,layerNormals:[[0,0,1]],layerGap:1e-6,
    gapBasePositions:Float64Array.from(positions),gapDirections:Float64Array.from({length:18},(_,i)=>i%3===0?1:0),gapLimit:2,gapTriangleNormals:Float64Array.from([0,0,1,0,0,width]),sourceTriangles:Uint32Array.from([0,0]),
    gapSliverRepair:{sourceAreas:Float64Array.from([.5+tinyArea]),triangleAreas:Float64Array.from([.5,tinyArea]),triangleReversed:new Uint8Array(2),missingAreas:new Float64Array(1)}};
  const before=structuredClone(mesh),safe=resizeSimulationSurfaceGap(mesh,1)!;assert.ok(safe);assert.deepEqual(Array.from(safe.indices),[0,1,2]);
  assert.deepEqual(Array.from(safe.sourceTriangles!),[0]);assert.equal(safe.gapTriangleNormals!.length,3);assert.equal(safe.gapSliverRepair!.missingAreas[0],tinyArea);
  assert.equal(safe.gapBasePositions,mesh.gapBasePositions);assert.equal(safe.sourceVertices,mesh.sourceVertices);assert.deepEqual(mesh,before);
  const separateSource={...mesh,sourceTriangles:Uint32Array.from([0,1]),gapSliverRepair:{...mesh.gapSliverRepair!,sourceAreas:Float64Array.from([.5,tinyArea]),missingAreas:new Float64Array(2)}};
  assert.equal(resizeSimulationSurfaceGap(separateSource,1),null,'a tiny source flap cannot disappear just because another source triangle is large');
  const directions=new Float64Array(18);directions[12]=-2*width;
  const reversible={...mesh,gapDirections:directions},flipped=resizeSimulationSurfaceGap(reversible,1)!;assert.ok(flipped);
  assert.deepEqual(Array.from(flipped.indices),[0,1,2,3,5,4]);assert.deepEqual(Array.from(flipped.gapSliverRepair!.triangleReversed),[0,1]);
  const restored=resizeSimulationSurfaceGap(flipped,.1)!;assert.ok(restored);assert.deepEqual(restored.indices,indices);assert.deepEqual(Array.from(restored.gapSliverRepair!.triangleReversed),[0,0]);
});
