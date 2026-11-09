import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramPoseViewport,type DiagramProject} from '../../src/app/diagramProject';
import {sameDiagramProjectContent,diagramProjectNeedsReplacementConfirmation} from '../../src/app/diagramProjectContent';

function fixture(){
  const doc=blankDoc('保存内容',100,100);doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc));
  project=appendDiagramStep(project);project.steps[0].paperStates={active:'flat',flat:structuredClone(project.steps[0].pose!)};
  return project;
}
test('navigation, viewport rectangles and regenerated layer certificates do not dirty drawing content',()=>{
  const original=fixture(),stepId=original.steps[0].id;
  const moved=updateDiagramPoseViewport(original,stepId,{'front-solid':{rotation:0,x:10,y:20,width:30,height:40}});
  const browsed={...moved,activeStepId:stepId};assert.equal(sameDiagramProjectContent(original,browsed),true);
  const certificate=structuredClone(browsed);certificate.steps[0].pose!.result.layers={...certificate.steps[0].pose!.result.layers,message:'重分析完成',solutionCount:9};
  certificate.steps[0].pose!.result.warnings=['运行诊断'];assert.equal(sameDiagramProjectContent(original,certificate),true);
});
test('authored orientation, colors, geometry and explicit layer choices still require persistence',()=>{
  const original=fixture();
  const changes:((project:DiagramProject)=>void)[]=[
    project=>{project.steps[0].pose!.view!.rotation=30;},
    project=>{project.steps[0].pose!.view!.side='back';},
    project=>{project.steps[0].pose!.view!.colors={front:'#ffffff',back:'#ff0000',line:'#000000'};},
    project=>{project.steps[0].pose!.result.geometry.vertices[0][0]+=1;},
    project=>{project.steps[0].pose!.layerSolutionIndex=1;},
    project=>{project.steps[0].pose!.displayOrder=[1,0];},
    project=>{project.steps[0].pose!.result.layers.relativeConstraints=[{above:0,below:1} as never];},
    project=>{project.steps[0].title='实际标题修改';},
  ];
  for(const change of changes){const next=structuredClone(original);change(next);assert.equal(sameDiagramProjectContent(original,next),false);}
  const restored=structuredClone(original);assert.equal(sameDiagramProjectContent(original,restored),true);
});
test('unchanged immutable CP branches are not traversed for a selected-step change',()=>{
  const original=fixture(),states=new Proxy(original.states,{ownKeys(){throw Error('must not scan shared CPs');}});
  const first={...original,states},second={...first,activeStepId:first.steps[0].id};
  assert.equal(sameDiagramProjectContent(first,second),true);
});

test('opening an external drawing from the library does not invent a current editing draft',()=>{
  const placeholder=createDiagramProject(blankDoc('折序工程',300,300));
  assert.equal(diagramProjectNeedsReplacementConfirmation(placeholder,null,false),false);
  const recovered=fixture();recovered.steps[0].description='已在文档库中保留的恢复草稿';
  assert.equal(diagramProjectNeedsReplacementConfirmation(recovered,null,false),false,'an unopened recovered library document is retained independently');
  assert.equal(diagramProjectNeedsReplacementConfirmation(recovered,null,true),true,'continuing the recovered draft restores editing protection');
});

test('a saved open drawing can be replaced after browsing, but authored changes still ask for confirmation',()=>{
  const saved=fixture(),browsed={...saved,activeStepId:saved.steps[0].id};
  assert.equal(diagramProjectNeedsReplacementConfirmation(browsed,saved,true),false);
  const edited=structuredClone(browsed);edited.steps[0].description='未保存的步骤说明';
  assert.equal(diagramProjectNeedsReplacementConfirmation(edited,saved,true),true);
  assert.equal(diagramProjectNeedsReplacementConfirmation(edited,structuredClone(edited),true),false,'a completed manual save clears the replacement prompt');
  assert.equal(saved.steps[0].description,'');
});
