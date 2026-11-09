import test from 'node:test';
import assert from 'node:assert/strict';
import {XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,appendDiagramStep,adoptDiagramPose} from '../../src/app/diagramProject';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFCellContent} from '../../src/app/diagramPDFLayout';
import {diagramPDFStepArtwork} from '../../src/app/diagramPDF';
import {embedDiagramPDFSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramStepImagePanels,diagramStepImageSVG,diagramStepImageFilename,diagramImagePNG300DPI,prepareDiagramImageProject,exportDiagramImagesZIP} from '../../src/app/diagramImageExport';
import {settingsCRC32} from '../../src/app/oriconfigIntegrity';
import {diagramLayerDisplayState} from '../../src/app/diagramLayerDisplay';

function fixture(){
  let sequence=0;const ids=()=>`image-export-${++sequence}`,doc=blankDoc('图片包测试',100,100);
  let project=createDiagramProject(doc,ids);
  for(let index=0;index<3;index++)project=appendDiagramStep(project,ids);
  return project;
}

test('image packages retain original selected indices and actual PDF image rectangles without cover or notes',()=>{
  const project=fixture();project.steps[1].title='需要完整保留的长标题';project.steps[1].description='说明文字。'.repeat(500);
  const before=structuredClone(project),base=defaultDiagramPDFOptions(project);
  for(const scope of ['all','current','range'] as const)for(const cover of ['diagram','standard','none'] as const){
    const options={...base,scope,cover,rangeStart:2,rangeEnd:3},plan=planDiagramPDF(project,options),panels=diagramStepImagePanels(project,options);
    assert.deepEqual(panels.map(panel=>panel.stepIndex),plan.selected);
    assert.equal(new Set(panels.map(panel=>panel.stepIndex)).size,panels.length);
    for(const panel of panels){
      const cell=plan.pages.flatMap(page=>page.cells).find(cell=>cell.stepIndex===panel.stepIndex)!;
      const {width,height}=diagramPDFCellContent(project.steps[panel.stepIndex],cell,options,plan).imageRect;
      assert.deepEqual(panel.size,{width,height});
    }
  }
  assert.deepEqual(project,before);
});

test('standalone image wrapper embeds the exact PDF artwork without adding step captions or cover',()=>{
  const project=fixture(),step=project.steps[1],palette=defaultDiagramLineDefaults(),size={width:123.5,height:87};
  step.title='不可出现在图片中的标题';step.description='不可出现在图片中的说明';
  const artwork=diagramPDFStepArtwork(step,project.states,size,palette,true),svg=diagramStepImageSVG(step,project.states,size,palette,true);
  assert.equal(XMLValidator.validate(svg),true);
  assert.ok(svg.includes(embedDiagramPDFSVG(artwork,{x:0,y:0,...size},'step-image-')));
  assert.match(svg,/viewBox="0 0 123.5 87"/);assert.match(svg,/<rect width="123.5" height="87" fill="white"/);
  assert.doesNotMatch(svg,/不可出现在图片中|待计算折图|data-pdf-step=/);
  assert.throws(()=>diagramStepImageSVG(step,project.states,{width:0,height:80},palette,true),/尺寸无效/);
});

test('image names use original numbering and cannot introduce ZIP directories',()=>{
  const step=fixture().steps[0];step.title='../CON:名称\\下一步?. ';
  const name=diagramStepImageFilename(step,8);
  assert.match(name,/^009_/);assert.ok(name.endsWith('.png'));assert.doesNotMatch(name,/[\\/:*?"<>|\u0000-\u001f]/);
  step.title='...  ';assert.equal(diagramStepImageFilename(step,999),'1000_步骤.png');
});

test('300 DPI PNG metadata has a valid CRC and preserves all existing pixel chunks',()=>{
  const source=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
  function chunks(bytes:Uint8Array){const result:{type:string;bytes:Uint8Array}[]=[],view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let cursor=8;cursor<bytes.length;){const size=view.getUint32(cursor),end=cursor+12+size;result.push({type:String.fromCharCode(...bytes.subarray(cursor+4,cursor+8)),bytes:bytes.slice(cursor,end)});cursor=end;}return result;}
  const encoded=diagramImagePNG300DPI(source),encodedChunks=chunks(encoded),metadata=encodedChunks.filter(chunk=>chunk.type==='pHYs');
  assert.equal(metadata.length,1);const data=metadata[0].bytes,view=new DataView(data.buffer);
  assert.equal(view.getUint32(8),11811);assert.equal(view.getUint32(12),11811);assert.equal(data[16],1);
  assert.equal(view.getUint32(17),settingsCRC32(data.subarray(4,17)));
  assert.deepEqual(encodedChunks.filter(chunk=>chunk.type!=='pHYs'),chunks(source));
  assert.deepEqual(diagramImagePNG300DPI(encoded),encoded,'existing resolution is replaced, not duplicated');
  assert.throws(()=>diagramImagePNG300DPI(encoded.slice(0,-4)),/PNG 数据不完整/);
});

test('image preparation ignores an unselected cover but refuses an unresolved selected panel',async()=>{
  let project=fixture();const selected=project.steps[0],doc=project.states[0].doc;
  project=adoptDiagramPose(project,selected.id,selected.beforeId,computeFlatFold(doc));
  const last=project.steps.at(-1)!;last.pose={...structuredClone(project.steps[0].pose!),sourceStateId:'missing-source'};
  // adoptDiagramPose saves an explicit illustration order, which is valid even
  // for an independent old drawing. This fixture instead needs unresolved paper.
  delete last.pose.displayOrder;last.pose.result.layers={status:'unknown',message:'未确认层序'};
  assert.equal(diagramLayerDisplayState(project,last.id).status,'unsupported');
  const options={...defaultDiagramPDFOptions(project),scope:'range' as const,rangeStart:1,rangeEnd:1,cover:'standard' as const,coverImage:'last' as const};
  const before=structuredClone(project),prepared=await prepareDiagramImageProject(project,options);
  assert.deepEqual(prepared.steps.at(-1),before.steps.at(-1));assert.deepEqual(project,before);
  await assert.rejects(prepareDiagramImageProject(project,{...options,rangeStart:4,rangeEnd:4}),/第 4 步/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(exportDiagramImagesZIP(project,options,undefined,undefined,{signal:controller.signal}),{name:'AbortError'});
});
