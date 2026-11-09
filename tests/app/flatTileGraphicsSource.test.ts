import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FoldGraph,Point} from '../../src/core/types';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {mapVisibleFlatTileDecorations,type FlatTileDecorationSource} from '../../src/app/flatTileDecorations';
import {defaultTileDecorations,sourceDecoratedMotherTiles} from '../../src/app/tileDecorations';
import {parseTileGraphicsSource,placeTileGraphicsPrimitive,tileGraphicsPlacement} from '../../src/app/tileGraphicsSource';
import FlatTileDecorationLayer from '../../src/components/FlatTileDecorationLayer';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/p16-checkerboard-ff.json',import.meta.url),'utf8'));
const graph:FoldGraph={...fixture.fold,edges_foldAngle:fixture.fold.edges_assignment.map((type:string)=>type==='M'?-180:type==='V'?180:0)};
const folded=recomputeFlatLayers(computeFlatGeometry(graph,1e-6)),overlap=modelOverlapRegions(folded);
const options=defaultTileDecorations(fixture.faces);options.showEdges=false;options.overlayFoldedForm=true;
options.tiles.forEach((tile,i)=>{
  const frame:Point[]=fixture.faces[i].map((v:number)=>fixture.vertices[v]),center:Point=[frame.reduce((sum,p)=>sum+p[0],0)/frame.length,frame.reduce((sum,p)=>sum+p[1],0)/frame.length];
  tile.graphics={source:`{Style[Polygon[{${frame.map(p=>`{${p.join(',')}}`).join(',')}}],TilingLightFill],Style[Line[{{${frame[0]}},{${frame[2]}}}],TilingLine],Style[Text["tile ${i+1}",{${center}}],TilingText],Point[{${center}}]}`,frame};
});
const source:FlatTileDecorationSource={tiles:sourceDecoratedMotherTiles(fixture.mother,options,fixture.vertices,fixture.faces),options,faceTileInstance:fixture.fold.zhezhi_face_tile_instance};

for(const side of ['front','back'] as const)test(`${side} solid uses that side's real visible faces and clips every arbitrary primitive to the verified tile piece`,()=>{
  const visible=modelRegionLayers(folded,overlap,side),mapping=mapVisibleFlatTileDecorations(source,graph,folded,visible);assert.ok(mapping);
  assert.deepEqual([...new Set(mapping.regions.map(r=>r.tile))].sort(),side==='front'?[1,3]:[1]);
  const project=(p:Point):Point=>side==='back'?[-p[0],p[1]]:p;
  const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source,mapping,foldedVertices:folded.geometry.vertices,project})));
  assert.equal((markup.match(/data-tile-graphics-source="numeric"/g)??[]).length,mapping.regions.length);
  assert.equal((markup.match(/clip-path="url\(#/g)??[]).length,mapping.regions.length);
  for(const region of mapping.regions){
    assert.ok(visible.some(r=>r.layers.status==='ordered'&&r.layers.topToBottom[0]===region.topFace));
    assert.match(markup,new RegExp(`data-ff-top-face="${region.topFace}" data-ff-tile="${region.tile}" clip-path=`));
    const tile=source.tiles[region.tile],placement=tileGraphicsPlacement(tile.decoration.graphics!.frame,tile.points,tile.vertexIndices);assert.ok(placement);
    const cpPoint=placement(tile.decoration.graphics!.frame[0]),ffPoint=mapping.faceMaps[region.topFace](cpPoint);
    assert.ok(ffPoint.every(Number.isFinite));
    const first=project(ffPoint).join(',');assert.ok(markup.includes(first),'source coordinates pass placement, the actual folded face and side projection');
  }
  const sceneFaces=new Set([...markup.matchAll(/data-ff-top-face="(\d+)"/g)].map(match=>Number(match[1])));
  assert.deepEqual([...sceneFaces].sort((a,b)=>a-b),[...new Set(mapping.regions.map(r=>r.topFace))].sort((a,b)=>a-b));
  assert.match(markup,/vector-effect="non-scaling-stroke"/);assert.match(markup,/data-tile-graphics-primitive="text"/);
});

test('FF ink uses face isometries, not a single similarity of the unfolded mother or a fixed front top face',()=>{
  const front=mapVisibleFlatTileDecorations(source,graph,folded,modelRegionLayers(folded,overlap,'front'))!,back=mapVisibleFlatTileDecorations(source,graph,folded,modelRegionLayers(folded,overlap,'back'))!;
  assert.notDeepEqual([...new Set(front.regions.map(r=>r.topFace))],[...new Set(back.regions.map(r=>r.topFace))]);
  for(const mapping of [front,back])for(let face=0;face<graph.faces_vertices!.length;face++)for(const vertex of graph.faces_vertices![face]){
    const p=mapping.faceMaps[face](graph.vertices_coords[vertex]),expected=folded.geometry.vertices[vertex];
    assert.ok(Math.hypot(p[0]-expected[0],p[1]-expected[1])<1e-8);
  }
});

test('multi-list GraphicsComplex and directed Text cross the true front/back face maps with independent clips',()=>{
  const multipleOptions=structuredClone(options);
  for(const tile of multipleOptions.tiles){
    const frame=tile.graphics!.frame;
    tile.graphics!.source=`{AbsoluteDashing[{3,3}],GraphicsComplex[{${frame.map(p=>`{${p}}`).join(',')}},{Point[{1,3,4}],Line[{{1,2,3},{3,4}}],Polygon[{{1,2,3},{1,3,4}}],Text["B",1,{-.4,.7},{0,1}]}]}`;
  }
  const multipleSource={...source,options:multipleOptions,tiles:sourceDecoratedMotherTiles(fixture.mother,multipleOptions,fixture.vertices,fixture.faces)};
  for(const side of ['front','back'] as const){
    const visible=modelRegionLayers(folded,overlap,side),mapping=mapVisibleFlatTileDecorations(multipleSource,graph,folded,visible)!;
    const project=(p:Point):Point=>side==='back'?[-p[0],p[1]]:p;
    const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source:multipleSource,mapping,foldedVertices:folded.geometry.vertices,project})));
    assert.equal((markup.match(/<polyline /g)??[]).length,mapping.regions.length*2);
    assert.equal((markup.match(/<circle /g)??[]).length,mapping.regions.length*3);
    assert.equal((markup.match(/clip-path="url\(#/g)??[]).length,mapping.regions.length);
    for(const region of mapping.regions){
      const tile=multipleSource.tiles[region.tile],placement=tileGraphicsPlacement(tile.decoration.graphics!.frame,tile.points,tile.vertexIndices)!;
      const points=tile.decoration.graphics!.frame.map(p=>project(mapping.faceMaps[region.topFace](placement(p))));
      assert.ok(markup.includes(`points="${points.slice(0,3).map(p=>p.join(',')).join(' ')}"`));
      assert.ok(markup.includes(`rotate(-90 ${points[0][0]} ${points[0][1]})`),'Text direction is preserved across each physical face reflection');
    }
    assert.match(markup,/stroke-dasharray="3 3"/);assert.match(markup,/data-text-offset="-0.4,0.7"/);
  }
});

test('ordinary multi-point original placement precedes each physical folded-face map',()=>{
  const ordinaryOptions=structuredClone(options),text='Point[{{.1,.2},{.3,.4}}]',primitive=parseTileGraphicsSource(text)![0];
  for(const tile of ordinaryOptions.tiles)tile.graphics!.source=text;
  const ordinarySource={...source,options:ordinaryOptions,tiles:sourceDecoratedMotherTiles(fixture.mother,ordinaryOptions,fixture.vertices,fixture.faces)};
  let differsFromCombined=0;
  for(const side of ['front','back'] as const){
    const visible=modelRegionLayers(folded,overlap,side),mapping=mapVisibleFlatTileDecorations(ordinarySource,graph,folded,visible)!;
    const project=(p:Point):Point=>side==='back'?[-p[0],p[1]]:p;
    const markup=renderToStaticMarkup(createElement('svg',null,createElement(FlatTileDecorationLayer,{source:ordinarySource,mapping,foldedVertices:folded.geometry.vertices,project})));
    for(const region of mapping.regions){
      const tile=ordinarySource.tiles[region.tile],placement=tileGraphicsPlacement(tile.decoration.graphics!.frame,tile.points,tile.vertexIndices)!;
      const cp=placeTileGraphicsPrimitive(primitive,placement)!.points,expected=cp.map(p=>project(mapping.faceMaps[region.topFace](p)));
      for(const p of expected)assert.ok(markup.includes(`cx="${p[0]}" cy="${p[1]}"`));
      const combined=placeTileGraphicsPrimitive(primitive,p=>project(mapping.faceMaps[region.topFace](placement(p))))!.points;
      if(combined.some((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])>1e-8))differsFromCombined++;
    }
  }
  assert.ok(differsFromCombined>0,'combining the source function with the physical FF map would change original row semantics');
});

test('all graphics retain existing unknown/no-solution/occlusion/isometry gates and do not change geometry',()=>{
  const before=JSON.stringify(folded.geometry),visible=modelRegionLayers(folded,overlap,'front');
  for(const status of ['unknown','no-solution','timeout'] as const){const wrong={...folded,layers:{...folded.layers,status}};assert.equal(mapVisibleFlatTileDecorations(source,graph,wrong,visible),null);}
  const unordered=structuredClone(visible);unordered[0].layers={status:'unconfirmed',message:'pending'};assert.equal(mapVisibleFlatTileDecorations(source,graph,folded,unordered),null);
  const distorted=structuredClone(folded);distorted.geometry.vertices[0][0]+=.01;assert.equal(mapVisibleFlatTileDecorations(source,graph,distorted,visible),null);
  assert.ok(mapVisibleFlatTileDecorations(source,graph,folded,visible));assert.equal(JSON.stringify(folded.geometry),before);
});
