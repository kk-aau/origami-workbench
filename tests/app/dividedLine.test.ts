import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendDividedLine,defaultDrawRatio,dividedLineSegments,drawRatioParameter,radicalValue} from '../../src/app/dividedLine';
import {splitEditableSegments} from '../../src/app/planarize';
import {historyReducer,type History} from '../../src/app/state';
import {type Doc,type Assignment} from '../../src/core/types';
const doc=():Doc=>({name:'分段绘制',paper:{width:200,height:200},segments:[]});
const term=(a:number,b=0,c=0)=>({a,b,c});
const ratio=(s:number,t:number)=>({kind:'ratio' as const,s:term(s),t:term(t)});
test('equal draw creates actual contiguous segments, includes N=1 and reversed direction',()=>{
  const d=doc(),r=dividedLineSegments(d,[100,20],[0,20],'M',{kind:'equal',count:4});
  assert.equal(r.length,4);assert.deepEqual(r.map(s=>s.a),[[100,20],[75,20],[50,20],[25,20]]);
  assert.deepEqual(r.at(-1)!.b,[0,20]);assert.equal(new Set(r.map(s=>s.id)).size,4);
  assert.equal(dividedLineSegments(d,[0,0],[100,0],'V',{kind:'equal',count:1}).length,1);
  assert.equal(d.segments.length,0);
});
test('radical default is 1:sqrt(2), parameter is measured from press point',()=>{
  const r=defaultDrawRatio(),t=drawRatioParameter(r.s,r.t)!;
  assert.ok(Math.abs(t-1/(1+Math.sqrt(2)))<1e-14);
  const parts=dividedLineSegments(doc(),[10,20],[110,220],'V',r);
  assert.deepEqual(parts[0].b,parts[1].a);assert.ok(Math.abs(parts[0].b[0]-(10+100*t))<1e-12);
  const other=defaultDrawRatio();r.s.a=50;assert.equal(other.s.a,1);
  assert.equal(radicalValue(term(3,-2,4)),-1);
});
test('zero ratio side produces one full line, both zero produce no geometry',()=>{
  for(const r of [ratio(0,2),ratio(2,0)]){
    const s=dividedLineSegments(doc(),[0,0],[100,0],'A',r);assert.equal(s.length,1);
    assert.deepEqual([s[0].a,s[0].b],[[0,0],[100,0]]);
  }
  assert.deepEqual(dividedLineSegments(doc(),[0,0],[100,0],'M',ratio(0,0)),[]);
});
test('signed external ratios retain geometric union without duplicate legs or parameter mutation',()=>{
  const r=ratio(2,-1),before=JSON.stringify(r),parts=dividedLineSegments(doc(),[0,0],[100,0],'B',r);
  assert.deepEqual(parts.map(s=>[s.a,s.b]),[[[0,0],[100,0]],[[100,0],[200,0]]]);
  assert.equal(JSON.stringify(r),before);
  assert.deepEqual(dividedLineSegments(doc(),[0,0],[100,0],'A',ratio(-1,2)).map(s=>s.a),[[-100,0],[0,0]]);
  assert.equal(drawRatioParameter(term(-1),term(-3)),.25);
});
test('all line types get correct new-line angles, IDs avoid both lines and objects',()=>{
  const d=doc();d.objects=[{kind:'circle',id:'draw-divided:1',center:[0,0],radius:3,color:'#000000'}];
  for(const assignment of ['M','V','A','B','U','F'] as Assignment[]){
    const s=dividedLineSegments(d,[0,0],[100,0],assignment,{kind:'equal',count:2});
    assert.notEqual(s[0].id,'draw-divided:1');assert.ok(s.every(s=>s.assignment===assignment));
    assert.equal(s[0].angle,assignment==='M'?-180:assignment==='V'?180:assignment==='U'?null:0);
  }
});
test('finite large ratio weights avoid sum overflow; invalid and degenerate geometry rejected',()=>{
  assert.equal(drawRatioParameter(term(1e308),term(1e308)),.5);
  assert.throws(()=>drawRatioParameter(term(1e308),term(1e-308)),/过于悬殊/);
  assert.throws(()=>drawRatioParameter(term(1e-308),term(1e308)),/过于悬殊/);
  for(const value of [NaN,Infinity])assert.throws(()=>radicalValue(term(value)));
  assert.throws(()=>radicalValue(term(0,1,-1)));assert.throws(()=>radicalValue(term(1e308,1e308,4)));
  assert.throws(()=>drawRatioParameter(term(1),term(-1)),/之和为零/);
  for(const count of [0,-1,1.5,NaN,Infinity])assert.throws(()=>dividedLineSegments(doc(),[0,0],[1,0],'M',{kind:'equal',count}));
  assert.throws(()=>dividedLineSegments(doc(),[0,0],[0,0],'M',ratio(1,1)));
  assert.throws(()=>dividedLineSegments(doc(),[NaN,0],[1,0],'M',ratio(1,1)));
  assert.throws(()=>dividedLineSegments(doc(),[0,0],[100,0],'M',ratio(1e-15,1)),/过短/);
  assert.throws(()=>dividedLineSegments(doc(),[0,0],[100,0],'M',ratio(1,-.999999)),/坐标/);
});
test('real equal endpoints survive intersection splitting and the entire append undoes once',()=>{
  const d=doc();d.segments=[{id:'vertical',a:[30,-10],b:[30,10],assignment:'V',angle:40}];
  const before=JSON.stringify(d),parts=dividedLineSegments(d,[0,0],[100,0],'M',{kind:'equal',count:4});
  const next=splitEditableSegments({...d,segments:[...d.segments,...parts]});
  assert.equal(next.segments.filter(s=>s.assignment==='M').length,5);
  assert.equal(next.segments.filter(s=>s.assignment==='V').length,2);
  for(const x of [25,30,50,75])assert.ok(next.segments.some(s=>s.a[0]===x&&s.a[1]===0));
  const h:History={past:[],present:d,future:[]},done=historyReducer(h,{type:'commit',doc:next});
  assert.equal(done.past.length,1);assert.equal(historyReducer(done,{type:'undo'}).present,d);
  assert.equal(historyReducer(historyReducer(done,{type:'undo'}),{type:'redo'}).present,next);
  assert.equal(JSON.stringify(d),before);
});
test('draw can cross the former segment cap without changing the source document',()=>{
  const d=doc();d.segments=Array.from({length:12000-1},(_,i)=>({id:String(i),a:[0,i],b:[10,i],assignment:'A' as const,angle:0}));
  const before=JSON.stringify(d);assert.equal(appendDividedLine(d,[20,-10],[120,-10],'M',{kind:'equal',count:2}).segments.length,12001);
  assert.equal(JSON.stringify(d),before);
});

test('drawing over a same-type full line inserts division points without duplicate geometry',()=>{
  const d=doc();d.segments=[{id:'original',a:[0,0],b:[100,0],assignment:'M',angle:-180}];
  const before=JSON.stringify(d),r=appendDividedLine(d,[100,0],[0,0],'M',{kind:'equal',count:4});
  assert.equal(r.segments.length,4);assert.equal(r.segments[0].id,'original');
  assert.deepEqual(r.segments.map(s=>s.a),[[0,0],[25,0],[50,0],[75,0]]);
  assert.equal(JSON.stringify(d),before);
  assert.equal(appendDividedLine(r,[0,0],[100,0],'M',{kind:'equal',count:4}),r);
});
test('partial collinear overlaps retain old endpoints plus new ratio point',()=>{
  const d=doc();d.segments=[{id:'old',a:[25,0],b:[125,0],assignment:'V',angle:180}];
  const r=appendDividedLine(d,[0,0],[100,0],'V',ratio(1,1));
  assert.equal(r.segments.length,4);
  assert.deepEqual([...new Set(r.segments.flatMap(s=>[s.a[0],s.b[0]]))].sort((a,b)=>a-b),[0,25,50,100,125]);
});
test('different existing line types and angles are replaced only on the drawn overlap',()=>{
  for(const [assignment,angle] of [['V',180],['M',-45],['M',null]] as const){
    const d=doc();d.segments=[{id:'old',a:[25,0],b:[75,0],assignment,angle}];
    const before=JSON.stringify(d),next=appendDividedLine(d,[0,0],[100,0],'M',{kind:'equal',count:4});
    assert.equal(JSON.stringify(d),before);
    assert.ok(next.segments.every(s=>s.assignment==='M'&&s.angle===-180));
    assert.ok(next.segments.every(s=>s.id!=='old'));
  }
});
test('duplicate unrelated lines and auxiliary objects are not silently cleaned up',()=>{
  const d=doc();d.segments=[{id:'x',a:[0,20],b:[100,20],assignment:'A',angle:0},{id:'y',a:[0,20],b:[100,20],assignment:'A',angle:0}];
  d.objects=[{kind:'circle',id:'circle',center:[0,0],radius:5,color:'#000000'}];
  const r=appendDividedLine(d,[0,0],[100,0],'A',{kind:'equal',count:2});
  assert.equal(r.segments.length,4);assert.equal(r.objects,d.objects);
  assert.equal(r.segments[0],d.segments[0]);assert.equal(r.segments[1],d.segments[1]);
});
test('deduplication preserves existing geometry while new division points can exceed the old cap',()=>{
  const d=doc();d.segments=Array.from({length:12000},(_,i)=>({id:String(i),a:[0,i],b:[100,i],assignment:'A' as const,angle:0}));
  assert.equal(appendDividedLine(d,[0,0],[100,0],'A',{kind:'equal',count:1}),d);
  assert.equal(appendDividedLine(d,[0,0],[100,0],'A',{kind:'equal',count:2}).segments.length,12001);
});
test('append includes crossing splits and preserves one history commit; zero ratio is identity',()=>{
  const d=doc();d.segments=[{id:'cross',a:[30,-20],b:[30,20],assignment:'A',angle:0}];
  const next=appendDividedLine(d,[0,0],[100,0],'M',{kind:'equal',count:4});
  assert.equal(next.segments.length,7);
  const h:History={past:[],present:d,future:[]},done=historyReducer(h,{type:'commit',doc:next});
  assert.equal(done.past.length,1);assert.equal(historyReducer(done,{type:'undo'}).present,d);
  assert.equal(appendDividedLine(d,[0,0],[100,0],'M',ratio(0,0)),d);
});
