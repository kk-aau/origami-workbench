import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleContactPieces,polygonSeamWidth} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/contactVisibility';
import type {BspItem,Vec3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/bsp';
const face=(ref:number,points:number[][]):BspItem=>({kind:0,ref,points:points.map(([x,y])=>[x,y,0])});
const contains=(points:Vec3[],x:number,y:number)=>{
  let yes=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
};
test('independent overlap cells may form a global cycle without changing each other or a distant sheet',()=>{
  const items=[face(0,[[0,0],[8,0],[8,2],[0,2]]),face(1,[[6,0],[8,0],[8,8],[6,8]]),face(2,[[0,0],[2,0],[8,6],[8,8]]),face(3,[[100,100],[105,100],[100,105]])];
  const snapshot=structuredClone(items),calls:number[][]=[];
  const pieces=visibleContactPieces(items,{owners:item=>[item.ref],compare:(a,b)=>{
    assert.ok(a.ref!==3&&b.ref!==3,'non-overlapping paper must not take part in a contact comparison');calls.push([a.ref,b.ref]);
    return (a.ref+1)%3===b.ref?1:-1;
  }});
  for(const [x,y,expected] of [[7,1,0],[7,6,1],[1,1,2],[101,101,3]]){
    const owners=pieces.filter(p=>contains(p.points,x,y)).map(p=>p.ref);assert.deepEqual(owners,[expected]);
  }
  assert.ok(calls.length);assert.deepEqual(items,snapshot);
});
test('a physically crossing pair is split by depth instead of forcing either whole sheet above the other',()=>{
  const a=face(0,[[0,0],[4,0],[4,4],[0,4]]),b=face(1,[[0,0],[4,0],[4,4],[0,4]]);
  b.points=b.points.map(([x,y])=>[x,y,x-2]);
  const pieces=visibleContactPieces([a,b],{owners:p=>[p.ref],compare:()=>0});
  assert.deepEqual(pieces.filter(p=>contains(p.points,1,2)).map(p=>p.ref),[0]);
  assert.deepEqual(pieces.filter(p=>contains(p.points,3,2)).map(p=>p.ref),[1]);
});
test('fragment seam ink is bounded by fragment width and cannot turn a zero-area boundary into a visible line',()=>{
  assert.equal(polygonSeamWidth([[0,0],[10,0],[20,0]],.5),0);
  assert.equal(polygonSeamWidth([[0,0],[10,0],[10,10],[0,10]],.5),.5);
  const width=polygonSeamWidth([[0,0],[100,0],[100,1e-10]],.5);
  assert.ok(width>0&&width<1e-10);
});
