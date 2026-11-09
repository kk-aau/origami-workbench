import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagramImageImportSize,prepareDiagramImage,DIAGRAM_IMAGE_SOURCE_MAX_BYTES} from '../../src/app/diagramImageImport';

const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const capture=(dataUrl:string)=>({dataUrl,name:'模拟截图',source:'simulation' as const});

test('source sizing preserves aspect ratio without upscaling and refuses decoder-sized pixel bombs',()=>{
  assert.deepEqual(diagramImageImportSize(4000,2000),{width:1600,height:800});
  assert.deepEqual(diagramImageImportSize(1200,3600),{width:533,height:1600});
  assert.deepEqual(diagramImageImportSize(17,11),{width:17,height:11});
  assert.deepEqual(diagramImageImportSize(8000,4000),{width:1600,height:800});
  for(const [width,height] of [[8193,1],[8192,4096],[0,100],[20.5,100],[Infinity,1]])assert.throws(()=>diagramImageImportSize(width,height),/像素尺寸/);
});

test('unsafe captures, MIME spoofing and excessive source bytes reject before allocating a browser decoder',async()=>{
  for(const dataUrl of ['https://example.com/picture.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,PHN2Zy8+',`data:image/webp;base64,${pixel}`])await assert.rejects(prepareDiagramImage(capture(dataUrl)),/图片|PNG|WebP/);
  await assert.rejects(prepareDiagramImage(capture('data:image/png;base64,'+'A'.repeat(Math.ceil(DIAGRAM_IMAGE_SOURCE_MAX_BYTES/3)*4+100))),/32 MB/);
  const huge=Buffer.from(pixel,'base64');huge.writeUInt32BE(8193,16);
  await assert.rejects(prepareDiagramImage(capture(`data:image/png;base64,${huge.toString('base64')}`)),/像素尺寸|PNG 图片数据校验失败/);
});

test('pre-aborted preparation exits as AbortError before reading or decoding a valid image',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(prepareDiagramImage(capture(`data:image/png;base64,${pixel}`),controller.signal),{name:'AbortError'});
});
