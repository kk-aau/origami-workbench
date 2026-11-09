import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {compileSimulationStepRigidMechanism,createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';

type V=[number,number,number];
const p=(positions:ArrayLike<number>,i:number):V=>[positions[3*i],positions[3*i+1],positions[3*i+2]];
const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:V,s:number):V=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a:V,b:V)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:V)=>Math.hypot(...a);
const unit=(a:V)=>mul(a,1/norm(a));
const distance=(a:ArrayLike<number>,i:number,j:number)=>norm(sub(p(a,i),p(a,j)));
const rotate=(a:V,axis:V,t:number):V=>add(add(mul(a,Math.cos(t)),mul(cross(axis,a),Math.sin(t))),mul(axis,dot(axis,a)*(1-Math.cos(t))));
function actualAngles(prepared:ReturnType<typeof prepareSimulationDocument>['prepared'],positions:ArrayLike<number>){
  const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(p(positions,b),p(positions,a)),sub(p(positions,c),p(positions,a)))));
  return prepared.creaseParams.map(c=>{
    const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(p(positions,b),p(positions,a))),n1=normals[c.face1],n2=normals[c.face2];
    return Math.atan2(dot(cross(n1,axis),n2),dot(n1,n2))*180/Math.PI;
  });
}
function strip(){
  const fold={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]] as [number,number][],
    edges_assignment:['B','B','B','B','B','B','B','B','V','M'],edges_foldAngle:[0,0,0,0,0,0,0,0,180,-180],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:prepared.facesVertices.filter(face=>face.every(v=>prepared.fold.vertices_coords[v][0]<=1)).flat()};
  animation.fixedVertices=[...new Set(animation.fixedVertices)];
  return {fold,prepared,animation};
}
/** A genuine spherical four-bar mechanism with sectors 60/90/120/90 degrees.
 * Its reference pose is constructed from sphere/plane intersections, without
 * using the candidate evaluator or a nonlinear solver to certify itself. */
function fourVertex(){
  const s=Math.sqrt(3)/2;
  const fold={vertices_coords:[[1,0],[.5,s],[-s,.5],[0,-1],[0,0]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]] as [number,number][],
    edges_assignment:['B','B','B','B','M','M','M','V'],edges_foldAngle:[0,0,0,0,-180,-180,-180,180],faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),seed=Array.from(model.originalPositions);
  const find=(x:number,y:number)=>prepared.fold.vertices_coords.findIndex(v=>Math.abs(v[0]-x)<1e-8&&Math.abs(v[2]+y)<1e-8);
  const rim=[find(1,0),find(.5,s),find(-s,.5),find(0,-1)],center=find(0,0),origin=p(seed,center),rays=rim.map(v=>sub(p(seed,v),origin)),radius=norm(rays[0]);
  assert.ok(rim.every(v=>v>=0)&&center>=0);
  const reference=(theta:number)=>{
    const u0=unit(rays[0]),u1=unit(rays[1]),u2=rotate(unit(rays[2]),u1,theta),expectedDot=dot(unit(rays[2]),unit(rays[3]));
    // The fourth ray is perpendicular to ray 0 (the 90-degree fourth sector).
    const projected=sub(u2,mul(u0,dot(u2,u0))),n2=dot(projected,projected),base=mul(projected,expectedDot/n2),height=Math.sqrt(Math.max(0,1-expectedDot*expectedDot/n2));
    const side=mul(unit(cross(u0,projected)),height),a=add(base,side),b=sub(base,side),u3=dot(a,unit(rays[3]))>dot(b,unit(rays[3]))?a:b;
    const result=Float64Array.from(seed);result.set(add(origin,mul(u2,radius)),rim[2]*3);result.set(add(origin,mul(u3,radius)),rim[3]*3);
    return result;
  };
  const target=reference(Math.PI/4),angles=actualAngles(prepared,target);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:seed,
    ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:0,toAngle:angles[i]})),fixedVertices:[...prepared.facesVertices.find(face=>face.includes(rim[0])&&face.includes(rim[1]))!]};
  return {fold,prepared,animation,target,angles,reference};
}

test('strict driver keeps legal open-chain poses, fixed vertices and each rigid assembly unchanged',()=>{
  const {prepared,animation}=strip(),mechanism=compileSimulationStepRigidMechanism(prepared,animation),driver=createSimulationStepRigidDriver(prepared,animation);
  assert.equal(mechanism.components.length,3);assert.equal(mechanism.joints.filter(j=>j.tree).length,2);
  for(const fraction of [0,.3,.8,.15,1,.5,0]){
    const angles=prepared.creaseParams.map(c=>c.targetAngle*fraction),evaluation=mechanism.evaluateAngles(angles),pose=driver(angles);
    assert.ok(evaluation.maxResidual<1e-12);
    assert.deepEqual(pose,mechanism.validatePose(angles));
    for(const v of animation.fixedVertices)assert.deepEqual(p(pose,v),p(animation.initialPositions,v));
    for(const c of mechanism.components)for(const a of c.vertices)for(const b of c.vertices)assert.ok(Math.abs(distance(pose,a,b)-distance(animation.initialPositions,a,b))<1e-7);
    assert.equal(mechanism.triangleBodies.length,prepared.faceCount);
  }
  assert.throws(()=>driver([NaN]),/折角/);assert.throws(()=>driver([]),/折角/);
});

test('closed-loop residuals expose incompatible independent angles without deforming candidate bodies',()=>{
  const {prepared,animation,angles}=fourVertex(),mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  const invalid=angles.map(v=>v*.5),candidate=mechanism.evaluateAngles(invalid),start=mechanism.evaluateAngles(angles.map(()=>0));
  assert.equal(mechanism.components.length,4);assert.equal(mechanism.joints.filter(j=>!j.tree).length,1);
  assert.equal(candidate.residuals.length,start.residuals.length,'the optimiser sees a stable residual structure');
  assert.ok(candidate.maxResidual>1e-3,'half of each final angle does not close this spherical mechanism');
  assert.ok(candidate.maxAngleResidual>1e-3||candidate.maxPositionResidual>1e-3);
  assert.throws(()=>mechanism.validatePose(invalid),/闭环|连接|铰链|拉伸/);
  assert.throws(()=>createSimulationStepRigidDriver(prepared,animation)(invalid),/闭环|连接|铰链|拉伸/);
});

test('nonlinear four-crease configurations close against an independently constructed real folded surface',()=>{
  const {prepared,animation,reference}=fourVertex(),mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  for(const theta of [.02,.15,.4,.75,1.15]){
    const expected=reference(theta),angles=actualAngles(prepared,expected),evaluation=mechanism.evaluateAngles(angles),pose=mechanism.validatePose(angles);
    assert.ok(evaluation.maxPositionResidual<2e-7);assert.ok(evaluation.maxAngleResidual<1e-6);
    for(let i=0;i<pose.length;i++)assert.ok(Math.abs(pose[i]-expected[i])<2e-7,`material coordinate ${i} closes without averaging`);
    for(const [a,b] of prepared.edgesVertices)assert.ok(Math.abs(distance(pose,a,b)-distance(animation.initialPositions,a,b))<1e-7);
    const moving=angles.filter(v=>Math.abs(v)>1e-5).map(Math.abs);
    assert.ok(Math.max(...moving)-Math.min(...moving)>theta*10,'the valid configuration really couples unequal fold angles');
  }
});

test('an active hinge locked inside an unchanged loop remains a residual and strict driver rejects it',()=>{
  const {prepared,animation}=fourVertex();animation.ranges.forEach((r,i)=>{r.toAngle=i===0?90:0;});
  const mechanism=compileSimulationStepRigidMechanism(prepared,animation),angles=prepared.creaseParams.map((_,i)=>i===0?90:0);
  assert.equal(mechanism.components.length,1);assert.ok(mechanism.joints.some(j=>j.a===j.b));
  assert.ok(mechanism.evaluateAngles(angles).maxAngleResidual>1);
  assert.throws(()=>mechanism.validatePose(angles),/铰链/);
  assert.throws(()=>createSimulationStepRigidDriver(prepared,animation),/闭环/);
});

test('displacement bounds cover intermediate rotations even when endpoint geometry is identical',()=>{
  const {prepared,animation}=strip(),mechanism=compileSimulationStepRigidMechanism(prepared,animation),from=prepared.creaseParams.map(()=>0),to=prepared.creaseParams.map(()=>360);
  const bounds=mechanism.displacementBounds(from,to),seed=mechanism.evaluateAngles(from).positions,end=mechanism.evaluateAngles(to).positions;
  assert.ok(end.every((v,i)=>Math.abs(v-seed[i])<1e-12));assert.ok(bounds.some(v=>v>1));
  for(let s=0;s<=100;s++){
    const evaluation=mechanism.evaluateAngles(to.map(v=>v*s/100));
    for(let v=0;v<prepared.vertexCount;v++)assert.ok(norm(sub(p(evaluation.positions,v),p(seed,v)))<=bounds[mechanism.vertexBodies[v]]+1e-12);
  }
  assert.equal(bounds[mechanism.root],0);
});
