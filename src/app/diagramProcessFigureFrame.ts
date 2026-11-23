import type {DiagramStep} from './diagramProject';
import type {PixelRect} from '../core/rasterBounds';
import {readDiagramImageInkRegion} from './diagramImageImport';
import {croppedImagePlacement} from './diagramImageCrop';
import {diagramImageBounds,type DiagramImage} from './diagramImages';

// Keep an in-use figure's bounds across rendering and a small secondary cache
// for export snapshots that share bytes but have independent world transforms.
const byImage=new WeakMap<DiagramImage,PixelRect|null>();
const bySource=new Map<string,PixelRect|null>();

export function fitDiagramArtwork(step:DiagramStep,processFigure=false):boolean{
  return processFigure||(step.paperVisible===false&&!!step.images?.some(image=>image.source==='simulation'));
}

export async function prepareDiagramFigureFrame(images:readonly DiagramImage[],signal?:AbortSignal):Promise<void>{
  if(typeof document==='undefined'||typeof Image==='undefined')return;
  for(const image of images){
    signal?.throwIfAborted();
    if(image.croppedToContent||byImage.has(image))continue;
    const cached=bySource.get(image.dataUrl);
    const region=cached===undefined?await readDiagramImageInkRegion(image,signal):cached;
    signal?.throwIfAborted();
    byImage.set(image,region);bySource.delete(image.dataUrl);bySource.set(image.dataUrl,region);
    if(bySource.size>16)bySource.delete(bySource.keys().next().value!);
  }
}

export function processFigureImageRegion(image:DiagramImage):PixelRect|null|undefined {
  if(image.croppedToContent)return undefined;
  return byImage.has(image)?byImage.get(image):bySource.get(image.dataUrl);
}

export function processFigureImageBounds(image:DiagramImage){
  const region=processFigureImageRegion(image);
  if(region===null)return null;
  return region?diagramImageBounds({...image,...croppedImagePlacement(image,region)}):diagramImageBounds(image);
}
