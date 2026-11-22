import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {findSimulationStepCoincidentLayers} from '../../src/engine/simStepCoincidentLayers';
import {pressMergedLayers} from '../../src/engine/simStepDynamic';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';

const delta=(a:number[],b:number[])=>a.map((x,k)=>x-b[k]);
const norm=(u:number[])=>Math.hypot(...u);
const cross=([a,b,c]:number[],[d,e,f]:number[])=>[b*f-c*e,c*d-a*f,a*e-b*d];
const vertex=(p:ArrayLike<number>,v:number)=>[p[v*3],p[v*3+1],p[v*3+2]];
const edge=(p:ArrayLike<number>,a:number,b:number)=>delta(vertex(p,b),vertex(p,a));
const midpoint=(a:number[],b:number[])=>a.map((x,i)=>(x+b[i])/2);

test('two pressed layers move through a 70° arc into the exact target without shrinking between keys',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();
  animation.fixedVertices=prepared.fold.vertices_coords.flatMap((p,i)=>p[0]<=1?[i]:[]);
  const rigid=compileSimulationStepRigidMechanism(prepared,animation);
  const angles=(angle:number)=>animation.ranges.map(r=>r.toAngle>0?angle:r.toAngle);
  // Already-closed outer strip rides on the centre strip as both press onto the left one.
  const from=Array.from(rigid.validatePose(angles(110))),strictTarget=rigid.validatePose(angles(180));
  animation.initialPositions=Array.from(rigid.validatePose(angles(0)));
  for(const [tip,axis] of [[3,1],[7,5]]){
    animation.initialPositions.splice(3*tip,3,...vertex(animation.initialPositions,axis));
    from.splice(3*tip,3,...vertex(from,axis));
  }
  animation.ranges=animation.ranges.map(r=>({...r,fromAngle:r.toAngle<0?-180:0}));
  const {vertexGroups}=findSimulationStepCoincidentLayers(prepared,animation);
  assert.ok(vertexGroups.length>0);
  const target=strictTarget.slice();
  // The planner shares compatible Float32 target coordinates before pressing.
  for(const group of vertexGroups)for(const v of group){
    assert.ok(norm(delta(vertex(target,v),vertex(target,group[0])))<=2e-6);
    target.set(vertex(target,group[0]),3*v);
  }
  const rest=prepared.edgesVertices.map(([a,b])=>norm(edge(from,a,b)));
  const areas=prepared.facesVertices.map(([a,b,c])=>norm(cross(edge(from,a,b),edge(from,a,c))));
  const straightMiddle=midpoint(from,Array.from(target));
  assert.ok(prepared.edgesVertices.some(([a,b],i)=>norm(edge(straightMiddle,a,b))<.88*rest[i]));

  const frames=pressMergedLayers(prepared,animation,vertexGroups,from,target,rest,areas);
  assert.ok(frames&&frames.length>1);
  assert.deepEqual(frames.at(-1),Array.from(target));
  assert.ok(frames.at(-1)!.every((x,i)=>Math.abs(x-strictTarget[i])<=2e-6));
  let previous=from;
  for(const pose of frames){
    for(const v of animation.fixedVertices)assert.deepEqual(vertex(pose,v),vertex(from,v));
    for(const group of vertexGroups)for(const v of group)
      assert.ok(norm(delta(vertex(pose,v),vertex(pose,group[0])))<1e-7);
    const mid=midpoint(previous,pose);
    // Bound the entire linear span around its midpoint by the triangle inequality.
    const span=(a:number,b:number)=>norm(delta(edge(previous,a,b),edge(pose,a,b)))/2;
    for(const [i,[a,b]] of prepared.edgesVertices.entries()){
      const size=norm(edge(mid,a,b)),radius=span(a,b);
      assert.ok(size-radius>=.88*rest[i]&&size+radius<=1.12*rest[i]);
    }
    for(const [i,[a,b,c]] of prepared.facesVertices.entries()){
      const u=edge(mid,a,b),v=edge(mid,a,c),du=span(a,b),dv=span(a,c);
      const area=norm(cross(u,v)),radius=du*norm(v)+dv*norm(u)+du*dv;
      assert.ok(area-radius>=.75*areas[i]&&area+radius<=1.25*areas[i]);
    }
    previous=pose;
  }
});
