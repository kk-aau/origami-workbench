import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creaseVertices,creaseVertexShape,creaseVerticesSVG} from '../../src/app/creaseVertices';
import {defaultCreaseDisplay,previewOrieditaDisplay,validateCreaseDisplay} from '../../src/app/creaseDisplay';
import {line} from '../../src/app/state';
test('display vertices deduplicate exact endpoints, ignore auxiliary-only points and preserve geometry',()=>{
 const segments=[line([0,0],[10,0],'M'),line([10,0],[10,10],'V'),line([20,20],[30,30],'A')],before=structuredClone(segments);
 assert.deepEqual(creaseVertices(segments),[[0,0],[10,0],[10,10]]);assert.deepEqual(segments,before);
});
test('default hollow markers inset the thin ring without changing their requested outer radius',()=>{
 const d=defaultCreaseDisplay();assert.equal(creaseVertexShape(d,1),null);assert.equal(creaseVerticesSVG([line([0,0],[1,1],'M')],d,1),'');
 for(const pointStyle of ['hollow',undefined] as const)for(const lineWidth of [.5,1.6,2,20])for(const pointSize of [1,3,12]){
  const shape=creaseVertexShape({...d,pointStyle,lineWidth,pointSize},.5)!;
  assert.equal(shape.round,true);assert.equal(shape.radius,pointSize*.5);
  assert.equal(shape.strokeWidth,.575);assert.equal(shape.pathRadius+shape.strokeWidth/2,shape.radius);
  assert.equal(shape.fill,'#fffefb');assert.equal(shape.stroke,'#5a7365');
  assert.ok(shape.pathRadius>=0);
 }
 assert.match(creaseVerticesSVG([line([0,0],[1,1],'M')],{...d,pointSize:1},1),/<circle data-crease-vertex/);
});
test('explicit point shapes override line widths without adding an outline or changing endpoints',()=>{
 const d=defaultCreaseDisplay(),segments=[line([0,0],[10,0],'M'),line([10,0],[10,10],'V')],before=structuredClone(segments);
 for(const pointStyle of ['circle','square'] as const)for(const lineWidth of [.5,1.6,2,2.5,20]){
  const display={...d,pointStyle,lineWidth,pointSize:3},shape=creaseVertexShape(display,.5);
  assert.deepEqual(shape,{round:pointStyle==='circle',radius:1.5,pathRadius:1.5,strokeWidth:0,fill:'#000000',stroke:'none'});
  const svg=creaseVerticesSVG(segments,display,.5);
  assert.match(svg,/fill="#000000" stroke="none"/);assert.doesNotMatch(svg,/stroke-width|stroke="#000000"/);
  assert.equal((svg.match(/data-crease-vertex=/g)??[]).length,3);
  assert.match(svg,pointStyle==='circle'?/<circle[^>]*r="1.5"/:/<rect[^>]*width="3" height="3"/);
  assert.equal(creaseVertexShape({...display,pointSize:0},1),null);
  assert.equal(creaseVerticesSVG(segments,{...display,pointSize:0},1),'');
 }
 assert.deepEqual(segments,before);
});
test('point size imports strictly and old settings default to hidden markers',()=>{
 const d=defaultCreaseDisplay();assert.equal(previewOrieditaDisplay({pointSize:3},d).settings!.pointSize,3);
 for(const value of [-1,21,1.5,'2',null,NaN]){assert.equal(previewOrieditaDisplay({pointSize:value},d).settings,null);assert.throws(()=>validateCreaseDisplay({...d,pointSize:value}));}
});
