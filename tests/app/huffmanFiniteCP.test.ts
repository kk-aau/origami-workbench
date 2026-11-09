import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {huffmanFiniteCPDocument,huffmanFiniteCPSourceMatches,readHuffmanFiniteCPRecipe,validateHuffmanFiniteCPRecipe,HUFFMAN_FINITE_CP_EXAMPLES,HuffmanFiniteCPError,type HuffmanFiniteCPRecipe} from '../../src/app/huffmanFiniteCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/huffman-finite-cp-1011.json',import.meta.url),'utf8')).cases as {name:string;model:'circle4'|'parabola';args:[number,number,number,number];nativeResult:any}[];
const recipe=(f:typeof fixtures[number]):HuffmanFiniteCPRecipe=>({model:f.model,sourceMode:f.nativeResult.query.mode?'direct':'saved',parametersDeg:f.name.includes('saved-closed')?[33,87,60,-52]:f.args,divisions:f.nativeResult.query.divisions,unitSizeMm:1});
const own=(doc:any)=>doc.metadata.originalHuffmanSingleBlockFiniteCP;
const data=JSON.parse(readFileSync(new URL('../fixtures/huffman-finite-cp-1011.json',import.meta.url),'utf8'));
for(const f of fixtures)test(f.name+': actual native source creates three real finite faces and exact original V/M chords',()=>{
 const doc=huffmanFiniteCPDocument(recipe(f),f.nativeResult),material=inspectMaterialTopology(doc);assert.ok(material.ok);if(!material.ok)return;
 assert.equal(material.graph.faces_vertices!.length,3);assert.equal(material.graph.vertices_coords.length-material.graph.edges_vertices.length+3,1);assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);
 assert.equal(material.graph.edges_assignment.filter(x=>x==='V').length,f.nativeResult.query.divisions);assert.ok(material.graph.edges_assignment.includes('M'));assert.ok(material.graph.edges_assignment.includes('B'));
 assert.ok(doc.segments.every(s=>s.assignment==='B'?s.angle===0:s.angle===null));assert.deepEqual(own(doc).nativeSource,f.nativeResult);assert.equal(own(doc).nativeSource.certification.adoptableCreasePattern,false);
 assert.ok(own(doc).finitePaperProof.exactOnceCoverage);assert.ok(huffmanFiniteCPSourceMatches(doc));
});
test('unit conversion happens once and never translates the original world origin',()=>{
 const f=fixtures[0],raw=huffmanFiniteCPDocument(recipe(f),f.nativeResult),scaled=huffmanFiniteCPDocument({...recipe(f),unitSizeMm:17},f.nativeResult),a=inspectMaterialTopology(raw),b=inspectMaterialTopology(scaled);assert.ok(a.ok&&b.ok);if(!a.ok||!b.ok)return;
 assert.deepEqual(b.graph.vertices_coords,a.graph.vertices_coords.map(p=>p.map(x=>x*17)));assert.deepEqual(b.graph.vertices_coords[0],[0,0]);assert.deepEqual(own(raw).rawWorldPoints,own(scaled).rawWorldPoints);assert.ok(huffmanFiniteCPSourceMatches(scaled));
});
test('only symbolic stationary intervals identify vertices; zero-length references never enter CP',()=>{
 const f=fixtures[0],doc=huffmanFiniteCPDocument(recipe(f),f.nativeResult),maps=own(doc).sourceToActualVertexMap,initial=maps.filter((x:any)=>x.identity==='initial-q0');assert.ok(initial.length>=2);
 assert.ok(initial.every((x:any)=>x.vertices[2]===initial[0].vertices[2]&&x.vertices[2]===x.vertices[3]));assert.ok(maps.every((x:any)=>x.vertices[0]===0));
 assert.ok(doc.segments.every(s=>s.a[0]!==s.b[0]||s.a[1]!==s.b[1]));assert.equal(own(doc).evidence.pairedBlockMaterialCompleted,false);assert.equal(own(doc).source.rulingsAreReferenceOnly,true);
});
test('hand edited assignment or point retains reconstruction but cannot pass fresh adoption',()=>{
 const f=fixtures[0],doc=huffmanFiniteCPDocument(recipe(f),f.nativeResult);for(const change of [(d:any)=>{d.segments.find((s:any)=>s.assignment==='V').assignment='M';},(d:any)=>{d.segments[0].a[0]=Number.EPSILON;}]){const changed=structuredClone(doc);change(changed);assert.equal(huffmanFiniteCPSourceMatches(changed),false);assert.deepEqual(readHuffmanFiniteCPRecipe(changed),recipe(f));}
});
test('literal origin and q=0 point forges are rejected, including subnormal metadata-only changes',()=>{
 const f=fixtures[0];for(const k of [0,1,2,3]){const native=structuredClone(f.nativeResult);native.sample.rows[0].flat[k][1]=Number.MIN_VALUE;assert.throws(()=>huffmanFiniteCPDocument(recipe(f),native),HuffmanFiniteCPError);}
});
test('geometry/coverage metadata cannot be replaced while retaining the original recipe',()=>{
 const f=fixtures[0],doc=huffmanFiniteCPDocument(recipe(f),f.nativeResult);for(const change of [(d:any)=>{own(d).finitePaperProof.faces=4;},(d:any)=>{own(d).rawWorldPoints[1][0]+=Number.EPSILON;},(d:any)=>{d.paper.height+=1;},(d:any)=>{d.metadata.materialTopology.graph.faces_vertices.reverse();}]){const changed=structuredClone(doc);change(changed);assert.equal(huffmanFiniteCPSourceMatches(changed),false);}
});
test('tiny or overflowing source-valid units report material interface capability, rather than input invalidity or a silent inset',()=>{
 const f=fixtures[0];for(const unitSizeMm of [1e-12,Number.MIN_VALUE,1e308])assert.throws(()=>huffmanFiniteCPDocument({...recipe(f),unitSizeMm},f.nativeResult),(e:any)=>e instanceof HuffmanFiniteCPError&&e.code==='MATERIAL_INTERFACE');
});
test('saved Circle uses the actual root and retains four closure residuals without claiming root uniqueness or 3D material',()=>{
 const f=fixtures.find(x=>x.name.includes('saved-closed'))!,doc=huffmanFiniteCPDocument(recipe(f),f.nativeResult);assert.notDeepEqual(own(doc).resolvedParametersDeg,[33,87,60,-52]);assert.equal(own(doc).nativeSource.closure.residuals.length,4);assert.equal(own(doc).nativeSource.closure.rootUniqueCertified,false);assert.equal(own(doc).evidence.threeDimensionalMaterial,false);
});
test('input, implemented numerical branch and single-block capability remain explicit',()=>{
 assert.throws(()=>validateHuffmanFiniteCPRecipe({...HUFFMAN_FINITE_CP_EXAMPLES.circle4,unknown:1}),(e:any)=>e.code==='SOURCE_INPUT');
 assert.throws(()=>validateHuffmanFiniteCPRecipe({...HUFFMAN_FINITE_CP_EXAMPLES.circle4,sourceMode:'direct',parametersDeg:[0,87,60,-52]}),(e:any)=>e.code==='NUMERIC_SOURCE');
 assert.throws(()=>validateHuffmanFiniteCPRecipe({...HUFFMAN_FINITE_CP_EXAMPLES.circle4,parametersDeg:[35,85,65,-55]}),(e:any)=>e.code==='SOURCE_INPUT');
});
test('all six immutable single-v1 documents read, match and regenerate byte-for-byte with no paired namespace',()=>{
 for(const legacy of data.legacySingleDocuments){assert.deepEqual(readHuffmanFiniteCPRecipe(legacy.doc),legacy.recipe);assert.ok(huffmanFiniteCPSourceMatches(legacy.doc));const native=fixtures.find(x=>x.name===legacy.name)!.nativeResult;assert.deepEqual(huffmanFiniteCPDocument(legacy.recipe,native),legacy.doc);assert.ok(!Object.hasOwn(legacy.doc.metadata,'originalHuffmanPairedFiniteCP'));}
});
for(const [name,counts]of [['circle4-root-initial-guess',[43,46,4,16,12,18]],['parabola-original-arguments',[51,54,4,16,16,22]],['circle4-saved-closed-25',[105,108,4,50,26,32]]] as const)test(name+': independent pair counts, strict half-turn source and four once-covered true faces',()=>{
 const f=fixtures.find(x=>x.name===name)!,r={...recipe(f),paperMode:'paired' as const},doc=huffmanFiniteCPDocument(r,f.nativeResult),material=inspectMaterialTopology(doc);assert.ok(material.ok);if(!material.ok)return;const g=material.graph;
 assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices!.length,g.edges_assignment.filter(x=>x==='V').length,g.edges_assignment.filter(x=>x==='M').length,g.edges_assignment.filter(x=>x==='B').length],counts);assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);
 assert.ok(!doc.metadata!.originalHuffmanSingleBlockFiniteCP);const p=doc.metadata!.originalHuffmanPairedFiniteCP as any;assert.equal(p.schema,'original-huffman-paired-finite-cp-v2');assert.equal(p.recipe.paperMode,'paired');assert.equal(p.pairSourceToActualVertexMap.addedInternalSeams,0);assert.equal(p.finitePaperProof.faces,4);assert.equal(p.nativeSource.certification.adoptableCreasePattern,false);assert.ok(huffmanFiniteCPSourceMatches(doc));assert.deepEqual(readHuffmanFiniteCPRecipe(doc),r);
 for(const [a,b]of p.pairSourceToActualVertexMap.removedSharedBottomEdges)assert.ok(!g.edges_vertices.some(([x,y])=>x===a&&y===b||x===b&&y===a));
});
test('pair half-turn is exact and no subnormal mirror-coordinate or shared identity forge is repaired',()=>{
 const f=fixtures[0],r={...recipe(f),paperMode:'paired' as const},native=structuredClone(f.nativeResult);native.sample.rows[0].flatMirror[0][1]=Number.MIN_VALUE;assert.throws(()=>huffmanFiniteCPDocument(r,native),HuffmanFiniteCPError);
 const doc=huffmanFiniteCPDocument(r,f.nativeResult);for(const change of [(d:any)=>{d.metadata.originalHuffmanPairedFiniteCP.pairSourceToActualVertexMap.addedInternalSeams=1;},(d:any)=>{d.metadata.originalHuffmanSingleBlockFiniteCP={schema:'original-huffman-single-block-finite-cp-v1',recipe:recipe(f)};}]){const changed=structuredClone(doc);change(changed);assert.equal(huffmanFiniteCPSourceMatches(changed),false);}
});
