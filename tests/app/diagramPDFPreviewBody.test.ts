import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {addDiagramBranch,appendDiagramStep,createDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {createDiagramPDFPreviewPlanner} from '../../src/app/diagramPDFPreviewPlan';
import {defaultDiagramPDFPaint,defaultDiagramPDFRibbon,diagramPDFPageSeams} from '../../src/app/diagramPDFDecoration';
import {readDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {previewPageBody,loadPreviewPageBody,clearPreviewPageBodies,retainPreviewPageBodies} from '../../src/components/diagramPDFPreviewBody';
import {diagramPDFPreviewBodySVG} from '../../src/app/diagramPDFPage';

test('visible paper is reused for paint, seam edits and returning to a page, while text and layout invalidate it',()=>{
  let project=createDiagramProject(blankDoc('预览重绘',200,200));
  while(project.steps.length<9)project=appendDiagramStep(project);
  project=addDiagramBranch(project,project.activeStepId);
  const planner=createDiagramPDFPreviewPlanner(),palette=readDiagramLineDefaults();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'2x2',readingOrder:'snake',ribbon:defaultDiagramPDFRibbon()};
  const plan=planner(project,options);
  const first=previewPageBody(project,options,plan,0,palette,true);
  const second=previewPageBody(project,options,plan,1,palette,true);
  assert.notEqual(first,second);
  const seam=diagramPDFPageSeams(options,plan,plan.pages[0]).find(seam=>seam.kind==='outgoing')!;
  const edited={...options,pageBackground:defaultDiagramPDFPaint('#aabbcc'),ribbon:{...options.ribbon!,widthMm:9},ribbonSeamHeights:{[seam.key]:.38}};
  const next=planner(project,edited);
  assert.equal(previewPageBody(project,edited,next,1,palette,true),second);
  assert.equal(previewPageBody(project,edited,next,0,palette,true),first);
  const recolored={...edited,pageTextColor:'#551111'};
  assert.equal(previewPageBody(project,recolored,planner(project,recolored),0,palette,true),first,'page ink is painted without rebuilding artwork');
  const grid={...options,pageLayouts:{0:{rows:1,columns:1}}};
  assert.notEqual(previewPageBody(project,grid,planner(project,grid),0,palette,true),first);
});

test('a 12-page project retains both large spread pages and earlier pages within the byte budget',()=>{
  let project=createDiagramProject(blankDoc('多页复杂折图',200,200));
  while(project.steps.length<12)project=appendDiagramStep(project);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'1x1' as const};
  const plan=createDiagramPDFPreviewPlanner()(project,options),palette=readDiagramLineDefaults();
  const bodies=plan.pages.map((_,index)=>{
    const page=previewPageBody(project,options,plan,index,palette,true);
    page.svg='x'.repeat(index===10?3_614_071:index===11?1_899_726:1_500_000);
    return page;
  });
  for(const index of [10,11,10,11,0,1,10,11])assert.equal(previewPageBody(project,options,plan,index,palette,true),bodies[index]);
  clearPreviewPageBodies(project);
});

test('oversized spread stays resident while old pages are evicted',()=>{
  let project=createDiagramProject(blankDoc('大图片',200,200));
  while(project.steps.length<3)project=appendDiagramStep(project);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'1x1' as const};
  const plan=createDiagramPDFPreviewPlanner()(project,options),palette=readDiagramLineDefaults();
  const bodies=plan.pages.map((_,index)=>{
    const page=previewPageBody(project,options,plan,index,palette,true);page.svg='x'.repeat(20*1024*1024);return page;
  });
  assert.equal(previewPageBody(project,options,plan,1,palette,true),bodies[1]);
  assert.equal(previewPageBody(project,options,plan,2,palette,true),bodies[2]);
  assert.notEqual(previewPageBody(project,options,plan,0,palette,true),bodies[0]);
  clearPreviewPageBodies(project);
});

test('in-flight page work is shared across navigation and cancelled on changed layout or close',async()=>{
  const project=createDiagramProject(blankDoc('预览任务',200,200)),palette=readDiagramLineDefaults(),planner=createDiagramPDFPreviewPlanner();
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const},plan=planner(project,options);
  const page=previewPageBody(project,options,plan,0,palette,true);
  const first=loadPreviewPageBody(page);
  assert.equal(loadPreviewPageBody(previewPageBody(project,{...options,pageTextColor:'#ff0000'},plan,0,palette,true)),first);
  assert.equal(await first,diagramPDFPreviewBodySVG(...page.args));
  assert.equal(await loadPreviewPageBody(page),page.svg);
  const nextOptions={...options,orientation:'landscape' as const};
  const next=previewPageBody(project,nextOptions,planner(project,nextOptions),0,palette,true);
  const cancelled=loadPreviewPageBody(next);
  const rejected=assert.rejects(cancelled,{name:'AbortError'});
  previewPageBody(project,options,planner(project,options),0,palette,true);
  await rejected;
  assert.equal(next.svg,undefined);
  const last=previewPageBody(project,options,planner(project,options),0,palette,true);
  const closed=assert.rejects(loadPreviewPageBody(last),{name:'AbortError'});
  clearPreviewPageBodies(project);await closed;
  assert.equal(last.svg,undefined);
});

test('backward spread navigation protects the overlapping page even when it was not recently requested',()=>{
  let project=createDiagramProject(blankDoc('双页回翻',200,200));
  while(project.steps.length<3)project=appendDiagramStep(project);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'1x1' as const};
  const plan=createDiagramPDFPreviewPlanner()(project,options),palette=readDiagramLineDefaults();
  const overlapping=previewPageBody(project,options,plan,1,palette,true,[1,2]);
  overlapping.svg='x'.repeat(20*1024*1024);
  previewPageBody(project,options,plan,2,palette,true,[1,2]).svg='x'.repeat(20*1024*1024);
  const first=previewPageBody(project,options,plan,0,palette,true,[0,1]);
  first.svg='x'.repeat(20*1024*1024);
  assert.equal(previewPageBody(project,options,plan,1,palette,true,[0,1]),overlapping);
  assert.equal(previewPageBody(project,options,plan,0,palette,true,[0,1]),first);
  clearPreviewPageBodies(project);
});

test('effect remount retains in-flight work but final unmount cancels it',async()=>{
  const project=createDiagramProject(blankDoc('重挂载',200,200)),palette=readDiagramLineDefaults(),options=defaultDiagramPDFOptions(project);
  const plan=createDiagramPDFPreviewPlanner()(project,options),page=previewPageBody(project,options,plan,0,palette,true);
  const release=retainPreviewPageBodies(project),pending=loadPreviewPageBody(page);
  release();const releaseAgain=retainPreviewPageBodies(project);
  await Promise.resolve();
  assert.equal(loadPreviewPageBody(page),pending);
  await pending;releaseAgain();await Promise.resolve();
  assert.notEqual(previewPageBody(project,options,plan,0,palette,true),page);
  clearPreviewPageBodies(project);
});
