import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationFoldLimitGuard} from '../../src/engine/simFoldLimit';
import {SimulationAngleAnalyzer} from '../../src/engine/simConvergence';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

function fixture(sign:number){
  const {prepared}=prepareSimulationDocument({vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
    edges_assignment:['B','B','B','B','B','B',sign<0?'M':'V'],
    edges_foldAngle:[0,0,0,0,0,0,sign*180],faces_vertices:[[0,1,4,5],[1,2,3,4]]});
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model),crease=prepared.creaseParams.findIndex(c=>c.edge===6);
  const pose=(degrees:number,history=degrees)=>{
    const next=solver.capturePose(),radians=degrees*Math.PI/180;
    for(let v=0;v<prepared.vertexCount;v++){
      const x=model.originalPositions[v*3];
      if(x>0){next.positions[v*3]=Math.fround(x*Math.cos(radians));next.positions[v*3+1]=Math.fround(x*Math.sin(radians));}
    }
    next.displacements=next.positions.map((value,i)=>Math.fround(value-model.originalPositions[i]));
    next.positions=next.displacements.map((value,i)=>Math.fround(model.originalPositions[i]+value));
    next.creaseAngles[crease]=history*Math.PI/180;
    return next;
  };
  return {prepared,solver,pose,crease};
}

for(const sign of [-1,1])test(`actual ${sign<0?'mountain':'valley'} overshoot stops at 180 despite lagged solver theta, and can unfold`,()=>{
  const {prepared,solver,pose,crease}=fixture(sign),guard=new SimulationFoldLimitGuard(prepared,solver);
  solver.restorePose(pose(sign*179));
  const before=solver.capturePose();let calls=0;
  // The real integrator calculates theta before updating positions, so its
  // stored angle can still say 179 while geometry has already crossed 180.
  solver.step=()=>{calls++;solver.restorePose(pose(sign*181,sign*179));};
  const stopped=guard.step(20);assert.equal(stopped.status,'limited');assert.equal(calls,1);
  const actual=solver.capturePose(),analyzer=new SimulationAngleAnalyzer(prepared);
  analyzer.measure(actual.positions,before.creaseAngles);assert(analyzer.withinFoldLimit());
  const result=analyzer.evaluate(1);assert.equal(result.status,'available');
  if(result.status==='available')assert(result.maxAbsoluteErrorDegrees<.001);
  assert(Math.abs(actual.creaseAngles[crease])<=Math.PI+1e-6);assert.equal(solver.maxVelocity(),0);
  solver.step=()=>solver.restorePose(pose(sign*170));
  assert.equal(guard.step(1).status,'clear');solver.dispose();
});

test('unlimited solver retains its original ability to pass 180 degrees',()=>{
  const {prepared,solver,pose}=fixture(1);solver.restorePose(pose(181));
  const saved=solver.capturePose(),analyzer=new SimulationAngleAnalyzer(prepared);
  analyzer.measure(saved.positions,saved.creaseAngles);assert.equal(analyzer.withinFoldLimit(),false);
  const guard=new SimulationFoldLimitGuard(prepared,solver);let calls=0;solver.step=()=>{calls++;};
  assert.equal(guard.step(1).status,'blocked');assert.equal(calls,0);solver.dispose();
});
