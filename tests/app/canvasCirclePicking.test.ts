import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,DrawingObject,Point,Segment} from '../../src/core/types';
import {circleCircumferenceDistance,pickCircle,pickCircleCircumference,circleIdsInBox,type CircleObject} from '../../src/app/circleTools';
import {pickCanvasObject} from '../../src/app/canvasObjectPicking';

const circle=(id='circle',center:Point=[0,0],radius=10):CircleObject=>({id,kind:'circle',center,radius,color:'#367d86'});
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:0});
const doc=(segments:Segment[]=[],objects:DrawingObject[]=[circle()]):Doc=>({name:'辅助圆拾取',paper:{width:100,height:100},segments,objects});

test('general circle selection measures circumference, excludes center and interior, and includes tolerance from either side',()=>{
  const source=circle();
  assert.equal(circleCircumferenceDistance(source,[0,0]),10);
  assert.equal(circleCircumferenceDistance(source,[10,0]),0);
  assert.equal(pickCircleCircumference([source],[0,0],1),undefined);
  assert.equal(pickCircleCircumference([source],[2,3],1),undefined);
  assert.equal(pickCircleCircumference([source],[9.5,0],0.5)?.id,'circle');
  assert.equal(pickCircleCircumference([source],[10.5,0],0.5)?.id,'circle');
  assert.equal(pickCircleCircumference([source],[10.5,0],0.49),undefined);
});

test('construction and circle editing keep the old center fallback',()=>{
  const source=circle();
  assert.equal(pickCircle([source],[0,0],1)?.id,'circle');
  assert.equal(pickCircleCircumference([source],[0,0],1),undefined);
  assert.equal(pickCanvasObject(doc(),[0,0],1),undefined);
});

test('coincident circle ties are stable by ID in both input orders and concentric curves choose the nearest circumference',()=>{
  const first=circle('z'),second=circle('a');
  for(const objects of [[first,second],[second,first]])assert.equal(pickCircleCircumference(objects,[10,0],0)?.id,'a');
  const outer=circle('outer',[0,0],20);
  assert.equal(pickCircleCircumference([first,outer],[19,0],2)?.id,'outer');
  assert.equal(pickCircleCircumference([outer,first],[11,0],2)?.id,'z');
});

test('circle queries ignore text/mark objects and auxiliary visibility',()=>{
  const objects:DrawingObject[]=[circle(),{id:'mark',kind:'mark',a:[0,0],b:[20,0],color:'#000000'},
    {id:'text',kind:'text',position:[10,0],text:'label',fontSize:5,color:'#000000'}];
  assert.equal(pickCircleCircumference(objects,[10,0],0)?.id,'circle');
  assert.equal(pickCircleCircumference(objects,[10,0],0,false),undefined);
  assert.deepEqual(circleIdsInBox(objects,[-20,-20],[20,20]),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[-20,-20],[20,20],'contained',false),new Set());
});

test('rightward boxes require the complete circle, including its curved extrema',()=>{
  const objects=[circle()];
  assert.deepEqual(circleIdsInBox(objects,[-10,-10],[10,10]),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[-9.9,-10],[10,10]),new Set());
  assert.deepEqual(circleIdsInBox(objects,[-10,-9.9],[10,10]),new Set());
  assert.deepEqual(circleIdsInBox(objects,[9,-1],[11,1]),new Set());
});

test('leftward boxes include a partial circumference crossing, tangency and a wholly contained circle',()=>{
  const objects=[circle()];
  assert.deepEqual(circleIdsInBox(objects,[11,1],[9,-1]),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[12,1],[10,-1]),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[20,20],[-20,-20]),new Set(['circle']));
});

test('crossing selection excludes a small box contained entirely in the circular disk',()=>{
  const objects=[circle()];
  assert.deepEqual(circleIdsInBox(objects,[1,1],[-1,-1]),new Set());
  assert.deepEqual(circleIdsInBox(objects,[5,5],[-5,-5]),new Set());
  assert.deepEqual(circleIdsInBox(objects,[9,1],[7,-1]),new Set());
  assert.deepEqual(circleIdsInBox(objects,[11,11],[9,9]),new Set(),'bounding box overlap alone is not circumference contact');
});

test('degenerate crossing rectangles use real circle contact, never center inclusion',()=>{
  const objects=[circle()];
  assert.deepEqual(circleIdsInBox(objects,[-11,0],[11,0],'touching'),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[-1,0],[1,0],'touching'),new Set());
  assert.deepEqual(circleIdsInBox(objects,[10,0],[10,0],'touching'),new Set(['circle']));
  assert.deepEqual(circleIdsInBox(objects,[0,0],[0,0],'touching'),new Set());
  assert.deepEqual(circleIdsInBox(objects,[-11,0],[11,0],'contained'),new Set());
});

test('circle tangency tolerates floating point arithmetic at diagonal corners and large translated locations',()=>{
  assert.deepEqual(circleIdsInBox([circle('diagonal',[0,0],Math.SQRT2)],[1,1],[1,1],'touching'),new Set(['diagonal']));
  const origin=999999,radius=1e-6;
  assert.deepEqual(circleIdsInBox([circle('small',[origin,origin],radius)],
    [origin+radius,origin-radius],[origin+2*radius,origin+radius],'touching'),new Set(['small']));
});

test('nearest-object picking compares true segment and circle distances instead of giving circles unconditional priority',()=>{
  const source=doc([segment('line',[0,1],[20,1])]);
  assert.deepEqual(pickCanvasObject(source,[10,0],2),{kind:'circle',id:'circle',distance:0});
  assert.deepEqual(pickCanvasObject(source,[10,1],2),{kind:'segment',id:'line',distance:0});
  const near=doc([segment('line',[0,0.8],[20,0.8])]);
  assert.equal(pickCanvasObject(near,[10,1],2)?.kind,'circle');
  assert.equal(pickCanvasObject(near,[10.5,0.8],2)?.kind,'segment');
});

test('exact cross-kind ties preserve segment priority and same-kind segment/circle ties stay deterministic',()=>{
  const first=segment('z-line',[0,0],[20,0]),second=segment('a-line',[0,0],[20,0]);
  for(const segments of [[first,second],[second,first]])for(const objects of [[circle('z-circle'),circle('a-circle')],[circle('a-circle'),circle('z-circle')]]){
    assert.deepEqual(pickCanvasObject(doc(segments,objects),[10,0],0),{kind:'segment',id:'a-line',distance:0});
    assert.deepEqual(pickCanvasObject(doc([],objects),[10,0],0),{kind:'circle',id:'a-circle',distance:0});
  }
});

test('boundary locking is applied before comparing an editable circle with a CP stroke',()=>{
  const source=doc([segment('paper-edge',[0,0],[20,0],'B')]);
  assert.equal(pickCanvasObject(source,[10,0],0,false)?.kind,'segment');
  assert.equal(pickCanvasObject(source,[10,0],0,true)?.kind,'circle');
});

test('all layer combinations filter both auxiliary circles and segments without touching the source',()=>{
  const source=doc([segment('main',[0,1],[20,1]),segment('aux',[0,0.5],[20,0.5],'A')]),before=structuredClone(source);
  assert.equal(pickCanvasObject(source,[10,0],2,false,{main:true,auxiliary:true})?.kind,'circle');
  assert.deepEqual(pickCanvasObject(source,[10,0],2,false,{main:true,auxiliary:false}),{kind:'segment',id:'main',distance:1});
  assert.equal(pickCanvasObject(source,[10,0],2,false,{main:false,auxiliary:true})?.kind,'circle');
  assert.equal(pickCanvasObject(source,[10,0],2,false,{main:false,auxiliary:false}),undefined);
  assert.deepEqual(source,before);
});

test('invalid query coordinates, tolerances and malformed circle geometry produce no false hits',()=>{
  const objects=[circle()];
  for(const tolerance of [-1,NaN,Infinity,-Infinity]){
    assert.equal(pickCircleCircumference(objects,[10,0],tolerance),undefined);
    assert.equal(pickCanvasObject(doc(),[10,0],tolerance),undefined);
  }
  for(const value of [NaN,Infinity,-Infinity]){
    assert.equal(pickCircleCircumference(objects,[value,0],2),undefined);
    assert.deepEqual(circleIdsInBox(objects,[value,0],[20,20],'touching'),new Set());
  }
  for(const malformed of [circle('zero',[0,0],0),circle('nan',[0,0],NaN),circle('center',[Infinity,0],10)]){
    assert.equal(circleCircumferenceDistance(malformed,[10,0]),Infinity);
    assert.equal(pickCircleCircumference([malformed],[10,0],100),undefined);
    assert.deepEqual(circleIdsInBox([malformed],[-100,-100],[100,100],'touching'),new Set());
  }
});

test('circle picking and frame queries never mutate objects, segments or query points',()=>{
  const source=doc([segment('line',[0,1],[20,1])]),a:Point=[-20,-20],b:Point=[20,20],point:Point=[10,0];
  const before=structuredClone({source,a,b,point});
  pickCircleCircumference(source.objects!,point,1);pickCanvasObject(source,point,1);
  const ids=circleIdsInBox(source.objects!,a,b);ids.clear();
  assert.deepEqual({source,a,b,point},before);
});
