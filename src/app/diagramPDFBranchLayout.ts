import type {Point} from '../core/types';
import type {DiagramPanelRef,DiagramPDFRect} from './diagramPDFLayout';
import {diagramPDFBranchEndpoint,diagramPDFBranchPlacesConflict,diagramPDFBranchRoute} from './diagramPDFBranchCrossings';
import {spreadSnakeSlot} from './diagramPDFSnakeSlots';
import {alignDiagramPDFBranchEntries,diagramPDFCornerShift} from './diagramPDFBranchEntries';
import type {DiagramPDFSeamHeight} from './diagramPDFSeams';

export interface DiagramPDFBranchNode extends DiagramPanelRef {id:string;parentId?:string|null}
export interface DiagramPDFBranchPageSpec {
  bounds:DiagramPDFRect;columns:number;rows:number;gap:number;count?:number;snake?:boolean;vertical?:boolean;
  paper?:DiagramPDFRect;displayRect?:(cell:DiagramPDFBranchCell)=>DiagramPDFRect;fixedGridSlots?:boolean;
  obstacleRects?:(cell:DiagramPDFBranchCell,display:DiagramPDFRect,columns:number,rows:number)=>DiagramPDFRect[];
  seamHeight?:(fromId:string,toId:string)=>DiagramPDFSeamHeight|undefined;ribbonWidth?:number;
  ribbon?:import('./diagramPDFDecoration').DiagramPDFRibbon;kind?:'intro'|'steps';
  savedArrangement?:(candidates:DiagramPDFBranchPage[])=>DiagramPDFBranchPage|undefined;
  hasAuthoredRibbon?:(page:DiagramPDFBranchPage)=>boolean;
  savedEntrySlot?:(node:DiagramPDFBranchNode)=>[number,number]|'original'|undefined;
  savedPageSpan?:(cell:DiagramPDFBranchCell)=>readonly [string,string]|undefined;
}
export interface DiagramPDFBranchCell extends DiagramPDFBranchNode,DiagramPDFRect {row:number;entrySlot?:[number,number]}
export interface DiagramPDFBranchEdge {
  from:string;to:string;kind:'local'|'incoming'|'outgoing';points:Point[];slopes?:number[];otherPage?:number;
}
export interface DiagramPDFBranchPage {columns:number;rows:number;cells:DiagramPDFBranchCell[];edges:DiagramPDFBranchEdge[];farSideStart?:true;spreadRoute?:true;forkLanes?:true;cornerReserved?:true}

function branchForest(nodes:readonly DiagramPDFBranchNode[]){
  const byId=new Map(nodes.map(node=>[node.id,node]));
  if(byId.size!==nodes.length)throw new Error('分支图解含有重复步骤。');
  const children=new Map<string,DiagramPDFBranchNode[]>(),roots:DiagramPDFBranchNode[]=[];
  for(const node of nodes){
    if(!node.parentId||!byId.has(node.parentId)){roots.push(node);continue;}
    const siblings=children.get(node.parentId)??[];
    siblings.push(node);
    children.set(node.parentId,siblings);
  }
  const ordered=[...roots];
  for(let i=0;i<ordered.length;i++)for(const child of children.get(ordered[i].id)??[])ordered.push(child);
  if(ordered.length!==nodes.length)throw new Error('分支步骤引用形成了循环。');
  return {children,ordered,roots};
}

function branchRows(forest:ReturnType<typeof branchForest>,columns:number,rows:number){
  const {children,roots}=forest;
  const lanes:DiagramPDFBranchNode[][]=[];
  let level=roots;
  while(level.length){
    const lane=[...level];
    if(lane.length===1){
      // Use spare columns for a common run before its next fork.
      let chain=children.get(lane[0].id);
      while(lane.length<columns&&chain?.length===1){lane.push(chain[0]);chain=children.get(chain[0].id);}
      level=chain??[];
    }else level=level.flatMap(node=>children.get(node.id)??[]);
    for(let i=0;i<lane.length;i+=columns)lanes.push(lane.slice(i,i+columns));
  }
  if(lanes.length<=rows)return lanes;
  // Some small trees are deeper than the grid. Fill vacant cells before adding a page.
  const compact:DiagramPDFBranchNode[][]=[],ordered=lanes.flat();
  for(let i=0;i<ordered.length;i+=columns)compact.push(ordered.slice(i,i+columns));
  return compact;
}

/** Reserve a column for each terminal panel when the page is wide enough.
 * Even after a short variant ends, its neighbour stays over its own children. */
function branchCenters(forest:ReturnType<typeof branchForest>,columns:number,width:number){
  const {roots,children,ordered}=forest;
  const spans=new Map<string,number>();
  for(let i=ordered.length-1;i>=0;i--){
    const node=ordered[i],arms=children.get(node.id)??[];
    spans.set(node.id,arms.reduce((sum,arm)=>sum+spans.get(arm.id)!,0)||1);
  }
  const leaves=roots.reduce((sum,root)=>sum+spans.get(root.id)!,0),centers=new Map<string,number>();
  if(leaves>columns)return centers;
  function place(siblings:DiagramPDFBranchNode[],start:number){
    for(const node of siblings){
      const span=spans.get(node.id)!;
      centers.set(node.id,(start+span/2)*width/leaves);
      place(children.get(node.id)??[],start);start+=span;
    }
  }
  place(roots,0);
  return centers;
}

function pageCapacity(spec:DiagramPDFBranchPageSpec){
  const count=spec.count??spec.rows*spec.columns;
  if(![spec.columns,spec.rows,count].every(value=>Number.isInteger(value)&&value>0))throw new Error('分支图解的行列和每页步数必须是正整数。');
  return count;
}

type ForkSlot={row:number;column:number};
/** A facing page is entered from its left edge. In horizontal reading order,
 * each sibling owns one entrance row. Longer arms can turn into spare rows,
 * with the inner arm turning first so that their paths never cross. */
function incomingForkSlots(nodes:DiagramPDFBranchNode[],children:ReadonlyMap<string,DiagramPDFBranchNode[]>,spec:DiagramPDFBranchPageSpec,fromBottom:boolean,oldLanes:boolean,fillFinishedRuns:boolean){
  const ids=new Set(nodes.map(node=>node.id)),roots=nodes.filter(node=>!ids.has(node.parentId??''));
  const columns=spec.columns,rows=Math.max(spec.rows,Math.ceil(nodes.length/columns));
  // Older authored ribbons used columns whenever they entered from below.
  const vertical=oldLanes?fromBottom:spec.vertical,laneCount=vertical?columns:rows;
  if(roots.length<2||roots.length>laneCount)return;
  const lanes=new Map(roots.map((node,lane)=>[node.id,lane]));
  const lengths=roots.map(()=>0),runs:{lane:number;depth:number}[]=[];
  for(const node of nodes){
    let lane=lanes.get(node.id);
    if(lane===undefined){
      const parent=node.parentId!;
      if(children.get(parent)?.length!==1)break;
      lane=lanes.get(parent)!;lanes.set(node.id,lane);
    }
    runs.push({lane,depth:lengths[lane]++});
  }
  const spareRows=rows-roots.length;
  const rise=Math.min(spareRows,Math.max(0,...lengths.map(length=>length-columns)));
  const slots:ForkSlot[]=[];
  for(const {lane,depth} of runs){
    if(vertical){
      if(depth>=rows)break;
      slots.push({row:fromBottom?rows-1-depth:depth,column:(fromBottom?columns-roots.length:0)+lane});
      continue;
    }
    if(oldLanes){
      if(depth>=columns)break;
      slots.push({row:lane,column:depth});continue;
    }
    const start=(fromBottom?spareRows:0)+lane;
    const turn=Math.max(1,columns-roots.length)+(fromBottom?lane:roots.length-1-lane);
    const shift=turn<columns?Math.min(rise,Math.max(0,depth-turn)):0;
    const column=depth-shift;
    if(column>=columns)break;
    slots.push({row:start+(fromBottom?-shift:shift),column});
  }
  if(slots.length<roots.length)return;
  const armFinished=runs.length<nodes.length||nodes.slice(0,slots.length).some(n=>!children.has(n.id));
  if((spec.count!==undefined||fillFinishedRuns&&armFinished&&nodes.length-slots.length>1)&&slots.length<nodes.length){
    if(oldLanes)return;
    // The author's explicit count may need the inside of a turn as well.
    // Reserve the lanes above first, then fill spare slots near each parent.
    const occupied=new Map(nodes.slice(0,slots.length).map((n,i)=>[n.id,slots[i]]));
    const used=new Set(slots.map(s=>s.row*columns+s.column));
    const free=Array.from({length:rows*columns},(_,i)=>i).filter(i=>!used.has(i));
    for(const node of nodes.slice(slots.length)){
      const parent=occupied.get(node.parentId??'');
      if(!parent)return;
      const score=(i:number)=>Math.abs(Math.floor(i/columns)-parent.row)*(spec.vertical?3:4)+Math.abs(i%columns-parent.column)*(spec.vertical?4:3);
      const index=free.reduce((best,slot,i)=>score(slot)<score(free[best])?i:best,0);
      const [slot]=free.splice(index,1),position={row:Math.floor(slot/columns),column:slot%columns};
      slots.push(position);occupied.set(node.id,position);
    }
  }
  return slots;
}

function placePage(nodes:DiagramPDFBranchNode[],spec:DiagramPDFBranchPageSpec,farSideStart:boolean,hasNext:boolean,lanes?:ForkSlot[],oldLanes=false):DiagramPDFBranchPage {
  const {bounds,columns}=spec,rows=Math.max(spec.rows,Math.ceil(nodes.length/columns));
  if(!(bounds.width>0&&bounds.height>0&&spec.gap>=0))throw new Error('分支图解的页面空间不足。');
  const gapX=Math.min(spec.gap,bounds.width/(2*columns)),gapY=Math.min(spec.gap,bounds.height/(2*rows));
  // Leave half a gutter on the perimeter for page continuations and long connectors.
  const pitchX=bounds.width/columns,pitchY=bounds.height/rows;
  const width=pitchX-gapX,height=pitchY-gapY;
  const cell=(node:DiagramPDFBranchNode,row:number,centerX:number):DiagramPDFBranchCell=>({
    ...node,row,x:bounds.x+centerX-width/2,y:bounds.y+pitchY*row+gapY/2,width,height,
  });
  if(lanes)return {columns,rows,edges:[],forkLanes:true,cells:nodes.map((node,i)=>{
    const {row,column}=lanes[i];
    const placed=cell(node,row,(column+.5)*pitchX);
    return oldLanes?placed:{...placed,entrySlot:[row,column]};
  })};
  const chain=nodes.every((node,i)=>i===0||node.parentId===nodes[i-1].id);
  const cells:DiagramPDFBranchCell[]=[];
  if(chain){
    const stride=spec.vertical?rows:columns;
    nodes.forEach((node,i)=>{
      const lane=Math.floor(i/stride),offset=i%stride;
      const slot=spec.snake&&lane%2===1?stride-1-offset:offset;
      const row=spec.vertical?slot:lane,col=spec.vertical?lane:slot;
      cells.push(cell(node,row,(col+.5)*pitchX));
    });
    if(spec.snake){
      const flipRows=(items:DiagramPDFBranchCell[])=>items.map(c=>{
        const row=rows-1-c.row;
        return {...c,row,y:bounds.y+row*pitchY+gapY/2};
      });
      const lastRow=Math.floor((nodes.length-1)/columns);
      const closeOnRight=hasNext&&!spec.vertical&&lastRow%2===1&&nodes.length-lastRow*columns>1;
      const near:DiagramPDFBranchPage={columns,rows,cells,edges:[]};
      const spreadNear:DiagramPDFBranchPage=closeOnRight?{...near,spreadRoute:true,cells:nodes.map((node,i)=>{
        const slot=spreadSnakeSlot(i,nodes.length,columns,rows,false);
        return cell(node,slot.row,(slot.column+.5)*pitchX);
      })}:near;
      if(!spec.savedArrangement&&!farSideStart)return spreadNear;
      const spreadFar:DiagramPDFBranchPage={...spreadNear,cells:flipRows(spreadNear.cells),farSideStart:true,
        ...(spec.vertical?{spreadRoute:true}:{})};
      const automatic=farSideStart?spreadFar:spreadNear;
      if(!spec.savedArrangement)return automatic;
      // Older vertical pages could start on the right. Preserve their exact
      // rectangles when they carry hand-positioned drawings or ribbon nodes.
      const oldFar:DiagramPDFBranchPage={...near,farSideStart:true,cells:spec.vertical?
        cells.map(c=>({...c,x:2*bounds.x+bounds.width-c.x-c.width})):flipRows(cells)};
      return spec.savedArrangement([near,oldFar,spreadNear,spreadFar])??automatic;
    }
  }else{
    const forest=branchForest(nodes),centers=branchCenters(forest,columns,bounds.width);
    for(const [row,lane] of branchRows(forest,columns,rows).entries()){
      const aligned=centers.size>0&&lane.every((node,i)=>i===0||centers.get(node.id)!-centers.get(lane[i-1].id)!>=pitchX-1e-6);
      lane.forEach((node,i)=>cells.push(cell(node,row,aligned?centers.get(node.id)!:bounds.width*(i+.5)/lane.length)));
    }
  }
  return {columns,rows,cells,edges:[]};
}

const midX=(cell:DiagramPDFRect)=>cell.x+cell.width/2;
const midY=(cell:DiagramPDFRect)=>cell.y+cell.height/2;
const slotSignature=(cells:DiagramPDFBranchCell[])=>JSON.stringify(cells.map(c=>[c.id,c.x,c.y]));

export function diagramPDFBranchLocalPath(a:DiagramPDFBranchCell,b:DiagramPDFBranchCell,page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec):Point[] {
  const ax=midX(a),bx=midX(b),ay=midY(a),by=midY(b);
  const gap=(spec.bounds.height/page.rows-a.height)/2;
  if(a.row===b.row){
    const blocked=page.cells.some(cell=>cell.row===a.row&&midX(cell)>Math.min(ax,bx)&&midX(cell)<Math.max(ax,bx));
    if(!blocked)return [[ax+(bx>ax?1:-1)*a.width/2,ay],[bx+(ax>bx?1:-1)*b.width/2,by]];
    return [[ax,a.y],[ax,a.y-gap/2],[bx,b.y-gap/2],[bx,b.y]];
  }
  const down=b.row>a.row,startY=down?a.y+a.height:a.y,endY=down?b.y:b.y+b.height;
  if(Math.abs(a.row-b.row)===1){
    const between=(startY+endY)/2;
    return [[ax,startY],[ax,between],[bx,between],[bx,endY]];
  }
  const left=spec.bounds.x,right=left+spec.bounds.width;
  const outerX=Math.abs(ax-left)+Math.abs(bx-left)<Math.abs(ax-right)+Math.abs(bx-right)?left:right;
  const exit=startY+(down?gap:-gap),entry=endY-(down?gap:-gap);
  return [[ax,startY],[ax,exit],[outerX,exit],[outerX,entry],[bx,entry],[bx,endY]];
}

/** Add one ready step at a time. A failed trial never changes the accepted
 * drawings. Try a different grid arrangement, then the next branch; end the
 * page only after all available branches have been tried. */
function fitBranchPage(template:DiagramPDFBranchPage,remaining:DiagramPDFBranchNode[],previous:DiagramPDFBranchPage|undefined,
  spec:DiagramPDFBranchPageSpec,prior:DiagramPDFBranchPageSpec|undefined,placed:ReadonlyMap<string,{index:number;cell:DiagramPDFBranchCell}>,
  children:ReadonlyMap<string,DiagramPDFBranchNode[]>,earlier:ReadonlyMap<string,{page:DiagramPDFBranchPage;spec:DiagramPDFBranchPageSpec}>,
  nextSpec:DiagramPDFBranchPageSpec,rejected?:Set<string>,gridSearch=false):DiagramPDFBranchPage {
  const count=template.cells.length,preferred=new Map(template.cells.map(c=>[c.id,c]));
  const {columns,rows}=template,pitchX=spec.bounds.width/columns,pitchY=spec.bounds.height/rows;
  const model=template.cells[0],allSlots:ForkSlot[]=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)allSlots.push({row,column});
  const anchor=(node:DiagramPDFBranchNode,{row,column}:ForkSlot):DiagramPDFBranchCell=>({...node,row,
    x:spec.bounds.x+(column+.5)*pitchX-model.width/2,y:spec.bounds.y+(row+.5)*pitchY-model.height/2,
    width:model.width,height:model.height,entrySlot:[row,column]});
  const rectSlot=(r:DiagramPDFBranchCell)=>({row:r.row,column:Math.floor((midX(r)-spec.bounds.x)/pitchX)});
  const conflicts=(cells:DiagramPDFBranchCell[])=>diagramPDFBranchPlacesConflict({...template,cells},previous,spec,prior,children,earlier);
  const stepsApart=(a:ForkSlot,b:ForkSlot)=>Math.abs(a.row-b.row)+Math.abs(a.column-b.column);
  // Every open arm must land on this sheet; reserve space before extending it.
  // Maximising occupancy alone can otherwise starve a short branch for a page.
  const incoming=remaining.filter(n=>n.parentId&&placed.has(n.parentId));
  function validEnd(cells:DiagramPDFBranchCell[]){
    if(rejected?.has(slotSignature(cells)))return false;
    const present=new Set(cells.map(c=>c.id));
    if(gridSearch&&incoming.some(n=>!present.has(n.id)))return false;
    const exits=cells.flatMap(c=>(children.get(c.id)??[]).filter(n=>!present.has(n.id)));
    if(gridSearch&&cells.some(c=>{
      const p=cells.find(p=>p.id===c.parentId),s=rectSlot(c);
      if(p&&stepsApart(rectSlot(p),s)!==1)return true;
      // Keep an unoccupied corridor between each open branch and the edge.
      // An exit must never tunnel around an unrelated occupied grid node.
      if(exits.some(n=>n.parentId===c.id)&&cells.some(n=>n.row===c.row&&rectSlot(n).column>s.column))return true;
      return !p&&!!c.parentId&&placed.has(c.parentId)&&cells.some(n=>n.row===c.row&&rectSlot(n).column<s.column);
    }))return false;
    if(exits.length<2||new Set(exits.map(n=>n.parentId)).size===exits.length||!nextSpec.snake)return !conflicts(cells);
    const completed={...template,cells,edges:[] as DiagramPDFBranchEdge[]};
    if(diagramPDFBranchPlacesConflict(completed,previous,spec,prior,children,earlier,false))return false;
    for(const c of cells){
      const source=c.parentId&&earlier.get(c.parentId);
      if(!source)continue;
      const p=source.page.cells.find(p=>p.id===c.parentId)!;
      const route=diagramPDFBranchRoute(diagramPDFBranchEndpoint(p,source.page,source.spec),
        diagramPDFBranchEndpoint(c,completed,spec),p.id,c.id,source.spec,children);
      completed.edges.push({from:p.id,to:c.id,kind:'incoming',points:route.incoming,slopes:route.slopes?.incoming});
    }
    const next=exits.slice(0,pageCapacity(nextSpec)),parent=cells.find(c=>c.id===next[0].parentId)!;
    const fromBottom=midY(spec.displayRect?.(parent)??parent)>=spec.bounds.y+spec.bounds.height/2-1e-7;
    const slots=incomingForkSlots(next,children,nextSpec,fromBottom,false,false);
    const facing=placePage(next,nextSpec,fromBottom,false,slots);
    alignDiagramPDFBranchEntries(facing,completed,nextSpec,spec,true);
    return !diagramPDFBranchPlacesConflict(facing,completed,nextSpec,spec,children,earlier,false);
  }
  // Preserve authored geometry. Page-span or ribbon keys match exactly here;
  // old edited pages are also tried by the outer compatibility planner.
  if(spec.count===count&&template.cells.every(c=>spec.savedEntrySlot?.(c))){
    // Offsets in early files were relative to the automatic grid, recorded
    // without any slot markers. Reproduce that grid before those offsets are
    // applied; otherwise a hand-drawn corner gets a second automatic move.
    if(template.cells.every(c=>spec.savedEntrySlot?.(c)==='original'&&!spec.savedPageSpan?.(c))){
      const unedited={...spec,displayRect:undefined,savedEntrySlot:undefined,savedPageSpan:undefined,hasAuthoredRibbon:undefined};
      const base=fitBranchPage(template,remaining,previous,unedited,prior,placed,children,earlier,nextSpec);
      if(base.cells.length===count)return base;
    }
    return template;
  }
  if(!rejected?.size&&spec.hasAuthoredRibbon?.(template))return template;
  // Check the complete proposed page first. Its known destinations replace
  // temporary right-edge exits that only exist on a partially filled page.
  const pinMatches=(c:DiagramPDFBranchCell)=>{
    const saved=spec.savedEntrySlot?.(c),slot=rectSlot(c);
    return !Array.isArray(saved)||saved[0]===slot.row&&saved[1]===slot.column;
  };
  const templateOK=template.cells.every(pinMatches)&&validEnd(template.cells);
  if(gridSearch){
    if(templateOK)return template;
    // Embed the step tree in the fixed grid. Each child consumes one free
    // cardinal neighbour of its parent; independent incoming arms start on
    // the left edge. Backtracking changes nodes, never invents a long ribbon.
    const slots=new Map<string,ForkSlot>(),used=new Set<number>(),pendingIds=new Set(remaining.map(n=>n.id));
    const available:DiagramPDFBranchNode[]=[];
    const pending=new Map(remaining.filter(n=>!placed.has(n.id)).map(n=>[n.id,n]));
    // Finish exploring B's own decisions before unwinding A. A breadth-first
    // ready queue interleaves A/B decisions and can rewind A prematurely.
    const stack=[...pending.values()].filter(n=>!pending.has(n.parentId??'')).reverse();
    while(stack.length){
      const node=stack.pop()!;available.push(node);
      stack.push(...(children.get(node.id)??[]).filter(n=>pending.has(n.id)).reverse());
    }
    const seen=new Set<string>();
    // This is automatic preview layout, not manual geometry calculation.
    // Keep backtracking bounded; retain the largest valid partial page found.
    let best:DiagramPDFBranchCell[]=[],visits=0;
    function search(cells:DiagramPDFBranchCell[]):boolean{
      if(++visits>24000)return false;
      const waiting=incoming.filter(n=>!slots.has(n.id));
      // Reserve entrances without deciding another branch's path too early.
      // B's root and all of B's later turns then remain on the same DFS stack.
      const freeEntrances=allSlots.filter(s=>s.column===0&&!used.has(s.row*columns)).length;
      if(waiting.length>count-cells.length||waiting.length>freeEntrances)return false;
      const signature=cells.map(c=>[c.id,c.row,rectSlot(c).column].join('/')).sort().join('|');
      if(seen.has(signature))return false;
      seen.add(signature);
      if(cells.length<count){
        const ready=available.filter(n=>!slots.has(n.id)&&(!n.parentId||!pendingIds.has(n.parentId)||slots.has(n.parentId)));
        for(const node of ready){
          const parent=slots.get(node.parentId??''),intended=preferred.get(node.id);
          const choices=allSlots.filter(s=>!used.has(s.row*columns+s.column)&&(parent?stepsApart(s,parent)===1:s.column===0));
          const rank=(s:ForkSlot)=>(intended?stepsApart(s,rectSlot(intended)):0);
          choices.sort((a,b)=>rank(a)-rank(b));
          for(const s of choices){
            const key=s.row*columns+s.column;
            used.add(key);slots.set(node.id,s);
            if(search([...cells,anchor(node,s)]))return true;
            slots.delete(node.id);used.delete(key);
            if(visits>24000)break;
          }
          if(visits>24000)break;
        }
      }
      if(cells.length>best.length&&validEnd(cells))best=cells;
      return best.length===count;
    }
    search([]);
    return {...template,cells:best};
  }
  function adjacentRuns(input:DiagramPDFBranchCell[]){
    if(spec.hasAuthoredRibbon?.({...template,cells:input}))return input;
    const cost=(cells:DiagramPDFBranchCell[])=>{
      const slots=new Map(cells.map(c=>[c.id,rectSlot(c)]));
      return cells.reduce((sum,c)=>sum+(slots.has(c.parentId??'')?stepsApart(rectSlot(c),slots.get(c.parentId!)!):0),0);
    };
    let cells=input,score=cost(cells),changed=true;
    while(changed){
      changed=false;
      for(let a=0;a<cells.length&&!changed;a++)for(let b=a+1;b<cells.length;b++){
        if(spec.savedEntrySlot?.(cells[a])||spec.savedEntrySlot?.(cells[b]))continue;
        const trial=[...cells];
        trial[a]=anchor(cells[a],rectSlot(cells[b]));trial[b]=anchor(cells[b],rectSlot(cells[a]));
        const next=cost(trial);
        if(next>=score||!validEnd(trial))continue;
        cells=trial;score=next;changed=true;break;
      }
    }
    return cells;
  }
  const longEdge=template.cells.some(c=>{
    const parent=preferred.get(c.parentId??'');return parent&&stepsApart(rectSlot(c),rectSlot(parent))>1;
  });
  if(templateOK&&!longEdge)return template;

  // First try to keep the same complete set on this page, with every child
  // next to its parent. Adjacent grid edges do not cut diagonally across other
  // steps; the real curves still need checking at bends and at the gutter.
  const trialSlots=new Map<string,ForkSlot>(),used=new Set<number>();
  let visits=0;
  function reroute(index:number):DiagramPDFBranchCell[]|undefined{
    if(++visits>2400)return;
    if(index===count){
      const result=template.cells.map(c=>{
        const slot=trialSlots.get(c.id)!;
        return stepsApart(slot,rectSlot(c))===0?c:anchor(c,slot);
      });
      return validEnd(result)?result:undefined;
    }
    const cell=template.cells[index],parent=trialSlots.get(cell.parentId??''),intended=rectSlot(cell),pin=spec.savedEntrySlot?.(cell);
    const fixed=Array.isArray(pin)?{row:pin[0],column:pin[1]}:pin||!parent?intended:undefined;
    const choices=fixed?[fixed]:allSlots.filter(s=>stepsApart(s,parent!)===1);
    const outgoing=children.get(cell.id)?.some(c=>!preferred.has(c.id));
    const rank=(s:ForkSlot)=>stepsApart(s,intended)-(outgoing?s.column*2:0);
    choices.sort((a,b)=>rank(a)-rank(b));
    for(const s of choices){
      if(s.row<0||s.row>=rows||s.column<0||s.column>=columns)continue;
      const key=s.row*columns+s.column;
      if(used.has(key))continue;
      used.add(key);trialSlots.set(cell.id,s);
      const result=reroute(index+1);
      if(result)return result;
      used.delete(key);trialSlots.delete(cell.id);
    }
  }
  const rerouted=reroute(0);
  if(rerouted)return {...template,cells:rerouted};
  if(templateOK)return {...template,cells:adjacentRuns(template.cells)};

  let cells:DiagramPDFBranchCell[]=[];
  const accepted=new Map<string,{arm:string;depth:number}>(),candidates=new Set(remaining);
  const pendingIds=new Set(remaining.map(n=>n.id));
  const rootIds=new Set(remaining.filter(n=>!n.parentId||!pendingIds.has(n.parentId)).map(n=>n.id));
  let lastArm='';
  while(cells.length<count){
    const ready=[...candidates].filter(n=>rootIds.has(n.id)||accepted.has(n.parentId??''));
    const lineage=(n:DiagramPDFBranchNode)=>accepted.get(n.parentId??'');
    const arm=(n:DiagramPDFBranchNode)=>lineage(n)?.arm??n.id;
    ready.sort((a,b)=>(lineage(a)?.depth??-1)-(lineage(b)?.depth??-1)||Number(arm(a)===lastArm)-Number(arm(b)===lastArm));
    let added=false;
    for(const node of ready){
      const target=preferred.get(node.id),pin=spec.savedEntrySlot?.(node);
      const occupied=new Map(cells.map((cell,i)=>{const s=rectSlot(cell);return [s.row*columns+s.column,i];}));
      const localParent=cells.find(c=>c.id===node.parentId);
      const parent=localParent??placed.get(node.parentId??'')?.cell;
      const origin=parent?rectSlot(parent):{row:0,column:0};
      if(!localParent)origin.column=0;
      const rank=(s:ForkSlot)=>{
        const dr=s.row-origin.row,dc=s.column-origin.column;
        return 4*(Math.abs(dr)+Math.abs(dc))+(spec.vertical?Math.abs(dc):Math.abs(dr))+(dc<0?.25:0);
      };
      const choices=[...allSlots].sort((a,b)=>rank(a)-rank(b));
      const intended=target?rectSlot(target):undefined;
      if(intended)choices.unshift(intended);
      const seen=new Set<number>();
      let trial:DiagramPDFBranchCell[]|undefined;
      for(const slot of choices){
        const key=slot.row*columns+slot.column;
        if(seen.has(key))continue;
        seen.add(key);
        if(Array.isArray(pin)&&(pin[0]!==slot.row||pin[1]!==slot.column))continue;
        if(pin==='original'&&intended&&(slot.row!==intended.row||slot.column!==intended.column))continue;
        const cell=target&&intended?.row===slot.row&&intended.column===slot.column?target:anchor(node,slot);
        const displaced=occupied.get(key);
        if(displaced===undefined){
          const next=[...cells,cell];
          if(!conflicts(next)){trial=next;break;}
        }else if(!spec.savedEntrySlot?.(cells[displaced])){
          for(const spare of choices){
            if(occupied.has(spare.row*columns+spare.column))continue;
            const next=[...cells,cell];
            next[displaced]=anchor(cells[displaced],spare);
            if(!conflicts(next)){trial=next;break;}
          }
          if(trial)break;
        }
      }
      if(!trial)continue;
      cells=trial;lastArm=arm(node);
      accepted.set(node.id,{arm:lastArm,depth:(lineage(node)?.depth??-1)+1});
      candidates.delete(node);added=true;break;
    }
    if(!added)break;
  }
  while(cells.length&&!validEnd(cells))cells.pop();
  return {...template,cells:cells.length?adjacentRuns(cells):cells};
}

/** Page numbers in continuation edges are zero based and exclude any standalone cover. */
export type DiagramPDFBranchLaneMode=true|'staggeredLanes'|'authoredLanes';
export function layoutDiagramPDFBranchTree(nodes:readonly DiagramPDFBranchNode[],pageSpec:(index:number)=>DiagramPDFBranchPageSpec,
  pageLanes:false|DiagramPDFBranchLaneMode|((pageIndex:number)=>DiagramPDFBranchLaneMode)=true):DiagramPDFBranchPage[] {
  const {ordered,children}=branchForest(nodes);
  const subtree=new Map<string,{size:number;last:number}>();
  for(let i=ordered.length-1;i>=0;i--){
    let size=1,last=i;
    for(const child of children.get(ordered[i].id)??[]){
      const below=subtree.get(child.id)!;
      size+=below.size;last=Math.max(last,below.last);
    }
    subtree.set(ordered[i].id,{size,last});
  }
  const pages:DiagramPDFBranchPage[]=[],specs:DiagramPDFBranchPageSpec[]=[];
  const getSpec=(i:number)=>specs[i]??(specs[i]=pageSpec(i));
  const placed=new Map<string,{index:number;cell:DiagramPDFBranchCell}>();
  const sources=new Map<string,{page:DiagramPDFBranchPage;spec:DiagramPDFBranchPageSpec}>();
  const rejectedPages=new Map<number,Set<string>>(),capacityLimits=new Map<number,number>();
  const inputOrder=[...ordered],byId=new Map(nodes.map(n=>[n.id,n]));
  let safePrefix:DiagramPDFBranchPage[]|undefined,authoredPrefix=0,singleUntil=0,failedAttempts=0,furthestFailure=0;
  let start=0;
  while(start<ordered.length){
    const index=pages.length,spec=getSpec(index),capacity=pageCapacity(spec);
    const separatePageForks=typeof pageLanes==='function'?pageLanes(index):pageLanes;
    const first=ordered[start],parent=placed.get(first.parentId??'');
    const fromFacingPage=parent?.index===index-1&&spec.snake&&index>0&&getSpec(index-1).snake;
    const continuing=separatePageForks===true&&fromFacingPage&&pages[index-1].forkLanes;
    if(singleUntil&&start>=singleUntil&&ordered.slice(start).filter(n=>placed.has(n.parentId??'')).length<=1){
      singleUntil=0;safePrefix=undefined;authoredPrefix=0;furthestFailure=0;
    }
    const single=singleUntil>0;
    let end=Math.min(start+(single?1:capacityLimits.get(index)??capacity),ordered.length);
    const fixedCount=separatePageForks&&spec.snake&&spec.count!==undefined;
    for(let i=start;!fixedCount&&i<end;i++){
      const node=ordered[i],family=subtree.get(node.id)!;
      const arms=children.get(node.id)??[];
      const nextSpec=getSpec(index+1);
      if(separatePageForks&&spec.snake&&arms.length>1&&
        ordered[i+1]===arms[0]&&i+arms.length>=end&&nextSpec.snake&&
        (separatePageForks!==true||arms.length<=Math.min(pageCapacity(nextSpec),nextSpec.vertical?nextSpec.columns:nextSpec.rows))){
        // Keep the shared parent here. All sibling alternatives begin after the turn.
        end=i+1;break;
      }
      if(!continuing&&i>start&&arms.length>1&&family.last===i+family.size-1&&
        family.last>=end&&family.size<=pageCapacity(getSpec(index+1))){end=i;break;}
    }
    // Carry both alternatives together if a full continuation page would cut
    // between siblings. An explicitly set page count always wins.
    if(continuing&&!fixedCount&&end<ordered.length){
      const nextParent=ordered[end].parentId;
      let split=end;
      while(split>start&&ordered[split-1].parentId===nextParent)split--;
      if(split>start)end=split;
    }
    let farSideStart=false;
    if(parent){
      const prior=getSpec(parent.index),exit=prior.fixedGridSlots?parent.cell:prior.displayRect?.(parent.cell)??parent.cell;
      farSideStart=midY(exit)>spec.bounds.y+spec.bounds.height/2;
    }
    let lanes:ForkSlot[]|undefined,packContinuations=false;
    if(separatePageForks&&parent&&fromFacingPage){
      const siblings=children.get(first.parentId!)!;
      if((siblings.length>1&&siblings[0]===first)||pages[parent.index].forkLanes){
        const prior=getSpec(parent.index),oldLanes=separatePageForks==='authoredLanes';
        const exit=oldLanes&&prior.fixedGridSlots?parent.cell:prior.displayRect?.(parent.cell)??parent.cell;
        // A central row uses the lower entry, independent of sub-point rounding.
        const fromBottom=midY(exit)>=prior.bounds.y+prior.bounds.height/2-1e-7;
        const candidates=ordered.slice(start,end);
        const sameFork=first.parentId&&siblings.length>1&&siblings[0]===first&&
          candidates.every(node=>!placed.has(node.parentId??'')||node.parentId===first.parentId);
        packContinuations=!!continuing&&!sameFork;
        // The staggered entrance is specific to a fresh, shared fork. Once the
        // arms have their own parents they may fork or finish independently.
        // Assign the entire page from those parents rather than cutting it at
        // the first nested fork or restricting each arm to its entrance row.
        if(!packContinuations)lanes=incomingForkSlots(candidates,children,spec,fromBottom,oldLanes,separatePageForks===true);
        // Moving the parent can change an automatic entrance. Keep the facing
        // page's original bases if the author has already moved its drawings
        // or reshaped a ribbon on that page.
        if(lanes&&!oldLanes&&siblings.length>1&&(spec.hasAuthoredRibbon||spec.savedEntrySlot)){
          const pins=candidates.map(node=>spec.savedEntrySlot?.(node));
          if(spec.hasAuthoredRibbon||pins.some(Array.isArray)){
            const score=(slots:ForkSlot[])=>{
              const page=placePage(candidates.slice(0,slots.length),spec,farSideStart,false,slots);
              if(spec.hasAuthoredRibbon?.(page))return candidates.length+1;
              return slots.filter(({row,column},i)=>{const pin=pins[i];return Array.isArray(pin)&&pin[0]===row&&pin[1]===column;}).length;
            };
            const opposite=incomingForkSlots(candidates,children,spec,!fromBottom,false,separatePageForks===true);
            if(opposite&&score(opposite)>score(lanes))lanes=opposite;
          }
        }
        if(lanes)end=start+lanes.length;
      }
    }
    let page=placePage(ordered.slice(start,end),spec,farSideStart,end<ordered.length,lanes,separatePageForks==='authoredLanes');
    if(packContinuations)page.forkLanes=true;
    if(!packContinuations&&separatePageForks&&spec.snake&&spec.count===undefined&&end<ordered.length&&page.cells.length===page.rows*page.columns&&
      page.cells.at(-1)?.id===ordered[end-1].id&&!spec.hasAuthoredRibbon?.(page)){
      const shift=diagramPDFCornerShift(page.cells.map(cell=>({id:cell.id,parentId:cell.parentId,rect:cell})));
      const displaced=page.cells.at(-1)!.id;
      // A saved placement belongs either to the shortened page or to the
      // facing page beginning with the displaced step. Preserve both bases.
      const blocksShift=shift&&page.cells.some(cell=>{
        if(!spec.savedEntrySlot?.(cell))return false;
        const span=spec.savedPageSpan?.(cell);
        if(cell.id===displaced)return span?.[0]!==displaced;
        return span?.[0]!==page.cells[0].id||span?.[1]!==page.cells.at(-2)!.id;
      });
      if(shift&&!blocksShift){
        const slots=new Map(page.cells.map(cell=>[cell.id,cell]));
        const following=new Map(shift.slice(0,-1).map((id,i)=>[id,slots.get(shift[i+1])!]));
        page.cells=page.cells.slice(0,-1).map(cell=>{
          const slot=following.get(cell.id);
          return slot?{...cell,row:slot.row,x:slot.x,y:slot.y}:cell;
        });
        page.cornerReserved=true;
        end--;
      }
    }
    if(index)alignDiagramPDFBranchEntries(page,pages[index-1],spec,getSpec(index-1),packContinuations);
    const localFork=page.cells.some(c=>(children.get(c.parentId??'')?.length??0)>1);
    if(single){
      const slot=spec.savedEntrySlot?.(first);
      const row=Array.isArray(slot)?slot[0]:Math.floor((spec.rows-1)/2),column=Array.isArray(slot)?slot[1]:Math.floor((spec.columns-1)/2);
      page=placePage([first],spec,false,true,[{row,column}]);
      if(diagramPDFBranchPlacesConflict(page,pages[index-1],spec,index?getSpec(index-1):undefined,children,sources,false))page.cells=[];
    }
    if(single||separatePageForks===true&&spec.snake&&(lanes||packContinuations||localFork||rejectedPages.has(index))){
      const remaining=ordered.slice(start);
      if(!single){
        const gridSearch=!spec.vertical&&spec.count===undefined&&!spec.hasAuthoredRibbon?.(page)&&!page.cells.some(c=>spec.savedEntrySlot?.(c));
        page=fitBranchPage(page,remaining,pages[index-1],spec,index?getSpec(index-1):undefined,placed,children,sources,getSpec(index+1),rejectedPages.get(index),gridSearch);
      }
      if(!page.cells.length){
        // No possible entrance fits this published exit. Retract the source
        // page, try different slots there, then shorten it if needed. All
        // geometry and continuations are rebuilt from the last accepted page.
        failedAttempts++;furthestFailure=Math.max(furthestFailure,end);
        if(!safePrefix){
          // Freeze the settled prefix before the difficult fork. At a cut
          // with only one open arm no unrelated outgoing paths need rerouting.
          let cut=0;
          const open=new Set<string>();
          for(const [i,p] of pages.entries()){
            for(const c of p.cells){open.delete(c.id);for(const n of children.get(c.id)??[])open.add(n.id);}
            if(open.size<=1&&i<index-1)cut=i+1;
            const settings=getSpec(i);
            if(settings.hasAuthoredRibbon?.(p)||p.cells.some(c=>settings.savedEntrySlot?.(c)))authoredPrefix=i+1;
          }
          cut=Math.max(cut,authoredPrefix);
          safePrefix=pages.slice(0,cut).map(p=>({...p,edges:p.edges.filter(e=>e.otherPage===undefined||e.otherPage<cut)}));
        }
        let rewind=index-1;
        for(;rewind>=0;rewind--){
          const source=pages[rewind];
          if(rewind<authoredPrefix)break;
          const tried=rejectedPages.get(rewind)??new Set<string>();
          rejectedPages.set(rewind,tried);
          const signature=slotSignature(source.cells);
          if(tried.size<3&&!tried.has(signature)){tried.add(signature);break;}
          if(source.cells.length>1){capacityLimits.set(rewind,source.cells.length-1);tried.clear();break;}
        }
        if(single||rewind<authoredPrefix||failedAttempts>=8){
          // A densely nested tree can have more live arms than the current
          // grid has entry rows. Isolate that portion: each diagram has a
          // clear left entrance and separate right exits. Once the remaining
          // arms rejoin a single run, return to normal packing.
          if(single){
            if(safePrefix.length<=authoredPrefix)throw Error('固定的步骤或跨页节点位置使两条彩带重叠，请调整该页的位置。');
            safePrefix.pop();
          }
          pages.splice(0,pages.length,...safePrefix.map(p=>({...p,edges:p.edges.filter(e=>e.otherPage===undefined||e.otherPage<safePrefix!.length)})));
          placed.clear();sources.clear();
          for(const [i,p] of pages.entries())for(const c of p.cells){placed.set(c.id,{index:i,cell:c});sources.set(c.id,{page:p,spec:getSpec(i)});}
          const kept=pages.flatMap(p=>p.cells.map(c=>byId.get(c.id)!));
          ordered.splice(0,ordered.length,...kept,...inputOrder.filter(n=>!placed.has(n.id)));
          start=kept.length;singleUntil=Math.max(furthestFailure,start+1);
          rejectedPages.clear();capacityLimits.clear();failedAttempts=0;continue;
        }
        for(const old of pages.splice(rewind)){
          start-=old.cells.length;
          for(const c of old.cells){placed.delete(c.id);sources.delete(c.id);}
        }
        for(const kept of pages)kept.edges=kept.edges.filter(e=>e.otherPage===undefined||e.otherPage<rewind);
        for(const i of rejectedPages.keys())if(i>rewind){rejectedPages.delete(i);capacityLimits.delete(i);}
        continue;
      }
      const selected=new Set(page.cells.map(c=>c.id));
      // Keep the topological order of the deferred choices. A sibling can
      // take this page's last slot when the originally scheduled arm cannot.
      ordered.splice(start,remaining.length,...page.cells.map(c=>byId.get(c.id)!),...remaining.filter(n=>!selected.has(n.id)));
      end=start+page.cells.length;
    }
    for(const cell of page.cells){placed.set(cell.id,{index,cell});sources.set(cell.id,{page,spec});}
    pages.push(page);
    for(const node of ordered.slice(start,end)){
      const source=node.parentId?placed.get(node.parentId):undefined;
      if(!source)continue;
      const target=placed.get(node.id)!,a=source.cell,b=target.cell,from=a.id,to=b.id;
      if(source.index===index){
        page.edges.push({from,to,kind:'local',points:diagramPDFBranchLocalPath(a,b,page,spec)});
      }else if(getSpec(source.index).snake&&spec.snake){
        const sourcePage=pages[source.index],sourceSpec=getSpec(source.index);
        const routes=diagramPDFBranchRoute(diagramPDFBranchEndpoint(a,sourcePage,sourceSpec),diagramPDFBranchEndpoint(b,page,spec),from,to,sourceSpec,children);
        sourcePage.edges.push({from,to,kind:'outgoing',points:routes.outgoing,slopes:routes.slopes?.outgoing,otherPage:index});
        page.edges.push({from,to,kind:'incoming',points:routes.incoming,slopes:routes.slopes?.incoming,otherPage:source.index});
      }else{
        for(const [kind,here,there] of [['outgoing',source,target],['incoming',target,source]] as const){
          const sheet=pages[here.index],settings=getSpec(here.index),{cell}=here;
          const space=(settings.bounds.height/sheet.rows-cell.height)/2;
          const x=midX(cell),y=kind==='incoming'?cell.y:cell.y+cell.height;
          const points:Point[]=kind==='incoming'?[[x,y-space],[x,y]]:[[x,y],[x,y+space]];
          sheet.edges.push({from,to,kind,points,otherPage:there.index});
        }
      }
    }
    start=end;
  }
  return pages;
}
