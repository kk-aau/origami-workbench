import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {alignTileDecoration,decoratedMotherTiles,defaultTileDecorations,effectiveTileArrowDirections,lighterTileColor,origamicaTileDecorations,ORIGAMICA_TILE_TILING_STYLE,originalTileArrowPolygon,readTileDecorations,reframeTileDecorations,resolvedTileTilingStyle,sourceDecoratedMotherTiles,specializedTwistTileDecorations,tileArrowSegments,twistTileDecorations,twistDecoratedMotherTiles} from '../../src/app/tileDecorations';
import {parseTileColorExpression} from '../../src/app/tileColorExpressions';
import TileDecorationLayer from '../../src/components/TileDecorationLayer';
import {splitPreset} from '../../src/app/splitParams';
import {polygonTilePreset} from '../../src/app/polygonTileParams';
import {brocardPreset} from '../../src/app/brocardParams';
import {canAdoptTess,changeTessParams,readTessParams,tessConstructionKey,tessPreset,type TessGraph,type TessResult} from '../../src/app/tessellation';

test('display-only decoration saves through custom parameters without invalidating geometry',()=>{
  const initial=tessPreset('custom');assert.equal(initial.family,'custom');
  const decorated=defaultTileDecorations(initial.faces);
  decorated.showPolys=true;decorated.showTileIndices=true;decorated.overlayCreasePattern=true;decorated.overlayFoldedForm=true;decorated.arrowStyle='DF';
  decorated.tiles[0]={fill:'M',arrows:['M','V',null,null]};
  const changed=changeTessParams(initial,{tileDecorations:decorated});
  assert.equal(tessConstructionKey(changed),tessConstructionKey(initial));
  const restored=readTessParams(JSON.parse(JSON.stringify(changed)));
  assert.deepEqual(restored,changed);
  assert.equal(readTessParams({...changed,tileDecorations:{...decorated,tiles:[...decorated.tiles.slice(0,-1)]}}),null);
  assert.equal(readTessParams({...changed,tileDecorations:{...decorated,tiles:decorated.tiles.map((t,i)=>i? t:{...t,arrows:['M']})}}),null);
  assert.equal(readTessParams({...changed,tileDecorations:{...decorated,arrowStyle:'invalid'}}),null);
  assert.equal(readTileDecorations({...decorated,overlayCreasePattern:'yes'},initial.faces),null);
  const {overlayCreasePattern:_oldToggle,...oldDecoration}=decorated;
  assert.equal(readTileDecorations(oldDecoration,initial.faces)?.overlayCreasePattern,false,'old projects keep mother-only display');
  const unchanged=changeTessParams(changed,{vertices:changed.vertices.map(([x,y])=>[x,y]),faces:changed.faces.map(face=>[...face])});
  assert.deepEqual(unchanged.tileDecorations,decorated);
  const modified=changeTessParams(changed,{vertices:changed.vertices.map(([x,y])=>[x+1,y])});
  assert.equal(modified.family,'custom');assert.equal(modified.tileDecorations,undefined);
  const result={stats:{checks:{geometry:{status:'passed'},local:{status:'not_applicable',interiorVertices:0}}},source:{output:'tiling'}} as TessResult;
  assert.equal(canAdoptTess(result,false,tessConstructionKey(initial),changed),true);
});

test('decorated mother faces retain their source style after repetition or pruning',()=>{
  const options=defaultTileDecorations([[0,1,2],[3,4,5]]);
  options.tiles[0].fill='M';options.tiles[1].fill='V';
  const mother={vertices_coords:[[0,0],[1,0],[0,1],[1,1]] as [number,number][],faces_vertices:[[0,1,2],[1,3,2],[0,1,2]],edges_vertices:[],edges_assignment:[],zhezhi_custom_face_index:[1,0,1],zhezhi_custom_polygons:[[[0,0],[1,0],[0,1]],[[1,0],[1,1],[0,1]],[[0,0],[1,0],[0,1]]]} satisfies TessGraph;
  const tiles=decoratedMotherTiles(mother,options,2);
  assert.deepEqual(tiles.map(t=>t.decoration.fill),['V','M','V']);
  assert.deepEqual(tiles[0].points,mother.zhezhi_custom_polygons[0]);
});

test('original TileIndex can label or suppress each source tile independently',()=>{
  const faces=[[0,1,2],[3,4,5]],options=defaultTileDecorations(faces);
  options.showTileIndices=true;
  options.tiles[0].label='中心 A';
  options.tiles[1].label=null;
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),faces),options);
  assert.equal(readTileDecorations({...options,tiles:[{...options.tiles[0],label:'x'.repeat(33)},options.tiles[1]]},faces),null);
  const mother={vertices_coords:[[0,0],[1,0],[0,1],[1,1]] as [number,number][],faces_vertices:[[0,1,2],[1,3,2],[0,1,2]],edges_vertices:[],edges_assignment:[],zhezhi_custom_face_index:[0,1,0]} satisfies TessGraph;
  const tiles=decoratedMotherTiles(mother,options,2);
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
  assert.equal((markup.match(/data-tile-label="中心 A"/g)??[]).length,2,'source tile label survives repetition');
  assert.equal((markup.match(/data-tile-index=/g)??[]).length,2,'TileIndex None suppresses the selected source tile');
  assert.equal(markup.includes('data-tile-index="2"'),false);
  options.tiles[0].label=undefined;
  const legacy=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:decoratedMotherTiles(mother,options,2),options,units:1,part:'marks'}));
  assert.ok(legacy.includes('data-tile-index="1" data-tile-label="1"'));
  assert.ok(legacy.includes('data-tile-index="3" data-tile-label="3"'));
});

test('saved TilingStyle RGB subset colors text, lines and light/medium/dark fill without changing construction',()=>{
  // Origamica In[2785–2786] maps TilingFillColor through Lighter[base,.70/.50].
  const params=tessPreset('custom');assert.equal(params.family,'custom');
  const options=defaultTileDecorations(params.faces);
  options.showPolys=true;options.showTileIndices=true;options.showVertexIndices=true;
  options.tilingStyle={textColor:'#123456',lineColor:'#654321',fillColor:'#336699'};
  options.tiles.forEach((tile,i)=>{tile.fill=(['light','medium','dark'] as const)[i%3];if(i===0)tile.label='a';});
  const changed=changeTessParams(params,{tileDecorations:options});
  assert.equal(tessConstructionKey(changed),tessConstructionKey(params));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),params.faces),options);
  for(const value of ['red','#12345','url(#bad)','#00000000']){
    assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,lineColor:value}},params.faces),null);
  }
  assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,opacity:'0.5'}},params.faces),null);
  assert.equal(lighterTileColor('#336699',.70),'#c2d1e0');
  assert.equal(lighterTileColor('#336699',.50),'#99b3cc');
  assert.equal(lighterTileColor('#ccb399',.70),'#f0e8e0','old light-fill color remains unchanged');
  assert.equal(lighterTileColor('#ccb399',.50),'#e6d9cc','old medium-fill color remains unchanged');
  const tiles=params.faces.map((face,i)=>({points:face.map(vertex=>params.vertices[vertex]),sourceIndex:i,decoration:options.tiles[i]}));
  const render=(part:'fill'|'edges'|'marks')=>renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part}));
  const fills=render('fill');
  assert.match(fills,/fill="#c2d1e0"/);assert.match(fills,/fill="#99b3cc"/);assert.match(fills,/fill="#336699"/);
  assert.match(render('edges'),/stroke="#654321"/);
  const marks=render('marks');
  assert.match(marks,/data-tile-label="a"/);assert.match(marks,/fill="#123456"/);
  assert.match(marks,/data-tile-vertex-index=/);
});

test('new Origamica decorations use the exact In[2784] default palette while legacy projects keep theirs',()=>{
  // Brown = RGBColor[.6,.4,.2], Orange = RGBColor[1,.5,0].
  // Darker[Brown,.8] and Lighter[Brown,1/3] yield these quantized SVG colors.
  const faces=[[0,1,2]],newStyle=origamicaTileDecorations(faces);
  assert.deepEqual(newStyle.tilingStyle,ORIGAMICA_TILE_TILING_STYLE);
  assert.deepEqual(newStyle.tilingStyle,{textColor:'#1f140a',lineColor:'#ff8000',fillColor:'#bb9977'});
  newStyle.showPolys=true;newStyle.showTileIndices=true;newStyle.tiles[0].fill='light';
  const tiles=[{points:[[0,0],[1,0],[0,1]] as [number,number][],sourceIndex:0,decoration:newStyle.tiles[0]}];
  const render=(part:'fill'|'edges'|'marks')=>renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options:newStyle,units:1,part}));
  assert.match(render('fill'),/fill="#ebe0d6"/);
  assert.match(render('edges'),/stroke="#ff8000" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(render('marks'),/fill="#1f140a"/);
  assert.doesNotMatch(render('marks'),/stroke="#fff"/,'Origamica TilingText has no white outline');
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(newStyle)),faces),newStyle);
  const legacy=readTileDecorations(defaultTileDecorations(faces),faces)!;
  assert.deepEqual(resolvedTileTilingStyle(legacy),{textColor:'#223c34',lineColor:'#273b33',fillColor:'#ccb399'});
  const legacyMarkup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options:{...legacy,showTileIndices:true},units:1,part:'marks'}));
  assert.match(legacyMarkup,/stroke="#fff"/,'old projects keep their white label outline');
  assert.equal(twistTileDecorations(faces,[{offset:0,centralTypes:['M','V','M']}]).tilingStyle,undefined,'legacy automatic custom twist keeps the old palette');
  assert.deepEqual(specializedTwistTileDecorations(polygonTilePreset('centered'))?.tilingStyle,ORIGAMICA_TILE_TILING_STYLE);
});

test('bounded Mathematica color expressions produce opaque RGB without evaluating input',()=>{
  const cases:Record<string,string>={
    'RGBColor[0.2, 0.4, 0.6]':'#336699',
    'RGBColor[1/5,2/5,3/5]':'#336699',
    'GrayLevel[.5]':'#808080',
    'Hue[0]':'#ff0000',
    'Hue[1/3]':'#00ff00',
    'Hue[.5,.5,.8]':'#66cccc',
    'CMYKColor[0,1,1,0]':'#ff0000',
    'CMYKColor[0,1,1]':'#ff0000',
    'CMYKColor[.2,.4,.6,.25]':'#99734d',
    'Darker[Brown,.8]':'#1f140a',
    'Lighter[Brown]':'#bb9977',
    'Lighter[Darker[Brown,.8],.5]':'#8f8a85',
    'Orange':'#ff8000',
    'Purple':'#800080',
    ' #ABCDEF ':'#abcdef',
  };
  for(const [input,expected] of Object.entries(cases))assert.equal(parseTileColorExpression(input),expected,input);
  const invalid=[
    '', '#abc', '#00000000', 'red', 'rgb(1,0,0)', 'Opacity[.5,Red]', 'RGBColor[1,0,0,.5]',
    'RGBColor[1,0]', 'GrayLevel[2]', 'Hue[-.1]', 'Hue[0,0,0,0]',
    'CMYKColor[0,0,0,0];Print[1]', 'Lighter[Brown,1/0]', 'Lighter[Brown,.5`3]',
    'System`Red', 'Lighter[Lighter[Lighter[Lighter[Lighter[Lighter[Lighter[Lighter[Lighter[Red]]]]]]]]]',
    'Lighter[Red]'.repeat(20),
  ];
  for(const input of invalid)assert.equal(parseTileColorExpression(input),null,input);
});

test('color expressions survive project JSON roundtrip, and mismatched or malicious sources fail closed',()=>{
  const params=tessPreset('custom');assert.equal(params.family,'custom');
  const options=origamicaTileDecorations(params.faces);
  options.tilingStyle={
    textColor:'#1f140a',lineColor:'#ff8000',fillColor:'#bb9977',
    expressions:{textColor:'Darker[Brown,.8]',lineColor:'Orange',fillColor:'Lighter[Brown]'},
  };
  const changed=changeTessParams(params,{tileDecorations:options});
  assert.equal(tessConstructionKey(changed),tessConstructionKey(params));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),params.faces),options);
  assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,fillColor:'#000000'}},params.faces),null);
  assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,expressions:{lineColor:'Opacity[.5,Orange]'}}},params.faces),null);
  assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,expressions:{unknown:'Red'}}},params.faces),null);
  assert.equal(readTileDecorations({...options,tilingStyle:{...options.tilingStyle!,expressions:{}}},params.faces),null);
});

test('clockwise source tile keeps its original vertex and edge marks after CCW normalization and repetition',()=>{
  // Origamica PolygonTile's TileVertexIndices and TileEdgeArrowDirs refer to
  // the ordered source vertices. The mother mesh reverses a clockwise face.
  const vertices:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[0,1],[1,1],[1,0]];
  const faces=[[0,1,2,3]],options=defaultTileDecorations(faces);
  options.showVertexIndices=true;options.showTileIndices=true;options.arrowStyle='CF';
  options.tiles[0].arrows=['M','V',null,null];
  const mother={vertices_coords:vertices,faces_vertices:[[0,1,2,3],[0,1,2,3]],edges_vertices:[],edges_assignment:[],
    zhezhi_custom_face_index:[0,0],
    zhezhi_custom_polygons:[[[1,0],[1,1],[0,1],[0,0]],[[2,0],[2,1],[1,1],[1,0]]]} satisfies TessGraph;
  const tiles=sourceDecoratedMotherTiles(mother,options,vertices,faces);
  assert.equal(tiles.length,2);
  for(const tile of tiles){
    assert.deepEqual(tile.vertexIndices,[4,3,2,1]);
    assert.deepEqual(tile.decoration.arrows,[null,'V','M',null]);
    assert.deepEqual(tile.decoration.arrowDirections,[-1,1,-1,-1]);
  }
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
  assert.equal((markup.match(/data-tile-vertex-index="4"/g)??[]).length,2);
  assert.ok(markup.includes('data-tile-index="1" data-tile-label="1"'));
  assert.ok(markup.includes('data-tile-index="2" data-tile-label="2"'));
  assert.ok(markup.includes('data-tile-arrow="1:2:V"'));
  assert.ok(markup.includes('data-tile-arrow="1:3:M"'));
  const sourceMountain=tileArrowSegments(vertices[0],vertices[1],'M','CF');
  const mappedMountain=tileArrowSegments(tiles[0].points[2],tiles[0].points[3],'M','CF',Infinity,tiles[0].decoration.arrowDirections?.[2]);
  assert.deepEqual(mappedMountain,sourceMountain,'reversed edge keeps the physical arrow direction');
  const sourceValley=tileArrowSegments(vertices[1],vertices[2],'V','CF');
  const mappedValley=tileArrowSegments(tiles[0].points[1],tiles[0].points[2],'V','CF',Infinity,tiles[0].decoration.arrowDirections?.[1]);
  assert.deepEqual(mappedValley,sourceValley);
  const editorPolygon=[[0,0],[1,0],[1,1],[0,1]] as [number,number][];
  assert.deepEqual(alignTileDecoration(editorPolygon,vertices,options.tiles[0]).vertexIndices,[1,4,3,2]);
});

test('Tiling overlay converts the mother drawing frame to the crease-pattern frame without hiding creases',()=>{
  const options=defaultTileDecorations([[0,1,2,3]]);
  options.showPolys=true;options.showEdges=true;options.showTileIndices=true;options.arrowStyle='CF';
  options.tiles[0]={fill:'M',arrows:['M',null,null,null]};
  const tiles=[{points:[[0,0],[200,0],[200,200],[0,200]] as [number,number][],sourceIndex:0,decoration:options.tiles[0]}];
  const mother={vertices_coords:[[-1,-1],[1,-1],[1,1],[-1,1]] as [number,number][],faces_vertices:[[0,1,2,3]],edges_vertices:[],edges_assignment:[]} satisfies TessGraph;
  const fold={vertices_coords:[[-2,-1],[2,-1],[2,1],[-2,1]] as [number,number][],faces_vertices:[[0,1,2,3]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,0]] as [number,number][],edges_assignment:['B','B','B','B']} satisfies TessGraph;
  const projected=reframeTileDecorations(tiles,mother,fold);
  assert.deepEqual(projected?.[0].points,[[50,0],[150,0],[150,100],[50,100]]);
  assert.equal(projected?.[0].decoration,tiles[0].decoration,'projection does not rewrite face or edge assignments');
  const fill=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:projected!,options,units:1,part:'fill'}));
  const edges=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:projected!,options,units:1,part:'edges'}));
  const marks=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:projected!,options,units:1,part:'marks'}));
  assert.ok(fill.includes('fill="#efb3b3"'));
  assert.ok(edges.includes('data-decorated-outline="0"')&&edges.includes('fill="none"'));
  assert.ok(marks.includes('data-tile-arrow="1:1:M"')&&marks.includes('data-tile-index="1"'));
  options.showEdges=false;
  assert.equal(renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:projected!,options,units:1,part:'edges'})).includes('data-decorated-outline'),false);
  assert.equal(reframeTileDecorations(tiles,mother,{...fold,vertices_coords:[[2,2],[4,2],[4,4],[2,4]]}),null,
    'do not paint mother tiles beyond the generated CP paper frame');
  const concave={...fold,
    vertices_coords:[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4]] as [number,number][],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0]] as [number,number][],
    edges_assignment:Array(8).fill('B')};
  const wideMother={...mother,vertices_coords:[[0,0],[4,0],[4,4],[0,4]] as [number,number][]};
  const bridge=[{...tiles[0],points:[[25,100],[175,100],[175,150],[25,150]] as [number,number][]}];
  assert.equal(reframeTileDecorations(bridge,wideMother,concave),null,
    'a tile bridging a concave paper notch must not be overlaid even though its corners and bbox lie inside');
  const triangle={...fold,vertices_coords:[[0,0],[2,0],[0,2]] as [number,number][],
    faces_vertices:[[0,1,2]],edges_vertices:[[0,1],[1,2],[2,0]] as [number,number][],edges_assignment:['B','B','B']};
  const squareMother={...mother,vertices_coords:[[0,0],[2,0],[2,2],[0,2]] as [number,number][]};
  const outside=[{...tiles[0],points:[[100,100],[200,100],[200,200],[100,200]] as [number,number][]}];
  assert.equal(reframeTileDecorations(outside,squareMother,triangle),null,'nonrectangular paper uses its true boundary');
});

test('legacy line arrows retain directed/crossing and half/full semantics',()=>{
  const edge:[[number,number],[number,number]]=[[0,0],[10,0]];
  const dh=tileArrowSegments(...edge,'M','DH'),df=tileArrowSegments(...edge,'M','DF');
  assert.equal(dh.length,2);assert.equal(df.length,3);
  assert.ok(dh[0][1][0]>dh[0][0][0]);
  const reverse=tileArrowSegments(...edge,'V','DH');assert.ok(reverse[0][1][0]<reverse[0][0][0]);
  assert.ok(dh[1][0][1]>0&&reverse[1][0][1]>0,'half directed arrow stays on the original CCW side');
  const ch=tileArrowSegments(...edge,'M','CH'),cf=tileArrowSegments(...edge,'V','CF');
  assert.equal(ch.length,2);assert.equal(cf.length,3);
  assert.ok(ch[0][1][1]<ch[0][0][1]);
  assert.ok(cf[0][1][1]>cf[0][0][1]&&cf[0][0][1]<0&&cf[0][1][1]>0,'full crossing arrow straddles the edge');
});

test('In[2836/2838/2840/2842] arrow Graphics are edge-scaled filled polygons in TilingLineColor',()=>{
  const a:[number,number]=[0,0],b:[number,number]=[10,0];
  const rounded=(style:'DH'|'CH'|'DF'|'CF',direction:number)=>originalTileArrowPolygon(a,b,style,direction).map(p=>p.map(v=>Number(v.toFixed(6))));
  assert.deepEqual(rounded('DH',1),[[4.25,0],[5.75,0],[4.25,.87]]);
  assert.deepEqual(rounded('CH',-1),[[4.55,0],[5.45,0],[5,1.5]]);
  assert.deepEqual(rounded('DF',1),[[4.1,-.54],[5.9,0],[4.1,.54]]);
  assert.deepEqual(rounded('CF',-1),[[4.46,-.9],[5.54,-.9],[5,.9]]);
  assert.deepEqual(originalTileArrowPolygon(a,a,'CF',1),[]);
  const options=origamicaTileDecorations([[0,1,2]]);
  options.arrowStyle='DF';options.tiles[0].arrows=['M',null,null];
  const tiles=[{points:[a,b,[0,10]] as [number,number][],sourceIndex:0,decoration:options.tiles[0]}];
  const original=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
  assert.match(original,/data-tile-arrow="1:1:M"><polygon points="4.1,-0.54 5.9,0 4.1,0.54" fill="#ff8000"/);
  assert.doesNotMatch(original,/<line /);
  const oldSaved=defaultTileDecorations([[0,1,2]]);
  oldSaved.arrowStyle='DF';oldSaved.tiles[0].arrows=['M',null,null];
  const oldReadBack=readTileDecorations(JSON.parse(JSON.stringify(oldSaved)),[[0,1,2]])!;
  assert.equal(oldReadBack.tilingStyle,undefined);
  const legacy=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles:[{...tiles[0],decoration:oldReadBack.tiles[0]}],options:oldReadBack,units:1,part:'marks'}));
  assert.match(legacy,/data-tile-arrow="1:1:M"><g stroke="#b23d42"/);
  assert.doesNotMatch(legacy,/<polygon /);
});

test('saved In[2862] TileEdgeArrowDirs are direction-only marks, not M/V assignments',()=>{
  const vertices:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[1,0],[1,1],[0,1]];
  const faces=[[0,1,2,3]],options=origamicaTileDecorations(faces);
  options.arrowStyle='CF';
  options.tiles[0].arrows=['D','D','D','D'];
  options.tiles[0].arrowDirections=[1,1,-1,-1]; // Origamica In[2862], TileEdgeArrowDirs.
  assert.deepEqual(readTileDecorations(JSON.parse(JSON.stringify(options)),faces),options);
  assert.deepEqual(effectiveTileArrowDirections(options.tiles[0]),[1,1,-1,-1]);
  assert.deepEqual(effectiveTileArrowDirections({fill:'none',arrows:['D','D',null,null]}),[1,1,1,1]);
  assert.deepEqual(effectiveTileArrowDirections({fill:'none',arrows:['M','V',null,null]}),[1,-1,1,1]);
  assert.equal(readTileDecorations({...options,tiles:[{...options.tiles[0],arrowDirections:[1,0,-1,-1]}]},faces),null);
  assert.equal(readTileDecorations({...options,tiles:[{...options.tiles[0],arrows:['D','D','x','D']}]},faces),null);
  const custom=changeTessParams(tessPreset('custom'),{vertices,faces});
  const changed=changeTessParams(custom,{tileDecorations:options});
  assert.equal(changed.family,'custom');
  assert.equal(tessConstructionKey(changed),tessConstructionKey(custom));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
  const tiles=[{points:vertices,sourceIndex:0,decoration:options.tiles[0]}];
  const markup=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
  assert.equal((markup.match(/data-tile-arrow="1:\d:D"/g)??[]).length,4);
  assert.equal((markup.match(/fill="#ff8000"/g)??[]).length,4);
  assert.doesNotMatch(markup,/<line /);
  const reversed=[[1,0],[0,0],[0,1],[1,1]] as [number,number][];
  const mapped=alignTileDecoration(reversed,vertices,options.tiles[0]).decoration;
  assert.deepEqual(mapped.arrows,['D','D','D','D']);
  assert.deepEqual(mapped.arrowDirections,[-1,1,1,-1]);
  for(const style of ['DH','CH','DF','CF'] as const){
    const original=originalTileArrowPolygon(vertices[0],vertices[1],style,1);
    const remapped=originalTileArrowPolygon(reversed[0],reversed[1],style,mapped.arrowDirections![0],-1);
    const canonical=(points:[number,number][])=>points.map(p=>p.map(x=>x.toFixed(8)).join(',')).sort();
    assert.deepEqual(canonical(remapped),canonical(original),`${style} retains its physical triangle after CW normalization`);
  }
});

test('specialized centered and offset twist decorations follow source edge assignments',()=>{
  const faces=[[0,1,2,3]];
  const centered=twistTileDecorations(faces,[{width:.2,offset:0,tilt:70,centralTypes:['V','M','M','M']}]);
  assert.deepEqual(centered.tiles[0].arrows,['V','M','M','M']);
  assert.deepEqual(centered.tiles[0].arrowDirections,[-1,1,1,1]);
  assert.equal(centered.tiles[0].fill,'none');
  const offset=twistTileDecorations(faces,[{width:.2,offset:-.1,tilt:90,centralTypes:['V','V','V','V']}]);
  assert.equal(offset.tiles[0].fill,'dark');
  assert.deepEqual(offset.tiles[0].arrowDirections,[1,1,1,1]);
  const mixed=twistTileDecorations(faces,[{width:.2,offset:.1,tilt:90,centralTypes:['V','M','M','M']}]);
  assert.equal(mixed.tiles[0].fill,'medium');
  const mother={vertices_coords:[[0,0],[0,1],[1,1],[1,0]] as [number,number][],faces_vertices:[[0,1,2,3]],edges_vertices:[],edges_assignment:[],zhezhi_custom_face_index:[0],zhezhi_custom_polygons:[[[1,0],[1,1],[0,1],[0,0]]]} satisfies TessGraph;
  const mapped=twistDecoratedMotherTiles(mother,centered,mother.vertices_coords,faces);
  assert.deepEqual(mapped[0].decoration.arrows,['M','M','V','M']);
  assert.deepEqual(mapped[0].decoration.arrowDirections,[-1,-1,1,-1]);
  const sourceArrow=tileArrowSegments([0,0],[0,1],'V','CF',Infinity,-1);
  const mappedArrow=tileArrowSegments([0,1],[0,0],'V','CF',Infinity,1);
  assert.deepEqual(sourceArrow.map(([a,b])=>[a,b]),mappedArrow.map(([a,b])=>[a,b]),'reversing a source edge preserves its physical arrow direction');
  const explicit=tileArrowSegments([0,0],[10,0],'M','CF',Infinity,-1);
  assert.ok(explicit[0][1][1]>explicit[0][0][1],'arrow direction can reverse without relabeling its mountain assignment');
});

test('single-tile RenderTile delegates add decorations only for centered and offset variants',()=>{
  const centered=splitPreset('centered');centered.centralTypes=['M','V','V','M'];
  const centeredOptions=specializedTwistTileDecorations(centered);
  assert.deepEqual(centeredOptions?.tiles[0].arrows,centered.centralTypes);
  assert.deepEqual(centeredOptions?.tiles[0].arrowDirections,[1,-1,-1,1]);
  assert.equal(centeredOptions?.tiles[0].fill,'none');
  assert.deepEqual(specializedTwistTileDecorations(splitPreset('centered-angle'))?.tiles[0].arrows,['M','M','M','M']);
  assert.equal(specializedTwistTileDecorations(splitPreset('general')),null,'general split delegates the undecorated PolygonTile');
  const offset=splitPreset('offset');offset.centralTypes=['V','V','V','V'];
  const splitOptions=specializedTwistTileDecorations(offset);
  assert.equal(splitOptions?.tiles[0].fill,'dark');
  assert.deepEqual(splitOptions?.tiles[0].arrowDirections,[1,1,1,1]);
  const polygon=polygonTilePreset('offset');polygon.centralTypes=['M','M','V','V'];
  assert.equal(specializedTwistTileDecorations(polygon)?.tiles[0].fill,'medium');
  assert.equal(specializedTwistTileDecorations(polygonTilePreset('general')),null);
  const brocard=brocardPreset('cyclic-offset');assert.equal(brocard.kind,'cyclic-offset');
  assert.equal(specializedTwistTileDecorations(brocard)?.tiles[0].arrows.length,brocard.sides);
  assert.equal(specializedTwistTileDecorations(brocardPreset('triangle')),null);
});
