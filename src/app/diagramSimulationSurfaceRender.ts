import {zlibSync} from 'fflate';
import type {DiagramSimulationSurface} from './diagramSimulationSurface';
import {prepareDiagramSimulationSurface,validateDiagramSimulationSurfaceView} from './diagramSimulationSurface';
import {validateModelColors} from './modelColors';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {boundingRadius,cameraUniforms,centroid,toViewSpace,projectViewPoint,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {SimulationRasterizer} from '../engine/simRaster';
import {displaySettings} from '../engine/simDisplay';
import {simulationPaperColorSettings} from '../engine/simColors';
import {simulationImageFromBackgrounds} from '../engine/simImageExport';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

export interface DiagramSimulationSurfaceRendering {
  markup:string;
  bounds:{x:number;y:number;width:number;height:number};
}
export interface DiagramSimulationSurfaceRenderOptions {
  /** Raster long edge. The scene stays in original paper units at every size. */
  resolution?:number;
}
type Geometry=ReturnType<typeof prepareDiagramSimulationSurface>&{
  center:[number,number,number];radius:number;unitsPerModel:number;
};
type CachedGeometry={geometry:Geometry;source:unknown;sourceDoc:unknown;mesh:unknown;raster:SimulationRasterizer;views:Map<string,DiagramSimulationSurfaceRendering>};
const cache=new WeakMap<object,CachedGeometry>();

function entry(surface:DiagramSimulationSurface):CachedGeometry{
  const key=surface.pose.solver,known=cache.get(key);
  if(known&&known.source===surface.pose.source&&known.sourceDoc===surface.sourceDoc&&known.mesh===surface.pose.mesh)return known;
  const data=prepareDiagramSimulationSurface(surface),rest=new OrigamiModel(data.prepared).originalPositions;
  // OrigamiModel normalizes around the material bounding-box midpoint. Recover
  // that fixed length unit once; orbiting never refits the projected silhouette.
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.prepared.originalPositions.length;i++){
    const k=i%3,v=data.prepared.originalPositions[i];min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);
  }
  const materialCenter=min.map((v,k)=>(v+max[k])/2) as [number,number,number];
  const center=centroid(rest),radius=boundingRadius(rest,center),unitsPerModel=boundingRadius(data.prepared.originalPositions,materialCenter);
  const next={geometry:{...data,center,radius,unitsPerModel},source:surface.pose.source,sourceDoc:surface.sourceDoc,mesh:surface.pose.mesh,raster:new SimulationRasterizer(),views:new Map<string,DiagramSimulationSurfaceRendering>()};
  cache.set(key,next);return next;
}

/** Shared immutable geometry for an optional GPU orbit preview. Rendering a new
 * yaw/pitch does not rebuild or revalidate the solver mesh. */
export function diagramSimulationSurfaceGeometry(surface:DiagramSimulationSurface):Geometry{return entry(surface).geometry;}

/** Same reflected orbit and perspective as the simulator; scale is measured in
 * original material units, not a new best-fit box for each camera direction. */
export function diagramSimulationSurfaceCamera(surface:DiagramSimulationSurface,width:number,height:number):CameraUniforms{
  validateDiagramSimulationSurfaceView(surface.pose.view);
  const {center,radius,unitsPerModel}=diagramSimulationSurfaceGeometry(surface);
  return {...cameraUniforms(surface.pose.view,center,radius,width,height),scale:unitsPerModel*surface.pose.view.zoom};
}

function layout(surface:DiagramSimulationSurface){
  const {positions,unitsPerModel}=diagramSimulationSurfaceGeometry(surface),width=surface.sourceDoc.paper.width,height=surface.sourceDoc.paper.height;
  const logical=diagramSimulationSurfaceCamera(surface,width,height);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<positions.length;i+=3){
    const pixel=projectViewPoint(toViewSpace(positions[i],positions[i+1],positions[i+2],logical),logical);
    if(!pixel.every(Number.isFinite))throw Error('当前曲面视角无法投影，请调整视角。');
    minX=Math.min(minX,pixel[0]);maxX=Math.max(maxX,pixel[0]);minY=Math.min(minY,pixel[1]);maxY=Math.max(maxY,pixel[1]);
  }
  const lineWidth=Math.max(.15,unitsPerModel*.0025),padding=Math.max(lineWidth*2,Math.max(maxX-minX,maxY-minY)*.015);
  const bounds={x:minX-padding,y:minY-padding,width:Math.max(lineWidth,maxX-minX)+padding*2,height:Math.max(lineWidth,maxY-minY)+padding*2};
  return {logical,width,height,lineWidth,bounds};
}

/** Bounds-only callers must not rasterize a high-resolution image during orbit. */
function rotatedBounds(surface:DiagramSimulationSurface,bounds:DiagramSimulationSurfaceRendering['bounds']){
  const angle=(surface.displayRotation??0)*Math.PI/180;if(!angle)return bounds;
  const cx=surface.sourceDoc.paper.width/2,cy=surface.sourceDoc.paper.height/2,c=Math.cos(angle),s=Math.sin(angle);
  const points=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height],[bounds.x,bounds.y+bounds.height]].map(([x,y])=>[cx+c*(x-cx)-s*(y-cy),cy+s*(x-cx)+c*(y-cy)]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
function display(surface:DiagramSimulationSurface,result:DiagramSimulationSurfaceRendering):DiagramSimulationSurfaceRendering{
  const angle=surface.displayRotation??0;if(!angle)return {...result,bounds:{...result.bounds}};
  return {bounds:rotatedBounds(surface,result.bounds),markup:`<g data-diagram-paper-rotation="${angle}" transform="rotate(${angle} ${surface.sourceDoc.paper.width/2} ${surface.sourceDoc.paper.height/2})">${result.markup}</g>`};
}
export function diagramSimulationSurfaceBounds(surface:DiagramSimulationSurface):DiagramSimulationSurfaceRendering['bounds']{return rotatedBounds(surface,layout(surface).bounds);}

const crcTable=Uint32Array.from({length:256},(_,value)=>{
  let crc=value;for(let bit=0;bit<8;bit++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;
});
function pngChunk(name:string,data:Uint8Array):Uint8Array{
  const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);
  for(let i=0;i<4;i++)bytes[i+4]=name.charCodeAt(i);bytes.set(data,8);
  let crc=0xffffffff;for(let i=4;i<bytes.length-4;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
  view.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes;
}
function encodePng(width:number,height:number,rgba:Uint8ClampedArray):string{
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
  const stride=width*4,filtered=new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++)filtered.set(rgba.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlibSync(filtered,{level:1})),pngChunk('IEND',new Uint8Array())];
  const bytes=new Uint8Array(chunks.reduce((size,c)=>size+c.length,0));let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return 'data:image/png;base64,'+btoa(binary);
}

/** Depth-render the actual captured surface once for canvas, thumbnails and PDF.
 * Opaque pixels have one nearest material owner, so SVG triangle antialiasing
 * cannot leak a hidden back face through seams. Real crossings keep real depth;
 * this path does not create or claim a flat-paper layer-order certificate. */
export function renderDiagramSimulationSurface(surface:DiagramSimulationSurface,options:DiagramSimulationSurfaceRenderOptions={}):DiagramSimulationSurfaceRendering{
  const resolution=options.resolution??1200;
  if(!Number.isInteger(resolution)||resolution<64||resolution>4096)throw Error('曲面绘图分辨率应为 64 至 4096 像素。');
  validateDiagramSimulationSurfaceView(surface.pose.view);validateModelColors(surface.colors);
  const state=entry(surface),{prepared,positions}=state.geometry;
  const width=surface.sourceDoc.paper.width,height=surface.sourceDoc.paper.height;
  const key=JSON.stringify([surface.pose.view,surface.colors,width,height,resolution]),old=state.views.get(key);
  if(old)return display(surface,old);
  const {logical,lineWidth,bounds}=layout(surface);
  // Grow around the simulator's fixed screen centre instead of shifting its
  // 3D centre: a 3D translation would distort the perspective and change depth.
  const canvasWidth=2*Math.max(width/2-bounds.x,bounds.x+bounds.width-width/2,lineWidth),canvasHeight=2*Math.max(height/2-bounds.y,bounds.y+bounds.height-height/2,lineWidth);
  const ratio=resolution/Math.max(canvasWidth,canvasHeight),pixelWidth=Math.max(1,Math.ceil(canvasWidth*ratio)),pixelHeight=Math.max(1,Math.ceil(canvasHeight*ratio));
  const camera={...logical,width:pixelWidth,height:pixelHeight,scale:logical.scale*ratio};
  const palette=simulationPaperColorSettings(surface.colors.front,surface.colors.back,surface.colors.line)!;
  // Preserve a full raster pixel in small orbit previews: subpixel binary
  // strokes otherwise look dashed even when the material crease is solid.
  const base:RenderSettings={...palette,mountainColor:palette.borderColor!,valleyColor:palette.borderColor!,borderColor:palette.borderColor!,diagramInkColor:palette.borderColor!,lightDir:[-.3,.5,1],background:[0,0,0],showFaces:true,showEdges:true,lighting:true,creaseWidthPx:Math.max(1,lineWidth*ratio)/.625,faceAlpha:1,creaseDepthBias:.000002,creaseWritesDepth:false};
  const settings=displaySettings(base,'paper','diagram');
  const black=state.raster.render(positions,prepared,camera,settings).slice();
  const white=state.raster.render(positions,prepared,camera,{...settings,background:[1,1,1]});
  const rgba=simulationImageFromBackgrounds(black,white),dataUrl=encodePng(pixelWidth,pixelHeight,rgba);
  const imageWidth=pixelWidth/ratio,imageHeight=pixelHeight/ratio;
  const result={bounds,markup:`<image data-diagram-simulation-surface="true" x="${width/2-imageWidth/2}" y="${height/2-imageHeight/2}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none" href="${dataUrl}"/>`};
  state.views.set(key,result);while(state.views.size>3)state.views.delete(state.views.keys().next().value!);
  return display(surface,result);
}
