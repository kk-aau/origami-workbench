import earcut from 'earcut';
import {mergeHoleRing,holesMaterial} from '../tests/fixtures/materialHoles';
import {materialFaceRings} from '../src/core/materialRings';
const g=holesMaterial(mergeHoleRing().result.doc).graph,rs=materialFaceRings(g,0),vs=rs.flat(),raw=earcut(vs.flatMap(v=>g.vertices_coords[v]),[rs[0].length],2),tris=Array.from({length:raw.length/3},(_,i)=>raw.slice(3*i,3*i+3).map(k=>vs[k]));console.log(JSON.stringify({coords:g.vertices_coords,rings:rs,triangles:tris,used:[...new Set(tris.flat())],n:tris.length},null,2));
