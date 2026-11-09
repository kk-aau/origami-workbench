import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,type DiagramProject} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {drawingSVG,diagramDrawingFrame} from '../../src/app/diagramDrawing';
import {diagramDrawingRotationFrame,rotateDiagramDrawingSVG} from '../../src/app/diagramDrawingRotation';
import {rotateDiagramViewportPoint} from '../../src/app/diagramViewport';
import {diagramPDFStepSVG,diagramPDFCoverSVG} from '../../src/app/diagramPDF';
import {diagramLibraryThumbnail} from '../../src/app/diagramLibrary';
import type {DiagramZoomRegion} from '../../src/app/diagramZoomGeometry';
import {diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {applyDiagramLineAppearance,defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';

type Node=Record<string,unknown>;
const parser=new XMLParser({ignoreAttributes:false});
function nodes(value:unknown):Node[]{if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(nodes);return [value as Node,...Object.values(value).flatMap(nodes)];}
function root(svg:string):Node {assert.equal(XMLValidator.validate(svg),true);return parser.parse(svg).svg;}
const viewBox=(svg:string)=>String(root(svg)['@_viewBox']).split(/\s+/).map(Number);
const turns=(svg:string)=>nodes(root(svg)).filter(node=>node['@_data-diagram-drawing-rotation']);
const almost=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function fixture(){
  const doc=blankDoc('完整步骤朝向',160,100);let id=0,project=createDiagramProject(doc,()=>`drawing-turn-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc),defaultModelView());
  project=updateDiagramAnnotations(project,project.activeStepId,[
    {id:'ink',kind:'line',a:[120,10],b:[150,35],style:'valley',color:'#a12436',width:.02,foldFaces:[]},
    {id:'arrow',kind:'symbol',symbol:'fold',position:[135,28],size:12,rotation:5,color:'#273b31',width:.7},
  ]);
  return project;
}
function angle(project:DiagramProject,value:number):DiagramProject {const next=structuredClone(project);next.steps[0].canvas={...next.steps[0].canvas!,drawingRotation:value};return next;}

test('a saved illustration turn rotates paper, ink, symbols, images and insets together while captions stay upright',()=>{
  const project=fixture(),step=project.steps[0];
  const image={id:'photo',name:'成品',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',pixelWidth:1,pixelHeight:1,position:[180,20] as [number,number],width:30,height:20,rotation:12,source:'file' as const};
  const callouts=[{id:'detail',source:{kind:'paper' as const,center:[35,30] as [number,number],radius:10},target:{center:[220,100] as [number,number],radius:22}}];
  const before=structuredClone({step,image,callouts}),svg=drawingSVG(step.pose,step.annotations!,'标题保持正向','说明保持正向',undefined,[image],true,undefined,callouts,undefined,undefined,undefined,90),turn=turns(svg);
  assert.equal(turn.length,1);assert.equal(turn[0]['@_data-diagram-drawing-rotation'],'90');
  const content=JSON.stringify(turn[0]);for(const marker of ['data-diagram-paper-face','#a12436','translate(135 28)','data:image/png;base64','data-diagram-callout'])assert.ok(content.includes(marker),marker);
  assert.doesNotMatch(content,/标题保持正向|说明保持正向/);
  const texts=Array.isArray(root(svg).text)?root(svg).text as Node[]:[root(svg).text as Node];
  assert.deepEqual(texts.map(node=>node['#text']),['标题保持正向','说明保持正向']);
  assert.deepEqual({step,image,callouts},before);
});

test('zero keeps legacy markup and rotated bounds encompass every source frame corner at arbitrary angles',()=>{
  const project=fixture(),step=project.steps[0],source=diagramDrawingFrame(step.pose,step.annotations!);
  const plain=drawingSVG(step.pose,step.annotations!,'','');assert.equal(plain,drawingSVG(step.pose,step.annotations!,'','',undefined,[],true,undefined,[],undefined,undefined,undefined,0));
  for(const degrees of [-180,-37,45,90]){
    const svg=drawingSVG(step.pose,step.annotations!,'','',undefined,[],true,undefined,[],undefined,undefined,undefined,degrees),[x,y,width,height]=viewBox(svg),center:[number,number]=[source.x+source.width/2,source.y+source.height/2];
    for(const point of [[source.x,source.y],[source.x+source.width,source.y],[source.x,source.y+source.height],[source.x+source.width,source.y+source.height]] as [number,number][]){const [px,py]=rotateDiagramViewportPoint(point,center,degrees);assert.ok(px>=x-1e-9&&px<=x+width+1e-9&&py>=y-1e-9&&py<=y+height+1e-9);}
    const expected=diagramDrawingRotationFrame(source,degrees);almost(width,expected.width);almost(height,expected.height);
  }
});

test('PDF turns the margin direction glyph and the main drawing in a single group and retains panel fit',()=>{
  const project=fixture(),step=project.steps[0];
  const withDirection=updateDiagramAnnotations(project,step.id,[...step.annotations!,{id:'outside',kind:'symbol',symbol:'rotate',position:[1200,50],size:200,rotation:0,color:'#df3344',width:.8,turnAngle:35}]);
  const size={width:140,height:220},changed=angle(withDirection,90),svg=diagramPDFStepSVG(changed,changed.steps[0],size),turn=turns(svg);
  assert.equal(turn.length,1);assert.match(JSON.stringify(turn[0]),/data-pdf-main-artwork/);assert.match(JSON.stringify(turn[0]),/data-pdf-direction-symbol/);assert.match(svg,/35°/);
  const [, ,width,height]=viewBox(svg);almost(width/height,size.width/size.height);almost(Number(root(svg)['@_width']),width);almost(Number(root(svg)['@_height']),height);
  assert.equal(turns(diagramPDFStepSVG(withDirection,withDirection.steps[0],size)).length,0);
});

test('cover and library previews share the saved orientation, including CP-only fallbacks',()=>{
  const project=fixture(),changed=angle(project,90);
  for(const render of [(p:DiagramProject)=>diagramPDFCoverSVG(p,p.steps[0]),diagramLibraryThumbnail]){
    const plain=render(project),turned=render(changed);assert.equal(turns(turned).length,1);const a=viewBox(plain),b=viewBox(turned);almost(a[2],b[3]);almost(a[3],b[2]);
  }
  const fallback=structuredClone(project);fallback.steps[0].pose=null;fallback.steps[0].annotations=[];
  for(const render of [(p:DiagramProject)=>diagramPDFStepSVG(p,p.steps[0]),(p:DiagramProject)=>diagramPDFCoverSVG(p,p.steps[0]),diagramLibraryThumbnail]){
    const plain=render(fallback),turned=render(angle(fallback,90)),a=viewBox(plain),b=viewBox(turned);assert.equal(turns(turned).length,1);almost(a[2],b[3]);almost(a[3],b[2]);
  }
});

test('image-only and cropped drawings rotate outside the crop without rotating the source or losing exterior glyphs',()=>{
  const project=fixture(),step=project.steps[0],zoom:DiagramZoomRegion={kind:'circle',center:[35,25],radius:20};
  const outside={id:'outside',kind:'symbol' as const,symbol:'zoomOut' as const,position:[230,30] as [number,number],size:12,rotation:0,color:'#334433',width:.7};
  const svg=drawingSVG(step.pose,[...step.annotations!,outside],'','',undefined,[],true,undefined,[],undefined,undefined,zoom,-45),turn=turns(svg)[0];
  assert.ok(turn);assert.match(JSON.stringify(turn),/data-diagram-zoom/);assert.match(JSON.stringify(turn),/translate\(230 30\)/);
  assert.equal(nodes(turn).filter(node=>node['@_data-diagram-zoom']).length,1);
  const imageProject=angle(project,90);imageProject.steps[0].paperVisible=false;const imageSVG=diagramPDFStepSVG(imageProject,imageProject.steps[0]);assert.equal(turns(imageSVG).length,1);assert.doesNotMatch(imageSVG,/data-diagram-paper-face/);
});

test('complete SVG rotation preserves unturned markup and rejects invalid exported frames',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><path d="M0 0L160 0L160 100Z"/></svg>';
  assert.equal(rotateDiagramDrawingSVG(svg,0),svg);const [, ,width,height]=viewBox(rotateDiagramDrawingSVG(svg,90));almost(width,100);almost(height,160);
  assert.throws(()=>rotateDiagramDrawingSVG('<svg/>',90));assert.throws(()=>rotateDiagramDrawingSVG(svg,NaN));
});

test('adaptive ink in SVG and PDF uses the final rotated output scale rather than the original axes',()=>{
  const project=fixture(),size={width:27,height:58},palette=defaultDiagramLineDefaults(),line=project.steps[0].annotations![0];assert.equal(line.kind,'line');
  for(const degrees of [0,37,90]){
    const changed=angle(project,degrees),step=changed.steps[0],pdf=diagramPDFStepSVG(changed,step,size,palette,true),[, ,width,height]=viewBox(pdf),units=Math.max(width/(size.width*96/72),height/(size.height*96/72));
    assert.ok(pdf.includes(diagramAnnotationMarkup(applyDiagramLineAppearance(line,palette),{enabled:true,units})),`PDF ${degrees}°`);
    const svg=drawingSVG(step.pose,step.annotations!,'','',undefined,[],true,palette,[],undefined,{enabled:true},undefined,degrees),[, ,svgWidth,svgHeight]=viewBox(svg);
    assert.ok(svg.includes(diagramAnnotationMarkup(applyDiagramLineAppearance(line,palette),{enabled:true,units:Math.max(svgWidth/1200,svgHeight/900)})),`SVG ${degrees}°`);
  }
});
