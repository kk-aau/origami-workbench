import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paperGridGeometry,diagonalGridFamilies,diagonalGridPaths,validateDiagonalGridAngle} from '../../src/app/gridGeometry';
import {getPaperBounds} from '../../src/app/paper';
import {blankDoc,line} from '../../src/app/state';
import {resizeDocument} from '../../src/app/drawingObjects';
import {restrictedDrawingPoint} from '../../src/app/restrictedDrawing';

test('single-axis resizing keeps reference subdivisions and crease points aligned in both axes',()=>{
 const doc=blankDoc('尺寸',200,200);doc.segments.push(line([50,75],[150,125],'M'));
 const resized=resizeDocument(doc,320,120),grid=paperGridGeometry(getPaperBounds(resized),8);
 assert.equal(grid.stepX,40);assert.equal(grid.stepY,15);
 assert.deepEqual(grid.snap(resized.segments.at(-1)!.a),[80,45]);assert.deepEqual(grid.snap(resized.segments.at(-1)!.b),[240,75]);
 assert.deepEqual(grid.snap([320,120]),[320,120]);
 const original=paperGridGeometry(getPaperBounds(doc),8);assert.equal(original.stepX,25);assert.equal(original.stepY,25);
});

test('shifted rectangular grid and restricted drawing share the same snapping coordinates',()=>{
 const bounds={x:-200,y:60,width:300,height:100},grid=paperGridGeometry(bounds,8);
 const expected:[number,number]=[-125,97.5],point:[number,number]=[-124,98];
 assert.deepEqual(grid.snap(point),expected);
 assert.deepEqual(restrictedDrawingPoint(point,2,{vertices:[],centers:[],grid:{origin:grid.origin,step:grid.stepX,stepY:grid.stepY,bounds}}),expected);
 assert.equal(restrictedDrawingPoint([-125,172.5],1,{vertices:[],centers:[],grid:{origin:grid.origin,step:grid.stepX,stepY:grid.stepY,bounds}}),null);
});

test('an unspecified usable grid density falls back to four while explicit saved density remains unchanged',()=>{
 const bounds={x:0,y:0,width:200,height:120};
 for(const invalid of [NaN,Infinity,0,-1]){const grid=paperGridGeometry(bounds,invalid);assert.equal(grid.stepX,50);assert.equal(grid.stepY,30);}
 const custom=paperGridGeometry(bounds,8);assert.equal(custom.stepX,25);assert.equal(custom.stepY,15);
});

test('custom diagonal paths use real degrees on rectangular paper, stay clipped and share snap axes',()=>{
 const bounds={x:-40,y:15,width:200,height:80};
 for(const angle of [15,22.5,30,45,89.9]){
  const grid=paperGridGeometry(bounds,4,{diagonal:true,diagonalAngle:angle}),families=diagonalGridFamilies(grid),path=diagonalGridPaths(bounds,grid);
  const lines=[...path.matchAll(/M([^ ]+) ([^L]+)L([^ ]+) ([^M]+)/g)].map(match=>match.slice(1).map(Number));
  assert.ok(lines.length>0&&lines.length<100);
  for(const [x1,y1,x2,y2] of lines){
   for(const [x,y] of [[x1,y1],[x2,y2]])assert.ok(x>=bounds.x-1e-8&&x<=bounds.x+bounds.width+1e-8&&y>=bounds.y-1e-8&&y<=bounds.y+bounds.height+1e-8);
   assert.ok(Math.abs(Math.atan2(Math.abs(y2-y1),Math.abs(x2-x1))*180/Math.PI-angle)<1e-8);
   assert.ok(families.some(({normal:[nx,ny],step})=>{
    const a=((x1-bounds.x)*nx+(y1-bounds.y)*ny)/step,b=((x2-bounds.x)*nx+(y2-bounds.y)*ny)/step;
    return Math.abs(a-Math.round(a))<1e-8&&Math.abs(a-b)<1e-8;
   }));
  }
 }
 const legacy=diagonalGridFamilies(paperGridGeometry(bounds,4,{diagonal:true}));
 assert.ok(Math.abs(legacy[1].angle-Math.atan2(20,50)*180/Math.PI)<1e-8);
 assert.equal(diagonalGridPaths(bounds,paperGridGeometry(bounds,4,{diagonal:false,diagonalAngle:30})), '');
});

test('custom diagonal grid intersections are real snap points without angle-dependent line explosion',()=>{
 const bounds={x:0,y:0,width:100,height:40},grid=paperGridGeometry(bounds,4,{diagonal:true,diagonalAngle:30});
 const target:[number,number]=[10/Math.tan(Math.PI/6),10];
 const snapped=grid.snap([target[0]+.03,target[1]+.02]);assert.ok(Math.hypot(snapped[0]-target[0],snapped[1]-target[1])<1e-9);
 const restricted=restrictedDrawingPoint([target[0]+.03,target[1]+.02],.1,{vertices:[],centers:[],grid:{origin:grid.origin,step:grid.stepX,stepY:grid.stepY,diagonal:true,diagonalAngle:30,bounds}});
 assert.ok(restricted&&Math.hypot(restricted[0]-target[0],restricted[1]-target[1])<1e-9);
 const spacing=diagonalGridFamilies(grid)[0].step;
 for(const angle of [.001,15,89.999]){
  const shallow={...grid,diagonalAngle:angle};assert.equal(diagonalGridFamilies(shallow)[0].step,spacing);
  assert.ok((diagonalGridPaths(bounds,shallow).match(/M/g)??[]).length<100);
 }
 for(const angle of [0,90,-1,NaN,Infinity,'30',null])assert.throws(()=>validateDiagonalGridAngle(angle),/角度/);
 assert.throws(()=>diagonalGridPaths({x:0,y:0,width:1e7,height:1e7},grid),/过密/);
});
