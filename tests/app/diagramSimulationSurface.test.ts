import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {diagramSimulationGraph} from '../../src/app/diagramSimulationAngles';
import {prepareDiagramSimulationSurface} from '../../src/app/diagramSimulationSurface';
import {createDiagramProject,applyDiagramSimulationSurface,appendDiagramStep,advanceDiagramStep,adoptDiagramPose,exportDiagramProject,importDiagramProject,updateDiagramSimulationSurfaceView,updateDiagramCP,duplicateDiagramStep,removeDiagramStep,selectDiagramStep,updateDiagramAnnotations,updateDiagramCanvas} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {SimulationMeshQuality} from '../../src/engine/simFlexibleMesh';
import type {SimulationPose} from '../../src/engine/simPose';

test('archived surfaces using the earlier expanded-mark mesh remain readable without converting their topology',()=>{
 const sourceDoc=blankDoc('旧版曲面',100,100);sourceDoc.segments.push({id:'v',a:[50,0],b:[50,100],assignment:'V',angle:90},{id:'old',a:[0,0],b:[100,100],assignment:'F',angle:0});
 const source=diagramSimulationGraph(sourceDoc,true),prepared=prepareSimulationDocument(source).prepared,solver=new ReferenceSolver(new OrigamiModel(prepared));
 const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:0,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};solver.dispose();
 const surface={version:1 as const,sourceStateId:'archive',sourceRevision:0,sourceDoc,pose,colors:{front:'#aac4a6',back:'#e2d5c1',line:'#34543f'}},saved=structuredClone(surface);
 assert.doesNotThrow(()=>prepareDiagramSimulationSurface(surface));assert.deepEqual(surface,saved);
 assert.throws(()=>prepareDiagramSimulationSurface({...surface,sourceDoc:{...sourceDoc,paper:{width:200,height:100},segments:sourceDoc.segments.map(s=>s.assignment==='V'?{...s,angle:80}:s)}}),/来源 CP/);
});

function fixture(mesh:SimulationMeshQuality='standard'){
  const doc=blankDoc('真实曲面',100,100);
  doc.segments.push({id:'up',a:[50,0],b:[50,50],assignment:'V',angle:90},{id:'down',a:[50,50],b:[50,100],assignment:'F',angle:0},
    {id:'left',a:[0,50],b:[50,50],assignment:'F',angle:0},{id:'right',a:[50,50],b:[100,50],assignment:'F',angle:0});
  let id=0;const ids=()=>`surface-${++id}`,project=createDiagramProject(doc,ids),source=diagramSimulationGraph(doc);
  const {prepared}=prepareSimulationDocument(source,{mesh}),settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS,panelStiffness:.01};
  const solver=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:65});solver.step(240);
  const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:.65,settings,mesh,view:{yaw:1.35,pitch:.7,zoom:1.2}};solver.dispose();
  return {project,pose,ids,doc,prepared};
}

for(const mesh of ['original','standard','fine'] as const)test(`${mesh} curved surface applies to the next drawing and roundtrips without rewriting CP angles`,()=>{
  const {project,pose,ids,prepared}=fixture(mesh),original=JSON.stringify(project),input=JSON.stringify(pose);
  const next=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids,colors:{front:'#aac4a6',back:'#e2d5c1',line:'#34543f'}});
  assert.equal(next.steps.length,2);assert.equal(next.states.length,3);assert.equal(next.activeStepId,next.steps[1].id);
  assert.deepEqual(next.steps[1].foldLink,{enabled:false,layers:'top',selectedFaces:[]});
  assert.equal(next.steps[1].beforeId,project.steps[0].afterId);assert.deepEqual(next.states.slice(0,2),project.states);
  const step=next.steps[1],surface=step.simulationSurface!;
  assert.equal(step.pose,null);assert.equal(step.paperStates,undefined);assert.equal(surface.sourceStateId,step.beforeId);
  assert.deepEqual(surface.pose.solver.positions,pose.solver.positions);assert.deepEqual(surface.pose.view,pose.view);
  assert.equal(surface.pose.mesh,mesh);assert.equal('result' in surface,false,'no fake layer result is attached');
  const render=prepareDiagramSimulationSurface(surface);assert.deepEqual(render.prepared.indices,prepared.indices);assert.deepEqual(render.positions,Float32Array.from(pose.solver.positions));
  const restored=importDiagramProject(exportDiagramProject(next));assert.equal(JSON.stringify(restored.steps[1].simulationSurface),JSON.stringify(surface));
  assert.deepEqual(restored.steps[1].simulationSurface!.pose.solver.positions,surface.pose.solver.positions);
  assert.equal(JSON.stringify(project),original);assert.equal(JSON.stringify(pose),input);
});

test('Next keeps an unchanged curve and applies view instructions once without changing its vertices',()=>{
  const {project,pose,ids}=fixture();let applied=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids});
  const current=applied.steps[1];
  applied=updateDiagramAnnotations(applied,current.id,[{id:'flip-view',kind:'symbol',symbol:'flip',position:[110,40],size:30,rotation:0,color:'#294435',width:.7}]);
  const next=advanceDiagramStep(applied,ids),surface=next.steps[2].simulationSurface!;
  assert.ok(surface);assert.deepEqual(surface.pose.solver.positions,pose.solver.positions);
  assert.equal(surface.pose.view.yaw,pose.view.yaw+Math.PI);assert.equal(surface.pose.view.pitch,-pose.view.pitch);
  assert.equal(surface.sourceStateId,next.steps[2].beforeId);
  assert.deepEqual(advanceDiagramStep(selectDiagramStep(next,current.id),ids).steps[2].simulationSurface,surface,'returning through Next does not accumulate a second flip');
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(next)));
});

test('a rotation instruction rolls only the next captured paper, leaving its canvas and symbols upright',()=>{
  const {project,pose,ids}=fixture();let p=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids});
  const current=p.steps[1];p=updateDiagramCanvas(p,current.id,{...current.canvas!,drawingRotation:90});
  p=updateDiagramAnnotations(p,current.id,[{id:'turn',kind:'symbol',symbol:'rotate',position:[110,40],size:30,rotation:0,turnAngle:45,color:'#294435',width:.7}]);
  p=advanceDiagramStep(p,ids);
  assert.equal(p.steps[2].canvas!.drawingRotation,undefined);
  assert.equal(p.steps[2].simulationSurface!.displayRotation,135);
  assert.deepEqual(p.steps[2].simulationSurface!.pose.solver.positions,pose.solver.positions);
  assert.equal(importDiagramProject(exportDiagramProject(p)).steps[2].simulationSurface!.displayRotation,135);
  p=advanceDiagramStep(p,ids);assert.equal(p.steps[3].simulationSurface!.displayRotation,135);
});

test('changed CP needs a newly captured curve instead of silently generating an old rigid fold',()=>{
  const {project,pose,ids}=fixture();const applied=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids}),step=applied.steps[1],doc=structuredClone(applied.states[2].doc);
  doc.segments.find(s=>s.id==='up')!.angle=80;
  const changed=updateDiagramCP(applied,step.afterId,doc);
  assert.throws(()=>advanceDiagramStep(changed,ids),/CP 已变化.*新的当前姿态/);
  assert.equal(changed.steps.length,2);assert.ok(changed.steps[1].simulationSurface);
});

test('applying to an existing next step replaces its geometry but preserves authored artwork and CP chain',()=>{
  const {project,pose,ids}=fixture();let next=appendDiagramStep(project,ids),target=next.steps[1];
  next=updateDiagramAnnotations(next,target.id,[{id:'user-line',kind:'line',a:[1,2],b:[20,30],style:'valley',color:'#293d35',width:.7,foldFaces:[0]},
    {id:'cp-existing:old:0',kind:'line',a:[0,0],b:[100,100],style:'crease',color:'#8d9b92',width:.45}]);
  const source=blankDoc('old flat drawing',100,100),state=next.states[0];next=updateDiagramCP(next,state.id,source);
  next=adoptDiagramPose(next,target.id,state.id,computeFlatGeometry(buildDiagramFold(source).graph,1e-6));
  const states=structuredClone(next.states),updated=applyDiagramSimulationSurface(next,next.steps[0].id,pose,{idFactory:ids});
  assert.equal(updated.steps.length,2);assert.deepEqual(updated.states,states);assert.equal(updated.steps[1].pose,null);
  assert.equal(updated.steps[1].annotations!.length,1);assert.equal(updated.steps[1].annotations![0].id,'user-line');
  assert.equal(updated.steps[1].annotations![0].kind==='line'?updated.steps[1].annotations![0].foldFaces:undefined,undefined);
});

test('rotation persists independently and changing CP keeps an explicitly stale surface snapshot',()=>{
  const {project,pose,ids}=fixture();const applied=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids}),step=applied.steps[1];
  const rotated=updateDiagramSimulationSurfaceView(applied,step.id,{yaw:-2.4,pitch:2.8,zoom:.8});
  assert.equal(rotated.steps[1].simulationSurface!.pose.solver,step.simulationSurface!.pose.solver);
  assert.deepEqual(applied.steps[1].simulationSurface!.pose.view,pose.view);
  const doc=structuredClone(applied.states[1].doc);doc.name='changed CP';
  const changed=updateDiagramCP(rotated,step.beforeId,doc),saved=importDiagramProject(exportDiagramProject(changed));
  assert.equal(saved.steps[1].simulationSurface!.sourceRevision,0);assert.equal(saved.states[1].revision,1);
  assert.deepEqual(saved.steps[1].simulationSurface!.pose.view,{yaw:-2.4,pitch:2.8,zoom:.8});
  assert.equal(selectDiagramStep(saved,saved.steps[0].id).steps[0].simulationSurface,undefined);
});

test('copy and removal preserve valid source identity while recomputing explicitly replaces a surface',()=>{
  const {project,pose,ids}=fixture();const applied=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids});
  const duplicated=duplicateDiagramStep(applied,applied.steps[1].id,ids);
  assert.deepEqual(duplicated.steps[2].simulationSurface,applied.steps[1].simulationSurface);
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(duplicated)));
  const removed=removeDiagramStep(applied,applied.steps[0].id);assert.ok(removed.steps[0].simulationSurface);assert.equal(removed.steps[0].simulationSurface!.sourceStateId,removed.states[0].id);
  const plain=blankDoc('replace',100,100),changed=updateDiagramCP(applied,applied.steps[1].beforeId,plain);
  const recomputed=adoptDiagramPose(changed,changed.steps[1].id,changed.steps[1].beforeId,computeFlatGeometry(buildDiagramFold(plain).graph,1e-6));
  assert.equal(recomputed.steps[1].simulationSurface,undefined);assert.ok(recomputed.steps[1].pose);
});

test('stale source, invalid coordinates and spoofed rigid results do not enter the project',()=>{
  const {project,pose,ids}=fixture(),changed=structuredClone(project.states[1].doc);changed.segments.find(s=>s.id==='up')!.angle=80;
  const stale=updateDiagramCP(project,project.steps[0].afterId,changed);
  assert.throws(()=>applyDiagramSimulationSurface(stale,stale.steps[0].id,pose,{idFactory:ids}),/来源 CP 不一致/);
  const invalid=structuredClone(pose);invalid.solver.positions[0]=NaN;
  assert.throws(()=>applyDiagramSimulationSurface(project,project.activeStepId,invalid,{idFactory:ids}),/无效|不一致/);
  const applied=applyDiagramSimulationSurface(project,project.activeStepId,pose,{idFactory:ids}),forged=structuredClone(applied);
  (forged.steps[1].simulationSurface as unknown as Record<string,unknown>).result={layers:{status:'solved'}};
  assert.throws(()=>importDiagramProject(JSON.stringify(forged)),/字段/);
  const model=new OrigamiModel(prepareSimulationDocument(pose.source,{mesh:pose.mesh}).prepared),solver=new ReferenceSolver(model,pose.settings);
  solver.setInitialPositions(new Float32Array(model.positions.length),model.prepared.creaseParams.map(()=>0));
  const collapsed={...pose,solver:solver.capturePose()};solver.dispose();
  assert.throws(()=>applyDiagramSimulationSurface(project,project.activeStepId,collapsed,{idFactory:ids}),/退化纸面/);
});
