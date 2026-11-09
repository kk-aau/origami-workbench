import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/planar-ruled-cp-4040-20261011.json';
import {PLANAR_RULED_CP_4040_EXAMPLE,planarRuledCP4040Document,planarRuledCP4040SourceMatches,
 planarRuledCP4040Query,readPlanarRuledCP4040Recipe,validatePlanarRuledCP4040Recipe} from '../../src/app/planarRuledCP4040';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import type {Doc} from '../../src/core/types';
const clone=<T>(x:T):T=>structuredClone(x);
const own=(d:Doc)=>d.metadata!.originalPlanarRuled4040 as any;
const mutable=(d:Doc)=>d as any;
for(const c of fixture){
 test(c.name+' actual native input yields three intrinsic paper faces, with identity mm coordinates',()=>{
  assert.deepEqual(planarRuledCP4040Query(c.recipe),c.query);
  const doc=planarRuledCP4040Document(c.recipe,c.response),a=inspectMaterialTopology(doc);assert.equal(a.ok,true);
  if(!a.ok)return;const n=c.recipe.segments,s=n+1;
  assert.equal(a.graph.vertices_coords.length,4*s);assert.equal(a.graph.edges_vertices.length,4*n+6);assert.equal(a.graph.faces_vertices!.length,3);
  assert.equal(a.components.length,1);assert.equal(a.components[0].boundaryLoops.length,1);
  assert.equal(doc.segments.filter(s=>s.assignment==='U').length,2*n);assert.equal(doc.segments.filter(s=>s.assignment==='B').length,2*n+6);
  assert.equal(doc.paper.width,3);assert.equal(doc.paper.height,c.recipe.parameterEnd-c.recipe.parameterStart);
  for(let i=0;i<s;i++)for(let curve=0;curve<4;curve++){
   const row=c.response.sample.rows[i],v=curve===0?0:curve===3?3:row.stages[curve].parameter;
   assert.deepEqual(a.graph.vertices_coords[curve*s+i],[v,row.s]);
  }
  assert.equal(planarRuledCP4040SourceMatches(doc),true);assert.deepEqual(readPlanarRuledCP4040Recipe(doc),c.recipe);
  assert.equal(Object.hasOwn(doc,'flatFold'),false);assert.equal(a.foldedVertices,undefined);
  assert.deepEqual(own(doc).evidence,{adoption:'explicit-cp-only',mountainValleyAssigned:false,flatFold:false,layerOrder:false,
   threeDimensionalInitialCondition:false,finiteRigidIsometryTo3D:false,continuousMotion:false,collisionFree:false});
 });
 test(c.name+' JSON/FOLD reopen preserve actual materials and source; DXF independent LINE readback',()=>{
  const doc=planarRuledCP4040Document(c.recipe,c.response);
  for(const format of ['json','fold'] as const){
   const e=exportDocument(doc,format),r=importDocument(e.text,format).doc;
   assert.equal(planarRuledCP4040SourceMatches(r),true,format);assert.deepEqual(r.segments,doc.segments);
   const a=inspectMaterialTopology(r),b=inspectMaterialTopology(doc);assert.equal(a.ok,true);assert.equal(b.ok,true);
   if(a.ok&&b.ok)assert.deepEqual(a.graph,b.graph);
   assert.equal(planarRuledCP4040SourceMatches(importDocument(exportDocument(r,format).text,format).doc),true);
  }
  const pairs=exportDXF(doc).text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];
  for(let i=0;i<pairs.length;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LINE'){
   const row:Record<string,string>={};for(let j=i+2;j<pairs.length&&pairs[j]!=='0';j+=2)row[pairs[j]]=pairs[j+1];lines.push(row);
  }
  assert.equal(lines.length,doc.segments.length);
  lines.forEach((line,i)=>{const s=doc.segments[i];assert.equal(line['8'],DXF_LAYERS[s.assignment].name);
   assert.deepEqual([Number(line['10']),Number(line['20']),Number(line['11']),Number(line['21'])],[s.a[0],-s.a[1],s.b[0],-s.b[1]].map(x=>Object.is(x,-0)?0:x));});
 });
 test(c.name+' real Doc mutation rejection precedes source reconstruction, with no repair',()=>{
  const original=planarRuledCP4040Document(c.recipe,c.response),changes:((d:Doc)=>void)[]=[
   d=>{d.segments[0].a[0]+=.001;},d=>{d.segments[0].id+='forged';},d=>{d.segments[0].assignment='A';},
   d=>{d.segments.find(s=>s.assignment==='U')!.angle=0;},d=>{mutable(d).segments[0].a.push(0);},
   d=>{mutable(d).segments[0].a[0]=null;},d=>{mutable(d).segments[0].b[1]='0';},d=>{mutable(d).segments[0].b[1]=NaN;},
   d=>{d.paper.height+=.001;},d=>{mutable(d).paper.width='3';},d=>{mutable(d).flatFold={};},
   d=>{(d.metadata!.materialTopology as any).foldedVertices=[];},
   d=>{own(d).recipe.parameterStart+=Number.EPSILON;},d=>{own(d).recipe.segments+=1e-12;},
   d=>{own(d).source.coordinateUnit='cm';},d=>{own(d).source.coordinateTransform='scaled';},
   d=>{own(d).source.previewRulingsAreCP=true;},d=>{own(d).sampling.internalCurveChordErrorUpperBound+=Number.EPSILON;},
   d=>{own(d).intrinsicDomain.jacobianDeterminant=1;},d=>{own(d).evidence.flatFold=true;},
   d=>{(d.metadata!.materialTopology as any).graph.edges_vertices[0][0]+=1e-12;},
   d=>{(d.metadata!.materialTopology as any).graph.faces_vertices[0][0]+=1e-12;},
   d=>{own(d).nativeSequence.sample.rows[1].stages[1].parameter+=.001;},
   d=>{own(d).nativeSequence.query.composeReflections=true;},
   d=>{own(d).nativeSequence.source.definitionCells=['In[4040]'];},
   d=>{own(d).nativeSequence.certification.globalInjectivityChecked=true;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[1].fold[0]+=.001;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].parameter=Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].parameterDerivative=-Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].director[0]=Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].director[2]+=Number.EPSILON;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].directorDerivative[0]=-Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.sample.rows[0].stages[0].base[2]=Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.normalization.scale+=Number.EPSILON*2;},
   d=>{own(d).nativeSequence.normalization.origin[2]=Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.effectiveMirrors[0].normal[0]+=Number.EPSILON;},
   d=>{own(d).nativeSequence.query.transverseStart=Number.MIN_VALUE;},
   d=>{own(d).nativeSequence.query.transverseEnd+=Number.EPSILON*2;},
   d=>{own(d).nativeSequence.grid[0].stages[0].points[0][0]+=.001;},
   d=>{own(d).nativeSequence={query:own(d).nativeSequence.query,sample:own(d).nativeSequence.sample};},
   d=>{own(d).numericalPolicy.maximumLiteralResidual=-Number.MIN_VALUE;},
   d=>{own(d).numericalPolicy.sourceCoordinateAbsoluteBoundMm+=Number.EPSILON;}
  ];
  changes.forEach((change,i)=>{const bad=clone(original);change(bad);const before=JSON.stringify(bad);
   assert.equal(planarRuledCP4040SourceMatches(bad),false,`mutation ${i}`);assert.equal(JSON.stringify(bad),before);});
  const rename=clone(original);rename.name='用户工程改名';assert.equal(planarRuledCP4040SourceMatches(rename),true);
  const ulp=clone(original);ulp.paper.height+=Number.EPSILON;assert.equal(planarRuledCP4040SourceMatches(ulp),true);
  const round=clone(original);own(round).numericalPolicy.maximumLiteralResidual+=5e-14;assert.equal(planarRuledCP4040SourceMatches(round),true);
 });
}
test('input policy and fixed source query are exact, not defaults, normalization, or alternative surface',()=>{
 const r=PLANAR_RULED_CP_4040_EXAMPLE;
 for(const bad of [null,{}, {...r,segments:true},{...r,segments:'16'},{...r,segments:16.5},{...r,segments:15},
  {...r,segments:129},{...r,parameterStart:-1},{...r,parameterEnd:1},{...r,parameterEnd:r.parameterStart+.09},
  {...r,parameterStart:NaN},{...r,extra:0}])assert.throws(()=>validatePlanarRuledCP4040Recipe(bad));
 const c=fixture[0];for(const edit of [(n:any)=>n.query.mirrors[0].normal[0]+=.001,(n:any)=>n.query.rulingSegments=3,
  (n:any)=>n.query.baseCurve[0]='Math.cos(s)',(n:any)=>n.query.parameterEnd+=Number.EPSILON,
  (n:any)=>n.sample.rows[1].s+=.001,(n:any)=>n.domain.certified=false]){
  const bad=clone(c.response);edit(bad);assert.throws(()=>planarRuledCP4040Document(c.recipe,bad));
 }
});
