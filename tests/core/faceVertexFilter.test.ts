import test from 'node:test';
import assert from 'node:assert/strict';
import {faceVertexFilterData,faceVertexPredicate} from '../../src/core/faceVertexFilter';
import type {Point} from '../../src/core/types';

test('float side witnesses preserve accepted vertices, both windings and tiny all-false faces',()=>{
 const points:Point[]=[[0,0],[4,0],[4,4],[0,4],[1e-11,0],[0,1e-11],[0,0],[4,4],[8,8],[2,2]];
 let seed=20261115;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<2048;i++)points.push([random()*16-6,random()*16-6]);
 const faces=[[0,1,2,3],[3,2,1,0],[0,4,5],[0,0,0],[0,1,2,0,3]];
 for(const scale of [2**-85,1,1e6]){
  const coords:Point[]=points.map(([x,y])=>[x*scale,y*scale]);
  const epsilon=1e-6*scale*scale,data=faceVertexFilterData(coords,faces,epsilon)!;
  let rejected=0;
  for(let f=0;f<faces.length;f++){
   const accepts=faceVertexPredicate(coords,faces[f],epsilon);
   const r=Math.fround;
   for(let v=0;v<coords.length;v++){
    const p=coords[v],sides=Array.from({length:4},(_,k)=>{
     const [ax,ay,dx,dy]=data.edges.subarray(f*16+k*4,f*16+k*4+4);
     return r(r(dx*r(r(p[1])-ay))-r(dy*r(r(p[0])-ax)));
    });
    if(Math.max(...sides)>data.tolerance&&Math.min(...sides)<-data.tolerance){
     assert.equal(accepts(v),false);rejected++;
    }
   }
  }
  if(scale>=1)assert.ok(rejected>1000);
  assert.equal(faceVertexPredicate(coords,faces[3],epsilon)(8),true);
 }
 assert.equal(faceVertexFilterData([[Infinity,0]],[[0,0,0]],0),null);
});
