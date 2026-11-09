import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {buildPartialCreaseSimulationMesh} from '../../src/engine/simPartialCreaseMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {planSimulationStepFlex,createSimulationStepFlexEvaluator,validateSimulationStepFlexMotion,combineSimulationStepFlexMotions,simulationStepFlexMotionAngles,inspectSimulationStepFlexCurvature,type SimulationStepFlexMotion} from '../../src/engine/simStepFlex';
import {createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';
import {certifySimulationStepFlexPath} from '../../src/engine/simStepFlexCollision';

export function flexFixture(peak=180,divisions=4){
  const doc=blankDoc('短压痕',100,100),route={id:'short',a:[0,40] as [number,number],b:[40,40] as [number,number],assignment:'V' as const,angle:0};
  doc.segments.push(route);const mesh=buildPartialCreaseSimulationMesh(buildFold(doc).graph,[route],{divisions,transitionRadius:120}),{prepared}=prepareSimulationDocument(mesh.fold),model=new OrigamiModel(prepared);
  const fixedVertices=[...prepared.facesVertices.find(f=>f.every(v=>mesh.materialCoordinates[v][0]<26&&mesh.materialCoordinates[v][1]<26))!];
  const animation:SimulationStepAnimation={version:1,sourceSignature:'fixture',initialPositions:Array.from(model.originalPositions),fixedVertices,
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:0,...prepared.edgesAssignment[c.edge]==='V'?{viaAngle:peak}:{}}))};
  return {prepared,animation,request:{version:1 as const,bendingStiffness:mesh.bendingStiffness},mesh};
}

let cached:{prepared:ReturnType<typeof flexFixture>['prepared'];animation:SimulationStepAnimation;request:ReturnType<typeof flexFixture>['request'];motion:SimulationStepFlexMotion}|undefined;
function solved(){
  if(cached)return cached;
  const {prepared,animation,request}=flexFixture();
  const motion=planSimulationStepFlex(prepared,animation,request,{steps:128,maxTimeMs:30000,maxIterations:100});
  return cached={prepared,animation,request,motion};
}

test('finite crease candidate has a connected curved excursion, certified metric bounds and exact return',()=>{
  const {prepared,animation,motion}=solved(),path=createSimulationStepFlexEvaluator(prepared,animation,motion);
  assert.deepEqual(path.evaluate(0),Float32Array.from(animation.initialPositions));assert.deepEqual(path.evaluate(1),path.evaluate(0));
  assert.ok(motion.maxEdgeStrain<2e-4);assert.ok(motion.maxAreaStrain<8e-4);assert.ok(motion.maxAngleError<.006);
  assert.ok(path.evaluate(.5).some((v,i)=>Math.abs(v-animation.initialPositions[i])>.001));
  for(const p of [.01,.23,.5,.78,.999])assert.deepEqual(path.driver(path.angles(p)),path.evaluate(Math.min(p,1-p)));
});

test('serialized success statistics cannot hide a stretched, unpinned or discontinuous candidate',()=>{
  const {prepared,animation,motion}=solved();
  const noStats={...motion,maxEdgeStrain:99,maxAreaStrain:99,maxAngleError:99};
  const validated=validateSimulationStepFlexMotion(prepared,animation,noStats);
  assert.equal(validated.maxEdgeStrain,motion.maxEdgeStrain);assert.equal(validated.maxAreaStrain,motion.maxAreaStrain);
  const unpinned=structuredClone(motion);unpinned.keyframes[1].positions[animation.fixedVertices[0]*3]+=.01;
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,unpinned),/固定侧/);
  const sparse=structuredClone(motion);sparse.keyframes=sparse.keyframes.filter(k=>k.progress===0||k.progress===.5||k.progress===1);
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,sparse),/边长|面积|折角|连续曲面/,'legal endpoints do not make a legal linear chord');
  const malformed=structuredClone(motion);malformed.keyframes[1].positions[0]=NaN;
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,malformed),/坐标/);
});

test('a metric-preserving high-angle candidate is still refused when its real same-face fan penetrates',()=>{
  const {prepared,motion}=solved(),certificate=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},motion.keyframes);
  assert.equal(certificate.status,'collision','left-side pins lead this candidate through its own material at a high angle');
  assert.ok(certificate.progress!==undefined&&certificate.progress>0&&certificate.progress<.5);
});

test('runtime copies cannot mutate the validated path and motion bounds contain arbitrary seeks',()=>{
  const {prepared,animation,motion}=solved(),mutable=structuredClone(motion),path=createSimulationStepFlexEvaluator(prepared,animation,mutable),original=path.evaluate(.23);
  mutable.keyframes[1].positions[0]+=.1;path.keyframes[1].positions[0]+=.2;
  assert.deepEqual(path.evaluate(.23),original);
  const bounds=path.motionBound(.17,.38),middle=path.evaluate(.275);
  for(let n=0;n<=30;n++){
    const pose=path.evaluate(.17+.21*n/30);
    for(let v=0;v<prepared.vertexCount;v++)assert.ok(Math.hypot(...[0,1,2].map(k=>pose[v*3+k]-middle[v*3+k]))<=bounds[v]+1e-7);
  }
  assert.throws(()=>path.evaluate(NaN),/进度/);assert.throws(()=>path.driver([NaN]),/折角/);
});

test('unsupported final-state folding and softening of a real mountain or valley hinge are rejected',()=>{
  const {prepared,animation,request}=flexFixture(20),changed=structuredClone(animation);
  changed.ranges.find(r=>r.viaAngle!==undefined)!.toAngle=20;
  assert.throws(()=>planSimulationStepFlex(prepared,changed,request),/预折动作/);
  const soft={...request,bendingStiffness:[...request.bendingStiffness]},active=animation.ranges.find(r=>r.viaAngle!==undefined)!;soft.bendingStiffness[active.edge]=.1;
  assert.throws(()=>planSimulationStepFlex(prepared,animation,soft),/已有折痕/);
  const stretched={...animation,initialPositions:animation.initialPositions.map(v=>v*1.01)};
  assert.throws(()=>planSimulationStepFlex(prepared,stretched,request),/初态.*拉伸/);
  const zero={...request,bendingStiffness:[...request.bendingStiffness]};zero.bendingStiffness[prepared.edgesAssignment.findIndex(a=>a==='F')]=0;
  assert.throws(()=>planSimulationStepFlex(prepared,animation,zero),/大于零/);
});

test('untrusted large clips cannot exhaust unbounded hinge verification work',()=>{
  const {prepared,animation,request}=flexFixture(.000001,10),positions=[...animation.initialPositions];
  const motion:SimulationStepFlexMotion={...request,method:'local-flex',foldLimit:.99,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,keyframes:Array.from({length:4097},(_,i)=>({progress:i/4096,positions}))};
  assert.ok(4096*(prepared.faceCount+2*prepared.creaseParams.length)>2_000_000);
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,motion),/预算/);
});

test('a full-support fold and distant curvature cannot qualify as a curved crease tip',()=>{
  const {prepared,animation,request}=flexFixture(30),cp=prepared.originalPositions,first=prepared.creaseParams.find(c=>prepared.edgesAssignment[c.edge]==='V')!,[v,w]=prepared.edgesVertices[first.edge],a=[cp[v*3],cp[v*3+2]],b=[cp[w*3],cp[w*3+2]],onAxis=(u:number)=>Math.abs((cp[u*3]-a[0])*(b[1]-a[1])-(cp[u*3+2]-a[1])*(b[0]-a[0]))<1e-6;
  const support=new Set(prepared.creaseParams.filter(c=>prepared.edgesVertices[c.edge].every(onAxis)).map(c=>c.edge)),farLine=new Set(prepared.creaseParams.filter(c=>prepared.edgesVertices[c.edge].every(v=>Math.abs(prepared.fold.vertices_coords[v][2]+75)<1e-6)).map(c=>c.edge)),expanded={...animation,ranges:animation.ranges.map(r=>({...r,viaAngle:support.has(r.edge)?30:farLine.has(r.edge)?20:undefined}))},driver=createSimulationStepRigidDriver(prepared,expanded);
  assert.ok(farLine.size>0);
  const candidate:SimulationStepFlexMotion={...request,method:'local-flex',foldLimit:.99,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,keyframes:Array.from({length:65},(_,i)=>{const progress=i/64,u=progress<=.5?progress*2:(1-progress)*2;return {progress,positions:Array.from(driver(prepared.creaseParams.map(c=>support.has(c.edge)?29.7*u:farLine.has(c.edge)?19.8*u:0)))};})};
  const motion=validateSimulationStepFlexMotion(prepared,animation,candidate),curvature=inspectSimulationStepFlexCurvature(prepared,animation,motion);
  assert.equal(curvature.curved,false);assert.equal(curvature.offAxisHinges,0);assert.equal(curvature.relaxedExtension,false);
  assert.ok(curvature.maxOffAxisAngle<1e-6);assert.equal(curvature.tips.length,1);assert.equal(curvature.tips[0].vertex,5);
});

test('independent press-and-return paths compose into ordered batches with real per-batch profiles',()=>{
  const fold={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]] as [number,number][],edges_assignment:['B','B','B','B','B','B','B','B','V','V'],edges_foldAngle:[0,0,0,0,0,0,0,0,0,0],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),active=prepared.creaseParams.filter(c=>prepared.edgesAssignment[c.edge]==='V').map(c=>c.edge),stiffness=prepared.edgesVertices.map(()=>1);
  stiffness[prepared.edgesAssignment.findIndex(a=>a==='F')]=.5;
  const animation:SimulationStepAnimation={version:1,sourceSignature:'serial-fixture',initialPositions:Array.from(model.originalPositions),fixedVertices:[...new Set(prepared.facesVertices.filter(f=>f.every(v=>prepared.fold.vertices_coords[v][0]<=1)).flat())],ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:0,...active.includes(c.edge)?{viaAngle:60}:{}}))};
  const parts=active.map(edge=>{
    const subAnimation={...animation,ranges:animation.ranges.map(r=>({...r,viaAngle:r.edge===edge?60:undefined}))},driver=createSimulationStepRigidDriver(prepared,subAnimation);
    const candidate:SimulationStepFlexMotion={version:1,method:'local-flex',foldLimit:.99,bendingStiffness:stiffness,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,keyframes:Array.from({length:65},(_,n)=>{
      const progress=n/64,u=progress<=.5?progress*2:(1-progress)*2,angles=prepared.creaseParams.map(c=>c.edge===edge?59.4*u:0);
      return {progress,positions:Array.from(driver(angles))};
    })};
    return {motion:validateSimulationStepFlexMotion(prepared,subAnimation,candidate),edges:[edge]};
  });
  const motion=combineSimulationStepFlexMotions(prepared,animation,parts),path=createSimulationStepFlexEvaluator(prepared,animation,motion);
  assert.equal(motion.batches!.length,2);assert.deepEqual(path.evaluate(.5),path.evaluate(0));assert.deepEqual(path.evaluate(1),path.evaluate(0));
  for(const [progress,edge] of [[.25,active[0]],[.75,active[1]]]){
    const angles=path.angles(progress);assert.equal(angles[prepared.creaseParams.findIndex(c=>c.edge===edge)],59.4);
    assert.equal(angles.filter(a=>a!==0).length,1);assert.deepEqual(simulationStepFlexMotionAngles(animation,motion,progress),angles);
  }
  for(const p of [.125,.25,.375,.5,.625,.75,.875,1])assert.deepEqual(path.driver(path.angles(p)),path.evaluate(p));
  const duplicate=structuredClone(motion);duplicate.batches![1].edges=[active[0]];
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,duplicate),/批次/);
  const missingPeak=structuredClone(motion);missingPeak.keyframes=missingPeak.keyframes.filter(k=>k.progress!==.25);
  assert.throws(()=>validateSimulationStepFlexMotion(prepared,animation,missingPeak),/峰值/);
});
