import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFPanelKey,diagramPDFPanelPlacementKey,type DiagramPDFRect} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon,diagramPDFRibbonKey,diagramPDFRibbonNodes,diagramPDFRibbonSaveNodes} from '../../src/app/diagramPDFDecoration';
import {diagramExportPagePanels} from '../../src/app/diagramExportPanel';
import {diagramPDFDirectionGlyph} from '../../src/app/diagramPDFDirection';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
function fixture(count=20){let p=createDiagramProject(blankDoc('自由排版',100,100));while(p.steps.length<count)p=appendDiagramStep(p);return p;}
test('per-page counts pull and push consecutive panels without editing or dropping project steps',()=>{
  const p=fixture(),snapshot=structuredClone(p),base={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const};
  const options={...base,pageLayouts:{0:{columns:2,rows:2,count:3},1:{columns:4,rows:2,count:10}}};
  const plan=planDiagramPDF(p,options);
  assert.deepEqual(plan.pages.map(page=>page.cells.length),[3,10,7]);assert.equal(plan.pages[1].rows,3);
  assert.deepEqual(plan.pages.flatMap(page=>page.cells.map(cell=>cell.stepIndex)),p.steps.map((_,i)=>i));assert.deepEqual(p,snapshot);
});
test('staggered panels use alternating row lengths, can move and resize, retain captions and stay on the page',()=>{
  const p=fixture(9),base={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,layoutMode:'free' as const,readingOrder:'snake' as const};
  const plan=planDiagramPDF(p,base),page=plan.pages[0],cell=page.cells[4],key=diagramPDFPanelKey(p,cell);
  assert.equal(page.rows,4);assert.ok(page.cells[3].x>page.cells[4].x);assert.ok(page.cells[3].x!==page.cells[2].x);
  const moved=planDiagramPDF(p,{...base,panelPlacements:{[key]:{x:.025,y:.01,scale:1.2}}}).pages[0].cells[4];
  assert.ok(moved.width>cell.width);assert.notEqual(moved.x,cell.x);assert.deepEqual(moved.baseRect,cell.baseRect);
  assert.ok(moved.y>=plan.margin&&moved.x>=plan.margin&&moved.x+moved.width<=plan.width-plan.margin);
  for(const scale of [0,NaN,2.1])assert.throws(()=>planDiagramPDF(p,{...base,panelPlacements:{[key]:{x:0,y:0,scale}}}));
});

const rect=({x,y,width,height}:DiagramPDFRect)=>({x,y,width,height});
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

test('regular and staggered layouts retain independent edits to the same step, including legacy free placements',()=>{
  const p=fixture(12),base={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const};
  const grid=planDiagramPDF(p,base),free=planDiagramPDF(p,{...base,layoutMode:'free'});
  const regularCell=grid.pages[0].cells[4],freeCell=free.pages[0].cells[4];
  assert.equal(grid.pages[0].rows,3);
  assert.equal(new Set(grid.pages[0].cells.map(c=>c.x)).size,3);
  assert.equal(new Set(grid.pages[0].cells.map(c=>c.y)).size,3);
  assert.notDeepEqual(rect(freeCell),rect(regularCell));
  const freeKey=diagramPDFPanelKey(p,freeCell),gridKey=diagramPDFPanelPlacementKey(p,regularCell,'grid');
  assert.equal(diagramPDFPanelPlacementKey(p,freeCell,'free'),freeKey);
  assert.equal(diagramPDFPanelPlacementKey(p,regularCell,undefined),gridKey);
  assert.notEqual(gridKey,freeKey);
  const legacy={...base,panelPlacements:{[freeKey]:{x:-.02,y:.01,scale:1}}};
  assert.deepEqual(planDiagramPDF(p,legacy).pages,grid.pages);
  const both={...legacy,panelPlacements:{...legacy.panelPlacements,[gridKey]:{x:.03,y:-.02,scale:1}}};
  const reopened=importDiagramProject(exportDiagramProject({...p,exportSettings:{pdf:both}}));
  const restored={...defaultDiagramPDFOptions(reopened),...reopened.exportSettings!.pdf};
  for(const mode of [undefined,'grid','free'] as const){
    const page=planDiagramPDF(reopened,{...restored,layoutMode:mode}).pages[0];
    const original=mode==='free'?freeCell:regularCell,edit=mode==='free'?both.panelPlacements[freeKey]:both.panelPlacements[gridKey];
    const moved=page.cells[4];
    near(moved.x,original.x+edit.x*grid.width);
    near(moved.y,original.y+edit.y*grid.height);
    assert.deepEqual(rect(moved.baseRect!),rect(original));
  }
});

test('editing a regular grid step preserves page assignments and moves its drawing and description in the exported page',()=>{
  const p=fixture(21);
  for(const step of p.steps)step.description='随图说明';
  const options={...defaultDiagramPDFOptions(p),cover:'standard' as const,layout:'3x3' as const,readingOrder:'snake' as const,ribbon:defaultDiagramPDFRibbon()};
  const original=planDiagramPDF(p,options),page=original.pages[2],target=page.cells[4];
  const key=diagramPDFPanelPlacementKey(p,target,'grid');
  const edited={...options,panelPlacements:{[key]:{x:.035,y:-.03,scale:1,farSideStart:page.farSideStart,spreadRoute:page.spreadRoute}}};
  const changed=planDiagramPDF(p,edited);
  assert.deepEqual(changed.pages.map(p=>p.cells.map(c=>c.stepIndex)),original.pages.map(p=>p.cells.map(c=>c.stepIndex)));
  for(const [pi,sheet] of changed.pages.entries())for(const [ci,cell] of sheet.cells.entries()){
    if(pi!==2||ci!==4)assert.deepEqual(rect(cell),rect(original.pages[pi].cells[ci]));
  }
  const rendered=(opts:typeof options,plan:typeof original)=>{
    const svg=diagramPDFPageSVG(p,opts,plan,2,defaultDiagramLineDefaults(),true);
    const panel=svg.split(`<g data-pdf-step="${target.stepIndex+1}">`)[1].split('<g data-pdf-step=')[0];
    const picture=panel.match(/<svg\b[^>]*>/)![0],description=panel.match(/<text\b[^>]*>随图说明<\/text>/)![0];
    return [picture,description].map(tag=>{
      const n=(key:string)=>Number(tag.match(new RegExp(' '+key+'="([^"]+)"'))![1]);
      return {x:n('x'),y:n('y')};
    });
  };
  const before=rendered(options,original),after=rendered(edited,changed);
  for(const [i,point] of after.entries()){
    near(point.x-before[i].x,.035*original.width);
    near(point.y-before[i].y,-.03*original.height);
  }
  const previousNodes=diagramPDFRibbonNodes(options,original,page),nodes=diagramPDFRibbonNodes(edited,changed,changed.pages[2]);
  const anchor=previousNodes.findIndex(([x,y])=>Math.abs(x-(target.x+target.width/2)/original.width)<1e-7&&Math.abs(y-(target.y+target.height*.4)/original.height)<1e-7);
  assert.ok(anchor>=0);
  near(nodes[anchor][0]-previousNodes[anchor][0],.035);
  near(nodes[anchor][1]-previousNodes[anchor][1],-.03);
  const firstSheet=original.pages[1],exit=firstSheet.cells.at(-1)!;
  const exitKey=diagramPDFPanelPlacementKey(p,exit,'grid');
  const raisedOptions={...options,panelPlacements:{[exitKey]:{x:0,y:-.8,scale:1,farSideStart:firstSheet.farSideStart,spreadRoute:firstSheet.spreadRoute}}};
  const raised=planDiagramPDF(p,raisedOptions),raisedExit=raised.pages[1].cells.at(-1)!;
  assert.ok(exit.y+exit.height/2>original.height/2&&raisedExit.y+raisedExit.height/2<raised.height/2);
  const following=(pages:typeof original.pages)=>pages.slice(2).map(page=>page.cells.map(rect));
  assert.deepEqual(following(raised.pages),following(original.pages),'a moved exit changes the connection without flipping the following grid');
});

test('moving a branch panel in a regular grid retains its original slot and neighboring pages',()=>{
  const base=fixture(21),p=addDiagramBranch(base,base.activeStepId);
  const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,layoutMode:'grid' as const};
  const original=planDiagramPDF(p,options),page=original.pages[1],cell=page.cells[1];
  const key=diagramPDFPanelPlacementKey(p,cell,'grid');
  const edit={x:.01,y:-.02,scale:1,farSideStart:page.farSideStart,spreadRoute:page.spreadRoute};
  const updated=planDiagramPDF(p,{...options,panelPlacements:{[key]:edit}});
  assert.deepEqual(updated.pages.map(p=>p.cells.map(c=>c.branchNodeId)),original.pages.map(p=>p.cells.map(c=>c.branchNodeId)));
  const moved=updated.pages[1].cells[1];
  assert.deepEqual(rect(moved.baseRect!),rect(cell));
  near(moved.x,cell.x+edit.x*original.width);
  near(moved.y,cell.y+edit.y*original.height);
});
test('a custom free grid keeps every requested slot in both reading directions until an extra step is added',()=>{
  const p=fixture(21);
  for(const snakeDirection of ['horizontal','vertical'] as const)for(const readingOrder of ['rows','snake'] as const){
    const options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x4' as const,layoutMode:'free' as const,snakeDirection,readingOrder};
    for(const [grid,columns,rows] of [[{rows:2,columns:2},2,2],[{rows:2},3,2],[{columns:2},2,4]] as const){
      const capacity=columns*rows;
      const full=planDiagramPDF(p,{...options,pageLayouts:{0:grid}}).pages[0];
      assert.equal(full.rows,rows);assert.equal(full.columns,columns);assert.equal(full.cells.length,capacity);
      const partial=planDiagramPDF(p,{...options,pageLayouts:{0:{...grid,count:capacity-1}}}).pages[0];
      assert.equal(partial.rows,rows);assert.equal(partial.cells.length,capacity-1);
      const extra=planDiagramPDF(p,{...options,pageLayouts:{0:{...grid,count:capacity+1}}}).pages[0];
      assert.equal(extra.rows,rows+1);assert.equal(extra.cells.length,capacity+1);
    }
  }
});
test('custom ribbon nodes retain manual turns and follow moved panels without changing page identity',()=>{
  const p=fixture(9),base={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,layoutMode:'free' as const,ribbon:defaultDiagramPDFRibbon()};
  const plan=planDiagramPDF(p,base),page=plan.pages[0],key=diagramPDFRibbonKey(plan,page),nodes=diagramPDFRibbonNodes(base,plan,page);
  const options={...base,ribbon:{...base.ribbon,paths:{[key]:nodes}}};
  const changed={...options,panelPlacements:{[diagramPDFPanelKey(p,page.cells[0])]:{x:.02,y:.02,scale:1}}},next=planDiagramPDF(p,changed),nextPage=next.pages[0];
  assert.equal(diagramPDFRibbonKey(next,nextPage),key);
  const shifted=diagramPDFRibbonNodes(changed,next,nextPage);assert.ok(Math.abs(shifted[0][0]-nodes[0][0]-.02)<1e-12);
  assert.deepEqual(diagramPDFRibbonSaveNodes(shifted,next,nextPage),nodes);
});
test('snake instructions follow horizontal reversal and downward transitions while rotation chirality stays intact',()=>{
  const p=fixture(9),options={...defaultDiagramPDFOptions(p),cover:'none' as const,layout:'3x3' as const,readingOrder:'snake' as const},plan=planDiagramPDF(p,options);
  const panels=diagramExportPagePanels(p,options,plan,0);
  assert.deepEqual(panels.map(p=>p.readingDirection),['right','right','bottom','left','left','bottom','right','right',undefined]);
  assert.equal(diagramPDFDirectionGlyph('flip','left'),'scale(-1 1)');
  assert.equal(diagramPDFDirectionGlyph('rotate','left'),'rotate(180)');assert.equal(diagramPDFDirectionGlyph('rotateCCW','bottom'),'rotate(90)');
});
