import test from 'node:test';
import assert from 'node:assert/strict';
import {layerThreeCycles} from '../../src/core/layerThreeCycles';
import {faceRelationComponents} from '../../src/core/faceRelationComponents';

test('directional intersections preserve every cyclic overlap triple and its original order',()=>{
 let random=19;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 for(let round=0;round<120;round++){
  const n=3+Math.floor(next()*42),overlap=Array.from({length:n},()=>[] as number[]),pairs:[number,number][]=[],matrix=Array.from({length:n},()=>new Uint8Array(n));
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)if(next()<.65){overlap[a].push(b);overlap[b].push(a);pairs.push([a,b]);matrix[a][b]=next()<.5?1:2;}
  const values=Uint8Array.from(pairs.map(([a,b])=>matrix[a][b])),{component,sizes}=faceRelationComponents(n,pairs,values),expected:number[][]=[];
  for(let a=0;a<n;a++)for(const b of overlap[a])if(b>a)for(const c of overlap[b])if(c>b&&matrix[a][c]&&matrix[a][b]===matrix[b][c]&&matrix[a][b]!==matrix[a][c])expected.push([a,b,c]);
  assert.deepEqual([...layerThreeCycles(overlap,(a,b)=>matrix[a][b],component,sizes)],expected);
 }
});

test('acyclic components and an incomplete overlap triangle produce no false cycle',()=>{
 const overlap=[[1,2],[0,2,3],[0,1,3],[1,2]],pairs:[number,number][]=[[0,1],[0,2],[1,2],[1,3],[2,3]],values=Uint8Array.from([1,1,1,2,1]);
 const {component,sizes}=faceRelationComponents(4,pairs,values),value=(a:number,b:number)=>values[pairs.findIndex(([x,y])=>x===a&&y===b)];
 assert.deepEqual([...layerThreeCycles(overlap,value,component,sizes)],[[1,2,3]]);
});
