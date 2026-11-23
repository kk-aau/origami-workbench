import assert from 'node:assert/strict';
import test from 'node:test';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramPDFOptions,diagramPDFPanelKey,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon,diagramPDFBranchContinuations,diagramPDFRibbonArrowPath,diagramPDFRibbonPath,diagramPDFRibbonSVG,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';
import {diagramPDFRibbonAnchor} from '../../src/app/diagramPDFBranchContinuation';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import type {Point} from '../../src/core/types';

function fixture(){
  const source=createDiagramProject(blankDoc('分叉',100,100)),project=addDiagramBranch(source,source.activeStepId);
  const defaults=defaultDiagramPDFRibbon();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',readingOrder:'snake',
    ribbon:{...defaults,paint:{...defaults.paint,kind:'linear'},arrowStyle:'solid',arrowColor:'#aa2244'}};
  return {project,options};
}

test('independent branch ribbons connect each child to the same artwork and retain separate edited nodes',()=>{
  const {project,options}=fixture(),plan=planDiagramPDF(project,options),page=plan.pages[0];
  const tracks=diagramPDFRibbonTracks(options,plan,page);
  assert.equal(tracks.length,2);
  assert.notEqual(tracks[0].key,tracks[1].key);
  assert.deepEqual(tracks[0].nodes[0],tracks[1].nodes[0]);
  assert.notDeepEqual(tracks[0].nodes.at(-1),tracks[1].nodes.at(-1));
  const edited={...options,ribbon:{...options.ribbon!,paths:{[tracks[0].key]:[tracks[0].nodes[0],[.4,.47] as [number,number],tracks[0].nodes.at(-1)!]}}};
  const changed=diagramPDFRibbonTracks(edited,plan,page);
  assert.deepEqual(changed[0].nodes[1],[.4,.47]);assert.deepEqual(changed[1],tracks[1]);
  const svg=diagramPDFRibbonSVG(edited,plan,page,0);
  assert.equal(svg.match(/data-pdf-ribbon-edge=/g)?.length,2);
  assert.equal(svg.match(/fill="#aa2244"/g)?.length,2);
  assert.match(svg,/gradientUnits="userSpaceOnUse"/);
});

test('a cross-page fork shows physical page numbers when a separate cover precedes it',()=>{
  const {project,options}=fixture();
  const config={...options,cover:'standard' as const,layout:'1x1' as const};
  const plan=planDiagramPDF(project,config);
  assert.equal(plan.pages.length,4);
  const root=diagramPDFBranchContinuations(config,plan,plan.pages[1]);
  assert.match(root,/续第 3 页/);
  assert.match(root,/续第 4 页/);
  const exits=plan.pages[1].branchEdges!.filter(edge=>edge.kind==='outgoing');
  assert.equal(exits.length,2);
  assert.notDeepEqual(exits[0].points.at(-1),exits[1].points.at(-1));
  for(const i of [2,3])assert.match(diagramPDFBranchContinuations(config,plan,plan.pages[i]),/接第 2 页/);
});

test('sequential reading draws no connections between panels, even with saved branch ribbons',()=>{
  const project=longBranchedProject();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3'};
  for(const readingOrder of ['rows',undefined,'snake'] as const){
    const configured={...options,readingOrder};
    const plan=planDiagramPDF(project,configured);
    assert.ok(plan.pages.length>1);
    for(const [i,page] of plan.pages.entries()){
      if(!page.branchEdges?.length)continue;
      const drawing=diagramPDFPageSVG(project,configured,plan,i,defaultDiagramLineDefaults(),true);
      assert.match(drawing,/data-pdf-step=/);
      assert.equal(drawing.includes('data-pdf-ribbon='),readingOrder==='snake');
    }
  }
});

test('moving two branch panels next to each other discards the old gutter around the intervening panel',()=>{
  const project=longBranchedProject(),options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3'};
  const plan=planDiagramPDF(project,options),page=plan.pages[0],[from,obstacle,to]=page.cells;
  const [ax,ay]=diagramPDFRibbonAnchor(from),[bx,by]=diagramPDFRibbonAnchor(to);
  const edge={from:from.branchNodeId!,to:to.branchNodeId!,kind:'local' as const,points:[[ax,ay],[ax,from.y],[bx,to.y],[bx,by]] as Point[]};
  const original={...page,cells:[from,obstacle,to],branchEdges:[edge]};
  assert.ok(diagramPDFRibbonTracks(options,plan,original)[0].nodes.length>2);
  const swapped={...original,cells:[from,{...obstacle,x:to.x},{...to,x:obstacle.x}]};
  const track=diagramPDFRibbonTracks(options,plan,swapped)[0];
  assert.deepEqual(track.nodes,[from,swapped.cells[2]].map(c=>[(c.x+c.width/2)/plan.width,(c.y+c.height*.4)/plan.height]));
  const saved={...options,ribbon:{...options.ribbon!,paths:{[track.key]:[track.nodes[0],[.5,.04] as Point,track.nodes[1]]}}};
  assert.equal(diagramPDFRibbonTracks(saved,plan,swapped)[0].nodes.length,3,'an explicitly authored intermediate knot is retained');
});

test('a short automatic connection follows the new direction after a step moves, in both linear and branch layouts',()=>{
  const project=longBranchedProject();
  for(const scope of ['all','route'] as const){
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),scope,cover:'none',layout:'3x3'};
    const plan=planDiagramPDF(project,options),page=plan.pages[0],from=page.cells[1],target=page.cells[2];
    const moved={...target,x:from.x-4,y:from.y-7};
    const current={...page,cells:page.cells.map(c=>c===target?moved:c)};
    const track=diagramPDFRibbonTracks(options,plan,current)[page.branchEdges?1:0];
    const index=page.branchEdges?0:1;
    const d=diagramPDFRibbonPath(track.nodes,plan,track.bounded,track.neighbors);
    const coords=d.split(' C ')[index+1].split(' ').map(Number);
    const a=diagramPDFRibbonAnchor(from),b=diagramPDFRibbonAnchor(moved),dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
    for(const [x,y] of [[coords[0]-a[0],coords[1]-a[1]],[b[0]-coords[2],b[1]-coords[3]]]){
      const along=(x*dx+y*dy)/len2,side=(y*dx-x*dy)/len2;
      assert.ok(along>=-1e-8&&along<=.5+1e-8&&Math.abs(side)<=.25+1e-8,'handles stay within the short connection and point forward');
    }
  }
});

function longBranchedProject(){
  let project=createDiagramProject(blankDoc('跨页后的分叉',100,100));
  while(project.steps.length<37)project=appendDiagramStep(project);
  return addDiagramBranch(project,project.activeStepId);
}

test('horizontal and vertical runs before a fork use the continuous snake spline and its arrow tangents',()=>{
  const project=longBranchedProject();
  for(const snakeDirection of ['horizontal','vertical'] as const){
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3',
      readingOrder:'snake',snakeDirection,ribbon:{...defaultDiagramPDFRibbon(),arrowStyle:'solid'}};
    const plan=planDiagramPDF(project,options),page=plan.pages[0],tracks=diagramPDFRibbonTracks(options,plan,page);
    const knots=page.cells.map(cell=>{
      const [x,y]=diagramPDFRibbonAnchor(cell);return [x/plan.width,y/plan.height] as Point;
    });
    const reference=diagramPDFRibbonPath(knots,plan).split(' C ').slice(1);
    const arrows=diagramPDFRibbonArrowPath(knots,plan,options.ribbon!.widthMm,[],options.ribbon).split(' Z');
    const svg=diagramPDFRibbonSVG(options,plan,page,0);
    const rendered=[...svg.matchAll(/<g data-pdf-ribbon-edge="(\d+)"><path data-pdf-ribbon="true"[^>]* d="([^"]+)"[^>]*\/><path data-pdf-ribbon-arrows="true" d="([^"]*)"/g)];
    // Interior edges include both U-turns and their neighbouring horizontal/vertical stretches.
    for(let i=1;i<knots.length-2;i++){
      assert.deepEqual(tracks[i].nodes,[knots[i],knots[i+1]]);
      assert.equal(rendered[i][2].split(' C ')[1],reference[i],`edge ${i} retains the whole-page Bézier handles`);
      assert.equal(rendered[i][3],arrows[i].trim()+' Z',`edge ${i} arrow follows the same curve`);
    }
    const turn=tracks[2],axis=snakeDirection==='horizontal'?0:1;
    assert.equal(turn.nodes[0][axis],turn.nodes[1][axis]);
    assert.notEqual(Number(reference[2].split(' ')[axis]),turn.nodes[0][axis]*(axis===0?plan.width:plan.height));

    const edited={...options,ribbon:{...options.ribbon!,paths:{[turn.key]:[turn.nodes[0],[.4,.48] as Point,turn.nodes[1]]}}};
    const manual=diagramPDFRibbonTracks(edited,plan,page)[2];
    assert.deepEqual(manual.nodes,edited.ribbon.paths[turn.key]);
    assert.equal(manual.neighbors,undefined);
    const fine=diagramPDFRibbonTracks({...options,ribbon:{...options.ribbon!,enabled:false}},plan,page)[2];
    assert.equal(fine.neighbors,undefined);
    assert.equal(fine.nodes.length,3);
    assert.ok(fine.nodes.every(point=>point[axis]===fine.nodes[0][axis]));
  }
});

function pageSeams(options:DiagramPDFOptions,plan:ReturnType<typeof planDiagramPDF>){
  return plan.pages.flatMap((page,pageIndex)=>{
    const tracks=diagramPDFRibbonTracks(options,plan,page);
    return (page.branchEdges??[]).flatMap((edge,edgeIndex)=>{
      if(edge.kind==='local')return [];
      const nodes=tracks[edgeIndex].nodes;
      const [tip,inside]=edge.kind==='incoming'?[nodes[0],nodes[1]]:[nodes.at(-1)!,nodes.at(-2)!];
      const [x,y]=edge.kind==='incoming'?edge.points[0]:edge.points.at(-1)!;
      assert.ok(Math.abs(x/plan.width-tip[0])<1e-8&&Math.abs(y/plan.height-tip[1])<1e-8,'the layout and rendered ribbon reach the same page edge');
      const track=tracks[edgeIndex],spans=diagramPDFRibbonPath(nodes,plan,track.bounded,track.neighbors).split(' C ').slice(1);
      const entry=edge.kind==='incoming',controls=(entry?spans[0]:spans.at(-1)!).split(' ').map(Number);
      const slope=(controls[entry?1:3]-y)/(controls[entry?0:2]-x);
      return [{...edge,pageIndex,tip,inside,nodes,slope}];
    });
  });
}

test('horizontal snake branch continuations meet the right and left page edges at the same height on full and partial pages',()=>{
  const project=longBranchedProject();
  // First page has an odd number of rows, second an even number, third a partial reverse row.
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',readingOrder:'snake',snakeDirection:'horizontal',
    pageLayouts:{0:{rows:3,columns:3},1:{rows:4,columns:3},2:{rows:2,columns:3,count:5}}};
  const plan=planDiagramPDF(project,options),seams=pageSeams(options,plan);
  assert.deepEqual(plan.pages.slice(0,3).map(page=>page.cells.length),[9,12,5]);
  const exits=seams.filter(edge=>edge.kind==='outgoing');
  assert.ok(exits.length>=3);
  for(const exit of exits){
    const entry=seams.find(edge=>edge.kind==='incoming'&&edge.from===exit.from&&edge.to===exit.to&&edge.pageIndex===exit.otherPage);
    assert.ok(entry,`crossing ${exit.from} → ${exit.to} has an arrival`);
    assert.equal(exit.tip[0],1,'right edge of preceding page');
    assert.equal(entry.tip[0],0,'left edge of following page');
    assert.ok(Math.abs(exit.tip[1]-entry.tip[1])<1e-8,'adjacent pages meet at the same height');
    assert.ok(exit.inside[0]<exit.tip[0]&&entry.inside[0]>entry.tip[0]);
    assert.ok(Math.abs(exit.slope-entry.slope)<1e-8,'the printed curves cross both page edges at the same angle');
    const page=plan.pages[exit.pageIndex],source=page.cells.find(cell=>cell.branchNodeId===exit.from)!;
    const rowNeighbors=page.cells.filter(cell=>cell.y===source.y&&cell.x>source.x);
    if(rowNeighbors.length){
      const inGutter=exit.nodes.some(([,y])=>y*plan.height<=source.y||y*plan.height>=source.y+source.height);
      assert.ok(inGutter,'a returning ribbon uses the gutter around other panels on the same row');
    }
  }
});

test('horizontal, vertical and mixed snake pages all meet at the facing paper edges',()=>{
  const project=longBranchedProject();
  for(const snakeDirection of ['horizontal','vertical'] as const){
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'diagram',readingOrder:'snake',
      snakeDirection,layout:'3x4',pageLayouts:{1:{snakeDirection:'vertical'},2:{count:10}}};
    const plan=planDiagramPDF(project,options),seams=pageSeams(options,plan);
    const [first,second]=plan.pages[1].cells;
    assert.equal(first.x,second.x,'the middle page still reads down or up a column');
    assert.notEqual(first.y,second.y);
    const exits=seams.filter(edge=>edge.kind==='outgoing');
    assert.ok(exits.length>=3);
    for(const exit of exits){
      const entry=seams.find(edge=>edge.kind==='incoming'&&edge.pageIndex===exit.otherPage&&edge.from===exit.from&&edge.to===exit.to);
      assert.ok(entry);
      assert.equal(exit.tip[0],1,'the preceding page exits at the right edge');
      assert.equal(entry.tip[0],0,'the next page enters at the left edge');
      assert.ok(Math.abs(exit.tip[1]-entry.tip[1])<1e-8,'matching steps share a seam height');
      assert.ok(Math.abs(exit.slope-entry.slope)<1e-8,'the tangent is continuous across the spread for either reading direction');
    }
    assert.ok(exits.some(exit=>Math.abs(exit.slope)>.02),'at least one automatic continuation follows a slanted approach');
  }
});

test('reversed rows leave the header clear of full-width return ribbons',()=>{
  const project=longBranchedProject();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'diagram',readingOrder:'snake',
    snakeDirection:'horizontal',introLayout:'3x3',layout:'3x4'};
  const plan=planDiagramPDF(project,options);
  for(const {pageIndex,nodes} of pageSeams(options,plan)){
    const firstRowTop=Math.min(...plan.pages[pageIndex].cells.map(cell=>cell.y))/plan.height;
    const aboveSteps=nodes.filter(([,y])=>y<firstRowTop).map(([x])=>x);
    if(aboveSteps.length>1)assert.ok(Math.max(...aboveSteps)-Math.min(...aboveSteps)<.5,'the band should not wrap along the header');
  }
});

test('moving a panel on a full spread keeps both new and previously saved snake slots',()=>{
  const project=longBranchedProject();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x4',
    readingOrder:'snake',layoutMode:'free'};
  const initial=planDiagramPDF(project,options).pages[0];
  const tail=initial.cells.at(-1)!;
  const key=diagramPDFPanelKey(project,tail);
  assert.equal(initial.spreadRoute,true);
  for(const modern of [false,true]){
    const placement={x:-.01,y:.015,scale:.9,...(modern?{spreadRoute:true as const}:{})};
    const pdf={...options,panelPlacements:{[key]:placement}};
    const saved=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf}}));
    const restored=planDiagramPDF(saved,{...options,...saved.exportSettings!.pdf}).pages[0];
    const base=restored.cells.at(-1)!.baseRect!;
    if(modern)assert.deepEqual(base,tail.baseRect,'the first edit uses the visible automatic slot');
    else{
      assert.equal(base.x,restored.cells[0].baseRect!.x,'the old 3×4 layout ended on the left');
      assert.ok(base.y>restored.cells[0].y);
    }
  }
});

test('the first manual move or resize stays anchored to the displayed row after saving and reopening a branch project',()=>{
  const project=longBranchedProject();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3',readingOrder:'snake',layoutMode:'free'};
  const plan=planDiagramPDF(project,options),page=plan.pages[1],cell=page.cells[0];
  assert.equal(page.farSideStart,true);
  assert.ok(cell.y>plan.height/2&&plan.pages[2].cells[0].y<plan.height/2,'successive pages start at the previous exit row');
  const key=diagramPDFPanelKey(project,cell);
  for(const edit of [{x:.01,y:-.02,scale:1},{x:0,y:0,scale:.8}]){
    const pdf={...options,panelPlacements:{[key]:{...edit,farSideStart:page.farSideStart}}};
    const moved=planDiagramPDF(project,pdf).pages[1];
    assert.deepEqual(moved.cells[0].baseRect,cell.baseRect);
    assert.ok(Math.abs(moved.cells[0].y-(cell.y+cell.height*(1-edit.scale)/2+edit.y*plan.height))<1e-6);
    assert.ok(Math.abs(moved.cells[0].width-cell.width*edit.scale)<1e-6);
    const reopened=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf}}));
    assert.deepEqual(planDiagramPDF(reopened,{...options,...reopened.exportSettings!.pdf}).pages[1].cells,moved.cells);
  }
});

test('previously authored panels and ribbon bends keep their original row while old cross-page ends move to the side',()=>{
  const project=longBranchedProject();
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'3x3',readingOrder:'snake',layoutMode:'free'};
  const automatic=planDiagramPDF(project,options),key=diagramPDFPanelKey(project,automatic.pages[1].cells[0]);
  const legacyPanel={...options,panelPlacements:{[key]:{x:0,y:.025,scale:1}}};
  const legacyPlan=planDiagramPDF(project,legacyPanel),legacyPage=legacyPlan.pages[1];
  assert.ok(legacyPage.cells[0].y<legacyPlan.height/2,'a saved placement without a start-side flag refers to the original top row');
  const index=legacyPage.branchEdges!.findIndex(edge=>edge.kind==='outgoing');
  const oldTrack=diagramPDFRibbonTracks(legacyPanel,legacyPlan,legacyPage)[index];
  const bend:[number,number]=[.56,.42],oldEnd:[number,number]=[.67,.91];
  const pdf={...options,ribbon:{...defaultDiagramPDFRibbon(),paths:{[oldTrack.key]:[oldTrack.nodes[0],bend,oldEnd]}}};
  const reopened=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf}}));
  const restored={...options,...reopened.exportSettings!.pdf};
  const plan=planDiagramPDF(reopened,restored),page=plan.pages[1],track=diagramPDFRibbonTracks(restored,plan,page)[index];
  assert.equal(page.cells[0].y,legacyPage.cells[0].baseRect!.y,'a saved path alone preserves the original top-row start');
  assert.equal(track.key,oldTrack.key);
  assert.ok(track.nodes.some(([x,y])=>x===bend[0]&&y===bend[1]));
  assert.equal(track.nodes.at(-1)![0],1);
});
