import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramSpatialPose,reprojectDiagramSpatialPose,restoreDiagramSpatialLayers} from '../../src/app/diagramSpatialPose';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {DiagramPose} from '../../src/app/diagramProject';

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
