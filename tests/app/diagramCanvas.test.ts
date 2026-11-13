import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {
  createDiagramProject,appendDiagramStep,duplicateDiagramStep,adoptDiagramPose,updateDiagramCanvas,updateDiagramAnnotations,updateDiagramCP,
  defaultDiagramCanvas,validateDiagramCanvas,validateDiagramProject,exportDiagramProject,importDiagramProject,
  type DiagramCanvasSettings,
} from '../../src/app/diagramProject';

function fixture(){
  let index=0;const factory=()=>`canvas-project-${++index}`,doc=blankDoc('步骤网格',100,100),project=createDiagramProject(doc,factory);
  return {doc,project,factory};
}

test('new canvas defaults are per step and an older file with no canvas remains valid',()=>{
  const {project,factory}=fixture(),next=appendDiagramStep(project,factory);
  assert.deepEqual(defaultDiagramCanvas(),{grid:true,snap:true,gridSpacing:50,gridSubdivisions:1,diagonalGrid:false,gridDivisions:4});
  assert.deepEqual(next.steps.map(step=>step.canvas),[defaultDiagramCanvas(100),defaultDiagramCanvas(100)]);
  assert.notEqual(next.steps[0].canvas,next.steps[1].canvas);
  const old=structuredClone(next);for(const step of old.steps)delete step.canvas;
  assert.doesNotThrow(()=>validateDiagramProject(old));
  const loaded=importDiagramProject(exportDiagramProject(old));
  assert.deepEqual(loaded.steps.map(step=>step.canvas),[undefined,undefined]);
  const updated=updateDiagramCanvas(loaded,loaded.steps[0].id,defaultDiagramCanvas(loaded.states[0].doc.paper.width));
  assert.deepEqual(updated.steps[0].canvas,defaultDiagramCanvas(100));assert.equal(updated.steps[1].canvas,undefined);
  assert.equal(loaded.steps[0].canvas,undefined);
});

test('new step grids divide their actual source paper width into four without fine subdivisions',()=>{
  for(const width of [100,200,320]){
    const project=createDiagramProject(blankDoc('纸宽',width,160));
    assert.equal(project.steps[0].canvas!.gridSpacing,width/4);assert.equal(project.steps[0].canvas!.gridSubdivisions,1);assert.equal(project.steps[0].canvas!.gridDivisions,4);
  }
  const {project,factory}=fixture(),changed=updateDiagramCP(project,project.steps[0].afterId,blankDoc('新纸宽',320,160)),next=appendDiagramStep(changed,factory);
  assert.equal(next.steps[0].canvas!.gridSpacing,25);assert.equal(next.steps[1].canvas!.gridSpacing,80);
  assert.equal(next.steps[1].canvas!.gridSubdivisions,1);
  for(const width of [.2,100_000,NaN,Infinity,0])assert.doesNotThrow(()=>validateDiagramCanvas(defaultDiagramCanvas(width)));
});

test('legacy saved dense grid settings remain exact instead of being replaced by the new default',()=>{
  const {project}=fixture(),canvas={grid:true,snap:false,gridSpacing:20,gridSubdivisions:4,diagonalGrid:true};
  const saved=updateDiagramCanvas(project,project.activeStepId,canvas),loaded=importDiagramProject(exportDiagramProject(saved));
  assert.deepEqual(loaded.steps[0].canvas,canvas);
});

test('paper divisions persist per step, copy independently and do not alter legacy settings or paper geometry',()=>{
  for(const gridDivisions of [1,4,7,8,128,129,256,512]){
    const {project,factory}=fixture(),before=structuredClone(project);
    const changed=updateDiagramCanvas(project,project.activeStepId,{...defaultDiagramCanvas(100),gridDivisions,anglePreset:17.3});
    const copied=duplicateDiagramStep(changed,changed.activeStepId,factory),loaded=importDiagramProject(exportDiagramProject(copied));
    assert.equal(loaded.steps[0].canvas!.gridDivisions,gridDivisions);assert.equal(loaded.steps[1].canvas!.gridDivisions,gridDivisions);
    loaded.steps[1].canvas!.gridDivisions=16;assert.equal(loaded.steps[0].canvas!.gridDivisions,gridDivisions);
    assert.equal(loaded.steps[0].canvas!.anglePreset,17.3);assert.deepEqual(changed.states,project.states);assert.deepEqual(project,before);
  }
});

test('canvas changes isolate caller and other steps while leaving CP, pose and illustration geometry unchanged',()=>{
  const {doc,project,factory}=fixture(),result=computeFlatFold(doc);
  let next=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result);
  next=appendDiagramStep(next,factory);
  next=updateDiagramAnnotations(next,next.steps[0].id,[{id:'line',kind:'line',a:[0,0],b:[50,50],style:'valley',color:'#333',width:0.3}]);
  const before=structuredClone(next),canvas={grid:false,snap:true,gridSpacing:12,gridSubdivisions:6,diagonalGrid:true};
  const edited=updateDiagramCanvas(next,next.steps[0].id,canvas);
  assert.deepEqual(next,before);assert.deepEqual(edited.states,next.states);assert.deepEqual(edited.steps[0].pose,next.steps[0].pose);
  assert.deepEqual(edited.steps[0].annotations,next.steps[0].annotations);assert.deepEqual(edited.steps[1],next.steps[1]);
  canvas.gridSpacing=77;assert.equal(edited.steps[0].canvas!.gridSpacing,12);
  const copied=duplicateDiagramStep(edited,edited.steps[0].id,factory);
  assert.deepEqual(copied.steps[0].canvas,copied.steps[1].canvas);assert.notEqual(copied.steps[0].canvas,copied.steps[1].canvas);
  const copySettings={...copied.steps[1].canvas!,snap:false,gridSpacing:8};
  const changedCopy=updateDiagramCanvas(copied,copied.steps[1].id,copySettings);
  assert.equal(changedCopy.steps[0].canvas!.gridSpacing,12);assert.equal(changedCopy.steps[1].canvas!.gridSpacing,8);
  const loaded=importDiagramProject(exportDiagramProject(changedCopy));
  assert.deepEqual(loaded.steps.map(step=>step.canvas),changedCopy.steps.map(step=>step.canvas));
  loaded.steps[1].canvas!.gridSpacing=33;assert.equal(changedCopy.steps[1].canvas!.gridSpacing,8);
});

test('grid ranges validate boundaries and reject malformed settings atomically on updates and imports',()=>{
  assert.doesNotThrow(()=>validateDiagramCanvas({...defaultDiagramCanvas(),gridSpacing:0.1,gridSubdivisions:1}));
  assert.doesNotThrow(()=>validateDiagramCanvas({...defaultDiagramCanvas(),gridSpacing:10_000,gridSubdivisions:32}));
  const {project}=fixture(),before=structuredClone(project),base=defaultDiagramCanvas();
  assert.throws(()=>validateDiagramCanvas({...base,gridDivisions:undefined}));
  const bad:unknown[]=[null,undefined,{},[],{...base,grid:'true'},{...base,snap:0},{...base,diagonalGrid:null},
    {...base,extra:true},{...base,gridSpacing:0},{...base,gridSpacing:0.09},{...base,gridSpacing:10_001},
    {...base,gridSpacing:NaN},{...base,gridSpacing:Infinity},{...base,gridSpacing:'20'},
    {...base,gridSubdivisions:0},{...base,gridSubdivisions:33},{...base,gridSubdivisions:1.5},
    {...base,gridSubdivisions:Infinity},{...base,gridSubdivisions:null},
    ...[0,513,1.5,NaN,Infinity,null,'4'].map(gridDivisions=>({...base,gridDivisions}))];
  for(const canvas of bad) {
    assert.throws(()=>updateDiagramCanvas(project,project.steps[0].id,canvas as DiagramCanvasSettings));
    const saved=structuredClone(project);saved.steps[0].canvas=canvas as DiagramCanvasSettings;
    assert.throws(()=>validateDiagramProject(saved));
    if(canvas!==undefined)assert.throws(()=>importDiagramProject(JSON.stringify(saved)));
  }
  assert.throws(()=>updateDiagramCanvas(project,'missing',base),/不存在/);assert.deepEqual(project,before);
});

test('construction points and angle presets save per step, copy independently, and do not edit CP or paper geometry',()=>{
  const {project,factory}=fixture(),canvas={...defaultDiagramCanvas(),anglePreset:22.5,constructionPoints:[[20,30],[41.42135623730951,0]] as [number,number][]};
  const edited=updateDiagramCanvas(project,project.activeStepId,canvas);
  assert.deepEqual(edited.states,project.states);assert.deepEqual(edited.steps[0].pose,project.steps[0].pose);
  canvas.constructionPoints[0][0]=77;assert.equal(edited.steps[0].canvas!.constructionPoints![0][0],20);
  const copied=duplicateDiagramStep(edited,edited.activeStepId,factory);
  copied.steps[1].canvas!.constructionPoints![0][0]=88;assert.equal(copied.steps[0].canvas!.constructionPoints![0][0],20);
  const loaded=importDiagramProject(exportDiagramProject(edited));assert.deepEqual(loaded.steps[0].canvas,edited.steps[0].canvas);
  const appended=appendDiagramStep(edited,factory);assert.equal(appended.steps.at(-1)!.canvas!.constructionPoints,undefined);assert.equal(appended.steps.at(-1)!.canvas!.anglePreset,undefined);
});

test('saved construction references reject unsafe coordinates, over-capacity points and out-of-range angles atomically',()=>{
  const {project}=fixture(),before=structuredClone(project),base=defaultDiagramCanvas();
  for(const anglePreset of [null,undefined,'45',NaN,Infinity,-1,.49,90.01,180])assert.throws(()=>updateDiagramCanvas(project,project.activeStepId,{...base,anglePreset} as DiagramCanvasSettings));
  for(const constructionPoints of [null,undefined,{},[[0]],[[0,1,2]],[[Infinity,0]],[[NaN,0]],[['0',1]],[[1_000_001,0]],Array.from({length:501},()=>[0,0])])assert.throws(()=>updateDiagramCanvas(project,project.activeStepId,{...base,constructionPoints} as DiagramCanvasSettings));
  assert.doesNotThrow(()=>validateDiagramCanvas({...base,anglePreset:.5,constructionPoints:Array.from({length:500},()=>[1_000_000,-1_000_000])}));
  assert.deepEqual(project,before);
});

test('custom decimal angles save, copy and import without rounding or a hidden integer-division requirement',()=>{
  for(const anglePreset of [0,.5,13,17.3,37.5,89.999,90]){
    const {project,factory}=fixture(),updated=updateDiagramCanvas(project,project.activeStepId,{...defaultDiagramCanvas(100),anglePreset}),copied=duplicateDiagramStep(updated,updated.activeStepId,factory),loaded=importDiagramProject(exportDiagramProject(copied));
    assert.equal(loaded.steps[0].canvas!.anglePreset,anglePreset);assert.equal(loaded.steps[1].canvas!.anglePreset,anglePreset);assert.notEqual(loaded.steps[0].canvas,loaded.steps[1].canvas);
  }
});
