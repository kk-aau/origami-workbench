import test from 'node:test';
import assert from 'node:assert/strict';
import {installLayerPairScreening,screenLayerPairs,type LayerPairOptions} from '../../src/core/layerPairScreening';
import type {Bounds2} from '../../src/core/boundsIndex';

/** Original double-loop predicates: an independent ordering/boundary oracle. */
function originalPairs(boxes:readonly Bounds2[],options:LayerPairOptions):[number,number][]{
 const pairs:[number,number][]=[],padding=options.padding??0;
 for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
  const x=boxes[a],y=boxes[b];
  if(options.positiveArea){
   if(Math.min(x[2],y[2])-Math.max(x[0],y[0])<=0||Math.min(x[3],y[3])-Math.max(x[1],y[1])<=0)continue;
  }else if(x[0]>y[2]+padding||y[0]>x[2]+padding||x[1]>y[3]+padding||y[1]>x[3]+padding)continue;
  pairs.push([a,b]);
 }
 return pairs;
}
function screened(boxes:readonly Bounds2[],options:LayerPairOptions){
 const pairs:[number,number][]=[];
 const backend=screenLayerPairs(boxes,(a,b)=>pairs.push([a,b]),()=>{pairs.length=0;},options);
 return {pairs,backend};
}

test('CPU index preserves original pair order on deterministic mixed-scale boxes',()=>{
 installLayerPairScreening('cpu');
 try{
  let seed=0x398c17a;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(const count of [3,63,64,257]){
   const boxes:Bounds2[]=Array.from({length:count},(_,i)=>{
    const x=random()*16-8,y=random()*16-8,w=i%11===0?0:i%7===0?1e-12:random()*4,h=i%13===0?1e-12:random()*4;
    return [x,y,x+w,y+h];
   });
   const before=structuredClone(boxes);
   for(const options of [{},{positiveArea:true},{padding:1e-6},{padding:1e-6,positiveArea:true}]){
    const result=screened(boxes,options);
    assert.equal(result.backend,'cpu');assert.deepEqual(result.pairs,originalPairs(boxes,options));
   }
   assert.deepEqual(boxes,before);
  }
 }finally{installLayerPairScreening('cpu');}
});

test('touching, one-ULP gaps and extremely narrow boxes keep exact CPU predicates',()=>{
 const delta=Number.EPSILON;
 const special:Bounds2[]=[[0,0,1,1],[1,0,2,1],[1+delta,0,2,1],[1-delta,0,1,1],[0,1,1,2],[0,0,0,1],[-Number.MIN_VALUE,0,Number.MIN_VALUE,1]];
 // Force the indexed route without adding contacts to the boundary cases.
 const boxes:Bounds2[]=[...special,...Array.from({length:80},(_,i)=>[10+i*3,10,11+i*3,11] as const)];
 installLayerPairScreening('cpu');
 try{
  for(const options of [{},{positiveArea:true},{padding:delta},{padding:delta,positiveArea:true}])assert.deepEqual(screened(boxes,options).pairs,originalPairs(boxes,options));
  assert.ok(screened(boxes,{}).pairs.some(([a,b])=>a===0&&b===1));
  assert.ok(!screened(boxes,{positiveArea:true}).pairs.some(([a,b])=>a===0&&b===1));
  assert.ok(!screened(boxes,{}).pairs.some(([a,b])=>a===0&&b===2));
  assert.ok(screened(boxes,{padding:delta}).pairs.some(([a,b])=>a===0&&b===2));
  assert.ok(screened(boxes,{positiveArea:true}).pairs.some(([a,b])=>a===0&&b===6));
 }finally{installLayerPairScreening('cpu');}
});

test('auto and forced GPU retain every pair through CPU fallback without OffscreenCanvas',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas');
 Object.defineProperty(globalThis,'OffscreenCanvas',{value:undefined,writable:true,configurable:true});
 const boxes:Bounds2[]=Array.from({length:8192},(_,i)=>{const x=Math.floor(i/2)*4+(i%2);return [x,0,x+2,1];});
 const expected=Array.from({length:4096},(_,i)=>[2*i,2*i+1]);
 try{
  for(const backend of ['auto','gpu'] as const){
   installLayerPairScreening(backend);
   for(const options of [{},{positiveArea:true}]){
    const result=screened(boxes,options);assert.equal(result.backend,'cpu');assert.deepEqual(result.pairs,expected);
   }
  }
 }finally{
  installLayerPairScreening('cpu');
  if(descriptor)Object.defineProperty(globalThis,'OffscreenCanvas',descriptor);else Reflect.deleteProperty(globalThis,'OffscreenCanvas');
 }
});
