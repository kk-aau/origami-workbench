import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NONUNIFORM_HELIX_GENERAL_CP_3966_EXAMPLE as r,evaluateNonuniformHelixGeneralCP3966Source,nonuniformHelixGeneralCP3966Document,validateNonuniformHelixGeneralCP3966Recipe,readNonuniformHelixGeneralCP3966Recipe,nonuniformHelixGeneralCP3966SourceMatches,prepareNonuniformHelixGeneralCP3966Preview,NonuniformHelixGeneralCP3966Error,compileNonuniformHelixGamma} from '../../src/app/nonuniformHelixGeneralCP3966';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/nonuniform-helix-general-cp-3966-20261011.json',import.meta.url),'utf8')),own=(d:any)=>d.metadata.originalNonuniformHelixGeneral3966,clone=<T>(x:T):T=>structuredClone(x),code=(s:string)=>(e:unknown)=>e instanceof NonuniformHelixGeneralCP3966Error&&e.code===s;
for(const c of fixture.cases)test(c.name+' matches independently frozen MP80 source and finite fixture',()=>{
 const source=evaluateNonuniformHelixGeneralCP3966Source(c.recipe);assert.equal(source.numericalPolicy.intervalCertified,false);assert.equal(source.frames.length,c.recipe.segments+1);
 source.frames.forEach((a,i)=>{const b=c.sourceTraces80[i],near=(x:number,y:string,budget:number)=>assert.ok(Math.abs(x-Number(y))<=budget,`${c.name}[${i}] ${x} vs ${y}`);
  near(a.u,b.u80,2e-15*Math.max(1,Math.abs(a.u)));if(b.gamma80!==undefined)near(a.gamma,b.gamma80,1e-13);if(b.gammaPrime80!==undefined)near(a.gammaFirst,b.gammaPrime80,2e-13);if(b.gammaSecond80!==undefined)near(a.gammaSecond,b.gammaSecond80,3e-12);
  a.base.forEach((x,k)=>near(x,(b.worldPoint80??b.point80)[k],Math.min(source.numericalPolicy.maximumWorldErrorEstimateMm,2e-12*Math.max(1,Math.abs(x)))));
  if(b.unitLeft80)for(const [v,w] of [[a.leftDirector,b.unitLeft80],[a.rightDirector,b.unitRight80],[a.spatialLeftDirector,b.space80.left],[a.spatialRightDirector,b.space80.right]] as [number[],string[]][])v.forEach((x,k)=>near(x,w[k],1e-13));
  if(b.space80)a.spatialBase.forEach((x,k)=>near(x,b.space80.base[k],2e-14*Math.max(1,Math.abs(x))));
  if(b.prime80)a.basePrime.forEach((x,k)=>near(x,b.prime80[k],2e-14*Math.max(1,Math.abs(x))));
 });
 if(!c.expectedFinitePassed){assert.throws(()=>nonuniformHelixGeneralCP3966Document(c.recipe),code(c.name.includes('right-focus')?'PAPER_DOMAIN':'FINITE_GEOMETRY'));return;}
 const d=nonuniformHelixGeneralCP3966Document(c.recipe),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;
 assert.equal(m.graph.vertices_coords.length,3*(c.recipe.segments+1));assert.equal(d.segments.length,3*c.recipe.segments+4);assert.equal(m.graph.faces_vertices!.length,2);assert.equal(own(d).finitePaperProof.nonconvexCells,c.expectedNonconvexCells);
 m.graph.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>assert.ok(Math.abs(x-c.graph.vertices_coords[i][k])<=2e-12*Math.max(1,Math.abs(x)))));
 assert.ok(nonuniformHelixGeneralCP3966SourceMatches(d));assert.deepEqual(readNonuniformHelixGeneralCP3966Recipe(d),c.recipe);assert.deepEqual(own(d).sourceFrames[0].base,[1,0]);assert.equal(own(d).source.currentStartReseeded,true);
 assert.equal(own(d).source.affineEndpointsSubstituted,false);assert.equal(own(d).source.originalMVSpecified,false);assert.equal(own(d).evidence.finiteRigid3D,false);assert.equal(own(d).paperDomain.continuousGlobalInjectivityCertified,false);
 assert.equal(d.segments.filter(x=>x.assignment==='U'&&x.angle===null).length,c.recipe.segments);assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);
 source.frames.forEach(f=>{for(const v of [0,c.recipe.leftWidth])assert.ok(source.constants.speed*f.leftTransverse-v*f.leftAngularRate>=own(d).paperDomain.leftJacobianLowerEngineering-1e-13);for(const v of [0,c.recipe.rightWidth])assert.ok(-source.constants.speed*f.rightTransverse-v*f.rightAngularRate<=own(d).paperDomain.rightJacobianUpperEngineering+1e-13);});
});
test('safe grammar computes actual derivatives without arbitrary code execution or an affine family restriction',()=>{
 const g=compileNonuniformHelixGamma({kind:'expression',expression:'Pi/2+Sin[u]/10+u^2/20'}),v=g.evaluate(.3);assert.ok(Math.abs(v.first-(Math.cos(.3)/10+.03))<1e-15);assert.ok(Math.abs(v.second-(-Math.sin(.3)/10+.1))<1e-15);
 for(const expression of ['globalThis.process.exit()','u.constructor','(()=>1)()','sin(u,1)','u**0.5','u**9','foo(u)','alert(1)','1;2','[1,2]','1e309'])assert.throws(()=>compileNonuniformHelixGamma({kind:'expression',expression}));
 assert.equal(compileNonuniformHelixGamma({kind:'expression',expression:'1e308*u+pi/2'}).evaluate(0).first,1e308);
});
test('recipe preserves general real inputs and reports capability separately without clamping',()=>{
 for(const k of Object.keys(r)){const bad:any={...r};delete bad[k];assert.throws(()=>validateNonuniformHelixGeneralCP3966Recipe(bad));}
 for(const bad of [{...r,radius:0},{...r,radius:NaN},{...r,extra:1},{...r,parameterEnd:0},{...r,leftWidth:0},{...r,rightWidth:1.01},{...r,segments:129}])assert.throws(()=>validateNonuniformHelixGeneralCP3966Recipe(bad));
 assert.equal(validateNonuniformHelixGeneralCP3966Recipe({...r,radius:1e308,parameterEnd:1e-308,helicityAngleDeg:0}).radius,1e308);assert.equal(validateNonuniformHelixGeneralCP3966Recipe({...r,leftWidth:1e-9,parameterStart:-1}).leftWidth,1e-9);
 assert.throws(()=>evaluateNonuniformHelixGeneralCP3966Source({...r,helicityAngleDeg:90}),code('SOURCE_INPUT'));assert.throws(()=>evaluateNonuniformHelixGeneralCP3966Source({...r,radius:Number.MAX_VALUE}),code('NUMERIC_SOURCE'));
 assert.throws(()=>evaluateNonuniformHelixGeneralCP3966Source({...r,parameterStart:1e15,parameterEnd:1e15+4}),code('NUMERIC_SOURCE'));
 const small={...r,radius:.1};assert.ok(evaluateNonuniformHelixGeneralCP3966Source(small).frames.length);assert.throws(()=>nonuniformHelixGeneralCP3966Document(small),code('PAPER_DOMAIN'));
 const large={...r,radius:1e6};assert.ok(evaluateNonuniformHelixGeneralCP3966Source(large).frames.length);assert.throws(()=>nonuniformHelixGeneralCP3966Document(large),code('MATERIAL_INTERFACE'));
});
test('pi is regular; positive half-sine can cross pi, while zero half-sine is reported honestly',()=>{
 const flat=evaluateNonuniformHelixGeneralCP3966Source({...r,gammaFunction:{kind:'expression',expression:'pi'}});assert.ok(flat.frames.every(f=>f.base[0]===1&&f.deltaPhase===0));
 const singular={...r,gammaFunction:{kind:'expression' as const,expression:'2*pi'}},src=evaluateNonuniformHelixGeneralCP3966Source(singular);assert.equal(src.flattening.status,'source-singularity');assert.equal(src.frames.length,0);assert.throws(()=>nonuniformHelixGeneralCP3966Document(singular),code('PAPER_DOMAIN'));
 for(const expression of ['0','-2*pi','-4*pi','-1'])assert.throws(()=>evaluateNonuniformHelixGeneralCP3966Source({...r,gammaFunction:{kind:'expression',expression}}),code('SOURCE_INPUT'));
 assert.equal(evaluateNonuniformHelixGeneralCP3966Source({...r,gammaFunction:{kind:'expression',expression:'4*pi'}}).flattening.status,'source-singularity');
});
test('negative and offset u use current-start seed; gamma end is never stretched to saved final angle',()=>{
 const p={...r,parameterStart:.1,parameterEnd:2.9,segments:16},s=evaluateNonuniformHelixGeneralCP3966Source(p);assert.deepEqual(s.frames[0].base,[1,0]);assert.deepEqual(s.frames[0].tangent,[0,1]);assert.equal(s.frames.at(-1)!.gamma,Math.PI/3+2.9/3);assert.notEqual(s.frames.at(-1)!.gamma,2*Math.PI/3);
 const cropped=evaluateNonuniformHelixGeneralCP3966Source({...p,parameterStart:.2});assert.deepEqual(cropped.frames[0].base,[1,0]);assert.notDeepEqual(cropped.frames[1].base,s.frames[1].base);
});
test('natural cubic point input is explicitly local C2 and refuses reordering, extrapolation and false Wolfram equivalence',()=>{
 const c=fixture.cases.find((c:any)=>c.name==='natural-cubic-negative-crop'),d=nonuniformHelixGeneralCP3966Document(c.recipe);assert.equal(own(d).source.wolframInterpolatingFunctionEquivalent,false);
 const g=compileNonuniformHelixGamma(c.recipe.gammaFunction),left=g.evaluate(-1e-8),right=g.evaluate(1e-8);assert.ok(Math.abs(left.second-right.second)<1e-7);assert.ok(Math.abs(left.first-right.first)<1e-7);
 assert.throws(()=>g.evaluate(.31));assert.throws(()=>compileNonuniformHelixGamma({kind:'natural-cubic-points',points:[[0,1],[0,2]]}));assert.throws(()=>compileNonuniformHelixGamma({kind:'natural-cubic-points',points:[[1,1],[0,2]]}));
});
test('JSON/FOLD and ordinary/processing DXF retain raw source and all actual indexed edges',()=>{
 const d=nonuniformHelixGeneralCP3966Document({...r,segments:16}),before=JSON.stringify(d);
 for(const f of ['json','fold'] as const){const a=importDocument(exportDocument(d,f).text,f).doc;assert.deepEqual(a.segments,d.segments);assert.ok(nonuniformHelixGeneralCP3966SourceMatches(a));}
 assert.ok(exportDXF(d).text.includes('AC1009'));const plan=optimizeCPPaths(d),out=exportCPProcessingDXF(d,plan);assert.equal(verifyCPProcessingExport(out.text,'dxf',d,plan).verified,true);assert.equal(plan.analysis.included.length,d.segments.length);assert.equal(JSON.stringify(d),before);
});
test('actual hand edit is outside original U/null binding and regeneration restores it',()=>{
 const d=nonuniformHelixGeneralCP3966Document({...r,segments:16}),id=d.segments[3].id,intent={kind:'material-line-properties' as const,segmentIds:[id],operation:{kind:'assignment' as const,assignment:'M' as const},cpOnly:true},hand=prepareEditorCommit(d,buildMaterialLineProperties(d,intent).doc,intent).doc;
 assert.equal(nonuniformHelixGeneralCP3966SourceMatches(hand),false);const restored=nonuniformHelixGeneralCP3966Document(readNonuniformHelixGeneralCP3966Recipe(hand));assert.ok(nonuniformHelixGeneralCP3966SourceMatches(restored));assert.equal(restored.segments[3].angle,null);
});
test('literal source identities are strict and derived proof metrics bind actual graph bytes',()=>{
 const d=nonuniformHelixGeneralCP3966Document({...r,parameterStart:-.5,parameterEnd:.5,segments:16}),f=own(d).sourceFrames[8];assert.equal(f.u,0);
 const mutators=[(x:any)=>own(x).sourceFrames[0].base[0]+=Number.EPSILON,(x:any)=>own(x).sourceFrames[0].basePrime[0]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[0].deltaPhase=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[8].spatialBase[1]=Number.MIN_VALUE,(x:any)=>own(x).sourceFrames[8].spatialBase[0]+=Number.EPSILON,(x:any)=>own(x).sourceFrames[8].spatialPrime[0]=Number.MIN_VALUE,(x:any)=>own(x).numericalPolicy.sourceUnitResidual+=Number.EPSILON,(x:any)=>own(x).numericalPolicy.worldReplayULPBoundMm*=2,(x:any)=>own(x).finitePaperProof.minimumTriangleCross+=Number.EPSILON,(x:any)=>own(x).finitePaperProof.signedFaceAreas[0]+=Number.EPSILON,(x:any)=>own(x).source.originalMVSpecified=true,(x:any)=>own(x).recipe.gammaFunction.expression='pi/2',(x:any)=>x.metadata.materialTopology.graph.vertices_coords[0][0]+=Number.EPSILON];
 for(const mutate of mutators){const bad=clone(d);mutate(bad);const before=JSON.stringify(bad);assert.equal(nonuniformHelixGeneralCP3966SourceMatches(bad),false);assert.equal(JSON.stringify(bad),before);}
 const derived=clone(d);own(derived).sourceFrames[0].basePrime[1]+=Number.EPSILON;assert.equal(nonuniformHelixGeneralCP3966SourceMatches(derived),true);
});
test('width-only source cache remains frozen; source changes require recomputation and adoption uses an editable whole clone',()=>{
 const r16={...r,segments:16},p=prepareNonuniformHelixGeneralCP3966Preview(r16),a=p.build(r16),b=p.build({...r16,leftWidth:.4,rightWidth:.8});assert.equal(own(a).sourceFrames,own(b).sourceFrames);assert.ok(Object.isFrozen(p.source.frames));assert.ok(nonuniformHelixGeneralCP3966SourceMatches(b));assert.throws(()=>p.build({...r16,gammaFunction:{kind:'expression',expression:'pi/2'}}));
 const editable=clone(b);assert.equal(Object.isFrozen(own(editable).sourceFrames),false);assert.equal(own(editable).source.currentStartReseeded,true);
});
