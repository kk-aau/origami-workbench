import fs from 'node:fs';
import assert from 'node:assert/strict';
import {materialCutFixture,materialDoc} from '../tests/fixtures/materialModel';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {editMaterialFaces,type MaterialFaceInsertIntent} from '../src/core/materialFaceEdit';
import {exportDocument} from '../src/core/formats';
import {computeFlatFold} from '../src/core/flatFold';
import type {Point} from '../src/core/types';
const doc=materialCutFixture().source;doc.name='材料面编辑验收';const m=inspectMaterialTopology(doc);assert.ok(m.ok);
let request:MaterialFaceInsertIntent|undefined;
for(const [face,vs]of m.graph.faces_vertices!.entries()){
 if(vs.length<4)continue;const es=m.graph.faces_edges![face];
 const intent:MaterialFaceInsertIntent={kind:'material-face-insert',face,from:{edgeId:m.edgeSegmentIds[es[0]],fraction:.5},to:{edgeId:m.edgeSegmentIds[es[2]],fraction:.5},assignment:'F',fixedPart:0};
 try{const result=editMaterialFaces(doc,intent);if(computeFlatFold(result.doc).layers.status==='solved'){request=intent;break;}}catch{/* Candidate must pass existing strict geometry and layers. */}
}
assert.ok(request,'an actual Origamica face subdivision must be usable');
fs.writeFileSync('output/playwright/material-weak-tools-face-regression-source-1009.zhezhi.json',exportDocument(doc,'json').text);
fs.writeFileSync('output/audits/material-weak-tools-face-regression-request-1009.json',JSON.stringify(request,null,2));
const coords:Point[]=[[0,0],[100,0],[100,100],[0,100]],square=materialDoc({vertices_coords:coords,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},coords);square.name='材料面编辑山折验收';
fs.writeFileSync('output/playwright/material-weak-tools-face-regression-square-source-1009.zhezhi.json',exportDocument(square,'json').text);
console.log(JSON.stringify({source:'actual Origamica internal-diagonal-fixed-F2',request,originalFaces:m.graph.faces_vertices!.length,originalVertices:m.graph.vertices_coords.length}));
