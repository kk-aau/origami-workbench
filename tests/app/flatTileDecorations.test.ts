import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FoldGraph} from '../../src/core/types';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {polygonArea} from '../../src/core/geometry';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers,type ModelLayerRegion} from '../../src/app/modelRegionLayers';
import {mapVisibleFlatTileDecorations,type FlatTileDecorationSource,type FlatTileDecorationMapping} from '../../src/app/flatTileDecorations';
import {defaultTileDecorations,readTileDecorations,sourceDecoratedMotherTiles} from '../../src/app/tileDecorations';
import FlatTileDecorationLayer from '../../src/components/FlatTileDecorationLayer';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/p16-checkerboard-ff.json',import.meta.url),'utf8'));
const graph:FoldGraph={...fixture.fold,edges_foldAngle:fixture.fold.edges_assignment.map((type:string)=>type==='M'?-180:type==='V'?180:0)};
const folded=recomputeFlatLayers(computeFlatGeometry(graph,1e-6));
const options=defaultTileDecorations(fixture.faces);
options.showTileIndices=true;options.showVertexIndices=true;options.overlayFoldedForm=true;
const source:FlatTileDecorationSource={tiles:sourceDecoratedMotherTiles(fixture.mother,options,fixture.vertices,fixture.faces),options,faceTileInstance:fixture.fold.zhezhi_face_tile_instance};
const overlap=modelOverlapRegions(folded);
const front=modelRegionLayers(folded,overlap,'front'),back=modelRegionLayers(folded,overlap,'back');

function assertVisibleCoverage(mapping:FlatTileDecorationMapping,visible:ModelLayerRegion[],coordinateScale=1,omittedAreaTolerance=0){
  const expected=new Map<number,number>(),actual=new Map<number,number>();
  assert.ok(visible.length&&mapping.regions.length);
  for(const region of visible){
    assert.equal(region.layers.status,'ordered');if(region.layers.status!=='ordered')continue;
    const top=region.layers.topToBottom[0],area=Math.abs(polygonArea(region.polygon))/coordinateScale**2;
    assert.ok(area>0);expected.set(top,(expected.get(top)??0)+area);
  }
  for(const piece of mapping.regions){
    assert.ok(Number.isFinite(piece.area)&&piece.area>0,'every decorated piece has positive finite area');
    assert.ok(expected.has(piece.topFace),'every decorated piece belongs to a confirmed visible top face');
    assert.ok(Math.abs(Math.abs(polygonArea(piece.polygon))-piece.area)/coordinateScale**2<1e-7,'reported piece area matches its polygon');
    actual.set(piece.topFace,(actual.get(piece.topFace)??0)+piece.area/coordinateScale**2);
  }
  if(omittedAreaTolerance===0)assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),[...expected.keys()].sort((a,b)=>a-b));
  else{
    const omittedArea=[...expected].reduce((sum,[face,area])=>sum+(actual.has(face)?0:area),0);
    assert.ok(omittedArea<=omittedAreaTolerance,'only numerical slivers with a bounded total area may lack decoration');
  }
  for(const [face,area] of expected)assert.ok(Math.abs((actual.get(face)??0)-area)<1e-7,`visible top face ${face} is covered exactly once`);
  const expectedTotal=[...expected.values()].reduce((sum,area)=>sum+area,0),actualTotal=[...actual.values()].reduce((sum,area)=>sum+area,0);
  assert.ok(Math.abs(actualTotal-expectedTotal)<1e-7,'total visible area is covered exactly once');
}

test('real four-tile FF has Origamica-similar TileVertices and only decorates verified visible faces',()=>{
  assert.equal(fixture.fold.zhezhi_merged_edge_mode,'retained-crease');
  assert.equal(folded.geometry.status,'ready');assert.equal(folded.layers.status,'solved');
  assert.equal(folded.layers.faceOrder,undefined,'sample requires local visible regions, not a guessed global order');
  assert.ok(front.every(region=>region.layers.status==='ordered'));
  const mapped=mapVisibleFlatTileDecorations(source,graph,folded,front);
  assert.ok(mapped);
  assertVisibleCoverage(mapped,front);
  assert.ok(mapped.similarityScales.every(scale=>Math.abs(scale-.659443536844584)<1e-8));
  assert.deepEqual([...new Set(mapped.regions.map(region=>region.tile))].sort(),[1,3],
    'hidden mother tiles must not be labelled on the folded front');
  assert.equal(mapped.boundaryEdges.reduce((sum,edges)=>sum+edges.length,0),48);
  const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source,mapping:mapped,foldedVertices:folded.geometry.vertices,project:p=>p})));
  assert.match(markup,/data-ff-tile-index="2"/);assert.match(markup,/data-ff-tile-index="4"/);
  assert.doesNotMatch(markup,/data-ff-tile-index="1"|data-ff-tile-index="3"/);
  assert.match(markup,/data-ff-folded-boundary=/);
  assert.doesNotMatch(markup,/data-ff-tile="0"|data-ff-tile="2"/);
  assert.doesNotMatch(markup,/data-decorated-face=/,'do not project the mother polygon onto the FF');
  assert.match(markup,/data-ff-tile-index=[^>]*stroke="#fff"/,'legacy folded labels keep their former white outline');
  const recolored:FlatTileDecorationSource={...source,options:{...options,tilingStyle:{textColor:'#123456',lineColor:'#654321',fillColor:'#336699'}}};
  const recoloredMarkup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source:recolored,mapping:mapped,foldedVertices:folded.geometry.vertices,project:p=>p})));
  assert.match(recoloredMarkup,/data-ff-folded-boundary=[^>]*stroke="#654321"/);
  assert.match(recoloredMarkup,/data-ff-tile-index=[^>]*fill="#123456"/);
  assert.match(recoloredMarkup,/data-ff-vertex-index=[^>]*fill="#123456"/);
  assert.doesNotMatch(recoloredMarkup,/data-ff-tile-index=[^>]*stroke="#fff"/,'Origamica TilingText has no outline on the folded view');
});

test('back side uses its own confirmed local top faces',()=>{
  assert.ok(back.every(region=>region.layers.status==='ordered'));
  const mapped=mapVisibleFlatTileDecorations(source,graph,folded,back);
  assert.ok(mapped);assert.deepEqual([...new Set(mapped.regions.map(region=>region.tile))],[1]);
});

test('original deleted-seam monolithic patch partitions crossed faces into verified folded tile pieces',()=>{
  const original=JSON.parse(readFileSync(new URL('../fixtures/p16-original-merge-ff.json',import.meta.url),'utf8'));
  const cp:FoldGraph={...original.fold,edges_foldAngle:original.fold.edges_assignment.map((type:string)=>type==='M'?-180:type==='V'?180:0)};
  const ff=recomputeFlatLayers(computeFlatGeometry(cp,1e-6));
  assert.equal(cp.zhezhi_merged_edge_mode,'delete');
  assert.equal(ff.geometry.status,'ready');assert.equal(ff.layers.status,'solved');
  assert.equal(cp.zhezhi_face_tile_instance.filter((id:number)=>id===-1).length,5);
  assert.equal(cp.zhezhi_face_tile_instance[2],0);
  assert.ok(cp.faces_vertices[2].some((vertex:number)=>cp.vertices_coords[vertex][1]>1),
    'a centroid owner can span the next mother tile, so it is only a hint');
  const options=defaultTileDecorations(original.faces);
  options.showTileIndices=true;options.showVertexIndices=true;options.overlayFoldedForm=true;
  const decorated:FlatTileDecorationSource={tiles:sourceDecoratedMotherTiles(original.mother,options,original.vertices,original.faces),options,faceTileInstance:cp.zhezhi_face_tile_instance};
  const overlaps=modelOverlapRegions(ff),visible=modelRegionLayers(ff,overlaps,'front');
  assert.ok(visible.every(region=>region.layers.status==='ordered'));
  const mapped=mapVisibleFlatTileDecorations(decorated,cp,ff,visible);
  assert.ok(mapped);
  assertVisibleCoverage(mapped,visible);
  assert.equal(mapped.cornerIds.flat().filter(id=>id===-1).length,12,
    'removed collinear tile corners must be reconstructed from a proven face isometry');
  assert.deepEqual([...new Set(mapped.regions.map(region=>region.tile))].sort(),[0,1,2,3]);
  assert.ok(mapped.regions.some(region=>region.topFace===2&&region.tile===2),
    'a face assigned to tile 0 by centroid still has a visible piece of tile 2');
  const actualArea=mapped.regions.reduce((sum,region)=>sum+region.area,0);
  const expectedArea=visible.reduce((sum,region)=>sum+Math.abs(polygonArea(region.polygon)),0);
  assert.ok(Math.abs(actualArea-expectedArea)<1e-7,'every visible region must be covered once');
  const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source:decorated,mapping:mapped,foldedVertices:ff.geometry.vertices,project:p=>p})));
  for(const index of [1,2,3,4])assert.match(markup,new RegExp(`data-ff-tile-index="${index}"`));
  assert.match(markup,/data-ff-folded-boundary=/);
  const back=mapVisibleFlatTileDecorations(decorated,cp,ff,modelRegionLayers(ff,overlaps,'back'));
  assert.ok(back);assert.deepEqual([...new Set(back.regions.map(region=>region.tile))].sort(),[0,1,2,3]);
  const scaledGraph:FoldGraph={...cp,vertices_coords:cp.vertices_coords.map(([x,y])=>[x*100,y*100])};
  const scaled=recomputeFlatLayers(computeFlatGeometry(scaledGraph,1e-4));
  const scaledSource:FlatTileDecorationSource={...decorated,tiles:decorated.tiles.map(tile=>({...tile,points:tile.points.map(([x,y])=>[x*100,y*100])}))};
  const scaledVisible=modelRegionLayers(scaled,modelOverlapRegions(scaled),'front');
  const scaledMapping=mapVisibleFlatTileDecorations(scaledSource,scaledGraph,scaled,scaledVisible);
  assert.ok(scaledMapping);assert.deepEqual([...new Set(scaledMapping.regions.map(region=>region.tile))].sort(),[0,1,2,3]);
  const wrong=structuredClone(decorated);wrong.tiles[0].points[0][0]+=.01;
  assert.equal(mapVisibleFlatTileDecorations(wrong,cp,ff,visible),null);
});

test('normalizing the same CP to the 200-unit canvas does not let tiny overlap slivers hide a valid FF overlay',()=>{
  const scaledGraph:FoldGraph={...graph,vertices_coords:graph.vertices_coords.map(([x,y])=>[x*200,y*200])};
  const scaled=recomputeFlatLayers(computeFlatGeometry(scaledGraph,1e-4));
  const scaledRegions=modelRegionLayers(scaled,modelOverlapRegions(scaled),'front');
  const scaledSource:FlatTileDecorationSource={...source,tiles:source.tiles.map(tile=>({...tile,points:tile.points.map(([x,y])=>[x*200,y*200])}))};
  assert.ok(scaledRegions.every(region=>region.layers.status==='ordered'));
  const mapped=mapVisibleFlatTileDecorations(scaledSource,scaledGraph,scaled,scaledRegions);
  assert.ok(mapped);
  assertVisibleCoverage(mapped,scaledRegions,200,1e-10);
  const original=mapVisibleFlatTileDecorations(source,graph,folded,front);
  assert.ok(original);
  // A valid partition may merge adjacent pieces. Its fragment count is not a
  // visibility contract: preserve each visible face/tile area across scaling.
  const areas=(mapping:FlatTileDecorationMapping,scale:number)=>{
    const byFaceTile=new Map<string,number>();
    for(const region of mapping.regions){
      const key=`${region.topFace}:${region.tile}`;
      byFaceTile.set(key,(byFaceTile.get(key)??0)+region.area/scale**2);
    }
    return byFaceTile;
  };
  const expected=areas(original,1),actual=areas(mapped,200);
  assert.deepEqual([...actual.keys()].sort(),[...expected.keys()].sort(),'scaling preserves the visible top face and tile pairs');
  for(const [key,area] of expected)assert.ok(Math.abs(actual.get(key)!-area)<1e-7,`visible face/tile ${key} keeps its area after scaling`);
  assert.deepEqual([...new Set(mapped.regions.map(region=>region.tile))].sort(),[1,3]);
  const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source:scaledSource,mapping:mapped,foldedVertices:scaled.geometry.vertices,project:p=>p})));
  assert.deepEqual([...markup.matchAll(/data-ff-tile-index="([^"]*)"/g)].map(match=>match[1]).sort(),['2','4']);
  assert.deepEqual([...markup.matchAll(/data-ff-vertex-index="([^"]*)"/g)].map(match=>match[1]).sort(),['1','2','3','4']);
  assert.equal(mapped.boundaryEdges.reduce((sum,edges)=>sum+edges.length,0),48);
});

test('uncertain similarity, provenance and occlusion suppress the entire FF decoration',()=>{
  assert.equal(mapVisibleFlatTileDecorations({...source,faceTileInstance:source.faceTileInstance.map((x,i)=>i===0?-2:x)},graph,folded,front),null);
  const hidden=structuredClone(folded);hidden.layers.status='unknown';
  assert.equal(mapVisibleFlatTileDecorations(source,graph,hidden,front),null);
  const uncertain=structuredClone(front);uncertain[0].layers={status:'unconfirmed',message:'unknown'};
  assert.equal(mapVisibleFlatTileDecorations(source,graph,folded,uncertain),null);
  const wrongCorners=structuredClone(source);wrongCorners.tiles[0].points[0][0]+=.01;
  assert.equal(mapVisibleFlatTileDecorations(wrongCorners,graph,folded,front),null);
  const distorted=structuredClone(folded),first=mapVisibleFlatTileDecorations(source,graph,folded,front)!.cornerIds[0][0];
  distorted.geometry.vertices[first][0]+=.02;
  assert.equal(mapVisibleFlatTileDecorations(source,graph,distorted,front),null);
});

test('FF overlay flag round-trips without changing old custom decoration data',()=>{
  assert.equal(readTileDecorations(options,fixture.faces)?.overlayFoldedForm,true);
  assert.equal(readTileDecorations({...options,overlayFoldedForm:'yes'},fixture.faces),null);
  const {overlayFoldedForm:_old,...legacy}=options;
  assert.equal(readTileDecorations(legacy,fixture.faces)?.overlayFoldedForm,false);
});
