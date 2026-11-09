import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CURVED_SAVED_PAIR_PRESETS,fetchCurvedSavedPair,parseCurvedSavedPairResult,
  projectSavedPairPoint,savedPairCurves,validateCurvedSavedPairQuery,
  type CurvedSavedPairQuery,
} from '../../src/app/curvedSavedPair';

function response(query:CurvedSavedPairQuery){
  const n=query.curveSegments+1,m=query.rulingSegments+1;
  const indices=Array.from({length:n},(_,i)=>i);
  const rows=(offset:number)=>[indices,...Array.from({length:m-1},(_,j)=>
    indices.map(i=>n*(offset+j)+i))];
  const us=indices.map(i=>query.family==='cone-across-right'?
    Math.PI*(query.parameterStartPi!+(query.parameterEndPi!-query.parameterStartPi!)*i/(n-1)):
    Math.PI*i/(n-1));
  const size=n*(2*m-1),flat=Array.from({length:size},(_,i)=>[i/n,0]),
    folded=Array.from({length:size},(_,i)=>[i/n,0,0]);
  const cone=query.family==='cone-across-right',positive=query.orientation===1;
  return {family:'origamica-curved-saved-pair',query,
    source:cone?
      {symbolicCell:'In[3999]',numericalCell:'In[4002]',symbolicFunction:'FoldAcrossRightBoth',numericalFunction:'NFoldAcrossRightBoth'}:
      {symbolicCell:positive?'In[3973]':'In[3974]',numericalCell:positive?'In[3978]':'In[3979]',
        symbolicFunction:'FoldCurvedFold3D',numericalFunction:'NFoldCurvedFold3D'},
    foldAngleDeg:cone?180-2*query.thetaDeg!:120*query.orientation!,
    certification:{continuousIsometryAnalytic:true,bothSidesDevelopableAnalytic:true,
      rulingWidthBeforeFocalSet:true,sampledChordsExactIsometry:false,
      exactStraightCreaseFOLD:false,adoptableCreasePattern:false,
      deploymentPathChecked:false,selfCollisionChecked:false},
    sample:{parameterValues:us,creaseIndices:indices,flatSamples:flat,foldedSamples:folded,
      sideRows:{left:rows(1),right:rows(m)},
      rulingDistances:{left:Array.from({length:m},(_,j)=>query.leftWidth*j/(m-1)),
        right:Array.from({length:m},(_,j)=>query.rightWidth*j/(m-1))}}};
}

test('saved cone and both signed circle queries have closed numeric domains',()=>{
  const cone=validateCurvedSavedPairQuery(CURVED_SAVED_PAIR_PRESETS['cone-across-right']);
  const circle=validateCurvedSavedPairQuery(CURVED_SAVED_PAIR_PRESETS['planar-circle-to-curved-fold-3d']);
  assert.equal(cone.thetaDeg,30);
  assert.equal(circle.orientation,1);
  assert.equal(validateCurvedSavedPairQuery({...circle,orientation:-1}).orientation,-1);
  for(const value of [
    {...cone,expression:'__import__("os")'}, {...cone,thetaDeg:'30'},
    {...cone,thetaDeg:Infinity},{...cone,thetaDeg:null},{...cone,leftWidth:1},
    {...cone,parameterStartPi:.5},{...cone,parameterEndPi:2},
    {...cone,curveSegments:256,rulingSegments:8},
    {...circle,orientation:0},{...circle,rightWidth:2},
    {...circle,parameterStartPi:0},{...circle,curveSegments:20.5},
  ])assert.throws(()=>validateCurvedSavedPairQuery(value));
});

test('paired response validates source cells, grid, and explicit no-FOLD status',()=>{
  for(const query of [
    validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['cone-across-right'],curveSegments:16,rulingSegments:1}),
    validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['planar-circle-to-curved-fold-3d'],
      curveSegments:16,rulingSegments:1}),
    validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['planar-circle-to-curved-fold-3d'],
      orientation:-1,curveSegments:16,rulingSegments:1}),
  ]){
    const raw=response(query),parsed=parseCurvedSavedPairResult(raw,query);
    assert.equal(parsed.sample.flatSamples.length,51);
    assert.equal(parsed.sample.sideRows.left[0],parsed.sample.sideRows.right[0]);
    assert.equal(parsed.certification.adoptableCreasePattern,false);
  }
});

test('response fails closed on adoption, source, index, coordinate and request mismatch',()=>{
  const query=validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['cone-across-right'],
    curveSegments:16,rulingSegments:1}),raw=response(query);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,
    certification:{...raw.certification,exactStraightCreaseFOLD:true}}),/FOLD/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,
    certification:{...raw.certification,adoptableCreasePattern:true}}),/FOLD/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,source:{...raw.source,symbolicCell:'In[3998]'}}),/来源/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,
    sample:{...raw.sample,sideRows:{...raw.sample.sideRows,
      right:[raw.sample.sideRows.right[0],raw.sample.sideRows.left[1]]}}}),/索引/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,
    sample:{...raw.sample,foldedSamples:[[NaN,0,0],...raw.sample.foldedSamples.slice(1)]}}),/坐标/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,fold:{vertices_coords:[]}}),/格式/);
  assert.throws(()=>parseCurvedSavedPairResult({...raw,
    sample:{...raw.sample,faces_vertices:[[0,1,2]]}}),/格式/);
  assert.throws(()=>parseCurvedSavedPairResult(raw,{...query,thetaDeg:40}),/参数/);
});

test('two views project corresponding sampled indices without constructing faces',()=>{
  const query=validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['cone-across-right'],
    curveSegments:16,rulingSegments:1});
  const result=parseCurvedSavedPairResult(response(query));
  const flat=savedPairCurves(result,false),folded=savedPairCurves(result,true,0);
  assert.deepEqual(flat.crease[0],[0,0]);
  assert.deepEqual(flat.left[0],[1,0]);
  assert.deepEqual(flat.right[0],[2,0]);
  assert.deepEqual(folded.right[0],projectSavedPairPoint([2,0,0],0));
  assert.equal('faces_vertices' in result.sample,false);
});

test('fetch targets the dedicated read-only route and carries abort signal',async()=>{
  const old=globalThis.fetch,query=validateCurvedSavedPairQuery({...CURVED_SAVED_PAIR_PRESETS['cone-across-right'],
    curveSegments:16,rulingSegments:1});
  const controller=new AbortController();
  let url='',body:unknown,signal:AbortSignal|undefined;
  try{
    globalThis.fetch=(async(input,init)=>{
      url=String(input);body=JSON.parse(String(init?.body));signal=init?.signal??undefined;
      return new Response(JSON.stringify(response(query)),{status:200,
        headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const value=await fetchCurvedSavedPair(query,controller.signal);
    assert.equal(url,'/api/tessellation/curved-saved-pair');
    assert.deepEqual(body,query);
    assert.equal(signal,controller.signal);
    assert.equal(value.source.symbolicCell,'In[3999]');
  }finally{globalThis.fetch=old;}
});

test('actual Python saved examples satisfy the frontend paired-grid contract',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const cases=[CURVED_SAVED_PAIR_PRESETS['cone-across-right'],
    CURVED_SAVED_PAIR_PRESETS['planar-circle-to-curved-fold-3d'],
    {...CURVED_SAVED_PAIR_PRESETS['planar-circle-to-curved-fold-3d'],orientation:-1}] as const;
  for(const input of cases){
    const query=validateCurvedSavedPairQuery({...input,curveSegments:16,rulingSegments:1});
    const run=spawnSync(python,[path.join(root,'backend/tessellate.py')],{
      cwd:root,input:JSON.stringify({...query,operation:'curved-saved-pair'}),
      encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
    });
    assert.equal(run.status,0,run.stderr||String(run.error));
    const result=parseCurvedSavedPairResult(JSON.parse(run.stdout),query);
    assert.equal(result.sample.creaseIndices.length,17);
    assert.equal(result.certification.exactStraightCreaseFOLD,false);
  }
});
