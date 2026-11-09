import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exportArtworkProject,prepareArtworkProject,type ArtworkProject} from '../../src/app/artworkProject';
import {blankDoc} from '../../src/app/state';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce} from '../../src/app/foldedModelCollection';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramStep,updateDiagramAnnotations} from '../../src/app/diagramProject';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {prepareProjectImport} from '../../src/app/prepareProjectImport';
import {defaultModelView} from '../../src/app/modelViewState';
import {tessPreset} from '../../src/app/tessellation';
import {createNonuniformHelixDesign} from '../../src/app/curveDesign';
import type {GenericNonuniformHelixResult} from '../../src/app/curvedNativeNonuniformHelix';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

function fixture():ArtworkProject {
  const editor=blankDoc('当前编辑 CP',180,160),rawSource=blankDoc('模型计算时 CP',100,100);
  rawSource.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const source=prepareProjectImport(rawSource);
  editor.metadata={construction:{kind:'original',offset:17},custom:{author:'作者'}};
  editor.objects=[{id:'circle',kind:'circle',center:[20,40],radius:10,color:'#001122'}];
  const result=computeFlatFold(source);assert.equal(result.geometry.status,'ready');
  let models=reduce(emptyFoldedModelCollection(),{type:'add',id:'model-1',name:'保存的模型',source:{doc:source,graph:buildFold(source).graph},result});
  models=reduce(models,{type:'edit',action:{type:'commit',result:moveFoldedVertices(result,{group:[0],selected:[0]},[-5,-8])}});
  models=reduce(models,{type:'view',id:'model-1',view:{...defaultModelView(),rotation:37,side:'back',board:{x:10,y:30,width:500,height:400,visible:true}}});
  const diagramSource=blankDoc('独立折序 CP',120,110);let next=0;
  let diagram=createDiagramProject(diagramSource,()=>`drawing-${++next}`);
  diagram=adoptDiagramPose(diagram,diagram.activeStepId,diagram.states[0].id,computeFlatFold(diagramSource));
  diagram=updateDiagramStep(diagram,diagram.activeStepId,{title:'第一步',description:'保留说明'});
  diagram=updateDiagramAnnotations(diagram,diagram.activeStepId,[{id:'annotation-1',kind:'line',a:[5,5],b:[35,10],style:'valley',width:.7,color:'#112233'}]);
  return {editor,models,diagram,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}};
}
function withSimulation(project:ArtworkProject):ArtworkProject {
  const source=JSON.parse(JSON.stringify(buildFold(project.models.entries[0].source.doc).graph)),prepared=prepareSimulationDocument(source).prepared,
    solver=new ReferenceSolver(new OrigamiModel(prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:45});
  solver.step(80);const initial=solver.capturePose();
  solver.setVertexConstraint(0,initial.positions.slice(0,3) as [number,number,number]);
  const pose=solver.capturePose();solver.dispose();
  return {...project,simulation:{version:1,source,solver:pose,progress:.45,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:.3,pitch:.4,zoom:1.2}}};
}

test('complete artwork preserves independent source documents, construction and drawing contents',()=>{
  const input=fixture(),before=structuredClone(input),loaded=prepareArtworkProject(exportArtworkProject(input));
  assert.deepEqual(loaded.editor,input.editor);assert.deepEqual(loaded.construction,input.construction);
  assert.deepEqual(loaded.models.entries[0].source.doc,input.models.entries[0].source.doc);
  assert.deepEqual(loaded.models.entries[0].history.present!.geometry.vertices,input.models.entries[0].history.present!.geometry.vertices);
  assert.deepEqual(loaded.models.entries[0].view,input.models.entries[0].view);
  assert.deepEqual(loaded.diagram!.states,input.diagram!.states);assert.deepEqual(loaded.diagram!.steps[0].annotations,input.diagram!.steps[0].annotations);
  assert.equal(loaded.diagram!.steps[0].description,'保留说明');assert.deepEqual(input,before);
  loaded.editor.metadata!.custom={author:'修改'};loaded.models.entries[0].source.doc.name='修改';
  assert.deepEqual(input,before,'the live workspaces own no arrays in the loaded copy');
});

test('artwork excludes undo history, asynchronous tickets and trusted old layer solutions',()=>{
  const input=fixture(),text=exportArtworkProject(input),raw=JSON.parse(text),loaded=prepareArtworkProject(text);
  assert.equal(input.models.entries[0].history.past.length,1);
  assert.deepEqual(Object.keys(raw.models),['activeId','entries']);
  assert.ok(!text.includes('"past"'));assert.ok(!text.includes('"future"'));assert.ok(!text.includes('"faceOrders"'));
  assert.equal(loaded.models.entries[0].history.past.length,0);assert.equal(loaded.models.entries[0].history.future.length,0);
  assert.equal(loaded.models.entries[0].history.present!.layers.status,'unknown');
  assert.equal(loaded.diagram!.steps[0].pose!.result.layers.status,'unknown');
});

test('empty and detached model states survive without inventing an active model or a drawing',()=>{
  const input=fixture();input.models=reduce(input.models,{type:'detach'});input.diagram=null;
  const detached=prepareArtworkProject(exportArtworkProject(input));
  assert.equal(detached.models.activeId,null);assert.equal(detached.models.entries.length,1);assert.equal(detached.diagram,null);
  input.models=emptyFoldedModelCollection();const empty=prepareArtworkProject(exportArtworkProject(input));
  assert.deepEqual(empty.models,emptyFoldedModelCollection());assert.equal(empty.simulation,null);
});

test('complete artwork preserves CP keys and accepts older entries without source-group fields',()=>{
 const input=fixture();input.models.entries[0].source.cpKey='cp-artwork-explicit';
 const raw=JSON.parse(exportArtworkProject(input)),loaded=prepareArtworkProject(JSON.stringify(raw));
 assert.equal(raw.version,1);assert.equal(raw.models.entries[0].cpKey,'cp-artwork-explicit');
 assert.equal(loaded.models.entries[0].source.cpKey,'cp-artwork-explicit');
 delete raw.models.entries[0].cpKey;
 const legacy=prepareArtworkProject(JSON.stringify(raw));assert.ok(legacy.models.entries[0].source.cpKey);
 assert.deepEqual(legacy.models.entries[0].source.doc,input.models.entries[0].source.doc);
 raw.models.entries[0].cpKey=null;assert.throws(()=>prepareArtworkProject(JSON.stringify(raw)),/来源标识/);
});

test('malformed late content is rejected before any caller can replace the editor or models',()=>{
  const input=fixture(),before=structuredClone(input),raw=JSON.parse(exportArtworkProject(input));
  const mutations=[
    (r:any)=>{r.version=2;},(r:any)=>{r.unknown=true;},(r:any)=>{delete r.diagram;},
    (r:any)=>{r.models.entries[0].snapshot.model.basis.edges[0]=[9999,9998];},
    (r:any)=>{r.models.activeId='missing';},(r:any)=>{r.models.entries=[];},
    (r:any)=>{r.diagram.states[0].doc.paper.width=-1;},(r:any)=>{r.construction.tessellation={family:'missing'};},
    (r:any)=>{r.construction.curve={format:'zhezhi-curve-design',version:99};},(r:any)=>{r.simulation={version:99};},
  ];
  for(const mutate of mutations){const damaged=structuredClone(raw);mutate(damaged);assert.throws(()=>prepareArtworkProject(JSON.stringify(damaged)));}
  assert.deepEqual(input,before);
});

test('complete artwork above the former 32 MiB quota preserves editor and model data',()=>{
  assert.throws(()=>prepareArtworkProject('{broken'),/JSON/);
  const input=fixture();input.editor.metadata={large:'x'.repeat(33*1024*1024)};
  const text=exportArtworkProject(input);assert.ok(Buffer.byteLength(text)>32*1024*1024);
  const loaded=prepareArtworkProject(text);
  assert.deepEqual(loaded.editor,input.editor);assert.equal(loaded.models.entries.length,input.models.entries.length);
});

test('native continuous curve design retains its validated geometry and construction parameters',()=>{
  const responses=JSON.parse(fs.readFileSync('tests/fixtures/curved-nonuniform-helix-native-20261001.json','utf8')) as {name:string;response:GenericNonuniformHelixResult}[];
  const input=fixture();input.construction.curve=createNonuniformHelixDesign(responses.find(row=>row.name==='original-in3968')!.response,{name:'保存纸带',millimetersPerUnit:73});
  const loaded=prepareArtworkProject(exportArtworkProject(input));assert.deepEqual(loaded.construction.curve,input.construction.curve);
  const raw=JSON.parse(exportArtworkProject(input));raw.construction.curve.result.grid[1].sourceLeft[1][0]+=.5;
  assert.throws(()=>prepareArtworkProject(JSON.stringify(raw)));
});

test('simulation source, current geometry, fixed points and camera roundtrip independently from editor CP',()=>{
  const input=withSimulation(fixture()),before=structuredClone(input),loaded=prepareArtworkProject(exportArtworkProject(input));
  assert.deepEqual(loaded.simulation,input.simulation);assert.deepEqual(input,before);
  assert.notEqual(loaded.simulation!.source,input.simulation!.source);assert.notEqual(loaded.simulation!.solver.positions,input.simulation!.solver.positions);
  assert.equal(loaded.simulation!.solver.pins.length,1);
  const raw=JSON.parse(exportArtworkProject(input));raw.simulation.solver.positions.push(0,0,0);
  assert.throws(()=>prepareArtworkProject(JSON.stringify(raw)),/姿态/);
});
