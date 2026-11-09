import {importDocument} from '../core/formats';
import {decodeORH} from '../core/orh';
import {type DocumentFormat,type ImportResult} from '../core/types';

/** Read and validate before the caller asks to replace the current project. */
export async function readProjectFile(file:Pick<File,'size'|'name'|'text'|'arrayBuffer'>):Promise<ImportResult>{
  const ext=file.name.split('.').pop()?.toLowerCase(),name=file.name.replace(/\.[^.]+$/,'');
  if(ext==='orh'){
    const decoded=decodeORH(new Uint8Array(await file.arrayBuffer()));
    const result=importDocument(decoded.text,'orh',name);
    result.doc.metadata={...result.doc.metadata,sourceEncoding:decoded.encoding};
    if(decoded.encoding!=='utf-8')result.warnings.unshift('已按 '+decoded.encoding+' 解码旧 ORH 文件，请核对标题与文字。');
    return result;
  }
  const format:DocumentFormat=ext==='ori'?'ori':ext==='cp'?'cp':ext==='opx'?'opx':ext==='fold'?'fold':'json';
  if(format==='cp'||format==='fold'){
    const bytes=new Uint8Array(await file.arrayBuffer());
    const unsupportedUTF32=bytes.length>=4&&(bytes[0]===0xff&&bytes[1]===0xfe&&bytes[2]===0&&bytes[3]===0||bytes[0]===0&&bytes[1]===0&&bytes[2]===0xfe&&bytes[3]===0xff);
    const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
    let text:string;
    try{
      if(unsupportedUTF32)throw Error('UTF-32');
      text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
      // Unsigned UTF-16 ASCII can be valid UTF-8 bytes containing NULs. Reject
      // that ambiguous input rather than guessing an encoding or deleting bytes.
      if(text.includes('\u0000'))throw Error('NUL');
    }catch{throw Error('文件编码无效或无法识别，请另存为 UTF-8，或带 BOM 的 UTF-16 LE/BE 后重试。');}
    const result=importDocument(text,format,name);
    if(encoding!=='utf-8')result.warnings.unshift('已按 '+encoding.toUpperCase()+' 解码文件，请核对标题与折痕。');
    return result;
  }
  return importDocument(await file.text(),format,name);
}
