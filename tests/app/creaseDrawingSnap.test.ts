import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {SnapPoint} from '../../src/app/snapPoints';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {buildSnapPoints} from '../../src/app/snapPoints';
import {canvasInteractionDocument} from '../../src/app/canvasInteraction';
import {circleIntersectionPoints} from '../../src/app/circleConstructions';
import {paperGridGeometry} from '../../src/app/gridGeometry';
import {defaultCanvasPicking,pickingWorldRadius} from '../../src/app/canvasPicking';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import {buildFold} from '../../src/core/geometry';
import {creaseGridRayIntersections,creaseRayHasPhysicalPoint,creaseGridSnapPoint,snapCreaseDrawingPoint,visibleCreaseSnapPoints,type CreaseDrawingSnapGrid} from '../../src/app/creaseDrawingSnap';

const point=(id:string,p:Point):SnapPoint=>({id,point:p,kind:'endpoint',segmentIds:[id]});
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M'):Segment=>({id,a,b,assignment,angle:0});
const relation=(s:Segment):DiagramLineAnnotation=>({id:s.id,kind:'line',a:s.a,b:s.b,style:'crease',color:'#000000',width:1});
const grid:CreaseDrawingSnapGrid={visible:true,scope:'paper',snap:paperGridGeometry({x:0,y:0,width:100,height:100},10).snap,
  contains:p=>p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=100&&!(p[0]>40&&p[0]<60&&p[1]>40&&p[1]<60)};

test('a disabled, hidden, paper-exterior or cut-out grid cannot attract the pointer',()=>{
  const options={enabled:true,radius:3,points:[],grid};
  assert.deepEqual(snapCreaseDrawingPoint([31,29],options).point,[30,30]);
  for(const g of [{...grid,visible:false},{...grid,scope:'off' as const}]){
    assert.deepEqual(snapCreaseDrawingPoint([31,29],{...options,grid:g}).point,[31,29]);
  }
  assert.equal(creaseGridSnapPoint([-1,30],grid),null,'a nearby inside border node does not pull an exterior pointer');
  assert.equal(creaseGridSnapPoint([49,49],grid),null,'paper holes use the painted outline');
  assert.equal(creaseGridSnapPoint([39,49],{...grid,contains:p=>p[0]<40}),null,'the rounded candidate itself must also be inside paper');
  assert.deepEqual(creaseGridSnapPoint([-11,29],{...grid,scope:'canvas'}),[-10,30]);
  assert.equal(snapCreaseDrawingPoint([31,29],{...options,enabled:false}).kind,'none');
});

test('Shift rejects an off-axis endpoint and preserves an exact compatible endpoint',()=>{
  const options={enabled:true,radius:10,anchor:[0,0] as Point,shift:true,points:[point('off',[50,4])]};
  const rejected=snapCreaseDrawingPoint([50,4],options);
  assert.equal(rejected.kind,'none');assert.deepEqual(rejected.point,[50,0]);
  assert.deepEqual(snapCreaseDrawingPoint([49,4],{...options,points:[point('on',[50,0])]}).point,[50,0]);
  const diagonal=snapCreaseDrawingPoint([49,51],{...options,points:[point('diagonal',[50,50])]});
  assert.deepEqual(diagonal.point,[50,50]);assert.equal(diagonal.target?.id,'diagonal');
  assert.deepEqual(snapCreaseDrawingPoint([50,4],{...options,enabled:false}).point,[50,0],'explicit Shift works without automatic snapping');
});

test('exact physical points outrank a closer grid or line-body projection without rounding their coordinates',()=>{
  const target=point('non-grid',[30.4,30.8]),options={enabled:true,radius:3,points:[target],grid,segments:[segment('line',[0,30],[100,30])]};
  const before=structuredClone(options.points),resolved=snapCreaseDrawingPoint([30.1,30.1],options);
  assert.equal(resolved.kind,'point');assert.deepEqual(resolved.point,target.point);assert.equal(resolved.target,target);
  assert.deepEqual(options.points,before);
});

test('finite segment bodies accept local feet and constrained intersections, never distant or invisible extensions',()=>{
  const options={enabled:true,radius:2,points:[],segments:[segment('finite',[20,0],[20,100])]};
  assert.deepEqual(snapCreaseDrawingPoint([21,42],options).point,[20,42]);
  assert.equal(snapCreaseDrawingPoint([20,-4],options).kind,'none');
  const shifted=snapCreaseDrawingPoint([19,19],{...options,anchor:[0,0],shift:true});
  assert.equal(shifted.kind,'segment');assert.ok(Math.abs(shifted.point[0]-20)<1e-10&&Math.abs(shifted.point[1]-20)<1e-10);
  const shallow=segment('shallow',[0,1],[1000,2]);
  assert.equal(snapCreaseDrawingPoint([50,.5],{...options,anchor:[0,0],shift:true,segments:[shallow]}).kind,'none');
  assert.deepEqual(snapCreaseDrawingPoint([20,1],{...options,anchor:[0,0],shift:true,segments:[segment('over-origin',[-50,0],[50,0])]}).point,[20,0]);
});

test('hidden-only line points disappear while a shared visible junction retains its original source identity',()=>{
  const doc:Doc={name:'可见吸附',paper:{width:100,height:100},segments:[segment('hidden',[50,0],[50,100]),segment('visible',[0,50],[100,50],'A')]};
  const full=buildSnapPoints(doc),before=structuredClone(full),visible=canvasInteractionDocument(doc,{main:false,auxiliary:true});
  const points=visibleCreaseSnapPoints(full,new Set(visible.segments.map(s=>s.id)));
  assert.equal(points.some(p=>p.point[0]===50&&p.point[1]===0),false);
  const junction=points.find(p=>p.point[0]===50&&p.point[1]===50)!;
  assert.equal(junction,full.find(p=>p.id===junction.id));assert.deepEqual(junction.segmentIds,['hidden','visible']);
  assert.deepEqual(full,before);assert.deepEqual(visibleCreaseSnapPoints(full,new Set()),[]);
  const withCircle={...doc,objects:[{id:'circle',kind:'circle' as const,center:[50,50] as Point,radius:20,color:'#000000'}]};
  const circleHits=circleIntersectionPoints({...withCircle,segments:visible.segments});
  assert.deepEqual(circleHits.map(hit=>hit.point).sort(),[[30,50],[70,50]],'circle intersections use only displayed finite segments');
});

test('ordinary lines expose perpendicular and bisector relations only when no explicit point wins',()=>{
  const horizontal=segment('horizontal',[0,0],[100,0]),vertical=segment('vertical',[0,0],[0,100]);
  const perpendicular=snapCreaseDrawingPoint([20.6,25],{enabled:true,radius:2,points:[],anchor:[20,0],relationLines:[relation(horizontal)]});
  assert.equal(perpendicular.kind,'perpendicular');assert.deepEqual(perpendicular.point,[20,25]);assert.ok(perpendicular.relation);
  const bisector=snapCreaseDrawingPoint([30,31],{enabled:true,radius:2,points:[],anchor:[0,0],relationLines:[relation(horizontal),relation(vertical)]});
  assert.equal(bisector.kind,'bisector');assert.ok(Math.abs(bisector.point[0]-bisector.point[1])<1e-10);assert.equal(bisector.relation?.label,'角平分线');
  const explicit=snapCreaseDrawingPoint([30,31],{enabled:true,radius:2,points:[point('target',[30,31])],anchor:[0,0],relationLines:[relation(horizontal),relation(vertical)]});
  assert.equal(explicit.kind,'point');assert.equal(explicit.relation,null);
});

test('grid nodes outrank automatic relations and sliding line-body projections',()=>{
  const horizontal=segment('reference',[0,0],[100,0]);
  const perpendicular=snapCreaseDrawingPoint([20.6,29.5],{enabled:true,radius:2,points:[],grid,anchor:[20,0],relationLines:[relation(horizontal)]});
  assert.equal(perpendicular.kind,'grid');assert.deepEqual(perpendicular.point,[20,30]);assert.equal(perpendicular.relation?.kind,'perpendicular');
  const foot=snapCreaseDrawingPoint([21,42],{enabled:true,radius:3,points:[],grid,segments:[segment('edge',[20,0],[20,100])]});
  assert.equal(foot.kind,'grid');assert.deepEqual(foot.point,[20,40]);
  assert.equal(snapCreaseDrawingPoint([31,29],{enabled:true,radius:3,points:[],grid}).kind,'grid','a grid remains the fallback away from real geometry');
});

test('an existing perpendicular marker releases to exact nodes and crossings during the same gesture',()=>{
  const options={enabled:true,radius:2,points:[],grid,anchor:[20,0] as Point,relationLines:[relation(segment('reference',[0,0],[100,0]))]};
  const previous=snapCreaseDrawingPoint([20.6,25],options);
  assert.equal(previous.kind,'perpendicular');
  const node=snapCreaseDrawingPoint([20.6,29.5],{...options,previous});
  assert.equal(node.kind,'grid');assert.deepEqual(node.point,[20,30]);
  assert.equal(node.relation?.kind,'perpendicular');assert.deepEqual(node.relation?.point,node.point);
  const endpoint=point('endpoint',[20.8,30.3]);
  const physical=snapCreaseDrawingPoint([20.6,29.5],{...options,previous,points:[endpoint]});
  assert.equal(physical.target,endpoint);assert.deepEqual(physical.point,endpoint.point);
  assert.equal(physical.relation,null,'a real node off the perpendicular must not be moved or display a false right angle');
  const crossing=snapCreaseDrawingPoint([20.6,29.5],{...options,previous,segments:[segment('edge',[0,30],[100,30])],
    grid:{...grid,lattice:{origin:[0,0],stepX:10,stepY:10}}});
  assert.equal(crossing.kind,'grid-intersection');assert.deepEqual(crossing.point,[20,30]);
  assert.equal(crossing.relation?.kind,'perpendicular');
  const released=snapCreaseDrawingPoint([20.6,35],{...options,previous:node});
  assert.equal(released.kind,'perpendicular');assert.deepEqual(released.point,[20,35]);
});

test('a nearby grid node may leave an automatic perpendicular but not an explicit Shift constraint',()=>{
  const options={enabled:true,radius:2,points:[],grid,anchor:[20.8,0] as Point,relationLines:[relation(segment('reference',[0,0],[100,0]))]};
  const node=snapCreaseDrawingPoint([20.7,29.5],options);
  assert.equal(node.kind,'grid');assert.deepEqual(node.point,[20,30]);assert.equal(node.relation,null);
  const shifted=snapCreaseDrawingPoint([20.7,29.5],{...options,shift:true,previous:node});
  assert.equal(shifted.kind,'none');assert.ok(Math.abs(shifted.point[0]-20.8)<1e-9);
});

test('a relation at the starting paper edge still closes onto the opposite edge with browser coordinate noise',()=>{
  const source:Doc={name:'纸边吸附回归',paper:{width:200,height:200},segments:[
    segment('top',[0,0],[200,0],'B'),segment('right',[200,0],[200,200],'B'),
    segment('bottom',[200,200],[0,200],'B'),segment('left',[0,200],[0,0],'B'),
  ]};
  const options={enabled:true,radius:5,points:buildSnapPoints(source),segments:source.segments,relationLines:source.segments.map(relation)};
  // Exact saved coordinates from output/ux-review-20261016/normal-flow.log.
  const anchor:Point=[0,100.00000000000003],pointer:Point=[199.99998821571967,100.00000000000003];
  const before=structuredClone(source),resolved=snapCreaseDrawingPoint(pointer,{...options,anchor});
  assert.equal(resolved.kind,'perpendicular');assert.equal(resolved.point[0],200);
  assert.equal(resolved.point[1],anchor[1]);assert.deepEqual(resolved.relation?.point,resolved.point);
  const next=overlayDrawnSegments(source,[segment('drawn',anchor,resolved.point)],true);
  assert.equal(next.segments.length,7,'both boundary edges are split');
  assert.equal(buildFold(next).graph.faces_vertices?.length,2,'the drawn crease actually divides the paper');
  const withoutRelations=snapCreaseDrawingPoint(pointer,{...options,anchor,relationLines:[]});
  assert.equal(withoutRelations.kind,'segment');assert.equal(withoutRelations.point[0],200);
  assert.deepEqual(source,before,'resolving and proposing the overlay do not mutate the input');
});

test('finite targets retain perpendicular feet and bisector intersections instead of ending at a free projection',()=>{
  const horizontal=segment('horizontal',[0,0],[100,0]);
  const perpendicular=snapCreaseDrawingPoint([40.5,.4],{enabled:true,radius:2,points:[],anchor:[40,50],segments:[horizontal],relationLines:[relation(horizontal)]});
  assert.equal(perpendicular.kind,'perpendicular');assert.deepEqual(perpendicular.point,[40,0]);
  assert.deepEqual(perpendicular.relation?.point,[40,0]);
  const vertical=segment('vertical',[0,0],[0,100]),target=segment('target',[30,20],[30,40]);
  const bisector=snapCreaseDrawingPoint([30.2,31],{enabled:true,radius:2,points:[],anchor:[0,0],segments:[horizontal,vertical,target],relationLines:[relation(horizontal),relation(vertical)]});
  assert.equal(bisector.kind,'bisector');assert.deepEqual(bisector.point,[30,30]);
  assert.deepEqual(bisector.relation?.point,[30,30]);
});

test('a finite target wins when an automatic relation intersects only its extension or exceeds the pointer radius',()=>{
  const reference=relation(segment('reference',[-100,0],[100,0]));
  const options={enabled:true,radius:1,points:[],anchor:[0,0] as Point,relationLines:[reference]};
  const finite=snapCreaseDrawingPoint([.5,30],{...options,segments:[segment('short',[.3,29.8],[.7,29.8])]});
  assert.equal(finite.kind,'segment');assert.deepEqual(finite.point,[.5,29.8]);assert.equal(finite.relation,null);
  const bounded=snapCreaseDrawingPoint([.5,30],{...options,radius:1.1,segments:[segment('close',[-.1,31],[.1,31])]});
  assert.equal(bounded.kind,'segment');assert.ok(Math.abs(bounded.point[0]-.1)<1e-12);assert.equal(bounded.point[1],31);
});

test('screen picking distance remains constant across three zoom levels',()=>{
  for(const units of [.01,1,10]){
    const radius=pickingWorldRadius(defaultCanvasPicking(),units),options={enabled:true,radius,points:[point('target',[100,100])]};
    assert.equal(snapCreaseDrawingPoint([100+9*units,100],options).target?.id,'target');
    assert.equal(snapCreaseDrawingPoint([100+11*units,100],options).target,null);
  }
});

test('paper-edge grid crossings beat a closer continuous edge foot for first and second line endpoints',()=>{
  const lattice={origin:[0,0] as Point,stepX:25,stepY:25},shownGrid={...grid,lattice};
  const bottom=segment('bottom',[0,100],[100,100],'B');
  for(const anchor of [undefined,[40,30] as Point]){
    const resolved=snapCreaseDrawingPoint([24.2,100.3],{enabled:true,radius:2,points:[],segments:[bottom],grid:shownGrid,anchor,relationLines:[relation(bottom)]});
    assert.equal(resolved.kind,'grid-intersection');assert.deepEqual(resolved.point,[25,100]);
    const drawn=overlayDrawnSegments({name:'edge',paper:{width:100,height:100},segments:[bottom]},[segment('new',anchor??[40,30],resolved.point)],false);
    assert.ok(drawn.segments.some(s=>s.a[0]===25&&s.a[1]===100||s.b[0]===25&&s.b[1]===100));
  }
});

test('grid intersections use shifted rectangular and diagonal lattices without extending a finite paper edge',()=>{
  const lattice={origin:[10,20] as Point,stepX:30,stepY:15},shownGrid={...grid,scope:'canvas' as const,lattice};
  const edge=segment('edge',[10,23],[130,83],'B'),options={enabled:true,radius:1,points:[],segments:[edge],grid:shownGrid};
  const resolved=snapCreaseDrawingPoint([69.7,52.8],options);
  assert.equal(resolved.kind,'grid-intersection');assert.deepEqual(resolved.point,[70,53]);
  assert.equal(snapCreaseDrawingPoint([160,98],options).kind,'none');
  const diagonalGrid={...shownGrid,lattice:{origin:[0,0] as Point,stepX:20,stepY:20,diagonal:true}};
  const diagonal=snapCreaseDrawingPoint([26.9,13.1],{...options,radius:.5,grid:diagonalGrid,segments:[segment('sloped',[0,3],[100,40])]});
  const x=37/1.37;assert.equal(diagonal.kind,'grid-intersection');assert.ok(distancePoint(diagonal.point,[x,3+.37*x])<1e-8);
});

test('hidden grids and cut-out paper cannot create grid crossings, while an exact physical point keeps priority',()=>{
  const edge=segment('edge',[0,30],[100,30]),shownGrid={...grid,lattice:{origin:[0,0] as Point,stepX:10,stepY:10}};
  const options={enabled:true,radius:2,points:[],segments:[edge],grid:shownGrid};
  assert.equal(snapCreaseDrawingPoint([29.5,30.2],{...options,grid:{...shownGrid,visible:false}}).kind,'segment');
  assert.equal(snapCreaseDrawingPoint([29.5,30.2],{...options,grid:{...shownGrid,contains:()=>false}}).kind,'segment');
  const exact=point('real',[29.2,30]);
  const resolved=snapCreaseDrawingPoint([29.5,30.2],{...options,points:[exact]});
  assert.equal(resolved.kind,'point');assert.equal(resolved.target,exact);assert.deepEqual(resolved.point,exact.point);
});

test('discrete grid crossings hold through small pointer noise and release or switch when deliberately moved',()=>{
  const edge=segment('edge',[0,100],[100,100],'B'),options={enabled:true,radius:2,points:[],segments:[edge],grid:{...grid,lattice:{origin:[0,0] as Point,stepX:5,stepY:25}}};
  const first=snapCreaseDrawingPoint([25.2,100.1],options);
  assert.equal(first.kind,'grid-intersection');assert.deepEqual(first.point,[25,100]);
  const held=snapCreaseDrawingPoint([27.2,100.1],{...options,previous:first});
  assert.equal(held.kind,'grid-intersection');assert.deepEqual(held.point,[25,100]);
  const switched=snapCreaseDrawingPoint([29.7,100.1],{...options,previous:held});assert.deepEqual(switched.point,[30,100]);
  const released=snapCreaseDrawingPoint([32.8,100.1],{...options,previous:switched,grid:{...options.grid,lattice:{origin:[0,0],stepX:25,stepY:25}}});
  assert.equal(released.kind,'segment');assert.deepEqual(released.point,[32.8,100]);
  const disabled=snapCreaseDrawingPoint([27.2,100.1],{...options,previous:first,enabled:false});assert.equal(disabled.kind,'none');
  const exact=point('vertex',[25,100]),physical=snapCreaseDrawingPoint([25.2,100.1],{...options,points:[exact]});
  assert.equal(snapCreaseDrawingPoint([27.2,100.1],{...options,points:[exact],previous:physical}).target,exact);
});

test('Shift keeps only compatible paper/grid intersections even after a sticky free snap',()=>{
  const options={enabled:true,radius:2,points:[],segments:[segment('edge',[20,0],[20,100],'B')],grid:{...grid,lattice:{origin:[0,0] as Point,stepX:10,stepY:10}}};
  const previous=snapCreaseDrawingPoint([20.1,30.2],options);assert.deepEqual(previous.point,[20,30]);
  const shifted=snapCreaseDrawingPoint([19.9,20.3],{...options,anchor:[0,0],shift:true,previous});
  assert.deepEqual(shifted.point,[20,20]);assert.equal(shifted.kind,'grid-intersection');
});

function distancePoint(a:Point,b:Point){return Math.hypot(a[0]-b[0],a[1]-b[1]);}

test('grid ray snapping preserves physical crossings but permits grid stops along a collinear crease',()=>{
  const origin:Point=[17,13],resolved:Point=[74.8,13],collinear=segment('along',[20,13],[100,13]);
  assert.equal(creaseRayHasPhysicalPoint(origin,resolved,[],[collinear]),false);
  assert.equal(creaseRayHasPhysicalPoint(origin,resolved,[point('real',resolved)],[collinear]),true);
  assert.equal(creaseRayHasPhysicalPoint(origin,resolved,[],[segment('cross',[74.8,10],[74.8,20])]),true);
  assert.equal(creaseRayHasPhysicalPoint(origin,resolved,[],[segment('extension',[74.8,14],[74.8,20])]),false);
  const lattice=paperGridGeometry({x:0,y:0,width:200,height:200},8);
  assert.deepEqual(creaseGridRayIntersections(resolved,origin,{visible:true,scope:'canvas',lattice,snap:lattice.snap},1)[0],[75,13]);
});

test('fixed construction rays find exact grid-line crossings even away from grid nodes',()=>{
  const lattice=paperGridGeometry({x:0,y:0,width:200,height:200},8),origin:Point=[17,13],slope=Math.tan(Math.PI/8);
  const target:Point=[75,13+58*slope],projected:Point=[75.3,13+58.3*slope];
  const shown:CreaseDrawingSnapGrid={visible:true,scope:'paper',contains:p=>p.every(v=>v>=0&&v<=200),snap:lattice.snap,lattice};
  const hits=creaseGridRayIntersections(projected,origin,shown,1);
  assert.ok(distancePoint(hits[0],target)<1e-9);
  for(const candidate of hits)assert.ok(Math.abs((candidate[1]-13)-(candidate[0]-17)*slope)<1e-9);
  for(const g of [undefined,{...shown,visible:false},{...shown,scope:'off' as const},{...shown,contains:()=>false}])assert.deepEqual(creaseGridRayIntersections(projected,origin,g,1),[]);
  assert.deepEqual(creaseGridRayIntersections(origin,origin,shown,1),[]);
  assert.deepEqual(creaseGridRayIntersections([.2,0],[.1,0],{...shown,scope:'canvas'},1),[],'no origin or backwards grid crossing');
  const custom=paperGridGeometry({x:0,y:0,width:200,height:160},8,{diagonal:true,diagonalAngle:30});
  const angleTarget:Point=[20/Math.tan(Math.PI/6),20];
  assert.ok(distancePoint(creaseGridRayIntersections([angleTarget[0]+.02,20],[17,20],{...shown,lattice:custom,snap:custom.snap},.1)[0],angleTarget)<1e-9);
});

test('construction points snap to finite line/grid crossings without turning arbitrary line bodies into anchors',()=>{
  const lattice=paperGridGeometry({x:0,y:0,width:100,height:100},10),edge=segment('reference',[10,13],[90,53]);
  const shown:CreaseDrawingSnapGrid={visible:true,scope:'paper',contains:p=>p.every(v=>v>=0&&v<=100),snap:lattice.snap,lattice};
  const options={enabled:true,radius:1,points:[],segments:[edge],projectToSegments:false,grid:shown};
  const hit=snapCreaseDrawingPoint([40.3,28.2],options);
  assert.equal(hit.kind,'grid-intersection');assert.deepEqual(hit.point,[40,28]);
  assert.deepEqual(snapCreaseDrawingPoint(hit.point,options).point,hit.point,'hover and committed endpoint agree');
  const free:Point=[35,25.7];
  assert.equal(snapCreaseDrawingPoint(free,options).kind,'none');
  assert.deepEqual(snapCreaseDrawingPoint(free,options).point,free,'no unrequested projection onto the line body');
  for(const patch of [{enabled:false},{segments:[]},{grid:{...shown,visible:false}},{grid:{...shown,scope:'off' as const}},{grid:{...shown,contains:()=>false}}]){
    assert.equal(snapCreaseDrawingPoint([40.3,28.2],{...options,...patch}).kind,'none');
  }
  assert.equal(snapCreaseDrawingPoint([40.3,28.2],{...options,segments:[segment('short',[10,13],[30,23])]}).kind,'none');
  const real=point('physical',[40.2,28.1]);assert.equal(snapCreaseDrawingPoint([40.3,28.2],{...options,points:[real]}).target,real);
});

test('construction crossing mode follows a custom grid angle and preserves Shift constraints',()=>{
  const lattice=paperGridGeometry({x:0,y:0,width:100,height:40},4,{diagonal:true,diagonalAngle:30}),x=3/Math.tan(Math.PI/6);
  const shown:CreaseDrawingSnapGrid={visible:true,scope:'canvas',snap:lattice.snap,lattice};
  const options={enabled:true,radius:.1,points:[],segments:[segment('reference',[0,3],[30,3])],projectToSegments:false,grid:shown};
  const hit=snapCreaseDrawingPoint([x+.03,3.02],options);
  assert.equal(hit.kind,'grid-intersection');assert.ok(distancePoint(hit.point,[x,3])<1e-9);
  const orthogonal=paperGridGeometry({x:0,y:0,width:100,height:100},10);
  const constrained={...options,radius:1,anchor:[0,0] as Point,shift:true,segments:[segment('finite',[20,0],[20,100])],grid:{...shown,snap:orthogonal.snap,lattice:orthogonal}};
  assert.deepEqual(snapCreaseDrawingPoint([19.8,20.2],constrained).point,[20,20]);
  const rejected=snapCreaseDrawingPoint([20.1,30.1],constrained);
  assert.ok(Math.abs(rejected.point[0]-rejected.point[1])<1e-9,'off-axis crossing cannot pull the point away from its construction direction');
});

test('custom-angle crossings use the displayed finite grid instead of old 45-degree diagonals',()=>{
 const lattice=paperGridGeometry({x:0,y:0,width:100,height:40},4,{diagonal:true,diagonalAngle:30}),x=3/Math.tan(Math.PI/6),edge=segment('edge',[0,3],[30,3]);
 const shown:CreaseDrawingSnapGrid={visible:true,scope:'paper',contains:p=>p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=40,snap:lattice.snap,lattice};
 const options={enabled:true,radius:.1,points:[],segments:[edge],grid:shown},pointer:Point=[x+.03,3.02];
 const snapped=snapCreaseDrawingPoint(pointer,options);assert.equal(snapped.kind,'grid-intersection');assert.ok(distancePoint(snapped.point,[x,3])<1e-9);
 const changed=paperGridGeometry({x:0,y:0,width:100,height:40},4,{diagonal:true,diagonalAngle:45});
 assert.equal(snapCreaseDrawingPoint(pointer,{...options,grid:{...shown,snap:changed.snap,lattice:changed}}).kind,'segment');
 assert.equal(snapCreaseDrawingPoint(pointer,{...options,segments:[segment('short',[0,3],[4,3])]}).kind,'none');
 for(const grid of [{...shown,visible:false},{...shown,scope:'off' as const},{...shown,contains:()=>false}])assert.equal(snapCreaseDrawingPoint(pointer,{...options,grid}).kind,'segment');
 const node:Point=[10/Math.tan(Math.PI/6),10],free=creaseGridSnapPoint([node[0]+.02,node[1]+.03],{...shown,snap:()=>[0,0]});
 assert.ok(free&&distancePoint(free,node)<1e-9,'lattice governs custom-angle nodes, even when a legacy snap callback is supplied');
 const physical=point('real',[x+.01,3]);assert.equal(snapCreaseDrawingPoint(pointer,{...options,points:[physical]}).target,physical);
});
