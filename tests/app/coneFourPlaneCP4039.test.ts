import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/cone-four-plane-cp-4039-20261011.json';
import {CONE_FOUR_PLANE_CP_4039_EXAMPLE,coneFourPlaneCP4039Document,coneFourPlaneCP4039Query,
 coneFourPlaneCP4039SourceMatches,readConeFourPlaneCP4039Recipe,validateConeFourPlaneCP4039Recipe} from '../../src/app/coneFourPlaneCP4039';
import {exportDocument,importDocument} from '../../src/core/formats';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import type {Doc} from '../../src/core/types';
const copy=<T>(x:T):T=>structuredClone(x),all=fixture as unknown as {name:string;recipe:any;query:any;response:any;legacyRecipe?:any;legacyV1Doc?:Doc}[],
 cases=all.filter(f=>f.recipe.paperBoundaryMode==='local-cut'),apexCases=all.filter(f=>f.recipe.paperBoundaryMode==='original-apex');
const make=(name='original16')=>{const f=cases.find(x=>x.name===name)!;return coneFourPlaneCP4039Document(f.recipe,f.response);};
const own=(d:Doc)=>d.metadata!.originalConeFourPlane4039 as any;
test('actual original zero-domain native responses form four bands with exact source roles',()=>{
 for(const f of cases){const d=coneFourPlaneCP4039Document(f.recipe,f.response),m=inspectMaterialTopology(d),n=f.recipe.segments;
  assert.equal(coneFourPlaneCP4039SourceMatches(d),true,f.name);assert.equal(m.ok,true);
  assert.equal(m.graph.vertices_coords.length,5*(n+1));assert.equal(d.segments.length,5*n+8);assert.equal(m.graph.faces_vertices!.length,4);
  assert.deepEqual(m.graph.faces_vertices!.map(face=>face.length),[2*n+2,2*n+2,2*n+2,2*n+2]);
  assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  const counts=Object.fromEntries(['B','M','V','U'].map(a=>[a,d.segments.filter(e=>e.assignment===a).length]));
  assert.deepEqual(counts,f.recipe.assignmentMode==='original-styles'?{B:2*n+8,M:2*n,V:n,U:0}:{B:2*n+8,M:0,V:0,U:3*n});
  assert.ok(d.segments.every(e=>e.angle===(e.assignment==='B'?0:null)));assert.deepEqual(readConeFourPlaneCP4039Recipe(d),f.recipe);
  assert.deepEqual(coneFourPlaneCP4039Query(f.recipe),f.query);assert.equal(f.query.transverseStart,0);
  assert.equal(own(d).topology.radialInternalMaterialEdges,0);assert.equal(own(d).evidence.flatFold,false);
 }
});
test('every paper point preserves actual native cuts and machine polar coordinates in millimetres',()=>{
 for(const f of cases){const d=coneFourPlaneCP4039Document(f.recipe,f.response),m=inspectMaterialTopology(d);assert.equal(m.ok,true);const g=m.graph;
  f.response.sample.rows.forEach((row:any,i:number)=>[f.recipe.innerRadius,...row.stages.slice(1).map((s:any)=>s.parameter)].forEach((v:number,c:number)=>{
   const p=g.vertices_coords[c*(f.recipe.segments+1)+i],alpha=row.s*Math.sin(Math.PI/6);
   assert.ok(Math.abs(p[0]-v*Math.cos(alpha))<=1e-14);assert.ok(Math.abs(p[1]-v*Math.sin(alpha))<=1e-14);
  }));
  assert.equal(own(d).intrinsicDomain.jacobianSign,-1);assert.ok(own(d).intrinsicDomain.jacobianAbsoluteLowerBound>0);
  assert.ok(own(d).numericalPolicy.maximumLiteralResidual>=0);assert.ok(own(d).numericalPolicy.maximumLiteralResidual<=1e-13);
 }
 const m=inspectMaterialTopology(make());assert.equal(m.ok,true);const p=m.graph.vertices_coords.at(-1)!;assert.notEqual(p[0],0,'machine endpoint must not be snapped');
});
test('default density is original display 100 with explicit local finite policy',()=>{
 assert.equal(CONE_FOUR_PLANE_CP_4039_EXAMPLE.segments,100);assert.equal(CONE_FOUR_PLANE_CP_4039_EXAMPLE.assignmentMode,'original-styles');
 const d=make('default100');assert.equal(own(d).source.originalCurveDivisionsDefault,100);assert.equal(own(d).sampling.exactContinuousCurve,false);
 assert.equal(own(d).source.originalStyleHints.rulingMeaning,'positive/negative ruling curvature, not CP edge assignment');
});
test('JSON and FOLD preserve M/V null angles, source recipe, all bands and exact point identities',()=>{
 for(const f of cases.filter(x=>['original16','edited24','localU24'].includes(x.name))){const d=coneFourPlaneCP4039Document(f.recipe,f.response);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
   assert.equal(coneFourPlaneCP4039SourceMatches(reopened),true,`${f.name}/${format}`);
   assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(readConeFourPlaneCP4039Recipe(reopened),f.recipe);
   assert.equal(Object.hasOwn(reopened,'flatFold'),false);const m=inspectMaterialTopology(reopened);assert.equal(m.ok,true);assert.equal(m.foldedVertices,undefined);
  }
 }
});
test('invalid, missing or nonnumeric recipe and excluded apex fail before construction',()=>{
 const local={...CONE_FOUR_PLANE_CP_4039_EXAMPLE,paperBoundaryMode:'local-cut',innerRadius:.5};
 for(const patch of [{innerRadius:0},{innerRadius:-1},{innerRadius:.001},{innerRadius:1.01},{segments:15},{segments:129},{segments:16.5},
  {parameterStart:-.01},{parameterEnd:Math.PI+.01},{parameterEnd:.05},{segments:'16'},{innerRadius:null},{assignmentMode:'MVM'}])
  assert.throws(()=>validateConeFourPlaneCP4039Recipe({...local,...patch}));
 assert.throws(()=>validateConeFourPlaneCP4039Recipe({...CONE_FOUR_PLANE_CP_4039_EXAMPLE,extra:true}));
});
test('default original apex is one exact source vertex, four real faces and no radial seam',()=>{
 assert.equal(CONE_FOUR_PLANE_CP_4039_EXAMPLE.paperBoundaryMode,'original-apex');assert.equal(CONE_FOUR_PLANE_CP_4039_EXAMPLE.innerRadius,0);
 for(const f of apexCases){const d=coneFourPlaneCP4039Document(f.recipe,f.response),m=inspectMaterialTopology(d),n=f.recipe.segments;
  assert.equal(m.ok,true);assert.equal(coneFourPlaneCP4039SourceMatches(d),true);const g=m.graph;
  assert.equal(g.vertices_coords.length,4*n+5);assert.equal(g.edges_vertices.length,4*n+8);assert.equal(g.faces_vertices!.length,4);
  assert.deepEqual(g.vertices_coords[0],[0,0]);assert.equal(g.vertices_coords.filter(p=>p[0]===0&&p[1]===0).length,1);
  assert.deepEqual(g.faces_vertices!.map(f=>f.length),[n+2,2*n+2,2*n+2,2*n+2]);
  assert.equal(g.faces_vertices![0].filter(v=>v===0).length,1);assert.ok(g.faces_vertices!.slice(1).every(f=>!f.includes(0)));
  assert.equal(g.edges_vertices.filter(e=>e.includes(0)).length,2);assert.ok(g.edges_vertices.every(([a,b])=>a!==b));
  assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(m.components[0].boundaryLoops[0].length,n+8);
  assert.equal(d.segments.filter(s=>s.assignment==='B').length,n+8);
  assert.equal(d.segments.filter(s=>s.assignment==='M').length,f.recipe.assignmentMode==='original-styles'?2*n:0);
  assert.equal(d.segments.filter(s=>s.assignment==='V').length,f.recipe.assignmentMode==='original-styles'?n:0);
  assert.equal(d.segments.filter(s=>s.assignment==='U').length,f.recipe.assignmentMode==='unassigned'?3*n:0);
  assert.ok(d.segments.every(s=>s.angle===(s.assignment==='B'?0:null)));
  assert.equal(own(d).topology.localPositiveTriangleValidationCells,n);assert.equal(own(d).topology.localConvexValidationCells,3*n);
  assert.equal(own(d).topology.radialInternalMaterialEdges,0);assert.equal(own(d).topology.coordinateWelding,false);
 }
});
test('apex quotient does not claim parameter-rectangle inverse uniqueness or positive whole-domain regularity',()=>{
 for(const f of apexCases){const d=coneFourPlaneCP4039Document(f.recipe,f.response),o=own(d),domain=o.intrinsicDomain;
  assert.equal(domain.jacobianAbsoluteLowerBound,0);assert.equal(domain.globallyInjective,false);
  assert.equal(domain.parameterRectangleGloballyInjective,false);assert.equal(domain.regularOnEntireParameterDomain,false);
  assert.equal(domain.quotientPaperGloballyInjective,true);assert.equal(domain.regularAwayFromApex,true);
  assert.equal(domain.apexExcluded,false);assert.equal(domain.boundarySimple,true);assert.equal(domain.finiteMaterialSheetSimplePositiveArea,true);
  assert.equal(o.source.originalApexIncludedInPaper,true);assert.equal(o.paperNative.nativeTransverseStart,0);
  assert.equal(o.sampling.curveChordErrorUpperBounds[0],0);assert.ok(o.numericalPolicy.minimumTriangleCross>1e-12);
  assert.deepEqual(o.nativeSequence,f.response);assert.deepEqual(coneFourPlaneCP4039Query(f.recipe),f.query);
  assert.equal(o.evidence.flatFold,false);assert.equal(o.evidence.layerOrder,false);assert.equal(o.evidence.finiteRigidIsometryTo3D,false);
 }
});
test('apex four native tracks retain raw machine coordinates and full source identities',()=>{
 for(const f of apexCases){const d=coneFourPlaneCP4039Document(f.recipe,f.response),m=inspectMaterialTopology(d);assert.equal(m.ok,true);
  f.response.sample.rows.forEach((row:any,i:number)=>row.stages.slice(1).forEach((stage:any,c:number)=>{
   const p=m.graph.vertices_coords[1+c*(f.recipe.segments+1)+i],alpha=row.s*Math.sin(Math.PI/6);
   assert.ok(Math.abs(p[0]-stage.parameter*Math.cos(alpha))<=1e-14);assert.ok(Math.abs(p[1]-stage.parameter*Math.sin(alpha))<=1e-14);
  }));
  assert.ok(!d.segments.some(s=>s.id.startsWith('cone4039-curve-0-')));
 }
});
test('new six-key schema rejects missing mode, cross-mode radius, unknown mode and numeric coercion',()=>{
 for(const patch of [{innerRadius:.5},{innerRadius:1e-30},{innerRadius:'0'},{paperBoundaryMode:'apex'},{paperBoundaryMode:null},
  {paperBoundaryMode:'local-cut',innerRadius:0},{paperBoundaryMode:'local-cut',innerRadius:1.1}])
  assert.throws(()=>validateConeFourPlaneCP4039Recipe({...CONE_FOUR_PLANE_CP_4039_EXAMPLE,...patch}));
 const {paperBoundaryMode:_,...missing}=CONE_FOUR_PLANE_CP_4039_EXAMPLE;assert.throws(()=>validateConeFourPlaneCP4039Recipe(missing));
 assert.throws(()=>coneFourPlaneCP4039Document(cases[0].legacyRecipe,cases[0].response),'new constructor never guesses legacy mode');
});
test('strict legacy v1 five-key local-cut records remain source-valid and reopen without migration mutation',()=>{
 for(const f of cases){const d=copy(f.legacyV1Doc!),before=JSON.stringify(d);
  assert.equal(coneFourPlaneCP4039SourceMatches(d),true);assert.equal(JSON.stringify(d),before);
  assert.deepEqual(readConeFourPlaneCP4039Recipe(d),f.recipe);assert.deepEqual(own(d).recipe,f.legacyRecipe);
  const regenerated=coneFourPlaneCP4039Document(readConeFourPlaneCP4039Recipe(d),f.response);
  assert.equal(own(regenerated).schema,'original-in4039-bounded-cone-cp-v2');assert.deepEqual(regenerated.segments,d.segments);
  assert.deepEqual(regenerated.metadata!.materialTopology,d.metadata!.materialTopology);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
   assert.equal(coneFourPlaneCP4039SourceMatches(reopened),true);assert.deepEqual(own(reopened),own(d));}
 }
});
test('legacy/new schema mixing and falsely relabelled complete-apex metadata are rejected',()=>{
 const f=cases.find(x=>x.name==='original16')!,a=apexCases.find(x=>x.name==='apex-original16')!;
 for(const mutate of [(d:any)=>own(d).recipe.paperBoundaryMode='local-cut',(d:any)=>own(d).recipe.innerRadius=0,
  (d:any)=>own(d).schema='original-in4039-bounded-cone-cp-v2',(d:any)=>delete own(d).recipe.assignmentMode]){
  const d=copy(f.legacyV1Doc!);mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);}
 for(const mutate of [(d:any)=>own(d).schema='original-in4039-local-bounded-cone-cp-v1',(d:any)=>delete own(d).recipe.paperBoundaryMode,
  (d:any)=>own(d).recipe.paperBoundaryMode='local-cut',(d:any)=>own(d).source.originalApexIncludedInPaper=false,
  (d:any)=>own(d).paperNative.coordinateWelding=true,(d:any)=>own(d).intrinsicDomain.globallyInjective=true,
  (d:any)=>own(d).intrinsicDomain.jacobianAbsoluteLowerBound=.001]){
  const d=coneFourPlaneCP4039Document(a.recipe,a.response);mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);}
});
test('both apex assignment modes preserve exact source vertex and null angles through JSON/FOLD',()=>{
 for(const f of apexCases)for(const format of ['json','fold'] as const){const d=coneFourPlaneCP4039Document(f.recipe,f.response),text=exportDocument(d,format).text,
  reopened=importDocument(text,format).doc;assert.equal(coneFourPlaneCP4039SourceMatches(reopened),true);
  assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(reopened.metadata!.materialTopology,d.metadata!.materialTopology);
  assert.deepEqual(readConeFourPlaneCP4039Recipe(reopened),f.recipe);assert.equal(Object.hasOwn(reopened,'flatFold'),false);
 }
});
test('source apex cannot be arbitrarily shifted, duplicated, repaired or welded',()=>{
 const f=apexCases.find(x=>x.name==='apex-original16')!;
 for(const value of [Number.MIN_VALUE,Number.EPSILON,.001]){
  const d=coneFourPlaneCP4039Document(f.recipe,f.response),m=d.metadata!.materialTopology as any;
  m.graph.vertices_coords[0][0]=value;for(const s of d.segments)if(s.id==='cone4039-cap-0-0'||s.id==='cone4039-cap-16-0')s.a[0]=value;
  const before=JSON.stringify(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);assert.equal(JSON.stringify(d),before);
 }
 for(const mutate of [(d:any)=>d.segments[0].a.push(0),(d:any)=>d.segments[0].a[0]=null,
  (d:any)=>d.metadata.materialTopology.graph.vertices_coords.push([0,0]),(d:any)=>own(d).intrinsicDomain.sourceApexQuotient.vertex=1,
  (d:any)=>own(d).numericalPolicy.minimumTriangleCross=0]){
  const d=coneFourPlaneCP4039Document(f.recipe,f.response);mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
});
test('raw original inputs and literal constants cannot be substituted or normalized',()=>{
 const f=cases.find(x=>x.name==='original16')!;
 for(const mutate of [(r:any)=>r.query.director[0]='.5*cos(s)',(r:any)=>r.query.composeReflections=false,
  (r:any)=>r.query.transverseStart=.5,(r:any)=>r.query.mirrors[1].normal[1]+=1e-15,
  (r:any)=>r.query.mirrors.reverse(),(r:any)=>r.query.rulingSegments=3,(r:any)=>r.source.normalNormalized=true,
  (r:any)=>r.sample.rows[0].stages[0].parameter=Number.MIN_VALUE,(r:any)=>r.normalization.origin[0]=Number.MIN_VALUE]){
  const r=copy(f.response);mutate(r);assert.throws(()=>coneFourPlaneCP4039Document(f.recipe,r));
 }
});
test('actual derived native stages and transformed effective mirrors are bound by narrow absolute policy',()=>{
 const f=cases.find(x=>x.name==='original16')!;
 for(const mutate of [(r:any)=>r.sample.rows[5].stages[3].fold[0]+=.001,
  (r:any)=>r.sample.rows[5].stages[3].parameter+=1e-10,(r:any)=>r.effectiveMirrors[2].normal[0]+=.001,
  (r:any)=>r.grid[8].stages[1].points[1][2]+=.001,(r:any)=>r.certification.adoptableCreasePattern=true]){
  const r=copy(f.response);mutate(r);assert.throws(()=>coneFourPlaneCP4039Document(f.recipe,r));
 }
 assert.notDeepEqual(f.response.effectiveMirrors[1].normal,f.query.mirrors[1].normal);
});
test('native absolute diagnostics cannot bypass the fixed finite nonnegative numerical gate',()=>{
 for(const f of cases.filter(x=>['original16','localU24'].includes(x.name)))for(const name of
  ['maximumRelativeMetricDifference','maximumNormalizedMirrorPlaneResidual','maximumMirrorNormalSquaredLengthError']){
  for(const value of [-Number.MIN_VALUE,1e-10,1,NaN,Infinity,null,'0',false]){
   const r=copy(f.response);r.diagnostics[name]=value;assert.throws(()=>coneFourPlaneCP4039Document(f.recipe,r));
   const d=coneFourPlaneCP4039Document(f.recipe,f.response);own(d).nativeSequence.diagnostics[name]=value;
   assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
  }
 }
});
test('native certified domain must preserve exact input endpoints, adjacency and binary tree count',()=>{
 for(const f of cases.filter(x=>['original16','localU24'].includes(x.name))){
  for(const mutate of [(r:any)=>r.domain.cells[0].start+=1e-10,(r:any)=>r.domain.cells.at(-1).end-=1e-10,
   (r:any)=>r.domain.evaluations+=1,...[-1,1].map(sign=>(r:any)=>{
    const cell=r.domain.cells[0],mid=(cell.start+cell.end)/2;
    r.domain.cells=[{...copy(cell),end:mid},{...copy(cell),start:mid+sign*1e-10}];
    r.domain.verifiedCells=2;r.domain.evaluations=3;
   })]){const response=copy(f.response);mutate(response);assert.throws(()=>coneFourPlaneCP4039Document(f.recipe,response));
    const d=coneFourPlaneCP4039Document(f.recipe,f.response);own(d).nativeSequence=response;
    assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
   }
 }
});
test('actual document types, point dimensions, IDs and angles refuse silent rebuild',()=>{
 for(const mutate of [(d:any)=>d.segments[0].a.push(0),(d:any)=>d.segments[0].a[0]=null,
  (d:any)=>d.segments[0].id='fake',(d:any)=>d.segments[20].angle=-180,(d:any)=>d.paper.width=String(d.paper.width),
  (d:any)=>d.segments[20].a[0]+=.001,(d:any)=>d.segments[20].assignment='U']){
  const d=make();mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
 const d=make();d.name='用户改工程名';assert.equal(coneFourPlaneCP4039SourceMatches(d),true);
});
test('recipe mode, source styles, proof policies, counts and material topology are strict',()=>{
 for(const mutate of [(d:any)=>own(d).recipe.assignmentMode='unassigned',(d:any)=>own(d).source.originalStyleHints.transverse[1]='U',
  (d:any)=>own(d).numericalPolicy.sourceCoordinateAbsoluteBoundMm+=1e-15,(d:any)=>own(d).topology.vertices+=1e-12,
  (d:any)=>d.metadata.materialTopology.graph.edges_vertices[0][0]=1e-12,
  (d:any)=>d.metadata.materialTopology.graph.faces_vertices[0][0]+=.000000000001,
  (d:any)=>own(d).intrinsicDomain.jacobianSign=1,(d:any)=>own(d).intrinsicDomain.literalStageCoefficients[0].numerator+='0']){
  const d=make();mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
});
test('nonnegative proof errors and positive cell proof cannot be forged; tiny coordinates stay bounded',()=>{
 for(const value of [-Number.MIN_VALUE,-1e-13,NaN,Infinity,null,'0',false]){
  const d=make();own(d).numericalPolicy.maximumLiteralResidual=value;assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
 for(const value of [0,-Number.MIN_VALUE,NaN,Infinity,null,'1',false]){
  const d=make();own(d).numericalPolicy.minimumCellCross=value;assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
 const d=make(),p=d.segments[30].a.slice();
 for(const s of d.segments)for(const endpoint of [s.a,s.b])if(endpoint[0]===p[0]&&endpoint[1]===p[1])endpoint[0]+=Number.EPSILON;
 for(const endpoint of (d.metadata!.materialTopology as any).graph.vertices_coords)if(endpoint[0]===p[0]&&endpoint[1]===p[1])endpoint[0]+=Number.EPSILON;
 assert.equal(coneFourPlaneCP4039SourceMatches(d),true);
 const changed=make();changed.paper.width+=.001;assert.equal(coneFourPlaneCP4039SourceMatches(changed),false);
});
test('source proof cannot acquire FF, folded vertices, starting face or synthetic seam',()=>{
 for(const mutate of [(d:any)=>d.flatFold={},(d:any)=>d.metadata.materialTopology.foldedVertices=[],
  (d:any)=>d.metadata.materialTopology.startingFace=0,(d:any)=>own(d).evidence.flatFold=true,
  (d:any)=>d.segments.push({id:'radial-seam',a:d.segments[0].a,b:d.segments[16].a,assignment:'U',angle:null})]){
  const d=make();mutate(d);assert.equal(coneFourPlaneCP4039SourceMatches(d),false);
 }
});
