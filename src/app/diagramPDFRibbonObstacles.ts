import {DIAGRAM_STEP_FRAME_MARGIN,diagramDrawingFrame} from './diagramDrawing';
import type {DiagramPDFRect} from './diagramPDFLayout';
import type {DiagramProject,DiagramStep} from './diagramProject';

const frames=new WeakMap<DiagramStep,DiagramPDFRect>();
const possibleCrops=new WeakMap<DiagramProject,Set<string>>();

/** Check the crop instruction chain without projecting it into material space. */
function hasCrop(owner:DiagramProject,step:DiagramStep){
  let cropped=possibleCrops.get(owner);
  if(!cropped){
    cropped=new Set();
    let active=false;
    for(const current of owner.steps){
      if(active||current.figureCrop)cropped.add(current.id);
      for(const annotation of current.annotations??[]){
        if(annotation.kind!=='symbol')continue;
        if(annotation.symbol==='zoom'&&annotation.zoomArea)active=true;
        if(annotation.symbol==='zoomOut')active=false;
      }
    }
    possibleCrops.set(owner,cropped);
  }
  return cropped.has(step.id);
}

/** For ordinary folded drawings the PDF fits this padded frame into the
 * illustration space. Complex artwork retains its full illustration space. */
export function diagramPDFRibbonArtworkBox(owner:DiagramProject,step:DiagramStep,box:DiagramPDFRect,processFigure:boolean):DiagramPDFRect {
  const pose=step.pose,angle=(step.canvas?.drawingRotation??0)%360;
  if(!pose||processFigure||step.paperVisible===false||step.simulationSurface||step.images?.length||step.callouts?.length||
     pose.view?.depth?.amount||pose.paperDeformation?.nodes.length||angle%90!==0||
     step.annotations?.some(a=>a.kind!=='line')||hasCrop(owner,step))return box;
  let frame=frames.get(step);
  if(!frame){
    frame=diagramDrawingFrame(pose,step.annotations??[]);
    frames.set(step,frame);
  }
  const turned=angle%180!==0,w=turned?frame.height:frame.width,h=turned?frame.width:frame.height;
  const pad=Math.max(w,h)*DIAGRAM_STEP_FRAME_MARGIN/(1+2*DIAGRAM_STEP_FRAME_MARGIN);
  const scale=Math.min(box.width/w,box.height/h);
  // Include the outline pen, independently of fold-line palette or zoom.
  const width=Math.min(box.width,Math.max(0,w-2*pad)*scale+4),height=Math.min(box.height,Math.max(0,h-2*pad)*scale+4);
  return {x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};
}

export interface RibbonObstacleCell extends DiagramPDFRect {ribbonInk?:DiagramPDFRect[]}

/** Apply normalized ink rectangles to the current placement, including a live drag. */
export function diagramPDFRibbonObstacleRects(cells:readonly RibbonObstacleCell[],endpoint:RibbonObstacleCell){
  return cells.filter(cell=>cell!==endpoint).flatMap(cell=>cell.ribbonInk?.map(r=>({
    x:cell.x+r.x*cell.width,y:cell.y+r.y*cell.height,width:r.width*cell.width,height:r.height*cell.height,
  }))??[cell]);
}
