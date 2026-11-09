import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView,validateModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink,updateDiagramCP,advanceDiagramStep,getDiagramStepInitialView,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {pickDiagramFoldAnchor,diagramFoldStartingFace,alignDiagramFoldResult,applyDiagramFoldMatrix} from '../../src/app/diagramFoldLink';
import {fixedDiagramCPSelection,mapDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {diagramPresentation} from '../../src/app/diagramDrawing';
import type {Point} from '../../src/core/types';

const near=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,`${a} != ${b}`);
for(const side of ['front','back'] as const)for(const rotation of [0,73,180])for(const viaList of [false,true])for(const cp of [[20,75],[80,75]] as Point[]){
  test(`fixed material retains displayed coordinates after next fold: ${side}, ${rotation}, list=${viaList}, CP=${cp}`,()=>{
    const doc=blankDoc('翻面固定纸层',100,100),result=computeFlatFold(doc);let serial=0;
    const ids=()=>`fixed-view-${++serial}`;let project=createDiagramProject(doc,ids),step=project.steps[0];
    project=adoptDiagramPose(project,step.id,step.beforeId,result,{...defaultModelView(),side,rotation});
    const pose=project.steps[0].pose!,original=structuredClone(project),after=structuredClone(doc);
    after.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
    const screen=modelProjection(result.geometry.vertices,side==='back',rotation).project(cp);
    const fixed=viaList?fixedDiagramCPSelection(pose,project.states[0],{kind:'face',index:0},0,after,cp,project.states[0]):pickDiagramFoldAnchor(pose,screen,0);
    near(fixed.point,cp);
    project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],fixed});
    assert.deepEqual(project.steps[0].pose!.view!.projectionCenter,[50,50]);
    assert.deepEqual(project.steps[0].pose!.result,result,'fixing changes no physical geometry');
    assert.deepEqual(pose,original.steps[0].pose,'input pose stays immutable');
    project=updateDiagramCP(project,step.afterId,after);
    project=advanceDiagramStep(project,ids);step=project.steps.at(-1)!;
    const view=getDiagramStepInitialView(project,step.id),aligned=alignDiagramFoldResult(after,computeFlatFold(after,undefined,{startingFace:diagramFoldStartingFace(after,fixed)}),fixed);
    project=adoptDiagramPose(project,step.id,step.beforeId,aligned,view);
    const next=project.steps.at(-1)!.pose!,projection=modelProjection(aligned.geometry.vertices,side==='back',rotation,next.view?.projectionCenter);
    near(projection.project(applyDiagramFoldMatrix(fixed.matrix,cp)),screen);
    const nextFace=diagramFoldStartingFace(after,fixed),shown=diagramPresentation(next);
    for(const vertex of aligned.geometry.faces[nextFace]){
      const material=aligned.geometry.graph!.vertices_coords[vertex];
      near(shown.vertices[vertex],projection.project(material));
    }
    const mapped=mapDiagramCPSelection(next,project.states.find(s=>s.id===step.beforeId)!,{kind:'face',index:nextFace});
    for(const p of mapped.polygons.flat())assert.ok(shown.vertices.some(v=>Math.hypot(p[0]-v[0],p[1]-v[1])<1e-7));
    const restored=importDiagramProject(exportDiagramProject(project));
    assert.deepEqual(diagramPresentation(restored.steps.at(-1)!.pose!).vertices,shown.vertices,'save/reopen keeps the same view frame');
  });
}

test('saved projection centers reject corrupt coordinates; legacy views remain valid',()=>{
  assert.doesNotThrow(()=>validateModelView(defaultModelView()));
  for(const projectionCenter of [[0], [0,0,0], [NaN,0], [Infinity,0], ['0',0], [1e10,0]])assert.throws(()=>validateModelView({...defaultModelView(),projectionCenter}),/中心/);
});
