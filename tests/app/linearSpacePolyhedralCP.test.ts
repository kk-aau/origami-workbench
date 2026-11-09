import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateLinearSpacePolyhedralCPRecipe,linearSpacePolyhedralCPPreset,evaluateLinearSpacePolyhedralCPSource,linearSpacePolyhedralCPDocument,readLinearSpacePolyhedralCPRecipe,linearSpacePolyhedralCPSourceMatches,prepareLinearSpacePolyhedralCPPreview,type LinearSpacePolyhedralCPRecipe} from '../../src/app/linearSpacePolyhedralCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/linear-space-polyhedral-source-20261011.json',import.meta.url),'utf8'));
const historical=JSON.parse(fs.readFileSync(new URL('../fixtures/linear-space-runtime-actual-003-1012.json',import.meta.url),'utf8'));
const own=(d:any)=>d.metadata.originalLinearSpacePolyhedralCP;
const material=(d:any)=>d.metadata.materialTopology.graph;
function near(a:any,b:any,t=1e-10):void{if(Array.isArray(b)){assert.ok(Array.isArray(a));assert.equal(a.length,b.length);b.forEach((x,i)=>near(a[i],x,t));}else if(typeof b==='number'){assert.ok(typeof a==='number'&&Number.isFinite(a));assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);}else assert.deepEqual(a,b);}
function document(model:LinearSpacePolyhedralCPRecipe['model']){return linearSpacePolyhedralCPDocument(linearSpacePolyhedralCPPreset(model));}

test('independent original-literal Python witnesses compare every vertex, indexed edge, quad, incidence, assignment and source angle',()=>{
 assert.equal(fixture.mathematicaExecuted,false);assert.equal(fixture.cases.length,9);
 for(const row of fixture.cases){const s=evaluateLinearSpacePolyhedralCPSource(row.recipe),d=linearSpacePolyhedralCPDocument(row.recipe),g=material(d),expected=row.expected;
  for(const k of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[k],expected.graph[k],row.name+' '+k);
  near(g.vertices_coords,expected.graph.vertices_coords);near(g.edges_foldAngle,expected.graph.edges_foldAngle);assert.deepEqual(s.rawSourceTypes,expected.rawSourceTypes);near(s.rawSourceFoldAnglesDeg,expected.rawSourceFoldAnglesDeg);
  if(row.recipe.model==='space-curve'){near(s.sourceVertices3D,expected.sourceVertices3D);near(s.maximumWidthsMm,expected.maximumWidthsMm);assert.deepEqual(s.boundaryEncoding.map(r=>r.edge),expected.boundaryEncodingEdges);
   expected.stations.forEach((st:any,i:number)=>{for(const k of ['sectorsDeg','sigmaDeg','gammaDeg','spineCPMm','spine3DMm','leftCreaseLengthMm','rightCreaseLengthMm','torsionDeg','foldVectors3D','sectorVectors3D','osculatingVector'])near((s.stations[i] as any)[k],st[k]);if(st.vertex){const a=s.stations[i].vertex3D!;assert.equal(a.oddCreaseIndex,st.vertex.oddCreaseIndex);assert.deepEqual(a.majorCreaseIndices,st.vertex.majorCreaseIndices);assert.deepEqual(a.minorCreaseIndices,st.vertex.minorCreaseIndices);assert.ok(a.sectorSumResidual<1e-9);}});
  }
  assert.equal(linearSpacePolyhedralCPSourceMatches(d),true,row.name);
 }
});
test('separate exact dyadic proofs preserve original origin, unequal width order, 1 unit = 1 mm once and finite 3N/5N-3/2N-2 strip',()=>{
 for(const row of fixture.exactDyadic){const d=linearSpacePolyhedralCPDocument(row.recipe),s=own(d),g=material(d);const rational=(q:string)=>{const [a,b]=q.split('/').map(Number);return b===undefined?a:a/b;};near(g.vertices_coords,row.exactVerticesFractions.map((p:string[])=>p.map(rational)),1e-14);
  assert.deepEqual(g.vertices_coords[1],[0,0]);assert.deepEqual(g.vertices_coords[4],[1,0]);assert.deepEqual(g.vertices_coords[7],[3,0]);
  assert.deepEqual(s.provenance.sourceWidthOrder,['rightWidthMm','leftWidthMm']);assert.equal(g.edges_foldAngle.filter((v:any)=>v===null).length,4);assert.ok(!g.edges_foldAngle.includes(180)&&!g.edges_foldAngle.includes(-180));
  const a=inspectMaterialTopology(d);if(!a.ok)assert.fail(a.reason);assert.equal(a.components.length,1);assert.equal(a.components[0].boundaryLoops.length,1);assert.equal(g.vertices_coords.length-g.edges_vertices.length+g.faces_vertices.length,1);
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[9,12,4]);
 }
});
test('source first-width and square-root rules retain all four independent comparison branches including exact Min ties',()=>{
 const p=linearSpacePolyhedralCPPreset('linear-chain');assert.equal(p.model,'linear-chain');if(p.model!=='linear-chain')return;
 const sectors=[[[90,90,90,90],[40,100,140,80],[90,90,90,90]],[[90,90,90,90],[140,80,40,100],[90,90,90,90]],[[90,90,90,90],[90,90,90,90],[90,90,90,90]]];
 for(const aa of sectors)for(const types of [['M','M'],['M','V']] as const){const r={...p,sectorsDeg:aa,lengthsMm:[10,10],spineTypes:[...types],leftWidthMm:.2,rightWidthMm:.3};const s=evaluateLinearSpacePolyhedralCPSource(r);assert.equal(s.stations[1].rightCreaseLengthMm,.3*Math.sqrt(1/(Math.sin(aa[1][0]*Math.PI/180)*Math.sin(aa[1][1]*Math.PI/180))));assert.equal(s.rawSourceTypes.length,12);}
 const s=evaluateLinearSpacePolyhedralCPSource({...p,sectorsDeg:[[60,90,90,120],[90,90,90,90]],lengthsMm:[10],spineTypes:['V'],rightWidthMm:.2,leftWidthMm:.4});near(s.sourcePlane[0],[.2/Math.sin(Math.PI/3)*Math.cos(-2*Math.PI/3),.2/Math.sin(Math.PI/3)*Math.sin(-2*Math.PI/3)]);near(s.sourcePlane[2],[.4/Math.sin(2*Math.PI/3)*Math.cos(Math.PI/3),.4/Math.sin(2*Math.PI/3)*Math.sin(Math.PI/3)]);
});
test('literal last interior B/0 and constant Gamma[0][2] remain distinct from explicit local F/0 semantics and actual 3D angles',()=>{
 for(const row of fixture.cases.filter((r:any)=>r.recipe.model==='space-curve')){const s=evaluateLinearSpacePolyhedralCPSource(row.recipe),d=linearSpacePolyhedralCPDocument(row.recipe),g=material(d);
  assert.deepEqual(s.provenance.sourceWidthOrder,['leftWidthMm','rightWidthMm']);assert.equal(s.boundaryEncoding.length,2);assert.equal(s.sourceRoleEvidence.literalEdgeAssignmentsEqualToMaterial,false);
  for(const r of s.boundaryEncoding){assert.equal(s.rawSourceTypes[r.edge],'B');assert.equal(s.sourceGraph.edges_assignment[r.edge],'B');assert.equal(s.rawSourceFoldAnglesDeg[r.edge],0);assert.equal(g.edges_assignment[r.edge],'F');assert.equal(g.edges_foldAngle[r.edge],0);assert.equal(g.edges_faces[r.edge].length,2);}
  for(let i=1;i<row.recipe.pointsMm.length;i++)assert.equal(g.edges_foldAngle[3+5*(i-1)],row.recipe.sigmaLeftDeg+row.recipe.sigmaRightDeg);
  assert.equal(s.poseProof.perFaceIsometryChecked,true);assert.equal(s.poseProof.sharedVertexIdentityChecked,true);assert.equal(s.poseProof.sourceGammaChecked,true);assert.equal(s.poseProof.poseCertified,false);assert.equal(s.poseProof.angleMismatches.length,2);assert.ok(s.poseProof.angleMismatches.every(r=>r.sourceType==='B'&&r.sourceAngleDeg===0&&Math.abs(r.actualAngleDeg)>1));
  const independent=row.expected.independentPose;near(s.poseProof.maximumDistanceResidualMm,independent.maximumDistanceResidualMm);near(s.poseProof.maximumPlanarityResidualMm,independent.maximumPlanarityResidualMm);assert.deepEqual(s.poseProof.angleMismatches.map(r=>r.edge),independent.angleMismatches.map((r:any)=>r.edge));s.poseProof.angleMismatches.forEach((r,i)=>{near(r.actualAngleDeg,independent.angleMismatches[i].actualAngleDeg);assert.equal(r.sourceAngleDeg,independent.angleMismatches[i].sourceAngleDeg);});independent.actualSharedEdgeAnglesDeg.forEach((a:number|null,i:number)=>{if(a!==null&&!independent.angleMismatches.some((m:any)=>m.edge===i))near(a,s.graph.edges_foldAngle[i]);});
  assert.equal(prepareLinearSpacePolyhedralCPPreview(row.recipe).scene,null);assert.equal(linearSpacePolyhedralCPSourceMatches(d),true);
 }
});
test('creative curves preserve 3D offsets, original CP origin and selected CP direction; coincident closed source stations retain independent identities',()=>{
 const custom=fixture.cases.find((r:any)=>r.name==='space-creative-offset-rotation'),closed=fixture.cases.find((r:any)=>r.name==='space-independent-closed-stations');
 const s=evaluateLinearSpacePolyhedralCPSource(custom.recipe);assert.deepEqual(s.worldVerticesMm![1],custom.recipe.pointsMm[0]);assert.deepEqual(s.sourcePlane[1],[0,0]);near(s.sourcePlane[4],[Math.hypot(2,1)*Math.cos(37*Math.PI/180),Math.hypot(2,1)*Math.sin(37*Math.PI/180)]);
 const c=evaluateLinearSpacePolyhedralCPSource(closed.recipe),N=closed.recipe.pointsMm.length;assert.deepEqual(c.worldVerticesMm![1],c.worldVerticesMm![3*(N-1)+1]);assert.notDeepEqual(c.sourcePlane[1],c.sourcePlane[3*(N-1)+1]);assert.equal(c.sourcePlane.length,3*N);assert.ok(!c.graph.edges_vertices.some(([a,b])=>a===1&&b===3*(N-1)+1));
});
test('strict exact recipe union rejects coercions, absent options, aliases and station budgets without mutating caller input',()=>{
 for(const model of ['linear-chain','space-curve'] as const){const p=linearSpacePolyhedralCPPreset(model),before=JSON.stringify(p);for(const k of ['leftWidthMm','rightWidthMm'])for(const v of [null,true,'1',NaN,Infinity,0,-1,{},[]])assert.throws(()=>validateLinearSpacePolyhedralCPRecipe({...p,[k]:v}));assert.throws(()=>validateLinearSpacePolyhedralCPRecipe({...p,scale:1}));const missing:any={...p};delete missing.leftWidthMm;assert.throws(()=>validateLinearSpacePolyhedralCPRecipe(missing));assert.equal(JSON.stringify(p),before);}
 const p=linearSpacePolyhedralCPPreset('space-curve');if(p.model!=='space-curve')return;
 for(const extra of [{pointsMm:Array(129).fill([0,0,0])},{osculatingVectorNear:[0,0,0]},{osculatingVectorNear:undefined},{sigmaLeftDeg:0},{sigmaRightDeg:-30},{initialCPDirectionDeg:null}])assert.throws(()=>validateLinearSpacePolyhedralCPRecipe({...p,...extra}));
});
test('zero segments, collinear source frames, original bad-subarc branches, folded CP overlaps and oversized widths reject atomically',()=>{
 const p=linearSpacePolyhedralCPPreset('space-curve');if(p.model!=='space-curve')return;
 for(const pointsMm of [[[0,0,0],[0,0,0],[1,1,0]],[[0,0,0],[1,0,0],[2,0,0]]])assert.throws(()=>linearSpacePolyhedralCPDocument({...p,pointsMm}));
 assert.throws(()=>linearSpacePolyhedralCPDocument({...p,sigmaLeftDeg:.1,sigmaRightDeg:.1,pointsMm:[[0,0,0],[1,0,0],[1,1,0],[1,1,1]]}));
 const linear=linearSpacePolyhedralCPPreset('linear-chain'),before=JSON.stringify(linear);assert.throws(()=>linearSpacePolyhedralCPDocument({...linear,rightWidthMm:100,leftWidthMm:100}));assert.equal(JSON.stringify(linear),before);
});
test('full-source guard rejects all forged recipe/provenance/scope/source graph/world/branch/paper/angle/incidence changes and saves rebuild recipe after manual edits',()=>{
 const mutations=[(d:any)=>{own(d).recipe.leftWidthMm+=1e-12;},(d:any)=>{own(d).schema+='x';},(d:any)=>{own(d).provenance.notebookSHA256='fake';},(d:any)=>{own(d).provenance.coordinateSnapping=true;},(d:any)=>{own(d).scope.rigidMotion=true;},(d:any)=>{own(d).sourceRoleEvidence.literalEdgeAssignmentsEqualToMaterial=true;},(d:any)=>{own(d).sourceGraph.edges_assignment[10]='F';},(d:any)=>{own(d).worldVerticesMm[1][0]=1;},(d:any)=>{own(d).stations[1].vertex3D.oddCreaseIndex=1;},(d:any)=>{own(d).rawSourceFoldAnglesDeg[10]=180;},(d:any)=>{own(d).rawSourceTypes[10]='F';},(d:any)=>{own(d).boundaryEncoding[0].edge++;},(d:any)=>{own(d).poseProof.poseCertified=true;},(d:any)=>{own(d).numericalPolicy.intervalCertified=true;},(d:any)=>{own(d).extra=1;},(d:any)=>{material(d).edges_vertices[0].reverse();},(d:any)=>{material(d).faces_vertices[0].reverse();},(d:any)=>{material(d).faces_faces[0][1]=null;},(d:any)=>{material(d).unknown=1;},(d:any)=>{d.segments[3].angle=91;material(d).edges_foldAngle[3]=91;},(d:any)=>{d.segments[0].a[0]+=1;},(d:any)=>{d.paper.width+=1e-12;},(d:any)=>{d.metadata.materialTopology.foldedVertices=material(d).vertices_coords;},(d:any)=>{d.flatFold={};}];
 for(const mutate of mutations){const d=document('space-curve');mutate(d);assert.equal(linearSpacePolyhedralCPSourceMatches(d),false,mutate.toString());}
 const d=document('linear-chain'),recipe=readLinearSpacePolyhedralCPRecipe(d);d.segments[3].angle=12;material(d).edges_foldAngle[3]=12;const before=JSON.stringify(d);assert.equal(linearSpacePolyhedralCPSourceMatches(d),false);assert.deepEqual(readLinearSpacePolyhedralCPRecipe(d),recipe);assert.equal(JSON.stringify(d),before);assert.equal(linearSpacePolyhedralCPSourceMatches(linearSpacePolyhedralCPDocument(recipe)),true);
});
test('preview snapshots are frozen, independent of later edits and exact changes require a fresh source snapshot',()=>{
 for(const model of ['linear-chain','space-curve'] as const){const p=linearSpacePolyhedralCPPreset(model),snapshot=prepareLinearSpacePolyhedralCPPreview(p);assert.equal(linearSpacePolyhedralCPSourceMatches(snapshot.build()),true);assert.ok(Object.isFrozen(snapshot.source));assert.ok(Object.isFrozen(snapshot.source.graph.vertices_coords));assert.ok(Object.isFrozen(snapshot.recipe));p.leftWidthMm+=.01;assert.throws(()=>snapshot.build(p));snapshot.doc.segments[0].a[0]+=1;assert.equal(linearSpacePolyhedralCPSourceMatches(snapshot.build()),true);}
});
test('ordinary JSON and FOLD reopen full source, independent station topology and source target angles; CP/OPX report unsupported F truthfully',()=>{
 for(const model of ['linear-chain','space-curve'] as const){const d=document(model);for(const format of ['json','fold'] as const){const result=importDocument(exportDocument(d,format).text,format).doc;assert.equal(linearSpacePolyhedralCPSourceMatches(result),true,model+' '+format);assert.deepEqual(result.segments,d.segments);assert.deepEqual(material(result),material(d));assert.deepEqual(own(result),JSON.parse(JSON.stringify(own(d))));}if(model==='space-curve')for(const format of ['cp','opx'] as const)assert.throws(()=>exportDocument(d,format),/F/);else assert.equal(exportDocument(d,'cp',{cpCoordinates:'original'}).text.trim().split(/\r?\n/).length,d.segments.length);}
});
test('ordinary R12 DXF exports every indexed line in actual B/M/V/F layers with one y flip, including the declared F seams',()=>{
 for(const model of ['linear-chain','space-curve'] as const){const d=document(model),pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const r:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)r[pairs[j]]=pairs[j+1];lines.push(r);}assert.equal(lines.length,d.segments.length);lines.forEach((r,i)=>{const s=d.segments[i];assert.equal(r['8'],DXF_LAYERS[s.assignment].name);near([+r['10'],+r['20'],+r['11'],+r['21']],[s.a[0],-s.a[1],s.b[0],-s.b[1]],1e-10);});if(model==='space-curve')assert.equal(lines.filter(r=>r['8']==='FlatLine').length,2);}
});

function nextUp(x:number){const b=new ArrayBuffer(8),v=new DataView(b);if(x===0)return Number.MIN_VALUE;v.setFloat64(0,x);let n=v.getBigUint64(0);n+=x>0?1n:-1n;v.setBigUint64(0,n);return v.getFloat64(0);}
test('saved primitive trace exactly replays synthetic alternate-libm one-ULP results after JSON and FOLD exchange',()=>{
 for(const model of ['linear-chain','space-curve'] as const){
  const p=linearSpacePolyhedralCPPreset(model),base=document(model),target=own(base).arithmeticTrace.calls.find((r:any)=>r.op==='cos'&&Math.abs(r.value)<.99&&Math.abs(r.value)>.01);assert.ok(target);
  const nativeCos=Math.cos;let d:ReturnType<typeof document>;
  try{Math.cos=(t:number)=>{const n=nativeCos(t);return t===target.args[0]?nextUp(n):n;};d=linearSpacePolyhedralCPDocument(p);}finally{Math.cos=nativeCos;}
  assert.notDeepEqual(own(d!).arithmeticTrace,own(base).arithmeticTrace);assert.equal(own(d!).schema,'original-in2414-in2448-polyhedral-cp-v2');assert.equal(linearSpacePolyhedralCPSourceMatches(d!),true);
  assert.ok(own(d!).arithmeticTrace.calls.length<65536);assert.deepEqual(readLinearSpacePolyhedralCPRecipe(d!),p);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d!,format).text,format).doc;assert.equal(linearSpacePolyhedralCPSourceMatches(reopened),true);assert.deepEqual(reopened.segments,d!.segments);assert.deepEqual(material(reopened),material(d!));}
 }
});
test('new trace guard rejects coherent graph plus all segment/source-plane one-ULP changes while preserving trace and recipe',()=>{
 for(const model of ['linear-chain','space-curve'] as const){const d=document(model),g=material(d),index=6,beforeTrace=JSON.stringify(own(d).arithmeticTrace),old=g.vertices_coords[index][1],changed=nextUp(old);
  assert.notEqual(old,changed);g.vertices_coords[index][1]=changed;
  own(d).graph.vertices_coords[index][1]=changed;own(d).sourceGraph.vertices_coords[index][1]=changed;own(d).sourcePlane[index][1]=changed;
  g.edges_vertices.forEach(([a,b]:[number,number],i:number)=>{if(a===index)d.segments[i].a[1]=changed;if(b===index)d.segments[i].b[1]=changed;});
  assert.equal(JSON.stringify(own(d).arithmeticTrace),beforeTrace);assert.equal(linearSpacePolyhedralCPSourceMatches(d),false);
 }
});
test('trace recipe keys, call argument identity, fixed budget, exact zeros, semantic branches and material binding cannot be relaxed',()=>{
 const mutate=[(d:any)=>{own(d).arithmeticTrace.recipeKey+=' ';},(d:any)=>{own(d).arithmeticTrace.maximumRelativeEPS=64;},(d:any)=>{own(d).arithmeticTrace.maximumCalls=65537;},(d:any)=>{own(d).arithmeticTrace.calls.push(own(d).arithmeticTrace.calls[0]);},(d:any)=>{own(d).arithmeticTrace.calls[0].args[0]+=1e-8;},(d:any)=>{own(d).arithmeticTrace.calls[0].op='atan2';},(d:any)=>{own(d).arithmeticTrace.calls[0].value+=1e-8;},(d:any)=>{own(d).arithmeticTrace.extra=true;},(d:any)=>{own(d).arithmeticTrace.calls[0].extra=true;},(d:any)=>{own(d).arithmeticTrace.calls[0].value=Infinity;},(d:any)=>{own(d).recipe.leftWidthMm=nextUp(own(d).recipe.leftWidthMm);},(d:any)=>{own(d).stations[0].spineCPMm[0]=Number.MIN_VALUE;},(d:any)=>{own(d).scope.originalStatic3DPoseCertified=true;},(d:any)=>{own(d).rawSourceTypes[10]='F';},(d:any)=>{own(d).graph.edges_assignment[10]='B';},(d:any)=>{delete own(d).arithmeticTrace;}];
 for(const f of mutate){const d=document('space-curve');f(d);assert.equal(linearSpacePolyhedralCPSourceMatches(d),false,f.toString());}
 const d=document('linear-chain'),zero=own(d).arithmeticTrace.calls.find((r:any)=>r.value===0);assert.ok(zero);zero.value=Number.MIN_VALUE;assert.equal(linearSpacePolyhedralCPSourceMatches(d),false);
});
test('historical real Chrome 003 four files retain bytes and recipe, remain explicitly uncertified without trace, and support explicit rebuild',()=>{
 assert.equal(historical.records.length,4);assert.equal(historical.oldRuntimeTraceFabricated,false);
 for(const row of historical.records){assert.equal(row.actualButtonOrigin,true);const d=importDocument(row.rawText,row.format).doc,p=readLinearSpacePolyhedralCPRecipe(d),before=JSON.stringify(d);
  assert.ok(p);assert.equal(own(d).schema,'original-in2414-in2448-polyhedral-cp-v1');assert.equal(Object.hasOwn(own(d),'arithmeticTrace'),false);assert.equal(linearSpacePolyhedralCPSourceMatches(d),false,row.name+' '+row.format);
  assert.equal(JSON.stringify(d),before);const rebuilt=linearSpacePolyhedralCPDocument(p);assert.equal(linearSpacePolyhedralCPSourceMatches(rebuilt),true);assert.deepEqual(readLinearSpacePolyhedralCPRecipe(rebuilt),p);assert.equal(own(rebuilt).schema,'original-in2414-in2448-polyhedral-cp-v2');
 }
 for(const row of historical.sameRuntimeLegacyNodeDocuments){const d=structuredClone(row.document),before=JSON.stringify(d);assert.equal(own(d).schema,'original-in2414-in2448-polyhedral-cp-v1');assert.equal(linearSpacePolyhedralCPSourceMatches(d),true,row.model+' legacy same-runtime');assert.equal(JSON.stringify(d),before);}
});
