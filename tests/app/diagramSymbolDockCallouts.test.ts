import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {DIAGRAM_SYMBOL_KINDS,type DiagramSymbolKind} from '../../src/app/diagramAnnotations';
import {CALLOUT_MIME,DIAGRAM_CALLOUT_SYMBOLS,isDiagramCalloutSymbolType} from '../../src/app/diagramCalloutSymbols';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramSymbolDock}=await import('../../src/components/DiagramSymbolDock');
cssHook.deregister();
const render=(selectedSymbol:DiagramSymbolKind='zoom',disabled=false)=>renderToStaticMarkup(createElement(DiagramSymbolDock,{selectedSymbol,disabled,placing:false,symbolSelected:false,onChoose(){},onChooseCallout(){}}));

test('view and direction contains both real callout entries and the unchanged zoom arrows, with 38 available symbols',()=>{
  const markup=render();
  assert.match(markup,/role="group" aria-label="折纸符号分类"/);
  assert.match(markup,/<button[^>]*aria-pressed="true"[^>]*>视图与方向<\/button>/);
  for(const group of new Set(SYMBOL_CATALOG.map(item=>item.group)))assert.ok(markup.includes('>'+group+'</button>'));
  assert.match(markup,/role="group" aria-label="视图与方向符号"/);
  assert.match(markup,/data-callout-symbol="paper"/);assert.match(markup,/data-callout-symbol="cp"/);
  assert.match(markup,/aria-label="创建局部放大框符号"/);assert.match(markup,/aria-label="创建CP结构放大框符号"/);
  assert.match(markup,/aria-label="放置局部放大符号"/);assert.match(markup,/aria-label="放置缩小视图符号"/);
  assert.equal((markup.match(/data-diagram-callout-symbol-preview=/g)??[]).length,2);
  assert.equal(SYMBOL_CATALOG.length,36);assert.equal(DIAGRAM_SYMBOL_KINDS.length,36);
  assert.ok(SYMBOL_CATALOG.every(entry=>DIAGRAM_SYMBOL_KINDS.includes(entry.kind)));
});

test('each category offers exactly its own symbol and callout buttons, totaling 38',()=>{
  const groups=new Set(SYMBOL_CATALOG.map(item=>item.group));
  let total=0;
  for(const group of groups){
    const symbols=SYMBOL_CATALOG.filter(item=>item.group===group),callouts=DIAGRAM_CALLOUT_SYMBOLS.filter(item=>item.group===group);
    const markup=render(symbols[0].kind);
    const buttons=Array.from(markup.matchAll(/aria-label="((?:放置|创建)[^"]+符号)"/g),match=>match[1]);
    const expected=[...symbols.map(item=>'放置'+item.label+'符号'),...callouts.map(item=>'创建'+item.label+'符号')];
    assert.deepEqual(buttons.sort(),expected.sort(),group);total+=buttons.length;
    if(group!=='视图与方向')assert.doesNotMatch(markup,/data-callout-symbol=/);
  }
  assert.equal(total,38);
});

test('paper keeps its two-circle preview while CP shows one locator and two before-after detail circles',()=>{
  for(const item of DIAGRAM_CALLOUT_SYMBOLS){
    assert.doesNotMatch(item.preview,/\bid=|<image|<text/);
    const connectorMarkup=item.preview.slice(0,item.preview.indexOf('<circle'));
    const connectors=Array.from(connectorMarkup.matchAll(/<path\b[^>]*data-inset-connector="true"[^>]*>/g),match=>match[0]);
    assert.equal(connectors.length,item.type==='paper'?2:0,'paper keeps two tangent connectors while CP circles are independent');
    for(const path of connectors)assert.match(path,/d="M [^"]+ L [^"]+"/);
  }
  const [paper,cp]=DIAGRAM_CALLOUT_SYMBOLS;
  assert.match(paper.preview,/cx="-29" cy="23" r="11"/);assert.match(paper.preview,/cx="17" cy="-8" r="27"/);assert.doesNotMatch(paper.preview,/data-callout-preview-role/);
  assert.match(cp.preview,/cx="-32" cy="0" r="9"/);assert.match(cp.preview,/cx="14" cy="-24" r="20"/);assert.match(cp.preview,/cx="14" cy="24" r="20"/);
  assert.match(cp.preview,/data-callout-preview-role="before"/);assert.match(cp.preview,/data-callout-preview-role="after"/);
  assert.match(cp.preview,/stroke="#b23d42"/);assert.match(cp.preview,/stroke="#315ebe"/);
});

test('the single CP palette entry can be found by before-after comparison terms without introducing another symbol kind',()=>{
  const entries=DIAGRAM_CALLOUT_SYMBOLS.filter(item=>item.type==='cp');assert.equal(entries.length,1);
  for(const query of ['前后对照','双图','同一区域','before','after'])assert.ok(`${entries[0].label} ${entries[0].keywords}`.toLocaleLowerCase().includes(query));
  assert.equal(DIAGRAM_CALLOUT_SYMBOLS.length,2);assert.equal(SYMBOL_CATALOG.length+DIAGRAM_CALLOUT_SYMBOLS.length,38);
});

test('disabled callout entries cannot start drag placement and the separate MIME accepts only the two supported types',()=>{
  const markup=render('zoom',true),buttons=[...markup.matchAll(/<button\b[^>]*data-callout-symbol="[^\"]+"[^>]*>/g)].map(match=>match[0]);
  assert.equal(buttons.length,2);for(const button of buttons){assert.match(button,/disabled=""/);assert.match(button,/draggable="false"/);}
  assert.equal(CALLOUT_MIME,'application/x-zhezhi-diagram-callout');
  assert.equal(isDiagramCalloutSymbolType('paper'),true);assert.equal(isDiagramCalloutSymbolType('cp'),true);
  for(const value of ['zoom','zoomOut','<svg>',{},null,undefined])assert.equal(isDiagramCalloutSymbolType(value),false);
});
