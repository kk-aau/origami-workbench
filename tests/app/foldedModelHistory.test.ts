import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFoldedModelHistory, foldedModelHistoryReducer as reduce, hasUnsavedModelEdits } from '../../src/app/foldedModelHistory';
import { computeFlatFold, recomputeFlatLayers } from '../../src/core/flatFold';
import { blankDoc } from '../../src/app/state';
import { moveFoldedVertices } from '../../src/app/foldedVertexEdit';
import {splitWovenCutGraph} from '../../src/app/wovenCutTopology';
import type {FoldGraph,Point,FlatFoldResult} from '../../src/core/types';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';
import {acquireModelSurface,rememberCompletedModelSurface} from '../../src/app/modelOverlapTask';

function initial() {
  return reduce(emptyFoldedModelHistory(), { type: 'replace', result: computeFlatFold(blankDoc('模型历史', 100, 100)) });
}
function move(state: ReturnType<typeof initial>, x = -20) {
  return reduce(state, { type: 'commit', result: moveFoldedVertices(state.present!, { group: [0], selected: [0] }, [x, -10]) });
}

test('replace, analysis, commit and undo redo retain certified surfaces while isolating editable snapshots',async()=>{
 const doc=blankDoc('缓存历史',16,16);for(let i=1;i<16;i++)doc.segments.push({id:`x${i}`,a:[i,0],b:[i,16],assignment:'F',angle:0},{id:`y${i}`,a:[0,i],b:[16,i],assignment:'F',angle:0});
 const result=computeFlatFold(doc),publication=flatFoldPublication(result);assert.ok(publication.surface?.status==='complete'&&publication.surface.exact);rememberCompletedModelSurface(result,publication.surface);
 const replaced=reduce(emptyFoldedModelHistory(),{type:'replace',result}),analysed=reduce(replaced,{type:'analysis',revision:replaced.revision,result});
 result.warnings.push('独立的说明变化');const committed=reduce(analysed,{type:'commit',result}),undone=reduce(committed,{type:'undo'}),redone=reduce(undone,{type:'redo'});
 const expected=result.geometry.vertices[0][0];result.geometry.vertices[0][0]+=99;
 const Native=globalThis.Worker;let made=0;globalThis.Worker=class{constructor(){made++;throw Error('completed history must not launch another worker');}} as unknown as typeof Worker;
 try{for(const state of [replaced,analysed,committed,undone,redone]){
  assert.notEqual(state.present,result);assert.equal(state.present!.geometry.vertices[0][0],expected);
  for(const side of ['front','back'] as const){const task=acquireModelSurface(state.present!,side,true),reply=await task.promise;assert.equal(reply.status,'complete');task.cancel();}
 }assert.equal(made,0);}finally{globalThis.Worker=Native;}
});

test('unsaved model guard includes undo and redo history, not just the current shape', () => {
  const original=initial(),changed=move(original),undone=reduce(changed,{type:'undo'});
  assert.equal(hasUnsavedModelEdits(emptyFoldedModelHistory()),false);
  assert.equal(hasUnsavedModelEdits(original),false);
  assert.equal(hasUnsavedModelEdits(changed),true);
  assert.equal(undone.present!.geometry.modified,undefined);
  assert.equal(hasUnsavedModelEdits(undone),true);
  assert.equal(hasUnsavedModelEdits({...original,past:[changed.present!]}),true);
  assert.equal(hasUnsavedModelEdits(reduce(changed,{type:'replace',result:original.present})),false);
});

test('model edit undo and redo restore exact geometry and layer results without changing the source', () => {
  const doc = blankDoc('原折痕', 100, 100), before = structuredClone(doc);
  const state = reduce(emptyFoldedModelHistory(), { type: 'replace', result: computeFlatFold(doc) });
  const changed = move(state), undone = reduce(changed, { type: 'undo' }), redone = reduce(undone, { type: 'redo' });
  assert.deepEqual(undone.present, state.present); assert.deepEqual(redone.present, changed.present);
  assert.equal(undone.present!.layers.status, 'solved'); assert.equal(redone.present!.layers.status, 'unknown');
  assert.ok(redone.revision > undone.revision && undone.revision > changed.revision);
  assert.deepEqual(doc, before); assert.equal(state.past.length, 0);
});

test('analysis enriches one edit entry and its solved result survives undo redo', () => {
  const state = initial(), changed = move(state), snapshot = structuredClone(changed);
  const solved = recomputeFlatLayers(changed.present!);
  const updated = reduce(changed, { type: 'analysis', revision: changed.revision, result: solved });
  assert.equal(updated.past.length, 1); assert.equal(updated.present!.layers.status, 'solved');
  assert.deepEqual(reduce(updated, { type: 'undo' }).present, state.present);
  assert.deepEqual(reduce(reduce(updated, { type: 'undo' }), { type: 'redo' }).present, solved);
  assert.deepEqual(changed, snapshot);
  solved.geometry.vertices[0][0] = 999;
  assert.equal(updated.present!.geometry.vertices[0][0], -20);
});

test('late analysis cannot overwrite undo, redo, newer edit or replacement even with identical geometry', () => {
  const changed = move(initial()), solved = recomputeFlatLayers(changed.present!);
  const action = { type: 'analysis' as const, revision: changed.revision, result: solved };
  const undone = reduce(changed, { type: 'undo' });
  for (const state of [undone, reduce(undone, { type: 'redo' }), move(changed, -30), reduce(changed, { type: 'replace', result: changed.present })]) {
    assert.equal(reduce(state, action), state);
  }
  const accepted = reduce(changed, action);
  assert.equal(reduce(accepted, action), accepted);
});

test('analysis rejects geometry or crease assignment changes despite a matching revision', () => {
  const state = move(initial());
  const moved = moveFoldedVertices(state.present!, { group: [0], selected: [0] }, [-50, -20]);
  assert.equal(reduce(state, { type: 'analysis', revision: state.revision, result: moved }), state);
  const reassigned = structuredClone(state.present!); reassigned.geometry.graph!.edges_assignment[0] = 'M';
  assert.equal(reduce(state, { type: 'analysis', revision: state.revision, result: reassigned }), state);
});

test('cancelled analysis retains edited coordinates and occupies no extra undo step', () => {
  const state = move(initial()), cancelled = structuredClone(state.present!);
  cancelled.layers = { status: 'cancelled', message: '已取消' };
  const next = reduce(state, { type: 'analysis', revision: state.revision, result: cancelled });
  assert.equal(next.present!.layers.status, 'cancelled'); assert.equal(next.past.length, 1);
  assert.deepEqual(next.present!.geometry.vertices, state.present!.geometry.vertices);
});

test('new edit clears redo; replacements clear both stacks and clone external input', () => {
  const first = move(initial()), second = move(first, -30), undone = reduce(second, { type: 'undo' });
  assert.equal(move(undone, -40).future.length, 0);
  const input = structuredClone(first.present!);
  const replaced = reduce(undone, { type: 'replace', result: input });
  input.geometry.vertices[0][0] = 123;
  assert.equal(replaced.present!.geometry.vertices[0][0], -20);
  assert.equal(replaced.past.length, 0); assert.equal(replaced.future.length, 0);
  const cleared = reduce(replaced, { type: 'replace', result: null });
  assert.equal(cleared.present, null); assert.equal(reduce(cleared, { type: 'undo' }), cleared);
});

test('history has 60 edit slots and empty or identical actions do not increment revision', () => {
  const empty = emptyFoldedModelHistory();
  assert.equal(reduce(empty, { type: 'undo' }), empty); assert.equal(reduce(empty, { type: 'redo' }), empty);
  let state = initial();
  assert.equal(reduce(state, { type: 'commit', result: structuredClone(state.present!) }), state);
  for (let i = 0; i < 75; i++) state = move(state, -20 - i);
  assert.equal(state.past.length, 60);
  for (let i = 0; i < 60; i++) state = reduce(state, { type: 'undo' });
  assert.equal(state.future.length, 60); assert.equal(reduce(state, { type: 'undo' }), state);
  for (let i = 0; i < 60; i++) state = reduce(state, { type: 'redo' });
  assert.equal(state.past.length, 60); assert.equal(state.present!.geometry.vertices[0][0], -94);
});

test('same revision cannot accept reassigned parallel slit banks or missing explicit incidence',()=>{
 const vertices:Point[]=Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4)]),faces:number[][]=[],edges:[number,number][]=[],owners:number[]=[];
 const lookup=new Map<string,number>();
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){
  const v=y*4+x,face=[v,v+1,v+5,v+4];faces.push(face);
  face.forEach((a,i)=>{const b=face[(i+1)%4],key=[a,b].sort((a,b)=>a-b).join(',');let e=lookup.get(key);if(e===undefined){e=edges.length;lookup.set(key,e);edges.push([Math.min(a,b),Math.max(a,b)]);owners.push(0);}owners[e]++;});
 }
 const graph:FoldGraph={vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:owners.map(n=>n===1?'B':'F'),edges_foldAngle:owners.map(()=>0)};
 const cut=lookup.get('5,6')!;graph.edges_assignment[cut]='B';const split=splitWovenCutGraph(graph,vertices),g=split.splitGraph,banks=split.edgeSource.flatMap((e,i)=>e===cut?[i]:[]);
 assert.deepEqual(g.edges_vertices[banks[0]],g.edges_vertices[banks[1]]);
 const result:FlatFoldResult={geometry:{status:'ready',message:'slit',vertices:g.vertices_coords,faces:g.faces_vertices!,graph:g,startingFace:0},layers:{status:'unknown',message:'pending'},warnings:[]};
 const state=reduce(emptyFoldedModelHistory(),{type:'replace',result});
 for(const key of ['faces_edges','edges_faces','faces_faces'] as const){
  const forged=structuredClone(state.present!),changed=forged.geometry.graph!;
  if(key==='faces_edges'){const owner=changed.edges_faces![banks[0]][0],slot=changed.faces_edges![owner].indexOf(banks[0]);changed.faces_edges![owner][slot]=banks[1];}
  else if(key==='edges_faces')[changed.edges_faces![banks[0]],changed.edges_faces![banks[1]]]=[changed.edges_faces![banks[1]],changed.edges_faces![banks[0]]];
  else{const owner=changed.edges_faces![banks[0]][0],slot=changed.faces_edges![owner].indexOf(banks[0]);changed.faces_faces![owner][slot]=changed.edges_faces![banks[1]][0];}
  forged.layers={status:'solved',message:'untrusted'};assert.equal(reduce(state,{type:'analysis',revision:state.revision,result:forged}),state,key);
  const missing=structuredClone(state.present!);delete missing.geometry.graph![key];assert.equal(reduce(state,{type:'analysis',revision:state.revision,result:missing}),state,`missing ${key}`);
 }
 const unchanged=JSON.parse(JSON.stringify(state.present!)) as FlatFoldResult;unchanged.layers={status:'cancelled',message:'stopped'};
 const accepted=reduce(state,{type:'analysis',revision:state.revision,result:unchanged});assert.notEqual(accepted,state);assert.equal(accepted.present!.layers.status,'cancelled','JSON null boundary slots retain the same identity');
});
