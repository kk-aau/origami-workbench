import {artworkCRC32} from './artworkZipIntegrity';
import type {PaperFaceStyle} from './paperPatterns';

// Previously saved presets only carried the final WebP. Identify the six exact
// images so their colors and texture stay editable when those files reopen.
const legacyColors=new Map<number,[number,string]>([
  [226767,[2881531261,'#925e3b']],[215495,[260035487,'#1a6a7d']],
  [249463,[2849640307,'#9dab4e']],[255271,[3901233665,'#e2a95f']],
  [245707,[2197105510,'#d1797e']],[261183,[1691390948,'#e0dcd1']],
]);
export function paperFaceStyle(saved:PaperFaceStyle|undefined,image:string|undefined,color:string):PaperFaceStyle{
  if(saved)return saved;
  const known=image&&legacyColors.get(image.length);
  if(image&&known&&artworkCRC32(new TextEncoder().encode(image))===known[0])return {mode:'color',color:known[1],texture:'washi'};
  return {mode:image?'image':'color',color,texture:'none'};
}

let grain:Promise<{width:number;height:number;values:Int16Array}>|undefined;
async function readGrain(){
  const {default:source}=await import('../assets/fiber-paper/kraft.webp?inline');
  const img=new Image();img.src=source;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
  const {data}=ctx.getImageData(0,0,img.width,img.height),values=new Int16Array(img.width*img.height);
  let sum=0;
  for(let i=0;i<values.length;i++){values[i]=Math.round(.299*data[4*i]+.587*data[4*i+1]+.114*data[4*i+2]);sum+=values[i];}
  const mean=Math.round(sum/values.length);
  for(let i=0;i<values.length;i++)values[i]-=mean;
  return {width:img.width,height:img.height,values};
}

/** Only called on a material edit. All renderers receive the finished raster. */
export async function makePaperImage(style:PaperFaceStyle,signal:AbortSignal):Promise<string>{
  const canvas=document.createElement('canvas');
  if(style.texture==='none'){
    canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);
    return canvas.toDataURL('image/png');
  }
  const {width,height,values}=await (grain??=readGrain().catch(err=>{grain=undefined;throw err;}));
  signal.throwIfAborted();canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(width,height);
  const rgb=[1,3,5].map(i=>parseInt(style.color.slice(i,i+2),16));
  const gains=rgb.map(channel=>.52+channel/310);
  for(let i=0;i<values.length;i++){
    for(let k=0;k<3;k++)image.data[i*4+k]=rgb[k]+values[i]*gains[k];
    image.data[i*4+3]=255;
  }
  ctx.putImageData(image,0,0);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('无法生成和纸图片。')),'image/webp',.88));
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('无法读取生成的和纸图片。'));reader.readAsDataURL(blob);});
}
