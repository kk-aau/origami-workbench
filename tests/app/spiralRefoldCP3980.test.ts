import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SPIRAL_REFOLD_CP_3980_EXAMPLE,spiralRefoldCP3980Document,spiralRefoldCP3980SourceMatches,validateSpiralRefoldCP3980Recipe,readSpiralRefoldCP3980Recipe,prepareSpiralRefoldCP3980Preview} from '../../src/app/spiralRefoldCP3980';
import {uniformHelixCP3951Document,uniformHelixCP3951SourceMatches,UNIFORM_HELIX_CP_3951_EXAMPLE} from '../../src/app/uniformHelixCP3951';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const f=JSON.parse(fs.readFileSync(new URL('../fixtures/spiral-refold-cp-3980-20261011.json',import.meta.url),'utf8')),
 clone=<T>(x:T):T=>structuredClone(x),own=(d:any)=>d.metadata.originalSpiralRefold3980,
 generate=(c=f.cases[0])=>spiralRefoldCP3980Document(c.recipe),near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-13,`${a} != ${b}`);
for(const c of f.cases){
 test(c.name+' raw planar material and three source references agree with independent MP80',()=>{
  const d=generate(c),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
  const graph=m.graph,n=c.recipe.segments,s=n+1,expected=c.independentMP80Graph;
  assert.equal(graph.vertices_coords.length,3*s);assert.equal(graph.edges_vertices.length,3*n+4);assert.equal(graph.faces_vertices!.length,2);
  graph.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>near(x,expected.vertices_coords[i][k])));
  for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_faces'] as const)assert.deepEqual(graph[key],expected[key]);
  assert.deepEqual(m.edgeSegmentIds,c.independentSourceEdgeSegmentIds);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  own(d).sourceFrames.forEach((row:any,i:number)=>{
   const e=c.independentMP80Frames[i];near(row.u,e.u);near(row.foldAngleRad,e.foldAngleRad);
   for(const key of ['base','leftDirector','rightDirector'])row[key].forEach((x:number,k:number)=>near(x,e[key][k]));
   for(const [index,key,w]of [[s,'leftDirector',c.recipe.leftWidth],[2*s,'rightDirector',c.recipe.rightWidth]] as const)assert.deepEqual(graph.vertices_coords[index+i],row.base.map((x:number,k:number)=>x+w*row[key][k]));
   const ref=own(d).continuousReference.frames[i];near(ref.recoveredFoldAngleRad,e.recoveredFoldAngleRad);
   for(const key of ['sourceBase','sourceLeftDirector','sourceRightDirector','recoveredBase','recoveredLeftDirector','recoveredRightDirector'])ref[key].forEach((x:number,k:number)=>near(x,e[key][k]));
  });
  assert.deepEqual(own(d).sourceFrames[0].base,[1,0]);assert.equal(own(d).source.initialParameter,c.recipe.parameterStart);assert.equal(own(d).source.currentStartReseeded,true);
  assert.equal(own(d).continuousReference.midpoint.parameter,(c.recipe.parameterStart+c.recipe.parameterEnd)/2);assert.equal(own(d).continuousReference.finiteRigidFoldedShape,false);
  assert.equal(own(d).topology.interiorRulingSeams,0);assert.equal(own(d).finitePaperProof.validationCells,2*n);assert.equal(own(d).finitePaperProof.validationTriangles,4*n);
  assert.equal(own(d).finitePaperProof.nonconvexCells,0);assert.equal(own(d).finitePaperProof.nonincidentPairs,c.independentFiniteSummary.nonincidentPairs);
  assert.equal(own(d).finitePaperProof.sharedVertexPairs,c.independentFiniteSummary.sharedVertexPairs);assert.equal(own(d).finitePaperProof.partitionEdges,c.independentFiniteSummary.partitionEdges);
  own(d).finitePaperProof.signedFaceAreas.forEach((x:number,i:number)=>near(x,c.independentFiniteSummary.areas[i]));
  assert.ok(own(d).finitePaperProof.minimumTriangleCross>0);assert.equal(own(d).finitePaperProof.validationDiagonalsAreCPEdges,false);
  assert.equal(d.segments.filter(s=>s.assignment==='B').length,2*n+4);assert.equal(d.segments.filter(s=>s.assignment==='U').length,n);assert.ok(d.segments.every(s=>s.angle===(s.assignment==='U'?null:0)));
  assert.ok(own(d).paperDomain.leftJacobianLowerBound>0);assert.ok(own(d).paperDomain.rightSignedJacobianUpperBound<0);
  assert.equal(spiralRefoldCP3980SourceMatches(d),true);assert.deepEqual(readSpiralRefoldCP3980Recipe(d),c.recipe);assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);
  for(const key of ['flatFold','layerOrder','threeDimensionalInitialCondition','isometryTo3D','continuousMotion','collisionFree'])assert.equal(own(d).evidence[key],false);
 });
 test(c.name+' JSON/FOLD actual importer and ordinary LINE export preserve millimetres and material',()=>{
  const d=generate(c),before=JSON.stringify(d);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.equal(spiralRefoldCP3980SourceMatches(reopened),true);assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened),JSON.parse(JSON.stringify(own(d))));assert.deepEqual(reopened.metadata!.materialTopology,d.metadata!.materialTopology);}
  const text=exportDXF(d).text,pairs=text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.ok(text.includes('AC1009'));assert.ok(text.includes('1 drawing unit = 1 mm'));assert.equal(lines.length,d.segments.length);
  lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(line['10']),Number(line['20']),Number(line['11']),Number(line['21'])],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(x=>Object.is(x,-0)?0:x));});assert.equal(JSON.stringify(d),before);
 });
}
test('original widths1 and current-start reseed are preserved independently of the absolute uniform family',()=>{
 assert.deepEqual(SPIRAL_REFOLD_CP_3980_EXAMPLE,{parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100});
 const d=generate(f.cases.find((c:any)=>c.recipe.parameterStart===.2)),u=uniformHelixCP3951Document({...UNIFORM_HELIX_CP_3951_EXAMPLE,parameterStart:.2,parameterEnd:2.8,segments:32});
 assert.deepEqual(own(d).sourceFrames[0].base,[1,0]);assert.notDeepEqual((u.metadata!.originalUniformHelix3951 as any).sourceFrames[0].base,[1,0]);
 assert.equal(spiralRefoldCP3980SourceMatches(u),false);assert.equal(uniformHelixCP3951SourceMatches(d),false);assert.equal(own(d).paperDomain.widthsAreOriginalDefaults,true);
 assert.equal(own(d).source.gammaRad,'2pi/3-u/3');near(own(d).sourceFrames.at(-1).foldAngleRad,2*Math.PI/3-2.8/3);
});
test('strict recipe rejects implicit fields, source mixing and finite-domain overflow without clamp',()=>{
 const r=SPIRAL_REFOLD_CP_3980_EXAMPLE;
 for(const bad of [{...r,leftWidth:0},{...r,rightWidth:1.00001},{...r,parameterStart:-.01},{...r,parameterEnd:Math.PI+.01},{...r,parameterEnd:.09},{...r,segments:15},{...r,segments:129},{...r,segments:16.2},{...r,leftWidth:'1'},{...r,gamma:'2pi/3-u/3'},{...r,paperBoundaryMode:'original-apex'},[r],null])assert.throws(()=>spiralRefoldCP3980Document(bad));
 for(const key of Object.keys(r)){const bad:any={...r};delete bad[key];assert.throws(()=>validateSpiralRefoldCP3980Recipe(bad));}
 for(const value of [NaN,Infinity,-Infinity,true,null,undefined])assert.throws(()=>spiralRefoldCP3980Document({...r,leftWidth:value}));
});
test('current malformed Doc, native/family substitutions, source/proof changes and fake 3D are refused before replay',()=>{
 const d=generate(),mutations:((x:any)=>void)[]=[
  x=>x.segments[0].a.push(0),x=>x.segments[0].a=null,x=>x.segments[0].b[0]=NaN,x=>x.segments[0].id=x.segments[1].id,x=>x.segments[0].assignment='M',x=>x.segments[0].angle=120,
  x=>x.paper.width=String(x.paper.width),x=>x.paper.height=NaN,x=>x.paper.extra=1,x=>x.metadata.materialTopology.graph.vertices_coords[0][0]+=1e-10,x=>x.metadata.materialTopology.edgeSegmentIds.reverse(),
  x=>x.metadata.materialTopology.foldedVertices=x.metadata.materialTopology.graph.vertices_coords,x=>x.metadata.materialTopology.startingFace=0,x=>x.flatFold={startingFace:0},
  x=>own(x).recipe.leftWidth=.5,x=>own(x).recipe.radius=1,x=>own(x).source.initialParameter=.2,x=>own(x).source.initialPoint=[0,0],x=>own(x).source.currentStartReseeded=false,
  x=>own(x).source.gammaRad='pi/3+u/3',x=>own(x).source.gammaRad='pi/2',x=>own(x).source.gammaDerivative=1/3,x=>own(x).source.originalGraphicsWidths=[.5,.5],x=>own(x).source.coordinateTransform='scale100',
  x=>own(x).source.rightDirectorReversed=true,x=>own(x).source.wolframInterpolationReproduced=true,x=>own(x).source.originalInterpolationPoints=100,
  x=>own(x).sourceFrames[0].base[1]=Number.MIN_VALUE,x=>own(x).sourceFrames[1].base[0]+=1e-10,x=>own(x).sourceFrames[1].u+=1e-14,x=>own(x).sourceFrames[1].leftDirector.push(0),
  x=>own(x).continuousReference.midpoint.parameter=.5,x=>own(x).continuousReference.frames[0].recoveredBase[0]+=1e-10,x=>own(x).continuousReference.frames[0].sourceBase.push(0),
  x=>own(x).continuousReference.generator[0][3]=1,x=>own(x).continuousReference.finiteRigidFoldedShape=true,
  x=>own(x).finitePaperProof.minimumTriangleCross=0,x=>own(x).finitePaperProof.signedFaceAreas[0]=0,x=>own(x).finitePaperProof.validationCells=201,
  x=>own(x).numericalPolicy.maximumUnitDirectorResidual=-1e-20,x=>own(x).numericalPolicy.maximumRecoveredSpatialDifferenceMm=-1e-20,x=>own(x).numericalPolicy.knownDerivedAbsoluteBoundMm=1e-8,
  x=>own(x).evidence.isometryTo3D=true,x=>own(x).evidence.flatFold=true];
 for(const change of mutations){const bad=clone(d);change(bad);const before=JSON.stringify(bad);assert.equal(spiralRefoldCP3980SourceMatches(bad),false);assert.equal(JSON.stringify(bad),before);}
 d.name='用户工程名';d.metadata!.note={user:true};assert.equal(spiralRefoldCP3980SourceMatches(d),true);
});
test('only known derived leaves tolerate machine rounding, while current starting point and policies remain exact',()=>{
 const d=generate(),rounded=clone(d);own(rounded).sourceFrames[1].base[0]+=Number.EPSILON;own(rounded).continuousReference.frames[1].recoveredBase[0]+=Number.EPSILON;assert.equal(spiralRefoldCP3980SourceMatches(rounded),true);
 own(rounded).sourceFrames[1].base[0]+=2e-13;assert.equal(spiralRefoldCP3980SourceMatches(rounded),false);
 for(const c of [f.cases[0],f.cases.find((x:any)=>x.recipe.parameterStart===.2)]){
  const d=generate(c),bad=clone(d);own(bad).sourceFrames[0].base[1]=1e-14;assert.equal(spiralRefoldCP3980SourceMatches(bad),false);
  own(bad).sourceFrames[0].base[1]=-0;assert.equal(spiralRefoldCP3980SourceMatches(bad),true);
 }
});
test('trusted preview shares a deeply frozen source, rebuilds exact finite material for widths and adopts an editable full clone',()=>{
 const r=SPIRAL_REFOLD_CP_3980_EXAMPLE,build=prepareSpiralRefoldCP3980Preview(r),a=build(r),b=build({...r,leftWidth:.5,rightWidth:.8});
 assert.equal(Object.isFrozen(own(a).sourceFrames[0].base),true);assert.equal(Object.isFrozen(own(a).continuousReference.frames[0].recoveredBase),true);assert.equal(own(a).sourceFrames,own(b).sourceFrames);
 assert.notDeepEqual(a.segments,b.segments);assert.deepEqual(build(r),a);assert.equal(spiralRefoldCP3980SourceMatches(b),true);assert.throws(()=>build({...r,parameterStart:.2}));
 const adopted=clone(b);assert.equal(Object.isFrozen(own(adopted).sourceFrames),false);assert.equal(spiralRefoldCP3980SourceMatches(adopted),true);own(adopted).continuousReference.frames[0].sourceBase[0]+=1e-10;assert.equal(spiralRefoldCP3980SourceMatches(adopted),false);assert.equal(spiralRefoldCP3980SourceMatches(a),true);
});
test('a continuous spatial crease chord has a real finite isometry counterexample and cannot be adopted as foldedVertices',()=>{
 const d=generate(f.cases[1]),rows=own(d).continuousReference.frames,flat=own(d).sourceFrames,
  distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
 assert.ok(Math.abs(distance(flat[0].base,flat[1].base)-distance(rows[0].sourceBase,rows[1].sourceBase))>1e-4);
 assert.equal(own(d).evidence.sourceVariableGammaIsFiniteEdgeAngle,false);assert.ok(d.segments.filter(s=>s.assignment==='U').every(s=>s.angle===null));
});
test('actual material hand assignment remains saveable and explicit source rebuilding restores U/null',()=>{
 const d=generate(f.cases[1]),id=d.segments[0].id,intent={kind:'material-line-properties' as const,segmentIds:[id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},
  hand=prepareEditorCommit(d,buildMaterialLineProperties(d,intent).doc,intent).doc;
 assert.equal(spiralRefoldCP3980SourceMatches(hand),false);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(hand,format).text,format).doc;assert.equal(reopened.segments.find(s=>s.id===id)!.assignment,'M');assert.equal(spiralRefoldCP3980SourceMatches(reopened),false);}
 const restored=spiralRefoldCP3980Document(readSpiralRefoldCP3980Recipe(hand));assert.equal(restored.segments[0].assignment,'U');assert.equal(restored.segments[0].angle,null);assert.equal(spiralRefoldCP3980SourceMatches(restored),true);
});
test('ordinary optimized path export retains all actual two-face edges and core coverage',()=>{
 const d=generate(f.cases[1]),plan=optimizeCPPaths(d),result=exportCPProcessingDXF(d,plan),report=verifyCPProcessingExport(result.text,'dxf',d,plan);
 assert.equal(report.verified,true);assert.equal(plan.analysis.included.length,d.segments.length);assert.equal(report.processedEdgeCount,d.segments.length);assert.equal(spiralRefoldCP3980SourceMatches(d),true);
});
test('current reseed derivative and literal original spatial zero point preserve fixed identities',()=>{
 for(const c of [f.cases[0],f.cases.find((x:any)=>x.recipe.parameterStart===.2),f.cases.find((x:any)=>x.recipe.parameterStart===2.6)]){
  const d=generate(c);
  for(const shift of [Number.MIN_VALUE,1e-14,-1e-14]){const bad=clone(d);own(bad).sourceFrames[0].basePrime[0]=shift;assert.equal(spiralRefoldCP3980SourceMatches(bad),false);}
  for(const shift of [1e-14,-1e-14]){const bad=clone(d);own(bad).sourceFrames[0].basePrime[1]+=shift;assert.equal(spiralRefoldCP3980SourceMatches(bad),false);}
  const zero=clone(d);own(zero).sourceFrames[0].basePrime[0]=-0;assert.equal(spiralRefoldCP3980SourceMatches(zero),true);
 }
 const d=generate();
 for(const [axis,shifts]of [[0,[1e-14,-1e-14]],[1,[Number.MIN_VALUE,1e-14,-1e-14]],[2,[Number.MIN_VALUE,1e-14,-1e-14]]] as const)for(const shift of shifts){const bad=clone(d);own(bad).continuousReference.frames[0].sourceBase[axis]+=shift;assert.equal(spiralRefoldCP3980SourceMatches(bad),false);}
 const derived=clone(d);own(derived).continuousReference.frames[0].recoveredBase[1]+=Number.EPSILON;assert.equal(spiralRefoldCP3980SourceMatches(derived),true);
});
