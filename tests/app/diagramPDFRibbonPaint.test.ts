import test from 'node:test';
import assert from 'node:assert/strict';
import {ribbonPaintGeometry,ribbonPaintColor,ribbonPathPaintSVG} from '../../src/app/diagramPDFRibbonPaint';
import {defaultDiagramPDFPaint} from '../../src/app/diagramPDFDecoration';

test('path paint uses arc length on a curved ribbon, keeps exact cubic endpoints and bounds subdivision',()=>{
  const path='M 20 100 C 20 20 100 20 100 100 C 100 180 180 180 180 100';
  const geometry=ribbonPaintGeometry(path);
  assert.ok(geometry.length>300&&geometry.length<340);assert.equal(ribbonPaintGeometry(path),geometry,'unchanged paths share geometry');
  assert.ok(geometry.slices.length>10&&geometry.slices.length<=512);
  assert.deepEqual(geometry.slices[0].curve.start,[20,100]);assert.deepEqual(geometry.slices.at(-1)!.curve.end,[180,100]);
  for(let i=1;i<geometry.slices.length;i++)assert.deepEqual(geometry.slices[i].curve.start,geometry.slices[i-1].curve.end);
  for(const kind of ['linear','radial'] as const){
    const paint={...defaultDiagramPDFPaint('#ff0000'),kind};
    const svg=ribbonPathPaintSVG(path,20,paint,'test','data-pdf-ribbon="true"');
    assert.match(svg,new RegExp('<'+kind+'Gradient'));assert.doesNotMatch(svg,/<image|<mask|<filter/);
    const transforms=[...svg.matchAll(/gradientTransform="matrix\(([^)]+)\)"/g)].map(m=>m[1].split(' ').map(Number));
    assert.ok(transforms.some(([x,y])=>y<0));assert.ok(transforms.some(([x,y])=>y>0),'paint follows both halves of the bend');
    for(const [x,y,u,v] of transforms){assert.ok(Math.abs(x*u+y*v)<.001);assert.ok(Math.abs(Math.hypot(u,v)-20)<.00001);}
  }
});

test('local paint preserves stop alpha and radial center/range controls',()=>{
  const paint={...defaultDiagramPDFPaint('#000000'),kind:'radial' as const,centerX:50,centerY:50,radius:50,stops:[{id:'a',offset:0,color:'#000000',opacity:.2},{id:'b',offset:100,color:'#ffffff',opacity:.8}]};
  assert.deepEqual(ribbonPaintColor(paint,.5),{color:'#000000',opacity:.2});
  assert.deepEqual(ribbonPaintColor({...paint,centerY:0},.5),{color:'#ffffff',opacity:.8});
  const svg=ribbonPathPaintSVG('M 0 20 C 33 20 66 20 100 20',20,paint,'alpha','data-pdf-ribbon="true"');
  assert.match(svg,/stop-color="#333333"/);assert.match(svg,/stop-color="#cccccc"/);assert.match(svg,/<mask/);assert.doesNotMatch(svg,/stop-opacity="0\.[0-9]+"/,'opacity is applied once through an opaque grayscale mask');
});
