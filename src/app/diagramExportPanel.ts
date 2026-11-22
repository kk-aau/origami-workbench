import {diagramPDFTransitionDirection,type DiagramPDFDirection} from './diagramPDFDirection';
import type {DiagramProject} from './diagramProject';
import type {DiagramLineDefaults} from './diagramLineStyles';
import {diagramPDFStepArtwork} from './diagramPDF';
import {diagramArtworkScale,diagramScaleChange,type DiagramScaleChange} from './diagramExportScale';
import {DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE,diagramExportScaleLayout,diagramExportScaleMarkerSVG,hasDiagramExportScaleSymbol} from './diagramExportScaleMarker';
import {diagramPDFCellContent,diagramPanelNumber,diagramPDFSnakeDirection,resolveDiagramPanel,type DiagramPanelRef,type DiagramPDFCell,type DiagramPDFOptions,type DiagramPDFPlan,type DiagramPDFRect} from './diagramPDFLayout';
import {diagramProcessFigureZoom,diagramStepZoom,type DiagramStepZoom} from './diagramStepZoom';
import {diagramPanelRoute} from './diagramPDFBranchPanels';
import type {PDFArtworkReader} from './diagramPDFArtworkCache';

interface SizedPanel extends DiagramPanelRef {readingDirection?:DiagramPDFDirection;size:Pick<DiagramPDFRect,'width'|'height'>}
export interface DiagramExportPanel extends SizedPanel {
  scaleIndicators?:true;
  scaleChangePercent?:number;
  next?:SizedPanel;
  markerBox?:DiagramPDFRect;
  markerOverride?:DiagramScaleChange|'none';
  alternatives?:DiagramExportPanel[];
}
const edgeCache=new WeakMap<DiagramPDFPlan,Map<DiagramPDFCell,{cell:DiagramPDFCell;page:number}[]>>();
function branchSuccessors(plan:DiagramPDFPlan){
  let found=edgeCache.get(plan);
  if(found)return found;
  found=new Map();
  const locations=new Map(plan.pages.flatMap((page,i)=>page.cells.map(cell=>[cell.branchNodeId,{cell,page:i}] as const)));
  for(const page of plan.pages)for(const edge of page.branchEdges??[]){
    if(edge.kind==='incoming')continue;
    const from=locations.get(edge.from),to=locations.get(edge.to);
    if(from&&to){const outgoing=found.get(from.cell)??[];outgoing.push(to);found.set(from.cell,outgoing);}
  }
  edgeCache.set(plan,found);return found;
}
export function diagramExportTransitionKey(project:DiagramProject,from:DiagramPanelRef,to:DiagramPanelRef):string {
  const id=(panel:DiagramPanelRef)=>encodeURIComponent(resolveDiagramPanel(project,panel).step.id);
  return id(from)+'>'+id(to);
}
export function diagramExportTransitions(project:DiagramProject,plan:DiagramPDFPlan){
  const panels=plan.pages.flatMap(page=>page.cells);
  return panels.flatMap((from,index)=>{
    const targets=from.branchNodeId?branchSuccessors(plan).get(from)?.map(item=>item.cell)??[]:panels.slice(index+1,index+2);
    return targets.map(to=>({key:diagramExportTransitionKey(project,from,to),from,to,label:diagramPanelNumber(from)+' → '+diagramPanelNumber(to)}));
  });
}
function transitionBox(cell:DiagramPDFCell,next:DiagramPDFCell,image:DiagramPDFRect,samePage:boolean,direction=diagramPDFTransitionDirection(cell,next)):DiagramPDFRect {
  const size=DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE;
  if(samePage&&(direction==='left'||direction==='right')){
    const left=cell.x<next.x?cell.x+cell.width:next.x+next.width,right=Math.max(cell.x,next.x);
    return {x:(left+right-size)/2,y:image.y+(image.height-size)/2,width:size,height:size};
  }
  if(samePage){
    const down=direction==='bottom',top=down?cell.y+cell.height:next.y+next.height,bottom=down?next.y:cell.y;
    return {x:(cell.x+cell.width/2+next.x+next.width/2-size)/2,y:(top+bottom-size)/2,width:size,height:size};
  }
  return {x:cell.x+cell.width+2,y:image.y+(image.height-size)/2,width:size,height:size};
}
export function diagramExportPagePanels(project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number):DiagramExportPanel[]{
  const cells=plan.pages[pageIndex].cells;
  const image=(cell:DiagramPDFCell)=>diagramPDFCellContent(resolveDiagramPanel(project,cell).step,cell,options,plan).imageRect;
  const sized=(cell:DiagramPDFCell):SizedPanel=>{const rect=image(cell);return {stepIndex:cell.stepIndex,figureIndex:cell.figureIndex,branchLabel:cell.branchLabel,branchStepId:cell.branchStepId,size:{width:rect.width,height:rect.height}};};
  const later=plan.pages.slice(pageIndex+1).flatMap(page=>page.cells)[0];
  const vertical=diagramPDFSnakeDirection(options,pageIndex)==='vertical';
  function transition(cell:DiagramPDFCell,nextCell:DiagramPDFCell,samePage:boolean):DiagramExportPanel{
    const current=sized(cell);
    const override=options.scaleMarkerOverrides?.[diagramExportTransitionKey(project,cell,nextCell)];
    let readingDirection:DiagramPDFDirection|undefined;
    if(samePage&&(cell.branchNodeId||options.readingOrder==='snake'||vertical)){
      readingDirection=diagramPDFTransitionDirection(cell,nextCell);
      // A straight column continues at the head of the next column.
      if(!cell.branchNodeId&&options.readingOrder!=='snake'&&nextCell.y<cell.y&&nextCell.x>cell.x+cell.width/2)readingDirection='right';
    }
    current.readingDirection=readingDirection;
    if(!options.scaleIndicators&&!override)return current;
    return {...current,scaleIndicators:true,scaleChangePercent:options.scaleChangePercent,next:sized(nextCell),markerOverride:override,
      markerBox:transitionBox(cell,nextCell,image(cell),samePage,readingDirection)};
  }
  return cells.map((cell,index)=>{
    if(cell.branchNodeId){
      const outputs=(branchSuccessors(plan).get(cell)??[]).map(to=>transition(cell,to.cell,to.page===pageIndex));
      return outputs.length>1?{...outputs[0],alternatives:outputs.slice(1)}:outputs[0]??sized(cell);
    }
    const next=cells[index+1]??later;
    return next?transition(cell,next,index+1<cells.length):sized(cell);
  });
}

/** A transition marker belongs to its source panel. Artwork always keeps the full cell. */
export function diagramExportPanelArtwork(project:DiagramProject,panel:DiagramExportPanel,box:DiagramPDFRect,palette:DiagramLineDefaults,adaptiveLines:boolean,scales?:Map<string,number|null>,mainZooms?:Map<string,DiagramStepZoom|null>,usePageMarker=false,readArtwork?:PDFArtworkReader){
  const artworkFor=(source:SizedPanel,rect:DiagramPDFRect)=>{
    const {project:owner,step}=resolveDiagramPanel(project,source),isFigure=source.figureIndex!==undefined,style=owner.basicSettings;
    const route=diagramPanelRoute(project,source);
    const draw=()=>{
      const region=isFigure?diagramProcessFigureZoom(route,route.steps[source.stepIndex],owner):
        mainZooms?.has(step.id)?mainZooms.get(step.id)?.region:diagramStepZoom(owner,step.id)?.region;
      return diagramPDFStepArtwork(step,owner.states,rect,isFigure?style?.lineDefaults??palette:palette,style?.adaptiveLines??adaptiveLines,region,style?.paperPatterns,isFigure,project.basicSettings?.symbolStyles??style?.symbolStyles,undefined,source.readingDirection,readArtwork?.creases);
    };
    return readArtwork&&!mainZooms?readArtwork.svg(step,['step',source.branchStepId,source.stepIndex,source.figureIndex,rect.width,rect.height,source.readingDirection],draw):draw();
  };
  const svg=artworkFor(panel,box),current=diagramArtworkScale(svg,box);
  scales?.set(diagramPanelNumber(panel),current);
  function transitionMarker(panel:DiagramExportPanel){
    if(!panel.scaleIndicators||!panel.next||panel.markerOverride==='none')return {marker:'',markerRect:undefined};
    let change:DiagramScaleChange|null=panel.markerOverride??null;
    if(!change){
      const key=diagramPanelNumber(panel.next);
      let scale=scales?.get(key);
      if(scale===undefined){scale=diagramArtworkScale(artworkFor(panel.next,{x:0,y:0,...panel.next.size}),panel.next.size);scales?.set(key,scale);}
      change=diagramScaleChange(current,scale,panel.scaleChangePercent);
      if(change&&hasDiagramExportScaleSymbol(resolveDiagramPanel(project,panel).step,change))change=null;
    }
    if(!change)return {marker:'',markerRect:undefined};
    const markerRect=usePageMarker&&panel.markerBox?panel.markerBox:diagramExportScaleLayout(box).markerRect;
    const {project:owner}=resolveDiagramPanel(project,panel);
    const marker=diagramExportScaleMarkerSVG(change,markerRect,project.basicSettings?.symbolStyles??owner.basicSettings?.symbolStyles,panel.readingDirection);
    return {marker:`<g data-scale-from="${encodeURIComponent(diagramPanelNumber(panel))}" data-scale-to="${encodeURIComponent(diagramPanelNumber(panel.next))}">${marker}</g>`,markerRect};
  }
  const first=transitionMarker(panel);
  const extra=usePageMarker?(panel.alternatives??[]).map(p=>transitionMarker(p).marker).join(''):'';
  return {svg,rect:box,...first,marker:first.marker+extra};
}
