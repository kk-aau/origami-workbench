import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportOriconfigHotkeys,exportOriconfigSettings} from '../../src/app/oriconfigExport';
import {readOriconfigArchive} from '../../src/app/oriconfigArchive';
import {previewOrieditaHotkeys} from '../../src/app/orieditaHotkeys';
import {defaultToolShortcuts} from '../../src/app/toolShortcuts';
import {defaultCreaseDisplay,previewOrieditaDisplay} from '../../src/app/creaseDisplay';
import {defaultGridAppearance} from '../../src/app/gridAppearance';
import {previewWorkbenchPreferences} from '../../src/app/oriconfigWorkbench';
import {strToU8,zipSync,unzipSync} from 'fflate';
test('export creates a CRC-valid hotkeys-only ZIP and round trips selected bindings',()=>{
 const current={...defaultToolShortcuts(),'tool:line':'Q','tool:perpendicular':'Shift+P'},before=structuredClone(current);
 const bytes=exportOriconfigHotkeys(current,['tool:line','tool:perpendicular'],true),archive=readOriconfigArchive(bytes);
 assert.equal(archive.config,null);assert.deepEqual(archive.ignoredFiles,[]);assert.deepEqual(archive.warnings,[]);
 const back=previewOrieditaHotkeys(archive.hotkeys!,defaultToolShortcuts());assert.deepEqual(back.issues,[]);assert.equal(back.bindings!['tool:line'],'Q');assert.equal(back.bindings!['tool:perpendicular'],'Shift+P');assert.deepEqual(current,before);
 assert.deepEqual(exportOriconfigHotkeys(current,['tool:perpendicular','tool:line'],true),bytes);
});
test('export refuses missing acknowledgement, empty selection and unsupported mappings',()=>{
 const current=defaultToolShortcuts();assert.throws(()=>exportOriconfigHotkeys(current,['tool:line'],false),/确认/);assert.throws(()=>exportOriconfigHotkeys(current,[],true),/至少/);
 assert.throws(()=>exportOriconfigHotkeys(current,['tool:line','preset:U'],true),/没有明确/);
 const archive=readOriconfigArchive(exportOriconfigHotkeys({...current,'tool:line':null},['tool:line'],true));assert.match(archive.hotkeys!,/drawCreaseFreeAction=\n/);
});
test('workbench settings archive carries compatible display and mouse fields without changing hotkey semantics',()=>{
 const current=defaultToolShortcuts(),config={lineWidth:2,antiAlias:false,preciseZoom:false,zoomSpeed:2,mouseRadius:14,displayPointSpotlight:true,displayPointOffset:false};
 const archive=readOriconfigArchive(exportOriconfigSettings(current,['tool:line'],true,config));
 assert.equal(archive.config,null);assert.deepEqual(archive.workbench,config);assert.ok(archive.hotkeys?.includes('drawCreaseFreeAction='));assert.deepEqual(archive.ignoredFiles,[]);
});
test('native defaults, decimal widths, grid and theme round trip without emitting a partial Java config',()=>{
 const display={...defaultCreaseDisplay(),lineWidth:1.6,auxLineWidth:.5,auxLineStyle:'dashed' as const},grid={...defaultGridAppearance(),defaultDivisions:32,minGridPixelSize:5,pattern:'triangular' as const,squareRotation:-22.5};
 const config={...display,'zhezhi.gridAppearance':grid,'zhezhi.theme':'dark'};
 const bytes=exportOriconfigSettings(defaultToolShortcuts(),['tool:line'],true,config);
 assert.deepEqual(Object.keys(unzipSync(bytes)).sort(),['hotkey.properties','workbench.json']);
 const archive=readOriconfigArchive(bytes);
 assert.deepEqual(previewOrieditaDisplay(archive.workbench!,defaultCreaseDisplay(),true).settings,display);
 assert.equal(previewOrieditaDisplay(archive.workbench!,defaultCreaseDisplay()).settings,null);
 assert.deepEqual(previewWorkbenchPreferences(archive.workbench!,{gridAppearance:defaultGridAppearance(),theme:'light'}).settings,{gridAppearance:grid,theme:'dark'});
});
test('native settings archives preserve every point shape and its independent size',()=>{
 for(const pointStyle of ['hollow','circle','square'] as const){
  const display={...defaultCreaseDisplay(),pointStyle,pointSize:7,lineWidth:3.5};
  const bytes=exportOriconfigSettings(defaultToolShortcuts(),['tool:line'],true,display);
  const archive=readOriconfigArchive(bytes);
  assert.equal(archive.config,null);
  assert.deepEqual(previewOrieditaDisplay(archive.workbench!,defaultCreaseDisplay(),true).settings,display);
 }
});
test('native settings reject unsupported versions and enforce UTF-8 byte limits',()=>{
 const bytes=zipSync({'hotkey.properties':strToU8(''),'workbench.json':strToU8(JSON.stringify({version:2,settings:{}}))});
 assert.throws(()=>readOriconfigArchive(bytes),/版本/);
 assert.throws(()=>exportOriconfigSettings(defaultToolShortcuts(),['tool:line'],true,{text:'中'.repeat(100000)}),/256 KB/);
});
