import {pointBounds} from '../core/pointBounds';
import type {Point} from '../core/types';
import {annotationBounds,resolveDiagramSymbolInk,type DiagramSymbolInkOptions} from './diagramAnnotationSVG';
import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import {diagramCalloutConnectors,diagramCalloutLocator,diagramCalloutTargets,type DiagramCalloutCircle} from './diagramCallouts';
import {diagramCalloutPen} from './diagramCalloutSymbols';
import {diagramPresentation} from './diagramDrawing';
import {diagramDrawingRotationFrame} from './diagramDrawingRotation';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {croppedImagePlacement} from './diagramImageCrop';
import {diagramImageCorners} from './diagramImages';
import {resolveDiagramArrowBinding} from './diagramPaperBinding';
import type {DiagramPDFDirectionSymbol} from './diagramPDFDrawing';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {resolveDiagramSymbolGeometry} from './diagramSymbolStyles';
import {processFigureImageRegion} from './diagramProcessFigureFrame';
import type {DiagramStep} from './diagramProject';
import {diagramSimulationSurfaceBounds} from './diagramSimulationSurfaceRender';
import {diagramZoomPaperBounds,tryMapDiagramZoomArea} from './diagramStepZoom';
import {rotateDiagramViewportPoint} from './diagramViewport';
import {diagramZoomRegionPolygon,type DiagramZoomRegion} from './diagramZoomGeometry';

type Rect=DiagramPDFRect;
export interface DiagramExportObstacleOptions extends DiagramSymbolInkOptions {
  layout?:{paper:Rect;main:readonly DiagramAnnotation[];symbols:readonly DiagramPDFDirectionSymbol[]}|null;
  zoom?:DiagramZoomRegion|null;
  cpBounds?:Rect;
  fitArtwork?:boolean;
}
export interface DiagramExportObstacleGeometry {subject?:Rect;symbols:Rect[]}

function corners({x,y,width,height}:Rect):Point[] {
  return [[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
}
function extent(points:Point[],pad=0):Rect {
  const {minX,minY,maxX,maxY}=pointBounds(points);
  return {x:minX-pad,y:minY-pad,width:maxX-minX+2*pad,height:maxY-minY+2*pad};
}
function intersection(a:Rect,b:Rect):Rect|undefined {
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
  const width=Math.min(a.x+a.width,b.x+b.width)-x,height=Math.min(a.y+a.height,b.y+b.height)-y;
  if(width>=0&&height>=0)return {x,y,width,height};
}

/** Measure the ink using the same source viewport, authored turns and output
 * aspect fit as the embedded SVG. Returned coordinates are in the page cell. */
export function diagramExportObstacles(step:DiagramStep,box:Rect,frame:Rect,options:DiagramExportObstacleOptions={}):DiagramExportObstacleGeometry {
  const {layout,zoom}=options,angle=step.canvas?.drawingRotation??0;
  const pivot:Point=[frame.x+frame.width/2,frame.y+frame.height/2],viewport=diagramDrawingRotationFrame(frame,angle);
  const rotate=(p:Point)=>angle?rotateDiagramViewportPoint(p,pivot,angle):p;
  const scale=Math.min(box.width/viewport.width,box.height/viewport.height);
  const left=box.x+(box.width-viewport.width*scale)/2,top=box.y+(box.height-viewport.height*scale)/2;
  const toPage=(r:Rect):Rect=>({x:left+(r.x-viewport.x)*scale,y:top+(r.y-viewport.y)*scale,width:r.width*scale,height:r.height*scale});
  const rectAfterTurn=(r:Rect)=>angle?extent(corners(r).map(rotate)):r;
  const circleAfterTurn=({center,radius}:DiagramCalloutCircle,pad=0)=>extent([rotate(center)],radius+pad);
  const crop=zoom?(zoom.kind==='circle'?circleAfterTurn(zoom):extent(diagramZoomRegionPolygon(zoom).map(rotate))):undefined;
  const result:DiagramExportObstacleGeometry={symbols:[]};

  const subjectParts:Rect[]=[];
  if(crop)subjectParts.push(crop);
  else{
    if(options.cpBounds)subjectParts.push(rectAfterTurn(options.cpBounds));
    if(step.paperVisible!==false&&step.pose){
      if(layout&&angle%90===0)subjectParts.push(rectAfterTurn(layout.paper));
      else{
        const pose=step.pose,presentation=diagramPresentation(pose),mesh=diagramIllustrationMesh(pose);
        const vertices=new Set<number>();
        for(const face of presentation.visibleOrder)for(const ring of mesh.rings[face])for(const vertex of ring)vertices.add(vertex);
        if(vertices.size)subjectParts.push(extent(Array.from(vertices,index=>rotate(presentation.vertices[index]))));
      }
    }
    if(step.paperVisible!==false&&step.simulationSurface)subjectParts.push(rectAfterTurn(diagramSimulationSurfaceBounds(step.simulationSurface)));
    for(const image of step.images??[]){
      const region=options.fitArtwork?processFigureImageRegion(image):undefined;
      if(region===null)continue;
      const visible=region?{...image,...croppedImagePlacement(image,region)}:image;
      subjectParts.push(extent(diagramImageCorners(visible).map(rotate)));
    }
  }
  if(subjectParts.length){
    const visible=intersection(extent(subjectParts.flatMap(corners)),viewport);
    if(visible)result.subject=toPage(visible);
  }

  const add=(r:Rect,clip=viewport)=>{
    const visible=intersection(r,clip);
    if(visible){const onPage=intersection(visible,viewport);if(onPage)result.symbols.push(toPage(onPage));}
  };
  const symbolRect=(symbol:DiagramSymbolAnnotation,ink?:DiagramSymbolInkOptions)=>
    annotationBounds([{...symbol,position:rotate(symbol.position),rotation:symbol.rotation+angle}],ink)!;
  // Source-step zoom instructions are drawn outside the crop along with their glyphs.
  let instructionBasis:Rect|undefined;
  for(const annotation of layout?.main??step.annotations??[]){
    if(annotation.kind!=='symbol')continue;
    const symbol=resolveDiagramArrowBinding(step.pose,annotation,options.symbolStyles).annotation;
    add(symbolRect(symbol,options));
    if(symbol.symbol==='zoom'&&symbol.zoomArea){
      instructionBasis??=!step.pose&&!step.simulationSurface&&!step.images?.length?symbol.zoomArea.basis:
        diagramZoomPaperBounds(step.pose,step.images,step.paperVisible,undefined,step.simulationSurface);
      const area=tryMapDiagramZoomArea(symbol.zoomArea,instructionBasis);
      if(area?.kind==='circle')add(circleAfterTurn(area,symbol.width/2));
      else if(area)for(let i=1;i<area.points.length;i++)add(extent([rotate(area.points[i-1]),rotate(area.points[i])],symbol.width/2));
    }
  }
  for(const {annotation,x,y,source,scale:fit,maxPenWidth} of layout?.symbols??[]){
    const centerX=source.x+source.width/2,centerY=source.y+source.height/2;
    const position:Point=[x+(annotation.position[0]-centerX)*fit,y+(annotation.position[1]-centerY)*fit];
    const width=Math.min(resolveDiagramSymbolInk(annotation,options).width,maxPenWidth);
    add(symbolRect({...resolveDiagramSymbolGeometry(annotation,options.symbolStyles),position,size:annotation.size*fit,width}));
  }
  for(const callout of step.callouts??[]){
    const pad=diagramCalloutPen(callout.source.kind,options.symbolStyles,'#333333',.7,options.units??1).width/2;
    add(circleAfterTurn(diagramCalloutLocator(callout),pad),crop);
    for(const {circle,label} of diagramCalloutTargets(callout)){
      add(circleAfterTurn(circle,pad),crop);
      if(label){
        const {center:[x,y],radius:r}=circle;
        add(rectAfterTurn({x:x-r*.65,y:y+r*1.1,width:r*1.3,height:r*.3}),crop);
      }
      for(const [a,b] of diagramCalloutConnectors(callout,circle,options.symbolStyles))add(extent([rotate(a),rotate(b)],pad),crop);
    }
  }
  return result;
}
