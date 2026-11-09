import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramZoomWaveRegion,diagramZoomRegionBounds,diagramZoomRegionContains,diagramZoomRegionPath,diagramZoomRegionPolygon,diagramZoomVisibleSegments,diagramZoomWaveSideAt,diagramZoomWavyDivider,prepareDiagramZoomRegionContains,prepareDiagramZoomVisibleSegments,validateDiagramZoomRegion,type DiagramZoomBounds,type DiagramZoomWaveRegion} from '../../src/app/diagramZoomGeometry';
import type {Point} from '../../src/core/types';

const bounds:DiagramZoomBounds={x:0,y:0,width:100,height:100};
const horizontal:Point[]=[[0,50],[100,50]];
function polygonArea(points:Point[]){return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;}

test('circle selection has exact clipping bounds and includes its visible edge',()=>{
  const region={kind:'circle' as const,center:[20,30] as Point,radius:12};
  assert.deepEqual(diagramZoomRegionBounds(region),{x:8,y:18,width:24,height:24});
  assert.equal(diagramZoomRegionContains(region,[20,30]),true);assert.equal(diagramZoomRegionContains(region,[32,30]),true);assert.equal(diagramZoomRegionContains(region,[33,30]),false);
  assert.match(diagramZoomRegionPath(region),/^M 8 30 A 12 12.* Z$/);
  assert.doesNotThrow(()=>validateDiagramZoomRegion(region));
});

test('wave side selection closes along the rectangle, with shared divider and no missing area',()=>{
  const lower=createDiagramZoomWaveRegion(horizontal,bounds,[50,80]),upper=createDiagramZoomWaveRegion(horizontal,bounds,[50,20]);
  assert.equal(lower.side,'left');assert.equal(upper.side,'right');
  assert.deepEqual(diagramZoomRegionBounds(lower),{x:0,y:50,width:100,height:50});
  assert.deepEqual(diagramZoomRegionBounds(upper),{x:0,y:0,width:100,height:50});
  assert.equal(diagramZoomRegionContains(lower,[50,20]),false);assert.equal(diagramZoomRegionContains(upper,[50,20]),true);
  const a=diagramZoomRegionPolygon(lower),b=diagramZoomRegionPolygon(upper);assert.equal(Math.abs(polygonArea(a))+Math.abs(polygonArea(b)),10_000);
  assert.deepEqual(a,[[0,50],[100,50],[100,100],[0,100]]);assert.match(diagramZoomRegionPath(lower),/L 100 100 L 0 100 Z$/);
  horizontal[0][0]=0;lower.points[0][0]=1;assert.equal(horizontal[0][0],0,'new regions own their points');
});

test('curved dividers, reversed gestures and corner endpoints select the clicked material consistently',()=>{
  const points:Point[]=[[0,0],[25,20],[35,70],[80,75],[100,100]],click:Point=[10,70];
  const region=createDiagramZoomWaveRegion(points,bounds,click),reverse=createDiagramZoomWaveRegion([...points].reverse(),bounds,click);
  assert.equal(diagramZoomRegionContains(region,click),true);assert.equal(region.side,reverse.side==='left'?'right':'left');
  for(let x=5;x<100;x+=10)for(let y=5;y<100;y+=10)assert.equal(diagramZoomRegionContains(region,[x,y]),diagramZoomRegionContains(reverse,[x,y]));
  const left:DiagramZoomWaveRegion={kind:'wave',points,side:'left',bounds},right:DiagramZoomWaveRegion={...left,side:'right'};
  assert.equal(Math.abs(polygonArea(diagramZoomRegionPolygon(left)))+Math.abs(polygonArea(diagramZoomRegionPolygon(right))),10_000);
});

test('same-edge endpoints can enclose a valid cap if their middle passes through the interior',()=>{
  const points:Point[]=[[20,0],[50,30],[80,0]],region=createDiagramZoomWaveRegion(points,bounds,[50,10]);
  assert.equal(diagramZoomRegionContains(region,[50,10]),true);assert.equal(diagramZoomRegionContains(region,[50,80]),false);
  assert.deepEqual(diagramZoomRegionBounds(region),{x:20,y:0,width:60,height:30});
});

test('clicking the divider or outside does not silently choose an arbitrary side',()=>{
  for(const p of [[50,50],[0,50],[100,50],[-1,50],[101,70],[NaN,20]] as Point[])assert.equal(diagramZoomWaveSideAt(horizontal,bounds,p),null);
  assert.throws(()=>createDiagramZoomWaveRegion(horizontal,bounds,[50,50]),/点击.*一侧/);
});

test('invalid persisted selection input and ambiguous wave topologies are rejected',()=>{
  for(const region of [null,{}, {kind:'circle',center:[0,0],radius:0},{kind:'circle',center:[0,0],radius:Infinity},{kind:'circle',center:[999_999,0],radius:2},{kind:'circle',center:[0,0],radius:2,html:'bad'}, {kind:'wave',points:horizontal,bounds,side:'top'}, {kind:'wave',points:horizontal,bounds:{...bounds,width:-1},side:'left'}])assert.throws(()=>validateDiagramZoomRegion(region));
  const malformed:Point[][]=[
    [[10,50],[90,50]], // both ends inside
    [[0,0],[100,0]], // no actual split
    [[0,50],[50,100],[100,50]], // a third boundary touch
    [[0,50],[50,50],[50,50],[100,50]],
    [[0,50],[70,50],[30,50],[100,50]],
    [[0,25],[80,75],[20,75],[100,25]], // crossing
    [[0,20],[20,20],[60,60],[20,20],[100,80]], // touching itself
    [[0,50],[110,60],[100,70]],
  ];
  for(const points of malformed)assert.throws(()=>validateDiagramZoomRegion({kind:'wave',points,bounds,side:'left'}));
});

test('a two-point gesture produces one deterministic bounded wave across the whole display',()=>{
  const a:Point=[20,40],b:Point=[70,50],points=diagramZoomWavyDivider(a,b,bounds);
  assert.deepEqual(points,diagramZoomWavyDivider(a,b,bounds));assert.ok(points.length>20);
  assert.equal(points[0][0],0);assert.equal(points.at(-1)![0],100);
  assert.ok(points.slice(1,-1).some(p=>Math.abs(p[1]-(36+p[0]*.2))>.2),'the boundary is visibly wavy');
  const lower=createDiagramZoomWaveRegion(points,bounds,[50,90]),upper=createDiagramZoomWaveRegion(points,bounds,[50,10]);
  assert.equal(diagramZoomRegionContains(lower,[50,90]),true);assert.equal(diagramZoomRegionContains(upper,[50,10]),true);
  assert.ok(Math.abs(Math.abs(polygonArea(diagramZoomRegionPolygon(lower)))+Math.abs(polygonArea(diagramZoomRegionPolygon(upper)))-10_000)<1e-8);
  assert.throws(()=>diagramZoomWavyDivider([0,0],[0,0],bounds),/拖动/);assert.throws(()=>diagramZoomWavyDivider([0,-10],[50,-10],bounds),/没有穿过/);
});

test('geometry remains valid for shifted drawings and diagonal waves through corners',()=>{
  const shifted:DiagramZoomBounds={x:-700,y:850,width:200,height:100},points=diagramZoomWavyDivider([-650,875],[-550,925],shifted);
  const selected=createDiagramZoomWaveRegion(points,shifted,[-680,920]);assert.equal(diagramZoomRegionContains(selected,[-680,920]),true);
  const diagonal=diagramZoomWavyDivider([0,0],[100,100],bounds);assert.deepEqual(diagonal[0],[0,0]);assert.deepEqual(diagonal.at(-1),[100,100]);
  assert.doesNotThrow(()=>validateDiagramZoomRegion(createDiagramZoomWaveRegion(diagonal,bounds,[5,95])));
});

test('prepared snap predicates validate once and keep independent immutable geometry',()=>{
  const circle={kind:'circle' as const,center:[20,20] as Point,radius:5},insideCircle=prepareDiagramZoomRegionContains(circle);
  circle.center[0]=70;circle.radius=1;
  assert.equal(insideCircle([20,20]),true);assert.equal(insideCircle([70,20]),false);assert.equal(insideCircle([NaN,20]),false);
  const region=createDiagramZoomWaveRegion(horizontal,{...bounds},[50,80]),insideWave=prepareDiagramZoomRegionContains(region);
  region.points[0][1]=90;region.bounds.height=200;region.side='right';
  assert.equal(insideWave([50,80]),true);assert.equal(insideWave([50,20]),false);assert.equal(insideWave([50,150]),false);
  assert.throws(()=>prepareDiagramZoomRegionContains({kind:'circle',center:[20,20],radius:0}));
});

test('circle segment clipping removes hidden extensions, outside and zero-length tangencies',()=>{
  const region={kind:'circle' as const,center:[0,0] as Point,radius:10};
  assert.deepEqual(diagramZoomVisibleSegments(region,[-20,0],[20,0]),[{a:[-10,0],b:[10,0]}]);
  assert.deepEqual(diagramZoomVisibleSegments(region,[-2,0],[2,0]),[{a:[-2,0],b:[2,0]}]);
  assert.deepEqual(diagramZoomVisibleSegments(region,[-20,20],[20,20]),[]);
  assert.deepEqual(diagramZoomVisibleSegments(region,[-20,10],[20,10]),[]);
  assert.deepEqual(diagramZoomVisibleSegments(region,[0,0],[0,0]),[]);
  assert.deepEqual(diagramZoomVisibleSegments(region,[NaN,0],[0,0]),[]);
});

test('wave clipping supports multiple disjoint visible segments and exact boundary overlap',()=>{
  const lower=createDiagramZoomWaveRegion(horizontal,bounds,[50,80]);
  assert.deepEqual(diagramZoomVisibleSegments(lower,[50,0],[50,100]),[{a:[50,50],b:[50,100]}]);
  assert.deepEqual(diagramZoomVisibleSegments(lower,[-20,50],[120,50]),[{a:[0,50],b:[100,50]}]);
  const points:Point[]=[[0,50],[25,25],[50,75],[75,25],[100,50]],wavy=createDiagramZoomWaveRegion(points,bounds,[50,90]);
  const clipped=diagramZoomVisibleSegments(wavy,[0,50],[100,50]);assert.equal(clipped.length,2);
  assert.deepEqual(clipped,[{a:[0,50],b:[37.5,50]},{a:[62.5,50],b:[100,50]}]);
  const prepared=prepareDiagramZoomVisibleSegments(wavy);wavy.points[1][1]=99;wavy.side='right';
  assert.deepEqual(prepared([0,50],[100,50]),clipped,'prepared clipping is isolated from later project edits');
});
