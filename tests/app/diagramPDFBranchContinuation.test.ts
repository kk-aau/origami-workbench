import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {diagramPDFBranchContinuationPaths,diagramPDFRibbonAnchor,diagramPDFRibbonSeamNeighbors,type ContinuationLayout} from '../../src/app/diagramPDFBranchContinuation';
import {diagramPDFBranchEndpoint,diagramPDFBranchRoute} from '../../src/app/diagramPDFBranchCrossings';
import {diagramPDFBranchLocalPath,type DiagramPDFBranchCell,type DiagramPDFBranchPage,type DiagramPDFBranchPageSpec} from '../../src/app/diagramPDFBranchLayout';
import type {DiagramPDFRect} from '../../src/app/diagramPDFLayout';
import type {DiagramPDFSeamHeight} from '../../src/app/diagramPDFSeams';
import {defaultDiagramPDFRibbon,diagramPDFBranchRibbonTracks,diagramPDFRibbonKey,diagramPDFRibbonPath,type DiagramPDFRibbon} from '../../src/app/diagramPDFDecoration';
import {createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';

const paper={x:0,y:0,width:595,height:842},gap=17;
const cell=(x:number,y:number)=>({x,y,width:158,height:228});
function printed(points:Point[],side:'incoming'|'outgoing',slopes?:number[]):Point[]{
  const nodes=points.map(([x,y]):Point=>[x/paper.width,y/paper.height]);
  const svg=diagramPDFRibbonPath(nodes,paper,true,diagramPDFRibbonSeamNeighbors(nodes,side,slopes,paper));
  return sampleSVG(svg);
}
function sampleSVG(svg:string):Point[]{
  const [move,...pieces]=svg.split(' C ');
  const sample:Point[]=[move.slice(2).split(' ').map(Number) as Point];
  for(const piece of pieces){
    const [x1,y1,x2,y2,x3,y3]=piece.split(' ').map(Number),[x0,y0]=sample.at(-1)!;
    for(let j=1;j<=80;j++){
      const t=j/80,u=1-t;
      sample.push([u**3*x0+3*u*u*t*x1+3*u*t*t*x2+t**3*x3,u**3*y0+3*u*u*t*y1+3*u*t*t*y2+t**3*y3]);
    }
  }
  return sample;
}
function printedTangent(svg:string,atEnd:boolean){
  const [move,...cubics]=svg.split(' C '),segments=cubics.map(c=>c.split(' ').map(Number));
  const i=atEnd?segments.length-1:0;
  const [x,y]=i===0?move.slice(2).split(' ').map(Number):segments[i-1].slice(4);
  const [x1,y1,x2,y2,x3,y3]=segments[i];
  const points=[[x,y],[x1,y1],[x2,y2],[x3,y3]];
  if(atEnd)points.reverse();
  const [anchor,...controls]=points,handle=controls.find(p=>Math.hypot(p[0]-anchor[0],p[1]-anchor[1])>1e-7)!;
  return (handle[0]-anchor[0])/(handle[1]-anchor[1]);
}
test('a fork enters the two bottom lanes below the neighboring branch, then exits over the neighboring top lane',()=>{
  const a=cell(218,553),b=cell(394,553),topA=cell(218,61),topB=cell(394,61);
  const lanes=[a,b,topA,topB,cell(218,307),cell(394,307)];
  const at=(c:typeof a,cells:typeof lanes):ContinuationLayout=>({cell:c,cells,paper,gap});
  const fork=cell(218,553),next=cell(42,61);
  for(const width of [8,14].map(mm=>mm*72/25.4)){
    const source=at(fork,[cell(42,553),fork]);
    const near=diagramPDFBranchContinuationPaths(source,at(a,lanes),undefined,width);
    const far=diagramPDFBranchContinuationPaths(source,at(b,lanes),undefined,width);
    assert.ok(far.incoming[0][1]-near.incoming[0][1]>width*2,'the fork separates on the facing pages');
    const upper=diagramPDFBranchContinuationPaths(at(topA,lanes),at(next,[next]),undefined,width);
    for(const knots of [far.incoming,upper.outgoing]){
      assert.ok(knots.every(([x,y],i)=>!i||Math.abs(x-knots[i-1][0])>.01||Math.abs(y-knots[i-1][1])<1),
        'the corridor turns gradually into an oblique seam without a vertical step');
    }
    for(const [samples,blocker,above] of [[printed(far.incoming,'incoming'),a,false],[printed(upper.outgoing,'outgoing'),topB,true]] as const){
      assert.ok(samples.every(([x],i)=>i===0||x>=samples[i-1][0]-.001),'the ribbon does not turn back across the drawing');
      const middle=blocker.x+blocker.width/2,across=samples.filter(([x])=>Math.abs(x-middle)<8);
      assert.ok(across.length);
      assert.ok(across.every(([,y])=>above?y+width/2<blocker.y:y-width/2>blocker.y+blocker.height),'the full band passes outside the other branch');
    }
  }
});

test('a linked height between drawings retains a shared slant; an outside height turns at the edge, and detached ends move independently',()=>{
  const a=cell(394,500),b=cell(42,130),source={cell:a,cells:[a],paper,gap},target={cell:b,cells:[b],paper,gap};
  const {outgoing,incoming,slopes}=diagramPDFBranchContinuationPaths(source,target,.5,22);
  assert.equal(outgoing.at(-1)![1],paper.height*.5);
  assert.equal(incoming[0][1],paper.height*.5);
  const leave=slopes!.outgoing.at(-1)!,enter=slopes!.incoming[0];
  assert.ok(leave<-.1&&Math.abs(leave-enter)<1e-8);
  const peak=diagramPDFBranchContinuationPaths(source,target,.9,22);
  assert.ok(Math.abs(peak.slopes!.outgoing.at(-1)!)<1e-9);
  assert.ok(Math.abs(peak.slopes!.incoming[0])<1e-9);
  assert.ok(peak.incoming[1][1]<peak.incoming[0][1]&&peak.outgoing.at(-2)![1]<peak.outgoing.at(-1)![1],'the curve turns at the pin instead of flattening before it');
  const detached=diagramPDFBranchContinuationPaths(source,target,{outgoing:.35,incoming:.53},22);
  assert.equal(detached.outgoing.at(-1)![1],paper.height*.35);
  assert.equal(detached.incoming[0][1],paper.height*.53);
});

test('diagonal ink extends one stroke radius past the cut while editing nodes and arrows end on the physical page',()=>{
  const a=cell(394,500),b=cell(42,130),source={cell:a,cells:[a],paper,gap},target={cell:b,cells:[b],paper,gap};
  const width=14*72/25.4,paths=diagramPDFBranchContinuationPaths(source,target,.5,width);
  for(const side of ['incoming','outgoing'] as const){
    const entry=side==='incoming',nodes=paths[side].map(([x,y]):Point=>[x/paper.width,y/paper.height]);
    const neighbors=diagramPDFRibbonSeamNeighbors(nodes,side,paths.slopes?.[side],paper);
    const logical=diagramPDFRibbonPath(nodes,paper,true,neighbors),paint=diagramPDFRibbonPath(nodes,paper,true,neighbors,width);
    assert.ok(!logical.includes(' L '));
    const exposed=entry?paint.split(' L ')[0].slice(2):paint.split(' L ').at(-1)!;
    const [x,y]=exposed.split(' ').map(Number),tip=entry?paths[side][0]:paths[side].at(-1)!;
    const slope=entry?paths.slopes!.incoming[0]:paths.slopes!.outgoing.at(-1)!;
    assert.ok(entry?x < -width/2:x > paper.width+width/2);
    assert.ok(Math.abs((y-tip[1])/(x-tip[0])-slope)<1e-9);
    const curve=printed(paths[side],side,paths.slopes?.[side]).filter(([x])=>Math.abs(x-tip[0])<width/2);
    assert.ok(curve.length>10);
    const near=entry?curve[1]:curve.at(-2)!;
    assert.ok(Math.abs((near[1]-tip[1])/(near[0]-tip[0])-slope)<.01,'the printed curve reaches the cut tangent to the bleed');
  }
});

interface ForkExample {blocked?:boolean;seam?:DiagramPDFSeamHeight;sourceCaption?:DiagramPDFRect;approachOffset?:number;fromPreviousPage?:boolean;ribbon?:DiagramPDFRibbon}
function forkAcrossSpread(direction:1|-1,{blocked,seam,sourceCaption,approachOffset=0,fromPreviousPage,ribbon=defaultDiagramPDFRibbon()}:ForkExample={}){
  const grid:DiagramPDFBranchPageSpec={bounds:{x:35,y:54,width:525,height:737},paper,
    columns:3,rows:3,gap,snake:true,ribbon,ribbonWidth:20,seamHeight:()=>seam,
    obstacleRects:(drawing,rect)=>drawing.id==='fork'&&sourceCaption?[rect,sourceCaption]:[rect]};
  const drawing=(id:string,row:number,column:number,parentId?:string):DiagramPDFBranchCell=>({
    ...cell([42,218,394][column],[61,307,553][row]),id,row,parentId,stepIndex:0,
  });
  const sheet=(cells:DiagramPDFBranchCell[]):DiagramPDFBranchPage=>({rows:3,columns:3,cells,edges:[]});
  const previous=drawing('previous',1-direction,2);
  previous.x+=approachOffset;
  const parent=drawing('fork',1,2,previous.id),otherRow=1+direction;
  const beside=drawing('beside',1,1),source=sheet(fromPreviousPage?[beside,parent]:[beside,previous,parent]);
  const blocker=drawing('occupied',otherRow,2);
  if(blocked)source.cells.push(blocker);
  const level=drawing('level',1,0,parent.id),turn=drawing('turn',otherRow,0,parent.id);
  const target=sheet([level,turn,drawing('after-level',1,1,level.id),drawing('after-turn',otherRow,1,turn.id)]);
  const arms=new Map([[parent.id,[level,turn]]]);
  if(fromPreviousPage){
    const [x,y]=diagramPDFRibbonAnchor(parent);
    source.edges.push({from:previous.id,to:parent.id,kind:'incoming',otherPage:0,
      points:[[0,y-direction*110],[x-20,y-direction*90],[x,y]],slopes:[0,direction*1.5,direction*4.5]});
  }else source.edges.push({from:previous.id,to:parent.id,kind:'local',points:diagramPDFBranchLocalPath(previous,parent,source,grid)});
  const paths=(child:DiagramPDFBranchCell)=>diagramPDFBranchRoute(
    diagramPDFBranchEndpoint(parent,source,grid),diagramPDFBranchEndpoint(child,target,grid),
    parent.id,child.id,grid,arms,
  );
  const straight=paths(level),turning=paths(turn);
  for(const [child,path] of [[level,straight],[turn,turning]] as const){
    source.edges.push({from:parent.id,to:child.id,kind:'outgoing',points:path.outgoing,slopes:path.slopes?.outgoing,otherPage:1});
  }
  const size={...paper,gap},page={...source,kind:'steps' as const,notes:[],branchEdges:source.edges,
    cells:source.cells.map(c=>({...c,columns:3,rows:3,descriptionLines:[],descriptionOverflow:false,branchNodeId:c.id}))};
  const sourceKey=diagramPDFRibbonKey(size,page);
  const [incomingTrack,,outgoingTrack]=diagramPDFBranchRibbonTracks({readingOrder:'snake',ribbon},size,page,source.edges,sourceKey);
  const render=(track:typeof incomingTrack)=>diagramPDFRibbonPath(track.nodes,size,track.bounded,track.neighbors);
  const arriving=render(incomingTrack),leaving=render(outgoingTrack);
  return {parentX:diagramPDFRibbonAnchor(parent)[0],parentY:diagramPDFRibbonAnchor(parent)[1],targetY:diagramPDFRibbonAnchor(turn)[1],
    straight,turning,blocker,approachKey:incomingTrack.key,turnKey:outgoingTrack.key,
    printedApproach:sampleSVG(arriving),printedDeparture:sampleSVG(leaving),
    approachSlope:printedTangent(arriving,true),departureSlope:printedTangent(leaving,false)};
}

for(const direction of [1,-1] as const){
  test('an automatic fork turns on the source sheet and reaches the '+(direction===1?'lower':'upper')+' arrival lane level',()=>{
    const {parentX,parentY,targetY,straight,turning}=forkAcrossSpread(direction);
    for(const side of ['outgoing','incoming'] as const){
      assert.ok(printed(straight[side],side,straight.slopes?.[side]).every(([,y])=>Math.abs(y-parentY)<.1));
    }
    const source=printed(turning.outgoing,'outgoing',turning.slopes?.outgoing);
    const arriving=printed(turning.incoming,'incoming',turning.slopes?.incoming);
    assert.ok(Math.abs(source.at(-1)![1]-targetY)<.1,'the turn reaches the next row before the gutter');
    assert.ok(arriving.every(([,y])=>Math.abs(y-targetY)<.1),'the second child receives a horizontal ribbon');
    assert.ok(source.some(([x,y])=>Math.abs(x-parentX)<20&&direction*(y-parentY)>Math.abs(targetY-parentY)/2),
      'the branch travels into the empty slot in the parent column before turning toward the gutter');
    const tip=source.at(-1)!,near=source.slice(0,-1).reverse().find(([x])=>tip[0]-x>1)!;
    assert.ok(Math.abs((near[1]-tip[1])/(near[0]-tip[0]))<.12,'both pages meet with a level tangent');
  });
}

test('printed artwork in the turning cell and manually edited seam heights take precedence',()=>{
  const {turning,blocker}=forkAcrossSpread(1,{blocked:true});
  const halfWidth=10;
  const printedSource=printed(turning.outgoing,'outgoing',turning.slopes?.outgoing);
  assert.ok(printedSource.every(([x,y])=>x<=blocker.x-halfWidth||x>=blocker.x+blocker.width+halfWidth||
    y<=blocker.y-halfWidth||y>=blocker.y+blocker.height+halfWidth),'the full band clears the occupied cell');
  const linked=forkAcrossSpread(1,{seam:.56}).turning;
  assert.equal(linked.outgoing.at(-1)![1],paper.height*.56);
  assert.equal(linked.incoming[0][1],paper.height*.56);
  const detached=forkAcrossSpread(-1,{seam:{outgoing:.43,incoming:.37}}).turning;
  assert.equal(detached.outgoing.at(-1)![1],paper.height*.43);
  assert.equal(detached.incoming[0][1],paper.height*.37);
});

for(const direction of [1,-1] as const){
  test('the '+(direction===1?'descending':'ascending')+' arm continues the preceding printed tangent before the corner',()=>{
    for(const offset of [0,-24,24]){
      const caption={x:451,y:direction===1?510:262,width:44,height:14};
      const {printedDeparture,parentX,parentY,targetY,approachSlope:incomingSlope,departureSlope:departingSlope}=forkAcrossSpread(direction,{sourceCaption:caption,approachOffset:offset});
      assert.ok(Math.abs(incomingSlope)>Math.abs(offset)/260-.01,'the actual preceding segment carries the slight slant');
      assert.ok(Math.abs(incomingSlope-departingSlope)<.025,
        'the direction is continuous at the shared drawing ('+offset+'pt shift, dx/dy '+incomingSlope+' → '+departingSlope+')');
      const straight=printedDeparture.filter(([,y])=>(y-parentY)/(targetY-parentY)<=.60);
      assert.ok(direction*(straight.at(-1)![1]-parentY)>Math.abs(targetY-parentY)*.58);
      const deviation=([x,y]:Point)=>Math.abs(x-parentX-(y-parentY)*incomingSlope);
      assert.ok(straight.filter(([,y])=>(y-parentY)/(targetY-parentY)<=.40).every(p=>deviation(p)<1),
        'the first portion of the stem follows the previous line');
      const sideways=Math.max(...straight.map(deviation));
      assert.ok(sideways<6,'the stem holds its direction through most of the row, including the step label ('+offset+'pt shift, deviation '+sideways+'pt)');
      assert.ok(Math.abs(printedDeparture.at(-1)![1]-targetY)<.1);
    }
  });
}

test('a branch also follows the printed tangent when the preceding step is on another page',()=>{
  const {approachSlope,departureSlope,printedDeparture,targetY}=forkAcrossSpread(1,{fromPreviousPage:true});
  assert.ok(Math.abs(approachSlope-1/4.5)<.001,'the curved incoming ribbon is slanted as it reaches the fork');
  assert.ok(Math.abs(departureSlope-approachSlope)<.025);
  assert.ok(Math.abs(printedDeparture.at(-1)![1]-targetY)<.1);
});

test('reopening authored ribbon knots retains the arrival tangent and the chosen old or new page exit',()=>{
  const base=forkAcrossSpread(1),project=createDiagramProject(blankDoc('手调跨页彩带',100,100));
  const normalized=([x,y]:Point):Point=>[x/paper.width,y/paper.height];
  const start=base.printedApproach[0],end=base.printedApproach.at(-1)!;
  const editedApproach=[start,[end[0]-18,end[1]-75] as Point,end].map(normalized);
  const reopen=(paths:Record<string,Point[]>)=>{
    const settings={ribbon:{...defaultDiagramPDFRibbon(),paths}};
    const saved=exportDiagramProject({...project,exportSettings:{pdf:settings}});
    return importDiagramProject(saved).exportSettings!.pdf!.ribbon!;
  };
  const edited=forkAcrossSpread(1,{ribbon:reopen({[base.approachKey]:editedApproach})});
  assert.ok(edited.approachSlope>.15,'the edited last knot changes the tangent from that of the two vertically aligned drawings');
  assert.ok(Math.abs(edited.departureSlope-edited.approachSlope)<.025);
  const oldSlant=forkAcrossSpread(1,{seam:.55}).turning;
  for(const path of [oldSlant,base.turning]){
    const port=path.outgoing.at(-1)!,bend:Point=[paper.width-35,port[1]-12];
    const restored=forkAcrossSpread(1,{ribbon:reopen({[base.turnKey]:[path.outgoing[0],bend,port].map(normalized)})});
    assert.ok(Math.abs(restored.turning.outgoing.at(-1)![1]-port[1])<.001);
    assert.ok(Math.abs(restored.turning.incoming[0][1]-port[1])<.001);
    assert.ok(restored.printedDeparture.some(([x,y])=>Math.hypot(x-bend[0],y-bend[1])<.001));
  }
});
