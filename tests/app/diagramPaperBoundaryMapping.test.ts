import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {mapDiagramFoldLines} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';

const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
const line=(a:Point,b:Point,id='paper-edge'):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#314b3c',width:.7});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-6,`${a} != ${b}`);
const length=(s:{a:Point;b:Point})=>distance(s.a,s.b);
const boundaries=(doc:Doc)=>doc.segments.filter(s=>s.assignment==='B');
function projectFor(raw=blankDoc('纸边重合映射',100,100),view=defaultModelView()){
  const doc=normalizeDiagramCP(raw).doc;let counter=0;
  let project=createDiagramProject(doc,()=>`paper-boundary-${++counter}`);const stepId=project.activeStepId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,result,view);
  project=updateDiagramFoldLink(project,stepId,settings);
  return {project,stepId,pose:project.steps[0].pose!,before:project.states[0]};
}
function concavePaper():Doc {
  const points:Point[]=[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]];
  return {schemaVersion:2,name:'部分共线纸边',paper:{width:100,height:100},segments:points.map((a,i)=>({id:`boundary-${i}`,a,b:points[(i+1)%points.length],assignment:'B',angle:0}))};
}
function assertOnlyInterval(parts:{a:Point;b:Point}[],a:Point,b:Point){
  assert.equal(parts.length,1);close(parts[0].a,a);close(parts[0].b,b);
}

test('ordinary and precrease instructions coincident with a paper boundary create no CP geometry, preview or intent',()=>{
  for(const style of ['valley','mountain'] as const)for(const foldAction of ['fold','precrease'] as const){
    const f=projectFor(),snapshot=structuredClone(f.project),stroke={...line([0,0],[100,0]),style,foldAction};
    const mapped=mapDiagramFoldLines(f.pose,[stroke],settings,f.before);
    assert.deepEqual(mapped.segments,[]);assert.deepEqual(mapped.preview,[]);assert.deepEqual(mapped.precreases,[]);
    const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
    assert.deepEqual(next.steps[0].foldLink?.generated,[]);
    assert.deepEqual(next.steps[0].foldLink?.precreases??[],[]);
    assert.deepEqual(next.states,f.project.states);
    assert.deepEqual(boundaries(next.states[1].doc),boundaries(f.before.doc));
    assert.deepEqual(f.project,snapshot);
  }
});

test('paper boundary filtering uses source geometry after back-side and arbitrary camera rotation',()=>{
  for(const side of ['front','back'] as const)for(const rotation of [37,90]){
    const f=projectFor(undefined,{...defaultModelView(),side,rotation}),p=modelProjection(f.pose.result.geometry.vertices,side==='back',rotation);
    const stroke=line(p.project([0,80]),p.project([0,20]));
    const mapped=mapDiagramFoldLines(f.pose,[stroke],settings,f.before);
    assert.deepEqual(mapped.segments,[]);assert.deepEqual(mapped.preview,[]);
    const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
    assert.deepEqual(next.states,f.project.states);
  }
});

test('only the positive-length collinear paper-boundary overlap is removed from a finite instruction',()=>{
  for(const reverse of [false,true]){
    const f=projectFor(concavePaper()),a:Point=reverse?[100,30]:[0,30],b:Point=reverse?[0,30]:[100,30];
    const mapped=mapDiagramFoldLines(f.pose,[line(a,b)],settings,f.before),start:Point=reverse?[30,30]:[0,30],end:Point=reverse?[0,30]:[30,30];
    assertOnlyInterval(mapped.segments,start,end);assertOnlyInterval(mapped.preview,start,end);
    assert.equal(mapped.segments[0].assignment,'V');
    const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[line(a,b)]);
    assertOnlyInterval(next.steps[0].foldLink!.generated!,start,end);
    assert.ok(next.states[1].doc.segments.some(s=>s.assignment==='B'&&length(s)===70&&s.a[1]===30&&s.b[1]===30));
    assert.equal(normalizeDiagramCP(next.states[1].doc).conflicts,0);
    assert.deepEqual(next.states[0],f.before);
  }
});

test('a paper edge on one folded layer cannot suppress the coincident interior crease on another material layer',()=>{
  const raw=blankDoc('同屏纸边与另一层内部',100,100);
  raw.segments.push({id:'completed-hinge',a:[30,0],b:[30,100],assignment:'V',angle:180});
  const f=projectFor(raw),snapshot=structuredClone(f.project),stroke=line([0,10],[0,90]);
  const mapped=mapDiagramFoldLines(f.pose,[stroke],settings,f.before);
  assertOnlyInterval(mapped.segments,[60,10],[60,90]);assert.equal(mapped.segments[0].assignment,'M');
  assertOnlyInterval(mapped.preview,[0,10],[0,90]);assert.equal(mapped.preview[0].assignment,'V');
  const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
  assertOnlyInterval(next.steps[0].foldLink!.generated!,[60,10],[60,90]);
  assert.deepEqual(boundaries(next.states[1].doc),boundaries(f.before.doc));
  assert.deepEqual(next.states[1].doc.segments.find(s=>s.id==='completed-hinge'),f.before.doc.segments.find(s=>s.id==='completed-hinge'));
  assert.deepEqual(f.project,snapshot);
});

test('crossing a paper boundary or touching it only at an endpoint preserves all interior fold coverage',()=>{
  const f=projectFor();
  for(const [stroke,a,b] of [
    [line([-10,40],[110,40],'crosses'),[0,40],[100,40]],
    [line([0,0],[50,50],'corner-endpoint'),[0,0],[50,50]],
  ] as [DiagramLineAnnotation,Point,Point][]){
    const mapped=mapDiagramFoldLines(f.pose,[stroke],settings,f.before);
    assertOnlyInterval(mapped.segments,a,b);assertOnlyInterval(mapped.preview,a,b);
    const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
    assert.equal(normalizeDiagramCP(next.states[1].doc).conflicts,0);
  }
  const tangent=mapDiagramFoldLines(f.pose,[line([-10,10],[10,-10],'outside-touch')],settings,f.before);
  assert.deepEqual(tangent.segments,[]);assert.deepEqual(tangent.preview,[]);
});

test('partial paper-boundary filtering clips precrease F geometry and its directed return intent to the same remaining interval',()=>{
  const f=projectFor(concavePaper()),stroke={...line([100,30],[0,30]),foldAction:'precrease' as const};
  const mapped=mapDiagramFoldLines(f.pose,[stroke],settings,f.before);
  assertOnlyInterval(mapped.segments,[30,30],[0,30]);assertOnlyInterval(mapped.precreases,[30,30],[0,30]);
  assertOnlyInterval(mapped.preview,[30,30],[0,30]);
  assert.equal(mapped.segments[0].assignment,'F');assert.equal(mapped.segments[0].angle,0);
  assert.equal(mapped.precreases[0].assignment,'V');assert.equal(mapped.precreases[0].angle,180);
  const next=reconcileDiagramFoldAnnotations(f.project,f.stepId,[stroke]);
  assertOnlyInterval(next.steps[0].foldLink!.generated!,[30,30],[0,30]);
  assertOnlyInterval(next.steps[0].foldLink!.precreases!,[30,30],[0,30]);
  assert.equal(normalizeDiagramCP(next.states[1].doc).conflicts,0);
  assert.deepEqual(next.states[0],f.before);
});

test('paper-edge drawing filtering does not suppress genuine CP assignment conflicts',()=>{
  const f=projectFor(),valley=line([10,40],[90,40],'valley'),mountain={...valley,id:'mountain',style:'mountain' as const};
  assert.throws(()=>reconcileDiagramFoldAnnotations(f.project,f.stepId,[valley,mountain]),/赋型冲突/);
  const handAuthoredBoundaryFold:Segment={id:'invalid-boundary-fold',a:[0,0],b:[100,0],assignment:'V',angle:180};
  const invalid={...f.before.doc,segments:[...f.before.doc.segments,handAuthoredBoundaryFold]};
  assert.ok(normalizeDiagramCP(invalid).conflicts>0,'manually authored B/V conflicts still require a real correction');
});
