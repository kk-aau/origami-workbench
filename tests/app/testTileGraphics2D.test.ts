import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {embedTestTile2D,embedTestTiling2D,TEST_TILE_IN2811_SPECS} from '../../src/app/testTileGraphics2D';
import TestTileSourcePreview from '../../src/components/TestTileSourcePreview';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);

test('In[2811]/Out[2811]: two numbered unit squares preserve saved Graphics positions, style and order',()=>{
  const tiles=embedTestTiling2D(TEST_TILE_IN2811_SPECS,true);
  assert.equal(tiles.length,2);
  assert.deepEqual(tiles.map(tile=>tile.vertices),[
    [[0,0],[1,0],[1,1],[0,1]],[[1,0],[2,0],[2,1],[1,1]],
  ]);
  for(let i=0;i<2;i++){
    const graphics=tiles[i].graphics;
    assert.deepEqual(graphics.map(item=>item.kind),['text','text','text','text','text','line']);
    assert.deepEqual(graphics[0],{kind:'text',role:'tile-index',value:String(i+1),at:[i+.5,.5],color:'#000000'});
    const expected=[[i+.1,.1],[i+.9,.1],[i+.9,.9],[i+.1,.9]];
    graphics.slice(1,5).forEach((item,index)=>{
      assert.equal(item.kind,'text');
      if(item.kind==='text')item.at.forEach((value,axis)=>near(value,expected[index][axis]));
    });
    assert.ok(graphics.slice(1,5).every(item=>item.kind==='text'&&item.color==='#1f140a'));
    assert.deepEqual(graphics[5],{kind:'line',role:'outline',points:[...tiles[i].vertices,tiles[i].vertices[0]],color:'#ff8000',absoluteWidth:1});
  }
});

test('TestTile numeric 2D embedding applies rotation and scale to labels and line coordinates',()=>{
  const tile=embedTestTile2D({sides:3,offset:[3,-1],rotation:90,scale:2},7);
  near(tile.vertices[0][0],3);near(tile.vertices[0][1],-1);
  near(tile.vertices[1][0],3);near(tile.vertices[1][1],1);
  const center:[number,number]=[tile.vertices.reduce((sum,point)=>sum+point[0],0)/3,
    tile.vertices.reduce((sum,point)=>sum+point[1],0)/3];
  const label=tile.graphics[0];
  assert.equal(label.kind,'text');if(label.kind==='text'){
    near(label.at[0],center[0]);near(label.at[1],center[1]);
    assert.equal(label.value,'7');
  }
  const vertexLabel=tile.graphics[1];assert.equal(vertexLabel.kind,'text');
  if(vertexLabel.kind==='text'){
    near(vertexLabel.at[0],.8*tile.vertices[0][0]+.2*center[0]);
    near(vertexLabel.at[1],.8*tile.vertices[0][1]+.2*center[1]);
  }
  const noIndices=embedTestTiling2D(TEST_TILE_IN2811_SPECS,false);
  assert.equal(noIndices[0].graphics.filter(item=>item.kind==='text').length,4);
  assert.equal(noIndices[0].graphics[0].kind,'text');
  assert.throws(()=>embedTestTile2D({...TEST_TILE_IN2811_SPECS[0],sides:2}),/边数/);
  assert.throws(()=>embedTestTile2D(TEST_TILE_IN2811_SPECS[0],0),/TileIndex/);
  assert.throws(()=>embedTestTile2D({...TEST_TILE_IN2811_SPECS[0],scale:Infinity}),/有限/);
  assert.throws(()=>embedTestTile2D({...TEST_TILE_IN2811_SPECS[0],sides:24,scale:1e308}),/有限/);
});

test('In[2809–2810] defaults suppress only center indices and maps an empty tiling to an empty list',()=>{
  const tiles=embedTestTiling2D(TEST_TILE_IN2811_SPECS);
  assert.equal(tiles[0].graphics.filter(item=>item.kind==='text').length,4);
  assert.ok(tiles.every(tile=>tile.graphics.every(item=>item.role!=='tile-index')));
  assert.deepEqual(embedTestTiling2D([]),[]);
  assert.throws(()=>embedTestTiling2D(Array.from({length:97},()=>TEST_TILE_IN2811_SPECS[0])),/96/);
});

test('the read-only Graphics transform permits signed or degenerate numeric scales without adopting paper',()=>{
  const reflected=embedTestTile2D({sides:4,offset:[3,-1],rotation:90,scale:-2},7);
  const expected=[[3,-1],[3,-3],[5,-3],[5,-1]];
  reflected.vertices.forEach((point,i)=>point.forEach((value,j)=>near(value,expected[i][j])));
  const center=reflected.graphics[0];assert.equal(center.kind,'text');
  if(center.kind==='text'){near(center.at[0],4);near(center.at[1],-2);}
  const zero=embedTestTile2D({sides:5,offset:[3,-1],rotation:37,scale:0},1);
  assert.ok(zero.vertices.every(point=>point[0]===3&&point[1]===-1));
  assert.ok(zero.graphics.every(item=>item.kind==='line'||item.at[0]===3&&item.at[1]===-1));
  assert.ok(zero.graphics.every(item=>item.kind==='text'||item.absoluteWidth===1));
});

test('numeric transforms preserve label positions independently for each tilespec',()=>{
  const tiles=embedTestTiling2D([
    {sides:4,offset:[3,-1],rotation:90,scale:2},
    {sides:3,offset:[-2,4],rotation:-30,scale:.5},
  ],true,{textColor:'#112233',lineColor:'#445566'});
  const first=tiles[0].graphics[1];assert.equal(first.kind,'text');
  if(first.kind==='text'){near(first.at[0],2.8);near(first.at[1],-.8);assert.equal(first.color,'#112233');}
  const second=tiles[1].graphics[1];assert.equal(second.kind,'text');
  if(second.kind==='text'){
    // local label 1 is (.1, sqrt(3)/30); scale then -30° rotation then offset.
    near(second.at[0],-2+Math.sqrt(3)/30);near(second.at[1],4);
  }
  const center=tiles[1].graphics[0];assert.equal(center.kind,'text');
  if(center.kind==='text'){assert.equal(center.value,'2');assert.equal(center.color,'#000000');}
  assert.ok(tiles.every(tile=>tile.graphics.at(-1)?.color==='#445566'));
});

test('the read-only preview exposes saved two-tile output without writing project state',()=>{
  const html=renderToStaticMarkup(createElement(TestTileSourcePreview));
  assert.match(html,/原版 TestTile 绘图 · In\[2811\]（只读）/);
  assert.match(html,/data-saved-in2811="true"/);
  assert.equal((html.match(/data-source-test-tile=/g)??[]).length,2);
  assert.equal((html.match(/data-source-test-outline=/g)??[]).length,2);
  assert.equal((html.match(/data-source-test-text=/g)??[]).length,10);
  assert.match(html,/data-source-test-text="1:tile-index"[^>]*fill="#000000"/);
  assert.match(html,/data-source-test-text="1:vertex-index"[^>]*fill="#1f140a"/);
  assert.match(html,/vector-effect="non-scaling-stroke"/);
  assert.match(html,/data-source-test-outline="1" points="0,0 1,0 1,-1 0,-1 0,0"/);
  assert.match(html,/data-source-test-text="1:vertex-index" x="0.1" y="-0.1"/);
});
