import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,duplicateDiagramStep,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {DIAGRAM_PDF_LAYOUTS,defaultDiagramPDFOptions,planDiagramPDF,diagramPDFReadingGuides} from '../../src/app/diagramPDFLayout';
import {diagramPDFRibbonNodes} from '../../src/app/diagramPDFDecoration';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramExportPagePanels} from '../../src/app/diagramExportPanel';
function fixture(count=23){let p=createDiagramProject(blankDoc('蛇形阅读',100,100));while(p.steps.length<count)p=duplicateDiagramStep(p,p.activeStepId);p.steps.forEach((s,i)=>{s.title=`动作 ${i+1}`;s.description=`步骤 ${i+1} 的说明。`;});return p;}
test('every grid preserves exact step identity and captions while alternating row placement, including partial final rows',()=>{
  const p=fixture(),saved=structuredClone(p);
  for(const layout of DIAGRAM_PDF_LAYOUTS)for(const paper of ['A3','A4'] as const)for(const orientation of ['portrait','landscape'] as const){
    const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:layout.id,paper,orientation},normal=planDiagramPDF(p,options),snake=planDiagramPDF(p,{...options,readingOrder:'snake'});
    assert.deepEqual(snake.selected,normal.selected);assert.equal(snake.pages.length,normal.pages.length);
    snake.pages.forEach((page,index)=>{
      const allX=page.cells.map(c=>c.x);
      assert.equal(page.cells[0].x,Math.min(...allX));
      for(let i=1;i<page.cells.length;i++){
        const cell=page.cells[i],prev=page.cells[i-1],row=Math.floor(i/layout.columns);
        if(i%layout.columns===0)assert.equal(cell.x,prev.x,'turn in the same column');
        else {assert.equal(cell.y,prev.y);assert.equal(cell.x>prev.x,row%2===0);}
      }
      page.cells.forEach((cell,slot)=>{
        const original=normal.pages[index].cells[slot];
        assert.equal(cell.stepIndex,original.stepIndex);assert.deepEqual(cell.descriptionLines,original.descriptionLines);
      });
    });
    for(const page of snake.pages){const guides=diagramPDFReadingGuides(page,{...options,readingOrder:'snake'});assert.equal(guides.length,Math.max(0,page.cells.length-1));for(const guide of guides){assert.equal(guide.end,guide.start+1);for(const [x,y] of [guide.from,guide.to])assert.ok(!page.cells.some(c=>x>=c.x&&x<=c.x+c.width&&y>=c.y&&y<=c.y+c.height),'reading guide stays outside cells');}}
  }
  assert.deepEqual(p,saved);
});
test('snake pages alternate their vertical starting edge; range numbering and complete appendix stay in logical order',()=>{
  const p=fixture(30);p.steps[4].description='保留完整说明。'.repeat(1500);
  const options={...defaultDiagramPDFOptions(p),introLayout:'2x3' as const,layout:'3x2' as const,readingOrder:'snake' as const,scope:'range' as const,rangeStart:4,rangeEnd:19},plan=planDiagramPDF(p,options);
  assert.deepEqual(plan.pages.flatMap(page=>page.cells.map(c=>c.stepIndex)),Array.from({length:16},(_,i)=>i+3));
  const grids=plan.pages.filter(page=>page.cells.length);
  assert.equal(grids[0].cells[0].x,plan.margin);
  for(const page of grids)assert.equal(page.cells[0].x,plan.margin);
  assert.ok(grids[1].cells[0].y>grids[1].cells.at(-1)!.y);
  assert.equal(plan.pages.filter(page=>page.kind==='notes').flatMap(page=>page.notes.flatMap(n=>n.lines)).join(''),p.steps[4].description);
  assert.ok(plan.pages.filter(page=>page.kind==='notes').every(page=>diagramPDFReadingGuides(page,options).length===0));
});
test('preview/export SVG shares gutter guides, keeps logical text order and leaves legacy/default grids unchanged',()=>{
  const p=fixture(9),options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,readingOrder:'snake' as const},plan=planDiagramPDF(p,options),svg=diagramPDFPageSVG(p,options,plan,0,defaultDiagramLineDefaults(),true);
  assert.equal((svg.match(/data-pdf-reading-guide=/g)??[]).length,8);assert.match(svg,/rotate\(180\)/);assert.match(svg,/rotate\(90\)/);
  assert.deepEqual([...svg.matchAll(/data-pdf-step="(\d+)"/g)].map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9]);assert.doesNotMatch(svg,/<image/);
  const old={...options,readingOrder:undefined},rows={...options,readingOrder:'rows' as const};assert.deepEqual(planDiagramPDF(p,old),planDiagramPDF(p,rows));assert.deepEqual(diagramPDFReadingGuides(plan.pages[0],rows),[]);assert.throws(()=>planDiagramPDF(p,{...options,readingOrder:'spiral' as any}),/阅读顺序/);
});

test('custom grid and free pages follow the actual previous exit on a partially filled page',()=>{
  const p=fixture(18);
  for(const layoutMode of ['grid','free'] as const){
    const options={...defaultDiagramPDFOptions(p),readingOrder:'snake' as const,layoutMode,pageLayouts:{0:{columns:3,rows:4,count:3},1:{columns:4,rows:2,count:1}}};
    const plan=planDiagramPDF(p,options),[first,second,third]=plan.pages;
    const center=(cell:typeof first.cells[number])=>cell.x+cell.width/2;
    assert.ok(center(first.cells[0])<plan.width/2&&center(first.cells[2])>plan.width/2);
    assert.ok(center(second.cells[0])<plan.width/2&&center(third.cells[0])<plan.width/2);
    assert.ok(second.cells[0].y<plan.height/2&&third.cells[0].y<plan.height/2);
  }
});

test('a single vertical page after a horizontal introduction reads 10–13 up the left column and exits at 21 in the top right',()=>{
  const p=fixture(21);
  for(const cover of ['diagram','standard'] as const){
    const options={...defaultDiagramPDFOptions(p),cover,layout:'3x3' as const,readingOrder:'snake' as const,
      pageLayouts:{[cover==='diagram'?1:2]:{columns:3,rows:4,count:12,snakeDirection:'vertical' as const}}};
    const plan=planDiagramPDF(p,options),page=plan.pages.filter(p=>p.cells.length)[1];
    const rows=[...new Set(page.cells.map(cell=>cell.y))].sort((a,b)=>a-b);
    const positions=rows.map(y=>page.cells.filter(c=>c.y===y).sort((a,b)=>a.x-b.x).map(c=>c.stepIndex+1));
    assert.deepEqual(positions,[[13,14,21],[12,15,20],[11,16,19],[10,17,18]]);
    const turn=diagramPDFReadingGuides(page,options)[2];
    assert.deepEqual(turn.labels,['12','13']);assert.ok(turn.from[1]>turn.to[1]);
  }
});

test('global direction survives incomplete final pages and local axis and grid settings round-trip independently',()=>{
  const project=fixture(15);
  for(const layoutMode of ['grid','free'] as const)for(const readingOrder of ['rows','snake'] as const){
    const pdf={cover:'standard' as const,layout:'2x3' as const,readingOrder,layoutMode,snakeDirection:'vertical' as const,
      pageLayouts:{2:{snakeDirection:'horizontal' as const,rows:2},3:{columns:3}}};
    const restored=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf}}));
    assert.deepEqual(restored.exportSettings!.pdf,pdf);
    const options={...defaultDiagramPDFOptions(restored),...restored.exportSettings!.pdf},plan=planDiagramPDF(restored,options);
    assert.deepEqual(plan.pages.map(page=>page.cells.length),[0,6,4,5]);
    for(const [index,expected] of [[1,'bottom'],[2,'right'],[3,'vertical']] as const){
      const panels=diagramExportPagePanels(restored,options,plan,index);
      const [a,b]=plan.pages[index].cells;
      if(expected==='right'){
        assert.ok(Math.abs(a.x-b.x)>Math.abs(a.y-b.y));
        assert.equal(panels[0].readingDirection,readingOrder==='snake'?'right':undefined);
      }else{
        assert.ok(Math.abs(a.y-b.y)>Math.abs(a.x-b.x));
        const direction=a.y<b.y?'bottom':'top';assert.equal(panels[0].readingDirection,direction);
      }
    }
    const legacy={...options,snakeDirection:undefined,pageLayouts:{2:{columns:2,rows:2}}};
    const defaulted=planDiagramPDF(project,legacy),horizontal=planDiagramPDF(project,{...legacy,snakeDirection:'horizontal'});
    assert.deepEqual(defaulted,horizontal);
    assert.throws(()=>planDiagramPDF(project,{...options,snakeDirection:'slant' as any}),/走向/);
    assert.throws(()=>planDiagramPDF(project,{...options,pageLayouts:{2:{snakeDirection:'slant' as any}}}),/走向/);
  }
});

test('a short vertical page takes its first column before moving right, including plain column resets and snake turns',()=>{
  const p=fixture(10);
  for(const readingOrder of ['rows','snake'] as const){
    const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'2x3' as const,readingOrder,snakeDirection:'vertical' as const};
    const plan=planDiagramPDF(p,options);
    const dirs=plan.pages.map((_,index)=>diagramExportPagePanels(p,options,plan,index).map(panel=>panel.readingDirection));
    assert.deepEqual(dirs[0].slice(0,5),readingOrder==='snake'?['bottom','bottom','right','top','top']:['bottom','bottom','right','bottom','bottom']);
    assert.deepEqual(dirs[1].slice(0,3),['bottom','bottom','right']);
  }
});

test('1–8 columns and rows with full and partial pages preserve numbering and share right-to-left ribbon seams',()=>{
  const project=fixture(67);
  for(let rows=1;rows<=8;rows++)for(let columns=1;columns<=8;columns++){
    for(const count of new Set([rows*columns,Math.max(1,rows*columns-1)]))for(const layoutMode of ['grid','free'] as const){
      const options={...defaultDiagramPDFOptions(project),cover:'none' as const,readingOrder:'snake' as const,layoutMode,
        pageLayouts:{0:{rows:1,columns:2,count:2},1:{rows,columns,count}}};
      const plan=planDiagramPDF(project,options);
      assert.deepEqual(plan.pages.flatMap(p=>p.cells.map(c=>c.stepIndex)),project.steps.map((_,i)=>i));
      let exit:number|undefined;
      const stepPages=plan.pages.filter(p=>p.cells.length);
      for(const [i,page] of stepPages.entries()){
        const nodes=diagramPDFRibbonNodes(options,plan,page);
        assert.equal(nodes[0][0]===0,i>0);assert.equal(nodes.at(-1)![0]===1,i<stepPages.length-1);
        assert.equal(nodes.length,page.cells.length+Number(i>0)+Number(i<stepPages.length-1));
        if(exit!==undefined)assert.equal(nodes[0][1],exit);
        exit=nodes.at(-1)![1];
      }
    }
  }
});
