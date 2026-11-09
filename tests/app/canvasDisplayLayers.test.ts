import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement, type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {defaultDisplayLayers} from '../../src/app/displayLayers';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {getToolStep,TOOL_GUIDES,getToolPurpose} from '../../src/app/tools';

// Node's server renderer has no stylesheet loader; leave application modules intact.
const cssHook=registerHooks({load(url,context,nextLoad){
  return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);
}});
const {default:CreaseCanvas}=await import('../../src/components/CreaseCanvas');
cssHook.deregister();

function props():ComponentProps<typeof CreaseCanvas>{return {
  doc:{name:'layers',paper:{width:200,height:200},segments:[
    {id:'main-line',a:[0,0],b:[100,100],assignment:'M',angle:-180},
    {id:'aux-line',a:[0,100],b:[100,0],assignment:'A',angle:0},
  ],objects:[
    {id:'mark-object',kind:'mark',a:[20,20],b:[30,30],color:'#000000'},
    {id:'text-object',kind:'text',position:[50,50],text:'注释',fontSize:5,color:'#000000'},
  ]}, selected:new Set(),onSelect(){},onChange(){},tool:'select',preset:'M',
  grid:false,divisions:8,snap:true,lockBoundary:false,onPoint(){},onMessage(){},fitToken:0,
  measurements:{L1:0,L2:0,A1:0,A2:0,A3:0},lengthDetails:{},onMeasurement(){},
  displayLayers:defaultDisplayLayers(),onDisplayLayersChange(){},
};}

test('canvas obeys each parent-owned display layer without changing document data',()=>{
  const p=props(),before=structuredClone(p.doc);
  for(const layer of ['main','auxiliary','marks','comments'] as const){
    const html=renderToStaticMarkup(createElement(CreaseCanvas,{...p,displayLayers:{...p.displayLayers,[layer]:false}}));
    for(const [key,id] of [['main','main-line'],['auxiliary','aux-line']] as const){
      const tag=html.match(new RegExp(`<g[^>]*data-segment="${id}"[^>]*>`))?.[0];
      assert.ok(tag);assert.equal(tag.includes('visibility="hidden"'),key===layer);
    }
    assert.equal(html.includes('data-drawing-object="mark-object"'),layer!=='marks');
    assert.equal(html.includes('data-drawing-object="text-object"'),layer!=='comments');
  }
  assert.deepEqual(p.doc,before);
});

test('large grouped canvas preserves every segment in paint order with hidden auxiliaries and selection highlights',()=>{
  const p=props();p.doc.segments=Array.from({length:1203},(_,i)=>({id:`dense-${i}`,a:[0,i/10],b:[100,i/10],assignment:i%3===0?'A':'M',angle:i%3===0?0:-180}));
  p.selected=new Set(['dense-511','dense-512','dense-1023','dense-1024']);
  p.displayLayers={...p.displayLayers!,auxiliary:false};
  const before=structuredClone(p.doc),expected=p.doc.segments.map(s=>s.id);
  for(const readOnly of [false,true]){
    const html=renderToStaticMarkup(createElement(CreaseCanvas,{...p,readOnly}));
    assert.ok((html.match(/data-crease-batch=/g)??[]).length>1);
    assert.deepEqual([...html.matchAll(/data-segment="([^"]+)"/g)].map(match=>match[1]),expected);
    assert.equal((html.match(/data-crease-stroke="true"/g)??[]).length,expected.length);
    assert.equal((html.match(/data-assignment="A" visibility="hidden"/g)??[]).length,p.doc.segments.filter(s=>s.assignment==='A').length);
    for(const id of p.selected){
      const group=html.match(new RegExp(`<g[^>]*data-segment="${id}"[^>]*>[\\s\\S]*?<\\/g>`))![0];
      assert.equal((group.match(/<circle\b/g)??[]).length,2);
      assert.equal(Number(group.match(/stroke-opacity="([^"]+)"/)?.[1]),.2);
    }
  }
  assert.deepEqual(p.doc,before);
});

test('read-only preview receives the same layer settings and restoring layers restores objects',()=>{
  const p=props();
  const hidden=renderToStaticMarkup(createElement(CreaseCanvas,{...p,readOnly:true,displayLayers:{main:false,auxiliary:false,marks:false,comments:false}}));
  assert.equal((hidden.match(/data-assignment="[MA]" visibility="hidden"/g)??[]).length,2);
  assert.doesNotMatch(hidden,/data-drawing-object=/);
  const shown=renderToStaticMarkup(createElement(CreaseCanvas,{...p,readOnly:true}));
  assert.match(shown,/data-drawing-object="mark-object"/);
  assert.match(shown,/data-drawing-object="text-object"/);
  assert.doesNotMatch(shown,/data-assignment="[MA]" visibility="hidden"/);
});

test('editable and read-only canvas share the auxiliary solid/dashed display preference',()=>{
  const p=props(),before=structuredClone(p.doc);p.doc.segments[1].displayColor='#abcdef';before.segments[1].displayColor='#abcdef';
  for(const readOnly of [false,true]){
    const render=(auxLineStyle:'solid'|'dashed')=>renderToStaticMarkup(createElement(CreaseCanvas,{...p,readOnly,display:{...defaultCreaseDisplay(),auxLineStyle}}));
    const group=(html:string,id:string)=>html.match(new RegExp(`<g[^>]*data-segment="${id}"[^>]*>[\\s\\S]*?<\\/g>`))![0];
    const solid=render('solid'),dashed=render('dashed');
    assert.doesNotMatch(group(solid,'aux-line'),/stroke-dasharray=/);assert.match(group(dashed,'aux-line'),/stroke-dasharray=/);
    for(const html of [solid,dashed])assert.match(group(html,'aux-line'),/stroke="#abcdef"/);
    assert.equal(group(solid,'main-line'),group(dashed,'main-line'));
  }
  assert.deepEqual(p.doc,before);
});

test('hidden crease layers leave no passive endpoint or junction markers behind',()=>{
  const p=props();p.display={...defaultCreaseDisplay(),pointSize:3};
  const before=structuredClone(p.doc);
  const render=(main:boolean,auxiliary:boolean)=>renderToStaticMarkup(createElement(CreaseCanvas,{
    ...p,displayLayers:{...p.displayLayers,main,auxiliary},
  }));
  const shown=render(true,true);
  assert.match(shown,/data-crease-vertex="true"/);
  assert.match(shown,/data-intersection="true"/);
  assert.match(shown,/<title>交点 · 50, 50 mm<\/title>/);
  const hidden=render(false,false);
  assert.doesNotMatch(hidden,/data-crease-vertex="true"|data-intersection="true"/);
  // A shared point remains meaningful while either incident segment is visible.
  const auxiliaryOnly=render(false,true);
  assert.doesNotMatch(auxiliaryOnly,/data-crease-vertex="true"/);
  assert.match(auxiliaryOnly,/data-intersection="true"/);
  assert.match(render(true,false),/data-intersection="true"/);
  assert.equal(render(true,true),shown);
  assert.deepEqual(p.doc,before);
});

test('point controls render a single hollow or solid marker while junction targets remain transparent and keyboard selectable',()=>{
  const p=props();p.doc.segments=[
    {id:'left',a:[0,0],b:[50,0],assignment:'M',angle:-180},
    {id:'right',a:[50,0],b:[100,0],assignment:'V',angle:180},
  ];const before=structuredClone(p.doc);
  for(const pointStyle of ['hollow','circle','square'] as const)for(const pointSize of [0,3,8]){
    const html=renderToStaticMarkup(createElement(CreaseCanvas,{...p,display:{...defaultCreaseDisplay(),pointStyle,pointSize,lineWidth:8}}));
    const markers=[...html.matchAll(/<(circle|rect)\b[^>]*data-crease-vertex="true"[^>]*>/g)];
    assert.equal(markers.length,pointSize===0?0:3,'shared endpoint is painted only once');
    for(const marker of markers){assert.equal(marker[1],pointStyle==='square'?'rect':'circle');assert.doesNotMatch(marker[0],/stroke-width|stroke="#/);}
    if(pointStyle==='hollow'&&pointSize>0){
      const group=html.match(/<g pointer-events="none" fill="#fffefb" stroke="#5a7365" stroke-width="([^"]+)"/);
      assert.ok(group);const width=Number(group[1]),units=width/1.15;
      for(const marker of markers)assert.ok(Math.abs(Number(marker[0].match(/\br="([^"]+)"/)![1])+width/2-pointSize*units)<1e-12);
    }
    const junction=html.match(/<circle\b[^>]*data-intersection="true"[^>]*>/)?.[0];
    assert.ok(junction);assert.match(junction,/fill="transparent"/);assert.match(junction,/stroke="none"/);
    assert.match(junction,/role="button"/);assert.match(junction,/tabindex="0"/);assert.match(junction,/data-x="50" data-y="0"/);
    assert.equal((html.match(/fill="#fffefb" stroke="#5a7365"/g)??[]).length,pointStyle==='hollow'&&pointSize>0?1:0,'only the marker layer paints a hollow ring, never the junction targets');
  }
  assert.deepEqual(p.doc,before);
});

test('auxiliary circles and their selection highlights obey the auxiliary display layer',()=>{
  const p=props();p.doc.objects!.push({id:'test-circle',kind:'circle',center:[50,50],radius:30,color:'#367d86'});
  p.selectedCircles=new Set(['test-circle']);
  const before=structuredClone(p.doc),render=(auxiliary:boolean)=>renderToStaticMarkup(createElement(CreaseCanvas,{
    ...p,displayLayers:{...p.displayLayers,auxiliary},
  }));
  const shown=render(true);
  assert.match(shown,/data-drawing-object="test-circle" data-object-kind="circle"/);
  assert.match(shown,/data-selected-circle="test-circle"/);
  assert.match(shown,/data-circle-intersection="true"/);
  const hidden=render(false);
  assert.doesNotMatch(hidden,/data-drawing-object="test-circle"|data-selected-circle=|data-circle-intersection=/);
  assert.match(hidden,/data-drawing-object="mark-object"/);
  assert.match(hidden,/data-drawing-object="text-object"/);
  assert.deepEqual(p.doc,before);
  assert.equal(render(true),shown);
});

test('canvas starts with a short instruction and keeps complete tool help in a native disclosure',()=>{
  const p=props(),html=renderToStaticMarkup(createElement(CreaseCanvas,p));
  const disclosure=html.match(/<details[^>]*class="canvas-tool-guide"[^>]*>/)?.[0];
  assert.ok(disclosure,'complete help remains discoverable next to the current instruction');
  assert.doesNotMatch(disclosure,/\bopen(?:=|\s|>)/,'long help is collapsed by default');
  const summary=html.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0];
  assert.ok(summary);
  assert.match(summary,/pointer-events:auto/,'the disclosure can be clicked through the passive canvas overlay');
  assert.ok(summary.includes(getToolStep('select',0).instruction));
  assert.ok(summary.includes('操作说明'));
  assert.ok(html.includes(TOOL_GUIDES.select.usage));
  assert.ok(html.includes(getToolPurpose('select')));
  assert.match(html,/<kbd>Esc<\/kbd>/,'complete cancellation help is retained');
  const readOnly=renderToStaticMarkup(createElement(CreaseCanvas,{...p,readOnly:true}));
  assert.doesNotMatch(readOnly,/<details[^>]*class="canvas-tool-guide"/);
});
