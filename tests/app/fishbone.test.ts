import test from 'node:test';
import assert from 'node:assert/strict';
import {fishbone} from '../../src/app/fishbone';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import {type Doc,type Point,type Segment,type Assignment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Assignment='B'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const edges=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
const doc=(segments=edges):Doc=>({name:'鱼骨',paper:{width:200,height:200},segments});
test('fishbone uses grid intervals, joins both sides and alternates at stations without drawing baseline',()=>{
 const d=doc(),before=structuredClone(d),r=fishbone(d,[25,100],[175,100],25,'M');
 assert.equal(r.copies.length,7);assert.equal(r.copies.map(s=>s.assignment).join(''),'MVMVMVM');
 r.copies.forEach((s,i)=>assert.deepEqual([s.a,s.b],[[25+i*25,0],[25+i*25,200]]));assert.deepEqual(d,before);
});
test('skip transverse stations but advance color; parallel baseline does not suppress',()=>{
 const r=fishbone(doc([...edges,s('cross',[50,0],[50,200],'M'),s('base',[25,100],[175,100],'M')]),[25,100],[175,100],25,'M');
 assert.equal(r.copies.length,6);assert.equal(r.copies.map(s=>s.assignment).join(''),'MMVMVM');assert.match(r.stopMessage,/跳过 1 点/);
});
test('nearest finite stop wins; auxiliary is ignored',()=>{
 const r=fishbone(doc([...edges,s('stop',[0,50],[200,50],'M'),s('aux',[0,75],[200,75],'A')]),[25,100],[175,100],50,'V');
 assert.ok(r.copies.every(s=>s.a[1]===50&&s.b[1]===200));
});
test('one-sided candidates remain finite and report missing directions',()=>{
 const r=fishbone(doc([edges[0]]),[25,100],[175,100],50,'M');assert.equal(r.copies.length,4);assert.ok(r.copies.every(s=>s.a[1]===100&&s.b[1]===0));assert.match(r.stopMessage,/4 个方向无截止/);
 assert.throws(()=>fishbone(doc([]),[25,100],[175,100],25,'M'),/没有可生成/);
});
test('nonintegral length includes only stations on baseline, reversing direction reverses phase anchor',()=>{
 const a=fishbone(doc(),[25,100],[160,100],50,'M'),b=fishbone(doc(),[160,100],[25,100],50,'M');
 assert.deepEqual(a.copies.map(s=>s.a[0]),[25,75,125]);assert.deepEqual(b.copies.map(s=>s.a[0]),[160,110,60]);
});
test('diagonal baseline makes perpendicular teeth with actual boundary stops',()=>{
 const r=fishbone(doc(),[25,25],[175,175],25*Math.SQRT2,'M');assert.equal(r.copies.length,7);
 assert.ok(r.copies.every(s=>Math.abs((s.b[0]-s.a[0])+(s.b[1]-s.a[1]))<1e-8));
});
test('unknown and auxiliary presets do not alternate or guess mountain/valley',()=>{
 for(const assignment of ['A','U','B','F'] as Assignment[]){const r=fishbone(doc(),[25,100],[175,100],25,assignment);assert.ok(r.copies.every(s=>s.assignment===assignment&&s.angle===(assignment==='U'?null:0)));}
});
test('invalid input and spacing below geometric precision reject atomically',()=>{
 for(const spacing of [0,-1,NaN,Infinity,1e-7])assert.throws(()=>fishbone(doc(),[25,100],[175,100],spacing,'M'));
 assert.throws(()=>fishbone(doc(),[25,100],[25,100],25,'M'));assert.throws(()=>fishbone(doc(),[NaN,100],[175,100],25,'M'));
});

test('a nearby transverse crease does not suppress a distinct station',()=>{
 const r=fishbone(doc([...edges,s('nearby',[25.00005,0],[25.00005,200],'M')]),[25,100],[175,100],25,'M');
 assert.equal(r.copies.length,7);
 assert.equal(r.copies[0].a[0],25);
 assert.match(r.stopMessage,/跳过 0 点/);
});

test('a shallow transverse crease still suppresses its actual intersection station',()=>{
 const r=fishbone(doc([...edges,s('shallow',[0,99.99975],[200,100.00175],'M')]),[25,100],[175,100],25,'M');
 assert.equal(r.copies.length,6);
 assert.equal(r.copies[0].assignment,'V');
 assert.match(r.stopMessage,/跳过 1 点/);
});

test('fishbone teeth directly cover auxiliary lines and keep the station phase',()=>{
 const d=doc([...edges,s('guide',[25,25],[25,175],'A')]),before=structuredClone(d);
 const r=fishbone(d,[25,100],[175,100],25,'M'),next=overlayDrawnSegments(d,r.copies,true);
 assert.equal(next.segments.some(line=>line.id.startsWith('guide')),false);
 assert.ok(next.segments.filter(line=>line.a[0]===25&&line.b[0]===25).every(line=>line.assignment==='M'&&line.angle===-180));
 assert.equal(r.copies.map(line=>line.assignment).join(''),'MVMVMVM');assert.deepEqual(d,before);
});
