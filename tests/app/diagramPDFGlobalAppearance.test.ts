import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {adoptDiagramPose,createDiagramProject,duplicateDiagramStep,updateDiagramAnnotations,updateDiagramFoldLink} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {changeGlobalDiagramLineStyle,defaultDiagramLineDefaults,DIAGRAM_LINE_DEFAULTS_KEY,type DiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramPDFStepSVG,exportDiagramPDF} from '../../src/app/diagramPDF';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {refreshDiagramFoldDrawing,reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {DiagramPDFPagePreview}=await import('../../src/components/DiagramPDFExport');cssHook.deregister();

const teachingLine=(id:string,overrides:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id,kind:'line',a:[15,25],b:[65,25],style:'valley',color:'#778899',width:.7,foldFaces:[],...overrides});
function fixture(){
  const doc=blankDoc('PDF 全局线样式',100,100);let id=0,project=createDiagramProject(doc,()=>`pdf-appearance-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  project=updateDiagramAnnotations(project,project.activeStepId,[teachingLine('ordinary'),{id:'symbol',kind:'symbol',symbol:'fold',position:[40,50],size:15,rotation:0,color:'#987654',width:1}]);
  project=duplicateDiagramStep(project,project.activeStepId,()=>`pdf-appearance-${++id}`);
  project=updateDiagramAnnotations(project,project.activeStepId,[teachingLine('local',{color:'#ff6600',appearanceOverrides:['color']})]);
  return project;
}
const palette=(color='#123456')=>changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color,width:2,strokePattern:'dotted'});
const lines=(svg:string)=>[...svg.matchAll(/<line\b[^>]*>/g)].map(m=>m[0]);

test('PDF steps share the active category appearance while local fields, symbols, CP and saved poses remain intact',()=>{
  const project=fixture(),saved=structuredClone(project),settings=palette();
  const ordinary=diagramPDFStepSVG(project,project.steps[0],{width:200,height:150},settings);
  const local=diagramPDFStepSVG(project,project.steps[1],{width:200,height:150},settings);
  assert.ok(lines(ordinary).some(line=>line.includes('stroke="#123456" stroke-width="2"')&&line.includes('stroke-dasharray="2 8"')));
  assert.ok(lines(local).some(line=>line.includes('stroke="#ff6600" stroke-width="2"')&&line.includes('stroke-dasharray="2 8"')));
  assert.ok(ordinary.includes('#987654'),'symbols keep their independent appearance');
  assert.deepEqual(project,saved,'appearance resolution must not modify CP, source assignments, coordinates, poses, or saved artwork');
});

test('PDF dialog previews use the supplied palette and respond to a new appearance snapshot',()=>{
  const project=fixture(),saved=structuredClone(project);
  const embedded=(settings:DiagramLineDefaults)=>{
    const options=defaultDiagramPDFOptions(project),plan=planDiagramPDF(project,options);
    const html=renderToStaticMarkup(createElement(DiagramPDFPagePreview,{project,options,plan,pageIndex:0,palette:settings}));
    assert.match(html,/data-pdf-step="1"/);assert.doesNotMatch(html,/data:image\/svg/);
    return html;
  };
  const before=embedded(palette('#a12345')),after=embedded(palette('#2468ac'));
  assert.ok(lines(before).some(line=>line.includes('stroke="#a12345"')));assert.ok(lines(after).some(line=>line.includes('stroke="#2468ac"')));
  assert.ok(!after.includes('#a12345'));assert.deepEqual(project,saved);
});

test('linked instruction lines and ghosted existing creases use the same PDF palette without changing their CP roles',()=>{
  const doc=blankDoc('PDF 联动线与残影',100,100);doc.segments.push({id:'existing',a:[50,0],b:[50,100],assignment:'F',angle:0});
  let id=0,project=createDiagramProject(doc,()=>`pdf-linked-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  project=updateDiagramFoldLink(project,project.activeStepId,{enabled:true,layers:'all',selectedFaces:[]});
  project=refreshDiagramFoldDrawing(project,project.activeStepId);
  const old=project.steps[0].annotations??[];
  assert.ok(old.some(annotation=>annotation.id.startsWith('cp-existing:')));
  project=reconcileDiagramFoldAnnotations(project,project.activeStepId,[...old,teachingLine('instruction',{a:[0,30],b:[100,30],foldFaces:undefined})]);
  const snapshot=structuredClone(project),settings=changeGlobalDiagramLineStyle(palette(),'crease',{color:'#235689',width:1.5,strokePattern:'dashed'});
  const svg=diagramPDFStepSVG(project,project.steps[0],undefined,settings);
  assert.match(svg,/<g opacity="0\.55"><line[^>]*stroke="#235689" stroke-width="1\.5"[^>]*stroke-dasharray="10\.5 6"/);
  assert.ok(lines(svg).some(line=>line.includes('stroke="#123456" stroke-width="2"')&&line.includes('stroke-dasharray="2 8"')));
  assert.deepEqual(project,snapshot);
  assert.ok(project.states[0].doc.segments.some(segment=>segment.id==='existing'&&segment.assignment==='F'&&segment.angle===0));
});

test('PDF bounds contain a globally widened CP projection even without a matching saved drawing line',()=>{
  const doc=blankDoc('粗已有折痕 PDF 边界',100,100);doc.segments.push({id:'existing',a:[50,0],b:[50,100],assignment:'F',angle:0});
  let id=0,project=createDiagramProject(doc,()=>`pdf-stroke-bounds-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  project=updateDiagramFoldLink(project,project.activeStepId,{enabled:true,layers:'all',selectedFaces:[]});
  const step=project.steps[0],snapshot=structuredClone(project);assert.deepEqual(step.annotations,[]);
  const settings=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'crease',{color:'#235689',width:1000,strokePattern:'solid'});
  for(const size of [undefined,{width:200,height:140}]){
    const svg=diagramPDFStepSVG(project,step,size,settings),[x,y,width,height]=svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
    const projected=lines(svg).filter(line=>line.includes('stroke="#235689"'));assert.ok(projected.length);
    for(const line of projected){
      const attr=Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]])),half=Number(attr['stroke-width'])/2;
      assert.equal(half,500,'test must exercise an actual stroke wider than the paper');
      assert.ok(x<=Math.min(Number(attr.x1),Number(attr.x2))-half&&x+width>=Math.max(Number(attr.x1),Number(attr.x2))+half,'outer PDF frame must contain round caps and the full horizontal stroke extent');
      assert.ok(y<=Math.min(Number(attr.y1),Number(attr.y2))-half&&y+height>=Math.max(Number(attr.y1),Number(attr.y2))+half,'outer PDF frame must contain the full vertical stroke extent');
    }
  }
  assert.deepEqual(project,snapshot);
});

/** Keep real page planning and SVG generation, replacing only the browser
 * native conversion/PDF boundary so asynchronous snapshot behavior is tested.
 * Actual SVG transforms, fonts and conversion are covered by the browser probe. */
function fakePDFBrowser(preferences:{getItem:(key:string)=>string|null}){
  const saved=new Map<string,PropertyDescriptor|undefined>(),blobs:Blob[]=[];
  const install=(key:string,value:unknown)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const pdf={setTitle(){},setAuthor(){},setCreator(){},setSubject(){},copyPages:async()=>[{}],addPage(){},save:async()=>new Uint8Array([37,80,68,70])};
  install('window',{desktop:{preferences},PDFLib:{PDFDocument:{create:async()=>pdf,load:async()=>pdf}}});
  install('document',{fonts:{ready:Promise.resolve()},importNode:(root:unknown)=>root,body:{append(){}}});
  install('DOMParser',class {parseFromString(markup:string){return {documentElement:{markup,style:{},getScreenCTM:()=>({}),querySelectorAll:()=>[],removeAttribute(){},remove(){}},querySelector:()=>null};}});
  install('XMLSerializer',class {serializeToString(root:{markup:string}){return root.markup;}});
  install('fetch',async (url:string,options:RequestInit)=>{assert.equal(url,'/api/export/pdf-page');blobs.push(new Blob([JSON.parse(String(options.body)).svg]));return new Response('%PDF-test',{headers:{'Content-Type':'application/pdf'}});});
  return {blobs,restore(){for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}};
}

for(const explicit of [false,true])test(`multi-page export captures its ${explicit?'supplied':'persisted'} appearance once before asynchronous page rendering`,async()=>{
  const project=fixture(),original=structuredClone(project),initial=palette('#a12345'),later=palette('#2468ac');let reads=0,stored=initial;
  const browser=fakePDFBrowser({getItem(key){assert.equal(key,DIAGRAM_LINE_DEFAULTS_KEY);reads++;return JSON.stringify({version:1,settings:stored});}});
  try{
    const options={...defaultDiagramPDFOptions(project),cover:'none' as const,layout:'1x1' as const,pageNumbers:false};
    const result=await exportDiagramPDF(project,options,done=>{if(done===1){stored=later;initial.valley.color='#eeeeee';}},explicit?initial:undefined);
    assert.equal(result.type,'application/pdf');assert.equal(reads,explicit?0:1,'nested SVG and later pages must not reread current preferences');
    const images=await Promise.all(browser.blobs.map(blob=>blob.text()));assert.equal(images.length,2);
    assert.ok(images[0].includes('#a12345'));assert.ok(images.every(svg=>!svg.includes('#2468ac')&&!svg.includes('#eeeeee')));
    assert.ok(images[1].includes('#ff6600'),'the later page retains its line-specific color override');
    assert.deepEqual(project,original);
  }finally{browser.restore();}
});

test('cancelling a vector export after one page prevents later conversion and final output',async()=>{
  const browser=fakePDFBrowser({getItem:()=>null}),controller=new AbortController(),project=fixture(),before=structuredClone(project);
  try{
    await assert.rejects(exportDiagramPDF(project,{...defaultDiagramPDFOptions(project),cover:'none',layout:'1x1'},()=>controller.abort(),palette(),{signal:controller.signal}),{name:'AbortError'});
    assert.equal(browser.blobs.length,1);assert.deepEqual(project,before);
  }finally{browser.restore();}
});
