import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultGridAppearance} from '../../src/app/gridAppearance';
import {previewWorkbenchPreferences,WORKBENCH_GRID_KEY,WORKBENCH_THEME_KEY} from '../../src/app/oriconfigWorkbench';
test('workbench config preview recognizes namespaced grid and theme values only',()=>{
 const current={gridAppearance:defaultGridAppearance(),theme:'light' as const};
 const grid={...defaultGridAppearance(),gridColor:'#112233',defaultDivisions:16,pattern:'triangular' as const,squareRotation:45};
 const preview=previewWorkbenchPreferences({[WORKBENCH_GRID_KEY]:grid,[WORKBENCH_THEME_KEY]:'dark',lineWidth:2},current);
 assert.deepEqual(preview.settings,{gridAppearance:grid,theme:'dark'});assert.deepEqual(preview.recognized,[WORKBENCH_GRID_KEY,WORKBENCH_THEME_KEY]);assert.deepEqual(preview.ignored,['lineWidth']);
});

test('old native grid settings ignore withdrawn angles without discarding colors and widths',()=>{
 const current={gridAppearance:defaultGridAppearance(),theme:'light' as const},legacy={gridColor:'#112233',diagonalColor:'#aabbcc',lineWidth:1.2,defaultDivisions:8,minGridPixelSize:4};
 assert.deepEqual(previewWorkbenchPreferences({[WORKBENCH_GRID_KEY]:legacy},current).settings?.gridAppearance,{...legacy,pattern:'square',squareRotation:0});
 for(const diagonalAngle of [22.5,30,0,90,null,'15']){
  const preview=previewWorkbenchPreferences({[WORKBENCH_GRID_KEY]:{...legacy,diagonalAngle},[WORKBENCH_THEME_KEY]:'dark'},current);
  assert.deepEqual(preview.settings,{gridAppearance:{...legacy,pattern:'square',squareRotation:0},theme:'dark'});assert.deepEqual(preview.issues,[]);
 }
});
test('invalid namespaced workbench config is rejected without partial application',()=>{
 const current={gridAppearance:defaultGridAppearance(),theme:'light' as const};
 const preview=previewWorkbenchPreferences({[WORKBENCH_GRID_KEY]:{...defaultGridAppearance(),defaultDivisions:0},[WORKBENCH_THEME_KEY]:'blue'},current);
 assert.equal(preview.settings,null);assert.equal(preview.recognized.length,0);assert.equal(preview.issues.length,2);
});
