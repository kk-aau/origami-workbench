import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import type {DiagramPose} from './diagramProject';
import {annotationBounds} from './diagramAnnotationSVG';
import {flatPresentation} from './flatPresentation';
import {defaultModelView,type ModelViewState} from './modelViewState';
import {diagramTearWindowOutline,diagramTearWindowPath} from './diagramTearWindowGeometry';

export interface DiagramTearWindowRenderer {
  /** Children of <defs>, without the enclosing element. All original face
   * masks and stored annotation face combinations are registered eagerly. */
  readonly definitions:string;
  /** A complete SVG mask attribute value. An unmasked contributing face keeps
   * a multi-layer crease visible, so its surviving paper is never erased. */
  maskForFaces(faces:readonly number[]|undefined):string|undefined;
  wrapFaces(faces:readonly number[]|undefined,markup:string):string;
}

let renderSerial=0;

/** A drawing-only cutaway. Luminance masks hide the union of all windows on
 * each original face, without cutting CP geometry or changing hiddenFaces.
 * One namespace per render keeps repeated thumbnails and PDF cells isolated.
 * Shared window paths and identical face masks avoid repeating 96-point
 * outlines across every paper layer. */
export function diagramTearWindowRender(pose:DiagramPose|null,annotations:readonly DiagramAnnotation[],view:ModelViewState=pose?.view??defaultModelView()):DiagramTearWindowRenderer {
  const empty:DiagramTearWindowRenderer={definitions:'',maskForFaces:()=>undefined,wrapFaces:(_faces,markup)=>markup};
  if(!pose)return empty;
  const count=pose.result.geometry.faces.length,hidden=new Set(pose.hiddenFaces??[]);
  const validFace=(face:number)=>Number.isSafeInteger(face)&&face>=0&&face<count&&!hidden.has(face);
  const windows=annotations.filter((a):a is DiagramSymbolAnnotation=>a.kind==='symbol'&&a.symbol==='tearWindow'&&!!a.cutawayFaces?.some(validFace));
  if(!windows.length)return empty;
  const points=flatPresentation(pose.result,view.side,view.rotation).vertices.map(point=>[...point]);
  for(const window of windows)points.push(...diagramTearWindowOutline(window));
  const annotationFrame=annotationBounds(annotations);
  if(annotationFrame)points.push([annotationFrame.x,annotationFrame.y],[annotationFrame.x+annotationFrame.width,annotationFrame.y+annotationFrame.height]);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y] of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const padding=Math.max(1,(maxX-minX)*.05,(maxY-minY)*.05);
  const bounds=`x="${minX-padding}" y="${minY-padding}" width="${maxX-minX+padding*2}" height="${maxY-minY+padding*2}"`;
  const prefix=`diagram-cutaway-${(++renderSerial).toString(36)}`,definitions:string[]=[],faceWindows=new Map<number,number[]>();
  windows.forEach((window,index)=>{
    definitions.push(`<path id="${prefix}-window-${index}" d="${diagramTearWindowPath(window)}" fill="black" fill-opacity="1" stroke="none"/>`);
    for(const face of new Set(window.cutawayFaces?.filter(validFace)??[])){const list=faceWindows.get(face)??[];list.push(index);faceWindows.set(face,list);}
  });
  const mask=(id:string,content:string)=>`<mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" mask-type="luminance" ${bounds}>${content}</mask>`;
  const rectangle=(fill:'white'|'black',attribute='')=>`<rect ${bounds} fill="${fill}" fill-opacity="1" stroke="none"${attribute}/>`;
  const faceMasks=new Map<number,string>(),sharedFaces=new Map<string,string>();
  for(const [face,indices] of faceWindows){
    const key=indices.join(',');let id=sharedFaces.get(key);
    if(!id){id=`${prefix}-face-${sharedFaces.size}`;sharedFaces.set(key,id);definitions.push(mask(id,rectangle('white')+indices.map(index=>`<use href="#${prefix}-window-${index}"/>`).join('')));}
    faceMasks.set(face,id);
  }
  const combinations=new Map<string,string>();
  function maskForFaces(faces:readonly number[]|undefined):string|undefined {
    const visible=[...new Set(faces?.filter(validFace)??[])];
    if(!visible.length||visible.some(face=>!faceMasks.has(face)))return undefined;
    const ids=[...new Set(visible.map(face=>faceMasks.get(face)!))].sort();
    if(ids.length===1)return `url(#${ids[0]})`;
    const key=ids.join(',');let id=combinations.get(key);
    if(!id){
      id=`${prefix}-combined-${combinations.size}`;combinations.set(key,id);
      // Visible paper on any contributing face keeps the shared line visible.
      // White areas are the union of each face's visible complement, making
      // the black area precisely the intersection of their cutaway windows.
      definitions.push(mask(id,rectangle('black')+ids.map(face=>rectangle('white',` mask="url(#${face})"`)).join('')));
    }
    return `url(#${id})`;
  }
  for(const annotation of annotations)if(annotation.kind==='line')maskForFaces(annotation.foldFaces);
  return {get definitions(){return definitions.join('');},maskForFaces,wrapFaces:(faces,markup)=>{
    const attribute=maskForFaces(faces);return attribute?`<g data-diagram-cutaway-clipped="true" mask="${attribute}">${markup}</g>`:markup;
  }};
}
