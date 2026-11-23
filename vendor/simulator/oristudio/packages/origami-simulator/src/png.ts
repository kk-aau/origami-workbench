import {zlibSync} from 'fflate';

const crcTable=Uint32Array.from({length:256},(_,value)=>{
  let crc=value;for(let bit=0;bit<8;bit++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;
});
function pngChunk(name:string,data:Uint8Array):Uint8Array{
  const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);
  for(let i=0;i<4;i++)bytes[i+4]=name.charCodeAt(i);bytes.set(data,8);
  let crc=0xffffffff;for(let i=4;i<bytes.length-4;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
  view.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes;
}
export function encodePng(width:number,height:number,rgba:Uint8ClampedArray):string{
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
  const stride=width*4,filtered=new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++)filtered.set(rgba.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlibSync(filtered,{level:1})),pngChunk('IEND',new Uint8Array())];
  const bytes=new Uint8Array(chunks.reduce((size,c)=>size+c.length,0));let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return 'data:image/png;base64,'+btoa(binary);
}

