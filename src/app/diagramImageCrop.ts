import type {PixelRect} from '../core/rasterBounds';
import {prepareDiagramImageRegion} from './diagramImageImport';
import {markDiagramImageCropped,type DiagramImage} from './diagramImages';

/** Keep a retained source pixel at the same world coordinate, even on rotated artwork. */
export function croppedImagePlacement(image:DiagramImage,region:PixelRect):Pick<DiagramImage,'width'|'height'|'position'> {
  const scaleX=image.width/image.pixelWidth,scaleY=image.height/image.pixelHeight;
  const width=region.width*scaleX,height=region.height*scaleY;
  const dx=region.x*scaleX+(width-image.width)/2,dy=region.y*scaleY+(height-image.height)/2;
  const angle=image.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return {width,height,position:[image.position[0]+(image.width-width)/2+cos*dx-sin*dy,
    image.position[1]+(image.height-height)/2+sin*dx+cos*dy]};
}

export async function cropDiagramImage(image:DiagramImage,crop:PixelRect|'transparent'|'background',signal?:AbortSignal):Promise<DiagramImage> {
  const result=await prepareDiagramImageRegion(image,crop,signal,image);
  if(result.image===image)return markDiagramImageCropped(image);
  const next={...image,...result.image,...croppedImagePlacement(image,result.region)};
  if(image.artwork){
    const {box}=image.artwork,r=result.region,sx=box.width/image.pixelWidth,sy=box.height/image.pixelHeight;
    next.artwork={...image.artwork,box:{x:box.x+r.x*sx,y:box.y+r.y*sy,width:r.width*sx,height:r.height*sy}};
  }
  return next;
}
