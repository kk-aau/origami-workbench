import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mirrorCopies,reflectPoint,uncoveredCopies} from '../../src/app/mirror';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import {splitEditableSegments} from '../../src/app/planarize';
import {validateDoc,type Doc,type Segment,type Point} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-90):Segment=>({id,a,b,assignment,angle});
const doc=(segments:Segment[]):Doc=>({name:'镜像测试',paper:{width:200,height:200},segments});
const near=(a:Point,b:Point)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8));
test('reflects vertical, horizontal and oblique axes exactly',()=>{near(reflectPoint([25,50],[100,0],[100,200]),[175,50]);near(reflectPoint([25,50],[0,100],[200,100]),[25,150]);near(reflectPoint([25,50],[0,0],[100,100]),[50,25]);});
test('axis direction and length do not affect reflection',()=>{near(reflectPoint([4,6],[10,20],[-30,-20]),reflectPoint([4,6],[-30,-20],[90,100]));});
test('reflecting twice returns the original point and preserves distances',()=>{const a:Point=[5,7],b:Point=[11,31],p:Point=[-27,139],q:Point=[77,10],r=reflectPoint(p,a,b);near(reflectPoint(r,a,b),p);const t=reflectPoint(q,a,b);assert.ok(Math.abs(Math.hypot(p[0]-q[0],p[1]-q[1])-Math.hypot(r[0]-t[0],r[1]-t[1]))<1e-8);});
test('rejects short axes, NaN, infinity and coordinate overflow',()=>{assert.throws(()=>reflectPoint([0,0],[1,1],[1,1]),/对称轴/);assert.throws(()=>reflectPoint([NaN,0],[0,0],[0,1]),/坐标/);assert.throws(()=>reflectPoint([Infinity,0],[0,0],[0,1]),/坐标/);assert.throws(()=>reflectPoint([-1e6,0],[1e6,0],[1e6,1]),/坐标/);});
test('creates finite copies preserving all six assignments, null and zero angles',()=>{for(const [assignment,angle] of [['M',null],['V',0],['B',0],['U',null],['A',0],['F',0]] as const){const d=doc([s('a',[25,25],[25,75],assignment,angle)]),[r]=mirrorCopies(d,['a'],[100,0],[100,200]);near(r.a,[175,25]);near(r.b,[175,75]);assert.equal(r.assignment,assignment);assert.equal(r.angle,angle);assert.notEqual(r.id,'a');}});
test('does not mutate source geometry or auxiliary objects',()=>{const d=doc([s('a',[25,25],[25,75])]);d.objects=[{id:'c',kind:'circle',center:[20,20],radius:5,color:'#000000'}];const before=JSON.stringify(d);mirrorCopies(d,['a'],[100,0],[100,200]);assert.equal(JSON.stringify(d),before);});
test('rejects empty, stale and zero length selections',()=>{const d=doc([s('a',[25,25],[25,75])]);assert.throws(()=>mirrorCopies(d,[],[100,0],[100,200]),/先用选择/);assert.throws(()=>mirrorCopies(d,['missing'],[100,0],[100,200]),/已变化/);assert.throws(()=>mirrorCopies(doc([s('a',[0,0],[0,0])]),['a'],[100,0],[100,200]),/零长/);});
test('boundary copying respects lock while boundary may define an axis',()=>{const d=doc([s('a',[25,25],[25,75],'B',0)]);assert.throws(()=>mirrorCopies(d,['a'],[0,0],[0,200],true),/边界保护/);assert.equal(mirrorCopies(d,['a'],[0,0],[0,200],false).length,1);assert.equal(mirrorCopies(doc([s('a',[25,25],[25,75])]),['a'],[0,0],[0,200],true).length,1);});
test('rejects fully redundant axis and symmetric results without new history',()=>{const d=doc([s('a',[25,25],[25,75]),s('b',[175,25],[175,75])]);assert.throws(()=>mirrorCopies(d,['a'],[25,0],[25,200]),/无需重复/);assert.throws(()=>mirrorCopies(d,['a'],[100,0],[100,200]),/无需重复/);});
test('removes same-type overlap already covered by multiple segments',()=>{const d=doc([s('a',[25,25],[25,100]),s('b',[175,25],[175,50]),s('c',[175,75],[175,50])]);const [r]=mirrorCopies(d,['a'],[100,0],[100,200]);near(r.a,[175,75]);near(r.b,[175,100]);});
test('subtracts middle overlaps into two finite copies',()=>{const d=doc([s('a',[25,25],[25,125]),s('b',[175,50],[175,100])]);const r=mirrorCopies(d,['a'],[100,0],[100,200]);assert.equal(r.length,2);near(r[0].a,[175,25]);near(r[0].b,[175,50]);near(r[1].a,[175,100]);near(r[1].b,[175,125]);});
test('mirror replaces positive overlap of different assignment or fold angle and keeps old tails',()=>{for(const [assignment,angle] of [['V',90],['M',-45],['M',null],['M',0],['A',0]] as const){
  const d=doc([s('a',[25,25],[25,75]),s('b',[175,50],[175,100],assignment,angle)]),before=JSON.stringify(d);
  const copies=mirrorCopies(d,['a'],[100,0],[100,200]),result=overlayDrawnSegments(d,copies);
  const old=result.segments.filter(line=>line.id.startsWith('b'));
  assert.equal(old.length,1);near(old[0].a,[175,75]);near(old[0].b,[175,100]);
  assert.equal(old[0].assignment,assignment);assert.equal(old[0].angle,angle);
  assert.ok(result.segments.filter(line=>line.id.includes('::mirror:')).every(line=>line.assignment==='M'&&line.angle===-90));
  assert.equal(JSON.stringify(d),before);
}});

test('later candidate can restore a matching old line after another candidate covered it',()=>{
  const d=doc([s('old',[0,50],[100,50],'M',-90)]);
  const copies=uncoveredCopies(d,[s('first',[25,50],[75,50],'V',90),s('last',[0,50],[100,50],'M',-90)]);
  const result=overlayDrawnSegments(d,copies);
  assert.ok(result.segments.every(line=>line.assignment==='M'&&line.angle===-90));
  assert.equal(result.segments.reduce((sum,line)=>sum+Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1]),0),100);
});
test('endpoint contact with different assignment is not an overlap conflict',()=>{const d=doc([s('a',[25,25],[25,75]),s('b',[175,75],[175,100],'V',90)]);assert.equal(mirrorCopies(d,['a'],[100,0],[100,200]).length,1);});
test('deduplicates repeated source IDs and same geometry within the batch',()=>{const d=doc([s('a',[25,25],[25,75]),s('b',[25,75],[25,25])]);assert.equal(mirrorCopies(d,['a','a','b'],[100,0],[100,200]).length,1);});
test('new IDs do not collide with segment or drawing object IDs',()=>{const d=doc([s('a',[25,25],[25,75]),s('a::mirror:1',[1,1],[1,2])]);d.objects=[{id:'a::mirror:2',kind:'circle',center:[10,10],radius:2,color:'#000000'}];assert.equal(mirrorCopies(d,['a'],[100,0],[100,200])[0].id,'a::mirror:3');});
test('real intersections split both new copies and old lines',()=>{const d=doc([s('a',[25,25],[25,75]),s('cross',[150,50],[200,50],'V',90)]);const copies=mirrorCopies(d,['a'],[100,0],[100,200]),split=splitEditableSegments({...d,segments:[...d.segments,...copies]});assert.equal(split.segments.length,5);assert.equal(split.segments.filter(s=>s.assignment==='M').length,3);});
test('near mirror endpoint extends on its exact supporting line to join a finite crease',()=>{
  const d=doc([s('source',[30,50],[50,70]),s('target',[171,40],[171,60],'V',90)]);
  const exact=mirrorCopies(d,['source'],[100,0],[100,200]);near(exact[0].a,[170,50]);
  const joined=mirrorCopies(d,['source'],[100,0],[100,200],false,2);
  near(joined[0].a,[171,49]);near(joined[0].b,[150,70]);
  const split=splitEditableSegments({...d,segments:[...d.segments,...joined]});
  assert.equal(split.segments.filter(x=>x.id.startsWith('target')).length,2);
  const distant=mirrorCopies(d,['source'],[100,0],[100,200],false,.5);near(distant[0].a,[170,50]);
});
test('nearby parallel creases do not attract mirrored endpoints',()=>{
  const d=doc([s('source',[30,50],[50,70]),s('parallel',[171,50],[151,70],'V',90)]);
  const [copy]=mirrorCopies(d,['source'],[100,0],[100,200],false,2);
  near(copy.a,[170,50]);near(copy.b,[150,70]);
});
test('mirroring beyond the former 12000-segment limit preserves every source and requested copy',()=>{
  const count=15000,d=doc(Array.from({length:count},(_,i)=>s(String(i),[25,i/100],[30,i/100]))),before=structuredClone(d);
  const copies=mirrorCopies(d,['0',String(count-1)],[100,0],[100,200]),result={...d,segments:[...d.segments,...copies]};
  assert.equal(result.segments.length,count+2);assert.equal(copies.length,2);
  for(const [i,sourceIndex] of [0,count-1].entries()){
    near(copies[i].a,[175,sourceIndex/100]);near(copies[i].b,[170,sourceIndex/100]);
    assert.equal(copies[i].assignment,'M');assert.equal(copies[i].angle,-90);
  }
  assert.equal(new Set(result.segments.map(s=>s.id)).size,count+2);
  assert.doesNotThrow(()=>validateDoc(result));assert.deepEqual(d,before);
});
