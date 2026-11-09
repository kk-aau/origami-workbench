import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point,Segment} from '../../src/core/types';
import {paperGridGeometry,gridToWorld,gridToLocal,gridLineFamilies,diagonalGridFamilies,gridLatticeNodes,validateGridRotation,type GridLattice} from '../../src/app/gridGeometry';
import {diagramGridAxes,diagramGridIsNode,diagramGridPaths} from '../../src/app/diagramGrid';
import {diagramGridLineIntersections} from '../../src/app/diagramDrawingTools';
import {creaseGridSnapPoint,creaseGridRayIntersections,snapCreaseDrawingPoint,type CreaseDrawingSnapGrid} from '../../src/app/creaseDrawingSnap';
import {restrictedDrawingPoint,appendRestrictedDrawing} from '../../src/app/restrictedDrawing';
import {blankDoc,line} from '../../src/app/state';

const bounds={x:0,y:0,width:200,height:120};
const close=(a:Point,b:Point,eps=1e-8)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<eps,`${a} != ${b}`);
const inside=(p:Point)=>p[0]>=0&&p[0]<=200&&p[1]>=0&&p[1]<=120;
const grid=(rotation=45,diagonal=false)=>paperGridGeometry(bounds,4,{pattern:'square',rotation,diagonal});
const shown=(lattice:ReturnType<typeof grid>):CreaseDrawingSnapGrid=>({visible:true,scope:'paper',contains:inside,lattice,snap:lattice.snap});
const anchors=(lattice:GridLattice)=>({vertices:[],centers:[],grid:{origin:lattice.origin,step:lattice.stepX,stepY:lattice.stepY,rotation:lattice.rotation,pattern:lattice.pattern,diagonal:lattice.diagonal,bounds,contains:inside}});

test('explicit square and diagonal cells remain square on rectangular paper while legacy callers retain subdivisions',()=>{
  const g=grid(0,true);
  assert.equal(g.stepX,50);assert.equal(g.stepY,50);
  assert.deepEqual(diagonalGridFamilies(g).map(f=>f.angle),[-45,45]);
  const changed=paperGridGeometry({...bounds,height:360},4,{pattern:'square'});
  assert.equal(changed.stepY,50);
  const legacy=paperGridGeometry(bounds,4,{diagonal:true});
  assert.equal(legacy.stepY,30);
  assert.ok(Math.abs(diagonalGridFamilies(legacy)[1].angle-Math.atan2(30,50)*180/Math.PI)<1e-10);
  close(g.snap([25.01,25.02]),[25,25]);
  assert.equal(diagramGridIsNode([25,25],g,1e-8),true,'crossed cell diagonals have a real centre node');
  assert.equal(diagramGridIsNode([25,20],g,1e-8),false);
});

test('square rotation is rigid around paper centre, with an invertible world transform and normalized angles',()=>{
  const centre:Point=[100,60];
  for(const angle of [0,15,22.5,45,90,-45,-90,180,270,360,765]){
    const g=grid(angle),originExpected=gridToWorld([0,0],g);
    close(originExpected,g.origin);close(gridToWorld(centre,g),centre);
    for(const local of [[0,0],[50,50],[-100,250]] as Point[]){close(gridToLocal(gridToWorld(local,g),g),local);}
    const a=gridToWorld([50,50],g),b=gridToWorld([100,50],g),c=gridToWorld([50,100],g);
    assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-50)<1e-9);
    assert.ok(Math.abs((b[0]-a[0])*(c[0]-a[0])+(b[1]-a[1])*(c[1]-a[1]))<1e-8);
  }
  close(grid(45).origin,[100-40/Math.sqrt(2),60-160/Math.sqrt(2)]);
  assert.equal(validateGridRotation(360),0);assert.equal(validateGridRotation(270),-90);assert.equal(validateGridRotation(765),45);
  assert.equal(validateGridRotation(30.1),30.1);assert.equal(validateGridRotation(1e-9),1e-9);
  for(const invalid of [NaN,Infinity,-Infinity,'45',null,undefined])assert.throws(()=>validateGridRotation(invalid),/角度/);
});

test('painted rotated families, nodes and clipped paths describe the same lattice',()=>{
  for(const rotation of [-45,22.5,90]){
    const g=grid(rotation,true),families=gridLineFamilies(g);
    assert.deepEqual(diagramGridAxes(g),families);
    const centreNode=gridToWorld([75,75],g);
    assert.ok(gridLatticeNodes(centreNode,g).some(n=>Math.hypot(n[0]-centreNode[0],n[1]-centreNode[1])<1e-8));
    close(g.snap([centreNode[0]+.01,centreNode[1]-.02]),centreNode);
    const paths=diagramGridPaths(bounds,g);
    for(const d of [paths.major,paths.diagonal]){
      const lines=[...d.matchAll(/M([^ ]+) ([^L]+)L([^ ]+) ([^M]+)/g)].map(m=>m.slice(1).map(Number));
      assert.ok(lines.length>0);
      for(const [x1,y1,x2,y2]of lines){
        for(const p of [[x1,y1],[x2,y2]])assert.ok(p[0]>=-1e-8&&p[0]<=200+1e-8&&p[1]>=-1e-8&&p[1]<=120+1e-8);
        assert.ok(families.some(({normal,step})=>{
          const a=((x1-g.origin[0])*normal[0]+(y1-g.origin[1])*normal[1])/step,b=((x2-g.origin[0])*normal[0]+(y2-g.origin[1])*normal[1])/step;
          return Math.abs(a-Math.round(a))<1e-8&&Math.abs(a-b)<1e-8;
        }));
      }
    }
  }
});

test('free and restricted rotated snapping share exact visible nodes without old rectangular phantom targets',()=>{
  const g=grid(),target=gridToWorld([50,50],g),pointer:Point=[target[0]+.03,target[1]-.02];
  close(creaseGridSnapPoint(pointer,shown(g))!,target);close(restrictedDrawingPoint(pointer,.1,anchors(g))!,target);
  assert.equal(restrictedDrawingPoint([50,50],.1,anchors(g)),null);
  const masked={...anchors(g),grid:{...anchors(g).grid,contains:()=>false}};
  assert.equal(restrictedDrawingPoint(pointer,.1,masked),null);
  const outside=gridToWorld([0,0],g);
  assert.equal(restrictedDrawingPoint(outside,.1,anchors(g)),null);
  close(restrictedDrawingPoint(outside,.1,{...anchors(g),grid:{...anchors(g).grid,bounds:undefined,contains:undefined}})!,outside);
  const g0=grid(0,true);close(restrictedDrawingPoint([25.02,25.01],.1,anchors(g0))!,[25,25]);
});

test('rotated finite crease crossings and construction guide intersections use the visible grid direction',()=>{
  const g=grid(),target=gridToWorld([50,70],g),pointer:Point=[target[0]+.02,target[1]+.01];
  const segment:Segment={id:'reference',a:[target[0]-10,target[1]],b:[target[0]+10,target[1]],assignment:'A',angle:0};
  assert.ok(diagramGridLineIntersections(pointer,[segment],g,.1).some(p=>Math.hypot(p[0]-target[0],p[1]-target[1])<1e-8));
  const options={enabled:true,radius:.1,points:[],segments:[segment],projectToSegments:false,grid:shown(g)};
  const hit=snapCreaseDrawingPoint(pointer,options);assert.equal(hit.kind,'grid-intersection');close(hit.point,target);
  close(restrictedDrawingPoint(pointer,.1,{...anchors(g),segments:[segment]})!,target);
  close(creaseGridRayIntersections([target[0]+.02,target[1]],[target[0]-20,target[1]],shown(g),.1)[0],target);
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,grid:{...shown(g),visible:false}}).kind,'none');
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,segments:[]}).kind,'none');
  assert.equal(snapCreaseDrawingPoint(pointer,{...options,enabled:false}).kind,'none');
});

test('restricted circle commits the same rotated visible grid points while preserving reference creases',()=>{
  const g=grid(),a=gridToWorld([50,50],g),b=gridToWorld([100,50],g),doc=blankDoc('旋转格',200,120);
  doc.segments.push(line([20,30],[70,30],'A'));
  const before=structuredClone(doc),result=appendRestrictedDrawing(doc,'circle',a,b,.1,anchors(g),'M');
  assert.deepEqual(doc,before);assert.deepEqual(result.segments,before.segments);
  const circle=result.objects!.find(o=>o.kind==='circle')!;assert.equal(circle.kind,'circle');
  if(circle.kind==='circle'){close(circle.center,a);assert.ok(Math.abs(circle.radius-50)<1e-8);}
  assert.throws(()=>restrictedDrawingPoint([100,60],20,{vertices:[],centers:[],grid:{origin:g.origin,step:.001,stepY:.001,pattern:'square',rotation:45}}),/过密/);
});

test('triangular grids ignore stored square rotations and retain equilateral geometry and snapping',()=>{
  const a=paperGridGeometry(bounds,4,{pattern:'triangular'}),b=paperGridGeometry(bounds,4,{pattern:'triangular',rotation:45});
  assert.deepEqual(b.origin,a.origin);assert.equal(b.rotation,0);assert.deepEqual(gridLineFamilies(b),gridLineFamilies(a));
  close(b.snap([75.02,b.stepY+.01]),[75,b.stepY]);
});
