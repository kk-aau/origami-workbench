import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rasterDimensions} from '../../src/core/rasterHeader.mjs';
import {validateBackground} from '../../src/core/backgroundData.mjs';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=','base64'));
const jpeg=(marker=0xc0)=>Uint8Array.from([255,216,255,224,0,4,0,0,255,marker,0,11,8,0,20,0,30,1,1,17,0]);
function webp(kind:string,payload:number[]){const b=Buffer.alloc(20+payload.length+(payload.length%2));b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WEBP',8);b.write(kind,12);b.writeUInt32LE(payload.length,16);b.set(payload,20);return b;}
test('PNG IHDR gives encoded dimensions and rejects truncated or oversized header',()=>{
  assert.deepEqual(rasterDimensions(png,'image/png'),{width:1,height:1});
  assert.throws(()=>rasterDimensions(png.slice(0,25),'image/png'));
  const oversized=Buffer.from(png);oversized.writeUInt32BE(20000,16);assert.throws(()=>rasterDimensions(oversized,'image/png'),/实际尺寸/);
});
test('JPEG skips APP metadata and reads baseline/progressive SOF size',()=>{
  for(const marker of [0xc0,0xc2])assert.deepEqual(rasterDimensions(jpeg(marker),'image/jpeg'),{width:30,height:20});
  const truncated=jpeg().slice(0,-1);assert.throws(()=>rasterDimensions(truncated,'image/jpeg'));
  assert.throws(()=>rasterDimensions(Uint8Array.from([255,216,255,224,0,0]),'image/jpeg'));
  assert.throws(()=>rasterDimensions(Uint8Array.from([255,216,255,218]),'image/jpeg'));
});
test('WebP reads simple lossy, lossless and extended canvas dimensions',()=>{
  const vp8=webp('VP8 ',[0,0,0,0x9d,1,0x2a,30,0,20,0]);
  const packed=(29|(19<<14))>>>0,lossless=[0x2f,packed&255,(packed>>>8)&255,(packed>>>16)&255,(packed>>>24)&255];
  const vp8l=webp('VP8L',lossless),vp8x=webp('VP8X',[0,0,0,0,29,0,0,19,0,0]);
  for(const bytes of [vp8,vp8l,vp8x])assert.deepEqual(rasterDimensions(bytes,'image/webp'),{width:30,height:20});
  assert.throws(()=>rasterDimensions(vp8.slice(0,-1),'image/webp'));
  const bad=Buffer.from(vp8);bad.writeUInt32LE(1000,16);assert.throws(()=>rasterDimensions(bad,'image/webp'));
});
test('declared background dimensions cannot conceal actual larger pixels',()=>{
  const value={name:'a.png',dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),width:1,height:1,opacity:1,visible:true,placement:{origin:[0,0],axis:[1,0]}};
  validateBackground(value);assert.throws(()=>validateBackground({...value,width:2}),/不一致/);
  const large=Buffer.from(png);large.writeUInt32BE(10000,16);large.writeUInt32BE(10000,20);
  assert.throws(()=>validateBackground({...value,dataUrl:'data:image/png;base64,'+large.toString('base64')}),/实际尺寸/);
});
test('random/truncated bytes and unsupported MIME fail in bounded time',()=>{
  for(const mime of ['image/png','image/jpeg','image/webp','image/svg+xml'])for(const bytes of [new Uint8Array(),new Uint8Array(64)])assert.throws(()=>rasterDimensions(bytes,mime));
});
