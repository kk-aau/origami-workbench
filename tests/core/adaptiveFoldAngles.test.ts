import test from 'node:test';
import assert from 'node:assert/strict';
import {solveAdaptiveFoldAngles} from '../../src/core/adaptiveFoldAngles';
import {solveRigidFoldGeometry,type RigidFoldPoint3} from '../../src/core/rigidFoldGeometry';
import type {FoldGraph} from '../../src/core/types';
type V=RigidFoldPoint3;
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a:V,s:number):V=>a.map(n=>n*s) as V;
const add=(a:V,b:V):V=>a.map((n,i)=>n+b[i]) as V;
const unit=(a:V)=>scale(a,1/Math.hypot(...a));
function spherical(theta:number){
  const s=Math.sqrt(3)/2,rays:V[]=[[1,0,0],[.5,s,0],[-s,.5,0],[0,-1,0]];
  const [u0,u1]=rays,u2=add(add(scale(rays[2],Math.cos(theta)),scale(cross(u1,rays[2]),Math.sin(theta))),scale(u1,dot(u1,rays[2])*(1-Math.cos(theta))));
  const projected=sub(u2,scale(u0,dot(u2,u0))),expected=dot(rays[2],rays[3]),n2=dot(projected,projected),base=scale(projected,expected/n2),height=Math.sqrt(1-expected*expected/n2),side=scale(unit(cross(u0,projected)),height),a=add(base,side),b=sub(base,side),u3=dot(a,rays[3])>dot(b,rays[3])?a:b;
  const world:V[]=[u0,u1,u2,u3,[0,0,0]],graph:FoldGraph={vertices_coords:rays.map(([x,y])=>[x,y]).concat([[0,0]]),edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]],edges_assignment:['B','B','B','B','U','U','U','U'],edges_foldAngle:[0,0,0,0,0,0,0,0],faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  const normals=graph.faces_vertices!.map(([a,b,c])=>unit(cross(sub(world[b],world[a]),sub(world[c],world[a]))));
  for(let ray=0;ray<4;ray++){
    const left=(ray+3)%4,right=ray,axis=unit(sub(world[4],world[ray]));
    graph.edges_foldAngle[ray+4]=Math.atan2(dot(normals[right],cross(normals[left],axis)),dot(normals[left],normals[right]))*180/Math.PI;
  }
  return {graph,world};
}


test('adaptive hinges recover a coupled spherical mechanism while preserving the driver',()=>{
 for(const theta of [.05,.3,.8,1.1]){
  const {graph}=spherical(theta),expected=[...graph.edges_foldAngle];
  graph.edges_assignment=graph.edges_assignment.map((a,e)=>a==='U'?(expected[e]!<0?'M':'V'):a);
  for(const e of [4,6,7])graph.edges_foldAngle[e]=null;
  const result=solveAdaptiveFoldAngles(graph);
  assert.equal(result[5],expected[5]);
  result.forEach((angle,e)=>assert(Math.abs(angle-expected[e]!)<1e-5,`${angle} != ${expected[e]}`));
  assert.equal(solveRigidFoldGeometry(graph,{edgesFoldAngle:result}).status,'ready');
  assert.equal(graph.edges_foldAngle[4],null);
 }
});
test('no driver and independent unrestrained hinges are not guessed',()=>{
 const {graph}=spherical(.8);graph.edges_assignment=graph.edges_assignment.map((a,e)=>a==='U'?(graph.edges_foldAngle[e]!<0?'M':'V'):a);graph.edges_foldAngle=graph.edges_foldAngle.map((a,e)=>e>=4?null:a);
 assert.throws(()=>solveAdaptiveFoldAngles(graph),/至少一条/);
 const strip:FoldGraph={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]],edges_assignment:['B','B','B','B','B','B','B','B','V','M'],edges_foldAngle:[0,0,0,0,0,0,0,0,60,null],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
 assert.throws(()=>solveAdaptiveFoldAngles(strip),/不足/);
});

test('bounded measured-angle corrections retain the driver and recover nearby rigid closure',()=>{
 const {graph}=spherical(.8),expected=graph.edges_foldAngle.map(a=>a??0);
 graph.edges_assignment=graph.edges_assignment.map((a,e)=>a==='U'?(expected[e]<0?'M':'V'):a);
 const initial=expected.map((a,e)=>e===4?a+.08:e===6?a-.06:e===7?a+.04:a);
 const angleBounds=initial.map((a,e):[number,number]|null=>e>=4?[Math.max(-180,a-.25),Math.min(180,a+.25)]:null);
 for(const e of [4,6,7])graph.edges_foldAngle[e]=null;
 const before=structuredClone(graph),result=solveAdaptiveFoldAngles(graph,{initial,angleBounds,allowUnderdetermined:true});
 assert.deepEqual(graph,before);assert.equal(result[5],expected[5]);
 result.forEach((a,e)=>{assert(Math.abs(a-expected[e])<1e-5);if(angleBounds[e])assert(a>=angleBounds[e]![0]&&a<=angleBounds[e]![1]);});
 assert.equal(solveRigidFoldGeometry(graph,{edgesFoldAngle:result}).status,'ready');
});

test('correction bounds reject a nearby but incompatible measured branch without changing targets',()=>{
 const {graph}=spherical(.8),expected=graph.edges_foldAngle.map(a=>a??0);
 graph.edges_assignment=graph.edges_assignment.map((a,e)=>a==='U'?(expected[e]<0?'M':'V'):a);
 const initial=[...expected];initial[4]+=.2;graph.edges_foldAngle[4]=null;
 const angleBounds=initial.map((a,e):[number,number]|null=>e===4?[a-.01,a+.01]:null),before=structuredClone(graph);
 assert.throws(()=>solveAdaptiveFoldAngles(graph,{initial,angleBounds,allowUnderdetermined:true}),/限定折角范围/);
 assert.deepEqual(graph,before);
 angleBounds[5]=[expected[5]+.1,expected[5]+.2];
 assert.throws(()=>solveAdaptiveFoldAngles(graph,{initial,angleBounds}),/驱动角冲突/);
});
