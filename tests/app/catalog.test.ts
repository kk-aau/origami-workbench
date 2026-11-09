import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../src/app/orieditaCatalog.json';
import { TOOL_GUIDES } from '../../src/app/tools';
import {catalogSettings} from '../../src/app/catalogSettings';
test('catalog execution links refer to real tools and never execute pending entries', () => {
  for(const entry of catalog){
    if(entry.tool)assert.ok(Object.hasOwn(TOOL_GUIDES,entry.tool),entry.id);
    if(entry.status==='待开发')assert.equal(entry.tool,null,entry.id);
  }
});
test('settings navigation is explicitly limited to implemented panels and leaves unsupported entries inert',()=>{
 for(const id of ['lineWidthDecreaseAction','antiAliasToggleAction','pref-185','pref-191','pref-195']){
  assert.ok(catalog.find(entry=>entry.id===id));assert.ok(catalogSettings(id));
 }
 assert.equal(catalogSettings('pref-183'),null);assert.equal(catalogSettings('missing'),null);
 assert.equal(catalogSettings('pref-191'),'shortcuts');assert.equal(catalogSettings('pref-185'),'display');
});
test('catalog deletion entry dispatches to the explicit erase tool', () => {
  assert.equal(catalog.find(e=>e.id==='LINE_SEGMENT_DELETE_3')?.tool,'erase');
  assert.equal(catalog.find(e=>e.id==='LENGTHEN_CREASE_5')?.tool,'lengthen');
  for(const [id,tool] of [['CHANGE_CREASE_TYPE_4','cycletype'],['INWARD_8','rabbitear'],['CIRCLE_DRAW_SEPARATE_44','circleseparate'],['CIRCLE_DRAW_CONCENTRIC_48','circleconcentric'],['CIRCLE_DRAW_CONCENTRIC_TWO_CIRCLE_SELECT_50','circlepair'],['SYMMETRIC_DRAW_10','reflection']])
    assert.equal(catalog.find(e=>e.id===id)?.tool,tool,id);
});
