import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {computeFlatFold} from '../../src/core/flatFold';
import {exampleDoc} from '../../src/app/state';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {defaultModelColors} from '../../src/app/modelColors';
import {hasModelRegionSurface,modelRegionSurfaceIssue} from '../../src/app/modelRenderMode';
import type {ModelLayerRegion} from '../../src/app/modelRegionLayers';
import type {ModelOverlapReply} from '../../src/app/modelOverlapTask';

// Match the canvas SSR tests: Node needs no CSS to verify SVG semantics.
const cssHook=registerHooks({load(url,context,nextLoad){
 return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);
}});
const [{default:FlatView},{default:ModelComparisonPane},{TessFlatDrawing}]=await Promise.all([
 import('../../src/components/FlatView'),
 import('../../src/components/ModelComparisonPane'),
 import('../../src/components/TessFlatPane'),
]);
cssHook.deregister();

const controls={selection:{group:[],selected:[]},onSelect:()=>{},onMove:()=>{},disabled:false};
const faces=(markup:string)=>markup.match(/<polygon\b[^>]*data-face-id[^>]*>/g)??[];

test('both sides of editor and comparison stay wire until local occlusion is available',()=>{
 const result=computeFlatFold(exampleDoc());delete result.layers.faceOrder;
 for(const side of ['front','back'] as const){
  const editor=renderToStaticMarkup(createElement(FlatView,{result,busy:false,stale:false,face:null,setFace:()=>{},xray:false,onRun:()=>{},source:null,vertexControls:{...controls},overlay:true,controlledView:{side,rotation:0,xray:false,cameras:{}}}));
  const comparison=renderToStaticMarkup(createElement(ModelComparisonPane,{result,pane:{key:`${side}-solid`,side,xray:false,label:side},rotation:0,colors:defaultModelColors(),shadows:false,stale:false,onCamera:()=>{},face:null,setFace:()=>{},moving:false,editing:false,vertexControls:{...controls},onHint:()=>{}}));
  for(const markup of [editor,comparison]){
   assert.match(markup,/data-model-render-mode="wire"/);assert.match(markup,/data-model-wireframe="true"/);
   assert.equal(faces(markup).length,result.geometry.faces.length);
   for(const polygon of faces(markup)){assert.match(polygon,/fill="transparent"/);assert.match(polygon,/stroke="none"/);assert.match(polygon,/role="button"/);}
  }
 }
});

function localSurface(){
 const result=computeFlatFold(exampleDoc());delete result.layers.faceOrder;
 const analysis=modelOverlapRegions(result),regions=modelRegionLayers(result,analysis,'front'),boundaries=modelRegionBoundaries(result,regions);
 return {result,surface:{status:'complete' as const,analysis,regions,boundaries,omittedThinRegions:analysis.omittedThinRegions}};
}

test('paper and SVG gates reject partial layers, missing coverage and ambiguous contours',()=>{
 const {result,surface}=localSurface();
 assert.equal(hasModelRegionSurface(surface),true);
 const unconfirmed:ModelLayerRegion[]=[{...surface.regions[0],layers:{status:'unconfirmed',message:'仍缺少局部关系'}},...surface.regions.slice(1)];
 const partialOrder:ModelLayerRegion[]=[{...surface.regions[0],layers:{status:'ordered',topToBottom:[]}},...surface.regions.slice(1)];
 const cases:[typeof surface,RegExp][]=[
  [{...surface,regions:unconfirmed},/区域的遮挡未确认/],
  [{...surface,regions:partialOrder},/纸层顺序不完整/],
  [{...surface,omittedThinRegions:1},/细小区域.*完整覆盖尚未确认/],
  [{...surface,analysis:{...surface.analysis,omittedThinRegions:2}},/2 个细小区域/],
  [{...surface,regions:surface.regions.slice(1)},/数量与重叠分析不一致/],
  [{...surface,boundaries:{edges:[],ambiguousEdges:0}},/边界结果缺失/],
  [{...surface,boundaries:{...surface.boundaries,ambiguousEdges:2}},/2 段边界/],
 ];
 for(const [partial,reason] of cases){
  assert.equal(hasModelRegionSurface(partial),false);assert.match(modelRegionSurfaceIssue(partial)!,reason);
  const svg=foldedModelSVG(result,{name:'incomplete',side:'front',regions:partial});
  assert.match(svg,/局部遮挡未就绪/);assert.match(svg,/<line data-edge-id=/);assert.doesNotMatch(svg,/data-region-fill=/);
 }
});

test('hidden faces need an order within their own region, not an exposed top face elsewhere',()=>{
 const {surface}=localSurface();
 const region:ModelLayerRegion={...surface.regions[0],faces:[0,1],layers:{status:'ordered',topToBottom:[1,0]}};
 const data={regions:[region],boundaries:surface.boundaries,analysis:{...surface.analysis,cells:[region]}};
 assert.equal(hasModelRegionSurface(data),true);assert.equal(modelRegionSurfaceIssue(data),null);
});

test('tessellation refines coarse warm-worker surfaces and only publishes verified paper',()=>{
 const {result,surface}=localSurface();
 const draw=(reply:ModelOverlapReply)=>renderToStaticMarkup(createElement(TessFlatDrawing,{result,surface:{side:'front',reply},back:false,xray:false,fit:0,rotation:0,colors:defaultModelColors()}));
 for(const reply of [{...surface,analysis:{...surface.analysis,omittedThinRegions:1}},{...surface,boundaries:{...surface.boundaries,ambiguousEdges:1}}]){
  const markup=draw(reply);
  assert.match(markup,/data-model-render-mode="wire"/);assert.match(markup,/data-surface-status="pending"/);assert.match(markup,/data-flat-computation="running"/);assert.match(markup,/停止计算/);assert.doesNotMatch(markup,/data-region-fill=/);
 }
 const ready=draw(surface);
 assert.match(ready,/data-model-render-mode="regions"/);assert.match(ready,/data-surface-status="verified"/);assert.match(ready,/计算完成 · 纸面已确认/);assert.match(ready,/data-region-fill=/);
});

test('tessellation terminal failures end the pending state with a visible reason and wireframe',()=>{
 const {result}=localSurface();
 for(const status of ['error','cancelled','timeout'] as const){
  const markup=renderToStaticMarkup(createElement(TessFlatDrawing,{result,surface:{side:'front',reply:{status,message:'纸面验证停止原因'}},back:false,xray:false,fit:0,rotation:0,colors:defaultModelColors()}));
  assert.match(markup,/data-surface-status="unconfirmed"/);assert.match(markup,/data-model-render-mode="wire"/);assert.match(markup,/data-flat-computation="finished"/);assert.match(markup,/纸面验证停止原因/);assert.doesNotMatch(markup,/停止计算|data-region-fill=/);
 }
});

test('paused tessellation does not label unstarted surface refinement as still running',()=>{
 const {result,surface}=localSurface();
 const markup=renderToStaticMarkup(createElement(TessFlatDrawing,{result,surface:{side:'front',reply:{...surface,analysis:{...surface.analysis,omittedThinRegions:1}}},paused:true,back:false,xray:false,fit:0,rotation:0,colors:defaultModelColors()}));
 assert.match(markup,/data-surface-status="paused"/);assert.match(markup,/data-flat-computation="finished"/);assert.match(markup,/计算已暂停/);assert.doesNotMatch(markup,/data-region-fill=|停止计算|计算中/);
});

test('local surface exports contain no arbitrary whole-face underpainting on either side',()=>{
 const result=computeFlatFold(exampleDoc());delete result.layers.faceOrder;
 const analysis=modelOverlapRegions(result);
 for(const side of ['front','back'] as const){
  const pending=foldedModelSVG(result,{name:'pending',side});
  assert.match(pending,/局部遮挡未就绪/);assert.match(pending,/<line data-edge-id=/);assert.doesNotMatch(pending,/<polygon /);
  const regions=modelRegionLayers(result,analysis,side),boundaries=modelRegionBoundaries(result,regions);
  const incomplete=foldedModelSVG(result,{name:'missing edges',side,regions:{regions,omittedThinRegions:analysis.omittedThinRegions}});
  assert.match(incomplete,/局部遮挡未就绪/);assert.doesNotMatch(incomplete,/data-region-fill=/);
  const complete=foldedModelSVG(result,{name:'ready',side,regions:{regions,boundaries,omittedThinRegions:analysis.omittedThinRegions}});
  assert.match(complete,/data-region-fill=/);assert.match(complete,/data-region-boundary=/);
  assert.doesNotMatch(complete,/<polygon /);assert.doesNotMatch(complete,/data-edge-id=/);
  const xray=foldedModelSVG(result,{name:'xray',side,xray:true});assert.match(xray,/<polygon /);assert.match(xray,/fill-opacity="0.25"/);
 }
});
