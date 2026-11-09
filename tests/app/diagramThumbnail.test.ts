import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,type DiagramProject} from '../../src/app/diagramProject';
import {diagramThumbnailSVG} from '../../src/app/diagramThumbnail';
import {defaultDiagramLineDefaults,applyDiagramLineAppearance} from '../../src/app/diagramLineStyles';
import {diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {defaultModelView} from '../../src/app/modelViewState';
import type {DiagramZoomRegion} from '../../src/app/diagramZoomGeometry';
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramThumbnail}=await import('../../src/components/DiagramThumbnail');cssHook.deregister();

type Node=Record<string,unknown>;
const parser=new XMLParser({ignoreAttributes:false}),palette=defaultDiagramLineDefaults();
const allNodes=(value:unknown):Node[]=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(allNodes):[value as Node,...Object.values(value).flatMap(allNodes)];
function parsed(svg:string):Node {assert.equal(XMLValidator.validate(svg),true);return parser.parse(svg).svg;}
function fixture(){
  const doc=blankDoc('缩略图与正式绘图一致',100,100);let id=0,project=createDiagramProject(doc,()=>`thumbnail-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc));return project;
}
const render=(project:DiagramProject,zoom?:DiagramZoomRegion)=>diagramThumbnailSVG(project.steps[0],project.states,{lineDefaults:palette,adaptiveLines:true,zoom});
const component=(project:DiagramProject,zoom?:DiagramZoomRegion)=>createElement(DiagramThumbnail,{step:project.steps[0],states:project.states,lineDefaults:palette,adaptiveLines:true,zoom});

test('hidden physical paper excludes its bound ink from the thumbnail while unbound artwork remains',()=>{
  let project=fixture();project=updateDiagramAnnotations(project,project.activeStepId,[
    {id:'bound',kind:'line',style:'auxiliary',a:[5,20],b:[95,80],foldFaces:[0],color:'#df3344',width:1},
    {id:'unbound',kind:'line',style:'auxiliary',a:[20,5],b:[80,95],foldFaces:[],color:'#137a55',width:1},
    {id:'symbol',kind:'symbol',symbol:'filledReferencePoint',position:[30,40],size:4,rotation:0,color:'#2b397b',width:.7},
  ]);project.steps[0].pose!.hiddenFaces=[0];const before=structuredClone(project),svg=render(project);
  parsed(svg);assert.doesNotMatch(svg,/#df3344|data-diagram-paper-face=/);assert.match(svg,/#137a55/);assert.match(svg,/#2b397b/);assert.deepEqual(project,before);
  assert.doesNotMatch(renderToStaticMarkup(component(project)),/#df3344/);
});

test('circle and wave crops retain exterior action symbols outside the paper clip in real inline thumbnails',()=>{
  let project=fixture();project=updateDiagramAnnotations(project,project.activeStepId,[{id:'out',kind:'symbol',symbol:'zoomOut',position:[120,30],size:16,rotation:0,color:'#df3344',width:.7}]);
  const regions:DiagramZoomRegion[]=[{kind:'circle',center:[30,30],radius:20},{kind:'wave',points:[[50,0],[45,50],[50,100]],side:'left',bounds:{x:0,y:0,width:100,height:100}}];
  for(const region of regions){
    const markup=renderToStaticMarkup(component(project,region)),root=parsed(markup),crop=allNodes(root).find(node=>node['@_data-diagram-zoom']);assert.ok(crop);
    assert.doesNotMatch(JSON.stringify(crop),/#df3344|translate\(120 30\)/);assert.match(markup,/#df3344/);assert.match(markup,/translate\(120 30\)/);
    const [, ,width]=String(root['@_viewBox']).split(/\s+/).map(Number);assert.ok(width>110,'the frame retains the exterior symbol instead of cropping its bounds');
  }
});

test('local cyclic layer surfaces stay opaque without inventing a whole-face ordering',()=>{
  const project=fixture(),polygons:Point[][]=[[[0,0],[10,0],[10,2],[0,2]],[[8,0],[10,0],[10,10],[8,10]],[[0,2],[8,10],[10,10],[10,8],[2,0],[0,0]]],vertices:Point[]=[],faces=polygons.map(polygon=>polygon.map(point=>vertices.push(point)-1));
  const result:FlatFoldResult={geometry:{status:'ready',message:'local cycle',vertices,faces},layers:{status:'solved',message:'local',faceOrders:[[0,1,-1],[1,2,1],[2,0,-1]]},warnings:[]};
  project.steps[0].pose!.result=result;delete project.steps[0].pose!.displayOrder;project.steps[0].pose!.view={...defaultModelView(),colors:{front:'#123456',back:'#fedcba',line:'#334455'}};
  const before=structuredClone(project),svg=render(project);parsed(svg);assert.match(svg,/data-model-region-surface="true"/);assert.match(svg,/fill="#123456"/);assert.match(svg,/fill="#fedcba"/);assert.doesNotMatch(svg,/fill-opacity="0\.09"/);assert.deepEqual(project,before);
});

test('images, paper and CP details and saved whole-drawing rotation remain in the same thumbnail artwork',()=>{
  const project=fixture(),step=project.steps[0];step.canvas!.drawingRotation=90;
  step.images=[{id:'photo',name:'三维成品',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',pixelWidth:1,pixelHeight:1,position:[110,15],width:30,height:20,rotation:12,source:'simulation'}];
  step.callouts=[{id:'paper',source:{kind:'paper',center:[35,30],radius:10},target:{center:[180,30],radius:24}},{id:'cp',source:{kind:'cp',stateId:step.beforeId,center:[40,40],radius:12},target:{center:[180,100],radius:24}}];
  const svg=render(project),turn=allNodes(parsed(svg)).find(node=>node['@_data-diagram-drawing-rotation']==='90');assert.ok(turn);
  const content=JSON.stringify(turn);for(const marker of ['data-diagram-paper-face','data:image/png;base64','data-diagram-callout','paper','cp'])assert.ok(content.includes(marker),marker);
  step.paperVisible=false;const imageOnly=render(project);parsed(imageOnly);assert.match(imageOnly,/data:image\/png;base64/);assert.doesNotMatch(imageOnly,/data-diagram-paper-face/);assert.match(imageOnly,/data-diagram-drawing-rotation="90"/);
});

test('linked CP previews follow formal occlusion, while a stale snapshot retains its independent authored ink',()=>{
  const project=fixture(),step=project.steps[0],before=project.states[0],after=project.states[1];
  step.foldLink={enabled:true,layers:'all',selectedFaces:[]};after.doc.segments.push({id:'new-v',a:[50,0],b:[50,100],assignment:'V',angle:180});
  step.annotations=[{id:'authored',kind:'line',a:[50,0],b:[50,100],style:'valley',color:'#a12436',width:.7,foldFaces:[0]}];
  const svg=render(project),ink=allNodes(parsed(svg)).filter(node=>node['@_stroke']==='#a12436'&&node['@_x1']==='50');assert.equal(ink.length,1,'the CP preview replaces its source annotation exactly once');
  before.revision++;const stale=render(project);parsed(stale);assert.match(stale,/#a12436/);assert.equal(step.pose!.sourceRevision,0);
});

test('simultaneous inline thumbnails namespace every crop, local surface and inset reference',()=>{
  const project=fixture(),step=project.steps[0];step.callouts=[{id:'detail',source:{kind:'paper',center:[35,30],radius:10},target:{center:[150,50],radius:25}}];
  const zoom:DiagramZoomRegion={kind:'circle',center:[30,30],radius:20};
  const markup=renderToStaticMarkup(createElement('div',null,component(project,zoom),component(project,zoom))),ids=[...markup.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(ids.length>2);assert.equal(new Set(ids).size,ids.length);
  for(const match of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(match[1]),`unresolved reference ${match[1]}`);
});

test('thumbnail output uses its actual rotated pixel scale while pending and failed analysis remain explicit',()=>{
  let project=fixture();project=updateDiagramAnnotations(project,project.activeStepId,[{id:'thin',kind:'line',a:[20,30],b:[40,30],style:'mountain',color:'#7a315e',width:1}]);project.steps[0].canvas!.drawingRotation=37;
  const svg=render(project),values=String(parsed(svg)['@_viewBox']).split(/\s+/).map(Number),line=project.steps[0].annotations![0];assert.equal(line.kind,'line');
  assert.ok(svg.includes(diagramAnnotationMarkup(applyDiagramLineAppearance(line,palette),{enabled:true,units:Math.max(values[2]/128,values[3]/96)})));
  for(const pending of [true,false]){const markup=renderToStaticMarkup(createElement(DiagramThumbnail,{step:project.steps[0],states:project.states,lineDefaults:palette,adaptiveLines:true,preparation:{pending,message:'详细失败原因'}}));assert.match(markup,pending?/正在准备折图/:/层序待确认/);assert.match(markup,/详细失败原因/);assert.doesNotMatch(markup,/aria-label="本步骤折图缩略图"|data-diagram-paper-face/);}
});
