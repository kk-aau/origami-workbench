import test from 'node:test';
import assert from 'node:assert/strict';
import {overlappingSegmentPairs} from '../../src/core/segmentPairs';
import type {Point,Segment} from '../../src/core/types';

type Line=Pick<Segment,'a'|'b'>;
const line=(a:Point,b:Point):Line=>({a,b});
function exhaustivePairs(lines:Line[],epsilon:number):[number,number][]{
  const pairs:[number,number][]=[];
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
    const a=lines[i],b=lines[j];
    if(![a.a,a.b,b.a,b.b].every(p=>p.every(Number.isFinite)))continue;
    if(Math.max(a.a[0],a.b[0])+epsilon<Math.min(b.a[0],b.b[0])||Math.max(b.a[0],b.b[0])+epsilon<Math.min(a.a[0],a.b[0])
      ||Math.max(a.a[1],a.b[1])+epsilon<Math.min(b.a[1],b.b[1])||Math.max(b.a[1],b.b[1])+epsilon<Math.min(a.a[1],a.b[1]))continue;
    pairs.push([i,j]);
  }
  return pairs;
}

test('spatial candidate pairs match exhaustive bbox checks exactly and preserve source pair order',()=>{
  let seed=827365;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  for(let example=0;example<20;example++){
    const lines=Array.from({length:100},()=>line([random()*100,random()*100],[random()*100,random()*100]));
    lines.push(line([0,50],[100,50]),line([75,50],[25,50]),line([0,50+1e-8],[100,50+1e-8]),line([50,50],[50,50]),line([NaN,0],[10,10]));
    assert.deepEqual([...overlappingSegmentPairs(lines,1e-6)],exhaustivePairs(lines,1e-6));
  }
});

test('bbox epsilon admits touching and near-touching endpoints but excludes separated ones',()=>{
  const lines=[line([0,0],[1,0]),line([1,0],[2,0]),line([1+0.5e-6,0],[2,0]),line([1+2e-6,0],[2,0]),line([0,1],[1,1])];
  assert.deepEqual([...overlappingSegmentPairs(lines,1e-6)],[[0,1],[0,2],[1,2],[1,3],[2,3]]);
});

test('large sparse drawings find no spurious pairs when horizontal and vertical spans are mixed',()=>{
  // Both single-axis sweeps have a large active set. The boxes are separated
  // in two dimensions, so the actual number of pairs is zero.
  const lines:Line[]=[];
  for(let i=0;i<25000;i++){
    lines.push(line([0,i*2],[10000,i*2]),line([20000+i*2,60000],[20000+i*2,100000]));
  }
  assert.deepEqual([...overlappingSegmentPairs(lines,1e-6)],[]);
});
