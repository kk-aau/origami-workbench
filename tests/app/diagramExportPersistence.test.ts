import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,exportDiagramProject,importDiagramProject,type DiagramProject} from '../../src/app/diagramProject';
import {diagramFileCaptionEdits,sameDiagramProjectContent} from '../../src/app/diagramProjectContent';
import {encodePreparedDiagramFile,encodePreparedCaptionEdits,inspectPreparedDiagram} from '../../src/app/diagramPreparedFile';
import {makeDiagramRecoveryPatch,restoreDiagramRecoveryPatch} from '../../src/app/diagramRecoveryPatch';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {applyDiagramDrawingEdit} from '../../src/app/diagramProjectPreparation';

test('export metadata, layout and source CP survive full and incremental saves and draft recovery',async()=>{
  const base=createDiagramProject(blankDoc('旧工程',100,100));
  const doc=blankDoc('独立封面图',60,120);
  const next:DiagramProject={...base,exportSettings:{
    format:'images',coverCPSource:'file',pdf:{title:'方块人\nBlock Figure',author:'制图作者',designer:'设计者',headerNote:'封面附注',runningTitle:false,runningAuthor:true,runningDesigner:true,runningText:'课堂用图',
      paperInfo:'双色纸',paper:'A3',coverCPDoc:doc,coverCPLabel:'封面.cp',readingOrder:'snake',pageLayouts:{'0':{columns:2,rows:3,count:5}}},
    cp:{source:'editor',format:'svg',print:{paper:'A3',orientation:'landscape'},snapshot:{doc,name:'编辑区折痕图'}}}};
  const prepared=await encodePreparedDiagramFile(base),edits=diagramFileCaptionEdits(base,next)!;
  assert.equal(sameDiagramProjectContent(base,next),false);
  assert.deepEqual(edits.captions,[]);
  const updated=await encodePreparedCaptionEdits(prepared.text,edits);assert.ok(updated);
  const inspected=inspectPreparedDiagram(JSON.parse(updated))!;
  assert.ok(inspected.complete&&await inspected.matches(inspected.project));
  assert.deepEqual(JSON.parse(updated),JSON.parse((await encodePreparedDiagramFile(next)).text));
  const restored=restoreDiagramRecoveryPatch('base',base,JSON.stringify(makeDiagramRecoveryPatch('base',base,next)));
  for(const project of [restored,inspected.project,importDiagramProject(exportDiagramProject(next))]){
    assert.deepEqual(project.exportSettings,next.exportSettings);
    const options={...defaultDiagramPDFOptions(project),...project.exportSettings!.pdf};
    const svg=diagramPDFPageSVG(project,options,planDiagramPDF(project,options),0,defaultDiagramLineDefaults(),true);
    for(const label of ['方块人','Block Figure','制图作者','设计者','双色纸','封面附注'])assert.ok(svg.includes(label),label);
    const inner={...options,cover:'none' as const};
    const page=diagramPDFPageSVG(project,inner,planDiagramPDF(project,inner),0,defaultDiagramLineDefaults(),true);
    assert.ok(page.includes('设计者  ·  制图作者  ·  课堂用图'));assert.ok(!page.includes('Block Figure'));
    assert.equal(planDiagramPDF(project,{...inner,runningAuthor:false,runningDesigner:false,runningText:''}).header,0);
  }
  const cleared=await encodePreparedCaptionEdits(updated,diagramFileCaptionEdits(next,base)!);
  assert.deepEqual(JSON.parse(cleared!),JSON.parse(prepared.text));
  assert.equal(importDiagramProject(exportDiagramProject(base)).exportSettings,undefined);
});

test('a drawing completing after cover edits preserves the latest credits through save, save as and reopen',async()=>{
  const base=createDiagramProject(blankDoc('折序源稿',100,100));
  const old:DiagramProject={...base,exportSettings:{pdf:{title:'旧标题',designer:'旧设计者',author:'旧制图者'}}};
  const current:DiagramProject={...old,exportSettings:{pdf:{title:'作品\nWork',designer:'作者甲',author:'作者乙'}}};
  const pendingDrawing={...old,steps:old.steps.map(step=>({...step,title:'新折叠动作'}))};
  const next=applyDiagramDrawingEdit(pendingDrawing,current);
  assert.equal(next.steps,pendingDrawing.steps);
  assert.equal(next.exportSettings,current.exportSettings);
  const raw=(await encodePreparedDiagramFile(old)).text;
  const quick=await encodePreparedCaptionEdits(raw,diagramFileCaptionEdits(old,next)!);
  const copy=await encodePreparedDiagramFile({...next,name:'另存的文件名'});
  for(const text of [quick!,copy.text]){
    const reopened=inspectPreparedDiagram(JSON.parse(text))!.project;
    assert.deepEqual(reopened.exportSettings,current.exportSettings);
    assert.equal(reopened.steps[0].title,'新折叠动作');
  }
});

test('an old file inherits its name, while clearing the cover title and credits survives reopen and rendering',async()=>{
  const base=createDiagramProject(blankDoc('旧折序原名',100,100));
  const options=defaultDiagramPDFOptions(base);
  assert.equal(options.title,base.name);
  const old={...base,exportSettings:{pdf:{title:'作品',author:'制图者甲',designer:'设计者乙'}}};
  const cleared={...old,exportSettings:{pdf:{title:'',author:'',designer:''}}};
  const current=applyDiagramDrawingEdit(old,cleared);
  const text=await encodePreparedCaptionEdits((await encodePreparedDiagramFile(old)).text,diagramFileCaptionEdits(old,current)!);
  const reopened=inspectPreparedDiagram(JSON.parse(text!))!.project;
  assert.deepEqual(reopened.exportSettings,cleared.exportSettings);
  for(const cover of ['diagram','standard','none'] as const){
    const options={...defaultDiagramPDFOptions(reopened),...reopened.exportSettings?.pdf,cover,runningTitle:true,runningAuthor:true,runningDesigner:true};
    const plan=planDiagramPDF(reopened,options);
    const svg=diagramPDFPageSVG(reopened,options,plan,0,defaultDiagramLineDefaults(),true);
    for(const removed of [base.name,'作品','制图者甲','设计者乙'])assert.ok(!svg.includes('>'+removed+'<'),removed);
    assert.ok(!svg.includes('Infinity'));
  }
});
