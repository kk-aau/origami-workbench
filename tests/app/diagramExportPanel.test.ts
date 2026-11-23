import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,appendDiagramStep,type DiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {diagramStepImagePanels,diagramStepImagePanelSVG} from '../../src/app/diagramImageExport';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';

function fixture(widths:number[]){
  let project=createDiagramProject(blankDoc('比例比较',100,100));
  for(let i=1;i<widths.length;i++)project=appendDiagramStep(project);
  for(const [i,width] of widths.entries()){
    project.steps[i].annotations=[{id:'line-'+i,kind:'line',a:[0,0],b:[width,width],width:.5,color:'#303030',style:'crease'}];
  }
  return project;
}
function markers(project:DiagramProject,start=1,enabled=true,scaleChangePercent?:number){
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'1x1' as const,scaleIndicators:enabled,scaleChangePercent,scope:'range' as const,rangeStart:start,rangeEnd:project.steps.length};
  const plan=planDiagramPDF(project,options),palette=defaultDiagramLineDefaults();
  const getMark=(svg:string)=>svg.match(/data-diagram-scale-marker="(zoom|zoomOut)"/)?.[1]??null;
  const pages=plan.pages.map((_,index)=>getMark(diagramPDFPageSVG(project,options,plan,index,palette,true)));
  const panels=diagramStepImagePanels(project,options).map(panel=>getMark(diagramStepImagePanelSVG(project,panel,palette,true)));
  assert.deepEqual(panels,pages);
  return pages;
}
test('PDF pages and PNG panels compare adjacent exports, including process figures and a range starting mid-project',()=>{
  const project=fixture([100,100,100]);
  project.steps[1].processFigures=[fixture([25])];
  const snapshot=structuredClone(project);
  assert.deepEqual(markers(project),[null,'zoom','zoomOut',null]);
  assert.deepEqual(markers(project,2),['zoom','zoomOut',null]);
  assert.deepEqual(markers(project,3),[null]);
  assert.deepEqual(markers(project,1,false),[null,null,null,null]);
  assert.deepEqual(project,snapshot);
});
test('changing the threshold changes both exported formats across a page boundary',()=>{
  const project=fixture([100,90,100]);
  assert.deepEqual(markers(project,1,true,5),['zoom','zoomOut',null]);
  assert.deepEqual(markers(project,1,true,25),[null,null,null]);
});
test('a hand-placed zoom instruction on the source exported panel is sufficient',()=>{
  const project=fixture([100,25,100]);
  project.steps[0].annotations!.push({id:'manual',kind:'symbol',symbol:'zoom',position:[40,40],size:8,rotation:0,width:.7,color:'#293d35'});
  assert.deepEqual(markers(project),[null,'zoomOut',null]);
});


test('2 to 3 places its icon after step 2 and preserves every artwork rectangle',async()=>{
  const {diagramExportPagePanels,diagramExportPanelArtwork}=await import('../../src/app/diagramExportPanel');
  const {diagramPDFCellContent}=await import('../../src/app/diagramPDFLayout');
  const project=fixture([100,100,25,25]),base={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'3x3' as const};
  const enabled={...base,scaleIndicators:true},plan=planDiagramPDF(project,enabled),panels=diagramExportPagePanels(project,enabled,plan,0),palette=defaultDiagramLineDefaults();
  const page=diagramPDFPageSVG(project,enabled,plan,0,palette,true);
  assert.match(page,/data-scale-from="2" data-scale-to="3"/);assert.doesNotMatch(page,/data-scale-from="3" data-scale-to="4"/);
  for(const [i,panel] of panels.entries()){
    const box=diagramPDFCellContent(project.steps[i],plan.pages[0].cells[i],enabled,plan).imageRect;
    const plain=diagramExportPanelArtwork(project,{stepIndex:i,size:panel.size},box,palette,true);
    const marked=diagramExportPanelArtwork(project,panel,box,palette,true,undefined,undefined,true);
    assert.deepEqual(marked.rect,box);assert.equal(marked.svg,plain.svg);
  }
  const first=plan.pages[0].cells[1],next=plan.pages[0].cells[2],cue=panels[1].markerBox!;
  assert.ok(cue.x>=first.x+first.width&&cue.x+cue.width<=next.x);
});
test('manual add, remove and automatic restoration are scoped to one stable transition',async()=>{
  const {diagramExportTransitions}=await import('../../src/app/diagramExportPanel');
  const project=fixture([100,100,25]),base={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'3x3' as const};
  const plan=planDiagramPDF(project,base),[first,second]=diagramExportTransitions(project,plan),palette=defaultDiagramLineDefaults();
  const render=(scaleIndicators:boolean,overrides:Record<string,'zoom'|'zoomOut'|'none'>)=>diagramPDFPageSVG(project,{...base,scaleIndicators,scaleMarkerOverrides:overrides},plan,0,palette,true);
  assert.match(render(false,{[first.key]:'zoom'}),/data-scale-from="1" data-scale-to="2"/);
  assert.doesNotMatch(render(false,{[first.key]:'none'}),/data-diagram-scale-marker/);
  assert.doesNotMatch(render(true,{[second.key]:'none'}),/data-diagram-scale-marker/);
  assert.match(render(true,{}),/data-scale-from="2" data-scale-to="3"/);
});
