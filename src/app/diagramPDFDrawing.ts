import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import type {DiagramPose} from './diagramProject';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {diagramDrawingFrame,diagramPresentation} from './diagramDrawing';
import {annotationBounds,type DiagramAnnotationBounds} from './diagramAnnotationSVG';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import type {DiagramCallout} from './diagramCallouts';
import type {DiagramImage} from './diagramImages';
import {diagramZoomRegionBounds,type DiagramZoomRegion} from './diagramZoomGeometry';

type Side='left'|'right'|'top'|'bottom';
export interface DiagramPDFDirectionSymbol {
  annotation:DiagramSymbolAnnotation;side:Side;scale:number;penWidth:number;x:number;y:number;
  source:DiagramAnnotationBounds;bounds:DiagramAnnotationBounds;
}
/** PDF-only layout: distant view instructions use the paper's existing margin,
 * rather than making the saved paper smaller. No source drawing is changed. */
export function diagramPDFDrawingLayout(pose:DiagramPose,annotations:DiagramAnnotation[],extra:DiagramAnnotation[]=[],size?:Pick<DiagramPDFRect,'width'|'height'>,images:readonly DiagramImage[]=[],callouts:readonly DiagramCallout[]=[],zoom?:DiagramZoomRegion|null) {
  const presentation=diagramPresentation(pose),mesh=diagramIllustrationMesh(pose),vertices=presentation.visibleOrder.flatMap(face=>mesh.rings[face].flat().map(vertex=>presentation.vertices[vertex]));
  if(!vertices.length)return null;
  const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]),paper=zoom?diagramZoomRegionBounds(zoom):{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  const detached:{annotation:DiagramSymbolAnnotation;side:Side;source:DiagramAnnotationBounds}[]=[],main:DiagramAnnotation[]=[];
  for(const annotation of annotations){
    const bounds=annotation.kind==='symbol'&&['flip','rotate','rotateCCW',...(zoom?['zoom','zoomOut']:[])].includes(annotation.symbol)?annotationBounds([annotation]):null;
    const centerOutside=bounds&&(bounds.x+bounds.width/2<paper.x||bounds.x+bounds.width/2>paper.x+paper.width||bounds.y+bounds.height/2<paper.y||bounds.y+bounds.height/2>paper.y+paper.height);
    if(!bounds||!centerOutside){main.push(annotation);continue;}
    const dx=(bounds.x+bounds.width/2-paper.x-paper.width/2)/Math.max(1,paper.width),dy=(bounds.y+bounds.height/2-paper.y-paper.height/2)/Math.max(1,paper.height);
    const side:Side=Math.abs(dx)>=Math.abs(dy)?dx<0?'left':'right':dy<0?'top':'bottom';
    detached.push({annotation:annotation as DiagramSymbolAnnotation,side,source:bounds});
  }
  // This frame is identical with and without any detached view instructions.
  const frame=diagramDrawingFrame(pose,[...main,...extra],undefined,images,true,callouts,zoom),margin=zoom ? .04 : .16,padding=Math.max(frame.width,frame.height)*margin/(1+2*margin);
  const content={x:frame.x+padding,y:frame.y+padding,width:frame.width-2*padding,height:frame.height-2*padding};
  const fitAspect=()=>{if(size&&size.width>0&&size.height>0){
    const ratio=size.width/size.height;
    if(frame.width/frame.height<ratio){const width=frame.height*ratio;frame.x-=(width-frame.width)/2;frame.width=width;}
    else {const height=frame.width/ratio;frame.y-=(height-frame.height)/2;frame.height=height;}
  }};
  const availableFor=(side:Side)=>side==='left'?content.x-frame.x:side==='right'?frame.x+frame.width-content.x-content.width:side==='top'?content.y-frame.y:frame.y+frame.height-content.y-content.height;
  fitAspect();
  if(zoom&&detached.length){
    // A tight focus margin must not reduce a zoom-out arrow to a one-millimetre
    // speck. Use the panel's existing whitespace first, even on another side;
    // only a crop with no usable margin needs additional space on one side.
    const preferred=Math.max(content.width,content.height)*.16;
    for(const item of detached){
      if(availableFor(item.side)<preferred){
        const best=(['left','right','top','bottom'] as Side[]).reduce((a,b)=>availableFor(b)>availableFor(a)?b:a,item.side);
        item.side=best;
        const missing=Math.max(0,preferred-availableFor(best));
        if(best==='left'){frame.x-=missing;frame.width+=missing;}
        else if(best==='right')frame.width+=missing;
        else if(best==='top'){frame.y-=missing;frame.height+=missing;}
        else frame.height+=missing;
      }
    }
    fitAspect();
  }
  const symbols:DiagramPDFDirectionSymbol[]=[];
  for(const side of ['left','right','top','bottom'] as const){
    const items=detached.filter(item=>item.side===side),vertical=side==='left'||side==='right';
    items.sort((a,b)=>vertical?a.source.y-b.source.y:a.source.x-b.source.x);
    const available=availableFor(side);
    const span=Math.min(available,zoom?Math.max(content.width,content.height)*.16:padding),near=side==='left'?content.x-span:side==='right'?content.x+content.width:side==='top'?content.y-span:content.y+content.height;
    const along=vertical?content.height:content.width,origin=vertical?content.y:content.x,slot=along/Math.max(1,items.length),maximum=Math.max(content.width,content.height)*.18;
    items.forEach((item,index)=>{
      const width=vertical?Math.min(span*.78,maximum):Math.min(slot*.8,maximum),height=vertical?Math.min(slot*.8,maximum):Math.min(span*.78,maximum);
      const penWidth=Math.min(item.annotation.width,Math.min(width,height)*.08),sourceWidth=Math.max(1e-12,item.source.width-item.annotation.width),sourceHeight=Math.max(1e-12,item.source.height-item.annotation.width);
      const scale=Math.min((width-penWidth)/sourceWidth,(height-penWidth)/sourceHeight),x=vertical?near+span/2:origin+slot*(index+.5),y=vertical?origin+slot*(index+.5):near+span/2;
      const shownWidth=sourceWidth*scale+penWidth,shownHeight=sourceHeight*scale+penWidth;
      symbols.push({...item,scale,penWidth,x,y,bounds:{x:x-shownWidth/2,y:y-shownHeight/2,width:shownWidth,height:shownHeight}});
    });
  }
  return {frame,main,symbols};
}
