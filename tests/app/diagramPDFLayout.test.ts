import assert from 'node:assert/strict';
import test from 'node:test';
import {DIAGRAM_PDF_LAYOUTS,defaultDiagramPDFOptions,planDiagramPDF,selectDiagramPDFSteps,wrapDiagramPDFText,diagramPDFStepLabel,diagramPDFIntroLayout,diagramPDFIntroText,diagramPDFCellContent,diagramPDFCaptionLines,diagramPDFFooterLayout} from '../../src/app/diagramPDFLayout';
import {normalizeDiagramPDFSVG,diagramPDFStepSVG} from '../../src/app/diagramPDF';
import type {DiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {drawingSVG} from '../../src/app/diagramDrawing';
const project=(count=14):DiagramProject=>({format:'zhezhi-diagram',version:1,name:'中文折序图解',activeStepId:'s4',
  states:Array.from({length:count+1},(_,i)=>({id:`c${i}`,revision:1,doc:{name:`CP${i}`,paper:{width:200,height:200},segments:[]}})),
  steps:Array.from({length:count},(_,i)=>({id:`s${i}`,beforeId:`c${i}`,afterId:`c${i+1}`,pose:null,title:`步骤 ${i+1}`,description:'将右侧纸角向上谷折。'}))});
test('defaults preserve Chinese title, paper information and real active project step count',()=>{
  const options=defaultDiagramPDFOptions(project());assert.equal(options.title,'中文折序图解');assert.equal(options.paperInfo,'200 × 200 mm');assert.equal(options.rangeEnd,14);assert.equal(options.layout,'3x4');assert.equal(options.introLayout,'3x3');assert.equal(options.cover,'diagram');assert.equal(options.coverCP,true);
});

test('PDF numbers are separate from automatic or manually written step titles',()=>{
  const step=project(1).steps[0];step.title='';assert.equal(diagramPDFStepLabel(step,0),'1.');
  step.title='步骤 1';assert.equal(diagramPDFStepLabel(step,0),'1.');step.title='步骤2';assert.equal(diagramPDFStepLabel(step,1),'2.');
  step.title='谷折箭头';assert.equal(diagramPDFStepLabel(step,1),'2. 谷折箭头');
  step.title=' 自定义的折叠动作 ';assert.equal(diagramPDFStepLabel(step,2),'3. 自定义的折叠动作');
});
test('the eight original palette grids use columns before rows',()=>{
  const originals=DIAGRAM_PDF_LAYOUTS.filter(x=>x.source==='OriTools');assert.equal(originals.length,8);
  for(const layout of originals)assert.equal(layout.id,`${layout.columns}x${layout.rows}`);
});
test('all and current selections use stable original step numbering',()=>{
  const p=project(),options=defaultDiagramPDFOptions(p);assert.deepEqual(selectDiagramPDFSteps(p,options),Array.from({length:14},(_,i)=>i));assert.deepEqual(selectDiagramPDFSteps(p,{...options,scope:'current'}),[4]);
});
test('range selects inclusively and rejects reversed, fractional and out of bound inputs',()=>{
  const p=project(),options={...defaultDiagramPDFOptions(p),scope:'range' as const,rangeStart:3,rangeEnd:7};assert.deepEqual(selectDiagramPDFSteps(p,options),[2,3,4,5,6]);
  for(const [start,end] of [[0,3],[4,2],[2,15],[1.5,3],[1,NaN]])assert.throws(()=>selectDiagramPDFSteps(p,{...options,rangeStart:start,rangeEnd:end}),/步骤范围/);
});
test('default first page places the first nine steps below its header and later pages hold twelve',()=>{
  const p=project(26),plan=planDiagramPDF(p,defaultDiagramPDFOptions(p));assert.deepEqual(plan.pages.map(x=>x.kind),['intro','steps','steps']);assert.deepEqual(plan.pages.map(x=>x.cells.length),[9,12,5]);assert.deepEqual(plan.pages.flatMap(x=>x.cells.map(c=>c.stepIndex)),Array.from({length:26},(_,i)=>i));
  assert.equal(plan.pages[0].cells[0].y,plan.pages[0].cells[2].y);assert.ok(plan.pages[0].cells[1].x>plan.pages[0].cells[0].x);assert.ok(plan.pages[0].cells[3].y>plan.pages[0].cells[2].y);
});
test('all supported paper/orientation/grid choices stay within printable bounds',()=>{
  const p=project(19);
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const)for(const layout of DIAGRAM_PDF_LAYOUTS){
    const plan=planDiagramPDF(p,{...defaultDiagramPDFOptions(p),paper,orientation,layout:layout.id});
    assert.equal(plan.width<plan.height,orientation==='portrait');
    for(const cell of plan.pages.flatMap(x=>x.cells)){assert.ok(cell.x>=plan.margin);assert.ok(cell.y>=plan.margin);assert.ok(cell.x+cell.width<=plan.width-plan.margin+.00001);assert.ok(cell.y+cell.height<=plan.height-plan.margin-plan.footer+.00001);assert.ok(cell.width>40&&cell.height>50);}
  }
});
test('no cover and current cover image are independent from selected range',()=>{
  const p=project(),options=defaultDiagramPDFOptions(p);assert.equal(planDiagramPDF(p,{...options,cover:'none'}).pages[0].kind,'steps');assert.equal(planDiagramPDF(p,{...options,scope:'range',rangeStart:1,rangeEnd:2,coverImage:'current'}).coverStepIndex,4);assert.equal(planDiagramPDF(p,{...options,coverImage:'last'}).coverStepIndex,13);assert.equal(planDiagramPDF(p,{...options,coverImage:'none'}).coverStepIndex,null);
});
test('Chinese text wraps without dropping characters, blank paragraphs or astral symbols',()=>{
  const value='谷折沿已有折痕向上\n\n旋转↻纸张🦢';const lines=wrapDiagramPDFText(value,24,8);assert.equal(lines.join('').replace(/\n/g,''),value.replace(/\n/g,''));assert.ok(lines.includes(''));assert.ok(lines.some(line=>line.includes('🦢')));
});
test('long description automatically continues on note pages with every character retained',()=>{
  const p=project(2);p.steps[0].description='先谷折再展开。'.repeat(3000);const plan=planDiagramPDF(p,defaultDiagramPDFOptions(p));assert.equal(plan.pages[0].cells[0].descriptionOverflow,true);const notes=plan.pages.filter(x=>x.kind==='notes').flatMap(x=>x.notes);assert.ok(notes.length>1);assert.equal(notes.flatMap(x=>x.lines).join(''),p.steps[0].description);
  for(const note of notes)assert.ok(note.y+note.height<=plan.height-plan.margin-plan.footer+.00001);
});
test('disabling explanations produces no notes appendix',()=>{
  const p=project(2);p.steps[0].description='说明。'.repeat(1000);const plan=planDiagramPDF(p,{...defaultDiagramPDFOptions(p),descriptions:false});assert.equal(plan.pages.some(x=>x.kind==='notes'),false);assert.deepEqual(plan.pages[0].cells[0].descriptionLines,[]);
});
test('invalid format options and empty project are rejected',()=>{
  const p=project(),options=defaultDiagramPDFOptions(p);assert.throws(()=>planDiagramPDF(project(0),options),/没有可导出/);assert.throws(()=>planDiagramPDF(p,{...options,layout:'5x5' as any}),/排版/);assert.throws(()=>planDiagramPDF(p,{...options,paper:'A0' as any}),/纸张/);assert.throws(()=>planDiagramPDF(p,{...options,coverCP:1 as any}),/显示选项/);
});
test('planning does not change source poses, CPs or steps',()=>{
  const p=project(),saved=JSON.stringify(p);planDiagramPDF(p,defaultDiagramPDFOptions(p));assert.equal(JSON.stringify(p),saved);
});
test('every first-page grid is independent of every later-page grid, with row-major identity retained',()=>{
  const p=project(45),options=defaultDiagramPDFOptions(p);
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const)for(const first of DIAGRAM_PDF_LAYOUTS)for(const later of DIAGRAM_PDF_LAYOUTS){
    const chosen={...options,paper,orientation,introLayout:first.id,layout:later.id},plan=planDiagramPDF(p,chosen);
    assert.equal(plan.pages[0].kind,'intro');assert.equal(plan.pages[0].columns,first.columns);assert.equal(plan.pages[0].rows,first.rows);assert.equal(plan.pages[0].cells.length,first.columns*first.rows);
    assert.equal(plan.pages[1].columns,later.columns);assert.equal(plan.pages[1].rows,later.rows);assert.equal(plan.pages[1].cells.length,later.columns*later.rows);
    assert.deepEqual(plan.pages.flatMap(page=>page.cells.map(cell=>cell.stepIndex)),Array.from({length:45},(_,i)=>i));
    for(const page of plan.pages)for(const cell of page.cells){assert.equal(cell.columns,page.columns);assert.equal(cell.rows,page.rows);assert.ok(cell.x+cell.width<=plan.width-plan.margin+.00001);assert.ok(cell.y+cell.height<=plan.height-plan.margin-plan.footer+.00001);const content=diagramPDFCellContent(p.steps[cell.stepIndex],cell,chosen,plan);assert.ok(content.imageRect.height>0);for(const line of content.captionLines)assert.ok(line.y+line.fontSize<=cell.y+cell.height+.00001);}
  }
});
test('a custom first grid is used exactly, rather than deriving it from later-page row count',()=>{
  const p=project(22),options={...defaultDiagramPDFOptions(p),introLayout:'2x2' as const,layout:'1x1' as const},plan=planDiagramPDF(p,options);
  assert.equal(plan.pages[0].cells.length,4);assert.equal(plan.pages[1].cells.length,1);assert.equal(plan.introColumns,2);assert.equal(plan.introRows,2);assert.equal(plan.columns,1);assert.equal(plan.rows,1);
});
test('range and current first pages retain their original numbers and do not add an independent cover',()=>{
  const p=project(30),options=defaultDiagramPDFOptions(p),range=planDiagramPDF(p,{...options,scope:'range',rangeStart:8,rangeEnd:22});
  assert.deepEqual(range.pages.map(page=>page.kind),['intro','steps']);assert.deepEqual(range.pages[0].cells.map(cell=>cell.stepIndex),[7,8,9,10,11,12,13,14,15]);assert.deepEqual(range.pages[1].cells.map(cell=>cell.stepIndex),[16,17,18,19,20,21]);
  const current=planDiagramPDF(p,{...options,scope:'current'});assert.equal(current.pages.length,1);assert.equal(current.pages[0].cells[0].stepIndex,4);
});
test('standard and minimal cover choices still create independent covers, while none starts at the later grid',()=>{
  const p=project(26),options=defaultDiagramPDFOptions(p);
  for(const cover of ['standard','minimal'] as const){const plan=planDiagramPDF(p,{...options,cover});assert.deepEqual(plan.pages.map(page=>page.kind),['cover','steps','steps','steps']);assert.equal(plan.pages[1].cells.length,12);}
  const none=planDiagramPDF(p,{...options,cover:'none',introLayout:'1x1'});assert.deepEqual(none.pages.map(page=>page.kind),['steps','steps','steps']);assert.equal(none.pages[0].cells.length,12);
});
test('old options without new optional metadata or introLayout remain valid',()=>{
  const p=project(),options=defaultDiagramPDFOptions(p);delete options.introLayout;delete options.designer;delete options.designDate;delete options.diagramDate;delete options.headerNote;
  assert.equal(planDiagramPDF(p,options).pages[0].cells.length,9);
});
test('three header columns and the optional note remain above the first-page grid on all papers',()=>{
  const p=project(25);
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const){
    const options={...defaultDiagramPDFOptions(p),paper,orientation,headerNote:'请先预折并完全展开，之后按步骤折叠。'.repeat(4)},plan=planDiagramPDF(p,options),header=diagramPDFIntroLayout(plan,options);
    assert.ok(header.info.x+header.info.width<header.image.x);assert.ok(header.image.x+header.image.width<header.cp!.x);
    assert.ok(header.image.y+header.image.height<header.dividerY);assert.ok(header.cp!.y+header.cp!.height<header.dividerY);assert.equal(header.cp!.width,header.cp!.height);
    assert.ok(header.noteRect);assert.ok(header.noteRect.y+header.noteRect.height<header.dividerY);assert.ok(plan.pages[0].cells[0].y>header.dividerY);
    if(paper==='A4'&&orientation==='portrait')assert.ok((header.dividerY-plan.margin)/plan.height>=.22&&(header.dividerY-plan.margin)/plan.height<=.25);
    assert.equal(diagramPDFIntroLayout(plan,{...options,coverCP:false}).cp,null);
  }
});
test('shared header text places title, designer, author, dates, paper and note without crossing the divider',()=>{
  const p=project(),options={...defaultDiagramPDFOptions(p),designer:'设计者甲',author:'制图者乙',designDate:'2024-05-06',diagramDate:'2026-10-13',headerNote:'完成后可整理纸层。'},plan=planDiagramPDF(p,options),header=diagramPDFIntroLayout(plan,options),lines=diagramPDFIntroText(p,options,header),text=lines.map(line=>line.text).join('');
  for(const value of [options.title,'Designer','Diagrams','设计者甲','制图者乙','2024-05-06','2026-10-13',options.paperInfo,options.headerNote])assert.ok(text.includes(value));
  for(const line of lines)assert.ok(line.y+line.fontSize<header.dividerY);
  const landscape={...options,orientation:'landscape' as const,title:'长标题'.repeat(40),designer:'甲'.repeat(120),author:'乙'.repeat(120),designDate:'1'.repeat(40),diagramDate:'2'.repeat(40),paperInfo:'纸'.repeat(160),headerNote:'注'.repeat(160)};
  const large=planDiagramPDF(p,landscape),geometry=diagramPDFIntroLayout(large,landscape);
  for(const line of diagramPDFIntroText(p,landscape,geometry))assert.ok(line.y+line.fontSize<geometry.dividerY);
});

test('short introductory notes follow the paper information instead of leaving a fixed-height empty block',()=>{
  const p=project(24),options={...defaultDiagramPDFOptions(p),designer:'测试设计者',author:'图解作者',designDate:'2026/10',diagramDate:'2026/10',paperInfo:'20 × 20 cm',headerNote:'折序练习图解 · 完成图采用保存的纸面姿态'};
  const plan=planDiagramPDF(p,options),geometry=diagramPDFIntroLayout(plan,options,p.name),lines=diagramPDFIntroText(p,options,geometry),note=geometry.noteRect!;
  const paper=lines.find(line=>line.text===options.paperInfo)!;
  assert.ok(note.y>paper.y+paper.fontSize&&note.y-paper.y-paper.fontSize<=15);
  assert.equal(note.width,geometry.info.width);assert.equal(note.x,geometry.info.x);
  assert.ok(geometry.dividerY-plan.margin<plan.height*.21);assert.ok(geometry.metadataFont>=10.5);
  assert.equal(plan.pages[0].cells[0].y,geometry.stepsY);assert.equal(plan.pages[0].cells.length,9);
});

test('hidden completion and CP graphics reclaim their columns and header height',()=>{
  const p=project(24),options={...defaultDiagramPDFOptions(p),designer:'甲',author:'乙'},plan=planDiagramPDF(p,options),full=diagramPDFIntroLayout(plan,options,p.name);
  for(const hidden of [{...options,coverCP:false},{...options,coverImage:'none' as const}]){
    const reduced=planDiagramPDF(p,hidden),header=diagramPDFIntroLayout(reduced,hidden,p.name);
    assert.ok(header.info.width>full.info.width);assert.ok(header.dividerY<=full.dividerY);
  }
  const compact={...options,coverCP:false,coverImage:'none' as const,designer:'',author:'',paperInfo:''},small=planDiagramPDF(p,compact),header=diagramPDFIntroLayout(small,compact,p.name);
  assert.equal(header.info.width,small.width-small.margin*2);assert.equal(header.cp,null);assert.equal(header.image.width,0);assert.equal(header.image.height,0);
  assert.ok(header.dividerY-small.margin<45);assert.ok(header.dividerY<full.dividerY-100);
});

test('wrapped titles and long metadata grow the compact header without overlapping notes or first-page grids',()=>{
  const p=project(24);p.name='没有填写导出标题时使用的长工程名称';
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const){
    const options={...defaultDiagramPDFOptions(p),paper,orientation,title:'',introLayout:'3x3' as const,designer:'甲'.repeat(120),author:'乙'.repeat(120),paperInfo:'纸'.repeat(160),headerNote:'注'.repeat(160)};
    const plan=planDiagramPDF(p,options),header=diagramPDFIntroLayout(plan,options,p.name),lines=diagramPDFIntroText(p,options,header);
    assert.ok(header.noteRect);assert.ok(header.noteRect!.y>Math.max(...lines.filter(line=>line.fontSize!==header.noteFont).map(line=>line.y+line.fontSize)));
    for(const line of lines)assert.ok(line.y+line.fontSize<header.dividerY);
    for(const cell of plan.pages[0].cells){const content=diagramPDFCellContent(p.steps[cell.stepIndex],cell,options,plan);assert.ok(content.imageRect.height>0);assert.ok(content.captionRect.y+content.captionRect.height<=cell.y+cell.height+.00001);}
  }
});

test('a dense landscape first page with maximal metadata and two-line step titles asks for more drawing space instead of exporting a few-millimeter image',()=>{
  const p=project(24);p.steps.forEach(step=>{step.title='需要保留纸层关系并继续向上折叠的完整步骤标题'.repeat(4);step.description='此处有很长的说明，需要继续到文末。'.repeat(5);});
  const options={...defaultDiagramPDFOptions(p),orientation:'landscape' as const,introLayout:'4x4' as const,title:'长标题'.repeat(40),designer:'甲'.repeat(120),author:'乙'.repeat(120),designDate:'1'.repeat(40),diagramDate:'2'.repeat(40),paperInfo:'纸'.repeat(160),headerNote:'注'.repeat(160)};
  assert.throws(()=>planDiagramPDF(p,options),/首页文字较多.*减少首页行数/);
  const adjusted=planDiagramPDF(p,{...options,introLayout:'3x2'});assert.equal(adjusted.pages[0].cells.length,6);
  assert.ok(adjusted.pages[0].cells.every(cell=>diagramPDFCellContent(p.steps[cell.stepIndex],cell,{...options,introLayout:'3x2'},adjusted).imageRect.height>=24));
});
test('all step caption text is below the image and font uses its own page columns',()=>{
  const p=project(24),options={...defaultDiagramPDFOptions(p),introLayout:'4x4' as const,layout:'1x2' as const,orientation:'landscape' as const},plan=planDiagramPDF(p,options);
  for(const cell of plan.pages.flatMap(page=>page.cells)){
    const content=diagramPDFCellContent(p.steps[cell.stepIndex],cell,options,plan);assert.ok(content.imageRect.height>0);assert.ok(content.imageRect.y+content.imageRect.height<content.captionRect.y);assert.equal(content.imageRect.y,cell.y);
    assert.equal(content.font,cell.columns===4?7:9);assert.ok(content.captionLines[0].text.startsWith(`${cell.stepIndex+1}.`));
    assert.deepEqual(diagramPDFCaptionLines(p.steps[cell.stepIndex],cell,options,plan),content.captionLines);
    for(const line of content.captionLines){assert.ok(line.y>=content.captionRect.y);assert.ok(line.y+line.fontSize<=cell.y+cell.height+.00001);}
  }
});
test('page footer centers padded three-digit numbers under a short gray-rule location',()=>{
  const p=project(),plan=planDiagramPDF(p,defaultDiagramPDFOptions(p));
  for(const [index,label] of [[0,'001'],[8,'009'],[9,'010'],[99,'100']] as const){const footer=diagramPDFFooterLayout(plan,index);assert.equal(footer.label,label);assert.equal(footer.x,plan.width/2);assert.equal(footer.rule.x+footer.rule.width/2,footer.x);assert.equal(footer.rule.width,36);assert.equal(footer.rule.y,footer.y+footer.fontSize*.65);assert.ok(footer.leftRule.x+footer.leftRule.width<footer.x&&footer.rightRule.x>footer.x);assert.equal(footer.leftRule.y,footer.rightRule.y);assert.ok(footer.y+footer.fontSize<plan.height);}
});
test('invalid first-page grid and optional metadata are rejected before export',()=>{
  const p=project(),options=defaultDiagramPDFOptions(p);assert.throws(()=>planDiagramPDF(p,{...options,introLayout:'0x0' as any}),/首页步骤/);assert.throws(()=>planDiagramPDF(p,{...options,designer:100 as any}),/设计者/);assert.throws(()=>planDiagramPDF(p,{...options,headerNote:'字'.repeat(161)}),/首页小字/);
});
test('diagram SVG normalization keeps real proportions and all path content',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="-10 -20 70 140"><path d="M0 0L20 20"/></svg>',normalized=normalizeDiagramPDFSVG(svg);assert.match(normalized,/width="70" height="140"/);assert.match(normalized,/viewBox="-10 -20 70 140"/);assert.match(normalized,/<path d="M0 0L20 20"\/>/);
});
test('uncalculated steps export an honest source CP placeholder, preserving project data',()=>{
  const p=project(2),saved=JSON.stringify(p),svg=diagramPDFStepSVG(p,p.steps[0]);assert.match(svg,/<svg/);assert.match(svg,/viewBox="0 0 200 200"/);assert.equal(JSON.stringify(p),saved);
});
function posedProject() {
  const p=project(2),doc=blankDoc('已计算折图',100,100);doc.segments.push({id:'valley',a:[50,0],b:[50,100],assignment:'V',angle:180});
  p.states[0].doc=structuredClone(doc);p.states[1].doc=structuredClone(doc);
  p.steps[0].pose={sourceStateId:'c0',sourceRevision:1,sourceDoc:structuredClone(doc),result:computeFlatFold(doc)};
  assert.equal(p.steps[0].pose.result.geometry.status,'ready');p.steps[0].foldLink={enabled:true,layers:'all',selectedFaces:[]};
  p.steps[0].annotations=[{id:'retained-line',kind:'line',a:[10,20],b:[35,25],style:'valley',width:.7,color:'#7f12ab'}];return p;
}
function assertPreservedDrawing(svg:string,step:DiagramProject['steps'][number]) {
  const expected=drawingSVG(step.pose,step.annotations!,'','',undefined);
  // PDF may frame the artwork differently. Its saved material paths and every
  // independent teaching mark must remain identical, without projecting CP.
  const artwork=(value:string)=>[...value.matchAll(/<(?:path|line)\b[^>]*\/>/g)].map(match=>match[0]);
  assert.deepEqual(artwork(svg),artwork(expected));assert.match(svg,/#7f12ab/);assert.match(svg,/data-diagram-paper-face/);
}
test('an after-CP model exports its current pose and annotations without trying a before-CP projection',()=>{
  const p=posedProject(),step=p.steps[0];step.pose!.sourceStateId='c1';const saved=JSON.stringify(p);
  assertPreservedDrawing(diagramPDFStepSVG(p,step),step);assert.equal(JSON.stringify(p),saved);
});
test('a stale source revision exports the preserved drawing, without changing CP or model geometry',()=>{
  const p=posedProject(),step=p.steps[0];p.states[0].revision++;const saved=JSON.stringify(p);
  assertPreservedDrawing(diagramPDFStepSVG(p,step),step);assert.equal(JSON.stringify(p),saved);
});
test('a changed CP snapshot at the same revision also keeps the independent canvas drawing',()=>{
  const p=posedProject(),step=p.steps[0];p.states[0].doc.segments.push({id:'changed',a:[0,30],b:[100,30],assignment:'F',angle:0});const saved=JSON.stringify(p);
  assertPreservedDrawing(diagramPDFStepSVG(p,step),step);assert.equal(JSON.stringify(p),saved);
});
test('a mapping failure for a manually changed pose falls back to its drawing instead of rejecting the PDF',()=>{
  const p=posedProject(),step=p.steps[0],vertices=step.pose!.result.geometry.vertices;vertices[0]=[...vertices[1]];const saved=JSON.stringify(p);
  assertPreservedDrawing(diagramPDFStepSVG(p,step),step);assert.equal(JSON.stringify(p),saved);
});
