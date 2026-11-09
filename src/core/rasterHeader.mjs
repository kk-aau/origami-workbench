/** Reads encoded pixel dimensions; not a substitute for actual image decoding. */
export function rasterDimensions(bytes,mime){
  const fail=()=>{throw new Error('底图文件头损坏、截断或不支持，无法核实尺寸。');};
  const need=(p,n)=>{if(p<0||p+n>bytes.length)fail();};
  const u16=(p)=>{need(p,2);return bytes[p]*256+bytes[p+1];};
  const u32=(p,little=false)=>{need(p,4);return new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0,little);};
  const u24=p=>{need(p,3);return bytes[p]+bytes[p+1]*256+bytes[p+2]*65536;};
  const text=(p,n)=>{need(p,n);return String.fromCharCode(...bytes.subarray(p,p+n));};
  const result=(width,height)=>{
    if(!width||!height||width>16384||height>16384||width*height>40_000_000)throw new Error('底图实际尺寸过大或无效，最多4000万像素、单边16384像素。');
    return{width,height};
  };
  if(mime==='image/png'){
    if(text(0,8)!=='\x89PNG\r\n\x1a\n'||u32(8)!==13||text(12,4)!=='IHDR')fail();
    need(16,17);return result(u32(16),u32(20));
  }
  if(mime==='image/jpeg'){
    if(u16(0)!==0xffd8)fail();
    let p=2;
    while(p<bytes.length){
      if(bytes[p++]!==255)fail();
      while(bytes[p]===255)p++;
      need(p,1);const marker=bytes[p++];
      if(marker===0xda||marker===0xd9)fail();
      if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
      const length=u16(p);if(length<2)fail();need(p,length);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<8)fail();return result(u16(p+5),u16(p+3));
      }
      p+=length;
    }
    fail();
  }
  if(mime==='image/webp'){
    if(text(0,4)!=='RIFF'||text(8,4)!=='WEBP'||u32(4,true)+8!==bytes.length)fail();
    const kind=text(12,4),length=u32(16,true);need(20,length);
    if(kind==='VP8X'){
      if(length!==10)fail();return result(u24(24)+1,u24(27)+1);
    }
    if(kind==='VP8L'){
      if(length<5||bytes[20]!==0x2f)fail();const bits=u32(21,true);
      if((bits>>>29)!==0)fail();return result((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
    }
    if(kind==='VP8 '){
      if(length<10||(bytes[20]&1)!==0||text(23,3)!=='\x9d\x01\x2a')fail();
      return result((bytes[26]+256*bytes[27])&0x3fff,(bytes[28]+256*bytes[29])&0x3fff);
    }
  }
  fail();
}
