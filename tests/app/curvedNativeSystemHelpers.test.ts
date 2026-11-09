import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SYSTEM_HELPERS_NATIVE_PRESETS,makeGenericSystemHelpersReference,parseGenericSystemHelpersResult,validateGenericSystemHelpersQuery} from '../../src/app/curvedNativeSystemHelpers';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-system-helpers-native-20261001.json','utf8'));
const fixture=(name:string)=>fixtures.find((x:{name:string})=>x.name===name),copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('default dense Darboux samples allow cancellation roundoff using source derivative scales',()=>{
 const r=JSON.parse(fs.readFileSync('tests/fixtures/curved-system-helpers-darboux-dense32.json','utf8'));
 assert.equal(r.query.segments,32);assert.doesNotThrow(()=>parseGenericSystemHelpersResult(r,r.query));
 for(const [group,key] of [['rules','NormalCurvature3D'],['coefficients','normalCurvature']]){
  const forged=copy(r);forged.sample.rows[19][group][key]=1e-4;
  assert.throws(()=>parseGenericSystemHelpersResult(forged,r.query));
 }
});
test('all seven literal ordered-rule/list contracts independently replay noncircular and raw-frame fixtures',()=>{
 for(const f of fixtures)assert.doesNotThrow(()=>parseGenericSystemHelpersResult(f.response,f.query),f.name);
 assert.equal(fixture('recover-darboux').response.source.outputKind,'ordered-list');
 const f=fixture('recover-darboux-no-extra-speed'),r=makeGenericSystemHelpersReference(f.query,[0,1]).row(1);
 assert.ok(Math.abs(r.curve[0]-2*Math.sin(1))<1e-10);assert.ok(Math.abs((r.rules.T as number[])[0]-Math.cos(1))<1e-10);
});
test('query safety, dimensional contract, unnormalized vectors and unknown field rejection',()=>{
 for(const q of Object.values(SYSTEM_HELPERS_NATIVE_PRESETS))assert.deepEqual(validateGenericSystemHelpersQuery(q),q);
 for(const [mode,key,value] of [['curve2','curve',['s']],['curve3','curve',['s.__class__','0','0']],['recover3','initialTangent',[NaN,0,0]],['recover2','initialParameter',2],['ruled-normal','sigma',0],['curve2','segments',7],['curve2','extra',0]] as const)
  assert.throws(()=>validateGenericSystemHelpersQuery({...SYSTEM_HELPERS_NATIVE_PRESETS[mode],[key]:value}));
 assert.doesNotThrow(()=>validateGenericSystemHelpersQuery(fixture('recover-darboux-zero-frame').query));
 const reversed=Object.fromEntries(Object.entries(SYSTEM_HELPERS_NATIVE_PRESETS.recover3).reverse());assert.deepEqual(validateGenericSystemHelpersQuery(reversed),SYSTEM_HELPERS_NATIVE_PRESETS.recover3);
});
test('null undefined Frenet rules are preserved separately from meaningful curve/speed and raw zero normal',()=>{
 for(const name of ['curve2-stationary','curve3-straight','curve3-stationary','darboux-zero-speed','ruled-zero-area']){const f=fixture(name);assert.equal(f.response.certification.finiteSystemFullyDefined,false);assert.doesNotThrow(()=>parseGenericSystemHelpersResult(f.response,f.query));}
 const f=fixture('curve3-straight'),r=copy(f.response);r.sample.rows[2].rules.NormalVector3D=[0,1,0];assert.throws(()=>parseGenericSystemHelpersResult(r,f.query));
 const zero=fixture('darboux-zero-normal');assert.equal(zero.response.certification.finiteSystemFullyDefined,true);assert.equal(zero.response.certification.formalFrameOrthonormalCertified,false);
});
test('every original rule, derivative, coefficient and compensated tiny geometry is bound to source',()=>{
 for(const name of ['curve2','curve3','darboux-raw-double','recover2-raw-circle','recover3-raw-frame','recover-darboux-incompatible-skew-frame']){const f=fixture(name),row=f.response.sample.rows[3];
  for(const group of ['rules','derivatives','coefficients'])for(const key of Object.keys(row[group])){if(row[group][key]===null)continue;const r=copy(f.response),v=r.sample.rows[3][group][key];if(Array.isArray(v))v[0]+=.01;else r.sample.rows[3][group][key]+=.01;assert.throws(()=>parseGenericSystemHelpersResult(r,f.query),`${name}/${group}/${key}`);}}
 const f=fixture('curve3-tiny-translated'),r=copy(f.response);r.sample.rows[3].normalizedCurve[0]=0;assert.throws(()=>parseGenericSystemHelpersResult(r,f.query));
 const tiny=copy(f.response);tiny.sample.rows[3].curveDerivative[0]*=1.1;assert.throws(()=>parseGenericSystemHelpersResult(tiny,f.query));
});
test('two-parameter raw ruling mesh, sigma, independent normals and areas cannot be forged',()=>{
 const f=fixture('ruled-nonconstant-director');for(const key of ['points','normalizedPoints','normals','areaSquared']){const r=copy(f.response);if(Array.isArray(r.grid[3][key][2]))r.grid[3][key][2][0]+=.01;else r.grid[3][key][2]+=.01;assert.throws(()=>parseGenericSystemHelpersResult(r,f.query),key);}
 const r=copy(f.response);r.sample.rows[2].transverseParameter=.1;assert.throws(()=>parseGenericSystemHelpersResult(r,f.query));
 const zero=fixture('ruled-zero-area'),z=copy(zero.response);z.grid[2].normals[1]=[0,0,1];assert.throws(()=>parseGenericSystemHelpersResult(z,zero.query));
});
test('domain cover, integration provenance, raw initials and certificate scope reject promotions',()=>{
 const f=fixture('recover3-interior-ui');for(const edit of [(r:any)=>{r.initial.frame[1][1]=2;},(r:any)=>{r.initial.frameCompatible=false;},(r:any)=>{r.domain.cells[0].end-=.001;},(r:any)=>{r.domain.cells[0].coefficientBounds[0]=[8,9];},(r:any)=>{r.source.ruleOrder.reverse();},(r:any)=>{r.source.darbouxCoefficientConvention='extra ds';},(r:any)=>{r.diagnostics.integration.backwardEvaluations=0;},(r:any)=>{r.certification.integrationErrorIntervalCertified=true;},(r:any)=>{r.certification.adoptableCreasePattern=true;}]){const r=copy(f.response);edit(r);assert.throws(()=>parseGenericSystemHelpersResult(r,f.query));}
 const unknown=fixture('curve3-source-unknown-domain');assert.equal(unknown.response.domain.certified,false);const r=copy(unknown.response);r.certification.sourceDefinitionCertified=true;assert.throws(()=>parseGenericSystemHelpersResult(r,unknown.query));
});
