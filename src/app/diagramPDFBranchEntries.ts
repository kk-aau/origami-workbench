import type {DiagramPDFBranchCell,DiagramPDFBranchPage,DiagramPDFBranchPageSpec} from './diagramPDFBranchLayout';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {diagramPDFRibbonCrossesRect} from './diagramPDFRibbonGeometry';

/** A sharp reversal into a nearly straight terminal run can be relieved by
 * leaving its first slot open and carrying the last panel to the facing page. */
export function diagramPDFCornerShift(nodes:readonly {id:string;parentId?:string|null;rect:DiagramPDFRect}[]):string[]|undefined {
  if(nodes.length<4)return;
  const byId=new Map(nodes.map(n=>[n.id,n])),childCount=new Map<string,number>();
  for(const n of nodes)if(n.parentId)childCount.set(n.parentId,(childCount.get(n.parentId)??0)+1);
  const run=[nodes.at(-1)!];
  let head=run[0];
  while(head.parentId&&childCount.get(head.parentId)===1){
    const parent=byId.get(head.parentId);
    if(!parent)break;
    run.push(parent);head=parent;
  }
  run.reverse();
  const direction=(a:DiagramPDFRect,b:DiagramPDFRect)=>{
    const dx=b.x+b.width/2-a.x-a.width/2,dy=b.y+b.height*.4-a.y-a.height*.4;
    const length=Math.hypot(dx,dy);
    return length>.01?{x:dx/length,y:dy/length}:undefined;
  };
  const dot=(a:{x:number;y:number},b:{x:number;y:number})=>a.x*b.x+a.y*b.y;
  // Walk back only along the final straight stretch; a second bend belongs
  // to another part of the route and cannot use this vacant slot.
  for(let i=run.length-3;i>=1;i--){
    const [before,corner,next,last]=run.slice(i-1,i+3).map(n=>n.rect);
    const into=direction(before,corner),out=direction(corner,next),onward=direction(next,last);
    if(!into||!out||!onward||dot(out,onward)<.88)return;
    if(dot(into,out)>-.4)continue;
    const replacement=direction(before,next);
    if(!replacement||dot(replacement,onward)<0)return;
    if(nodes.some(({rect})=>rect!==before&&rect!==corner&&rect!==next&&diagramPDFRibbonCrossesRect(
      [before.x+before.width/2,before.y+before.height*.4],[next.x+next.width/2,next.y+next.height*.4],rect)))return;
    return run.slice(i).map(n=>n.id);
  }
}

/** Place each continuing branch opposite its parent on the facing sheet. */
export function alignDiagramPDFBranchEntries(page:DiagramPDFBranchPage,previous:DiagramPDFBranchPage,
  spec:DiagramPDFBranchPageSpec,prior:DiagramPDFBranchPageSpec,packContinuations=false){
  const {rows,columns,cells}=page,{bounds}=spec;
  if(!spec.snake||!prior.snake||rows<2||page.cornerReserved)return;
  const current=new Set(cells.map(c=>c.id)),previousById=new Map(previous.cells.map(c=>[c.id,c]));
  const roots=cells.filter(c=>!current.has(c.parentId??''));
  if(roots.some(c=>!previousById.has(c.parentId??'')))return;
  if(!packContinuations&&(roots.length>rows||new Set(roots.map(c=>c.parentId)).size<2))return;
  // A sole straight run already has the ordinary page-wide snake layout.
  if(cells.every((cell,i)=>!i||cell.parentId===cells[i-1].id))return;
  const pitchX=bounds.width/columns,pitchY=bounds.height/rows;
  const arrivals=roots.map(cell=>{
    const parent=previousById.get(cell.parentId!)!,rect=prior.displayRect?.(parent)??parent;
    return {cell,y:rect.y+rect.height*.4,x:rect.x+rect.width/2};
  }).sort((a,b)=>a.y-b.y||a.x-b.x);
  const pins=new Map(cells.map(c=>[c.id,spec.savedEntrySlot?.(c)]));
  const savedEntries=[...pins.values()].some(Array.isArray);
  if((!packContinuations&&!savedEntries&&arrivals.at(-1)!.y-arrivals[0].y<pitchY*.5)||spec.hasAuthoredRibbon?.(page))return;

  const slots=Array.from({length:rows*columns},(_,i)=>({row:Math.floor(i/columns),column:i%columns}));
  const available=new Set(slots),positions=new Map<string,typeof slots[number]>(),fixed=new Set<string>();
  const children=new Map<string,DiagramPDFBranchCell[]>();
  for(const cell of cells){
    if(cell.parentId){
      const siblings=children.get(cell.parentId)??[];
      siblings.push(cell);children.set(cell.parentId,siblings);
    }
    const pin=pins.get(cell.id);
    if(!pin)continue;
    const row=pin==='original'?cell.row:pin[0],column=pin==='original'?
      Math.floor((cell.x+cell.width/2-bounds.x)/pitchX):pin[1];
    if(row>=rows||column>=columns)continue;
    const slot=slots[row*columns+column];
    // Some older tree layouts centred drawings between columns. Preserve that page
    // when two authored drawings would claim the same slot.
    if(!available.delete(slot))return;
    positions.set(cell.id,slot);
    if(pin==='original')fixed.add(cell.id);
  }
  function place(cell:DiagramPDFBranchCell,slot:typeof slots[number]){
    positions.set(cell.id,slot);available.delete(slot);
  }
  const nearest=(score:(slot:typeof slots[number])=>number)=>{
    let best:typeof slots[number]|undefined,minimum=Infinity;
    for(const slot of available){
      const value=score(slot);
      if(value<minimum){minimum=value;best=slot;}
    }
    return best!;
  };
  // Reserve all entry slots first. One long branch cannot occupy another's entrance.
  const freeArrivals=arrivals.filter(({cell})=>!positions.has(cell.id));
  const entranceSlots=slots.filter(s=>s.column===0&&available.has(s));
  for(const [i,{cell,y}] of freeArrivals.entries()){
    const target=(y-bounds.y)/pitchY-.4;
    if(entranceSlots.length>=freeArrivals.length-i){
      const limit=entranceSlots.length-(freeArrivals.length-i);
      let choice=0;
      for(let n=1;n<=limit;n++)if(Math.abs(entranceSlots[n].row-target)<Math.abs(entranceSlots[choice].row-target))choice=n;
      const slot=entranceSlots[choice];entranceSlots.splice(0,choice+1);place(cell,slot);
    }else{
      const slot=nearest(s=>s.column*rows+Math.abs(s.row-target));
      place(cell,slot);
      const index=entranceSlots.indexOf(slot);
      if(index>=0)entranceSlots.splice(index,1);
    }
  }
  // Each main continuation takes the neighbouring slots in reading direction.
  // Side branches and turns use the closest vacant slot to their actual parent.
  for(const {cell} of arrivals){
    let parent=cell;
    while(true){
      const next=children.get(parent.id)?.[0],at=positions.get(parent.id)!;
      if(!next||positions.has(next.id))break;
      const row=at.row+(spec.vertical?1:0),column=at.column+(spec.vertical?0:1);
      if(row>=rows||column>=columns)break;
      const direct=slots[row*columns+column];
      if(!available.has(direct))break;
      place(next,direct);parent=next;
    }
  }
  for(const cell of cells){
    if(positions.has(cell.id))continue;
    const parent=positions.get(cell.parentId!)!;
    place(cell,nearest(s=>{
      const dx=s.column-parent.column,dy=s.row-parent.row;
      return (Math.abs(dx)+Math.abs(dy))*4+(spec.vertical?Math.abs(dx):Math.abs(dy))+(dx<0||dy<0?1:0);
    }));
  }
  page.cells=cells.map(cell=>{
    if(fixed.has(cell.id))return cell;
    const {row,column}=positions.get(cell.id)!;
    return {...cell,row,x:bounds.x+pitchX*(column+.5)-cell.width/2,y:bounds.y+pitchY*(row+.5)-cell.height/2,
      entrySlot:[row,column]};
  });
}
