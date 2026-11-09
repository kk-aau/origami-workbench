import test from 'node:test';
import assert from 'node:assert/strict';
import {planSimulationStepPath,createSimulationStepPathEvaluator,validateSimulationStepMotion,simulationStepMotionAngles} from '../../src/engine/simStepPath';
import {simulationDegreeFourFixture,simulationTwoHingeFixture,simulationObstructingFlapsFixture} from '../fixtures/simulationStepComplex';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';
import {validateSimulationStepAnimation,seedSimulationStepAnimation,simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {certifySimulationStepPath,createSimulationStepTangentProjector,inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';

const distance=(positions:ArrayLike<number>,a:number,b:number)=>Math.hypot(...[0,1,2].map(k=>positions[a*3+k]-positions[b*3+k]));

test('a non-right-angle four-crease vertex follows its nonlinear rigid folding branch',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(),motion=planSimulationStepPath(prepared,animation);
  assert.equal(motion.method,'coupled');
  const path=createSimulationStepPathEvaluator(prepared,animation,motion),middle=path.angles(.5);
  assert.ok(Math.max(...middle.map(Math.abs))-Math.min(...middle.map(Math.abs))>20,'the four fold angles do not all become 90 degrees together');
  const mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  const linear=animation.ranges.map(r=>r.toAngle*.5),invalid=mechanism.evaluateAngles(linear);
  assert.ok(invalid.maxResidual>1e-2,'independently interpolating the hinges really breaks this material loop');
  assert.throws(()=>mechanism.validatePose(linear,invalid));
  for(const p of [0,.0001,.0123,.1,.234567,.5,.765432,.97,.9999,1,.2,.8,.2]){
    const positions=path.evaluate(p),angles=path.angles(p);
    assert.ok(mechanism.evaluateAngles(angles).maxResidual<2e-5);
    for(let a=0;a<prepared.vertexCount;a++)for(let b=a+1;b<prepared.vertexCount;b++){
      if(prepared.facesVertices.some(face=>face.includes(a)&&face.includes(b)))assert.ok(Math.abs(distance(positions,a,b)-distance(animation.initialPositions,a,b))<5e-7,'actual material distances stay constant');
    }
    for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.equal(positions[v*3+k],Math.fround(animation.initialPositions[v*3+k]));
  }
});

test('the nonlinear mechanism is used by the real solver under arbitrary seek order',()=>{
  const {prepared,animation,model}=simulationDegreeFourFixture(),motion=planSimulationStepPath(prepared,animation);
  const valid=validateSimulationStepAnimation({...animation,motion},prepared,animation.sourceSignature),solver=new ReferenceSolver(model);
  seedSimulationStepAnimation(solver,valid);const path=createSimulationStepPathEvaluator(prepared,valid,motion);
  for(const p of [.17,.78,.5,1,0,.5]){
    solver.setFoldProfile(simulationStepFoldProfile(valid,p));solver.setFoldPercent(p*100);solver.step(8);
    assert.deepEqual(Array.from(model.positions),Array.from(path.evaluate(p)));
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-6);
  }
  solver.dispose();
});

test('a coupled precrease reaches the requested folded apex and reverses the same rigid branch',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(0,true),motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion);
  assert.equal(motion.method,'coupled');
  assert.ok(motion.phases.some(phase=>phase.end===.5));
  for(const p of [0,.03,.15,.25,.49]){
    const a=path.evaluate(p),b=path.evaluate(1-p);
    for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<2e-6,'fold-and-unfold traverses the same material poses');
  }
  for(let i=0;i<prepared.creaseParams.length;i++)assert.ok(Math.abs(Math.abs(path.angles(.5)[i])-180)<1e-8);
  assert.deepEqual(Array.from(path.evaluate(0)),Array.from(path.evaluate(1)));
});

test('tree paths try a different folding order when simultaneous paper flaps are obstructed',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();let simultaneousRejected=false;
  const motion=planSimulationStepPath(prepared,animation,{checkPath(path,plan){
    if(plan.method==='simultaneous'){simultaneousRejected=true;return {status:'collision'};}
    const angles=path.angles(.25),active=angles.filter(v=>Math.abs(v)>1e-5&&Math.abs(v)<179.999);
    return {status:active.length<=1?'clear':'collision'};
  }});
  assert.ok(simultaneousRejected);assert.equal(motion.method,'sequential');
  const path=createSimulationStepPathEvaluator(prepared,animation,motion);
  for(const p of [.1,.25,.4,.6,.75,.9])assert.ok(path.angles(p).filter(v=>Math.abs(v)>1e-5&&Math.abs(v)<179.999).length<=1);
  assert.deepEqual(path.angles(1),prepared.creaseParams.map(c=>c.targetAngle));
});

test('real adjacent paper flaps penetrate together but are continuously certified when folded in order',()=>{
  const {prepared,animation}=simulationObstructingFlapsFixture(),synchronous=planSimulationStepPath(prepared,animation),syncPath=createSimulationStepPathEvaluator(prepared,animation,synchronous);
  const mesh={indices:prepared.indices,triangleBodies:syncPath.mechanism.triangleBodies,triangleSourceFaces:prepared.triangleSourceFaces};
  assert.equal(inspectSimulationStepCollisions(mesh,syncPath.evaluate(.75)).status,'collision');
  let rejectedCollision=false,acceptedClear=false;
  const motion=planSimulationStepPath(prepared,animation,{checkPath(path,plan){
    const m=path.mechanism,projector=createSimulationStepTangentProjector({initialPositions:animation.initialPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(body=>({parent:body.parent,crease:body.parentCrease,sign:body.rotationSign,axisVertices:body.parentCrease===null?undefined:prepared.edgesVertices[prepared.creaseParams[body.parentCrease].edge]}))},plan.phases);
    const check=certifySimulationStepPath(mesh,{evaluate:path.evaluate,motionBound:path.motionBound,projectionBounds:(a,b,axis,origin)=>projector(a,b,axis,origin,path.angleBounds(a,b)),contactSeparation:projector.separates,contactTransition:projector.contactTransition},{maxEvaluations:2000,maxDepth:14});
    if(plan.method==='simultaneous'&&check.status==='collision')rejectedCollision=true;
    if(plan.method==='sequential'&&check.status==='clear')acceptedClear=true;
    return check;
  }});
  assert.ok(rejectedCollision);assert.ok(acceptedClear);assert.equal(motion.method,'sequential');
  const path=createSimulationStepPathEvaluator(prepared,animation,motion);
  for(let i=0;i<=200;i++)assert.equal(inspectSimulationStepCollisions(mesh,path.evaluate(i/200)).status,'clear');
  assert.deepEqual(path.angles(1),syncPath.angles(1),'avoidance changes only timing, not the user-requested final CP');
});

test('motion bounds enclose all intermediate material travel, including nonlinear speed',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(),motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion);
  for(const [a,b] of [[0,1],[0,.2],[.38,.45],[.75,1]]){
    const center=path.evaluate((a+b)/2),bound=path.motionBound(a,b),angleBounds=path.angleBounds(a,b);
    for(let k=0;k<=50;k++){
      const p=a+(b-a)*k/50,positions=path.evaluate(p),angles=path.angles(p);
      for(let i=0;i<prepared.vertexCount;i++)assert.ok(Math.hypot(...[0,1,2].map(axis=>positions[i*3+axis]-center[i*3+axis]))<=bound[i]+1e-6);
      angles.forEach((angle,i)=>assert.ok(angle>=angleBounds[i].min-1e-8&&angle<=angleBounds[i].max+1e-8));
    }
  }
});

test('serialized plans cannot change old creases, MV signs, continuity, endpoints, or claimed residuals',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),motion=planSimulationStepPath(prepared,animation);
  for(const change of [
    (p:typeof motion)=>{p.phases[0].fromAngles[0]=1;},
    (p:typeof motion)=>{p.phases[0].toAngles[0]=NaN;},
    (p:typeof motion)=>{p.phases[0].toAngles[0]*=-1;},
    (p:typeof motion)=>{p.phases[0].end=.7;},
    (p:typeof motion)=>{p.knots[2].angles[0]+=1;},
    (p:typeof motion)=>{p.knots[1].progress=0;},
    (p:typeof motion)=>{p.phases=Array(129).fill(p.phases[0]);},
    (p:typeof motion)=>{p.knots=Array(4097).fill(p.knots[0]);},
  ]){const malformed=structuredClone(motion);change(malformed);assert.throws(()=>validateSimulationStepMotion(prepared,animation,malformed));}
  const lied=structuredClone(motion);lied.maxClosureResidual=NaN;
  const verified=validateSimulationStepMotion(prepared,animation,lied);assert.ok(Number.isFinite(verified.maxClosureResidual));
  verified.phases[0].fromAngles[0]=10;assert.notEqual(verified.phases[0].fromAngles[0],motion.phases[0].fromAngles[0]);
  assert.throws(()=>simulationStepMotionAngles(motion,NaN));
});

test('unconfirmed collision safety is never reported as a successful path',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();
  assert.throws(()=>planSimulationStepPath(prepared,animation,{maxCandidates:4,checkPath:()=>({status:'inconclusive'})}),/无法连续确认/);
  assert.throws(()=>planSimulationStepPath(prepared,animation,{maxCandidates:4,checkPath:()=>({status:'collision'})}),/阻挡|碰撞/);
});

test('a four-crease MV assignment on an unavailable rigid branch is explicitly rejected',()=>{
  const {prepared,animation}=simulationDegreeFourFixture(2);
  assert.throws(()=>planSimulationStepPath(prepared,animation),/无法找到|固定侧|材料连接/);
});
