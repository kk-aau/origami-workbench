import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bistableTwistTubePreset,bistableTwistTubeRepeatedRecipe,validateBistableTwistTubeRecipe,twistTubeParameters,evaluateBistableTwistTubeSource,generateBistableTwistTubeDocument,readBistableTwistTubeRecipe,bistableTwistTubeSourceKey,bistableTwistTubeSourceMatches,bistableTwistTubeScene,prepareBistableTwistTubePreview} from '../../src/app/bistableTwistTubeCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc} from '../../src/core/types';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/bistable-twist-tube-source-1012.json',import.meta.url),'utf8'));
const own=(d:Doc)=>d.metadata!.originalBistableTwistTube as any,graph=(d:Doc)=>(d.metadata!.materialTopology as any).graph,near=(a:number,b:number,tolerance=3e-11)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('80-decimal independent literal original parameters, halfedge face order and directed angles match saved and authored cases',()=>{
 assert.equal(fixture.precisionDecimalDigits,80);assert.equal(fixture.executedMathematica,false);
 for(const c of fixture.cases){const before=structuredClone(c.recipe),s=evaluateBistableTwistTubeSource(c.recipe),d=generateBistableTwistTubeDocument(c.recipe),g=graph(d),e=c.expected;assert.deepEqual(c.recipe,before);assert.equal(bistableTwistTubeSourceMatches(d),true,c.name);
  for(const key of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[key],e.graph[key],c.name+'/'+key);
  g.vertices_coords.forEach((p:number[],i:number)=>p.forEach((v,k)=>near(v,e.graph.vertices_coords[i][k])));g.edges_foldAngle.forEach((v:number,i:number)=>near(v,e.graph.edges_foldAngle[i]));assert.deepEqual(s.rawSourceTypes,e.rawSourceTypes);for(const key of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(s.sourceGraph[key],e.sourceGraph[key],c.name+'/raw-source/'+key);s.firstStableFoldAnglesDeg.forEach((v,i)=>near(v,e.firstStableFoldAnglesDeg[i]));assert.deepEqual(s.sourceEdgeFaceIncidenceOneBased,e.sourceEdgeFaceIncidenceOneBased);assert.deepEqual(s.sourceSeams,e.seams);
  s.parameters.forEach((p:any,i:number)=>{for(const key of ['alphaRad','tiltedSideMm','firstPhaseRad','secondPhaseRad','heightDifferenceSquaredMm2'])near(p[key],e.parameters[i][key]);p.cpTranslationMm.forEach((v:number,k:number)=>near(v,e.parameters[i].cpTranslationMm[k]));});
  for(const state of ['first','second'] as const){const scene=bistableTwistTubeScene(d,state);assert.ok(scene,c.name+'/'+state);const expected=state==='first'?e.firstStableVertices3D:e.sourceVertices3D;scene.vertices.forEach((p,i)=>p.forEach((v,k)=>near(v,expected[i][k])));assert.ok(e.independentStaticMetrics[state==='first'?0:1].maximumAllTriangleDistanceErrorMm<1e-70);assert.ok(e.independentStaticMetrics[state==='first'?0:1].maximumClosedTubeSeamGapMm<1e-70);}
 }
});

test('saved mixed tube preserves original origin, 25 vertices, 56 indexed edges and 32 original triangles',()=>{
 const r=bistableTwistTubePreset(),d=generateBistableTwistTubeDocument(r),g=graph(d);assert.deepEqual(g.vertices_coords[0],[1,0]);assert.deepEqual(g.vertices_coords[4],[5,0]);assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[25,56,32]);assert.ok(g.faces_vertices.every((f:number[])=>f.length===3));assert.equal(own(d).source.coordinateTranslation,false);assert.equal(own(d).source.coordinateScaling,false);assert.equal(own(d).finitePaperProof.newPrivateTriangleEdges,false);
});

test('original RH/LH complementary sectors and opposite phases are literal, not the unrelated existing tube',()=>{
 const a=twistTubeParameters(5,{firstHeightMm:.9,secondHeightMm:.1,twistDirection:1}),b=twistTubeParameters(5,{firstHeightMm:.9,secondHeightMm:.1,twistDirection:-1});near(a.alphaRad+b.alphaRad,Math.PI);assert.equal(a.tiltedSideMm,b.tiltedSideMm);assert.equal(a.firstPhaseRad,-b.firstPhaseRad);assert.equal(a.secondPhaseRad,-b.secondPhaseRad);near(a.cpTranslationMm[0],-b.cpTranslationMm[0]);near(a.cpTranslationMm[1],b.cpTranslationMm[1]);
});

test('both open paper banks retain source identity; left original M0 is explicit local B0 and never welded',()=>{
 for(const c of fixture.cases){const d=generateBistableTwistTubeDocument(c.recipe),g=graph(d),source=own(d),m=c.recipe.rotationalOrder;assert.equal(source.boundaryEncoding.originalPipelineChangesEdgeTypes,false);assert.equal(source.boundaryEncoding.oppositeBanksWelded,false);assert.equal(source.boundaryEncoding.mappings.length,c.recipe.layers.length);
  for(const seam of source.sourceSeams){assert.equal(source.rawSourceTypes[seam.leftEdgeIndex],'M');assert.equal(source.sourceGraph.edges_assignment[seam.leftEdgeIndex],'M');assert.equal(source.sourceFoldAnglesDeg[seam.leftEdgeIndex],0);assert.equal(g.edges_assignment[seam.leftEdgeIndex],'B');assert.equal(g.edges_foldAngle[seam.leftEdgeIndex],0);assert.equal(source.rawSourceTypes[seam.rightEdgeIndex],'B');assert.notEqual(seam.leftEdgeIndex,seam.rightEdgeIndex);assert.equal(g.edges_faces[seam.leftEdgeIndex].length,1);assert.equal(g.edges_faces[seam.rightEdgeIndex].length,1);assert.deepEqual(g.edges_vertices[seam.leftEdgeIndex],seam.leftVertexPair);assert.deepEqual(g.edges_vertices[seam.rightEdgeIndex],seam.rightVertexPair);}
  for(let j=0;j<=c.recipe.layers.length;j++){const a=j*(m+1),b=a+m;assert.notDeepEqual(g.vertices_coords[a],g.vertices_coords[b]);assert.notEqual(a,b);assert.ok(Math.hypot(...source.sourceVertices3D[a].map((v:number,k:number)=>v-source.sourceVertices3D[b][k]))<1e-10);}
  const material=inspectMaterialTopology(d);if(!material.ok)assert.fail(material.reason);assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);assert.equal(material.foldedVertices,undefined);assert.equal(material.startingFace,undefined);assert.equal(source.finitePaperProof.simpleBoundaryCoveredExactlyOnce,true);assert.equal(source.finitePaperProof.coordinateWelding,false);
 }
});

test('every practical original creative parameter changes the actual finite source and repeated entry keeps identical layers',()=>{
 const base=bistableTwistTubePreset(),before=JSON.stringify(base),changes=[{...base,rotationalOrder:5},{...base,layers:base.layers.map((l,i)=>i===1?{...l,firstHeightMm:.3}:l)},{...base,layers:base.layers.map((l,i)=>i===1?{...l,secondHeightMm:.7}:l)},{...base,layers:base.layers.map((l,i)=>i===1?{...l,twistDirection:-1 as const}:l)},{...base,layers:base.layers.slice(0,3)}];
 const original=graph(generateBistableTwistTubeDocument(base));for(const r of changes){const d=generateBistableTwistTubeDocument(r);assert.equal(bistableTwistTubeSourceMatches(d),true);assert.notDeepEqual(graph(d),original);assert.notEqual(bistableTwistTubeSourceKey(r),bistableTwistTubeSourceKey(base));}assert.equal(JSON.stringify(base),before);
 const repeated=bistableTwistTubeRepeatedRecipe(4,{firstHeightMm:.2,secondHeightMm:.8,twistDirection:1},3);assert.deepEqual(repeated,fixture.cases.find((c:any)=>c.name==='saved-In2577').recipe);assert.equal(generateBistableTwistTubeDocument(repeated).segments.length,43);
});

test('non-numeric, original height bound, local limits, singular and budget inputs reject atomically without clamp',()=>{
 const r=bistableTwistTubePreset();for(const v of [null,true,'4',NaN,Infinity,{},[]])assert.throws(()=>validateBistableTwistTubeRecipe({...r,rotationalOrder:v}));for(const v of [null,true,'1',NaN,Infinity,{},[]])for(const key of ['firstHeightMm','secondHeightMm','twistDirection'])assert.throws(()=>validateBistableTwistTubeRecipe({...r,layers:[{...r.layers[0],[key]:v}]}));
 for(const bad of [{...r,rotationalOrder:2},{...r,rotationalOrder:33},{...r,layers:[]},{...r,layers:Array(25).fill(r.layers[0])},{...r,extra:true},{...r,layers:[{...r.layers[0],extra:true}]},{...r,layers:[{...r.layers[0],twistDirection:0}]},{...r,layers:[{...r.layers[0],firstHeightMm:0}]},{...r,layers:[{...r.layers[0],secondHeightMm:-.2}]},{rotationalOrder:32,layers:Array(24).fill(r.layers[0])}])assert.throws(()=>generateBistableTwistTubeDocument(bad));
 const bad={rotationalOrder:4,layers:[{firstHeightMm:2,secondHeightMm:.1,twistDirection:1}]},before=structuredClone(bad);assert.throws(()=>generateBistableTwistTubeDocument(bad),(e:any)=>e.code==='ORIGINAL_HEIGHT_BOUND');assert.deepEqual(bad,before);assert.throws(()=>bistableTwistTubeRepeatedRecipe(4,r.layers[0],1.5));
});

test('full source guard rejects wrong raw assignments, hidden seam mapping, changed primitive CP, topology, angles and spatial certificates',()=>{
 const mutations:Array<(d:Doc)=>void>=[d=>{own(d).recipe.layers[1].secondHeightMm=.7;},d=>{own(d).rawSourceTypes[4]='B';},d=>{own(d).sourceGraph.edges_assignment[4]='B';},d=>{own(d).boundaryEncoding.mappings=[];},d=>{own(d).boundaryEncoding.oppositeBanksWelded=true;},d=>{own(d).source.coordinateScaling=true;},d=>{own(d).scope.physicalBistabilityVerified=true;},d=>{own(d).sourceEdgeFaceIncidenceOneBased[0][0]=1;},d=>{own(d).sourceSeams[0].leftEdgeIndex++;},d=>{own(d).parameters[0].alphaRad+=.01;},d=>{own(d).sourceVertices3D[8][2]+=.001;},d=>{own(d).firstStableVertices3D[8][2]+=.001;},d=>{own(d).staticStates.second.staticGlobalIsometryChecked=false;},d=>{own(d).staticStates.second.maximumAllTriangleDistanceErrorMm=1;},d=>{own(d).numericalPolicy.intervalCertified=true;},d=>{own(d).finitePaperProof.positiveOriginalTriangles=false;},d=>{graph(d).faces_edges[0][0]++;},d=>{graph(d).vertices_coords[0][0]+=1e-12;},d=>{d.segments[0].a[0]+=1e-12;},d=>{d.segments[0].id='forged';},d=>{d.paper.width+=1e-12;},d=>{(d.metadata!.materialTopology as any).startingFace=0;}];
 for(const change of mutations){const d=generateBistableTwistTubeDocument(bistableTwistTubePreset());change(d);assert.equal(bistableTwistTubeSourceMatches(d),false,change.toString());assert.equal(bistableTwistTubeScene(d),null);}
 const d=generateBistableTwistTubeDocument(bistableTwistTubePreset());d.name='用户名称';assert.equal(bistableTwistTubeSourceMatches(d),true);
});

test('coherent physical vertex edits remain detectable while recipe can be explicitly rebuilt',()=>{
 const r=bistableTwistTubePreset(),d=generateBistableTwistTubeDocument(r),g=graph(d),v=7;g.vertices_coords[v][0]+=.001;for(let e=0;e<g.edges_vertices.length;e++){const [a,b]=g.edges_vertices[e];if(a===v)d.segments[e].a=[g.vertices_coords[v][0],g.vertices_coords[v][1]];if(b===v)d.segments[e].b=[g.vertices_coords[v][0],g.vertices_coords[v][1]];}assert.equal(bistableTwistTubeSourceMatches(d),false);assert.deepEqual(readBistableTwistTubeRecipe(d),r);assert.equal(bistableTwistTubeSourceMatches(generateBistableTwistTubeDocument(readBistableTwistTubeRecipe(d))),true);
});

test('prepared preview is immutable, has the exact recipe key and repeatedly builds independent documents',()=>{
 const r=bistableTwistTubePreset(),p=prepareBistableTwistTubePreview(r);assert.equal(p.key,bistableTwistTubeSourceKey(r));assert.equal(Object.isFrozen(p.source),true);assert.equal(Object.isFrozen(p.source.parameters[0].cpTranslationMm),true);const a=p.build();a.segments[0].a[0]=99;assert.equal(p.build().segments[0].a[0],1);assert.equal(p.source.graph.vertices_coords[0][0],1);
});

test('saved CP replays persisted original translations across one-ULP transcendental runtime variation',()=>{
 const view=new DataView(new ArrayBuffer(8)),next=(x:number)=>{if(x===0||Math.abs(x)===1)return x;view.setFloat64(0,x,false);view.setBigUint64(0,view.getBigUint64(0,false)+(x>0?1n:-1n),false);return view.getFloat64(0,false);},sin=Math.sin,cos=Math.cos;let doc:Doc;
 try{Math.sin=x=>next(sin(x));Math.cos=x=>next(cos(x));doc=generateBistableTwistTubeDocument(bistableTwistTubePreset());}finally{Math.sin=sin;Math.cos=cos;}
 assert.equal(bistableTwistTubeSourceMatches(doc!),true);assert.ok(bistableTwistTubeScene(doc!));const g=graph(doc!),v=7;g.vertices_coords[v][0]=next(g.vertices_coords[v][0]);for(let e=0;e<g.edges_vertices.length;e++){const [a,b]=g.edges_vertices[e];if(a===v)doc!.segments[e].a=[g.vertices_coords[v][0],g.vertices_coords[v][1]];if(b===v)doc!.segments[e].b=[g.vertices_coords[v][0],g.vertices_coords[v][1]];}assert.equal(bistableTwistTubeSourceMatches(doc!),false);
});

test('verified scenes prove static face distances and source-directed angles but never motion, energy bistability, collision or layers',()=>{
 for(const c of fixture.cases){const d=generateBistableTwistTubeDocument(c.recipe);for(const state of ['first','second'] as const){const scene=bistableTwistTubeScene(d,state)!;assert.ok(scene);assert.equal(scene.state,state);assert.ok(scene.minimumSpatialEdgeLength>0);assert.ok(scene.maximumFaceDistanceError<1e-10);const proof=own(d).staticStates[state];assert.equal(proof.staticGlobalIsometryChecked,true);assert.equal(proof.closedTubeSeamChecked,true);for(const k of ['continuousRigidPathChecked','wholeSheetLayerOrderChecked','selfCollisionChecked','physicalBistabilityVerified'])assert.equal(proof[k],false);}
  assert.match(bistableTwistTubeScene(d,'first')!.targetAngleConvention,/alternative/);assert.match(bistableTwistTubeScene(d)!.targetAngleConvention,/current original second/);assert.equal(own(d).source.wholeOriginalDomainProved,false);
 }
});

test('ordinary JSON/FOLD roundtrip preserves actual CP plus raw source, independent banks and both static states',()=>{
 for(const c of fixture.cases.slice(0,3)){const d=generateBistableTwistTubeDocument(c.recipe);for(const format of ['json','fold'] as const){const exported=exportDocument(d,format),read=importDocument(exported.text,format).doc;assert.equal(bistableTwistTubeSourceMatches(read),true,c.name+'/'+format);assert.deepEqual(readBistableTwistTubeRecipe(read),c.recipe);assert.deepEqual(read.segments,d.segments);assert.deepEqual(graph(read),graph(d));assert.deepEqual(own(read),own(d));assert.ok(bistableTwistTubeScene(read));}}
});

test('ordinary R12 DXF covers each local indexed physical LINE once with original location and only the existing Y conversion',()=>{
 for(const c of fixture.cases){const d=generateBistableTwistTubeDocument(c.recipe),pairs=exportDXF(d).text.trim().split(/\r?\n/),entities:Array<Record<string,string>>=[];for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const entity:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)entity[pairs[j]]=pairs[j+1];entities.push(entity);}assert.equal(entities.length,d.segments.length);entities.forEach((row,i)=>{const s=d.segments[i];assert.equal(row['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(row['10']),Number(row['20']),Number(row['11']),Number(row['21'])],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(n=>Object.is(n,-0)?0:n));});
  for(const seam of own(d).sourceSeams)assert.equal(entities[seam.leftEdgeIndex]['8'],DXF_LAYERS.B.name);
 }
});
