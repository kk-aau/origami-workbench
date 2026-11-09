import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatPresentation } from '../../src/app/flatPresentation';
import type { FlatFoldResult } from '../../src/core/types';
import { computeFlatFold } from '../../src/core/flatFold';
import { blankDoc } from '../../src/app/state';
import { splitIntersections } from '../../src/core/geometry';

const result: FlatFoldResult = {
  geometry: {status:'ready',message:'',vertices:[[10,0],[60,0],[10,20],[20,0],[20,20],[70,0]],faces:[[0,1,2],[3,4,5],[0,1,2]]},
  layers: {status:'solved',message:'',faceOrder:[1,2,0],faceOrders:[[1,0,1]]}, warnings:[],
};
test('back camera mirrors x while preserving bounds and y, and reverses paint order',()=>{
  const before=structuredClone(result),front=flatPresentation(result,'front'),back=flatPresentation(result,'back');
  assert.deepEqual(front.order,[1,2,0]);assert.deepEqual(back.order,[0,2,1]);
  assert.deepEqual(back.vertices,[[70,0],[20,0],[70,20],[60,0],[60,20],[10,0]]);
  assert.deepEqual(result,before);assert.notEqual(front.vertices,result.geometry.vertices);
  assert.notEqual(front.vertices[0],result.geometry.vertices[0]);
});
test('material front/back follows face orientation, not paint index',()=>{
  assert.deepEqual(flatPresentation(result,'front').frontMaterial,[true,false,true]);
  assert.deepEqual(flatPresentation(result,'back').frontMaterial,[false,true,false]);
});
test('missing, invalid or unconfirmed orders never become trusted opaque stacking',()=>{
  for(const faceOrder of [undefined,[0,1],[0,0,1],[0,1,3],[0,1,.5]]){
    const p=flatPresentation({...result,layers:{...result.layers,faceOrder}},'back');
    assert.equal(p.hasOrder,false);assert.deepEqual(p.order,[2,1,0]);
  }
  assert.equal(flatPresentation({...result,layers:{...result.layers,status:'timeout'}},'front').hasOrder,false);
});
test('empty results project safely and malformed geometry is rejected',()=>{
  const empty={...result,geometry:{...result.geometry,vertices:[],faces:[]},layers:{status:'unknown' as const,message:''}};
  assert.deepEqual(flatPresentation(empty,'back'),{vertices:[],order:[],hasOrder:false,frontMaterial:[]});
  assert.throws(()=>flatPresentation({...result,geometry:{...result.geometry,faces:[[0,1,99]]}},'front'),/无效/);
});
test('real folded solver result exposes the opposite bottom face from the back',()=>{
  const doc=blankDoc('对折',100,100);doc.segments.push({id:'m',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  doc.segments=splitIntersections(doc).segments;const solved=computeFlatFold(doc),before=structuredClone(solved);
  assert.equal(solved.layers.status,'solved');
  const front=flatPresentation(solved,'front'),back=flatPresentation(solved,'back');
  assert.equal(front.hasOrder,true);assert.equal(back.hasOrder,true);
  assert.equal(front.order.at(-1),back.order[0]);assert.notEqual(front.order.at(-1),back.order.at(-1));
  assert.deepEqual(solved,before);
});
