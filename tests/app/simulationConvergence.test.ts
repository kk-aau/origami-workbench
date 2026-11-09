import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationAngleAnalyzer,type SimulationAngleDiagnostics} from '../../src/engine/simConvergence';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

function fixture(assignment='M',target=-180){
  const {prepared}=prepareSimulationDocument({
    vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
    edges_assignment:['B','B','B','B','B','B',assignment],
    edges_foldAngle:[0,0,0,0,0,0,target],faces_vertices:[[0,1,4,5],[1,2,3,4]],
  }),model=new OrigamiModel(prepared),analyzer=new SimulationAngleAnalyzer(prepared);
  const history=new Float32Array(prepared.creaseParams.length),crease=prepared.creaseParams.findIndex(c=>c.edge===6);
  const folded=(degrees:number,branch=degrees)=>{
    const positions=model.originalPositions.slice(),radians=degrees*Math.PI/180;
    for(let v=0;v<prepared.vertexCount;v++)if(positions[v*3]>0){const x=positions[v*3];positions[v*3]=x*Math.cos(radians);positions[v*3+1]=x*Math.sin(radians);}
    if(crease>=0)history[crease]=branch*Math.PI/180;
    analyzer.measure(positions,history);return positions;
  };
  return {prepared,model,analyzer,history,crease,folded};
}
function available(value:SimulationAngleDiagnostics){assert.equal(value.status,'available');return value as Extract<SimulationAngleDiagnostics,{status:'available'}>;}
const close=(actual:number,expected:number,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);

test('flat paper reports the actual target discrepancy and excludes panel diagonals',()=>{
  const f=fixture();f.folded(0);const result=available(f.analyzer.evaluate(.5));
  assert.equal(result.creaseCount,1);assert.equal(result.unassignedCreaseCount,0);assert.equal(result.worstEdge,6);
  close(result.meanAbsoluteErrorDegrees,90);close(result.worstSignedErrorDegrees,90);
  close(available(f.analyzer.evaluate(-.5)).worstSignedErrorDegrees,-90);
  close(available(f.analyzer.evaluate(0)).maxAbsoluteErrorDegrees,0);
});

test('mountain and valley folded geometry use actual-minus-target sign',()=>{
  for(const [assignment,target,actual,expected] of [['M',-120,-100,20],['V',120,100,-20]] as const){
    const f=fixture(assignment,target);f.folded(actual);const result=available(f.analyzer.evaluate(1));
    close(result.meanSignedErrorDegrees,expected);close(result.meanAbsoluteErrorDegrees,20);close(result.worstSignedErrorDegrees,expected);
  }
});

test('opposite fold direction near 180 degrees remains a large signed error',()=>{
  const f=fixture();f.folded(179,179);
  close(available(f.analyzer.evaluate(1)).worstSignedErrorDegrees,359);
  f.folded(179,-181);
  close(available(f.analyzer.evaluate(1)).worstSignedErrorDegrees,-1);
  const v=fixture('V',180);v.folded(-179,181);
  close(available(v.analyzer.evaluate(1)).worstSignedErrorDegrees,1);
});

test('exact mountain and valley flat-fold branches retain their sign',()=>{
  for(const [assignment,angle] of [['M',-180],['V',180]] as const){
    const f=fixture(assignment,angle);f.folded(angle,angle);
    close(available(f.analyzer.evaluate(1)).maxAbsoluteErrorDegrees,0);
  }
});

test('measured current geometry supersedes the preceding solver angle without losing its branch',()=>{
  const f=fixture();f.folded(-81,-80);
  close(available(f.analyzer.evaluate(.5)).worstSignedErrorDegrees,9);
});

test('signed cancellation cannot hide opposite crease errors',()=>{
  const {prepared}=prepareSimulationDocument({vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]],
    edges_assignment:['B','B','B','B','B','B','B','B','V','M'],edges_foldAngle:[0,0,0,0,0,0,0,0,180,-180],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]});
  const analyzer=new SimulationAngleAnalyzer(prepared);analyzer.measure(new OrigamiModel(prepared).positions,new Float32Array(prepared.creaseParams.length));
  const result=available(analyzer.evaluate(.5));assert.equal(result.creaseCount,2);close(result.meanSignedErrorDegrees,0);
  close(result.meanAbsoluteErrorDegrees,90);close(result.maxAbsoluteErrorDegrees,90);
});

test('profile targets use their nonzero starting angle and explicitly driven F hinges',()=>{
  const f=fixture();f.folded(-80);
  close(available(f.analyzer.evaluate(.25,{ranges:[{edge:6,fromAngle:-60,toAngle:-180}]})).worstSignedErrorDegrees,10);
  close(available(f.analyzer.evaluate(.8,{ranges:[{edge:6,fromAngle:-80,toAngle:-80}]})).maxAbsoluteErrorDegrees,0);
  const flat=fixture('F',0);flat.folded(-40);
  assert.equal(flat.analyzer.evaluate(1).status,'unavailable');
  const result=available(flat.analyzer.evaluate(.5,{ranges:[{edge:6,fromAngle:0,toAngle:-100}]}));
  assert.equal(result.creaseCount,1);close(result.worstSignedErrorDegrees,10);
});

test('U hinges have no driven target even when the file stores an angle',()=>{
  const f=fixture('U',90);f.folded(20);const result=f.analyzer.evaluate(1);
  assert.equal(result.status,'unavailable');assert.equal(result.creaseCount,0);assert.equal(result.unassignedCreaseCount,1);
  assert.equal(f.analyzer.evaluate(1,{ranges:[{edge:6,fromAngle:0,toAngle:90}]}).status,'unavailable');
});

test('degenerate faces and missing or nonfinite history never masquerade as zero error',()=>{
  const f=fixture(),good=f.folded(-90),history=f.history.slice();
  const inputs:[ArrayLike<number>,ArrayLike<number>][]=[
    [good.subarray(0,3),history],[good,history.subarray(0,1)],
    [new Float32Array(good.length),history],[Float32Array.from(good,(n,i)=>i===0?NaN:n),history],
    [good,Float32Array.from(history,(_n,i)=>i===f.crease?Infinity:0)],
  ];
  for(const [positions,angles] of inputs){f.analyzer.measure(positions,angles);assert.equal(f.analyzer.evaluate(.5).status,'unavailable');}
  f.analyzer.measure(good,history);close(available(f.analyzer.evaluate(.5)).maxAbsoluteErrorDegrees,0);
});

test('invalid targets fail explicitly without corrupting subsequent measurements',()=>{
  const f=fixture();f.folded(0);
  for(const progress of [NaN,Infinity,-1.01,1.01])assert.equal(f.analyzer.evaluate(progress).status,'unavailable');
  for(const ranges of [[{edge:-1,fromAngle:0,toAngle:90}],[{edge:999,fromAngle:0,toAngle:90}],
    [{edge:6,fromAngle:NaN,toAngle:90}],[{edge:6,fromAngle:0,toAngle:90},{edge:6,fromAngle:0,toAngle:-90}]]){
    assert.equal(f.analyzer.evaluate(1,{ranges}).status,'unavailable');
  }
  close(available(f.analyzer.evaluate(.5)).meanAbsoluteErrorDegrees,90);
});

test('CPU angle readback is independent and leaves pose, target, velocity and step count unchanged',()=>{
  const f=fixture(),solver=new ReferenceSolver(f.model,{foldPercent:65,timeStepScale:.35,damping:.5});solver.step(900);
  const pose=solver.capturePose(),steps=solver.stepCount,velocity=solver.maxVelocity(),options=structuredClone(solver.options);
  const angles=new Float32Array(f.prepared.creaseParams.length+2).fill(123);
  assert.equal(solver.readCreaseAngles(angles),f.prepared.creaseParams.length);assert.equal(angles.at(-1),123);
  assert.deepEqual(Array.from(angles.subarray(0,-2)),pose.creaseAngles);
  const short=new Float32Array(1);assert.equal(solver.readCreaseAngles(short),1);assert.equal(short[0],angles[0]);
  f.analyzer.measure(f.model.positions,angles.subarray(0,-2));const result=available(f.analyzer.evaluate(.65));
  assert.ok(result.maxAbsoluteErrorDegrees<117,`actual error decreases from the initial 117 degrees: ${result.maxAbsoluteErrorDegrees}`);
  angles.fill(999);assert.deepEqual(solver.capturePose(),pose);assert.equal(solver.stepCount,steps);assert.equal(solver.maxVelocity(),velocity);assert.deepEqual(solver.options,options);
});
