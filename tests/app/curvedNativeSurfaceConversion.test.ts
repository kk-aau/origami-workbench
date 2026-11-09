import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GENERIC_SURFACE_TO_CONE_PRESET,GENERIC_SURFACE_TO_CYLINDER_PRESET,validateGenericSurfaceConversionQuery,makeGenericSurfaceConversionAlgebra,makeGenericSurfaceConversionReference,
 parseGenericSurfaceConversionResult,fetchGenericSurfaceConversionWhenIdle,type GenericSurfaceConversionQuery,type GenericSurfaceConversionResult} from '../../src/app/curvedNativeSurfaceConversion';
const names=['cone-raw','cone-normalized','cylinder-raw','cylinder-symbolic','cone-sign-cross-raw','cone-sign-cross-symbolic','cone-zero-sign-raw','cone-zero-sign-symbolic',
 'cone-interior','cone-nonlinear','cylinder-nonlinear','cone-tiny-raw','cone-tiny-normalized','cylinder-tiny','cylinder-raw-nonunit','cylinder-near-unit','cylinder-zero-director','cone-apex','cone-incompatible','cone-unknown','cone-variable-director','cylinder-variable-director'];
const fixture=(name:string):GenericSurfaceConversionResult=>JSON.parse(readFileSync(`tests/fixtures/origamica-fold-surface-generic-${name}.json`,'utf8'));
const near=(a:number,b:number,natural=Math.max(Math.abs(a),Math.abs(b)))=>assert.ok(Math.abs(a-b)<=2e-9*Math.max(natural,Number.MIN_VALUE),`${a} != ${b}`);
const reject=(name:string,change:(r:GenericSurfaceConversionResult)=>void)=>{const r=fixture(name);change(r);assert.throws(()=>parseGenericSurfaceConversionResult(r,r.query),/回读/);};
test('ten editable sources and raw cylinder coordinates retain original dimensional contract without ui or unit replacement',()=>{
 const q=validateGenericSurfaceConversionQuery({...GENERIC_SURFACE_TO_CYLINDER_PRESET,flatDirector:[0,2],spaceDirector:[0,0,0]});assert.deepEqual((q as any).flatDirector,[0,2]);assert.deepEqual((q as any).spaceDirector,[0,0,0]);
 assert.throws(()=>validateGenericSurfaceConversionQuery({...q,initialParameter:0}));assert.throws(()=>validateGenericSurfaceConversionQuery({...q,sourceSpaceBase:['s','0']}));
 assert.throws(()=>validateGenericSurfaceConversionQuery({...q,sourceFlatBase:['import(s)','0']}));assert.throws(()=>validateGenericSurfaceConversionQuery({...q,literalMode:'normalized-repair'}));
});
test('cone original fraction, fixed numerical sign and unnormalized radius differ from the normalized symbolic formula',()=>{
 const raw=makeGenericSurfaceConversionAlgebra(GENERIC_SURFACE_TO_CONE_PRESET),symbolic=makeGenericSurfaceConversionAlgebra({...GENERIC_SURFACE_TO_CONE_PRESET,literalMode:'normalized-symbolic'}),a=raw.evaluate(0),b=symbolic.evaluate(0);
 near(a.v.c[0],1.5);assert.equal(raw.initialPsi,1);near(a.flatDirector![1].c[0],.5);near(a.spaceDirector![1].c[0],-.5);near(b.flatDirector![1].c[0],1);near(b.spaceDirector![1].c[0],-1);
 for(const s of [0,.2,.8,1])assert.equal(raw.evaluate(s).psi,raw.initialPsi);
});
test('original free-s symbolic Sign changes branch, retaining literal zero but undefined derivative rather than a zero-jet substitute',()=>{
 const symbolic=fixture('cone-sign-cross-symbolic'),raw=fixture('cone-sign-cross-raw'),a=makeGenericSurfaceConversionAlgebra(symbolic.query),b=makeGenericSurfaceConversionAlgebra(raw.query);
 assert.deepEqual([a.evaluate(0).psi,a.evaluate(1).psi,a.evaluate(2).psi],[1,0,-1]);assert.ok(a.evaluate(1).flatDirector!.every(x=>x.c[0]===0));assert.equal(a.evaluate(1).derivativeDefined,false);
 assert.equal(a.evaluate(1).flatDirectorDerivative,null);for(const s of [0,1,2])assert.equal(b.evaluate(s).psi,1);
 parseGenericSurfaceConversionResult(symbolic);const zero=symbolic.sample.rows.find(r=>r.s===1)!;assert.equal(zero.targetJetsDefined,false);assert.equal(zero.targetSpace.directorDerivative,null);
 assert.equal(symbolic.grid.find(r=>r.s===1)!.targetSpace.EFG,null);assert.equal(symbolic.diagnostics.maximumTargetPairRelativeMetricDifference,null);assert.equal(symbolic.certification.finiteTargetPairMetricVerified,false);
});
test('constant original zero sign and truly nonzero tiny sign are classified without similarity rounding or epsilon replacement',()=>{
 const q=fixture('cone-zero-sign-raw').query;
 for(const [delta,expected]of [[0,0],[1e-12,-1],[-1e-12,1]]){const a=makeGenericSurfaceConversionAlgebra({...q,spaceApex:[9,4+delta,0]}),r=a.evaluate(.3);assert.equal(a.initialPsi,expected);
  if(!delta){assert.ok(r.flatDirector!.every(x=>x.c[0]===0));assert.ok(r.spaceDirectorDerivative!.every(x=>x===0));}else assert.ok(Math.hypot(...r.spaceDirector!.map(x=>x.c[0]))>4);}
 for(const name of ['cone-zero-sign-raw','cone-zero-sign-symbolic']){const r=parseGenericSurfaceConversionResult(fixture(name));assert.equal(r.domain.signBranch.status,'constant-zero');assert.equal(r.certification.formalTargetPairMetricCertified,false);assert.equal(r.domain.strips.targetSpace.status,'degenerate');}
});
test('globally constant safe AST identity is independently proved while literal undefined poles still remain undefined',()=>{
 const q=fixture('cone-zero-sign-symbolic').query,ref=makeGenericSurfaceConversionReference({...q,sourceFlatBase:['s-s','sin(s)**2+cos(s)**2-1']});assert.equal(ref.symbolicZeroSignAnalytic,true);
 assert.equal(ref.evaluate(.4).targetJetsDefined,true);assert.ok(ref.evaluate(.4).targetFlat.directorPrime!.every(x=>x===0));
 assert.throws(()=>makeGenericSurfaceConversionReference({...q,sourceFlatBase:['(s-s)/(s-s)','0']}));
});
test('raw cylinder projection omits any division by squared director norm and its original zero direction remains zero',()=>{
 const r=fixture('cylinder-raw-nonunit'),ref=makeGenericSurfaceConversionReference(r.query);assert.equal(ref.initialUnitCompatible,false);
 if(r.query.family!=='surface-to-cylinder-generic-native')assert.fail();const d=r.query.flatDirector,L=ref.normalization.scale;
 for(const row of r.sample.rows){const p=ref.evaluate(row.s),coefficient=p.foldFlat.reduce((sum,x,i)=>sum+x*d[i],0);p.targetFlat.base.forEach((x,i)=>near(x,p.foldFlat[i]-coefficient*d[i],Math.hypot(...p.foldFlat)));p.targetFlat.director.forEach((x,i)=>near(x*L,d[i]));}
 const z=parseGenericSurfaceConversionResult(fixture('cylinder-zero-director'));assert.ok(z.sample.rows.every(row=>row.targetFlat.director.every(x=>x===0)));assert.equal(z.certification.formalTargetPairMetricCertified,false);
});
test('twenty-two final source fixtures replay all four stage jets, physical and normalized positions, published domain cells and own-scale EFG',()=>{
 for(const name of names){const r=fixture(name);assert.equal(parseGenericSurfaceConversionResult(r,r.query),r);assert.equal(r.sample.rows.length,r.query.segments+1);
  assert.equal(r.certification.adoptableCreasePattern,false);assert.equal(r.certification.exactStraightCreaseFOLD,false);assert.equal(r.sample.rows.at(-1)!.s,r.query.parameterEnd);}
});
test('interior initial seed, nonlinear parameters and nonconstant source director amplitude survive literally rather than arclength or circle substitution',()=>{
 const interior=fixture('cone-interior');parseGenericSurfaceConversionResult(interior);assert.equal((interior.initial as any).parameter,(interior.query as any).initialParameter);
 for(const name of ['cone-nonlinear','cylinder-nonlinear','cone-variable-director','cylinder-variable-director']){const r=parseGenericSurfaceConversionResult(fixture(name));assert.equal(r.certification.sourcePairMetricAnalytic,true);assert.equal(r.certification.finiteTargetPairMetricVerified,true);}
 const r=fixture('cone-variable-director');assert.notEqual(Math.hypot(...r.sample.rows[0].sourceSpace.director),Math.hypot(...r.sample.rows.at(-1)!.sourceSpace.director));
});
test('original apex and unresolved interval budget remain truthful without changing paper domain or promoting finite sampling to whole-domain certification',()=>{
 const apex=parseGenericSurfaceConversionResult(fixture('cone-apex'));assert.ok(apex.query.transverseStart<=0&&apex.query.transverseEnd>=0);assert.equal(apex.domain.strips.targetFlat.status,'degenerate');
 const r=parseGenericSurfaceConversionResult(fixture('cone-unknown'));assert.equal(r.domain.evaluations,1024);assert.equal(r.domain.certified,false);assert.equal(r.certification.formalTargetPairMetricCertified,false);assert.ok(r.domain.unresolved.length>0);
 const incompatible=parseGenericSurfaceConversionResult(fixture('cone-incompatible'));assert.equal(incompatible.certification.sourcePairMetricAnalytic,false);assert.equal(incompatible.certification.formalTargetPairMetricCertified,false);
});
test('source binding, exact original convention, initial sign and interval bounds reject plausible substituted results',()=>{
 assert.throws(()=>parseGenericSurfaceConversionResult(fixture('cone-raw'),{...GENERIC_SURFACE_TO_CONE_PRESET,initialParameter:.2}),/回读/);
 reject('cone-raw',r=>{r.source.signConvention='fixed corrected symbolic sign';});reject('cone-raw',r=>{(r.initial as any).branchSignAtInitial=-1;});
 reject('cone-raw',r=>{r.domain.cells[0].offsetParameterBounds=[99,100];});reject('cone-unknown',r=>{r.certification.sourceDefinitionCertified=true;});
 reject('cone-raw',r=>{r.sample.rows[2].targetFlat.normalizedDirector[0]+=.01;});reject('cylinder-raw',r=>{r.grid[3].targetFlat.normalizedPoints[0][0]+=.1;});
 reject('cylinder-near-unit',r=>{(r.initial as any).unitDirectorCompatibilityTolerance=1e-10;});
});
test('tiny E F G use natural component scales and null or exactly zero geometry cannot be silently manufactured',()=>{
 reject('cone-tiny-raw',r=>{r.grid[0].sourceFlat.EFG![0][2]*=1.01;});reject('cone-tiny-normalized',r=>{r.grid[0].targetSpace.EFG![0][2]*=1.01;});
 reject('cylinder-tiny',r=>{r.grid[0].sourceSpace.EFG![0][0]*=1.01;});reject('cone-zero-sign-raw',r=>{r.grid[0].targetSpace.EFG![0][2]=1e-25;});
 reject('cone-sign-cross-symbolic',r=>{const row=r.sample.rows.find(x=>!x.targetJetsDefined)!;row.targetSpace.directorDerivative=[0,0,0];row.targetSpace.normalizedDirectorDerivative=[0,0,0];});
 reject('cone-sign-cross-symbolic',r=>{r.grid.find(x=>x.targetSpace.EFG===null)!.targetSpace.EFG=[[0,0,0]];});
});
test('busy authorized API retries preserve ten source and original formula choice, and cancellation prevents a stale request',async()=>{
 const original=globalThis.fetch,r=fixture('cone-sign-cross-symbolic');let calls=0;globalThis.fetch=async(_input,options)=>{calls++;assert.deepEqual(JSON.parse(String(options?.body)),r.query);
  assert.match(String(_input),/curved-surface-to-cone-generic/);assert.equal((options?.headers as Record<string,string>)['Content-Type'],'application/json');assert.ok(Object.hasOwn(options!.headers!,'X-Zhezhi-Token'));
  return new Response(JSON.stringify(calls===1?{error:'已有镶嵌计算正在进行'}:r),{status:calls===1?409:200,headers:{'content-type':'application/json'}});};
 try{assert.deepEqual((await fetchGenericSurfaceConversionWhenIdle(r.query)).query,r.query);assert.equal(calls,2);const controller=new AbortController();controller.abort();await assert.rejects(()=>fetchGenericSurfaceConversionWhenIdle(r.query,controller.signal));assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
