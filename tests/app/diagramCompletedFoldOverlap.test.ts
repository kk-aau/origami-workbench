import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,exportDiagramProject,importDiagramProject,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {mapDiagramFoldLines,intersectDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {modelProjection} from '../../src/app/modelProjection';
import {distance} from '../../src/core/geometry';
import type {Doc} from '../../src/core/types';

const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
function projectFor(raw:Doc,config=settings,view=defaultModelView()){
  const doc=normalizeDiagramCP(raw).doc;let i=0;
  let project=createDiagramProject(doc,()=>`completed-overlap-${++i}`);const stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,view);
  project=updateDiagramFoldLink(project,stepId,config);
  return {project,stepId};
}
function fixture(assignment:'M'|'V'='V',angle:number|null=assignment==='V'?180:-180){
  const raw=blankDoc('已折痕重合',100,100);
  raw.segments.push({id:'completed-hinge',a:[50,0],b:[50,100],assignment,angle});
  return projectFor(raw);
}
const line:DiagramLineAnnotation={id:'new-on-old-hinge',kind:'line',a:[50,20],b:[50,80],style:'valley',color:'#314b3c',width:.7};
const length=(s:{a:[number,number];b:[number,number]})=>distance(s.a,s.b);
const sameNumber=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('ordinary drawing skips a completed old hinge instead of mapping its two banks to conflicting M/V',()=>{
  const {project,stepId}=fixture(),snapshot=structuredClone(project),step=project.steps[0];
  const mapped=mapDiagramFoldLines(step.pose!,[line],settings,project.states[0]);
  assert.deepEqual(mapped.segments,[]);
  assert.deepEqual(mapped.preview,[]);
  assert.match(mapped.warnings.at(-1)!,/已完成折叠/);
  const next=reconcileDiagramFoldAnnotations(project,stepId,[line]);
  assert.deepEqual(next.states,project.states);
  assert.deepEqual(next.steps[0].pose,step.pose);
  assert.deepEqual(next.steps[0].foldLink?.generated,[]);
  assert.deepEqual(project,snapshot);
});

test('top and either explicitly selected bank cannot silently reverse a completed fold',()=>{
  for(const assignment of ['M','V'] as const)for(const angle of [assignment==='M'?-180:180,assignment==='M'?-45:45,null]){
    const f=fixture(assignment,angle);
    for(const config of [{...settings,layers:'top' as const},{...settings,layers:'selected' as const,selectedFaces:[0]},{...settings,layers:'selected' as const,selectedFaces:[1]}]){
      const project=updateDiagramFoldLink(f.project,f.stepId,config),snapshot=structuredClone(project);
      for(const style of ['valley','mountain'] as const){
        const next=reconcileDiagramFoldAnnotations(project,f.stepId,[{...line,style}]);
        assert.deepEqual(next.states,project.states);
        assert.deepEqual(next.steps[0].pose,project.steps[0].pose);
        assert.deepEqual(next.steps[0].foldLink?.generated,[]);
        assert.deepEqual(project,snapshot);
      }
    }
  }
});

test('only the completed interval is skipped, while its unclosed continuation generates a new fold',()=>{
  const raw=blankDoc('已折与未折相邻区间',100,100);
  raw.segments.push({id:'completed',a:[50,0],b:[50,40],assignment:'V',angle:180},
    {id:'open',a:[50,40],b:[50,100],assignment:'V',angle:0});
  const config={...settings,layers:'selected' as const,selectedFaces:[0]},f=projectFor(raw,config),snapshot=structuredClone(f.project);
  const mapped=mapDiagramFoldLines(f.project.steps[0].pose!,[line],config,f.project.states[0]);
  assert.equal(mapped.segments.length,1);sameNumber(length(mapped.segments[0]),40);
  assert.ok(mapped.segments.every(s=>Math.min(s.a[1],s.b[1])>=40-1e-6));
  const prior=mapDiagramFoldLines(f.project.steps[0].pose!,[{...line,foldAction:'precrease'}],config,f.project.states[0]);
  const surviving=prior.preview.find(p=>Math.min(p.a[1],p.b[1])>=40-1e-6)!;
  assert.equal(mapped.preview.length,1);assert.deepEqual(mapped.preview[0].strokeSpan,surviving.strokeSpan);
  const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[line]);
  assert.deepEqual(next.states[0],f.project.states[0]);assert.deepEqual(next.steps[0].pose,f.project.steps[0].pose);
  // Normalization may merge the adjacent new, same-property continuation.
  // Compare the actual physical old coverage, rather than an editor split ID.
  const completed=f.project.states[1].doc.segments.find(s=>s.id==='completed')!;
  const retained=intersectDiagramFoldSegments(next.states[1].doc,next.states[1].doc.segments.filter(s=>s.assignment!=='B'),[completed]);
  const properties=({id:_id,...s}:typeof completed)=>s;
  assert.deepEqual(retained.map(properties),[properties(completed)]);
  assert.equal(next.steps[0].foldLink?.generated?.length,1);sameNumber(length(next.steps[0].foldLink!.generated![0]),40);
  assert.deepEqual(f.project,snapshot);
});

test('coincident screen geometry on a third material layer remains an eligible new physical CP crease',()=>{
  const raw=blankDoc('三层同屏不同材料',100,100);
  raw.segments.push({id:'completed-left',a:[30,0],b:[30,100],assignment:'V',angle:180},
    {id:'completed-middle',a:[60,0],b:[60,100],assignment:'M',angle:-180});
  const f=projectFor(raw),stroke={...line,a:[30,20] as [number,number],b:[30,80] as [number,number]},snapshot=structuredClone(f.project);
  const mapped=mapDiagramFoldLines(f.project.steps[0].pose!,[stroke],settings,f.project.states[0]);
  assert.equal(mapped.segments.length,1);sameNumber(mapped.segments[0].a[0],90);sameNumber(mapped.segments[0].b[0],90);
  sameNumber(length(mapped.segments[0]),60);assert.equal(mapped.segments[0].assignment,'V');
  const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
  for(const old of f.project.states[1].doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V')){
    assert.deepEqual(next.states[1].doc.segments.find(s=>s.id===old.id),old);
  }
  assert.deepEqual(next.states[0],f.project.states[0]);assert.deepEqual(next.steps[0].pose,f.project.steps[0].pose);
  assert.deepEqual(f.project,snapshot);
});

test('back views and arbitrary rotations protect the same physical historical hinge',()=>{
  for(const side of ['front','back'] as const)for(const rotation of [0,37,90,180,270]){
    const {project:initial,stepId}=fixture(),raw=initial.states[0].doc,view={...defaultModelView(),side,rotation},f=projectFor(raw,settings,view);
    const pose=f.project.steps[0].pose!,p=modelProjection(pose.result.geometry.vertices,side==='back',rotation),stroke={...line,a:p.project(line.a),b:p.project(line.b)};
    const next=reconcileDiagramFoldAnnotations(f.project,stepId,[stroke]);
    assert.deepEqual(next.states,f.project.states);assert.deepEqual(next.steps[0].pose,pose);
  }
});

test('F and zero-angle M/V routes remain available for an actual new fold',()=>{
  for(const assignment of ['F','M','V'] as const){
    const raw=blankDoc('展开旧折痕',100,100);raw.segments.push({id:'unfolded',a:[50,0],b:[50,100],assignment,angle:0});
    const config={...settings,layers:'selected' as const,selectedFaces:[0]},f=projectFor(raw,config),next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[line]);
    const generated=next.steps[0].foldLink!.generated!;assert.ok(generated.length>0);
    sameNumber(generated.reduce((n,s)=>n+length(s),0),60);
    assert.ok(generated.every(s=>s.assignment==='M'||s.assignment==='V'));
    assert.deepEqual(next.states[0],f.project.states[0]);assert.deepEqual(next.steps[0].pose,f.project.steps[0].pose);
  }
});

test('genuinely incompatible new M/V instructions on the same material still reject atomically',()=>{
  const f=projectFor(blankDoc('新操作互斥',100,100)),snapshot=structuredClone(f.project);
  assert.throws(()=>reconcileDiagramFoldAnnotations(f.project,f.stepId,[line,{...line,id:'opposite',style:'mountain'}]),/冲突/);
  assert.deepEqual(f.project,snapshot);
});

test('explicit old-hinge press-and-return retains its prior semantics without altering the old fold',()=>{
  const f=fixture(),next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[{...line,foldAction:'precrease'}]);
  assert.deepEqual(next.states,f.project.states);assert.deepEqual(next.steps[0].pose,f.project.steps[0].pose);
  assert.deepEqual(next.steps[0].foldLink!.generated,[]);
  const intents=next.steps[0].foldLink!.precreases!;assert.equal(intents.length,1);assert.equal(intents[0].assignment,'V');sameNumber(length(intents[0]),60);
});

test('saving, reopening, moving away and deleting preserve completed physical folds and support immutable undo snapshots',()=>{
  const f=fixture(),original=exportDiagramProject(f.project),overlap=reconcileDiagramFoldAnnotations(f.project,f.stepId,[line]);
  const reopened=importDiagramProject(exportDiagramProject(overlap)),repeated=reconcileDiagramFoldAnnotations(reopened,f.stepId,reopened.steps[0].annotations!);
  assert.deepEqual(repeated.states,reopened.states);assert.deepEqual(repeated.steps[0].pose,reopened.steps[0].pose);
  const movedLine={...line,a:[10,30] as [number,number],b:[40,30] as [number,number]},moved=reconcileDiagramFoldAnnotations(repeated,f.stepId,[movedLine]);
  assert.ok(moved.steps[0].foldLink!.generated!.length>0);
  const old=f.project.states[0].doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V');
  const retained=intersectDiagramFoldSegments(moved.states[1].doc,old,moved.states[1].doc.segments.filter(s=>s.assignment==='V'&&s.angle===180));
  sameNumber(retained.reduce((n,s)=>n+length(s),0),100);
  const returned=reconcileDiagramFoldAnnotations(moved,f.stepId,[line]),deleted=reconcileDiagramFoldAnnotations(returned,f.stepId,[]);
  const undo=importDiagramProject(original),redo=importDiagramProject(exportDiagramProject(returned));
  for(const next of [returned,deleted,undo,redo]){
    assert.deepEqual(next.states[0],f.project.states[0]);
    assert.deepEqual(next.steps[0].pose,reopened.steps[0].pose);
    assert.deepEqual(next.states[1].doc,f.project.states[1].doc);
  }
});
