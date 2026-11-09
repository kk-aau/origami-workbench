import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {hasNonFlatFoldAngles,hasSpatialFoldAngles,createDiagramSpatialPose,projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {createDiagramProject,adoptDiagramPose,updateDiagramPaperPose,updateDiagramFoldLink,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {retainDiagramPaperStates,switchDiagramPaperState,recordDiagramPaperPull} from '../../src/app/diagramPaperState';
import {moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {validDiagramLayerCertificate} from '../../src/app/diagramLayerAnalysis';

test('flat, spatial and pulled snapshots remain distinct through switching and reopening',()=>{
 const doc=blankDoc('三态',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:60});
 let p=createDiagramProject(doc),id=p.activeStepId;p=adoptDiagramPose(p,id,p.states[0].id,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
 const flat=p.steps[0],answer=createDiagramSpatialPose(doc);
 p=retainDiagramPaperStates(adoptDiagramPose(p,id,p.states[0].id,answer.result,undefined,answer.spatial),id,flat);
 assert.equal(p.steps[0].paperStates?.active,'spatial');assert(p.steps[0].paperStates?.flat);assert(p.steps[0].paperStates?.spatial);
 const spatial=p.steps[0].pose!;p=switchDiagramPaperState(p,id,'flat');assert.equal(p.steps[0].pose!.spatial,undefined);
 const flatPose=p.steps[0].pose!,q=flatPose.result.geometry.vertices[0];
 assert.throws(()=>recordDiagramPaperPull(updateDiagramPaperPose(p,id,moveDiagramPaperVertices(flatPose,{group:[0],selected:[0]},[q[0]+3,q[1]+3])),id,flatPose),/立体/);
 p=switchDiagramPaperState(p,id,'spatial');const a=p.steps[0].pose!,point=a.result.geometry.vertices[0];
 p=recordDiagramPaperPull(updateDiagramPaperPose(p,id,moveDiagramPaperVertices(a,{group:[0],selected:[0]},[point[0]+4,point[1]+3])),id,a);
 const pulled=structuredClone(p.steps[0].pose!.result.geometry.vertices);
 p=importDiagramProject(exportDiagramProject(p));
 for(const mode of ['flat','spatial','pulled','spatial'] as const)p=switchDiagramPaperState(p,id,mode);
 assert.deepEqual(p.steps[0].pose!.spatial,spatial.spatial);
 p=switchDiagramPaperState(p,id,'pulled');assert.deepEqual(p.steps[0].pose!.result.geometry.vertices,pulled);
});

test('default top view is normal to a tilted fixed face, not the global XY plane',()=>{
 const doc=blankDoc('固定面俯视',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:45});
 const t={rotation:[1,0,0,0,0,-1,0,1,0],translation:[3,4,5] as [number,number,number]};
 const a=createDiagramSpatialPose(doc,0,{point:[10,10],matrix:[1,0,0,1,0,0],spatialTransform:t});
 assert.equal(a.spatial.camera.yaw,0);assert.equal(a.spatial.camera.elevation,0);
 const projected=projectDiagramSpatialPoint([13,4,25],a.spatial.camera);assert.deepEqual(projected,[10,20,0]);
});

test('90-degree edge-on projection stays drawable after dragging and reopening',()=>{
 const doc=blankDoc('侧立拖角',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:90});
 let p=createDiagramProject(doc),id=p.activeStepId;const answer=createDiagramSpatialPose(doc);
 p=adoptDiagramPose(p,id,p.states[0].id,answer.result,undefined,answer.spatial);
 p=updateDiagramFoldLink(p,id,{enabled:true,layers:'all',selectedFaces:[]});const before=p.steps[0].pose!;
 assert(validDiagramLayerCertificate(before.result,before));
 const index=(before.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[])[0],vertex=before.result.geometry.faces.flat().find(v=>!before.result.geometry.faces[index].includes(v))!;
 const a=before.result.geometry.vertices[vertex],moved=moveDiagramPaperVertices(before,{group:[vertex],selected:[vertex]},[a[0]+5,a[1]+4]);
 p=recordDiagramPaperPull(refreshDiagramFoldDrawing(updateDiagramPaperPose(p,id,moved),id),id,before);
 p=importDiagramProject(exportDiagramProject(p));assert.doesNotThrow(()=>modelOverlapRegions(p.steps[0].pose!.result));
 p=switchDiagramPaperState(p,id,'spatial');assert(validDiagramLayerCertificate(p.steps[0].pose!.result,p.steps[0].pose!));
});

test('old spatial-in-flat archives migrate without losing the pulled illustration',()=>{
 const doc=blankDoc('旧立体状态',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:60});
 let p=createDiagramProject(doc);const answer=createDiagramSpatialPose(doc);p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,answer.result,undefined,answer.spatial);
 const pose=p.steps[0].pose!;p.steps[0].paperStates={active:'flat',flat:structuredClone(pose),pulled:structuredClone(pose)};
 const loaded=importDiagramProject(JSON.stringify(p));assert.equal(loaded.steps[0].paperStates?.active,'spatial');assert(loaded.steps[0].paperStates?.spatial);assert(!loaded.steps[0].paperStates?.flat);assert(loaded.steps[0].paperStates?.pulled);
});



test('0 and 180 degree creases disable spatial selection without losing the zero-angle solver',()=>{
 const doc=blankDoc('平面角度',100,100);assert.equal(hasNonFlatFoldAngles(doc),false);
 for(const angle of [0,180,-180]){
  doc.segments=doc.segments.filter(s=>s.id!=='hinge');doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:angle<0?'M':'V',angle});
  assert.equal(hasNonFlatFoldAngles(doc),false);
  if(angle===0)assert.equal(hasSpatialFoldAngles(doc),true);
  let p=createDiagramProject(doc),id=p.activeStepId;p=adoptDiagramPose(p,id,p.states[0].id,computeFlatFold(doc,undefined,{flatCreases:'marks'}));const answer=createDiagramSpatialPose(doc,0,undefined,p.steps[0].pose!);p=adoptDiagramPose(p,id,p.states[0].id,answer.result);const flat=p.steps[0];
  p=retainDiagramPaperStates(adoptDiagramPose(p,id,p.states[0].id,answer.result,undefined,answer.spatial),id,flat);p=switchDiagramPaperState(p,id,'flat');
  assert.equal(p.steps[0].paperStates?.active,'flat');assert.equal(p.steps[0].paperStates?.spatial,undefined);
  assert.throws(()=>switchDiagramPaperState(p,id,'spatial'),/0°.*180°/);
 }
 for(const angle of [45,90,-90,null]){doc.segments.at(-1)!.angle=angle;assert.equal(hasNonFlatFoldAngles(doc),true);}
});
