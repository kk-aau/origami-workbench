import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Doc,Point,Segment} from '../../src/core/types';
import {createDiagramProject,adoptDiagramPose,updateDiagramCP,updateDiagramFoldLink,updateDiagramPoseView,updateDiagramAnnotations,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments,mapDiagramFoldLines,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {createDiagramAutoArrow} from '../../src/app/diagramAutoArrow';
import {symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';
import {resolveDiagramArrowBinding} from '../../src/app/diagramPaperBinding';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';

const segment=(id:string,a:Point,b:Point,assignment:'M'|'V'|'F'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
function fixture(doc:Doc=blankDoc('自动箭头',100,100)) {let project=createDiagramProject(doc);const step=project.steps[0];project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc));return {project,id:step.id};}
const close=(a:Point,b:Point)=>assert(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-4,`${a} != ${b}`);

for(const assignment of ['V','M'] as const)test(`${assignment} half fold produces a material-bound editable arrow toward the actual reflected position`,()=>{
  let {project,id}=fixture();const before=project.states[0].doc,pose=project.steps[0].pose!;
  project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(pose,[20,20],0)});
  project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(before,[segment('fold',[50,0],[50,100],assignment)]));
  const saved=structuredClone(project),result=createDiagramAutoArrow(project,id,{id:'automatic',color:'#123456',width:1.2}),baseline=symbolNativeBaseline(result.annotation)!;
  assert.equal(result.action,'fold');assert.equal(result.annotation.symbol,assignment==='V'?'fold':'mountainFold');assert(baseline.start[0]>50);close(baseline.end,[100-baseline.start[0],baseline.start[1]]);
  assert(result.annotation.paperBinding);assert.equal(result.annotation.width,1.2);assert.deepEqual(project,saved);
  project=updateDiagramAnnotations(project,id,[result.annotation]);const loaded=importDiagramProject(exportDiagramProject(project));assert.equal(loaded.steps[0].annotations!.length,1);
  const a=loaded.steps[0].annotations![0];assert.equal(a.kind,'symbol');if(a.kind==='symbol')close(symbolNativeBaseline(resolveDiagramArrowBinding(loaded.steps[0].pose,a).annotation)!.start,baseline.start);
});

test('opposite fixed sides reverse which material moves, and a missing choice reports its fallback',()=>{
  const {project,id}=fixture(),after=applyDiagramFoldSegments(project.states[0].doc,[segment('fold',[50,0],[50,100],'V')]);
  const changed=updateDiagramCP(project,project.steps[0].afterId,after);
  assert(createDiagramAutoArrow(changed,id).warnings.some(w=>w.includes('未指定固定侧')));
  const fixed=updateDiagramFoldLink(changed,id,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(changed.steps[0].pose!,[80,20],0)});
  const baseline=symbolNativeBaseline(createDiagramAutoArrow(fixed,id).annotation)!;assert(baseline.start[0]<50);assert(baseline.end[0]>50);
});

test('diagonal single-axis folding uses actual camera coordinates after back-side rotation',()=>{
  let {project,id}=fixture();project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(project.states[0].doc,[segment('diagonal',[0,0],[100,100],'V')]));
  const first=createDiagramAutoArrow(project,id),baseline=symbolNativeBaseline(first.annotation)!;close(baseline.end,[baseline.start[1],baseline.start[0]]);
  project=updateDiagramPoseView(project,id,{...defaultModelView(),side:'back',rotation:37});const second=createDiagramAutoArrow(project,id),shown=symbolNativeBaseline(second.annotation)!,projection=modelProjection(project.steps[0].pose!.result.geometry.vertices,true,37);
  close(shown.start,projection.project(baseline.start));close(shown.end,projection.project(baseline.end));assert.notEqual(first.annotation.symbol,second.annotation.symbol);
});

test('a second fold of an already folded stack is accepted despite opposite source M/V assignments',()=>{
  const doc=blankDoc('折叠双层',100,100);doc.segments.push(segment('old',[50,0],[50,100],'V'));let {project,id}=fixture(doc);
  const pose=project.steps[0].pose!,mapped=mapDiagramFoldLines(pose,[{id:'new',kind:'line',a:[0,30],b:[50,30],style:'valley',color:'#000000',width:1}],{enabled:true,layers:'all',selectedFaces:[]});
  project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(doc,mapped.segments));const result=createDiagramAutoArrow(project,id),b=symbolNativeBaseline(result.annotation)!;
  close(b.end,[b.start[0],60-b.start[1]]);assert(result.sourceFace>=0);assert.equal(result.action,'fold');
});

test('single-axis precrease shows the outbound excursion instead of a zero-length endpoint arrow',()=>{
  let {project,id}=fixture();const fold=segment('press',[50,0],[50,100],'V');
  project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(project.states[0].doc,[{...fold,assignment:'F',angle:0}]));
  project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[],precreases:[fold]});
  const result=createDiagramAutoArrow(project,id);assert.equal(result.action,'precrease');assert.equal(result.annotation.symbol,'unfold');const b=symbolNativeBaseline(result.annotation)!;close(b.end,[100-b.start[0],b.start[1]]);
});

test('partial folds use the actual projected endpoint instead of pretending every fold is 180 degrees',()=>{
  for(const angle of [30,90,135,-90]){
    let {project,id}=fixture();const pose=project.steps[0].pose!;
    project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(pose,[20,20],0)});
    project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(project.states[0].doc,[{...segment('partial',[50,0],[50,100],angle>0?'V':'M'),angle}]));
    const result=createDiagramAutoArrow(project,id),b=symbolNativeBaseline(result.annotation)!;close(b.end,[50+(b.start[0]-50)*Math.cos(angle*Math.PI/180),b.start[1]]);
    assert.equal(result.annotation.symbol,angle>0?'fold':'mountainFold');
  }
});

test('unfolding points outward from the saved folded material position',()=>{
  const doc=blankDoc('展开',100,100);doc.segments.push(segment('old',[50,0],[50,100],'V'));let {project,id}=fixture(doc);
  project=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(doc,[segment('old',[50,0],[50,100],'F')]));
  const result=createDiagramAutoArrow(project,id),b=symbolNativeBaseline(result.annotation)!;assert.equal(result.action,'unfold');assert.equal(result.annotation.symbol,'pull');assert(Math.abs(b.end[0]-b.start[0])>10);
});

test('no change, multi-axis, stale CP, hidden moving paper and deformed illustrations reject without mutation',()=>{
  const {project,id}=fixture();assert.throws(()=>createDiagramAutoArrow(project,id),/没有实际折叠变化/);
  const doc=applyDiagramFoldSegments(project.states[0].doc,[segment('a',[33,0],[33,100],'V'),segment('b',[66,0],[66,100],'M')]);const multi=updateDiagramCP(project,project.steps[0].afterId,doc);assert.throws(()=>createDiagramAutoArrow(multi,id),/多个折轴/);
  const stale=updateDiagramCP(project,project.steps[0].beforeId,project.states[0].doc);assert.throws(()=>createDiagramAutoArrow(stale,id),/最新的操作前/);
  const hidden=updateDiagramCP(project,project.steps[0].afterId,applyDiagramFoldSegments(project.states[0].doc,[segment('fold',[50,0],[50,100],'V')]));hidden.steps[0].pose!.hiddenFaces=[0];assert.throws(()=>createDiagramAutoArrow(hidden,id),/找不到/);
  const deformed=structuredClone(hidden);deformed.steps[0].pose!.result.geometry.vertices[0][0]+=5;assert.throws(()=>createDiagramAutoArrow(deformed,id),/平整状态/);
});
