import test from 'node:test';
import assert from 'node:assert/strict';
import type {DiagramPose} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {createDiagramSpatialPose,projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {diagramOrbitMatrix,diagramOrbitMesh,orbitCameraFromDrag} from '../../src/app/diagramOrbitMesh';

function foldedPose():DiagramPose {
  const doc=blankDoc('旋转预览',90,90);
  doc.segments.push({id:'a',a:[30,0],b:[30,90],assignment:'V',angle:90},{id:'b',a:[60,0],b:[60,90],assignment:'M',angle:-45});
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc)};
}
function triangleArea(data:Float32Array){
  let area=0;
  for(let i=0;i<data.length;i+=18){
    const a=data.slice(i,i+3),b=data.slice(i+6,i+9),c=data.slice(i+12,i+15),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert(cross.reduce((sum,n,k)=>sum+n*data[i+3+k],0)>0,'triangles preserve material orientation');area+=Math.hypot(...cross)/2;
  }
  return area;
}
test('orbit triangulates physical faces even when ninety-degree projection is a line',()=>{
  const pose=foldedPose(),before=structuredClone(pose),mesh=diagramOrbitMesh(pose);
  assert(mesh.triangles.length>0&&mesh.lines.length>0);assert(Math.abs(triangleArea(mesh.triangles)*mesh.radius**2-90*90)<.002);
  assert.deepEqual(pose,before);
});
test('hidden paper is removed from preview faces and boundary lines',()=>{
  const pose=foldedPose(),full=diagramOrbitMesh(pose),partial=diagramOrbitMesh({...pose,hiddenFaces:[0]}),empty=diagramOrbitMesh({...pose,hiddenFaces:pose.result.geometry.faces.map((_,i)=>i)});
  assert(partial.triangles.length<full.triangles.length);assert.equal(empty.triangles.length,0);assert.equal(empty.lines.length,0);
});
test('a material hole remains empty instead of receiving a triangle fan',()=>{
  const points:[number,number][]=[[0,0],[10,0],[10,10],[0,10],[3,3],[7,3],[7,7],[3,7]];
  const pose:DiagramPose={sourceStateId:'cp',sourceRevision:0,sourceDoc:blankDoc('带孔预览',10,10),
    result:{geometry:{status:'ready',message:'',vertices:points,faces:[[0,1,2,3]],graph:{vertices_coords:points,faces_vertices:[[0,1,2,3]],faces_holes:[[[4,5,6,7]]],edges_vertices:[],edges_assignment:[],edges_foldAngle:[]}},layers:{status:'solved',message:''},warnings:[]},
    spatial:{version:1,vertices:points.map(([x,y])=>[x,y,0]),faceTransforms:[{rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]}],measuredAngles:[],camera:{yaw:0,elevation:0}}};
  const mesh=diagramOrbitMesh(pose);assert(Math.abs(triangleArea(mesh.triangles)*mesh.radius**2-84)<.0001);
});
test('GPU camera matches fixed-frame projection, side reversal and drawing rotation',()=>{
  const camera={yaw:32,elevation:-27,frame:{rotation:[0,-1,0,1,0,0,0,0,1],translation:[17,-23,11] as [number,number,number]}},v=[2,3,5],o=projectDiagramSpatialPoint([0,0,0],camera),p=projectDiagramSpatialPoint(v,camera),rotation=19*Math.PI/180;
  for(const back of [false,true]){
    const m=diagramOrbitMatrix(camera,back,19),actual=[0,1,2].map(k=>m[k]*v[0]+m[k+3]*v[1]+m[k+6]*v[2]),sign=back?-1:1,x=(p[0]-o[0])*sign,y=p[1]-o[1];
    const expected=[Math.cos(rotation)*x-Math.sin(rotation)*y,Math.sin(rotation)*x+Math.cos(rotation)*y,(p[2]-o[2])*sign];
    actual.forEach((value,k)=>assert(Math.abs(value-expected[k])<1e-6));
  }
});
test('dragged camera turns through both poles and complete revolutions without changing fixed material',()=>{
  const camera=foldedPose().spatial!.camera,next=orbitCameraFromDrag(camera,1900,10000);
  assert.equal(next.yaw,40);assert.equal(next.elevation,100);assert.equal(next.frame,camera.frame);
  for(const elevation of [90,180,270,360,-90,-180,-270,-360,720]){
    const turned=orbitCameraFromDrag(camera,0,-elevation/.35),actual=diagramOrbitMatrix(turned),expected=diagramOrbitMatrix({...camera,elevation:elevation%360});
    actual.forEach((value,k)=>assert(Math.abs(value-expected[k])<1e-6));
  }
  const before=diagramOrbitMatrix(orbitCameraFromDrag(camera,0,-179.9/.35)),after=diagramOrbitMatrix(orbitCameraFromDrag(camera,0,-180.1/.35));
  before.forEach((value,k)=>assert(Math.abs(value-after[k])<.004,'wrapping the angle cannot jump the preview'));
});
