import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {traceFlatLayerError} from '../../src/core/flatLayerConflictTrace';
import type {FoldGraph,Point} from '../../src/core/types';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';

const graph:FoldGraph={vertices_coords:[[0,0],[1,0],[0,1]],edges_vertices:[[0,1],[1,2],[2,0]],edges_assignment:['B','B','B'],edges_foldAngle:[0,0,0],faces_vertices:Array.from({length:6},()=>[0,1,2]),faces_edges:Array.from({length:6},()=>[0,1,2]),edges_faces:[[0],[0],[0]]};
const error=new Error('no solution possible',{cause:new Error('invalid tortilla_tortilla 1:2,4,3,5')});
test('enumeration failure adapter runs only root propagation with original pair signs',t=>{
 t.mock.method(ear.layer,'makeSolverConstraintsFlat',()=>({constraints:{taco_taco:[],taco_tortilla:[],tortilla_tortilla:[[0,2,1,3],[2,4,3,5]],transitivity:[]},orders:{'1 0':2,'4 5':2},facePairs:['0 1','2 3','4 5']}));
 const conflicts=traceFlatLayerError(error,graph,1e-6);
 assert.ok(conflicts[0].trace);assert.equal(conflicts[0].scope,'root');
 assert.ok(conflicts[0].trace.origins.some(r=>r.above===0&&r.below===1&&r.source==='initial'));
});
test('unknown errors and exhausted searches without a root witness do not rerun computation',t=>{
 t.mock.method(ear.layer,'makeSolverConstraintsFlat',()=>assert.fail('no root witness to enrich'));
 assert.deepEqual(traceFlatLayerError(new Error('worker unavailable'),graph,1e-6),[]);
 assert.deepEqual(traceFlatLayerError(new Error('no solution possible'),graph,1e-6),[]);
});
test('diagnostic reconstruction failure retains the original structured conflict',t=>{
 t.mock.method(ear.layer,'makeSolverConstraintsFlat',()=>{throw Error('cannot reconstruct');});
 const conflicts=traceFlatLayerError(error,graph,1e-6);
 assert.equal(conflicts[0].kind,'tortilla_tortilla');assert.deepEqual(conflicts[0].faces,[2,3,4,5]);assert.equal(conflicts[0].trace,undefined);
});

test('real eight-sector folded geometry exposes an acyclic proof through the public reanalysis route',()=>{
 const n=8,mask=43,input:FoldGraph={vertices_coords:[[0,0],...Array.from({length:n},(_,i)=>[Math.cos(i*Math.PI*2/n)*100,Math.sin(i*Math.PI*2/n)*100] as Point)],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[]};
 for(let i=0;i<n;i++){input.edges_vertices.push([i+1,(i+1)%n+1],[0,i+1]);input.edges_assignment.push('B',mask>>i&1?'M':'V');input.edges_foldAngle.push(0,mask>>i&1?-180:180);input.faces_vertices!.push([0,i+1,(i+1)%n+1]);}
 const geometry=computeFlatGeometry(input,1e-6),before=structuredClone(geometry),result=recomputeFlatLayers(geometry);
 assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'no-solution');assert.deepEqual(geometry,before);
 const conflict=result.layers.conflicts!.find(c=>c.trace)!;assert.ok(conflict);
 const trace=conflict.trace!;assert.equal(trace.truncated,false);assert.ok(trace.origins.every(r=>r.source==='initial'));
 const key=(r:{above:number;below:number})=>`${r.above}>${r.below}`,known=new Set(trace.origins.map(key)),remaining=[...trace.steps];
 while(remaining.length){
  const at=remaining.findIndex(step=>step.requires.every(r=>known.has(key(r))));
  assert.ok(at>=0,'every dependency must reach a hard origin; no circular or missing proof');
  const [step]=remaining.splice(at,1);known.add(key(step.relation));
 }
 assert.ok(conflict.relations!.every(r=>known.has(key(r))));
 assert.ok(trace.origins.some(r=>!conflict.faces.includes(r.above)||!conflict.faces.includes(r.below)),'tracing adds information outside the terminal witness');
});
