import {unzlibSync} from 'fflate';
import {diagramRasterDataInfo} from './diagramRasterData';

const colors=new Map<string,string|undefined>();

/** Solid paper colors from older files are ordinary 1×1 opaque RGBA PNGs.
 * A single pixel has no neighbouring samples, so all five PNG row filters
 * leave its four component bytes unchanged. Keep other image formats and
 * profiles on the original texture path. */
export function diagramPaperColorPixel(url?:string):string|undefined {
  if(!url||url.length>1024||!url.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'))return;
  if(colors.has(url))return colors.get(url);
  let color:string|undefined;
  try{
    const bytes=Uint8Array.from(atob(url.slice(url.indexOf(',')+1)),c=>c.charCodeAt(0));
    const info=diagramRasterDataInfo(bytes,'image/png');
    if(info.width===1&&info.height===1&&bytes[24]===8&&bytes[25]===6&&bytes[26]===0&&bytes[27]===0&&bytes[28]===0){
      const view=new DataView(bytes.buffer),compressed:number[]=[];
      let compatible=true;
      for(let i=33;i<bytes.length;){
        const length=view.getUint32(i),type=String.fromCharCode(...bytes.subarray(i+4,i+8));
        if(type==='IDAT')compressed.push(...bytes.subarray(i+8,i+8+length));
        else if(type!=='IEND'&&type!=='sRGB'&&type!=='pHYs'){compatible=false;break;}
        i+=12+length;
      }
      if(compatible){
        const pixel=unzlibSync(Uint8Array.from(compressed),{out:new Uint8Array(6)});
        if(pixel.length===5&&pixel[0]<=4&&pixel[4]===255)color='#'+Array.from(pixel.subarray(1,4),v=>v.toString(16).padStart(2,'0')).join('');
      }
    }
  }catch{/* Keep the original image when its solid color cannot be certified. */}
  colors.set(url,color);
  if(colors.size>64)colors.delete(colors.keys().next().value!);
  return color;
}
