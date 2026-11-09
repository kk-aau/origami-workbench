import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,appendDiagramStep,adoptDiagramPose} from '../../src/app/diagramProject';
import {diagramPDFStepArtwork,diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {diagramPDFPageSVG,embedDiagramPDFSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFCellContent} from '../../src/app/diagramPDFLayout';
import {defaultDiagramLineDefaults,changeGlobalDiagramLineStyle} from '../../src/app/diagramLineStyles';
import {diagramStepZooms} from '../../src/app/diagramStepZoom';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const palette=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color:'#1234ab',width:1.4,strokePattern:'solid'});
function fixture(){
  let serial=0;const ids=()=>`shared-pdf-art-${++serial}`,doc=blankDoc('共享步骤图稿',100,100);
  let project=appendDiagramStep(createDiagramProject(doc,ids),ids);
  project=adoptDiagramPose(project,project.steps[1].id,project.steps[1].beforeId,computeFlatFold(doc));
  project.steps[0].annotations=[{id:'crop',kind:'symbol',symbol:'zoom',position:[130,40],size:25,rotation:0,color:'#234534',width:.7,zoomArea:{region:{kind:'circle',center:[40,45],radius:24},basis:{x:0,y:0,width:100,height:100}}}];
  const step=project.steps[1];
  step.annotations=[{id:'direction',kind:'symbol',symbol:'rotate',position:[1200,50],size:200,rotation:0,color:'#a13640',width:.8,turnAngle:35},{id:'ink',kind:'line',a:[10,20],b:[90,20],style:'valley',color:'#345678',width:.7}];
  step.images=[{id:'photo',name:'成品',dataUrl:pixel,pixelWidth:1,pixelHeight:1,position:[75,10],width:10,height:15,rotation:12,source:'simulation'}];
  step.callouts=[{id:'cp-detail',source:{kind:'cp',stateId:step.beforeId,center:[40,40],radius:12},target:{center:[150,25],radius:22},comparison:{stateId:step.afterId,target:{center:[200,25],radius:22}}}];
  return project;
}

test('shared PDF artwork retains size-aware margin symbols, crop, rotation, raster images and both CP details',()=>{
  const project=fixture(),step=project.steps[1];
  for(const rotation of [0,90,37])for(const size of [undefined,{width:200,height:140},{width:120,height:230}])for(const adaptive of [false,true]){
    step.canvas={...step.canvas!,drawingRotation:rotation};
    const snapshot=structuredClone(project),zoom=diagramStepZooms(project).get(step.id)?.region;
    const artwork=diagramPDFStepArtwork(step,project.states,size,palette,adaptive,zoom);
    assert.equal(artwork,diagramPDFStepSVG(project,step,size,palette,adaptive));
    assert.equal(XMLValidator.validate(artwork),true);
    assert.match(artwork,/data-pdf-direction-symbol="rotate"/);
    assert.match(artwork,/35°/);
    assert.match(artwork,/data-diagram-zoom="circle"/);
    assert.match(artwork,/data:image\/png;base64/);
    assert.match(artwork,/操作前 CP/);assert.match(artwork,/操作后 CP/);
    if(rotation)assert.match(artwork,new RegExp(`data-diagram-drawing-rotation="${rotation}"`));
    assert.deepEqual(project,snapshot,'rendering never edits the saved drawing');
  }
});

test('shared cached artwork is exactly the image embedded in each configured PDF panel',()=>{
  const project=fixture(),step=project.steps[1],zooms=diagramStepZooms(project);
  step.title='这是需要换行的步骤标题';step.description='说明占用单步图稿下面的版面，图片使用剩余的真实 PDF 尺寸。';
  for(const layout of ['1x1','3x4'] as const)for(const descriptions of [false,true]){
    const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout,scope:'range' as const,rangeStart:2,rangeEnd:2,descriptions};
    const plan=planDiagramPDF(project,options),cell=plan.pages[0].cells[0],box=diagramPDFCellContent(step,cell,options,plan).imageRect;
    const artwork=diagramPDFStepArtwork(step,project.states,box,palette,true,zooms.get(step.id)?.region);
    const page=diagramPDFPageSVG(project,options,plan,0,palette,true);
    assert.ok(page.includes(embedDiagramPDFSVG(artwork,box,'p0-art0-')),'PDF and cache use the same image rectangle and artwork');
    assert.doesNotMatch(artwork,/这是需要换行的步骤标题|说明占用/,'captions belong outside the panel image');
  }
});

test('empty saved steps share the PDF before-CP fallback and reject missing source states',()=>{
  const project=fixture(),step=project.steps[1];step.pose=null;step.annotations=[];step.images=[];step.callouts=[];
  project.states.find(state=>state.id===step.beforeId)!.doc.segments.push({id:'before-route',a:[0,31],b:[100,31],assignment:'V',angle:180});
  project.states.find(state=>state.id===step.afterId)!.doc.segments.push({id:'after-only',a:[0,73],b:[100,73],assignment:'M',angle:180});
  const snapshot=structuredClone(project),zoom=diagramStepZooms(project).get(step.id)?.region;
  for(const size of [undefined,{width:160,height:90}]){
    const artwork=diagramPDFStepArtwork(step,project.states,size,palette,true,zoom);
    assert.equal(artwork,diagramPDFStepSVG(project,step,size,palette,true));
    assert.match(artwork,/y1="31"/);assert.doesNotMatch(artwork,/y1="73"/);
    assert.match(artwork,/data-diagram-zoom="circle"/);assert.doesNotMatch(artwork,/data-diagram-paper-face=/);
  }
  assert.throws(()=>diagramPDFStepArtwork(step,[],undefined,palette,true,zoom),/CP 状态缺失/);
  assert.deepEqual(project,snapshot);
});
