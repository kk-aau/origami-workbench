import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,duplicateDiagramStep} from '../../src/app/diagramProject';
import {DIAGRAM_PDF_LAYOUTS,defaultDiagramPDFOptions,planDiagramPDF,diagramPDFReadingGuides} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
function fixture(count=23){let p=createDiagramProject(blankDoc('蛇形阅读',100,100));while(p.steps.length<count)p=duplicateDiagramStep(p,p.activeStepId);p.steps.forEach((s,i)=>{s.title=`动作 ${i+1}`;s.description=`步骤 ${i+1} 的说明。`;});return p;}
test('every grid preserves exact step identity and captions while alternating row placement, including partial final rows',()=>{
  const p=fixture(),saved=structuredClone(p);
  for(const layout of DIAGRAM_PDF_LAYOUTS)for(const paper of ['A3','A4'] as const)for(const orientation of ['portrait','landscape'] as const){
    const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:layout.id,paper,orientation},normal=planDiagramPDF(p,options),snake=planDiagramPDF(p,{...options,readingOrder:'snake'});
    assert.deepEqual(snake.selected,normal.selected);assert.equal(snake.pages.length,normal.pages.length);
    snake.pages.forEach((page,index)=>page.cells.forEach((cell,slot)=>{const original=normal.pages[index].cells[slot],row=Math.floor(slot/page.columns);assert.deepEqual({...cell,x:original.x},original);assert.ok(Math.abs(cell.x-(row%2?snake.width-original.x-original.width:original.x))<1e-8);}));
    for(const page of snake.pages){const guides=diagramPDFReadingGuides(page,{...options,readingOrder:'snake'});assert.equal(guides.length,Math.max(0,page.cells.length-1));for(const guide of guides){assert.equal(guide.end,guide.start+1);for(const [x,y] of [guide.from,guide.to])assert.ok(!page.cells.some(c=>x>=c.x&&x<=c.x+c.width&&y>=c.y&&y<=c.y+c.height),'reading guide stays outside cells');}}
  }
  assert.deepEqual(p,saved);
});
test('intro and later grids restart at top-left; range numbering and complete appendix stay in logical order',()=>{
  const p=fixture(30);p.steps[4].description='保留完整说明。'.repeat(1500);
  const options={...defaultDiagramPDFOptions(p),introLayout:'2x3' as const,layout:'3x2' as const,readingOrder:'snake' as const,scope:'range' as const,rangeStart:4,rangeEnd:19},plan=planDiagramPDF(p,options);
  assert.deepEqual(plan.pages.flatMap(page=>page.cells.map(c=>c.stepIndex)),Array.from({length:16},(_,i)=>i+3));
  for(const page of plan.pages.filter(page=>page.cells.length))assert.equal(page.cells[0].x,plan.margin);
  assert.equal(plan.pages.filter(page=>page.kind==='notes').flatMap(page=>page.notes.flatMap(n=>n.lines)).join(''),p.steps[4].description);
  assert.ok(plan.pages.filter(page=>page.kind==='notes').every(page=>diagramPDFReadingGuides(page,options).length===0));
});
test('preview/export SVG shares gutter guides, keeps logical text order and leaves legacy/default grids unchanged',()=>{
  const p=fixture(8),options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,readingOrder:'snake' as const},plan=planDiagramPDF(p,options),svg=diagramPDFPageSVG(p,options,plan,0,defaultDiagramLineDefaults(),true);
  assert.equal((svg.match(/data-pdf-reading-guide=/g)??[]).length,7);assert.match(svg,/rotate\(180\)/);assert.match(svg,/rotate\(90\)/);
  assert.deepEqual([...svg.matchAll(/data-pdf-step="(\d+)"/g)].map(m=>Number(m[1])),[1,2,3,4,5,6,7,8]);assert.doesNotMatch(svg,/<image/);
  const old={...options,readingOrder:undefined},rows={...options,readingOrder:'rows' as const};assert.deepEqual(planDiagramPDF(p,old),planDiagramPDF(p,rows));assert.deepEqual(diagramPDFReadingGuides(plan.pages[0],rows),[]);assert.throws(()=>planDiagramPDF(p,{...options,readingOrder:'spiral' as any}),/阅读顺序/);
});
