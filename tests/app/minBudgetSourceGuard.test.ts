import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareTessResult,readTessParams,canAdoptTess,canAdoptTessWithTileLayers,tessConstructionKey} from '../../src/app/tessellation';
import {minTotalPleatResultMatches} from '../../src/app/reciprocalMinTotalPleat';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {flasherSourceFaceVertexBudget} from '../../src/app/flasherSourceBudget';
import {generatedDocumentMatches,generatedParametersMatch} from '../../src/app/generatedSourceBinding';
const fixture=(name:string)=>JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`,import.meta.url),'utf8')),min=fixture('min-total-pleat-20261010.json'),flasher=fixture('flasher-rotation-budget-20261010.json');

test('actual main-prepared MinTotal CP/FF/source/doc succeeds while all reproduced mutations reject with its real signature',()=>{
 for(const c of min.cases){const p=readTessParams(c.params)!;const realSignature=tessConstructionKey(p),r=prepareTessResult(structuredClone(c.response),p);assert.ok(minTotalPleatResultMatches(r,p));assert.ok(canAdoptTess(r,false,realSignature,p));
  for(const [name,edit]of [
   ['CP point',(x:any)=>x.fold.vertices_coords[0][0]+=.1],['FF point',(x:any)=>x.source.foldedForm[0][0]+=.1],
   ['delete CP edge',(x:any)=>{x.fold.edges_vertices.pop();x.fold.edges_assignment.pop();x.fold.edges_foldAngle.pop();}],['reverse face',(x:any)=>x.fold.faces_vertices[0].reverse()],
   ['preview coefficient',(x:any)=>x.preview.vertices[0][2]+=.1],['current mm point',(x:any)=>x.doc.segments[0].a[0]+=.1],['current doc recipe',(x:any)=>x.doc.metadata.tessellation.parameters.gamma=2],
   ['actual source params',(x:any)=>x.stats.parameters.gamma=2],['unknown actual params',(x:any)=>x.stats.parameters.foreign=true],['missing actual alpha',(x:any)=>delete x.stats.parameters.pleatAngle],
   ['inconsistent native rho/beta',(x:any)=>x.stats.parameters.angle+=.1],['inconsistent recipe rho/beta',(x:any)=>x.doc.metadata.tessellation.parameters.scale+=.1],
   ['angle/type',(x:any)=>{const i=x.fold.edges_assignment.findIndex((k:string)=>k==='M');x.fold.edges_assignment[i]='V';x.fold.edges_foldAngle[i]=180;}],['source method',(x:any)=>x.source.algorithm='foreign'],
   ['dual face/map',(x:any)=>x.dual.zhezhi_dual_primal_vertices[0]=99],['dual ring',(x:any)=>x.dual.faces_vertices[0].reverse()],
  ] as [string,(x:any)=>void][]){const bad=structuredClone(r);edit(bad);assert.equal(minTotalPleatResultMatches(bad,p),false,c.name+'/'+name);assert.equal(canAdoptTess(bad,false,realSignature,p),false,name);assert.equal(canAdoptTessWithTileLayers(bad,false,realSignature,p,'solved'),false,name);}
  const unprepared=structuredClone(c.response);unprepared.fold.vertices_coords[0][0]+=.1;const altered=prepareTessResult(unprepared,p);assert.equal(canAdoptTess(altered,false,realSignature,p),false,'a matching newly prepared drawing cannot authenticate altered native CP');
  const changed=readTessParams({...p,gamma:2})!;assert.notEqual(tessConstructionKey(changed),realSignature);assert.equal(canAdoptTess(r,false,realSignature,changed),false,'actual old signature rejects new effective gamma');assert.equal(minTotalPleatResultMatches(r,changed),false,'source itself rejects changed effective params');
 }
});

test('small and large Flasher source identities, first-sector CP/FF equations and current mm documents bind at every face size',()=>{
 for(const c of flasher.cases){const p=readTessParams(c.params)!;const realSignature=tessConstructionKey(p),r=prepareTessResult(structuredClone(c.response),p);assert.ok(spatialMeshScene(r),c.name);assert.equal(flasherSourceFaceVertexBudget(r),(p as any).rotationalOrder);assert.ok(canAdoptTess(r,false,realSignature,p));
  for(const [name,edit]of [
   ['CP translation',(x:any)=>x.fold.vertices_coords.forEach((p:number[])=>p[0]+=.1)],['source algorithm',(x:any)=>x.source.algorithm='foreign'],['FF translation',(x:any)=>x.source.foldedForm3D.forEach((p:number[])=>p[0]+=.1)],
   ['FF center height',(x:any)=>x.source.foldedForm3D[0][2]+=.1],['doc point',(x:any)=>x.doc.segments[0].a[0]+=.1],['doc recipe',(x:any)=>x.doc.metadata.tessellation.parameters.radialIncrement=.2],
   ['edge angle',(x:any)=>{const i=x.fold.edges_assignment.findIndex((k:string)=>k!=='B');x.fold.edges_foldAngle[i]+=.25;}],['height adjustment',(x:any)=>x.source.outerHeightAdjustment+=.1],
   ['actual params',(x:any)=>x.stats.parameters.minimumAngleDeg+=1],['source flag',(x:any)=>x.source.selfCollisionChecked=true],
  ] as [string,(x:any)=>void][]){const bad=structuredClone(r);edit(bad);assert.equal(canAdoptTess(bad,false,realSignature,p),false,c.name+'/'+name);if(name!=='doc point')assert.equal(spatialMeshScene(bad),null,c.name+'/'+name);}
  const changed=readTessParams({...p,radialIncrement:.2})!;assert.notEqual(tessConstructionKey(changed),realSignature);assert.equal(canAdoptTess(r,false,realSignature,changed),false,'do not invent a matching signature for changed params');
  const marker=structuredClone(c.response);marker.source.spatialKind='foreign-static';const forged=prepareTessResult(marker,p);assert.equal(spatialMeshScene(forged),null);assert.equal(canAdoptTess(forged,false,realSignature,p),false,'a forged marker before prepare cannot route a real Flasher around its source contract');
 }
});

test('declared effective defaults and renamed prepared docs remain legal; unknown fields do not silently drop',()=>{
 const c=min.cases[1],p=readTessParams(c.params)!,r=prepareTessResult(structuredClone(c.response),p);
 assert.ok(generatedParametersMatch(c.response.stats.parameters,p),'native mother customOutput omission equals declared twist default');
 const explicit=structuredClone((r.stats as any).parameters);explicit.motherParams.customOutput='twist';explicit.postRotation='none';assert.ok(generatedParametersMatch(explicit,p));
 r.doc.name='用户命名';assert.ok(generatedDocumentMatches(r,p));assert.ok(minTotalPleatResultMatches(r,p));
 assert.equal(generatedParametersMatch({...explicit,foreignField:1},p),false);assert.equal(generatedParametersMatch({...explicit,motherParams:{...explicit.motherParams,customOutput:'tiling'}},p),false);
});

test('real native clockwise, rho-beta CP-only and optional face controls keep their existing valid contracts',()=>{
 for(const c of fixture('min-budget-guard-legal-20261010.json').cases){const p=readTessParams(c.params)!;const r=prepareTessResult(structuredClone(c.response),p),signature=tessConstructionKey(p);assert.ok(minTotalPleatResultMatches(r,p),c.name);assert.ok(canAdoptTess(r,false,signature,p),c.name);if(c.name==='rho-beta-cp-only')assert.equal(r.source.foldedForm,undefined);}
});

test('old Gore single and new independent multiple materials retain their normal adoption contracts',()=>{
 for(const [name,key]of [['gore-source-20261010.json','papers'],['multiple-gore-cp-source-20261010.json','cases']])for(const c of fixture(name)[key]){const p=readTessParams(c.params)!,r=prepareTessResult(structuredClone(c.response),p);assert.ok(canAdoptTess(r,false,tessConstructionKey(p),p),name);assert.ok(spatialMeshScene(r));}
});
