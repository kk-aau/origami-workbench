import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refoldMaterialGeometry} from '../../src/core/materialRefold';
import {createMaterialTopology,inspectMaterialTopology,type MaterialTopologyData} from '../../src/core/materialTopology';
import {inspectWovenCutTopology,splitWovenCutGraph} from '../../src/app/wovenCutTopology';
import type {Doc,FoldGraph,Point} from '../../src/core/types';

function graph(points:Point[],faces:number[][],kind='F'):FoldGraph {
 const es:[number,number][]=[],fe:number[][]=[],ef:number[][]=[];
 for(const [f,face]of faces.entries())fe.push(face.map((a,k)=>{const b=face[(k+1)%face.length];let e=es.findIndex(([v,w])=>a===v&&b===w||a===w&&b===v);if(e<0){e=es.length;es.push([a,b]);ef.push([]);}ef[e].push(f);return e;}));
 const ea=ef.map(o=>o.length===1?'B':kind);
 return {vertices_coords:points,faces_vertices:faces,edges_vertices:es,edges_assignment:ea,edges_foldAngle:ea.map(k=>k==='M'?-180:k==='V'||k==='U'?180:0),faces_edges:fe,edges_faces:ef,faces_faces:fe.map((row,f)=>row.map(e=>ef[e].find(other=>other!==f)??null)) as unknown as number[][]};
}
function bind(g:FoldGraph,ff?:Point[],root=0):Doc {
 const d:Doc={name:'材料重新平折独立回归',paper:{width:200,height:200},segments:g.edges_vertices.map(([a,b],e)=>({id:`edge-${e}`,a:[...g.vertices_coords[a]],b:[...g.vertices_coords[b]],assignment:g.edges_assignment[e] as Doc['segments'][number]['assignment'],angle:g.edges_foldAngle[e]}))};
 d.metadata={materialTopology:createMaterialTopology(d,g,d.segments.map(s=>s.id),{startingFace:root,...(ff?{foldedVertices:ff}:{})})};return d;
}
function material(d:Doc){const r=inspectMaterialTopology(d);assert.ok(r.ok,r.ok?'':r.reason);return r as Extract<typeof r,{ok:true}>;}
function close(a:Point[],b:Point[],tolerance=1e-8){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.hypot(a[i][0]-b[i][0],a[i][1]-b[i][1])<=tolerance,`${i}: ${a[i]} != ${b[i]}`);}
function pair(kind='F'){return graph([[0,0],[100,0],[200,0],[0,100],[100,100],[200,100]],[[0,1,4,3],[1,2,5,4]],kind);}
function kind(g:FoldGraph,k:string){g.edges_assignment=g.edges_assignment.map(a=>a==='B'?'B':k);g.edges_foldAngle=g.edges_assignment.map(a=>a==='M'?-180:a==='V'||a==='U'?180:0);return g;}
const transform=([x,y]:Point):Point=>[17-y,31+x];
const reflected=([x,y]:Point):Point=>[17+y,31+x];

test('same-topology non-similar coordinate edits preserve old rigid root pose and independently refold F to M/V/U and back',()=>{
 for(const map of [transform,reflected])for(const k of ['M','V','U']){
  const original=pair(),previous=bind(original,original.vertices_coords.map(map)),changed=structuredClone(original);changed.vertices_coords[2][0]=240;changed.vertices_coords[5][0]=240;kind(changed,k);const next=bind(changed),before=structuredClone({previous,next});
  const expected=changed.vertices_coords.map(([x,y])=>map([x>100?200-x:x,y])),ff=refoldMaterialGeometry(previous,next);close(ff,expected);assert.deepEqual({previous,next},before);
  const folded=bind(changed,ff),flat=kind(structuredClone(changed),'F');close(refoldMaterialGeometry(folded,bind(flat)),flat.vertices_coords.map(map));
  assert.ok(material(bind(changed,ff)).foldedVertices,'returned points satisfy independent strict material validation');
 }
});

test('moving a crease refolds in the unchanged old coordinate frame, including a reflected root on the opposite face',()=>{
 const old=pair('M'),oldFF=old.vertices_coords.map(([x,y])=>[x>100?200-x:x,y] as Point),previous=bind(old,oldFF,1),changed=structuredClone(old);changed.vertices_coords[1][0]=80;changed.vertices_coords[4][0]=80;
 const next=bind(changed,undefined,1),ff=refoldMaterialGeometry(previous,next),expected=changed.vertices_coords.map(([x,y])=>[x>=80?200-x:40+x,y] as Point);close(ff,expected);
 // Root 1 keeps its old reflected CP→FF map, rather than a new identity pose.
 assert.deepEqual(ff[2],[0,0]);assert.deepEqual(ff[5],[0,100]);assert.deepEqual(ff[0],[40,0]);
 const flattened=bind(kind(structuredClone(changed),'F'),undefined,1);close(refoldMaterialGeometry(bind(changed,ff,1),flattened),changed.vertices_coords.map(([x,y])=>[200-x,y]));
});

function fan(center:Point=[2,2],k='F'){return graph([[0,0],[4,0],[4,4],[0,4],center],[[0,1,4],[1,2,4],[2,3,4],[3,0,4]],k);}
test('a genuine four-face hinge cycle closes only for consistent parity and geometry; finite but nonflat edits are rejected',()=>{
 const old=fan(),previous=bind(old,old.vertices_coords),folded=kind(structuredClone(old),'M'),ff=refoldMaterialGeometry(previous,bind(folded));close(ff,[[0,0],[4,0],[0,0],[4,0],[2,2]]);assert.ok(material(bind(folded,ff)).foldedVertices);
 const odd=structuredClone(old),e=odd.edges_assignment.indexOf('F');odd.edges_assignment[e]='M';odd.edges_foldAngle[e]=-180;assert.throws(()=>refoldMaterialGeometry(previous,bind(odd)),/铰接环|indexed 顶点/);
 const nonflat=fan([2.3,1.9],'M');assert.throws(()=>refoldMaterialGeometry(previous,bind(nonflat)),/铰接环|indexed 顶点/);
 assert.deepEqual(material(previous).foldedVertices,old.vertices_coords);
});

test('multiple components retain their distinct old poses and never acquire a shared or per-piece origin',()=>{
 const cp:Point[]=[[0,0],[2,0],[2,1],[0,1],[10,0],[12,0],[12,1],[10,1],[20,0],[22,0],[22,1],[20,1]],g=graph(cp,[[0,1,2,3],[4,5,6,7],[8,9,10,11]]),maps=[(p:Point):Point=>[p[0]+100,p[1]+50],(p:Point):Point=>[-p[1]-70,p[0]+20],(p:Point):Point=>[p[0]-200,-p[1]-50]],oldFF=cp.map((p,i)=>maps[Math.floor(i/4)](p)),previous=bind(g,oldFF,1),changed=structuredClone(g);
 changed.vertices_coords=changed.vertices_coords.map(([x,y],i)=>[x+(i>=4&&i<8?3:0),y+(i>=8?2:0)]);const ff=refoldMaterialGeometry(previous,bind(changed,undefined,1));close(ff,changed.vertices_coords.map((p,i)=>maps[Math.floor(i/4)](p)));close(ff.slice(0,4),oldFF.slice(0,4));assert.ok(material(bind(changed,ff,1)).foldedVertices);
});

test('all four actual source cut placements refold without welding banks or moving independent pieces',()=>{
 const cases=JSON.parse(readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.filter((c:any)=>c.name.startsWith('internal-diagonal'));assert.equal(cases.length,4);
 for(const c of cases){const source=inspectWovenCutTopology(c.response,c.params);assert.ok(source.ok);if(!source.ok)continue;const t=source.topology,previous=bind(t.splitGraph,t.splitFolded,t.stationaryFoldFace),next=bind(t.splitGraph,undefined,t.stationaryFoldFace),before=structuredClone({previous,next});
  close(refoldMaterialGeometry(previous,next),t.splitFolded);assert.deepEqual({previous,next},before);assert.deepEqual(material(next).components.map(c=>c.faces.length),[1,3,1]);
  const changed=structuredClone(t.splitGraph),v=changed.edges_assignment.indexOf('V');assert.ok(v>=0);changed.edges_assignment[v]='F';changed.edges_foldAngle[v]=0;const ff=refoldMaterialGeometry(previous,bind(changed,undefined,t.stationaryFoldFace));assert.ok(material(bind(changed,ff,t.stationaryFoldFace)).foldedVertices);assert.equal(ff.length,14);
 }
});

function grid(){const ps:Point[]=Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4)]),fs:number[][]=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++){const a=4*y+x;fs.push([a,a+1,a+5,a+4]);}return graph(ps,fs);}
test('an internal slit with two B occurrences sharing indexed endpoints never becomes an across-bank hinge',()=>{
 const g=grid(),e=g.edges_vertices.findIndex(([a,b])=>a===5&&b===6||a===6&&b===5);g.edges_assignment[e]='B';g.edges_foldAngle[e]=0;const s=splitWovenCutGraph(g,g.vertices_coords),previous=bind(s.splitGraph,s.splitFolded),next=bind(s.splitGraph);
 // Verify the two distinct occurrences directly, without an endpoint lookup.
 const cutBanks=s.edgeSource.flatMap((original,i)=>original===e?[i]:[]);assert.equal(cutBanks.length,2);assert.deepEqual(s.splitGraph.edges_vertices[cutBanks[0]],s.splitGraph.edges_vertices[cutBanks[1]]);
 const before=structuredClone({previous,next});close(refoldMaterialGeometry(previous,next),s.splitFolded);assert.deepEqual({previous,next},before);assert.equal(material(next).graph.edges_vertices.length,25);assert.ok(cutBanks.every(e=>material(next).graph.edges_faces![e].length===1));
 const bad=structuredClone(s.splitGraph),fold=bad.edges_assignment.indexOf('F');bad.edges_assignment[fold]='V';bad.edges_foldAngle[fold]=180;assert.throws(()=>refoldMaterialGeometry(previous,bind(bad)),/铰接环|indexed 顶点/);
});

test('face-cycle rotations, reversed edge storage and reflected CCW source loops preserve indexed topology',()=>{
 const old=pair('M'),oldFF=old.vertices_coords.map(([x,y])=>[x>100?200-x:x,y] as Point),previous=bind(old,oldFF),changed=structuredClone(old);changed.edges_vertices=changed.edges_vertices.map(([a,b])=>[b,a]);changed.vertices_coords=changed.vertices_coords.map(([x,y])=>[-x+5,y+7]);
 changed.faces_vertices=changed.faces_vertices!.map(face=>[...face.slice(1),face[0]].reverse());changed.faces_edges=changed.faces_vertices.map(face=>face.map((a,k)=>{const b=face[(k+1)%face.length];return changed.edges_vertices.findIndex(([v,w])=>a===v&&b===w||a===w&&b===v);}));changed.faces_faces=changed.faces_edges.map((list,f)=>list.map(e=>changed.edges_faces![e].find(other=>other!==f)??null)) as unknown as number[][];
 const next=bind(changed),ff=refoldMaterialGeometry(previous,next);assert.ok(material(bind(changed,ff)).foldedVertices);close(ff.slice(0,2),changed.vertices_coords.slice(0,2));
});

test('manual display starting-face settings do not replace the stored source anchors; source pose changes require a separate operation',()=>{
 const g=pair('M'),ff=g.vertices_coords.map(([x,y])=>[x>100?200-x:x,y] as Point),previous=bind(g,ff),next=bind(g);previous.flatFold={startingFace:g.faces_vertices![1].map(v=>g.vertices_coords[v])};next.flatFold=structuredClone(previous.flatFold);
 close(refoldMaterialGeometry(previous,next),ff);assert.throws(()=>refoldMaterialGeometry(previous,bind(g,undefined,1)),/更换原固定面/);
});

test('missing FF, stale binding, changed indexed topology or already-folded next contracts fail explicitly without mutating documents',()=>{
 const g=pair(),previous=bind(g,g.vertices_coords),next=bind(g),before=structuredClone({previous,next});assert.throws(()=>refoldMaterialGeometry(bind(g),next),/没有已验证的折后位置/);assert.throws(()=>refoldMaterialGeometry(previous,bind(g,g.vertices_coords)),/没有折后位置的新合同/);
 const stale=structuredClone(previous);stale.segments[0].a[0]+=.1;assert.throws(()=>refoldMaterialGeometry(stale,next),/过期/);
 const reindexed=structuredClone(next),data=reindexed.metadata!.materialTopology as MaterialTopologyData;data.edgeSegmentIds[0]='changed';reindexed.segments[0].id='changed';assert.ok(material(reindexed));assert.throws(()=>refoldMaterialGeometry(previous,reindexed),/indexed 拓扑/);
 const newSheet=graph([[0,0],[1,0],[1,1],[0,1]],[[0,1,2,3]]);assert.throws(()=>refoldMaterialGeometry(previous,bind(newSheet)),/indexed 拓扑/);assert.deepEqual({previous,next},before);
});
