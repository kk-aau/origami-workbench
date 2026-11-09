import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/flasher-rotation-budget-20261010.json';
import labels from '../fixtures/flasher-rotation-labels-20261010.json';
import {FLASHER_ROTATIONAL_ORDER_LIMIT,flasherFactorLimits,flasherPreset,type FlasherParams} from '../../src/app/flasherParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {flasherSourceFaceVertexBudget} from '../../src/app/flasherSourceBudget';
import {flasherAllLabelsSeedQuery,flasherAllVerticesLabels,readFlasherAllLabelsResult} from '../../src/app/flasherAllVerticesLabels';
import {exportDocument,importDocument} from '../../src/core/formats';
import {DXF_LAYERS,exportDXF} from '../../src/core/dxf';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);
const parseLines=(text:string)=>{
  const pairs=text.trimEnd().split(/\r?\n/),rows:Record<string,string>[]=[];let row:Record<string,string>={};
  assert.equal(pairs.length%2,0);
  for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}
  assert.ok(text.includes('AC1009'));assert.ok(!text.includes('POLYLINE'));
  return rows.filter(row=>row['0']==='LINE');
};

test('rotation controls derive limits from the actual face budget for current factors',()=>{
  assert.equal(FLASHER_ROTATIONAL_ORDER_LIMIT,149);
  assert.equal(flasherFactorLimits(flasherPreset()).rotationalOrder,24);
  assert.equal(flasherFactorLimits({rings:1,heightOrder:1,rotationalOrder:149}).rotationalOrder,149);
  assert.deepEqual(flasherFactorLimits({rings:1,heightOrder:1,rotationalOrder:149}),{rings:1,heightOrder:1,rotationalOrder:149});
  for(let r=1;r<=9;r++)for(let h=1;h<=9;h++)if(r*h<=9){
    const maximum=Math.floor(599/(2*r*(r+1)*h));
    const query={...flasherPreset(),rings:r,heightOrder:h,rotationalOrder:maximum};
    assert.deepEqual(readTessParams(query),query);
    assert.equal(flasherFactorLimits(query).rotationalOrder,maximum);
    assert.equal(readTessParams({...query,rotationalOrder:maximum+1}),null);
  }
});

test('new rotation labels retain all source Text positions and genuine provenance',()=>{
  for(const c of labels.cases){
    const query=flasherAllLabelsSeedQuery(c.n,c.m),result=flasherAllVerticesLabels(query);
    assert.equal(result.data.items.flat().length,(c.n+2)*(c.n+1));
    query.bindings.forEach((binding,i)=>{assert.deepEqual(binding.index,c.bindings[i].index);binding.point.forEach((x,j)=>near(x,c.bindings[i].point[j]));});
    assert.deepEqual(readFlasherAllLabelsResult(JSON.stringify(result)),result);
    assert.equal(result.source.solvedCreasePattern,false);assert.equal(result.source.paperCertification,false);
    const tampered=structuredClone(result);tampered.query.bindings[0].point[0]+=.01;
    assert.throws(()=>readFlasherAllLabelsResult(JSON.stringify(tampered)));
  }
  assert.throws(()=>flasherAllLabelsSeedQuery(1,150));
});

test('actual large-m boundary responses pass static source adoption and fail tampering or stale gates',()=>{
  for(const c of fixture.cases){
    const p=c.params as FlasherParams,response=c.response as unknown as TessResponse;
    assert.deepEqual(readTessParams(p),p);
    assert.deepEqual([response.stats.vertices,response.stats.edges,response.stats.faces],c.expectedCounts);
    const r=prepareTessResult(structuredClone(response),p),scene=spatialMeshScene(r);
    assert.ok(scene);assert.equal(scene.faces.length,c.expectedCounts[2]);
    assert.equal(canAdoptTess(r,false,tessConstructionKey(p),p),true);
    assert.equal(canAdoptTess(r,true,tessConstructionKey(p),p),false);
    assert.equal(canAdoptTess(r,false,'stale',p),false);
    for(const changed of [{...p,rotationalOrder:p.rotationalOrder-1},{...p,radialIncrement:.2}]){
      assert.equal(canAdoptTess(r,false,tessConstructionKey(changed),changed),false,'different selected parameters cannot adopt this source');
    }
    assert.equal(response.stats.checks.local.status,'not_applicable');
    assert.equal((response.stats.checks as any).layerOrder.status,'not_checked');
    for(const flag of ['continuousRigidPathChecked','selfCollisionChecked','deployedPatternChecked'])assert.equal(r.source[flag],false);
    (r.source.foldedForm3D as number[][])[0][2]+=.01;
    assert.equal(spatialMeshScene(r),null);assert.equal(canAdoptTess(r,false,tessConstructionKey(p),p),false);
  }
});

test('all adopted large-m source edges retain exact ordinary LINE mm scale and source on reopen',()=>{
  for(const c of fixture.cases){
    const p=c.params as FlasherParams,response=c.response as unknown as TessResponse,r=prepareTessResult(structuredClone(response),p);
    const points=c.response.fold.vertices_coords,minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
    const scale=200/Math.max(Math.max(...points.map(p=>p[0]))-minX,Math.max(...points.map(p=>p[1]))-minY);
    c.response.fold.edges_vertices.forEach(([a,b],i)=>{
      const segment=r.doc.segments[i];assert.equal(segment.assignment,c.response.fold.edges_assignment[i]);
      for(const [point,source] of [[segment.a,points[a]],[segment.b,points[b]]]){near(point[0],(source[0]-minX)*scale);near(point[1],(source[1]-minY)*scale);}
    });
    const text=exportDXF(r.doc).text,lines=parseLines(text);assert.equal(lines.length,c.expectedCounts[1]);
    assert.ok(text.includes('1 drawing unit = 1 mm; X=x, Y=-y'));
    r.doc.segments.forEach((s,i)=>{const row=lines[i];assert.equal(row['8'],DXF_LAYERS[s.assignment].name);
      for(const [code,value] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]] as const)assert.ok(Number(row[code])===value);
    });
    for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(r.doc,format).text,format).doc;
      assert.equal(back.segments.length,c.expectedCounts[1]);assert.deepEqual(back.paper,r.doc.paper);
      assert.deepEqual((back.metadata?.tessellation as any).parameters,p);assert.deepEqual((back.metadata?.tessellation as any).source,response.source);
    }
  }
});

test('large center allowance keeps other source capacity and actual degeneracy gates',()=>{
  const c=fixture.cases.find(c=>c.name==='r1-h1-m149-Y')!,p=c.params as FlasherParams;
  const r=prepareTessResult(structuredClone(c.response) as unknown as TessResponse,p);
  const other=structuredClone(r);other.source.spatialKind='other-static-construction';
  assert.equal(spatialMeshScene(other),null);
  assert.equal(spatialMeshScene({source:r.source,fold:r.fold}),null,'a forged source string cannot grant larger faces');
  for(const mutate of [(x:any)=>x.stats.parameters.rotationalOrder=150,
    (x:any)=>delete x.stats.parameters.rotationalOrder,(x:any)=>x.stats.parameters.family='other',
    (x:any)=>x.stats.parameters.radialIncrement=.2,(x:any)=>x.stats.faces=596,
    (x:any)=>x.doc.metadata.tessellation.parameters.rotationalOrder=148,
    (x:any)=>x.source.algorithm='forged',(x:any)=>x.source.version=2,
    (x:any)=>x.fold.edges_vertices.pop(),(x:any)=>x.stats.edges--,
    (x:any)=>x.fold.faces_vertices[0].reverse(),(x:any)=>x.source.foldedForm3D[0][2]+=.01]){
    const invalid=structuredClone(r);mutate(invalid);assert.equal(spatialMeshScene(invalid),null);
    assert.equal(canAdoptTess(invalid,false,tessConstructionKey(p),p),false);
  }
  const repeated=structuredClone(r),graph=repeated.fold as any,center=graph.faces_vertices.at(-1) as number[];
  center.push(center[0]);assert.equal(spatialMeshScene(repeated),null);
  const collapsed=structuredClone(r),flat=(collapsed.fold as any).vertices_coords;
  flat[1]=[...flat[0]];
  assert.equal(flasherSourceFaceVertexBudget(collapsed),null,'original CP sector binding rejects a collapsed coordinate before the unchanged area checks');
  assert.equal(spatialMeshScene(collapsed),null);
  assert.equal(canAdoptTess(collapsed,false,tessConstructionKey(p),p),false);
  const nonplanar=structuredClone(r),central=((nonplanar.fold as any).faces_vertices.at(-1) as number[]);
  (nonplanar.source.foldedForm3D as number[][])[central[Math.floor(central.length/2)]][2]+=.01;
  assert.equal(flasherSourceFaceVertexBudget(nonplanar),null,'original FF sector binding rejects a displaced center before the unchanged spatial metric checks');
  assert.equal(spatialMeshScene(nonplanar),null);
});
