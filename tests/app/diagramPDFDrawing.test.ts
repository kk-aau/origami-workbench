import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramCP,updateDiagramHiddenFaces} from '../../src/app/diagramProject';
import {diagramPDFCoverSVG,diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {defaultModelView} from '../../src/app/modelViewState';

function fixture(){
  const doc=blankDoc('完成效果与步骤示意',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(doc),stepId=project.activeStepId;
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready');
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,{...defaultModelView(),colors:{front:'#fee9c7',back:'#bbd2aa',line:'#435752'}});
  project=updateDiagramAnnotations(project,stepId,[
    {id:'instruction-arrow',kind:'symbol',symbol:'fold',position:[25,30],size:20,rotation:0,color:'#e11123',width:1},
    {id:'instruction-line',kind:'line',a:[0,40],b:[50,40],style:'valley',color:'#1133dd',width:2,foldFaces:[0,1]},
  ]);
  return {project,stepId};
}

test('completion overview keeps the actual saved paper and excludes step arrows and pending teaching lines',()=>{
  const {project}=fixture(),snapshot=structuredClone(project),step=project.steps[0];
  const cover=diagramPDFCoverSVG(project,step),drawing=diagramPDFStepSVG(project,step);
  assert.match(cover,/data-diagram-paper-face=/);assert.match(cover,/#fee9c7|#bbd2aa/);
  assert.ok(!cover.includes('#e11123'));assert.ok(!cover.includes('#1133dd'));
  assert.ok(drawing.includes('#e11123'));assert.ok(drawing.includes('#1133dd'));
  assert.deepEqual(project,snapshot);
});

test('completion overview preserves saved pulled coordinates, camera and hidden physical faces without any CP calculation',()=>{
  const {project,stepId}=fixture(),hidden=updateDiagramHiddenFaces(project,stepId,[1]),step=hidden.steps[0];
  step.pose!.result.geometry.vertices[0]=[-9,7];step.pose!.result.geometry.modified=true;step.pose!.view={...step.pose!.view!,side:'back',rotation:19};
  const snapshot=structuredClone(hidden),svg=diagramPDFCoverSVG(hidden,step);
  assert.match(svg,/data-diagram-paper-face="0"/);assert.ok(!svg.includes('data-diagram-paper-face="1"'));
  assert.ok(!svg.includes('#e11123'));assert.deepEqual(hidden,snapshot);
});

test('a completion overview lacking a saved pose falls back to that step after CP, including its newly authored routes',()=>{
  const doc=blankDoc('未保存姿态',100,100),initial=createDiagramProject(doc),step=initial.steps[0];
  const after={...doc,segments:[...doc.segments,{id:'new-route',a:[0,35] as [number,number],b:[100,35] as [number,number],assignment:'V' as const,angle:180}]};
  const project=updateDiagramCP(initial,step.afterId,after),snapshot=structuredClone(project),svg=diagramPDFCoverSVG(project,project.steps[0]);
  assert.ok(svg.includes('y1="35"'));assert.ok(!svg.includes('data-diagram-paper-face'));
  assert.equal(diagramPDFCoverSVG(project),svg);assert.deepEqual(project,snapshot);
});
