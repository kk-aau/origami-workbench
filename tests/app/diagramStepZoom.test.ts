import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {createDiagramProject,appendDiagramStep,advanceDiagramStep,duplicateDiagramStep,removeDiagramStep,selectDiagramStep,updateDiagramAnnotations,adoptDiagramPose,updateDiagramPoseView,exportDiagramProject,importDiagramProject,type DiagramProject} from '../../src/app/diagramProject';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {diagramStepZoom,diagramStepZooms,diagramStepZoomIssue,diagramZoomPaperBounds,tryMapDiagramZoomArea,validateDiagramZoomArea,type DiagramZoomArea} from '../../src/app/diagramStepZoom';
import type {DiagramImage} from '../../src/app/diagramImages';
import type {DiagramSimulationSurface} from '../../src/app/diagramSimulationSurface';
import {diagramSimulationGraph} from '../../src/app/diagramSimulationAngles';
import {diagramSimulationSurfaceBounds} from '../../src/app/diagramSimulationSurfaceRender';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {FLEXIBLE_PAPER_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

const area:DiagramZoomArea={region:{kind:'circle',center:[25,50],radius:10},basis:{x:0,y:0,width:100,height:100}};
const symbol=(id:string,kind:'zoom'|'zoomOut'='zoom',zoomArea:DiagramZoomArea|undefined=kind==='zoom'?area:undefined):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol:kind,position:[130,40],size:25,rotation:0,color:'#234534',width:.7,...zoomArea?{zoomArea:structuredClone(zoomArea)}:{}});
function fixture(count=4){
  let n=0;const ids=()=>`zoom-object-${++n}`;
  let project=createDiagramProject(blankDoc('放大流程',100,100),ids);
  for(let i=1;i<count;i++)project=appendDiagramStep(project,ids);
  return {project,ids};
}

function curvedSurface():DiagramSimulationSurface {
  const sourceDoc=blankDoc('曲面选区',100,100),source=diagramSimulationGraph(sourceDoc),mesh='standard' as const;
  const model=new OrigamiModel(prepareSimulationDocument(source,{mesh}).prepared),solver=new ReferenceSolver(model),snapshot=solver.capturePose();solver.dispose();
  snapshot.displacements=snapshot.displacements.map((_,i)=>i%3===1?Math.fround(.2*Math.cos(model.originalPositions[i-1]*2)*Math.cos(model.originalPositions[i+1]*2)):0);
  snapshot.positions=snapshot.displacements.map((value,i)=>Math.fround(model.originalPositions[i]+value));
  return {version:1,sourceStateId:'curve-source',sourceRevision:0,sourceDoc,colors:{front:'#aac4a6',back:'#e2d5c1',line:'#34543f'},
    pose:{version:1,source,solver:snapshot,mesh,progress:0,settings:{...FLEXIBLE_PAPER_SOLVER_SETTINGS},view:{yaw:.3,pitch:.4,zoom:2}}};
}

test('curve zoom selections include the projected surface beyond the original paper and respect visibility',()=>{
  const surface=curvedSurface(),saved=JSON.stringify(surface),paper=surface.sourceDoc.paper;
  const bounds=diagramZoomPaperBounds(null,[],true,paper,surface),expected=diagramSimulationSurfaceBounds(surface);
  for(const key of ['x','y','width','height'] as const)assert.ok(Math.abs(bounds[key]-expected[key])<1e-9);
  assert.ok(bounds.x<0&&bounds.y<0&&bounds.x+bounds.width>paper.width&&bounds.y+bounds.height>paper.height,'an enlarged captured curve is selectable beyond the original CP rectangle');
  assert.deepEqual(diagramZoomPaperBounds(null,[],false,paper,surface),{x:0,y:0,width:100,height:100});
  const image={position:[500,500],width:20,height:30,rotation:0} as DiagramImage;
  assert.deepEqual(diagramZoomPaperBounds(null,[image],true,paper,surface),{x:bounds.x,y:bounds.y,width:520-bounds.x,height:530-bounds.y});
  assert.equal(JSON.stringify(surface),saved,'reading bounds does not change saved vertices or view');
});

test('single and batched inherited crops track the saved curve view rather than the flat CP rectangle',()=>{
  const f=fixture(3),project=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('curve-in')]),surface=curvedSurface();
  project.steps[1].simulationSurface=surface;
  project.steps[2].simulationSurface={...surface,pose:{...surface.pose,view:{yaw:1.1,pitch:.7,zoom:1.3}}};
  const saved=JSON.stringify(project),batch=diagramStepZooms(project);
  for(const step of project.steps.slice(1)){
    const bounds=diagramSimulationSurfaceBounds(step.simulationSurface!),crop=diagramStepZoom(project,step.id);
    assert.ok(crop?.region.kind==='circle');
    assert.ok(Math.abs(crop.region.center[0]-(bounds.x+bounds.width*.25))<1e-9);
    assert.ok(Math.abs(crop.region.center[1]-(bounds.y+bounds.height*.5))<1e-9);
    assert.ok(Math.abs(crop.region.radius-Math.min(bounds.width,bounds.height)*.1)<1e-9);
    assert.deepEqual(batch.get(step.id),crop,'rail/export batch crop agrees with the main drawing');
  }
  assert.notDeepEqual(batch.get(project.steps[1].id)?.region,batch.get(project.steps[2].id)?.region,'a different saved orbit changes the visual selection basis');
  assert.equal(JSON.stringify(project),saved);
});

test('batch thumbnail crops match the individual replay after edits, insertion and deletion',()=>{
  const f=fixture(6);let project=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('first')]);
  project=updateDiagramAnnotations(project,project.steps[2].id,[symbol('out','zoomOut'),symbol('second')]);
  project=updateDiagramAnnotations(project,project.steps[4].id,[symbol('end','zoomOut')]);
  const duplicate=duplicateDiagramStep(project,project.steps[1].id,f.ids);
  const removed=removeDiagramStep(duplicate,duplicate.steps[0].id);
  for(const current of [f.project,project,duplicate,removed]){
    const saved=structuredClone(current),batch=diagramStepZooms(current);
    assert.equal(batch.size,current.steps.length);
    for(const step of current.steps)assert.deepEqual(batch.get(step.id),diagramStepZoom(current,step.id));
    assert.deepEqual(current,saved,'batch preparation never mutates a saved step or its crop');
  }
});

test('zoom starts only on the next step and remains through the zoom-out step',()=>{
  const f=fixture();let p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('zoom-in')]);
  p=updateDiagramAnnotations(p,p.steps[2].id,[symbol('zoom-out','zoomOut')]);
  const saved=structuredClone(p);
  assert.equal(diagramStepZoom(p,p.steps[0].id),null);
  for(const index of [1,2])assert.deepEqual(diagramStepZoom(p,p.steps[index].id),{region:area.region,sourceStepId:p.steps[0].id,symbolId:'zoom-in'});
  assert.equal(diagramStepZoom(p,p.steps[3].id),null);
  for(let i=0;i<3;i++){
    p=advanceDiagramStep(selectDiagramStep(p,p.steps[0].id),f.ids);
    assert.deepEqual(diagramStepZoom(p,p.activeStepId)?.region,area.region);
  }
  assert.deepEqual(p.steps,saved.steps,'navigation neither multiplies the zoom nor changes the illustrations');
  const result=diagramStepZoom(p,p.steps[1].id)!;
  if(result.region.kind==='circle')result.region.center[0]=500;
  assert.deepEqual(diagramStepZoom(p,p.steps[1].id)?.region,area.region,'derived regions never expose saved mutable arrays');
});

test('symbol array order determines the last instruction and legacy unconfigured glyphs stay harmless',()=>{
  const f=fixture(3),first=f.project.steps[0].id,second=f.project.steps[1].id;
  let p=updateDiagramAnnotations(f.project,first,[symbol('configured')]);
  const legacy=symbol('legacy');delete legacy.zoomArea;
  p=updateDiagramAnnotations(p,second,[legacy]);
  assert.equal(diagramStepZoom(p,p.steps[2].id)?.symbolId,'configured');
  p=updateDiagramAnnotations(p,first,[symbol('in'),symbol('out','zoomOut')]);assert.equal(diagramStepZoom(p,second),null);
  p=updateDiagramAnnotations(p,first,[symbol('out','zoomOut'),symbol('in')]);assert.equal(diagramStepZoom(p,second)?.symbolId,'in');
  p=updateDiagramAnnotations(p,first,[]);assert.equal(diagramStepZoom(p,second),null);
});

test('selection survives save/load and responds deterministically to duplicate/remove/undo',()=>{
  const f=fixture(3),before=structuredClone(f.project);
  const p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('in')]);
  const loaded=importDiagramProject(exportDiagramProject(p));
  assert.deepEqual(loaded.steps[0].annotations,p.steps[0].annotations);
  assert.deepEqual(diagramStepZoom(loaded,loaded.steps[2].id),diagramStepZoom(p,p.steps[2].id));
  assert.equal(diagramStepZoom(before,before.steps[2].id),null,'historical projects have no stale derived zoom');
  const copy=duplicateDiagramStep(p,p.steps[0].id,f.ids);
  assert.equal(diagramStepZoom(copy,copy.steps[1].id)?.sourceStepId,p.steps[0].id);
  assert.equal(diagramStepZoom(copy,copy.steps[2].id)?.sourceStepId,copy.steps[1].id);
  const removed=removeDiagramStep(p,p.steps[0].id);assert.equal(diagramStepZoom(removed,removed.steps[0].id),null);
  assert.deepEqual(p.states,before.states,'presentation zoom never modifies the CP chain');
  assert.throws(()=>diagramStepZoom(p,'missing'),/步骤/);
});

test('circle positions follow each target paper bounds and radii remain circular',()=>{
  const f=fixture(2);let p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('in')]);
  p.states[1].doc=blankDoc('目标纸幅',200,400);
  assert.deepEqual(diagramStepZoom(p,p.steps[1].id)?.region,{kind:'circle',center:[50,200],radius:20});
  const result=computeFlatFold(p.states[1].doc);
  p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,result);
  p=updateDiagramPoseView(p,p.steps[1].id,{...defaultModelView(),rotation:90});
  const bounds=diagramZoomPaperBounds(p.steps[1].pose);
  assert.ok(Math.abs(bounds.width-400)<1e-8&&Math.abs(bounds.height-200)<1e-8);
  assert.equal(diagramStepZoom(p,p.steps[1].id)?.region.kind,'circle','manual orientation does not disable zoom instructions');
});

test('wave regions keep their chosen side and permit a nested split rectangle',()=>{
  const f=fixture(2),wave:DiagramZoomArea={basis:{x:0,y:0,width:100,height:100},region:{kind:'wave',points:[[25,50],[50,55],[75,50]],side:'right',bounds:{x:25,y:25,width:50,height:50}}};
  const p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('wave','zoom',wave)]);
  p.states[1].doc=blankDoc('长方形目标',200,400);
  assert.deepEqual(diagramStepZoom(p,p.steps[1].id)?.region,{kind:'wave',points:[[50,200],[100,220],[150,200]],side:'right',bounds:{x:50,y:100,width:100,height:200}});
  assert.deepEqual(diagramStepZoom(importDiagramProject(exportDiagramProject(p)),p.steps[1].id),diagramStepZoom(p,p.steps[1].id));
});

test('stable paper bounds ignore annotations and handle image-only and uncalculated steps',()=>{
  assert.deepEqual(diagramZoomPaperBounds(null),{x:0,y:0,width:200,height:200});
  assert.deepEqual(diagramZoomPaperBounds(null,[],true,{width:80,height:120}),{x:0,y:0,width:80,height:120});
  const image={position:[0,0],width:100,height:50,rotation:90} as DiagramImage;
  const box=diagramZoomPaperBounds(null,[image],false);
  assert.ok(Math.abs(box.x-25)<1e-8&&Math.abs(box.y+25)<1e-8&&Math.abs(box.width-50)<1e-8&&Math.abs(box.height-100)<1e-8);
  const f=fixture(2),p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('outside')]);
  const source=structuredClone(p);(p.steps[0].annotations![0] as DiagramSymbolAnnotation).position=[99999,-99999];
  assert.deepEqual(diagramStepZoom(p,p.steps[1].id),diagramStepZoom(source,source.steps[1].id),'arrow placement does not move its selected region');
});

test('zoom selection validation is strict and applies only to the zoom-in symbol',()=>{
  validateDiagramZoomArea(area);validateDiagramAnnotations([symbol('valid')]);
  const invalid:unknown[]=[undefined,null,{}, {...area,extra:true},{...area,basis:{...area.basis,width:0}}, {...area,basis:{...area.basis,x:Infinity}}, {...area,region:{kind:'circle',center:[0,0],radius:NaN}}, {...area,region:{...area.region,extra:1}}];
  for(const value of invalid)assert.throws(()=>validateDiagramZoomArea(value));
  assert.throws(()=>validateDiagramAnnotations([symbol('out','zoomOut',area)]),/仅适用于放大符号/);
  assert.throws(()=>validateDiagramAnnotations([{...symbol('other'),symbol:'referencePoint'}]),/仅适用于放大符号/);
  const f=fixture(1),p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('valid')]);
  const malformed=JSON.parse(exportDiagramProject(p)) as DiagramProject;
  (malformed.steps[0].annotations![0] as DiagramSymbolAnnotation).zoomArea={...area,basis:{...area.basis,width:0}};
  assert.throws(()=>importDiagramProject(JSON.stringify(malformed)),/范围无效/);
});

test('extreme valid source scales never enlarge, clamp or corrupt a selection to fit rendering limits',()=>{
  const enormous:DiagramZoomArea={basis:{x:0,y:0,width:.00001,height:.00001},region:{kind:'circle',center:[0,0],radius:1}};
  validateDiagramZoomArea(enormous);
  const snapshot=structuredClone(enormous),target={x:0,y:0,width:100,height:100};
  assert.equal(tryMapDiagramZoomArea(enormous,target),null,'out-of-range mapped radius is not handed to SVG renderers');
  assert.deepEqual(enormous,snapshot,'failed mapping never rewrites an authored selection');
  const tiny:DiagramZoomArea={basis:{x:0,y:0,width:100000,height:100000},region:{kind:'circle',center:[20,20],radius:.00001}};
  assert.equal(tryMapDiagramZoomArea(tiny,target),null,'an unrenderably small crop is not silently enlarged');
  for(const bounds of [{...target,width:0},{...target,x:Infinity},{...target,x:1000000}])assert.equal(tryMapDiagramZoomArea(area,bounds),null);
  const wave:DiagramZoomArea={basis:{x:0,y:0,width:.00001,height:.00001},region:{kind:'wave',points:[[0,50],[100,50]],side:'left',bounds:{x:0,y:0,width:100,height:100}}};
  validateDiagramZoomArea(wave);assert.equal(tryMapDiagramZoomArea(wave,target),null,'wave coordinates obey the same output limits');
});

test('a project with an unrepresentable inherited zoom opens with an actionable issue and preserves its instruction',()=>{
  const f=fixture(3),enormous:DiagramZoomArea={basis:{x:0,y:0,width:.00001,height:.00001},region:{kind:'circle',center:[0,0],radius:1}};
  let p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('extreme','zoom',enormous)]);
  p=updateDiagramAnnotations(p,p.steps[1].id,[symbol('restore','zoomOut')]);
  const loaded=importDiagramProject(exportDiagramProject(p)),snapshot=structuredClone(loaded);
  assert.equal(diagramStepZoomIssue(loaded,loaded.steps[0].id),undefined);
  assert.equal(diagramStepZoom(loaded,loaded.steps[1].id),null);
  assert.match(diagramStepZoomIssue(loaded,loaded.steps[1].id)!,/重新选择区域/);
  assert.equal(diagramStepZoomIssue(loaded,loaded.steps[2].id),undefined,'zoom-out ends even an unrepresentable instruction');
  assert.deepEqual(loaded,snapshot,'fallback display leaves the stored area and CPs intact');
});
