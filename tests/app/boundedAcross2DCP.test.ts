import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedAcross2DDocument,BOUNDED_ACROSS_EXAMPLE,boundedAcrossSourceMatches,readBoundedAcrossRecipe,boundedAcrossProcessingSettings} from '../../src/app/boundedAcross2DCP';
import {LINEAR_ACROSS_SAVED,linearAcrossFrame} from '../../src/app/curvedAcrossRightLinearAngle';
import {buildFold} from '../../src/core/geometry';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {computeFlatFold} from '../../src/core/flatFold';
import {diagnose} from '../../src/core/diagnostics';
import {splitEditableSegments} from '../../src/app/planarize';
import {processingOptions} from '../../src/app/cpProcessingSettings';
import {analyzeCPPaths,optimizeCPPaths} from '../../src/core/cpPathOptimizer';

const recipe=structuredClone(BOUNDED_ACROSS_EXAMPLE);
const near=(x:number,y:number)=>assert.ok(Math.abs(x-y)<2e-13,`${x} / ${y}`);
test('intrinsic two-sided paper has genuine 51V/52E/2F without auxiliary creases or coordinate transforms',()=>{
  const d=boundedAcross2DDocument(recipe),g=buildFold(d).graph;
  assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices?.length],[51,52,2]);
  assert.equal(d.segments.filter(s=>s.assignment==='U').length,16);
  assert.equal(d.segments.filter(s=>s.assignment==='B').length,36);
  assert.equal(d.segments.filter(s=>s.assignment==='A').length,30);
  assert.ok(d.segments.filter(s=>s.assignment==='U').every(s=>s.angle===null));
  assert.deepEqual(d.segments[0].a,[Math.cos(.2),Math.sin(.2)]);
  for(const i of [0,7,16]){const u=i===16?1:.2+.8*i/16,f=linearAcrossFrame(recipe.parameters,u),key=`across-${i===0||i===16?'cap':'guide'}-right-${i}`,
    s=d.segments.find(s=>s.id===key)!;assert.ok(s);assert.deepEqual(s.a,f.crease);
    near(s.b[0],f.crease[0]+.15*f.rightRuling[0]);near(s.b[1],f.crease[1]+.15*f.rightRuling[1]);}
  assert.ok(boundedAcrossSourceMatches(d));
  assert.ok(boundedAcrossSourceMatches(splitEditableSegments(d)));
});
test('A guides are optional and never split the structural sheet; full saved analytic input also passes',()=>{
  const plain=boundedAcross2DDocument({...recipe,includeRulingGuides:false}),guides=boundedAcross2DDocument(recipe);
  assert.equal(plain.segments.length,52);assert.deepEqual(buildFold(plain).graph,buildFold(guides).graph);
  const saved=boundedAcross2DDocument({parameters:LINEAR_ACROSS_SAVED,includeRulingGuides:true});
  assert.deepEqual([buildFold(saved).graph.vertices_coords.length,buildFold(saved).graph.edges_vertices.length,buildFold(saved).graph.faces_vertices?.length],[291,292,2]);
});
test('ruling guides default excluded in this paper processing flow without changing generic defaults',()=>{
  const d=boundedAcross2DDocument(recipe),settings=boundedAcrossProcessingSettings(d);
  assert.equal(settings.A.enabled,false);assert.equal(settings.B.enabled,true);assert.equal(settings.U.enabled,true);
  const generic={...d,metadata:{}};assert.equal(boundedAcrossProcessingSettings(generic).A.enabled,true);
  const altered=structuredClone(d);altered.segments.find(s=>s.assignment==='A')!.assignment='U';altered.segments.find(s=>s.id==='across-guide-left-1')!.angle=null;
  assert.equal(boundedAcrossProcessingSettings(altered).A.enabled,true);
  assert.equal(boundedAcrossProcessingSettings(d).A.enabled,false);
  const options=processingOptions(settings,false,false,[0,0],'independent'),analysis=analyzeCPPaths(d,options),plan=optimizeCPPaths(d,options);
  assert.equal(analysis.included.length,52);assert.equal(analysis.excluded.length,30);
  assert.ok(analysis.excluded.every(s=>s.assignment==='A'));assert.ok(analysis.included.every(s=>s.assignment!=='A'));
  const actual=analysis.included.reduce((sum,s)=>sum+Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1]),0);
  near(plan.before.drawLength,actual);near(plan.after.drawLength,actual);assert.equal(plan.paths.length,52);
  assert.equal(analysis.included.map(s=>s.id).sort().join('|'),plan.paths.flatMap(p=>p.sourceSegmentIds).sort().join('|'));
  settings.A.enabled=true;assert.equal(analyzeCPPaths(d,processingOptions(settings,false,false,[0,0],'independent')).included.length,82);
});
test('unknown M/V and curved-crease kink failures never produce an FF/layer or ordinary-adoption certificate',()=>{
  const d=boundedAcross2DDocument(recipe),source=d.metadata!.originalAcross2D as any,local=diagnose(d),flat=computeFlatFold(d);
  assert.equal(source.evidence.adoption,'explicit-cp-only');assert.equal(source.evidence.flatFold,false);assert.equal(source.evidence.layerOrder,false);
  assert.equal(source.evidence.threeDimensionalInitialCondition,false);assert.ok(local.issues.some(i=>i.code==='kawasaki'));
  assert.notEqual(flat.layers.status,'solved');assert.notEqual(flat.geometry.status,'ready');
  assert.equal(d.flatFold,undefined);assert.equal(d.metadata?.materialTopology,undefined);
});
test('native JSON and mm FOLD reopen all exact source choices, raw points, A guides and U assignments',()=>{
  const d=boundedAcross2DDocument(recipe);
  for(const format of ['json','fold'] as const){const text=exportDocument(d,format).text,again=importDocument(text,format).doc;
    assert.ok(boundedAcrossSourceMatches(again),format);assert.deepEqual(readBoundedAcrossRecipe(again),recipe);
    const second=importDocument(exportDocument(again,format).text,format).doc;assert.ok(boundedAcrossSourceMatches(second));
    if(format==='fold'){const f=JSON.parse(text);assert.equal(f.frame_unit,'mm');assert.deepEqual(f.frame_classes,['creasePattern']);assert.equal(f.file_frames,undefined);
      assert.equal(f['zhezhi:workbench'].fields.zhezhi_auxiliary.length,30);assert.ok(!('vertices_coords' in f['zhezhi:workbench'].fields.zhezhi_metadata.originalAcross2D));}}
});
test('ordinary DXF every LINE is independently read as raw x,-y mm with B/U/A layer identity',()=>{
  const d=boundedAcross2DDocument(recipe),text=exportDXF(d).text,lines=text.trimEnd().split(/\r?\n/),entities:Record<string,string>[]=[];
  for(let i=0;i<lines.length;i+=2)if(lines[i]==='0'&&lines[i+1]==='LINE'){
    const row:Record<string,string>={};for(i+=2;i<lines.length&&lines[i]!=='0';i+=2)row[lines[i]]=lines[i+1];i-=2;entities.push(row);}
  assert.equal(entities.length,d.segments.length);assert.match(text,/1 drawing unit = 1 mm/);
  entities.forEach((row,i)=>{const s=d.segments[i];assert.equal(row['8'],DXF_LAYERS[s.assignment].name);
    assert.equal(+row['10'],s.a[0]);assert.equal(+row['20'],-s.a[1]);assert.equal(+row['11'],s.b[0]);assert.equal(+row['21'],-s.b[1]);assert.equal(+row['30'],0);assert.equal(+row['31'],0);});
});
test('saved source recipe survives hand edits while source geometry certification becomes false',()=>{
  const d=boundedAcross2DDocument(recipe),before=structuredClone(d),changed=structuredClone(d);changed.segments[0].a[0]+=.001;
  assert.deepEqual(readBoundedAcrossRecipe(changed),recipe);assert.equal(boundedAcrossSourceMatches(changed),false);
  (changed.metadata!.originalAcross2D as any).evidence.flatFold=true;assert.equal(boundedAcrossSourceMatches(changed),false);
  const edited=boundedAcross2DDocument({...recipe,parameters:{...recipe.parameters,angleSlope:.6,rightWidth:.18}});
  assert.notDeepEqual(edited.segments,d.segments);assert.ok(boundedAcrossSourceMatches(edited));assert.deepEqual(d,before);
});
test('strict input and small near-degenerate or oversized sampling fail atomically, never welding or adding bridging lines',()=>{
  for(const patch of [{leftWidth:1},{parameterStart:0},{angleSlope:null},{curveSegments:256},{curveSegments:16.5},{rightWidth:true},
    {parameterEnd:.200000001},{leftWidth:1e-10},{rightWidth:1e-10}])assert.throws(()=>boundedAcross2DDocument({...recipe,parameters:{...recipe.parameters,...patch}}));
  for(const value of [{...recipe,includeRulingGuides:null},{...recipe,unknown:true},null])assert.throws(()=>boundedAcross2DDocument(value));
  assert.deepEqual(recipe,BOUNDED_ACROSS_EXAMPLE);
});
