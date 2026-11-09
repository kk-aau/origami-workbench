import test from 'node:test';
import assert from 'node:assert/strict';
import type { Doc, Point, Segment, Assignment } from '../../src/core/types';
import { continuousReflection } from '../../src/app/continuousReflection';
import { distance } from '../../src/core/geometry';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
const s=(id:string,a:Point,b:Point,assignment:Assignment='B'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
const doc=(extra:Segment[]=[]):Doc=>({name:'连续反射',paper:{width:200,height:200},segments:[...boundary,...extra]});
test('continuous passes perpendicular creases, alternates M/V and ends at boundary',()=>{
  const d=doc([s('c1',[75,0],[75,200],'M'),s('c2',[125,0],[125,200],'V')]),before=structuredClone(d);
  const r=continuousReflection(d,[25,100],[50,100],'M');
  assert.equal(r.stop,'boundary');assert.deepEqual(r.path.map(s=>[s.a,s.b,s.assignment,s.angle]),[
    [[25,100],[75,100],'M',-180],[[75,100],[125,100],'V',180],[[125,100],[200,100],'M',-180]]);
  assert.deepEqual(d,before);
});
test('diagonal crease reflects previous origin, not an optical forward vector',()=>{
  const r=continuousReflection(doc([s('diag',[0,0],[200,200],'M')]),[25,100],[50,100],'V');
  assert.deepEqual(r.path[0].b,[100,100]);
  assert.ok(Math.hypot(r.path[1].b[0]-100,r.path[1].b[1])<1e-8);assert.equal(r.path[1].assignment,'M');
});
test('ordinary collinear split vertex continues',()=>{
  const r=continuousReflection(doc([s('c1',[100,0],[100,100],'M'),s('c2',[100,100],[100,200],'M')]),[25,100],[50,100],'M');
  assert.equal(r.stop,'boundary');assert.equal(r.path.length,2);
});
test('three-arm T with incoming collinear arm and opposite pair continues',()=>{
  const r=continuousReflection(doc([s('c1',[100,0],[100,200],'V'),s('arm',[75,100],[100,100],'M')]),[25,100],[50,100],'M');
  assert.equal(r.stop,'boundary');assert.equal(r.path.length,2);assert.ok(r.copies.length>=2);
});
test('four-way vertex and noncollinear degree-two vertex offer directions without an arbitrary choice',()=>{
  for(const extra of [
    [s('v',[100,0],[100,200],'M'),s('h',[0,100],[200,100],'V')],
    [s('a',[100,100],[150,150],'M'),s('b',[100,100],[150,50],'V')],
  ]){const r=continuousReflection(doc(extra),[25,75],[100,100],'M');assert.equal(r.stop,'choice');assert.equal(r.path.length,1);assert.ok(r.pendingJunction!.candidates.length>1);}
});
test('isolated endpoint stops and boundary wins at coincident vertex',()=>{
  assert.equal(continuousReflection(doc([s('l',[100,100],[100,150],'M')]),[25,100],[50,100],'M').stop,'vertex');
  assert.equal(continuousReflection(doc([s('l',[100,100],[200,100],'M')]),[150,75],[200,100],'M').stop,'boundary');
});
test('auxiliary and flat lines do not redirect the path',()=>{
  const r=continuousReflection(doc([s('a',[50,0],[50,200],'A'),s('f',[75,0],[75,200],'F')]),[25,100],[100,100],'A');
  assert.equal(r.path.length,1);assert.equal(r.path[0].assignment,'A');assert.deepEqual(r.path[0].b,[200,100]);
});
test('non-MV preset stays constant; U stays unknown',()=>{
  const r=continuousReflection(doc([s('m',[100,0],[100,200],'M')]),[25,100],[50,100],'U');
  assert.ok(r.path.every(s=>s.assignment==='U'&&s.angle===null));
});
test('no initial cutoff rejects; a later missing hit is explicitly reported',()=>{
  const d={...doc(),segments:[s('m',[100,0],[100,200],'M')]};
  assert.throws(()=>continuousReflection({...d,segments:[]},[25,100],[50,100],'M'),/没有实际/);
  const r=continuousReflection(d,[25,100],[50,100],'M');assert.equal(r.stop,'no-hit');assert.equal(r.path.length,1);assert.match(r.stopMessage,/仅保留/);
});
test('invalid directions reject before creating a path',()=>{
  assert.throws(()=>continuousReflection(doc(),[25,100],[25,100],'M'),/重合/);
  assert.throws(()=>continuousReflection(doc(),[NaN,100],[25,100],'M'),/坐标/);
});

test('continuous path directly covers an existing valley or auxiliary line and preserves its old tail',()=>{
  for(const assignment of ['V','A'] as const){
    const d=doc([s('existing',[0,100],[200,100],assignment)]),before=structuredClone(d);
    const path=continuousReflection(d,[25,100],[50,100],'M'),result=overlayDrawnSegments(d,path.copies,true);
    assert.equal(path.stop,'boundary');
    const old=result.segments.filter(line=>line.id.startsWith('existing'));
    assert.equal(old.length,1);assert.deepEqual([old[0].a,old[0].b],[[0,100],[25,100]]);
    assert.ok(result.segments.filter(line=>line.id.includes('::continuous:')).every(line=>line.assignment==='M'&&line.angle===-180));
    assert.deepEqual(d,before);
  }
});

test('closed orbit stops at the first hit and removes its same-type repeated leg',()=>{
  const d=doc([
    s('east',[125,75],[175,125],'M'),s('north',[125,75],[175,25],'V'),
    s('west',[75,25],[125,75],'M'),s('south',[75,125],[125,75],'V'),
  ]);
  const r=continuousReflection(d,[100,100],[125,100],'M');
  assert.equal(r.stop,'closed');assert.equal(r.path.length,5);assert.equal(r.copies.length,4);
  assert.ok(distance(r.path[0].b,r.path.at(-1)!.b)<1e-8);
});

test('alternation is optional while the preset and drawing-angle magnitude remain authoritative',()=>{
  const d=doc([s('c1',[75,0],[75,200],'M'),s('c2',[125,0],[125,200],'V')]);
  assert.deepEqual(continuousReflection(d,[25,100],[50,100],'M'),continuousReflection(d,[25,100],[50,100],'M',undefined,{alternateAssignments:true}));
  for(const preset of ['M','V'] as const){
    const result=continuousReflection(d,[25,100],[50,100],preset,45,{alternateAssignments:false});
    assert.equal(result.path.length,3);assert.equal(result.stop,'boundary');
    assert.ok(result.path.every(segment=>segment.assignment===preset&&segment.angle===(preset==='M'?-45:45)));
    assert.ok(result.copies.every(segment=>segment.assignment===preset&&segment.angle===(preset==='M'?-45:45)));
  }
  assert.deepEqual(continuousReflection(d,[25,100],[50,100],'V',null,{alternateAssignments:false}).path.map(segment=>segment.angle),[null,null,null]);
  assert.deepEqual(continuousReflection(d,[25,100],[50,100],'U',undefined,{alternateAssignments:false}).path.map(segment=>segment.assignment),['U','U','U']);
});

test('a selected interior endpoint truncates only its chosen leg and never retains the next reference',()=>{
  const d=doc([s('c1',[75,0],[75,200],'M'),s('c2',[125,0],[125,200],'V')]),before=structuredClone(d);
  const endpoint={point:[100,100] as Point,segmentIndex:1},options={alternateAssignments:true,endpoint},saved=structuredClone(options);
  const result=continuousReflection(d,[25,100],[50,100],'M',30,options);
  assert.equal(result.stop,'selected');assert.equal(result.stopMessage,'已到指定终点');
  assert.deepEqual(result.path.map(segment=>[segment.a,segment.b,segment.assignment,segment.angle]),[
    [[25,100],[75,100],'M',-30],[[75,100],[100,100],'V',30],
  ]);
  assert.ok(result.copies.every(segment=>segment.a[0]<=100&&segment.b[0]<=100));
  assert.ok(result.sources.every(segment=>segment.a[0]===75&&segment.b[0]===75));
  assert.deepEqual(d,before);assert.deepEqual(options,saved);
  result.path.at(-1)!.b[0]=101;assert.deepEqual(endpoint.point,[100,100],'returned geometry does not alias the selected input point');
});

test('selected crease intersections and boundary endpoints stop explicitly before continuing',()=>{
  const d=doc([s('c1',[75,0],[75,200],'M'),s('c2',[125,0],[125,200],'V')]);
  for(const [segmentIndex,x] of [[0,75],[1,125],[2,200]]){
    const result=continuousReflection(d,[25,100],[50,100],'V',60,{alternateAssignments:false,endpoint:{point:[x,100],segmentIndex}});
    assert.equal(result.stop,'selected');assert.equal(result.path.length,segmentIndex+1);
    assert.deepEqual(result.path.at(-1)!.b,[x,100]);assert.ok(result.path.every(segment=>segment.assignment==='V'&&segment.angle===60));
  }
  const ambiguous=doc([s('v',[100,0],[100,200],'M'),s('h',[0,100],[200,100],'V')]);
  const chosen=continuousReflection(ambiguous,[25,75],[100,100],'M',undefined,{endpoint:{point:[100,100],segmentIndex:0}});
  assert.equal(chosen.stop,'selected');assert.equal(chosen.path.length,1);
});

test('invalid, zero-length and unreachable endpoints reject without changing the document',()=>{
  const d=doc([s('c1',[75,0],[75,200],'M')]),before=structuredClone(d);
  const endpoints=[
    {point:[60,100] as Point,segmentIndex:-1},{point:[60,100] as Point,segmentIndex:1.5},
    {point:[NaN,100] as Point,segmentIndex:0},{point:[60,101] as Point,segmentIndex:0},
    {point:[25,100] as Point,segmentIndex:0},{point:[75,100] as Point,segmentIndex:1},
    {point:[90,100] as Point,segmentIndex:0},{point:[210,100] as Point,segmentIndex:1},
    {point:[200,100] as Point,segmentIndex:2},
  ];
  for(const endpoint of endpoints)assert.throws(()=>continuousReflection(d,[25,100],[50,100],'M',undefined,{endpoint}),/终点/);
  const noHit={...d,segments:[]};assert.throws(()=>continuousReflection(noHit,[25,100],[50,100],'M',undefined,{endpoint:{point:[60,100],segmentIndex:0}}),/终点/);
  const blocked=doc([s('v',[100,0],[100,200],'M'),s('h',[0,100],[200,100],'V')]);
  assert.throws(()=>continuousReflection(blocked,[25,75],[100,100],'M',undefined,{endpoint:{point:[120,100],segmentIndex:1}}),/可到达/);
  assert.throws(()=>continuousReflection(d,[25,100],[50,100],'M',undefined,{alternateAssignments:'false' as unknown as boolean}),/交替/);
  assert.deepEqual(d,before);
});

test('selected cutoff preserves existing overlap tails when committed through the drawing overlay',()=>{
  const d=doc([s('existing',[0,100],[200,100],'V')]),before=structuredClone(d);
  const candidate=continuousReflection(d,[25,100],[50,100],'M',45,{alternateAssignments:false,endpoint:{point:[110,100],segmentIndex:0}});
  const committed=overlayDrawnSegments(d,candidate.copies,true),old=committed.segments.filter(segment=>segment.id.startsWith('existing'));
  assert.equal(candidate.stop,'selected');assert.equal(old.length,2);
  assert.deepEqual(old.map(segment=>[segment.a,segment.b]),[[[0,100],[25,100]],[[110,100],[200,100]]]);
  assert.ok(committed.segments.filter(segment=>segment.id.includes('::continuous:')).every(segment=>segment.assignment==='M'&&segment.angle===-45));
  assert.deepEqual(d,before);
});

test('a diagonal arriving at the user cross gets finite Kawasaki candidates with explicit M/V choice unchanged',()=>{
  const d=doc([s('vertical',[50,0],[50,200],'M'),s('horizontal',[0,50],[200,50],'V')]),before=structuredClone(d);
  for(const alternateAssignments of [true,false]){
    const result=continuousReflection(d,[0,100],[50,50],'M',45,{alternateAssignments}),junction=result.pendingJunction!;
    assert.equal(result.stop,'choice');assert.deepEqual(junction.point,[50,50]);assert.equal(junction.segmentIndex,0);
    assert.deepEqual(junction.candidates.map(candidate=>candidate.degrees),[45,225,315]);
    assert.match(junction.message,/局部角度候选/);assert.match(junction.message,/不代表已验证平折/);
    for(const candidate of junction.candidates){
      const sorted=[0,90,135,180,270,candidate.degrees].sort((a,b)=>a-b);
      const alternating=[0,0];for(let i=0;i<sorted.length;i++)alternating[i%2]+=(sorted[(i+1)%sorted.length]-sorted[i]+360)%360;
      assert.ok(alternating.every(sum=>Math.abs(sum-180)<1e-8),'both alternating sector sums are 180 degrees');
      assert.equal(candidate.assignment,alternateAssignments?'V':'M');
      assert.ok(candidate.end.some(coordinate=>Math.abs(coordinate)<1e-7||Math.abs(coordinate-200)<1e-7),'a displayed candidate reaches a real paper boundary');
      const selected={point:junction.point,segmentIndex:junction.segmentIndex,direction:candidate.direction};
      const continued=continuousReflection(d,[0,100],[50,50],'M',45,{alternateAssignments,junctionChoices:[selected]});
      assert.equal(continued.stop,'boundary');assert.equal(continued.path.length,2);assert.equal(continued.pendingJunction,undefined);
      assert.ok(distance(continued.path[1].b,candidate.end)<1e-7);assert.equal(continued.path[1].assignment,candidate.assignment);
      assert.equal(continued.path[1].angle,alternateAssignments?45:-45);
    }
  }
  assert.deepEqual(d,before);
});

test('a unique angular completion continues automatically and deduplicates an existing incoming arm',()=>{
  const extra=[s('east',[100,100],[150,100],'M'),s('south',[100,100],[100,150],'V')];
  for(const includeIncoming of [false,true]){
    const d=doc([...extra,...(includeIncoming?[s('west',[50,100],[100,100],'M')]:[])]);
    const result=continuousReflection(d,[25,100],[50,100],'M');
    assert.equal(result.stop,'boundary');assert.equal(result.pendingJunction,undefined);assert.equal(result.path.length,2);
    assert.ok(distance(result.path[1].a,[100,100])<1e-8);assert.ok(distance(result.path[1].b,[100,0])<1e-8);
  }
});

test('each ambiguous intersection has its own indexed direction and selected endpoint still truncates first',()=>{
  const d=doc([s('v1',[50,0],[50,200],'M'),s('h1',[0,50],[200,50],'V'),s('v2',[100,0],[100,200],'M'),s('h2',[0,100],[200,100],'V')]);
  const first=continuousReflection(d,[0,100],[50,50],'M').pendingJunction!,firstDirection=first.candidates.find(candidate=>candidate.degrees===45)!;
  const firstChoice={point:first.point,segmentIndex:first.segmentIndex,direction:firstDirection.direction};
  const next=continuousReflection(d,[0,100],[50,50],'M',undefined,{junctionChoices:[firstChoice]}),second=next.pendingJunction!;
  assert.equal(next.stop,'choice');assert.equal(second.segmentIndex,1);assert.ok(distance(second.point,[100,100])<1e-7);
  const secondDirection=second.candidates.find(candidate=>Math.abs(candidate.degrees-45)<1e-7)!;assert.ok(secondDirection);
  const choices=[firstChoice,{point:second.point,segmentIndex:second.segmentIndex,direction:secondDirection.direction}],before=structuredClone(choices);
  const final=continuousReflection(d,[0,100],[50,50],'M',60,{junctionChoices:choices,endpoint:{point:[150,150],segmentIndex:2}});
  assert.equal(final.stop,'selected');assert.equal(final.path.length,3);assert.ok(distance(final.path[2].b,[150,150])<1e-7);
  assert.deepEqual(final.path.map(segment=>segment.assignment),['M','V','M']);assert.deepEqual(choices,before);
  const atFirst=continuousReflection(d,[0,100],[50,50],'M',undefined,{endpoint:{point:[50,50],segmentIndex:0}});
  assert.equal(atFirst.stop,'selected');assert.equal(atFirst.pendingJunction,undefined);assert.equal(atFirst.path.length,1);
});

test('no angular completion or no finite cutoff stops explicitly without drawing an arbitrary line',()=>{
  const even=doc([s('v',[100,0],[100,200],'M'),s('h',[0,100],[200,100],'V')]);
  const result=continuousReflection(even,[25,100],[50,100],'M');
  assert.equal(result.stop,'vertex');assert.match(result.stopMessage,/偶数度/);assert.equal(result.path.length,1);
  const open={...doc(),segments:[s('v',[50,25],[50,75],'M'),s('h',[25,50],[75,50],'V')]};
  const noCutoff=continuousReflection(open,[0,100],[50,50],'M');
  assert.equal(noCutoff.stop,'vertex');assert.match(noCutoff.stopMessage,/没有实际折线或纸边截止/);assert.equal(noCutoff.pendingJunction,undefined);assert.equal(noCutoff.path.length,1);
});

test('invalid or stale junction choices fail without silently selecting another direction',()=>{
  const d=doc([s('v',[50,0],[50,200],'M'),s('h',[0,50],[200,50],'V')]),before=structuredClone(d);
  const base={point:[50,50] as Point,segmentIndex:0,direction:[1,1] as Point};
  for(const choice of [{...base,segmentIndex:-1},{...base,segmentIndex:.5},{...base,point:[NaN,50] as Point},{...base,direction:[0,0] as Point},{...base,point:[51,50] as Point},{...base,direction:[1,0] as Point}]){
    assert.throws(()=>continuousReflection(d,[0,100],[50,50],'M',undefined,{junctionChoices:[choice]}),/方向|交点/);
  }
  assert.throws(()=>continuousReflection(d,[0,100],[50,50],'M',undefined,{junctionChoices:[base,base]}),/选择无效/);
  assert.deepEqual(d,before);
});
