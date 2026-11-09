import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {simulationLayerOrder} from '../../src/engine/simLayerOrder';
import {SimulationSurfaceLayers,blendSimulationSurface,resizeSimulationSurfaceGap} from '../../src/engine/simSurfaceLayers';
import {localSurfaceLayers} from '../../src/engine/simLocalSurfaceLayers';
import type {FoldGraph} from '../../src/core/types';

type Vector=[number,number,number];
const sub=(a:Vector,b:Vector):Vector=>a.map((n,k)=>n-b[k]) as Vector;
const cross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vector,b:Vector)=>a.reduce((sum,n,k)=>sum+n*b[k],0);
const position=(points:Float32Array,v:number):Vector=>Array.from(points.slice(v*3,v*3+3)) as Vector;

// Historical real CPU endpoint, not an idealized flat-fold rendering:
// ring fixture, target 100%, timeStepScale .35, damping .5, creaseStiffness .7;
// SimulationClock chunkSteps 4 converged at step 15892 (max velocity 9.96e-6).
const finalPositions=new Float32Array([
  -0.58824622631073, 0.00004073333911946975, 0.3281330168247223, -0.6385453939437866, 0.000022373373212758452, 0.19429528713226318, -0.40189704298973083, -0.0000175648328877287, -0.1757519245147705,
  -0.40845945477485657, 0.000016826355931698345, 0.15990769863128662, -0.6479785442352295, -0.00006036368358763866, -0.18392768502235413, -0.5889072418212891, -0.00007261698192451149, -0.3141319453716278,
  -0.15990853309631348, -0.000021508150894078426, -0.4084593951702118, -0.5386637449264526, 0.000021398698663688265, 0.10083691775798798, -0.45219501852989197, -0.00004824125062441453, -0.3095897138118744,
  -0.3268054723739624, 0.000043097206798847765, 0.18229520320892334, -0.35998809337615967, 0.000008573649211029988, -0.10218366980552673, -0.1008378118276596, -0.000037505516957025975, -0.5386637449264526,
  -0.18392780423164368, -0.00007897322939243168, 0.6479777097702026, -0.31413206458091736, -0.0000705290149198845, 0.5889063477516174, -0.22692334651947021, 0.00004150156382820569, 0.0888374000787735,
  -0.22327634692192078, 0.000019790617443504743, -0.0976402759552002, -0.35474836826324463, 0.000037301557313185185, 0.1079406663775444, -0.3271704316139221, 0.000002119306827808032, -0.17451879382133484,
  -0.08883823454380035, 0.000022382853785529733, -0.2269233614206314, -0.29925820231437683, 0.00003847414700430818, 0.056019723415374756, -0.2512192130088806, 0.00000758347687224159, -0.1719948649406433,
  0.03492775559425354, 0.00005020966273150407, 0.09294283390045166, -0.17575198411941528, -0.00002041324660240207, 0.4018961191177368, -0.30958977341651917, -0.0000385432576877065, 0.45219406485557556,
  -0.1021837592124939, 4.5193024789114133e-7, 0.3599872291088104, -0.32813388109207153, -0.000047346566134365276, -0.5882461071014404, -0.056020647287368774, 0.000011858781363116577, -0.2992582619190216,
  -0.041023239493370056, 0.00005154630707693286, 0.09041829407215118, -0.17451885342597961, 0.0000035150205803802237, 0.3271695375442505, 0.09041827917098999, 0.000047395278670592234, 0.04102235659956932,
  -0.09764030575752258, 0.000022191135940374807, 0.22327548265457153, 0.194295272231102, -0.00005831506132381037, 0.6385444402694702, -0.19429613649845123, -0.000058257501223124564, -0.6385453939437866,
  0.1757512241601944, -0.000020366445824038237, -0.40189722180366516, -0.1719948947429657, 0.000013870467228116468, 0.251218318939209, -0.18229609727859497, 0.000007240092600113712, -0.3268052935600281,
  0.3281329870223999, -0.00004739413634524681, 0.5882452726364136, 0.3095890283584595, -0.000038486497942358255, -0.4521951675415039, 0.09294289350509644, 0.0000505473799421452, -0.034928686916828156,
  0.10794070363044739, 0.0000036395597362570697, 0.35474735498428345, -0.10794159770011902, 0.000003671406830108026, -0.35474836826324463, 0.09763950109481812, 0.00002221717659267597, -0.2232765406370163,
  0.18229521811008453, 0.000007213868229882792, 0.32680433988571167, -0.0929437130689621, 0.00005054029679740779, 0.03492773324251175, 0.17199400067329407, 0.000013902125829190481, -0.25121939182281494,
  -0.09041915088891983, 0.000047395988076459616, -0.04102330282330513, -0.03492862731218338, 0.000050217659008922055, -0.09294377267360687, 0.17451800405979156, 0.000003554420345608378, -0.32717055082321167,
  0.29925736784935, 0.000038491289160447195, -0.05602072924375534, 0.041022397577762604, 0.00005155701728654094, -0.09041927009820938, 0.25121837854385376, 0.000007575803920190083, 0.1719938963651657,
  0.3547475337982178, 0.00003732604454853572, -0.10794160515069962, 0.056019723415374756, 0.000011830648873001337, 0.2992572486400604, 0.3271695375442505, 0.000002114326889568474, 0.17451788485050201,
  0.1021830290555954, 4.91868433982745e-7, -0.359988272190094, 0.08883735537528992, 0.00002236330692539923, 0.22692236304283142, 0.10083694756031036, -0.000037556314055109397, 0.5386627316474915,
  0.1839270293712616, -0.00007890180859249085, -0.6479787826538086, 0.3599872291088104, 0.000008577275366405956, 0.10218286514282227, 0.22692249715328217, 0.000041519218939356506, -0.08883839845657349,
  0.31413131952285767, -0.00007045845268294215, -0.5889073610305786, 0.1599077582359314, -0.000021543464754358865, 0.4084583818912506, 0.5889064073562622, -0.00007262606231961399, 0.3141311705112457,
  0.22327551245689392, 0.00001978937871172093, 0.09763936698436737, 0.3268046975135803, 0.00004312810051487759, -0.18229615688323975, 0.5386629104614258, 0.000021429581465781666, -0.10083779692649841,
  0.6479778289794922, -0.00006035725164110772, 0.18392688035964966, 0.40845853090286255, 0.000016858075468917377, -0.15990862250328064, 0.45219412446022034, -0.000048255147703457624, 0.3095889091491699,
  0.6385445594787598, 0.000022417518266593106, -0.19429609179496765, 0.4018961787223816, -0.000017567186660016887, 0.17575110495090485, 0.5882453918457031, 0.000040788992919260636, -0.32813388109207153
]);
const source=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-self-contact-default-ring.fold.json',import.meta.url),'utf8')) as FoldGraph;

test('real eight-sector ring preserves every source triangle and winding through the 100% local layer arrangement',()=>{
  const {prepared}=prepareSimulationDocument(source),before=structuredClone(prepared),pose=finalPositions.slice();
  assert.equal(prepared.sourceFaceCount,65);assert.equal(prepared.faceCount,126);
  const result=recomputeFlatLayers(computeFlatGeometry(source,2e-6)),order=simulationLayerOrder(source,result);
  assert.ok(order);assert.equal(result.layers.status,'solved');assert.equal(order.faceOrders.length,416);
  const layers=new SimulationSurfaceLayers(prepared,1);layers.setLayerOrder(order);
  const display=layers.build(pose);assert.ok(display,'the real stable full-fold endpoint must receive its solved local layers');
  assert.equal(display.layerCount,7);assert.equal(display.indices.length,prepared.indices.length,'the original triangles remain whole');
  assert.equal(display.sourceTriangles!.length,prepared.faceCount);assert.equal(new Set(display.sourceTriangles).size,prepared.faceCount);
  const weights=Array.from(display.sourceVertices,(source,v)=>display.sourceVertexWeights?.[v]??[[source,1] as [number,number]]);
  weights.forEach((rows,v)=>assert.deepEqual(rows,[[display.sourceVertices[v],1]],'no local overlap point is inserted into a complete paper face'));
  const base=weights.map(rows=>{
    assert.ok(rows.length>0&&rows.every(([s,w])=>Number.isInteger(s)&&s>=0&&s<prepared.vertexCount&&Number.isFinite(w)&&w>=0&&w<=1));
    assert.ok(Math.abs(rows.reduce((sum,[,w])=>sum+w,0)-1)<1e-12);
    return [0,1,2].map(k=>rows.reduce((sum,[s,w])=>sum+w*pose[s*3+k],0)) as Vector;
  });
  const areas=prepared.facesVertices.map(triangle=>{
    const [a,b,c]=triangle.map(v=>position(pose,v));return cross(sub(b,a),sub(c,a));
  }),covered=areas.map(()=>0),roundingArea=areas.map(()=>0),owners=Array.from({length:prepared.vertexCount},()=>new Set<number>());
  prepared.facesVertices.forEach((triangle,f)=>triangle.forEach(v=>owners[v].add(f)));
  let meaningful=0;
  for(let i=0;i<display.indices.length;i+=3){
    const ids=Array.from(display.indices.slice(i,i+3)),[a,b,c]=ids.map(v=>base[v]),normal=cross(sub(b,a),sub(c,a)),area=Math.hypot(...normal)/2;
    if(area<=1e-15)continue;
    const support=[...new Set(ids.flatMap(v=>weights[v].map(([s])=>s)))],matches=[...owners[support[0]]].filter(f=>support.every(s=>owners[s].has(f)));
    assert.equal(matches.length,1,'each positive-area display triangle must belong wholly to one actual source triangle');
    const f=matches[0],alignment=dot(normal,areas[f]),[shownA,shownB,shownC]=ids.map(v=>position(display.positions,v)),shownNormal=cross(sub(shownB,shownA),sub(shownC,shownA));
    assert.ok(Math.hypot(...shownNormal)>0,'Float32-collapsed display triangles must be removed');
    assert.ok(dot(shownNormal,areas[f])>0,'actual Float32 display triangles must keep the original material winding');
    if(alignment<0)roundingArea[f]+=area;
    covered[f]+=area;meaningful++;
  }
  assert.equal(meaningful,prepared.faceCount,'every original material triangle is displayed exactly once');
  covered.forEach((area,f)=>{
    const expected=Math.hypot(...areas[f])/2;
    assert.ok(Math.abs(area-expected)<=Math.max(1e-11,expected*2e-6),`source triangle ${f}: ${area} vs ${expected}`);
    assert.ok(roundingArea[f]<=Math.max(1e-12,expected*1e-6),'Float32 winding correction is limited to sub-resolution source slivers');
  });
  const flat=blendSimulationSurface(display,pose,0);
  for(let v=0;v<base.length;v++)for(let k=0;k<3;k++)assert.ok(Math.abs(flat.positions[v*3+k]-base[v][k])<1e-7);
  assert.deepEqual(pose,finalPositions);assert.deepEqual(prepared,before);
});

test('the real ring never substitutes numeric face IDs for missing or contradictory local relations',()=>{
  const {prepared}=prepareSimulationDocument(source),layers=new SimulationSurfaceLayers(prepared,1),before=finalPositions.slice();
  assert.equal(layers.build(finalPositions),null);
  layers.setLayerOrder({sourceSignature:'unknown-ring-order',sourceFaceCount:65,faceOrders:[[0,1,1],[0,1,-1]]});
  assert.equal(Boolean(layers.build(finalPositions)),false);
  assert.deepEqual(finalPositions,before);
});

test('real ring camera gap changes reuse the exact arrangement and keep every retained Float32 winding safe',t=>{
  const {prepared}=prepareSimulationDocument(source),pose=finalPositions.slice(),before=pose.slice(),layers=new SimulationSurfaceLayers(prepared,1);
  layers.setLayerOrder(simulationLayerOrder(source,recomputeFlatLayers(computeFlatGeometry(source,2e-6))));
  const layout=layers.build(pose,2e-5)!;assert.ok(layout?.gapBasePositions&&layout.gapDirections&&layout.gapTriangleNormals);assert.equal(layout.indices.length,prepared.indices.length);
  let resizedCount=0,rejectedCount=0,resizeTime=0;
  for(const gap of [1.99999e-5,1.999e-5,1.99e-5,1.9e-5,1e-5,8e-6]){
    const started=performance.now(),resized=resizeSimulationSurfaceGap(layout,gap),display=resized??layout;resizeTime+=performance.now()-started;
    if(resized){resizedCount++;assert.equal(display.layerGap,gap);}else rejectedCount++;
    for(const key of ['indices','edgesVertices','edgesAssignment','sourceVertices','sourceVertexWeights','sourceTriangles','gapBasePositions','gapDirections'] as const)assert.equal(display[key],layout[key],`${key} does not reconstruct the local arrangement`);
    for(let f=0;f<display.indices.length;f+=3){
      const raw=cross(sub(position(display.positions,display.indices[f+1]),position(display.positions,display.indices[f])),sub(position(display.positions,display.indices[f+2]),position(display.positions,display.indices[f]))),expected=Array.from(display.gapTriangleNormals!.slice(f,f+3)) as Vector;
      assert.ok(dot(raw,expected)>0,'no changed gap may upload a collapsed or reversed material triangle');
    }
  }
  assert.equal(resizedCount,6,'all requested normal gaps keep complete source triangles');assert.equal(rejectedCount,0,'complete panels do not produce thin clipping fragments that reject these camera gaps');
  t.diagnostic(`6 cached ring gap requests: ${resizeTime.toFixed(1)} ms; no wall-clock threshold`);
  assert.deepEqual(pose,before);assert.equal(layout.layerGap,2e-5);
});

test('the real ring accepts a user display-spacing domain up to one thousand times the normal cap',t=>{
  const {prepared}=prepareSimulationDocument(source),pose=finalPositions.slice(),before=structuredClone(prepared),layers=new SimulationSurfaceLayers(prepared,1);
  layers.setLayerOrder(simulationLayerOrder(source,recomputeFlatLayers(computeFlatGeometry(source,2e-6))));
  const layout=layers.build(pose,4e-5,{maxGap:4e-2});assert.ok(layout);
  assert.equal(layout.layerGap,4e-5);assert.equal(layout.gapLimit,4e-2);assert.equal(layout.layerCount,7);
  const materialPoints=Array.from(layout.sourceVertices,(source,v)=>[0,1,2].map(k=>layout.sourceVertexWeights?.[v]?.reduce((sum,[source,weight])=>sum+weight*pose[source*3+k],0)??pose[source*3+k]) as Vector);
  const originalNormals=prepared.facesVertices.map(face=>{const [a,b,c]=face.map(v=>position(pose,v));return cross(sub(b,a),sub(c,a));}),originalAreas=originalNormals.map(n=>Math.hypot(...n)/2);
  const accepted:number[]=[],rejected:number[]=[];
  for(const multiplier of [.1,.25,1,2,10,100,500,1000]){
    const gap=4e-5*multiplier,resized=resizeSimulationSurfaceGap(layout,gap);
    if(!resized){rejected.push(multiplier);continue;}
    accepted.push(multiplier);assert.equal(resized.layerGap,gap);assert.equal(resized.indices.length,prepared.indices.length,'all spacing choices preserve the original material triangles');
    assert.equal(resized.gapBasePositions,layout.gapBasePositions);assert.equal(resized.gapDirections,layout.gapDirections);
    assert.equal(resized.sourceVertexWeights,layout.sourceVertexWeights,'changing display spacing cannot reconstruct material coordinates');
    const covered=new Float64Array(prepared.faceCount),corrected=new Float64Array(prepared.faceCount);
    for(let f=0;f<resized.indices.length;f+=3){
      const raw=cross(sub(position(resized.positions,resized.indices[f+1]),position(resized.positions,resized.indices[f])),sub(position(resized.positions,resized.indices[f+2]),position(resized.positions,resized.indices[f]))),expected=Array.from(resized.gapTriangleNormals!.slice(f,f+3)) as Vector;
      assert.ok(dot(raw,expected)>0,'each accepted target retains actual Float32 material winding');
      const ids=Array.from(resized.indices.slice(f,f+3)),[a,b,c]=ids.map(v=>materialPoints[v]),normal=cross(sub(b,a),sub(c,a)),area=Math.hypot(...normal)/2,source=resized.sourceTriangles![f/3];
      covered[source]+=area;if(dot(normal,originalNormals[source])<0)corrected[source]+=area;
    }
    originalAreas.forEach((area,f)=>{
      assert.ok(Math.abs(covered[f]-area)<=Math.max(1e-11,area*2e-6),`source ${f} material coverage is retained at ${multiplier}x`);
      assert.ok(corrected[f]+Math.max(0,area-covered[f])<=Math.max(1e-12,area*1e-6),`source ${f} repair stays within the material-area budget`);
    });
  }
  t.diagnostic(`accepted multipliers ${accepted.join(', ')}; rejected ${rejected.join(', ')}`);
  assert.ok(accepted.includes(1000),'the maximum is actually displayed rather than silently capped');
  assert.deepEqual(prepared,before);assert.deepEqual(pose,finalPositions);
});

test('oversized display topology returns atomically before local arrangement work',()=>{
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0]),indices=new Uint32Array([0,1,2]);
  const mesh={positions,indices,edgesVertices:[],edgesAssignment:[],sourceVertices:new Uint32Array([0,1,2]),layerCount:1,layerNormals:[] as Vector[],layerGap:5e-5};
  const options={mesh,positions,panels:[{faces:[0],vertices:[0,1,2]}],displayPanels:new Uint32Array(3),sourceIndices:indices,
    group:{panels:[0],plane:{normal:[0,0,1] as Vector,offset:0},basis:[[1,0,0],[0,1,0]] as [Vector,Vector],origin:[0,0,0] as Vector,rank:()=>null},epsilon:1e-8,gap:5e-5};
  const before=positions.slice();
  assert.equal(localSurfaceLayers({...options,mesh:{...mesh,sourceVertices:new Uint32Array(200_001)}}),null);
  assert.equal(localSurfaceLayers({...options,mesh:{...mesh,indices:new Uint32Array(250_001*3)}}),null);
  assert.deepEqual(positions,before);assert.deepEqual(indices,new Uint32Array([0,1,2]));
});

