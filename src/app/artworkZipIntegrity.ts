import {Inflate} from 'fflate';

/** ORIW v1 uses an ordinary, single-volume ZIP32 with these seven files only.
 * Entries have no extra fields or comments. Data descriptors are accepted, but
 * every byte range is obtained from the central directory before inflation. */
export const ARTWORK_ZIP_FILES=['manifest.json','editor.json','models.json','diagram.json','simulation.json','construction.json','design.json'] as const;
export const ARTWORK_ZIP32_LIMIT=0xffffffff;
export interface ArtworkZipEntry {
 name:typeof ARTWORK_ZIP_FILES[number];compression:0|8;crc32:number;
 compressedSize:number;originalSize:number;localStart:number;dataStart:number;dataEnd:number;end:number;
}
function invalid(message='ZIP 结构损坏或使用了不支持的 ZIP 扩展。'):never{throw new Error(message);}

export function inspectArtworkZip(data:Uint8Array):ArtworkZipEntry[]{
 if(!(data instanceof Uint8Array)||data.length<22||data.length>=ARTWORK_ZIP32_LIMIT)invalid('ORIW 文件为空、截断或超出 ZIP32 可表示范围。');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),end=data.length-22;
 const u16=(offset:number)=>view.getUint16(offset,true),u32=(offset:number)=>view.getUint32(offset,true);
 if(u32(end)!==0x06054b50||u16(end+20)!==0)invalid();
 const count=u16(end+10),centralSize=u32(end+12),centralStart=u32(end+16);
 if(u16(end+4)!==0||u16(end+6)!==0||u16(end+8)!==count||count!==ARTWORK_ZIP_FILES.length||centralSize===ARTWORK_ZIP32_LIMIT||centralStart===ARTWORK_ZIP32_LIMIT||centralStart+centralSize!==end)invalid();
 const entries:ArtworkZipEntry[]=[],seen=new Set<string>();let cursor=centralStart,totalOriginal=0;
 for(let index=0;index<count;index++){
  if(cursor+46>end||u32(cursor)!==0x02014b50)invalid();
  const version=u16(cursor+6),flags=u16(cursor+8),compression=u16(cursor+10),crc32=u32(cursor+16),compressedSize=u32(cursor+20),originalSize=u32(cursor+24);
  const nameLength=u16(cursor+28),extraLength=u16(cursor+30),commentLength=u16(cursor+32),attributes=u32(cursor+38),localStart=u32(cursor+42);
  if((version!==10&&version!==20)||((compression===8||(flags&8)!==0)&&version!==20)||(flags&~0x080e)!==0||(compression!==0&&compression!==8)||(compression===0&&(flags&6)!==0)||extraLength!==0||commentLength!==0||u16(cursor+34)!==0
   ||compressedSize===ARTWORK_ZIP32_LIMIT||originalSize===ARTWORK_ZIP32_LIMIT||localStart===ARTWORK_ZIP32_LIMIT||cursor+46+nameLength>end||localStart+30>centralStart)invalid();
  // Directory and symlink attributes are not part of the seven regular files.
  const unixType=(attributes>>>16)&0xf000;if((attributes&0x10)!==0||unixType!==0&&unixType!==0x8000)invalid();
  const name=ARTWORK_ZIP_FILES.find(candidate=>candidate.length===nameLength&&Array.from(candidate).every((character,k)=>data[cursor+46+k]===character.charCodeAt(0)));
  if(!name||seen.has(name))invalid('ORIW 包含未知路径、额外文件或重复文件名。');seen.add(name);
  if(u32(localStart)!==0x04034b50||u16(localStart+4)!==version||u16(localStart+6)!==flags||u16(localStart+8)!==compression
   ||u32(localStart+10)!==u32(cursor+12)||u16(localStart+26)!==nameLength||u16(localStart+28)!==0)invalid();
  const dataStart=localStart+30+nameLength,dataEnd=dataStart+compressedSize;
  if(dataStart>centralStart||dataEnd>centralStart||data.subarray(localStart+30,dataStart).some((byte,k)=>byte!==data[cursor+46+k]))invalid();
  if(compression===0&&compressedSize!==originalSize)invalid();
  let finish=dataEnd;
  if(flags&8){
   // A local placeholder is either zero or the matching central value.
   if(![0,crc32].includes(u32(localStart+14))||![0,compressedSize].includes(u32(localStart+18))||![0,originalSize].includes(u32(localStart+22)))invalid();
   const matches=(position:number)=>position+12<=centralStart&&u32(position)===crc32&&u32(position+4)===compressedSize&&u32(position+8)===originalSize;
   if(finish+16<=centralStart&&u32(finish)===0x08074b50&&matches(finish+4))finish+=16;
   else if(matches(finish))finish+=12;else invalid();
  }else if(u32(localStart+14)!==crc32||u32(localStart+18)!==compressedSize||u32(localStart+22)!==originalSize)invalid();
  totalOriginal+=originalSize;if(!Number.isSafeInteger(totalOriginal))invalid('ORIW 解压总量超出 JavaScript 可表示范围。');
  entries.push({name,compression,crc32,compressedSize,originalSize,localStart,dataStart,dataEnd,end:finish});cursor+=46+nameLength;
 }
 if(cursor!==end)invalid();
 entries.sort((a,b)=>a.localStart-b.localStart);let previous=0;
 for(const entry of entries){if(entry.localStart!==previous)invalid('ORIW 文件范围重叠、不连续或包含隐藏记录。');previous=entry.end;}
 if(previous!==centralStart||entries[0]?.name!=='manifest.json'||entries[0].compression!==0)invalid('ORIW 必须以未压缩的 manifest.json 索引开头。');
 return entries;
}

const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
function crcAccumulator(){let value=0xffffffff;return {push(bytes:Uint8Array){for(let index=0;index<bytes.length;index++)value=(value>>>8)^crcTable[(value^bytes[index])&255];},digest:()=>((value^0xffffffff)>>>0)};}
export function artworkCRC32(bytes:Uint8Array):number{const crc=crcAccumulator();crc.push(bytes);return crc.digest();}

/** fflate 0.8.3's public stream callback reports the caller's final flag, and
 * silently accepts bytes following BFINAL. This narrow, tested adapter checks
 * actual completion and consumed input; do not drop it on a dependency update. */
function checkInflateFinished(inflate:Inflate){
 const state=inflate as unknown as {s?:{f?:number;l?:unknown;p?:number};p?:Uint8Array};
 const bits=state.s?.p;
 if(state.s?.f!==1||state.s.l!=null||typeof bits!=='number'||!Number.isInteger(bits)||bits<0||bits>7||!(state.p instanceof Uint8Array)||state.p.length!==(bits===0?0:1))invalid('ORIW 压缩数据未完整结束或含有额外字节。');
}

/** Never allocate from untrusted originalSize. A small compressed push bounds
 * transient inflate output; validate its real length before decoding UTF-8. */
export function readArtworkZipText(data:Uint8Array,entry:ArtworkZipEntry):string{
 const crc=crcAccumulator(),decoder=new TextDecoder('utf-8',{fatal:true}),chunks:string[]=[];let length=0;
 const receive=(chunk:Uint8Array)=>{
  length+=chunk.length;if(length>entry.originalSize)invalid(`ORIW 的 ${entry.name} 实际解压长度超出声明。`);
  crc.push(chunk);const text=decoder.decode(chunk,{stream:true});if(text)chunks.push(text);
 };
 if(entry.compression===0){for(let offset=entry.dataStart;offset<entry.dataEnd;offset+=65536)receive(data.subarray(offset,Math.min(offset+65536,entry.dataEnd)));}
 else{
  const inflate=new Inflate(chunk=>receive(chunk));
  if(entry.compressedSize===0)invalid('ORIW 压缩条目为空。');
  // 8 KiB avoids thousands of 32 KiB history-window copies for large works.
  // A malicious DEFLATE stream can expand one push by roughly 1032x; retaining
  // this bound also bounds transient output before its declared-size check.
  const compressedChunk=8192;
  for(let offset=entry.dataStart;offset<entry.dataEnd;offset+=compressedChunk)inflate.push(data.subarray(offset,Math.min(offset+compressedChunk,entry.dataEnd)),offset+compressedChunk>=entry.dataEnd);
  checkInflateFinished(inflate);
 }
 if(length!==entry.originalSize||crc.digest()!==entry.crc32)invalid(`ORIW 的 ${entry.name} 长度或 CRC 校验失败。`);
 const tail=decoder.decode();if(tail)chunks.push(tail);return chunks.join('');
}
