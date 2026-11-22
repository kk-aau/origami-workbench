import test from 'node:test';
import assert from 'node:assert/strict';
import {frameInkSVG,frameArtworkSVG,type DiagramFrameArtwork} from '../../src/app/diagramFrameArtwork';
const face=(points:number[]):DiagramFrameArtwork['pieces'][number]=>({kind:'face',color:'#3366aa',points});
test('adjacent visible fragments share one compound fill while a real hole remains a hole',()=>{
  const frame:DiagramFrameArtwork={box:{x:0,y:0,width:10,height:10},pieces:[
    face([0,0,10,0,10,2,0,2]),face([0,8,10,8,10,10,0,10]),face([0,2,2,2,2,8,0,8]),face([8,2,10,2,10,8,8,8]),
  ]},snapshot=structuredClone(frame),svg=frameInkSVG(frame);
  assert.match(svg,/data-diagram-frame-faces="4"/);assert.match(svg,/fill-rule="nonzero"/);assert.match(svg,/stroke="none"/);
  assert.equal((svg.match(/M /g)??[]).length,4,'retain the four footprints instead of replacing them with an outer hull');
  assert.deepEqual(frame,snapshot);assert.equal(frameInkSVG(frame),svg);
  const exported=frameArtworkSVG(JSON.parse(JSON.stringify(frame)),0,0,100,100);
  assert.match(exported,/viewBox="0 0 10 10"/);assert.doesNotMatch(exported,/<image/);
});
test('compound fills never move past an intervening instruction line',()=>{
  const frame:DiagramFrameArtwork={box:{x:0,y:0,width:10,height:10},pieces:[face([0,0,5,0,5,5]),face([0,0,5,5,0,5]),{kind:'line',color:'#ff0000',points:[0,2,10,2]},face([5,5,10,5,10,10])]};
  const svg=frameInkSVG(frame);
  assert.ok(svg.indexOf('<path')<svg.indexOf('<line'));assert.ok(svg.indexOf('<line')<svg.indexOf('<polygon'));
});
test('a zero-area face never becomes a spurious material seam in saved artwork',()=>{
  const frame:DiagramFrameArtwork={box:{x:0,y:0,width:100,height:10},pieces:[face([0,0,50,0,100,0])]};
  assert.equal(frameInkSVG(frame),'');
});
