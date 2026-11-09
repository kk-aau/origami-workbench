import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ellipseOpticalCP4034Document,acrossDescendingCP3988Document,ellipseOpticalCP4034SourceMatches,acrossDescendingCP3988SourceMatches,
 readEllipseOpticalCP4034Recipe,readAcrossDescendingCP3988Recipe,validateEllipseOpticalCP4034Recipe,validateAcrossDescendingCP3988Recipe,ELLIPSE_OPTICAL_CP_4034_EXAMPLE,ACROSS_DESCENDING_CP_3988_EXAMPLE} from '../../src/app/ellipseAcrossFiniteCP';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXF,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/ellipse-across-finite-cp-1011.json',import.meta.url),'utf8')),
 clone=<T>(x:T):T=>structuredClone(x),own=(d:any,k:string)=>d.metadata[k==='ellipse'?'originalEllipseOptical4034':'originalAcrossDescending3988'],
 make=(k:string,r:unknown)=>k==='ellipse'?ellipseOpticalCP4034Document(r):acrossDescendingCP3988Document(r),match=(k:string,d:any)=>k==='ellipse'?ellipseOpticalCP4034SourceMatches(d):acrossDescendingCP3988SourceMatches(d),read=(k:string,d:any)=>k==='ellipse'?readEllipseOpticalCP4034Recipe(d):readAcrossDescendingCP3988Recipe(d);
for(const c of fixture.cases)test(`${c.name}: independent MP80 planar source and exact material topology`,()=>{
 const d=make(c.kind,c.recipe),m=inspectMaterialTopology(d);assert.ok(m.ok);if(!m.ok)return;const g=m.graph;
 assert.equal(g.vertices_coords.length,c.graph.vertices_coords.length);assert.deepEqual(g.edges_vertices,c.graph.edges_vertices);assert.deepEqual(g.edges_assignment,c.graph.edges_assignment);assert.deepEqual(g.faces_vertices,c.graph.faces_vertices);
 g.vertices_coords.forEach((p,i)=>p.forEach((x,k)=>assert.ok(Math.abs(x-c.graph.vertices_coords[i][k])<=1e-11*Math.max(1,c.recipe.unitSizeMm),`${i}/${k}`)));
 assert.equal(m.components.length,1);assert.equal(m.components[0].boundaryLoops.length,1);assert.equal(m.foldedVertices,undefined);
 assert.equal(own(d,c.kind).finitePaperProof.nonconvexCells,c.proof.nonconvexCells);assert.equal(own(d,c.kind).finitePaperProof.validationTriangles,c.proof.triangles.length);assert.equal(own(d,c.kind).finitePaperProof.onceCovered,true);
 assert.equal(match(c.kind,d),true);assert.deepEqual(read(c.kind,d),c.recipe);
 for(const key of ['flatFold','layerOrder','finiteRigid3D','continuousMotion','collisionFree'])assert.equal(own(d,c.kind).evidence[key],false);
 assert.equal(own(d,c.kind).evidence.constantFoldAngleAssigned,false);
 for(const s of d.segments)assert.equal(s.angle,s.assignment==='B'?0:null);
});
test('4034 default preserves original 100 curve divisions, ten half-grid V/M rulings, complete nine rules and actual cL/cR paper',()=>{
 const d=ellipseOpticalCP4034Document(ELLIPSE_OPTICAL_CP_4034_EXAMPLE),m=own(d,'ellipse');
 assert.equal(d.segments.length,324);assert.equal(m.topology.vertices,303);assert.equal(m.topology.faces,22);assert.equal(d.segments.filter(s=>s.assignment==='V').length,110);assert.equal(d.segments.filter(s=>s.assignment==='M').length,10);assert.equal(m.topology.boundaryEdges,204);
 assert.deepEqual(m.sourceFrames[0].base,[0,0]);assert.deepEqual(m.sourceFrames[0].leftBoundary,[-.5,0]);assert.deepEqual(m.sourceFrames[0].rightBoundary,[.5,0]);
 assert.deepEqual(m.sourceFrames[0].rules,[[0,0],[-1,0],[-1,0],[-1,0],[-.5,0],[-2,0],[-1,0],[-2,0],[.5,0]]);
 assert.equal(m.source.virtualDirectrixReferences.usedAsPaperBoundary,false);assert.equal(m.source.allNineRulesPreserved,true);assert.equal(m.source.originalStyles.fold,'ValleyLine');
 assert.equal(m.source.originalStyles.rulingLineOffset,true);assert.equal(d.segments.filter(s=>s.id.includes('original-left-ruling')).length,10);
});
test('3988 full width has one source apex, no zero boundary edge and no radial proof seams',()=>{
 const d=acrossDescendingCP3988Document(ACROSS_DESCENDING_CP_3988_EXAMPLE),m=own(d,'across'),g=(d.metadata!.materialTopology as any).graph;
 assert.equal(m.topology.vertices,67);assert.equal(d.segments.length,68);assert.equal(m.topology.faces,2);assert.equal(m.topology.boundaryEdges,36);assert.equal(d.segments.filter(s=>s.assignment==='U').length,32);
 assert.deepEqual(g.vertices_coords[33],[0,0]);assert.equal(m.paperDomain.leftWholeRectangleInjective,false);assert.equal(m.paperDomain.leftQuotientInjective,true);assert.equal(m.paperDomain.leftJacobianLowerBound,0);
 assert.equal(m.finitePaperProof.nonconvexCells,1);assert.equal(m.finitePaperProof.validationOnlyEdgesAreCPEdges,false);
 assert.deepEqual(m.sourceFrames[0].base,[1,0]);assert.equal(m.sourceFrames.at(-1).gamma,150*Math.PI/180*(1-.9999));assert.equal(m.source.currentStartReseeded,false);
 const crop=acrossDescendingCP3988Document({...ACROSS_DESCENDING_CP_3988_EXAMPLE,parameterStart:.2,parameterEnd:1.3});assert.notDeepEqual(own(crop,'across').sourceFrames[0].base,[1,0]);
});
for(const kind of ['ellipse','across'])test(`${kind}: strict source/geometry/identity/proof rejection, read-only guard and explicit rebuild`,()=>{
 const r=kind==='ellipse'?ELLIPSE_OPTICAL_CP_4034_EXAMPLE:ACROSS_DESCENDING_CP_3988_EXAMPLE,d=make(kind,r),ns=kind==='ellipse'?'originalEllipseOptical4034':'originalAcrossDescending3988',mutations=[
 (x:any)=>own(x,kind).recipe.unitSizeMm++, (x:any)=>own(x,kind).schema='other', (x:any)=>own(x,kind).source.inputCell='In[4093]',
 (x:any)=>own(x,kind).sourceFrames[0].base[1]=Number.MIN_VALUE,(x:any)=>own(x,kind).sourceFrames[1].u+=Number.EPSILON,
 (x:any)=>own(x,kind).sourceFrames[1].base[0]+=1e-10,(x:any)=>own(x,kind).finitePaperProof.minimumTriangleCross=0,
 (x:any)=>own(x,kind).finitePaperProof.signedFaceAreas[0]+=Number.EPSILON*own(x,kind).finitePaperProof.signedFaceAreas[0],
 (x:any)=>own(x,kind).finitePaperProof.validationCells++, (x:any)=>own(x,kind).numericalPolicy.maximumUnitDirectorResidual=-1,
 (x:any)=>own(x,kind).numericalPolicy.sourceReplayRelativeAbsoluteBound*=2,(x:any)=>own(x,kind).evidence.finiteRigid3D=true,
 (x:any)=>x.metadata.materialTopology.graph.vertices_coords[0][1]=Number.MIN_VALUE,(x:any)=>x.metadata.materialTopology.graph.faces_vertices[0].reverse(),
 (x:any)=>x.metadata.materialTopology.edgeSegmentIds.reverse(),(x:any)=>x.metadata.materialTopology.foldedVertices=x.metadata.materialTopology.graph.vertices_coords,
 (x:any)=>x.segments[0].a=[...x.segments[0].a,0],(x:any)=>x.segments[0].a[1]=Number.MIN_VALUE,
 (x:any)=>x.segments[0].assignment='M',(x:any)=>x.segments[0].angle=180,(x:any)=>x.segments[0].id='forged-id',
 (x:any)=>x.paper.width=String(x.paper.width),(x:any)=>x.paper.width+=.001,(x:any)=>x.flatFold={startingFace:0},
 (x:any)=>x.metadata[kind==='ellipse'?'originalAcrossDescending3988':'originalEllipseOptical4034']=clone(x.metadata[ns])];
 for(const mutate of mutations){const bad=clone(d);mutate(bad);const bytes=JSON.stringify(bad);assert.equal(match(kind,bad),false);assert.equal(JSON.stringify(bad),bytes);}
 const named=clone(d);named.name='我的原式新纸面';named.metadata!.note='合法备注';assert.ok(match(kind,named));
 const hand=clone(d);hand.segments[0].assignment='M';assert.equal(match(kind,hand),false);assert.deepEqual(read(kind,hand),r);assert.ok(match(kind,make(kind,read(kind,hand))));
 const minusZero=clone(d);own(minusZero,kind).sourceFrames[0].base[1]=-0;assert.ok(match(kind,minusZero));
});
test('numeric contract rejects malformed raw fields, shape-changing aliases and degenerate source before construction',()=>{
 const e=ELLIPSE_OPTICAL_CP_4034_EXAMPLE,a=ACROSS_DESCENDING_CP_3988_EXAMPLE;
 for(const r of [null,{}, {...e,extra:0},{...e,leftFocus:'-1'},{...e,leftCross:e.leftFocus},{...e,rightFocus:e.leftFocus},{...e,rightCross:0},{...e,segments:15},{...e,rulingDivisions:1},{...e,assignmentMode:'M'},{...e,parameterEnd:Math.PI}])assert.throws(()=>validateEllipseOpticalCP4034Recipe(r));
 for(const r of [null,{}, {...a,extra:0},{...a,initialAngleDeg:0},{...a,initialAngleDeg:180},{...a,dropFraction:1},{...a,leftWidth:1.001},{...a,rightWidth:0},{...a,unitSizeMm:Infinity},{...a,segments:16.5},{...a,parameterStart:-.01}])assert.throws(()=>validateAcrossDescendingCP3988Recipe(r));
 for(const [example,check]of [[e,validateEllipseOpticalCP4034Recipe],[a,validateAcrossDescendingCP3988Recipe]] as const)for(const key of Object.keys(example)){const r:any={...example};delete r[key];assert.throws(()=>check(r));}
});
for(const kind of ['ellipse','across'])test(`${kind}: actual JSON/FOLD core reopening and every ordinary LINE preserve raw millimetres`,()=>{
 const d=make(kind,kind==='ellipse'?ELLIPSE_OPTICAL_CP_4034_EXAMPLE:ACROSS_DESCENDING_CP_3988_EXAMPLE),before=JSON.stringify(d);
 for(const format of ['json','fold'] as const){const reopened=importDocument(exportDocument(d,format).text,format).doc;assert.ok(match(kind,reopened));assert.deepEqual(reopened.segments,d.segments);assert.deepEqual(own(reopened,kind),own(d,kind));}
 const out=exportDXF(d).text,t=out.replace(/\r/g,'').split('\n').map(x=>x.trim()),lines:any[]=[];assert.ok(out.includes('AC1009'));
 for(let i=0;i+1<t.length;i+=2)if(t[i]==='0'&&t[i+1]==='LINE'){const fields=new Map<string,string>();for(let j=i+2;j+1<t.length&&t[j]!=='0';j+=2)fields.set(t[j],t[j+1]);lines.push({a:[Number(fields.get('10')),Number(fields.get('20'))],b:[Number(fields.get('11')),Number(fields.get('21'))]});}
 assert.equal(lines.length,d.segments.length);lines.forEach((s,i)=>{assert.equal(JSON.stringify(s.a),JSON.stringify([d.segments[i].a[0],-d.segments[i].a[1]]));assert.equal(JSON.stringify(s.b),JSON.stringify([d.segments[i].b[0],-d.segments[i].b[1]]));});
 const p=optimizeCPPaths(d),processed=exportCPProcessingDXF(d,p);assert.equal(verifyCPProcessingExport(processed.text,'dxf',d,p).verified,true);assert.equal(JSON.stringify(d),before);
});
test('one source unit converts exactly once, without bbox normalization or mirror',()=>{
 for(const kind of ['ellipse','across']){const r=kind==='ellipse'?ELLIPSE_OPTICAL_CP_4034_EXAMPLE:ACROSS_DESCENDING_CP_3988_EXAMPLE,a=make(kind,{...r,unitSizeMm:1}),b=make(kind,{...r,unitSizeMm:50});a.segments.forEach((s,i)=>{assert.deepEqual(b.segments[i].a,s.a.map(x=>x*50));assert.deepEqual(b.segments[i].b,s.b.map(x=>x*50));});}
});
