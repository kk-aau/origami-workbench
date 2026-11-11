import test from 'node:test';
import assert from 'node:assert/strict';
import {depthCameraScreenDirection,depthCameraDirectionFromScreen} from '../../src/app/diagramDepthCamera';
import {modelProjection} from '../../src/app/modelProjection';
import {rotateDiagramViewportPoint} from '../../src/app/diagramViewport';
import type {Point} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose} from '../../src/app/diagramProject';
import {updateDiagramDepth} from '../../src/app/diagramDepthTransaction';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const closePoint=(a:Point,b:Point)=>{close(a[0],b[0]);close(a[1],b[1]);};
const closeAngle=(actual:number,expected:number)=>assert.ok(Math.abs((((actual-expected+180)%360)+360)%360-180)<1e-9,`${actual}° != ${expected}°`);

test('committing a preview retains its explicit viewport while leaving CP and physical vertices intact',()=>{
 const doc=blankDoc('相机预览',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const p=createDiagramProject(doc),source=adoptDiagramPose(p,p.activeStepId,p.states[0].id,computeFlatFold(doc));
 const cameras={'front-solid':{x:-24,y:-24,width:148,height:148,rotation:0}},next=updateDiagramDepth(source,source.activeStepId,{amount:.08,direction:290},cameras);
 assert.deepEqual(next.steps[0].pose!.view!.cameras,cameras);assert.equal(next.states,source.states);assert.deepEqual(next.steps[0].pose!.result.geometry.vertices,source.steps[0].pose!.result.geometry.vertices);assert.equal(source.steps[0].pose!.view?.depth,undefined);
});

test('camera vectors follow SVG axes, back mirroring and both ordered rotations',()=>{
 closePoint(depthCameraScreenDirection(0,'front',0,0),[1,0]);
 closePoint(depthCameraScreenDirection(90,'front',0,0),[0,1]);
 closePoint(depthCameraScreenDirection(180,'front',0,0),[-1,0]);
 closePoint(depthCameraScreenDirection(270,'front',0,0),[0,-1]);
 closePoint(depthCameraScreenDirection(0,'back',0,0),[-1,0]);
 closePoint(depthCameraScreenDirection(90,'back',0,0),[0,1]);
 closePoint(depthCameraScreenDirection(0,'back',90,0),[0,-1]);
 closePoint(depthCameraScreenDirection(0,'front',90,90),[-1,0]);
});

test('front/back and observation/drawing rotations roundtrip across 0° at any ring radius',()=>{
 for(const side of ['front','back'] as const)for(const observation of [0,24.1,47,90,183.2,359.9,-375])for(const drawing of [0,17,90,180,-90,721])for(const direction of [0,.001,45,90,149,180,270,359.999,360,-135,735]){
  const vector=depthCameraScreenDirection(direction,side,observation,drawing);close(Math.hypot(...vector),1);
  for(const radius of [.2,1,37,400])closeAngle(depthCameraDirectionFromScreen([vector[0]*radius,vector[1]*radius],side,observation,drawing),direction);
 }
});

test('direction matches the existing material-point projection around translated model and drawing centers',()=>{
 const modelCenter:Point=[130,-47],drawingCenter:Point=[-15,80],vertices:Point[]=[[30,-80],[230,-14]],direction=149,delta:Point=[Math.cos(direction*Math.PI/180)*30,Math.sin(direction*Math.PI/180)*30];
 for(const side of ['front','back'] as const){
  const projection=modelProjection(vertices,side==='back',24.1,modelCenter),a=rotateDiagramViewportPoint(projection.project(modelCenter),drawingCenter,-63),b=rotateDiagramViewportPoint(projection.project([modelCenter[0]+delta[0],modelCenter[1]+delta[1]]),drawingCenter,-63),screenDelta:Point=[b[0]-a[0],b[1]-a[1]],unit=depthCameraScreenDirection(direction,side,24.1,-63);
  closePoint(screenDelta,[unit[0]*30,unit[1]*30]);closeAngle(depthCameraDirectionFromScreen(screenDelta,side,24.1,-63),direction);
 }
});

test('the ring center retains a normalized fallback and invalid input is rejected before rendering',()=>{
 assert.equal(depthCameraDirectionFromScreen([0,0],'front',0,0),0);
 assert.equal(depthCameraDirectionFromScreen([0,-0],'back',47,90,-135),225);
 assert.equal(depthCameraDirectionFromScreen([0,0],'front',0,0,720),0);
 assert.throws(()=>depthCameraScreenDirection(NaN,'front',0,0),/有效角度/);
 assert.throws(()=>depthCameraDirectionFromScreen([Infinity,1],'front',0,0),/有效坐标/);
 assert.throws(()=>depthCameraDirectionFromScreen([0,0],'front',0,0,NaN),/有效角度/);
});
