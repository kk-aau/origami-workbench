import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floatingCommandPosition,type CommandBox} from '../../src/app/floatingCommandPosition';

const size={width:410,height:40};
function overlaps(point:{x:number;y:number},box:CommandBox){return point.x<box.x+box.width&&point.x+size.width>box.x&&point.y<box.y+box.height&&point.y+size.height>box.y;}

test('floating commands default near the canvas bottom without covering a compact zoom control',()=>{
  assert.deepEqual(floatingCommandPosition({width:1000,height:700},size,null,[{x:760,y:640,width:220,height:40}]),{x:16,y:640});
});

test('long active navigation labels and corner status never become covered by the command bar',()=>{
  const obstacles=[{x:180,y:640,width:500,height:40},{x:20,y:640,width:90,height:30}];
  const point=floatingCommandPosition({width:700,height:700},size,null,obstacles);
  assert.equal(obstacles.some(box=>overlaps(point,box)),false);
  assert.ok(point.y+size.height<=632);
});

test('dragged commands remain reachable after viewport shrinks or side panels reopen',()=>{
  const point=floatingCommandPosition({width:460,height:280},size,{x:980,y:740});
  assert.ok(point.x>=0&&point.x+size.width<=460);
  assert.ok(point.y>=0&&point.y+size.height<=280);
});

test('dragging into controls chooses the closest available edge rather than hiding controls',()=>{
  const zoom={x:460,y:300,width:230,height:40};
  const point=floatingCommandPosition({width:700,height:500},size,{x:250,y:300},[zoom]);
  assert.equal(overlaps(point,zoom),false);
  assert.deepEqual(point,{x:250,y:252});
});

test('hidden or off-canvas overlays do not displace the bar; tiny bounds stay finite',()=>{
  const bounds={width:700,height:500};
  assert.deepEqual(floatingCommandPosition(bounds,size,null,[{x:0,y:430,width:0,height:0},{x:0,y:800,width:700,height:100}]),floatingCommandPosition(bounds,size,null));
  const point=floatingCommandPosition({width:10,height:10},{width:8,height:8},{x:Infinity,y:NaN});
  assert.deepEqual(point,{x:0,y:0});
});
