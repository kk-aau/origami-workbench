import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {diagramSimulationGraph,applyDiagramSimulationAngles} from '../../src/app/diagramSimulationAngles';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {diagramSimulationProgress} from '../../src/app/diagramSimulationGraph';
import type {SimulationPose} from '../../src/engine/simPose';

function fixture(){
 const doc=blankDoc('模拟进度折角',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const source=diagramSimulationGraph(doc),prepared=prepareSimulationDocument(source).prepared;
 const solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:50});solver.step(1600);
 const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:.5,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};solver.dispose();return {doc,pose,prepared};
}
test('simulation applies actual dihedrals and leaves the source immutable',()=>{
 const {doc,pose,prepared}=fixture(),original=structuredClone(doc),answer=applyDiagramSimulationAngles(doc,pose);
 const index=prepared.creaseParams.findIndex(c=>prepared.edgesAssignment[c.edge]==='V'),actual=pose.solver.creaseAngles[index]*180/Math.PI;
 const angle=answer.doc.segments.find(s=>s.assignment==='V')!.angle!;
 assert(angle>1&&angle<180);assert(Math.abs(angle-actual)<.05,`${angle} != ${actual}`);assert.equal(answer.progress,.5);assert.deepEqual(doc,original);
 // An altered slider label cannot replace measured geometry with target × progress.
 const changed=applyDiagramSimulationAngles(doc,{...pose,progress:.1});assert.equal(changed.doc.segments.find(s=>s.assignment==='V')!.angle,angle);
});
test('stale CP and wrong mountain/valley branches are rejected atomically',()=>{
 const {doc,pose}=fixture();assert.throws(()=>applyDiagramSimulationAngles({...doc,name:'changed'},pose),/来源 CP/);
 const reversed=structuredClone(pose);for(let v=0;v<reversed.solver.positions.length;v+=3){reversed.solver.positions[v+1]*=-1;reversed.solver.displacements[v+1]*=-1;}
 assert.throws(()=>applyDiagramSimulationAngles(doc,reversed),error=>error instanceof Error&&/模拟谷折.*实际呈山折.*方向冲突/.test(error.message)&&!/越过/.test(error.message));
});

test('expanded corner bisectors do not become bending hinges or prevent applying 90-plus percent',()=>{
 const doc=blankDoc('提前预折的角平分线',100,100);doc.segments.push({id:'h',a:[0,50],b:[100,50],assignment:'M',angle:-180},{id:'v',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'d',a:[0,0],b:[100,100],assignment:'V',angle:180});
 const marked=structuredClone(doc),t=Math.tan(Math.PI/8)*100;
 for(const [i,[a,b]] of ([[[0,0],[100,t]],[[0,0],[t,100]],[[100,0],[0,t]],[[100,0],[100-t,100]],[[100,100],[0,100-t]],[[100,100],[100-t,0]],[[0,100],[100,100-t]],[[0,100],[t,0]]] as [number[],number[]][]).entries())marked.segments.push({id:'f'+i,a:[a[0],a[1]],b:[b[0],b[1]],assignment:'F',angle:0});
 const original=structuredClone(marked),source=diagramSimulationGraph(marked);
 assert.deepEqual(source,diagramSimulationGraph(doc),'inactive scoring cannot change the simulated mechanism');
 const length=(d:typeof doc)=>d.segments.filter(s=>s.assignment==='F').reduce((sum,s)=>sum+Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1]),0);
 for(const progress of [.9,.93,.97]){
  const prepared=prepareSimulationDocument(source).prepared,settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS,panelStiffness:.08};
  const solver=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:progress*100});solver.step(20000);
  const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress,settings,view:{yaw:0,pitch:0,zoom:1}};solver.dispose();
  const answer=applyDiagramSimulationAngles(marked,pose);assert(answer.maximumCorrection<=.25);
  assert(Math.abs(length(answer.doc)-length(marked))<1e-5,'all precrease routes remain in the saved CP');
  const reopened=diagramSimulationGraph(JSON.parse(JSON.stringify(answer.doc)));assert.equal(diagramSimulationProgress(reopened),progress);
  reopened.edges_assignment.forEach((kind,e)=>{if(kind==='M'||kind==='V')assert.equal(reopened.edges_foldAngle[e],kind==='M'?-180:180,'full target survives crease daughters at old mark intersections');});
 }
 assert.deepEqual(marked,original);
});

test('applying 93 percent retains the full target across file reopen and subsequent applications',()=>{
 const {doc}=fixture();
 const simulate=(source:ReturnType<typeof diagramSimulationGraph>,percent:number)=>{
  const prepared=prepareSimulationDocument(source).prepared;
  const solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:percent});solver.step(1600);
  const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:percent/100,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};solver.dispose();return pose;
 };
 const first=diagramSimulationGraph(doc),answer=applyDiagramSimulationAngles(doc,simulate(first,93));
 const reopened=JSON.parse(JSON.stringify(answer.doc)),continued=diagramSimulationGraph(reopened);
 assert.deepEqual(continued.edges_foldAngle,first.edges_foldAngle);assert.equal(diagramSimulationProgress(continued),.93);
 const later=applyDiagramSimulationAngles(reopened,simulate(continued,99));
 assert(later.doc.segments.find(s=>s.assignment==='V')!.angle!>answer.doc.segments.find(s=>s.assignment==='V')!.angle!);
 const again=diagramSimulationGraph(JSON.parse(JSON.stringify(later.doc)));
 assert.deepEqual(again.edges_foldAngle,first.edges_foldAngle);assert.equal(diagramSimulationProgress(again),.99);
 // Explicit angle edits start a new target; a stored simulator target cannot override them.
 reopened.segments.find((s:any)=>s.assignment==='V').angle=90;
 const edited=diagramSimulationGraph(reopened);assert.equal(diagramSimulationProgress(edited),0);assert(edited.edges_foldAngle.includes(90));
});

test('same-direction overshoot is capped at flat folding after closure validation without changing the source',()=>{
 for(const kind of ['M','V'] as const){
  const doc=blankDoc('压平位置越界',100,100),angle=kind==='M'?-181:181;
  doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:kind,angle:kind==='M'?-180:180});
  const source=diagramSimulationGraph(doc),prepared=prepareSimulationDocument(source).prepared;
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{...DEFAULT_SIMULATION_SOLVER_SETTINGS});
  const snapshot=solver.capturePose();solver.dispose();
  const radians=angle*Math.PI/180,hinge=prepared.creaseParams.findIndex(c=>prepared.edgesAssignment[c.edge]===kind);
  const fixedX=model.originalPositions[prepared.edgesVertices[prepared.creaseParams[hinge].edge][0]*3];
  prepared.fold.vertices_coords.forEach(([sourceX],v)=>{
   const [x,y,z]=Array.from(model.originalPositions.slice(v*3,v*3+3));
   const position=sourceX>50?[fixedX+(x-fixedX)*Math.cos(radians),y+(x-fixedX)*Math.sin(radians),z]:[x,y,z];
   position.forEach((value,axis)=>{const i=v*3+axis;snapshot.displacements[i]=Math.fround(value-model.originalPositions[i]);snapshot.positions[i]=Math.fround(model.originalPositions[i]+snapshot.displacements[i]);});
  });
  snapshot.creaseAngles[hinge]=radians;
  const pose:SimulationPose={version:1,source,solver:snapshot,progress:.96,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};
  const beforeDoc=structuredClone(doc),beforePose=structuredClone(pose);
  const answer=applyDiagramSimulationAngles(doc,pose);
  assert.equal(answer.doc.segments.find(s=>s.assignment===kind)!.angle,kind==='M'?-180:180);
  assert.equal(answer.cappedCreases,1);assert(Math.abs(answer.maxOverfold-1)<1e-4);assert.equal(answer.maximumCorrection,0);
  assert.deepEqual(doc,beforeDoc);assert.deepEqual(pose,beforePose);
  // A contradictory/stale winding must not turn a genuinely reversed mesh
  // into an accepted overshoot; geometry still rejects the direction.
  snapshot.creaseAngles[hinge]=0;
  assert.throws(()=>applyDiagramSimulationAngles(doc,pose),error=>error instanceof Error&&/实际呈.*方向冲突/.test(error.message)&&!/越过/.test(error.message));
 }
});

test('an unclosed simulated vertex is rejected inside the correction range without mutating source or pose',()=>{
 const doc=blankDoc('不相容四折痕',100,100);
 doc.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'M',angle:-180},{id:'vertical',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const source=diagramSimulationGraph(doc),prepared=prepareSimulationDocument(source).prepared;
 const solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:50});solver.step(1600);
 const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:.5,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};solver.dispose();
 const beforeDoc=structuredClone(doc),beforePose=structuredClone(pose);
 assert.throws(()=>applyDiagramSimulationAngles(doc,pose),/0\.25°.*未找到/);
 const unchecked=applyDiagramSimulationAngles(doc,pose,{strictClosure:false});
 assert.equal(unchecked.closureVerified,false);assert.equal(unchecked.maximumCorrection,0);
 assert.deepEqual(unchecked.doc.metadata?.diagramSimulationClosure,{verified:false,progress:.5});
 assert(unchecked.doc.segments.some(s=>s.assignment==='M'&&s.angle!==-180));
 const startDoc=blankDoc('未校验折角工程',100,100);let p=createDiagramProject(startDoc),step=p.steps[0];
 p=adoptDiagramPose(p,step.id,step.beforeId,computeFlatFold(startDoc));
 p=updateDiagramFoldLink(p,step.id,{enabled:true,layers:'all',selectedFaces:[],fixed:{point:[75,75],matrix:[1,0,0,1,0,0]}});
 const applied=applyDiagramSimulationFoldAngles(p,step.id,unchecked.doc);
 assert.deepEqual(applied.states.find(s=>s.id===step.afterId)!.doc.metadata?.diagramSimulationClosure,{verified:false,progress:.5},'the normal application transaction retains the unchecked marker');
 const reopened=importDiagramProject(exportDiagramProject(applied));assert.deepEqual(reopened.states.find(s=>s.id===step.afterId)!.doc.metadata?.diagramSimulationClosure,{verified:false,progress:.5});
 assert.deepEqual(doc,beforeDoc);assert.deepEqual(pose,beforePose);
});

test('disabled closure still rejects stale sources and incompatible direction; enabling it reports a verified result',()=>{
 const {doc,pose}=fixture();
 assert.throws(()=>applyDiagramSimulationAngles({...doc,name:'changed'},pose,{strictClosure:false}),/来源 CP/);
 const reversed=structuredClone(pose);for(let v=0;v<reversed.solver.positions.length;v+=3){reversed.solver.positions[v+1]*=-1;reversed.solver.displacements[v+1]*=-1;}
 assert.throws(()=>applyDiagramSimulationAngles(doc,reversed,{strictClosure:false}),/方向冲突/);
 const answer=applyDiagramSimulationAngles(doc,pose,{strictClosure:true});assert.equal(answer.closureVerified,true);assert.deepEqual(answer.doc.metadata?.diagramSimulationClosure,{verified:true,progress:.5});
});

test('capping overfold cannot publish angles that fail whole-paper loop closure',()=>{
 const doc=blankDoc('三折痕闭环',100,100);
 for(const [id,b] of [['a',[0,0]],['b',[100,0]],['c',[50,100]]] as const)doc.segments.push({id,a:[50,50],b:[...b],assignment:'V',angle:180});
 const source=diagramSimulationGraph(doc),prepared=prepareSimulationDocument(source).prepared;
 const solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS});
 const snapshot=solver.capturePose();solver.dispose();
 // A full turn has the same local normals as a flat crease. Each edge's
 // winding is valid locally, but capping all three at 180° cannot close this
 // vertex. No uncapped hinge remains for the adaptive solver to repair.
 prepared.creaseParams.forEach((c,i)=>{if(prepared.edgesAssignment[c.edge]==='V')snapshot.creaseAngles[i]=Math.PI*2;});
 const pose:SimulationPose={version:1,source,solver:snapshot,progress:1,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};
 const beforeDoc=structuredClone(doc),beforePose=structuredClone(pose);
 assert.throws(()=>applyDiagramSimulationAngles(doc,pose),/3 条过折折痕已按 180° 处理.*未通过纸面闭合验证/);
 assert.deepEqual(doc,beforeDoc);assert.deepEqual(pose,beforePose);
});


import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink,updateDiagramPaperPose,advanceDiagramStep,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {applyDiagramSimulationFoldAngles,adoptDiagramFoldCP,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {diagramFoldStartingFace} from '../../src/app/diagramFoldLink';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';

test('measured angles update target creases while keeping the start paper and fixed animation region',()=>{
 const {doc,pose}=fixture(),before=blankDoc('模拟进度折角',100,100);
 let p=createDiagramProject(before),id=p.activeStepId;p=adoptDiagramPose(p,id,p.states[0].id,computeFlatFold(before));
 p=updateDiagramFoldLink(p,id,{enabled:true,layers:'all',selectedFaces:[],fixed:{point:[75,50],matrix:[1,0,0,1,0,0]}});
 p=adoptDiagramFoldCP(p,id,doc);const original=structuredClone(p),measured=applyDiagramSimulationAngles(doc,pose);
 const next=applyDiagramSimulationFoldAngles(p,id,measured.doc),step=next.steps[0];
 const savedAfter=next.states.find(s=>s.id===step.afterId)!.doc;
 assert.equal(diagramSimulationProgress(diagramSimulationGraph(JSON.parse(JSON.stringify(savedAfter)))),pose.progress,'linked CP adoption must retain continuation progress');
 assert.deepEqual(step.pose,original.steps[0].pose);assert.deepEqual(next.states[0],original.states[0]);
 assert.deepEqual(step.foldLink!.fixed,original.steps[0].foldLink!.fixed);assert.equal(next.steps.length,1);
 assert(step.annotations!.some(a=>a.kind==='line'&&a.foldAngle!==undefined&&Math.abs(a.foldAngle!-measured.doc.segments.find(s=>s.assignment==='V')!.angle!)<1e-7));
 const advanced=advanceDiagramStep(next);assert.equal(advanced.steps.length,2);assert.equal(advanced.steps[1].beforeId,step.afterId);
 assert.deepEqual(p,original);
 const target=advanced.steps[1],source=advanced.states.find(s=>s.id===target.beforeId)!,fixed=step.foldLink!.fixed!;
 const folded=createDiagramSpatialPose(source.doc,diagramFoldStartingFace(source.doc,fixed),fixed,step.pose!);
 const result=refreshDiagramFoldDrawing(adoptDiagramPose(advanced,target.id,target.beforeId,folded.result,undefined,folded.spatial),target.id);
 assert(!result.steps[1].annotations!.some(a=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain')),'previous-step mountain/valley instructions must not remain on the folded result');
 assert(result.states.find(s=>s.id===target.beforeId)!.doc.segments.some(s=>s.assignment==='V'&&s.angle!==0),'physical crease types and angles remain available for calculation');
 // A screen-only pull and return must not erase the chosen right-hand material region.
 const paper=step.pose!,v=paper.result.geometry.vertices[0];
 let drawing=recordDiagramPaperPull(updateDiagramPaperPose(next,id,moveDiagramPaperVertices(paper,{group:[0],selected:[0]},[v[0]+8,v[1]+6])),id,paper,step.annotations);
 drawing=switchDiagramPaperState(drawing,id,'flat');assert.deepEqual(drawing.steps[0].foldLink!.fixed,step.foldLink!.fixed);
 const clip=buildDiagramStepAnimation(drawing,id),{prepared}=prepareSimulationDocument(clip.fold);
 assert(clip.animation.fixedVertices.every(v=>prepared.fold.vertices_coords[v][0]>=50-1e-7));
 const planned=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'});
 assert(planned.animation.motion);const path=createSimulationStepPathEvaluator(prepared,planned.animation,planned.animation.motion!);
 for(const progress of [0,.25,.5,.75,1]){const positions=path.evaluate(progress);for(const v of clip.animation.fixedVertices)for(let axis=0;axis<3;axis++)assert(Math.abs(positions[v*3+axis]-clip.animation.initialPositions[v*3+axis])<1e-7);}
});
