import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DiagramProject} from '../../src/app/diagramProject';
import {diagramThumbnailSizes} from '../../src/app/diagramThumbnailLayout';
import {defaultDiagramPDFOptions,diagramPDFCellContent,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';

function fixture(count=14):DiagramProject {
  return {format:'zhezhi-diagram',version:1,name:'缩略图使用 PDF 图框',activeStepId:'step-11',
    states:Array.from({length:count+1},(_,index)=>({id:`cp-${index}`,revision:0,doc:{name:'方纸',paper:{width:100,height:100},segments:[]}})),
    steps:Array.from({length:count},(_,index)=>({id:`step-${index}`,beforeId:`cp-${index}`,afterId:`cp-${index+1}`,pose:null,title:`步骤 ${index+1}`,description:''}))};
}
function pdfSize(project:DiagramProject,options:DiagramPDFOptions,id:string){
  const plan=planDiagramPDF(project,options),cell=plan.pages.flatMap(page=>page.cells).find(cell=>project.steps[cell.stepIndex].id===id)!;
  const {width,height}=diagramPDFCellContent(project.steps[cell.stepIndex],cell,options,plan).imageRect;
  return {width,height};
}

test('thumbnail viewports leave exactly the PDF caption space for multiline titles and descriptions',()=>{
  const project=fixture(),options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'2x2' as const};
  const plain=diagramThumbnailSizes(project,options).get('step-0')!;
  project.steps[0].title='将纸张两侧依次向中央的折痕收拢并将上方纸角翻折到背面';
  const titled=diagramThumbnailSizes(project,options).get('step-0')!;
  assert.equal(titled.width,plain.width);assert.ok(titled.height<plain.height,'wrapped title reserves an additional line');
  project.steps[0].description='保持中心固定。沿图示方向折叠，确认两侧边缘对齐后再压平纸张。'.repeat(3);
  const snapshot=structuredClone(project),settings=structuredClone(options),sizes=diagramThumbnailSizes(project,options);
  assert.ok(sizes.get('step-0')!.height<titled.height,'visible descriptions reduce the artwork viewport');
  assert.deepEqual(sizes.get('step-0'),pdfSize(project,options,'step-0'));
  assert.deepEqual(diagramThumbnailSizes(project,{...options,descriptions:false}).get('step-0'),titled);
  assert.equal(sizes.size,project.steps.length);assert.deepEqual(project,snapshot);assert.deepEqual(options,settings);
});

test('selected steps use their actual export page while excluded steps retain full-document fallback viewports',()=>{
  const project=fixture(),all=defaultDiagramPDFOptions(project),allSizes=diagramThumbnailSizes(project,all);
  for(const scope of ['range','current'] as const){
    const options={...all,scope,rangeStart:12,rangeEnd:13},sizes=diagramThumbnailSizes(project,options);
    assert.equal(sizes.size,project.steps.length);
    assert.deepEqual(sizes.get('step-11'),pdfSize(project,options,'step-11'));
    assert.notDeepEqual(sizes.get('step-11'),allSizes.get('step-11'),'step 12 moves from a later-page panel into the selected export intro grid');
    assert.deepEqual(sizes.get('step-0'),allSizes.get('step-0'),'excluded steps are still available with the all-steps viewport');
    if(scope==='range')assert.deepEqual(sizes.get('step-12'),pdfSize(project,options,'step-12'));
  }
});
