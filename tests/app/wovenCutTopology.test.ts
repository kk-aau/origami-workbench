import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {FoldGraph,Point} from '../../src/core/types';
import {hasWovenInternalB,inspectWovenCutTopology,splitWovenCutGraph} from '../../src/app/wovenCutTopology';

const saved=(file:string)=>JSON.parse(fs.readFileSync(`tests/fixtures/${file}`,'utf8')).cases;
const boundary=saved('woven-original-boundaries-20261001.json');
const all=[...boundary,...saved('woven-even-degree-20261001.json'),...saved('woven-concave-cells-20261001.json')];
const cuts=boundary.filter((c:any)=>c.name.startsWith('internal-diagonal'));
const clone=<T>(value:T):T=>structuredClone(value);
const edgeKey=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
const signedArea=(coords:Point[],face:number[])=>face.reduce((s,v,i)=>{const q=coords[face[(i+1)%face.length]];return s+coords[v][0]*q[1]-q[0]*coords[v][1];},0)/2;

test('24 real source fixtures independently bind parameters, literal makeverts, CP and original winding restoration',()=>{
  for(const c of all){
    const result=inspectWovenCutTopology(c.response,c.params??c.query);
    assert.ok(result.ok,`${c.name}: ${result.ok?'':result.reason}`);
    if(!result.ok)continue;
    const t=result.topology,g=t.splitGraph,fs=g.faces_vertices!,counts=Array(g.edges_vertices.length).fill(0);
    assert.deepEqual(t.sourceCP,c.response.fold.vertices_coords,c.name);
    assert.deepEqual(t.sourceFolded,c.response.source.foldedForm,c.name);
    assert.deepEqual(g.faces_vertices,t.faceCorners);
    fs.forEach((face,f)=>{
      assert.ok(signedArea(g.vertices_coords,face)>0,'CP material winding must be CCW');
      const original=c.response.fold.faces_vertices[f];
      assert.deepEqual(face.map(v=>t.vertexSource[v]).slice().sort((a,b)=>a-b),original.slice().sort((a:number,b:number)=>a-b),'preserve source face ID and all corners');
      for(let k=0;k<face.length;k++){
        const e=g.faces_edges![f][k],[a,b]=g.edges_vertices[e];
        assert.equal(edgeKey(a,b),edgeKey(face[k],face[(k+1)%face.length]));
        assert.ok(g.edges_faces![e].includes(f));counts[e]++;
        const neighbor=g.edges_faces![e].find(owner=>owner!==f);
        assert.equal(g.faces_faces![f][k],neighbor,'adjacency keeps its edge slot, including absent B neighbors');
      }
    });
    for(let e=0;e<g.edges_vertices.length;e++){
      assert.equal(counts[e],g.edges_assignment[e]==='B'?1:2,'every split B has exactly one owner');
      assert.equal(g.edges_assignment[e],c.response.fold.edges_assignment[t.edgeSource[e]],'a cut is never recolored M/V');
    }
    t.vertexSource.forEach((v,i)=>{
      assert.deepEqual(g.vertices_coords[i],t.sourceCP[v]);
      assert.deepEqual(t.splitFolded[i],t.sourceFolded[v],'every piece remains in its original FF position');
    });
    assert.deepEqual(t.components.flatMap(c=>c.faces).sort((a,b)=>a-b),fs.map((_,i)=>i));
    assert.ok(inspectWovenCutTopology(c.response).ok,'omitting current params still binds actual response params');
  }
});

test('four original internal-B roots split into three sheets without losing material sides or stationary pose',()=>{
  for(const c of cuts){
    const r=inspectWovenCutTopology(c.response,c.params);assert.ok(r.ok);if(!r.ok)continue;
    const t=r.topology;
    assert.equal(t.standardSingleSheetFold,false);
    assert.equal(t.sourceCP.length,10);assert.equal(t.splitGraph.vertices_coords.length,14);assert.equal(t.splitGraph.edges_vertices.length,16);
    assert.deepEqual(t.components.map(c=>c.faces.length),[1,3,1]);
    assert.equal(t.splitGraph.edges_assignment.filter(a=>a==='B').length,14);assert.equal(t.splitGraph.edges_assignment.filter(a=>a==='V').length,2);
    assert.deepEqual(t.internalBoundaryEdges,[2,5]);
    for(const cut of t.internalBoundaryEdges){const banks=t.edgeSource.flatMap((source,e)=>source===cut?[e]:[]);assert.equal(banks.length,2);assert.ok(banks.every(e=>t.splitGraph.edges_faces![e].length===1));}
    const sourceFaces=c.response.fold.faces_vertices;
    t.faceCorners.forEach((face,f)=>{
      const before=Math.sign(signedArea(t.sourceFolded,sourceFaces[f]))*Math.sign(signedArea(t.sourceCP,sourceFaces[f])),after=Math.sign(signedArea(t.splitFolded,face));
      assert.equal(before,after,'physical material side is FF winding relative to CP winding');
    });
    const f=t.stationaryFoldFace;
    t.faceCorners[f].forEach(v=>assert.ok(Math.hypot(t.splitGraph.vertices_coords[v][0]-t.splitFolded[v][0],t.splitGraph.vertices_coords[v][1]-t.splitFolded[v][1])<1e-10,'fixed face uses original FF coordinates'));
  }
});

test('internal B detection reads actual incidence even when the trust flag is removed or forged',()=>{
  for(const c of boundary){
    assert.equal(hasWovenInternalB(c.response.fold),c.name.startsWith('internal-diagonal'));
    const r=clone(c.response);delete r.source.wovenCutTopology;
    assert.equal(hasWovenInternalB(r.fold),c.name.startsWith('internal-diagonal'));
    if(c.name.startsWith('internal-diagonal'))assert.equal(inspectWovenCutTopology(r).ok,false);
  }
  const r=clone(cuts[0].response);r.source.wovenCutTopology.standardSingleSheetFold=true;
  assert.equal(hasWovenInternalB(r.fold),true);assert.equal(inspectWovenCutTopology(r).ok,false);
});

test('source flags cannot certify forged parameters, incidence, assignments, isometry or unfolded pose',()=>{
  const base=cuts[0],reject=(mutate:(r:any)=>void)=>{const r=clone(base.response);mutate(r);const inspected=inspectWovenCutTopology(r,base.params);assert.equal(inspected.ok,false,inspected.ok?'':'must reject: '+inspected.reason);};
  reject(r=>delete r.stats.parameters);
  reject(r=>r.stats.parameters.width=.07);
  reject(r=>r.source.graph.vertices[0][0]+=.01);
  reject(r=>r.mother.vertices_coords[0][0]+=.01);
  reject(r=>r.source.sourceFaceCycles[0].reverse());
  reject(r=>r.source.edgeWidths[4]*=1.1);
  reject(r=>r.source.pleatFactors[0]*=1.1);
  reject(r=>r.source.pleatFactors.push(1));
  reject(r=>r.source.foldedForm[1][0]+=.01);
  reject(r=>r.source.foldedForm=r.source.foldedForm.map(([x,y]:Point)=>[x+.1,y-.2]));
  reject(r=>r.fold.vertices_coords=r.fold.vertices_coords.map(([x,y]:Point)=>[x+.1,y-.2]));
  reject(r=>r.fold.faces_vertices[0]=r.fold.faces_vertices[1].slice());
  reject(r=>r.fold.edges_assignment[2]='M');
  reject(r=>r.source.stationaryFoldFace=2);
  reject(r=>r.source.wovenCutTopology.internalBoundaryEdges=[]);
  reject(r=>r.source.wovenCutTopology.edgeFaceIncidence[2]=[0]);
  reject(r=>r.source.wovenCutTopology.foldedFaceWinding[0]*=-1);
  reject(r=>r.source.wovenCutTopology.edgeRestoreAnglesDeg[2]=0);
  reject(r=>r.source.periodVectors=[[1,0]]);
  const p=clone(base.params);p.parity=-p.parity;assert.equal(inspectWovenCutTopology(base.response,p).ok,false);
});

function grid(n:number,omitCenter=false):FoldGraph {
  const coords:Point[]=Array.from({length:(n+1)**2},(_,i)=>[i%(n+1),Math.floor(i/(n+1))]),fs:number[][]=[],index=new Map<string,number>(),es:[number,number][]=[],counts:number[]=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    if(omitCenter&&x===1&&y===1)continue;
    const a=y*(n+1)+x,face=[a,a+1,a+n+2,a+n+1];fs.push(face);
    face.forEach((v,k)=>{const w=face[(k+1)%face.length],key=edgeKey(v,w);let id=index.get(key);if(id===undefined){id=es.length;index.set(key,id);es.push([Math.min(v,w),Math.max(v,w)]);counts.push(0);}counts[id]++;});
  }
  return {vertices_coords:coords,edges_vertices:es,faces_vertices:fs,edges_assignment:counts.map(c=>c===1?'B':'F'),edges_foldAngle:counts.map(()=>0)};
}

test('structural splitting preserves an annulus with two oriented boundaries in one component',()=>{
  const g=grid(3,true),s=splitWovenCutGraph(g,g.vertices_coords);
  assert.equal(s.components.length,1);assert.equal(s.components[0].boundaryLoops.length,2);
  assert.deepEqual(s.components[0].boundaryLoops.map(f=>signedArea(s.splitGraph.vertices_coords,f)).sort((a,b)=>a-b),[-1,9]);
  assert.equal(s.splitGraph.vertices_coords.length-s.splitGraph.edges_vertices.length+s.faceCorners.length,0);
});

test('interior slit keeps two parallel B banks and their explicit face occurrences even when endpoints are not duplicated',()=>{
  const g=grid(3),cut=g.edges_vertices.findIndex(([a,b])=>edgeKey(a,b)===edgeKey(5,6));assert.ok(cut>=0);g.edges_assignment[cut]='B';
  const s=splitWovenCutGraph(g,g.vertices_coords),banks=s.edgeSource.flatMap((e,i)=>e===cut?[i]:[]);
  assert.equal(s.components.length,1);assert.equal(s.components[0].boundaryLoops.length,2);
  assert.deepEqual(s.components[0].boundaryLoops.map(f=>f.length).sort((a,b)=>a-b),[2,12]);
  assert.equal(s.splitGraph.vertices_coords.length,16);assert.equal(s.splitGraph.edges_vertices.length,25);
  assert.equal(banks.length,2);assert.deepEqual(s.splitGraph.edges_vertices[banks[0]],s.splitGraph.edges_vertices[banks[1]]);
  assert.ok(banks.every(e=>s.splitGraph.edges_assignment[e]==='B'&&s.splitGraph.edges_faces![e].length===1));
  assert.notDeepEqual(s.splitGraph.edges_faces![banks[0]],s.splitGraph.edges_faces![banks[1]]);
  banks.forEach(e=>{const face=s.splitGraph.edges_faces![e][0];assert.ok(s.splitGraph.faces_edges![face].includes(e));assert.equal(s.splitGraph.faces_faces![face][s.splitGraph.faces_edges![face].indexOf(e)],undefined);});
});

test('a boundary-to-interior slit retains separate attachment banks and one tip in one boundary walk',()=>{
  const g=grid(3),cut=g.edges_vertices.findIndex(([a,b])=>edgeKey(a,b)===edgeKey(1,5));assert.ok(cut>=0);g.edges_assignment[cut]='B';
  const s=splitWovenCutGraph(g,g.vertices_coords),component=s.components[0];
  assert.equal(s.components.length,1);assert.equal(component.boundaryLoops.length,1);
  const loop=component.boundaryLoops[0],tip=s.vertexSource.indexOf(5);assert.equal(loop.filter(v=>v===tip).length,1);
  assert.equal(loop.filter(v=>s.vertexSource[v]===1).length,2,'banks have independent attachment IDs at the same original boundary point');
  assert.equal(loop.length,14);assert.equal(s.splitGraph.vertices_coords.length,17);assert.equal(s.splitGraph.edges_vertices.length,25);
  assert.equal(s.splitGraph.vertices_coords.length-s.splitGraph.edges_vertices.length+s.faceCorners.length,1);
});

test('two full intersecting B cuts produce four pieces without fabricating cross-cut adjacency',()=>{
  const g=grid(2);
  g.edges_vertices.forEach(([a,b],e)=>{const p=g.vertices_coords[a],q=g.vertices_coords[b];if(p[0]===1&&q[0]===1||p[1]===1&&q[1]===1)g.edges_assignment[e]='B';});
  const s=splitWovenCutGraph(g,g.vertices_coords);
  assert.equal(s.components.length,4);assert.ok(s.components.every(c=>c.faces.length===1&&c.boundaryLoops.length===1));
  assert.equal(s.splitGraph.vertices_coords.length,16);assert.equal(s.splitGraph.edges_vertices.length,16);assert.ok(s.splitGraph.edges_faces!.every(o=>o.length===1));
});

test('structural splitter rejects orphan, three-owner and non-isometric inputs rather than guessing a paper topology',()=>{
  const g=grid(2),orphan=clone(g);orphan.edges_vertices.push([0,8]);orphan.edges_assignment.push('B');orphan.edges_foldAngle.push(0);
  assert.throws(()=>splitWovenCutGraph(orphan,orphan.vertices_coords),/未被面使用/);
  const nonmanifold=clone(g);nonmanifold.faces_vertices!.push([...g.faces_vertices![0]]);
  assert.throws(()=>splitWovenCutGraph(nonmanifold,nonmanifold.vertices_coords),/非流形/);
  const ff=clone(g.vertices_coords);ff[4][0]+=.01;assert.throws(()=>splitWovenCutGraph(g,ff),/等距/);
});
