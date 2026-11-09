import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramSpatialPose,adjustDiagramSpatialLayers,createDiagramSpatialProjector,restoreDiagramSpatialLayers} from '../../src/app/diagramSpatialPose';
import {arcballCamera,centeredOrbitCamera} from '../../src/app/diagramArcball';
import {createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {diagramLayerAnalysisKey,validDiagramLayerCertificate} from '../../src/app/diagramLayerAnalysis';
import {relativeLayerConstraintsMatch} from '../../src/core/relativeLayerConstraints';

function fixture(){
 const doc=blankDoc('共面叠层与立体纸瓣',120,100);
 for(let x=20;x<120;x+=20)doc.segments.push({id:'fold-'+x,a:[x,0],b:[x,100],assignment:'V',angle:180});
 const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved',result.layers.message);
 const previous:DiagramPose={sourceStateId:'old',sourceRevision:0,sourceDoc:structuredClone(doc),result};doc.segments.at(-1)!.angle=90;
 const created=createDiagramSpatialPose(doc,0,undefined,previous,{yaw:20,elevation:35});
 let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,created.result,undefined,created.spatial);
 return {project,pose:project.steps[0].pose!,previous};
}
test('spatial adjustments solve another real candidate and preserve geometry, CP and saved relations',()=>{
 const {project,pose,previous}=fixture(),before=JSON.stringify(pose);
 assert.ok(diagramLayerAnalysisKey(project,project.activeStepId));
 let changed:ReturnType<typeof adjustDiagramSpatialLayers>|undefined;
 for(let face=0;face<5;face++){const result=adjustDiagramSpatialLayers(pose,{layerAdjustment:{face,direction:'top',side:'front'}},[previous]);if(JSON.stringify(result.result.layers.faceOrders)!==JSON.stringify(pose.result.layers.faceOrders)){changed=result;break;}}
 assert.ok(changed,'there must be a genuinely different valid stack');
 assert.deepEqual(changed.spatial.vertices,pose.spatial!.vertices);assert.deepEqual(changed.spatial.measuredAngles,pose.spatial!.measuredAngles);assert.equal(JSON.stringify(pose),before);
 const next=updateDiagramPoseResult(project,project.activeStepId,changed.result,changed.spatial),saved=importDiagramProject(exportDiagramProject(next)).steps[0].pose!;
 assert.deepEqual(next.states,project.states);assert.ok(saved.spatial!.layerContacts?.length);assert.ok(validDiagramLayerCertificate(saved.result,saved));
 const projectView=createDiagramSpatialProjector(saved);
 for(const camera of [{yaw:0,elevation:0},{yaw:0,elevation:90},{yaw:0,elevation:180}])assert.equal(projectView(camera).result.layers.status,'solved');
});
test('explicit relations survive free rotation and JSON replay; impossible hinge reversal is rejected',()=>{
 const {pose,previous}=fixture(),orders=pose.result.layers.faceOrders!;
 let changed:ReturnType<typeof adjustDiagramSpatialLayers>|undefined;
 for(const [a,b] of orders){for(const relation of [{above:a,below:b},{above:b,below:a}])try{const value=adjustDiagramSpatialLayers(pose,{relativeConstraints:[relation]},[previous]);if(JSON.stringify(value.result.layers.faceOrders)!==JSON.stringify(orders)){changed=value;break;}}catch{}if(changed)break;}
 assert.ok(changed);assert.ok(relativeLayerConstraintsMatch(changed.result.geometry.vertices,changed.result.geometry.faces,changed.result.layers.faceOrders!,changed.result.layers.relativeConstraints!));
 const restored={...pose,...structuredClone(changed)};restoreDiagramSpatialLayers(restored,previous);
 const camera=arcballCamera(centeredOrbitCamera(restored.spatial!.camera,restored.spatial!.vertices),[300,250],[460,380],{width:600,height:500});
 const turned=createDiagramSpatialProjector(restored)(camera);assert.ok(validDiagramLayerCertificate(turned.result,{...restored,...turned}));
 const forged=structuredClone(restored);forged.spatial!.layerContacts=[[0,1,-1]];forged.spatial!.layerConstraints=[[0,1,-1]];
 assert.throws(()=>restoreDiagramSpatialLayers(forged,previous));
});
test('actual depth gaps and edge-on targets give actionable failures without changing the pose',()=>{
 const {pose,previous}=fixture(),before=JSON.stringify(pose);
 assert.throws(()=>adjustDiagramSpatialLayers(pose,{relativeConstraints:[{above:5,below:0}]},[previous]),/夹角或间距/);
 assert.equal(JSON.stringify(pose),before);
});
