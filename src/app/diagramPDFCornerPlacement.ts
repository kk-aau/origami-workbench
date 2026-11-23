import {diagramPDFCornerShift} from './diagramPDFBranchEntries';
import {diagramPDFPanelPlacementKey,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFPage,type DiagramPDFPlan} from './diagramPDFLayout';
import type {DiagramProject} from './diagramProject';

export function diagramPDFPageCorner(options:DiagramPDFOptions,page:DiagramPDFPage):string[]|undefined {
  if(options.readingOrder!=='snake'||!page.branchEdges||page.cells.length!==page.rows*page.columns)return;
  const parents=new Map(page.branchEdges.filter(edge=>edge.kind==='local').map(edge=>[edge.to,edge.from]));
  return diagramPDFCornerShift(page.cells.map(cell=>({id:cell.branchNodeId!,parentId:parents.get(cell.branchNodeId!),rect:cell})));
}

/** Keep the drawings in their chosen positions while vacating the first corner in the chain. */
export function diagramPDFLeaveCorner(project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,
  index:number,shift:readonly string[]):Partial<DiagramPDFOptions>|undefined {
  const page=plan.pages[index],last=page?.cells.at(-1);
  if(!last||shift.length<2||shift.at(-1)!==last.branchNodeId)return;
  const movedTo=new Map(shift.slice(0,-1).map((id,i)=>[id,shift[i+1]]));
  const oldCells=new Map(page.cells.map(cell=>[cell.branchNodeId,cell]));
  const placements={...options.panelPlacements},key=(cell:typeof last)=>diagramPDFPanelPlacementKey(project,cell,options.layoutMode);
  delete placements[key(last)];
  // Record all occupied slots before asking for the new bases. This also tells the
  // planner to preserve the frame of a page with pre-existing manual offsets.
  for(const cell of page.cells.slice(0,-1)){
    placements[key(cell)]??={x:0,y:0,scale:1,farSideStart:page.farSideStart,spreadRoute:page.spreadRoute,entrySlot:cell.entrySlot};
  }
  const layout={...options.pageLayouts,[index]:{...options.pageLayouts?.[index],count:page.cells.length-1}};
  const patch:Partial<DiagramPDFOptions>={pageLayouts:layout,panelPlacements:placements};
  if(plan.branchPagination==='lanes'&&options.branchPagination!=='lanes'){
    patch.branchPagination={...options.branchPagination,[options.layoutMode??'grid']:'lanes'};
  }
  const newPages=planDiagramPDF(project,{...options,...patch}).pages;
  const next=newPages[index];
  if(next?.cells.length!==page.cells.length-1||next.cells.some(cell=>!oldCells.has(cell.branchNodeId)||cell.branchNodeId===last.branchNodeId)||
    !newPages[index+1]?.cells.some(cell=>cell.branchNodeId===last.branchNodeId))return;
  for(const cell of next.cells){
    const id=cell.branchNodeId!,target=oldCells.get(movedTo.get(id)??id)!;
    const base=cell.baseRect??cell,placement=placements[key(cell)];
    placements[key(cell)]={...placement,entrySlot:cell.entrySlot,
      x:(target.x+target.width/2-base.x-base.width/2)/plan.width,
      y:(target.y+target.height/2-base.y-base.height/2)/plan.height};
  }
  return patch;
}
