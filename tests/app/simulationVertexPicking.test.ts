import assert from 'node:assert/strict';
import test from 'node:test';
import {pickSimulationVertex,simulationDragTarget} from '../../src/engine/simInteraction';
import {cameraUniforms,projectVertices,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

const camera:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:100,width:400,height:400,depthRange:10,camDist:10};
type Point=[number,number,number];
const atScreen=(x:number,y:number,depth:number):Point=>[x*(camera.camDist-depth)/(camera.scale*camera.camDist),-y*(camera.camDist-depth)/(camera.scale*camera.camDist),depth];
const positions=(...points:Point[])=>new Float32Array(points.flat());
const cover:Point[]=[atScreen(-80,-60,5),atScreen(80,-60,5),atScreen(0,80,5)];
const pick=(points:Float32Array,indices?:ArrayLike<number>,x=0,y=0,radius=4)=>pickSimulationVertex(points,camera,200+x,200+y,radius,indices);

test('closest real vertex preserves the original picking rule, with a screen-space radius',()=>{
  const points=positions(atScreen(2,1,0),atScreen(6,0,4));
  assert.equal(pick(points)?.index,0);
  assert.equal(pick(points,undefined,6,0)?.index,1);
  assert.equal(pick(points,undefined,30,0),null);
  assert.equal(pick(points,undefined,2,1,0),null);
  assert.equal(pick(points,undefined,NaN,0),null);
  assert.equal(pick(points,undefined,0,0,Infinity),null);
});

test('overlapping projections choose the front vertex, keeping equal-depth ties stable',()=>{
  assert.equal(pick(positions([0,0,0],[0,0,5]))?.index,1);
  assert.equal(pick(positions([0,0,5],[0,0,5-1e-6]))?.index,0);
  assert.equal(pick(positions([0,0,5-1e-6],[0,0,5]))?.index,0);
});

test('opaque paper rejects a hidden vertex even when no foreground vertex is within the radius',()=>{
  const points=positions([0,0,0],...cover),indices=new Uint32Array([1,2,3]);
  assert.equal(pick(points,indices),null);
  // Hidden-paper, wireframe and x-ray callers intentionally omit the triangles.
  assert.equal(pick(points)?.index,0);
  assert.equal(pick(points,[])?.index,0);
});

test('a hidden nearest vertex does not prevent selecting the next visible candidate',()=>{
  const points=positions(atScreen(0,0,0),atScreen(8,0,0),atScreen(-100,-100,5),atScreen(4,-100,5),atScreen(4,100,5));
  assert.equal(pick(points,[2,3,4],0,0,12)?.index,1);
  assert.equal(pick(points,undefined,0,0,12)?.index,0);
});

test('tilted sheets use perspective-correct depth rather than linear screen-space depth',()=>{
  // At screen centre these projected corners have barycentrics 2/7, 2/7, 3/7.
  // The real surface depth is 10 - 1 / (5/7/10 + 2/7/2) = 16/3.
  // Linear interpolation would give 16/7 and incorrectly expose depth 4.
  const tilted:Point[]=[atScreen(-80,-60,0),atScreen(80,-60,8),atScreen(0,80,0)];
  assert.equal(pick(positions([0,0,4],...tilted),[1,2,3]),null);
  assert.equal(pick(positions([0,0,6],...tilted),[1,2,3])?.index,0);
});

test('coincident and nearly coincident paper do not occlude their own vertices',()=>{
  assert.equal(pick(positions([0,0,5],...cover),[1,2,3])?.index,0);
  assert.equal(pick(positions([0,0,5-1e-6],...cover),[1,2,3])?.index,0);
  assert.equal(pick(positions([0,0,5-1e-3],...cover),[1,2,3]),null);
  assert.equal(pick(positions([0,0,5],atScreen(80,0,5),atScreen(0,80,5)),[0,1,2])?.index,0);
});

test('paper boundaries occlude rear vertices but leave points outside the paper selectable',()=>{
  const triangle:Point[]=[atScreen(-80,0,5),atScreen(80,0,5),atScreen(0,80,5)];
  assert.equal(pick(positions(atScreen(0,0,0),...triangle),[1,2,3]),null);
  assert.equal(pick(positions(atScreen(0,-.01,0),...triangle),[1,2,3])?.index,0);
});

test('vertices at or behind the camera cannot be grabbed, even without opaque triangles',()=>{
  assert.equal(pick(positions([0,0,10],[0,0,11])),null);
  assert.equal(pick(positions([0,0,10],[0,0,11],[0,0,0]))?.index,2);
  assert.equal(pick(positions([NaN,0,0],[0,Infinity,0],[0,0,0]))?.index,2);
});

test('a triangle crossing the camera plane still occludes where its visible portion is in front',()=>{
  const points=positions([0,0,0],[-1,-1,0],[1,-1,0],[0,1,12]);
  // The forward camera ray intersects this triangle at z=6, although one corner is behind the eye.
  assert.equal(pick(points,[1,2,3]),null);
  assert.equal(pick(positions([0,0,0],[-1,-1,12],[1,-1,12],[0,1,12]),[1,2,3])?.index,0);
});

test('both triangle windings occlude, while degenerate or invalid triangles do not',()=>{
  const points=positions([0,0,0],...cover);
  assert.equal(pick(points,[3,2,1]),null);
  assert.equal(pick(points,[1,1,1])?.index,0);
  assert.equal(pick(points,[1,2,99,1,-1,3,1,2,NaN,1,2,.5])?.index,0);
  assert.equal(pick(points,[1,2])?.index,0);
});

test('picking leaves source geometry and triangle indices unchanged',()=>{
  const points=positions([0,0,0],...cover),indices=new Uint32Array([1,2,3]);
  const beforePoints=points.slice(),beforeIndices=indices.slice();
  pick(points,indices);
  assert.deepEqual(points,beforePoints);
  assert.deepEqual(indices,beforeIndices);
});

test('the existing drag target preserves selected depth and follows the pointer under rotated perspective',()=>{
  const rotated=cameraUniforms({yaw:.4,pitch:.6,zoom:.88},[.2,-.1,.3],2,800,600);
  const points=positions([.3,.7,.5]),screen=projectVertices(points,rotated).screen;
  const selected=pickSimulationVertex(points,rotated,screen[0],screen[1],12)!;
  assert.ok(selected);
  const target=simulationDragTarget(selected,rotated,screen[0]+40,screen[1]-25);
  const after=projectVertices(positions(target),rotated);
  assert.ok(Math.abs(after.screen[0]-screen[0]-40)<1e-3);
  assert.ok(Math.abs(after.screen[1]-screen[1]+25)<1e-3);
  assert.ok(Math.abs(after.view[2]-selected.depth)<1e-6);
});
