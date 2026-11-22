import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../../src/app/state';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,createDiagramProcessFigure,selectDiagramBranchStep,updateDiagramStep,upsertDiagramProcessFigure} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,diagramPanelNumber,planDiagramPDF,resolveDiagramPanel} from '../../src/app/diagramPDFLayout';
import {diagramExportTransitions} from '../../src/app/diagramExportPanel';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {sameDiagramProjectContent} from '../../src/app/diagramProjectContent';
import {diagramBranchNumbering,setDiagramBranchLabels} from '../../src/app/diagramBranches';
import {diagramStepImageFilename} from '../../src/app/diagramImageExport';
import {XMLValidator} from 'fast-xml-parser';

function fixture(){
  let p=createDiagramProject(blankDoc('分叉',100,100));
  const root=p.activeStepId;
  p=appendDiagramStep(p);const left=p.activeStepId;
  p=updateDiagramStep(p,left,{title:'左边折起'});
  p=upsertDiagramProcessFigure(p,left,createDiagramProcessFigure(p,left,'copy'));
  p=addDiagramBranch(p,root);const right=p.activeStepId;
  p=updateDiagramStep(p,right,{title:'右边折起'});
  return {p,root,left,right};
}

test('branched export visits each real panel once, joins its actual parent and renders both routes on one page',()=>{
  const {p,left,right}=fixture();
  const opts={...defaultDiagramPDFOptions(p),cover:'none' as const};
  const plan=planDiagramPDF(p,opts);
  assert.equal(plan.pages.length,1);
  const page=plan.pages[0],cells=page.cells;
  assert.equal(new Set(cells.map(c=>resolveDiagramPanel(p,c).step.id)).size,4);
  const a=cells.find(c=>c.branchStepId===left&&c.figureIndex===undefined)!;
  const b=cells.find(c=>c.branchStepId===right)!;
  assert.equal(a.y,b.y);assert.notEqual(a.x,b.x);
  assert.deepEqual(new Set(cells.map(diagramPanelNumber)),new Set(['1','2A','2B','2A-1']));
  assert.deepEqual(new Set(diagramExportTransitions(p,plan).map(t=>t.label)),new Set(['1 → 2A','1 → 2B','2A → 2A-1']));
  const svg=diagramPDFPageSVG(p,opts,plan,0,defaultDiagramLineDefaults(),true);
  assert.ok(svg.includes('左边折起')&&svg.includes('右边折起'));
  assert.equal(planDiagramPDF(p,{...opts,scope:'route'}).pages[0].cells.length,2);
});

test('switching routes keeps sibling order and file content, and a continued PDF edge names both physical pages',()=>{
  const {p,left,right}=fixture();
  const switched=selectDiagramBranchStep(p,left);
  assert.ok(sameDiagramProjectContent(p,switched));
  assert.equal(sameDiagramProjectContent(p,updateDiagramStep(switched,left,{title:'另一个标题'})),false);
  const opts={...defaultDiagramPDFOptions(p),cover:'minimal' as const,layout:'1x1' as const};
  const plan=planDiagramPDF(switched,opts),edges=plan.pages.flatMap((page,index)=>(page.branchEdges??[]).map(e=>({...e,page:index})));
  assert.equal(plan.pages.length,5);
  const rightCell=plan.pages.flatMap(page=>page.cells).find(cell=>cell.branchStepId===right);
  assert.equal(rightCell?.branchLabel,'2B');
  for(const out of edges.filter(e=>e.kind==='outgoing')){
    assert.ok(edges.some(e=>e.kind==='incoming'&&e.from===out.from&&e.to===out.to&&e.page===out.otherPage&&e.otherPage===out.page));
  }
});

test('PDF pages, single-route exports, transition labels and image names use the authored branch numbers',()=>{
  const {p,root,left,right}=fixture();
  for(const [mode,leftLabel,rightLabel] of [
    ['number','2-1','2-2'],['lower','2a','2b'],['custom','2墨镜/款','2礼帽'],
  ] as const){
    const labels=mode==='custom'?{[left]:'墨镜/款',[right]:'礼帽'}:undefined;
    const project=selectDiagramBranchStep(setDiagramBranchLabels(p,root,mode,labels),left);
    const numbering=diagramBranchNumbering(project);
    const leftStep=project.steps.find(step=>step.id===left)!;
    assert.equal(numbering.cpLabels.get(leftStep.beforeId),'CP1');
    assert.equal(numbering.cpLabels.get(leftStep.afterId),'CP'+leftLabel);
    const opts={...defaultDiagramPDFOptions(project),cover:'none' as const};
    const plan=planDiagramPDF(project,opts);
    assert.deepEqual(new Set(plan.pages.flatMap(page=>page.cells.map(diagramPanelNumber))),new Set(['1',leftLabel,rightLabel,leftLabel+'-1']));
    const transitions=diagramExportTransitions(project,plan).map(t=>t.label);
    assert.ok(transitions.includes('1 → '+rightLabel)&&transitions.includes(leftLabel+' → '+leftLabel+'-1'));
    const svg=diagramPDFPageSVG(project,opts,plan,0,defaultDiagramLineDefaults(),true);
    assert.ok(svg.includes('data-pdf-step="'+leftLabel+'"')&&svg.includes('data-pdf-step="'+rightLabel+'"'));
    const route=planDiagramPDF(project,{...opts,scope:'route'});
    assert.deepEqual(route.pages.flatMap(page=>page.cells.map(diagramPanelNumber)),['1',leftLabel,leftLabel+'-1']);
    const file=diagramStepImageFilename(leftStep,1,0,leftLabel);
    assert.equal(file,'00'+leftLabel.replace('/','%2f')+'-001_左边折起.png');
  }
});

test('a custom name with punctuation survives SVG captions and reading arrows',()=>{
  const {p,root,left,right}=fixture();
  const project=selectDiagramBranchStep(setDiagramBranchLabels(p,root,'custom',{[left]:'A&B "特别款"',[right]:'常规'}),left);
  const options={...defaultDiagramPDFOptions(project),scope:'route' as const,cover:'none' as const,readingOrder:'snake' as const,ribbon:undefined};
  const svg=diagramPDFPageSVG(project,options,planDiagramPDF(project,options),0,defaultDiagramLineDefaults(),true);
  assert.equal(XMLValidator.validate(svg),true);
  assert.ok(svg.includes('data-pdf-reading-guide="1-2A&amp;B &quot;特别款&quot;"'));
});
