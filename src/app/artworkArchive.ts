import {zipSync,type Zippable} from 'fflate';
import {ARTWORK_ZIP_FILES,ARTWORK_ZIP32_LIMIT,artworkCRC32,inspectArtworkZip,readArtworkZipText} from './artworkZipIntegrity';

export const ARTWORK_ARCHIVE_EXTENSION='.oriw';
export const ARTWORK_ARCHIVE_MIME='application/zip';
const SECTIONS=['editor','models','diagram','simulation','construction','design'] as const;
type Section=typeof SECTIONS[number];
interface SectionIndex {path:string;bytes:number;crc32:number}
interface Summary {name:string;models:number;steps:number;simulation:boolean;design:boolean}
interface Manifest {format:'oriw';version:1;artworkVersion:1|2;sections:Record<Section,SectionIndex>;summary:Summary}
type Envelope=Record<string,unknown>&{format:'zhezhi-artwork';version:1|2};
const encoder=new TextEncoder();
function fail(message:string):never{throw new Error(message);}
function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function exact(value:unknown,fields:readonly string[]):value is Record<string,unknown>{return object(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));}
function envelope(value:unknown):asserts value is Envelope{
 if(!object(value)||(value.version!==1&&value.version!==2)||value.format!=='zhezhi-artwork'
  ||!exact(value,['format','version','editor','models','diagram','simulation','construction',...(value.version===2?['design']:[])]))fail('完整作品 JSON 的字段或版本不支持，未创建 ORIW 文件。');
}
function summary(value:Envelope):Summary{
 const editor=object(value.editor)?value.editor:undefined,models=object(value.models)?value.models:undefined,diagram=object(value.diagram)?value.diagram:undefined;
 return {name:typeof editor?.name==='string'?editor.name.slice(0,160):'',models:Array.isArray(models?.entries)?models.entries.length:0,
  steps:Array.isArray(diagram?.steps)?diagram.steps.length:0,simulation:value.simulation!==null,design:value.version===2&&value.design!==null};
}
function uint32(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=ARTWORK_ZIP32_LIMIT;}
function checkManifest(value:unknown):asserts value is Manifest{
 if(!exact(value,['format','version','artworkVersion','sections','summary'])||value.format!=='oriw'||value.version!==1||(value.artworkVersion!==1&&value.artworkVersion!==2)||!exact(value.sections,SECTIONS))fail('ORIW 索引的字段或版本不支持。');
 for(const section of SECTIONS){const item=value.sections[section];if(!exact(item,['path','bytes','crc32'])||item.path!==`${section}.json`||!uint32(item.bytes)||item.bytes>=ARTWORK_ZIP32_LIMIT||!uint32(item.crc32))fail('ORIW 索引中的分区路径、长度或 CRC 无效。');}
 const s=value.summary;
 if(!exact(s,['name','models','steps','simulation','design'])||typeof s.name!=='string'||s.name.length>160||![s.models,s.steps].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)||typeof s.simulation!=='boolean'||typeof s.design!=='boolean')fail('ORIW 作品摘要无效。');
}

/** Called only in the owned save Worker after the existing artwork exporter.
 * This envelope codec preserves JSON values; geometry validation remains in
 * exportArtworkProject/prepareArtworkImport, never in the container index. */
export function encodeArtworkArchive(text:string):Uint8Array<ArrayBuffer>{
 try{
  if(typeof text!=='string')fail('完整作品必须是 JSON 文本。');
  const value:unknown=JSON.parse(text);envelope(value);
  const sections={} as Record<Section,SectionIndex>,parts={} as Record<Section,Uint8Array<ArrayBuffer>>;
  for(const section of SECTIONS){
   const bytes=encoder.encode(JSON.stringify(section==='design'&&value.version===1?null:value[section]));
   if(bytes.length>=ARTWORK_ZIP32_LIMIT)fail('作品分区超出 ZIP32 可表示范围。');
   parts[section]=bytes;sections[section]={path:`${section}.json`,bytes:bytes.length,crc32:artworkCRC32(bytes)};
  }
  const manifest:Manifest={format:'oriw',version:1,artworkVersion:value.version,sections,summary:summary(value)};
  const files:Zippable=Object.create(null);files['manifest.json']=[encoder.encode(JSON.stringify(manifest)),{level:0}];
  for(const section of SECTIONS)files[`${section}.json`]=parts[section];
  const output=zipSync(files,{level:0,mtime:new Date(2000,0,1)});
  // fflate writes ZIP32 offsets as uint32. Reject any overflow before delivery.
  inspectArtworkZip(output);return output;
 }catch(error){throw new Error(`无法创建 ORIW 作品：${error instanceof Error?error.message:String(error)}`);}
}

/** Returns the old JSON envelope without normalization or workspace updates.
 * The import Worker must still call prepareArtworkImport before publication. */
export function decodeArtworkArchive(bytes:Uint8Array):unknown{
 try{
  const entries=inspectArtworkZip(bytes),byName=new Map(entries.map(entry=>[entry.name,entry]));
  const manifest:unknown=JSON.parse(readArtworkZipText(bytes,entries[0]));checkManifest(manifest);
  const sections={} as Record<Section,unknown>;
  for(const section of SECTIONS){
   const index=manifest.sections[section],entry=byName.get(index.path as typeof ARTWORK_ZIP_FILES[number]);
   if(!entry||entry.originalSize!==index.bytes||entry.crc32!==index.crc32)fail('ORIW 分区与索引声明不一致。');
   sections[section]=JSON.parse(readArtworkZipText(bytes,entry));
  }
  if(manifest.artworkVersion===1&&sections.design!==null)fail('第一版完整作品不应包含基础形设计分区内容。');
  const value:Envelope={format:'zhezhi-artwork',version:manifest.artworkVersion,editor:sections.editor,models:sections.models,diagram:sections.diagram,
   simulation:sections.simulation,construction:sections.construction,...(manifest.artworkVersion===2?{design:sections.design}:{})};
  const expected=summary(value);if(Object.keys(expected).some(key=>expected[key as keyof Summary]!==manifest.summary[key as keyof Summary]))fail('ORIW 作品摘要与正文不一致。');
  return value;
 }catch(error){throw new Error(`无法读取 ORIW 作品：${error instanceof Error?error.message:String(error)}`);}
}
