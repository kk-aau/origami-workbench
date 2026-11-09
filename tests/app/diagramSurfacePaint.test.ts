import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance,polygonArea} from '../../src/core/geometry';
import type {Point} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import {diagramModelMarkup,diagramPresentation} from '../../src/app/diagramDrawing';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {defaultModelView} from '../../src/app/modelViewState';

function fixture():DiagramPose {
  const doc=blankDoc('不透明预折纸面',100,100);
  for(const [id,a,b] of [
    ['horizontal',[0,50],[100,50]],['vertical',[50,0],[50,100]],['diagonal',[0,0],[100,100]],
  ] as [string,Point,Point][])doc.segments.push({id,a,b,assignment:'F',angle:0});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);
  assert.equal(result.geometry.faces.length,1);
  return {sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result,
    view:{...defaultModelView(),colors:{front:'#ffffff',back:'#2f68c9',line:'#41634e'}}};
}
const attributes=(markup:string)=>Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
function paths(markup:string){return [...markup.matchAll(/<path\b[^>]*\/>/g)].map(m=>attributes(m[0]));}
const fills=(markup:string)=>paths(markup).filter(p=>p.stroke==='none'&&p.fill!=='none');
function polygons(path:string):Point[][] {
  return path.split(/(?=M )/).filter(Boolean).map(part=>{
    const coordinates=part.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    return Array.from({length:coordinates.length/2},(_,i)=>[coordinates[i*2],coordinates[i*2+1]] as Point);
  });
}
function paintedVertices(markup:string):number[][] {
  return fills(markup).flatMap(path=>path['data-diagram-cell-vertices'].split(' ').map(cell=>cell.split(',').map(Number)));
}
function checkSquareCoverage(pose:DiagramPose,markup:string){
  const painted=fills(markup).flatMap(path=>polygons(path.d)),presentation=diagramPresentation(pose);
  assert.ok(Math.abs(painted.reduce((sum,p)=>sum+Math.abs(polygonArea(p)),0)-10000)<1e-6);
  assert.deepEqual(paintedVertices(markup),diagramIllustrationMesh(pose).triangles[0],'all original indexed cells retain their paint order');
  const source=diagramIllustrationMesh(pose).triangles[0];
  painted.forEach((p,i)=>assert.deepEqual(p,source[i].map(v=>presentation.vertices[v])));
  const outline=paths(markup).filter(p=>p.fill==='none');assert.equal(outline.length,1);
  const segments=polygons(outline[0].d);
  assert.ok(segments.every(segment=>segment.length===2));
  assert.ok(Math.abs(segments.reduce((sum,[a,b])=>sum+distance(a,b),0)-400)<1e-6,'only the real paper boundary is stroked');
}

test('opaque same-side F cells share one fill while preserving original coverage and paper outline',()=>{
  const pose=fixture(),saved=structuredClone(pose),cells=diagramIllustrationMesh(pose).triangles[0];assert.ok(cells.length>=6);
  const markup=diagramModelMarkup(pose,undefined,true),paint=fills(markup);
  assert.equal(paint.length,1,'adjacent opaque triangles cannot be rasterized as independent fills');
  assert.equal(paint[0].fill,'#ffffff');assert.equal(paint[0]['fill-opacity'],'1');assert.equal(paint[0]['fill-rule'],'nonzero');
  assert.equal(polygons(paint[0].d).length,cells.length);checkSquareCoverage(pose,markup);assert.deepEqual(pose,saved);
});

function pulledFixture():DiagramPose {
  const pose=fixture(),index=pose.result.geometry.vertices.findIndex(p=>distance(p,[50,50])<1e-7);assert.ok(index>=0);
  const result=moveFoldedVertices(pose.result,{group:[index],selected:[index]},[130,70]);
  return {...pose,result,displayOrder:[0]};
}
test('a pulled face retains local front/back runs and triangle order even when both material colors match',()=>{
  const pose=pulledFixture(),mesh=diagramIllustrationMesh(pose),parities=mesh.triangles[0].map(cell=>polygonArea(cell.map(v=>pose.result.geometry.vertices[v]))>0);
  assert.deepEqual([...new Set(parities)].sort(),[false,true]);
  assert.ok(parities.slice(1).filter((front,i)=>front!==parities[i]).length>=2,'the pull includes separated runs of one material side');
  const saved=structuredClone(pose),paint=fills(diagramModelMarkup(pose,undefined,true));assert.ok(paint.length>=3);
  assert.deepEqual(paintedVertices(diagramModelMarkup(pose,undefined,true)),mesh.triangles[0]);
  for(const path of paint){
    const signs=polygons(path.d).map(p=>polygonArea(p)>0);assert.equal(new Set(signs).size,1,'one compound path cannot hide a genuine local material flip');
    assert.equal(path.fill,signs[0]?'#ffffff':'#2f68c9');
  }
  const sameColors={...pose.view!,colors:{front:'#ffffff',back:'#ffffff',line:'#41634e'}};
  const samePaint=fills(diagramModelMarkup(pose,sameColors,true));
  assert.equal(samePaint.length,paint.length,'equal colors must not merge or reorder opposite material sides');
  assert.deepEqual(samePaint.map(p=>p['data-diagram-cell-vertices']),paint.map(p=>p['data-diagram-cell-vertices']));
  assert.deepEqual(pose,saved);
});

for(const mode of ['xray','unknown'] as const)test(`${mode} keeps each translucent cell and its existing opacity`,()=>{
  const pose=fixture();if(mode==='xray')pose.view!.xray=true;else pose.result.layers={status:'unknown',message:'尚无层序'};
  const markup=diagramModelMarkup(pose,undefined,true),paint=fills(markup),cells=diagramIllustrationMesh(pose).triangles[0];
  assert.equal(paint.length,cells.length);assert.ok(paint.every(path=>polygons(path.d).length===1&&Number(path['fill-opacity'])===.09));
  checkSquareCoverage(pose,markup);
});

for(const rotation of [0,37,135])test(`back view at ${rotation} degrees preserves coverage and paints the actual back material`,()=>{
  const pose=fixture();pose.view={...pose.view!,side:'back',rotation};
  const markup=diagramModelMarkup(pose,undefined,true),paint=fills(markup);
  assert.equal(paint.length,1);assert.equal(paint[0].fill,'#2f68c9');
  checkSquareCoverage(pose,markup);
});
