import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSurfaceLayers,blendSimulationSurface,simulationSurfaceStrain} from '../../src/engine/simSurfaceLayers';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {boundingRadius,centroid} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {FoldAssignment,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

type V=[number,number,number];
function mesh(vertices:V[],faces:number[][],flatEdges:[number,number][]=[]):PreparedOrigamiModel {
  const edgesVertices:[number,number][]=[],edgesFaces:number[][]=[],facesEdges:number[][]=[],lookup=new Map<string,number>();
  const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  faces.forEach((face,f)=>facesEdges.push(face.map((a,i)=>{
    const b=face[(i+1)%face.length],stamp=key(a,b);let e=lookup.get(stamp);
    if(e===undefined){e=edgesVertices.length;lookup.set(stamp,e);edgesVertices.push([a,b]);edgesFaces.push([]);}
    edgesFaces[e].push(f);return e;
  })));
  const flat=new Set(flatEdges.map(([a,b])=>key(a,b)));
  const edgesAssignment:FoldAssignment[]=edgesVertices.map(([a,b],e)=>flat.has(key(a,b))?'F':edgesFaces[e].length===2?'M':'B');
  const positions=new Float32Array(vertices.flat()),indices=new Uint32Array(faces.flat()),edgesFoldAngle=edgesAssignment.map(a=>a==='M'?-180:0);
  const parents=faces.map((_,i)=>i),find=(v:number):number=>parents[v]===v?v:parents[v]=find(parents[v]);
  edgesFaces.forEach((fs,e)=>{if(edgesAssignment[e]==='F'&&fs.length===2)parents[find(fs[1])]=find(fs[0]);});
  const roots=[...new Set(faces.map((_,i)=>find(i)))],triangleSourceFaces=faces.map((_,i)=>roots.indexOf(find(i)));
  return {fold:{vertices_coords:vertices,edges_vertices:edgesVertices,edges_assignment:edgesAssignment,edges_foldAngle:edgesFoldAngle,faces_vertices:faces},
    positions,originalPositions:positions.slice(),indices,vertexCount:vertices.length,faceCount:faces.length,edgeCount:edgesVertices.length,
    triangleSourceFaces,sourceFaceCount:roots.length,
    edgesVertices,edgesAssignment,edgesFoldAngle,facesVertices:faces,facesEdges,edgesFaces,colors:new Float32Array(positions.length),creaseParams:[],diagnostics:{warnings:[],errors:[]}};
}
const triangle=(z=0):V[]=>[[0,0,z],[1,0,z],[0,1,z]];
const quad=(z=0,dx=0):V[]=>[[dx,0,z],[dx+1,0,z],[dx+1,1,z],[dx,1,z]];
const radius=1,gap=5e-5;

test('one unresolved overlapping group never produces a misleading partially separated model',()=>{
  const right=triangle().map(([x,y,z])=>[x+3,y,z] as V);
  const prepared=mesh([...triangle(),...triangle(),...right,...right],[[0,1,2],[3,4,5],[6,7,8],[9,10,11]]),before=structuredClone(prepared);
  const layers=new SimulationSurfaceLayers(prepared,radius);
  layers.setLayerOrder({sourceSignature:'two-stacks',sourceFaceCount:4,faceOrders:[[0,1,-1]]});
  assert.equal(layers.build(prepared.positions),null,'the second stack has no trusted order, so the first cannot mask a partial result');
  assert.match(layers.getIssue()??'',/层序/);
  layers.setLayerOrder({sourceSignature:'two-stacks-complete',sourceFaceCount:4,faceOrders:[[0,1,-1],[2,3,-1]]});
  const display=layers.build(prepared.positions);assert.ok(display);assert.equal(display.indices.length,prepared.indices.length);
  assert.equal(layers.getIssue(),undefined);assert.deepEqual(prepared,before);
});
function close(a:number,b:number,tolerance=1e-7){assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b}`);}

/** Test fixture explicitly provides a solved order, including winding signs;
 * the production renderer must never derive that order from source indices. */
function setFixtureOrder(layers:SimulationSurfaceLayers,prepared:PreparedOrigamiModel,pose=prepared.positions):void {
  const normal=(source:number)=>{
    const f=prepared.triangleSourceFaces!.indexOf(source),[a,b,c]=Array.from(prepared.indices.slice(f*3,f*3+3));
    const ab=[0,1,2].map(k=>pose[b*3+k]-pose[a*3+k]),ac=[0,1,2].map(k=>pose[c*3+k]-pose[a*3+k]);
    return [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  };
  const faceOrders:Array<[number,number,number]>=[];
  for(let b=1;b<prepared.sourceFaceCount!;b++){
    const n=normal(b);let axis=0;for(let k=1;k<3;k++)if(Math.abs(n[k])>Math.abs(n[axis]))axis=k;
    faceOrders.push([b-1,b,n[axis]<0?1:-1]);
  }
  layers.setLayerOrder({sourceSignature:'explicit-test-solution',sourceFaceCount:prepared.sourceFaceCount!,faceOrders});
}
function orderedLayers(prepared:PreparedOrigamiModel,radius:number):SimulationSurfaceLayers {
  const layers=new SimulationSurfaceLayers(prepared,radius);setFixtureOrder(layers,prepared);return layers;
}

test('explicit solved order separates coincident panels while preserving all solver data',()=>{
  const prepared=mesh([...triangle(),...triangle(),...triangle()],[[0,1,2],[5,4,3],[6,7,8]]),before=structuredClone(prepared);
  const layers=orderedLayers(prepared,radius),first=layers.build(prepared.positions)!;
  assert.ok(first);assert.equal(first.layerCount,3);assert.deepEqual(first.layerNormals,[[0,0,1]]);assert.equal(first.layerGap,gap);
  first.sourceVertices.forEach((source,v)=>{close(first.positions[v*3],prepared.positions[source*3]);close(first.positions[v*3+1],prepared.positions[source*3+1]);close(first.positions[v*3+2],Math.floor(source/3)*gap);});
  const repeat=layers.build(prepared.positions)!;assert.deepEqual(repeat.positions,first.positions);assert.equal(repeat.indices,first.indices);assert.equal(repeat.sourceVertices,first.sourceVertices);assert.equal(repeat.edgesVertices,first.edgesVertices);assert.equal(repeat.edgesAssignment,first.edgesAssignment);
  assert.deepEqual(prepared,before);
});

test('F diagonals keep all triangles in the same material panel and suppress internal double layering',()=>{
  const one=mesh(quad(),[[0,1,2],[0,2,3]],[[0,2]]);assert.equal(orderedLayers(one,radius).build(one.positions),null);
  const two=mesh([...quad(),...quad()],[[0,1,2],[0,2,3],[4,6,5],[4,7,6]],[[0,2],[4,6]]);
  const built=orderedLayers(two,radius).build(two.positions)!;assert.equal(built.layerCount,2);assert.equal(built.sourceVertices.length,8);
  for(let v=0;v<4;v++)close(built.positions[v*3+2],0);
  for(let v=4;v<8;v++)close(built.positions[v*3+2],gap);
});

test('small positive and negative perturbations project onto one fixed common plane with a true gap',()=>{
  for(const sign of [-1,1]){
    const other:V[]=[[0,0,sign*1e-4],[1,0,-sign*1e-4],[0,1,sign*2e-4]],prepared=mesh([...triangle(),...other],[[0,1,2],[3,4,5]]),positions=prepared.positions.slice();
    const built=orderedLayers(prepared,radius).build(positions)!;assert.ok(built);assert.equal(built.layerCount,2);
    for(let v=0;v<3;v++)close(built.positions[v*3+2],0);
    for(let v=3;v<6;v++)close(built.positions[v*3+2],gap);
    assert.deepEqual(positions,prepared.positions);
  }
});

test('near-height groups do not accumulate tolerance transitively through intermediate panels',()=>{
  const prepared=mesh([...triangle(),...triangle(.0004),...triangle(.0008)],[[0,1,2],[3,4,5],[6,7,8]]),built=orderedLayers(prepared,radius).build(prepared.positions)!;
  assert.equal(built.layerCount,2);for(let v=6;v<9;v++)close(built.positions[v*3+2],.0008);
});

test('spatial overlap can connect distant panels while the shared plane stays anchored to the first panel',()=>{
  const prepared=mesh([...quad(),...quad(.0002,.5),...quad(.0004,1.2)],[[0,1,2],[0,2,3],[4,5,6],[4,6,7],[8,9,10],[8,10,11]],[[0,2],[4,6],[8,10]]);
  const built=orderedLayers(prepared,radius).build(prepared.positions)!;assert.ok(built);assert.equal(built.layerCount,3);
  for(let v=0;v<12;v++)close(built.positions[v*3+2],Math.floor(v/4)*gap);
});

test('only positive overlap area qualifies, including nonconvex panel holes represented by triangles',()=>{
  const side=mesh([...quad(),...quad(0,1)],[[0,1,2],[0,2,3],[4,5,6],[4,6,7]],[[0,2],[4,6]]);
  assert.equal(orderedLayers(side,radius).build(side.positions),null,'touching a complete edge is not overlap');
  const point=mesh([...triangle(),...([[1,0,0],[2,0,0],[1,1,0]] as V[])],[[0,1,2],[3,4,5]]);
  assert.equal(orderedLayers(point,radius).build(point.positions),null,'touching one point is not overlap');
  const separate=mesh([...triangle(),...([[.8,.8,0],[1.8,.8,0],[.8,1.8,0]] as V[])],[[0,1,2],[3,4,5]]);
  assert.equal(orderedLayers(separate,radius).build(separate.positions),null,'overlapping bounding boxes alone are insufficient');
  // The four sides are one F-linked annulus; the second panel sits in its hole.
  const ring:V[]=[[0,0,0],[3,0,0],[3,3,0],[0,3,0],[1,1,0],[2,1,0],[2,2,0],[1,2,0],[1.2,1.2,0],[1.8,1.2,0],[1.2,1.8,0]];
  const faces=[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7],[8,9,10]],raw=mesh(ring,faces);
  const internal=raw.edgesVertices.filter((_,e)=>raw.edgesFaces[e].length===2),holed=mesh(ring,faces,internal);
  assert.equal(orderedLayers(holed,2).build(holed.positions),null,'the empty opening stays empty');
});

test('bent panels and genuinely intersecting angled sheets are never flattened as near-coincident layers',()=>{
  const angle=mesh([...triangle(),...([[0,0,0],[1,0,0],[0,1,.01]] as V[])],[[0,1,2],[3,4,5]]);
  assert.equal(orderedLayers(angle,radius).build(angle.positions),null);
  const bent:V[]=[...quad(),...([[0,0,0],[1,0,0],[1,1,.01],[0,1,0]] as V[])],prepared=mesh(bent,[[0,1,2],[0,2,3],[4,5,6],[4,6,7]],[[0,2],[4,6]]);
  assert.equal(orderedLayers(prepared,radius).build(prepared.positions),null);
});

test('actual CPU full-fold poses at early and late steps receive display layers without changing the solver',()=>{
  const source={vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[null,null,null,null,null,null,-180],faces_vertices:[[0,1,4,5],[1,2,3,4]]};
  const {prepared}=prepareSimulationDocument(source),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:100,timeStepScale:.35,damping:.5});
  const origin=prepared.positions.slice(),actualRadius=boundingRadius(origin,centroid(origin)),layers=orderedLayers(prepared,actualRadius);
  try{
    for(const steps of [8000,32000]){
      solver.step(steps);const pose=new Float32Array(prepared.vertexCount*3);solver.readPositions(pose);setFixtureOrder(layers,prepared,pose);const before=pose.slice(),built=layers.build(pose)!;
      assert.ok(built,`${solver.stepCount} steps is a real near-flat full-fold case`);assert.equal(built.layerCount,2);assert.deepEqual(layers.build(pose)!.positions,built.positions);
      assert.deepEqual(pose,before);assert.deepEqual(prepared.positions,origin);assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<.001);
      assert.ok(built.sourceVertices.length>prepared.vertexCount,'the two hinge sides get independent display vertices');
      const crease=prepared.edgesVertices.find((_,e)=>prepared.edgesAssignment[e]==='M')!;
      assert.equal(built.edgesAssignment.filter(a=>a==='M').length,2);
      for(const vertex of crease){const displayed=Array.from(built.sourceVertices).flatMap((source,v)=>source===vertex?[v]:[]);assert.equal(displayed.length,2);const [a,b]=displayed.map(v=>Array.from(built.positions.slice(v*3,v*3+3)));close(Math.hypot(...a.map((n,k)=>n-b[k])),actualRadius*gap,2e-7);}
    }
    solver.reset();const reset=new Float32Array(prepared.vertexCount*3);solver.readPositions(reset);assert.equal(layers.build(reset),null);
  }finally{solver.dispose();}
});

test('a real four-panel accordion resolves its converged full-fold stack without flattening the earlier bent pose',()=>{
  const source={vertices_coords:Array.from({length:10},(_,v)=>[v%5,Math.floor(v/5)]),
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,9],[9,8],[8,7],[7,6],[6,5],[5,0],[1,6],[2,7],[3,8]],
    edges_assignment:['B','B','B','B','B','B','B','B','B','B','M','V','M'],
    edges_foldAngle:[0,0,0,0,0,0,0,0,0,0,-180,180,-180],faces_vertices:[[0,1,6,5],[1,2,7,6],[2,3,8,7],[3,4,9,8]]};
  const sourceBefore=structuredClone(source),{prepared}=prepareSimulationDocument(source),preparedBefore=structuredClone(prepared),
    solver=new ReferenceSolver(new OrigamiModel(prepared),{foldPercent:100,timeStepScale:.35,damping:.5}),
    actualRadius=boundingRadius(prepared.positions,centroid(prepared.positions)),layers=orderedLayers(prepared,actualRadius);
  try{
    solver.step(8000);const early=new Float32Array(prepared.vertexCount*3);solver.readPositions(early);const earlyBefore=early.slice();
    // This real intermediate pose still has visibly bent F-linked panels and
    // approximately 3--9 degree differences between sheet normals. A low
    // edge-strain report alone must not make it eligible for display flattening.
    assert.equal(layers.build(early),null);assert.deepEqual(early,earlyBefore);
    solver.step(32000);const converged=new Float32Array(prepared.vertexCount*3);solver.readPositions(converged);const before=converged.slice(),steps=solver.stepCount;
    setFixtureOrder(layers,prepared,converged);const built=layers.build(converged)!;assert.ok(built);assert.equal(built.layerCount,4);assert.equal(built.sourceVertices.length,16);
    assert.equal(built.edgesAssignment.filter(a=>a==='F').length,4,'four F diagonals stay inside four material panels');
    assert.equal(built.edgesAssignment.filter(a=>a==='M'||a==='V').length,6,'each real hinge keeps both display banks');
    prepared.edgesAssignment.forEach((assignment,e)=>{
      if(assignment!=='F')return;
      const [a,b]=prepared.edgesFaces[e],first=Array.from(built.indices.slice(a*3,a*3+3)),second=Array.from(built.indices.slice(b*3,b*3+3));
      assert.equal(first.filter(v=>second.includes(v)).length,2,'F-linked triangles share their diagonal vertex IDs without fragmenting');
      assert.equal(new Set([...first,...second]).size,4);
    });
    const normal=built.layerNormals[0],height=(v:number)=>normal.reduce((sum,n,axis)=>sum+n*built.positions[v*3+axis],0),baseHeight=height(0);
    for(let v=0;v<16;v++)close(height(v)-baseHeight,Math.floor(v/4)*built.layerGap,2e-7);
    assert.deepEqual(layers.build(converged)!.positions,built.positions);assert.deepEqual(converged,before);assert.equal(solver.stepCount,steps);
    const actual=new Float32Array(converged.length);solver.readPositions(actual);assert.deepEqual(actual,before,'display builds never write into the solver');
    assert.ok((solver.readDiagnostics().maxEdgeStrain??Infinity)<1e-5);
    assert.deepEqual(source,sourceBefore);assert.deepEqual(prepared,preparedBefore);
  }finally{solver.dispose();}
});

test('complete solved stacks retain all panels on both sides of the old hundred-panel cutoff',()=>{
  for(const count of [100,101]){
    const vertices=Array.from({length:count},()=>triangle()).flat(),faces=Array.from({length:count},(_,i)=>[3*i,3*i+1,3*i+2]),prepared=mesh(vertices,faces),built=orderedLayers(prepared,radius).build(prepared.positions);
    assert.ok(built);assert.equal(built.layerCount,count);assert.equal(built.indices.length,prepared.indices.length);assert.equal(built.sourceVertices.length,prepared.vertexCount);
    const coordinates=Array.from(built.positions).filter((_,i)=>i%3===2);close(Math.max(...coordinates),(count-1)*gap);
  }
});

test('invalid pose buffers fail without changing topology or returning a partial display mesh',()=>{
  const prepared=mesh([...triangle(),...triangle()],[[0,1,2],[3,4,5]]),layers=orderedLayers(prepared,radius);
  assert.equal(layers.build(new Float32Array(3)),null);const invalid=prepared.positions.slice();invalid[0]=NaN;assert.equal(layers.build(invalid),null);assert.ok(layers.build(prepared.positions));
});

test('five thousand disjoint coplanar panels keep every original vertex without manufacturing display layers',t=>{
  const count=5000,vertices:V[]=[],faces:number[][]=[];
  for(let p=0;p<count;p++){const start=vertices.length;vertices.push(...quad(0,p*2));faces.push([start,start+1,start+2],[start,start+2,start+3]);}
  const diagonal=Array.from({length:count},(_,p)=>[p*4,p*4+2] as [number,number]),prepared=mesh(vertices,faces,diagonal),original=prepared.positions.slice();
  const layers=orderedLayers(prepared,count),start=performance.now();assert.equal(layers.build(prepared.positions),null);
  t.diagnostic(`5000 disjoint panels: ${(performance.now()-start).toFixed(1)} ms; no wall-clock threshold`);
  assert.deepEqual(prepared.positions,original);assert.equal(prepared.vertexCount,count*4);
});

test('no solved order, incomplete overlapping order, conflicting order and invalid mappings never guess layers',()=>{
  const prepared=mesh([...triangle(),...triangle(),...triangle()],[[0,1,2],[3,4,5],[6,7,8]]),layers=new SimulationSurfaceLayers(prepared,radius);
  assert.equal(layers.build(prepared.positions),null,'face IDs alone have no layer meaning');
  const set=(faceOrders:Array<[number,number,number]>)=>layers.setLayerOrder({sourceSignature:'solved',sourceFaceCount:3,faceOrders});
  set([]);assert.equal(layers.build(prepared.positions),null);
  set([[0,1,1]]);assert.equal(layers.build(prepared.positions),null,'one unknown overlapping layer cannot be inserted by ID');
  set([[0,1,1],[1,0,1],[1,2,1]]);assert.equal(layers.build(prepared.positions),null,'contradictory relations cannot pick a bank');
  set([[0,1,1],[1,2,1],[2,0,1]]);assert.equal(layers.build(prepared.positions),null,'a cycle at one common region is invalid');
  set([[0,1,1],[1,2,1]]);assert.ok(layers.build(prepared.positions));
  layers.setLayerOrder(null);assert.equal(layers.build(prepared.positions),null);
  for(const broken of [{...prepared,triangleSourceFaces:undefined},{...prepared,triangleSourceFaces:[0,1,8]},{...prepared,sourceFaceCount:2}]){
    const renderer=new SimulationSurfaceLayers(broken,radius);renderer.setLayerOrder({sourceSignature:'solved',sourceFaceCount:3,faceOrders:[[0,1,1],[1,2,1]]});
    assert.equal(renderer.build(broken.positions),null);
  }
});

test('solved order can reverse numeric IDs, honours second-face winding, and follows a rotated model',()=>{
  for(const reverse of [false,true])for(const rotated of [false,true]){
    const original=[...triangle(),...triangle()],vertices=rotated?original.map(([x,y,z])=>[z,x,y] as V):original;
    const prepared=mesh(vertices,[[0,1,2],reverse?[5,4,3]:[3,4,5]]),layers=new SimulationSurfaceLayers(prepared,radius);
    // Face 0 belongs above face 1, regardless of either original numeric rank.
    layers.setLayerOrder({sourceSignature:'solved',sourceFaceCount:2,faceOrders:[[0,1,reverse?-1:1]]});
    const display=layers.build(prepared.positions)!;assert.ok(display);const axis=rotated?0:2;
    for(let v=0;v<3;v++)close(display.positions[v*3+axis],gap);
    for(let v=3;v<6;v++)close(display.positions[v*3+axis],0);
    assert.deepEqual(Uint32Array.from(display.indices,v=>display.sourceVertices[v]),prepared.indices);
  }
});

test('locally valid three-face cycle separates complete planar panels without clipping or a fictitious global rank',()=>{
  const a:V[]=[[0,0,0],[3,0,0],[3,1,0],[0,1,0]],b:V[]=[[2,0,0],[3,0,0],[3,3,0],[2,3,0]],c:V[]=[[-.2,.5,0],[.5,-.2,0],[3.2,2.5,0],[2.5,3.2,0]];
  const prepared=mesh([...a,...b,...c],[[0,1,2],[0,2,3],[4,5,6],[4,6,7],[8,9,10],[8,10,11]],[[0,2],[4,6],[8,10]]),before=structuredClone(prepared),layers=new SimulationSurfaceLayers(prepared,4);
  layers.setLayerOrder({sourceSignature:'local-cycle',sourceFaceCount:3,faceOrders:[[1,0,1],[2,1,1],[0,2,1]]});
  const display=layers.build(prepared.positions)!;assert.ok(display);assert.equal(display.layerCount,2);
  assert.equal(display.indices.length,prepared.indices.length);assert.equal(display.sourceVertices.length,prepared.vertexCount,'no overlap intersection vertex splits the source panels');
  assert.deepEqual(Uint32Array.from(display.indices,v=>display.sourceVertices[v]),prepared.indices);
  for(let v=0;v<display.sourceVertices.length;v++){
    const source=display.sourceVertices[v];if(display.sourceVertexWeights?.[v])assert.deepEqual(display.sourceVertexWeights[v],[[source,1]]);
    close(display.positions[v*3],prepared.positions[source*3]);close(display.positions[v*3+1],prepared.positions[source*3+1]);
  }
  for(let panel=0;panel<3;panel++){
    const ids=Array.from(display.sourceVertices).flatMap((source,v)=>Math.floor(source/4)===panel?[v]:[]),points=ids.map(v=>Array.from(display.positions.slice(v*3,v*3+3))),u=points[1].map((n,k)=>n-points[0][k]),v=points[2].map((n,k)=>n-points[0][k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);
    assert.ok(length>0);
    for(const p of points)assert.ok(Math.abs(p.reduce((sum,n,k)=>sum+(n-points[0][k])*normal[k],0))/length<1e-7,'each source quadrilateral is still one plane');
  }
  const at=(x:number,y:number)=>{
    const found=new Map<number,number>();
    for(let i=0;i<display.indices.length;i+=3){
      const ids=Array.from(display.indices.slice(i,i+3)),p=ids.map(v=>[display.positions[v*3],display.positions[v*3+1]]),signed=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),area=signed(p[0],p[1],p[2]);
      if(Math.abs(area)<1e-10)continue;
      const q=[x,y],weights=[signed(q,p[1],p[2])/area,signed(p[0],q,p[2])/area,signed(p[0],p[1],q)/area];
      if(weights.some(w=>w< -1e-6))continue;
      const owner=Math.floor(display.sourceVertices[ids[0]]/4),height=weights.reduce((sum,w,k)=>sum+w*display.positions[ids[k]*3+2],0);found.set(owner,height);
    }
    return found;
  };
  const ab=at(2.6,.4),bc=at(2.6,2.3),ca=at(.4,.5);
  assert.deepEqual([...ab.keys()].sort(),[0,1]);assert.ok(ab.get(1)!-ab.get(0)!>=display.layerGap-1e-7);
  assert.deepEqual([...bc.keys()].sort(),[1,2]);assert.ok(bc.get(2)!-bc.get(1)!>=display.layerGap-1e-7);
  assert.deepEqual([...ca.keys()].sort(),[0,2]);assert.ok(ca.get(0)!-ca.get(2)!>=display.layerGap-1e-7);
  assert.deepEqual(prepared,before,'whole-panel display heights must not change solver/export topology');
  const halfway=blendSimulationSurface(display,prepared.positions,.5),base=blendSimulationSurface(display,prepared.positions,0);
  assert.equal(halfway.indices,display.indices);assert.equal(halfway.edgesVertices,display.edgesVertices);
  for(let v=0;v<display.sourceVertices.length;v++){
    const weights=display.sourceVertexWeights?.[v]??[[display.sourceVertices[v],1] as [number,number]];close(weights.reduce((sum,[,w])=>sum+w,0),1);
    for(let axis=0;axis<3;axis++){
      const expected=weights.reduce((sum,[s,w])=>sum+w*prepared.positions[s*3+axis],0);
      close(base.positions[v*3+axis],expected,1e-6);close(halfway.positions[v*3+axis],(display.positions[v*3+axis]+expected)/2,1e-6);
    }
  }
  const strain=Float32Array.from({length:prepared.vertexCount},(_,i)=>i),sampled=simulationSurfaceStrain(display,strain);
  for(let v=0;v<sampled.length;v++)close(sampled[v],strain[display.sourceVertices[v]],1e-6);
});

test('display blending and strain sampling retain the fast-path topology and source arrays',()=>{
  const prepared=mesh([...triangle(),...triangle()],[[0,1,2],[3,4,5]]),meshBefore=prepared.positions.slice(),display=orderedLayers(prepared,radius).build(prepared.positions)!;
  assert.equal(blendSimulationSurface(display,prepared.positions,1),display);
  const half=blendSimulationSurface(display,prepared.positions,.5);assert.equal(half.indices,display.indices);assert.equal(half.sourceVertices,display.sourceVertices);
  for(let v=3;v<6;v++)close(half.positions[v*3+2],gap/2);
  assert.deepEqual(simulationSurfaceStrain(display,new Float32Array([1,2,3,4,5,6])),new Float32Array([1,2,3,4,5,6]));
  assert.deepEqual(prepared.positions,meshBefore);
});
