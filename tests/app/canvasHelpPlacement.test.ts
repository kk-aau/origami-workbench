import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCanvasHelp} from '../../src/app/canvasHelpPlacement';

test('help uses free canvas regions with a gap as CP pans and zooms',()=>{
  for(const paper of [
    {x:600,y:100,width:240,height:500},
    {x:0,y:0,width:500,height:700},
    {x:10,y:300,width:1100,height:300},
    {x:10,y:0,width:1100,height:220},
    {x:-400,y:0,width:100,height:500},
  ])for(const open of [false,true]){
    const placed=placeCanvasHelp({w:1200,h:800},paper,360,46,56,open);
    assert.equal(placed.compact,false);
    assert(placed.x+placed.width<=paper.x-16||placed.x>=paper.x+paper.width+16||placed.y+placed.height<=paper.y-16||placed.y>=paper.y+paper.height+16);
    assert(placed.x>=0&&placed.y>=0&&placed.x+placed.width<=1200&&placed.y+placed.height<=800);
  }
});
test('a zoomed CP covering the viewport uses a compact HUD without changing the input viewport',()=>{
  const viewport={w:800,h:600},paper={x:-100,y:-100,width:1000,height:900};
  const placed=placeCanvasHelp(viewport,paper,360,46);
  assert.equal(placed.compact,true);assert.equal(placed.width,110);
  assert.deepEqual(viewport,{w:800,h:600});
});
