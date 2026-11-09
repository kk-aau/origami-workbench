import assert from 'node:assert/strict';
import test from 'node:test';
import {allCyclicTwistTypes,allValidTwistTypes,centeredTwistAngleSelfContained,centeredTwistAngleSelfContainedTypes,centeredTwistSelfContained,centeredTwistSelfContainedTypes,offsetTwistAngleSelfContained,offsetTwistSelfContained,polygonCriticalAngles,regularPolygonTwistValid,threeCycleCriticalAngles,triangleCriticalAngles,twistAssignmentCatalog,twoCycleCriticalAngles,type TwistTypes} from '../../src/app/twistAnalysis';
import type {XY} from '../../src/app/tessellation';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const regular=(n:number):XY[]=>Array.from({length:n},(_,i)=>[Math.cos(i*2*Math.PI/n),Math.sin(i*2*Math.PI/n)]);

test('critical cycle formulas agree with the original regular triangle and square boundaries',()=>{
  const triangle=regular(3),square=regular(4);
  const t=polygonCriticalAngles(triangle),s=polygonCriticalAngles(square);
  assert.equal(t.twoCycle,null);
  close(t.threeCycle![0],30);close(t.threeCycle![1],150);
  close(triangleCriticalAngles([60,60,60])![0],30);
  assert.equal(s.threeCycle,null);
  close(s.twoCycle![0],45);close(s.twoCycle![1],135);
  assert.deepEqual(twoCycleCriticalAngles([square[0],square[1]],[square[2],square[3]])!.map(Math.round),[45,135]);
});

test('triangle edge calculation equals independent interior-angle formula for acute and obtuse shapes',()=>{
  for(const [a,b,c] of [[40,60,80],[30,120,30],[45,45,90]] as const){
    const r=Math.PI/180,side=Math.sin(b*r)/Math.sin(c*r),p:XY[]=[[0,0],[1,0],[side*Math.cos(a*r),side*Math.sin(a*r)]];
    const actual=threeCycleCriticalAngles([p[0],p[1]],[p[1],p[2]],[p[2],p[0]]),expected=triangleCriticalAngles([a,b,c]);
    assert.ok(actual&&expected);close(actual[0],expected[0]);close(actual[1],expected[1]);
  }
});

test('saved five-edge critical cycle example is invariant under similarity transforms',()=>{
  // Origamica In[2702] uses these five vertices. The critical angle is a
  // property of the edge directions and must not disappear on resize.
  const points:XY[]=[[0,0],[1,-.5],[1.8,-.2],[1.5,.5],[.5,.7]];
  const expected=polygonCriticalAngles(points);
  assert.ok(expected.twoCycle&&expected.threeCycle);
  close(expected.threeCycle[0],42.87614608194722);
  close(expected.threeCycle[1],140.60184834770803);
  for(const scale of [1e-1,1e-2,1e-3,1e-6]){
    const transformed=points.map(([x,y]):XY=>[x*scale+2,y*scale-3]);
    const actual=polygonCriticalAngles(transformed);
    assert.ok(actual.twoCycle&&actual.threeCycle,`scale ${scale}`);
    for(const key of ['twoCycle','threeCycle'] as const){
      for(const side of [0,1] as const)
        assert.ok(Math.abs(actual[key][side]-expected[key][side])<1e-7,
          `${key}[${side}] changed on scale ${scale}`);
    }
  }
});

test('cyclic enumeration keeps inversion and reflection distinct and matches necklace counts',()=>{
  for(const [n,count] of [[3,4],[4,6],[5,8],[6,14],[8,36],[12,352]])assert.equal(allCyclicTwistTypes(n).length,count);
  const names=allCyclicTwistTypes(6).map(x=>x.join(''));
  assert.ok(names.includes('MVMVVV'));assert.ok(names.includes('MMVVVV'));
  assert.equal(allCyclicTwistTypes(13).length,632);
  assert.throws(()=>allCyclicTwistTypes(22),/结果包含/);
});

test('analysis catalog counts all larger necklaces exactly while retaining bounded previews and valid queries',()=>{
  const twelve=twistAssignmentCatalog(12,36,.2,70,'pleat');
  assert.equal(twelve.enumerated,true);
  assert.equal(twelve.all.length,352);
  assert.deepEqual(twelve.valid,allValidTwistTypes(12,36));
  assert.deepEqual(twelve.centered,centeredTwistSelfContainedTypes(12,.2,70));
  for(const n of [13,24,64]){
    const catalog=twistAssignmentCatalog(n,36,.2,70,'pleat');
    assert.equal(catalog.enumerated,false);
    assert.equal(catalog.all.length,24);
    assert.deepEqual(catalog.valid,[Array(n).fill('M'),Array(n).fill('V')]);
    assert.deepEqual(catalog.centered,[Array(n).fill('M'),Array(n).fill('V')]);
    assert.equal(catalog.counts?.valid,'2');
    assert.ok(polygonCriticalAngles(regular(n)).twoCycle,`${n} sides still has a critical-angle query`);
    assert.equal(regularPolygonTwistValid(n,36,Array(n).fill('M') as TwistTypes),true);
  }
  assert.equal(twistAssignmentCatalog(65,36,.2,70,'pleat').counts,null);
});

test('original MV validity thresholds and cyclic invariance',()=>{
  const checks:[number,number,string,boolean][]=[
    [3,29.999,'MMM',true],[3,30.001,'MMM',false],
    [3,59.999,'VMM',true],[3,60.001,'VMM',false],
    [4,44.999,'MMMM',true],[4,45.001,'MMMM',false],
    [4,89.999,'MVMV',false],
    [5,53.999,'MMMMM',true],[5,54.001,'MMMMM',false],
    [5,71.999,'MMMVV',true],[5,72.001,'MMMVV',false]
  ];
  for(const [n,angle,sequence,expected] of checks){
    const types=sequence.split('') as TwistTypes;
    assert.equal(regularPolygonTwistValid(n,angle,types),expected,`${n} ${angle} ${sequence}`);
    assert.equal(regularPolygonTwistValid(n,angle,[...types.slice(1),types[0]]),expected);
  }
  assert.deepEqual(allValidTwistTypes(3,60).map(x=>x.join('')),['MMV','MVV']);
  assert.equal(regularPolygonTwistValid(4,30,['M','V','B','V'] as TwistTypes),false);
});

test('saved MV threshold boundaries are inclusive and symmetric about 90 degrees',()=>{
  for(const [n,limit,assignment] of [[3,30,'MMM'],[3,60,'VMM'],[4,45,'MMMM'],[5,54,'MMMMM'],[5,72,'MMMVV']] as const){
    const types=assignment.split('') as TwistTypes;
    assert.equal(regularPolygonTwistValid(n,limit,types),true,`${n} ${limit} ${assignment}`);
    assert.equal(regularPolygonTwistValid(n,180-limit,types),true,`${n} ${180-limit} ${assignment}`);
    assert.equal(regularPolygonTwistValid(n,limit+1e-4,types),false,`${n} ${limit+1e-4} ${assignment}`);
    assert.equal(regularPolygonTwistValid(n,180-limit-1e-4,types),false,`${n} ${180-limit-1e-4} ${assignment}`);
  }
});

test('unit centered twist containment is stricter than MV validity',()=>{
  const types:TwistTypes=['M','M','V','V'];
  assert.equal(centeredTwistSelfContained(4,.2,70,types),true);
  assert.equal(centeredTwistSelfContained(4,.2,50,types),false);
  assert.equal(centeredTwistSelfContained(4,.2,70,['M','M','M','M']),true);
  assert.equal(centeredTwistSelfContained(4,.2,70,['M','V','M','V']),true);
  assert.equal(centeredTwistAngleSelfContained(4,.2,Math.atan(.2*Math.tan(70*Math.PI/180))*180/Math.PI,types),true);
  const valid=centeredTwistSelfContainedTypes(4,.2,70).map(t=>t.join(''));
  assert.ok(valid.includes('MMVV'));
  assert.deepEqual(centeredTwistAngleSelfContainedTypes(4,.2,25.515584),
                   centeredTwistSelfContainedTypes(4,.2,70));
});

test('unit offset twist containment follows the original one-third width bound',()=>{
  const types:TwistTypes=['M','M','V','V'];
  assert.equal(offsetTwistSelfContained(4,.2,.1,types),true);
  assert.equal(offsetTwistSelfContained(4,.3,.1,types),false);
  assert.equal(offsetTwistAngleSelfContained(4,.2,45,types),true);
  assert.equal(offsetTwistSelfContained(4,.2,0,types),true);
  assert.equal(offsetTwistSelfContained(4,.2,-.1,types),true);
  assert.equal(offsetTwistSelfContained(4,.2,.1,['M','M','M','M']),true);
  assert.equal(offsetTwistSelfContained(4,.2,.1,['M','V']),false);
  assert.equal(offsetTwistSelfContained(8,.2,.2,'MMMMVVVV'.split('') as TwistTypes),false);
  const n5angle=Math.atan(.2/(2*.15*Math.tan(Math.PI/5)))*180/Math.PI;
  assert.equal(offsetTwistAngleSelfContained(5,.2,n5angle,'MMMMM'.split('') as TwistTypes),true);
});
