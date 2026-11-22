import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramSpatialPose,createDiagramSpatialPoseAsync,diagramSpatialContactOrders,reprojectDiagramSpatialPose,restoreDiagramSpatialLayers} from '../../src/app/diagramSpatialPose';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {DiagramPose} from '../../src/app/diagramProject';

test('subdividing a folded stack edge-on inherits only the child faces with shared material area',async()=>{
 const doc=blankDoc('subdivided two-layer stack',100,100);
 doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const previous:DiagramPose={sourceStateId:'old',sourceRevision:0,sourceDoc:doc,result:computeFlatFold(doc,undefined,{flatCreases:'marks'})};
 assert.equal(previous.result.layers.status,'solved');
 const split=structuredClone(doc);
 split.segments.push({id:'division',a:[0,50],b:[100,50],assignment:'V',angle:0});
 const edgeOn={yaw:0,elevation:90};
 const pose:DiagramPose={sourceStateId:'split',sourceRevision:0,sourceDoc:split,...await createDiagramSpatialPoseAsync(split,0,undefined,previous,edgeOn)};
 assert.equal(pose.result.geometry.faces.length,4);
 assert.deepEqual(pose.result.layers.faceOrders,[]);
 const front=reprojectDiagramSpatialPose(pose,{yaw:0,elevation:0});
 const pairs=(ids:number[][])=>ids.map(row=>row.slice(0,2).sort((a,b)=>a-b).join(':')).sort();
 const covered=modelOverlapRegions(front.result).cells.map(c=>c.faces);
 assert.ok(covered.every(c=>c.length===2));
 const overlapping=[...new Set(pairs(covered))];
 assert.equal(overlapping.length,2);
 assert.deepEqual(pairs(diagramSpatialContactOrders(pose)),overlapping);
 const restored=structuredClone(pose);restoreDiagramSpatialLayers(restored,previous);
 assert.deepEqual(pairs(diagramSpatialContactOrders(restored)),overlapping);
});

test('translating a nearly closed hinge does not turn its visible overlap into physical contact',()=>{
 const doc=blankDoc('near-contact',100,100);
 doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:180-2e-8});
 const view={yaw:0,elevation:0};
 const original=createDiagramSpatialPose(doc,0,undefined,undefined,view,true);
 assert.equal(original.result.layers.faceOrders?.length,1);
 const shifted=createDiagramSpatialPose(doc,0,{point:[10,10],matrix:[1,0,0,1,400000,0]},undefined,view,true);
 assert.deepEqual(shifted.result.layers.faceOrders,original.result.layers.faceOrders);
 for(const state of [original,shifted]){
   const pose={sourceStateId:'nearly-closed',sourceRevision:0,sourceDoc:doc,...state};
   assert.deepEqual(diagramSpatialContactOrders(pose),[]);
 }
});

test('a changed middle hinge cannot publish a complete but cyclic set of old pair relations',()=>{
 const doc=blankDoc('five-panel stack',100,100);
 for(let i=1;i<5;i++)doc.segments.push({id:'fold-'+i,a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
 const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved');
 const previous:DiagramPose={sourceStateId:'old',sourceRevision:0,sourceDoc:structuredClone(doc),result};
 const changed=structuredClone(doc),hinge=changed.segments.find(s=>s.id==='fold-2')!;hinge.assignment='M';hinge.angle=-180;
 const next=createDiagramSpatialPose(changed,0,undefined,previous);
 const regions=modelOverlapRegions(next.result);
 assert.ok(regions.cells.some(c=>c.faces.length>=3));
 assert.ok(modelRegionLayers(next.result,regions,'front').every(c=>c.layers.status==='ordered'));
});

test('new hinges re-solve touching stacks instead of combining contradictory old contacts',()=>{
 const doc=blankDoc('synthetic contact transition',100,100);
 for(let i=1;i<5;i++)doc.segments.push({id:'fold-'+i,a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
 const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved');
 const previous:DiagramPose={sourceStateId:'old',sourceRevision:0,sourceDoc:structuredClone(doc),result};
 const changed=structuredClone(doc);changed.segments.slice(-4).forEach((s,i)=>{s.assignment=i===3?'V':'M';s.angle=i===3?90:-180;});
 const before=JSON.stringify([previous,changed]);
 const pose:DiagramPose={sourceStateId:'new',sourceRevision:0,sourceDoc:changed,...createDiagramSpatialPose(changed,0,undefined,previous,{yaw:20,elevation:35})};
 assert.equal(pose.result.layers.status,'solved');
 for(const camera of [{yaw:20,elevation:35},{yaw:0,elevation:180},{yaw:-35,elevation:55}]){
  const projected=reprojectDiagramSpatialPose(pose,camera);
  assert.ok(modelRegionLayers(projected.result,modelOverlapRegions(projected.result),'front').every(c=>c.layers.status==='ordered'));
  assert.deepEqual(projected.spatial.vertices,pose.spatial!.vertices);
 }
 const saved=JSON.parse(JSON.stringify(pose));restoreDiagramSpatialLayers(saved,previous);
 assert.deepEqual(saved.result.layers.faceOrders,pose.result.layers.faceOrders);
 assert.equal(JSON.stringify([previous,changed]),before);
});
