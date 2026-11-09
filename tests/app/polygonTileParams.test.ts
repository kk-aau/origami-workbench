import {test} from 'node:test';
import assert from 'node:assert/strict';
import {polygonTilePreset,readPolygonTileParams,POLYGON_VARIANTS} from '../../src/app/polygonTileParams';
import type {SplitVariant} from '../../src/app/splitParams';
import {tessPreset,readTessParams,changeTessParams} from '../../src/app/tessellation';

test('four exact polygon modes preserve coordinates and per-edge types through persistence',()=>{
 for(const variant of Object.keys(POLYGON_VARIANTS) as SplitVariant[]){
  const p=polygonTilePreset(variant);p.centralTypes=['M','V','M','V'];
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
  assert.deepEqual(readTessParams(changeTessParams(p,{width:.35})),{...p,width:.35});
 }
 assert.deepEqual(tessPreset('polygon-tile'),polygonTilePreset());
 for(const patch of [{centralTypes:['M']},{width:NaN},{width:.8,offset:.2},{tilt:0},{ccw:1},{polygon:[[0,0],[1,0],[.2,.2],[0,1]]}])assert.equal(readPolygonTileParams({...polygonTilePreset('general'),...patch}),null);
});

test('exact polygon source reads 13–24 convex sides and rejects a 25th',()=>{
 for(const sides of [13,16,24]){
  const polygon=Array.from({length:sides},(_,i)=>[Math.cos(i*2*Math.PI/sides),Math.sin(i*2*Math.PI/sides)] as [number,number]);
  const source={...polygonTilePreset(),polygon,centralTypes:Array(sides).fill('M')};
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(source))),source);
 }
 const polygon=Array.from({length:25},(_,i)=>[Math.cos(i*2*Math.PI/25),Math.sin(i*2*Math.PI/25)]);
 assert.equal(readPolygonTileParams({...polygonTilePreset(),polygon,centralTypes:Array(25).fill('M')}),null);
});

test('exact polygon persistence validates shape in its local scale',()=>{
 for(const scale of [1e-3,1e-6,1e-8])for(const [x,y] of [[0,0],[.125,-.375]]){
  const polygon=polygonTilePreset().polygon.map(p=>[x+p[0]*scale,y+p[1]*scale]);
  const source={...polygonTilePreset(),polygon};
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(source))),source);
  const concave=[[0,0],[1,0],[.2,.2],[0,1]].map(p=>[x+p[0]*scale,y+p[1]*scale]);
  assert.equal(readPolygonTileParams({...source,polygon:concave}),null);
 }
 assert.equal(readPolygonTileParams({...polygonTilePreset(),polygon:[[0,0],[0,0],[0,0]]}),null);
});
