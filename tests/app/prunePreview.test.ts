import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultPruneBoundary,previewPrune,pruneBoundaryError,pruneMotherPreviewParams,pruneParamsForBoundary,
  prunePolygonsIntersect,rectangularPruneBoundary} from '../../src/app/prunePreview';
import {changeTessParams,defaultTileTwists,readTessParams,tessPreset,type TessGraph,type XY} from '../../src/app/tessellation';

const rectangle=(x:number,y:number,width=1,height=1):XY[]=>[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
function grid(columns:number,rows:number,omit:(x:number,y:number)=>boolean=()=>false):TessGraph{
  const vertices_coords:XY[]=[],faces_vertices:number[][]=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)vertices_coords.push([x,y]);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(!omit(x,y)){
    const a=y*(columns+1)+x;faces_vertices.push([a,a+1,a+columns+2,a+columns+1]);
  }
  return {vertices_coords,faces_vertices,edges_vertices:[],edges_assignment:[]};
}

test('prune preview retains whole intersecting tiles and reports exact external removal',()=>{
  const mother=grid(3,3),before=structuredClone(mother),preview=previewPrune(mother,rectangle(.2,.2,1.6,1.6));
  assert.equal(preview.problem,'');assert.equal(preview.kept,4);assert.equal(preview.removed,5);assert.equal(preview.components,1);
  assert.deepEqual(preview.states,['keep','keep','remove','keep','keep','remove','remove','remove','remove']);
  assert.deepEqual(mother,before,'the preview must not crop or mutate original tile geometry');
  assert.deepEqual(previewPrune(mother,rectangle(.2,.2,.6,.6)).states,['keep',...Array(8).fill('remove')]);
});

test('edge and corner contacts retain tiles, regardless of boundary orientation',()=>{
  const mesh=grid(2,2),boundary=rectangle(1,1,.2,.2);
  assert.equal(previewPrune(mesh,boundary).kept,4,'edge and shared corner contact count');
  assert.deepEqual(previewPrune(mesh,boundary),previewPrune(mesh,[...boundary].reverse()));
  assert.equal(previewPrune(mesh,rectangle(1+2e-8,1+2e-8,.2,.2)).kept,1);
});

test('intersection includes pure crossings and containment with no vertex on the other polygon',()=>{
  const horizontal=rectangle(-2,-.1,4,.2),vertical=rectangle(-.1,-2,.2,4);
  assert.ok(prunePolygonsIntersect(horizontal,vertical));
  assert.ok(prunePolygonsIntersect(rectangle(0,0,4,4),rectangle(1,1,.2,.2)));
  assert.ok(prunePolygonsIntersect(horizontal,rectangle(2,0,1,1)));
  assert.ok(!prunePolygonsIntersect(horizontal,rectangle(2.01,0,1,1)));
});

test('concave source tile notch remains empty while touching notch edges retains the entire tile',()=>{
  const tile:XY[]=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],notch=rectangle(1.5,1.5,.5,.5);
  assert.ok(!prunePolygonsIntersect(tile,notch));
  assert.ok(prunePolygonsIntersect(tile,rectangle(.5,1.5,.5,.5)));
  const mesh:TessGraph={vertices_coords:tile,faces_vertices:[[0,1,2,3,4,5]],edges_vertices:[],edges_assignment:[]};
  assert.match(previewPrune(mesh,notch).problem,/没有接触/);
});

test('preview rejects disconnected retained patches and vertex-only connections',()=>{
  const mesh=grid(3,1,x=>x===1),preview=previewPrune(mesh,rectangle(-.1,-.1,3.2,1.2));
  assert.equal(preview.components,2);assert.match(preview.problem,/未共边/);
  const diagonal=grid(2,2,(x,y)=>x!==y);
  assert.match(previewPrune(diagonal,rectangle(-.1,-.1,2.2,2.2)).problem,/未共边/);
});

test('a connected retained patch with a hole fails the backend Euler condition',()=>{
  const ring=grid(3,3,(x,y)=>x===1&&y===1),preview=previewPrune(ring,rectangle(-.1,-.1,3.2,3.2));
  assert.equal(preview.components,1);assert.equal(preview.kept,8);assert.match(preview.problem,/无孔洞/);
  assert.equal(previewPrune(grid(3,3),rectangle(8,8,1,1)).kept,0);
});

test('convex ordered boundary editing allows inserting collinear points and rejects malformed shapes',()=>{
  assert.equal(pruneBoundaryError([[0,0],[.5,0],[1,0],[1,1],[0,1]]),'');
  for(const boundary of [[[0,0],[1,0]],[[0,0],[1,0],[.2,.2],[0,1]],[[0,0],[1,1],[0,1],[1,0]],[[0,0],[11,0],[0,1]],[[0,0],[NaN,0],[0,1]]] as XY[][])
    assert.notEqual(pruneBoundaryError(boundary),'');
  assert.match(previewPrune(null,rectangle(0,0)).problem,/母结构/);
});

test('default and rectangle commands use original coordinate units without rounding precision',()=>{
  const mesh=grid(3,3);
  defaultPruneBoundary(mesh).forEach((point,i)=>point.forEach((coordinate,k)=>assert.ok(Math.abs(coordinate-rectangle(.6,.6,1.8,1.8)[i][k])<1e-14)));
  const points:XY[]=[[.123456789,-.765432109],[.987654321,1.23456789],[.3,.5]];
  const rect=rectangularPruneBoundary(points);
  assert.deepEqual(rect,[[.123456789,-.765432109],[.987654321,-.765432109],[.987654321,1.23456789],[.123456789,1.23456789]]);
  assert.equal(pruneBoundaryError(rectangularPruneBoundary([[10,10],[11,11]])),'');
});

test('complete mother preview removes active pruning without changing the stored construction',()=>{
  const original=changeTessParams(tessPreset('periodic'),{pruneBoundary:rectangle(.2,.2),dualTargets:[[0,0]]}),before=structuredClone(original);
  const query=pruneMotherPreviewParams(original)!;
  assert.equal(query.pruneBoundary,undefined);assert.equal(query.paper,undefined);assert.ok(!('dualTargets' in query));
  assert.equal(query.family,'periodic');assert.deepEqual(original,before);assert.deepEqual(readTessParams(query),query);
});

test('large per-tile CP mothers preview through tiling output and preserve repeat/lattice coordinates',()=>{
  const base=tessPreset('custom');assert.equal(base.family,'custom');if(base.family!=='custom')return;
  const params={...base,customOutput:'tile-twists' as const,tileTwists:defaultTileTwists(base.faces),
    lattice:[[1,0],[0,1]] as [XY,XY],range1:[-2,2] as [number,number],range2:[-2,2] as [number,number],pruneBoundary:rectangle(.2,.2,.6,.6)};
  assert.ok(readTessParams(params));
  const query=pruneMotherPreviewParams(params)!;
  assert.ok(query);assert.equal(query.family,'custom');
  if(query.family==='custom'){
    assert.equal(query.customOutput,'tiling');assert.equal(query.tileTwists,undefined);
    assert.deepEqual(query.lattice,params.lattice);assert.deepEqual(query.range1,params.range1);assert.deepEqual(query.range2,params.range2);
  }
  assert.deepEqual(readTessParams(query),query);
});

test('nested primal-dual mothers recover their original unpruned source for expanded crop previews',()=>{
  const mother=changeTessParams(tessPreset('periodic'),{pruneBoundary:rectangle(.2,.2,.6,.6)});
  const base=tessPreset('primal-dual');assert.equal(base.family,'primal-dual');
  if(base.family!=='primal-dual')return;
  const original={...base,motherParams:mother,pruneBoundary:rectangle(.3,.3,.2,.2),dualEdgeFlips:[[0,1]] as [number,number][],visibleTopFace:2};
  const query=pruneMotherPreviewParams(original)!;
  assert.ok(query&&query.family==='primal-dual');
  if(query.family==='primal-dual'){
    assert.equal(query.motherParams?.pruneBoundary,undefined);assert.equal(query.dualEdgeFlips,undefined);assert.equal(query.visibleTopFace,undefined);
    assert.equal(query.motherParams?.family,'periodic');
  }
  assert.deepEqual(original.motherParams.pruneBoundary,mother.pruneBoundary);
});

test('pruning a default independent paper switches explicitly to valid inner fitting instead of failing external extension',()=>{
  const source=tessPreset('periodic'),before=structuredClone(source),boundary=rectangle(.2,.2,1.6,1.6),
    inner=pruneParamsForBoundary(source,boundary),outline=pruneParamsForBoundary(source,boundary,'mother');
  assert.deepEqual(inner.paper,{...source.paper,fit:'inscribed'});assert.deepEqual(inner.pruneBoundary,boundary);
  assert.equal(outline.paper,undefined);assert.deepEqual(outline.pruneBoundary,boundary);
  assert.deepEqual(readTessParams(inner),inner);assert.deepEqual(readTessParams(outline),outline);assert.deepEqual(source,before);
  const wide={...source,paper:{shape:'rectangle' as const,margin:.8,aspect:2}},safe=pruneParamsForBoundary(wide,boundary);
  assert.deepEqual(safe.paper,{shape:'rectangle',margin:.45,aspect:2,fit:'inscribed'});assert.ok(readTessParams(safe));
  assert.equal(pruneParamsForBoundary({...source,paper:undefined},boundary).paper,undefined);
});
