import assert from 'node:assert/strict';
import test from 'node:test';
import {viewSphereGrid,viewSphereBasis,viewSphereBasisFromCamera,cameraFromViewSphere,fixedPaperSphereFrame,transposeBasis,turnBasis,inBasis,type Vector3} from '../../src/app/diagramViewSphere';
import {diagramOrbitMatrix} from '../../src/app/diagramOrbitMesh';

test('a standing fixed face retains head-above-feet orientation in the globe and the applied view',()=>{
  const face=[-1,0,0,0,-1,0,0,0,1],frame={rotation:face,translation:[50,250,0] as Vector3};
  const camera={yaw:0,elevation:30,frame},reference=fixedPaperSphereFrame(camera,face,[1,0,0,1,0,0],false,0);
  const head:Vector3=[0,1,0]; // world +Y is paper -Y, upward in the saved drawing.
  assert.deepEqual(inBasis(transposeBasis(reference),head),[0,0,1]);
  for(const dir of [[1,2,.65],[1,1,1],[-1,1,0]] as Vector3[]){
    const basis=viewSphereBasis(dir),preview=inBasis(basis,[0,0,1]);
    const applied=cameraFromViewSphere(camera,basis,reference,false,0);
    const shown=inBasis(transposeBasis(Array.from(diagramOrbitMatrix(applied))),head);
    assert.ok(Math.abs(preview[0])<1e-10&&preview[1]<-.8);
    assert.ok(Math.hypot(...shown.map((v,i)=>v-preview[i]))<1e-6);
  }
});

test('three perpendicular cuts share six vertices, twelve midpoints and eight centers',()=>{
  const grid=viewSphereGrid([2,2,2]);
  assert.equal(grid.circles.length,3);
  assert.deepEqual(['端点','边中点','面中心'].map(kind=>grid.points.filter(p=>p.kind===kind).length),[6,12,8]);
});
test('reopening a custom camera preserves the picked direction and roll on either paper side',()=>{
  const frame={rotation:[0,-1,0,1,0,0,0,0,1],translation:[7,3,-11] as Vector3};
  const reference=[1,0,0,0,0,-1,0,1,0];
  const basis=turnBasis([0,1,0,-1,0,0,0,0,1],viewSphereBasis([.2,-.8,.4]));
  for(const back of [true,false]){
    const camera=cameraFromViewSphere({yaw:0,elevation:0,frame},basis,reference,back,37);
    const reopened=viewSphereBasisFromCamera(camera,reference,back,37);
    assert.ok(reopened.every((v,i)=>Math.abs(v-basis[i])<1e-12));
  }
});
test('unequal angular cuts produce one center per spherical cell',()=>{
  for(const counts of [[4,2,2],[3,5,4],[1,1,1],[12,12,12]] as Vector3[]){
    const {points,circles}=viewSphereGrid(counts);
    const count=(kind:string)=>points.filter(p=>p.kind===kind).length;
    assert.equal(count('端点')-count('边中点')+count('面中心'),2);
    assert.ok(points.every(({direction})=>Math.abs(Math.hypot(...direction)-1)<1e-10));
    if(counts[0]===4){assert.equal(circles.length,5);assert.ok(count('面中心')>8);}
  }
});
test('the selected ray is face-relative and stays head-on after the canvas flip and drawing rotation',()=>{
  const frame={rotation:[0,-1,0,1,0,0,0,0,1],translation:[7,3,-11] as Vector3};
  const reference=[1,0,0,0,0,-1,0,1,0],pivot:Vector3=[4,8,2],offset:Vector3=[12,14,1];
  for(const {direction} of viewSphereGrid([2,2,2]).points)for(const back of [true,false]){
    const camera=cameraFromViewSphere({yaw:0,elevation:0,frame,pivot,offset},viewSphereBasis(direction),reference,back,29);
    const world=inBasis(reference,direction),matrix=diagramOrbitMatrix(camera,back,29);
    const projected=[0,1,2].map(i=>matrix[i]*world[0]+matrix[i+3]*world[1]+matrix[i+6]*world[2]);
    assert.ok(Math.hypot(projected[0],projected[1],projected[2]-1)<1e-6);
    assert.equal(camera.pivot,pivot);assert.equal(camera.offset,offset);
  }
});
