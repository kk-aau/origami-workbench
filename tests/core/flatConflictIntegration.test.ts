import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {computeFlatFold,computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {buildFold,epsilonFor} from '../../src/core/geometry';
import {conflictsFromLayerError,makeLayerConflict} from '../../src/core/flatConflictDiagnostics';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {polygonArea} from '../../src/core/geometry';

test('a failed Maekawa vertex identifies actual CP faces, creases and folded vertex IDs',()=>{
 const doc=blankDoc('山谷冲突',100,100);
 doc.segments.push({id:'horizontal',a:[0,50],b:[100,50],assignment:'V',angle:180},{id:'vertical',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const before=structuredClone(doc),source=buildFold(doc).graph,result=computeFlatFold(doc);
 assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'no-solution');assert.deepEqual(doc,before);
 const conflict=result.layers.conflicts?.find(c=>c.kind==='maekawa');assert.ok(conflict);
 assert.equal(conflict.scope,'condition');assert.match(conflict.message,/山折 0、谷折 4/);assert.equal(conflict.vertices?.length,1);
 const vertex=conflict.vertices![0];assert.deepEqual(source.vertices_coords[vertex],[50,50]);assert.ok(result.geometry.vertices[vertex]);
 assert.equal(conflict.faces.length,4);assert.equal(conflict.edges?.length,4);
 for(const f of conflict.faces)assert.ok(source.faces_vertices![f].includes(vertex));
 for(const e of conflict.edges!)assert.ok(source.edges_vertices[e].includes(vertex));
});

test('small-solver root propagation cause survives as a localized original-face conflict',()=>{
 const doc=exampleDoc('waterbomb');doc.segments.forEach(s=>{if(s.assignment!=='B'){s.assignment='M';s.angle=-180;}});
 const geometry=computeFlatGeometry(buildFold(doc).graph,epsilonFor(doc));assert.equal(geometry.geometry.status,'ready');
 const result=recomputeFlatLayers(geometry);assert.equal(result.layers.status,'no-solution');
 const conflict=result.layers.conflicts![0];assert.equal(conflict.scope,'root');assert.notEqual(conflict.kind,'global');
 assert.ok(conflict.faces.length>=3&&conflict.faces.every(f=>f<result.geometry.faces.length));assert.ok(conflict.message);
});

test('structured root errors are accepted but arbitrary messages and invalid identities are not evidence',()=>{
 const cause=new Error('invalid transitivity 3:0,1,2');
 assert.equal(conflictsFromLayerError(new Error('no solution possible',{cause}),3)[0].kind,'transitivity');
 for(const error of [new Error('invalid transitivity 3:0,1,99'),new Error('invalid taco_taco 3:0,1'),new Error('generic failure mentioning F1')])assert.deepEqual(conflictsFromLayerError(error,3),[]);
 const cyclic=new Error('unknown');cyclic.cause=cyclic;assert.deepEqual(conflictsFromLayerError(cyclic,3),[]);
});

test('contradictory required order and impossible visible side retain the actual requested faces',()=>{
 const doc=blankDoc('对折',100,100);doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'M',angle:-180});
 const result=computeFlatFold(doc);assert.equal(result.layers.status,'solved');
 const [below,above]=flatLayerEdges(result.layers.faceOrders!,result.geometry.faces.map(f=>Math.sign(polygonArea(f.map(v=>result.geometry.vertices[v])))))[0];
 const required=[{below,above},{below:above,above:below}],conflict=recomputeFlatLayers(result,{relativeConstraints:required});
 assert.equal(conflict.layers.status,'no-solution');assert.equal(conflict.layers.conflicts?.[0].kind,'relative-order');
 assert.deepEqual(conflict.layers.conflicts![0].faces,[above,below].sort((a,b)=>a-b));
 const top=result.layers.faceOrder!.at(-1)!,normal=polygonArea(result.geometry.faces[top].map(v=>result.geometry.vertices[v]));
 const wrong=recomputeFlatLayers(result,{constraints:[{face:top,side:normal>0?'color':'white'}]});
 assert.equal(wrong.layers.status,'no-solution');assert.equal(wrong.layers.conflicts?.[0].kind,'visible-face');assert.deepEqual(wrong.layers.conflicts![0].faces,[top]);
});

test('new solved or erroneous calculations do not inherit an old conflict overlay',()=>{
 const original=computeFlatFold(blankDoc('纸',100,100));
 original.layers={status:'no-solution',message:'old',conflicts:[makeLayerConflict('global','constraint',[0])]};
 const solved=recomputeFlatLayers(original);assert.equal(solved.layers.status,'solved');assert.equal(solved.layers.conflicts,undefined);
 const invalid=structuredClone(original);invalid.geometry.graph!.vertices_coords=[];
 const failed=recomputeFlatLayers(invalid);assert.equal(failed.layers.status,'error');assert.equal(failed.layers.conflicts,undefined);
 assert.equal(original.layers.conflicts?.length,1,'the old result is not mutated');
});
