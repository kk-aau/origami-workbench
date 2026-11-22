import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {addDiagramBranch,appendDiagramStep,createDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,diagramPDFPanelPlacementKey,planDiagramPDF,type DiagramPDFOptions,type PDFPageFurniture} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon,diagramPDFPageSeams,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';
import {createDiagramPDFPreviewPlanner,diagramPDFDragPreviewPlan} from '../../src/app/diagramPDFPreviewPlan';

for(const branched of [true,false]){
  test('both sheets show the committed seam geometry while dragging the last step: '+(branched?'branch':'linear'),()=>{
    let project=createDiagramProject(blankDoc('双页拖动',200,200));
    while(project.steps.length<19)project=appendDiagramStep(project);
    if(branched)project=addDiagramBranch(project,project.activeStepId);
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3',readingOrder:'snake',ribbon:defaultDiagramPDFRibbon()};
    const plan=planDiagramPDF(project,options),page=plan.pages[0],tail=page.cells.at(-1)!;
    const key=diagramPDFPanelPlacementKey(project,tail,'grid');
    const placed={...options,branchPagination:'lanes' as const,panelPlacements:{[key]:{x:0,y:-.10,scale:1}}};
    const committed=planDiagramPDF(project,placed);
    const drag=diagramPDFDragPreviewPlan(plan,options,0,{...page,cells:page.cells.map(c=>c===tail?{...c,y:c.y-plan.height*.10}:c)});
    for(const i of [0,1]){
      assert.deepEqual(diagramPDFRibbonTracks(options,drag,drag.pages[i]),diagramPDFRibbonTracks(placed,committed,committed.pages[i]));
    }
  });
  test('interactive plan matches full pagination during mixed edits: '+(branched?'branch':'linear'),()=>{
    let project=createDiagramProject(blankDoc('调节预览',200,200));
    while(project.steps.length<17)project=appendDiagramStep(project);
    if(branched)project=addDiagramBranch(project,project.activeStepId);
    const plan=createDiagramPDFPreviewPlanner(),ribbon=defaultDiagramPDFRibbon();
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'standard',layout:'2x2',readingOrder:'snake',ribbon,
      layoutMode:'free',pageLayouts:{2:{snakeDirection:'vertical'}}};
    const first=plan(project,options);
    const decorated={...options,pageTextColor:'#774455',ribbon:{...ribbon,widthMm:6},coverImageOffset:{x:2,y:20},scaleIndicators:true};
    const resized=plan(project,decorated);
    assert.equal(resized.pages[2].cells,first.pages[2].cells,'width can adjust seams while retaining the expensive page geometry');
    assert.deepEqual(resized,planDiagramPDF(project,decorated));
    const seam=diagramPDFPageSeams(decorated,first,first.pages[2]).find(e=>e.kind==='outgoing')!;
    for(const height of [0,.21,1,undefined]){
      const edited={...decorated,ribbonSeamHeights:height===undefined?undefined:{[seam.key]:height}};
      const next=plan(project,edited);
      assert.equal(next.pages[0],first.pages[0]);
      assert.equal(next.pages[2].cells,first.pages[2].cells);
      assert.deepEqual(next,planDiagramPDF(project,edited));
    }
    assert.throws(()=>plan(project,{...options,ribbonSeamHeights:{[seam.key]:1.5}}));
    const grid={...options,layout:'3x2' as const};
    assert.deepEqual(plan(project,grid),planDiagramPDF(project,grid));
    const other=appendDiagramStep(project);
    assert.deepEqual(plan(other,grid),planDiagramPDF(other,grid));
  });

  test('margin alignment and same-height text edits retain layout, while wrapping and either page inset repaginate: '+(branched?'branch':'linear'),()=>{
    let project=createDiagramProject(blankDoc('页眉预览',200,200));
    while(project.steps.length<9)project=appendDiagramStep(project);
    if(branched)project=addDiagramBranch(project,project.activeStepId);
    const furniture:PDFPageFurniture={differentOddEven:true,
      common:{header:{alignment:'left',showTitle:true},footer:{alignment:'center',showPageNumber:true}},
      even:{header:{alignment:'right',text:'偶数页眉'},footer:{alignment:'left',showPageNumber:true}},
    };
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'2x2',readingOrder:'snake',ribbon:defaultDiagramPDFRibbon(),pageFurniture:furniture};
    const planner=createDiagramPDFPreviewPlanner(),first=planner(project,options);
    assert.ok(first.pages.length>2);
    const aligned={...options,pageFurniture:{...furniture,common:{
      header:{...furniture.common.header,alignment:'right' as const},footer:{...furniture.common.footer,alignment:'left' as const},
    }}};
    const typed={...aligned,pageFurniture:{...aligned.pageFurniture,even:{
      ...furniture.even!,header:{alignment:'center' as const,text:'另一个页眉'},
    }}};
    for(const updated of [aligned,typed,{...typed,pageTextColor:'#123456'},{...typed,title:'页眉改名'}]){
      const next=planner(project,updated);
      assert.equal(next,first,'unchanged reserved space must retain the complete layout');
      assert.deepEqual(next,planDiagramPDF(project,updated));
    }
    for(const updated of [
      {...typed,pageFurniture:{...typed.pageFurniture,even:{...typed.pageFurniture.even,header:{alignment:'center' as const,text:'页眉'.repeat(70)}}}},
      {...typed,pageFurniture:{...typed.pageFurniture,even:{...typed.pageFurniture.even,footer:{alignment:'left' as const,showPageNumber:true,offsetMm:30}}}},
      {...typed,pageFurniture:{...typed.pageFurniture,common:{...typed.pageFurniture.common,header:{alignment:'right' as const,showTitle:true,offsetMm:30}}}},
    ]){
      planner(project,typed);
      const next=planner(project,updated);
      assert.notEqual(next,first);
      assert.deepEqual(next,planDiagramPDF(project,updated));
    }
    planner(project,typed);
    assert.throws(()=>planner(project,{...typed,pageFurniture:{...typed.pageFurniture,even:{
      ...typed.pageFurniture.even,header:{alignment:'center',offsetMm:41},
    }}}),/纸边/);
    assert.deepEqual(planner(project,typed),planDiagramPDF(project,typed),'invalid input must leave the last valid plan intact');
  });
}

for(const cover of ['none','standard','diagram'] as const){
  test('cover text is repaginated only when it moves the first row: '+cover,()=>{
    let project=createDiagramProject(blankDoc('封面预览',200,200));
    while(project.steps.length<12)project=appendDiagramStep(project);
    project=addDiagramBranch(project,project.activeStepId);
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover,layout:'2x2',introLayout:'2x2',
      runningTitle:false,author:'制图甲',designer:'设计甲',headerNote:'封面说明'};
    const planner=createDiagramPDFPreviewPlanner(),first=planner(project,options);
    for(const patch of [{title:'标题修改'},{author:'制图乙'},{designer:'设计乙'},{headerNote:'新的说明'},{coverCPDoc:blankDoc('新的 CP',100,200),coverCPLabel:'文件 CP'}]){
      const updated={...options,...patch},next=planner(project,updated);
      assert.equal(next,first);
      assert.deepEqual(next,planDiagramPDF(project,updated));
    }
    const multiline={...options,headerNote:'增加封面高度\n'.repeat(12)};
    const next=planner(project,multiline);
    if(cover==='diagram')assert.notEqual(next,first);
    else assert.equal(next,first);
    assert.deepEqual(next,planDiagramPDF(project,multiline));
  });
}
