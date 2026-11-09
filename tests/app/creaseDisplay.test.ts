import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultCreaseDisplay,validateCreaseDisplay,readCreaseDisplay,saveCreaseDisplay,previewOrieditaDisplay} from '../../src/app/creaseDisplay';
test('display preferences validate finite screen widths and strict flags without mutation',()=>{
 const d=defaultCreaseDisplay();assert.deepEqual(validateCreaseDisplay(d),d);assert.notEqual(validateCreaseDisplay(d),d);
 for(const value of [null,{}, {...d,lineWidth:NaN},{...d,lineWidth:0},{...d,auxLineWidth:21},{...d,roundedEnds:'false'}])assert.throws(()=>validateCreaseDisplay(value));
});
test('display storage round trips, falls back on corrupt storage and propagates failed writes',()=>{
 let raw='';const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
 const value={...defaultCreaseDisplay(),lineWidth:4,auxLineWidth:2,roundedEnds:true};saveCreaseDisplay(value,storage);assert.deepEqual(readCreaseDisplay(storage),value);
 raw='{"version":9}';assert.deepEqual(readCreaseDisplay(storage),defaultCreaseDisplay());
 assert.deepEqual(readCreaseDisplay({getItem:()=>{throw Error('denied');}}),defaultCreaseDisplay());
 assert.throws(()=>saveCreaseDisplay(value,{setItem:()=>{throw Error('full');}}),/full/);
});

test('point styles default to hollow for old settings and round trip only through native configuration',()=>{
 const current=defaultCreaseDisplay(),{pointStyle:_style,...legacy}=current;
 assert.equal(current.pointStyle,'hollow');assert.deepEqual(validateCreaseDisplay(legacy),current);
 let raw=JSON.stringify({version:1,settings:legacy});const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
 assert.deepEqual(readCreaseDisplay(storage),current);
 for(const pointStyle of ['hollow','circle','square'] as const){
  const settings={...current,pointSize:5,pointStyle};saveCreaseDisplay(settings,storage);assert.deepEqual(readCreaseDisplay(storage),settings);
  const native=previewOrieditaDisplay({pointStyle},current,true);assert.equal(native.settings?.pointStyle,pointStyle);assert.deepEqual(native.recognized,['pointStyle']);
  const foreign=previewOrieditaDisplay({pointStyle:'unknown',lineWidth:3},settings);
  assert.deepEqual(foreign.ignored,['pointStyle']);assert.equal(foreign.settings?.pointStyle,pointStyle);assert.equal(foreign.settings?.lineWidth,3);
  assert.equal(previewOrieditaDisplay({pointSize:2},settings,true).settings?.pointStyle,pointStyle);
 }
 for(const pointStyle of [null,0,true,'Circle','triangle']){
  assert.throws(()=>validateCreaseDisplay({...current,pointStyle}),/点样式/);
  assert.equal(previewOrieditaDisplay({pointStyle},current,true).settings,null);
 }
});

test('legacy auto preferences and native imports migrate only point style to hollow',()=>{
 const legacy={...defaultCreaseDisplay(),pointStyle:'auto',pointSize:7,lineWidth:4.5,lineStyle:'BLACK_TWO_DOT' as const,showCursorHint:false};
 const expected={...legacy,pointStyle:'hollow' as const};
 assert.deepEqual(validateCreaseDisplay(legacy),expected);
 let raw=JSON.stringify({version:1,settings:legacy});const storage={getItem:()=>raw,setItem:(_k:string,value:string)=>{raw=value;}};
 const restored=readCreaseDisplay(storage);assert.deepEqual(restored,expected);
 saveCreaseDisplay(restored,storage);assert.deepEqual(JSON.parse(raw).settings,expected);
 const native=previewOrieditaDisplay({pointStyle:'auto'},{...expected,pointStyle:'square'},true);
 assert.deepEqual(native.settings,expected);assert.deepEqual(native.recognized,['pointStyle']);assert.deepEqual(native.issues,[]);
 const foreign=previewOrieditaDisplay({pointStyle:'auto'},{...expected,pointStyle:'circle'});
 assert.equal(foreign.settings?.pointStyle,'circle');assert.deepEqual(foreign.ignored,['pointStyle']);
});

test('operation hints default on for old preferences and remain independently hidden after reopening',()=>{
 const current=defaultCreaseDisplay(),{showToolGuide:_guide,showCursorHint:_cursor,...legacy}=current;
 assert.deepEqual(validateCreaseDisplay(legacy),current);
 let raw='';const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
 for(const showToolGuide of [true,false])for(const showCursorHint of [true,false]){
  const settings={...current,showToolGuide,showCursorHint};
  saveCreaseDisplay(settings,storage);assert.deepEqual(readCreaseDisplay(storage),settings);
  assert.equal(previewOrieditaDisplay({lineWidth:3},settings).settings?.showToolGuide,showToolGuide);
  assert.equal(previewOrieditaDisplay({lineWidth:3},settings).settings?.showCursorHint,showCursorHint);
  assert.deepEqual(previewOrieditaDisplay(settings,current,true).settings,settings);
 }
 assert.deepEqual(previewOrieditaDisplay({showToolGuide:false,showCursorHint:false},current).settings,current);
 for(const key of ['showToolGuide','showCursorHint'])for(const value of [null,0,'false'])assert.throws(()=>validateCreaseDisplay({...current,[key]:value}),/操作提示/);
});
test('Oriedita exact display mapping preserves absent fields and reports unsupported and invalid values',()=>{
 const current=defaultCreaseDisplay(),before=structuredClone(current),r=previewOrieditaDisplay({lineWidth:3,roundedEnds:true,antiAlias:false,pointSize:2},current);
 assert.deepEqual(r.settings,{...current,lineWidth:3,roundedEnds:true,pointSize:2,antiAlias:false});assert.deepEqual(r.ignored,[]);assert.deepEqual(current,before);
 for(const lineWidth of ['2',0,1.5,21,Infinity])assert.equal(previewOrieditaDisplay({lineWidth},current).settings,null);
 assert.equal(previewOrieditaDisplay({roundedEnds:1},current).settings,null);
});

test('auxiliary style persists independently and only imports from native display settings',()=>{
 const current=defaultCreaseDisplay();assert.equal(current.auxLineStyle,'solid');
 let raw='';const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
 const dashed={...current,auxLineStyle:'dashed' as const};saveCreaseDisplay(dashed,storage);assert.deepEqual(readCreaseDisplay(storage),dashed);
 const imported=previewOrieditaDisplay({auxLineStyle:'dashed'},current,true);
 assert.deepEqual(imported.settings,dashed);assert.deepEqual(imported.recognized,['auxLineStyle']);
 const foreign=previewOrieditaDisplay({auxLineStyle:'dashed'},current);
 assert.deepEqual(foreign.settings,current);assert.deepEqual(foreign.ignored,['auxLineStyle']);
 for(const value of [null,true,0,'SOLID','dotted']){
  assert.throws(()=>validateCreaseDisplay({...current,auxLineStyle:value}),/辅助线样式/);
  assert.equal(previewOrieditaDisplay({auxLineStyle:value},current,true).settings,null);
 }
});
