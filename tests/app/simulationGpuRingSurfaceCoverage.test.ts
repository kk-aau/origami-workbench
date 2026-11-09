import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {simulationLayerOrder} from '../../src/engine/simLayerOrder';
import {SimulationSurfaceLayers,resizeSimulationSurfaceGap,blendSimulationSurface,type SimulationSurfaceMesh} from '../../src/engine/simSurfaceLayers';
import {auditTrustedSurfaceSeparation} from '../fixtures/simulationSurfaceSeparation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {FoldGraph} from '../../src/core/types';

const source=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-self-contact-default-ring.fold.json',import.meta.url),'utf8')) as FoldGraph;
// Actual WebGL2 100% endpoint captured on 2026-10-15 in the independent test
// workspace. It retains solver error; this is not ideal flat-fold geometry.
// The exported FOLD basis [x,y,z] converts back to solver [x,z,-y] once.
const captured=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-self-contact-default-ring-webgl2-endpoint.fold.json',import.meta.url),'utf8')) as {vertices_coords:[number,number,number][];faces_vertices:number[][]};
const largeSource=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-self-contact-ring-16-3.fold.json',import.meta.url),'utf8')) as FoldGraph;
type Vector=[number,number,number];
const sub=(a:Vector,b:Vector):Vector=>a.map((n,k)=>n-b[k]) as Vector;
const cross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vector,b:Vector)=>a.reduce((sum,n,k)=>sum+n*b[k],0);
const point=(p:ArrayLike<number>,v:number):Vector=>[p[v*3],p[v*3+1],p[v*3+2]];

function assertWholeMaterialPanels(prepared:PreparedOrigamiModel,display:SimulationSurfaceMesh,requirePlanar=true){
  const sourceTriangles=display.sourceTriangles??Uint32Array.from({length:display.indices.length/3},(_,f)=>f);
  assert.equal(display.indices.length,prepared.indices.length,'each original material triangle appears once; no dynamic overlap fragments');
  assert.equal(sourceTriangles.length,prepared.faceCount);
  assert.deepEqual(Array.from(sourceTriangles).sort((a,b)=>a-b),Array.from({length:prepared.faceCount},(_,f)=>f),'no source triangle is omitted, repeated or split');
  const parents=prepared.facesVertices.map((_,f)=>f),find=(f:number):number=>parents[f]===f?f:parents[f]=find(parents[f]);
  prepared.edgesFaces.forEach((faces,e)=>{if(prepared.edgesAssignment[e]==='F'&&faces.length===2)parents[find(faces[1])]=find(faces[0]);});
  const panelVertices=new Map<number,Set<number>>();
  prepared.facesVertices.forEach((vertices,f)=>{const set=panelVertices.get(find(f))??new Set();vertices.forEach(v=>set.add(v));panelVertices.set(find(f),set);});
  const expectedVertices=[...panelVertices.values()].reduce((sum,vertices)=>sum+vertices.size,0);
  assert.equal(display.sourceVertices.length,expectedVertices,'only whole-panel hinge banks may duplicate source vertices');
  const vertexBanks=new Map<string,number>(),used=new Set<number>();
  for(let f=0;f<sourceTriangles.length;f++){
    const original=sourceTriangles[f],expected=prepared.facesVertices[original],ids=Array.from(display.indices.slice(f*3,f*3+3)),actual=ids.map(v=>display.sourceVertices[v]);
    assert.ok(expected.some((_,shift)=>actual.every((v,k)=>v===expected[(k+shift)%3])),'the unchanged original triangle keeps its original winding');
    ids.forEach((v,k)=>{
      used.add(v);const weights=display.sourceVertexWeights?.[v];
      if(weights)assert.deepEqual(weights,[[actual[k],1]],'no clipping intersection or barycentric paper vertex is introduced');
      const bank=`${find(original)}:${actual[k]}`,previous=vertexBanks.get(bank);
      if(previous!==undefined)assert.equal(v,previous,'triangles inside one original paper panel share their original vertices without cracks');
      vertexBanks.set(bank,v);
    });
  }
  assert.equal(used.size,display.sourceVertices.length,'no unused clipping vertices survive in the display mesh');
  const stamp=(a:number,b:number,assignment:string)=>`${Math.min(a,b)}:${Math.max(a,b)}:${assignment}`;
  const expectedEdges=new Map<string,number>(),actualEdges=new Map<string,number>();
  prepared.edgesVertices.forEach(([a,b],e)=>{const key=stamp(a,b,prepared.edgesAssignment[e]),banks=new Set(prepared.edgesFaces[e].map(find)).size;expectedEdges.set(key,(expectedEdges.get(key)??0)+banks);});
  display.edgesVertices.forEach(([a,b],e)=>{const key=stamp(display.sourceVertices[a],display.sourceVertices[b],display.edgesAssignment[e]);actualEdges.set(key,(actualEdges.get(key)??0)+1);});
  assert.deepEqual(actualEdges,expectedEdges,'every original material edge and panel hinge bank is retained, without clipping edge fragments');
  const shownPanelVertices=new Map<number,Set<number>>();
  for(let f=0;f<sourceTriangles.length;f++){
    const panel=find(sourceTriangles[f]),vertices=shownPanelVertices.get(panel)??new Set();
    Array.from(display.indices.slice(f*3,f*3+3)).forEach(v=>vertices.add(v));shownPanelVertices.set(panel,vertices);
  }
  for(const vertices of requirePlanar?shownPanelVertices.values():[]){
    const ids=[...vertices],a=point(display.positions,ids[0]);let normal:Vector|undefined;
    for(let i=1;i+1<ids.length;i++){
      const candidate=cross(sub(point(display.positions,ids[i]),a),sub(point(display.positions,ids[i+1]),a)),length=Math.hypot(...candidate);
      if(length>1e-10){normal=candidate.map(n=>n/length) as Vector;break;}
    }
    assert.ok(normal,'each complete panel retains nonzero area');
    for(const v of ids)assert.ok(Math.abs(dot(sub(point(display.positions,v),a),normal))<2e-6,'all original vertices of one paper panel stay in one plane');
  }
}

function assertProjectionAndGaps(prepared:PreparedOrigamiModel,solverPose:Float32Array,display:SimulationSurfaceMesh,orders:readonly (readonly [number,number,number])[]){
  assert.ok(display.layerNormals.length>0);
  display.sourceVertices.forEach((source,v)=>{
    const delta=sub(point(display.positions,v),point(solverPose,source));
    const projectedErrors=display.layerNormals.map(raw=>{
      const length=Math.hypot(...raw),normal=raw.map(n=>n/length) as Vector,distance=dot(delta,normal);
      return Math.hypot(...delta.map((n,k)=>n-distance*normal[k]));
    });
    assert.ok(Math.min(...projectedErrors)<2e-6,'every material vertex retains its original in-plane projected location');
  });
  const tolerance=Math.max(2e-7,display.layerGap*2e-4),audit=auditTrustedSurfaceSeparation(prepared,solverPose,display,orders,display.layerGap-tolerance);
  assert.ok(audit.pairs.length>100&&audit.checkedRegions>100,'real positive-area material overlaps are checked');
  for(const pair of audit.pairs)assert.ok(pair.minSignedGap>=display.layerGap-tolerance,`faces ${pair.faces.join('/')}: minimum signed corner gap ${pair.minSignedGap} vs required ${display.layerGap}`);
  return audit;
}

test('actual GPU ring preserves complete material panels and triangle topology at normal and 1000x spacing',()=>{
  const {prepared}=prepareSimulationDocument(source),saved=structuredClone(prepared),solverPose=Float32Array.from(captured.vertices_coords.flatMap(([x,y,z])=>[x,z,-y])),before=solverPose.slice();
  assert.deepEqual(captured.faces_vertices,prepared.facesVertices,'GPU snapshot triangle IDs match the unchanged source preparation');
  const solved=recomputeFlatLayers(computeFlatGeometry(source,2e-6)),order=simulationLayerOrder(source,solved);assert.ok(order);
  const layers=new SimulationSurfaceLayers(prepared,1);layers.setLayerOrder(order);
  const layout=layers.build(solverPose,4e-5,{maxGap:.04});assert.ok(layout,'real GPU endpoint is eligible for its solved flat-layer display');
  assertWholeMaterialPanels(prepared,layout);
  const display=resizeSimulationSurfaceGap(layout,.04);assert.ok(display,'1000x spacing is genuinely applied');
  assertWholeMaterialPanels(prepared,display);
  assertProjectionAndGaps(prepared,solverPose,display,order.faceOrders);
  assert.equal(display.indices,layout.indices);assert.equal(display.sourceVertices,layout.sourceVertices);
  for(const amount of [0,.5,1]){
    const blend=blendSimulationSurface(display,solverPose,amount);assert.equal(blend.indices,display.indices);assertWholeMaterialPanels(prepared,blend,amount===1);
    if(amount===0)blend.sourceVertices.forEach((source,v)=>assert.deepEqual(point(blend.positions,v),point(solverPose,source),'zero blend restores actual GPU solver error, without forcing the original paper perfectly planar'));
  }
  assert.deepEqual(solverPose,before);assert.deepEqual(prepared,saved,'display spacing leaves the actual solver material unchanged');
});

test('sixteen-sector three-ring stack keeps all complete panels beyond the former hundred-panel cutoff',()=>{
  const {prepared}=prepareSimulationDocument(largeSource),saved=structuredClone(prepared),solved=recomputeFlatLayers(computeFlatGeometry(largeSource,2e-6)),order=simulationLayerOrder(largeSource,solved);
  assert.ok(order);assert.ok(prepared.sourceFaceCount!>100,'this is a genuine large ring with more than one hundred physical panels');
  const original=new OrigamiModel(prepared).originalPositions;
  // Lift the trusted ideal endpoint using the same original material vertex
  // normalization, without normalizing an already folded bounding box again.
  const rest=prepared.originalPositions,scale=(()=>{
    for(let v=1;v<prepared.vertexCount;v++){const delta=rest[v*3]-rest[0];if(Math.abs(delta)>1e-6)return (original[v*3]-original[0])/delta;}throw Error('nondegenerate rest coordinates required');
  })();
  const offsetX=original[0]-rest[0]*scale,offsetZ=original[2]-rest[2]*scale;
  const solverPose=Float32Array.from(solved.geometry.vertices.flatMap(([x,y])=>[x*scale+offsetX,0,-y*scale+offsetZ])),before=solverPose.slice();
  const layers=new SimulationSurfaceLayers(prepared,1);layers.setLayerOrder(order);
  const layout=layers.build(solverPose,4e-5,{maxGap:.04});assert.ok(layout,'large solved stack must not be skipped merely for exceeding one hundred panels');
  assertWholeMaterialPanels(prepared,layout);
  const display=resizeSimulationSurfaceGap(layout,.04);assert.ok(display);
  assertWholeMaterialPanels(prepared,display);assertProjectionAndGaps(prepared,solverPose,display,order.faceOrders);
  assert.deepEqual(solverPose,before);assert.deepEqual(prepared,saved);
});
