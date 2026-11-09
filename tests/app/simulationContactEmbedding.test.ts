import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyContactEmbedding,createContactEmbeddingVerifier} from '../../src/engine/simContactEmbedding';

function grid(n:number){
  const positions:number[]=[],indices:number[]=[];
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push(x/n,y/n,0);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,b,d,a,d,c);}
  return {positions:Float64Array.from(positions),indices:Uint32Array.from(indices)};
}

test('a refined curved disk retains a complete embedding certificate without treating its panels as rigid',()=>{
  const {indices,positions}=grid(16),last=positions.slice();
  for(let v=0;v<last.length/3;v++)last[v*3+2]=Math.sin(positions[v*3]*Math.PI)*Math.sin(positions[v*3+1]*Math.PI)*.4;
  assert.equal(certifyContactEmbedding(indices,positions,last),true);
  assert.equal(certifyContactEmbedding(indices,last,positions),true);
  const stationary=createContactEmbeddingVerifier(indices);assert.equal(stationary(last,last),true);
});

test('all coordinate-plane projections and clockwise orientation are supported',()=>{
  const {indices,positions}=grid(2);
  for(const perm of [[0,1,2],[0,2,1],[2,0,1]])for(const flipped of [false,true]){
    const from=Float64Array.from(positions,(_,i)=>positions[Math.floor(i/3)*3+perm[i%3]]),to=from.map((v,i)=>v+(i%3===perm.indexOf(2)?.2:0));
    const topology=flipped?Uint32Array.from(indices,(_,i)=>indices[Math.floor(i/3)*3+2-i%3]):indices;
    assert.equal(certifyContactEmbedding(topology,from,to),true);
  }
});

test('legal endpoints cannot hide an intermediate triangle collapse during a 180-degree turn',()=>{
  const indices=new Uint32Array([0,1,2]),first=new Float64Array([-1,0,0,1,0,0,0,1,0]);
  const last=first.map((v,i)=>i%3===2?v:-v);
  assert.equal(certifyContactEmbedding(indices,first,first),true);
  assert.equal(certifyContactEmbedding(indices,last,last),true);
  assert.equal(certifyContactEmbedding(indices,first,last),false,'the affine midpoint has zero projected area');
});

test('positive triangles of a winding fan do not permit a crossing boundary',()=>{
  const positions=[0,0,0],indices:number[]=[];
  for(let v=0;v<5;v++){const angle=v*4*Math.PI/5;positions.push(Math.cos(angle),Math.sin(angle),0);indices.push(0,v+1,(v+1)%5+1);}
  // Every fan sector has a positive determinant; the outer pentagram still
  // crosses itself and must not authorize interpenetrating material.
  assert.equal(certifyContactEmbedding(Uint32Array.from(indices),positions,positions),false);
});

test('cached topology cannot survive index mutation, disconnected sheets or a duplicated face',()=>{
  const {indices,positions}=grid(1),verify=createContactEmbeddingVerifier(indices);
  assert.equal(verify(positions,positions),true);
  indices[1]=indices[0];assert.equal(verify(positions,positions),false);
  assert.equal(certifyContactEmbedding(new Uint32Array([0,1,2,3,4,5]),[0,0,0,1,0,0,0,1,0,0,0,1,1,0,1,0,1,1],[0,0,0,1,0,0,0,1,0,0,0,1,1,0,1,0,1,1]),false);
  assert.equal(certifyContactEmbedding(new Uint32Array([0,1,2,0,1,2]),[0,0,0,1,0,0,0,1,0],[0,0,0,1,0,0,0,1,0]),false);
});

test('roundoff, invalid coordinates and malformed input cannot become a separation proof',()=>{
  const {indices,positions}=grid(1),large=positions.map((v,i)=>v+(i%3===2?0:1e12));
  assert.equal(certifyContactEmbedding(indices,large,large),false,'translation cancellation lacks enough numerical margin');
  const bad=positions.slice();bad[0]=NaN;assert.equal(certifyContactEmbedding(indices,positions,bad),false);
  assert.equal(certifyContactEmbedding(indices,positions,positions,-1),false);
  assert.equal(certifyContactEmbedding(indices,positions,positions,1e-8,0),false);
  assert.equal(certifyContactEmbedding(indices,positions,new Float64Array(6)),false);
  assert.equal(certifyContactEmbedding(new Uint32Array([0,1]),positions,positions),false);
});

test('a moving folded flap with a shared boundary is accepted while it remains a projected disk',()=>{
  const first=new Float64Array([-1,-1,0,0,-1,0,1,-1,0,1,1,0,0,1,0,-1,1,0]);
  const indices=new Uint32Array([0,1,4,0,4,5,1,2,3,1,3,4]),last=first.slice();
  for(const v of [2,3]){last[v*3]=Math.cos(Math.PI/3);last[v*3+2]=Math.sin(Math.PI/3);}
  assert.equal(certifyContactEmbedding(indices,first,last),true);
});
