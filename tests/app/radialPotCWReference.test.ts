import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {radialPotPreset,readRadialPotParams} from '../../src/app/radialPotParams';
import {parseRadialPotCWReference,radialPotCWQuery,readRadialPotCWQuery}
  from '../../src/app/radialPotCWReference';

test('In[3480] profile CW read-only graph survives strict response readback',()=>{
  const query=radialPotCWQuery(radialPotPreset());
  assert.equal(query.arcDirection,'CW');
  assert.equal(readRadialPotParams(query),null);
  assert.deepEqual(readRadialPotCWQuery(JSON.parse(JSON.stringify(query))),query);
  const python=process.platform==='win32'?path.resolve('.venv/Scripts/python.exe'):path.resolve('.venv/bin/python');
  const run=spawnSync(python,['-c',
    "import sys,json;sys.path.insert(0,'backend');from tessellation_radial_pot_cw_query import query_radial_pot_cw;print(json.dumps(query_radial_pot_cw(json.load(sys.stdin))))"],
    {input:JSON.stringify(query),encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(run.status,0,run.stderr);
  const response=JSON.parse(run.stdout);
  const parsed=parseRadialPotCWReference(response,query);
  assert.equal(parsed.graph.arcs.length,25);
  assert.equal(parsed.graph.vertices.length,1816);
  assert.equal(parsed.certification.adoptableCreasePattern,false);
  const corrupt=(mutate:(value:any)=>void)=>{
    const copy=structuredClone(response);mutate(copy);
    assert.throws(()=>parseRadialPotCWReference(copy,query));
  };
  corrupt(value=>{value.query.sectors=6;});
  corrupt(value=>{value.certification.adoptableCreasePattern=true;});
  corrupt(value=>{value.graph.edges[0][1]=value.graph.vertices.length;});
  corrupt(value=>{value.graph.arcs[0].edgeIndices=[0];});
  corrupt(value=>{value.fold={};});
  corrupt(value=>{value.source.savedProfileRows=[0,0];});
  assert.equal(readRadialPotCWQuery({...query,unknown:1}),null);
  assert.equal(readRadialPotCWQuery({...query,border:'planar'}),null);
});
