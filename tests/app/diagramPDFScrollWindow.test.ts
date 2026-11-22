import assert from 'node:assert/strict';
import test from 'node:test';
import {diagramPDFScrollGeometry,diagramPDFScrollWindow} from '../../src/app/diagramPDFScrollWindow';

test('continuous spreads pair fixed pages and keep the odd last page in its own row',()=>{
  const geometry=diagramPDFScrollGeometry(13,true,false,210,297,800,750);
  assert.equal(geometry.columns,2);assert.equal(geometry.rows,7);
  const start=diagramPDFScrollWindow(13,geometry,0,750);
  assert.deepEqual(start.pages,[0,1,2,3,4,5]);
  const end=diagramPDFScrollWindow(13,geometry,geometry.contentHeight,750);
  assert.equal(end.current,6);assert.equal(end.pages.at(-1),12);
  assert.ok(end.pages.every(page=>page>=0&&page<13));
});

test('only nearby papers mount while placeholders retain the entire scroll distance',()=>{
  const geometry=diagramPDFScrollGeometry(100,true,false,210,297,800,750);
  const middle=diagramPDFScrollWindow(100,geometry,geometry.padding+20*geometry.rowStride,750);
  assert.equal(middle.current,20);assert.ok(middle.pages.includes(40));assert.ok(middle.pages.includes(41));
  assert.ok(middle.pages.length<=6);
  assert.equal(geometry.contentHeight,50*geometry.rowStride-geometry.rowGap+geometry.padding*2);
  const previous=diagramPDFScrollWindow(100,geometry,geometry.padding+19*geometry.rowStride,750);
  assert.ok(previous.pages.includes(40),'next spread is ready before reaching its row');
});

test('single pages, zoom and landscape resizing preserve the physical page ratio and full range',()=>{
  const normal=diagramPDFScrollGeometry(12,false,false,297,210,800,750);
  const enlarged=diagramPDFScrollGeometry(12,false,true,297,210,800,750);
  assert.equal(normal.columns,1);assert.equal(normal.rows,12);
  assert.equal(enlarged.sheetWidth,normal.sheetWidth*1.6);
  assert.equal(enlarged.sheetHeight,normal.sheetHeight*1.6);
  assert.ok(enlarged.contentWidth>800,'enlarged landscape paper can scroll horizontally');
  assert.ok(Math.abs(normal.sheetWidth/normal.sheetHeight-297/210)<1e-12);
  const narrow=diagramPDFScrollGeometry(12,true,false,297,210,220,1000);
  const visible=diagramPDFScrollWindow(12,narrow,0,1000);
  assert.equal(visible.pages.length,12,'all intersecting small rows must remain visible, even in a narrow viewport');
});

test('empty and one-page previews have no invalid page indices or negative scroll space',()=>{
  const empty=diagramPDFScrollGeometry(0,true,false,210,297,0,0);
  assert.equal(empty.contentHeight,0);
  assert.deepEqual(diagramPDFScrollWindow(0,empty,500,0).pages,[]);
  const single=diagramPDFScrollGeometry(1,true,false,210,297,800,750);
  assert.equal(single.columns,1);
  assert.deepEqual(diagramPDFScrollWindow(1,single,-100,750).pages,[0]);
  assert.deepEqual(diagramPDFScrollWindow(1,single,999999,750).pages,[0]);
});
