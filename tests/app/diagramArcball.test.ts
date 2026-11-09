import test from 'node:test';
import assert from 'node:assert/strict';
import {arcballCamera,centeredOrbitCamera} from '../../src/app/diagramArcball';
import {projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';

test('trackball has a stable pivot, returns to start and stays orthonormal across poles',()=>{
 const original={yaw:32,elevation:89},vertices:[number,number,number][]=[[100,200,-30],[300,400,70]],camera=centeredOrbitCamera(original,vertices),center=[200,300,20];
 const before=projectDiagramSpatialPoint(center,original);
 for(const end of [[400,220],[0,0],[800,600],[300,250]] as [number,number][]){const turned=arcballCamera(camera,[300,250],end,{width:600,height:500});const point=projectDiagramSpatialPoint(center,turned);point.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-9));}
 assert.deepEqual(arcballCamera(camera,[300,250],[300,250],{width:600,height:500}),camera);
 let current=camera;for(let i=0;i<2000;i++)current=arcballCamera(current,[300,250],[305,252],{width:600,height:500});assert.doesNotThrow(()=>projectDiagramSpatialPoint([1,2,3],current));
});
test('drag direction is screen-relative after flipping and drawing rotation',()=>{
 const camera=centeredOrbitCamera({yaw:0,elevation:0},[[-1,-1,-1],[1,1,1]]),box={width:600,height:500};
 for(const back of [false,true])for(const rotation of [0,90,180,-35]){
  const turned=arcballCamera(camera,[300,250],[350,250],box,back,rotation),p=projectDiagramSpatialPoint([0,0,back?-1:1],turned),a=rotation*Math.PI/180,flip=back?-1:1;
  const screen=[Math.cos(a)*p[0]*flip-Math.sin(a)*p[1],Math.sin(a)*p[0]*flip+Math.cos(a)*p[1]];
  assert.ok(screen[0]>0);assert.ok(Math.abs(screen[1])<1e-10);
 }
});
