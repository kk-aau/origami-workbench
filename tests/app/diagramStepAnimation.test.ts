import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import type {Doc,Point,Segment} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink,exportDiagramProject,importDiagramProject,type DiagramProject} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments,mapDiagramFoldLines,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {simulationLayerOrder,simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {materialSlitFixture} from '../fixtures/materialModel';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {defaultModelColors} from '../../src/app/modelColors';
import {normalizeDiagramProjectCP} from '../../src/app/diagramCP';
import {simulationStepDisplayAssignments} from '../../src/engine/simStepEdges';
import {createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';

const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:assignment==='U'?null:0});
function fixture(before=blankDoc('步骤动画',100,100)){
  let id=0,project=createDiagramProject(before,()=>`animation-${++id}`),step=project.steps[0];
  const result=computeFlatGeometry(buildDiagramFold(before).graph,1e-6);assert.equal(result.geometry.status,'ready');
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  return {project,stepId:step.id,before};
}
function withAfter(project:DiagramProject,doc:Doc){return updateDiagramCP(project,project.steps[0].afterId,doc);}
const bounds=(positions:number[],axis:number)=>{const p=positions.filter((_,i)=>i%3===axis);return Math.max(...p)-Math.min(...p);};

for(const precrease of [true,false])test(`an old expanded mark remains visible before ${precrease?'repressing':'folding'} it on the rigid path`,()=>{
  const before=blankDoc('重用已有折痕',100,100),mark=segment('old-mark',[50,0],[50,100],'F');before.segments.push(mark);
  let {project,stepId}=fixture(before);
  if(precrease)project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[{...mark,assignment:'V',angle:180}]});
  else project=withAfter(project,applyDiagramFoldSegments(before,[{...mark,assignment:'V',angle:180}]));
  const clip=buildDiagramStepAnimation(project,stepId),prepared=prepareSimulationDocument(clip.fold).prepared;
  assert.equal(clip.animation.flexRequest,undefined);
  const validated=validateSimulationStepAnimation(clip.animation,prepared,simulationSourceSignature(clip.fold));
  const shown=simulationStepDisplayAssignments(prepared,validated,validated.initialPositions,{center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],camDist:5},0);
  const active=validated.ranges.filter(r=>r.toAngle||r.viaAngle);assert.ok(active.length);
  assert.ok(active.every(r=>validated.retainedCreases!.includes(r.edge)&&(shown[r.edge]==='M'||shown[r.edge]==='V')));
});

test('first fold keeps a flat undeformed rest mesh and a complete zero-angle initial pose',()=>{
  const {project,stepId,before}=fixture(),after=applyDiagramFoldSegments(before,[segment('new',[50,0],[50,100],'V')]),input=withAfter(project,after),saved=structuredClone(input);
  const clip=buildDiagramStepAnimation(input,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.deepEqual(input,saved);assert.equal(clip.beforeLabel,'CP0');assert.equal(clip.afterLabel,'CP1');
  assert.equal(clip.animation.ranges.length,prepared.creaseParams.length);
  assert.ok(clip.animation.ranges.every(r=>r.fromAngle===0));assert.ok(clip.animation.ranges.some(r=>r.toAngle===180));
  assert.ok(clip.fold.vertices_coords.some(p=>p[0]===100));assert.ok(bounds(clip.animation.initialPositions,0)>1);
  assert.equal(clip.finalGeometry!.geometry.status,'ready');assert.deepEqual(clip.finalGeometry!.geometry.faces,clip.fold.faces_vertices);
  assert.doesNotThrow(()=>validateSimulationStepAnimation(clip.animation,prepared,simulationSourceSignature(clip.fold)));
});

test('second fold begins with the exact already folded two-layer paper and retains old fold angles',()=>{
  const before=blankDoc('第二折',100,100);before.segments.push(segment('old',[50,0],[50,100],'V'));
  let {project,stepId}=fixture(before);const pose=project.steps[0].pose!,settings={enabled:true,layers:'all' as const,selectedFaces:[]};
  const mapped=mapDiagramFoldLines(pose,[{id:'new',kind:'line',a:[0,30],b:[50,30],style:'valley',color:'#000000',width:1}],settings),after=applyDiagramFoldSegments(before,mapped.segments);
  project=withAfter(project,after);const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.ok(clip.animation.ranges.some(r=>r.fromAngle===180&&r.toAngle===180),'old crease must stay folded');
  assert.ok(clip.animation.ranges.some(r=>r.fromAngle===0&&r.toAngle===180));assert.ok(clip.animation.ranges.some(r=>r.fromAngle===0&&r.toAngle===-180));
  assert.ok(bounds(clip.animation.initialPositions,0)<bounds(clip.animation.initialPositions,2)*.51,'start is already a half-width folded form');
  assert.ok(clip.animation.ranges.every(r=>r.fromAngle===0||r.fromAngle===180));
  assert.equal(prepared.vertexCount*3,clip.animation.initialPositions.length);
});

test('fixed side pins only the new union subface, never both sides of the newly added crease',()=>{
  let {project,stepId,before}=fixture();const fixed=pickDiagramFoldAnchor(project.steps[0].pose!,[20,20],0);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],fixed});
  const clip=buildDiagramStepAnimation(withAfter(project,applyDiagramFoldSegments(before,[segment('new',[50,0],[50,100],'V')])),stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.ok(clip.animation.fixedVertices.length>=3);
  for(const v of clip.animation.fixedVertices)assert.ok(prepared.originalPositions[v*3]<=50+1e-6);
  assert.ok(prepared.vertexCount>clip.animation.fixedVertices.length);
  const source=clip.fold,geometry=clip.finalGeometry!.geometry;
  for(let v=0;v<source.vertices_coords.length;v++)if(source.vertices_coords[v][0]<=50)assert.ok(distance(source.vertices_coords[v],geometry.vertices[v])<1e-6);
});

test('precrease direction produces a fold-and-unfold intermediate while final CP and pose remain flat',()=>{
  let {project,stepId,before}=fixture();const route=segment('pre',[0,40],[100,40],'F');
  project=withAfter(project,applyDiagramFoldSegments(before,[route]));
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[{...route,assignment:'M',angle:-180}]});
  const clip=buildDiagramStepAnimation(project,stepId),moving=clip.animation.ranges.filter(r=>r.viaAngle!==undefined);
  assert.ok(moving.length);assert.ok(moving.every(r=>r.fromAngle===0&&r.toAngle===0&&r.viaAngle===-180));
  assert.ok(clip.finalGeometry!.geometry.vertices.every((p,v)=>distance(p,clip.fold.vertices_coords[v])<1e-6));
});

for(const assignment of ['M','V'] as const)test(`an explicitly pressed old ${assignment} hinge records opening and restoration even with identical endpoint CPs`,()=>{
  const before=blankDoc('旧折痕往返',100,100),old=segment('old-hinge',[50,0],[50,100],assignment);before.segments.push(old);
  let {project,stepId}=fixture(before);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[old]});
  project=importDiagramProject(exportDiagramProject(project));const saved=structuredClone(project);
  const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const active=clip.animation.ranges.filter(r=>r.viaAngle!==undefined);
  assert.ok(active.length);assert.ok(active.every(r=>r.fromAngle===old.angle&&r.toAngle===old.angle&&r.viaAngle===0));
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  assert.ok(result.checkedIntervals>0);
  const path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!);
  assert.deepEqual(path.evaluate(1),path.evaluate(0));assert.ok(path.evaluate(.5).some((n,i)=>Math.abs(n-path.evaluate(0)[i])>.1));
  const shown=simulationStepDisplayAssignments(prepared,result.animation,path.evaluate(0),{center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],camDist:5},0);
  assert.ok(active.every(r=>['M','V','B'].includes(shown[r.edge])),'rewinding keeps the original folded crease visible');
  assert.deepEqual(project,saved);
});

test('an actual new fold takes precedence and opposite old-fold intent cannot create a return cycle',()=>{
  const base=fixture(),newFold=segment('new-fold',[50,0],[50,100],'V');
  let project=withAfter(base.project,applyDiagramFoldSegments(base.before,[newFold]));
  project=updateDiagramFoldLink(project,base.stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[newFold]});
  const clip=buildDiagramStepAnimation(project,base.stepId);
  assert.ok(clip.animation.ranges.some(r=>r.fromAngle===0&&r.toAngle===180));
  assert.ok(clip.animation.ranges.every(r=>r.viaAngle===undefined));
  const oldDoc=applyDiagramFoldSegments(base.before,[newFold]),old=fixture(oldDoc);
  project=updateDiagramFoldLink(old.project,old.stepId,{enabled:true,layers:'all',selectedFaces:[],precreases:[{...newFold,assignment:'M',angle:-180}]});
  assert.throws(()=>buildDiagramStepAnimation(project,old.stepId),/没有实际折叠变化/);
});

test('unfolding an existing valley retains the old material hinge and drives it to zero',()=>{
  const before=blankDoc('展开',100,100);before.segments.push(segment('old',[50,0],[50,100],'V'));
  const {project,stepId}=fixture(before),after=applyDiagramFoldSegments(before,[segment('flatten',[50,0],[50,100],'F')]);
  const clip=buildDiagramStepAnimation(withAfter(project,after),stepId);
  assert.ok(clip.animation.ranges.some(r=>r.fromAngle===180&&r.toAngle===0));
  assert.ok(clip.fold.edges_assignment.includes('F'),'union retains a subdivided flat hinge even though after CP is F');
});

test('CP IDs and collinear segmentation never restart or invent a step action',()=>{
  const {project,stepId,before}=fixture(),after=applyDiagramFoldSegments(before,[segment('new',[0,40],[100,40],'F')]);
  assert.throws(()=>buildDiagramStepAnimation(withAfter(project,after),stepId),/没有实际折叠变化/);
  const renamed={...before,segments:before.segments.map((s,i)=>({...s,id:`different-${i}`,a:s.b,b:s.a}))};
  assert.throws(()=>buildDiagramStepAnimation(withAfter(project,renamed),stepId),/没有实际折叠变化/);
});

test('a missing before pose is built geometrically without performing a layer search',()=>{
  const before=blankDoc('未计算',100,100),{project,stepId}=fixture(before);project.steps[0].pose=null;
  const clip=buildDiagramStepAnimation(withAfter(project,applyDiagramFoldSegments(before,[segment('fold',[50,0],[50,100],'V')])),stepId);
  assert.equal(clip.finalGeometry!.layers.status,'unknown');assert.ok(clip.animation.initialPositions.length);
});

test('stale CP or a genuinely stretched pose rejects playback instead of guessing the start',()=>{
  const {project,stepId,before}=fixture(),after=applyDiagramFoldSegments(before,[segment('fold',[50,0],[50,100],'V')]);
  const stale=updateDiagramCP(withAfter(project,after),project.steps[0].beforeId,before);
  assert.throws(()=>buildDiagramStepAnimation(stale,stepId),/操作前 CP 已变化/);
  const damaged=withAfter(project,after);damaged.steps[0].pose!.result.geometry.vertices[2][0]+=10;
  assert.throws(()=>buildDiagramStepAnimation(damaged,stepId),/非等距|退化/);
});

test('pulled illustrations use the archived flat pose without altering either saved illustration',()=>{
  const {project,stepId,before}=fixture(),input=withAfter(project,applyDiagramFoldSegments(before,[segment('fold',[50,0],[50,100],'V')]));
  const flat=structuredClone(input.steps[0].pose!),pulled=structuredClone(flat);pulled.result.geometry.vertices[2][0]+=10;
  input.steps[0].pose=pulled;input.steps[0].paperStates={active:'pulled',flat,pulled};const saved=structuredClone(input);
  assert.ok(buildDiagramStepAnimation(input,stepId).animation.initialPositions.length);assert.deepEqual(input,saved);
});

test('unsupported unknown assignments, direct fold reversal and material cuts report specific reasons',()=>{
  const {project,stepId,before}=fixture();
  assert.throws(()=>buildDiagramStepAnimation(withAfter(project,applyDiagramFoldSegments(before,[segment('u',[50,0],[50,100],'U')])),stepId),/未赋型|未知折角/);
  const folded=blankDoc('反转',100,100);folded.segments.push(segment('fold',[50,0],[50,100],'M'));
  const f=fixture(folded);assert.throws(()=>buildDiagramStepAnimation(withAfter(f.project,applyDiagramFoldSegments(folded,[segment('v',[50,0],[50,100],'V')])),f.stepId),/反转/);
  const material=materialSlitFixture(),m=createDiagramProject(material.source);assert.throws(()=>buildDiagramStepAnimation(m,m.activeStepId),/切口/);
});

test('changing the paper outline is rejected even when the advertised page size stays the same',()=>{
  const {project,stepId,before}=fixture(),after=structuredClone(before);after.segments[0].a=[5,0];after.segments.push(segment('fold',[50,0],[50,100],'V'));
  assert.throws(()=>buildDiagramStepAnimation(withAfter(project,after),stepId),/边界|纸张/);
});

test('the final same-topology geometry can receive an actual layer certificate for the animation source',()=>{
  const {project,stepId,before}=fixture(),clip=buildDiagramStepAnimation(withAfter(project,applyDiagramFoldSegments(before,[segment('fold',[50,0],[50,100],'V')])),stepId);
  const solved=recomputeFlatLayers(clip.finalGeometry!);
  assert.equal(solved.layers.status,'solved');assert.ok(simulationLayerOrder(clip.fold,solved));
});

test('noninteger CP endpoints retain precise material lookup through Float32 simulation preparation',()=>{
  const before=blankDoc('非整数坐标',123.456789,98.7654321),{project,stepId}=fixture(before);
  const clip=buildDiagramStepAnimation(withAfter(project,applyDiagramFoldSegments(before,[segment('fold',[45.6789123,0],[45.6789123,98.7654321],'V')])),stepId);
  assert.ok(clip.animation.initialPositions.every(Number.isFinite));
});

test('a top-layer free-corner fold pins the chosen lower layer while neighbouring old panels stay rigid on the ordinary path',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const fixed=new Set(clip.animation.fixedVertices),point=(v:number)=>prepared.fold.vertices_coords[v];
  const at=(x:number,y:number)=>pointIds(x,y);
  function pointIds(x:number,y:number){return prepared.fold.vertices_coords.flatMap((p,v)=>Math.abs(p[0]-x)<1e-6&&Math.abs(p[2]+y)<1e-6?[v]:[]);}
  for(let v=0;v<prepared.vertexCount;v++)if(point(v)[0]<=50)assert.ok(fixed.has(v),'whole lower material layer must stay fixed');
  assert.ok(at(100,100).every(v=>!fixed.has(v)),'a neighbouring old panel may open only on a subsequently certified fallback');
  assert.ok(at(100,0).length);assert.ok(at(100,0).every(v=>!fixed.has(v)),'free top corner remains moveable');
  const driver=createSimulationStepRigidDriver(prepared,clip.animation);
  for(const progress of [.13,.5,.93,1]){
    const positions=driver(clip.animation.ranges.map(r=>r.fromAngle+(r.toAngle-r.fromAngle)*progress));
    for(const v of [...at(100,100),...at(80,0),...at(100,40)])for(let k=0;k<3;k++)assert.ok(Math.abs(positions[v*3+k]-clip.animation.initialPositions[v*3+k])<1e-7,'ordinary playback does not move an unselected neighbouring panel or hinge endpoint');
  }
  assert.equal(clip.animation.ranges.filter(r=>r.fromAngle!==r.toAngle).length,1);
});

test('all-layer folds retain both moving flaps instead of locking a whole previous source face',()=>{
  const before=blankDoc('两层同步折叠',100,100);before.segments.push(segment('retained',[50,0],[50,100],'V'));
  let {project,stepId}=fixture(before);const pose=project.steps[0].pose!,fixed=pickDiagramFoldAnchor(pose,[20,10],0),settings={enabled:true,layers:'all' as const,selectedFaces:[],fixed};
  const mapped=mapDiagramFoldLines(pose,[{id:'fold-both',kind:'line',a:[0,40],b:[50,40],style:'valley',color:'#000000',width:1}],settings);
  project=updateDiagramFoldLink(withAfter(project,applyDiagramFoldSegments(before,mapped.segments)),stepId,settings);
  const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold),pins=new Set(clip.animation.fixedVertices);
  const driver=createSimulationStepRigidDriver(prepared,clip.animation),middle=driver(clip.animation.ranges.map(r=>r.fromAngle+(r.toAngle-r.fromAngle)*.5));
  prepared.fold.vertices_coords.forEach((p,v)=>{
    if(-p[2]<=40+1e-6)for(let k=0;k<3;k++)assert.ok(Math.abs(middle[v*3+k]-clip.animation.initialPositions[v*3+k])<1e-7,'both upper portions retain their stationary pose on the ordinary path');
    else assert.ok(!pins.has(v),'both lower portions may follow their changed hinges');
  });
});

test('an impossible three-hinge fold remains rejected after neighbouring old hinges are offered to the planner',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture({a:[0,40],b:[50,40]});
  const saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId);
  assert.throws(()=>planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),/闭环|刚性路径|连续平折/);assert.deepEqual(project,saved);
});

test('a one-layer finite precrease ending at an old fold is not passed by stretching its complete lower layer',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture({a:[0,40],b:[50,40]},'precrease');
  const clip=buildDiagramStepAnimation(project,stepId);
  assert.throws(()=>planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),/刚性路径|闭环|连续平折/);
});

test('clip colors follow the current main drawing even when an archived flat pose supplies geometry',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),step=project.steps[0],flat=structuredClone(step.pose!),pulled=structuredClone(flat);
  flat.view!.colors=defaultModelColors();pulled.view!.colors={front:'#AD0E11',back:'#123FEA',line:'#222222'};
  pulled.result.geometry.vertices[2][0]+=5;step.paperStates={active:'pulled',flat,pulled};step.pose=pulled;
  const clip=buildDiagramStepAnimation(project,stepId);assert.deepEqual(clip.colors,pulled.view!.colors);
  clip.colors.front='#000000';assert.equal(step.pose.view!.colors!.front,'#AD0E11');
});

test('the single-layer fixture roundtrips through UI CP normalization without making its pose stale',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),restored=importDiagramProject(exportDiagramProject(project)),cleaned=normalizeDiagramProjectCP(restored);
  assert.deepEqual(cleaned.changedStateIds,[]);assert.equal(cleaned.changed,false);
  assert.equal(cleaned.project.states[0].revision,cleaned.project.steps[0].pose!.sourceRevision);
  assert.ok(buildDiagramStepAnimation(cleaned.project,stepId).animation.initialPositions.length);
});
