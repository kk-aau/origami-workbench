import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagramCreaseToolbarPosition} from '../../src/app/diagramCreaseToolbar';

const viewport={x:8,y:10,width:600,height:500},toolbar={width:280,height:66};
test('crease controls sit twelve screen pixels above the selected crease',()=>{
  const position=diagramCreaseToolbarPosition([[80,260],[480,260]],viewport,toolbar)!;
  assert.deepEqual(position,{left:140,top:182,anchor:[280,260],side:'above'});
});
test('a CP selection without a projected main diagram keeps controls available at the top center',()=>{
  assert.deepEqual(diagramCreaseToolbarPosition([],viewport,toolbar),{left:168,top:26,anchor:[308,10],side:'below'});
});
test('rotated crease and resized canvas keep controls inside visible drawing bounds',()=>{
  const position=diagramCreaseToolbarPosition([[30,90],[90,440]],{x:8,y:10,width:330,height:450},toolbar)!;
  assert.equal(position.left,16);assert.equal(position.top,187);assert.equal(position.side,'above');
});
test('a crease near the top places controls below it without covering other workspace panels',()=>{
  const position=diagramCreaseToolbarPosition([[40,25],[140,25]],viewport,toolbar)!;
  assert.equal(position.top,37);assert.equal(position.side,'below');assert.equal(position.left,16);
});
test('partially visible or viewport-crossing creases use their visible portion',()=>{
  const position=diagramCreaseToolbarPosition([[-500,260],[900,260]],viewport,toolbar)!;
  assert.deepEqual(position.anchor,[308,260]);assert.equal(position.left,168);
});
test('completely offscreen creases hide their controls including false bounding-box intersections',()=>{
  assert.equal(diagramCreaseToolbarPosition([[-30,50],[-10,400]],viewport,toolbar),null);
  assert.equal(diagramCreaseToolbarPosition([[-300,50],[70,-300]],viewport,toolbar),null);
});
test('invalid coordinates or a collapsed canvas do not position a control bar',()=>{
  assert.equal(diagramCreaseToolbarPosition([[NaN,90],[100,100]],viewport,toolbar),null);
  assert.equal(diagramCreaseToolbarPosition([[0,0]],{x:0,y:0,width:10,height:10},toolbar),null);
});
