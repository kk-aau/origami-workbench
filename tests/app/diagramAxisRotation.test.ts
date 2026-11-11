import test from 'node:test';
import assert from 'node:assert/strict';
import {centeredOrbitCamera,arcballCamera} from '../../src/app/diagramArcball';
import {projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {rotateDiagramCameraAxis,diagramAxisProjection,diagramAxisRingPoint,diagramAxisDragStart,diagramAxisPointerAngle,diagramAxisAngleDelta,type DiagramRotationAxis} from '../../src/app/diagramAxisRotation';

const axes:DiagramRotationAxis[]=['x','y','z'];
const near=(a:readonly number[],b:readonly number[],eps=1e-9)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<eps,`${n} != ${b[i]}`));
test('three world-axis turns preserve the same screen pivot and are reversible',()=>{
  const camera=centeredOrbitCamera({yaw:37,elevation:19,frame:{rotation:[0,-1,0,1,0,0,0,0,1],translation:[3,7,11]}},[[2,6,10],[6,12,18]]);
  const center=[4,9,14],before=projectDiagramSpatialPoint(center,camera);
  for(const axis of axes){
    const next=rotateDiagramCameraAxis(camera,axis,.8),returned=rotateDiagramCameraAxis(next,axis,-.8);
    near(projectDiagramSpatialPoint(center,next),before);near(returned.rotation!,camera.rotation!);
    // A point lying on the chosen world axis must stay fixed, including when
    // the saved camera uses a rotated stationary-paper frame.
    const point=center.map((n,i)=>n+(axes[i]===axis?5:0));near(projectDiagramSpatialPoint(point,next),projectDiagramSpatialPoint(point,camera));
  }
});
test('Z turn adds genuine roll, and mixed axis/free drags stay orthonormal',()=>{
  let camera=centeredOrbitCamera({yaw:0,elevation:0},[[-1,-1,-1],[1,1,1]]);
  near(projectDiagramSpatialPoint([1,0,0],rotateDiagramCameraAxis(camera,'z',Math.PI/2)),[0,1,0]);
  for(let i=0;i<1000;i++){
    camera=rotateDiagramCameraAxis(camera,axes[i%3],.07);
    if(i%10===0)camera=arcballCamera(camera,[150,150],[165,142],{width:300,height:300});
  }
  assert.doesNotThrow(()=>projectDiagramSpatialPoint([1,2,3],camera));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){const r=camera.rotation!;assert.ok(Math.abs(r[i*3]*r[j*3]+r[i*3+1]*r[j*3+1]+r[i*3+2]*r[j*3+2]-(i===j?1:0))<1e-10);}
});
test('ring pointer follows world axis after flipping and rotating the drawing',()=>{
  const camera=centeredOrbitCamera({yaw:37,elevation:42},[[-1,-1,-1],[1,1,1]]);
  for(const axis of axes)for(const back of [false,true])for(const drawing of [0,90,147]){
    const projection=diagramAxisProjection(camera,axis,back,drawing),p=diagramAxisRingPoint(projection,.47),angle=diagramAxisPointerAngle(projection,[p[0],p[1]]);
    assert.ok(angle!==undefined);assert.ok(Math.abs(diagramAxisAngleDelta(.47,angle!))<1e-10);
    const theta=.36,turned=rotateDiagramCameraAxis(camera,axis,theta),moved=diagramAxisRingPoint(diagramAxisProjection(turned,axis,back,drawing),.47),expected=diagramAxisRingPoint(projection,.47+theta);near(moved,expected);
  }
});
test('edge-on ring uses a finite tangent and angle wrap never jumps a full revolution',()=>{
  for(const axis of ['x','y'] as const){const projection=diagramAxisProjection({yaw:0,elevation:0},axis);for(const point of [[0,0],[1,0],[0,1],[-1,0]] as [number,number][]){const start=diagramAxisDragStart(projection,point);assert.equal(start.elliptic,false);assert.ok(start.tangent.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...start.tangent)-1)<1e-10);}}
  assert.ok(Math.abs(diagramAxisAngleDelta(Math.PI-.01,-Math.PI+.01)-.02)<1e-10);
});
