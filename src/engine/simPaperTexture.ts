import type {PaperPatterns,PaperSide} from '../app/paperPatterns';
import type {SimulationSurfaceMesh} from './simSurfaceLayers';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

export type PaperPixels=Partial<Record<PaperSide,ImageData>>;
const decoding=new WeakMap<PaperPatterns,Promise<PaperPixels>>();
const decoded=new WeakMap<PaperPatterns,PaperPixels>();
export const decodedPaperTextures=(patterns?:PaperPatterns)=>patterns?decoded.get(patterns):undefined;
export function decodePaperTextures(patterns:PaperPatterns):Promise<PaperPixels>{
  const cached=decoding.get(patterns);if(cached)return cached;
  const task=decode(patterns).then(pixels=>{decoded.set(patterns,pixels);return pixels;},error=>{decoding.delete(patterns);throw error;});
  decoding.set(patterns,task);return task;
}
async function decode(patterns:PaperPatterns):Promise<PaperPixels>{
  const pixels:PaperPixels={};
  await Promise.all((['front','back'] as const).map(async side=>{
    const url=patterns[side];if(!url)return;
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);pixels[side]=ctx.getImageData(0,0,canvas.width,canvas.height);
  }));return pixels;
}
const restCache=new WeakMap<PreparedOrigamiModel,Float32Array>();
const surfaceCache=new WeakMap<Uint32Array,Float32Array>();
export function materialUV(model:PreparedOrigamiModel,surface?:SimulationSurfaceMesh):Float32Array{
  let rest=restCache.get(model);
  if(!rest){
    const p=model.originalPositions;let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(let i=0;i<p.length;i+=3){xmin=Math.min(xmin,p[i]);xmax=Math.max(xmax,p[i]);ymin=Math.min(ymin,-p[i+2]);ymax=Math.max(ymax,-p[i+2]);}
    rest=new Float32Array(model.vertexCount*2);
    for(let i=0;i<model.vertexCount;i++){rest[2*i]=(p[3*i]-xmin)/(xmax-xmin||1);rest[2*i+1]=(-p[3*i+2]-ymin)/(ymax-ymin||1);}
    restCache.set(model,rest);
  }
  if(!surface)return rest;
  let mapped=surfaceCache.get(surface.sourceVertices);
  if(!mapped){mapped=new Float32Array(surface.sourceVertices.length*2);
    surface.sourceVertices.forEach((v,i)=>{for(let k=0;k<2;k++)mapped![2*i+k]=surface.sourceVertexWeights?.[i]?.reduce((sum,[j,w])=>sum+rest![2*j+k]*w,0)??rest![2*v+k];});
    surfaceCache.set(surface.sourceVertices,mapped);}
  return mapped;
}
