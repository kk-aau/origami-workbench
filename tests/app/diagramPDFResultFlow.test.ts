import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,duplicateDiagramStep} from '../../src/app/diagramProject';
import {captureGalleryView} from '../../src/app/diagramPDFGallery';
import {defaultDiagramPDFOptions,diagramPDFPanelKey,planDiagramPDF,type DiagramPDFRect} from '../../src/app/diagramPDFLayout';
import {diagramPDFRibbonNodes} from '../../src/app/diagramPDFDecoration';

function fixture(steps:number,views:number){
  let project=createDiagramProject(blankDoc('成品接续',100,100));
  while(project.steps.length<steps)project=duplicateDiagramStep(project,project.activeStepId);
  const gallery=Array.from({length:views},()=>captureGalleryView(project.steps.at(-1)!,'saved'));
  return {project,gallery,options:defaultDiagramPDFOptions(project)};
}
const overlaps=(a:DiagramPDFRect,b:DiagramPDFRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('adding finished views continues a sparse snake without moving the steps or ribbon',()=>{
  const {project,gallery,options}=fixture(2,5);
  const snake={...options,cover:'none' as const,readingOrder:'snake' as const,layout:'3x3' as const};
  const original=planDiagramPDF(project,snake),next=planDiagramPDF(project,{...snake,gallery});
  const page=next.pages[0],slots=page.resultGallery!.slots!;
  assert.deepEqual(page.cells,original.pages[0].cells);
  assert.deepEqual(diagramPDFRibbonNodes(snake,next,page),diagramPDFRibbonNodes(snake,original,original.pages[0]));
  assert.equal(slots.length,5);
  assert.equal(slots[0].x,page.cells[1].x);
  assert.ok(slots[0].y>page.cells[1].y);
  assert.ok(slots.every(slot=>page.cells.every(cell=>!overlaps(slot,cell))));
});

test('free composition retains hand-placed steps and excludes their actual page area',()=>{
  const {project,gallery,options}=fixture(2,9),key=diagramPDFPanelKey(project,{stepIndex:0});
  const free={...options,cover:'none' as const,readingOrder:'snake' as const,layoutMode:'free' as const,
    layout:'3x3' as const,panelPlacements:{[key]:{x:.24,y:.31,scale:1.5}}};
  const original=planDiagramPDF(project,free),next=planDiagramPDF(project,{...free,gallery});
  const page=next.pages[0],mixed=page.resultGallery!;
  assert.deepEqual(page.cells,original.pages[0].cells);
  assert.ok(mixed.count>0&&mixed.count<gallery.length);
  assert.ok(mixed.slots!.every(slot=>page.cells.every(cell=>!overlaps(slot,cell))));
  assert.equal(next.pages[1].resultGallery?.start,mixed.count);
});

test('a hanging step number protects the adjacent gap in a sparse row',()=>{
  const {project,gallery,options}=fixture(100,7);
  project.steps[99].title='完成';
  const plan=planDiagramPDF(project,{...options,cover:'none',readingOrder:'snake',layout:'3x3',
    scope:'range',rangeStart:99,rangeEnd:100,stepNumberPosition:'left',stepAlignment:'left',gallery});
  const first=plan.pages[0],mixed=first.resultGallery!;
  // Step 100 sits on the right edge and its left-aligned number extends past the gutter.
  assert.equal(mixed.count,6);
  assert.ok(mixed.slots!.every(slot=>slot.y>first.cells[1].y));
  assert.equal(plan.pages[1].resultGallery!.count,1);
});

test('finished views preserve a freely fitted introduction even when the requested grid is tall',()=>{
  const {project,gallery,options}=fixture(1,20);
  project.steps[0].title='这是一个需要解释的很重要的步骤'.repeat(3);
  const free={...options,cover:'diagram' as const,orientation:'landscape' as const,readingOrder:'rows' as const,
    layoutMode:'free' as const,pageLayouts:{0:{columns:3,rows:6}}};
  const original=planDiagramPDF(project,free),next=planDiagramPDF(project,{...free,gallery});
  assert.deepEqual(next.pages[0].cells,original.pages[0].cells);
  assert.equal(next.pages.reduce((n,p)=>n+(p.resultGallery?.count??0),0),20);
});

test('a full step page moves results to the following grid and a single final view stays one cell wide',()=>{
  const {project,gallery,options}=fixture(4,5);
  const plan=planDiagramPDF(project,{...options,cover:'none',layout:'2x2',gallery});
  assert.deepEqual(plan.pages.map(page=>page.kind),['steps','gallery','gallery']);
  assert.equal(plan.pages[0].resultGallery,undefined);
  const full=plan.pages[1].resultGallery!,last=plan.pages[2].resultGallery!;
  assert.deepEqual([full.start,full.count,last.start,last.count],[0,4,4,1]);
  assert.ok(full.slots![0].x<full.slots![1].x&&full.slots![2].y>full.slots![0].y);
  assert.deepEqual(last.slots![0],full.slots![0]);
  assert.equal(last.slots![0].width,plan.pages[0].cells[0].width);
});

test('finished views continue the selected axis on a mixed page and inherit it after a single horizontal gallery override',()=>{
  const {project,gallery,options}=fixture(2,13);
  const plan=planDiagramPDF(project,{...options,cover:'none',readingOrder:'snake',snakeDirection:'vertical',
    layout:'2x3',pageLayouts:{1:{snakeDirection:'horizontal'}},gallery});
  const [mixed,horizontal,vertical]=plan.pages;
  assert.deepEqual(plan.pages.map(page=>page.resultGallery!.count),[4,6,3]);
  const mixedSlots=mixed.resultGallery!.slots!,row=horizontal.resultGallery!.slots!,column=vertical.resultGallery!.slots!;
  assert.equal(mixedSlots[0].x,mixed.cells[1].x);
  assert.ok(mixedSlots[0].y>mixed.cells[1].y);
  assert.equal(row[0].y,row[1].y);assert.ok(row[0].x<row[1].x);
  assert.ok(column.every(slot=>slot.x===column[0].x));
  assert.equal(column[0].width,row[0].width);
});
