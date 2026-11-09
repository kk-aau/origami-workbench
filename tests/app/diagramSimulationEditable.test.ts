import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {prepareDiagramSimulationEditable,applyDiagramSimulationEditable} from '../../src/app/diagramSimulationEditable';
import {diagramSimulationGraph,diagramSimulationProgress} from '../../src/app/diagramSimulationGraph';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import type {SimulationPose} from '../../src/engine/simPose';
import {createDiagramProject,appendDiagramStep,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {defaultModelColors} from '../../src/app/modelColors';
import {reprojectDiagramSpatialPose,spatialFaceMatrix,validateDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {applyDiagramSpatialCamera} from '../../src/app/diagramSpatialCameraTransaction';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {applyDiagramFoldMatrix,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';
import {modelProjection} from '../../src/app/modelProjection';
import type {Doc,Point} from '../../src/core/types';
import {drawingSVG} from '../../src/app/diagramDrawing';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {buildDiagramFold} from '../../src/core/geometry';

function simulate(doc:Doc,percent=50){
 const source=diagramSimulationGraph(doc),prepared=prepareSimulationDocument(source).prepared,settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS,panelStiffness:.08};
 const solver=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:percent});solver.step(16000);
 const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:percent/100,settings,view:{yaw:.3,pitch:.2,zoom:1}};solver.dispose();return pose;
}
function fixture(){const doc=blankDoc('可编辑模拟下一步',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:180});return {doc,pose:simulate(doc)};}
const shown=(pose:DiagramPose,face:number,p:Point)=>modelProjection(pose.result.geometry.vertices,false,0).project(applyDiagramFoldMatrix(spatialFaceMatrix(pose.spatial!,face),p));

test('simulation creates normal material faces, supports CP drawing, orbit and save/reopen',()=>{
 const {doc,pose}=fixture(),project=createDiagramProject(doc),original=structuredClone(project),answer=prepareDiagramSimulationEditable(doc,pose);
 let next=applyDiagramSimulationEditable(project,project.activeStepId,answer,defaultModelColors()),step=next.steps[1],paper=step.pose!;
 assert.deepEqual(project,original);assert(paper.spatial);assert.equal(step.simulationSurface,undefined);assert.equal(step.foldLink?.enabled,true);assert.equal(paper.sourceStateId,step.beforeId);
 validateDiagramSpatialPose(paper,true);
 const source=next.states.find(s=>s.id===step.beforeId)!;
 assert.equal(diagramSimulationProgress(diagramSimulationGraph(source.doc)),.5);
 const graph=buildDiagramFold(paper.sourceDoc).graph,face=graph.faces_vertices!.findIndex(row=>row.some(v=>graph.vertices_coords[v][0]<25));assert(face>=0);
 // Face 0 is the left bank; its material point remains a selectable face after
 // perspective-free conversion into the ordinary drawing's coordinate frame.
 const point=shown(paper,face,[25,50]);assert(diagramFoldFacesAtPoint(paper,point,source).includes(face));
 const line={id:'editable-new-fold',kind:'line' as const,a:shown(paper,face,[10,20]),b:shown(paper,face,[40,20]),style:'valley' as const,color:'#243a30',width:.7,foldAngle:45,foldFaces:[face]};
 next=reconcileDiagramFoldAnnotations(next,step.id,[...(step.annotations??[]),line],{...step.foldLink!,layers:'selected',selectedFaces:[face]});
 const after=next.states.find(s=>s.id===step.afterId)!;assert(after.doc.segments.some(s=>s.assignment==='V'&&s.angle===45&&Math.abs(s.a[1]-20)<1e-5));
 const states=structuredClone(next.states),world=structuredClone(paper.spatial!.vertices);
 next=applyDiagramSpatialCamera(next,step.id,reprojectDiagramSpatialPose(next.steps[1].pose!,{yaw:35,elevation:25}));
 assert.deepEqual(next.states,states);assert.deepEqual(next.steps[1].pose!.spatial!.vertices,world);assert.notDeepEqual(next.steps[1].pose!.result.geometry.vertices,paper.result.geometry.vertices);
 next=importDiagramProject(exportDiagramProject(next));step=next.steps[1];validateDiagramSpatialPose(step.pose!,true);
 assert(step.annotations!.some(a=>a.id==='editable-new-fold'));assert.equal(step.foldLink?.enabled,true);
 const svg=drawingSVG(step.pose!,step.annotations??[],'','',undefined,[],true,defaultDiagramLineDefaults());assert(!svg.includes('data-diagram-simulation-surface'));assert(!svg.includes('data:image/png'));
});

test('an existing empty following step inherits corrected angles and is not duplicated',()=>{
 const {doc,pose}=fixture();let project=createDiagramProject(doc);project=appendDiagramStep(project);
 const answer=prepareDiagramSimulationEditable(doc,pose),next=applyDiagramSimulationEditable(project,project.steps[0].id,answer,defaultModelColors());
 assert.equal(next.steps.length,2);assert.equal(next.activeStepId,project.steps[1].id);
 assert.deepEqual(next.states[1].doc,next.states[2].doc);assert(next.steps[1].pose?.spatial);
});

test('stale source and corrupted simulation fail before changing the project',()=>{
 const {doc,pose}=fixture(),original=structuredClone(doc),changed=structuredClone(doc);changed.segments.find(s=>s.id==='hinge')!.angle=90;
 assert.throws(()=>prepareDiagramSimulationEditable(changed,pose),/来源 CP/);
 const bad=structuredClone(pose);bad.solver.positions[0]=NaN;assert.throws(()=>prepareDiagramSimulationEditable(doc,bad));assert.deepEqual(doc,original);
});

test('precreased six-ray vertex at 95 percent becomes a closed editable spatial pose',()=>{
 const doc=blankDoc('六射线预折',200,200),t=Math.tan(Math.PI/8)*200;
 doc.segments.push({id:'h',a:[0,100],b:[200,100],assignment:'M',angle:-180},{id:'v',a:[100,0],b:[100,200],assignment:'M',angle:-180},{id:'d',a:[200,0],b:[0,200],assignment:'V',angle:180});
 const marks:[[number,number],[number,number]][]=[[[0,0],[200,t]],[[0,0],[t,200]],[[200,0],[0,t]],[[200,0],[200-t,200]],[[200,200],[0,200-t]],[[200,200],[200-t,0]],[[0,200],[200,200-t]],[[0,200],[t,0]]];
 marks.forEach(([a,b],i)=>doc.segments.push({id:'pre'+i,a,b,assignment:'F',angle:0}));
 const pose=simulate(doc,95),answer=prepareDiagramSimulationEditable(doc,pose),project=createDiagramProject(doc),next=applyDiagramSimulationEditable(project,project.activeStepId,answer,defaultModelColors());
 assert(answer.closureVerified);assert.equal(answer.result.layers.status,'solved');assert(answer.maximumCorrection>.25);assert(next.steps[1].pose?.spatial);
 const reopened=importDiagramProject(exportDiagramProject(next));validateDiagramSpatialPose(reopened.steps[1].pose!,true);
});
