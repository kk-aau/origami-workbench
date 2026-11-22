import {exportDocument} from '../core/formats';
import {defaultAngle,type Doc,type DocumentFormat} from '../core/types';

export interface CreaseFileTarget {
  binding:string;
  format:DocumentFormat;
  bytes?:Blob;
  acceptedWarning?:string;
}

/** Preserve the BOM used by the interchange reader, including UTF-16 CP/FOLD files. */
async function sourceEncodedBlob(text:string,source?:Blob):Promise<Blob>{
  const prefix=source?new Uint8Array(await source.slice(0,3).arrayBuffer()):[];
  const little=prefix[0]===255&&prefix[1]===254;
  if(little||prefix[0]===254&&prefix[1]===255){
    const bytes=new Uint8Array(2+text.length*2);
    const view=new DataView(bytes.buffer);
    view.setUint16(0,0xfeff,little);
    for(let i=0;i<text.length;i++)view.setUint16(2+i*2,text.charCodeAt(i),little);
    return new Blob([bytes]);
  }
  return new Blob(prefix[0]===239&&prefix[1]===187&&prefix[2]===191?['\ufeff',text]:[text]);
}

export async function encodeCreaseFile(doc:Doc,format:DocumentFormat,source?:Blob){
  if((format==='cp'||format==='opx')&&!doc.segments.length)throw Error('此格式需要至少一条线段才能重新打开。');
  const {text,warnings}=exportDocument(doc,format,{cpCoordinates:'original'});
  let warning='';
  if(format==='cp'){
    if(doc.background||doc.objects?.length||doc.flatFold||doc.metadata?.paperPatterns||
       doc.segments.some(s=>s.displayColor!==undefined||s.angle!==defaultAngle(s.assignment))){
      warning='CP 仅保存线型和端点坐标。底图、绘图对象、自定义颜色、纸张样式及目标折角等工程设置无法写入。';
    }
  }else if(format!=='json'){
    warning=warnings.join('\n');
    if(format==='opx'&&doc.metadata?.sourceProperties)warning+='\n原 OPX 中的作者、备注等附加属性不会写回。';
  }
  return {bytes:await sourceEncodedBlob(text,source),warning};
}
