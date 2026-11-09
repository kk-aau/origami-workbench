import {applyDrawingSelectionTransform,previewCircleTransform,drawingRotationReference} from '../../src/app/selectionTransform';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rotationCopyReference,rotationCopyOrbit,rotationSelectionTransform,applySelectionTransform,previewSelectionTransform,transformPoint,type SelectionTransform} from '../../src/app/selectionTransform';
import {splitEditableSegments} from '../../src/app/planarize';
import {validateDoc,type Doc,type Point,type Segment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-90):Segment=>({id,a,b,assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'选区变换',paper:{width:200,height:200},segments});
const shift:SelectionTransform={kind:'translate',from:[0,0],to:[0,20]};
const near=(a:Point,b:Point)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8));

test('translation uses destination minus origin',()=>{near(transformPoint([2,3],{kind:'translate',from:[10,-5],to:[7,9]}),[-1,17]);});
test('four-point similarity maps anchors and combines rotation, scaling and translation',()=>{
  const t:SelectionTransform={kind:'similarity',a:[1,2],b:[11,2],c:[30,40],d:[30,60]};
  near(transformPoint(t.a,t),t.c);near(transformPoint(t.b,t),t.d);near(transformPoint([1,7],t),[20,40]);
  const inverse:SelectionTransform={kind:'similarity',a:t.c,b:t.d,c:t.a,d:t.b};
  near(transformPoint(transformPoint([-15,28],t),inverse),[-15,28]);
});
test('rejects degenerate anchors, nonfinite points and output overflow',()=>{
  assert.throws(()=>transformPoint([0,0],{kind:'similarity',a:[0,0],b:[0,0],c:[1,1],d:[2,2]}),/不能重合/);
  assert.throws(()=>transformPoint([0,0],{kind:'similarity',a:[0,0],b:[1,0],c:[1,1],d:[1,1]}),/不能重合/);
  assert.throws(()=>transformPoint([NaN,0],shift),/坐标/);
  assert.throws(()=>transformPoint([0,1e6],shift),/坐标/);
});
test('preview preserves all assignments and explicit null/zero angles without mutation',()=>{
  for(const [assignment,angle] of [['M',null],['V',0],['B',0],['U',null],['A',0],['F',0]] as const){
    const d=doc([s('a',[0,0],[10,0],assignment,angle)]),before=JSON.stringify(d),[p]=previewSelectionTransform(d,['a','a'],shift);
    assert.equal(p.assignment,assignment);assert.equal(p.angle,angle);near(p.a,[0,20]);assert.equal(JSON.stringify(d),before);
  }
});
test('move removes only selected sources while copy retains them; objects stay untouched',()=>{
  const d=doc([s('a',[0,0],[10,0]),s('b',[50,50],[60,50])]);d.objects=[{id:'c',kind:'circle',center:[20,20],radius:5,color:'#000000'}];
  const before=JSON.stringify(d),moved=applySelectionTransform(d,['a'],shift,false),copied=applySelectionTransform(d,['a'],shift,true);
  assert.equal(moved.segments.length,2);assert.ok(!moved.segments.some(s=>s.id==='a'));assert.equal(moved.segments[0],d.segments[1]);
  assert.equal(copied.segments.length,3);assert.equal(copied.segments[0],d.segments[0]);assert.equal(moved.objects,d.objects);assert.equal(JSON.stringify(d),before);
});
test('rejects empty/stale selections, locked boundaries and identity transformations',()=>{
  const d=doc([s('a',[0,0],[10,0],'B',0)]);
  assert.throws(()=>applySelectionTransform(d,[],shift,false),/先选择/);
  assert.throws(()=>applySelectionTransform(d,['missing'],shift,false),/已变化/);
  assert.throws(()=>applySelectionTransform(d,['a'],shift,false,true),/边界保护/);
  assert.throws(()=>applySelectionTransform(d,['a'],{kind:'translate',from:[0,0],to:[0,0]},true),/位置相同/);
});
test('moving onto same-type coverage merges and different coverage is replaced without mutation',()=>{
  for(const assignment of ['M','V'] as const){const d=doc([s('a',[0,0],[10,0]),s('b',[0,20],[10,20],assignment,assignment==='M'?-90:90)]),before=JSON.stringify(d);
    if(assignment==='M'){const result=applySelectionTransform(d,['a'],shift,false);assert.deepEqual(result.segments,[d.segments[1]]);assert.throws(()=>applySelectionTransform(d,['a'],shift,true),/已存在/);}
    else{const result=applySelectionTransform(d,['a'],shift,false);assert.equal(result.segments.length,1);assert.equal(result.segments[0].assignment,'M');assert.equal(result.segments[0].angle,-90);}
    assert.equal(JSON.stringify(d),before);
  }
});
test('partial overlap is subtracted and transformed intersections are real selectable fragments',()=>{
  const d=doc([s('a',[0,0],[10,0]),s('covered',[0,20],[5,20]),s('cross',[7,10],[7,30],'V',90)]);
  const moved=applySelectionTransform(d,['a'],shift,false),added=moved.segments.filter(line=>line.id.includes('::move:'));
  assert.equal(added.length,2);near(added[0].a,[5,20]);near(added[0].b,[7,20]);near(added[1].a,[7,20]);near(added[1].b,[10,20]);
  assert.equal(moved.segments.length,5);assert.equal(splitEditableSegments(moved).segments.length,5);
});
test('moving and copying beyond the former 12000-segment limit retain all unselected geometry',()=>{
  const count=15000,d=doc(Array.from({length:count},(_,i)=>s(String(i),[0,i/100],[10,i/100]))),t:SelectionTransform={kind:'translate',from:[0,0],to:[20,0]},before=structuredClone(d);
  const moved=applySelectionTransform(d,['0'],t,false),copied=applySelectionTransform(d,['0'],t,true);
  assert.equal(moved.segments.length,count);assert.equal(copied.segments.length,count+1);
  assert.deepEqual(moved.segments.slice(0,-1),d.segments.slice(1));assert.deepEqual(copied.segments.slice(0,-1),d.segments);
  for(const result of [moved,copied]){
    const addition=result.segments.at(-1)!;near(addition.a,[20,0]);near(addition.b,[30,0]);
    assert.equal(addition.assignment,'M');assert.equal(addition.angle,-90);
    assert.equal(new Set(result.segments.map(s=>s.id)).size,result.segments.length);
    assert.doesNotThrow(()=>validateDoc(result));
  }
  assert.deepEqual(d,before);
});

test('rotation copy uses the chosen pivot, preserves source and angles, and splits intersections',()=>{
 const input=doc([s('a',[15,10],[20,10],'V',45),s('f',[5,5],[8,5],'F',0)]),before=structuredClone(input);
 const t=rotationSelectionTransform([10,10],90);near(transformPoint([15,10],t),[10,15]);near(transformPoint([10,10],t),[10,10]);
 const output=applySelectionTransform(input,['a'],t,true);assert.deepEqual(input,before);assert(output.segments.some(v=>v.id==='a'&&v.angle===45));
 assert(output.segments.some(v=>v.id!=='a'&&v.assignment==='V'&&v.angle===45&&Math.abs(v.a[0]-10)<1e-8));
 near(transformPoint([15,10],rotationSelectionTransform([10,10],-90)),[10,5]);
 assert.throws(()=>rotationSelectionTransform([10,10],Infinity));assert.throws(()=>applySelectionTransform(input,['a'],rotationSelectionTransform([10,10],360),true),/位置相同/);
});

test('mouse rotation starts at closest point on selected line and projects the cursor without scaling',()=>{
 const source=[s('near',[20,40],[80,40]),s('far',[10,90],[20,90])],pivot:Point=[50,50];
 const ref=rotationCopyReference(source,pivot);near(ref,[50,40]);
 const a=rotationCopyOrbit(pivot,ref,[95,50]),b=rotationCopyOrbit(pivot,ref,[500,50]);near(a.target,[60,50]);near(a.target,b.target);
 near(transformPoint(ref,a.transform),a.target);near(transformPoint(pivot,a.transform),pivot);
 const before=doc(source),next=applySelectionTransform(before,['near'],a.transform,true);assert.equal(before.segments.length,2);assert(next.segments.length>2);
 const preview=previewSelectionTransform(before,['near'],a.transform);assert.ok(Math.abs(Math.hypot(preview[0].a[0]-preview[0].b[0],preview[0].a[1]-preview[0].b[1])-60)<1e-8);
 assert.throws(()=>rotationCopyOrbit(pivot,ref,pivot),/移离/);assert.throws(()=>rotationCopyReference([],pivot),/参考点/);
});
test('a pivot on the selected line uses the nearest distinct endpoint as a nonzero reference',()=>{
 near(rotationCopyReference([s('line',[0,0],[10,0])],[0,0]),[10,0]);
 const ref=rotationCopyReference([s('line',[0,0],[10,0])],[2,0]);near(ref,[0,0]);
 const t=rotationCopyOrbit([2,0],ref,[2,10]);near(transformPoint(ref,t.transform),[2,2]);
});

test('circle-only and mixed construction transforms retain originals and unrelated objects',()=>{
 const d=doc([s('line',[0,0],[10,0])]);d.objects=[{id:'circle',kind:'circle',center:[20,20],radius:5,color:'#123456'},{id:'other',kind:'circle',center:[80,80],radius:7,color:'#333333'}];
 const before=structuredClone(d);
 const copy=applyDrawingSelectionTransform(d,[],['circle'],shift,true).doc;
 assert.equal(copy.objects?.length,3);assert.deepEqual(copy.objects?.at(-1),{...d.objects[0],id:'circle:2',center:[20,40]});
 const move=applyDrawingSelectionTransform(d,['line'],['circle'],shift,false).doc;
 assert.deepEqual(move.objects?.[0],{...d.objects[0],center:[20,40]});assert.deepEqual(move.objects?.[1],d.objects[1]);assert.deepEqual(d,before);
 const t:SelectionTransform={kind:'similarity',a:[0,0],b:[1,0],c:[0,0],d:[0,2]};
 const [c]=previewCircleTransform(d,['circle'],t);near(c.center,[-40,40]);assert.equal(c.radius,10);
 near(drawingRotationReference(d,new Set(),new Set(['circle']),[0,20]),[15,20]);
 assert.throws(()=>applyDrawingSelectionTransform(d,[],['missing'],shift,true),/已变化/);
});
