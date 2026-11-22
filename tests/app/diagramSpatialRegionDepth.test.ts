import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialCellDepths,planSpatialRegionDepths,refineSeparatedSpatialDepth,SpatialDepth,type SpatialDepthPlane} from '../../src/app/diagramSpatialRegionDepth';
import type {SpatialDepthCell,SpatialDepthRequest} from '../../src/app/diagramSpatialDepthKernel';

const cell:SpatialDepthCell={polygon:[[0,0],[2,0],[0,2]],faces:[0,1]};
const flat=(z:number):SpatialDepthPlane=>({origin:[0,0,z],a:0,b:0,condition:1});

test('region comparisons use only its material faces and keep signed local depth and precision failures distinct',()=>{
  const comparison=(planes:(SpatialDepthPlane|null)[])=>spatialCellDepths(cell,planes,1e-12)[0];
  assert.equal(comparison([flat(1),flat(2)]),SpatialDepth.Behind);
  assert.equal(comparison([flat(1),flat(0)]),SpatialDepth.InFront);
  assert.equal(comparison([flat(1),flat(1+1e-12)]),SpatialDepth.Contact);
  assert.equal(comparison([{...flat(-1),a:1,condition:2},flat(0)]),SpatialDepth.Intersection);
  assert.equal(comparison([null,flat(0)]),SpatialDepth.EdgeOn);
  assert.equal(comparison([{...flat(0),b:NaN},flat(0)]),SpatialDepth.NonFinite);
  const planes=[flat(1),flat(3),flat(2),null];
  assert.deepEqual([...spatialCellDepths({...cell,faces:[2,0,1]},planes,0)],[1,-1,-1]);
});

test('depth refinement resolves a translated almost flat hinge without losing its gap to a shared camera offset',()=>{
  const x=400000,z=2**54;
  const region:SpatialDepthCell={faces:[0,1],polygon:[[x,0],[x+50,0],[x+50,100],[x,100]]};
  const base:SpatialDepthPlane={...flat(z),origin:[x,0,z]},slope=Math.tan(2e-8*Math.PI/180);
  const hinge={...base,a:slope};
  assert.equal(spatialCellDepths(region,[hinge,base],x*Number.EPSILON*512)[0],SpatialDepth.Contact);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,hinge,base),SpatialDepth.InFront);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,base,hinge),SpatialDepth.Behind);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,{...hinge,origin:[x+25,0,z]},base),SpatialDepth.Intersection);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,base,base),SpatialDepth.Contact);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,hinge,null),SpatialDepth.EdgeOn);
  assert.equal(refineSeparatedSpatialDepth(region.polygon,{...hinge,a:Infinity},base),SpatialDepth.NonFinite);
});

test('depth batches use local planes, preserve the original pair order and leave unavailable lanes for the inline pass',async()=>{
  const prior=globalThis.Worker;
  let copies=0,terminated=0,mode:'ready'|'unavailable'|'broken'='ready';
  class FixtureWorker{
    onmessage?:(event:{data:unknown})=>void;
    postMessage(request:SpatialDepthRequest){
      if(mode==='unavailable')throw Error('transport unavailable');
      copies+=request.planes.length;
      const signs=request.cells.map(cell=>spatialCellDepths(cell,request.planes,request.roundoff));
      queueMicrotask(()=>this.onmessage?.({data:{signs:mode==='broken'?[]:signs}}));
    }
    terminate(){terminated++;}
  }
  globalThis.Worker=FixtureWorker as unknown as typeof Worker;
  try{
    // Large rectangles drive a real lane split without allocating extra geometry.
    const n=1850,faces=Array.from({length:n},(_,i)=>2*i);
    const cells=Array.from({length:4},()=>({...cell,faces}));
    const planes=Array.from({length:2*n},(_,i)=>flat(i%3));
    assert.equal((await planSpatialRegionDepths([cell],planes,0,4)).size,0);
    assert.equal((await planSpatialRegionDepths(cells,planes,0,1)).size,0);
    const ready=await planSpatialRegionDepths(cells,planes,0,2),expected=spatialCellDepths(cells[0],planes,0);
    assert.equal(copies,n,'no duplicate planes within a lane or irrelevant faces');
    assert.equal(ready.size,4);
    for(const result of ready.values())assert.deepEqual(result,expected);
    mode='unavailable';
    assert.ok((await planSpatialRegionDepths(cells,planes,0,2)).size<4);
    mode='broken';
    await assert.rejects(planSpatialRegionDepths(cells,planes,0,2),/数据与纸面对不匹配/);
    assert.equal(terminated,3);
  }finally{globalThis.Worker=prior;}
});
