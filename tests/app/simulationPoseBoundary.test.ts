import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSimulationPose,type SimulationPose} from '../../src/engine/simPose';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

function fixture():SimulationPose{
  const source={vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
    edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[null,null,null,null,null,null,-180],
    faces_vertices:[[0,1,4,5],[1,2,3,4]]};
  const model=new OrigamiModel(prepareSimulationDocument(source).prepared),settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS};
  const solver=new ReferenceSolver(model,{...settings,foldPercent:40});solver.step(180);
  solver.setVertexConstraint(0,[...model.positions.subarray(0,3)] as [number,number,number]);
  return {version:1,source,solver:solver.capturePose(),progress:.4,settings,view:{yaw:.7,pitch:-.4,zoom:1.2}};
}

test('persisted simulation pose validates its own CP, complete solver state, pins and view without aliasing input',()=>{
  const input=JSON.parse(JSON.stringify(fixture())) as SimulationPose,saved=structuredClone(input),validated=validateSimulationPose(input);
  assert.deepEqual(validated,input);
  validated.solver.positions[0]+=1;validated.solver.displacements[0]+=1;validated.solver.pins[0]!.position[0]+=1;
  validated.settings.damping=.2;validated.view.zoom=2;
  (validated.source as {vertices_coords:number[][]}).vertices_coords[0]![0]=3;
  assert.deepEqual(input,saved,'all nested persisted arrays and settings must be independent copies');
});

test('same-sized source CP with a different crease target or paper scale cannot borrow another pose signature',()=>{
  for(const change of ['angle','scale']as const){
    const pose=fixture(),source=pose.source as {vertices_coords:number[][];edges_foldAngle:Array<number|null>};
    if(change==='angle')source.edges_foldAngle[6]=-90;
    else source.vertices_coords=source.vertices_coords.map(point=>point.map(value=>value*2));
    assert.throws(()=>validateSimulationPose(pose),/不一致/);
  }
});

test('persistent pose boundary rejects invalid settings, camera, dimensions, finite mismatches and pin integrators',()=>{
  const pose=fixture();
  const bad:unknown[]=[null,[],{...pose,version:2},{...pose,extra:true},
    {...pose,progress:NaN},{...pose,progress:1.01},{...pose,progress:'0.4'},
    {...pose,settings:{...pose.settings,integrationType:'verlet'}},
    {...pose,settings:{...pose.settings,damping:0}},
    {...pose,view:{...pose.view,zoom:0}},{...pose,view:{...pose.view,yaw:Infinity}},
    {...pose,view:{...pose.view,extra:0}},
    {...pose,solver:{...pose.solver,positions:pose.solver.positions.slice(3),displacements:pose.solver.displacements.slice(3),pins:[]}},
    {...pose,solver:{...pose.solver,creaseAngles:[...pose.solver.creaseAngles,0]}},
    {...pose,solver:{...pose.solver,displacements:[pose.solver.displacements[0]!+.1,...pose.solver.displacements.slice(1)]}},
  ];
  for(const value of bad)assert.throws(()=>validateSimulationPose(value));
  const negative={...pose,progress:-.5};assert.equal(validateSimulationPose(negative).progress,-.5,'valid reverse folding is retained');
});

test('a source-free or malformed imported pose cannot reach geometry preparation as a valid saved model',()=>{
  const pose=fixture(),before=structuredClone(pose);
  for(const source of [null,{},[],{vertices_coords:[[0,0]],edges_vertices:[],faces_vertices:[]}]){
    assert.throws(()=>validateSimulationPose({...pose,source}));
  }
  assert.deepEqual(pose,before);
});
