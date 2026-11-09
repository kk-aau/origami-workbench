import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateMiuraHuffmanDocument,miuraHuffmanPreset,readMiuraHuffmanRecipe,miuraHuffmanSourceMatches,validateMiuraHuffmanRecipe,type MiuraHuffmanRecipe} from '../../src/app/miuraHuffmanCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc} from '../../src/core/types';

const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/miura-huffman-source-20261011.json',import.meta.url),'utf8')).cases;
const own=(d:Doc)=>d.metadata!.originalMiuraHuffman as any;
const graph=(d:Doc)=>(d.metadata!.materialTopology as any).graph;
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=2e-11,`${a} vs ${b}`);

test('original independent point formulas and MakeQuadMesh index/angle parity agree for all three models',()=>{
 for(const row of cases){const original=structuredClone(row.recipe),d=generateMiuraHuffmanDocument(row.recipe),g=graph(d),e=row.expected.graph;
  assert.deepEqual(row.recipe,original);assert.equal(miuraHuffmanSourceMatches(d),true,row.name);
  for(const key of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])assert.deepEqual(g[key],e[key],row.name+'/'+key);
  g.vertices_coords.forEach((p:number[],i:number)=>p.forEach((v,k)=>close(v,e.vertices_coords[i][k])));
  g.edges_foldAngle.forEach((v:number,i:number)=>close(v,e.edges_foldAngle[i]));
  own(d).foldLengths.forEach((v:number,i:number)=>close(v,row.expected.foldLengths[i]));
  assert.ok(row.expected.localSingleVertexClosureErrorRad<1e-12);
 }
});

test('actual disk material has expected cells/incidence and no zero edges, phantom radial seams or folded data',()=>{
 for(const {recipe:p}of cases){const d=generateMiuraHuffmanDocument(p),g=graph(d),material=inspectMaterialTopology(d),n=p.columns,m=p.rows;
  if(!material.ok)assert.fail(material.reason);assert.equal(material.ok,true);
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],[(n+1)*(m+1),2*n*m+n+m,n*m]);
  assert.equal(g.vertices_coords.length-g.edges_vertices.length+g.faces_vertices.length,1);
  assert.equal(material.components.length,1);assert.equal(material.components[0].boundaryLoops.length,1);
  assert.equal(g.edges_assignment.filter((a:string)=>a==='B').length,2*(n+m));
  assert.equal(g.faces_vertices.every((f:number[])=>f.length===4),true);
  assert.equal(material.foldedVertices,undefined);assert.equal(material.startingFace,undefined);assert.equal(d.flatFold,undefined);
  assert.equal(own(d).evidence.CPOnly,true);assert.equal(own(d).evidence.wholeSheetLayerOrderChecked,false);
 }
});

test('user millimetres retain raw original origin and negative boundary coordinates without 200/span conversion',()=>{
 const d=generateMiuraHuffmanDocument(miuraHuffmanPreset('huffman')),g=graph(d);
 assert.deepEqual(g.vertices_coords[0],[0,0]);assert.deepEqual(g.vertices_coords[1],[20,0]);assert.ok(g.vertices_coords.some((p:number[])=>p[0]<0));
 const xs=g.vertices_coords.map((p:number[])=>p[0]),ys=g.vertices_coords.map((p:number[])=>p[1]);
 assert.equal(d.paper.width,Math.max(...xs)-Math.min(...xs));assert.equal(d.paper.height,Math.max(...ys)-Math.min(...ys));
 const scaled=generateMiuraHuffmanDocument({...miuraHuffmanPreset('huffman'),length1:40,length2:40});graph(scaled).vertices_coords.forEach((p:number[],i:number)=>p.forEach((v,k)=>close(v,2*g.vertices_coords[i][k])));
});

test('strict source recipe rejects malformed numbers, unsupported finite budget and original degeneracy without clamping',()=>{
 const base=miuraHuffmanPreset();
 for(const key of ['columns','rows','length1','length2','sectorAngleDeg','minorFoldAngleDeg'])for(const value of [null,true,'2',NaN,Infinity,{},[]])assert.throws(()=>validateMiuraHuffmanRecipe({...base,[key]:value}));
 for(const change of [{columns:0},{rows:13},{columns:2.5},{length1:0},{length2:201},{sectorAngleDeg:90},{sectorAngleDeg:180},{minorFoldAngleDeg:0},{minorFoldAngleDeg:.5},{model:'rigid-quad'},{extra:1}])assert.throws(()=>generateMiuraHuffmanDocument({...base,...change} as any));
 assert.throws(()=>generateMiuraHuffmanDocument({...miuraHuffmanPreset('huffman'),sectorAngleDeg:40,length1:10,length2:20}),/badlens/);
 assert.deepEqual(base,miuraHuffmanPreset());
});

test('fresh guard binds actual Doc, literal seed identities, discrete incidence, role, target angle and policy',()=>{
 const changes:Array<(d:Doc)=>void>=[
  d=>{d.segments[0].a.push(0);},d=>{d.paper.width='20' as any;},d=>{d.segments[0].id='other';},
  d=>{own(d).recipe.columns+=1e-12;},d=>{own(d).recipe.model='mars';},d=>{own(d).recipe.extra=1;},
  d=>{own(d).seed.creaseVectors[0][1]=Number.MIN_VALUE;},d=>{own(d).seed.creaseVectors[2][1]=1e-14;},
  d=>{own(d).seed.dihedralsDeg[0]+=1e-12;},d=>{own(d).seed.sectorsDeg[0]+=1e-12;},
  d=>{own(d).foldLengths[0]+=1e-12;},d=>{own(d).foldLengths[2]+=1e-14;},d=>{own(d).seed.dihedralsDeg[3]+=1e-14;},d=>{own(d).source.minimumLengthOptimizationUsed=true;},
  d=>{own(d).evidence.wholeSheetLayerOrderChecked=true;},d=>{graph(d).edges_vertices[0][0]+=1e-12;},
  d=>{graph(d).faces_faces[0][0]=0;},d=>{graph(d).edges_faces[0].push(1);},
  d=>{graph(d).vertices_coords[0][1]=Number.MIN_VALUE;d.segments[0].a[1]=Number.MIN_VALUE;},
  d=>{const i=d.segments.findIndex(s=>s.assignment==='M');d.segments[i].assignment='V';d.segments[i].angle=30;graph(d).edges_assignment[i]='V';graph(d).edges_foldAngle[i]=30;},
  d=>{const i=d.segments.findIndex(s=>s.assignment!=='B');d.segments[i].angle=10;graph(d).edges_foldAngle[i]=10;},
  d=>{graph(d).vertices_coords[6][0]+=.001;d.segments.filter(s=>s.a[0]===graph(d).vertices_coords[6][0]-.001).forEach(s=>s.a[0]+=.001);},
 ];
 for(const change of changes){const d=generateMiuraHuffmanDocument(miuraHuffmanPreset());change(d);assert.equal(miuraHuffmanSourceMatches(d),false);}
 const renamed=generateMiuraHuffmanDocument(miuraHuffmanPreset());renamed.name='用户改名';assert.equal(miuraHuffmanSourceMatches(renamed),true);
});

test('manual crease changes keep readable original recipe; only explicit regeneration recreates source',()=>{
 const p=miuraHuffmanPreset('mars'),d=generateMiuraHuffmanDocument(p),i=d.segments.findIndex(s=>s.assignment==='M');
 d.segments[i].assignment='U';d.segments[i].angle=null;graph(d).edges_assignment[i]='U';graph(d).edges_foldAngle[i]=null;
 assert.equal(miuraHuffmanSourceMatches(d),false);assert.deepEqual(readMiuraHuffmanRecipe(d),p);assert.equal(miuraHuffmanSourceMatches(generateMiuraHuffmanDocument(readMiuraHuffmanRecipe(d)!)),true);
});

test('actual JSON/FOLD exchange reopens complete source/target angles and indexed physical material',()=>{
 for(const model of ['miura','mars','huffman'] as const){const p=miuraHuffmanPreset(model),d=generateMiuraHuffmanDocument(p);
  for(const format of ['json','fold'] as const){const text=exportDocument(d,format).text,reopened=importDocument(text,format).doc;
   assert.equal(miuraHuffmanSourceMatches(reopened),true,model+'/'+format);assert.deepEqual(readMiuraHuffmanRecipe(reopened),p);assert.deepEqual(graph(reopened),graph(d));assert.deepEqual(reopened.segments,d.segments);
  }
 }
});

test('ordinary R12 DXF independently reads every LINE in original order with one Y reflection and no scale',()=>{
 for(const model of ['miura','mars','huffman'] as const){const d=generateMiuraHuffmanDocument(miuraHuffmanPreset(model)),pairs=exportDXF(d).text.trim().split(/\r?\n/),lines:Array<Record<string,string>>=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);}
  assert.equal(lines.length,d.segments.length);lines.forEach((r,i)=>{const s=d.segments[i];assert.equal(r['8'],DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(r['10']),Number(r['20']),Number(r['11']),Number(r['21'])],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(v=>Object.is(v,-0)?0:v));});
 }
});
