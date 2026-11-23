import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import type {DiagramPose} from './diagramProject';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {DIAGRAM_STEP_FRAME_MARGIN,diagramDrawingFrame,diagramPresentation} from './diagramDrawing';
import {annotationBounds,type DiagramAnnotationBounds} from './diagramAnnotationSVG';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import type {DiagramCallout} from './diagramCallouts';
import type {DiagramImage} from './diagramImages';
import {diagramZoomRegionBounds,type DiagramZoomRegion} from './diagramZoomGeometry';
import {resolveDiagramSymbolStyle,type DiagramSymbolStyles} from './diagramSymbolStyles';
import {type DiagramPDFDirection} from './diagramPDFDirection';

type Side='left'|'right'|'top'|'bottom';
export interface DiagramPDFDirectionSymbol {
  annotation:DiagramSymbolAnnotation;side:Side;scale:number;penWidth:number;maxPenWidth:number;x:number;y:number;
  source:DiagramAnnotationBounds;bounds:DiagramAnnotationBounds;
  direction?:DiagramPDFDirection;
}
/** PDF-only layout: distant view instructions use the paper's existing margin,
 * rather than making the saved paper smaller. No source drawing is changed. */
export function diagramPDFDrawingLayout(pose:DiagramPose,annotations:DiagramAnnotation[],extra:DiagramAnnotation[]=[],size?:Pick<DiagramPDFRect,'width'|'height'>,images:readonly DiagramImage[]=[],callouts:readonly DiagramCallout[]=[],zoom?:DiagramZoomRegion|null,symbolStyles?:DiagramSymbolStyles,direction?:DiagramPDFDirection,fitArtwork=false) {
  const presentation=diagramPresentation(pose),mesh=diagramIllustrationMesh(pose),vertices=presentation.visibleOrder.flatMap(face=>mesh.rings[face].flat().map(vertex=>presentation.vertices[vertex]));
  if(!vertices.length)return null;
  const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]),paper=zoom?diagramZoomRegionBounds(zoom):{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  const detached:{annotation:DiagramSymbolAnnotation;side:Side;source:DiagramAnnotationBounds;displaySource:DiagramAnnotationBounds;sourceWidth:number;direction?:DiagramPDFDirection}[]=[],main:DiagramAnnotation[]=[];
  for(const annotation of annotations){
    if(annotation.kind!=='symbol'||!['flip','rotate','rotateCCW',...(zoom?['zoom','zoomOut']:[])].includes(annotation.symbol)){main.push(annotation);continue;}
    const sourceWidth=resolveDiagramSymbolStyle(annotation,symbolStyles).width;
    const bounds=annotationBounds([annotation],{symbolStyles});
    const centerOutside=bounds&&(bounds.x+bounds.width/2<paper.x||bounds.x+bounds.width/2>paper.x+paper.width||bounds.y+bounds.height/2<paper.y||bounds.y+bounds.height/2>paper.y+paper.height);
    if(!bounds||!centerOutside){main.push(annotation);continue;}
    const dx=(bounds.x+bounds.width/2-paper.x-paper.width/2)/Math.max(1,paper.width),dy=(bounds.y+bounds.height/2-paper.y-paper.height/2)/Math.max(1,paper.height);
    const authoredSide:Side=Math.abs(dx)>=Math.abs(dy)?dx<0?'left':'right':dy<0?'top':'bottom';
    const side:Side=direction??authoredSide;
    const quarter=direction==='top'||direction==='bottom',w=quarter?bounds.height:bounds.width,h=quarter?bounds.width:bounds.height;
    // Keep the saved along-edge height. A downward cue maps it along the bottom.
    const along=(bounds.y+bounds.height/2-paper.y)/Math.max(1e-12,paper.height);
    const displaySource=direction?{x:paper.x+paper.width*along-w/2,y:bounds.y+bounds.height/2-h/2,width:w,height:h}:bounds;
    detached.push({annotation,side,source:bounds,displaySource,sourceWidth,direction});
  }
  // This frame is identical with and without any detached view instructions.
  const frame=diagramDrawingFrame(pose,[...main,...extra],undefined,images,true,callouts,zoom,undefined,fitArtwork,symbolStyles),margin=zoom ? .04 : DIAGRAM_STEP_FRAME_MARGIN,padding=Math.max(frame.width,frame.height)*margin/(1+2*margin);
  const content={x:frame.x+padding,y:frame.y+padding,width:frame.width-2*padding,height:frame.height-2*padding};
  const fitAspect=()=>{if(size&&size.width>0&&size.height>0){
    const ratio=size.width/size.height;
    if(frame.width/frame.height<ratio){const width=frame.height*ratio;frame.x-=(width-frame.width)/2;frame.width=width;}
    else {const height=frame.width/ratio;frame.y-=(height-frame.height)/2;frame.height=height;}
  }};
  const availableFor=(side:Side)=>side==='left'?content.x-frame.x:side==='right'?frame.x+frame.width-content.x-content.width:side==='top'?content.y-frame.y:frame.y+frame.height-content.y-content.height;
  fitAspect();
  if(zoom&&detached.length){
    // Keep an authored side even for a tight crop; allow space for its pen.
    const preferred=Math.max(content.width,content.height)*.16;
    for(const side of new Set(detached.map(item=>item.side))){
      const missing=Math.max(0,preferred-availableFor(side));
      if(side==='left'){frame.x-=missing;frame.width+=missing;}
      else if(side==='right')frame.width+=missing;
      else if(side==='top'){frame.y-=missing;frame.height+=missing;}
      else frame.height+=missing;
    }
    fitAspect();
  }
  const symbols:DiagramPDFDirectionSymbol[]=[];
  for(const side of ['left','right','top','bottom'] as const){
    const items=detached.filter(item=>item.side===side),vertical=side==='left'||side==='right';
    const center=(box:DiagramAnnotationBounds)=>vertical?box.y+box.height/2:box.x+box.width/2;
    items.sort((a,b)=>center(a.displaySource)-center(b.displaySource));
    const available=availableFor(side);
    const span=Math.min(available,zoom?Math.max(content.width,content.height)*.16:padding),near=side==='left'?content.x-span:side==='right'?content.x+content.width:side==='top'?content.y-span:content.y+content.height;
    const along=vertical?content.height:content.width,origin=vertical?content.y:content.x,slot=along/Math.max(1,items.length),maximum=Math.max(content.width,content.height)*.18;
    const sized=items.map(item=>{
      const width=vertical?Math.min(span*.78,maximum):Math.min(slot*.8,maximum),height=vertical?Math.min(slot*.8,maximum):Math.min(span*.78,maximum);
      const maxPenWidth=Math.min(width,height)*.08,penWidth=Math.min(item.sourceWidth,maxPenWidth),sourceWidth=Math.max(1e-12,item.displaySource.width-item.sourceWidth),sourceHeight=Math.max(1e-12,item.displaySource.height-item.sourceWidth);
      const scale=Math.min((width-penWidth)/sourceWidth,(height-penWidth)/sourceHeight);
      const shownWidth=sourceWidth*scale+penWidth,shownHeight=sourceHeight*scale+penWidth;
      return {item,scale,penWidth,maxPenWidth,shownWidth,shownHeight,length:vertical?shownHeight:shownWidth};
    });
    // Keep the position along the paper edge. Reserve room for neighbours only
    // when the saved positions would overlap or fall beyond that edge.
    const gap=slot*.08;
    let remaining=sized.reduce((sum,symbol)=>sum+symbol.length,0)+Math.max(0,sized.length-1)*gap;
    let start=origin;
    for(const {item,scale,penWidth,maxPenWidth,shownWidth,shownHeight,length} of sized){
      const at=Math.max(start,Math.min(center(item.displaySource)-length/2,origin+along-remaining));
      const x=vertical?near+span/2:at+length/2,y=vertical?at+length/2:near+span/2;
      symbols.push({...item,scale,penWidth,maxPenWidth,x,y,bounds:{x:x-shownWidth/2,y:y-shownHeight/2,width:shownWidth,height:shownHeight}});
      start=at+length+gap;remaining-=length+gap;
    }
  }
  return {frame,paper,main,symbols};
}
