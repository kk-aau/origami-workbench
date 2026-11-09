import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,appendDiagramStep,updateDiagramAnnotations,updateDiagramCallouts,type DiagramProject} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramImage} from '../../src/app/diagramImages';
import {diagramDrawingFrame,diagramZoomArtwork,diagramZoomInstructionMarkup,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramPDFStepSVG,diagramPDFCoverSVG} from '../../src/app/diagramPDF';
import {diagramPDFDrawingLayout} from '../../src/app/diagramPDFDrawing';
import {diagramLibraryThumbnail} from '../../src/app/diagramLibrary';
import {diagramZoomRegionBounds,diagramZoomRegionPath,type DiagramZoomRegion} from '../../src/app/diagramZoomGeometry';
import {diagramStepZoom} from '../../src/app/diagramStepZoom';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {annotationBounds} from '../../src/app/diagramAnnotationSVG';

type Node=Record<string,unknown>;
const parser=new XMLParser({ignoreAttributes:false});
function allNodes(value:unknown):Node[]{
  if(!value||typeof value!=='object')return [];
  if(Array.isArray(value))return value.flatMap(allNodes);
  return [value as Node,...Object.values(value).flatMap(allNodes)];
}
function root(svg:string):Node {assert.equal(XMLValidator.validate(svg),true);return parser.parse(svg).svg;}
function zoomNode(svg:string):Node {const node=allNodes(root(svg)).find(item=>item['@_data-diagram-zoom']);assert.ok(node);return node;}
function viewBox(svg:string):number[]{return String(root(svg)['@_viewBox']).split(/\s+/).map(Number);}
function fittedScale(svg:string,size:{width:number;height:number}):number {const [, ,width,height]=viewBox(svg);return Math.min(size.width/width,size.height/height);}
const circle:DiagramZoomRegion={kind:'circle',center:[30,30],radius:12};
const wave:DiagramZoomRegion={kind:'wave',points:[[50,0],[45,25],[55,50],[45,75],[50,100]],side:'left',bounds:{x:0,y:0,width:100,height:100}};
function symbol(id:string,kind:DiagramSymbolAnnotation['symbol'],position:[number,number]=[30,30]):DiagramSymbolAnnotation{return {id,kind:'symbol',symbol:kind,position,size:12,rotation:0,color:'#273b31',width:.7};}
function initialProject(region:DiagramZoomRegion=circle){
  let next=0;const ids=()=>`zoom-render-${++next}`,doc=blankDoc('分步骤局部放大',100,100);
  let project=createDiagramProject(doc,ids);project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc));
  const zoom:DiagramSymbolAnnotation={...symbol('zoom-start','zoom'),zoomArea:{region,basis:{x:0,y:0,width:100,height:100}}};
  project=updateDiagramAnnotations(project,project.activeStepId,[zoom]);
  project=appendDiagramStep(project,ids);const step=project.steps[1];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc));
  return {project,ids,doc};
}
function png(){
  const crc=(bytes:Buffer)=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=n>>>1^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  const chunk=(name:string,bytes:Buffer)=>{const out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);out.write(name,4,'ascii');bytes.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

test('zoom crops paper, embedded image, instruction lines and callouts together without changing their world coordinates',()=>{
  const {project}=initialProject(),step=project.steps[1],pose=step.pose!,annotations:DiagramAnnotation[]=[
    {id:'annotation',kind:'line',a:[20,25],b:[35,25],style:'mountain',color:'#ad2765',width:.7,foldFaces:[]},
  ];
  const image:DiagramImage={id:'image',name:'三维成品',dataUrl:png(),pixelWidth:1,pixelHeight:1,position:[15,15],width:40,height:40,rotation:0,source:'simulation'};
  const callouts=[{id:'detail',source:{kind:'paper' as const,center:[25,25] as [number,number],radius:6},target:{center:[300,40] as [number,number],radius:35}}];
  const before=structuredClone({pose,annotations,image,callouts}),frame=diagramDrawingFrame(pose,annotations,undefined,[image],true,callouts,circle);
  assert.ok(frame.width<40&&frame.height<40,'distant images and insets cannot shrink the selected region');
  const svg=drawingSVG(pose,annotations,'放大后绘图','只展示圆内纸面',undefined,[image],true,undefined,callouts,undefined,{enabled:true,units:.05},circle),crop=zoomNode(svg);
  const content=JSON.stringify(crop);assert.match(content,/data-diagram-paper-face/);assert.match(content,/data:image\/png;base64/);assert.match(content,/#ad2765/);assert.match(content,/data-diagram-callout/);
  assert.equal((allNodes(crop).find(node=>node['@_stroke']==='#ad2765'))?.['@_x1'],'20','saved source coordinates are clipped, never rewritten');
  assert.doesNotMatch(content,/放大后绘图|只展示圆内纸面/,'captions remain outside the clip');
  assert.match(svg,/只展示圆内纸面<\/text>/);assert.ok(viewBox(svg)[2]<50);
  assert.deepEqual({pose,annotations,image,callouts},before);
});

test('standalone SVGs retain complete distant instruction symbols outside the paper clip without moving source coordinates',()=>{
  const {project}=initialProject(),pose=project.steps[1].pose!,outside=symbol('distant-zoom-out','zoomOut',[1200,50]),bounds=annotationBounds([outside])!;
  const svg=drawingSVG(pose,[outside],'','',undefined,[],true,undefined,[],undefined,undefined,circle),crop=zoomNode(svg),[x,y,width,height]=viewBox(svg);
  assert.doesNotMatch(JSON.stringify(crop),/translate\(1200 50\)/);
  assert.match(svg,/translate\(1200 50\)/);
  assert.ok(bounds.x>=x&&bounds.y>=y&&bounds.x+bounds.width<=x+width&&bounds.y+bounds.height<=y+height,'the viewport keeps the entire external glyph visible');
});

test('wave selection produces a real closed clipping boundary and opposite sides retain separate crop shapes',()=>{
  const {project}=initialProject(wave),step=project.steps[1],before=structuredClone(project);
  const left=drawingSVG(step.pose,[],'','',undefined,[],true,undefined,[],undefined,undefined,wave),right=drawingSVG(step.pose,[],'','',undefined,[],true,undefined,[],undefined,undefined,{...wave,side:'right'});
  for(const svg of [left,right]){root(svg);assert.equal(zoomNode(svg)['@_data-diagram-zoom'],'wave');assert.match(svg,/<clipPath[^>]+clipPathUnits="userSpaceOnUse"/);assert.match(svg,/clip-rule="evenodd"/);}
  assert.ok(left.includes(`d="${diagramZoomRegionPath(wave)}"`));assert.notEqual(left,right);assert.deepEqual(project,before);
  const first=diagramZoomArtwork('<path d="M0 0L1 1"/>',wave,'thumbnail-one'),second=diagramZoomArtwork('<path d="M0 0L1 1"/>',wave,'thumbnail-two');
  assert.notEqual(/id="([^"]+)"/.exec(first)![1],/id="([^"]+)"/.exec(second)![1],'simultaneously mounted thumbnails do not share clip IDs');
});

test('PDF panels, completion cover and library thumbnails share inherited zoom until the step after zoom-out',()=>{
  let {project,ids,doc}=initialProject();const second=project.steps[1];
  project=updateDiagramAnnotations(project,second.id,[symbol('zoom-end','zoomOut')]);
  project=updateDiagramCallouts(project,second.id,[{id:'zoom-detail',source:{kind:'paper',center:[25,25],radius:5},target:{center:[32,30],radius:6}}]);
  const snapshot=structuredClone(project);
  for(const svg of [diagramPDFStepSVG(project,project.steps[1],{width:140,height:90}),diagramPDFCoverSVG(project,project.steps[1]),diagramLibraryThumbnail(project)]){
    assert.equal(zoomNode(svg)['@_data-diagram-zoom'],'circle');assert.ok(viewBox(svg)[2]<50);assert.doesNotMatch(svg,/data-pdf-direction-symbol=/,'PDF does not reframe or detach source symbols in a crop');
  }
  assert.deepEqual(project,snapshot);
  project=appendDiagramStep(project,ids);const third=project.steps[2];project=adoptDiagramPose(project,third.id,third.beforeId,computeFlatFold(doc));
  assert.equal(diagramStepZoom(project,third.id),null);
  for(const svg of [diagramPDFStepSVG(project,project.steps[2]),diagramPDFCoverSVG(project,project.steps[2]),diagramLibraryThumbnail(project)]){assert.doesNotMatch(svg,/data-diagram-zoom=/);assert.ok(viewBox(svg)[2]>100);}
});

test('PDF places distant zoom-out and flip instructions in the crop margin without shrinking the selected drawing',()=>{
  let {project}=initialProject();const size={width:140,height:90},baseline=diagramPDFStepSVG(project,project.steps[1],size);
  project=updateDiagramAnnotations(project,project.steps[1].id,[symbol('far-direction','flip',[900,30]),symbol('far-zoom-end','zoomOut',[1200,50])]);
  const before=structuredClone(project),svg=diagramPDFStepSVG(project,project.steps[1],size),crop=zoomNode(svg);
  assert.deepEqual(viewBox(svg),viewBox(baseline),'remote direction symbols use the existing crop margin instead of expanding the physical artwork frame');
  assert.match(svg,/data-pdf-direction-symbol="flip"/);assert.match(svg,/data-pdf-direction-symbol="zoomOut"/);
  assert.doesNotMatch(JSON.stringify(crop),/translate\(900 30\)|translate\(1200 50\)/);
  const thumbnail=diagramLibraryThumbnail(project);assert.match(thumbnail,/translate\(1200 50\)/,'library thumbnails preserve the saved drawing position');
  assert.ok(viewBox(thumbnail)[2]>1000,'standalone thumbnails include the complete distant instruction instead of clipping it');
  assert.deepEqual(project,before);
});

test('half-paper wave selections actually magnify after PDF fitting in wide, square and tall panels',()=>{
  const horizontal:DiagramZoomRegion={kind:'wave',points:[[0,50],[25,45],[50,55],[75,45],[100,50]],side:'left',bounds:{x:0,y:0,width:100,height:100}};
  for(const region of [wave,{...wave,side:'right'} as DiagramZoomRegion,horizontal,{...horizontal,side:'right'} as DiagramZoomRegion]){
    const {project}=initialProject(region),plain=updateDiagramAnnotations(project,project.steps[0].id,[]);
    for(const size of [{width:180,height:80},{width:100,height:100},{width:80,height:180}]){
      const normal=diagramPDFStepSVG(plain,plain.steps[1],size),cropped=diagramPDFStepSVG(project,project.steps[1],size);
      const gain=fittedScale(cropped,size)/fittedScale(normal,size);
      assert.ok(gain>1.2,`${region.kind} ${'side' in region?region.side:''}, ${size.width}×${size.height}: actual physical scale must grow by at least 20%, got ${gain}`);
      assert.equal(zoomNode(cropped)['@_data-diagram-zoom'],'wave');
      assert.ok(cropped.includes(`d="${diagramZoomRegionPath(region)}"`),'keep the entire chosen side rather than hiding additional edges to simulate magnification');
    }
  }
});

test('zoom-out symbols outside the chosen paper area remain visible and completely inside the exported SVG frame',()=>{
  let {project,ids,doc}=initialProject(wave);const step=project.steps[1],outside=symbol('outside-zoom-out','zoomOut',[60,55]);
  project=updateDiagramAnnotations(project,step.id,[outside]);const before=structuredClone(project);
  const plain=updateDiagramAnnotations(project,project.steps[0].id,[]);
  for(const size of [{width:180,height:80},{width:100,height:100},{width:80,height:180}]){
    const svg=diagramPDFStepSVG(project,project.steps[1],size),crop=zoomNode(svg),content=JSON.stringify(crop),[x,y,width,height]=viewBox(svg);
    assert.doesNotMatch(content,/translate\(60 55\)/,'instruction symbols must not be inside the paper clip');
    assert.match(svg,/translate\(60 55\)/,'keep the instruction at its saved world position');
    const direction=allNodes(root(svg)).find(node=>node['@_data-pdf-direction-symbol']==='zoomOut');assert.ok(direction,'the external zoom-out instruction is laid out outside the paper clip');
    const transform=String(direction['@_transform']),match=/translate\(([-+\d.eE]+) ([-+\d.eE]+)\) scale\(([-+\d.eE]+)\) translate\(([-+\d.eE]+) ([-+\d.eE]+)\)/.exec(transform);assert.ok(match);
    const [cx,cy,scale,tx,ty]=match.slice(1).map(Number),sourceBounds=annotationBounds([outside])!;
    const placed={x:cx+(sourceBounds.x+tx)*scale,y:cy+(sourceBounds.y+ty)*scale,width:sourceBounds.width*scale,height:sourceBounds.height*scale};
    assert.ok(placed.x>=x-1e-8&&placed.y>=y-1e-8&&placed.x+placed.width<=x+width+1e-8&&placed.y+placed.height<=y+height+1e-8,'include all symbol strokes inside the SVG viewport');
    const normal=diagramPDFStepSVG(plain,plain.steps[1],size),gain=fittedScale(svg,size)/fittedScale(normal,size);
    assert.ok(gain>1.15,`the outside zoom-out symbol must not cancel the half-paper magnification, got ${gain}`);
  }
  assert.deepEqual(project,before);
  project=appendDiagramStep(project,ids);const next=project.steps[2];project=adoptDiagramPose(project,next.id,next.beforeId,computeFlatFold(doc));
  assert.equal(diagramStepZoom(project,next.id),null,'zoom-out becomes effective on the following step');
  assert.doesNotMatch(diagramPDFStepSVG(project,project.steps[2]),/data-diagram-zoom=/);
});

test('PDF zoom-out instructions stay legible in physical page units and use a margin without covering the selected paper',()=>{
  const horizontal:DiagramZoomRegion={kind:'wave',points:[[0,50],[25,45],[50,55],[75,45],[100,50]],side:'left',bounds:{x:0,y:0,width:100,height:100}};
  const examples:{region:DiagramZoomRegion;position:[number,number]}[]=[
    {region:wave,position:[110,55]},
    {region:{...wave,side:'right'} as DiagramZoomRegion,position:[-10,55]},
    {region:horizontal,position:[55,-10]},
    {region:{...horizontal,side:'right'} as DiagramZoomRegion,position:[55,110]},
  ];
  for(const {region,position} of examples){
    let {project}=initialProject(region);const step=project.steps[1],outside=symbol('readable-zoom-out','zoomOut',position);
    project=updateDiagramAnnotations(project,step.id,[outside]);const before=structuredClone(project),paper=diagramZoomRegionBounds(region);
    for(const size of [{width:180,height:80},{width:100,height:100},{width:80,height:180}]){
      const layout=diagramPDFDrawingLayout(step.pose!,[outside],[],size,[],[],region);assert.ok(layout);assert.equal(layout.symbols.length,1);
      const svg=diagramPDFStepSVG(project,project.steps[1],size),placed=layout.symbols[0].bounds,scale=fittedScale(svg,size);
      assert.deepEqual(viewBox(svg),[layout.frame.x,layout.frame.y,layout.frame.width,layout.frame.height]);
      assert.ok(placed.width*scale>=7,`${size.width}×${size.height}: zoom-out width must remain at least 7 pt, got ${placed.width*scale}`);
      assert.ok(Math.min(placed.width,placed.height)*scale>=6.5,'the shorter glyph dimension must also remain legible');
      assert.ok(placed.x>=layout.frame.x&&placed.y>=layout.frame.y&&placed.x+placed.width<=layout.frame.x+layout.frame.width&&placed.y+placed.height<=layout.frame.y+layout.frame.height,'the entire glyph stays in the exported viewport');
      assert.ok(placed.x+placed.width<=paper.x||placed.x>=paper.x+paper.width||placed.y+placed.height<=paper.y||placed.y>=paper.y+paper.height,'reflowed instruction glyphs occupy the margin rather than covering the selected paper');
      assert.doesNotMatch(JSON.stringify(zoomNode(svg)),/data-pdf-direction-symbol/,'paper clipping does not contain the reflowed symbol');
      assert.match(svg,/data-pdf-direction-symbol="zoomOut"/);
    }
    assert.deepEqual(project,before,'PDF margin reflow never changes the stored symbol or CP');
  }
});

test('steps awaiting a computed pose still crop their CP fallback in PDF and the library',()=>{
  let {project,ids}=initialProject();project=appendDiagramStep(project,ids);assert.equal(project.steps[2].pose,null);assert.ok(diagramStepZoom(project,project.steps[2].id));
  for(const svg of [diagramPDFStepSVG(project,project.steps[2],{width:80,height:80}),diagramPDFCoverSVG(project,project.steps[2]),diagramLibraryThumbnail(project)]){assert.equal(zoomNode(svg)['@_data-diagram-zoom'],'circle');assert.ok(viewBox(svg)[2]<50);}
});

test('adaptive line styles resample at the cropped output size and manual line patterns stay intact',()=>{
  const {project}=initialProject(),pose=project.steps[1].pose!,palette=defaultDiagramLineDefaults(),annotations:DiagramAnnotation[]=[{id:'short',kind:'line',a:[20,30],b:[23,30],style:'mountain',color:'#713467',width:.7,strokePattern:'dash-dot',foldFaces:[]}];
  const render=(enabled:boolean)=>drawingSVG(pose,annotations,'','',undefined,[],true,palette,[],undefined,{enabled,units:.1},circle);
  for(const enabled of [true,false]){const svg=render(enabled);zoomNode(svg);const line=allNodes(root(svg)).find(node=>node['@_stroke']==='#713467');assert.ok(line);assert.equal(line['@_x1'],'20');assert.equal(line['@_x2'],'23');assert.ok(String(line['@_stroke-dasharray']).split(/\s+/).length>=4);}
});

test('the source step exports a persistent circle or open wave instruction outline before zoom takes effect',()=>{
  for(const region of [circle,wave]){
    const {project}=initialProject(region),source=project.steps[0],markup=diagramZoomInstructionMarkup(source.annotations!,{x:0,y:0,width:100,height:100});
    const node=allNodes(root(`<svg>${markup}</svg>`)).find(item=>item['@_data-diagram-zoom-instruction']);assert.ok(node);assert.equal(node['@_fill'],'none');assert.equal(node['@_pointer-events'],'none');assert.equal(node['@_stroke'],'#273b31');
    const d=String(node['@_d']);if(region.kind==='wave'){assert.doesNotMatch(d,/[Zz]/);assert.equal((d.match(/L/g)??[]).length,region.points.length-1);}else assert.match(d,/[Aa]/);
    for(const svg of [diagramPDFStepSVG(project,source),drawingSVG(source.pose,source.annotations!,'','')]){assert.match(svg,/data-diagram-zoom-instruction=/);assert.doesNotMatch(svg,/data-diagram-zoom="/);}
  }
});
