import {Unzip,UnzipInflate,unzipSync} from 'fflate';
import {oriconfigChecksums,settingsCRC32} from './oriconfigIntegrity';

export interface OriconfigArchive {workbench?:Record<string,unknown>;config:Record<string,unknown>|null;hotkeys:string|null;ignoredFiles:string[];warnings:string[]}
const MAX_ARCHIVE=4*1024*1024,MAX_FILE=256*1024,MAX_ENTRIES=64;
/** Inspect in memory only. Call in a cancellable worker when wired to file input. */
export function readOriconfigArchive(input:Uint8Array):OriconfigArchive{
 if(!(input instanceof Uint8Array)||input.length<22||input.length>MAX_ARCHIVE)throw new Error('设置包为空或超过 4 MB。');
 const entries=new Map<string,{size:number;originalSize:number;compression:number;crc:number}>();let total=0;
 const safe=(name:string)=>!!name&&!/[\\:\x00-\x1f]/.test(name)&&!name.startsWith('/')&&!name.split('/').some(p=>p==='..'||p==='.');
 try{
  const checksums=oriconfigChecksums(input);let entryIndex=0;
  // Filter=false reads central metadata without allocating decompressed files.
  unzipSync(input,{filter:file=>{
   if(!safe(file.name)||entries.has(file.name))throw new Error('设置包包含不安全路径或重复文件名。');
   if(entries.size>=MAX_ENTRIES||![file.size,file.originalSize].every(n=>Number.isSafeInteger(n)&&n>=0)||file.size>MAX_ARCHIVE||file.originalSize>MAX_FILE)throw new Error('设置包文件数量或单项大小超限。');
   if(file.compression!==0&&file.compression!==8)throw new Error('设置包使用不支持的压缩方式。');
   total+=file.originalSize;if(total>MAX_ARCHIVE)throw new Error('设置包解压总量超限。');entries.set(file.name,{...file,crc:checksums[entryIndex++]});return false;
  }});
  if(!entries.has('config.json')&&!entries.has('hotkey.properties'))throw new Error('设置包根目录缺少 config.json 和 hotkey.properties。');
  const files=new Map<string,Uint8Array>(),seen=new Set<string>();
  const unzip=new Unzip(file=>{
   const meta=entries.get(file.name);if(!meta||seen.has(file.name)||file.compression!==meta.compression)throw new Error('设置包目录与内容不一致。');seen.add(file.name);
   if(file.name!=='config.json'&&file.name!=='hotkey.properties'&&file.name!=='workbench.json')return;
   let length=0;const chunks:Uint8Array[]=[];
   file.ondata=(error,chunk,final)=>{
    if(error)throw error;length+=chunk.length;
    if(length>MAX_FILE||length>meta.originalSize)throw new Error('设置包实际解压大小超出声明或限制。');chunks.push(chunk);
    if(final){if(length!==meta.originalSize)throw new Error('设置包文件长度不一致。');const output=new Uint8Array(length);let offset=0;for(const part of chunks){output.set(part,offset);offset+=part.length;}if(settingsCRC32(output)!==meta.crc)throw new Error('设置包配置文件 CRC 校验失败。');files.set(file.name,output);}
   };file.start();
  });unzip.register(UnzipInflate);
  // Bound output allocated by any one inflate push, including dishonest headers.
  for(let offset=0;offset<input.length;offset+=1024)unzip.push(input.subarray(offset,offset+1024),offset+1024>=input.length);
  for(const name of ['config.json','hotkey.properties','workbench.json'])if(entries.has(name)&&!files.has(name))throw new Error('设置包内容不完整。');
  const warnings:string[]=[];let config:Record<string,unknown>|null=null,hotkeys:string|null=null;
  const configBytes=files.get('config.json');if(configBytes){const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(configBytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('config.json 必须是设置对象。');config=parsed as Record<string,unknown>;}
  const keyBytes=files.get('hotkey.properties');if(keyBytes){try{hotkeys=new TextDecoder('utf-8',{fatal:true}).decode(keyBytes);}catch{hotkeys=Array.from(keyBytes,b=>String.fromCharCode(b)).join('');warnings.push('快捷键文件不是 UTF-8，已按 Java 的 ISO-8859-1 回退读取。');}}
  let workbench:Record<string,unknown>|undefined;
  const nativeBytes=files.get('workbench.json');if(nativeBytes){const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(nativeBytes));if(!data||data.version!==1||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw new Error('工作台设置格式或版本无效。');workbench=data.settings;}
  return {...(workbench?{workbench}:{}),config,hotkeys,ignoredFiles:[...entries.keys()].filter(n=>n!=='config.json'&&n!=='hotkey.properties'&&n!=='workbench.json'),warnings};
 }catch(error){throw new Error(`无法读取 ORICONFIG：${error instanceof Error?error.message:String(error)}`);}
}
