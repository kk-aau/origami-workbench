import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,updateDiagramImages,updateDiagramAnnotations,exportDiagramProject,importDiagramProject,duplicateDiagramStep,adoptDiagramPose} from '../../src/app/diagramProject';
import {diagramImageBounds,diagramImageCorners,diagramImageDataInfo,diagramImageSVG,validateDiagramImages,isDiagramImageAnnotationVisible,type DiagramImage} from '../../src/app/diagramImages';
import {diagramDrawingFrame,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramPDFStepSVG,diagramPDFCoverSVG} from '../../src/app/diagramPDF';
import {createDiagramLibrary,diagramLibraryThumbnail} from '../../src/app/diagramLibrary';
import type {DiagramAnnotation} from '../../src/app/diagramAnnotations';

function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind:string,bytes:Buffer){const result=Buffer.alloc(bytes.length+12);result.writeUInt32BE(bytes.length);result.write(kind,4,'ascii');bytes.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;}
/** A valid 1px PNG with optional ancillary padding, exercising real file bytes. */
function png(padding=0){
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),...(padding?[chunk('tEXt',Buffer.concat([Buffer.from('note\0'),Buffer.alloc(padding,32)]))]:[]),chunk('IEND',Buffer.alloc(0))]).toString('base64')}`;
}
const pixel=png();
const webp='UklGRkQAAABXRUJQVlA4IDgAAAAQAwCdASoRAAsAPm0skkWkIqGYBABABsSgB2APwAAVOoAA/tDK//+YJX5Bu1D//5Z8/hs6MAAAAA==';
const jpeg='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAALABEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCtRRRXyh9YFFFFAH//2Q==';
function image(patch:Partial<DiagramImage>={}):DiagramImage{return {id:'image',name:'成品 & <展示>',dataUrl:pixel,pixelWidth:1,pixelHeight:1,position:[10,20],width:80,height:40,rotation:0,source:'file',...patch};}
function project(){let next=0;return createDiagramProject(blankDoc('图片折序',100,100),()=>`object-${++next}`);}

test('embedded images and paper visibility survive save, import and step duplication without changing any CP',()=>{
  const original=project(),before=structuredClone(original),art=image({source:'simulation'});
  const updated=updateDiagramImages(original,original.activeStepId,[art],false);art.position[0]=-77;
  assert.deepEqual(original,before);assert.deepEqual(updated.states,original.states);assert.equal(updated.steps[0].pose,null);
  assert.equal(updated.steps[0].images![0].position[0],10);assert.equal(updated.steps[0].paperVisible,false);
  const imported=importDiagramProject(exportDiagramProject(updated));assert.deepEqual(imported,updated);
  let n=0;const duplicated=duplicateDiagramStep(imported,imported.activeStepId,()=>`copy-${++n}`);
  assert.deepEqual(duplicated.steps[1].images,updated.steps[0].images);assert.equal(duplicated.steps[1].paperVisible,false);
  duplicated.steps[1].images![0].position[0]=500;assert.equal(duplicated.steps[0].images![0].position[0],10);
  const legacy=importDiagramProject(exportDiagramProject(original));assert.equal(legacy.steps[0].images,undefined);assert.equal(legacy.steps[0].paperVisible,undefined);
});

test('only bounded raster data URLs with matching actual dimensions enter an image project',()=>{
  assert.deepEqual(diagramImageDataInfo(pixel),{width:1,height:1,mime:'image/png',bytes:Buffer.from(pixel.split(',')[1],'base64').length});
  for(const dataUrl of ['https://example.com/image.png','file:///C:/image.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,PHN2Zy8+','data:image/jpeg;base64,'+pixel.split(',')[1],pixel+'\n',pixel.slice(0,-3)])assert.throws(()=>validateDiagramImages([image({dataUrl})]),/图片|PNG|JPEG|WebP/);
  for(const patch of [{pixelWidth:2},{pixelHeight:2},{width:0},{height:Infinity},{position:[NaN,0] as [number,number]},{rotation:Infinity},{id:''},{source:'remote' as 'file'}])assert.throws(()=>validateDiagramImages([image(patch)]));
  assert.throws(()=>validateDiagramImages([image(),image()]),/重复/);
  assert.throws(()=>validateDiagramImages([{...image(),url:'https://example.com'}]),/字段/);
  assert.throws(()=>validateDiagramImages([image({dataUrl:png(2*1024*1024)})]),/2 MB/);
  const corrupt=Buffer.from(pixel.split(',')[1],'base64');corrupt[45]^=0xff;
  assert.throws(()=>diagramImageDataInfo('data:image/png;base64,'+corrupt.toString('base64')),/PNG 图片数据校验失败/);
  const malformed=project() as unknown as {steps:{paperVisible?:unknown}[]};malformed.steps[0].paperVisible='false';
  assert.throws(()=>importDiagramProject(JSON.stringify(malformed)),/纸面显示/);
});

test('actual JPEG and WebP headers retain their true dimensions and cannot spoof another raster MIME',()=>{
  for(const [mime,encoded] of [['jpeg',jpeg],['webp',webp]]){
    const dataUrl=`data:image/${mime};base64,${encoded}`,info=diagramImageDataInfo(dataUrl);
    assert.equal(info.width,17);assert.equal(info.height,11);assert.equal(info.mime,`image/${mime}`);
    assert.doesNotThrow(()=>validateDiagramImages([image({dataUrl,pixelWidth:17,pixelHeight:11})]));
    assert.throws(()=>diagramImageDataInfo(`data:image/png;base64,${encoded}`),/PNG/);
  }
});

test('image projects larger than the former 8 MB limit preserve every embedded image through save and reopen',()=>{
  const original=project(),before=structuredClone(original),large=png(1_650_000);
  const images=Array.from({length:4},(_,i)=>image({id:`image-${i}`,dataUrl:large}));
  const updated=updateDiagramImages(original,original.activeStepId,images,false),text=exportDiagramProject(updated);
  assert.ok(Buffer.byteLength(text,'utf8')>8_000_000);
  assert.deepEqual(updated.steps[0].images,images);assert.deepEqual(updated.states,original.states);
  assert.deepEqual(importDiagramProject(text),updated);
  assert.deepEqual(original,before);assert.equal(original.steps[0].images,undefined);
});

test('rotated image bounds and SVG frame include all image corners and escaped display names',()=>{
  const art=image({position:[-300,400],width:80,height:40,rotation:90}),corners=diagramImageCorners(art),bounds=diagramImageBounds(art);
  assert.ok(Math.abs(bounds.minX+280)<1e-8);assert.ok(Math.abs(bounds.maxX+240)<1e-8);
  assert.ok(Math.abs(bounds.minY-380)<1e-8);assert.ok(Math.abs(bounds.maxY-460)<1e-8);
  const frame=diagramDrawingFrame(null,[],undefined,[art],false);
  for(const [x,y] of corners){assert.ok(x>=frame.x&&x<=frame.x+frame.width);assert.ok(y>=frame.y&&y<=frame.y+frame.height);}
  const svg=drawingSVG(null,[],'','',undefined,[art],false);
  assert.match(svg,/<image href="data:image\/png;base64,/);assert.match(svg,/transform="rotate\(90 -260 420\)"/);
  assert.match(svg,/成品 &amp; &lt;展示&gt;/);assert.equal(svg.includes(diagramImageSVG([art])),true);
});

test('image-primary SVG and PDF hide physical paper and linked CP while preserving ordinary overlays',()=>{
  let value=project();const step=value.steps[0];value=adoptDiagramPose(value,step.id,step.beforeId,computeFlatFold(value.states[0].doc));
  const annotations:DiagramAnnotation[]=[
    {id:'cp-existing:hidden',kind:'line',a:[-1000,-1000],b:[1000,1000],style:'crease',color:'#112233',width:1},
    {id:'physical',kind:'line',a:[-1000,50],b:[1000,50],style:'valley',color:'#223344',width:1,foldFaces:[0]},
    {id:'instruction',kind:'line',a:[20,30],b:[60,30],style:'valley',color:'#765432',width:1,foldFaces:[]},
    {id:'arrow',kind:'symbol',symbol:'fold',position:[20,30],size:10,rotation:0,color:'#c21122',width:1},
  ];
  value=updateDiagramAnnotations(value,step.id,annotations);value=updateDiagramImages(value,step.id,[image()],false);
  assert.deepEqual(annotations.map(isDiagramImageAnnotationVisible),[false,false,true,true]);
  const snapshot=structuredClone(value),drawing=diagramPDFStepSVG(value,value.steps[0]),cover=diagramPDFCoverSVG(value,value.steps[0]);
  for(const svg of [drawing,cover]){assert.match(svg,/<image href="data:image\/png;base64,/);assert.doesNotMatch(svg,/data-diagram-paper-face|#112233|#223344/);const view=svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);assert.ok(view[2]<200&&view[3]<200,'hidden CP does not enlarge the image frame');}
  assert.match(drawing,/#765432/);assert.match(drawing,/#c21122/);assert.doesNotMatch(cover,/#765432|#c21122/);assert.deepEqual(value,snapshot);
  value=updateDiagramImages(value,step.id,value.steps[0].images!,true);
  assert.match(diagramPDFStepSVG(value,value.steps[0]),/data-diagram-paper-face/);assert.deepEqual(value.states,snapshot.states);
});

test('a picture-only step exports as artwork and restores a large library preview without persisting a duplicate image',()=>{
  let value=project();value=updateDiagramImages(value,value.activeStepId,[image({dataUrl:png(125_000)})],false);
  assert.match(diagramPDFStepSVG(value,value.steps[0]),/<image href="data:image\/png;base64,/);
  assert.match(diagramPDFCoverSVG(value,value.steps[0]),/<image href="data:image\/png;base64,/);
  assert.match(diagramLibraryThumbnail(value),/<image href="data:image\/png;base64,/);
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,text:string)=>{values.set(key,text);}},library=createDiagramLibrary(storage);
  const saved=library.save(value,{kind:'saved'}),payload=JSON.parse(values.get(saved.savedKey!)!);assert.equal(payload.thumbnail,null);
  assert.match(library.getThumbnail(saved.id)!,/<image href="data:image\/png;base64,/);
  const reopened=createDiagramLibrary(storage);assert.match(reopened.getThumbnail(saved.id)!,/<image href="data:image\/png;base64,/);assert.deepEqual(reopened.load(saved.id),value);
});
