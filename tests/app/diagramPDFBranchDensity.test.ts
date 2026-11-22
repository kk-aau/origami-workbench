import assert from 'node:assert/strict';
import test from 'node:test';
import {createDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramPDFOptions,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {diagramPDFRibbonPath,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';
import type {Point} from '../../src/core/types';
import {
  layoutDiagramPDFBranchTree,
  type DiagramPDFBranchCell,
  type DiagramPDFBranchNode,
  type DiagramPDFBranchPage,
  type DiagramPDFBranchPageSpec,
} from '../../src/app/diagramPDFBranchLayout';

const grid:DiagramPDFBranchPageSpec={
  bounds:{x:30,y:70,width:510,height:680},rows:3,columns:3,gap:12,snake:true,
};

function gentlemanBranches(shortB=false){
  const nodes:DiagramPDFBranchNode[]=[];
  const add=(id:string,parentId?:string)=>nodes.push({id,parentId,stepIndex:nodes.length});
  for(let i=47;i<=54;i++)add(String(i),i===47?undefined:String(i-1));
  for(let i=55;i<=67;i++){
    add(i+'A',i===55?'54':(i-1)+'A');
    if(i===55||(!shortB&&i<=59))add(i+'B',i===55?'54':(i-1)+'B');
    if(!shortB&&i===60){add('60B.A','59B');add('60B.B','59B');}
    if(!shortB&&i===61)add('61B.B','60B.B');
  }
  if(!shortB){
    add('68A.A','67A');add('68A.B','67A');
    add('69A.A','68A.A');add('69A.B','68A.B');
    add('70A.A.A','69A.A');add('70A.A.B','69A.A');
    add('71A.A.A','70A.A.A');add('71A.A.B','70A.A.B');
  }
  return nodes;
}

function slot(cell:DiagramPDFBranchCell){
  const column=Math.floor((cell.x+cell.width/2-grid.bounds.x)/(grid.bounds.width/grid.columns));
  return [cell.row,column];
}

function verifyGraph(nodes:DiagramPDFBranchNode[],pages:DiagramPDFBranchPage[]){
  const locations=new Map<string,number>();
  for(const [index,page] of pages.entries()){
    const taken=new Set<string>();
    for(const [i,cell] of page.cells.entries()){
      const [row,column]=slot(cell);
      assert.ok(row>=0&&row<page.rows&&column>=0&&column<page.columns,cell.id);
      const key=[row,column].join(',');
      assert.ok(!taken.has(key),'occupied slot on page '+(index+1)+': '+key);
      taken.add(key);
      for(const other of page.cells.slice(0,i)){
        assert.ok(cell.x>=other.x+other.width||other.x>=cell.x+cell.width||
          cell.y>=other.y+other.height||other.y>=cell.y+cell.height,cell.id+' overlaps '+other.id);
      }
      assert.ok(!locations.has(cell.id),'duplicate step '+cell.id);
      locations.set(cell.id,index);
    }
  }
  assert.deepEqual([...locations.keys()].sort(),nodes.map(node=>node.id).sort());
  const expected:string[]=[],actual:string[]=[];
  for(const {id,parentId} of nodes){
    if(!parentId)continue;
    const source=locations.get(parentId)!,target=locations.get(id)!;
    if(source===target)expected.push([source,'local',parentId,id].join('/'));
    else{
      expected.push([source,'outgoing',parentId,id,target].join('/'));
      expected.push([target,'incoming',parentId,id,source].join('/'));
    }
  }
  for(const [index,page] of pages.entries()){
    for(const edge of page.edges){
      const parts=[index,edge.kind,edge.from,edge.to];
      if(edge.kind!=='local')parts.push(edge.otherPage!);
      actual.push(parts.join('/'));
    }
  }
  assert.deepEqual(actual.sort(),expected.sort());
}

test('two incoming branches retain their rows and a nested fork uses spare cells on the same page',()=>{
  const nodes=gentlemanBranches(),pages=layoutDiagramPDFBranchTree(nodes,()=>grid);
  verifyGraph(nodes,pages);
  const exits=pages[1].cells.filter(cell=>cell.id==='58A'||cell.id==='58B');
  assert.deepEqual(exits.map(slot),[[0,2],[1,2]]);
  const page=pages[2],cells=new Map(page.cells.map(cell=>[cell.id,cell]));
  assert.deepEqual(slot(cells.get('59A')!),[0,0]);
  assert.deepEqual(slot(cells.get('59B')!),[1,0]);
  for(const id of ['60B.A','60B.B','61B.B'])assert.ok(cells.has(id),id+' fits beside its parent');
  assert.ok(page.cells.length>=8,'the nested fork has room to continue the longer A branch');
});

test('after a short branch ends the surviving branch turns into available rows before crossing the seam',()=>{
  const nodes=gentlemanBranches(true),pages=layoutDiagramPDFBranchTree(nodes,()=>grid);
  verifyGraph(nodes,pages);
  const page=pages[1],cells=new Map(page.cells.map(cell=>[cell.id,cell]));
  assert.deepEqual(slot(cells.get('55A')!),[1,0]);
  assert.deepEqual(slot(cells.get('55B')!),[2,0]);
  assert.ok(page.cells.length>=8,'a single remaining arm can occupy more than one row');
  const chain=page.cells.filter(cell=>cell.id.endsWith('A'));
  for(let i=1;i<chain.length;i++){
    const [fromRow,fromColumn]=slot(chain[i-1]),[toRow,toColumn]=slot(chain[i]);
    assert.equal(Math.abs(fromRow-toRow)+Math.abs(fromColumn-toColumn),1,chain[i-1].id+' → '+chain[i].id);
  }
});

test('manual count controls how many drawings fit on a facing page with a nested fork',()=>{
  const nodes=gentlemanBranches();
  for(const count of [5,8]){
    const pages=layoutDiagramPDFBranchTree(nodes,index=>index===2?{...grid,count}:grid);
    verifyGraph(nodes,pages);
    assert.equal(pages[2].cells.length,count);
    assert.deepEqual(pages[2].cells.slice(0,2).map(slot),[[0,0],[1,0]]);
  }
});

test('a blocked child yields its place to another child, then unplaceable steps carry onto the next page',()=>{
  const nodes=gentlemanBranches().filter(n=>Number.parseInt(n.id)<=60);
  // The author's fixed cells force the two diagonals 59A→60A and 59B→60B.A
  // to cross. The second B child can still turn down into the vacant row.
  const pins=new Map<string,[number,number]>([
    ['59A',[0,0]],['59B',[1,0]],['60A',[1,1]],['60B.A',[0,1]],['60B.B',[2,0]],
  ]);
  const pages=layoutDiagramPDFBranchTree(nodes,index=>index===2
    ?{...grid,savedEntrySlot:node=>pins.get(node.id)}
    :grid);
  verifyGraph(nodes,pages);
  const page=pages[2],ids=new Set(page.cells.map(cell=>cell.id));
  assert.ok(ids.has('59A')&&ids.has('59B'));
  assert.equal(Number(ids.has('60A'))+Number(ids.has('60B.A')),1);
  assert.ok(ids.has('60B.B'),'try the other available child before ending this page');
  assert.ok(page.cells.length<grid.rows*grid.columns);
  assert.equal(pages[3].cells.length,1,'the deferred child is still in the export');
});

function exportedBranchPaths(nodes:DiagramPDFBranchNode[],overrides:Partial<DiagramPDFOptions>={}){
  const project=createDiagramProject(blankDoc('分支连续示例',100,100));
  const step=project.steps[0],state=project.states[1];
  project.steps[0]={...step,id:nodes[0].id,afterId:nodes[0].id+'-cp'};
  project.states[1]={...state,id:project.steps[0].afterId};
  project.activeStepId=project.steps[0].id;
  project.branchSteps=nodes.slice(1).map(({id,parentId})=>({
    parentId:parentId!,
    step:{...step,id,beforeId:parentId+'-cp',afterId:id+'-cp'},
    after:{...state,id:id+'-cp'},
  }));
  project.branchOrder=nodes.map(n=>n.id);
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'3x3' as const,...overrides};
  const plan=planDiagramPDF(project,options);
  return plan.pages.map(page=>{
    const tracks=diagramPDFRibbonTracks(options,plan,page);
    return (page.branchEdges??[]).map((edge,i)=>{
      const track=tracks[i];
      const path=diagramPDFRibbonPath(track.nodes,plan,track.bounded,track.neighbors);
      return {...edge,samples:sampleCubicPath(path)};
    });
  });
}

// Sample the same cubic centerlines that the preview and PDF paint, including
// the tangents of incoming and outgoing continuations.
function sampleCubicPath(path:string):Point[]{
  const controls=path.split(' C ').map(part=>part.replace(/^M /,'').split(/\s+/).map(Number));
  assert.ok(controls.length>=2&&controls[0].length===2&&controls.slice(1).every(c=>c.length===6));
  assert.ok(controls.every(c=>c.every(Number.isFinite)));
  let start:Point=[controls[0][0],controls[0][1]];
  const samples=[start];
  for(const [cx1,cy1,cx2,cy2,x,y] of controls.slice(1)){
    for(let i=1;i<=20;i++){
      const t=i/20,u=1-t;
      samples.push([
        u**3*start[0]+3*u**2*t*cx1+3*u*t**2*cx2+t**3*x,
        u**3*start[1]+3*u**2*t*cy1+3*u*t**2*cy2+t**3*y,
      ]);
    }
    start=[x,y];
  }
  return samples;
}

function pathsIntersect(a:Point[],b:Point[],shared:Point[]){
  const epsilon=1e-6;
  const side=(p:Point,q:Point,r:Point)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const onSegment=(p:Point,q:Point,r:Point)=>Math.abs(side(p,q,r))<epsilon&&
    r[0]>=Math.min(p[0],q[0])-epsilon&&r[0]<=Math.max(p[0],q[0])+epsilon&&
    r[1]>=Math.min(p[1],q[1])-epsilon&&r[1]<=Math.max(p[1],q[1])+epsilon&&
    !shared.some(k=>Math.hypot(k[0]-r[0],k[1]-r[1])<epsilon);
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
    const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
    if(side(p,q,r)*side(p,q,s)<-epsilon&&side(r,s,p)*side(r,s,q)<-epsilon)return true;
    if(onSegment(p,q,r)||onSegment(p,q,s)||onSegment(r,s,p)||onSegment(r,s,q))return true;
  }
  return false;
}

function verifyRibbonCurves(pages:ReturnType<typeof exportedBranchPaths>){
  assert.ok(pages.flat().length>0);
  const crossings:string[]=[];
  for(const [index,edges] of pages.entries()){
    for(const [i,a] of edges.entries())for(const b of edges.slice(i+1)){
      const endpoints=new Set<string>(),shared:Point[]=[];
      if(b.kind!=='incoming')endpoints.add(b.from);
      if(b.kind!=='outgoing')endpoints.add(b.to);
      if(a.kind!=='incoming'&&endpoints.has(a.from))shared.push(a.samples[0]);
      if(a.kind!=='outgoing'&&endpoints.has(a.to))shared.push(a.samples.at(-1)!);
      if(pathsIntersect(a.samples,b.samples,shared))crossings.push(
        'p'+(index+1)+' '+a.from+' → '+a.to+' / '+b.from+' → '+b.to,
      );
    }
  }
  assert.deepEqual(crossings,[]);
}

test('automatic ribbons for nested live branches and their page continuations do not cross',()=>{
  verifyRibbonCurves(exportedBranchPaths(gentlemanBranches()));
});

test('a four-way fork spans three entry rows without crossing the other branches',()=>{
  const parents=[null,0,1,1,1,1,2,3,4,5];
  const nodes=parents.map((parent,i)=>({id:String(i),parentId:parent===null?undefined:String(parent),stepIndex:i}));
  verifyRibbonCurves(exportedBranchPaths(nodes,{pageLayouts:{0:{count:2}}}));
});

test('grid tree search uses only free cardinal neighbours and keeps outgoing corridors clear',()=>{
  // A common run ends in a fork, one arm contains an intermediate panel,
  // then forks again while the other arm is still live. The old greedy fill
  // put an outgoing arm behind another node and escaped around its row.
  const parents=[null,0,1,2,3,4,5,5,6,8,7,9,9,10,11,12,13,14,15,16,17,18,19,20];
  const nodes=parents.map((p,i)=>({id:String(i),parentId:p===null?undefined:String(p),stepIndex:i}));
  const pages=layoutDiagramPDFBranchTree(nodes,()=>grid);
  verifyGraph(nodes,pages);
  assert.ok(pages.some(p=>p.cells.length>=8),'backtracking should preserve useful page density');
  for(const [pageIndex,page] of pages.entries()){
    const byId=new Map(page.cells.map(c=>[c.id,c]));
    for(const edge of page.edges){
      if(edge.kind==='local'){
        const a=slot(byId.get(edge.from)!),b=slot(byId.get(edge.to)!);
        assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),1,edge.from+' → '+edge.to+' must use a neighbouring node');
      }else if(edge.kind==='outgoing'){
        assert.equal(edge.otherPage,pageIndex+1,'an unfinished branch must resume on the next page');
        const a=slot(byId.get(edge.from)!);
        assert.ok(!page.cells.some(c=>{const b=slot(c);return b[0]===a[0]&&b[1]>a[1];}),edge.from+' cannot exit through an occupied node');
      }
    }
  }
  verifyRibbonCurves(exportedBranchPaths(nodes));
});

test('a page with no free neighbour carries the remaining nodes forward without dropping a branch',()=>{
  const nodes=gentlemanBranches(),pages=layoutDiagramPDFBranchTree(nodes,()=>grid);
  verifyGraph(nodes,pages);
  assert.ok(pages.slice(0,-1).some(p=>p.cells.length<grid.rows*grid.columns));
  for(const [i,page] of pages.entries())for(const edge of page.edges.filter(e=>e.kind==='outgoing')){
    assert.ok(edge.otherPage!>i);
    assert.ok(pages[edge.otherPage!].edges.some(e=>e.kind==='incoming'&&e.from===edge.from&&e.to===edge.to&&e.otherPage===i));
  }
});

test('every open branch resumes on the immediately following page before longer arms can fill it',()=>{
  const parents=[null,0,1,2,3,4,5,5,7,8,7,10,9,6,12,14,10,15,16,18,13,20,13,14,21,24,17,25,23,22,26,30,28,27,33];
  const nodes=parents.map((parent,i)=>({id:String(i),parentId:parent===null?undefined:String(parent),stepIndex:i}));
  const pages=layoutDiagramPDFBranchTree(nodes,()=>grid);
  verifyGraph(nodes,pages);
  for(const [index,page] of pages.entries())for(const edge of page.edges.filter(e=>e.kind==='outgoing')){
    assert.equal(edge.otherPage,index+1,edge.from+' → '+edge.to+' may not skip a page');
  }
  verifyRibbonCurves(exportedBranchPaths(nodes));
});
