import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramSymbolAnnotation,DiagramAnnotation} from '../../src/app/diagramAnnotations';
import {diagramPDFDrawingLayout} from '../../src/app/diagramPDFDrawing';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {drawingSVG} from '../../src/app/diagramDrawing';
import {annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFCellContent,DIAGRAM_PDF_LAYOUTS} from '../../src/app/diagramPDFLayout';
import {readDiagramLineDefaults} from '../../src/app/diagramLineStyles';
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramPDFExport,DiagramPDFPagePreview}=await import('../../src/components/DiagramPDFExport');cssHook.deregister();

const symbol=(id:string,kind:DiagramSymbolAnnotation['symbol'],position:[number,number],size=80):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol:kind,position,size,rotation:0,color:'#da2134',width:.8,...(kind==='rotate'||kind==='rotateCCW'?{turnAngle:35}:{})});
function fixture(){
  const doc=blankDoc('纸外方向符号排版',100,100);doc.segments.push({id:'fold',a:[0,0],b:[100,100],assignment:'V',angle:180});
  let id=0,project=createDiagramProject(doc,()=>`pdf-directions-${++id}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}),{...defaultModelView(),colors:{front:'#92b39d',back:'#f2d6a1',line:'#314c3e'}});
  return project;
}
const viewBox=(svg:string)=>svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
const paper=(svg:string)=>[...svg.matchAll(/<path\b[^>]*data-diagram-paper-face="\d+"[^>]*>/g)].map(match=>match[0]);
const inside=(outer:{x:number;y:number;width:number;height:number},inner:typeof outer)=>{
  const tolerance=1e-9;
  assert.ok(inner.x>=outer.x-tolerance&&inner.y>=outer.y-tolerance&&inner.x+inner.width<=outer.x+outer.width+tolerance&&inner.y+inner.height<=outer.y+outer.height+tolerance,JSON.stringify({outer,inner}));
};

test('adding distant view instructions leaves the PDF paper scale exactly unchanged for every selectable grid',()=>{
  const original=fixture(),step=original.steps[0],withSymbols=updateDiagramAnnotations(original,step.id,[symbol('flip','flip',[1400,-320],300),symbol('cw','rotate',[2000,50],900),symbol('ccw','rotateCCW',[-800,30],170)]),snapshot=structuredClone(withSymbols);
  for(const layout of DIAGRAM_PDF_LAYOUTS){
    const options={...defaultDiagramPDFOptions(original),cover:'none' as const,layout:layout.id},plan=planDiagramPDF(original,options),box=diagramPDFCellContent(step,plan.pages[0].cells[0],options,plan).imageRect;
    const before=diagramPDFStepSVG(original,step,box),after=diagramPDFStepSVG(withSymbols,withSymbols.steps[0],box);
    assert.equal(XMLValidator.validate(after),true);
    assert.deepEqual(viewBox(after),viewBox(before),layout.id);assert.deepEqual(paper(after),paper(before),layout.id);
    assert.equal((after.match(/data-pdf-direction-symbol=/g)??[]).length,3);assert.match(after,/35°/);
    assert.ok(Math.abs(viewBox(after)[2]/viewBox(after)[3]-box.width/box.height)<1e-12);
  }
  assert.deepEqual(withSymbols,snapshot);
});

test('PDF margin slots retain all exterior directions on their respective sides without overlapping paper or one another',()=>{
  const project=fixture(),pose=project.steps[0].pose!;
  const annotations=[symbol('left','flip',[-900,50],400),symbol('right-a','rotate',[1000,10],500),symbol('right-b','rotateCCW',[1000,90],200),symbol('top','flip',[50,-700],120),symbol('bottom','rotate',[50,900],400)];
  const layout=diagramPDFDrawingLayout(pose,annotations,[],{width:160,height:200})!;
  assert.equal(layout.main.length,0);assert.equal(layout.symbols.length,5);
  assert.deepEqual(layout.symbols.map(item=>item.side).sort(),['bottom','left','right','right','top']);
  for(const item of layout.symbols){assert.ok(item.scale>0);assert.equal(item.penWidth,item.annotation.width,'fitting an oversized direction icon must retain its readable pen width');inside(layout.frame,item.bounds);}
  const right=layout.symbols.filter(item=>item.side==='right').sort((a,b)=>a.bounds.y-b.bounds.y);
  assert.ok(right[0].bounds.y+right[0].bounds.height<right[1].bounds.y);
});

test('paper-overlapping arrows retain saved placement while ordinary SVG still includes distant source coordinates',()=>{
  const project=fixture(),pose=project.steps[0].pose!,insideArrow=symbol('inside','rotate',[60,40],25),outside=symbol('outside','flip',[1200,50],180),annotations=[insideArrow,outside];
  const layout=diagramPDFDrawingLayout(pose,annotations)!;assert.deepEqual(layout.main,[insideArrow]);assert.equal(layout.symbols.length,1);
  const next=updateDiagramAnnotations(project,project.activeStepId,annotations),pdf=diagramPDFStepSVG(next,next.steps[0]),ordinary=drawingSVG(pose,annotations,'','');
  assert.ok(viewBox(ordinary)[2]>1000);assert.ok(viewBox(pdf)[2]<200);
  assert.match(pdf,/translate\(60 40\)/);assert.match(ordinary,/translate\(1200 50\)/);
  assert.deepEqual(next.steps[0].annotations,annotations);
});

test('a direction centered outside the paper uses its margin even when its arrow overlaps or touches the paper edge',()=>{
  const project=fixture(),step=project.steps[0],pose=step.pose!,initial=symbol('near-edge','rotate',[0,0],65),bounds=annotationBounds([initial])!;
  const centered=(x:number):DiagramSymbolAnnotation=>({...initial,position:[x-bounds.x-bounds.width/2,50-bounds.y-bounds.height/2]});
  for(const annotation of [centered(101),{...initial,position:[100-bounds.x,50-bounds.y-bounds.height/2] as [number,number]}]){
    const source=annotationBounds([annotation])!;assert.ok(source.x<=100&&source.x+source.width>100);
    const layout=diagramPDFDrawingLayout(pose,[annotation])!;assert.equal(layout.symbols.length,1);assert.equal(layout.main.length,0);
    const next=updateDiagramAnnotations(project,step.id,[annotation]);assert.deepEqual(viewBox(diagramPDFStepSVG(next,next.steps[0])),viewBox(diagramPDFStepSVG(project,step)));
  }
  assert.deepEqual(diagramPDFDrawingLayout(pose,[centered(99)])!.main,[centered(99)]);
});

test('PDF preview embeds the same size-aware SVG used by the PDF page painter',()=>{
  const initial=fixture(),project=updateDiagramAnnotations(initial,initial.activeStepId,[symbol('far-cw','rotate',[2000,50],200)]),step=project.steps[0];
  const options=defaultDiagramPDFOptions(project),plan=planDiagramPDF(project,options),cell=plan.pages[0].cells[0],box=diagramPDFCellContent(step,cell,options,plan).imageRect;
  const markup=renderToStaticMarkup(createElement(DiagramPDFPagePreview,{project,options,plan,pageIndex:0,palette:readDiagramLineDefaults()}));
  const panel=markup.slice(markup.indexOf('<g data-pdf-step="1">'));
  assert.match(panel,/<svg/);assert.doesNotMatch(panel,/data:image\/svg/);
  assert.deepEqual(viewBox(panel),viewBox(diagramPDFStepSVG(project,step,box)));
  assert.deepEqual(paper(panel),paper(diagramPDFStepSVG(project,step,box)));
  assert.match(panel,/data-pdf-direction-symbol="rotate"/);
});

test('PDF dialog waits for prepared paper instead of initially exposing a transparent preview or enabled download',()=>{
  const project=fixture();project.steps[0].pose!.result.layers={status:'unknown',message:'尚未恢复层序。'};
  const markup=renderToStaticMarkup(createElement(DiagramPDFExport,{project,onClose:()=>{}}));
  assert.match(markup,/aria-busy="true"/);assert.match(markup,/正在准备步骤折图/);
  assert.doesNotMatch(markup,/data-pdf-step=/);assert.match(markup,/<button[^>]*disabled=""[^>]*>导出 PDF<\/button>/);
});

test('back-side rotated paper, normal teaching lines and source CP remain untouched by PDF-only relocation',()=>{
  const project=fixture(),step=project.steps[0];step.pose!.view={...step.pose!.view!,side:'back',rotation:37};
  const line:DiagramAnnotation={id:'teaching',kind:'line',a:[30,25],b:[75,60],style:'mountain',color:'#1646ad',width:1.2};
  const annotations=[line,symbol('outside','rotateCCW',[-1200,0],300)],next=updateDiagramAnnotations(project,step.id,annotations),snapshot=structuredClone(next);
  const svg=diagramPDFStepSVG(next,next.steps[0],{width:220,height:120});assert.match(svg,/#1646ad/);assert.match(svg,/data-pdf-direction-symbol="rotateCCW"/);
  assert.deepEqual(paper(svg),paper(diagramPDFStepSVG(project,step,{width:220,height:120})));
  assert.deepEqual(next,snapshot);assert.deepEqual(next.states,project.states);
});
