import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {boundedAcross2DDocument,BOUNDED_ACROSS_EXAMPLE,boundedAcrossSourceMatches,boundedAcrossProcessingSettings,rememberBoundedAcrossAuxiliaryChoice,readBoundedAcrossRecipe} from '../../src/app/boundedAcross2DCP';
import {importDocument,exportDocument} from '../../src/core/formats';import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';import {buildFold} from '../../src/core/geometry';
import {analyzeCPPaths} from '../../src/core/cpPathOptimizer';import {processingOptions} from '../../src/app/cpProcessingSettings';import type {Doc} from '../../src/core/types';
const load=(kind:'base'|'edited',format:'json'|'fold')=>importDocument(fs.readFileSync(new URL(`../fixtures/across-real-chrome-20261010/${kind}.${format}`,import.meta.url),'utf8'),format).doc;
const source=(doc:Doc)=>doc.metadata!.originalAcross2D as any;

for(const kind of ['base','edited'] as const)for(const format of ['json','fold'] as const)test(`real Chrome ${kind}.${format} crosses Node analytic evaluation without modifying the imported document`,()=>{
 const d=load(kind,format),before=JSON.stringify(d);assert.equal(boundedAcrossSourceMatches(d),true);
 const s=boundedAcrossProcessingSettings(d);assert.equal(s.A.enabled,false);
 let a=analyzeCPPaths(d,processingOptions(s,false,false,[0,0],'independent'));assert.equal(a.included.length,52);assert.equal(a.excluded.length,30);
 assert.equal(rememberBoundedAcrossAuxiliaryChoice(d,true),true);assert.equal(boundedAcrossProcessingSettings(d).A.enabled,true);
 assert.equal(boundedAcrossProcessingSettings({...d,name:'仅改名'}).A.enabled,true);s.A.enabled=true;
 a=analyzeCPPaths(d,processingOptions(s,false,false,[0,0],'independent'));assert.equal(a.included.length,82);assert.equal(a.excluded.length,0);
 assert.equal(JSON.stringify(d),before);assert.deepEqual([buildFold(d).graph.vertices_coords.length,buildFold(d).graph.edges_vertices.length,buildFold(d).graph.faces_vertices!.length],[51,52,2]);
 for(const nextFormat of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,nextFormat).text,nextFormat).doc;
   assert.equal(boundedAcrossSourceMatches(reopened),true);assert.equal(boundedAcrossProcessingSettings(reopened).A.enabled,false);assert.deepEqual(reopened.paper,d.paper);}
 const dxf=exportDXF(d).text,lines=dxf.trimEnd().split(/\r?\n/),entities:Record<string,string>[]=[];
 for(let i=0;i<lines.length;i+=2)if(lines[i]==='0'&&lines[i+1]==='LINE'){const row:Record<string,string>={};for(i+=2;i<lines.length&&lines[i]!=='0';i+=2)row[lines[i]]=lines[i+1];i-=2;entities.push(row);}
 assert.equal(entities.length,82);entities.forEach((r,i)=>{const e=d.segments[i];assert.equal(r['8'],DXF_LAYERS[e.assignment].name);
   assert.equal(+r['10'],e.a[0]);assert.equal(+r['20'],-e.a[1]);assert.equal(+r['11'],e.b[0]);assert.equal(+r['21'],-e.b[1]);});
 assert.equal(JSON.stringify(d),before);assert.equal(readBoundedAcrossRecipe(d)!.parameters.angleSlope,kind==='base'?.5:.6);
});

test('only whitelisted computed numbers allow 1e-13 absolute roundoff, including signed proof domain checks',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),changes:Array<(s:any)=>void>=[
  s=>s.samples.frames[2].crease[0]+=5e-14,s=>s.samples.frames[2].leftRuling[1]+=5e-14,
  s=>s.samples.frames[2].rightRuling[0]+=5e-14,s=>s.samples.frames[2].u+=5e-14,s=>s.samples.frames[2].foldAngleRad+=5e-14,
  s=>s.samples.frames[2].rightTangentCoefficient+=5e-14,s=>s.samples.frames[2].rightLeftNormalCoefficient+=5e-14,
  s=>s.samples.leftBoundary[2][0]+=5e-14,s=>s.samples.rightBoundary[2][1]+=5e-14,
  s=>s.intrinsicDomain.rightSignedJacobianUpperBound+=5e-14,s=>s.topology.maximumCorePointRoundingError=5e-14];
 for(const change of changes){const x=structuredClone(d);change(source(x));assert.equal(boundedAcrossSourceMatches(x),true);}
 for(const value of [-5e-14,1.0001e-13,Infinity]){const x=structuredClone(d);source(x).topology.maximumCorePointRoundingError=value;assert.equal(boundedAcrossSourceMatches(x),false);}
 for(const value of [0,5e-14]){const x=structuredClone(d);source(x).intrinsicDomain.rightSignedJacobianUpperBound=value;assert.equal(boundedAcrossSourceMatches(x),false);}
});

test('cross-engine acceptance cannot hide changed CP, sampled geometry, or actual intrinsic proof',()=>{
 const d=load('base','json'),changes:Array<(d:Doc)=>void>=[x=>x.segments[0].a[0]+=.001,x=>x.segments.pop(),
  x=>{x.segments[0].assignment='M';x.segments[0].angle=-180;},x=>x.segments[0].angle=0,
  x=>source(x).samples.frames[2].crease[0]+=.001,x=>source(x).samples.frames[2].crease[0]+=2e-13,
  x=>source(x).samples.leftBoundary[2][1]+=.001,x=>source(x).samples.rightBoundary[2][1]+=.001,
  x=>source(x).intrinsicDomain.rightSignedJacobianUpperBound+=.001,x=>source(x).intrinsicDomain.globallyInjective=false,
  x=>source(x).evidence.flatFold=true,x=>source(x).evidence.layerOrder=true,x=>source(x).evidence.adoption='ordinary'];
 for(const change of changes){const x=structuredClone(d);change(x);assert.equal(boundedAcrossSourceMatches(x),false);assert.equal(rememberBoundedAcrossAuxiliaryChoice(x,false),false);}
});

test('parameters, source identities, indices, array/object structure, booleans and every error policy stay strict even below the float bound',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),changes:Array<(s:any)=>void>=[
  s=>s.recipe.parameters.angleSlope+=5e-14,s=>s.samples.params.angleSlope+=5e-14,s=>s.recipe.includeRulingGuides=false,
  s=>s.samples.originalNumericInterpolationPoints+=5e-14,s=>s.topology.vertices+=5e-14,s=>s.topology.components+=5e-14,
  s=>s.sampling.segments+=5e-14,s=>s.sampling.parameterStep+=5e-14,s=>s.sampling.creaseErrorUpperBound+=5e-14,
  s=>s.sampling.leftBoundaryErrorUpperBound+=5e-14,s=>s.sampling.rightBoundaryErrorUpperBound+=5e-14,
  s=>s.topology.corePointRoundingBound+=5e-14,s=>s.intrinsicDomain.derivativeBounds.deltaPrimeUpper+=5e-14,
  s=>s.intrinsicDomain.derivativeBounds.absoluteDeltaSecondUpper+=5e-14,s=>s.intrinsicDomain.derivativeBounds.rightRulingSecondNormUpper+=5e-14,
  s=>s.intrinsicDomain.leftSignedJacobianLowerBound+=5e-14,s=>s.intrinsicDomain.polarAngleRange[0]+=5e-14,
  s=>s.intrinsicDomain.leftNormalSign+=5e-14,s=>s.schema+='-forged',s=>s.source.definition+='-forged',s=>s.source.coordinateUnit='cm',
  s=>s.samples.sourceCells.reverse(),s=>s.source.coordinateTransform='translated',s=>s.evidence.flatFold=0,
  s=>s.samples.frames.pop(),s=>s.samples.frames[0].crease.push(0),s=>s.samples.frames[0].u=String(s.samples.frames[0].u),
  s=>s.samples.frames[0].u=NaN,s=>s.samples.frames[0].u=Infinity,s=>s.samples.frames[0].unknown=0,
  s=>delete s.samples.frames[0].rightTangentCoefficient,s=>s.unknown={},s=>s.samples.pairedThreeDimensionalSurface=true];
 for(const [i,change] of changes.entries()){const x=structuredClone(d);change(source(x));assert.equal(boundedAcrossSourceMatches(x),false,`mutation ${i}`);}
});

test('derived paper width/height permits an adjacent IEEE value across engines, stays bound to actual CP bbox and never rewrites the document',()=>{
 const nextUp=(value:number)=>{const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,value);v.setBigUint64(0,v.getBigUint64(0)+1n);return v.getFloat64(0);};
 for(const kind of ['base','edited'] as const)for(const format of ['json','fold'] as const){const d=load(kind,format);
  for(const key of ['width','height'] as const){const x=structuredClone(d),segments=JSON.stringify(x.segments);x.paper[key]=nextUp(x.paper[key]);const before=JSON.stringify(x);
   assert.notEqual(x.paper[key],d.paper[key]);assert.ok(x.paper[key]-d.paper[key]<1e-13);
   assert.equal(boundedAcrossSourceMatches(x),true);assert.equal(boundedAcrossProcessingSettings(x).A.enabled,false);
   assert.equal(JSON.stringify(x),before);assert.equal(JSON.stringify(x.segments),segments);
   for(const amount of [2e-13,.001]){const moved=structuredClone(d);moved.paper[key]+=amount;assert.equal(boundedAcrossSourceMatches(moved),false);}
  }
 }
 for(const patch of [{width:0},{width:-1},{height:Infinity},{width:NaN},{width:'0.5651020004355842'},{height:null},{width:undefined},{unit:'mm'}]){
  const d=load('base','json');Object.assign(d.paper,patch);assert.equal(boundedAcrossSourceMatches(d),false);}
 // Both comparisons matter: each saved dimension and CP can separately be near
 // the analytic bbox, while differing from each other by more than the bound.
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),max=Math.max(...d.segments.flatMap(s=>[s.a[0],s.b[0]]));
 for(const s of d.segments)for(const p of [s.a,s.b])if(p[0]===max)p[0]+=8e-14;
 d.paper.width-=8e-14;assert.equal(boundedAcrossSourceMatches(d),false);
});

test('old and current source recipes retain default A exclusion while genuine generic documents keep their existing default',()=>{
 for(const d of [boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),load('base','json'),load('edited','fold')]){
  assert.equal(boundedAcrossSourceMatches(d),true);assert.equal(boundedAcrossProcessingSettings(d).A.enabled,false);
  const generic={...d,metadata:{}};assert.equal(boundedAcrossSourceMatches(generic),false);assert.equal(boundedAcrossProcessingSettings(generic).A.enabled,true);
 }
});
