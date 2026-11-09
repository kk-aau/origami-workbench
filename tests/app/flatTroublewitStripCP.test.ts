import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateFlatTroublewitStripRecipe,flatTroublewitStripPreset,evaluateFlatTroublewitStripSource,generateFlatTroublewitStripDocument,readFlatTroublewitStripRecipe,flatTroublewitStripSourceMatches,flatTroublewitStripScene,prepareFlatTroublewitStripPreview,type FlatTroublewitStripRecipe} from '../../src/app/flatTroublewitStripCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc,Point} from '../../src/core/types';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/flat-troublewit-strip-source-1012.json',import.meta.url),'utf8'));
const cases=fixture.cases;
const own=(d:Doc)=>d.metadata!.originalFlatTroublewitStrip as any;
const graph=(d:Doc)=>(d.metadata!.materialTopology as any).graph;
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=Math.max(3e-11,512*Number.EPSILON*Math.max(1,Math.abs(b))),`${a} vs ${b}`);
function values(a:any,b:any){if(typeof b==='number')close(a,b);else if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((v,i)=>values(a[i],v));}else if(b&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());Object.keys(b).forEach(k=>values(a[k],b[k]));}else assert.equal(a,b);}
function nextUp(x:number){if(!Number.isFinite(x))return x;if(x===0)return Number.MIN_VALUE;const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,x);const bits=view.getBigUint64(0);view.setBigUint64(0,x>0?bits+1n:bits-1n);return view.getFloat64(0);}

test('independent original flat-strip/Troublewit literal CP and reversed face-tree FF oracle reproduce all 12 samples',()=>{
 assert.equal(fixture.notebookSHA256,'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9');assert.equal(fixture.wolframExecuted,false);assert.equal(cases.length,12);
 for(const row of cases){const before=structuredClone(row.recipe),ev=evaluateFlatTroublewitStripSource(row.recipe),d=generateFlatTroublewitStripDocument(row.recipe),g=graph(d),e=row.expected;
  assert.deepEqual(row.recipe,before);assert.equal(flatTroublewitStripSourceMatches(d),true,row.name);
  for(const key of ['edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[key],e.graph[key],row.name+'/'+key);
  values(g.vertices_coords,e.graph.vertices_coords);
  for(const key of ['pathMm','widthMm','spreadAngleDeg','distancesMm','bendAnglesDeg','sectorAnglesDeg','centersMm','bottomCoordinatesMm','topCoordinatesMm','foldTypes','bottomRow','topRow','bottomVertices','topVertices'])values((ev as any)[key],e[key]);
  values(ev.foldedState.vertices2D,e.foldedVertices2D);assert.deepEqual(ev.foldedState.faceNormalsZ,e.faceNormalsZ);assert.ok(e.maximumIndependentFaceMetricErrorMm<1e-9);
 }
});

test('each generated material is one complete disk; validated static FF carries every face, shared axis and signed target endpoint',()=>{
 for(const row of cases){const d=generateFlatTroublewitStripDocument(row.recipe),m=inspectMaterialTopology(d),ev=evaluateFlatTroublewitStripSource(row.recipe);if(!m.ok)assert.fail(m.reason);
  assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(m.startingFace,0);assert.deepEqual(m.foldedVertices,ev.foldedState.vertices2D);
  const g=m.graph;assert.equal(g.vertices_coords.length-g.edges_vertices.length+g.faces_vertices!.length,1);assert.equal(g.faces_vertices!.length,ev.pathMm.length-1);
  assert.ok(g.edges_vertices.every((edge,i)=>g.edges_faces![i].length===(g.edges_assignment[i]==='B'?1:2)));
  assert.ok(ev.foldedState.hinges.every(h=>Math.abs(h.signedTargetDeg!)===180&&h.normalDot===-1&&h.endpointAngleErrorDeg===0));
  assert.equal(ev.foldedState.proof.staticFaceIsometryChecked,true);assert.equal(ev.foldedState.proof.sharedAxisClosureChecked,true);
  assert.equal(own(d).evidence.continuousRigidPathChecked,false);assert.equal(own(d).evidence.selfCollisionChecked,false);assert.equal(own(d).evidence.wholeSheetLayerOrderChecked,false);
 }
});

test('original triangle apex is one exact shared material identity; Top/Bottom source indices remain usable building blocks',()=>{
 const p=cases.find((row:any)=>row.name==='original-triangle').recipe,ev=evaluateFlatTroublewitStripSource(p),d=generateFlatTroublewitStripDocument(p);
 assert.equal(ev.graph.vertices_coords.length,7);assert.equal(d.segments.length,9);assert.equal(ev.graph.faces_vertices![0].length,3);
 assert.deepEqual(ev.bottomRow,[0,1,2,3]);assert.deepEqual(ev.topRow,[0,4,5,6]);assert.equal(ev.bottomRow[0],ev.topRow[0]);
 assert.deepEqual(ev.source.BottomVertices1Based,[1,2,3,4]);assert.deepEqual(ev.source.TopVertices1Based,[1,5,6,7]);
 assert.deepEqual(ev.graph.vertices_coords[0],[0,0]);assert.ok(d.segments.every(s=>Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1])>1e-6));
 assert.deepEqual(ev.source.rawBottomVertices1Based,ev.bottomRow.map(i=>i+1));assert.deepEqual(ev.source.rawTopVertices1Based,ev.topRow.map(i=>i+1));
});

test('Troublewit retains the original fixed width, canonical lengths and absolute direction convention',()=>{
 const p=flatTroublewitStripPreset('troublewit'),c=flatTroublewitStripPreset('canonical-troublewit'),a=evaluateFlatTroublewitStripSource(p),b=evaluateFlatTroublewitStripSource(c);
 assert.equal(a.widthMm,1);assert.equal(b.widthMm,1);assert.deepEqual(a.graph,b.graph);assert.deepEqual(a.foldedState,b.foldedState);
 assert.equal(a.source.definitionCell,'In[2374]');assert.equal(b.source.definitionCell,'In[2376]');
 assert.deepEqual(a.pathMm[0],[1.1,0]);close(a.pathMm[1][0]-1.1,3*Math.cos(179*Math.PI/180));close(a.pathMm[1][1],3*Math.sin(179*Math.PI/180));
 assert.deepEqual(a.foldTypes,['V','M','V','M']);assert.deepEqual(a.source.supportedExplicitEdgeTypes,['M','V']);
});

test('source CP stays at the origin while FF retains the raw target position and millimetres with no extra flip or scaling',()=>{
 const p=flatTroublewitStripPreset();if(p.model!=='flat-strip')assert.fail('preset');
 const a=evaluateFlatTroublewitStripSource(p),b=evaluateFlatTroublewitStripSource({...p,pathMm:p.pathMm.map(([x,y]):Point=>[2*x+10,2*y-4]),widthMm:.6});
 values(b.graph.vertices_coords,a.graph.vertices_coords.map(v=>v.map(n=>2*n)));values(b.foldedState.vertices2D,a.foldedState.vertices2D.map(([x,y])=>[2*x+10,2*y-4]));
 assert.deepEqual(a.graph.vertices_coords[a.bottomRow[0]],[0,-.15]);assert.deepEqual(b.graph.vertices_coords[b.bottomRow[0]],[0,-.3]);
 assert.deepEqual(b.pathMm[0],[10,-4]);assert.equal(b.source.unitConvention,'1 original parameter unit = 1 mm; CP at origin, source folded alignment follows the raw path');
});

test('explicit original M/V changes signed targets without pretending the indistinguishable planar half-turn endpoint determines their signs',()=>{
 const p=flatTroublewitStripPreset();if(p.model!=='flat-strip')assert.fail('preset');
 const a=evaluateFlatTroublewitStripSource(p),b=evaluateFlatTroublewitStripSource({...p,edgeTypes:['M','M']});
 assert.deepEqual(a.graph.vertices_coords,b.graph.vertices_coords);assert.deepEqual(a.foldedState.vertices2D,b.foldedState.vertices2D);assert.notDeepEqual(a.graph.edges_assignment,b.graph.edges_assignment);
 assert.deepEqual(b.foldedState.hinges.map(h=>h.signedTargetDeg),[-180,-180]);assert.equal(b.foldedState.proof.signedHalfTurnGeometryAmbiguityRetained,true);
 const d=generateFlatTroublewitStripDocument({...p,edgeTypes:['M','M']});assert.equal(flatTroublewitStripSourceMatches(d),true);
});

test('invalid fields, singular source lines and malformed lists fail before mutating or silently replacing raw choices',()=>{
 const p=flatTroublewitStripPreset();
 for(const key of ['widthMm','spreadAngleDeg'])for(const v of [null,true,'2',NaN,Infinity,{},[]])assert.throws(()=>validateFlatTroublewitStripRecipe({...p,[key]:v}));
 for(const change of [{widthMm:-1},{widthMm:0,spreadAngleDeg:0},{spreadAngleDeg:61},{pathMm:[[0,0],[0,0]]},{pathMm:[[0,0],[1,0],[2,0]]},{pathMm:[[0,0],[1,0,0]]},{edgeTypes:['U','V']},{edgeTypes:['M']},{extra:1}]){const raw={...p,...change},before=structuredClone(raw);assert.throws(()=>generateFlatTroublewitStripDocument(raw as any));assert.deepEqual(raw,before);}
 for(const raw of [{...flatTroublewitStripPreset('troublewit'),lengthsMm:[3]},{...flatTroublewitStripPreset('troublewit'),directionsDeg:[NaN]},{...flatTroublewitStripPreset('canonical-troublewit'),directionsDeg:[0,90]},{...flatTroublewitStripPreset('canonical-troublewit'),widthMm:2}])assert.throws(()=>validateFlatTroublewitStripRecipe(raw));
});

test('CP crossing/row reversal and original near-point merging requirements are rejected rather than snapping or shortening',()=>{
 const p=flatTroublewitStripPreset();if(p.model!=='flat-strip')assert.fail('preset');
 const tooWide={...p,widthMm:10},before=structuredClone(tooWide);assert.throws(()=>generateFlatTroublewitStripDocument(tooWide),/badbottom|badtop|材料/);assert.deepEqual(tooWide,before);
 const nearBank:FlatTroublewitStripRecipe={model:'flat-strip',pathMm:[[0,0],[.1500005,0],[.1500005,1]],widthMm:.3,spreadAngleDeg:0,edgeTypes:'automatic'},bankBefore=structuredClone(nearBank);
 assert.throws(()=>generateFlatTroublewitStripDocument(nearBank),/SamePtQ/);assert.deepEqual(nearBank,bankBefore);
});

test('two-point sheets and exact 180-degree return folds stay valid; intentional folded overlap is not a false layer-order certificate',()=>{
 for(const name of ['straight-two-points','exact-u-turn']){const row=cases.find((r:any)=>r.name===name),d=generateFlatTroublewitStripDocument(row.recipe),ev=evaluateFlatTroublewitStripSource(row.recipe);
  assert.equal(flatTroublewitStripSourceMatches(d),true);assert.equal(ev.foldedState.proof.wholeSheetLayerOrderChecked,false);assert.equal(ev.foldedState.proof.continuousRigidPathChecked,false);
 }
 const row=cases.find((r:any)=>r.name==='exact-u-turn'),ev=evaluateFlatTroublewitStripSource(row.recipe);assert.deepEqual(ev.bendAnglesDeg,[180]);assert.deepEqual(ev.sectorAnglesDeg,[90,90,90]);
});

test('finite creative budget accepts 128 explicit panels and rejects a larger path without truncation',()=>{
 const p:FlatTroublewitStripRecipe={model:'flat-strip',pathMm:Array.from({length:129},(_,i)=>[i,i%2]),widthMm:.1,spreadAngleDeg:0,edgeTypes:'automatic'},d=generateFlatTroublewitStripDocument(p),m=inspectMaterialTopology(d);if(!m.ok)assert.fail(m.reason);
 assert.deepEqual([m.graph.vertices_coords.length,m.graph.edges_vertices.length,m.graph.faces_vertices!.length],[258,385,128]);assert.equal(flatTroublewitStripSourceMatches(d),true);
 assert.throws(()=>validateFlatTroublewitStripRecipe({...p,pathMm:[...p.pathMm,[129,1]]}),/2–129/);
});

test('full source guard rejects recipe, boundary identity, material binding, static endpoint, target, scale and scope tampering',()=>{
 const changes:Array<(d:Doc)=>void>=[
  d=>{own(d).recipe.extra=1;},d=>{own(d).recipe.widthMm+=1e-12;},d=>{own(d).derived.pathMm[0][0]=Number.MIN_VALUE;},d=>{own(d).source.BottomVertices1Based[0]=2;},
  d=>{own(d).derived.bottomRow[0]=1;},d=>{own(d).derived.sourceGraph.vertices_coords[0][0]=1;},d=>{own(d).derived.foldedState.hinges[0].signedTargetDeg+=1e-12;},
  d=>{own(d).derived.foldedState.faceNormalsZ[0]=-1;},d=>{own(d).derived.foldedState.vertices2D[0][0]+=.1;},d=>{own(d).evidence.wholeSheetLayerOrderChecked=true;},
  d=>{graph(d).edges_foldAngle[0]=180;},d=>{graph(d).faces_edges[0][0]=1;},d=>{d.segments[0].a[0]+=.01;},d=>{d.segments[0].id='new';},d=>{d.paper.width+=1e-12;},
  d=>{(d.metadata!.materialTopology as any).startingFace=1;},d=>{(d.metadata!.materialTopology as any).graph.extra=1;},d=>{(d.metadata!.materialTopology as any).extra=1;},d=>{d.objects=[{kind:'mark',id:'extra',a:[0,0],b:[1,1],color:'#000000'}];}
 ];
 for(const change of changes){const d=generateFlatTroublewitStripDocument(flatTroublewitStripPreset());change(d);assert.equal(flatTroublewitStripSourceMatches(d),false,change.toString());}
 const renamed=generateFlatTroublewitStripDocument(flatTroublewitStripPreset());renamed.name='用户作品';assert.equal(flatTroublewitStripSourceMatches(renamed),true);
});

test('manual geometry edits keep readable recipes for explicit rebuild without claiming the changed document still matches its source',()=>{
 for(const model of ['flat-strip','troublewit','canonical-troublewit'] as const){const p=flatTroublewitStripPreset(model),d=generateFlatTroublewitStripDocument(p);d.segments[0].a[0]+=.1;
  assert.equal(flatTroublewitStripSourceMatches(d),false);assert.deepEqual(readFlatTroublewitStripRecipe(d),p);assert.equal(flatTroublewitStripSourceMatches(generateFlatTroublewitStripDocument(readFlatTroublewitStripRecipe(d)!)),true);
 }
});

test('JSON/FOLD exchange preserves every indexed material edge, Top/Bottom source identity, target and validated static FF',()=>{
 for(const row of cases){const d=generateFlatTroublewitStripDocument(row.recipe);for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
  assert.equal(flatTroublewitStripSourceMatches(reopened),true,row.name+'/'+format);assert.deepEqual(graph(reopened),graph(d));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened),own(d));assert.deepEqual(readFlatTroublewitStripRecipe(reopened),row.recipe);
 }}
});

test('ordinary R12 DXF reads back every original edge in order, type, scale and position with exactly one Y reflection',()=>{
 for(const row of cases){const d=generateFlatTroublewitStripDocument(row.recipe),pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Array<Record<string,string>>=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const line:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)line[pairs[j]]=pairs[j+1];lines.push(line);}
  assert.equal(lines.length,d.segments.length);lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([+line['10'],+line['20'],+line['11'],+line['21']],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(v=>Object.is(v,-0)?0:v));});
 }
});

test('atomic preview and scene builders use the same checked material; navigation data carries no false motion or ordering claim',()=>{
 for(const model of ['flat-strip','troublewit','canonical-troublewit'] as const){const p=flatTroublewitStripPreset(model),before=structuredClone(p),preview=prepareFlatTroublewitStripPreview(p),scene=flatTroublewitStripScene(p);
  assert.deepEqual(p,before);assert.deepEqual(preview.scene,scene);assert.deepEqual(preview.build(),preview.doc);assert.equal(flatTroublewitStripSourceMatches(preview.doc),true);
  assert.deepEqual(scene.vertices,preview.source.foldedState.vertices2D.map(([x,y])=>[x,y,0]));assert.equal(scene.motion,false);assert.equal(scene.layers,false);
  assert.throws(()=>preview.build({...p,extra:1}));assert.deepEqual(p,before);
 }
});

test('persisted transcendental leaf trace survives simulated 1 ULP alternate runtime arithmetic and JSON/FOLD without relaxing geometry',()=>{
 const native={cos:Math.cos,sin:Math.sin,atan2:Math.atan2,hypot:Math.hypot},documents:Doc[]=[];
 try{
  Math.cos=a=>nextUp(native.cos(a));Math.sin=a=>nextUp(native.sin(a));
  Math.atan2=(y,x)=>x===0||y===0?native.atan2(y,x):nextUp(native.atan2(y,x));
  Math.hypot=(...v)=>{const n=native.hypot(...v);return n===0?0:nextUp(n);};
  for(const row of cases)documents.push(generateFlatTroublewitStripDocument(row.recipe));
 }finally{Object.assign(Math,native);}
 assert.ok(documents.some((d,i)=>JSON.stringify(d.segments)!==JSON.stringify(generateFlatTroublewitStripDocument(cases[i].recipe).segments)),'mock must actually produce a distinct persisted native result');
 for(let i=0;i<documents.length;i++){const d=documents[i];assert.equal(flatTroublewitStripSourceMatches(d),true,cases[i].name+'/persisted trace');
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.equal(flatTroublewitStripSourceMatches(reopened),true,cases[i].name+'/'+format);assert.deepEqual(graph(reopened),graph(d));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened).derived.sourceTrace,own(d).derived.sourceTrace);}
 }
});

test('coherent 1 ULP geometry or FF edits without changing the source trace are rejected even with updated graph seeds and endpoint bindings',()=>{
 const d=generateFlatTroublewitStripDocument(flatTroublewitStripPreset()),beforeTrace=JSON.stringify(own(d).derived.sourceTrace),g=graph(d),vertex=1;
 g.vertices_coords[vertex][0]=nextUp(g.vertices_coords[vertex][0]);own(d).derived.sourceGraph=structuredClone(g);
 const station=own(d).derived.bottomRow.indexOf(vertex);own(d).derived.bottomCoordinatesMm[station]=[...g.vertices_coords[vertex]];
 g.edges_vertices.forEach(([a,b]:[number,number],i:number)=>{d.segments[i].a=[...g.vertices_coords[a]] as Point;d.segments[i].b=[...g.vertices_coords[b]] as Point;});
 assert.equal(inspectMaterialTopology(d).ok,true,'edit is deliberately below physical geometry tolerance');assert.equal(JSON.stringify(own(d).derived.sourceTrace),beforeTrace);assert.equal(flatTroublewitStripSourceMatches(d),false);
 const ff=generateFlatTroublewitStripDocument(flatTroublewitStripPreset()),actual=(ff.metadata!.materialTopology as any).foldedVertices;
 actual[vertex][0]=nextUp(actual[vertex][0]);own(ff).derived.foldedState.vertices2D=structuredClone(actual);
 assert.equal(inspectMaterialTopology(ff).ok,true);assert.equal(flatTroublewitStripSourceMatches(ff),false);
});

test('persisted trace never widens literal zero, signed 180 return, original first anchor or pure arithmetic source identities',()=>{
 for(const change of [(d:Doc)=>{own(d).derived.sourceTrace.sectorUnits[0][0]=Number.MIN_VALUE;},(d:Doc)=>{own(d).derived.sourceTrace.boundaryUnits[0][1]=Number.MIN_VALUE;},(d:Doc)=>{own(d).derived.sectorAnglesDeg[1]=nextUp(own(d).derived.sectorAnglesDeg[1]);},(d:Doc)=>{own(d).derived.sourceTrace.distancesMm[0]+=.01;}]){const d=generateFlatTroublewitStripDocument(flatTroublewitStripPreset());change(d);assert.equal(flatTroublewitStripSourceMatches(d),false);}
 const row=cases.find((r:any)=>r.name==='exact-u-turn'),d=generateFlatTroublewitStripDocument(row.recipe);own(d).derived.sourceTrace.bendAnglesDeg[0]=nextUp(180);assert.equal(flatTroublewitStripSourceMatches(d),false);
 const straight=generateFlatTroublewitStripDocument({model:'flat-strip',pathMm:[[0,0],[1,0]],widthMm:1,spreadAngleDeg:0,edgeTypes:'automatic'});own(straight).derived.sourceTrace.folding.firstAngleRad=Number.MIN_VALUE;assert.equal(flatTroublewitStripSourceMatches(straight),false);
});
