import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PANELS, TOOL_PANEL_MAX, panelWidths, readPanels } from '../../src/app/panelLayout';
import catalog from '../../src/app/orieditaCatalog.json';
import { TOOL_GUIDES } from '../../src/app/tools';

test('default desktop panels leave working space for the canvas',()=>{
  assert.deepEqual(panelWidths(DEFAULT_PANELS.left,DEFAULT_PANELS.right,1440-70),DEFAULT_PANELS);
});
test('legacy default widths adopt the narrower toolbox, preserving custom widths',()=>{
  const read=(left:number,right:number)=>readPanels({getItem:()=>JSON.stringify({left,right})});
  assert.deepEqual(read(400,252),DEFAULT_PANELS);
  assert.deepEqual(read(260,284),DEFAULT_PANELS);
  assert.deepEqual(read(420,284),{left:420,right:284});
  assert.deepEqual(read(400,300),{left:400,right:300});
});
test('rail space is reserved when sizing the two panels',()=>{
  for(const screen of [1000,1250,1366,1600,1920]){
    const rail=screen<=1250?66:70,p=panelWidths(560,440,screen-rail);
    assert.ok(screen-rail-p.left-p.right-16>=352);
  }
});
test('narrow desktop and extreme widths retain a usable canvas',()=>{
  for(const viewport of [800,900,1024,1440,1920])for(const l of [-100,192,260,420,560,1e8])for(const r of [-100,236,284,440,1e8]){
    const p=panelWidths(l,r,viewport);assert.ok(p.left>=192&&p.left<=TOOL_PANEL_MAX);assert.ok(p.right>=236&&p.right<=440);assert.ok(viewport-p.left-p.right-16>=352);
  }
});
test('wide screens allow a four-column tool panel without sacrificing the canvas',()=>{
  assert.equal(panelWidths(560,284,1440).left,560);
  assert.equal(panelWidths(1000,284,1920).left,TOOL_PANEL_MAX);
  assert.equal(panelWidths(560,284,1024).left,372);
});
test('panels tolerate nonfinite and unavailable persisted state',()=>{
  assert.deepEqual(panelWidths(NaN,Infinity,1440),DEFAULT_PANELS);
  assert.deepEqual(readPanels(),DEFAULT_PANELS);
});
test('non-editor workspaces allow the property panel its full range',()=>{
  assert.equal(panelWidths(420,440,1024,false).right,440);
});
test('catalog includes all 80 non-unused modes with unique keys',()=>{
  assert.equal(catalog.filter(e=>e.kind==='交互模式').length,80);
  assert.equal(new Set(catalog.map(e=>e.id)).size,catalog.length);
  assert.ok(!catalog.some(e=>e.id.startsWith('UNUSED_')));
});
test('catalog only links implemented tool IDs and declares incomplete parity',()=>{
  for(const e of catalog){if(e.tool){assert.ok(e.tool in TOOL_GUIDES);if(e.tool==='restrictedline')assert.equal(e.status,'迁移版定制交互');else assert.match(e.status,/基础可用/);}assert.ok(e.name&&e.group&&e.source&&e.description);}
});
test('catalog preserves aliases and key deferred functionality',()=>{
  const all=catalog.map(e=>e.id+' '+e.source).join(' ');
  for(const key of ['AXIOM_5','AXIOM_7','CIRCLE_DRAW_INVERTED_46','koteimen_siteiAction','As100Action','as100Action','foldedFigureUndoAction','copyClipboardAction','prefAction','ckOAction','ckTAction','fxOAction','fxTAction','inputDataAction'])assert.ok(all.includes(key),key);
});
