import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutDiagramPDFBranchTree,type DiagramPDFBranchPageSpec} from '../../src/app/diagramPDFBranchLayout';

test('reopening a saved staggered layout preserves edits on either side of its reserved corner',()=>{
  const parents=[null,0,1,2,3,4,2,0,7,4,9,10,11,12,1,14,6,16,17,18,13,20,4];
  const nodes=parents.map((parent,i)=>({id:'n'+i,parentId:parent===null?undefined:'n'+parent,stepIndex:i}));
  const spec:DiagramPDFBranchPageSpec={bounds:{x:20,y:30,width:450,height:600},rows:4,columns:5,gap:12,snake:true};
  const run=(override:Partial<DiagramPDFBranchPageSpec>)=>layoutDiagramPDFBranchTree(nodes,()=>({...spec,...override}),'staggeredLanes');
  const original=run({}),[here,next]=original;
  assert.deepEqual(original.map(p=>p.cells.length),[19,4]);
  const ribbonKey=(page:typeof here)=>JSON.stringify(page.cells.map(c=>[c.id,c.x,c.y]));
  const savedPath=ribbonKey(here);
  const edits=[{id:here.cells[4].id,span:[here.cells[0].id,here.cells.at(-1)!.id]},
    {id:next.cells[0].id,span:[next.cells[0].id,next.cells.at(-1)!.id]}];
  for(const selected of [[edits[0]],[edits[1]],edits,[]]){
    const saved=JSON.parse(JSON.stringify(selected)) as {id:string;span:[string,string]}[];
    const result=run({savedEntrySlot:c=>saved.some(s=>s.id===c.id)?'original':undefined,
      savedPageSpan:c=>saved.find(s=>s.id===c.id)?.span,hasAuthoredRibbon:page=>ribbonKey(page)===savedPath});
    assert.deepEqual(result.map(ribbonKey),original.map(ribbonKey));
  }
  // An old offset whose original page is unknown still belongs to its old grid.
  assert.equal(run({savedEntrySlot:c=>c.id===here.cells[4].id?'original':undefined})[0].cells.length,20);
  assert.equal(run({count:20,savedPageSpan:()=>[here.cells[0].id,here.cells.at(-1)!.id]})[0].cells.length,20);
});
