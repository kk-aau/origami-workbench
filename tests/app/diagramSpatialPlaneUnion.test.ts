import assert from 'node:assert/strict';
import test from 'node:test';
import type {Point} from '../../src/core/types';
import {polygonArea} from '../../src/core/geometry';
import {cutPlaneUnion,materialUnionContours,projectedUnionRegions,planeUnionOrder,type SpatialPlaneUnion} from '../../src/app/diagramSpatialPlaneUnion';

const rectangle=(l:number,b:number,r:number,t:number):Point[]=>[[l,b],[r,b],[r,t],[l,t]];
function merge(faces:Point[][],holes:Point[][][]=[]){
  const vertices:Point[]=[];
  const indices=(ring:Point[])=>ring.map(p=>vertices.push(p)-1);
  const outer=faces.map(indices),inner=outer.map((_,i)=>(holes[i]??[]).map(indices));
  return materialUnionContours(vertices,outer,inner);
}
const flat=(contours:Point[][]):SpatialPlaneUnion=>({root:0,origin:[0,0,0],x:[1,0,0],y:[0,1,0],normal:[0,0,1],contours});
const area=(rings:Point[][])=>rings.reduce((sum,ring)=>sum+polygonArea(ring),0);
const identity=(p:readonly number[])=>p;

test('overlapping, adjacent and coincident layers supply one finite union to the camera',()=>{
  const pieces=[rectangle(0,0,3,2),rectangle(1,0,4,2),rectangle(4,0,6,2),rectangle(0,0,3,2)];
  for(const faces of [pieces,[...pieces].reverse(),[rectangle(0,0,6,2)]]){
    const rings=merge(faces);
    assert.equal(rings.length,1);
    assert.equal(area(rings),12);
    for(const [x,y] of rings[0])assert.ok(x===0||x===6||y===0||y===2);
    const {cells}=projectedUnionRegions([flat(rings),flat([rectangle(1,-1,5,3)])],identity);
    assert.equal(cells.length,1);
    assert.deepEqual(cells[0].faces,[0,1]);
    assert.equal(polygonArea(cells[0].polygon),8);
  }
});

test('an island within a union hole occludes only the material it fills',()=>{
  const rings=merge([rectangle(0,0,8,8),rectangle(3,3,4,4)],[[rectangle(2,2,6,6)]]);
  assert.deepEqual(rings.map(polygonArea).sort((a,b)=>a-b),[-16,1,64]);
  const probe=flat([rectangle(2.5,2.5,5,5)]);
  for(const camera of [identity,(p:readonly number[])=>[-p[0],p[1],-p[2]]]){
    const {cells}=projectedUnionRegions([flat(rings),probe],camera);
    assert.equal(cells.length,1);
    assert.equal(polygonArea(cells[0].polygon),1);
  }
  assert.equal(merge([rectangle(0,0,1,1),rectangle(1,1,2,2)]).length,2);
});

test('the splitter divides the finite union and keeps holes on the proper side',()=>{
  const paper=flat(merge([rectangle(-3,-2,3,2)],[[rectangle(1,-1,2,1)]]));
  const splitter:SpatialPlaneUnion={...flat([rectangle(-3,-3,3,3)]),x:[0,1,0],y:[0,0,1],normal:[1,0,0]};
  const cut=cutPlaneUnion(paper,splitter);
  assert.equal(area(cut.positive),10);
  assert.equal(area(cut.negative),12);
  const project=(p:readonly number[])=>[p[0]-p[2],p[1],p[2]];
  const base={origin:[0,0,0],condition:1,b:0};
  const order=planeUnionOrder(paper,splitter,{...base,a:0,normalSign:1},{...base,a:-1,normalSign:1},project,project);
  assert.equal(order.whole,0);
  assert.equal(order.at(rectangle(1,0,2,1)),1);
  assert.equal(order.at(rectangle(-2,0,-1,1)),-1);
  assert.equal(order.at(rectangle(-2,0,2,1)),2);
});
