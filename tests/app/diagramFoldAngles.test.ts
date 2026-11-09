import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold} from '../../src/core/geometry';
import {createDiagramProject,adoptDiagramPose,updateDiagramCP,updateDiagramPaperPose,updateDiagramPoseResult,updateDiagramFoldLink,exportDiagramProject,importDiagramProject,advanceDiagramStep} from '../../src/app/diagramProject';
import {moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {validateDiagramAnnotations,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {reconcileDiagramFoldAnnotations,updateDiagramFoldDrawingFromCP} from '../../src/app/diagramFoldTransactions';
import {mapDiagramFoldLines} from '../../src/app/diagramFoldLink';
import {editDiagramCPEdge,diagramCPEdgeSegment,diagramCPEdgeFoldAngle,findDiagramCPEdge} from '../../src/app/diagramCPEdgeEdit';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
const line:DiagramLineAnnotation={id:'quarter-fold',kind:'line',a:[50,0],b:[50,100],style:'valley',color:'#234532',width:.7,foldAngle:90};
function fixture(){const doc=blankDoc('实际折角',100,100);let id=0;let p=createDiagramProject(doc,()=>`angle-${++id}`);p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,computeFlatFold(doc));return updateDiagramFoldLink(p,p.activeStepId,settings);}
test('drawing angle is validated independently from the line direction and style',()=>{
 for(const angle of [0,22.5,90,180,null])assert.doesNotThrow(()=>validateDiagramAnnotations([{...line,foldAngle:angle}]));
 for(const angle of [-1,181,NaN,Infinity])assert.throws(()=>validateDiagramAnnotations([{...line,foldAngle:angle}]),/折叠角度/);
 assert.throws(()=>validateDiagramAnnotations([{...line,style:'boundary'}]),/折叠角度/);
});
test('adaptive drawing remains null through CP synchronization, refresh and reopening',()=>{
 const original=fixture(),next=reconcileDiagramFoldAnnotations(original,original.activeStepId,[{...line,foldAngle:null}]);
 assert.equal(next.states[1].doc.segments.find(s=>s.assignment==='V')?.angle,null);
 const loaded=importDiagramProject(exportDiagramProject(updateDiagramFoldDrawingFromCP(next,next.activeStepId)));
 assert(loaded.steps[0].annotations?.some(a=>a.kind==='line'&&a.foldAngle===null));
 assert.equal(diagramCPEdgeFoldAngle(loaded,loaded.activeStepId,loaded.states[1].id,findDiagramCPEdge(loaded.states[1],line)),null);
});
test('90-degree drawing changes only after CP and retains angle across CP refresh and save',()=>{
 const original=fixture(),next=reconcileDiagramFoldAnnotations(original,original.activeStepId,[line]);
 assert.deepEqual(next.states[0],original.states[0]);assert.deepEqual(next.steps[0].pose,original.steps[0].pose);
 assert.equal(next.states[1].doc.segments.find(s=>s.assignment==='V')?.angle,90);
 const refreshed=updateDiagramFoldDrawingFromCP(next,next.activeStepId),loaded=importDiagramProject(exportDiagramProject(refreshed));
 assert.ok(loaded.steps[0].annotations?.some(a=>a.kind==='line'&&a.foldAngle===90));
 assert.equal(loaded.states[1].doc.segments.find(s=>s.assignment==='V')?.angle,90);
 assert.equal(diagramCPEdgeFoldAngle(loaded,loaded.activeStepId,loaded.states[1].id,findDiagramCPEdge(loaded.states[1],line)),90);
 const inherited=advanceDiagramStep(loaded),s=inherited.steps.at(-1)!,cp=inherited.states.find(cp=>cp.id===s.beforeId)!;
 assert.equal(diagramCPEdgeFoldAngle(inherited,s.id,cp.id,findDiagramCPEdge(cp,line)),90);
});
test('viewed mountain direction retains the chosen magnitude',()=>{
 const p=fixture(),mapped=mapDiagramFoldLines(p.steps[0].pose!,[{...line,style:'mountain',foldAngle:45}],settings,p.states[0]);
 assert.ok(mapped.segments.length);assert.ok(mapped.segments.every(s=>s.assignment==='M'&&s.angle===-45));
});
test('CP explicit angle editing and mountain conversion preserve angle and the before state',()=>{
 const p=reconcileDiagramFoldAnnotations(fixture(),fixture().activeStepId,[line]),state=p.states[1],index=findDiagramCPEdge(state,line);
 const mountain=editDiagramCPEdge(p,p.activeStepId,state.id,index,'M','fold',60);
 assert.deepEqual(mountain.states[0],p.states[0]);
 const edge=diagramCPEdgeSegment(mountain.states[1],findDiagramCPEdge(mountain.states[1],line));assert.equal(edge.angle,-60);
 const valley=editDiagramCPEdge(mountain,mountain.activeStepId,state.id,findDiagramCPEdge(mountain.states[1],line),'V');
 assert.equal(diagramCPEdgeSegment(valley.states[1],findDiagramCPEdge(valley.states[1],line)).angle,60);
});
test('an explicitly unknown CP angle is not silently read as 180',()=>{
 const p=fixture();p.states[0].doc.segments.push({id:'unknown',a:[50,0],b:[50,100],assignment:'V',angle:null});
 const g=buildDiagramFold(p.states[0].doc).graph,index=g.edges_assignment.indexOf('V');assert.equal(diagramCPEdgeSegment(p.states[0],index).angle,null);
});
test('next-step 90-degree pose has real height and round-trips the true 3D state',()=>{
 let p=fixture();p=reconcileDiagramFoldAnnotations(p,p.activeStepId,[line]);p=advanceDiagramStep(p);
 const step=p.steps.at(-1)!,source=p.states.find(s=>s.id===step.beforeId)!;
 const answer=createDiagramSpatialPose(source.doc);
 assert.ok(answer.spatial.vertices.some(v=>Math.abs(v[2])>10));
 const graph=buildDiagramFold(source.doc).graph;assert.ok(answer.spatial.measuredAngles.some((v,e)=>graph.edges_assignment[e]==='V'&&Math.abs(v!-90)<1e-5));
 p=adoptDiagramPose(p,step.id,source.id,answer.result,undefined,answer.spatial);
 const loaded=importDiagramProject(exportDiagramProject(p));assert.deepEqual(loaded.steps.at(-1)!.pose!.spatial,p.steps.at(-1)!.pose!.spatial);
 assert.equal(loaded.steps.at(-1)!.pose!.result.layers.status,'solved');
});
test('precrease carries its 90-degree excursion while leaving the endpoint unfolded',()=>{
 const p=fixture(),next=reconcileDiagramFoldAnnotations(p,p.activeStepId,[{...line,foldAction:'precrease'}]);
 assert.ok(next.states[1].doc.segments.some(s=>s.assignment==='F'&&s.angle===0));
 assert.ok(next.steps[0].foldLink?.precreases?.some(s=>s.angle===90));
 assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(next)));
 const index=findDiagramCPEdge(next.states[1],line);
 assert.equal(diagramCPEdgeFoldAngle(next,next.activeStepId,next.states[1].id,index),90);
 const changed=editDiagramCPEdge(next,next.activeStepId,next.states[1].id,index,'M','precrease');
 assert.equal(diagramCPEdgeFoldAngle(changed,changed.activeStepId,changed.states[1].id,index),90);
 assert.ok(changed.steps[0].foldLink?.precreases?.some(s=>s.angle===-90));
});

test('spatial paper illustration edits archive and restore the exact physical pose',()=>{
 const doc=blankDoc('空间纸角',100,100);doc.segments.push({...line,assignment:'V',angle:90});
 let p=createDiagramProject(doc),step=p.steps[0],answer=createDiagramSpatialPose(doc);
 p=adoptDiagramPose(p,step.id,step.beforeId,answer.result,undefined,answer.spatial);
 const previous=p.steps[0].pose!,start=previous.result.geometry.vertices[0];
 const moved=moveDiagramPaperVertices(previous,{group:[0],selected:[0]},[start[0]+4,start[1]+3]);
 assert.equal(moved.spatial,undefined);
 p=recordDiagramPaperPull(updateDiagramPaperPose(p,step.id,moved),step.id,previous,[]);
 assert.equal(p.steps[0].paperStates?.active,'pulled');
 p=importDiagramProject(exportDiagramProject(p));
 assert.equal(p.steps[0].pose!.spatial,undefined);
 p=switchDiagramPaperState(p,step.id,'spatial');
 assert.deepEqual(p.steps[0].pose!.spatial,previous.spatial);
 assert.deepEqual(p.steps[0].pose!.result.geometry.vertices,previous.result.geometry.vertices);
 // Reanalysis atomically binds new projected coordinates to the new 3D data.
 answer=createDiagramSpatialPose(doc,0,undefined,previous,{yaw:15,elevation:30});
 p=updateDiagramPoseResult(p,step.id,answer.result,answer.spatial);
 assert.deepEqual(p.steps[0].pose!.spatial,answer.spatial);
});

test('later spatial contact history survives an illustration pull in the previous step',()=>{
 const original=blankDoc('空间连续步骤',90,90);original.segments.push({id:'left',a:[30,0],b:[30,90],assignment:'V',angle:180},{id:'right',a:[60,0],b:[60,90],assignment:'M',angle:-180});
 let p=createDiagramProject(original);p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,computeFlatFold(original,undefined,{flatCreases:'marks'}));
 p=advanceDiagramStep(p);const second=p.steps[1],partial=structuredClone(original);partial.segments.find(s=>s.id==='right')!.angle=-45;
 p=updateDiagramCP(p,second.beforeId,partial);p=updateDiagramCP(p,second.afterId,partial);
 let answer=createDiagramSpatialPose(partial,0,undefined,p.steps[0].pose!);p=adoptDiagramPose(p,second.id,second.beforeId,answer.result,undefined,answer.spatial);
 p=advanceDiagramStep(p);const third=p.steps[2];answer=createDiagramSpatialPose(partial,0,undefined,p.steps[1].pose!);p=adoptDiagramPose(p,third.id,third.beforeId,answer.result,undefined,answer.spatial);
 const physical=p.steps[1].pose!,start=physical.result.geometry.vertices[0],pulled=moveDiagramPaperVertices(physical,{group:[0],selected:[0]},[start[0]+3,start[1]+2]);
 p=recordDiagramPaperPull(updateDiagramPaperPose(p,second.id,pulled),second.id,physical,[]);
 const loaded=importDiagramProject(exportDiagramProject(p));
 assert.equal(loaded.steps[1].paperStates?.active,'pulled');
 assert.equal(loaded.steps[2].pose!.result.layers.status,'solved');
 assert.deepEqual(loaded.steps[2].pose!.spatial,p.steps[2].pose!.spatial);
});
