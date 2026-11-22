import assert from 'node:assert/strict';
import test from 'node:test';
import {layoutDiagramPDFBranchTree,type DiagramPDFBranchNode,type DiagramPDFBranchPageSpec} from '../../src/app/diagramPDFBranchLayout';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {planDiagramPDF,defaultDiagramPDFOptions,diagramPDFPanelPlacementKey} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';

const spec:DiagramPDFBranchPageSpec={bounds:{x:35,y:70,width:510,height:680},rows:3,columns:3,gap:12};
const family=(parents:(number|null)[]):DiagramPDFBranchNode[]=>parents.map((p,i)=>({id:'s'+i,parentId:p===null?null:'s'+p,stepIndex:i}));

test('a shared fold appears once and both alternatives share a row',()=>{
  const nodes=family([null,0,1,1,2,3]);
  const [page]=layoutDiagramPDFBranchTree(nodes,()=>spec);
  const byId=new Map(page.cells.map(cell=>[cell.id,cell]));
  assert.equal(byId.size,6);
  assert.equal(page.edges.length,5);
  assert.equal(byId.get('s2')!.row,byId.get('s3')!.row);
  assert.ok(byId.get('s2')!.row>byId.get('s1')!.row);
  assert.ok(byId.get('s2')!.x<byId.get('s3')!.x);
  assert.ok(page.edges.every(edge=>edge.kind==='local'&&edge.points.length>=2));
});

test('a nine-panel fork after a shared prefix fits one fresh 3x3 page; page breaks retain both endpoints',()=>{
  const prefix=Array.from({length:15},(_,i)=>i===0?null:i-1);
  const nodes=family([...prefix,14,14,15,16,17,18,19]);
  const pages=layoutDiagramPDFBranchTree(nodes,()=>spec);
  assert.deepEqual(pages.map(page=>page.cells.length),[9,5,8]);
  const cells=pages.flatMap(page=>page.cells);
  assert.equal(new Set(cells.map(cell=>cell.id)).size,nodes.length);
  for(const [index,page] of pages.entries()){
    for(const cell of page.cells){
      assert.ok(cell.x>=spec.bounds.x&&cell.y>=spec.bounds.y&&cell.x+cell.width<=545.001&&cell.y+cell.height<=750.001);
      assert.ok(page.cells.every(other=>other===cell||other.x>=cell.x+cell.width||other.y>=cell.y+cell.height||cell.x>=other.x+other.width||cell.y>=other.y+other.height));
    }
    for(const edge of page.edges.filter(edge=>edge.kind==='outgoing')){
      assert.ok(pages[edge.otherPage!].edges.some(e=>e.kind==='incoming'&&e.from===edge.from&&e.to===edge.to&&e.otherPage===index));
    }
  }
  const deep=family([null,0,0,1,2,3,4,5,6]);
  assert.equal(layoutDiagramPDFBranchTree(deep,()=>spec)[0].cells.length,9);
});

test('per-page row/column limits and snake order apply to an unbranched prefix',()=>{
  const nodes=family([null,0,1,2,3,4,5,6,7,8]);
  const pages=layoutDiagramPDFBranchTree(nodes,i=>i===0?{...spec,columns:2,rows:2,snake:true}:{...spec,count:3,vertical:true});
  assert.deepEqual(pages.map(page=>page.cells.length),[4,3,3]);
  const first=pages[0].cells;
  assert.equal(first[0].x,first[1].x);
  assert.equal(first[2].x,first[3].x);
  assert.ok(first[1].x<first[2].x,'the last pair ends at the right of the page');
  assert.deepEqual(first.map(cell=>cell.row),[0,1,1,0]);
  assert.deepEqual(pages[1].cells.map(c=>c.row),[0,1,2]);
});

test('a range may start with several roots; malformed cycles cannot silently drop steps',()=>{
  const nodes=family([null,0,0,1,2]);
  const pages=layoutDiagramPDFBranchTree(nodes.slice(1),()=>spec);
  assert.equal(pages[0].cells.length,4);assert.equal(pages[0].edges.length,2);
  assert.throws(()=>layoutDiagramPDFBranchTree(family([1,0]),()=>spec),/循环/);
  assert.throws(()=>layoutDiagramPDFBranchTree([nodes[0],nodes[0]],()=>spec),/重复/);
});

test('a fork at the foot of a horizontal page enters the last two rows, then turns through the free row',()=>{
  const prefix=Array.from({length:8},(_,i)=>i===0?null:i-1);
  const nodes=family([...prefix,7,7,8,9,10,11,12,13,14,15]);
  const pages=layoutDiagramPDFBranchTree(nodes,()=>({...spec,snake:true}));
  assert.deepEqual(pages.map(p=>p.cells.length),[8,8,2]);
  assert.equal(pages[0].cells.at(-1)?.id,'s7');
  const col=(x:number)=>Math.floor((x-spec.bounds.x)/(spec.bounds.width/spec.columns));
  assert.deepEqual(pages[1].cells.map(c=>[c.id,c.row,col(c.x)]),[
    ['s8',1,0],['s9',2,0],['s10',1,1],['s11',2,1],['s12',0,1],['s13',2,2],['s14',0,2],['s15',1,2]]);
  assert.deepEqual(pages[2].cells.map(c=>[c.id,c.row,col(c.x)]),[['s16',0,0],['s17',1,0]]);
  for(const child of ['s8','s9']){
    assert.ok(pages[0].edges.some(e=>e.from==='s7'&&e.to===child&&e.kind==='outgoing'&&e.otherPage===1));
    assert.ok(pages[1].edges.some(e=>e.from==='s7'&&e.to===child&&e.kind==='incoming'&&e.otherPage===0));
  }
  assert.equal(new Set(pages.flatMap(p=>p.cells.map(c=>c.id))).size,nodes.length);
  const forced=layoutDiagramPDFBranchTree(nodes,i=>({...spec,snake:true,...(i===1?{count:9}:{})}));
  assert.equal(forced[1].cells.length,9,'an explicit count can fill the inside of the turn');
  assert.deepEqual(forced[1].cells.slice(0,2).map(c=>[c.row,col(c.x)]),[[1,0],[2,0]]);
  assert.equal(new Set(forced[1].cells.map(c=>[c.x,c.y].join(','))).size,9);
});

test('the facing page uses its own reading direction for a fork entering from below',()=>{
  const prefix=Array.from({length:8},(_,i)=>i===0?null:i-1);
  const nodes=family([...prefix,7,7,8,9,10,11,12,13]);
  // Give each arm a distinct crossing of the gutter before the facing page
  // turns both tracks vertically, bottom to top.
  const pages=layoutDiagramPDFBranchTree(nodes,i=>({...spec,snake:true,vertical:i===1,
    seamHeight:(from,to)=>from==='s7'?(to==='s8'?.62:.85):undefined}));
  assert.deepEqual(pages[1].cells.map(c=>c.entrySlot),[[2,1],[2,2],[1,1],[1,2],[0,1],[0,2]]);
});

test('moving the shared parent to the top redirects unedited entrances and respects authored ones',()=>{
  const prefix=Array.from({length:8},(_,i)=>i===0?null:i-1);
  const nodes=family([...prefix,7,7,8,9,10,11,12,13]);
  const moved:DiagramPDFBranchPageSpec={...spec,snake:true,fixedGridSlots:true,
    displayRect:c=>c.id==='s7'?{...c,y:spec.bounds.y}:c};
  const facing=(settings:Partial<DiagramPDFBranchPageSpec>)=>layoutDiagramPDFBranchTree(nodes,i=>i===0?moved:{...spec,snake:true,...settings})[1];
  const slots=(settings:Partial<DiagramPDFBranchPageSpec>)=>facing(settings).cells.slice(0,4).map(c=>c.entrySlot);
  assert.deepEqual(slots({}),[[0,0],[1,0],[0,1],[1,1]]);
  assert.deepEqual(slots({vertical:true}),[[0,0],[0,1],[1,0],[1,1]]);
  assert.deepEqual(slots({savedEntrySlot:c=>c.id==='s8'?[1,0]:undefined}),[[1,0],[2,0],[1,1],[2,1]]);
  assert.deepEqual(slots({hasAuthoredRibbon:p=>p.cells[0].row===1}),[[1,0],[2,0],[1,1],[2,1]]);
});

test('forks arriving from above run along the first rows, with a fallback for more arms than lanes',()=>{
  for(const arms of [2,3,4]){
    const parents=[null,0,...Array.from({length:arms},()=>1),...Array.from({length:arms},(_,i)=>2+i)];
    const nodes=family(parents);
    const pages=layoutDiagramPDFBranchTree(nodes,i=>({...spec,snake:true,...(i===0?{count:2}:{})}));
    const page=pages[1];
    if(arms<=spec.rows)assert.deepEqual(page.cells.map(c=>c.id),nodes.slice(2).map(c=>c.id));
    else{
      const following=pages.slice(1).flatMap(p=>p.cells.map(c=>c.id));
      assert.deepEqual(pages[0].cells.map(c=>c.id),['s0'],'carry the fork forward when four incoming arms cannot fit three rows');
      assert.deepEqual(following.sort(),nodes.slice(1).map(c=>c.id).sort());
      assert.ok(page.cells.some(c=>c.id==='s1'));
      assert.ok(page.cells.length>=5,'the fork and two complete arms can share the next page');
      for(const [index,p] of pages.entries())for(const edge of p.edges.filter(e=>e.kind==='outgoing')){
        assert.equal(edge.otherPage,index+1,'carrying the fork must preserve consecutive page connections');
      }
      const edges=pages.flatMap(p=>p.edges);
      for(const node of nodes.slice(2)){
        assert.ok(edges.some(e=>e.from===node.parentId&&e.to===node.id));
        assert.ok(edges.filter(e=>e.to===node.id).every(e=>e.from===node.parentId));
      }
    }
    assert.equal(new Set(page.cells.map(c=>c.x+','+c.y)).size,page.cells.length);
    if(arms<=spec.rows)for(let i=0;i<arms;i++){
      assert.equal(page.cells[i].row,i);assert.equal(page.cells[arms+i].row,i);
      assert.ok(page.cells[i].x<page.cells[arms+i].x);
    }
  }
});

test('an old manual fork placement keeps its page, while editing a new lane survives saving and reopening',()=>{
  let project=createDiagramProject(blankDoc('末行分叉',100,100));
  while(project.steps.length<8)project=appendDiagramStep(project);
  project=addDiagramBranch(project,project.activeStepId);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'3x3' as const,readingOrder:'snake' as const};
  const modern=planDiagramPDF(project,options);
  assert.equal(modern.pages[0].cells.length,8);
  const child=modern.pages[1].cells[0],key=diagramPDFPanelPlacementKey(project,child,'grid');
  const edit={panelPlacements:{[key]:{x:.01,y:0,scale:1}}};
  const old=planDiagramPDF(project,{...options,...edit});
  assert.equal(old.branchPagination,'legacy');
  const oldChild=old.pages[1].cells.find(c=>c.branchNodeId===child.branchNodeId)!;
  assert.notDeepEqual(oldChild.baseRect,child.baseRect);
  const oldTrack=diagramPDFRibbonTracks(options,old,old.pages[1]).find(t=>old.pages[1].branchEdges![t.edgeIndex!].kind==='local')!;
  const authored={...options,ribbon:{...defaultDiagramPDFRibbon(),paths:{[oldTrack.key]:oldTrack.nodes}}};
  const oldRibbon=planDiagramPDF(project,authored);
  assert.equal(oldRibbon.branchPagination,'legacy');
  assert.ok(diagramPDFRibbonTracks(authored,oldRibbon,oldRibbon.pages[1]).some(t=>t.key===oldTrack.key));
  const saved=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{...options,...edit,branchPagination:'lanes'}}}));
  const reopened=planDiagramPDF(saved,{...options,...saved.exportSettings!.pdf});
  assert.equal(reopened.branchPagination,'lanes');
  assert.deepEqual(reopened.pages[1].cells[0].baseRect,child.baseRect);
  assert.ok(Math.abs(reopened.pages[1].cells[0].x-child.x-modern.width*.01)<1e-7);
  const freeKey=diagramPDFPanelPlacementKey(project,child,'free');
  const splitModes={...options,panelPlacements:{...edit.panelPlacements,[freeKey]:edit.panelPlacements[key]},branchPagination:{grid:'lanes' as const}};
  assert.equal(planDiagramPDF(project,splitModes).branchPagination,'lanes');
  assert.equal(planDiagramPDF(project,{...splitModes,layoutMode:'free'}).branchPagination,'legacy');
});

test('a .84 fork with a saved drawing or ribbon reopens on its authored columns',()=>{
  let project=createDiagramProject(blankDoc('已排好的旧分支',100,100));
  while(project.steps.length<8)project=appendDiagramStep(project);
  project=addDiagramBranch(project,project.activeStepId);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'3x3' as const,readingOrder:'snake' as const,branchPagination:'lanes' as const};
  const modern=planDiagramPDF(project,options),siblings=modern.pages[1].cells;
  const key=diagramPDFPanelPlacementKey(project,siblings[0],'grid');
  const branchPageSpan:[string,string]=[siblings[0].branchNodeId!,siblings[1].branchNodeId!];
  const positioned=planDiagramPDF(project,{...options,panelPlacements:{[key]:{x:.01,y:0,scale:1,branchPageSpan}}});
  const [a,b]=positioned.pages[1].cells;
  assert.equal(a.y,b.y);assert.ok(a.x<b.x);assert.ok(Math.abs(a.x-a.baseRect!.x-positioned.width*.01)<1e-7);
  const track=diagramPDFRibbonTracks(options,positioned,positioned.pages[1])[0];
  const painted={...options,ribbon:{...defaultDiagramPDFRibbon(),paths:{[track.key]:track.nodes}}};
  const reopened=planDiagramPDF(project,painted);
  assert.deepEqual(reopened.pages[1].cells.map(c=>c.baseRect),[a.baseRect,b.baseRect]);
  assert.ok(diagramPDFRibbonTracks(painted,reopened,reopened.pages[1]).some(t=>t.key===track.key));
});
