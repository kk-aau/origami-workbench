/** Shared by browser and local server; no network/blob references in saved work. */
import {rasterDimensions} from './rasterHeader.mjs';
export const MAX_BACKGROUND_DATA_LENGTH=4_000_000;
export function validateBackground(value){
  if(!value||typeof value!=='object')throw new Error('底图数据无效。');
  const {name,dataUrl,width,height,opacity,visible,placement}=value;
  if(value.viewport!==undefined){
    const v=value.viewport;
    if(!v||typeof v!=='object'||![v.x,v.y,v.units].every(Number.isFinite)||Math.abs(v.x)>1e6||Math.abs(v.y)>1e6||v.units<1e-9||v.units>1e6)throw new Error('底图屏幕参照坐标或比例无效。');
  }
  if(typeof name!=='string'||name.length>255)throw new Error('底图名称无效或过长。');
  if(typeof dataUrl!=='string'||dataUrl.length>MAX_BACKGROUND_DATA_LENGTH)throw new Error('底图数据超过保存限额，请缩小图片后重试。');
  const prefix=/^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl);
  if(!prefix)throw new Error('底图只能保存内嵌 PNG、JPEG 或 WebP 图片，不接受网络链接或 SVG。');
  const payload=dataUrl.slice(prefix[0].length);
  if(!payload.length||payload.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload))throw new Error('底图 Base64 数据无效。');
  const head=atob(payload.slice(0,Math.min(48,payload.length)));
  const magic=prefix[1]==='png'?head.startsWith('\x89PNG\r\n\x1a\n'):prefix[1]==='jpeg'?head.startsWith('\xff\xd8\xff'):head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
  if(!magic)throw new Error('底图内容与图片格式不一致。');
  const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
  const actual=rasterDimensions(bytes,'image/'+prefix[1]);
  if(actual.width!==width||actual.height!==height)throw new Error('底图记录尺寸与文件头实际尺寸不一致。');
  if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=16384)||width*height>40_000_000)throw new Error('底图尺寸过大或无效，最多4000万像素、单边16384像素。');
  if(!Number.isFinite(opacity)||opacity<0||opacity>1||typeof visible!=='boolean')throw new Error('底图透明度或显示状态无效。');
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
  if(!placement||!point(placement.origin)||!point(placement.axis)||Math.hypot(...placement.axis)<1e-9)throw new Error('底图配准位置或缩放无效。');
  const [ox,oy]=placement.origin,[ux,uy]=placement.axis;
  for(const [x,y] of [[0,0],[width,0],[width,height],[0,height]])if(!point([ox+x*ux-y*uy,oy+x*uy+y*ux]))throw new Error('底图角点超出坐标范围。');
}
