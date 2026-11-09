import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {defaultDisplayLayers} from '../../src/app/displayLayers';
import {defaultDiagramCanvas} from '../../src/app/diagramProject';
import type {DiagramLineSnapResult} from '../../src/app/diagramLineSnap';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:CreaseCanvas}=await import('../../src/components/CreaseCanvas');
const {default:DiagramDrawingCanvas}=await import('../../src/components/DiagramDrawingCanvas');
const {default:DiagramLineSnapOverlay}=await import('../../src/components/DiagramLineSnapOverlay');
cssHook.deregister();

const stripHints=(html:string)=>html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/g,'').replace(/<label class="canvas-cursor-hint-toggle">[\s\S]*?<\/label>/g,'');
const checkbox=(html:string)=>html.match(/<label class="canvas-cursor-hint-toggle">([\s\S]*?)<\/label>/)?.[1];
function creaseProps():ComponentProps<typeof CreaseCanvas>{return {
 doc:{name:'悬浮提示',paper:{width:200,height:200},segments:[{id:'crease',a:[0,0],b:[100,100],assignment:'M',angle:-180}]},
 selected:new Set(['crease']),onSelect(){},onChange(){},tool:'select',preset:'M',grid:false,divisions:8,snap:true,lockBoundary:false,
 onPoint(){},onMessage(){},fitToken:0,measurements:{L1:0,L2:0,A1:0,A2:0,A3:0},lengthDetails:{},onMeasurement(){},
 displayLayers:defaultDisplayLayers(),onDisplayLayersChange(){},onCursorHintChange(){},
 segmentPresentation:new Map([['crease',{title:'山折 · 已选折痕'}]]),
};}
function diagramProps():ComponentProps<typeof DiagramDrawingCanvas>{return {
 pose:null,annotations:[{id:'ink',kind:'line',a:[10,10],b:[90,90],style:'valley',color:'#426f59',width:.7,foldFaces:[]}],
 canvas:defaultDiagramCanvas(),tool:'select',lineStyle:'valley',symbol:'fold',color:'#426f59',width:.7,selection:{group:[],selected:[]},
 onSelect(){},onMove(){},onViewChange(){},onDrawingRotationChange(){},onAnnotationsChange(){},selectedIds:['ink'],onSelectedIds(){},
 onClearSelection(){},onSymbolPlaced(){},onCancelSymbolPlacement(){},disabled:false,active:true,onCursorHintChange(){},
};}

test('crease view exposes the shared hint checkbox and hiding hints preserves selection, geometry and tool instructions',()=>{
 const props=creaseProps(),before=structuredClone(props.doc);
 const render=(showCursorHint:boolean)=>renderToStaticMarkup(createElement(CreaseCanvas,{...props,display:{...defaultCreaseDisplay(),showCursorHint}}));
 const shown=render(true),hidden=render(false);
 assert.match(checkbox(shown)!,/type="checkbox"[^>]*checked=""/);assert.doesNotMatch(checkbox(hidden)!,/checked=/);
 assert.match(checkbox(hidden)!,/悬浮提示/);assert.match(shown,/<title>山折 · 已选折痕<\/title>/);assert.doesNotMatch(hidden,/<title>/);
 assert.equal(stripHints(shown),stripHints(hidden));assert.deepEqual(props.doc,before);
 assert.match(hidden,/data-segment="crease"/);assert.match(hidden,/stroke-opacity=".2"/);assert.match(hidden,/操作说明/);
});

test('read-only crease previews do not offer a cursor hint control that cannot be used',()=>{
 const props=creaseProps();
 assert.equal(checkbox(renderToStaticMarkup(createElement(CreaseCanvas,{...props,readOnly:true}))),undefined);
 assert.equal(checkbox(renderToStaticMarkup(createElement(CreaseCanvas,{...props,onCursorHintChange:undefined}))),undefined);
});

test('diagram view shares the checkbox while hiding line hover titles retains hit areas and selected handles',()=>{
 const props=diagramProps(),before=structuredClone(props.annotations);
 const render=(showCursorHint:boolean)=>renderToStaticMarkup(createElement(DiagramDrawingCanvas,{...props,showCursorHint}));
 const shown=render(true),hidden=render(false);
 assert.match(checkbox(shown)!,/checked=""/);assert.doesNotMatch(checkbox(hidden)!,/checked=/);
 assert.match(shown,/<title>谷折线 · 放大可查看线型细节<\/title>/);assert.doesNotMatch(hidden,/<title>/);
 assert.equal(stripHints(shown),stripHints(hidden));assert.deepEqual(props.annotations,before);
 assert.match(hidden,/data-diagram-line-handle="a"/);assert.match(hidden,/stroke="transparent"/);
 const disabled=renderToStaticMarkup(createElement(DiagramDrawingCanvas,{...props,disabled:true}));
 assert.match(checkbox(disabled)!,/disabled=""/);
});

test('snap feedback can hide only its label while preserving perpendicular and bisector geometry byte for byte',()=>{
 const base:DiagramLineSnapResult={kind:'perpendicular',point:[50,0],vertex:[50,0],direction:[0,-1],referenceDirections:[[1,0]],references:[{id:'reference',a:[0,0],b:[100,0]}],label:'垂直 · 90°'};
 for(const snap of [base,{...base,kind:'bisector' as const,referenceDirections:[[1,0],[0,1]] as [number,number][],label:'角平分线'}]){
  const before=structuredClone(snap),render=(showLabel:boolean)=>renderToStaticMarkup(createElement(DiagramLineSnapOverlay,{snap,anchor:[50,30],units:.5,viewportAngle:15,showLabel}));
  const shown=render(true),hidden=render(false);
  assert.match(shown,/data-diagram-snap-label="true"/);assert.doesNotMatch(hidden,/<text\b/);
  assert.equal(shown.replace(/<g data-diagram-snap-label="true"[\s\S]*?<\/g>/,''),hidden);
  assert.match(hidden,/data-snap-endpoint="true"/);assert.match(hidden,/data-snap-reference="reference"/);assert.deepEqual(snap,before);
 }
});
