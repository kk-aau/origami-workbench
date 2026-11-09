import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE,evaluateUniformHelixGeneralCP3951Source,uniformHelixGeneralCP3951Document,
 validateUniformHelixGeneralCP3951Recipe,readUniformHelixGeneralCP3951Recipe,uniformHelixGeneralCP3951SourceMatches,prepareUniformHelixGeneralCP3951Preview,UniformHelixGeneralCP3951Error} from '../../src/app/uniformHelixGeneralCP3951';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/uniform-helix-general-cp-3951-20261011.json',import.meta.url),'utf8')),
 own=(d:any)=>d.metadata.originalUniformHelixGeneral3951,clone=<T>(x:T):T=>structuredClone(x),r=UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE;
for(const c of fixture.cases){
 test(c.name+' original general source and actual finite result match independent MP80 expectations',()=>{
  const source=evaluateUniformHelixGeneralCP3951Source(c.recipe);assert.equal(source.numericPolicy.intervalCertified,false);assert.equal(source.numericPolicy.libmAccuracyCertified,false);
  source.frames.forEach((row,i)=>{const expected=c.sourceFrames80[i];
   for(const key of ['base','basePrime','leftDirector','rightDirector','spatialBase','spatialLeftDirector','spatialRightDirector'] as const)
    row[key].forEach((value,k)=>{const ideal=Number(expected[key][k]),budget=/Director/.test(key)?source.numericPolicy.maximumDirectorErrorEstimate*4:
     key==='spatialBase'?source.numericPolicy.maximumSpatialReferenceErrorEstimateMm*4:source.numericPolicy.maximumWorldErrorEstimateMm*4;
     assert.ok(Math.abs(value-ideal)<=Math.max(budget,64*Number.EPSILON*Math.max(Math.abs(value),Math.abs(ideal)),Number.MIN_VALUE*64),`${c.name} raw ${key}/${i}/${k}`);});
  });
  if(!c.expectedFinitePassed){assert.throws(()=>uniformHelixGeneralCP3951Document(c.recipe),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&e.code==='FINITE_GEOMETRY');return;}
  const d=uniformHelixGeneralCP3951Document(c.recipe),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
  const g=m.graph,expected=c.independentMP80Graph,n=c.recipe.segments;
  assert.equal(g.vertices_coords.length,3*(n+1));assert.equal(g.edges_vertices.length,3*n+4);assert.equal(g.faces_vertices!.length,2);
  const bound=Math.max(source.numericPolicy.maximumWorldErrorEstimateMm*4,source.numericPolicy.worldReplayULPBoundMm);
  g.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>assert.ok(Math.abs(x-expected.vertices_coords[i][k])<=Math.max(bound,32*Number.EPSILON*Math.abs(x)),`${c.name} world ${i}/${k}: ${x} != ${expected.vertices_coords[i][k]}`)));
  for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_faces'] as const)assert.deepEqual(g[key],expected[key]);
  assert.deepEqual(m.edgeSegmentIds,c.independentEdgeSegmentIds);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  assert.equal(own(d).finitePaperProof.nonconvexCells,c.expectedNonconvexCells);assert.equal(own(d).finitePaperProof.validationCells,2*n);assert.equal(own(d).finitePaperProof.validationTriangles,4*n);
  assert.equal(own(d).finitePaperProof.partitionEdges,7*n+2);assert.equal(own(d).topology.interiorRulingSeams,0);assert.equal(own(d).finitePaperProof.validationDiagonalsAreCPEdges,false);
  assert.ok(d.segments.every(s=>s.angle===(s.assignment==='U'?null:0)));assert.equal(d.segments.filter(s=>s.assignment==='U').length,n);
  assert.equal(own(d).source.currentStartReseeded,false);assert.equal(own(d).source.unitWidthsIndependentOfRadius,true);assert.equal(own(d).source.radius,c.recipe.radius);
  assert.equal(uniformHelixGeneralCP3951SourceMatches(d),true);assert.deepEqual(readUniformHelixGeneralCP3951Recipe(d),c.recipe);
  if(c.recipe.parameterStart===0)assert.deepEqual(own(d).sourceFrames[0].base,[1,0]);else assert.notDeepEqual(own(d).sourceFrames[0].base,[1,0]);
  assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);for(const key of ['flatFold','layerOrder','isometryTo3D','continuousMotion','collisionFree'])assert.equal(own(d).evidence[key],false);
 });
}
test('source input is unrestricted by the old numeric box, with explicit strict principal branch and eight fields',()=>{
 for(const key of Object.keys(r)){const bad:any={...r};delete bad[key];assert.throws(()=>validateUniformHelixGeneralCP3951Recipe(bad));}
 for(const bad of [{...r,radius:0},{...r,radius:-1},{...r,helicityAngleDeg:90},{...r,helicityAngleDeg:-90},{...r,foldAngleDeg:0},{...r,foldAngleDeg:180},
  {...r,radius:'1'},{...r,extra:1},{...r,parameterEnd:0},{...r,segments:129},{...r,leftWidth:0},{...r,rightWidth:1.01},null])assert.throws(()=>validateUniformHelixGeneralCP3951Recipe(bad));
 for(const value of [NaN,Infinity,-Infinity,true,null])assert.throws(()=>validateUniformHelixGeneralCP3951Recipe({...r,radius:value}));
 assert.equal(validateUniformHelixGeneralCP3951Recipe({...r,radius:1e308,helicityAngleDeg:0,foldAngleDeg:1,parameterEnd:1e-308}).radius,1e308);
 assert.equal(validateUniformHelixGeneralCP3951Recipe({...r,radius:1e-4,leftWidth:1e-5}).leftWidth,1e-5);
 assert.equal(validateUniformHelixGeneralCP3951Recipe({...r,parameterStart:-Math.PI,parameterEnd:Math.PI}).parameterStart,-Math.PI);
});
test('original source validity is independent of left paper focus and the material interface',()=>{
 const small={...r,radius:.1,helicityAngleDeg:45,foldAngleDeg:10,leftWidth:.05};assert.ok(evaluateUniformHelixGeneralCP3951Source(small).frames.length);
 assert.throws(()=>uniformHelixGeneralCP3951Document(small),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&e.code==='PAPER_DOMAIN');
 const large={...r,radius:1e6};assert.ok(evaluateUniformHelixGeneralCP3951Source(large).frames.length);
 assert.throws(()=>uniformHelixGeneralCP3951Document(large),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&e.code==='MATERIAL_INTERFACE');
 const tiny={...r,radius:1e-8,leftWidth:1e-9};assert.ok(evaluateUniformHelixGeneralCP3951Source(tiny).frames.length);
 assert.throws(()=>uniformHelixGeneralCP3951Document(tiny),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&['FINITE_GEOMETRY','MATERIAL_INTERFACE'].includes(e.code));
});
test('source evaluator preserves a repeated-curve reference, while two-face adoption refuses whole revolutions',()=>{
 const long={...r,parameterEnd:20};assert.ok(evaluateUniformHelixGeneralCP3951Source(long).frames.length);
 assert.throws(()=>uniformHelixGeneralCP3951Document(long),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&e.code==='PAPER_DOMAIN');
});
test('double overflow, an unresolved u grid and excessive phase conditioning are explicit numeric capability failures',()=>{
 for(const bad of [{...r,radius:Number.MAX_VALUE},{...r,parameterStart:1e20,parameterEnd:1e20+32768},
  {...r,parameterStart:1e15,parameterEnd:1e15+Math.PI},{...r,helicityAngleDeg:89.99999999999999,radius:1e-16}]){
  assert.doesNotThrow(()=>validateUniformHelixGeneralCP3951Recipe(bad));assert.throws(()=>evaluateUniformHelixGeneralCP3951Source(bad),(e:unknown)=>e instanceof UniformHelixGeneralCP3951Error&&e.code==='NUMERIC_SOURCE');
 }
});
test('concave simple cells are accepted with reliable alternate diagonals, without a convex-domain clamp',()=>{
 for(const theta of [30,-30]){const d=uniformHelixGeneralCP3951Document({...r,radius:.8,helicityAngleDeg:theta,foldAngleDeg:60,leftWidth:.76,segments:16});
  assert.equal(own(d).finitePaperProof.nonconvexCells,16);assert.equal(own(d).paperDomain.convexSufficientCondition,false);assert.equal(own(d).paperDomain.convexConditionRequiredForAdoption,false);assert.ok(uniformHelixGeneralCP3951SourceMatches(d));}
});
test('JSON/FOLD source and raw indexed material roundtrip; ordinary and optimized DXF keep source coverage',()=>{
 const d=uniformHelixGeneralCP3951Document({...r,radius:.8,helicityAngleDeg:-30,foldAngleDeg:60,leftWidth:.76,segments:16}),before=JSON.stringify(d);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.ok(uniformHelixGeneralCP3951SourceMatches(reopened));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened),JSON.parse(before).metadata.originalUniformHelixGeneral3951);}
 assert.ok(exportDXF(d).text.includes('AC1009'));const plan=optimizeCPPaths(d),out=exportCPProcessingDXF(d,plan),checked=verifyCPProcessingExport(out.text,'dxf',d,plan);assert.equal(checked.verified,true);assert.equal(plan.analysis.included.length,d.segments.length);assert.equal(JSON.stringify(d),before);
});
test('parameter, phase, source style, numeric budget and actual hand edits cannot be concealed by source replay',()=>{
 const d=uniformHelixGeneralCP3951Document(r),mutations=[(x:any)=>own(x).recipe.radius=2,(x:any)=>own(x).recipe.helicityAngleDeg=-30,
  (x:any)=>own(x).recipe.foldAngleDeg=60,(x:any)=>own(x).sourceFrames[1].u+=1e-10,(x:any)=>own(x).sourceFrames[1].phase+=1e-10,
  (x:any)=>own(x).sourceFrames[1].base[0]+=1e-8,(x:any)=>own(x).numericalPolicy.worldReplayULPBoundMm*=2,
  (x:any)=>own(x).source.initialPoint=[2,0],(x:any)=>own(x).source.originalMVSpecified=true,(x:any)=>own(x).source.rightDirectorReversed=true,
  (x:any)=>x.metadata.materialTopology.edgeSegmentIds.reverse(),(x:any)=>x.metadata.materialTopology.graph.vertices_coords[0][0]+=Number.EPSILON,
  (x:any)=>x.flatFold={startingFace:0},(x:any)=>own(x).evidence.isometryTo3D=true];
 for(const mutate of mutations){const bad=clone(d);mutate(bad);const bytes=JSON.stringify(bad);assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);assert.equal(JSON.stringify(bad),bytes);}
 const id=d.segments[3].id,intent={kind:'material-line-properties' as const,segmentIds:[id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},
  hand=prepareEditorCommit(d,buildMaterialLineProperties(d,intent).doc,intent).doc;assert.equal(uniformHelixGeneralCP3951SourceMatches(hand),false);
 const restored=uniformHelixGeneralCP3951Document(readUniformHelixGeneralCP3951Recipe(hand));assert.equal(restored.segments[3].assignment,'U');assert.equal(restored.segments[3].angle,null);assert.equal(uniformHelixGeneralCP3951SourceMatches(restored),true);
 const round=clone(d);own(round).sourceFrames[1].base[0]+=Number.EPSILON;assert.equal(uniformHelixGeneralCP3951SourceMatches(round),true);
});
test('original zero-parameter literal identities are exact while derived values retain replay tolerance',()=>{
 for(const recipe of [r,{...r,radius:2},{...r,helicityAngleDeg:0}]){const d=uniformHelixGeneralCP3951Document(recipe);
  for(const delta of [Number.MIN_VALUE,-Number.MIN_VALUE])for(const key of ['basePrime','spatialBase'] as const)for(const i of key==='basePrime'?[0]:[1,2]){
   const bad=clone(d);own(bad).sourceFrames[0][key][i]=delta;assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);}
  for(const delta of [Number.EPSILON*recipe.radius,-Number.EPSILON*recipe.radius]){const bad=clone(d);own(bad).sourceFrames[0].spatialBase[0]+=delta;assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);}
  const derived=clone(d);own(derived).sourceFrames[0].basePrime[1]+=Number.EPSILON;assert.equal(uniformHelixGeneralCP3951SourceMatches(derived),true);
 }
});
test('width-only preview reuses a frozen absolute source, with a whole editable clone at adoption',()=>{
 const preview=prepareUniformHelixGeneralCP3951Preview(r),a=preview.build(r),b=preview.build({...r,leftWidth:.5});assert.equal(own(a).sourceFrames,own(b).sourceFrames);
 assert.ok(Object.isFrozen(preview.source.frames));assert.equal(uniformHelixGeneralCP3951SourceMatches(b),true);assert.throws(()=>preview.build({...r,radius:2}));
 const editable=clone(b);assert.equal(Object.isFrozen(own(editable).sourceFrames),false);own(editable).sourceFrames[0].base[0]+=1e-8;assert.equal(uniformHelixGeneralCP3951SourceMatches(editable),false);assert.equal(uniformHelixGeneralCP3951SourceMatches(a),true);
});
test('a legal negative crop sampling zero preserves original literals in source and material endpoints',()=>{
 const d=uniformHelixGeneralCP3951Document({...r,parameterStart:-.5,parameterEnd:.5,segments:16}),i=8;
 assert.equal(own(d).sourceFrames[i].u,0);assert.equal(uniformHelixGeneralCP3951SourceMatches(d),true);
 const mutations=[(x:any)=>own(x).sourceFrames[i].base[0]+=Number.EPSILON,(x:any)=>own(x).sourceFrames[i].base[1]=Number.MIN_VALUE,
  (x:any)=>own(x).sourceFrames[i].basePrime[0]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[i].spatialBase[0]+=Number.EPSILON,
  (x:any)=>own(x).sourceFrames[i].spatialBase[1]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[i].spatialBase[2]=Number.MIN_VALUE,
  (x:any)=>x.metadata.materialTopology.graph.vertices_coords[i][0]+=Number.EPSILON,
  (x:any)=>x.segments.find((s:any)=>s.id==='uniform-general-crease-8').a[0]+=Number.EPSILON,
  (x:any)=>x.segments.find((s:any)=>s.id==='uniform-general-crease-7').b[1]=Number.MIN_VALUE];
 for(const mutate of mutations){const bad=clone(d);mutate(bad);assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);}
});

// Exact observed Chrome documents, not an oracle generated by this constructor.
const chromeRuntime=JSON.parse(fs.readFileSync(new URL('../fixtures/uniform-helix-general-runtime-chrome-20261011.json',import.meta.url),'utf8'));
const nextPositive=(x:number,steps=1)=>{const a=new ArrayBuffer(8),v=new DataView(a);v.setFloat64(0,x);v.setBigUint64(0,v.getBigUint64(0)+BigInt(steps));return v.getFloat64(0);};
for(const c of chromeRuntime.cases)test('actual Chrome '+c.name+' preserves source classification and every input byte in Node',()=>{
 const d=c.doc,bytes=JSON.stringify(d);assert.match(c.actualSourceSHA256,/^[a-f0-9]{64}$/);assert.equal(uniformHelixGeneralCP3951SourceMatches(d),true);assert.equal(JSON.stringify(d),bytes);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.equal(uniformHelixGeneralCP3951SourceMatches(reopened),true);assert.deepEqual(reopened.segments,d.segments);}
});
test('saved finite metrics must equal exact-predicate replay of the actual indexed material, without a metadata tolerance',()=>{
 const original=chromeRuntime.cases.find((x:any)=>x.name==='beyondpi').doc;
 const mutations=[(d:any)=>own(d).finitePaperProof.minimumTriangleCross=nextPositive(own(d).finitePaperProof.minimumTriangleCross),
  (d:any)=>own(d).finitePaperProof.signedFaceAreas[0]=nextPositive(own(d).finitePaperProof.signedFaceAreas[0]),
  (d:any)=>own(d).finitePaperProof.signedFaceAreas[1]=nextPositive(own(d).finitePaperProof.signedFaceAreas[1]),
  (d:any)=>own(d).finitePaperProof.validationTriangles++, (d:any)=>own(d).finitePaperProof.nonconvexCells++,
  (d:any)=>own(d).finitePaperProof.validationRulingsAreCPEdges=true];
 for(const source of [original,uniformHelixGeneralCP3951Document(own(original).recipe)])for(const mutate of mutations){const bad=clone(source);mutate(bad);const bytes=JSON.stringify(bad);assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);assert.equal(JSON.stringify(bad),bytes);}
 for(const v of [0,-1,Number.MIN_VALUE,NaN,Infinity]){const bad=clone(original);own(bad).finitePaperProof.minimumTriangleCross=v;assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);}
});
test('saved unit residual is bound to the four saved directors, not accepted by a broad epsilon comparison',()=>{
 for(const c of chromeRuntime.cases){const original=c.doc,value=own(original).numericalPolicy.maximumUnitDirectorResidual;
  assert.equal(value,Math.max(...own(original).sourceFrames.flatMap((f:any)=>['leftDirector','rightDirector','spatialLeftDirector','spatialRightDirector'].map(k=>Math.abs(f[k].reduce((s:number,x:number)=>s+x*x,0)-1)))));
  for(const forged of [nextPositive(value),-Number.MIN_VALUE,Number.MIN_VALUE,64*Number.EPSILON,NaN,Infinity]){
   if(forged===value)continue;const bad=clone(original);own(bad).numericalPolicy.maximumUnitDirectorResidual=forged;assert.equal(uniformHelixGeneralCP3951SourceMatches(bad),false);}
 }
});
test('only nonzero frame world error estimates allow eight ULPs; original zero and all policy limits remain strict',()=>{
 const original=chromeRuntime.cases.find((x:any)=>x.name==='default100').doc,value=evaluateUniformHelixGeneralCP3951Source(own(original).recipe).frames[1].worldErrorEstimateMm;assert.ok(value>0);
 for(const steps of [1,8]){const d=clone(original);own(d).sourceFrames[1].worldErrorEstimateMm=nextPositive(value,steps);assert.equal(uniformHelixGeneralCP3951SourceMatches(d),true);}
 for(const v of [nextPositive(value,9),0,-1,NaN,Infinity,value*1.0001]){const d=clone(original);own(d).sourceFrames[1].worldErrorEstimateMm=v;assert.equal(uniformHelixGeneralCP3951SourceMatches(d),false);}
 for(const v of [Number.MIN_VALUE,-Number.MIN_VALUE]){const d=clone(original);own(d).sourceFrames[0].worldErrorEstimateMm=v;assert.equal(uniformHelixGeneralCP3951SourceMatches(d),false);}
 for(const key of ['worldReplayULPBoundMm','directorReplayULPBound','relativeWorldAccuracyDemand']){const d=clone(original);own(d).numericalPolicy[key]=nextPositive(own(d).numericalPolicy[key]);assert.equal(uniformHelixGeneralCP3951SourceMatches(d),false);}
 const unknown=clone(original);own(unknown).sourceFrames[1].unrecognizedErrorBound=0;assert.equal(uniformHelixGeneralCP3951SourceMatches(unknown),false);
});
