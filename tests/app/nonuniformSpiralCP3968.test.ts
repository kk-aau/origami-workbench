import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NONUNIFORM_SPIRAL_CP_3968_EXAMPLE,nonuniformSpiralCP3968Document,nonuniformSpiralCP3968Query,nonuniformSpiralCP3968SourceMatches,
 readNonuniformSpiralCP3968Recipe,validateNonuniformSpiralCP3968Recipe,prepareNonuniformSpiralCP3968Source,prepareNonuniformSpiralCP3968Preview,nonuniformSpiralCP3968MaximumLeftWidth} from '../../src/app/nonuniformSpiralCP3968';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const f=JSON.parse(fs.readFileSync(new URL('../fixtures/nonuniform-spiral-cp-3968-20261011.json',import.meta.url),'utf8')),
 clone=<T>(x:T):T=>structuredClone(x),native=(c:any)=>f.nativeInputs[c.nativeIndex].native,
 own=(d:any)=>d.metadata.originalNonuniformSpiral3968,generate=(c=f.cases[0])=>nonuniformSpiralCP3968Document(c.recipe,native(c));
test('Dialog preview validates every actual finite paper and isolates a deeply frozen source across all ten native cases',()=>{
 for(const c of f.cases){
  const input=clone(native(c)),before=JSON.stringify(input),build=prepareNonuniformSpiralCP3968Preview(c.recipe,input),preview=build(c.recipe),expected=generate(c);
  assert.deepEqual(preview,expected);assert.equal(JSON.stringify(input),before);
  const frozen=(x:any):boolean=>!x||typeof x!=='object'||Object.isFrozen(x)&&Object.values(x).every(frozen);
  assert.ok(frozen(own(preview).nativeSource));assert.throws(()=>{own(preview).nativeSource.sample.rows[0].s=999;});
  input.sample.rows[0].s=999;assert.equal(nonuniformSpiralCP3968SourceMatches(preview),true);
  assert.deepEqual(build(c.recipe),expected);assert.throws(()=>build({...c.recipe,segments:c.recipe.segments===16?17:16}));
  assert.throws(()=>build({...c.recipe,leftWidth:0}));assert.deepEqual(build(c.recipe),expected);
 }
});
test('preview adoption whole-clones to an editable Doc and the uncached public guard refuses subsequent real edits',()=>{
 const c=f.cases[0],preview=prepareNonuniformSpiralCP3968Preview(c.recipe,native(c))(c.recipe),adopted=clone(preview),publicDoc=generate(c);
 assert.equal(Object.isFrozen(own(adopted).nativeSource),false);assert.equal(Object.isFrozen(own(publicDoc).nativeSource),false);
 adopted.name='用户修改工程名';assert.equal(nonuniformSpiralCP3968SourceMatches(adopted),true);
 own(adopted).nativeSource.sample.rows[0].s=1e-10;assert.equal(nonuniformSpiralCP3968SourceMatches(adopted),false);
 assert.equal(nonuniformSpiralCP3968SourceMatches(preview),true);
 const hand=clone(preview);hand.segments[0].assignment='M';hand.segments[0].angle=null;
 assert.equal(nonuniformSpiralCP3968SourceMatches(hand),false);assert.deepEqual(own(preview).nativeSource,own(publicDoc).nativeSource);
});
for(const c of f.cases){
 test(c.name+' actual full native reference produces two paper faces with source identities, strict finite partition and null angles',()=>{
  assert.deepEqual(nonuniformSpiralCP3968Query(c.recipe),f.nativeInputs[c.nativeIndex].query);
  const d=generate(c),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
  const n=c.recipe.segments,s=n+1;assert.equal(m.graph.vertices_coords.length,3*s);assert.equal(m.graph.edges_vertices.length,3*n+4);assert.equal(m.graph.faces_vertices!.length,2);
  assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(d.segments.filter(s=>s.assignment==='B').length,2*n+4);
  assert.equal(d.segments.filter(s=>s.assignment==='U').length,n);assert.ok(d.segments.every(s=>s.angle===(s.assignment==='U'?null:0)));
  assert.equal(own(d).topology.interiorRulingSeams,0);assert.equal(own(d).finitePaperProof.validationCells,2*n);assert.equal(own(d).finitePaperProof.validationTriangles,4*n);
  assert.ok(own(d).finitePaperProof.minimumTriangleCross>0);assert.equal(own(d).finitePaperProof.validationDiagonalsAreCPEdges,false);
  for(let i=0;i<s;i++){const row=native(c).flattening.result.sample.rows[i];assert.deepEqual(m.graph.vertices_coords[i],row.targetBase);
   for(const [index,side,w]of [[s,'Left',c.recipe.leftWidth],[2*s,'Right',c.recipe.rightWidth]] as const)
    assert.deepEqual(m.graph.vertices_coords[index+i],row.targetBase.map((x:number,k:number)=>x+w*row['target'+side+'Director'][k]));}
  assert.equal(nonuniformSpiralCP3968SourceMatches(d),true);assert.deepEqual(readNonuniformSpiralCP3968Recipe(d),c.recipe);
  assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);assert.equal(Object.hasOwn(d,'flatFold'),false);
  assert.equal(own(d).nativeSource.certification.adoptableCreasePattern,false);assert.equal(own(d).source.wolframInterpolationReproduced,false);
  assert.equal(own(d).evidence.flatFold,false);assert.equal(own(d).evidence.isometryTo3D,false);
 });
 test(c.name+' actual JSON/FOLD imports and ordinary DXF keep raw millimetres and full material/source graph',()=>{
  const d=generate(c),before=JSON.stringify(d);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
   assert.equal(nonuniformSpiralCP3968SourceMatches(reopened),true,format);assert.deepEqual(reopened.segments,d.segments);
   assert.deepEqual(own(reopened),own(d));assert.deepEqual(reopened.metadata!.materialTopology,d.metadata!.materialTopology);}
  const text=exportDXF(d).text,pairs=text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.ok(text.includes('AC1009'));assert.ok(text.includes('1 drawing unit = 1 mm'));assert.equal(lines.length,d.segments.length);
  lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(line['10']),Number(line['20']),Number(line['11']),Number(line['21'])],
   [s.a[0],-s.a[1],s.b[0],-s.b[1]].map(x=>Object.is(x,-0)?0:x));});assert.equal(JSON.stringify(d),before);
 });
}
test('wide positive simple concave cell is triangulated without adding a CP seam; late original unit widths keep actual source regularity',()=>{
 const wide=generate(f.cases.find((c:any)=>c.name==='wide-concave16')),late=generate(f.cases.find((c:any)=>c.name==='late-unit16'));
 assert.ok(own(wide).finitePaperProof.nonconvexCells>0);assert.equal(wide.segments.length,52);
 assert.equal(own(late).paperDomain.role,'source-unit-width-on-selected-domain');assert.equal(own(late).nativeSource.flattening.result.domain.formalStripRegularity.left.status,'verified');
 assert.equal(own(generate()).nativeSource.flattening.result.domain.formalStripRegularity.left.status,'degenerate');
});
test('strict five inputs, dynamic source focal limit and finite budget reject rather than clamp',()=>{
 for(const patch of [{parameterStart:-1e-15},{parameterEnd:Math.PI+1e-15},{parameterEnd:.09},{parameterStart:2.2,parameterEnd:2.3},
  {leftWidth:0},{leftWidth:1},{leftWidth:1.01},{rightWidth:0},{rightWidth:1.01},{segments:15},{segments:129},{segments:16.5},{segments:'100'},
  {parameterStart:null},{paper:undefined},{extra:1}])assert.throws(()=>validateNonuniformSpiralCP3968Recipe({...NONUNIFORM_SPIRAL_CP_3968_EXAMPLE,...patch}));
 assert.ok(nonuniformSpiralCP3968MaximumLeftWidth(0)>.7);assert.equal(nonuniformSpiralCP3968MaximumLeftWidth(2.6),1);
 assert.throws(()=>validateNonuniformSpiralCP3968Recipe({...NONUNIFORM_SPIRAL_CP_3968_EXAMPLE,leftWidth:nonuniformSpiralCP3968MaximumLeftWidth(0)+1e-12}));
});
test('public constructor binds native world values, exact source inputs, finite nonnegative diagnostics and complete interval coverage',()=>{
 const c=f.cases[1],n=native(c),before=JSON.stringify(n),mutations:((v:any)=>void)[]=[
  v=>v.query.radius=1.01,v=>v.query.transverseEnd=.5,v=>v.source.interpolationReproduced=true,
  v=>v.sample.rows[1].sourceBase[0]+=1e-10,v=>v.flattening.result.sample.rows[1].targetBase[0]+=1e-10,
  v=>v.flattening.result.sample.rows[1].targetRightDirector[0]*=-1,v=>v.normalization.targetOrigin[0]+=1e-15,
  v=>v.flattening.initial.point[1]=Number.MIN_VALUE,v=>v.domain.cells[0].start+=1e-14,v=>v.domain.evaluations+=2,
  v=>v.flattening.result.domain.cells[0].start+=1e-14,v=>v.flattening.result.domain.cells.reverse(),
  v=>v.diagnostics.maximumUnitRulingResidual=-1e-15,v=>v.diagnostics.maximumRelativeDevelopabilityResidual=1e-10,
  v=>v.flattening.result.diagnostics.maximumFrameResidual=-1e-15,v=>v.flattening.result.diagnostics.sharedGeodesicCurvature.maximumRelativeResidual=NaN,
 ];
 for(const edit of mutations){const changed=clone(n);edit(changed);assert.throws(()=>nonuniformSpiralCP3968Document(c.recipe,changed));}
 assert.equal(JSON.stringify(n),before);
});
test('actual Doc validation precedes reconstruction: identity, dimensions, numbers, topology, source and certificate mutations are refused without repair',()=>{
 const d=generate(f.cases[1]),before=JSON.stringify(d),mutations:((v:any)=>void)[]=[
  v=>v.segments[0].a[0]+=1e-10,v=>v.segments[0].a.push(0),v=>v.segments[0].a[1]=null,v=>v.segments[0].b[1]='0',v=>v.segments[0].b[0]=NaN,
  v=>v.segments[0].id='fake',v=>v.segments[0].assignment='M',v=>v.segments[0].angle=0,v=>v.segments.pop(),v=>v.paper.width+=1e-10,v=>v.paper.height=String(v.paper.height),v=>v.paper.extra=1,
  v=>v.metadata.materialTopology.graph.vertices_coords[0][1]=Number.MIN_VALUE,v=>v.metadata.materialTopology.graph.faces_vertices[0].reverse(),
  v=>v.metadata.materialTopology.graph.edges_assignment[0]='V',v=>v.metadata.materialTopology.foldedVertices=clone(v.metadata.materialTopology.graph.vertices_coords),v=>v.flatFold={},
  v=>own(v).recipe.leftWidth=.4,v=>own(v).source.originalGraphicsWidths[0]=.5,v=>own(v).source.gamma='pi/3',v=>own(v).paperDomain.leftFocusMarginMm=0,
  v=>own(v).finitePaperProof.validationCells++,v=>own(v).finitePaperProof.minimumTriangleCross=-1e-15,v=>own(v).evidence.isometryTo3D=true,
  v=>own(v).nativeSource.flattening.result.sample.rows[1].targetBase[0]+=1e-10,v=>own(v).nativeSource.domain.cells[0].leftDenominatorLowerBound+=.001,
  v=>own(v).nativeSource.diagnostics.maximumUnitRulingResidual=5e-14,v=>own(v).nativeSnapshot.identity='fnv1a32:00000000',
 ];
 for(const edit of mutations){const changed=clone(d);edit(changed);const actor=JSON.stringify(changed);assert.equal(nonuniformSpiralCP3968SourceMatches(changed),false);assert.equal(JSON.stringify(changed),actor);}
 const renamed=clone(d);renamed.name='用户纸域';renamed.notes='保原毫米';assert.equal(nonuniformSpiralCP3968SourceMatches(renamed),true);assert.equal(JSON.stringify(d),before);
});
test('component-owned verified source factory changes widths without changing or refetching native; public guard rechecks each resulting Doc',()=>{
 const c=f.cases[1],raw=clone(native(c)),before=JSON.stringify(raw),build=prepareNonuniformSpiralCP3968Source(c.recipe,raw);
 raw.query.radius=2;const a=build({...c.recipe,leftWidth:.4}),b=build({...c.recipe,leftWidth:.41}),restored=build({...c.recipe,leftWidth:.4});
 assert.notDeepEqual(a.metadata!.materialTopology,b.metadata!.materialTopology);assert.deepEqual(a,restored);
 assert.ok(nonuniformSpiralCP3968SourceMatches(a)&&nonuniformSpiralCP3968SourceMatches(b));assert.throws(()=>build({...c.recipe,segments:17}));
 assert.equal(JSON.stringify(native(c)),before);
});
test('true hand material edit remains saveable and preserves source recipe, then explicit source rebuilding restores U/null',()=>{
 const d=generate(f.cases[1]),intent={kind:'material-line-properties' as const,segmentIds:[d.segments[0].id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},
  changed=buildMaterialLineProperties(d,intent),edited=prepareEditorCommit(d,changed.doc,intent).doc;
 assert.equal(edited.segments[0].assignment,'M');assert.equal(nonuniformSpiralCP3968SourceMatches(edited),false);assert.deepEqual(readNonuniformSpiralCP3968Recipe(edited),f.cases[1].recipe);
 for(const format of ['json','fold'] as const){const r=importDocument(exportDocument(edited,format).text,format).doc;assert.equal(r.segments[0].assignment,'M');assert.equal(nonuniformSpiralCP3968SourceMatches(r),false);}
 const restored=nonuniformSpiralCP3968Document(readNonuniformSpiralCP3968Recipe(edited),own(edited).nativeSource);assert.equal(restored.segments[0].assignment,'U');assert.equal(restored.segments[0].angle,null);assert.equal(nonuniformSpiralCP3968SourceMatches(restored),true);
});
test('ordinary processing optimizer and export keep complete source coverage and exact serialized millimetres',()=>{
 const d=generate(f.cases[1]),plan=optimizeCPPaths(d);assert.equal(plan.analysis.included.length,d.segments.length);
 const text=exportCPProcessingDXF(d,plan).text,report=verifyCPProcessingExport(text,'dxf',d,plan);assert.equal(report.verified,true);assert.equal(report.processedEdgeCount,d.segments.length);
});
