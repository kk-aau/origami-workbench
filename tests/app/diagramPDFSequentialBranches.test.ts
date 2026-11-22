import assert from 'node:assert/strict';
import test from 'node:test';
import {diagramPDFSequentialRuns,layoutDiagramPDFSequentialBranches} from '../../src/app/diagramPDFSequentialBranches';
import type {DiagramPDFBranchNode,DiagramPDFBranchPageSpec} from '../../src/app/diagramPDFBranchLayout';
import {createDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFCellContent,resolveDiagramPanel,diagramPDFCaptionNumber} from '../../src/app/diagramPDFLayout';
import {diagramPDFMainRouteChoices} from '../../src/app/diagramPDFBranchPanels';
import {validateDiagramExportSettings} from '../../src/app/diagramExportSettings';
import {createDiagramPDFPreviewPlanner} from '../../src/app/diagramPDFPreviewPlan';
import {diagramPDFPageSVG,diagramPDFPreviewBodySVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';

const parents=[null,0,1,2,3,4,5,0,7,8,4];
const nodes:DiagramPDFBranchNode[]=parents.map((p,i)=>({id:String(i),parentId:p===null?undefined:String(p),stepIndex:i}));
const grid:DiagramPDFBranchPageSpec={bounds:{x:30,y:60,width:510,height:680},columns:3,rows:3,gap:12};

test('complete route length wins over remaining suffix length and shared ancestors print once',()=>{
  const runs=diagramPDFSequentialRuns(nodes);
  assert.deepEqual(runs.map(r=>r.map(n=>n.id)),[['0','1','2','3','4','5','6'],['10'],['7','8','9']]);
  assert.equal(new Set(runs.flat().map(n=>n.id)).size,nodes.length);
});

test('alternate routes start on the next row and leave the remainder of the previous row empty',()=>{
  const pages=layoutDiagramPDFSequentialBranches(nodes,()=>grid);
  assert.deepEqual(pages.map(p=>p.cells.length),[7,4]);
  assert.deepEqual(pages[0].cells.at(-1)?.entrySlot,[2,0]);
  assert.deepEqual(pages[1].cells.map(c=>[c.id,c.entrySlot]),[['10',[0,0]],['7',[1,0]],['8',[1,1]],['9',[1,2]]]);
  assert.ok(pages[0].edges.some(e=>e.from==='4'&&e.to==='10'&&e.kind==='outgoing'&&e.otherPage===1));
});

test('process figures remain in the chain without counting as additional folding steps',()=>{
  const withFigures:DiagramPDFBranchNode[]=[...nodes,{id:'f1',parentId:'9',stepIndex:9,figureIndex:0},{id:'f2',parentId:'f1',stepIndex:9,figureIndex:1},{id:'f3',parentId:'f2',stepIndex:9,figureIndex:2}];
  assert.deepEqual(diagramPDFSequentialRuns(withFigures).map(r=>r.map(n=>n.id)),[
    ['0','1','2','3','4','5','6'],['10'],['7','8','9','f1','f2','f3'],
  ]);
});

test('stable ties, independent roots, page capacity and changing grids preserve every node',()=>{
  const forest=[...nodes,{id:'root2',stepIndex:0}];
  const pages=layoutDiagramPDFSequentialBranches(forest,i=>i===0?{...grid,columns:2,rows:2,count:3}:{...grid,columns:2,rows:3});
  assert.equal(pages[0].cells.length,3);
  assert.deepEqual(pages.flatMap(p=>p.cells.map(c=>c.id)).sort(),forest.map(n=>n.id).sort());
  const ties=[{id:'r',stepIndex:0},{id:'b',parentId:'r',stepIndex:1},{id:'a',parentId:'r',stepIndex:1}];
  assert.deepEqual(diagramPDFSequentialRuns(ties).map(r=>r.map(n=>n.id)),[['r','b'],['a']]);
  assert.throws(()=>diagramPDFSequentialRuns([{id:'a',parentId:'b',stepIndex:0},{id:'b',parentId:'a',stepIndex:0}]),/循环/);
});

function projectFixture(){
  const project=createDiagramProject(blankDoc('顺序分支',100,100)),step=project.steps[0],state=project.states[1];
  project.steps[0]={...step,id:'0',afterId:'0-cp'};project.states[1]={...state,id:'0-cp'};project.activeStepId='0';
  project.branchSteps=nodes.slice(1).map(n=>({parentId:n.parentId!,step:{...step,id:n.id,title:'',beforeId:n.parentId+'-cp',afterId:n.id+'-cp'},after:{...state,id:n.id+'-cp'}}));
  project.branchOrder=nodes.map(n=>n.id);
  return project;
}

test('only alternate branch starts show their source page and exported number in preview and export',()=>{
  const project=projectFixture(),options={...defaultDiagramPDFOptions(project),readingOrder:'rows' as const,cover:'standard' as const,layout:'3x3' as const,descriptions:false};
  const plan=planDiagramPDF(project,options),cells=plan.pages.flatMap((p,i)=>p.cells.map(c=>({c,page:i+1})));
  const find=(id:string)=>cells.find(({c})=>c.branchStepId===id)!;
  const source=find('4'),target=find('10');
  assert.equal(source.page,2);assert.equal(target.page,3);
  assert.equal(source.c.branchReadingNotes,undefined);
  assert.equal(source.c.displayNumber,'5');assert.equal(target.c.displayNumber,'8');
  assert.deepEqual(target.c.branchReadingNotes,['续第 2 页 · 第 5 步']);
  assert.equal(cells.filter(({c})=>c.branchReadingStart).length,2);
  assert.ok(cells.every(({c})=>!!c.branchReadingNotes===!!c.branchReadingStart));
  const content=diagramPDFCellContent(resolveDiagramPanel(project,target.c).step,target.c,options,plan);
  assert.ok(content.captionLines.some(l=>l.text.includes('续第 2 页')),'guidance remains when descriptions are hidden');
  assert.ok(content.captionLines.every(l=>l.y>=content.imageRect.y+content.imageRect.height));
  for(const render of [diagramPDFPageSVG,diagramPDFPreviewBodySVG]){
    const svg=render(project,options,plan,target.page-1,defaultDiagramLineDefaults(),true);
    assert.match(svg,/续第 2 页/);assert.ok(!svg.includes('data-pdf-ribbon='));
    assert.match(svg,/>8\.<\/text>/);
    assert.equal((svg.match(/data-pdf-branch-separator="true"/g)??[]).length,2);
    assert.ok(!svg.includes('data-pdf-branch-continuation='),'ribbon edge labels do not duplicate the reading notes');
  }
  const omitted=planDiagramPDF(project,{...options,readingOrder:undefined});
  assert.deepEqual(omitted.pages.map(p=>p.cells.map(c=>c.branchStepId)),plan.pages.map(p=>p.cells.map(c=>c.branchStepId)));
  const snake=planDiagramPDF(project,{...options,readingOrder:'snake'});
  assert.ok(snake.pages.every(p=>p.cells.every(c=>!c.branchReadingNotes)));
});

test('all cover types and page-specific grids keep continuation references accurate',()=>{
  const project=projectFixture();
  for(const cover of ['none','standard','diagram'] as const){
    const options={...defaultDiagramPDFOptions(project),readingOrder:'rows' as const,cover,layout:'3x4' as const,
      introLayout:'1x1' as const,pageLayouts:{2:{columns:2,rows:2,count:3}}};
    const plan=planDiagramPDF(project,options);
    const locations=new Map(plan.pages.flatMap((p,i)=>p.cells.map(c=>[c.branchNodeId!,{c,page:i+1}] as const)));
    for(const page of plan.pages)for(const edge of page.branchEdges??[]){
      if(edge.kind!=='outgoing')continue;
      const source=locations.get(edge.from)!,target=locations.get(edge.to)!;
      assert.equal(edge.otherPage!+1,target.page);
      if(target.c.branchReadingStart)assert.deepEqual(target.c.branchReadingNotes,[`续第 ${source.page} 页 · 第 ${diagramPDFCaptionNumber(source.c)} 步`]);
      else assert.equal(target.c.branchReadingNotes,undefined,'ordinary page breaks need no continuation note');
    }
    for(const {c} of locations.values()){
      const content=diagramPDFCellContent(resolveDiagramPanel(project,c).step,c,options,plan);
      assert.ok(content.imageRect.height>=24);
      assert.ok(content.captionLines.every(l=>l.y+l.fontSize<=c.y+c.height));
    }
  }
});

test('selected shorter route prints first, all other routes retain length order and missing selection falls back',()=>{
  assert.deepEqual(diagramPDFSequentialRuns(nodes,'9').map(r=>r.map(n=>n.id)),[['0','7','8','9'],['1','2','3','4','5','6'],['10']]);
  assert.deepEqual(diagramPDFSequentialRuns(nodes,'deleted'),diagramPDFSequentialRuns(nodes));
  const project=projectFixture(),before=structuredClone(project);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,readingOrder:'rows' as const,layout:'3x3' as const,sequentialMainStepId:'9'};
  const cells=planDiagramPDF(project,options).pages.flatMap(p=>p.cells);
  assert.deepEqual(cells.map(c=>c.branchStepId),['0','7','8','9','1','2','3','4','5','6','10']);
  assert.deepEqual(cells.map(diagramPDFCaptionNumber),Array.from({length:11},(_,i)=>String(i+1)));
  assert.deepEqual(cells.filter(c=>c.branchReadingStart).map(c=>c.branchStepId),['1','10']);
  assert.ok(cells.filter(c=>c.branchReadingStart).every(c=>c.entrySlot?.[1]===0));
  assert.deepEqual(project,before,'export ordering and labels must not change editor data');
  const route=planDiagramPDF(project,{...options,scope:'route'}).pages.flatMap(p=>p.cells);
  assert.ok(route.every(c=>/^\d+(?:-\d+)?$/.test(diagramPDFCaptionNumber(c))));
});

test('endpoint choices include trailing figures, keep host numbering and persist through export settings',()=>{
  const project=projectFixture();
  project.branchSteps!.find(b=>b.step.id==='9')!.step.processFigures=[createDiagramProject(blankDoc('局部过程',100,100))];
  const choices=diagramPDFMainRouteChoices(project);
  assert.deepEqual(choices.map(c=>[c.stepId,c.length]),[['6',7],['10',6],['9',4]]);
  project.exportSettings={pdf:{sequentialMainStepId:'9'}};
  const saved=JSON.parse(JSON.stringify(project.exportSettings));
  validateDiagramExportSettings(saved);
  assert.equal(saved.pdf.sequentialMainStepId,'9');
  assert.throws(()=>validateDiagramExportSettings({pdf:{sequentialMainStepId:''}}),/主线/);
  const options={...defaultDiagramPDFOptions(project),...saved.pdf,cover:'none' as const,readingOrder:'rows' as const,layout:'3x3' as const};
  const cells=planDiagramPDF(project,options).pages.flatMap(p=>p.cells);
  assert.deepEqual(cells.slice(0,5).map(diagramPDFCaptionNumber),['1','2','3','4','4-1']);
  assert.equal(cells[5].displayNumber,'5');
  for(const mode of ['rows','snake'] as const){
    const numbered=planDiagramPDF(project,{...options,readingOrder:mode}).pages.flatMap(p=>p.cells);
    const host=numbered.find(c=>c.branchStepId==='9'&&c.figureIndex===undefined)!;
    assert.equal(numbered.find(c=>c.figureIndex===0)!.displayNumber,host.displayNumber+'-1');
    assert.ok(numbered.every(c=>/^\d+(?:-\d+)?$/.test(diagramPDFCaptionNumber(c))));
  }
});

test('changing selected main route invalidates preview layout but never changes snake layout',()=>{
  const project=projectFixture(),options={...defaultDiagramPDFOptions(project),readingOrder:'rows' as const};
  const planner=createDiagramPDFPreviewPlanner(),first=planner(project,options),changed={...options,sequentialMainStepId:'9'};
  const next=planner(project,changed);
  assert.notDeepEqual(next.pages.flatMap(p=>p.cells.map(c=>c.branchStepId)),first.pages.flatMap(p=>p.cells.map(c=>c.branchStepId)));
  assert.deepEqual(next,planDiagramPDF(project,changed));
  assert.deepEqual(planner(project,options),first);
  assert.deepEqual(planDiagramPDF(project,{...options,readingOrder:'snake'}),planDiagramPDF(project,{...changed,readingOrder:'snake'}));
});
