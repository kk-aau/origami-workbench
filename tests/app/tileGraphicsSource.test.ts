import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MAX_TILE_GRAPHICS_SOURCE,parseTileGraphicsSource,placeTileGraphicsPrimitive,readTileGraphicsSpec,supportsTileGraphicsPlacement,tileGraphicsPlacement,tileGraphicsSourceToComplex,type GraphicsPoint} from '../../src/app/tileGraphicsSource';
import {defaultTileDecorations,readTileDecorations,sourceDecoratedMotherTiles} from '../../src/app/tileDecorations';
import {changeTessParams,readTessParams,tessConstructionKey,tessPreset} from '../../src/app/tessellation';
import TileDecorationLayer from '../../src/components/TileDecorationLayer';
import {TileGraphicsPrimitives} from '../../src/components/TileGraphicsPrimitives';

const square:GraphicsPoint[]=[[0,0],[1,0],[1,1],[0,1]];
const original2786=`Graphics[{
 Style[Polygon[{{0,0},{1,0},{1,1}}],TilingNoFill],
 Style[Polygon[{{1,0},{2,0},{2,1}}],TilingLightFill],
 Style[Polygon[{{2,0},{3,0},{3,1}}],TilingMedFill],
 Style[Polygon[{{3,0},{4,0},{4,1}}],TilingDarkFill],
 Style[Line[{{0,0},{0,1},{4,1}}],TilingLine],
 Style[Text["A",{.5,.5}],TilingText]}]`;

test('In[2786] arbitrary graphics resolves all six source objects and TilingStyle directives',()=>{
  const primitives=parseTileGraphicsSource(original2786)!;assert.ok(primitives);assert.equal(primitives.length,6);
  assert.deepEqual(primitives.map(p=>p.kind),['polygon','polygon','polygon','polygon','line','text']);
  assert.deepEqual(primitives.slice(0,4).map(p=>p.color),['none','#ebe0d6','#ddccbb','#bb9977']);
  assert.ok(primitives.slice(0,4).every(p=>p.stroke===null));
  assert.deepEqual(primitives[4].stroke,{color:'#ff8000',width:1,cap:'round',join:'round'});
  assert.equal(primitives[5].text,'A');assert.equal(primitives[5].color,'#1f140a');
  const recolored=parseTileGraphicsSource(original2786,{textColor:'#123456',lineColor:'#654321',fillColor:'#336699'})!;
  assert.equal(recolored[4].stroke?.color,'#654321');assert.equal(recolored[5].color,'#123456');assert.equal(recolored[3].color,'#336699');
});

test('nested lists, Style and Directive retain local scope and literal source order',()=>{
  const primitives=parseTileGraphicsSource('{Red,Line[{{0,0},{1,0}}],{Blue,Line[{{0,1},{1,1}}]},Style[Line[{{0,2},{1,2}}],Green,Blue],Line[{{0,3},{1,3}}],Style[Text["A",{0,0}],Directive[Purple,FontSize->18]]}')!;
  assert.deepEqual(primitives.map(p=>p.color),['#ff0000','#0000ff','#00ff00','#ff0000','#800080']);
  assert.equal(primitives[4].fontSize,18);
  const forms=parseTileGraphicsSource('{EdgeForm[Directive[Blue,AbsoluteThickness[2]]],FaceForm[Orange],Polygon[{{0,0},{1,0},{0,1}}],{EdgeForm[None],FaceForm[None],Polygon[{{1,0},{2,0},{1,1}}]},Polygon[{{2,0},{3,0},{2,1}}]}')!;
  assert.deepEqual(forms.map(p=>p.color),['#ff8000','none','#ff8000']);
  assert.equal(forms[0].stroke?.width,2);assert.equal(forms[1].stroke,null);assert.equal(forms[2].stroke?.color,'#0000ff');
});

test('FunctionTransform indexed GraphicsComplex and numeric MatrixTransform transform coordinates once',()=>{
  // In[77] contains Point[{1,0}] and GraphicsComplex[{{0,0},{0,1}},Line[{1,2}]].
  const primitives=parseTileGraphicsSource('MatrixTransform[{Point[{1,0}],GraphicsComplex[{{0,0},{0,1}},Line[{1,2}]]},{{2,0},{0,2}}]')!;
  assert.deepEqual(primitives.map(p=>p.points),[[[2,0]],[[0,0],[0,2]]]);
  const all=parseTileGraphicsSource('GraphicsComplex[{{0,0},{1,0},{0,1}},{Point[2],Line[{3,1,2}],Polygon[{1,2,3}],Text["v",3]}]')!;
  assert.deepEqual(all.map(p=>p.points),[[[1,0]],[[0,1],[0,0],[1,0]],[[0,0],[1,0],[0,1]],[[0,1]]]);
  assert.deepEqual(parseTileGraphicsSource('GraphicsComplex[{{0,0},{1,0},{0,1}},Point[{1,3}]]')?.[0].points,[[0,0],[0,1]],'FunctionTransform preserves the indexed Point list inside GraphicsComplex');
  const composed=parseTileGraphicsSource('MatrixTransform[MatrixTransform[Line[{{1/2,-.25},{1,1}}],{{0,-1},{1,0}}],{{2,0},{0,3}}]')!;
  assert.deepEqual(composed[0].points,[[.5,1.5],[-2,3]]);
  assert.equal(composed[0].stroke?.width,1,'geometric matrices do not change absolute stroke width');
});

test('GraphicsComplex supports multiple points, paths and polygons without changing source list structure',()=>{
  const source='MatrixTransform[GraphicsComplex[{{0,0},{1,0},{1,1},{0,1}},{Point[{1,3,4}],Line[{{1,2,3},{3,4}}],Polygon[{{1,2,3},{1,3,4}}]}],{{0,-2},{3,0}}]';
  const primitives=parseTileGraphicsSource(source)!;
  assert.deepEqual(primitives[0].points,[[0,0],[-2,3],[-2,0]]);
  assert.deepEqual(primitives[1].paths,[[[0,0],[0,3],[-2,3]],[[-2,3],[-2,0]]]);
  assert.deepEqual(primitives[2].paths,[[[0,0],[0,3],[-2,3]],[[0,0],[-2,3],[-2,0]]]);
  assert.ok(primitives.every(p=>p.placementMode===undefined));assert.ok(supportsTileGraphicsPlacement(primitives));
  const markup=renderToStaticMarkup(createElement(TileGraphicsPrimitives,{primitives,map:([x,y])=>[10-x,20+y],units:1}));
  assert.equal((markup.match(/<polyline /g)??[]).length,2);assert.equal((markup.match(/<polygon /g)??[]).length,2);assert.equal((markup.match(/<circle /g)??[]).length,3);
  assert.match(markup,/points="10,20 10,23 12,23"/);assert.match(markup,/points="12,23 12,20"/);
});

test('ordinary nested lists retain In[76] matrix contraction and EmbedTile row broadcasting',()=>{
  const points=parseTileGraphicsSource('MatrixTransform[Point[{{1,2},{3,4}}],{{0,-1},{1,0}}]')![0];
  assert.deepEqual(points.points,[[-3,-4],[1,2]],'m.x mixes point rows, unlike a coordinate map');
  const lines=parseTileGraphicsSource('MatrixTransform[Line[{{{1,2},{3,4}},{{5,6},{7,8}}}],{{0,-1},{1,0}}]')![0];
  assert.deepEqual(lines.paths,[[[-3,-4],[1,2]],[[-7,-8],[5,6]]]);
  const placed=placeTileGraphicsPrimitive(lines,([x,y])=>[10-2*y,20+3*x]);
  // Direct expected f[path]: m.path + {10,20}; Plus threads over each row.
  assert.deepEqual(placed?.paths,[[[8,6],[11,8]],[[0,-2],[-1,-4]]]);
  for(const source of ['MatrixTransform[Point[{{0,0},{1,0},{0,1}}],{{1,0},{0,1}}]',
    'MatrixTransform[Line[{{{0,0},{1,0},{0,1}}}],{{1,0},{0,1}}]',
    'MatrixTransform[Polygon[{{{0,0},{1,0},{0,1}}}],{{1,0},{0,1}}]'])assert.equal(parseTileGraphicsSource(source),null,source);
  for(const source of ['Point[{{0,0},{1,0},{0,1}}]','Line[{{{0,0},{1,0},{0,1}}}]','Polygon[{{{0,0},{1,0},{0,1}}}]']){
    const parsed=parseTileGraphicsSource(source)!;assert.ok(parsed);assert.equal(supportsTileGraphicsPlacement(parsed),false);
    assert.equal(placeTileGraphicsPrimitive(parsed[0],p=>p),null);assert.equal(readTileGraphicsSpec({source,frame:square},4),null);
  }
});

test('the production mother layer uses original multi-point placement rather than a silent pointwise expansion',()=>{
  const options=defaultTileDecorations([[0,1,2,3]]),source='Point[{{1,2},{3,4}}]';
  options.tiles[0].graphics={source,frame:square};
  const placed=square.map(([x,y])=>[10-2*y,20+2*x] as GraphicsPoint);
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:[{points:placed,sourceIndex:0,decoration:options.tiles[0],vertexIndices:[1,2,3,4]}],options,units:1,part:'marks'}));
  assert.match(markup,/cx="4" cy="2"/);assert.match(markup,/cx="22" cy="24"/);
  const converted=tileGraphicsSourceToComplex(source)!;options.tiles[0].graphics!.source=converted;
  const shared=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:[{points:placed,sourceIndex:0,decoration:options.tiles[0],vertexIndices:[1,2,3,4]}],options,units:1,part:'marks'}));
  assert.match(shared,/cx="6" cy="22"/);assert.match(shared,/cx="2" cy="26"/);
});

test('explicit shared-vertex conversion preserves source picture and scoped styles without silently changing storage',()=>{
  const source='{Red,Style[MatrixTransform[Point[{{1,2},{3,4}}],{{0,-1},{1,0}}],Purple],Style[Polygon[{{{0,0},{1,0},{0,1}},{{1,1},{2,1},{1,2}}}],TilingLightFill],Text["A",{0,0},{-.5,.75},{0,1}]}';
  const converted=tileGraphicsSourceToComplex(source);assert.ok(converted);assert.ok(converted.includes('TilingLightFill'));assert.ok(converted.includes('Purple'));
  const parsed=parseTileGraphicsSource(source)!,actual=parseTileGraphicsSource(converted)!;
  assert.deepEqual(actual,parsed.map(({placementMode:_,...primitive})=>primitive));assert.ok(supportsTileGraphicsPlacement(actual));
  assert.equal(source.includes('GraphicsComplex'),false);assert.equal(tileGraphicsSourceToComplex('Run["x"]'),null);
  assert.ok(readTileGraphicsSpec({source:converted,frame:square},4));
});

test('Text alignment and direction survive matrices and reflections while absolute dash lengths stay unchanged',()=>{
  const primitives=parseTileGraphicsSource('{AbsoluteDashing[{3,3}],Line[{{0,0},{1,1}}],Style[MatrixTransform[Text["ABC",{2,3},{-.5,.75},{0,1}],{{0,-2},{3,0}}],FontSize->18]}')!;
  assert.deepEqual(primitives[1].points,[[-6,6]]);assert.deepEqual(primitives[1].offset,[-.5,.75]);assert.deepEqual(primitives[1].direction,[0,1]);
  assert.deepEqual(primitives[0].stroke?.dash,[3,3]);
  const markup=renderToStaticMarkup(createElement(TileGraphicsPrimitives,{primitives,map:([x,y])=>[-x,y],units:.5}));
  assert.match(markup,/stroke-dasharray="3 3"/);assert.match(markup,/data-text-offset="-0.5,0.75"/);assert.match(markup,/data-text-direction="0,1"/);
  assert.match(markup,/transform="rotate\(-90 6 6\)"/);assert.match(markup,/font-size="9"/);
  assert.equal(parseTileGraphicsSource('Text["A",{0,0},{0,0},{0,0}]'),null);
  assert.equal(parseTileGraphicsSource('{AbsoluteDashing[{0,0}],Line[{{0,0},{1,1}}]}'),null);
  const reset=parseTileGraphicsSource('{AbsoluteDashing[{3,3}],{AbsoluteDashing[{}],Line[{{0,0},{1,0}}]},Line[{{0,1},{1,1}}]}')!;
  assert.equal(reset[0].stroke?.dash,undefined);assert.deepEqual(reset[1].stroke?.dash,[3,3]);
});

test('finite grammar refuses execution, unsupported heads, invalid indices and complexity',()=>{
  const rejected=['Run["x"]','Get["x"]','toString[{{0,0},{1,1}}]','constructor[{{0,0},{1,1}}]','{Point[{0,0}];Print[1]}','Point[{x,0}]','Point[{1/0,0}]','Point[{1e999,0}]','Point[{0,0,0}]','Graphics[{},ImageSize->100]',
    'GraphicsComplex[{{0,0},{1,0}},Line[{0,2}]]','GraphicsComplex[{{0,0},{1,0}},Line[{1,3}]]','GraphicsComplex[{{0,0},{1,0}},Point[{1,3}]]',
    'MatrixTransform[Point[{0,0}],{{1,0,0},{0,1,0}}]','MatrixTransform[Point[{1000000,0}],{{100,0},{0,1}}]',
    'Style[Point[{0,0}],Opacity[.5]]','Circle[{0,0},1]','GeometricTransformation[Point[{0,0}],{{1,0},{0,1}}]',
    'Style[Text["A",{0,0}],FontSize->1000]','{AbsoluteThickness[0],Line[{{0,0},{1,1}}]}',
    '{Dashing[{.1}],Line[{{0,0},{1,1}}]}','Text["a\\n",{0,0}]','Text["a",{0,0},1]'];
  for(const source of rejected)assert.equal(parseTileGraphicsSource(source),null,source);
  assert.equal(parseTileGraphicsSource(' '.repeat(MAX_TILE_GRAPHICS_SOURCE+1)),null);
  assert.equal(parseTileGraphicsSource('{'.repeat(22)+'Point[{0,0}]'+'}'.repeat(22)),null);
  assert.equal(parseTileGraphicsSource('{'+Array(129).fill('Point[{0,0}]').join(',')+'}'),null);
  assert.equal(parseTileGraphicsSource('Line[{'+Array(513).fill('{0,0}').join(',')+'}]'),null);
});

test('source and original coordinate frame round-trip through real custom project reader',()=>{
  const params=tessPreset('custom');assert.equal(params.family,'custom');const options=defaultTileDecorations(params.faces);
  options.tiles[0].graphics={source:'{Style[Line[{{0,0},{1,1}}],TilingLine],Text["<svg>",{.5,.5}]}',frame:params.faces[0].map(index=>params.vertices[index])};
  const changed=changeTessParams(params,{tileDecorations:options}),saved=JSON.parse(JSON.stringify(changed));
  assert.deepEqual(readTessParams(saved),changed);assert.equal(tessConstructionKey(changed),tessConstructionKey(params));
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),params.faces),options);
  for(const bad of [null,{source:'Run["x"]',frame:square},{source:'Point[{0,0}]',frame:[[0,0],[1,0],[2,0],[3,0]]},{source:'Point[{0,0}]',frame:square,primitives:[]},{source:'Point[{0,0}]',frame:[[0,0],[Infinity,0],[1,1],[0,1]]}]){
    assert.equal(readTileGraphicsSpec(bad,4),null);
    const malformed=structuredClone(saved);malformed.tileDecorations.tiles[0].graphics=bad;assert.equal(readTessParams(malformed),null);
  }
  const legacy=defaultTileDecorations(params.faces);assert.deepEqual(readTileDecorations(legacy,params.faces),legacy);
});

test('placement follows original corner indices, rotation, scale and reflection, refusing distorted frames',()=>{
  const placed=square.map(([x,y])=>[8-3*y,5+3*x] as GraphicsPoint);
  const map=tileGraphicsPlacement(square,placed,[1,2,3,4]);assert.ok(map);assert.deepEqual(map([.2,.4]),[6.8,5.6]);
  const reverse=[...placed].reverse(),mirror=tileGraphicsPlacement(square,reverse,[4,3,2,1]);assert.ok(mirror);assert.deepEqual(mirror([.2,.4]),[6.8,5.6]);
  const reflected=square.map(([x,y])=>[10-x,2+y] as GraphicsPoint),flipped=tileGraphicsPlacement(square,reflected,[1,2,3,4]);assert.ok(flipped);assert.deepEqual(flipped([.2,.4]),[9.8,2.4]);
  const distorted=structuredClone(placed);distorted[2][0]+=.01;assert.equal(tileGraphicsPlacement(square,distorted,[1,2,3,4]),null);
  assert.equal(tileGraphicsPlacement(square,placed,[1,1,3,4]),null);assert.equal(tileGraphicsPlacement(square,placed,[]),null);
});

test('actual mother repetition and canvas normalization preserve arbitrary source coordinates and screen sizes',()=>{
  const options=defaultTileDecorations([[0,1,2,3]]);options.tiles[0].graphics={source:'{Style[Line[{{0,0},{1,1}}],AbsoluteThickness[2],TilingLine],Style[Text["<svg>",{.5,.5}],TilingText,FontSize->18],AbsolutePointSize[6],Point[{.25,.5}]}',frame:square};
  const mother={vertices_coords:square,edges_vertices:[],edges_assignment:[],faces_vertices:[[0,1,2,3],[0,1,2,3]],zhezhi_custom_face_index:[0,0],zhezhi_custom_polygons:[square,square.map(([x,y])=>[x+2,y] as GraphicsPoint)]};
  const tiles=sourceDecoratedMotherTiles(mother,options,square,[[0,1,2,3]]).map(tile=>({...tile,points:tile.points.map(([x,y])=>[x*100,y*100] as GraphicsPoint)}));
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:.01,part:'marks'}));
  assert.match(markup,/points="0,0 100,100"/);assert.match(markup,/points="200,0 300,100"/);
  assert.match(markup,/stroke-width="2"[^>]*vector-effect="non-scaling-stroke"/);assert.match(markup,/font-size="0.18"/);assert.match(markup,/r="0.03"/);
  assert.match(markup,/&lt;svg&gt;/);assert.equal((markup.match(/data-tile-graphics-source=/g)??[]).length,2);
  const unknown=tiles.map(tile=>({...tile,vertexIndices:[]}));assert.doesNotMatch(renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:unknown,options,units:1,part:'marks'})),/data-tile-graphics-source=/);
});
