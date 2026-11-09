import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {assembleTiles,unitStarTile} from '../../src/app/tileAssembly';
import {defaultTileDecorations,sourceDecoratedMotherTiles} from '../../src/app/tileDecorations';
import {readTessParams,tessPreset,type TessGraph} from '../../src/app/tessellation';
import TileDecorationLayer from '../../src/components/TileDecorationLayer';

test('regular star tile uses the ordinary PolygonTile 2D decoration path',()=>{
  // Origamica RenderTile[{UnitRegularStarPolygonTile,n,alpha},decoration,opts]
  // delegates to RenderTile[{PolygonTile,UnitRegularStarPolygonVertices[n,alpha]},...].
  for(const [tips,angle] of [[5,36],[6,200]]){
    const mesh=assembleTiles([unitStarTile(tips,angle)],true);
    const options=defaultTileDecorations(mesh.faces);
    options.showPolys=true;
    options.showVertexIndices=true;
    options.showTileIndices=true;
    options.arrowStyle='CF';
    options.tiles[0]={fill:'M',arrows:mesh.faces[0].map((_,i)=>i===0?'M':i===1?'V':null),label:'星形'};
    const params=readTessParams({...tessPreset('custom'),...mesh,customOutput:'tiling',tileDecorations:options});
    assert.ok(params?.family==='custom');
    assert.deepEqual(params.tileDecorations,options);

    const mother={vertices_coords:mesh.vertices,faces_vertices:mesh.faces,edges_vertices:[],edges_assignment:[]} satisfies TessGraph;
    const tiles=sourceDecoratedMotherTiles(mother,options,mesh.vertices,mesh.faces);
    assert.equal(tiles.length,1);
    assert.equal(tiles[0].points.length,2*tips);
    const fill=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'fill'}));
    const edges=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'edges'}));
    const marks=renderToStaticMarkup(createElement(TileDecorationLayer,{tiles,options,units:1,part:'marks'}));
    assert.ok(fill.includes('fill="#efb3b3"'));
    assert.ok(edges.includes('data-decorated-outline="0"'));
    assert.equal((marks.match(/data-tile-vertex-index=/g)??[]).length,2*tips);
    assert.ok(marks.includes('data-tile-arrow="1:1:M"'));
    assert.ok(marks.includes('data-tile-arrow="1:2:V"'));
    assert.ok(marks.includes('data-tile-index="1" data-tile-label="星形"'));
  }
});
