import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {drawingSVG} from '../../src/app/diagramDrawing';
import {diagramLineDasharray,defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {diagramPDFStepSVG,diagramPDFCoverSVG} from '../../src/app/diagramPDF';
import {creasePatternSVG} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,exportDiagramProject,importDiagramProject,validateDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {validateDiagramAnnotations,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramCallout} from '../../src/app/diagramCallouts';
import type {DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLinkTypes';

type XMLNode=Record<string,unknown>;
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false});
const palette=()=>defaultDiagramLineDefaults();
function nodes(value:unknown,tag:string):XMLNode[]{
  if(!value||typeof value!=='object')return [];
  if(Array.isArray(value))return value.flatMap(item=>nodes(item,tag));
  return Object.entries(value).flatMap(([key,child])=>[
    ...(key===tag?(Array.isArray(child)?child:[child]).filter(item=>item&&typeof item==='object') as XMLNode[]:[]),
    ...nodes(child,tag),
  ]);
}
const parsed=(markup:string)=>parser.parse(markup.startsWith('<svg')?markup:`<svg>${markup}</svg>`);
const lines=(markup:string)=>nodes(parsed(markup),'line');
const number=(node:XMLNode,name:string)=>Number(node['@_'+name]);
const dash=(node:XMLNode)=>String(node['@_stroke-dasharray']).split(/[\s,]+/).map(Number);
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const annotation=(style:DiagramLineAnnotation['style']='mountain',length=12,patch:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id:`short-${style}`,kind:'line',a:[20,30],b:[20+length,30],style,color:style==='mountain'?'#7a315e':'#315e7a',width:1,...patch});
const render=(pose:DiagramPose|null,annotations:DiagramLineAnnotation[],enabled:boolean,units=1,preview?:DiagramFoldPreviewSegment[],callouts:DiagramCallout[]=[])=>drawingSVG(pose,annotations,'','',preview,[],true,palette(),callouts,undefined,{enabled,units});
function readable(node:XMLNode,units:number){
  const pattern=dash(node),width=number(node,'stroke-width');assert.ok(pattern.every(Number.isFinite));assert.equal(node['@_stroke-linecap'],'round');
  assert.ok(width/units>=.65-1e-7);
  for(let i=1;i<pattern.length;i+=2)assert.ok((pattern[i]-width)/units>=.7-1e-7,'the gap remains readable after both round caps');
  for(let i=0;i<pattern.length;i+=2)assert.ok((pattern[i]+width)/units>=.65-1e-7,'short ink/dot survives at the output pixel scale');
}
function preservesPattern(node:XMLNode,source:DiagramLineAnnotation){
  const original=diagramLineDasharray(source.style,source.width,source.strokePattern)!.split(/\s+/).map(Number),actual=dash(node);
  assert.equal(actual.length,original.length);for(let i=1;i<actual.length;i++)near(actual[i]/actual[0],original[i]/original[0]);
}
function projectFixture(annotations:DiagramLineAnnotation[]){
  const doc=blankDoc('自适应输出',100,100);let id=0,project=createDiagramProject(doc,()=>`adaptive-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}),defaultModelView());
  project=updateDiagramAnnotations(project,project.activeStepId,annotations);return project;
}

test('12px teaching strokes preserve distinct full mountain/valley patterns and round-cap readable gaps',()=>{
  const authored=[annotation(),annotation('valley',12,{a:[20,40],b:[32,40]})],saved=structuredClone(authored);
  const rendered=lines(render(null,authored,true));assert.equal(rendered.length,2);
  for(let i=0;i<authored.length;i++){
    const node=rendered[i];preservesPattern(node,authored[i]);readable(node,1);assert.equal(node['@_stroke'],authored[i].color);
    assert.ok(dash(node).reduce((sum,value)=>sum+value,0)<=12+1e-7);
    near(number(node,'x1'),authored[i].a[0]);near(number(node,'x2'),authored[i].b[0]);
  }
  assert.notEqual(rendered[0]['@_stroke-dasharray'],rendered[1]['@_stroke-dasharray']);
  const mountain=dash(rendered[0]),offset=number(rendered[0],'stroke-dashoffset'),dotStart=mountain[0]+mountain[1]-offset;
  assert.ok(dotStart>=0&&dotStart+mountain[2]<=12,'at least one complete mountain dot is inside the finite line');
  assert.deepEqual(authored,saved);
});

test('explicit solid and custom paint stay authored while a 4px mountain reports its visible detail limit',()=>{
  const solid=annotation('mountain',.2,{strokePattern:'solid',color:'#a14367',width:3}),short=annotation('mountain',4,{a:[50,30],b:[54,30]});
  const output=render(null,[solid,short],true),rendered=lines(output);
  assert.equal(rendered[0]['@_stroke-dasharray'],undefined);assert.equal(rendered[0]['@_stroke'],solid.color);near(number(rendered[0],'stroke-width'),3);
  assert.equal(rendered[1]['@_stroke-dasharray'],undefined);assert.equal(rendered[1]['@_data-line-detail-limited'],'true');
  assert.match(String(rendered[1].title),/峰折.*放大/);assert.equal(rendered[1]['@_stroke'],short.color);
  assert.ok(number(rendered[1],'stroke-width')>0&&number(rendered[1],'stroke-width')<=short.width);
});

test('disabled diagram rendering is exactly the legacy markup and adds no fragment phase or display metadata',()=>{
  for(const source of [annotation(),annotation('valley'),annotation('auxiliary'),annotation('mountain',.1,{strokePattern:'solid',color:'#abc'})]){
    const legacy=diagramAnnotationMarkup(source);
    assert.equal(diagramAnnotationMarkup(source,{enabled:false,units:1,span:{length:100,offset:17}}),legacy);
    const drawing=render(null,[source],false);assert.ok(drawing.includes(legacy));assert.doesNotMatch(drawing,/data-adaptive-line|data-line-detail-limited|stroke-dashoffset/);
  }
});

test('projected folds on different layers share one dash pattern through overlaps, reversed ends and touching intervals',()=>{
  for(const style of ['valley','mountain'] as const){
    const source=annotation(style,80,{width:.7,color:'#293d35'}),assignment=style==='valley'?'V':'M';
    const pieces:DiagramFoldPreviewSegment[]=[
      {face:0,a:[20,30],b:[53,30],assignment,visibility:'visible'},
      {face:1,a:[76,30],b:[41,30],assignment,visibility:'visible'},
      {face:2,a:[76,30],b:[100,30],assignment,visibility:'visible'},
    ];
    const saved=structuredClone(pieces);
    for(const enabled of [false,true])for(const units of [.15,3]){
      const reference=lines(render(null,[source],enabled,units))[0],period=dash(reference).reduce((a,b)=>a+b);
      const independent=pieces.map((part,i)=>({...source,id:'layer-'+i,a:part.a,b:part.b,foldFaces:[part.face]}));
      for(const markup of [render(null,[],enabled,units,pieces),render(null,independent,enabled,units)]){
        const ink=lines(markup);assert.equal(ink.length,3);
        for(const [i,node] of ink.entries()){
          const start=[20,41,76][i];
          near(number(node,'x1'),start);
          assert.equal(node['@_stroke-dasharray'],reference['@_stroke-dasharray']);
          assert.equal(node['@_stroke-width'],reference['@_stroke-width']);
          near(Number(node['@_stroke-dashoffset']??0)%period,(Number(reference['@_stroke-dashoffset']??0)+start-20)%period);
        }
      }
    }
    assert.deepEqual(pieces,saved);
  }
});

test('crossings, gaps, nearby parallels and different fold appearances keep independent dash origins',()=>{
  const base=annotation('valley',15);
  const others=[
    {...base,a:[36,30],b:[50,30]}, {...base,a:[20,30.001],b:[35,30.001]},
    {...base,a:[22,26],b:[22,34]}, {...base,style:'mountain'}, {...base,color:'#000000'},
    {...base,width:2}, {...base,strokePattern:'dotted'}
  ] as DiagramLineAnnotation[];
  for(const other of others){
    const single=lines(render(null,[other],true))[0];
    assert.deepEqual(lines(render(null,[base,{...other,id:'other'}],true))[1],single);
  }
});

test('linked occlusion fragments share the full stroke pattern and phase instead of individually degrading to solid',()=>{
  const source=annotation(),pose=projectFixture([]).steps[0].pose!,fragments:DiagramFoldPreviewSegment[]=[
    {face:0,a:[20,30],b:[20.2,30],assignment:'M',visibility:'hidden',strokeSpan:{length:12,offset:0}},
    {face:0,a:[25,30],b:[25.3,30],assignment:'M',visibility:'visible',strokeSpan:{length:12,offset:5}},
    {face:0,a:[31.5,30],b:[32,30],assignment:'M',visibility:'visible',strokeSpan:{length:12,offset:11.5}},
  ],saved=structuredClone({source,pose,fragments});
  const full=lines(render(null,[source],true))[0],period=dash(full).reduce((sum,value)=>sum+value,0),rendered=lines(render(pose,[source],true,1,fragments)).filter(node=>node['@_stroke']===source.color);
  assert.equal(rendered.length,fragments.length);
  for(let i=0;i<rendered.length;i++){
    assert.equal(rendered[i]['@_stroke-dasharray'],full['@_stroke-dasharray']);assert.equal(rendered[i]['@_stroke-width'],full['@_stroke-width']);
    near(number(rendered[i],'stroke-dashoffset'),(number(full,'stroke-dashoffset')+fragments[i].strokeSpan!.offset)%period);
    assert.equal(rendered[i]['@_data-line-detail-limited'],undefined);assert.equal(rendered[i]['@_stroke'],source.color);
  }
  assert.ok(render(pose,[source],false,1,fragments).includes(diagramAnnotationMarkup({...source,a:fragments[1].a,b:fragments[1].b})));
  assert.deepEqual({source,pose,fragments},saved);validateDiagramAnnotations([source]);
});

test('standalone SVG ignores editor zoom and pan cameras when deciding its output pattern',()=>{
  const project=projectFixture([annotation()]),step=project.steps[0],pose=step.pose!,before=structuredClone(pose);
  const first=drawingSVG(pose,step.annotations!,'','',undefined,[],true,palette(),[],undefined,{enabled:true});
  const changed=structuredClone(pose);changed.view={...defaultModelView(),cameras:{'front-solid':{x:-10000,y:6000,width:20000,height:15000,rotation:81}}};
  const second=drawingSVG(changed,step.annotations!,'','',undefined,[],true,palette(),[],undefined,{enabled:true});
  assert.equal(first,second);assert.deepEqual(pose,before);
});

test('PDF resamples at the final point size: a tiny panel reports its limit and a large panel restores the full pattern',()=>{
  const source=annotation(),project=projectFixture([source]),saved=structuredClone(project),step=project.steps[0];
  const small={width:40,height:40},large={width:400,height:400};
  const smallSVG=diagramPDFStepSVG(project,step,small,palette(),true),largeSVG=diagramPDFStepSVG(project,step,large,palette(),true);
  const smallLine=lines(smallSVG).find(node=>node['@_stroke']===source.color)!,largeLine=lines(largeSVG).find(node=>node['@_stroke']===source.color)!;
  assert.equal(smallLine['@_data-line-detail-limited'],'true');assert.equal(smallLine['@_stroke-dasharray'],undefined);assert.match(String(smallLine.title),/放大/);
  const viewBox=String(parsed(largeSVG).svg['@_viewBox']).split(/\s+/).map(Number),units=Math.max(viewBox[2]/(large.width*96/72),viewBox[3]/(large.height*96/72));
  preservesPattern(largeLine,source);readable(largeLine,units);assert.equal(largeLine['@_data-line-detail-limited'],undefined);
  for(const size of [small,large])assert.ok(diagramPDFStepSVG(project,step,size,palette(),false).includes(diagramAnnotationMarkup(source)));
  const moved=structuredClone(project);moved.steps[0].pose!.view={...defaultModelView(),cameras:{'front-solid':{x:900,y:-500,width:2,height:2,rotation:12}}};
  assert.equal(diagramPDFStepSVG(moved,moved.steps[0],large,palette(),true),largeSVG);
  validateDiagramProject(project);const exported=exportDiagramProject(project);assert.doesNotMatch(exported,/strokeSpan|adaptiveLineStyle|dashOffset/);
  assert.deepEqual(importDiagramProject(exported).states,project.states);assert.deepEqual(importDiagramProject(exported).steps[0].annotations,step.annotations);
  assert.deepEqual(project,saved,'output sizing never changes states, annotations, pose coordinates or source CP');
});

test('free drawings without a pose use the final padded PDF viewBox for readable gaps near the scale threshold',()=>{
  const source=annotation(),extent=annotation('boundary',100,{id:'drawing-extent',a:[0,0],b:[100,100],strokePattern:'solid',width:.1});
  let project=createDiagramProject(blankDoc('自由注释 PDF',100,100));project=updateDiagramAnnotations(project,project.activeStepId,[source,extent]);
  const step=project.steps[0],saved=structuredClone(project);assert.equal(step.pose,null);
  for(const [size,limited] of [[{width:30,height:30},true],[{width:200,height:200},false]] as const){
    const svg=diagramPDFStepSVG(project,step,size,palette(),true),node=lines(svg).find(item=>item['@_stroke']===source.color&&number(item,'x1')===source.a[0])!;
    const viewBox=String(parsed(svg).svg['@_viewBox']).split(/\s+/).map(Number),units=Math.max(viewBox[2]/(size.width*96/72),viewBox[3]/(size.height*96/72));
    if(limited){assert.equal(node['@_data-line-detail-limited'],'true');assert.equal(node['@_stroke-dasharray'],undefined);}
    else{preservesPattern(node,source);readable(node,units);assert.equal(node['@_data-line-detail-limited'],undefined);}
    assert.ok(diagramPDFStepSVG(project,step,size,palette(),false).includes(diagramAnnotationMarkup(source)));
    near(number(node,'x1'),source.a[0]);near(number(node,'x2'),source.b[0]);
  }
  assert.deepEqual(project,saved);
});

test('CP-only cover fallback uses its final panel size and honors the explicit adaptation flag',()=>{
  const doc=blankDoc('封面 CP 最终比例',100,100);doc.segments.push({id:'tiny-mountain',a:[20,30],b:[22,30],assignment:'M',angle:-180});
  const project=createDiagramProject(doc),step=project.steps[0],saved=structuredClone(project);
  const sourceLine=(svg:string)=>lines(svg).find(node=>number(node,'x1')===20&&number(node,'y1')===30)!;
  const small={width:40,height:40},large={width:600,height:600};
  const smallSVG=diagramPDFCoverSVG(project,step,palette(),true,small),largeSVG=diagramPDFCoverSVG(project,step,palette(),true,large);
  const smallLine=sourceLine(smallSVG),largeLine=sourceLine(largeSVG);
  assert.equal(smallLine['@_stroke-dasharray'],undefined);assert.match(String(smallLine.title),/峰折.*放大/);
  assert.ok(largeLine['@_stroke-dasharray']);assert.equal(largeLine.title,undefined);
  const viewBox=String(parsed(largeSVG).svg['@_viewBox']).split(/\s+/).map(Number),units=Math.max(viewBox[2]/(large.width*96/72),viewBox[3]/(large.height*96/72)),pattern=dash(largeLine);
  assert.equal(largeLine['@_stroke-linecap'],'butt');assert.equal(pattern.length,4);assert.ok(pattern[0]>pattern[2]*3);
  for(let i=1;i<pattern.length;i+=2)assert.ok(pattern[i]/units>=.7-1e-7);
  for(let i=0;i<pattern.length;i+=2)assert.ok(pattern[i]/units>=.65-1e-7);
  assert.ok(number(largeLine,'stroke-width')/units>=.65-1e-7);
  for(const size of [small,large]){
    const svg=diagramPDFCoverSVG(project,step,palette(),false,size),box=String(parsed(svg).svg['@_viewBox']).split(/\s+/).map(Number),outputUnits=Math.max(box[2]/(size.width*96/72),box[3]/(size.height*96/72));
    const expected=sourceLine(creasePatternSVG(doc,defaultCreaseDisplay(),undefined,undefined,{enabled:false,units:outputUnits}));
    assert.deepEqual(sourceLine(svg),expected,'a disabled cover still uses its actual output pixel scale without adapting the authored pattern');
    assert.equal(sourceLine(svg).title,undefined);
  }
  assert.deepEqual(project,saved);
});

test('a real paper magnifier resamples source artwork and recovers detail lost at the main drawing scale',()=>{
  const source=annotation('mountain',4),project=projectFixture([source]),pose=project.steps[0].pose!;
  const callout:DiagramCallout={id:'recover-detail',source:{kind:'paper',center:[22,30],radius:3},target:{center:[140,40],radius:30}},saved=structuredClone({project,callout});
  const output=parsed(render(pose,[source],true,1,undefined,[callout]));
  const all=nodes(output,'line').filter(node=>node['@_stroke']===source.color);assert.equal(all.length,2);
  assert.equal(all[0]['@_data-line-detail-limited'],'true');assert.equal(all[0]['@_stroke-dasharray'],undefined);
  assert.ok(all[1]['@_stroke-dasharray']);assert.equal(all[1]['@_data-line-detail-limited'],undefined);preservesPattern(all[1],source);readable(all[1],.1);
  assert.deepEqual({project,callout},saved);
});
