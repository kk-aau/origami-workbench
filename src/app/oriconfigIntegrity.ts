/** Ordinary single-volume ZIP profile used by Oriedita's ZipOutputStream.
 * Compression stays in fflate; this verifies record agreement and CRC metadata.
 * ZIP64, encrypted and split archives are deliberately rejected, not guessed.
 */
export function oriconfigChecksums(data:Uint8Array):number[]{
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),fail=()=>{throw new Error('设置包 ZIP 结构损坏或使用不支持的扩展。');};
 const u16=(p:number)=>view.getUint16(p,true),u32=(p:number)=>view.getUint32(p,true);
 let end=-1;
 for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===data.length){end=p;break;}
 if(end<0)fail();
 const count=u16(end+10),size=u32(end+12),start=u32(end+16);
 if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count===65535||size===0xffffffff||start===0xffffffff||start+size!==end)fail();
 if(count>64)throw new Error('设置包文件数量超限。');
 const sums:number[]=[],ranges:{start:number;end:number}[]=[];let cursor=start;
 for(let i=0;i<count;i++){
  if(cursor+46>end||u32(cursor)!==0x02014b50)fail();
  const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),packed=u32(cursor+20),original=u32(cursor+24),nameLength=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),local=u32(cursor+42);
  if(flags&~0x080e||method!==0&&method!==8||u16(cursor+34)||packed===0xffffffff||original===0xffffffff||cursor+46+nameLength+extra+comment>end||local+30>start)fail();
  if(u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method||u16(local+26)!==nameLength)fail();
  const body=local+30+nameLength+u16(local+28);let finish=body+packed;
  if(finish>start||data.subarray(local+30,local+30+nameLength).some((b,k)=>b!==data[cursor+46+k]))fail();
  if(flags&8){
   const matches=(p:number)=>p+12<=start&&u32(p)===crc&&u32(p+4)===packed&&u32(p+8)===original;
   if(finish+16<=start&&u32(finish)===0x08074b50&&matches(finish+4))finish+=16;
   else if(matches(finish))finish+=12;else fail();
  }else if(u32(local+14)!==crc||u32(local+18)!==packed||u32(local+22)!==original)fail();
  ranges.push({start:local,end:finish});sums.push(crc);cursor+=46+nameLength+extra+comment;
 }
 if(cursor!==end)fail();
 ranges.sort((a,b)=>a.start-b.start);let previous=0;for(const range of ranges){if(range.start!==previous)fail();previous=range.end;}if(previous!==start)fail();
 return sums;
}
const table=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let k=0;k<8;k++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
export function settingsCRC32(bytes:Uint8Array):number{let crc=0xffffffff;for(const b of bytes)crc=(crc>>>8)^table[(crc^b)&255];return (crc^0xffffffff)>>>0;}
