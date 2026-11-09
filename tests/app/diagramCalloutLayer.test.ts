import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {diagramCalloutLocator,type DiagramCallout} from '../../src/app/diagramCallouts';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramCalloutLayer}=await import('../../src/components/DiagramCalloutLayer');
cssHook.deregister();

const paper:DiagramCallout={id:'paper-callout',source:{kind:'paper',center:[25,25],radius:10},target:{center:[150,50],radius:30}};
const cp:DiagramCallout={id:'cp-callout',source:{kind:'cp',stateId:'after',center:[50,50],radius:20},target:{center:[150,125],radius:35}};
function render(callouts:DiagramCallout[],editable=true,selectedId?:string){return renderToStaticMarkup(createElement('svg',{},createElement(DiagramCalloutLayer,{callouts,editable,selectedId,onSelect(){},onChange(){},paperMarkup:'<path data-real-paper="true" d="M0 0H100V100H0Z" fill="white"/>',cpMarkup:stateId=>`<path data-real-cp="${stateId}" d="M0 0L100 100" stroke="red"/>`,units:.5})));}

test('paper callouts show independent source and target controls with the actual clipped drawing',()=>{
  const before=structuredClone(paper),markup=render([paper],true,paper.id);
  assert.match(markup,/data-real-paper="true"/);assert.match(markup,/clipPath/);
  assert.equal((markup.match(/data-callout-hit="paper-callout"/g)??[]).length,2);
  assert.match(markup,/aria-label="移动来源小圆 1"/);assert.match(markup,/aria-label="移动放大圆 1"/);
  assert.match(markup,/data-callout-resize="source"/);assert.match(markup,/data-callout-resize="target"/);
  assert.match(markup,/aria-label="缩放来源小圆 1"/);assert.match(markup,/aria-label="缩放放大圆 1"/);
  assert.deepEqual(paper,before);
});

test('legacy CP structure callouts show the chosen CP with independent drawing locator and target controls',()=>{
  const before=structuredClone(cp),markup=render([cp],true,cp.id);
  assert.match(markup,/data-real-cp="after"/);assert.doesNotMatch(markup,/data-real-paper/);
  assert.equal((markup.match(/data-callout-hit="cp-callout"/g)??[]).length,2);
  assert.match(markup,/data-callout-resize="target"/);assert.match(markup,/data-callout-resize="source"/);
  assert.match(markup,/aria-label="移动CP 定位小圆 1"/);assert.match(markup,/aria-label="缩放CP 定位小圆 1"/);
  const source=markup.match(/<circle\b[^>]*data-callout-part="source"[^>]*>/)![0],locator=diagramCalloutLocator(cp);
  assert.match(source,new RegExp(`cx="${locator.center[0]}" cy="${locator.center[1]}" r="${locator.radius}"`));
  assert.deepEqual(cp,before,'rendering an older project must not migrate its saved metadata');
});

test('inactive tools retain rendered circles and details while removing all interactive SVG targets',()=>{
  const markup=render([paper,cp],false,paper.id);
  assert.match(markup,/data-real-paper/);assert.match(markup,/data-real-cp/);
  assert.doesNotMatch(markup,/data-callout-hit|data-callout-resize|role="button"/);
});

test('CP comparison shows one locator and independently editable before and after circles with distinct sampled content',()=>{
  const comparison:DiagramCallout={...cp,source:{...cp.source,kind:'cp',stateId:'before',locator:{center:[25,25],radius:8}},comparison:{stateId:'after',target:{center:[150,225],radius:35}}};
  const before=structuredClone(comparison),markup=render([comparison],true,comparison.id);
  assert.equal((markup.match(/data-callout-hit="cp-callout"/g)??[]).length,3);
  assert.equal((markup.match(/data-callout-resize=/g)??[]).length,3);
  assert.match(markup,/data-callout-part="comparison"/);
  assert.match(markup,/aria-label="移动操作前 CP 放大圆 1"/);assert.match(markup,/aria-label="移动操作后 CP 放大圆 1"/);
  assert.match(markup,/data-real-cp="before"/);assert.match(markup,/data-real-cp="after"/);
  assert.match(markup,/>操作前 CP<\/text>/);assert.match(markup,/>操作后 CP<\/text>/);
  assert.deepEqual(comparison,before);
});

test('unselected circles remain selectable while only the selected callout exposes resize handles',()=>{
  const markup=render([paper,cp],true,cp.id);
  assert.equal((markup.match(/data-callout-hit=/g)??[]).length,4);
  assert.equal((markup.match(/data-callout-resize=/g)??[]).length,2);
  assert.match(markup,/data-callout-id="cp-callout"/);
  const source=markup.match(/<circle\b[^>]*data-callout-part="source"[^>]*>/)![0];
  assert.match(source,/pointer-events="stroke"/,'an unselected source circle leaves its interior drawing selectable');
  const selected=render([paper],true,paper.id).match(/<circle\b[^>]*data-callout-part="source"[^>]*>/)![0];
  assert.match(selected,/pointer-events="all"/,'a selected source circle can be dragged from its interior');
});
