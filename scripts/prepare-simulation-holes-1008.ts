import fs from 'node:fs';
import {holesMaterial,mergeHoleRing,mergeTwoHoleRing} from '../tests/fixtures/materialHoles';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {exportDocument} from '../src/core/formats';
const ring=mergeHoleRing().result.doc,m=holesMaterial(ring);
const edge=(x:number)=>{const e=m.graph.edges_vertices.findIndex(([a,b])=>m.graph.vertices_coords[a][0]===x&&m.graph.vertices_coords[b][0]===x&&Math.min(m.graph.vertices_coords[a][1],m.graph.vertices_coords[b][1])===0);if(e<0)throw Error('Anchor missing');return {edgeId:m.edgeSegmentIds[e],fraction:.5};};
const hinge=editMaterialFaces(ring,{kind:'material-face-trace',component:0,from:edge(0),to:edge(300),assignment:'M',fixedSide:'left'}).doc;
for(const [name,doc] of [['ring',ring],['two',mergeTwoHoleRing().result.doc],['hinge',hinge]] as const){
  doc.name=`带孔三维-${name}`;fs.writeFileSync(`output/playwright/simulation-holes-${name}-1008.zhezhi.json`,exportDocument(doc,'json').text);
}
console.log('Prepared one-hole, two-hole and real mountain-hinge material projects.');
