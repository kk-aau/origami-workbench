import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAdoptTess,changeTessParams,prepareTessResult,previewTessDocument,tessPreset,readTessParams,TESS_NAMES,type TessFamily,type TessResponse} from '../../src/app/tessellation';

const fold={vertices_coords:[[-2,-1],[2,-1],[2,1],[-2,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B']};
const response:TessResponse={fold,mother:fold,stats:{vertices:4,edges:4,faces:1,tiles:1,checks:{geometry:{status:'passed'},local:{status:'passed'}}},warnings:['candidate'],source:{algorithm:'test'}};
test('live geometry rotates/scales in the normalized paper frame without mutating or approving a checked result',()=>{
  const params=tessPreset('periodic');delete params.paper;
  const signature=JSON.stringify(params);
  const result=prepareTessResult({...response,preview:{kind:'shrink-rotate',vertices:[[0,0,-2,-1],[0,0,2,-1],[0,0,2,1],[0,0,-2,1]]}},params);
  const original=structuredClone(result),changed={...params,angle:60,scale:.6};
  const preview=previewTessDocument(result,signature,changed)!;
  assert.ok(preview);assert.equal(preview.metadata,undefined);
  assert.deepEqual(result,original);assert.notDeepEqual(preview.segments,result.doc.segments);
  // A 4 by 2 rectangle rotated 60 degrees has this bounding-box ratio.
  assert.ok(Math.abs(preview.paper.width/preview.paper.height-(2+Math.sqrt(3))/(2*Math.sqrt(3)+1))<1e-12);
  assert.equal(canAdoptTess(result,false,signature,changed),false);
  for(const other of [params,{...changed,rows:6},{...changed,angle:-36},{...changed,angle:0},tessPreset('woven')])assert.equal(previewTessDocument(result,signature,other),null);
  assert.equal(previewTessDocument({...result,preview:null},signature,changed),null);
});
test('tessellation normalization preserves aspect ratio, metadata and independent documents',()=>{
  const params=tessPreset('twist'),result=prepareTessResult(response,params);
  assert.deepEqual(result.doc.paper,{width:200,height:100});
  assert.deepEqual(result.doc.segments[0].a,[0,0]);
  assert.deepEqual(result.doc.segments[1].b,[200,100]);
  assert.deepEqual((result.doc.metadata!.tessellation as any).parameters,params);
  params.angle=-36;
  assert.equal((result.doc.metadata!.tessellation as any).parameters.angle,36);
  assert.notEqual(result.doc,result.motherDoc);
});
test('all saved tessellation families restore independently and old parameters migrate',()=>{
  for(const family of Object.keys(TESS_NAMES) as TessFamily[]){const params=tessPreset(family),restored=readTessParams(params);assert.deepEqual(restored,params);assert.notEqual(restored,params);}
  assert.deepEqual(readTessParams({tiling:'hexagon',rings:2,angle:36,scale:.5}),{family:'primal-dual',tiling:'hexagon',rings:2,angle:36,scale:.5});
});
test('independent paper selection round-trips across supported families while legacy parameters keep their old boundary',()=>{
  const papers=[{shape:'square',margin:.1},{shape:'rectangle',aspect:1.5,margin:.2},{shape:'regular',sides:6,margin:.15}] as const;
  const separatePaper=new Set<TessFamily>(['circular-twist','rigid-quad','radial-pot','gore-paper','rectangular-pot','twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral','discrete-curve-cp','twist-joined-tube','double-joined-tube','closed-twist-topped-tube']);
  for(const family of (Object.keys(TESS_NAMES) as TessFamily[]).filter(family=>!separatePaper.has(family))){
    const legacy=structuredClone(tessPreset(family));delete legacy.paper;
    assert.equal(readTessParams(legacy)?.paper,undefined);
    for(const paper of papers){
      const chosen=changeTessParams(legacy,{paper});
      assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(chosen))),chosen,`${family}: ${paper.shape}`);
      assert.notEqual(JSON.stringify(chosen),JSON.stringify(legacy));
    }
  }
  const dual=changeTessParams(tessPreset('periodic'),{dualTargets:[[0,0],[1,1]]});
  assert.deepEqual((changeTessParams(dual,{paper:papers[0]}) as typeof dual).dualTargets,dual.dualTargets);
  for(const family of separatePaper)
    assert.equal(readTessParams({...tessPreset(family),paper:papers[0]}),null,`${family} has its own paper geometry`);
  for(const paper of [null,{}, {shape:'circle',margin:.1},{shape:'square',margin:0},{shape:'square',margin:.1,sides:6},
    {shape:'rectangle',margin:.1,aspect:6},{shape:'regular',margin:.1,sides:2},{shape:'regular',margin:.1,sides:5.5}]){
    assert.equal(readTessParams({...tessPreset('twist'),paper}),null,JSON.stringify(paper));
  }
});
test('old shrink-rotate recipe is disabled for a separately framed paper',()=>{
  const legacy=tessPreset('periodic');delete legacy.paper;
  const signature=JSON.stringify(legacy);
  const result=prepareTessResult({...response,preview:{kind:'shrink-rotate',vertices:[[0,0,-2,-1],[0,0,2,-1],[0,0,2,1],[0,0,-2,1]]}},legacy);
  const framed=changeTessParams(legacy,{paper:{shape:'square',margin:.1}});
  assert.equal(previewTessDocument(result,signature,framed),null);
  assert.equal(canAdoptTess(result,false,signature,framed),false);
});
test('split twist and Resch metadata preserve their distinct mathematical controls',()=>{
  const split={...tessPreset('twist'),mode:'quad-split',pleatWidth:.3,splitVertex:2,connection:'V'};
  assert.deepEqual(readTessParams(split),split);
  const star={...tessPreset('archimedean'),tiling:'resch-6',starAngle:30};assert.deepEqual(readTessParams(star),star);
  for(const patch of [{splitVertex:4},{pleatWidth:.99},{connection:'unknown'},{sides:5}])assert.equal(readTessParams({...split,...patch}),null);
  assert.equal(readTessParams({...star,starAngle:60}),null);
});
test('malformed saved parameters cannot create broken controls or mesh indices',()=>{
  for(const value of [null,[],{family:'unknown'},{family:'nonperiodic',kind:'unknown'},{family:'woven',weave:'unknown'},{family:'periodic',rows:2.5},{family:'ring',rings:99},{family:'twist',sides:4,polygon:[[0,0],[1,0],[0,1]]},{family:'custom',vertices:[[0,0],[1,0],[1,1],[0,1]],faces:[[0,1,9],[1,2,3]]},{family:'nonperiodic',points:[[-1,0],[1,0],[1,1],[0,1]]}])assert.equal(readTessParams(value),null,JSON.stringify(value));
});
test('dual overlay uses mother coordinates and keeps reference geometry independent',()=>{
  const result=prepareTessResult({...response,dual:{vertices_coords:[[-1,0],[1,0]],edges_vertices:[[0,1]],edges_assignment:['A'],faces_vertices:[]}},tessPreset('periodic'));
  const edge=result.dualDoc!.segments.at(-1)!;
  assert.deepEqual(edge.a,[50,50]);assert.deepEqual(edge.b,[150,50]);assert.equal(edge.color,'#009eae');
  assert.equal(result.dualDoc!.segments[0].color,'#202124');assert.equal(result.motherDoc!.segments[0].color,undefined);
});
test('adoption rejects missing, busy, stale, failed and incomplete candidates',()=>{
  const params=tessPreset('periodic'),result=prepareTessResult(response,params),signature=JSON.stringify(params);
  assert.equal(canAdoptTess(result,false,signature,params),true);
  assert.equal(canAdoptTess(null,false,signature,params),false);
  assert.equal(canAdoptTess(result,true,signature,params),false);
  assert.equal(canAdoptTess(result,false,signature,{...params,angle:-36}),false);
  for(const status of ['failed','incomplete','not_applicable']){
    const invalid=structuredClone(result);invalid.stats.checks.local.status=status;
    assert.equal(canAdoptTess(invalid,false,signature,params),false);
  }
  const invalid=structuredClone(result);invalid.stats.checks.geometry.status='failed';
  assert.equal(canAdoptTess(invalid,false,signature,params),false);
  const boundaryOnly=structuredClone(result);boundaryOnly.stats.checks.local={status:'not_applicable',interiorVertices:0};
  assert.equal(canAdoptTess(boundaryOnly,false,signature,params),true);
  boundaryOnly.stats.checks.local.interiorVertices=1;
  assert.equal(canAdoptTess(boundaryOnly,false,signature,params),false);
});
