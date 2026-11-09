import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,pointOnSegment} from '../../src/core/geometry';
import {buildPartialCreaseConeMesh} from '../../src/engine/simPartialCreaseConeMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {planSimulationStepCone,solveSimulationStepConeAngles,type SimulationStepConeDescription} from '../../src/engine/simStepCone';
import {createSimulationStepFlexEvaluator,inspectSimulationStepFlexCurvature,type SimulationStepFlexMotion} from '../../src/engine/simStepFlex';
import {certifySimulationStepFlexPath} from '../../src/engine/simStepFlexCollision';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {fixture as diagramFixture} from '../fixtures/diagramPartialCrease';

type V=[number,number,number];
const apply=(m:readonly number[],v:V):V=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));

function fixture(){
  const document=blankDoc('真正有限的短压痕',100,100),route={id:'short',a:[0,40] as [number,number],b:[40,40] as [number,number],assignment:'F' as const,angle:0};
  document.segments.push(route);
  const source=buildDiagramFold(document).graph,mesh=buildPartialCreaseConeMesh(source,route),{prepared}=prepareSimulationDocument(mesh.fold),model=new OrigamiModel(prepared);
  const fixed=prepared.facesVertices.map((f,i)=>({i,x:f.reduce((sum,v)=>sum+mesh.materialCoordinates[v][0],0)})).sort((a,b)=>b.x-a.x)[0];
  const animation:SimulationStepAnimation={version:1,sourceSignature:'cone-fixture',initialPositions:Array.from(model.originalPositions),fixedVertices:[...prepared.facesVertices[fixed.i]],flexRequest:{version:1,bendingStiffness:mesh.bendingStiffness},
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:0,...prepared.edgesVertices[c.edge].every(v=>pointOnSegment(mesh.materialCoordinates[v],route,1e-6))?{viaAngle:180}:{}}))};
  return {document,source,mesh,prepared,animation};
}

let cached:(ReturnType<typeof fixture>&{motion:SimulationStepFlexMotion})|undefined;
function solved(){if(cached)return cached;const f=fixture();return cached={...f,motion:planSimulationStepCone(f.prepared,f.animation,f.mesh)};}

test('a nonlinear rotation loop closes every shared radial ray without stretching or averaging',()=>{
  const n=17,rayAngles=Array.from({length:n},(_,i)=>Math.PI*2*i/n),problem={rayAngles,activeRay:0,fixedSector:5};
  let previous:number[]|undefined;
  for(const degrees of [1,5,15,30,60,90]){
    const solution=solveSimulationStepConeAngles(problem,degrees*Math.PI/180,previous);previous=solution.angles;
    assert.ok(solution.closureResidual<1e-8);assert.equal(solution.angles[0],degrees*Math.PI/180);
    assert.ok(solution.bendingEnergy>0);assert.ok(solution.angles.filter((a,i)=>i!==0&&Math.abs(a)>.001).length>=2);
    for(let i=0;i<n;i++){
      const ray:V=[Math.cos(rayAngles[i]),0,-Math.sin(rayAngles[i])],r=solution.rotations[i];
      assert.ok(distance(apply(r,ray),apply(solution.rotations[(i+n-1)%n],ray))<1e-7,'shared material ray has one position');
      for(let a=0;a<3;a++)for(let b=0;b<3;b++)assert.ok(Math.abs(r[a*3]*r[b*3]+r[a*3+1]*r[b*3+1]+r[a*3+2]*r[b*3+2]-(a===b?1:0))<1e-12);
      const determinant=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
      assert.ok(Math.abs(determinant-1)<1e-12);
    }
    assert.deepEqual(solution.rotations[5],[1,0,0,0,1,0,0,0,1]);
  }
});

test('a finite 90 degree press has a relaxed extension, genuine nearby curvature and continuous collision proof',()=>{
  const {prepared,animation,mesh,motion}=solved(),path=createSimulationStepFlexEvaluator(prepared,animation,motion),curve=inspectSimulationStepFlexCurvature(prepared,animation,motion);
  assert.equal(motion.foldLimit,.5);assert.equal(motion.keyframes.length,181);
  assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);assert.ok(motion.maxAngleError<.006);
  assert.deepEqual(path.evaluate(0),Float32Array.from(animation.initialPositions));assert.deepEqual(path.evaluate(1),path.evaluate(0));
  assert.equal(curve.curved,true);assert.equal(curve.relaxedExtension,true);assert.equal(curve.tips.length,1);assert.equal(curve.tips[0].vertex,mesh.apexVertex);
  assert.ok(curve.tips[0].offAxisHinges>=2);assert.ok(curve.tips[0].maxOffAxisAngle>.03);
  assert.ok(!mesh.rays.some(r=>Math.cos(r.angle-mesh.rays[mesh.activeRay].angle)<-1+1e-10),'no hidden hinge on the reverse extension');
  for(const p of [0,.013,.173,.5,.729,.999,1]){
    const pose=path.evaluate(p);
    for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.equal(pose[v*3+k],animation.initialPositions[v*3+k]);
    assert.ok(distance(Array.from(path.driver(path.angles(p))),Array.from(pose))<2e-7);
  }
  const certificate=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},motion.keyframes);
  assert.equal(certificate.status,'clear');assert.ok(certificate.certifiedIntervals>0);
});

test('cone planning preserves saved CP, material topology, metadata and requested endpoints',()=>{
  const f=fixture(),snapshot=JSON.stringify(f),motion=planSimulationStepCone(f.prepared,f.animation,f.mesh);
  assert.equal(JSON.stringify(f),snapshot);assert.equal(motion.foldLimit,.5);
  assert.equal(f.document.segments.filter(s=>s.id==='short').length,1);assert.deepEqual(f.document.segments.find(s=>s.id==='short')!.b,[40,40]);
  assert.ok(f.animation.ranges.filter(r=>r.viaAngle===180).length>0);
  assert.ok(f.animation.ranges.every(r=>r.fromAngle===0&&r.toAngle===0));
  assert.equal(new Set(f.prepared.triangleSourceFaces).size,1);
});

test('whole-sheet initial rotations, translations and planar reflections preserve the actual motion',()=>{
  const {prepared,animation,mesh,motion}=solved(),baseline=createSimulationStepFlexEvaluator(prepared,animation,motion);
  const transforms:Array<(v:V)=>V>=[([x,y,z])=>[z+.125,x-.25,y+.0625],([x,y,z])=>[-x,-y,z]];
  for(const transform of transforms){
    const initialPositions=Array.from({length:prepared.vertexCount},(_,v)=>transform(animation.initialPositions.slice(v*3,v*3+3) as V)).flat(),moved={...animation,initialPositions},candidate=planSimulationStepCone(prepared,moved,mesh),path=createSimulationStepFlexEvaluator(prepared,moved,candidate);
    assert.deepEqual(path.evaluate(0),Float32Array.from(initialPositions));assert.deepEqual(path.evaluate(1),path.evaluate(0));
    for(const p of [.113,.5,.763]){
      const reference=baseline.evaluate(p),actual=path.evaluate(p);
      for(let v=0;v<prepared.vertexCount;v++)assert.ok(distance(transform(Array.from(reference.slice(v*3,v*3+3)) as V),Array.from(actual.slice(v*3,v*3+3)))<2e-6);
    }
    assert.equal(inspectSimulationStepFlexCurvature(prepared,moved,candidate).curved,true);
  }
});

test('mountain direction and requested smaller compression are represented by their actual signed angle',()=>{
  const {prepared,animation,mesh}=solved(),reversed={...animation,ranges:animation.ranges.map(r=>({...r,...r.viaAngle!==undefined?{viaAngle:-30}:{}}))},motion=planSimulationStepCone(prepared,reversed,mesh),path=createSimulationStepFlexEvaluator(prepared,reversed,motion);
  assert.equal(motion.foldLimit,1);assert.ok(path.angles(.5).some(a=>a===-30));assert.ok(path.angles(.5).every(a=>a===0||a===-30));
  assert.deepEqual(path.evaluate(1),path.evaluate(0));assert.equal(inspectSimulationStepFlexCurvature(prepared,reversed,motion).curved,true);
});

test('all four cones retain exact material seams at 90 degrees with the real application seed',()=>{
  const {project,stepId}=diagramFixture('network'),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold),cones=clip.fold.zhezhi_partial_crease_cones as SimulationStepConeDescription[],material=prepared.originalPositions;
  assert.equal(cones.length,4);assert.ok(prepared.faceCount>300);
  for(const cone of cones){
    const apex=cone.apexVertex,ray=cone.rays[cone.activeRay],dx=ray.direction[0],dz=-ray.direction[1];
    const active=new Set(prepared.creaseParams.filter(c=>clip.animation.ranges.find(r=>r.edge===c.edge)?.viaAngle&&prepared.edgesVertices[c.edge].every(v=>{
      const x=material[v*3]-material[apex*3],z=material[v*3+2]-material[apex*3+2];return Math.abs(x*dz-z*dx)<1e-5&&x*dx+z*dz>=-1e-5;
    })).map(c=>c.edge));
    const animation={...clip.animation,ranges:clip.animation.ranges.map(r=>({...r,viaAngle:active.has(r.edge)?r.viaAngle:undefined}))},motion=planSimulationStepCone(prepared,animation,cone);
    assert.equal(motion.foldLimit,.5);assert.equal(motion.keyframes.length,181);assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);assert.ok(motion.maxAngleError<.006);
    assert.deepEqual(motion.keyframes[0].positions,motion.keyframes.at(-1)!.positions);
    for(const frame of motion.keyframes)for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.equal(frame.positions[v*3+k],Math.fround(animation.initialPositions[v*3+k]));
    assert.equal(inspectSimulationStepFlexCurvature(prepared,animation,motion).curved,true);
  }
});

test('raw cone metadata cannot forge ray directions, material sectors or shared-vertex membership',()=>{
  const {prepared,animation,mesh}=solved();
  const changes:Array<(d:SimulationStepConeDescription)=>void>=[
    d=>{d.apexVertex=d.rays[0].vertex;},
    d=>{d.rays[0].angle+=.1;},
    d=>{d.rays[0].direction=[1,0];},
    d=>{d.rays[0].vertex=d.apexVertex;},
    d=>{d.triangleSectors[0]=(d.triangleSectors[0]+3)%d.rays.length;},
    d=>{d.vertexSectors[d.apexVertex].pop();},
    d=>{d.vertexSectors[d.apexVertex].push(d.vertexSectors[d.apexVertex][0]);},
    d=>{d.triangleSectors.pop();},
    d=>{d.activeRay=(d.activeRay+3)%d.rays.length;},
    d=>{(d as unknown as {rays:unknown}).rays={length:16};},
  ];
  for(const change of changes){const d=structuredClone(mesh);change(d);assert.throws(()=>planSimulationStepCone(prepared,animation,d),/锥|短痕|扇区/);}
});

test('incompatible fixed sectors and non-precrease instructions are rejected instead of moving pins',()=>{
  const {prepared,animation,mesh}=solved(),across={...animation,fixedVertices:[...new Set(mesh.rays.slice(0,4).map(r=>r.vertex))]};
  assert.throws(()=>planSimulationStepCone(prepared,across,mesh),/固定纸面跨越/);
  const final=structuredClone(animation);final.ranges.find(r=>r.viaAngle!==undefined)!.toAngle=10;
  assert.throws(()=>planSimulationStepCone(prepared,final,mesh),/展开纸面/);
  assert.throws(()=>planSimulationStepCone(prepared,{...animation,flexRequest:undefined},mesh),/展开纸面/);
  assert.throws(()=>planSimulationStepCone(prepared,animation,mesh,{peakAngle:Infinity}),/角度/);
  const inconsistent=structuredClone(animation);inconsistent.ranges.find(r=>r.viaAngle!==undefined)!.viaAngle=NaN;
  assert.throws(()=>planSimulationStepCone(prepared,inconsistent,mesh),/短痕|角度/);
});

test('invalid or multiply-wound spherical loops never produce a closure certificate',()=>{
  const rayAngles=Array.from({length:8},(_,i)=>i*Math.PI/4),problem={rayAngles,activeRay:0};
  assert.throws(()=>solveSimulationStepConeAngles({...problem,rayAngles:[0,0,...rayAngles.slice(2)]},.1),/扇区/);
  assert.throws(()=>solveSimulationStepConeAngles({...problem,rayAngles:Array.from({length:8},(_,i)=>rayAngles[i*3%8])},.1),/闭环/);
  assert.throws(()=>solveSimulationStepConeAngles({...problem,activeRay:9},.1),/射线/);
  assert.throws(()=>solveSimulationStepConeAngles(problem,NaN),/角度/);
  assert.throws(()=>solveSimulationStepConeAngles(problem,.1,[0]),/初值/);
});
