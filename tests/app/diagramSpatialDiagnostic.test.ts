import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {applyRigidFoldTransform,solveRigidFoldGeometry} from '../../src/core/rigidFoldGeometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {adjustDiagramSpatialLayers,createDiagramSpatialPose,projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {findDiagramSpatialCycle,getDiagramSpatialDiagnostic,serializeDiagramSpatialError,restoreDiagramSpatialError} from '../../src/app/diagramSpatialDiagnostic';
import {startDiagramSpatialPose,startDiagramSpatialReprojection,startDiagramSpatialLayerAdjustment,startDiagramSpatialPreview,createDiagramSpatialPreviewSession} from '../../src/app/diagramSpatialTask';
import type {DiagramPose} from '../../src/app/diagramProject';

function strip(angles=[150,150]){
  const doc=blankDoc('诊断测试',(angles.length+1)*30,90);
  angles.forEach((angle,i)=>doc.segments.push({id:'fold-'+i,a:[30*(i+1),0],b:[30*(i+1),90],assignment:angle<0?'M':'V',angle}));
  return doc;
}
function intersection(){
  const doc=strip(),before=structuredClone(doc);
  try{createDiagramSpatialPose(doc);assert.fail('intersecting paper must not be published');}
  catch(error){const diagnostic=getDiagramSpatialDiagnostic(error);assert.ok(diagnostic);assert.equal(diagnostic.kind,'intersection');assert.deepEqual(doc,before);return {doc,error,diagnostic};}
}

test('intersection retains source CP topology and material footprints on both 3D faces',()=>{
  const {doc,diagnostic}=intersection(),graph=buildDiagramFold(doc).graph,rigid=solveRigidFoldGeometry(graph);
  assert.equal(rigid.status,'ready');assert.deepEqual(diagnostic.verticesCP,graph.vertices_coords);assert.deepEqual(diagnostic.faces,graph.faces_vertices);assert.deepEqual(diagnostic.vertices3D,rigid.vertices);
  assert.equal(diagnostic.faceIds.length,2);assert.equal(diagnostic.region!.length,2);
  for(const region of diagnostic.region!){
    assert.ok(diagnostic.faceIds.includes(region.faceId));
    region.verticesCP.forEach((p,i)=>assert.deepEqual(applyRigidFoldTransform(rigid.faceTransforms[region.faceId],p),region.vertices3D[i]));
  }
  const [a,b]=diagnostic.region!;
  a.vertices3D.forEach((p,i)=>{const first=projectDiagramSpatialPoint(p),second=projectDiagramSpatialPoint(b.vertices3D[i]);assert.ok(Math.hypot(first[0]-second[0],first[1]-second[1])<1e-8);});
  assert.equal('result' in diagnostic,false,'diagnostic cannot masquerade as a solved pose');
});

test('coplanar ambiguity is localized without asserting physical intersection or inventing an order',()=>{
  const doc=strip([90,90,90,90]);
  assert.throws(()=>createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:23,elevation:35}),error=>{
    const d=getDiagramSpatialDiagnostic(error);assert.ok(d);assert.equal(d.kind,'missing-layer-order');assert.equal(d.faceIds.length,2);assert.equal(d.cycle,undefined);assert.equal(d.region!.length,2);return true;
  });
});

test('a proved local relation cycle maps coplanar subgraph indices back to original material faces',()=>{
  const doc=strip([180,180,180,180,180]),result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.layers.status,'solved',result.layers.message);
  const previous:DiagramPose={sourceStateId:'previous',sourceRevision:0,sourceDoc:structuredClone(doc),result};
  doc.segments.at(-1)!.angle=90;
  const pose:DiagramPose={sourceStateId:'current',sourceRevision:1,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,previous,{yaw:20,elevation:35})},before=structuredClone(pose);
  assert.throws(()=>adjustDiagramSpatialLayers(pose,{relativeConstraints:[{above:0,below:2},{above:2,below:4},{above:4,below:0}]},[previous]),error=>{
    const d=getDiagramSpatialDiagnostic(error);assert.ok(d);assert.equal(d.kind,'layer-cycle');assert.deepEqual([...d.faceIds].sort(),[0,2,4]);assert.equal(d.cycle![0],d.cycle!.at(-1));assert.deepEqual(d.faces,buildDiagramFold(doc).graph.faces_vertices);return true;
  });
  assert.deepEqual(pose,before);
});

test('cycle discovery uses only faces in the same overlap cell, not a valid global cyclic stack',()=>{
  const edges=new Map([[0,[1]],[1,[2]],[2,[0]]]);
  assert.deepEqual(findDiagramSpatialCycle([0,1,2],edges),[0,1,2,0]);
  for(const faces of [[0,1],[1,2],[0,2]])assert.equal(findDiagramSpatialCycle(faces,edges),undefined);
});

test('structured errors survive worker serialization while malformed data and ordinary errors remain ordinary',()=>{
  const {error,diagnostic}=intersection(),payload=structuredClone(serializeDiagramSpatialError(error));
  const restored=restoreDiagramSpatialError(payload.message,payload.diagnostic);assert.ok(restored instanceof Error);assert.deepEqual(getDiagramSpatialDiagnostic(restored),diagnostic);
  assert.equal(getDiagramSpatialDiagnostic(restoreDiagramSpatialError('cancelled',payload.diagnostic)),undefined);
  assert.equal(getDiagramSpatialDiagnostic(restoreDiagramSpatialError(payload.message,{...diagnostic,faceIds:[-1]})),undefined);
  assert.deepEqual(serializeDiagramSpatialError(Error('ordinary')),{ok:false,message:'ordinary'});
});

test('every spatial task preserves current diagnostics and cancelled tasks ignore late failure payloads',async()=>{
  const {error,diagnostic}=intersection(),payload=structuredClone(serializeDiagramSpatialError(error));
  class MockWorker{
    static latest:MockWorker;onmessage?:(event:any)=>void;onerror?:(event:any)=>void;terminated=false;
    constructor(){MockWorker.latest=this;}postMessage(){}terminate(){this.terminated=true;}
    fail(){this.onmessage?.({data:structuredClone(payload)});}
    ready(){this.onmessage?.({data:{ok:true,value:null}});}
  }
  const prior=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  const pose={} as DiagramPose,camera={yaw:0,elevation:0};
  try{
    const starts=[()=>startDiagramSpatialPose([strip()]),()=>startDiagramSpatialReprojection(pose,camera),()=>startDiagramSpatialLayerAdjustment(pose,{}),()=>startDiagramSpatialPreview(pose,camera)];
    for(const start of starts){
      const task=start();MockWorker.latest.fail();await assert.rejects(task.promise,e=>{assert.deepEqual(getDiagramSpatialDiagnostic(e),diagnostic);return true;});assert.ok(MockWorker.latest.terminated);
      const cancelled=start();cancelled.cancel();MockWorker.latest.fail();await assert.rejects(cancelled.promise,e=>{assert.equal(getDiagramSpatialDiagnostic(e),undefined);assert.match(String(e),/取消/);return true;});
    }
    const session=createDiagramSpatialPreviewSession(pose);MockWorker.latest.ready();const frame=session.frame(camera);await Promise.resolve();MockWorker.latest.fail();await assert.rejects(frame,e=>{assert.deepEqual(getDiagramSpatialDiagnostic(e),diagnostic);return true;});
    const next=session.frame(camera);await Promise.resolve();session.close();MockWorker.latest.fail();await assert.rejects(next,e=>{assert.equal(getDiagramSpatialDiagnostic(e),undefined);assert.match(String(e),/取消/);return true;});
  }finally{globalThis.Worker=prior;}
});
