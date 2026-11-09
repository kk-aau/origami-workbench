import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Doc,FoldGraph,Point} from '../../src/core/types';
import {createMaterialTopology,hasMaterialTopology,inspectMaterialTopology,type MaterialTopologyData} from '../../src/core/materialTopology';
import {inspectWovenCutTopology,splitWovenCutGraph} from '../../src/app/wovenCutTopology';

const clone=<T>(value:T):T=>structuredClone(value);
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.filter((c:any)=>c.name.startsWith('internal-diagonal'));
function document(graph:FoldGraph):Doc {
  return {name:'材料图独立回归',paper:{width:200,height:200},segments:graph.edges_vertices.map(([a,b],i)=>({
    id:`material-${i}`,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Doc['segments'][number]['assignment'],angle:graph.edges_foldAngle[i]
  }))};
}
function bind(graph:FoldGraph,ff?:Point[],startingFace?:number):Doc {
  const doc=document(graph);doc.metadata={materialTopology:createMaterialTopology(doc,graph,doc.segments.map(s=>s.id),{
    ...(ff?{foldedVertices:ff}:{}),...(startingFace===undefined?{}:{startingFace})
  })};return doc;
}
function valid(doc:Doc){const result=inspectMaterialTopology(doc);assert.ok(result.ok,result.ok?'':result.reason);return result as Extract<typeof result,{ok:true}>;}
function invalid(doc:Doc,match?:RegExp){assert.equal(hasMaterialTopology(doc),true);const result=inspectMaterialTopology(doc);assert.equal(result.ok,false);if(!result.ok&&match)assert.match(result.reason,match);}
function graphFromFaces(points:Point[],faces:number[][],sharedKind='F'):FoldGraph {
  const edges:[number,number][]=[],lookup=new Map<string,number>(),owners:number[][]=[],faceEdges:number[][]=[];
  for(const [f,face] of faces.entries()){
    const row:number[]=[];
    for(let k=0;k<face.length;k++){
      const a=face[k],b=face[(k+1)%face.length],key=[a,b].sort((a,b)=>a-b).join(',');let e=lookup.get(key);
      if(e===undefined){e=edges.length;lookup.set(key,e);edges.push([a,b]);owners.push([]);}owners[e].push(f);row.push(e);
    }
    faceEdges.push(row);
  }
  const kinds=owners.map(o=>o.length===1?'B':sharedKind);
  return {vertices_coords:points,edges_vertices:edges,edges_assignment:kinds,edges_foldAngle:kinds.map(k=>k==='M'?-180:k==='V'||k==='U'?180:0),faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,
    faces_faces:faceEdges.map((row,f)=>row.map(e=>owners[e].find(g=>g!==f)??null)) as unknown as number[][]};
}
function grid(n:number,hole=false):FoldGraph {
  const points:Point[]=Array.from({length:(n+1)**2},(_,i)=>[i%(n+1),Math.floor(i/(n+1))]),faces:number[][]=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(hole&&x===1&&y===1)continue;const a=y*(n+1)+x;faces.push([a,a+1,a+n+2,a+n+1]);}
  return graphFromFaces(points,faces);
}
function changeGraph(doc:Doc,mutate:(g:FoldGraph)=>void):Doc {
  const next=clone(doc),data=next.metadata!.materialTopology as MaterialTopologyData;mutate(data.graph);return next;
}

test('four real original cut roots retain independent material banks, face IDs, original pose and all incidence',()=>{
  assert.equal(fixtures.length,4);
  for(const c of fixtures){
    const source=inspectWovenCutTopology(c.response,c.params);assert.ok(source.ok,c.name);if(!source.ok)continue;
    const t=source.topology,doc=bind(t.splitGraph,t.splitFolded,t.stationaryFoldFace),result=valid(doc);
    assert.equal(result.graph.vertices_coords.length,14);assert.equal(result.graph.edges_vertices.length,16);assert.equal(result.graph.faces_vertices!.length,5);
    assert.deepEqual(result.components.map(c=>c.faces.length),[1,3,1]);assert.deepEqual(result.foldedVertices,t.splitFolded);assert.equal(result.startingFace,t.stationaryFoldFace);
    assert.deepEqual(result.graph.faces_edges,t.splitGraph.faces_edges);assert.deepEqual(result.graph.edges_faces,t.splitGraph.edges_faces);
    for(let f=0;f<result.graph.faces_vertices!.length;f++)assert.equal(result.graph.faces_faces![f].length,result.graph.faces_vertices![f].length);
    result.graph.edges_assignment.forEach((kind,e)=>assert.equal(result.graph.edges_faces![e].length,kind==='B'?1:2));
    const stored=doc.metadata!.materialTopology as MaterialTopologyData;
    assert.ok(stored.graph.faces_faces!.some(row=>row.some(f=>f===null)));assert.ok(!stored.graph.faces_faces!.some(row=>row.some(f=>f===undefined)));
    assert.deepEqual(valid(JSON.parse(JSON.stringify(doc))).graph,result.graph,'JSON cannot change boundary neighbor slots');
  }
});

test('an interior slit keeps two parallel B edges with the same indexed endpoints in one component',()=>{
  const g=grid(3),cut=g.edges_vertices.findIndex(([a,b])=>[a,b].sort((a,b)=>a-b).join(',')==='5,6');assert.ok(cut>=0);g.edges_assignment[cut]='B';g.edges_foldAngle[cut]=0;
  const split=splitWovenCutGraph(g,g.vertices_coords),doc=bind(split.splitGraph,split.splitFolded),result=valid(doc),banks=split.edgeSource.flatMap((e,i)=>e===cut?[i]:[]);
  assert.equal(result.graph.edges_vertices.length,25);assert.equal(result.components.length,1);assert.deepEqual(result.components[0].boundaryLoops.map(l=>l.length).sort((a,b)=>a-b),[2,12]);
  assert.equal(banks.length,2);assert.deepEqual(result.graph.edges_vertices[banks[0]],result.graph.edges_vertices[banks[1]]);
  assert.notEqual(result.edgeSegmentIds[banks[0]],result.edgeSegmentIds[banks[1]]);assert.notDeepEqual(result.graph.edges_faces![banks[0]],result.graph.edges_faces![banks[1]]);
});

test('annulus preserves an oriented hole, and boundary-to-interior slit preserves its repeated attachment',()=>{
  const annulus=grid(3,true),hole=valid(bind(annulus,annulus.vertices_coords));assert.equal(hole.components.length,1);assert.equal(hole.components[0].boundaryLoops.length,2);
  const area=(face:number[])=>face.reduce((sum,v,k)=>{const a=annulus.vertices_coords[v],b=annulus.vertices_coords[face[(k+1)%face.length]];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;
  assert.deepEqual(hole.components[0].boundaryLoops.map(area).sort((a,b)=>a-b),[-1,9]);
  const g=grid(3),cut=g.edges_vertices.findIndex(([a,b])=>[a,b].sort((a,b)=>a-b).join(',')==='1,5');g.edges_assignment[cut]='B';g.edges_foldAngle[cut]=0;
  const s=splitWovenCutGraph(g,g.vertices_coords),slit=valid(bind(s.splitGraph,s.splitFolded));assert.equal(slit.components.length,1);assert.equal(slit.components[0].boundaryLoops.length,1);assert.equal(slit.components[0].boundaryLoops[0].length,14);
});

test('native JSON and auxiliary additions preserve exact binding; harmless endpoint reversal remains equivalent',()=>{
  const g=grid(1),doc=bind(g,g.vertices_coords,0),before=valid(doc);
  doc.segments.push({id:'aux',a:[-10,4],b:[100,4],assignment:'A',angle:null});doc.objects=[{id:'text',kind:'text',position:[0,0],text:'仅显示',fontSize:3,color:'#000000'}];
  doc.segments[0]=({...doc.segments[0],a:doc.segments[0].b,b:doc.segments[0].a,displayColor:'#123456'});
  assert.deepEqual(valid(JSON.parse(JSON.stringify(doc))),before);
});

test('missing, changed, additional or duplicated current non-A segments reject stale contract without coordinate reconstruction',()=>{
  const g=grid(1),doc=bind(g,g.vertices_coords),mutations=[
    (d:Doc)=>{d.segments[0].a[0]+=1e-14;},(d:Doc)=>{d.segments[0].id+='changed';},
    (d:Doc)=>{d.segments[0].assignment='V';d.segments[0].angle=180;},(d:Doc)=>{d.segments[0].angle=null;},
    (d:Doc)=>{d.segments.pop();},(d:Doc)=>{d.segments.push({...clone(d.segments[0]),id:'extra'});},
    (d:Doc)=>{d.segments.push({...clone(d.segments[0]),assignment:'A'});}
  ];
  for(const mutate of mutations){const bad=clone(doc);mutate(bad);invalid(bad,/过期|未更新|重复/);}
});

test('incidence is mandatory and ordered by face corners; forged neighbors or owners never certify banks',()=>{
  const g=grid(2),doc=bind(g,g.vertices_coords);
  const mutate=[
    (g:FoldGraph)=>{delete g.faces_edges;},(g:FoldGraph)=>{delete g.edges_faces;},(g:FoldGraph)=>{delete g.faces_faces;},
    (g:FoldGraph)=>{g.faces_edges![0].reverse();},(g:FoldGraph)=>{g.faces_faces![0].reverse();},
    (g:FoldGraph)=>{g.edges_faces![0].push(1);},(g:FoldGraph)=>{g.faces_edges![0][1]=g.faces_edges![0][0];},
    (g:FoldGraph)=>{g.edges_assignment[g.edges_faces!.findIndex(row=>row.length===2)]='B';}
  ];
  for(const edit of mutate)invalid(changeGraph(doc,edit));
  const good=clone(doc),data=good.metadata!.materialTopology as MaterialTopologyData;
  data.graph.edges_faces!.forEach(row=>row.reverse());assert.ok(inspectMaterialTopology(good).ok,'owner ordering is not a face-corner slot');
});

test('vertex identity follows a single connected material fan, while independent same-coordinate vertices survive',()=>{
  const points:Point[]=[[0,0],[1,0],[1,1],[0,1],[2,1],[2,2],[1,2]];
  const pinched=graphFromFaces(points,[[0,1,2,3],[2,4,5,6]]),doc=document(pinched);
  assert.throws(()=>createMaterialTopology(doc,pinched,doc.segments.map(s=>s.id)),/面扇/);
  const separated=graphFromFaces([...points,[1,1]],[[0,1,2,3],[7,4,5,6]]),result=valid(bind(separated,separated.vertices_coords));
  assert.equal(result.graph.vertices_coords.length,8);assert.deepEqual(result.graph.vertices_coords[2],result.graph.vertices_coords[7]);assert.equal(result.components.length,2);
});

test('CP self-crossing, clockwise faces, unused vertices and same-oriented shared edges are rejected',()=>{
  const bow=graphFromFaces([[0,0],[2,2],[0,2],[2,0],[3,1]],[[0,1,2,3,4]]);
  const cw=graphFromFaces([[0,0],[0,1],[1,1],[1,0]],[[0,1,2,3]]);
  const overlap=graphFromFaces([[0,0],[1,0],[1,1],[0,1]],[[0,1,2,3],[0,1,2,3]]);
  for(const g of [bow,cw,overlap]){const d=document(g);assert.throws(()=>createMaterialTopology(d,g,d.segments.map(s=>s.id)),/自交|CCW|反向/);}
  const doc=bind(grid(1));invalid(changeGraph(doc,g=>g.vertices_coords.push([9,9])),/孤立/);
});

test('supplied FF must be isometric and respect fully folded M/V/U or flat F across non-B edges',()=>{
  const points:Point[]=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],faces=[[0,1,4,3],[1,2,5,4]],reflected=points.map(([x,y])=>[x>1?2-x:x,y] as Point);
  for(const kind of ['M','V','U']){
    const g=graphFromFaces(points,faces,kind),doc=document(g),ids=doc.segments.map(s=>s.id);
    assert.throws(()=>createMaterialTopology(doc,g,ids,{foldedVertices:points}),/朝向.*语义/);
    assert.ok(valid(bind(g,reflected)).foldedVertices);
  }
  const flat=graphFromFaces(points,faces,'F'),doc=document(flat),ids=doc.segments.map(s=>s.id);
  assert.ok(valid(bind(flat,points)).foldedVertices);assert.throws(()=>createMaterialTopology(doc,flat,ids,{foldedVertices:reflected}),/朝向.*语义/);
  const bad=bind(flat,points);(bad.metadata!.materialTopology as MaterialTopologyData).foldedVertices![5][0]+=.01;invalid(bad,/不等距/);
  const target=graphFromFaces(points,faces,'M');target.edges_foldAngle[target.edges_assignment.indexOf('M')]=-90;assert.ok(valid(bind(target,reflected)).foldedVertices,'source target angles do not change flat-mode pi semantics');
});

test('malformed or unsupported contract presence rejects, and creation does not mutate any input',()=>{
  const base=document(grid(1));assert.equal(hasMaterialTopology(base),false);assert.equal(inspectMaterialTopology(base).ok,false);
  for(const value of [undefined,null,true,[],{schema:'future'}, {schema:'zhezhi-material-topology-v1',graph:{}}])invalid({...base,metadata:{materialTopology:value}});
  const g=grid(1),doc=document(g),before=clone({g,doc}),ids=doc.segments.map(s=>s.id),data=createMaterialTopology(doc,g,ids,{foldedVertices:g.vertices_coords,startingFace:0});
  assert.deepEqual({g,doc},before);data.graph.vertices_coords[0][0]=100;data.edgeSegmentIds[0]='changed';data.foldedVertices![0][0]=100;assert.deepEqual({g,doc},before);
  const bound=bind(g);(bound.metadata!.materialTopology as any).geometryVerified=true;invalid(bound,/字段/);
  const invalidStart=bind(g);(invalidStart.metadata!.materialTopology as MaterialTopologyData).startingFace=9;invalid(invalidStart,/起始面/);
});

test('finite input and explicit point budget fail closed before expensive material geometry',()=>{
  const doc=bind(grid(1));invalid(changeGraph(doc,g=>{g.vertices_coords[0][0]=Infinity;}),/有限/);
  invalid(changeGraph(doc,g=>{g.vertices_coords=Array.from({length:8193},(_,i)=>[i,0]);}),/8192/);
  const invalidAngle=changeGraph(doc,g=>{g.edges_foldAngle[0]=180;});invalid(invalidAngle,/折角/);
  const badIndex=changeGraph(doc,g=>{g.faces_vertices![0][0]=100;});invalid(badIndex,/索引/);
});

test('pair-work budget counts even Y-disjoint independent pieces and sparse fold angles cannot bypass validation',()=>{
  const points:Point[]=[],faces:number[][]=[];
  for(let i=0;i<800;i++){const a=points.length,y=2*i;points.push([0,y],[1,y],[1,y+1],[0,y+1]);faces.push([a,a+1,a+2,a+3]);}
  const graph=graphFromFaces(points,faces),doc=document(graph);
  assert.throws(()=>createMaterialTopology(doc,graph,doc.segments.map(s=>s.id)),/有界预算/);
  const small=grid(1),bad=document(small);delete (small.edges_foldAngle as any)[0];delete (bad.segments[0] as any).angle;
  assert.throws(()=>createMaterialTopology(bad,small,bad.segments.map(s=>s.id)),/折角/);
});
