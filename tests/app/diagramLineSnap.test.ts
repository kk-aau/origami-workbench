import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {snapDiagramLinePoint} from '../../src/app/diagramLineSnap';

const line=(id:string,a:Point,b:Point):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'crease',color:'#333333',width:.4});
const close=(actual:number,expected:number,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const pointClose=(actual:Point,expected:Point)=>{close(actual[0],expected[0]);close(actual[1],expected[1]);};
const at=(angle:number,length:number):Point=>[Math.cos(angle*Math.PI/180)*length,Math.sin(angle*Math.PI/180)*length];

test('a nearby finite reference offers the exact perpendicular foot and the right-angle geometry',()=>{
  const reference=line('edge',[0,0],[100,0]);
  const result=snapDiagramLinePoint([40.5,.4],{anchor:[40,50],lines:[reference],radius:2})!;
  assert.equal(result.kind,'perpendicular');pointClose(result.point,[40,0]);pointClose(result.vertex,[40,0]);
  pointClose(result.direction,[0,-1]);close(result.direction[0]*result.referenceDirections[0][0]+result.direction[1]*result.referenceDirections[0][1],0);
  assert.deepEqual(result.references,[{id:'edge',a:[0,0],b:[100,0]}]);assert.ok(result.label.includes('90°'));
});

test('a line through the anchor snaps to its perpendicular direction without forcing an endpoint',()=>{
  const result=snapDiagramLinePoint([40.5,31],{anchor:[40,0],lines:[line('edge',[0,0],[100,0])],radius:2})!;
  assert.equal(result.kind,'perpendicular');pointClose(result.point,[40,31]);pointClose(result.vertex,[40,0]);pointClose(result.direction,[0,1]);
});

test('perpendicular directions can originate close to a finite edge, with the marker at the actual foot',()=>{
  const result=snapDiagramLinePoint([40.4,30],{anchor:[40,1],lines:[line('edge',[0,0],[100,0])],radius:2})!;
  pointClose(result.point,[40,30]);pointClose(result.vertex,[40,0]);
  const angled=snapDiagramLinePoint([9.8,10.2],{anchor:[4,4],lines:[line('diagonal',[-10,10],[10,-10])],radius:4})!;
  pointClose(angled.point,[10,10]);pointClose(angled.vertex,[0,0]);
});

test('supporting-line extensions and distant unrelated references never attract a perpendicular',()=>{
  assert.equal(snapDiagramLinePoint([30.2,0],{anchor:[30,30],lines:[line('short',[0,0],[10,0])],radius:2}),null);
  assert.equal(snapDiagramLinePoint([.2,50],{anchor:[0,100],lines:[line('remote',[-1000,0],[1000,0])],radius:2}),null);
  assert.equal(snapDiagramLinePoint([.2,50],{anchor:[0,100],lines:[line('remote-piece',[400,0],[800,0])],radius:200}),null);
});

test('all four internal and external bisector rays work for an anchor at a real intersection',()=>{
  const lines=[line('horizontal',[-100,0],[100,0]),line('vertical',[0,-100],[0,100])];
  for(const pointer of [[30,31],[30,-31],[-30,31],[-30,-31]] as Point[]) {
    const result=snapDiagramLinePoint(pointer,{anchor:[0,0],lines,radius:2})!;
    assert.equal(result.kind,'bisector');pointClose(result.point,[Math.sign(pointer[0])*30.5,Math.sign(pointer[1])*30.5]);pointClose(result.vertex,[0,0]);
    assert.equal(result.referenceDirections.length,2);assert.equal(result.references.length,2);
    const [a,b]=result.referenceDirections,d=result.direction;
    close(a[0]*d[0]+a[1]*d[1],b[0]*d[0]+b[1]*d[1]);
    assert.ok((d[0]*a[1]-d[1]*a[0])*(d[0]*b[1]-d[1]*b[0])<0);
  }
});

test('bisectors use normalized directions rather than unequal reference lengths or endpoint order',()=>{
  const first=line('short',at(18,-4),at(18,2)),second=line('long',at(92,5000),at(92,-5000));
  for(const angle of [55,145,235,325]) {
    const pointer=at(angle+.5,30),result=snapDiagramLinePoint(pointer,{anchor:[0,0],lines:[first,second],radius:1})!;
    assert.equal(result.kind,'bisector');pointClose(result.point,at(angle,30*Math.cos(.5*Math.PI/180)));
  }
});

test('a merely nearby intersection cannot produce a false equal-angle marker',()=>{
  const lines=[line('horizontal',[-100,0],[100,0]),line('vertical',[0,-100],[0,100])];
  assert.equal(snapDiagramLinePoint([30,30],{anchor:[.2,.2],lines,radius:2}),null);
  assert.equal(snapDiagramLinePoint([30,30],{anchor:[.2,0],lines,radius:2}),null);
  // References that meet only as infinite support lines are not incident segments.
  assert.equal(snapDiagramLinePoint([30,30],{anchor:[0,0],lines:[line('h',[10,0],[100,0]),line('v',[0,10],[0,100])],radius:2}),null);
});

test('collinear, reversed, split and zero-length references do not invent bisectors',()=>{
  const lines=[line('left',[-20,0],[0,0]),line('right',[0,0],[20,0]),line('reverse',[20,0],[-20,0]),line('zero',[0,0],[0,0])];
  assert.equal(snapDiagramLinePoint([20,20],{anchor:[0,0],lines,radius:2}),null);
  const duplicateLines=[...lines,line('vertical-bottom',[0,-20],[0,0]),line('vertical-top',[0,0],[0,20])];
  const result=snapDiagramLinePoint([20,20.5],{anchor:[0,0],lines:duplicateLines,radius:2})!;
  assert.equal(result.kind,'bisector');assert.equal(result.references.length,2);pointClose(result.point,[20.25,20.25]);
  const reversed=snapDiagramLinePoint([20,20.5],{anchor:[0,0],lines:[...duplicateLines].reverse(),radius:2})!;
  assert.deepEqual(result,reversed);
});

test('angle tolerance remains bounded for short strokes, large snap radii and long references',()=>{
  const edge=line('very-long',[-1e6,0],[1e6,0]);
  assert.equal(snapDiagramLinePoint(at(75,1),{anchor:[0,0],lines:[edge],radius:100}),null);
  assert.equal(snapDiagramLinePoint(at(70,1),{anchor:[0,0],lines:[edge],radius:100,maxAngleDegrees:180}),null);
  assert.equal(snapDiagramLinePoint(at(86,10),{anchor:[0,0],lines:[edge],radius:2,maxAngleDegrees:2}),null);
  assert.ok(snapDiagramLinePoint(at(86,10),{anchor:[0,0],lines:[edge],radius:2}));
  const lines=[edge,line('vertical',[0,-1e6],[0,1e6])];
  assert.equal(snapDiagramLinePoint(at(32,1),{anchor:[0,0],lines,radius:100,maxAngleDegrees:180}),null);
});

test('screen tolerance maps consistently to a world-space radius at different zooms',()=>{
  for(const scale of [.1,1,10]) {
    const result=snapDiagramLinePoint([.5*scale,30*scale],{anchor:[0,0],lines:[line('edge',[-100*scale,0],[100*scale,0])],radius:scale})!;
    assert.equal(result.kind,'perpendicular');pointClose(result.point,[0,30*scale]);
    assert.equal(snapDiagramLinePoint([2*scale,30*scale],{anchor:[0,0],lines:[line('edge',[-100*scale,0],[100*scale,0])],radius:scale}),null);
  }
});

test('disabled snapping, empty strokes and nonfinite or degenerate input return no relation',()=>{
  const options={anchor:[0,0] as Point,lines:[line('h',[-100,0],[100,0])],radius:2};
  assert.equal(snapDiagramLinePoint([.2,20],{...options,enabled:false}),null);
  assert.equal(snapDiagramLinePoint([0,0],options),null);
  assert.equal(snapDiagramLinePoint([NaN,20],options),null);
  assert.equal(snapDiagramLinePoint([.2,20],{...options,anchor:[Infinity,0]}),null);
  for(const radius of [0,-1,Infinity,NaN])assert.equal(snapDiagramLinePoint([.2,20],{...options,radius}),null);
  for(const maxAngleDegrees of [0,-1,Infinity,NaN])assert.equal(snapDiagramLinePoint([.2,20],{...options,maxAngleDegrees}),null);
  assert.equal(snapDiagramLinePoint([.2,20],{...options,lines:[line('zero',[0,0],[0,0]),line('invalid',[NaN,0],[0,1])]}),null);
});

test('snap results and inputs do not share mutable geometry',()=>{
  const anchor:Point=[0,0],pointer:Point=[.2,20],reference=line('h',[-100,0],[100,0]),before=structuredClone(reference);
  const result=snapDiagramLinePoint(pointer,{anchor,lines:[reference],radius:2})!;
  result.point[0]=99;result.vertex[0]=99;result.references[0].a[0]=99;result.referenceDirections[0][0]=99;
  assert.deepEqual(reference,before);assert.deepEqual(anchor,[0,0]);assert.deepEqual(pointer,[.2,20]);
});

test('nearest geometric relation wins independently of reference order',()=>{
  const lines=[line('horizontal',[-100,0],[100,0]),line('tilted',at(2,-100),at(2,100))];
  const a=snapDiagramLinePoint(at(91.9,30),{anchor:[0,0],lines,radius:2})!;
  const b=snapDiagramLinePoint(at(91.9,30),{anchor:[0,0],lines:[...lines].reverse(),radius:2})!;
  assert.deepEqual(a,b);assert.equal(a.references[0].id,'tilted');pointClose(a.direction,at(92,1));
});

test('sorted bisector lookup handles axes on either side of the 0/180 degree seam',()=>{
  const lines=[line('near-zero',at(.5,-100),at(.5,100)),line('near-pi',at(179.5,-100),at(179.5,100))];
  const result=snapDiagramLinePoint([30,.02],{anchor:[0,0],lines,radius:1})!;
  assert.equal(result.kind,'bisector');pointClose(result.point,[30,0]);
});

test('hover input with thousands of distant segments retains the local intersection relation',()=>{
  const lines=Array.from({length:8000},(_,i)=>line(`remote-${i}`,[1000+i,1000],[1001+i,1001]));
  lines.push(line('horizontal',[-100,0],[100,0]),line('vertical',[0,-100],[0,100]));
  const result=snapDiagramLinePoint([30,30.2],{anchor:[0,0],lines,radius:1})!;
  assert.equal(result.kind,'bisector');pointClose(result.point,[30.1,30.1]);
  assert.deepEqual(result.references.map(reference=>reference.id).sort(),['horizontal','vertical']);
});

test('dense incident lines use the correct nearest bisector without all-pairs intersections',()=>{
  const lines=Array.from({length:2000},(_,i)=>line(`incident-${i}`,at(i*.09,-100),at(i*.09,100)));
  const pointer=at(23.445,30),result=snapDiagramLinePoint(pointer,{anchor:[0,0],lines,radius:1})!;
  assert.equal(result.kind,'bisector');pointClose(result.point,pointer);
});
