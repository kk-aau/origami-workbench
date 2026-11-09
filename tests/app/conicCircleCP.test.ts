import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONIC_CIRCLE_CP_EXAMPLE,conicCircleCPDocument,conicCircleCPQuery,conicCircleCPSourceMatches,
 readConicCircleCPRecipe,validateConicCircleCPRecipe} from '../../src/app/conicCircleCP';
import {buildFold} from '../../src/core/geometry';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {computeFlatFold} from '../../src/core/flatFold';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,exportCPProcessingDXFLines,exportCPProcessingSVG,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {parseDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import type {Doc,Point} from '../../src/core/types';

const names=['original-circle','edited-circle','bounded-extreme'],fixture=(name=names[0])=>JSON.parse(fs.readFileSync(new URL('../fixtures/conic-circle-cp-20261010/'+name+'.json',import.meta.url),'utf8')),
 generate=(name=names[0])=>{const f=fixture(name);return conicCircleCPDocument(f.recipe,f.native);},
 edgeKey=(a:Point,b:Point)=>[JSON.stringify(a.map(x=>Object.is(x,-0)?0:x)),JSON.stringify(b.map(x=>Object.is(x,-0)?0:x))].sort().join('|');
for(const name of names)test(name+': literal complete native data makes one actual two-face material in original mm coordinates',()=>{
 const f=fixture(name),before=JSON.stringify(f),d=conicCircleCPDocument(f.recipe,f.native),g=buildFold(d).graph,n=f.recipe.segments,s=n+1,
  material=inspectMaterialTopology(d);assert.ok(material.ok);
 assert.equal(g.vertices_coords.length,3*s);assert.equal(g.edges_vertices.length,3*n+4);assert.equal(g.faces_vertices!.length,2);
 assert.equal(g.edges_assignment.filter(k=>k==='U').length,n);assert.equal(g.edges_assignment.filter(k=>k==='B').length,2*n+4);
 assert.deepEqual(g.edges_foldAngle,g.edges_assignment.map(k=>k==='U'?null:0));
 assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);assert.equal(material.foldedVertices,undefined);
 assert.deepEqual(g.vertices_coords,[...f.native.components[0].samples.map((r:any)=>r.rules[0]),...f.native.components[0].samples.map((r:any)=>r.rules[4]),...f.native.components[0].samples.map((r:any)=>r.rules[8])]);
 assert.deepEqual(conicCircleCPQuery(f.recipe),f.native.query);assert.equal(JSON.stringify(f),before);assert.ok(conicCircleCPSourceMatches(d));
 const source=d.metadata!.originalConicCircle2D as any;assert.equal(source.source.rightDirectorReversed,false);assert.equal(source.source.fullNineRulesPreserved,true);
 for(const row of source.nativeConic.components[0].samples)assert.deepEqual(row.rules[2],row.rules[6]);
 assert.equal(source.intrinsicDomain.jacobianMagnitudeLowerBound,1-f.recipe.leftCoefficient);assert.equal(source.source.coordinateTransform,'identity');assert.equal(source.source.coordinateUnit,'mm');
 assert.equal(source.evidence.flatFold,false);assert.equal(source.evidence.layerOrder,false);assert.equal(d.flatFold,undefined);
});
test('original In[4021] 16 chords retain 51/52/2 and opposite signed coefficients without reversing the original right director',()=>{
 const f=fixture(),d=generate(),rows=f.native.components[0].samples;
 assert.deepEqual(f.recipe,CONIC_CIRCLE_CP_EXAMPLE);assert.deepEqual(conicCircleCPQuery(f.recipe).leftCross,-.5);assert.equal(conicCircleCPQuery(f.recipe).rightCross,.5);
 for(const r of rows)for(const axis of [0,1]){
  assert.ok(Math.abs(r.rules[4][axis]-r.rules[0][axis]-.5*r.rules[2][axis])<1e-13);
  assert.ok(Math.abs(r.rules[8][axis]-r.rules[0][axis]+.5*r.rules[6][axis])<1e-13);
 }
 assert.equal(d.segments.length,52);assert.equal((d.metadata!.originalConicCircle2D as any).topology.vertexOrder,'crease, left second cross curve, right second cross curve');
});
for(const name of names)test(name+': JSON and material FOLD reopen with exact graph, original IDs and current source recipe',()=>{
 const doc=generate(name),before=JSON.stringify(doc),g=inspectMaterialTopology(doc);assert.ok(g.ok);
 for(const format of ['json','fold'] as const){
  const text=exportDocument(doc,format).text,reopened=importDocument(text,format).doc,after=inspectMaterialTopology(reopened);assert.ok(after.ok);
  assert.deepEqual(after.graph,g.graph);assert.deepEqual(after.edgeSegmentIds,g.edgeSegmentIds);assert.equal(after.foldedVertices,undefined);
  assert.deepEqual(readConicCircleCPRecipe(reopened),readConicCircleCPRecipe(doc));assert.ok(conicCircleCPSourceMatches(reopened));
  if(format==='fold'){const raw=JSON.parse(text);assert.equal(raw.frame_unit,'mm');assert.equal(raw.file_frames,undefined);assert.deepEqual(raw.frame_classes,['creasePattern']);}
 }
 assert.equal(JSON.stringify(doc),before);
});
test('source guard rejects parameter/provenance/identity/policy/geometry mutations while allowing names and fixed-bound rounding',()=>{
 const doc=generate(),before=JSON.stringify(doc),mutations:[string,(d:any)=>void][]=[
  ['tiny source parameter',d=>d.metadata.originalConicCircle2D.recipe.leftCoefficient+=5e-14],
  ['right coefficient flip',d=>d.metadata.originalConicCircle2D.recipe.rightCoefficient*=-1],
  ['native query',d=>d.metadata.originalConicCircle2D.nativeConic.query.leftCross+=1e-5],
  ['exact source normalization scale',d=>d.metadata.originalConicCircle2D.nativeConic.normalization.scale+=5e-14],
  ['exact source normalization origin',d=>d.metadata.originalConicCircle2D.nativeConic.normalization.origin[0]+=5e-14],
  ['native direction flip',d=>d.metadata.originalConicCircle2D.nativeConic.components[0].samples[2].rules[6][0]*=-1],
  ['native source coordinate beyond policy',d=>d.metadata.originalConicCircle2D.nativeConic.components[0].samples[2].rules[0][0]+=2e-13],
  ['native source text',d=>d.metadata.originalConicCircle2D.nativeConic.source.definitionCell='In[4021]'],
  ['native savedOut claim',d=>d.metadata.originalConicCircle2D.nativeConic.source.numericWolframOutAvailable=true],
  ['unknown source field',d=>d.metadata.originalConicCircle2D.source.extra=1],
  ['source director claim',d=>d.metadata.originalConicCircle2D.source.rightDirectorReversed=true],
  ['proof flag',d=>d.metadata.originalConicCircle2D.intrinsicDomain.globallyInjective=false],
  ['proof radius',d=>d.metadata.originalConicCircle2D.intrinsicDomain.radii[0]+=5e-14],
  ['policy constant',d=>d.metadata.originalConicCircle2D.numericalPolicy.sourceCoordinateAbsoluteBoundMm+=5e-14],
  ['negative numeric residual',d=>d.metadata.originalConicCircle2D.numericalPolicy.maximumLiteralCircleResidual=-1e-15],
  ['over-bound numeric residual',d=>d.metadata.originalConicCircle2D.numericalPolicy.maximumLiteralCircleResidual=2e-13],
  ['topology count',d=>d.metadata.originalConicCircle2D.topology.vertices++],
  ['identity',d=>d.segments[0].id='other'],
  ['index',d=>d.metadata.materialTopology.graph.edges_vertices[0].reverse()],
  ['material extra field',d=>d.metadata.materialTopology.extra=0],
  ['real position',d=>d.segments[0].a[0]+=2e-13],
  ['null at a true zero coordinate',d=>d.segments[0].a[1]=null],
  ['string at a true zero coordinate',d=>d.segments[0].a[1]='0'],
  ['3D endpoint masquerading as 2D',d=>d.segments[0].a.push(0)],
  ['NaN endpoint',d=>d.segments[0].b[0]=NaN],
  ['numeric string paper',d=>d.paper.width=String(d.paper.width)],
  ['NaN paper',d=>d.paper.height=NaN],
  ['actual graph position',d=>d.metadata.materialTopology.graph.vertices_coords[0][0]+=2e-13],
  ['assignment',d=>d.segments[0].assignment='M'],
  ['angle',d=>d.segments[0].angle=180],
  ['paper',d=>d.paper.width+=2e-13],
  ['paper unknown field',d=>d.paper.extra=0],
  ['folded pose',d=>d.metadata.materialTopology.foldedVertices=structuredClone(d.metadata.materialTopology.graph.vertices_coords)],
  ['starting pose',d=>d.flatFold={startingFace:[]}],
 ];
 for(const [label,f]of mutations){const changed=structuredClone(doc);f(changed);assert.equal(conicCircleCPSourceMatches(changed),false,label);}
 const renamed={...structuredClone(doc),name:'用户圆例'},numeric=structuredClone(doc);(numeric.metadata!.originalConicCircle2D as any).numericalPolicy.maximumLiteralCircleResidual=5e-14;
 assert.ok(conicCircleCPSourceMatches(renamed));assert.ok(conicCircleCPSourceMatches(numeric));assert.equal(JSON.stringify(doc),before);
});
test('invalid inputs and unverified/mismatched native source fail before mutation',()=>{
 const f=fixture(),before=JSON.stringify(f);
 for(const change of [ {leftCoefficient:0},{leftCoefficient:1},{rightCoefficient:.5},{rightCoefficient:-3},
  {parameterStart:-.1},{parameterEnd:Math.PI},{parameterEnd:.01},{segments:15},{segments:129},{segments:16.5},
  {segments:true},{extra:1}])assert.throws(()=>validateConicCircleCPRecipe({...f.recipe,...change}));
 const unmatched={...f.recipe,leftCoefficient:.3};assert.throws(()=>conicCircleCPDocument(unmatched,f.native));
 for(const edit of [(x:any)=>x.native.domain.certified=false,(x:any)=>x.native.certification.adoptableCreasePattern=true,
  (x:any)=>x.native.components[0].samples.pop(),(x:any)=>x.native.query.leftFocus=-2]){const x=structuredClone(f);edit(x);assert.throws(()=>conicCircleCPDocument(x.recipe,x.native));}
 assert.equal(JSON.stringify(f),before);
});
test('hand-edited material properties retain source recipe and IDs, are saveable, and no longer certify the original U-only source',()=>{
 const before=generate(),intent={kind:'material-line-properties' as const,segmentIds:[before.segments[0].id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},
  edited=buildMaterialLineProperties(before,intent),commit=prepareEditorCommit(before,edited.doc,intent).doc,
  material=inspectMaterialTopology(commit);assert.ok(material.ok);assert.equal(material.foldedVertices,undefined);
 assert.equal(commit.segments[0].assignment,'M');assert.equal(conicCircleCPSourceMatches(commit),false);assert.deepEqual(readConicCircleCPRecipe(commit),CONIC_CIRCLE_CP_EXAMPLE);
 const opened=importDocument(exportDocument(commit,'fold').text,'fold').doc;assert.equal(opened.segments[0].assignment,'M');assert.deepEqual(readConicCircleCPRecipe(opened),CONIC_CIRCLE_CP_EXAMPLE);
 assert.deepEqual(material.edgeSegmentIds,(before.metadata!.materialTopology as any).edgeSegmentIds);
});
test('CP remains subject to ordinary local/full flat-fold gates and has no imported pose or solved layer certificate',()=>{
 const doc=generate(),flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'invalid');assert.notEqual(flat.layers.status,'solved');assert.equal(doc.flatFold,undefined);
});
test('ordinary and optimized exports roundtrip exact original mm geometry with one CAD Y flip and unchanged Doc',()=>{
 const doc=generate(),before=JSON.stringify(doc),plain=exportDXF(doc).text,ordinary=parseDxf(plain).segments,
  keys=doc.segments.map(s=>edgeKey(s.a,s.b)).sort();
 assert.equal(ordinary.length,52);assert.deepEqual(ordinary.map((s:any)=>edgeKey([s.a[0],-s.a[1]],[s.b[0],-s.b[1]])).sort(),keys);
 const plan=optimizeCPPaths(doc,{pathMode:'continuous',profiles:{U:{enabled:true},B:{enabled:true}}});
 for(const [format,writer]of [['svg',exportCPProcessingSVG],['dxf',exportCPProcessingDXF],['dxf-lines',exportCPProcessingDXFLines]] as const){
  const text=writer(doc,plan).text,report=verifyCPProcessingExport(text,format,doc,plan);
  assert.equal(report.units,'mm');assert.equal(report.geometryCoverage,'exact');assert.equal(report.processedEdgeCount,52);assert.equal(report.physicalImportVerified,false);
 }
 assert.equal(JSON.stringify(doc),before);assert.equal(exportDXF(doc).text,plain);
});
