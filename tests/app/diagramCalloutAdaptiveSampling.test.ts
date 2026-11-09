import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLValidator} from 'fast-xml-parser';
import {adaptiveLineStroke} from '../../src/app/adaptiveLineStyle';
import {diagramCalloutCPMarkup,diagramCalloutsSVG} from '../../src/app/diagramCalloutSVG';
import {DISPLAY_PIXEL_MM,creasePatternSVG} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {blankDoc} from '../../src/app/state';
import type {DiagramCallout} from '../../src/app/diagramCallouts';

const paper:DiagramCallout={id:'paper-detail',source:{kind:'paper',center:[1,0],radius:1},target:{center:[30,0],radius:10}};
const comparison:DiagramCallout={id:'cp-change',source:{kind:'cp',stateId:'before',center:[1,0],radius:1,locator:{center:[1,0],radius:1}},target:{center:[30,0],radius:10},comparison:{stateId:'after',target:{center:[60,0],radius:20}}};

function adaptiveArtwork(units:number){
  const stroke=adaptiveLineStroke(2,.7,'7 4',{enabled:true,units,linecap:'round'});
  return `<line data-detail-line="true" x1="0" y1="0" x2="2" y2="0" stroke="#315ebe" stroke-width="${stroke.width}" stroke-linecap="round"${stroke.dash?` stroke-dasharray="${stroke.dash}"`:''}${stroke.dashOffset===undefined?'':` stroke-dashoffset="${stroke.dashOffset}"`}/>`;
}

test('a paper inset resamples original strokes at its enlarged scale instead of copying a limited solid from the main drawing',()=>{
  const main=adaptiveArtwork(1),requested:{id:string;units:number}[]=[],before=structuredClone(paper);
  assert.doesNotMatch(main,/stroke-dasharray/);
  const inset=diagramCalloutsSVG([paper],{units:1,paperMarkup:(callout,sourceUnits)=>{requested.push({id:callout.id,units:sourceUnits});return adaptiveArtwork(sourceUnits);},cpMarkup:()=>{throw new Error('paper must not sample CP');}});
  assert.deepEqual(requested,[{id:paper.id,units:.1}]);assert.match(inset,/stroke-dasharray=/);assert.match(inset,/stroke-dashoffset=/);assert.match(inset,/scale\(10\)/);
  assert.equal(XMLValidator.validate(`<svg>${inset}</svg>`),true);assert.deepEqual(paper,before);
});

test('each paper inset independently requests its effective source pixel size while legacy static markup stays compatible',()=>{
  const other=structuredClone(paper);other.id='small-detail';other.target.radius=2;other.target.center=[80,0];
  const sizes:number[]=[],markup=diagramCalloutsSVG([paper,other],{units:2,paperMarkup:(_callout,units)=>{sizes.push(units);return adaptiveArtwork(units);},cpMarkup:()=>''});
  assert.deepEqual(sizes,[.2,1]);assert.equal((markup.match(/data-detail-line=/g)??[]).length,2);
  const staticMarkup='<line data-legacy="true" x1="0" y1="0" x2="2" y2="0" stroke-width=".65"/>';
  assert.ok(diagramCalloutsSVG([paper],{units:1,paperMarkup:staticMarkup,cpMarkup:()=>''}).includes(staticMarkup));
});

test('before and after CP circles sample their shared region with independent output scales and isolated definitions',()=>{
  const requests:{id:string;units:number|undefined}[]=[],before=structuredClone(comparison);
  const markup=diagramCalloutsSVG([comparison],{units:1,paperMarkup:()=>{throw new Error('CP must not sample paper');},cpMarkup:(id,units)=>{
    requests.push({id,units});return `<defs><path id="source" d="M 0 0 L 2 0"/></defs><use href="#source" data-state="${id}"/>${adaptiveArtwork(units!)}`;
  }});
  assert.deepEqual(requests,[{id:'before',units:.1},{id:'after',units:.05}]);assert.equal((markup.match(/stroke-dasharray=/g)??[]).length,2);
  assert.match(markup,/translate\(-1 0\)/);assert.match(markup,/操作前 CP/);assert.match(markup,/操作后 CP/);
  const ids=[...markup.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
  for(const ref of markup.matchAll(/(?:url\(#([^)]*)\)|href="#([^"]+)")/g))assert.ok(ids.includes(ref[1]??ref[2]));
  assert.deepEqual(comparison,before);
});

test('the default output pixel size is converted per target and explicit invalid scales reject before sampling',()=>{
  const sizes:number[]=[],options={paperMarkup:(_callout:DiagramCallout,units:number)=>{sizes.push(units);return '';},cpMarkup:()=>''};
  diagramCalloutsSVG([paper],options);assert.equal(sizes[0],DISPLAY_PIXEL_MM/10);
  for(const units of [0,-1,NaN,Infinity])assert.throws(()=>diagramCalloutsSVG([paper],{...options,units}),/输出比例/);
  assert.equal(sizes.length,1);
});

test('CP source markup forwards the independent enabled/units options and can reveal a previously subpixel crease',()=>{
  const doc=blankDoc('放大重采样',20,20);doc.segments.push({id:'tiny-valley',a:[5,5],b:[5.1,5],assignment:'V',angle:180});
  const display=defaultCreaseDisplay(),before=structuredClone({doc,display}),main=diagramCalloutCPMarkup(doc,display,{enabled:true,units:1}),detail=diagramCalloutCPMarkup(doc,display,{enabled:true,units:.001});
  const line=(body:string)=>body.match(/<line[^>]*x1="5" y1="5"[^>]*(?:\/>|>[\s\S]*?<\/line>)/)![0];
  assert.doesNotMatch(line(main),/stroke-dasharray/);assert.match(line(detail),/stroke-dasharray/);
  const raw=diagramCalloutCPMarkup(doc,display,{enabled:false,units:.01}),expected=creasePatternSVG(doc,display,undefined,undefined,{enabled:false,units:.01});
  assert.ok(expected.includes(raw));assert.doesNotMatch(raw,/<svg/);assert.match(line(raw),/stroke-dasharray/);assert.deepEqual({doc,display},before);
});
