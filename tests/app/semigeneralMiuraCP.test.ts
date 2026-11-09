import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateSemiGeneralMiuraSource,generateSemiGeneralMiuraDocument,semiGeneralMiuraPreset,validateSemiGeneralMiuraRecipe,readSemiGeneralMiuraRecipe,semiGeneralMiuraSourceMatches,type SemiGeneralMiuraRecipe} from '../../src/app/semigeneralMiuraCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc,Point} from '../../src/core/types';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/semigeneral-miura-source-1011.json',import.meta.url),'utf8'));
const heightDelta=JSON.parse(fs.readFileSync(new URL('../fixtures/semigeneral-miura-source-delta-1012.json',import.meta.url),'utf8'));
const cases=fixture.cases;
const own=(d:Doc)=>d.metadata!.originalSemiGeneralMiura as any;
const graph=(d:Doc)=>(d.metadata!.materialTopology as any).graph;
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=Math.max(2e-11,256*Number.EPSILON*Math.max(1,Math.abs(b))),`${a} versus ${b}`);
function numbers(a:any,b:any){if(typeof b==='number')close(a,b);else if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((v,i)=>numbers(a[i],v));}else if(b&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());Object.keys(b).forEach(k=>numbers(a[k],b[k]));}else assert.equal(a,b);}

test('independent source literal oracle: original A/B/P/Tachi presets and eight variations reproduce full indexed CP',()=>{
 assert.equal(fixture.wolframExecuted,false);assert.equal(fixture.notebookSHA256,'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9');
 assert.equal(cases.length,12);
 for(const row of cases){const before=structuredClone(row.recipe),ev=evaluateSemiGeneralMiuraSource(row.recipe),d=generateSemiGeneralMiuraDocument(row.recipe),g=graph(d),e=row.expected;
  assert.deepEqual(row.recipe,before);assert.equal(semiGeneralMiuraSourceMatches(d),true,row.name);
  for(const k of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[k],e.graph[k],row.name+'/'+k);
  numbers(g.vertices_coords,e.graph.vertices_coords);numbers(g.edges_foldAngle,e.graph.edges_foldAngle);
  for(const k of Object.keys(e).filter(k=>k!=='graph'))numbers((ev as any)[k],e[k]);
 }
});

test('helper material validation: every parameterized result is one physical quad disk with a complete edge-face contract',()=>{
 for(const row of cases){const d=generateSemiGeneralMiuraDocument(row.recipe),g=graph(d),m=inspectMaterialTopology(d),n=row.expected.distancesMm.length,v=2*row.recipe.repeatPairs;
  if(!m.ok)assert.fail(m.reason);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[(n+1)*(v+1),2*n*v+n+v,n*v]);
  assert.equal(g.vertices_coords.length-g.edges_vertices.length+g.faces_vertices.length,1);assert.equal(g.edges_assignment.filter((a:string)=>a==='B').length,2*(n+v));
  assert.ok(g.faces_vertices.every((f:number[])=>f.length===4));assert.equal(m.foldedVertices,undefined);assert.equal(m.startingFace,undefined);
  assert.deepEqual(own(d).evidence,{finiteMaterialValidated:true,CPOnly:true,original3DConstructionReproduced:false,staticGlobalIsometryChecked:false,wholeSheetLayerOrderChecked:false,continuousRigidPathChecked:false,selfCollisionChecked:false,wolframExecuted:false});
 }
});

test('source ArcCot signed principal branch avoids >180 major angles for obtuse sectors and both gamma signs',()=>{
 for(const gamma of [45,-45]){const p={...semiGeneralMiuraPreset('angles'),minorFoldAngleDeg:gamma} as SemiGeneralMiuraRecipe,ev=evaluateSemiGeneralMiuraSource(p),g=ev.graph;
  const a=120*Math.PI/180,x=Math.cos(a)/Math.tan(gamma*Math.PI/360),expected=Math.abs(2*Math.atan(1/x))*180/Math.PI;
  const firstMajor=4*3+1;close(Math.abs(g.edges_foldAngle[firstMajor]!),expected);assert.ok(expected<180);
  assert.ok(g.edges_foldAngle.every(v=>v!==null&&Math.abs(v)<=180));
 }
});

test('P endpoint defaults, signed CCW bends, design/render split and width/2 cot correction retain original source semantics',()=>{
 const p=semiGeneralMiuraPreset('path');assert.equal(p.mode,'path');if(p.mode!=='path')return;
 const ev=evaluateSemiGeneralMiuraSource(p),render=evaluateSemiGeneralMiuraSource({...p,minorFoldAngleDeg:120});
 assert.deepEqual(ev.bendAnglesDeg,[180,90,-90,180]);assert.deepEqual(ev.sectorAnglesDeg,render.sectorAnglesDeg);assert.deepEqual(ev.distancesMm,render.distancesMm);
 const alpha=ev.sectorAnglesDeg.map(a=>a===90?0:1/Math.tan(a*Math.PI/180));
 ev.distancesMm.forEach((d,i)=>close(d,ev.pathLengthsMm![i]-.125*alpha[i+1]+.125*alpha[i]));
 assert.deepEqual(ev.pathMm,p.pathMm);assert.equal(ev.sectorAnglesDeg[0],90);assert.equal(ev.sectorAnglesDeg.at(-1),90);
 assert.notDeepEqual(ev.graph.edges_foldAngle,render.graph.edges_foldAngle);
});

test('Tachi beta/design gamma select target path but its P scalar overload uses render gamma for the CP',()=>{
 const p=semiGeneralMiuraPreset('tachi');if(p.mode!=='tachi')assert.fail('preset');const ev=evaluateSemiGeneralMiuraSource(p);
 assert.equal(ev.source.pathScalarOverload,'In[2554]');assert.equal(ev.tachi!.pScalarDesignGammaDeg,105);
 const asP: SemiGeneralMiuraRecipe={mode:'path',stripWidthMm:p.stripWidthMm,repeatPairs:p.repeatPairs,minorFoldAngleDeg:p.minorFoldAngleDeg,designMinorFoldAngleDeg:p.minorFoldAngleDeg,pathMm:ev.pathMm!,firstBendAngleDeg:180,lastBendAngleDeg:180},sourceP=evaluateSemiGeneralMiuraSource(asP);
 assert.deepEqual(ev.graph,sourceP.graph);assert.deepEqual(ev.distancesMm,sourceP.distancesMm);
 const wrong=evaluateSemiGeneralMiuraSource({...asP,designMinorFoldAngleDeg:p.designMinorFoldAngleDeg});assert.notDeepEqual(ev.sectorAnglesDeg,wrong.sectorAnglesDeg);
 assert.deepEqual(ev.pathMm!.slice(0,2),[[0,0],[1,0]]);
});

test('millimetres preserve even-row w cot offset, negative boundaries and raw path metadata with no recenter or scale',()=>{
 const row=cases.find((r:any)=>r.name==='angles-original-negative-offset'),d=generateSemiGeneralMiuraDocument(row.recipe),g=graph(d);
 assert.ok(g.vertices_coords[0][0]<0);close(g.vertices_coords[0][0],.2/Math.tan(120*Math.PI/180));assert.equal(g.vertices_coords[0][1],0);assert.deepEqual(g.vertices_coords[3],[0,.2]);
 const p={...row.recipe,stripWidthMm:.4,distancesMm:[4,6]},scaled=graph(generateSemiGeneralMiuraDocument(p));numbers(scaled.vertices_coords,g.vertices_coords.map((v:number[])=>v.map(n=>2*n)));
 const path=cases.find((r:any)=>r.name==='path-two-point-literal'),ep=evaluateSemiGeneralMiuraSource(path.recipe);assert.deepEqual(ep.pathMm,[[100,20],[103,24]]);assert.deepEqual(ep.graph.vertices_coords[0],[0,0]);assert.equal(ep.distancesMm[0],5);
});

test('strict finite parameter budget rejects malformed values and literal A/P/Tachi poles without replacement',()=>{
 const p=semiGeneralMiuraPreset('path');
 for(const key of ['stripWidthMm','repeatPairs','minorFoldAngleDeg','designMinorFoldAngleDeg','firstBendAngleDeg','lastBendAngleDeg'])for(const v of [null,true,'2',NaN,Infinity,{},[]])assert.throws(()=>validateSemiGeneralMiuraRecipe({...p,[key]:v}));
 for(const change of [{repeatPairs:9},{repeatPairs:1.2},{stripWidthMm:0},{minorFoldAngleDeg:0},{minorFoldAngleDeg:180},{extra:1},{pathMm:[[0,0],[0,0]]},{pathMm:[[0,0],[1,0,0]]},{pathMm:Array.from({length:34},(_,i)=>[i,i%2])},{mode:'general'}])assert.throws(()=>generateSemiGeneralMiuraDocument({...p,...change} as any));
 for(const sectorAnglesDeg of [[90,90,90],[90,190,90],[180,60,90],[0,60,90]])assert.throws(()=>generateSemiGeneralMiuraDocument({mode:'angles',sectorAnglesDeg,distancesMm:[1,1],stripWidthMm:.25,repeatPairs:1,minorFoldAngleDeg:45}),/badangs|极点/);
 assert.throws(()=>generateSemiGeneralMiuraDocument({...p,pathMm:[[0,0],[1,0],[2,0]]} as any),/Cot\[0\]/);
 assert.throws(()=>generateSemiGeneralMiuraDocument({...p,pathMm:[[0,0],[1,0],[0,0]]} as any),/badangs/);
 for(const beta0Deg of [0,180,-180,NaN,Infinity])assert.throws(()=>generateSemiGeneralMiuraDocument({...semiGeneralMiuraPreset('tachi'),beta0Deg} as any));
});

test('actual material failure leaves raw parameters untouched and does not delete crossing edges or change the width',()=>{
 const p={mode:'angles',stripWidthMm:10,repeatPairs:1,minorFoldAngleDeg:45,sectorAnglesDeg:[90,10,90],distancesMm:[1,1]} as SemiGeneralMiuraRecipe,before=structuredClone(p);
 const ev=evaluateSemiGeneralMiuraSource(p);assert.equal(ev.graph.edges_vertices.length,12);assert.throws(()=>generateSemiGeneralMiuraDocument(p),/材料/);assert.deepEqual(p,before);
});

test('declared finite budget accepts a full 32 by 16 quad sheet and bounds Tachi first segment plus repeated four-segment groups',()=>{
 const p:SemiGeneralMiuraRecipe={mode:'angles',stripWidthMm:.25,repeatPairs:8,minorFoldAngleDeg:45,sectorAnglesDeg:Array.from({length:33},(_,i)=>i===0||i===32?90:i%2?60:120),distancesMm:Array(32).fill(1)},d=generateSemiGeneralMiuraDocument(p);
 assert.equal(graph(d).faces_vertices.length,512);assert.equal(semiGeneralMiuraSourceMatches(d),true);
 const t=semiGeneralMiuraPreset('tachi');if(t.mode!=='tachi')assert.fail('preset');assert.equal(evaluateSemiGeneralMiuraSource({...t,lengthRepeats:7}).distancesMm.length,29);assert.throws(()=>validateSemiGeneralMiuraRecipe({...t,lengthRepeats:8}),/1–7/);
});

test('fresh full source guard rejects source, primitive, signed angle, graph, corner, segment, paper and evidence tampering',()=>{
 const changes:Array<(d:Doc)=>void>=[
  d=>{own(d).recipe.extra=1;},d=>{own(d).recipe.minorFoldAngleDeg+=1e-12;},d=>{own(d).recipe.designMinorFoldAngleDeg+=1e-13;},d=>{own(d).derived.pathMm[0][0]=Number.MIN_VALUE;},
  d=>{own(d).derived.sectorAnglesDeg[0]+=1e-12;},d=>{own(d).derived.bendAnglesDeg[0]+=1e-12;},d=>{own(d).derived.distancesMm[0]+=.01;},
  d=>{own(d).derived.source.borderOverride=false;},d=>{own(d).derived.source.replayTolerance.transcendentalAbsolute*=2;},d=>{own(d).evidence.staticGlobalIsometryChecked=true;},
  d=>{graph(d).extra=1;},d=>{graph(d).faces_edges[0][0]=1;},d=>{graph(d).edges_faces[0].push(1);},d=>{graph(d).faces_faces[0][0]=0;},
  d=>{graph(d).edges_vertices[0][0]+=.01;},d=>{d.segments[0].id='changed';},d=>{d.segments[0].a[0]+=.1;},
  d=>{const i=d.segments.findIndex(s=>s.assignment==='V');graph(d).edges_foldAngle[i]=d.segments[i].angle!+1e-13;d.segments[i].angle=graph(d).edges_foldAngle[i];},
  d=>{graph(d).vertices_coords[0][1]=Number.MIN_VALUE;d.segments.filter(s=>s.a[0]===0&&s.a[1]===0).forEach(s=>s.a[1]=Number.MIN_VALUE);},
  d=>{d.paper.width+=1e-12;},d=>{d.objects=[{id:'extra',kind:'mark',a:[0,0],b:[1,0],color:'#000000'}];},d=>{(d.metadata!.materialTopology as any).foldedVertices=graph(d).vertices_coords;},
 ];
 for(const change of changes){const d=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset());change(d);assert.equal(semiGeneralMiuraSourceMatches(d),false,change.toString());}
 const a=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset('angles'));own(a).derived.distancesMm[0]+=1e-13;assert.equal(semiGeneralMiuraSourceMatches(a),false);
 const t=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset('tachi'));own(t).derived.tachi.pScalarDesignGammaDeg+=1e-13;assert.equal(semiGeneralMiuraSourceMatches(t),false);
 const renamed=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset());renamed.name='用户改名';assert.equal(semiGeneralMiuraSourceMatches(renamed),true);
});

test('transcendental runtime budget accepts coherent numerical replay while repeated source identities remain exact',()=>{
 const d=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset()),g=graph(d),column=1,n=4;
 for(let i=column;i<g.vertices_coords.length;i+=2*n)g.vertices_coords[i][0]+=4e-15;
 for(let i=0;i<d.segments.length;i++){const [a,b]=g.edges_vertices[i];d.segments[i].a=[...g.vertices_coords[a]] as Point;d.segments[i].b=[...g.vertices_coords[b]] as Point;}
 const xs=g.vertices_coords.map((v:number[])=>v[0]);d.paper.width=Math.max(...xs)-Math.min(...xs);
 assert.equal(semiGeneralMiuraSourceMatches(d),true);
 g.vertices_coords[column][0]+=4e-15;for(let i=0;i<d.segments.length;i++){const [a,b]=g.edges_vertices[i];d.segments[i].a=[...g.vertices_coords[a]] as Point;d.segments[i].b=[...g.vertices_coords[b]] as Point;}
 assert.equal(semiGeneralMiuraSourceMatches(d),false);
});

test('read source survives manual changes for explicit regeneration without claiming current graph is still original',()=>{
 for(const mode of ['angles','bends','path','tachi'] as const){const p=semiGeneralMiuraPreset(mode),d=generateSemiGeneralMiuraDocument(p),i=d.segments.findIndex(s=>s.assignment==='M');d.segments[i].assignment='U';d.segments[i].angle=null;graph(d).edges_assignment[i]='U';graph(d).edges_foldAngle[i]=null;
  assert.equal(semiGeneralMiuraSourceMatches(d),false);assert.deepEqual(readSemiGeneralMiuraRecipe(d),p);assert.equal(semiGeneralMiuraSourceMatches(generateSemiGeneralMiuraDocument(readSemiGeneralMiuraRecipe(d)!)),true);
 }
});

test('actual JSON/FOLD exchange preserves the source recipe and every indexed corner, assignment and target angle',()=>{
 for(const mode of ['angles','bends','path','tachi'] as const){const p=semiGeneralMiuraPreset(mode),d=generateSemiGeneralMiuraDocument(p);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.equal(semiGeneralMiuraSourceMatches(reopened),true,mode+'/'+format);assert.deepEqual(graph(reopened),graph(d));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(readSemiGeneralMiuraRecipe(reopened),p);}
 }
});

test('ordinary R12 DXF reads every source edge in order with the expected assignment and one Y reflection',()=>{
 for(const mode of ['angles','bends','path','tachi'] as const){const d=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset(mode)),pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Array<Record<string,string>>=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.equal(lines.length,d.segments.length);lines.forEach((row,i)=>{const s=d.segments[i];assert.equal(row['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([+row['10'],+row['20'],+row['11'],+row['21']],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(v=>Object.is(v,-0)?0:v));});
 }
});

test('literal Tachi unused Sec height pole permits valid beta +/-90 CP without pretending the height is finite',()=>{
 for(const beta0Deg of [90,-90]){
  const p={...semiGeneralMiuraPreset('tachi'),beta0Deg} as SemiGeneralMiuraRecipe,before=structuredClone(p);
  assert.deepEqual(validateSemiGeneralMiuraRecipe(p),p);const ev=evaluateSemiGeneralMiuraSource(p),d=generateSemiGeneralMiuraDocument(p),m=inspectMaterialTopology(d);
  assert.deepEqual(p,before);assert.equal(ev.tachi!.zeta0Deg,90);assert.equal(ev.tachi!.unusedOriginalHeight,null);
  assert.equal(ev.tachi!.unusedOriginalHeightStatus,'source-sec-pole-unused-by-cp');assert.equal(semiGeneralMiuraSourceMatches(d),true);
  if(!m.ok)assert.fail(m.reason);assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);
  assert.deepEqual([ev.graph.vertices_coords.length,ev.graph.edges_vertices.length,ev.graph.faces_vertices!.length],[50,85,36]);
  assert.ok(ev.graph.vertices_coords.every(p=>p.every(Number.isFinite)));assert.ok(ev.graph.edges_foldAngle.every(Number.isFinite));
  assert.equal(own(d).evidence.original3DConstructionReproduced,false);
 }
});

test('independent literal Tachi delta oracle reproduces full material for both beta and render gamma signs',()=>{
 assert.equal(heightDelta.wolframExecuted,false);assert.equal(heightDelta.unchangedOriginalOracleCases,12);assert.equal(heightDelta.cases.length,4);
 assert.equal(heightDelta.notebookSHA256,fixture.notebookSHA256);
 for(const row of heightDelta.cases){const ev=evaluateSemiGeneralMiuraSource(row.recipe),d=generateSemiGeneralMiuraDocument(row.recipe),g=graph(d),expected=row.expected;
  assert.equal(semiGeneralMiuraSourceMatches(d),true,row.name);
  for(const k of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[k],expected.graph[k],row.name+'/'+k);
  numbers(g.vertices_coords,expected.graph.vertices_coords);numbers(g.edges_foldAngle,expected.graph.edges_foldAngle);
  for(const k of Object.keys(expected).filter(k=>k!=='graph'))numbers((ev as any)[k],expected[k]);
 }
});

test('unused exact height pole and its source status survive JSON/FOLD, explicit rebuild and ordinary DXF geometry',()=>{
 for(const row of heightDelta.cases){const d=generateSemiGeneralMiuraDocument(row.recipe);
  for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;
   assert.equal(semiGeneralMiuraSourceMatches(reopened),true,row.name+'/'+format);assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(graph(reopened),graph(d));
   assert.deepEqual(readSemiGeneralMiuraRecipe(reopened),row.recipe);assert.deepEqual(generateSemiGeneralMiuraDocument(readSemiGeneralMiuraRecipe(reopened)!),d);
   assert.equal(own(reopened).derived.tachi.unusedOriginalHeight,null);assert.equal(own(reopened).derived.tachi.unusedOriginalHeightStatus,'source-sec-pole-unused-by-cp');
  }
  const pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Array<Record<string,string>>=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const line:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)line[pairs[j]]=pairs[j+1];lines.push(line);}
  assert.equal(lines.length,d.segments.length);lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([+line['10'],+line['20'],+line['11'],+line['21']],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(v=>Object.is(v,-0)?0:v));});
 }
});

test('full source guard rejects falsified finite heights, missing pole status, changed recipe and mismatched exact-pole metadata',()=>{
 const p={...semiGeneralMiuraPreset('tachi'),beta0Deg:90} as SemiGeneralMiuraRecipe;
 const changes:Array<(d:Doc)=>void>=[d=>{own(d).derived.tachi.unusedOriginalHeight=1e16;},d=>{own(d).derived.tachi.unusedOriginalHeight=0;},d=>{delete own(d).derived.tachi.unusedOriginalHeightStatus;},d=>{own(d).derived.tachi.unusedOriginalHeightStatus='finite';},d=>{own(d).recipe.beta0Deg=-90;},d=>{own(d).derived.tachi.zeta0Deg+=1e-12;}];
 for(const change of changes){const d=generateSemiGeneralMiuraDocument(p);change(d);assert.equal(semiGeneralMiuraSourceMatches(d),false,change.toString());}
 const ordinary=generateSemiGeneralMiuraDocument(semiGeneralMiuraPreset('tachi'));own(ordinary).derived.tachi.unusedOriginalHeightStatus='source-sec-pole-unused-by-cp';assert.equal(semiGeneralMiuraSourceMatches(ordinary),false);
});

test('non-pole Tachi source values retain their legacy shape; neighbors stay literal finite values rather than snapped beta',()=>{
 const preset=semiGeneralMiuraPreset('tachi');if(preset.mode!=='tachi')assert.fail('preset');
 const ordinary=evaluateSemiGeneralMiuraSource(preset),original=cases.find((row:any)=>row.name==='original-tachi');numbers(ordinary.tachi,original.expected.tachi);
 assert.equal(Object.hasOwn(ordinary.tachi!,'unusedOriginalHeightStatus'),false);
 for(const beta0Deg of [90-1e-7,90+1e-7,-90-1e-7,-90+1e-7]){const p:Extract<SemiGeneralMiuraRecipe,{mode:'tachi'}>={...preset,beta0Deg},ev=evaluateSemiGeneralMiuraSource(p),d=generateSemiGeneralMiuraDocument(p);
  assert.equal(readSemiGeneralMiuraRecipe(d)!.mode,'tachi');assert.equal((readSemiGeneralMiuraRecipe(d) as Extract<SemiGeneralMiuraRecipe,{mode:'tachi'}>).beta0Deg,beta0Deg);
  assert.equal(Object.hasOwn(ev.tachi!,'unusedOriginalHeightStatus'),false);assert.ok(Number.isFinite(ev.tachi!.unusedOriginalHeight));assert.notEqual(ev.tachi!.unusedOriginalHeight,null);
  assert.equal(semiGeneralMiuraSourceMatches(d),true);
 }
});

test('unused height exemption never bypasses paper validation or the current minor-angle entry budget',()=>{
 for(const beta0Deg of [90,-90]){const p={...semiGeneralMiuraPreset('tachi'),beta0Deg};
  assert.throws(()=>generateSemiGeneralMiuraDocument({...p,stripWidthMm:100} as SemiGeneralMiuraRecipe),/材料/);
  for(const minorFoldAngleDeg of [0,180,-180,Infinity])assert.throws(()=>validateSemiGeneralMiuraRecipe({...p,minorFoldAngleDeg}));
 }
});
