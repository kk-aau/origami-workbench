import assert from 'node:assert/strict';
import test from 'node:test';
import {createDiagramProject,appendDiagramStep,addDiagramBranch,importDiagramProject,exportDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramPDFOptions,diagramPDFPanelPlacementKey,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {diagramPDFLeaveCorner,diagramPDFPageCorner} from '../../src/app/diagramPDFCornerPlacement';

test('leaving one corner on a manually arranged branch page preserves the other drawings and carries just its tail',()=>{
  let project=createDiagramProject(blankDoc('手排拐角',100,100));
  const root=project.activeStepId;
  for(let i=0;i<7;i++)project=appendDiagramStep(project);
  project=addDiagramBranch(project,root);
  for(let i=1;i<7;i++)project=appendDiagramStep(project);
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),readingOrder:'snake',cover:'none',layout:'3x3',
    pageLayouts:{0:{count:1},1:{count:9}},branchPagination:'lanes'};
  const initial=planDiagramPDF(project,options),page=initial.pages[1];
  // Interleave two branches. A's terminal run doubles back to the top left corner.
  const physicalSlots=[...page.cells].sort((a,b)=>a.y-b.y||a.x-b.x);
  const slotOrder=[3,6,4,7,0,8,1,5,2];
  options.panelPlacements=Object.fromEntries(page.cells.map((cell,i)=>{
    const target=physicalSlots[slotOrder[i]];
    return [diagramPDFPanelPlacementKey(project,cell),{
      x:(target.x-cell.x)/initial.width,y:(target.y-cell.y)/initial.height,scale:i===1?.85:1,
    }];
  }));
  const edited=planDiagramPDF(project,options),cells=edited.pages[1].cells;
  const chain=diagramPDFPageCorner(options,edited.pages[1]);
  assert.deepEqual(chain,[4,6,8].map(i=>cells[i].branchNodeId));
  assert.equal(diagramPDFPageCorner({...options,readingOrder:'rows'},edited.pages[1]),undefined);
  const patch=diagramPDFLeaveCorner(project,options,edited,1,chain!);
  assert.ok(patch);
  assert.equal(patch.pageLayouts?.[0].count,1);
  assert.equal(patch.pageLayouts?.[1].count,8);
  assert.equal(patch.panelPlacements?.[diagramPDFPanelPlacementKey(project,cells[8])],undefined);
  const reopened=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{...options,...patch}}}));
  const result=planDiagramPDF(reopened,{...options,...reopened.exportSettings!.pdf});
  const after=result.pages[1].cells;
  assert.equal(after.length,8);
  for(const [i,cell] of after.entries()){
    const target=cells[i===4?6:i===6?8:i];
    assert.equal(cell.branchNodeId,cells[i].branchNodeId);
    assert.ok(Math.abs(cell.x-target.x)<1e-6&&Math.abs(cell.y-target.y)<1e-6);
    assert.equal(cell.width,cells[i].width);assert.equal(cell.height,cells[i].height);
  }
  assert.ok(result.pages[2].cells.some(cell=>cell.branchNodeId===cells[8].branchNodeId));
  assert.deepEqual(result.pages.flatMap(p=>p.cells.map(c=>c.branchNodeId)).sort(),edited.pages.flatMap(p=>p.cells.map(c=>c.branchNodeId)).sort());
  assert.equal(diagramPDFPageCorner({...options,...patch},result.pages[1]),undefined);
});
