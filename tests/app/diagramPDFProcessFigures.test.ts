import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,appendDiagramStep,adoptDiagramPose,createDiagramProcessFigure} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,diagramPanelNumber,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramStepImagePanelSVG,diagramStepImagePanels,diagramStepImageFilename,prepareDiagramImageProject} from '../../src/app/diagramImageExport';
import {diagramThumbnailSVG} from '../../src/app/diagramThumbnail';
import type {DiagramImage} from '../../src/app/diagramImages';
import {prepareDiagramPDFProject,diagramPDFStepArtwork,diagramPDFCoverFrame} from '../../src/app/diagramPDF';
import {computeFlatFold} from '../../src/core/flatFold';

function independentFigure(title:string){
  let sequence=0;
  const p=createDiagramProject(blankDoc('独立 CP',100,100),()=>`mini-${++sequence}`);
  p.steps[0].title=title;
  p.steps[0].annotations=[{id:'proof-arrow',kind:'symbol',symbol:'unfold',position:[50,50],size:32,rotation:0,color:'#ba2781',width:.7}];
  return p;
}
test('process panels follow only selected parent steps across page breaks and retain independent artwork, notes and numbering',()=>{
  let p=createDiagramProject(blankDoc('主体',200,200));p=appendDiagramStep(p);p=appendDiagramStep(p);
  const step=p.steps[1],a=independentFigure('第一次近看'),b=independentFigure('第二次近看');b.steps[0].description='过程说明。'.repeat(200);
  step.processFigures=[a,b];p.steps[2].processFigures=[independentFigure('范围外')];p.activeStepId=step.id;
  const options={...defaultDiagramPDFOptions(p),scope:'current' as const,cover:'standard' as const,layout:'1x1' as const};
  const plan=planDiagramPDF(p,options),palette=defaultDiagramLineDefaults();
  assert.deepEqual(plan.selected,[1]);assert.equal(plan.coverStepIndex,2);
  assert.deepEqual(plan.pages.flatMap(page=>page.cells).map(diagramPanelNumber),['2','2-1','2-2']);
  const pages=plan.pages.map((_,i)=>diagramPDFPageSVG(p,options,plan,i,palette,true));
  assert.match(pages[2],/>2-1\.<\/text>/);assert.match(pages[2],/>第一次近看<\/text>/);assert.match(pages[2],/#ba2781/);assert.match(pages[3],/>2-2\.<\/text>/);assert.match(pages[3],/>第二次近看<\/text>/);
  assert.equal(plan.pages.flatMap(page=>page.notes.flatMap(note=>note.lines)).join(''),b.steps[0].description);
  assert.match(pages[4],/2-2\. 第二次近看/);assert.doesNotMatch(pages.join(''),/范围外/);
  const panels=diagramStepImagePanels(p,options);assert.deepEqual(panels.map(diagramPanelNumber),['2','2-1','2-2']);
  assert.match(diagramStepImagePanelSVG(p,panels[1],palette,true),/#ba2781/);
  assert.equal(diagramStepImageFilename(a.steps[0],1,0),'002-001_第一次近看.png');
});

test('a process figure is prepared against its own CP and unresolved paper identifies its parent and figure number',async()=>{
  const p=createDiagramProject(blankDoc('父 CP',200,200)),f=independentFigure('局部');
  const step=f.steps[0],{doc,revision}=f.states[0],result=computeFlatFold(doc);
  step.pose={sourceStateId:'missing',sourceRevision:revision,sourceDoc:doc,result:{...result,layers:{status:'unknown',message:'需要层序'}}};
  p.steps[0].processFigures=[f];const options=defaultDiagramPDFOptions(p),original=structuredClone(p);
  for(const prepare of [prepareDiagramPDFProject,prepareDiagramImageProject]){
    await assert.rejects(prepare(p,options),/第 1-1 步（局部）/);assert.deepEqual(p,original);
  }
});

test('small screenshot steps and process figures fit their visible size independently of physical paper size',()=>{
  const p=createDiagramProject(blankDoc('test',200,200)),s=p.steps[0],palette=defaultDiagramLineDefaults();
  const image:DiagramImage={id:'i',name:'capture',source:'simulation' as const,position:[50,60] as [number,number],
    width:.4,height:.2,pixelWidth:1,pixelHeight:1,rotation:0,
    dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f+D0fwAI1gOKrQfC8QAAAABJRU5ErkJggg=='};
  s.paperVisible=false;s.images=[image];
  const box=(svg:string)=>svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
  const ordinary=box(diagramPDFStepArtwork(s,p.states,undefined,palette,true));
  assert.ok(Math.abs(ordinary[2]-.528)<1e-9);
  assert.ok(Math.abs(diagramPDFCoverFrame(s).width-.424)<1e-9);
  assert.deepEqual(box(diagramThumbnailSVG(s,p.states,{lineDefaults:palette,adaptiveLines:true})),ordinary);
  image.source='file';
  const figure=box(diagramPDFStepArtwork(s,p.states,undefined,palette,true,undefined,undefined,true));
  assert.deepEqual(figure,ordinary);
  const explicit=box(diagramPDFStepArtwork(s,p.states,undefined,palette,true,{kind:'circle',center:[50,60],radius:10},undefined,true));
  assert.ok(explicit[2]>20);
  s.annotations=[{id:'arrow',kind:'symbol',symbol:'fold',position:[52,60],size:.5,rotation:0,color:'#884422',width:.05}];
  assert.ok(box(diagramPDFStepArtwork(s,p.states,undefined,palette,true,undefined,undefined,true))[2]>2);
});

test('a copied process drawing uses its parent’s print scale even with an outside view symbol',()=>{
  const doc=blankDoc('比例对照',80,160);
  const initial=createDiagramProject(doc);
  const p=adoptDiagramPose(initial,initial.steps[0].id,initial.steps[0].beforeId,computeFlatFold(doc));
  const host=p.steps[0],palette=defaultDiagramLineDefaults();
  host.annotations=[{id:'turn',kind:'symbol',symbol:'flip',position:[400,80],size:20,rotation:0,color:'#293d35',width:.7}];
  host.processFigures=[createDiagramProcessFigure(p,host.id,'copy')];
  const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'1x1' as const,scaleIndicators:true,scaleChangePercent:0};
  const plan=planDiagramPDF(p,options),panels=diagramStepImagePanels(p,options);
  const contents=(page:string)=>page.match(/<svg\b[^>]*viewBox="([^"]+)"[^>]*><g data-pdf-main-artwork/)?.[1];
  const pages=plan.pages.map((_,i)=>diagramPDFPageSVG(p,options,plan,i,palette,true));
  const pngs=panels.map(panel=>diagramStepImagePanelSVG(p,panel,palette,true));
  for(const output of [pages,pngs]){
    assert.equal(output.length,2);
    assert.ok(contents(output[0]));
    assert.equal(contents(output[0]),contents(output[1]));
    for(const svg of output)assert.match(svg,/data-pdf-direction-symbol="flip"/);
    assert.doesNotMatch(output[0],/data-scale-from=/);
  }
});

test('a previously inserted image inherits a later-authored host zoom in both page and standalone export',async()=>{
  const {diagramProcessFigureZoom}=await import('../../src/app/diagramStepZoom');
  const p=createDiagramProject(blankDoc('主图',100,100)),host=p.steps[0],f=independentFigure('动画 57%');
  const s=f.steps[0];s.paperVisible=false;s.annotations=[];
  s.images=[{id:'capture',name:'中间帧',source:'simulation',position:[10,20],width:50,height:80,rotation:0,pixelHeight:1,pixelWidth:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f+D0fwAI1gOKrQfC8QAAAABJRU5ErkJggg=='}];
  host.processFigures=[f];const zoom={id:'mark',kind:'symbol' as const,symbol:'zoom' as const,position:[25,25] as [number,number],size:10,rotation:0,color:'#112233',width:1,zoomArea:{basis:{x:0,y:0,width:100,height:100},region:{kind:'circle' as const,center:[50,25] as [number,number],radius:10}}};
  host.annotations=[zoom];
  const options=defaultDiagramPDFOptions(p),palette=defaultDiagramLineDefaults(),plan=planDiagramPDF(p,options);
  assert.deepEqual(diagramProcessFigureZoom(p,host,f),{kind:'circle',center:[35,40],radius:8});
  const page=diagramPDFPageSVG(p,options,plan,0,palette,true),panels=diagramStepImagePanels(p,options);
  assert.match(page,/<g data-pdf-step="1-1">[\s\S]*?data-diagram-zoom="circle"/);
  assert.match(diagramStepImagePanelSVG(p,panels[1],palette,true),/data-diagram-zoom="circle"/);
  host.annotations.push({...zoom,id:'reset',symbol:'zoomOut',zoomArea:undefined});
  assert.equal(diagramProcessFigureZoom(p,host,f),null);
});
