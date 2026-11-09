import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement,Fragment,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';
import {defaultModelView,type ModelViewState} from '../../src/app/modelViewState';

// The assertions concern rendered controls and geometry, not the CSS loader.
const cssHook=registerHooks({load(url,context,nextLoad){
 return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);
}});
const [{default:FlatView},{default:CanvasTargetMarker}]=await Promise.all([
 import('../../src/components/FlatView'),
 import('../../src/components/CanvasTargetMarker'),
]);
cssHook.deregister();

const doc=blankDoc('目标隔离',120,80),result=computeFlatFold(doc),source={doc,graph:buildFold(doc).graph};
type FlatProps=ComponentProps<typeof FlatView>;
const props=():FlatProps=>({
 result,busy:false,stale:false,face:null,setFace:()=>{},xray:false,onRun:()=>{},source,
 vertexControls:{selection:{group:[],selected:[]},onSelect:()=>{},onMove:()=>{},disabled:false},
});
const render=(patch:Partial<FlatProps>={})=>renderToStaticMarkup(createElement(FlatView,{...props(),...patch}));
const faceShapes=(markup:string)=>markup.match(/<(?:polygon|path)\b[^>]*data-face-id="\d+"[^>]*>/g)??[];
const faceNumbers=(markup:string)=>markup.match(/<text\b[^>]*>F\d+<\/text>/g)??[];
function assertMarkerPoint(markup:string,expected:Point):void{
 const marker=markup.match(/<g\b[^>]*data-canvas-target-marker="fold"[^>]*>/)?.[0];
 assert.ok(marker,'the targeted result must render its own marker');
 const translation=marker.match(/transform="translate\(([-+\deE.]+)[,\s]+([-+\deE.]+)\)"/);
 assert.ok(translation,'the marker must be anchored in model coordinates');
 for(const [index,value] of expected.entries())assert.ok(Math.abs(Number(translation[index+1])-value)<1e-8,`marker coordinate ${index} should be ${value}, got ${translation[index+1]}`);
}
function checked(markup:string,text:string):boolean{
 const input=markup.match(new RegExp(`<input\\b([^>]*)\\/?>${text}</label>`));
 assert.ok(input,`missing checkbox: ${text}`);
 return /\bchecked(?:=|\s|$)/.test(input[1]);
}

test('CP and folded-result markers identify distinct targets without intercepting drawing gestures',()=>{
 const markup=renderToStaticMarkup(createElement('svg',null,
  createElement(CanvasTargetMarker,{point:[12,24],kind:'crease',units:2}),
  createElement(CanvasTargetMarker,{point:[70,36],kind:'fold',units:2}),
 ));
 assert.equal((markup.match(/data-canvas-target-marker=/g)??[]).length,2);
 assert.match(markup,/data-canvas-target-marker="crease"/);
 assert.match(markup,/data-canvas-target-marker="fold"/);
 assert.match(markup,/aria-label="CP 计算目标"/);
 assert.match(markup,/aria-label="平折结果操作目标"/);
 assert.match(markup,/class="canvas-target-marker canvas-target-marker-crease"/);
 assert.match(markup,/class="canvas-target-marker canvas-target-marker-fold"/);
 assert.match(markup,/transform="translate\(12 24\)"/);
 assert.match(markup,/transform="translate\(70 36\)"/);
 assert.equal((markup.match(/pointer-events="none"/g)??[]).length,2);
 const crosses=markup.match(/<path\b[^>]*>/g)??[];
 assert.equal(crosses.length,2,'each target uses one filled silhouette rather than layered strokes');
 for(const cross of crosses)assert.match(cross,/\bd="[^"]*[zZ]"/,'the medical cross must be a closed shape');
 assert.doesNotMatch(markup,/halo|vector-effect=/);
 assert.doesNotMatch(markup,/<(?:button|input)\b|tabindex=/);
});

test('two canvas results keep independent geometry while controls and target feedback follow only the chosen result',()=>{
 for(const target of ['a','b']){
  const before=structuredClone(result);
  const markup=renderToStaticMarkup(createElement(Fragment,null,...['a','b'].map((id,index)=>
   createElement('section',{'data-test-result':id,key:id},createElement(FlatView,{
    ...props(),canvasModelId:id,targeted:id===target,targetPoint:index===0?[30,20]:[100,60],sceneIndex:index,face:0,overlay:true,embedded:true,optionsOpen:true,
    initialView:{...defaultModelView(),layout:'both'},controlledView:{...defaultModelView(),layout:'four',side:index===0?'front':'back',rotation:index*90,xray:index===1,antiAlias:index===0},
   })),
  )));
  for(const id of ['a','b']){
   const part=markup.match(new RegExp(`<section data-test-result="${id}">([\\s\\S]*?)</section>`))?.[1];
   assert.ok(part,`missing result ${id}`);
   assert.match(part,new RegExp(`<div\\b[^>]*class="[^"]*flat-workspace[^"]*"[^>]*data-model-id="${id}"`));
   assert.match(part,new RegExp(`data-model-targeted="${id===target}"`));
   assert.match(part,new RegExp(`data-model-camera="${id==='a'?'front-solid-0':'back-transparent-90'}"`));
   assert.match(part,new RegExp(`data-model-render-mode="${id==='a'?'ordered':'xray'}"`));
   assert.match(part,new RegExp(`shape-rendering="${id==='a'?'geometricPrecision':'crispEdges'}"`));
   assert.equal((part.match(/data-model-render-mode=/g)??[]).length,1);
   assert.equal(faceShapes(part).length,result.geometry.faces.length);
   assert.doesNotMatch(part,/模型组合显示|data-model-pane=|模型组合工作区/);
   const exclusive=[/data-flat-computation=/,/class="embedded-model-controls"/,/class="face-map"/,/data-canvas-target-marker="fold"/];
   for(const feature of exclusive){
    if(id===target)assert.match(part,feature);
    else assert.doesNotMatch(part,feature);
   }
   if(id===target){assert.match(faceShapes(part).join(''),/fill="#d2b57b"/);assertMarkerPoint(part,id==='a'?[30,20]:[40,0]);}
   else assert.doesNotMatch(faceShapes(part).join(''),/fill="#d2b57b"/);
  }
  assert.deepEqual(result,before,'displaying or retargeting must not mutate the shared result');
 }
});

test('a clicked result marker follows front/back and rotation while camera pan and zoom preserve its model-local position',()=>{
 const targetPoint:Point=[30,20],before=structuredClone(result);
 // The fixture is a 120 x 80 rectangle. Expected positions are calculated around
 // its (60, 40) centre, independently from the production projection helper.
 const cases:[ModelViewState['side'],number,Point][]=[
  ['front',0,[30,20]],['back',0,[90,20]],
  ['front',45,[60-10/Math.SQRT2,40-50/Math.SQRT2]],
  ['back',45,[60+50/Math.SQRT2,40+10/Math.SQRT2]],
  ['front',90,[80,10]],['back',90,[80,70]],
 ];
 for(const [side,rotation,expected] of cases){
  const cameras:ModelViewState['cameras'][]=[{}, {[`${side}-solid`]:{rotation,x:350,y:-140,width:40,height:30}}];
  for(const [index,camera] of cameras.entries()){
   const markup=render({canvasModelId:'clicked',targeted:true,targetPoint,overlay:true,sceneCount:4,controlledView:{...defaultModelView(),side,rotation,cameras:camera}});
   assertMarkerPoint(markup,expected);
   if(index===1)assert.match(markup,/viewBox="350 -140 40 30"/,'the camera must actually change while the local anchor stays fixed');
  }
 }
 assert.deepEqual(targetPoint,[30,20]);
 assert.deepEqual(result,before,'view projection must not rewrite the result or the canonical clicked point');
});

test('a result without a clicked point keeps its existing centered marker under mirrored and rotated views',()=>{
 for(const [side,rotation] of [['front',0],['front',45],['back',90]] as const){
  const markup=render({canvasModelId:'legacy-centered',targeted:true,overlay:true,sceneIndex:3,sceneCount:4,controlledView:{...defaultModelView(),side,rotation}});
  assertMarkerPoint(markup,[60,40]);
 }
});

test('successful canvas results keep a compact disclosure while running and warning states retain their full explanation',()=>{
 const scene={canvasModelId:'ready-result',targeted:true,overlay:true,embedded:true};
 const ready=render(scene);
 const disclosure=ready.match(/<details\b([^>]*class="canvas-model-ready-status"[^>]*)>([\s\S]*?)<\/details>/);
 assert.ok(disclosure,'a successful canvas result should use an expandable compact status');
 assert.match(disclosure[1],/data-flat-computation="finished"/);
 assert.doesNotMatch(disclosure[1],/\bopen(?:=|\s|$)/,'the full explanation must start collapsed');
 assert.match(disclosure[2],/<summary\b[^>]*>[\s\S]*?计算完成 · 纸面已确认[\s\S]*?详情[\s\S]*?<\/summary>/);
 assert.match(disclosure[2],/<\/summary>[\s\S]*?已确认平折层序；不代表连续折叠路径无碰撞。/);
 assert.doesNotMatch(ready,/class="flat-result-label flat-computation-status/);

 const running=render({...scene,busy:true,onCancel:()=>{},progressStage:'layers'});
 assert.doesNotMatch(running,/canvas-model-ready-status/);
 assert.match(running,/class="flat-result-label flat-computation-status busy"/);
 assert.match(running,/data-flat-computation="running"/);
 assert.match(running,/计算中 · 层序求解/);
 assert.match(running,/停止计算/);
 assert.match(running,/线框是中间预览，层序确认后会自动显示纸面。/);

 const warnings:[Partial<FlatProps>,RegExp][]=[
  [{stale:true},/折痕已改变，请重新计算。/],
  [{result:{...result,layers:{status:'error',message:'纸层关系验证失败'}}},/纸层关系验证失败 当前仅为几何线框。/],
 ];
 for(const [patch,reason] of warnings){
  const warning=render({...scene,...patch});
  assert.doesNotMatch(warning,/canvas-model-ready-status/);
  assert.match(warning,/class="flat-result-label flat-computation-status warning"/);
  assert.match(warning,/data-flat-computation="finished"/);
  assert.match(warning,reason);
 }
 const standalone=render();
 assert.doesNotMatch(standalone,/canvas-model-ready-status/);
 assert.match(standalone,/class="flat-result-label flat-computation-status ready"/);
});

test('controlled wire style, anti-aliasing and shadow preference override the initial display',()=>{
 const initialView:ModelViewState={...defaultModelView(),displayStyle:'paper',antiAlias:true,shadows:false};
 const controlledView:ModelViewState={...defaultModelView(),displayStyle:'wire',antiAlias:false,shadows:true};
 const markup=render({initialView,controlledView});
 assert.match(markup,/data-model-render-mode="wire"/);
 assert.match(markup,/shape-rendering="crispEdges"/);
 assert.match(markup,/data-model-wireframe="true"/);
 assert.equal(checked(markup,'纸层阴影'),true);
 assert.equal(checked(markup,'模型抗锯齿'),false);
 assert.match(markup,/线框模式不绘制阴影/);
 const restored=render({initialView:controlledView,controlledView:initialView});
 assert.match(restored,/data-model-render-mode="ordered"/);
 assert.match(restored,/shape-rendering="geometricPrecision"/);
 assert.equal(checked(restored,'纸层阴影'),false);
 assert.equal(checked(restored,'模型抗锯齿'),true);
});

test('finished canvas disclosure preserves measured run time without inventing a duration for old results',()=>{
 const scene={canvasModelId:'timed-result',targeted:true,overlay:true,embedded:true};
 const timed=render({...scene,result:{...result,computationTimeMs:12345}});
 assert.match(timed,/<summary\b[^>]*>[\s\S]*?本次用时 12\.3 秒[\s\S]*?<\/summary>/);
 assert.doesNotMatch(timed,/class="flat-result-label flat-computation-status/);
 for(const computationTimeMs of [undefined,-1,NaN,Infinity]){
  assert.doesNotMatch(render({...scene,result:{...result,computationTimeMs}}),/本次用时/);
 }
});

test('controlled side, rotation, colors, face numbers and X-ray override conflicting initial and prop values',()=>{
 const initialView:ModelViewState={...defaultModelView(),side:'front',rotation:0,xray:false,displayNumbers:false,colors:{front:'#111111',back:'#222222',line:'#333333'}};
 const controlledView:ModelViewState={...defaultModelView(),side:'back',rotation:90,xray:true,displayNumbers:true,colors:{front:'#123456',back:'#654321',line:'#abcdef'}};
 const markup=render({initialView,controlledView,xray:false});
 assert.match(markup,/data-model-camera="back-transparent-90"/);
 assert.match(markup,/data-model-render-mode="xray"/);
 assert.equal(faceNumbers(markup).length,result.geometry.faces.length);
 assert.equal(checked(markup,'显示面编号'),true);
 for(const shape of faceShapes(markup)){
  assert.match(shape,/fill="(?:#123456|#654321)"/);
  assert.match(shape,/stroke="#abcdef"/);
  assert.match(shape,/fill-opacity="0.25"/);
 }
 const restored=render({initialView:controlledView,controlledView:initialView,xray:true});
 assert.match(restored,/data-model-camera="front-solid-0"/);
 assert.match(restored,/data-model-render-mode="ordered"/);
 assert.equal(faceNumbers(restored).length,0);
 assert.equal(checked(restored,'显示面编号'),false);
 assert.notDeepEqual(faceShapes(markup).map(shape=>shape.match(/points="([^"]*)"/)?.[1]),faceShapes(restored).map(shape=>shape.match(/points="([^"]*)"/)?.[1]),'side and rotation must reach the geometry projection');
});
