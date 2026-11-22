import assert from 'node:assert/strict';
import test from 'node:test';
import {alignDiagramPDFBranchEntries} from '../../src/app/diagramPDFBranchEntries';
import {layoutDiagramPDFBranchTree,type DiagramPDFBranchCell,type DiagramPDFBranchPage} from '../../src/app/diagramPDFBranchLayout';

const spec={bounds:{x:20,y:30,width:450,height:600},rows:3,columns:3,gap:12,snake:true};
function cell(id:string,row:number,column:number,parentId?:string):DiagramPDFBranchCell{
  return {id,parentId,stepIndex:0,x:26+150*column,y:36+200*row,width:138,height:188,row};
}
const page=(cells:DiagramPDFBranchCell[]):DiagramPDFBranchPage=>({cells,rows:3,columns:3,edges:[]});

test('facing-page branches enter opposite the displayed parents, independent of storage order',()=>{
  const prior=page([cell('B',0,2),cell('A',2,2)]);
  const next=page([cell('B1',0,0,'B'),cell('A1',0,1,'A'),cell('B2',0,2,'B1'),cell('A2',1,0,'A1'),cell('B-other',1,1,'B1')]);
  const displayRect=(c:DiagramPDFBranchCell)=>({...c,y:c.id==='A'?36:236});
  alignDiagramPDFBranchEntries(next,prior,spec,{...spec,displayRect});
  const at=Object.fromEntries(next.cells.map(c=>[c.id,c.entrySlot]));
  assert.deepEqual(at.A1,[0,0]);assert.deepEqual(at.A2,[0,1]);
  assert.deepEqual(at.B1,[1,0]);assert.deepEqual(at.B2,[1,1]);
  assert.equal(new Set(next.cells.map(c=>[c.x,c.y].join(','))).size,next.cells.length);
  assert.deepEqual(prior.cells.map(c=>c.row),[0,2]);
});

test('a saved drawing keeps its own base slot and a hand-drawn ribbon keeps the authored page geometry',()=>{
  const prior=page([cell('B',1,2),cell('A',0,2)]);
  const drawings=[cell('B1',0,1,'B'),cell('A1',1,1,'A'),cell('B2',2,0,'B1')];
  const next=page(drawings);
  alignDiagramPDFBranchEntries(next,prior,{...spec,savedEntrySlot:c=>c.id==='B2'?'original':undefined},spec);
  assert.equal(next.cells[2],drawings[2]);
  const edited=page(drawings);
  alignDiagramPDFBranchEntries(edited,prior,{...spec,savedEntrySlot:c=>c.id==='A1'?[2,1]:undefined},spec);
  assert.deepEqual(edited.cells[1].entrySlot,[2,1]);
  const closeParents=page(drawings);
  alignDiagramPDFBranchEntries(closeParents,prior,{...spec,savedEntrySlot:c=>c.id==='A1'?[2,1]:undefined},
    {...spec,displayRect:c=>({...c,y:40})});
  assert.deepEqual(closeParents.cells[1].entrySlot,[2,1]);
  const painted=page(drawings);
  alignDiagramPDFBranchEntries(painted,prior,{...spec,hasAuthoredRibbon:()=>true},spec);
  assert.equal(painted.cells,drawings);
});

test('a sharp return in the saved staggered layout reserves one slot unless the author explicitly fills it',()=>{
  const parents=[null,0,1,2,3,4,2,0,7,4,9,10,11,12,1,14,6,16,17,18,13,20,4];
  const nodes=parents.map((p,i)=>({id:'n'+i,parentId:p===null?undefined:'n'+p,stepIndex:i}));
  const grid={...spec,rows:4,columns:5};
  const automatic=layoutDiagramPDFBranchTree(nodes,()=>grid,'staggeredLanes');
  assert.equal(automatic[0].cornerReserved,true);
  assert.deepEqual(automatic.map(p=>p.cells.length),[19,4]);
  assert.equal(new Set(automatic.flatMap(p=>p.cells.map(c=>c.id))).size,nodes.length);
  const exact=layoutDiagramPDFBranchTree(nodes,()=>({...grid,count:20}),'staggeredLanes');
  assert.equal(exact[0].cells.length,20);
  assert.equal(exact[0].cornerReserved,undefined);
});
