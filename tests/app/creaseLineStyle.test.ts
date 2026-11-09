import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creaseLineStyle,LINE_STYLES,CANVAS_LINE_STYLES,canvasLineStyleGroup} from '../../src/app/creaseLineStyle';
import {defaultCreaseDisplay,previewOrieditaDisplay,readCreaseDisplay,saveCreaseDisplay} from '../../src/app/creaseDisplay';
import type {Segment} from '../../src/core/types';
const s=(assignment:Segment['assignment']):Segment=>({id:'s',a:[0,0],b:[10,0],assignment});
test('five original line styles have correct mountain valley patterns and monochrome behavior',()=>{
 assert.equal(creaseLineStyle(s('M'),'COLOR',1).dash,undefined);
 assert.deepEqual(creaseLineStyle(s('V'),'BLACK_WHITE',1),{color:'#a2a2a2',dash:undefined});
 assert.deepEqual(creaseLineStyle(s('M'),'BLACK_ONE_DOT',1),{color:'#000000',dash:'10 3 3 3'});
 assert.deepEqual(creaseLineStyle(s('M'),'BLACK_TWO_DOT',.5),{color:'#000000',dash:'5 1.5 1.5 1.5 1.5 1.5'});
 assert.equal(creaseLineStyle(s('M'),'COLOR_AND_SHAPE',1).dash,'10 3 3 3');
 for(const style of ['COLOR_AND_SHAPE','BLACK_ONE_DOT','BLACK_TWO_DOT'] as const)assert.equal(creaseLineStyle(s('V'),style,1).dash,'8 8');
});
test('auxiliary custom colors and unknown assignments remain distinct in every style',()=>{
 const aux={...s('A'),displayColor:'#abcdef'};
 const before=structuredClone(aux);
 for(const style of Object.keys(LINE_STYLES) as (keyof typeof LINE_STYLES)[]){
  assert.deepEqual(creaseLineStyle(aux,style,1),{color:'#abcdef',dash:undefined});
  assert.deepEqual(creaseLineStyle(aux,style,.5,'dashed'),{color:'#abcdef',dash:'1 2.5'});
  assert.equal(creaseLineStyle(s('U'),style,1).dash,'3 2');assert.equal(creaseLineStyle(s('B'),style,1).dash,undefined);
 }
 assert.deepEqual(aux,before);
});
test('old stored widths migrate without reset and original enum names import strictly',()=>{
 const legacy={lineWidth:4,auxLineWidth:2,roundedEnds:true};
 assert.deepEqual(readCreaseDisplay({getItem:()=>JSON.stringify({version:1,settings:legacy})}),{...legacy,auxLineStyle:'solid',markLineWidth:1.3,lineStyle:'WORKBENCH',pointSize:0,pointStyle:'hollow',antiAlias:true,showToolGuide:true,showCursorHint:true});
 for(const style of Object.keys(LINE_STYLES).filter(s=>s!=='WORKBENCH'))assert.equal(previewOrieditaDisplay({lineStyle:style},defaultCreaseDisplay()).settings!.lineStyle,style);
 for(const invalid of [1,'1','WORKBENCH','BLACK',null])assert.equal(previewOrieditaDisplay({lineStyle:invalid},defaultCreaseDisplay()).settings,null);
});

test('the four canvas choices retain red mountains, blue valleys and different mountain/valley dash shapes',()=>{
 assert.deepEqual(CANVAS_LINE_STYLES,{BLACK_WHITE:'明暗（黑灰）',COLOR:'蓝红实线',WORKBENCH:'蓝红虚线',BLACK_ONE_DOT:'黑色虚线'});
 const expected={
  BLACK_WHITE:[{color:'#000000',dash:undefined},{color:'#a2a2a2',dash:undefined}],
  COLOR:[{color:'#b23d42',dash:undefined},{color:'#315ebe',dash:undefined}],
  WORKBENCH:[{color:'#b23d42',dash:'10 3 2 3'},{color:'#315ebe',dash:'7 4'}],
  BLACK_ONE_DOT:[{color:'#000000',dash:'10 3 3 3'},{color:'#000000',dash:'8 8'}],
 };
 for(const style of Object.keys(CANVAS_LINE_STYLES) as (keyof typeof CANVAS_LINE_STYLES)[]){
  assert.equal(canvasLineStyleGroup(style),style);
  assert.deepEqual([creaseLineStyle(s('M'),style,1),creaseLineStyle(s('V'),style,1)],expected[style]);
  assert.equal(creaseLineStyle(s('B'),style,1).dash,undefined);
 }
});

test('canvas grouping does not rewrite legacy dash patterns or unrelated stored preferences',()=>{
 for(const [style,group,dash] of [['COLOR_AND_SHAPE','WORKBENCH','10 3 3 3'],['BLACK_TWO_DOT','BLACK_ONE_DOT','10 3 3 3 3 3']] as const){
  const settings={...defaultCreaseDisplay(),lineStyle:style,lineWidth:4,auxLineWidth:2,pointSize:5,auxLineStyle:'dashed' as const,roundedEnds:true,showCursorHint:false};
  let raw=JSON.stringify({version:1,settings});const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
  const loaded=readCreaseDisplay(storage);assert.equal(canvasLineStyleGroup(loaded.lineStyle),group);
  assert.equal(creaseLineStyle(s('M'),loaded.lineStyle,1).dash,dash);
  assert.notEqual(creaseLineStyle(s('M'),group,1).dash,dash,'legacy preview must use the actual style, not its group key');
  saveCreaseDisplay(loaded,storage);assert.deepEqual(readCreaseDisplay(storage),settings);assert.equal(JSON.parse(raw).settings.lineStyle,style);
  assert.equal(previewOrieditaDisplay({lineStyle:style},defaultCreaseDisplay()).settings!.lineStyle,style);
 }
});
