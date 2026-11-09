import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {validateSimulationStepAnimation,validateSimulationStepAnimationStructure,simulationStepFoldProfile,seedSimulationStepAnimation,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';

function normals(prepared:ReturnType<typeof prepareSimulationDocument>['prepared'],positions:ArrayLike<number>){
  return prepared.facesVertices.map(([a,b,c])=>{
    const ab=[0,1,2].map(k=>positions[b*3+k]-positions[a*3+k]),ac=[0,1,2].map(k=>positions[c*3+k]-positions[a*3+k]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],size=Math.hypot(...n);return n.map(v=>v/size);
  });
}
const separation=(p:ArrayLike<number>,a:number,b:number)=>Math.hypot(...[0,1,2].map(k=>p[a*3+k]-p[b*3+k]));

function fixture(unfolded=false){
  const fold={
    vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]] as [number,number][],
    edges_assignment:['B','B','B','B','B','B','B','B','V',unfolded?'F':'M'],
    edges_foldAngle:[0,0,0,0,0,0,0,0,180,unfolded?0:-180],
    faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]],
  };
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),initialPositions=Array.from(model.originalPositions);
  const hingeVertex=prepared.fold.vertices_coords.findIndex(p=>p[0]===1),hingeX=model.originalPositions[hingeVertex*3];
  for(let v=0;v<prepared.vertexCount;v++)if(initialPositions[v*3]<hingeX)initialPositions[v*3]=2*hingeX-initialPositions[v*3];
  const ranges=prepared.creaseParams.map(c=>{
    const [a,b]=prepared.edgesVertices[c.edge],x0=prepared.fold.vertices_coords[a][0],x1=prepared.fold.vertices_coords[b][0];
    return {edge:c.edge,fromAngle:x0===1&&x1===1?180:0,toAngle:c.targetAngle};
  });
  const fixedVertices=prepared.fold.vertices_coords.flatMap((p,i)=>p[0]>=1&&p[0]<=2?[i]:[]);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions,ranges,fixedVertices};
  return {fold,prepared,model,animation,hingeX};
}

test('a second fold loads the already folded first crease without altering flat rest lengths',()=>{
  const {prepared,model,animation}=fixture(),original=model.originalPositions.slice();
  const valid=validateSimulationStepAnimation(animation,prepared,animation.sourceSignature),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  seedSimulationStepAnimation(solver,valid);
  assert.equal(solver.stepCount,0,'installing the initial folded pose does not advance the action');
  assert.deepEqual(model.originalPositions,original);
  for(let i=0;i<model.positions.length;i++)assert.ok(Math.abs(model.positions[i]-animation.initialPositions[i])<1e-6);
  solver.step(100);
  assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-5);
  assert.ok(solver.maxVelocity()<1e-4);
  for(let i=0;i<model.positions.length;i++)assert.ok(Math.abs(model.positions[i]-animation.initialPositions[i])<2e-5);
  solver.dispose();
});

test('only the new crease changes target; fixed paper stays still during actual second-fold solving',()=>{
  const {prepared,model,animation}=fixture(),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  seedSimulationStepAnimation(solver,animation);
  solver.setFoldProfile(simulationStepFoldProfile(animation,.5));solver.setFoldPercent(50);solver.step(8000);
  assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.02);
  for(const v of animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(model.positions[v*3+axis]-animation.initialPositions[v*3+axis])<1e-7);
  const newEdge=animation.ranges.find(r=>r.fromAngle===0&&r.toAngle===-180)!.edge;
  const oldEdge=animation.ranges.find(r=>r.fromAngle===180)!.edge;
  const profile=simulationStepFoldProfile(animation,.5);
  assert.equal(profile.ranges.find(r=>r.edge===oldEdge)!.fromAngle,180);
  assert.equal(profile.ranges.find(r=>r.edge===newEdge)!.fromAngle,-90);
  assert.ok(model.positions.some((p,i)=>i%3===1&&Math.abs(p)>0.05),'the free paper really moved out of the initial flat plane');
  solver.setFoldProfile(simulationStepFoldProfile(animation,1));solver.setFoldPercent(100);solver.step(10000);
  assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.001);
  const hingeVertex=prepared.fold.vertices_coords.findIndex(p=>p[0]===2),hinge=model.originalPositions[hingeVertex*3];
  for(let v=0;v<prepared.vertexCount;v++)if(prepared.fold.vertices_coords[v][0]===3){
    assert.ok(Math.abs(model.positions[v*3]-(2*hinge-model.originalPositions[v*3]))<.003,'the new panel reaches the second folded endpoint');
    assert.ok(Math.abs(model.positions[v*3+1])<.003);
  }
  seedSimulationStepAnimation(solver,animation);
  for(let i=0;i<model.positions.length;i++)assert.ok(Math.abs(model.positions[i]-animation.initialPositions[i])<1e-6,'replay returns to the previous fold, not the unfolded sheet');
  assert.equal(solver.maxVelocity(),0);
  solver.dispose();
});

test('precrease phase returns to its starting angle while old creases remain folded',()=>{
  const {animation}=fixture(),r=animation.ranges.find(r=>r.toAngle===-180)!;r.toAngle=0;r.viaAngle=-180;
  for(const [p,angle] of [[0,0],[.25,-90],[.5,-180],[.75,-90],[1,0]])assert.equal(simulationStepFoldProfile(animation,p).ranges.find(q=>q.edge===r.edge)!.fromAngle,angle);
  for(const p of [0,.25,.5,.75,1])assert.equal(simulationStepFoldProfile(animation,p).ranges.find(q=>q.edge===animation.ranges.find(r=>r.fromAngle===180)!.edge)!.fromAngle,180);
});

test('a real F/0 hinge can fold and unfold through the solver without replaying the old crease',()=>{
  const {prepared,model,animation}=fixture(true);
  const crease=prepared.creaseParams.find(c=>{
    const [a,b]=prepared.edgesVertices[c.edge];return prepared.fold.vertices_coords[a][0]===2&&prepared.fold.vertices_coords[b][0]===2;
  })!;
  animation.ranges.find(r=>r.edge===crease.edge)!.viaAngle=-180;
  const valid=validateSimulationStepAnimation(animation,prepared,animation.sourceSignature),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  seedSimulationStepAnimation(solver,valid);
  solver.setFoldProfile(simulationStepFoldProfile(valid,.25));solver.setFoldPercent(25);solver.step(8000);
  assert.ok(model.positions.some((p,i)=>i%3===1&&Math.abs(p)>.05));
  solver.setFoldProfile(simulationStepFoldProfile(valid,1));solver.setFoldPercent(100);solver.step(10000);
  assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.001);
  for(let i=0;i<model.positions.length;i++)assert.ok(Math.abs(model.positions[i]-animation.initialPositions[i])<.003,'F precrease returns to the same previously folded starting state');
  solver.dispose();
});

test('animation trust boundary rejects stale mesh, stretched seed, incomplete targets and invalid anchors',()=>{
  const {prepared,animation}=fixture();
  const changes:Array<(a:SimulationStepAnimation)=>void>=[
    a=>{a.sourceSignature+='stale';},a=>{a.initialPositions.pop();},a=>{a.initialPositions[0]+=.01;},
    a=>{a.initialPositions[0]=NaN;},a=>{a.ranges.pop();},a=>{a.ranges[0].fromAngle=90;},
    a=>{a.ranges[0].viaAngle=181;},a=>{a.ranges[0].toAngle=45;},a=>{a.ranges.push({...a.ranges[0]});},
    a=>{a.fixedVertices=[0,0,1];},a=>{a.fixedVertices=[-1,1,2];},a=>{a.fixedVertices=[0,1];},a=>{a.fixedVertices=[0,1,2];},
  ];
  for(const change of changes){const bad=structuredClone(animation);change(bad);assert.throws(()=>validateSimulationStepAnimation(bad,prepared,animation.sourceSignature));}
  const result=validateSimulationStepAnimation(animation,prepared,animation.sourceSignature);result.initialPositions[0]+=1;
  assert.notDeepEqual(result.initialPositions,animation.initialPositions);
});

test('rejected solver seed does not partially change an existing folded state',()=>{
  const {model,animation}=fixture(),solver=new ReferenceSolver(model,{timeStepScale:.35});
  seedSimulationStepAnimation(solver,animation);const before=model.positions.slice();
  assert.throws(()=>solver.setInitialPositions(new Float32Array([NaN]),[]));
  assert.deepEqual(model.positions,before);solver.dispose();
});

test('old folded hinges cannot pass through the opposite MV branch or overfold beyond 180 degrees',()=>{
  const {animation,prepared}=fixture(),old=animation.ranges.find(r=>r.fromAngle===180)!;
  for(const viaAngle of [-1,-180,180.001]){
    const bad=structuredClone(animation);bad.ranges.find(r=>r.edge===old.edge)!.viaAngle=viaAngle;
    assert.throws(()=>validateSimulationStepAnimationStructure(bad,prepared,animation.sourceSignature),/山谷方向|折角|角度/);
  }
  const candidate=structuredClone(animation);candidate.ranges.find(r=>r.edge===old.edge)!.viaAngle=0;
  const valid=validateSimulationStepAnimationStructure(candidate,prepared,animation.sourceSignature),driver=createSimulationStepRigidDriver(prepared,valid);
  for(const invalidAngle of [-.01,180.01]){
    const angles=valid.ranges.map(r=>r.fromAngle);angles[prepared.creaseParams.findIndex(c=>c.edge===old.edge)]=invalidAngle;
    assert.throws(()=>driver(angles),/允许范围/);
  }
});

test('an unchanged 180-degree fold travels as one rigid block under non-monotonic seeks',()=>{
  const {prepared,model,animation}=fixture();
  animation.fixedVertices=prepared.fold.vertices_coords.flatMap((p,v)=>p[0]>=2?[v]:[]);
  const valid=validateSimulationStepAnimation(animation,prepared,animation.sourceSignature),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  seedSimulationStepAnimation(solver,valid);
  const moving=prepared.fold.vertices_coords.flatMap((p,v)=>p[0]<=2?[v]:[]),initialNormals=normals(prepared,animation.initialPositions);
  const movingFaces=prepared.facesVertices.flatMap((face,f)=>face.every(v=>moving.includes(v))?[f]:[]);
  let middlePose:Float32Array|undefined;
  for(const p of [0,.2,.75,.15,1,.5,0,.9,.5]){
    solver.setFoldProfile(simulationStepFoldProfile(valid,p));solver.setFoldPercent(p*100);solver.step(2000);
    for(const v of animation.fixedVertices)for(let k=0;k<3;k++)assert.ok(Math.abs(model.positions[v*3+k]-animation.initialPositions[v*3+k])<1e-7);
    for(const a of moving)for(const b of moving)assert.ok(Math.abs(separation(model.positions,a,b)-separation(animation.initialPositions,a,b))<5e-7,'all distances inside the moving folded assembly remain rigid');
    const currentNormals=normals(prepared,model.positions);
    for(const a of movingFaces)for(const b of movingFaces){
      const actual=currentNormals[a].reduce((sum,v,k)=>sum+v*currentNormals[b][k],0),expected=initialNormals[a].reduce((sum,v,k)=>sum+v*initialNormals[b][k],0);
      assert.ok(Math.abs(actual-expected)<1e-6,'old folded and triangulated faces retain their relative normals');
    }
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-6);
    if(p===.5){if(middlePose)assert.deepEqual(model.positions,middlePose,'seek result is independent of the previous target');else middlePose=model.positions.slice();}
  }
  solver.reset();assert.deepEqual(model.positions,model.originalPositions,'ordinary reset clears the articulated mode');
  solver.setFoldProfile(null);solver.setFoldPercent(25);solver.step(100);
  assert.ok(solver.maxVelocity()>1e-6,'the normal dynamic solver resumes after reset');solver.dispose();
});

test('actual single-layer corner animation leaves all other layers and triangle normals intact',()=>{
  const fixture=diagramSingleLayerCornerFixture(),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{timeStepScale:.35,damping:.5});
  seedSimulationStepAnimation(solver,clip.animation);
  const initial=clip.animation.initialPositions,baseNormals=normals(prepared,initial),pins=new Set(clip.animation.fixedVertices);
  const stationary=new Set(prepared.fold.vertices_coords.flatMap((p,v)=>Math.abs(p[0]-100)<1e-6&&Math.abs(p[2])<1e-6?[]:[v]));
  assert.ok(pins.size>=3&&pins.size<stationary.size,'only the chosen fixed region is pinned; its old neighbour can be conditionally released');
  for(const p of [.25,.5,.75,1,0,.5]){
    solver.setFoldProfile(simulationStepFoldProfile(clip.animation,p));solver.setFoldPercent(p*100);solver.step(4000);
    for(const v of stationary)for(let k=0;k<3;k++)assert.ok(model.positions[v*3+k]===Math.fround(initial[v*3+k]),'ordinary playback still leaves every non-participating vertex exactly at its initial position');
    const ns=normals(prepared,model.positions);
    prepared.facesVertices.forEach((face,f)=>{
      if(face.every(v=>stationary.has(v)))for(let k=0;k<3;k++)assert.ok(Math.abs(ns[f][k]-baseNormals[f][k])<1e-6,'unchanged triangles do not twist to different lighting normals');
      for(const a of face)for(const b of face)assert.ok(Math.abs(separation(model.positions,a,b)-separation(initial,a,b))<5e-7);
    });
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-6);
  }
  solver.dispose();
});

test('a closed hinge loop with valid endpoints is rejected before its incompatible intermediate motion starts',()=>{
  const fold={vertices_coords:[[-1,-1],[1,-1],[1,1],[-1,1],[0,0]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]],
    edges_assignment:['B','B','B','B','M','M','M','V'],edges_foldAngle:[0,0,0,0,-180,-180,-180,180],
    faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:[...prepared.facesVertices[0]]};
  const driver=createSimulationStepRigidDriver(prepared,animation);
  assert.doesNotThrow(()=>driver(prepared.creaseParams.map(()=>0)));
  assert.doesNotThrow(()=>driver(prepared.creaseParams.map(c=>c.targetAngle)));
  assert.throws(()=>validateSimulationStepAnimation(animation,prepared,animation.sourceSignature),/闭环|连接|铰链/,'a plausible start and endpoint must not hide an impossible sampled hinge path');
});
