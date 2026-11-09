import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {SimulationPose} from '../../src/engine/simPose';
import {computeSimulationEndpointLayers} from '../../src/engine/simEndpointLayers';
import {startSimulationEndpointLayers} from '../../src/engine/simEndpointLayersClient';
import {simulationLayerOrderSupported,validateSimulationLayerOrder,simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {SimulationSurfaceLayers} from '../../src/engine/simSurfaceLayers';

const fixture=()=>JSON.parse(readFileSync(new URL('../fixtures/craneGpuFlatPose.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')) as SimulationPose;

test('GPU crane endpoint receives complete original-face contact layers without changing physical data',()=>{
  const pose=fixture(),before=JSON.stringify(pose),source=pose.source;
  assert.equal(simulationLayerOrderSupported(source),false,'exercise stored measured half-turn roundoff');
  const order=computeSimulationEndpointLayers(source);assert.ok(order);assert.equal(order.faceOrders.length,11);
  const {prepared}=prepareSimulationDocument(source),positions=Float32Array.from(pose.solver.positions),saved=positions.slice();
  assert.ok(validateSimulationLayerOrder(order,simulationSourceSignature(source),prepared.sourceFaceCount!));
  const layers=new SimulationSurfaceLayers(prepared,1);layers.setLayerOrder(order);
  const display=layers.build(positions);assert.ok(display);assert.equal(display.layerCount,3);
  assert.equal(display.indices.length,prepared.indices.length,'no triangle refinement');
  assert.equal(display.sourceVertexWeights,undefined,'no inserted material vertices');
  for(let i=0;i<display.indices.length;i++)assert.equal(display.sourceVertices[display.indices[i]],prepared.indices[i],'each displayed triangle has exactly the original material corners');
  assert.deepEqual(positions,saved);assert.equal(JSON.stringify(pose),before);
});

test('partial or different targets cannot inherit a flat contact certificate',()=>{
  const source=fixture().source,active=source.edges_assignment.findIndex(a=>a==='M');
  for(const angle of [-179.999999,-171,-90,0]){
    const partial={...source,edges_foldAngle:[...source.edges_foldAngle]};partial.edges_foldAngle[active]=angle;
    assert.equal(computeSimulationEndpointLayers(partial),null);
  }
  const order=computeSimulationEndpointLayers(source)!;
  const changed={...source,vertices_coords:source.vertices_coords.map(p=>[...p])};changed.vertices_coords[0][0]+=.1;
  assert.equal(validateSimulationLayerOrder(order,simulationSourceSignature(changed),source.faces_vertices!.length),null);
});

test('closing/reloading terminates layer work and rejects its late result',async()=>{
  const previous=globalThis.Worker;
  class FakeWorker{
    static last:FakeWorker;
    onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;onmessageerror:(()=>void)|null=null;
    stopped=false;constructor(){FakeWorker.last=this;}postMessage(){}terminate(){this.stopped=true;}
  }
  globalThis.Worker=FakeWorker as unknown as typeof Worker;
  try{
    const task=startSimulationEndpointLayers(fixture().source),worker=FakeWorker.last;
    task.cancel();worker.onmessage?.({data:{order:{faceOrders:[]}}});
    await assert.rejects(task.promise,{name:'AbortError'});assert.equal(worker.stopped,true);
    const next=startSimulationEndpointLayers(fixture().source),nextWorker=FakeWorker.last;
    nextWorker.onmessage?.({data:{order:null}});assert.equal(await next.promise,null);assert.equal(nextWorker.stopped,true);
  }finally{globalThis.Worker=previous;}
});
