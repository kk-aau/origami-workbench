import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MIN_TOTAL_METHOD,minTotalPleatPreset,minTotalPleatSourceMatches} from '../../src/app/reciprocalMinTotalPleat';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTess,canAdoptTessWithTileLayers} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/min-total-pleat-20261010.json',import.meta.url),'utf8'));
const read=(value:any)=>{const p=readTessParams(value);assert.ok(p);return p;};

test('native method is explicit and bound to finite custom mother plus initial duals',()=>{
 const preset=minTotalPleatPreset();assert.deepEqual(read(preset),preset);
 assert.equal(preset.family,'primal-dual');assert.equal((preset as any).reciprocalMethod,MIN_TOTAL_METHOD);
 for(const value of [undefined,null,true,'MinTotalPleat','max-min'])assert.equal(readTessParams({...preset,reciprocalMethod:value}),null);
 for(const change of [{family:'periodic'},{dualTargets:undefined},{dualTargets:null},{postRotation:'primal'},{dualEdgeFlips:[]},
  {paper:{shape:'square',margin:.1}},{motherParams:{...(preset as any).motherParams,repeatX:2}},
  {motherParams:{...(preset as any).motherParams,lattice:[[1,0],[0,1]]}}])assert.equal(readTessParams({...preset,...change}),null);
 for(const row of fixture.legacyCases)assert.equal('reciprocalMethod' in read(row.params),false);
});

test('actual responses independently pass feasibility, dual-optimality, unique rank and RMS source checks',()=>{
 for(const row of fixture.cases){
  const p=read(row.params),r=row.response;
  assert.equal(minTotalPleatSourceMatches(r.source,p,r.mother,r.dual),true,row.name);
  const prepared=prepareTessResult(r,p);
  assert.equal(canAdoptTess(prepared,false,tessConstructionKey(p),p),true);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,tessConstructionKey(p),p,'not_checked'),false);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,tessConstructionKey(p),p,'solved'),true);
 }
});

test('forged LP or fit source, current inputs, pairing order or returned dual cannot adopt',()=>{
 const row=fixture.cases[0],p=read(row.params);
 const edits:[string,(r:any)=>void][]=[
  ['missing proof',r=>delete r.source.reciprocalMinTotalPleat],['unknown field',r=>r.source.reciprocalMinTotalPleat.hidden=true],
  ['source sign',r=>r.source.reciprocalMinTotalPleat.inputSigns[0]*=-1],
  ['source pair order',r=>r.source.reciprocalMinTotalPleat.input.interiorEdges.reverse()],
  ['fractional pair index',r=>r.source.reciprocalMinTotalPleat.input.interiorEdges[0][0]+=.001],
  ['source input geometry',r=>r.source.reciprocalMinTotalPleat.input.vertices[0][0]+=.1],
  ['normalized geometry',r=>r.source.reciprocalMinTotalPleat.normalizedDualVertices[1][0]+=.1],
  ['normalized width',r=>r.source.reciprocalMinTotalPleat.normalizedPleatLengths[0]+=.1],
  ['objective',r=>r.source.reciprocalMinTotalPleat.totalNormalizedPleat+=.1],
  ['dual certificate',r=>r.source.reciprocalMinTotalPleat.certificate.widthMultipliers[0]+=1],
  ['false uniqueness',r=>r.source.reciprocalMinTotalPleat.certificate.uniqueRank--],
  ['unknown certificate field',r=>r.source.reciprocalMinTotalPleat.certificate.hidden=true],
  ['scale',r=>r.source.reciprocalMinTotalPleat.fit.scale+=.1],['offset',r=>r.source.reciprocalMinTotalPleat.fit.translation[0]+=.1],
  ['fit residual',r=>r.source.reciprocalMinTotalPleat.fit.squaredDeviation+=.1],
  ['returned dual',r=>r.dual.vertices_coords[0][0]+=.1],['dual pair order',r=>r.dual.edges_vertices.reverse()],
  ['mother face order',r=>r.mother.faces_vertices.reverse()],['mother vertex',r=>r.mother.vertices_coords[0][0]+=.1],
  ['mother edges order',r=>r.mother.edges_vertices.reverse()],['mother boundary assignment',r=>r.mother.edges_assignment[0]='B'],
  ['Wolfram claim',r=>r.source.reciprocalMinTotalPleat.wolframExecuted=true],
 ];
 for(const key of Object.keys(row.response.source.reciprocalMinTotalPleat))edits.push(['missing '+key,r=>delete r.source.reciprocalMinTotalPleat[key]]);
 for(const [name,edit] of edits){
  const r=structuredClone(row.response);edit(r);
  assert.equal(minTotalPleatSourceMatches(r.source,p,r.mother,r.dual),false,name);
  assert.equal(canAdoptTess({...r,doc:{}} as any,false,tessConstructionKey(p),p),false,name);
 }
 const changed=structuredClone(p) as any;changed.dualTargets[0][0]+=.1;
 assert.equal(minTotalPleatSourceMatches(row.response.source,changed,row.response.mother,row.response.dual),false);
 const changedMother=structuredClone(p) as any;changedMother.motherParams.vertices[0][0]+=.1;
 assert.equal(minTotalPleatSourceMatches(row.response.source,changedMother,row.response.mother,row.response.dual),false);
});

test('real global layer refusal and solved ordinary adoption both remain enforced',()=>{
 for(const row of fixture.cases){
  const p=read(row.params),result=prepareTessResult(row.response,p),input=tessFlatInput(result,result.doc,'min-total-pleat-test',true);
  const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  assert.equal(flat.geometry.status,'ready',row.name);
  const expected=row.name==='three-face-source-method'?'no-solution':'solved';
  assert.equal(flat.layers.status,expected,row.name+': '+flat.layers.message);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,flat.layers.status),expected==='solved',row.name);
 }
});
