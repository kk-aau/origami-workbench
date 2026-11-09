import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restrictedDrawingPoint,restrictedDrawingGeometry,appendRestrictedDrawing,type RestrictedAnchors} from '../../src/app/restrictedDrawing';
import {buildSnapPoints} from '../../src/app/snapPoints';
import {splitEditableSegments} from '../../src/app/planarize';
import {historyReducer,type History} from '../../src/app/state';
import type {Doc,Point} from '../../src/core/types';
const anchors:RestrictedAnchors={vertices:[[0,0],[100,0]],centers:[[50,50]]};
const doc:Doc={name:'受限绘制',paper:{width:200,height:200},segments:[],objects:[]};
test('only existing vertices and circle centers accepted without grid; radius inclusive and copies returned',()=>{
  const p=restrictedDrawingPoint([3,4],5,anchors);assert.deepEqual(p,[0,0]);assert.notEqual(p,anchors.vertices[0]);
  assert.equal(restrictedDrawingPoint([3,4],4.99,anchors),null);
  assert.deepEqual(restrictedDrawingPoint([50,50],0,anchors),[50,50]);
  assert.equal(restrictedDrawingPoint([60,50],1,anchors),null);
  assert.equal(restrictedDrawingPoint([50,0],1,anchors),null);
});
test('equal distance prefers vertices then centers then grid',()=>{
  const bank:RestrictedAnchors={vertices:[[0,0]],centers:[[2,0]],grid:{origin:[1,1],step:20}};
  assert.deepEqual(restrictedDrawingPoint([1,0],1,bank),[0,0]);
  assert.deepEqual(restrictedDrawingPoint([1,0],1,{...bank,vertices:[]}),[2,0]);
});
test('grid handles shifted origins, hidden/full/within-paper and excludes invented outside points',()=>{
  const bank:RestrictedAnchors={vertices:[],centers:[],grid:{origin:[-100,-50],step:25,bounds:{x:-100,y:-50,width:200,height:100}}};
  assert.deepEqual(restrictedDrawingPoint([-74,-24],2,bank),[-75,-25]);
  assert.equal(restrictedDrawingPoint([125,0],2,bank),null);
  assert.deepEqual(restrictedDrawingPoint([101,0],2,bank),[100,0]);
  assert.deepEqual(restrictedDrawingPoint([125,0],0,{...bank,grid:{origin:[-100,-50],step:25}}),[125,0]);
  assert.equal(restrictedDrawingPoint([-75,-25],0,{vertices:[],centers:[]}),null);
});
test('invalid points, grid and coincident endpoints reject before mutation',()=>{
  assert.throws(()=>restrictedDrawingPoint([NaN,0],2,anchors));
  assert.throws(()=>restrictedDrawingPoint([0,0],-1,anchors));
  assert.throws(()=>restrictedDrawingPoint([0,0],1,{...anchors,grid:{origin:[0,0],step:0}}));
  assert.throws(()=>restrictedDrawingGeometry([0,0],[1,1],2,anchors),/重合/);
  assert.throws(()=>restrictedDrawingGeometry([0,0],[30,30],1,anchors),/都须/);
});
test('line adopts assignment; circle is an independent object with correct center/radius; input unchanged',()=>{
  const before=JSON.stringify(doc);
  const l=appendRestrictedDrawing(doc,'line',[0,0],[100,0],1,anchors,'V');
  assert.equal(l.segments[0].assignment,'V');assert.equal(l.segments[0].angle,180);
  const c=appendRestrictedDrawing(doc,'circle',[0,0],[100,0],1,anchors,'M');
  assert.deepEqual(c.segments,[]);const o=c.objects![0];assert.equal(o.kind,'circle');if(o.kind==='circle'){assert.deepEqual(o.center,[0,0]);assert.equal(o.radius,100);}
  assert.equal(JSON.stringify(doc),before);
});
test('derived real intersections can be endpoints; commit splits all crossings and undo restores',()=>{
  const d:Doc={...doc,segments:[{id:'h',a:[0,50],b:[100,50],assignment:'M',angle:-180},{id:'v',a:[50,0],b:[50,100],assignment:'V',angle:180}]};
  const bank={vertices:buildSnapPoints(d).map(p=>p.point),centers:[[100,100] as Point]};
  const next=splitEditableSegments(appendRestrictedDrawing(d,'line',[50,50],[100,100],1,bank,'M'));
  assert.equal(next.segments.length,5);
  assert.equal(next.segments.filter(s=>[s.a,s.b].some(p=>p[0]===50&&p[1]===50)).length,5);
  const initial:History={past:[],present:d,future:[]},committed=historyReducer(initial,{type:'commit',doc:next});
  assert.deepEqual(historyReducer(committed,{type:'undo'}).present,d);
});
test('long valid line is not limited by circle radius cap',()=>{
  const bank:RestrictedAnchors={vertices:[[-1e6,0],[1e6,0]],centers:[]};
  assert.equal(appendRestrictedDrawing(doc,'line',[-1e6,0],[1e6,0],0,bank,'M').segments.length,1);
  assert.throws(()=>appendRestrictedDrawing(doc,'circle',[-1e6,0],[1e6,0],0,bank,'M'),/半径/);
});

test('restricted line replaces the covered auxiliary interval, keeps tails and respects boundary protection',()=>{
  const source:Doc={...doc,segments:[{id:'guide',a:[0,0],b:[100,0],assignment:'A',angle:0}]};
  const bank:RestrictedAnchors={vertices:[[25,0],[75,0]],centers:[]};
  const next=appendRestrictedDrawing(source,'line',[25,0],[75,0],0,bank,'V');
  assert.deepEqual(next.segments.filter(s=>s.assignment==='A').map(s=>[s.a,s.b]),[[[0,0],[25,0]],[[75,0],[100,0]]]);
  assert.deepEqual(next.segments.filter(s=>s.assignment==='V').map(s=>[s.a,s.b,s.angle]),[[[25,0],[75,0],180]]);
  assert.deepEqual(source.segments,[{id:'guide',a:[0,0],b:[100,0],assignment:'A',angle:0}]);
  const boundary:Doc={...source,segments:source.segments.map(s=>({...s,assignment:'B'}))};
  assert.throws(()=>appendRestrictedDrawing(boundary,'line',[25,0],[75,0],0,bank,'M',true),/边界保护/);
});
test('paper mask rejects nearest hole grid but still searches other visible candidates in radius',()=>{
  const bank:RestrictedAnchors={vertices:[],centers:[],grid:{origin:[0,0],step:10,bounds:{x:0,y:0,width:100,height:100},contains:p=>!(p[0]>20&&p[0]<80&&p[1]>20&&p[1]<80)}};
  assert.equal(restrictedDrawingPoint([50,50],4,bank),null);
  assert.deepEqual(restrictedDrawingPoint([29,50],10,bank),[20,50]);
  assert.deepEqual(restrictedDrawingPoint([29,50],10,{...bank,vertices:[[29,50]]}),[29,50]);
});
test('masked dense grid rejects excessive search instead of hanging; empty lattice gives no candidate',()=>{
  assert.throws(()=>restrictedDrawingPoint([0,0],100,{vertices:[],centers:[],grid:{origin:[0,0],step:.001,contains:()=>false}}),/过密/);
  assert.equal(restrictedDrawingPoint([5,5],2,{vertices:[],centers:[],grid:{origin:[0,0],step:10,bounds:{x:4,y:4,width:2,height:2},contains:()=>true}}),null);
});

test('finite line crossings are accepted without turning line bodies into unrestricted anchors',()=>{
  const bank:RestrictedAnchors={vertices:[],centers:[],segments:[{a:[3,3],b:[37,3]}],grid:{origin:[0,0],step:10}};
  assert.deepEqual(restrictedDrawingPoint([20.3,3.2],1,bank),[20,3]);
  assert.deepEqual(restrictedDrawingPoint([20,3],0,bank),[20,3]);
  assert.equal(restrictedDrawingPoint([25,3],1,bank),null);
  assert.equal(restrictedDrawingPoint([20,3],1,{...bank,grid:undefined}),null);
  assert.equal(restrictedDrawingPoint([20,3],.5,{...bank,segments:[{a:[11,3],b:[19,3]}]}),null);
});

test('grid crossings use shifted rectangular lattice and custom diagonal angles',()=>{
  const shifted:RestrictedAnchors={vertices:[],centers:[],segments:[{a:[-20,4],b:[55,4]}],grid:{origin:[-5,-3],step:20,stepY:10}};
  assert.deepEqual(restrictedDrawingPoint([15.1,4.2],.3,shifted),[15,4]);
  for(const angle of [15,22.5,30,45]){
    const y=7,x=y/Math.tan(angle*Math.PI/180);
    const bank:RestrictedAnchors={vertices:[],centers:[],segments:[{a:[1,y],b:[50,y]}],grid:{origin:[0,0],step:10,diagonal:true,diagonalAngle:angle}};
    const hit=restrictedDrawingPoint([x+.03,y+.02],.1,bank);
    assert.ok(hit,`${angle} degree crossing`);
    assert.ok(Math.hypot(hit[0]-x,hit[1]-y)<1e-10);
  }
});

test('finite grid crossings respect paper bounds and holes while full canvas allows outside hits',()=>{
  const bank:RestrictedAnchors={vertices:[],centers:[],segments:[{a:[-15,3],b:[115,3]}],grid:{origin:[0,0],step:10,bounds:{x:0,y:0,width:100,height:100},contains:p=>p[0]<40||p[0]>60}};
  assert.deepEqual(restrictedDrawingPoint([20,3],1,bank),[20,3]);
  assert.equal(restrictedDrawingPoint([50,3],1,bank),null);
  assert.equal(restrictedDrawingPoint([110,3],1,bank),null);
  assert.deepEqual(restrictedDrawingPoint([110,3],1,{...bank,grid:{origin:[0,0],step:10}}),[110,3]);
});

test('vertices and centers retain exact tie priority over new grid crossings',()=>{
  const bank:RestrictedAnchors={vertices:[[19,3]],centers:[[21,3]],segments:[{a:[3,4],b:[37,4]}],grid:{origin:[0,0],step:10}};
  assert.deepEqual(restrictedDrawingPoint([20,3],1,bank),[19,3]);
  assert.deepEqual(restrictedDrawingPoint([20,3],1,{...bank,vertices:[]}),[21,3]);
  assert.deepEqual(restrictedDrawingPoint([20,3],1,{...bank,vertices:[],centers:[]}),[20,4]);
});

test('restricted circle commit revalidates line grid crossings and does not mutate references',()=>{
  const source:Doc={...doc,segments:[{id:'reference',a:[3,3],b:[37,3],assignment:'A',angle:0}]};
  const bank:RestrictedAnchors={vertices:[],centers:[],segments:source.segments,grid:{origin:[0,0],step:10}};
  const before=JSON.stringify(source),next=appendRestrictedDrawing(source,'circle',[10.1,3],[30.1,3],.2,bank,'V');
  const circle=next.objects?.[0];assert.equal(circle?.kind,'circle');
  if(circle?.kind==='circle'){assert.deepEqual(circle.center,[10,3]);assert.equal(circle.radius,20);}
  assert.equal(JSON.stringify(source),before);assert.deepEqual(next.segments,source.segments);
});
