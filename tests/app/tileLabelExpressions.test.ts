import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseTileLabelExpression} from '../../src/app/tileLabelExpressions';
import {origamicaTileDecorations,readTileDecorations,sourceDecoratedMotherTiles} from '../../src/app/tileDecorations';
import {changeTessParams,readTessParams,tessConstructionKey,tessPreset,type TessGraph} from '../../src/app/tessellation';
import TileDecorationLayer from '../../src/components/TileDecorationLayer';

test('In[2860/2863] TileIndex keeps literal string and unassigned-symbol label sources',()=>{
  assert.deepEqual(parseTileLabelExpression('"a"'),{kind:'string',label:'a'});
  assert.deepEqual(parseTileLabelExpression('a'),{kind:'symbol',label:'a'});
  assert.deepEqual(parseTileLabelExpression('  A12  '),{kind:'symbol',label:'A12'});
  assert.deepEqual(parseTileLabelExpression('"中心 A"'),{kind:'string',label:'中心 A'});
  assert.deepEqual(parseTileLabelExpression('"a\\"b\\\\c"'),{kind:'string',label:'a"b\\c'});
  assert.deepEqual(parseTileLabelExpression('None'),{kind:'none',label:null});
  assert.deepEqual(parseTileLabelExpression('"None"'),{kind:'string',label:'None'});
  assert.deepEqual(parseTileLabelExpression('""'),{kind:'string',label:null});
});

test('named Greek characters preserve the Wolfram glyph distinction rather than guessing Latin replacements',()=>{
  const cases:Record<string,string>={
    '\\[Alpha]':'α','\\[CapitalDelta]':'Δ','\\[Beta]2':'β2','α':'α',
    '\\[Epsilon]':'ϵ','\\[CurlyEpsilon]':'ε','\\[Phi]':'ϕ','\\[CurlyPhi]':'φ',
    '"\\[Alpha] + \\[Pi]"':'α + π',
  };
  for(const [source,label] of Object.entries(cases))assert.equal(parseTileLabelExpression(source)?.label,label,source);
});

test('bounded number atoms have interpretable OutputForm text without compound or scientific layouts',()=>{
  const cases:Record<string,string>={
    '12':'12','+0012':'12','-7':'-7','0':'0','9999999999':'9999999999',
    '1.25':'1.25','-.5':'-0.5','+001.250':'1.25','1.':'1.','0.0':'0.',
    '0.001':'0.001','12.3456':'12.3456',
  };
  for(const [source,label] of Object.entries(cases))assert.equal(parseTileLabelExpression(source)?.label,label,source);
  for(const source of ['10000000000','1.2345678','0.00001','1000000.','1/2','1*^4','1.2`20'])
    assert.equal(parseTileLabelExpression(source),null,source);
});

test('label parser rejects executable inputs, unsupported boxes, controls and ambiguous atom semantics',()=>{
  const invalid=[
    '', ' ', 'a=1', 'a;Print[1]', 'Run["x"]', 'ToExpression["1"]', 'a+b', 'a b', 'a_',
    'Subscript[a,1]', 'Style[a,Bold]', 'Row[{a,b}]', 'System`a', 'a/.a->1', '#', '$Version',
    '\\[Unknown]', '"\\n"', '"line\nnext"', '"unterminated', '"a" "b"', 'Pi','\\[Pi]','E','I',
    '"x\u202Ey"', '"\ud800"', '"'+ 'a'.repeat(33)+'"', 'a'.repeat(129),
  ];
  for(const source of invalid)assert.equal(parseTileLabelExpression(source),null,source);
  assert.equal(parseTileLabelExpression('"<script>alert(1)</script>"')?.label,'<script>alert(1)</script>',
    'quoted text is inert; React, rather than an HTML parser, renders the string');
});

test('atom source and displayed label round-trip strictly without changing construction geometry',()=>{
  const params=tessPreset('custom');assert.equal(params.family,'custom');
  const options=origamicaTileDecorations(params.faces);options.showTileIndices=true;
  options.tiles[0]={...options.tiles[0],label:'α',labelExpression:'\\[Alpha]'};
  options.tiles[1]={...options.tiles[1],label:null,labelExpression:'None'};
  const changed=changeTessParams(params,{tileDecorations:options});
  assert.equal(tessConstructionKey(changed),tessConstructionKey(params));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),params.faces),options);
  const changedTile=(patch:Record<string,unknown>)=>({...options,tiles:options.tiles.map((tile,i)=>i===0?{...tile,...patch}:tile)});
  assert.equal(readTileDecorations(changedTile({label:'β'}),params.faces),null);
  assert.equal(readTileDecorations(changedTile({labelExpression:'Print[1]'}),params.faces),null);
  assert.equal(readTileDecorations(changedTile({labelExpression:12}),params.faces),null);
  assert.equal(readTileDecorations(changedTile({label:undefined}),params.faces),null);
  assert.equal(readTileDecorations(changedTile({labelExpression:'"a"',label:'a'}),params.faces)?.tiles[0].labelExpression,'"a"');
  const legacy=origamicaTileDecorations(params.faces);legacy.tiles[0].label='旧标签';
  assert.deepEqual(readTileDecorations(legacy,params.faces),legacy);
});

test('saved label atoms remain visible on repeated source tiles',()=>{
  const vertices:[number,number][]=[[0,0],[1,0],[1,1],[0,1]],faces=[[0,1,2,3]];
  const options=origamicaTileDecorations(faces);options.showTileIndices=true;
  options.showVertexIndices=true;
  options.tiles[0]={...options.tiles[0],label:'α',labelExpression:'\\[Alpha]'};
  const mother={vertices_coords:vertices,faces_vertices:[faces[0],faces[0]],edges_vertices:[],edges_assignment:[],
    zhezhi_custom_face_index:[0,0],zhezhi_custom_polygons:[vertices,vertices.map(([x,y])=>[x+1,y] as [number,number])]} satisfies TessGraph;
  const tiles=sourceDecoratedMotherTiles(mother,options,vertices,faces);
  assert.ok(tiles.every(tile=>tile.decoration.labelExpression==='\\[Alpha]'));
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
  assert.equal((markup.match(/data-tile-label="α"/g)??[]).length,2);
  assert.match(markup,/data-tile-vertex-index="1"[^>]*font-size="12"/,
    'source TilingText gives center and vertex labels the same size');
});
