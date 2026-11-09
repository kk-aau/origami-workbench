import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readWovenCourteousSource,replayCourteousDraws,wovenCourteousGraphPreset,wovenCourteousPreset} from '../../src/app/wovenCourteous';
import {recomputeWovenCourteousGraph} from '../../src/app/wovenCourteousGraph';
import {readTessParams,canAdoptTess,canAdoptTessWithTileLayers,tessConstructionKey} from '../../src/app/tessellation';
import {readWovenParams,wovenPreset,type WovenParams} from '../../src/app/wovenParams';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/courteous-graph-20261010.json',import.meta.url),'utf8'));
type RandomParams=Extract<WovenParams,{mode:'random'}>;
const params=(row:any)=>{
 const p=readTessParams(row.params);assert.ok(p&&p.family==='woven-lines'&&p.mode==='random');return p;
};
const near=(a:any,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)):
 Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>near(a[i],v)):
 b&&typeof b==='object'?!!a&&typeof a==='object'&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>near(a[k],v)):a===b;

test('Graph parameters bind the two finite tolerances only to the new random version',()=>{
 const p=readWovenParams({family:'woven-lines',mode:'random',randomVersion:'original-courteous-graph'})! as RandomParams;
 assert.equal(p.seed,0);assert.equal(p.maxTries,20000);assert.equal(p.samePtTolerance,1e-6);assert.equal(p.intersectionTolerance,1e-6);
 assert.deepEqual(wovenCourteousGraphPreset(),{...wovenCourteousPreset(),randomVersion:'original-courteous-graph',samePtTolerance:1e-6,intersectionTolerance:1e-6});
 assert.deepEqual(readWovenParams({family:'woven-lines',mode:'random'}),wovenPreset('random'));
 const old=readWovenParams({family:'woven-lines',mode:'random',randomVersion:'original-courteous'})!;
 assert.equal('samePtTolerance' in old,false);assert.equal('intersectionTolerance' in old,false);
 for(const key of ['samePtTolerance','intersectionTolerance']){
  for(const value of [0,.1])assert.ok(readTessParams({...p,[key]:value}));
  for(const value of [-1e-8,.100001,NaN,Infinity,true,'0',null,undefined])assert.equal(readTessParams({...p,[key]:value}),null,`${key}=${String(value)}`);
  for(const legacy of [wovenPreset('random'),wovenCourteousPreset(),wovenPreset('lines'),wovenPreset('graph')])assert.equal(readTessParams({...legacy,[key]:1e-6}),null);
 }
 assert.equal(readTessParams({...wovenPreset('lines'),randomVersion:'original-courteous-graph'}),null);
 assert.equal(readTessParams({...p,randomVersion:'unknown'}),null);
 assert.equal(readTessParams({...p,maxTries:20001}),null);
});

test('all actual Graph responses independently reproduce both ordered Indexify stages and line owners',()=>{
 for(const row of fixture.cases){
  const p=params(row),s=row.response.source,linesProof=s.courteousAnarchy;
  assert.ok(readWovenCourteousSource(s,p,row.response.mother),row.name);
  const replay=replayCourteousDraws(p,linesProof.randomDraws);assert.ok(near(linesProof.completeLines,replay.completeLines));
  const proof=recomputeWovenCourteousGraph(linesProof.completeLines,p.samePtTolerance,p.intersectionTolerance);
  assert.ok(near(s.courteousGraph,proof),row.name);
  assert.deepEqual(s.courteousGraph.firstIndex.edges,proof.firstIndex.edges);
  assert.deepEqual(s.courteousGraph.secondIndex.edges,proof.secondIndex.edges);
  assert.deepEqual(row.response.mother.edges_vertices,proof.graph.edges);
  assert.deepEqual(proof.graph.faces,[]);
  assert.equal(proof.wolframExecuted,false);assert.equal(proof.fullSymbolicOptionsImplemented,false);
  assert.equal(linesProof.originalGraphOptionsReproduced,true);assert.equal(linesProof.motherGraphRoute,'original-indexify-maketgraph-intersectify');
  assert.deepEqual(s.edgeLines,proof.edgeOrigins.map(i=>i<p.boundary.length?-1:i-p.boundary.length));
  assert.deepEqual(s.edgeWidths,s.edgeLines.map((i:number)=>i<0?0:p.width));
 }
});

test('Graph CP adoption binds source and current parameters and still requires independently solved layers',()=>{
 for(const row of fixture.cases){
  const p=params(row),result={...row.response,doc:{metadata:{tessellation:{parameters:p}}}} as any;
  assert.equal(canAdoptTess(result,false,tessConstructionKey(p),p),true,row.name);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'not_checked'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'solved'),true);
  for(const edit of [{seed:p.seed+2},{count:3},{minDistance:.06},{maxTries:3},{width:.03},{samePtTolerance:.01},{intersectionTolerance:.01}]){
   const changed={...p,...edit} as WovenParams;
   assert.equal(canAdoptTess(result,false,tessConstructionKey(changed),changed),false,`${row.name}/${JSON.stringify(edit)}`);
  }
  const forged=structuredClone(result);delete forged.source.courteousGraph;
  assert.equal(canAdoptTess(forged,false,tessConstructionKey(p),p),false,'missing Graph proof');
 }
});

test('every Graph proof field, primitive order, owner, mother edge and line proof is checked',()=>{
 const row=fixture.cases[0],p=params(row),proof=row.response.source.courteousGraph;
 const edits:[string,(r:any)=>void][]=[
  ['missing proof',r=>delete r.source.courteousGraph],['unknown proof key',r=>r.source.courteousGraph.hidden='Run[]'],
  ['first vertices order',r=>r.source.courteousGraph.firstIndex.vertices.reverse()],
  ['first edges order',r=>r.source.courteousGraph.firstIndex.edges.reverse()],
  ['second vertices order',r=>r.source.courteousGraph.secondIndex.vertices.reverse()],
  ['second edges order',r=>r.source.courteousGraph.secondIndex.edges.reverse()],
  ['embedded order',r=>r.source.courteousGraph.embeddedSegments.reverse()],
  ['embedded owner',r=>r.source.courteousGraph.embeddedEdgeOrigins[0]++],
  ['edge owner',r=>r.source.courteousGraph.edgeOrigins[0]++],
  ['removed self loop',r=>r.source.courteousGraph.removedSelfLoopSegments.push(0)],
  ['graph edges order',r=>r.source.courteousGraph.graph.edges.reverse()],
  ['graph vertices order',r=>r.source.courteousGraph.graph.vertices.reverse()],
  ['first fractional index',r=>r.source.courteousGraph.firstIndex.edges[0][0]+=1e-12],
  ['second fractional index',r=>r.source.courteousGraph.secondIndex.edges[0][0]+=1e-12],
  ['owner fractional index',r=>r.source.courteousGraph.edgeOrigins[0]+=1e-12],
  ['mother vertices order',r=>r.mother.vertices_coords.reverse()],['mother edges order',r=>r.mother.edges_vertices.reverse()],
  ['mother face order',r=>r.mother.faces_vertices.reverse()],['mother face orientation',r=>r.mother.faces_vertices[0].reverse()],
  ['mother reversed edge',r=>r.mother.edges_vertices[0].reverse()],['mother vertex edit',r=>r.mother.vertices_coords[0][0]+=.001],
  ['boundary assignment',r=>r.mother.edges_assignment[0]='U'],['interior assignment',r=>r.mother.edges_assignment[r.source.edgeLines.findIndex((i:number)=>i>=0)]='B'],
  ['line owner',r=>r.source.edgeLines[0]=0],['owner order',r=>r.source.edgeLines.reverse()],
  ['width owner',r=>r.source.edgeWidths[0]=p.width],['width change',r=>r.source.edgeWidths[r.source.edgeLines.findIndex((i:number)=>i>=0)]+=.001],
  ['tiny boundary width',r=>r.source.edgeWidths[0]=1e-12],['tiny interior width',r=>r.source.edgeWidths[r.source.edgeLines.findIndex((i:number)=>i>=0)]+=1e-12],
  ['Lines route',r=>r.source.courteousAnarchy.motherGraphRoute='local-arrangement-from-accepted-lines'],
  ['Lines Graph options',r=>r.source.courteousAnarchy.originalGraphOptionsReproduced=false],
  ['Lines draw',r=>r.source.courteousAnarchy.randomDraws[0]+=.001],['Lines append draw',r=>r.source.courteousAnarchy.randomDraws.push(.5)],
  ['Lines source order',r=>r.source.courteousAnarchy.completeLines.reverse()],['Lines runtime claim',r=>r.source.courteousAnarchy.wolframExecuted=true],
  ['Lines primitive beyond roundoff',r=>r.source.courteousAnarchy.completeLines[0][0][0]+=5e-11],
  ['tiny tolerance change',r=>r.source.courteousGraph.samePtTolerance+=1e-12],
 ];
 for(const key of Object.keys(proof)){
  edits.push([`missing ${key}`,r=>delete r.source.courteousGraph[key]]);
  edits.push([`altered ${key}`,r=>{const v=r.source.courteousGraph[key];r.source.courteousGraph[key]=typeof v==='boolean'?!v:typeof v==='number'?v+.001:typeof v==='string'?`${v} altered`:Array.isArray(v)?[...v,null]:{...v,hidden:true};}]);
 }
 for(const [name,edit] of edits){const r=structuredClone(row.response);edit(r);assert.equal(readWovenCourteousSource(r.source,p,r.mother),null,name);}
 // Geometry and ownership altered together cannot override source traversal.
 const reordered=structuredClone(row.response);reordered.mother.edges_vertices.reverse();reordered.mother.edges_assignment.reverse();reordered.source.edgeLines.reverse();reordered.source.edgeWidths.reverse();reordered.source.courteousGraph.graph.edges.reverse();reordered.source.courteousGraph.edgeOrigins.reverse();
 assert.equal(readWovenCourteousSource(reordered.source,p,reordered.mother),null);
});

test('literal primitive keeps overlap-midpoint splitting, repeated edges and only removes second-stage self loops',()=>{
 const overlap=recomputeWovenCourteousGraph([[[0,0],[2,0]],[[1,0],[3,0]]],0,0);
 assert.deepEqual(overlap.graph,{vertices:[[0,0],[1.5,0],[2,0],[1,0],[3,0]],edges:[[0,1],[1,2],[3,1],[1,4]],faces:[]});
 const duplicate=recomputeWovenCourteousGraph([[[0,0],[2,0]],[[0,0],[2,0]]],0,0);
 assert.deepEqual(duplicate.graph.edges,[[0,1],[1,2],[0,1],[1,2]]);
 const shared=recomputeWovenCourteousGraph([[[-1,0],[1,0]],[[0,-1],[0,1]],[[-1,-1],[1,1]]],0,0);
 assert.deepEqual(shared.removedSelfLoopSegments,[1,4,7]);assert.deepEqual(shared.edgeOrigins,[0,0,1,1,2,2]);
 assert.equal(shared.secondIndex.edges.length,9);assert.equal(shared.graph.edges.length,6);
 const representatives=recomputeWovenCourteousGraph([[[0,0],[2,0]],[[.075,0],[3,0]],[[.15,0],[4,0]]],.1,0);
 assert.deepEqual(representatives.firstIndex,{vertices:[[0,0],[2,0],[3,0],[.15,0],[4,0]],edges:[[0,1],[0,2],[3,4]]});
 for(const tol of [-1,.1001,NaN,Infinity])assert.throws(()=>recomputeWovenCourteousGraph([[[0,0],[1,0]]],tol,0));
 assert.throws(()=>recomputeWovenCourteousGraph([[[0,0],[.01,0]],[[0,0],[1,0]]],.1,0),/退化/);
 assert.throws(()=>recomputeWovenCourteousGraph([[[0,0],[1e-11,0]],[[0,0],[1,0]]],0,0),/退化/);
 assert.throws(()=>recomputeWovenCourteousGraph([[[-1,0],[1,0]],[[0,-1],[0,1]],[[0,.02],[0,2]]],0,.1),/同参数/);
 const exactChopBoundary=recomputeWovenCourteousGraph([[[0,0],[1e-10,0]],[[0,0],[1,0]]],0,0);
 assert.ok(exactChopBoundary.graph.edges.length>0);
});

test('independent primitive references bind near-T intersection, point welding and self-loop ownership',()=>{
 assert.ok(fixture.primitiveCases.length>=7);
 for(const row of fixture.primitiveCases){
  const proof=recomputeWovenCourteousGraph(row.completeLines,row.samePtTolerance,row.intersectionTolerance);
  assert.ok(near(proof,row.proof),row.name);
  assert.deepEqual(proof.firstIndex.edges,row.proof.firstIndex.edges,row.name);
  assert.deepEqual(proof.secondIndex.edges,row.proof.secondIndex.edges,row.name);
  assert.deepEqual(proof.embeddedEdgeOrigins,row.proof.embeddedEdgeOrigins,row.name);
  assert.deepEqual(proof.removedSelfLoopSegments,row.proof.removedSelfLoopSegments,row.name);
  assert.deepEqual(proof.edgeOrigins,row.proof.edgeOrigins,row.name);
  assert.deepEqual(proof.graph.edges,row.proof.graph.edges,row.name);
 }
});

test('new Graph keeps real segment and full-edge h edits while refusing stale stamps or forged widths',()=>{
 assert.equal(fixture.insetCases.length,2);
 for(const row of fixture.insetCases){
  const p=params(row),r=row.response,result={...r,doc:{metadata:{tessellation:{parameters:p}}}} as any;
  const reordered=structuredClone(p);if(reordered.segmentInsets)reordered.segmentInsets=reordered.segmentInsets.map(e=>({inset:e.inset,to:e.to,from:e.from,line:e.line}));
  if(reordered.fullEdgeInsets)reordered.fullEdgeInsets={entries:reordered.fullEdgeInsets.entries.map(e=>({inset:e.inset,to:e.to,from:e.from,line:e.line,edge:e.edge})),edgeCount:reordered.fullEdgeInsets.edgeCount};
  assert.ok(readWovenCourteousSource(r.source,reordered,r.mother),`${row.name} legal metadata key order`);
  assert.ok(readWovenCourteousSource(r.source,p,r.mother),row.name);
  assert.equal(canAdoptTess(result,false,tessConstructionKey(p),p),true,row.name);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'not_checked'),false);
  assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'solved'),true);
  const bad=structuredClone(r);bad.source.edgeWidths[0]+=.001;
  assert.equal(readWovenCourteousSource(bad.source,p,bad.mother),null);
  const changed=structuredClone(p);if(changed.fullEdgeInsets)changed.fullEdgeInsets.entries[0].from[0]+=.001;else changed.segmentInsets![0].from[0]+=.001;
  assert.equal(readWovenCourteousSource(r.source,changed,r.mother),null);
 }
 const full=fixture.insetCases[0],p=params(full);
 for(const key of ['fullEdgeInsets','requestedEdgeInsets','effectiveEdgeInsets']){
  const bad=structuredClone(full.response);delete bad.source[key];assert.equal(readWovenCourteousSource(bad.source,p,bad.mother),null,key);
 }
});

test('minimum-distance branches must preserve the second Indexify topology and stay within the finite budget',()=>{
 const row=fixture.cases.find((r:any)=>r.name==='seed1'),complete=row.response.source.courteousAnarchy.completeLines;
 const checked=recomputeWovenCourteousGraph(complete,1e-6,1e-6);
 assert.ok(checked.medialTieBranchesChecked>1);assert.equal(checked.medialTieBranchLimit,64);
 assert.throws(()=>recomputeWovenCourteousGraph(complete,0,1e-6),/二轮索引/);
 const repeated=[...complete,...Array.from({length:8},()=>complete.slice(4)).flat()];
 assert.throws(()=>recomputeWovenCourteousGraph(repeated,1e-6,1e-6),/64 分支/);
});
