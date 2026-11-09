import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNIFORM_HELIX_CP_3951_EXAMPLE,uniformHelixCP3951Document,uniformHelixCP3951SourceMatches,
 validateUniformHelixCP3951Recipe,readUniformHelixCP3951Recipe,prepareUniformHelixCP3951Preview} from '../../src/app/uniformHelixCP3951';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const f=JSON.parse(fs.readFileSync(new URL('../fixtures/uniform-helix-cp-3951-20261011.json',import.meta.url),'utf8')),
 clone=<T>(x:T):T=>structuredClone(x),own=(d:any)=>d.metadata.originalUniformHelix3951,
 generate=(c=f.cases[0])=>uniformHelixCP3951Document(c.recipe),near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-13,`${a} != ${b}`);
for(const c of f.cases){
 test(c.name+' literal absolute source and actual material agree with independent MP80 and existing Python source',()=>{
  const d=generate(c),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
  const graph=m.graph,n=c.recipe.segments,s=n+1,expected=c.independentMP80Graph;
  assert.equal(graph.vertices_coords.length,3*s);assert.equal(graph.edges_vertices.length,3*n+4);assert.equal(graph.faces_vertices!.length,2);
  graph.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>near(x,expected.vertices_coords[i][k])));
  for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_faces'] as const)assert.deepEqual(graph[key],expected[key]);
  assert.deepEqual(m.edgeSegmentIds,c.independentSourceEdgeSegmentIds);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  own(d).sourceFrames.forEach((row:any,i:number)=>{
   assert.equal(row.u,c.machineSourceFrames[i].u);
   for(const key of ['base','leftDirector','rightDirector'])row[key].forEach((x:number,k:number)=>near(x,c.machineSourceFrames[i][key][k]));
   for(const [index,key,w]of [[s,'leftDirector',c.recipe.leftWidth],[2*s,'rightDirector',c.recipe.rightWidth]] as const)
    assert.deepEqual(graph.vertices_coords[index+i],row.base.map((x:number,k:number)=>x+w*row[key][k]));
  });
  assert.equal(own(d).source.initialParameter,0);assert.equal(own(d).source.currentStartReseeded,false);assert.equal(own(d).source.sourceRole.includes('not a native HTTP'),true);
  assert.equal(own(d).topology.interiorRulingSeams,0);assert.equal(own(d).finitePaperProof.validationCells,2*n);assert.equal(own(d).finitePaperProof.validationTriangles,4*n);
  assert.equal(own(d).finitePaperProof.nonconvexCells,0);assert.equal(own(d).finitePaperProof.nonincidentPairs,c.independentFiniteSummary.nonincidentPartitionPairs);
  assert.equal(own(d).finitePaperProof.sharedVertexPairs,c.independentFiniteSummary.sharedVertexPairs);assert.equal(own(d).finitePaperProof.partitionEdges,c.independentFiniteSummary.partitionEdges);
  own(d).finitePaperProof.signedFaceAreas.forEach((x:number,i:number)=>near(x,c.independentFiniteSummary.faceAreasBinary64[i]));
  assert.ok(own(d).finitePaperProof.minimumTriangleCross>0);assert.equal(own(d).finitePaperProof.validationDiagonalsAreCPEdges,false);
  assert.equal(d.segments.filter(s=>s.assignment==='B').length,2*n+4);assert.equal(d.segments.filter(s=>s.assignment==='U').length,n);
  assert.ok(d.segments.every(s=>s.angle===(s.assignment==='U'?null:0)));assert.ok(own(d).paperDomain.leftJacobianLowerBound>0);
  assert.equal(uniformHelixCP3951SourceMatches(d),true);assert.deepEqual(readUniformHelixCP3951Recipe(d),c.recipe);
  assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);assert.equal(Object.hasOwn(d,'flatFold'),false);
  for(const key of ['flatFold','layerOrder','threeDimensionalInitialCondition','isometryTo3D','continuousMotion','collisionFree'])assert.equal(own(d).evidence[key],false);
 });
 test(c.name+' actual JSON/FOLD and ordinary DXF preserve raw millimetres, source and indexed two-face material',()=>{
  const d=generate(c),before=JSON.stringify(d);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
   assert.equal(uniformHelixCP3951SourceMatches(reopened),true);assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened),JSON.parse(JSON.stringify(own(d))));assert.deepEqual(reopened.metadata!.materialTopology,d.metadata!.materialTopology);}
  const text=exportDXF(d).text,pairs=text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.ok(text.includes('AC1009'));assert.ok(text.includes('1 drawing unit = 1 mm'));assert.equal(lines.length,d.segments.length);
  lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(line['10']),Number(line['20']),Number(line['11']),Number(line['21'])],
   [s.a[0],-s.a[1],s.b[0],-s.b[1]].map(x=>Object.is(x,-0)?0:x));});assert.equal(JSON.stringify(d),before);
 });
}
test('saved original example retains both unit widths, while an absolute crop does not acquire the nonuniform current-start seed',()=>{
 assert.deepEqual(UNIFORM_HELIX_CP_3951_EXAMPLE,{parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100});
 const d=generate();assert.deepEqual(own(d).sourceFrames[0].base,[1,0]);assert.equal(own(d).paperDomain.widthsAreOriginalDefaults,true);
 const cropped=generate(f.cases.find((c:any)=>c.recipe.parameterStart===.2));assert.notDeepEqual(own(cropped).sourceFrames[0].base,[1,0]);
 assert.equal(own(cropped).source.initialParameter,0);assert.equal(own(cropped).source.currentStartReseeded,false);
 const standalone=uniformHelixCP3951Document({...UNIFORM_HELIX_CP_3951_EXAMPLE,parameterStart:.2,parameterEnd:2.8,segments:32});
 assert.deepEqual(own(cropped).sourceFrames.map((f:any)=>f.base),own(standalone).sourceFrames.map((f:any)=>f.base));
});
test('strict recipe refuses source-family mixing, implicit values, malformed types, original-domain overflow and finite budgets without clamp',()=>{
 const r=UNIFORM_HELIX_CP_3951_EXAMPLE;
 for(const bad of [{...r,leftWidth:0},{...r,rightWidth:1.00001},{...r,parameterStart:-.01},{...r,parameterEnd:Math.PI+.01},
  {...r,parameterEnd:.09},{...r,segments:15},{...r,segments:129},{...r,segments:16.2},{...r,leftWidth:'1'},
  {...r,radius:1},{...r,foldAngleDeg:90},{...r,paperBoundaryMode:'original-apex'},[r],null])assert.throws(()=>uniformHelixCP3951Document(bad));
 for(const key of Object.keys(r)){const bad:any={...r};delete bad[key];assert.throws(()=>validateUniformHelixCP3951Recipe(bad));}
 for(const value of [NaN,Infinity,-Infinity,true,null,undefined])assert.throws(()=>uniformHelixCP3951Document({...r,leftWidth:value}));
});
test('current Doc structure and raw material/source binding are validated before any reconstruction, with no silent repair',()=>{
 const d=generate(),mutations:((x:any)=>void)[]=[
  x=>x.segments[0].a.push(0),x=>x.segments[0].a=null,x=>x.segments[0].b[0]=NaN,x=>x.segments[0].id=x.segments[1].id,
  x=>x.segments[0].assignment='M',x=>x.segments[0].angle=90,x=>x.paper.width=String(x.paper.width),x=>x.paper.height=NaN,x=>x.paper.extra=1,
  x=>x.metadata.materialTopology.graph.vertices_coords[0][0]+=1e-10,x=>x.metadata.materialTopology.edgeSegmentIds.reverse(),
  x=>x.metadata.materialTopology.foldedVertices=x.metadata.materialTopology.graph.vertices_coords,x=>x.metadata.materialTopology.startingFace=0,
  x=>x.flatFold={startingFace:0},x=>own(x).recipe.leftWidth=.5,x=>own(x).recipe.radius=1,
  x=>own(x).source.initialParameter=.2,x=>own(x).source.initialPoint=[0,0],x=>own(x).source.currentStartReseeded=true,
  x=>own(x).source.theta='30. Degree',x=>own(x).source.gamma='pi/3+u/3',x=>own(x).source.originalGraphicsWidths=[.5,.5],
  x=>own(x).source.coordinateTransform='scale100',x=>own(x).source.rightDirectorReversed=true,x=>own(x).source.wolframInterpolationReproduced=true,
  x=>own(x).sourceFrames[0].base[0]+=1e-10,x=>own(x).sourceFrames[1].leftDirector[0]+=1e-10,x=>own(x).sourceFrames[0].base.push(0),
  x=>own(x).sourceFrames[1].u+=1e-14,x=>own(x).analyticConstants.leftFocalDistance=0,
  x=>own(x).finitePaperProof.minimumTriangleCross=0,x=>own(x).finitePaperProof.signedFaceAreas[0]=0,x=>own(x).finitePaperProof.validationCells=201,
  x=>own(x).numericalPolicy.maximumUnitDirectorResidual=-1e-20,x=>own(x).numericalPolicy.knownDerivedAbsoluteBoundMm=1e-8,
  x=>own(x).evidence.isometryTo3D=true,x=>own(x).evidence.flatFold=true];
 for(const change of mutations){const bad=clone(d);change(bad);const before=JSON.stringify(bad);assert.equal(uniformHelixCP3951SourceMatches(bad),false);assert.equal(JSON.stringify(bad),before);}
 assert.equal(uniformHelixCP3951SourceMatches(d),true);d.name='用户工程名';d.metadata!.note={user:true};assert.equal(uniformHelixCP3951SourceMatches(d),true);
});
test('only known derived source fields admit small machine rounding, while parameters, identities and numeric policy remain exact',()=>{
 const d=generate(),rounded=clone(d);own(rounded).sourceFrames[1].base[0]+=Number.EPSILON;own(rounded).finitePaperProof.minimumTriangleCross+=1e-16;
 assert.equal(uniformHelixCP3951SourceMatches(rounded),true);
 own(rounded).sourceFrames[1].base[0]+=2e-13;assert.equal(uniformHelixCP3951SourceMatches(rounded),false);
 const parameters=clone(d);own(parameters).recipe.parameterEnd-=1e-14;assert.equal(uniformHelixCP3951SourceMatches(parameters),false);
 const zero=clone(d);own(zero).finitePaperProof.signedFaceAreas[0]=-0;assert.equal(uniformHelixCP3951SourceMatches(zero),false);
});
test('component preview has no HTTP path, rebuilds widths with frozen source isolation, and adoption produces an editable guarded whole clone',()=>{
 const r=UNIFORM_HELIX_CP_3951_EXAMPLE,build=prepareUniformHelixCP3951Preview(r),a=build(r),b=build({...r,leftWidth:.5,rightWidth:.8});
 assert.equal(Object.isFrozen(own(a).sourceFrames),true);assert.equal(Object.isFrozen(own(a).sourceFrames[0].base),true);
 assert.equal(own(a).sourceFrames,own(b).sourceFrames);assert.notDeepEqual(a.segments,b.segments);assert.deepEqual(build(r),a);
 assert.equal(uniformHelixCP3951SourceMatches(b),true);assert.throws(()=>build({...r,parameterStart:.2}));assert.throws(()=>build({...r,leftWidth:0}));
 const adopted=clone(b);assert.equal(Object.isFrozen(own(adopted).sourceFrames),false);assert.equal(uniformHelixCP3951SourceMatches(adopted),true);
 own(adopted).sourceFrames[0].base[0]+=1e-10;assert.equal(uniformHelixCP3951SourceMatches(adopted),false);assert.equal(uniformHelixCP3951SourceMatches(a),true);
});
test('finite straight-chord material is not claimed isometric to the continuous spatial helix',()=>{
 const c=f.cases[1],d=generate(c),s=c.recipe.segments+1,graph=(d.metadata!.materialTopology as any).graph,spatial=c.machineSourceFrames,
  distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const flat=distance(graph.vertices_coords[0],graph.vertices_coords[s-1]),space=distance(spatial[0].foldedSourceBase,spatial.at(-1).foldedSourceBase);
 assert.ok(Math.abs(flat-space)>1e-4);assert.equal(own(d).evidence.sourceConstantGammaIsFiniteEdgeAngle,false);assert.equal(own(d).evidence.isometryTo3D,false);
});
test('real material assignment edits remain JSON/FOLD saveable, then explicit source rebuilding restores U/null',()=>{
 const d=generate(f.cases[1]),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
 const id=d.segments[0].id,intent={kind:'material-line-properties' as const,segmentIds:[id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},
  changed=buildMaterialLineProperties(d,intent),hand=prepareEditorCommit(d,changed.doc,intent).doc;
 assert.equal(uniformHelixCP3951SourceMatches(hand),false);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(hand,format).text,format).doc;
  assert.equal(reopened.segments.find(s=>s.id===id)!.assignment,'M');assert.equal(uniformHelixCP3951SourceMatches(reopened),false);}
 const restored=uniformHelixCP3951Document(readUniformHelixCP3951Recipe(hand));assert.equal(restored.segments[0].assignment,'U');assert.equal(restored.segments[0].angle,null);assert.equal(uniformHelixCP3951SourceMatches(restored),true);
});
test('ordinary path optimizer/export retains the complete actual two-face source graph and millimetre coverage',()=>{
 const d=generate(f.cases[1]),plan=optimizeCPPaths(d),result=exportCPProcessingDXF(d,plan),report=verifyCPProcessingExport(result.text,'dxf',d,plan);
 assert.equal(report.verified,true);assert.equal(plan.analysis.included.length,d.segments.length);assert.equal(report.processedEdgeCount,d.segments.length);assert.equal(uniformHelixCP3951SourceMatches(d),true);
});

test('zero-start original source frame has exact (1,0) identity, not a derived rounding allowance',()=>{
 const d=generate();
 for(const shift of [1e-14,Number.EPSILON]){const bad=clone(d);own(bad).sourceFrames[0].base[0]+=shift;
  assert.equal(uniformHelixCP3951SourceMatches(bad),false);}
 for(const shift of [1e-14,Number.MIN_VALUE]){const bad=clone(d);own(bad).sourceFrames[0].base[1]=shift;
  assert.equal(uniformHelixCP3951SourceMatches(bad),false);}
 const equivalent=clone(d);own(equivalent).sourceFrames[0].base[1]=-0;assert.equal(uniformHelixCP3951SourceMatches(equivalent),true);
 const crop=generate(f.cases.find((c:any)=>c.recipe.parameterStart===.2));own(crop).sourceFrames[0].base[0]+=Number.EPSILON;
 assert.equal(uniformHelixCP3951SourceMatches(crop),true);
});
