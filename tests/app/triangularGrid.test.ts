import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point,Segment} from '../../src/core/types';
import {paperGridGeometry,gridLatticeNodes,gridLineFamilies,triangularGridTile,triangularGridPaths} from '../../src/app/gridGeometry';
import {diagramGridAxes,diagramGridIsNode,diagramGridPaths} from '../../src/app/diagramGrid';
import {diagramGridLineIntersections} from '../../src/app/diagramDrawingTools';
import {creaseGridSnapPoint,creaseGridRayIntersections,snapCreaseDrawingPoint,type CreaseDrawingSnapGrid} from '../../src/app/creaseDrawingSnap';
import {restrictedDrawingPoint,appendRestrictedDrawing} from '../../src/app/restrictedDrawing';
import {blankDoc,line} from '../../src/app/state';

const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8,`${a} != ${b}`);
const bounds={x:-12,y:7,width:200,height:80};
const triangle=()=>paperGridGeometry(bounds,10,{pattern:'triangular'});
const shown=(grid=triangle()):CreaseDrawingSnapGrid=>({visible:true,scope:'canvas',snap:grid.snap,lattice:grid});
const anchors=(grid=triangle())=>({vertices:[],centers:[],grid:{origin:grid.origin,step:grid.stepX,stepY:grid.stepY,pattern:'triangular' as const}});

test('triangular paper grid keeps equilateral sides on rectangular paper and has only three real line families',()=>{
  const grid=triangle(),s=20,h=s*Math.sqrt(3)/2;
  assert.equal(grid.stepX,s);assert.equal(grid.stepY,h);
  const axes=gridLineFamilies(grid);
  assert.deepEqual(axes.map(a=>a.angle),[0,60,-60]);
  for(const family of axes){assert.ok(Math.abs(Math.hypot(...family.normal)-1)<1e-12);assert.equal(family.step,h);}
  assert.deepEqual(diagramGridAxes(grid,2),axes,'legacy diagonal spacing must not add square axes');
  assert.deepEqual(gridLineFamilies({...grid,diagonal:true,diagonalAngle:22.5}),axes,'square diagonal flag cannot distort triangular tiling');
  const stretched=paperGridGeometry({...bounds,height:360},10,{pattern:'triangular'});
  assert.equal(stretched.stepY,h,'paper height does not stretch the equilateral cells');
});

test('six nearest neighbours form a regular hexagon and all triangle nodes lie on the painted families',()=>{
  const grid=triangle(),[ox,oy]=grid.origin,nodes=gridLatticeNodes(grid.origin,grid),families=gridLineFamilies(grid);
  const ring=nodes.filter(p=>Math.abs(Math.hypot(p[0]-ox,p[1]-oy)-grid.stepX)<1e-8);
  assert.equal(ring.length,6);
  const angles=ring.map(p=>Math.atan2(p[1]-oy,p[0]-ox)).sort((a,b)=>a-b);
  for(let i=0;i<6;i++)assert.ok(Math.abs((angles[(i+1)%6]-angles[i]+2*Math.PI)%(2*Math.PI)-Math.PI/3)<1e-8);
  for(const node of nodes)for(const {normal,step} of families){const index=((node[0]-ox)*normal[0]+(node[1]-oy)*normal[1])/step;assert.ok(Math.abs(index-Math.round(index))<1e-8);}
});

test('triangular snapping uses staggered nodes, including negative rows, without rectangular phantom nodes',()=>{
  const grid=triangle(),[ox,oy]=grid.origin,h=grid.stepY;
  for(const row of [-3,-1,0,1,4]){
    const target:Point=[ox+grid.stepX*(2+row/2),oy+row*h],pointer:Point=[target[0]+.03,target[1]-.02];
    close(grid.snap(pointer),target);close(creaseGridSnapPoint(pointer,shown(grid))!,target);close(restrictedDrawingPoint(pointer,.1,anchors(grid))!,target);
    assert.equal(diagramGridIsNode(target,grid,1e-8),true);
  }
  const phantom:Point=[ox,oy+h];
  assert.equal(diagramGridIsNode(phantom,grid,.1),false);
  assert.equal(restrictedDrawingPoint(phantom,.1,anchors(grid)),null);
  assert.ok(Math.hypot(...grid.snap(phantom).map((v,i)=>v-phantom[i]))>1);
});

test('triangle node and finite crease crossings use the same actual grid axes',()=>{
  const grid=paperGridGeometry({x:0,y:0,width:200,height:80},10,{pattern:'triangular'}),target:Point=[6,6*Math.sqrt(3)];
  const segment:Segment={id:'vertical-reference',a:[6,1],b:[6,30],assignment:'M',angle:0};
  const pointer:Point=[target[0]+.02,target[1]-.01],options={enabled:true,radius:.1,points:[],segments:[segment],projectToSegments:false,grid:shown(grid)};
  const snapped=snapCreaseDrawingPoint(pointer,options);assert.equal(snapped.kind,'grid-intersection');close(snapped.point,target);
  close(restrictedDrawingPoint(pointer,.1,{...anchors(grid),segments:[segment]})!,target);
  assert.deepEqual(diagramGridLineIntersections([20,5],[{a:[0,5],b:[40,5]}],grid,.1),[],'triangular grid has no vertical x=20 grid line');
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,segments:[{...segment,b:[6,5]}]}).kind,'none','extensions cannot create grid intersections');
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,grid:{...options.grid,visible:false}}).kind,'none');
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,grid:{...options.grid,scope:'paper',contains:()=>false}}).kind,'none');
});

test('fixed purple construction rays snap only to painted triangle grid lines',()=>{
  const grid=paperGridGeometry({x:0,y:0,width:200,height:80},10,{pattern:'triangular'}),target:Point=[20-4/Math.sqrt(3),4],pointer:Point=[target[0]+.02,4];
  close(creaseGridRayIntersections(pointer,[3,4],shown(grid),.1)[0],target);
  assert.deepEqual(creaseGridRayIntersections([20.01,4],[3,4],shown(grid),.1),[]);
  assert.deepEqual(creaseGridRayIntersections(pointer,[3,4],{...shown(grid),scope:'off'},.1),[]);
});

test('triangle restricted drawing honours paper masks and commits circles without altering reference creases',()=>{
  const grid=paperGridGeometry({x:0,y:0,width:200,height:80},10,{pattern:'triangular'}),doc=blankDoc('三角网格',200,80);
  doc.segments.push(line([6,1],[6,30],'M'));const before=structuredClone(doc),a:Point=[10,grid.stepY],b:Point=[6,6*Math.sqrt(3)];
  const refs={...anchors(grid),segments:doc.segments,grid:{...anchors(grid).grid,bounds:{x:0,y:0,width:200,height:80},contains:(p:Point)=>p[0]>=0&&p[1]>=0}};
  assert.equal(restrictedDrawingPoint(a,.1,{...refs,grid:{...refs.grid,contains:()=>false}}),null);
  const result=appendRestrictedDrawing(doc,'circle',a,b,.1,refs,'M');
  assert.deepEqual(doc,before);assert.deepEqual(result.segments,before.segments);
  const circle=result.objects!.find(o=>o.kind==='circle');assert.ok(circle&&circle.kind==='circle');close(circle.center,a);assert.ok(Math.abs(circle.radius-Math.hypot(a[0]-b[0],a[1]-b[1]))<1e-8);
  assert.throws(()=>restrictedDrawingPoint([0,0],100,anchors(paperGridGeometry({x:0,y:0,width:1,height:1},1000,{pattern:'triangular'}))),/过密/);
});

test('periodic triangle tile and clipped paths match the exact same 0/60/120 degree lattice',()=>{
  const grid=triangle(),tile=triangularGridTile(grid);assert.equal(tile.width,20);assert.equal(tile.height,grid.stepY*2);
  assert.equal(tile.path,`M0 0H20M0 ${grid.stepY}H20M0 ${grid.stepY*2}H20M0 0L20 ${grid.stepY*2}M20 0L0 ${grid.stepY*2}`);
  const paths=triangularGridPaths(bounds,grid),matches=[...paths.matchAll(/M([^ ]+) ([^L]+)L([^ ]+) ([^M]+)/g)].map(m=>m.slice(1).map(Number));
  assert.ok(matches.length>10&&matches.length<100);
  for(const [x1,y1,x2,y2] of matches){
    for(const [x,y] of [[x1,y1],[x2,y2]])assert.ok(x>=bounds.x-1e-8&&x<=bounds.x+bounds.width+1e-8&&y>=bounds.y-1e-8&&y<=bounds.y+bounds.height+1e-8);
    const angle=Math.atan2(Math.abs(y2-y1),Math.abs(x2-x1))*180/Math.PI;assert.ok(Math.abs(angle)<1e-8||Math.abs(angle-60)<1e-8);
    assert.ok(gridLineFamilies(grid).some(({normal,step})=>{const a=((x1-bounds.x)*normal[0]+(y1-bounds.y)*normal[1])/step,b=((x2-bounds.x)*normal[0]+(y2-bounds.y)*normal[1])/step;return Math.abs(a-Math.round(a))<1e-8&&Math.abs(a-b)<1e-8;}));
  }
  assert.deepEqual(diagramGridPaths(bounds,grid),{major:paths,minor:'',diagonal:''});
});
