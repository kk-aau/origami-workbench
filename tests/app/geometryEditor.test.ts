import assert from 'node:assert/strict';
import test from 'node:test';
import {fitGeometryView,geometryDisplay,geometryFrame,geometryInsertIndex,geometryNumber,geometrySource,geometryTicks,geometryTickStep,snapGeometryPoint,zoomGeometryView} from '../../src/app/geometryEditor';
import type {XY} from '../../src/app/tessellation';

test('geometry coordinate mapping remains reversible for tiny sections and translated coordinates',()=>{
  const cases:XY[][]=[[[0,0],[4,2]],[[0,0],[4e-12,2e-12]],[[-99,-98],[-98.99999,-97.99998]],[[1e10,-1e10],[1e10+2,-1e10+4]]];
  for(const points of cases){
    const frame=geometryFrame(points);
    assert.ok(Number.isFinite(frame.unit)&&frame.unit>0);
    for(const invert of [false,true])for(const p of points){
      const shown=geometryDisplay(p,frame,invert),restored=geometrySource(shown,frame,invert);
      for(const i of [0,1])assert.ok(Math.abs(restored[i]-p[i])<=Math.max(frame.unit*1e-12,Math.abs(p[i])*Number.EPSILON));
    }
  }
});

test('geometry frame uses a common scale and supports mathematical upward Y',()=>{
  const frame=geometryFrame([[3,7],[5,12]]);
  const origin=geometryDisplay([3,7],frame,true),diagonal=geometryDisplay([4,8],frame,true);
  assert.ok(Math.abs(diagonal[0]-origin[0]+diagonal[1]-origin[1])<1e-12);
  assert.ok(diagonal[1]<origin[1]);
  assert.deepEqual(geometrySource(diagonal,frame,true),[4,8]);
});

test('empty editor frame remains finite before seed points are added',()=>{
  const frame=geometryFrame([]),view=fitGeometryView([],frame,1.5);
  assert.deepEqual(frame,{origin:[0,0],unit:1});
  assert.ok(view.center.every(Number.isFinite)&&Number.isFinite(view.span)&&view.span>0);
});

test('fit view contains all points with margin across tall and wide viewports',()=>{
  const points:XY[]=[[-7,-2],[12,1],[1,4]],frame=geometryFrame(points);
  for(const aspect of [.2,1,4])for(const invert of [false,true]){
    const view=fitGeometryView(points,frame,aspect,invert);
    for(const p of points){const [x,y]=geometryDisplay(p,frame,invert);assert.ok(Math.abs(x-view.center[0])<view.span*aspect/2);assert.ok(Math.abs(y-view.center[1])<view.span/2);}
  }
});

test('automatic tick spacing is positive and bounds the visible grid density',()=>{
  for(const span of [1e-12,1e-5,.1,1,500,1e10]){
    const step=geometryTickStep(span),ticks=geometryTicks(-span/2,span/2,step);
    assert.ok(step>0&&Number.isFinite(step));
    assert.ok(ticks.length>0&&ticks.length<=12);
    assert.equal(new Set(ticks).size,ticks.length);
  }
  assert.deepEqual(geometryTicks(0,10,1e-6),[]);
  assert.deepEqual(geometryTicks(0,1,0),[]);
});

test('deep zoom ticks preserve distinct source coordinates near a translated origin',()=>{
  const low=19.9999999999,high=20,step=1e-11,ticks=geometryTicks(low,high,step);
  assert.ok(ticks.length>=8);
  assert.equal(new Set(ticks).size,ticks.length,'rounding must not collapse nearby translated ticks');
  assert.ok(ticks.every((tick,i)=>!i||tick>ticks[i-1]));
});

test('tick labels retain enough digits to distinguish adjacent ticks at deep zoom',()=>{
  for(const [value,step] of [[.00008123,1e-10],[10.000000000001,1e-13],[1e6,1e-2]]){
    assert.notEqual(geometryNumber(value,step),geometryNumber(value+step,step));
  }
});

test('snapping chooses source vertices before grid and then clamps to coordinate limits',()=>{
  const options={step:.5,grid:true,vertices:[[.3,.3],[.7,.8]] as XY[],radius:.12,min:-1,max:1};
  assert.deepEqual(snapGeometryPoint([.32,.29],options),[.3,.3]);
  assert.deepEqual(snapGeometryPoint([.58,-.7],options),[.5,-.5]);
  assert.deepEqual(snapGeometryPoint([2.2,-2.2],options),[1,-1]);
  assert.deepEqual(snapGeometryPoint([.32,.29],{...options,grid:false,vertices:[]}),[.32,.29]);
  assert.deepEqual(snapGeometryPoint([.32,.29],{...options,vertices:[],step:Number.MIN_VALUE}),[.32,.29]);
});

test('zoom preserves the pointer anchor and does not pan at the span limits',()=>{
  const anchor:XY=[.4,.8],before={center:[.2,.3] as XY,span:1};
  for(const factor of [.5,2]){
    const after=zoomGeometryView(before,factor,anchor);
    for(const i of [0,1])assert.ok(Math.abs((anchor[i]-before.center[i])/before.span-(anchor[i]-after.center[i])/after.span)<1e-12);
  }
  for(const [span,factor] of [[1e-9,.5],[1e9,2]]){
    const limited={center:[.2,.3] as XY,span};
    assert.deepEqual(zoomGeometryView(limited,factor,anchor),limited);
  }
  const partial=zoomGeometryView({...before,span:1.1e-9},.5,anchor);
  assert.equal(partial.span,1e-9);
  assert.ok(Math.abs((anchor[0]-partial.center[0])/partial.span-(anchor[0]-before.center[0])/1.1e-9)<1e-6);
});

test('insertion preserves ordered internal and closing segments',()=>{
  const polygon:XY[]=[[0,0],[2,0],[2,2],[0,2]];
  assert.equal(geometryInsertIndex(polygon,[1,0],true),1);
  assert.equal(geometryInsertIndex(polygon,[2,1],true),2);
  assert.equal(geometryInsertIndex(polygon,[0,1],true),4);
  assert.equal(geometryInsertIndex([[0,0],[1,1],[1,2]],[1,1.5]),2);
});

test('open profiles can extend beyond their endpoint without reversing the point order',()=>{
  const points:XY[]=[[0,0],[1,1],[1,2]];
  assert.equal(geometryInsertIndex(points,[1,3]),3);
  assert.equal(geometryInsertIndex(points,[-1,-1]),0);
  assert.equal(geometryInsertIndex(points,[1,1.5]),2);
});
