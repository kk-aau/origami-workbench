import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateGeneralSpacerMiuraSource,generalSpacerMiuraPreset,generateGeneralSpacerMiuraDocument,readGeneralSpacerMiuraRecipe,generalSpacerMiuraSourceMatches,prepareGeneralSpacerMiuraPreview,generalSpacerMiuraSourceKey,generalSpacerMiuraScene,validateGeneralSpacerMiuraRecipe,type GeneralSpacerMiuraRecipe} from '../../src/app/generalSpacerMiuraCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc} from '../../src/core/types';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/general-spacer-miura-source-1011.json',import.meta.url),'utf8'));
const own=(d:Doc)=>d.metadata!.originalGeneralSpacerMiura as any,graph=(d:Doc)=>(d.metadata!.materialTopology as any).graph;
const close=(x:number,y:number,tol=2e-11)=>assert.ok(Math.abs(x-y)<=tol,`${x} != ${y}`);

test('80-decimal independent original literals agree for saved and newly authored nonmirror/spacer CPs and signed FFs',()=>{
 assert.equal(fixture.precisionDecimalDigits,80);
 for(const c of fixture.cases){const before=structuredClone(c.recipe),d=generateGeneralSpacerMiuraDocument(c.recipe),g=graph(d),ex=c.expected;
  assert.deepEqual(c.recipe,before);assert.equal(generalSpacerMiuraSourceMatches(d),true,c.name);
  for(const key of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[key],ex.graph[key],c.name+'/'+key);
  g.vertices_coords.forEach((p:number[],v:number)=>p.forEach((x,k)=>close(x,ex.graph.vertices_coords[v][k])));
  g.edges_foldAngle.forEach((x:number,e:number)=>close(x,ex.graph.edges_foldAngle[e]));
  own(d).seed.dihedralsDeg.forEach((x:number,i:number)=>close(x,ex.dihedralsDeg[i]));
  assert.equal(own(d).foldedState.status,'verified',c.name);const scene=generalSpacerMiuraScene(d);assert.ok(scene);
  scene.vertices.forEach((p:number[],v:number)=>p.forEach((x,k)=>close(x,ex.foldedForm3D[v][k])));
  assert.ok(ex.independentFoldMetrics.maximumLoopGap<1e-70);assert.ok(ex.independentFoldMetrics.maximumFaceDistanceError<1e-70);assert.ok(ex.independentFoldMetrics.maximumSignedHingeErrorRad<1e-70);
 }
});

test('general is the original nonperiodic intersection mesh with two independently editable edge-length lists',()=>{
 const p=generalSpacerMiuraPreset('general') as Extract<GeneralSpacerMiuraRecipe,{model:'general'}>,s=evaluateGeneralSpacerMiuraSource(p),g=s.graph,n=p.horizontalLengthsMm.length;
 assert.notEqual(p.sectorAnglesDeg[0],p.sectorAnglesDeg[3]);assert.notEqual(p.sectorAnglesDeg[1],p.sectorAnglesDeg[2]);
 assert.deepEqual(g.vertices_coords[0],[0,0]);assert.deepEqual(g.vertices_coords[1],[p.horizontalLengthsMm[0],0]);
 const simple=[g.vertices_coords[1][0]+g.vertices_coords[n+1][0],g.vertices_coords[1][1]+g.vertices_coords[n+1][1]];assert.ok(Math.hypot(simple[0]-g.vertices_coords[n+2][0],simple[1]-g.vertices_coords[n+2][1])>.1);
 for(const key of ['horizontalLengthsMm','verticalLengthsMm'] as const){const change=structuredClone(p);change[key][0]*=1.05;assert.notDeepEqual(evaluateGeneralSpacerMiuraSource(change).graph.vertices_coords,g.vertices_coords);assert.equal(generalSpacerMiuraSourceMatches(generateGeneralSpacerMiuraDocument(change)),true);}
 assert.equal(s.sourceGeometry.signedInteriorSteps.length,p.horizontalLengthsMm.length*p.verticalLengthsMm.length);
});

test('spacer creates actual vertical strip faces; arbitrary integer offset is preserved, not translated or normalized',()=>{
 const p=generalSpacerMiuraPreset('spacer') as Extract<GeneralSpacerMiuraRecipe,{model:'spacer'}>;
 for(const offset of [-5,-1,0,1,2,3,4,5]){const d=generateGeneralSpacerMiuraDocument({...p,offset}),g=graph(d),s=own(d);assert.equal(s.recipe.offset,offset);assert.equal(generalSpacerMiuraSourceMatches(d),true);assert.deepEqual(g.vertices_coords[0],[0,0]);
  const kinds=s.sourceGeometry.rowKinds;for(let j=1;j<=p.rows;j++){const a=g.vertices_coords[(j-1)*(p.columns+1)],b=g.vertices_coords[j*(p.columns+1)];if(kinds[j-1]%2===0){assert.equal(a[0],b[0]);close(b[1]-a[1],p.dsMm);}else close(Math.hypot(b[0]-a[0],b[1]-a[1]),p.dvMm);}
 }
 assert.notDeepEqual(graph(generateGeneralSpacerMiuraDocument(p)).vertices_coords,graph(generateGeneralSpacerMiuraDocument({...p,offset:1})).vertices_coords);
 const a=generateGeneralSpacerMiuraDocument({...p,offset:3}),b=generateGeneralSpacerMiuraDocument({...p,offset:7});assert.deepEqual(graph(a),graph(b));assert.notEqual(generalSpacerMiuraSourceKey({...p,offset:3}),generalSpacerMiuraSourceKey({...p,offset:7}));
});

test('indexed real paper graph has single disk topology and exact coverage proofs, with original signed target angles',()=>{
 for(const c of fixture.cases){const d=generateGeneralSpacerMiuraDocument(c.recipe),g=graph(d),p=c.recipe,n=p.model==='general'?p.horizontalLengthsMm.length:p.columns,m=p.model==='general'?p.verticalLengthsMm.length:p.rows,inspection=inspectMaterialTopology(d);
  if(!inspection.ok)assert.fail(inspection.reason);assert.equal(inspection.components.length,1);assert.equal(inspection.components[0].boundaryLoops.length,1);
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[(n+1)*(m+1),n*(m+1)+(n+1)*m,n*m]);assert.equal(g.edges_assignment.filter((x:string)=>x==='B').length,2*(n+m));
  g.edges_assignment.forEach((a:string,e:number)=>assert.equal(a,g.edges_foldAngle[e]<0?'M':g.edges_foldAngle[e]>0?'V':'B'));
  assert.equal(own(d).finitePaperProof.simpleBoundaryCoveredExactlyOnce,true);assert.equal(own(d).finitePaperProof.coordinateWelding,false);assert.equal(inspection.foldedVertices,undefined);assert.equal(inspection.startingFace,undefined);
  for(const key of ['continuousRigidPathChecked','wholeSheetLayerOrderChecked','selfCollisionChecked'])assert.equal(own(d).foldedState[key],false);
  assert.equal(own(d).source.wolframExecuted,false);assert.equal(own(d).source.wholeOriginalDomainProved,false);
 }
});

test('both minor/major signs invert the actual source target angles and preserve verified isometric FF',()=>{
 for(const model of ['general','spacer'] as const){const p=generalSpacerMiuraPreset(model),key=model==='general'?'minorFoldAngleDeg':'majorFoldAngleDeg',a=generateGeneralSpacerMiuraDocument(p),b=generateGeneralSpacerMiuraDocument({...p,[key]:-(p as any)[key]});assert.deepEqual(graph(a).vertices_coords,graph(b).vertices_coords);graph(a).edges_foldAngle.forEach((x:number,e:number)=>assert.equal(graph(b).edges_foldAngle[e],x===0?0:-x));assert.equal(own(b).foldedState.status,'verified');assert.equal(generalSpacerMiuraSourceMatches(b),true);}
});

test('strict original source/budget/degenerate boundaries reject atomically without clamping source inputs',()=>{
 const g=generalSpacerMiuraPreset('general') as any,s=generalSpacerMiuraPreset('spacer') as any;
 for(const [p,key] of [[g,'minorFoldAngleDeg'],[s,'sectorAngleDeg'],[s,'dhMm'],[s,'dvMm'],[s,'dsMm'],[s,'columns'],[s,'rows'],[s,'offset'],[s,'majorFoldAngleDeg']] as const)for(const value of [null,true,'2',NaN,Infinity,{},[]])assert.throws(()=>validateGeneralSpacerMiuraRecipe({...p,[key]:value}));
 for(const change of [{sectorAnglesDeg:[130,60,50,119]},{sectorAnglesDeg:[60,60,120,120]},{branch:'major-first'},{horizontalLengthsMm:[]},{verticalLengthsMm:[1,-1]},{minorFoldAngleDeg:0},{minorFoldAngleDeg:180},{extra:true}])assert.throws(()=>generateGeneralSpacerMiuraDocument({...g,...change}));
 for(const change of [{columns:0},{rows:2.5},{columns:1000,rows:1000},{offset:Number.MAX_SAFE_INTEGER},{sectorAngleDeg:90},{majorFoldAngleDeg:0},{dsMm:0},{extra:true}])assert.throws(()=>generateGeneralSpacerMiuraDocument({...s,...change}));
 const crossing={...g,sectorAnglesDeg:[10,50,170,130],horizontalLengthsMm:[1,1.3,1,1.3],verticalLengthsMm:[1.3,1,1.3,1]},before=structuredClone(crossing);assert.throws(()=>generateGeneralSpacerMiuraDocument(crossing),(e:any)=>e.code==='FINITE_GEOMETRY');assert.deepEqual(crossing,before);
 const tiny={...s,dhMm:1e-12};assert.throws(()=>generateGeneralSpacerMiuraDocument(tiny),(e:any)=>e.code==='MATERIAL_INTERFACE');assert.equal(tiny.dhMm,1e-12);
});

test('full guard detects source, primitive, material, physical segment, signed FF and proof forgery',()=>{
 const changes:Array<(d:Doc)=>void>=[d=>{own(d).recipe.offset=1;},d=>{own(d).seed.dihedralsDeg[0]+=1e-12;},d=>{own(d).source.wolframExecuted=true;},d=>{own(d).source.wholeOriginalDomainProved=true;},d=>{own(d).source.extra=0;},d=>{own(d).scope.selfCollisionChecked=true;},d=>{own(d).finitePaperProof.boundaryEdges--;},d=>{own(d).finitePaperProof.extra=true;},d=>{own(d).numericalPolicy.intervalCertified=true;},d=>{own(d).foldedState.signedHingesChecked=false;},d=>{own(d).foldedState.foldedForm3D[10][2]+=.001;},d=>{own(d).foldedState.maximumGridClosureErrorMm=100;},d=>{graph(d).faces_edges[0][0]=1;},d=>{graph(d).faces_faces[0][0]=0;},d=>{graph(d).edges_vertices[0][0]=2;},d=>{graph(d).vertices_coords[0][1]=Number.MIN_VALUE;},d=>{d.segments[0].a[0]=Number.MIN_VALUE;},d=>{d.segments[0].id='forged';},d=>{d.paper.width+=1e-12;},d=>{d.segments[0].assignment='U';},d=>{d.segments[0].angle=1;},d=>{(d.metadata!.materialTopology as any).startingFace=0;}];
 for(const change of changes){const d=generateGeneralSpacerMiuraDocument(generalSpacerMiuraPreset('spacer'));change(d);assert.equal(generalSpacerMiuraSourceMatches(d),false,change.toString());assert.equal(generalSpacerMiuraScene(d),null);}
 for(const change of [(d:Doc)=>{own(d).seed.creaseVectors[0][0]+=1e-12;},(d:Doc)=>{own(d).seed.dihedralsDeg[3]+=1e-12;},(d:Doc)=>{own(d).recipe.sectorAnglesDeg[0]+=1e-12;},(d:Doc)=>{own(d).sourceGeometry.signedInteriorSteps[0]+=.001;}]){const d=generateGeneralSpacerMiuraDocument(generalSpacerMiuraPreset());change(d);assert.equal(generalSpacerMiuraSourceMatches(d),false);}
 const d=generateGeneralSpacerMiuraDocument(generalSpacerMiuraPreset());d.name='用户改名';assert.equal(generalSpacerMiuraSourceMatches(d),true);
});

test('manual CP edit retains independently readable recipe; explicit rebuild recovers source and FF',()=>{
 for(const model of ['general','spacer'] as const){const p=generalSpacerMiuraPreset(model),d=generateGeneralSpacerMiuraDocument(p),e=d.segments.findIndex(s=>s.assignment==='M');d.segments[e].assignment='U';d.segments[e].angle=null;graph(d).edges_assignment[e]='U';graph(d).edges_foldAngle[e]=null;assert.equal(generalSpacerMiuraSourceMatches(d),false);assert.deepEqual(readGeneralSpacerMiuraRecipe(d),p);assert.equal(generalSpacerMiuraSourceMatches(generateGeneralSpacerMiuraDocument(readGeneralSpacerMiuraRecipe(d))),true);}
});

test('one-ULP transcendental runtime variation replays from persisted source; coherent CP edits still fail that exact binding',()=>{
 const view=new DataView(new ArrayBuffer(8)),next=(x:number)=>{if(x===0||Math.abs(x)===1)return x;view.setFloat64(0,x,false);view.setBigUint64(0,view.getBigUint64(0,false)+(x>0?1n:-1n),false);return view.getFloat64(0,false);},originalSin=Math.sin,originalCos=Math.cos;
 for(const model of ['general','spacer'] as const){let d:Doc;try{Math.sin=x=>next(originalSin(x));Math.cos=x=>next(originalCos(x));d=generateGeneralSpacerMiuraDocument(generalSpacerMiuraPreset(model));}finally{Math.sin=originalSin;Math.cos=originalCos;}
  assert.equal(generalSpacerMiuraSourceMatches(d!),true,model);assert.ok(generalSpacerMiuraScene(d!));
  const g=graph(d!),vertex=10,before=g.vertices_coords[vertex][0],after=next(before);g.vertices_coords[vertex][0]=after;
  for(let e=0;e<g.edges_vertices.length;e++){const [a,b]=g.edges_vertices[e];if(a===vertex)d!.segments[e].a[0]=after;if(b===vertex)d!.segments[e].b[0]=after;}
  assert.equal(generalSpacerMiuraSourceMatches(d!),false,model+' coherent CP/source mismatch');
 }
});

test('immutable preview exposes original source separately from repeatable atomic build',()=>{
 const p=generalSpacerMiuraPreset(),preview=prepareGeneralSpacerMiuraPreview(p);assert.equal(Object.isFrozen(preview.source),true);assert.equal(Object.isFrozen(preview.source.graph.vertices_coords[0]),true);assert.equal(preview.key,generalSpacerMiuraSourceKey(p));
 const a=preview.build();a.segments[0].a[0]=12;const b=preview.build();assert.equal(b.segments[0].a[0],0);assert.equal(generalSpacerMiuraSourceMatches(b),true);assert.equal(preview.source.graph.vertices_coords[0][0],0);
});

test('JSON/FOLD ordinary exchange reopens full source, physical CP material and saved static FF without altering coordinates',()=>{
 for(const model of ['general','spacer'] as const){const p=generalSpacerMiuraPreset(model),d=generateGeneralSpacerMiuraDocument(p);for(const format of ['json','fold'] as const){const exported=exportDocument(d,format),reopened=importDocument(exported.text,format).doc;assert.equal(generalSpacerMiuraSourceMatches(reopened),true,model+'/'+format);assert.deepEqual(readGeneralSpacerMiuraRecipe(reopened),p);assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(graph(reopened),graph(d));assert.deepEqual(own(reopened),own(d));assert.ok(generalSpacerMiuraScene(reopened));}}
});

test('R12 DXF preserves every original indexed physical edge with only the standard Y reflection',()=>{
 for(const model of ['general','spacer'] as const){const d=generateGeneralSpacerMiuraDocument(generalSpacerMiuraPreset(model)),pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Array<Record<string,string>>=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.equal(lines.length,d.segments.length);lines.forEach((r,i)=>{const s=d.segments[i];assert.equal(r['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(r['10']),Number(r['20']),Number(r['11']),Number(r['21'])],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(v=>Object.is(v,-0)?0:v));});
 }
});
