import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {UNIFORM_HELIX_EXTENDED_CP_3951_EXAMPLE as r,evaluateUniformHelixExtendedCP3951Source as source,uniformHelixExtendedCP3951Document as build,uniformHelixExtendedCP3951SourceMatches as matches,readUniformHelixExtendedCP3951Recipe as read,prepareUniformHelixExtendedCP3951Preview as preview,UniformHelixExtendedCP3951Error as ErrorClass} from '../../src/app/uniformHelixExtendedCP3951';
import {uniformHelixGeneralCP3951Document as oldBuild,readUniformHelixGeneralCP3951Recipe as oldRead,uniformHelixGeneralCP3951SourceMatches as oldMatches} from '../../src/app/uniformHelixGeneralCP3951';
import {inspectMaterialTopology} from '../../src/core/materialTopology';import {exportDocument,importDocument} from '../../src/core/formats';import {exportDXF} from '../../src/core/dxf';import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/uniform-helix-extended-cp-3951-20261011.json',import.meta.url),'utf8')),own=(d:any)=>d.metadata.originalUniformHelixExtended3951,clone=<T>(x:T):T=>structuredClone(x),code=(s:string)=>(e:unknown)=>e instanceof ErrorClass&&e.code===s;
for(const c of fixture.cases)test(c.name+' signed literal/explicit-limit frames and finite graph match BEFORE-producer MP80',()=>{
 const a=source(c.recipe);assert.equal(a.classification.originalPlaneLiteralDefined,c.classification.literalPlaneDefined);assert.equal(a.classification.explicitAnalyticContinuation,c.classification.analyticContinuation);assert.equal(a.classification.originalDerivationAssumptionsSatisfied,c.classification.assumptions);assert.equal(a.constants.faceOrientation,c.classification.orientation);
 a.frames.forEach((f,i)=>{const g=c.sourceFrames80[i],near=(x:number,y:string,budget:number)=>assert.ok(Math.abs(x-Number(y))<=budget,`${c.name}/${i} ${x} vs ${y}`);
  near(f.u,g.u80,2e-15*Math.max(1,Math.abs(f.u)));near(f.phase,g.phase80,Math.max(f.phaseErrorEstimate*2,1e-30));
  f.base.forEach((x,k)=>near(x,g.point80[k],Math.min(2e-12*Math.max(1,Math.abs(x)),Math.max(f.worldErrorEstimateMm*2,1e-14))));f.basePrime.forEach((x,k)=>near(x,g.prime80[k],Math.max(f.derivativeErrorEstimateMm[k]*2,4e-14*Math.max(1,Math.abs(x)))));
  for(const [v,w] of [[f.leftDirector,g.left80],[f.rightDirector,g.right80],[f.spatialLeftDirector,g.spatial80.left],[f.spatialRightDirector,g.spatial80.right]] as [number[],string[]][])v.forEach((x,k)=>near(x,w[k],1e-13));f.spatialBase.forEach((x,k)=>near(x,g.spatial80.point[k],4e-14*Math.max(1,Math.abs(x))));
 });
 if(!c.expectedFinitePassed){assert.throws(()=>build(c.recipe),code('PAPER_DOMAIN'));return;}
 const d=build(c.recipe),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;assert.equal(m.graph.vertices_coords.length,3*(c.recipe.segments+1));assert.equal(d.segments.length,3*c.recipe.segments+4);assert.equal(m.graph.faces_vertices!.length,2);assert.equal(own(d).finitePaperProof.nonconvexCells,c.independentProof.nonconvexCells);assert.deepEqual(m.graph.faces_vertices,c.graph.faces_vertices);
 m.graph.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>assert.ok(Math.abs(x-c.graph.vertices_coords[i][k])<2e-12*Math.max(1,Math.abs(x)))));assert.ok(matches(d));assert.deepEqual(read(d),c.recipe);assert.equal(d.segments.filter(s=>s.assignment==='U'&&s.angle===null).length,c.recipe.segments);assert.equal(own(d).source.currentStartReseeded,false);assert.equal(own(d).evidence.finiteRigid3D,false);assert.equal(own(d).source.rawAnglesPreserved,true);
 if(c.name.includes('extreme-radius-narrow')){assert.equal(a.constants.signedCircleRadiusRepresentedMm,null);assert.ok(own(d).sampling.idealCreaseChordBoundMm>0);}
});
test('original Γ0/2π literal vs radical-undefined and oddπ new continuation remain distinct',()=>{
 for(const gamma of [0,360,-360]){const s=source({...r,foldAngleDeg:gamma});assert.equal(s.classification.originalPlaneLiteralDefined,true);assert.equal(s.classification.paperTransverseDegenerate,true);assert.throws(()=>build({...r,foldAngleDeg:gamma}),code('PAPER_DOMAIN'));assert.throws(()=>source({...r,helicityAngleDeg:0,foldAngleDeg:gamma}),code('SOURCE_INPUT'));}
 for(const theta of [90,-90,450])assert.throws(()=>source({...r,helicityAngleDeg:theta}),code('SOURCE_INPUT'));
 for(const gamma of [180,-180,540]){const d=build({...r,foldAngleDeg:gamma,segments:16});assert.equal(own(d).classification.originalPlaneLiteralDefined,false);assert.equal(own(d).classification.originalSpatialLiteralDefined,true);assert.equal(own(d).classification.explicitAnalyticContinuation,true);assert.ok(own(d).sourceFrames.every((f:any)=>f.phase===0&&f.base[0]===1));}
});
test('absolute-zero crop keeps raw periodic parameters and source0 literals wherever sampled',()=>{
 const d=build({...r,parameterStart:-.5,parameterEnd:.5,segments:16}),frames=own(d).sourceFrames;assert.notDeepEqual(frames[0].base,[1,0]);assert.equal(frames[8].u,0);assert.deepEqual(frames[8].base,[1,0]);assert.deepEqual(frames[8].spatialBase,[r.radius,0,0]);assert.ok(matches(d));
 for(const mutate of [(x:any)=>own(x).sourceFrames[8].base[0]+=Number.EPSILON,(x:any)=>own(x).sourceFrames[8].basePrime[0]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[8].spatialBase[1]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[8].spatialPrime[1]+=Number.EPSILON,(x:any)=>x.metadata.materialTopology.graph.vertices_coords[8][0]+=Number.EPSILON]){const bad=clone(d);mutate(bad);assert.equal(matches(bad),false);}
});
test('oddπ constant straight-limit identities cannot be forged at later nodes',()=>{
 const d=build({...r,foldAngleDeg:180,parameterStart:2.6,parameterEnd:Math.PI,segments:16});for(const mutate of [(x:any)=>own(x).sourceFrames[7].phase=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[7].base[0]+=Number.EPSILON,(x:any)=>own(x).sourceFrames[7].basePrime[0]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[7].spatialLeftDirector[0]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[7].spatialRightDirector[1]=-Number.MIN_VALUE,(x:any)=>own(x).classification.originalPlaneLiteralDefined=true]){const bad=clone(d);mutate(bad);assert.equal(matches(bad),false);}
 assert.ok(matches(d));assert.notEqual(own(d).sourceFrames[0].base[1],0);
});
test('actual graph metrics and source norm are recomputed; metadata modifications do not repair themselves',()=>{
 const d=build({...r,segments:16}),changes=[(x:any)=>own(x).finitePaperProof.minimumTriangleCross+=Number.EPSILON,(x:any)=>own(x).actualSourceUnitResidual+=Number.EPSILON,(x:any)=>own(x).recipe.foldAngleDeg=90,(x:any)=>own(x).recipe.helicityAngleDeg=390,(x:any)=>own(x).numericalPolicy.worldReplayULPBoundMm*=2,(x:any)=>x.segments[0].assignment='M',(x:any)=>x.flatFold={startingFace:0}];for(const f of changes){const bad=clone(d);f(bad);const before=JSON.stringify(bad);assert.equal(matches(bad),false);assert.equal(JSON.stringify(bad),before);}
});
test('v2 JSON/FOLD/process DXF retain all original U/null source edges and two actual faces',()=>{
 const d=build({...r,foldAngleDeg:300,radius:.8,rightWidth:.76,segments:16});for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(d,format).text,format).doc;assert.ok(matches(loaded));assert.deepEqual(loaded.segments,d.segments);}assert.ok(exportDXF(d).text.includes('AC1009'));const plan=optimizeCPPaths(d),out=exportCPProcessingDXF(d,plan);assert.equal(verifyCPProcessingExport(out.text,'dxf',d,plan).verified,true);assert.equal(plan.analysis.included.length,d.segments.length);
});
test('new private schema does not modify/migrate P64 v1; cached width source identity is fixed',()=>{
 const old=oldBuild({...r,foldAngleDeg:90,segments:16}),next=build({...r,foldAngleDeg:90,segments:16});assert.equal(read(old),null);assert.equal(oldRead(next),null);assert.ok(oldMatches(old));assert.ok(matches(next));
 const p=preview({...r,segments:16}),a=p.build({...r,segments:16}),b=p.build({...r,segments:16,rightWidth:.5});assert.equal(own(a).sourceFrames,own(b).sourceFrames);assert.ok(Object.isFrozen(p.source.frames));assert.throws(()=>p.build({...r,segments:16,helicityAngleDeg:390}));assert.ok(matches(b));
});
test('numerical representability/phase limits and existing material interface remain separate from original input legality',()=>{
 assert.throws(()=>source({...r,radius:Number.MAX_VALUE}),code('NUMERIC_SOURCE'));assert.throws(()=>source({...r,parameterStart:1e15,parameterEnd:1e15+4}),code('NUMERIC_SOURCE'));
 assert.ok(source({...r,radius:1e6}).frames.length);assert.throws(()=>build({...r,radius:1e6}),code('MATERIAL_INTERFACE'));assert.ok(source({...r,parameterStart:1e7,parameterEnd:1e7+.3,segments:16}).frames.length);
});
