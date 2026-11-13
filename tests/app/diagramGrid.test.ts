import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramBasicSettings,diagramBasicPaperDoc} from '../../src/app/diagramBasicSettings';
import {defaultDiagramCanvas} from '../../src/app/diagramProject';
import {getPaperBounds} from '../../src/app/paper';
import {paperGridGeometry} from '../../src/app/gridGeometry';
import {diagramPaperGrid,diagramGridVisible,diagramGridPaths,diagramGridIsNode} from '../../src/app/diagramGrid';
import {snapDiagramPoint,snapDiagramSymbolPoint,snapDiagramSymbolAxisPoint,snapDiagramSymbolRotationPoint,snapDiagramTranslation,diagramGridLineIntersections} from '../../src/app/diagramDrawingTools';
import {snapDiagramDrawingLine} from '../../src/app/diagramDrawingSnap';
import type {Point} from '../../src/core/types';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

const settings={gridDivisions:4,gridSpacing:20,gridSubdivisions:4,diagonalGrid:false};
const line=(a:Point,b:Point):DiagramLineAnnotation=>({id:'reference',kind:'line',a,b,style:'auxiliary',color:'#123456',width:.7});
const near=(actual:Point,expected:Point)=>assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-7,`${actual} != ${expected}`);

test('rectangular drawing grids use square cells with the width division count',()=>{
  const doc=blankDoc('矩形纸',320,160),before=structuredClone(doc),grid=diagramPaperGrid(settings,doc),cp=paperGridGeometry(getPaperBounds(doc),4,{pattern:'square'});
  assert.deepEqual(grid.origin,[0,0]);assert.equal(grid.stepX,80);assert.equal(grid.stepY,80);assert.equal(grid.divisions,4);
  assert.deepEqual(grid.bounds,{x:0,y:0,width:320,height:160});assert.equal(grid.pattern,'square');
  for(const point of [[159.4,79.7],[250,118],[-80.2,-39.8]] as Point[])assert.deepEqual(grid.snap(point),cp.snap(point));
  const paths=diagramGridPaths(grid.bounds,grid);assert.equal(paths.minor,'');assert.equal((paths.major.match(/V/g)??[]).length,5);assert.equal((paths.major.match(/H/g)??[]).length,3);
  assert.ok(paths.major.includes('M160 0V160'));assert.ok(paths.major.includes('M0 80H320'));assert.deepEqual(doc,before);
});

test('new 100 by 200 paper has twice as many square grid rows without stretching paper or snapping',()=>{
  for(const [width,height] of [[100,200],[200,100],[100,100],[100,150]]){
    const doc=diagramBasicPaperDoc('新矩形纸',defaultDiagramBasicSettings(width,height)),before=structuredClone(doc),grid=diagramPaperGrid(defaultDiagramCanvas(width),doc),step=width/4;
    assert.equal(grid.stepX,step);assert.equal(grid.stepY,step);assert.equal(grid.divisions,4);
    assert.deepEqual(grid.bounds,{x:0,y:0,width,height});assert.deepEqual(doc.paper,{width,height});
    const paths=diagramGridPaths(grid.bounds,grid);
    assert.equal((paths.major.match(/V/g)??[]).length,5);assert.equal((paths.major.match(/H/g)??[]).length,Math.floor(height/step)+1);
    const target:Point=[2*step,3*step],pointer:Point=[target[0]-.2,target[1]+.1];
    near(grid.snap(pointer),target);near(snapDiagramDrawingLine(pointer,{enabled:true,radius:1,targets:[],lines:[],grid}).point,target);
    assert.deepEqual(doc,before);
  }
});

test('negative boundary origin and extent define the grid despite different paper metadata and outside artwork',()=>{
  const doc=blankDoc('负坐标纸',160,80);for(const segment of doc.segments)for(const point of [segment.a,segment.b]){point[0]-=260;point[1]-=180;}
  doc.paper={width:400,height:300};doc.segments.push({id:'outside-art',a:[1000,1200],b:[1600,1800],assignment:'A',angle:0});
  const grid=diagramPaperGrid(settings,doc);assert.deepEqual(grid.origin,[-260,-180]);assert.equal(grid.stepX,40);assert.equal(grid.stepY,40);assert.deepEqual(grid.bounds,{x:-260,y:-180,width:160,height:80});
  near(grid.snap([-179.8,-140.1]),[-180,-140]);
  const paths=diagramGridPaths({x:-260,y:-180,width:160,height:80},grid);assert.ok(paths.major.includes('M-180 -180V-100'));assert.ok(paths.major.includes('M-260 -140H-100'));
});

test('explicit paper divisions override legacy millimetres while saved old grids derive a bounded division count',()=>{
  const doc=blankDoc('兼容',200,100),legacy={gridSpacing:20,gridSubdivisions:4,diagonalGrid:false};
  const old=diagramPaperGrid(legacy,doc);assert.equal(old.divisions,40);assert.equal(old.stepX,5);assert.equal(old.stepY,5);
  const current=diagramPaperGrid({...legacy,gridDivisions:8},doc);assert.equal(current.divisions,8);assert.equal(current.stepX,25);assert.equal(current.stepY,25);
  assert.equal(diagramPaperGrid({...legacy,gridSpacing:.1},doc).divisions,512);assert.equal(diagramPaperGrid({...legacy,gridSpacing:10_000},doc).divisions,1);
  const fallback=diagramPaperGrid(settings);assert.deepEqual(fallback.origin,[0,0]);assert.equal(fallback.stepX,50);assert.equal(fallback.stepY,50);
});

test('dense drawing grids retain 128 through 512 divisions and their exact square spacing',()=>{
 const doc=blankDoc('密网格',320,160),before=structuredClone(doc);
 for(const gridDivisions of [128,129,256,512]){
  const grid=diagramPaperGrid({...settings,gridDivisions},doc),step=320/gridDivisions;
  assert.equal(grid.divisions,gridDivisions);assert.equal(grid.stepX,step);assert.equal(grid.stepY,step);
  const point:Point=[step*7,step*11];near(grid.snap([point[0]+step*.1,point[1]-step*.1]),point);
 }
 const dense=diagramPaperGrid({...settings,gridDivisions:512},doc),paths=diagramGridPaths(dense.bounds,dense);
 assert.equal((paths.major.match(/V/g)??[]).length,513);assert.equal((paths.major.match(/H/g)??[]).length,257);
 assert.deepEqual(doc,before);
});

test('zoom can hide a dense grid but never changes its lattice or leaves invisible grid snapping',()=>{
  const grid=diagramPaperGrid(settings,blankDoc('缩放',320,160)),before={origin:[...grid.origin],stepX:grid.stepX,stepY:grid.stepY,divisions:grid.divisions};
  for(const units of [.05,1,10,20,200]){
    const visible=diagramGridVisible(grid,units),pointer:Point=[159.6,79.7];
    assert.equal(visible,Math.min(grid.stepX,grid.stepY)/units>=3);
    const result=snapDiagramDrawingLine(pointer,{enabled:true,radius:2,targets:[],lines:[],grid:visible?grid:undefined});
    near(result.point,visible?[160,80]:pointer);assert.equal(result.target?.kind,visible?'grid':undefined);
    assert.deepEqual({origin:grid.origin,stepX:grid.stepX,stepY:grid.stepY,divisions:grid.divisions},before);
  }
});

test('free points, symbol placement, group translation and symbol grips share the displayed square lattice',()=>{
  const grid=diagramPaperGrid(settings,blankDoc('移动',320,160)),options={enabled:true,radius:2,targets:[],grid};
  near(snapDiagramPoint([159.6,79.8],options),[160,80]);near(snapDiagramSymbolPoint([159.6,79.8],options),[160,80]);
  near(snapDiagramTranslation([10,10],[149.6,69.8],options),[150,70]);
  near(snapDiagramSymbolAxisPoint([159.5,87],[0,80],[320,80],options),[160,80]);
  near(snapDiagramSymbolRotationPoint([159.6,79.8],[0,0],0,options),[160,80]);
  near(snapDiagramSymbolPoint([159.6,159.6],{...options,anchor:[0,0],constrain:true}),[160,160]);
  near(snapDiagramPoint([159.6,79.8],{...options,enabled:false}),[159.6,79.8]);
});

test('crease intersections use the visible square grid coordinates including shifted and diagonal cells',()=>{
  const grid=diagramPaperGrid(settings,blankDoc('交点',320,160)),reference=line([25.6,17.6],[294.4,132.8]),pointer:Point=[160.3,75.4];
  const exact=diagramGridLineIntersections(pointer,[reference],grid,1);assert.ok(exact.some(point=>Math.hypot(point[0]-160,point[1]-75.2)<1e-7));
  const snapped=snapDiagramDrawingLine(pointer,{enabled:true,radius:1,targets:[],lines:[reference],grid});near(snapped.point,[160,75.2]);assert.equal(snapped.target?.kind,'grid-intersection');
  const diagonal={...grid,diagonal:true},horizontal=line([0,20],[320,20]),result=snapDiagramDrawingLine([139.8,20.1],{enabled:true,radius:.5,targets:[],lines:[horizontal],grid:diagonal});
  near(result.point,[140,20]);assert.equal(result.target?.kind,'grid-intersection');assert.notEqual(snapDiagramDrawingLine([139.8,20.1],{enabled:true,radius:.5,targets:[],lines:[horizontal],grid}).target?.kind,'grid-intersection');
  const shifted={origin:[-260,-180] as Point,stepX:40,stepY:20};near(snapDiagramDrawingLine([-179.7,-139.9],{enabled:true,radius:1,targets:[],lines:[],grid:shifted}).point,[-180,-140]);
});

test('rectangular paper diagonals stay at 45 degrees and all snap paths catch their visible cell-centre crossings',()=>{
  const grid=diagramPaperGrid({...settings,diagonalGrid:true},blankDoc('斜向网格',100,200)),plain=diagramPaperGrid(settings,blankDoc('正交网格',100,200)),pointer:Point=[12.6,12.4],target:Point=[12.5,12.5];
  const paths=diagramGridPaths(grid.bounds,grid),segments=[...paths.diagonal.matchAll(/M([^ ]+) ([^L]+)L([^ ]+) ([^M]+)/g)];
  assert.ok(segments.length>0);
  for(const match of segments){const [x1,y1,x2,y2]=match.slice(1).map(Number);assert.ok(Math.abs(Math.abs(y2-y1)-Math.abs(x2-x1))<1e-8);}
  near(grid.snap(pointer),target);near(snapDiagramPoint(pointer,{enabled:true,radius:1,targets:[],grid}),target);
  const result=snapDiagramDrawingLine(pointer,{enabled:true,radius:1,targets:[],lines:[],grid});near(result.point,target);assert.equal(result.target?.kind,'grid');
  assert.equal(diagramGridIsNode(target,grid,1e-7),true);assert.equal(diagramGridIsNode(target,plain,1e-7),false);
  near(snapDiagramDrawingLine(pointer,{enabled:true,radius:1,targets:[],lines:[],grid:plain}).point,pointer);
});

test('paper grids retain point priority, custom angles, Shift, Alt and finite source limits',()=>{
  const grid=diagramPaperGrid(settings,blankDoc('约束',320,160)),options={enabled:true,radius:2,targets:[] as Point[],lines:[] as DiagramLineAnnotation[],grid};
  near(snapDiagramDrawingLine([159.7,79.7],{...options,targets:[[159,79]]}).point,[159,79]);
  const pointer:Point=[100,80],custom=snapDiagramDrawingLine(pointer,{...options,anchor:[0,0],anglePreset:37.5}).point;assert.ok(Math.abs(Math.atan2(custom[1],custom[0])*180/Math.PI-37.5)<1e-8);
  const shifted=snapDiagramDrawingLine([159.6,159.6],{...options,anchor:[0,0],shiftKey:true}).point;near(shifted,[160,160]);
  near(snapDiagramDrawingLine([159.6,79.7],{...options,altKey:true}).point,[159.6,79.7]);
  assert.deepEqual(diagramGridLineIntersections([160,75.2],[line([25.6,17.6],[100,49.4857142857])],grid,1),[]);
});
