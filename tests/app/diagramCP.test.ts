import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {buildFold} from '../../src/core/geometry';
import {resolveStartingFace,setStartingFace} from '../../src/app/flatFoldSettings';
import {defaultAngle,type Assignment,type Doc,type Point,type Segment} from '../../src/core/types';
import {normalizeDiagramCP,normalizeDiagramProjectCP} from '../../src/app/diagramCP';
import {adoptDiagramPose,createDiagramProject,validateDiagramProject} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {materialSlitFixture} from '../fixtures/materialModel';

const s=(id:string,a:Point,b:Point,assignment:Assignment='M',angle:number|null=defaultAngle(assignment)):Segment=>({id,a,b,assignment,angle});
const doc=(...segments:Segment[]):Doc=>({name:'CP 自动清理',paper:{width:100,height:100},segments});
function ids(){let index=0;return ()=>`clean-${++index}`;}

test('close endpoints become one exact point, preserving boundary coordinates and source Doc',()=>{
  const source=doc(s('paper',[0,0],[100,0],'B'),s('a',[50,.0000004],[50,50]),s('b',[50,50.0000005],[50,100]));
  const before=structuredClone(source),result=normalizeDiagramCP(source);
  assert.equal(result.changed,true);assert.equal(result.snappedEndpoints,2);assert.equal(result.mergedVertices,1);
  assert.deepEqual(result.doc.segments.find(segment=>segment.assignment==='M')!.a,[50,0]);
  assert.deepEqual(result.doc.segments.find(segment=>segment.assignment==='M')!.b,[50,100]);
  assert.ok(result.doc.segments.filter(segment=>segment.assignment==='B').every(segment=>segment.a[1]===0&&segment.b[1]===0));
  assert.deepEqual(source,before);
});

test('an exact endpoint shared with the boundary cannot move towards a nearby crease',()=>{
  const source=doc(s('paper',[0,0],[100,0],'B'),s('attached',[0,0],[20,20]),s('nearby',[-10,-.0000004],[10,-.0000004],'V'));
  const result=normalizeDiagramCP(source),paper=result.doc.segments.filter(segment=>segment.assignment==='B');
  assert.ok(paper.every(segment=>segment.a[1]===0&&segment.b[1]===0));
  assert.equal(Math.min(...paper.flatMap(segment=>[segment.a[0],segment.b[0]])),0);
  assert.equal(Math.max(...paper.flatMap(segment=>[segment.a[0],segment.b[0]])),100);
  assert.deepEqual(result.doc.segments.find(segment=>segment.id==='attached')!.a,[0,0]);
});

test('partial identical overlaps are split, deduplicated and merged without losing crease assignment',()=>{
  const source=doc(s('long',[0,20],[100,20],'V'),s('short',[75,20],[25,20],'V'));
  const result=normalizeDiagramCP(source);
  assert.equal(result.splitSegments,2);assert.equal(result.removedSegments,1);assert.equal(result.mergedVertices,2);
  assert.deepEqual(result.doc.segments,[s('long',[0,20],[100,20],'V')]);
  const again=normalizeDiagramCP(result.doc);assert.equal(again.changed,false);assert.equal(again.doc,result.doc);
});

test('crossings and T joins remain real nodes while unrelated collinear subdivisions merge',()=>{
  const source=doc(s('horizontal',[0,20],[100,20]),s('branch',[50,20],[50,90],'V'),s('one',[0,50],[10,50]),s('two',[10,50],[20,50]));
  const result=normalizeDiagramCP(source);
  assert.equal(result.mergedVertices,1);assert.equal(result.doc.segments.filter(segment=>[segment.a,segment.b].some(point=>point[0]===50&&point[1]===20)).length,3);
  const crossing=normalizeDiagramCP(doc(s('horizontal',[0,50],[100,50]),s('vertical',[50,0],[50,100],'V')));
  assert.equal(crossing.doc.segments.length,4);assert.equal(crossing.mergedVertices,0);
});

test('automatic cleanup preserves mountain, valley, boundary and target-angle conflicts',()=>{
  const source=doc(s('m',[0,0],[100,0]),s('v',[0,0],[100,0],'V'),s('b',[0,0],[100,0],'B'),s('null',[0,0],[100,0],'M',null),s('ninety',[0,0],[100,0],'M',-90),s('repeat',[100,0],[0,0]));
  const result=normalizeDiagramCP(source);
  assert.equal(result.removedSegments,1);assert.equal(result.conflicts,1);assert.equal(result.doc.segments.length,5);
  assert.deepEqual(result.doc.segments.map(segment=>[segment.assignment,segment.angle]),[['M',-180],['V',180],['B',0],['M',null],['M',-90]]);
  assert.match(result.warnings[0],/不会改变山谷/);
});

test('auxiliary lines, display colours and document metadata keep their original meaning',()=>{
  const source={...doc({...s('a',[0,20],[50,20]),displayColor:'#112233'},{...s('b',[50,20],[100,20]),displayColor:'#445566'},s('aux-a',[0,80],[50,80],'A'),s('aux-b',[50,80],[100,80],'A')),
    schemaVersion:2 as const,metadata:{author:'纸艺',paperShape:{vertices:[[0,0],[100,0],[100,100],[0,100]]}},
    objects:[{id:'caption',kind:'text' as const,color:'#123456',position:[20,20] as Point,fontSize:8,text:'来源说明'}],
    flatFold:{startingFace:[[0,0],[100,0],[100,100],[0,100]] as Point[]}};
  source.segments.push({...source.segments[0],id:'repeat'});
  const before=structuredClone(source),result=normalizeDiagramCP(source);
  assert.equal(result.removedSegments,1);assert.equal(result.mergedVertices,0);
  assert.deepEqual(result.doc.metadata,source.metadata);assert.deepEqual(result.doc.objects,source.objects);assert.deepEqual(result.doc.flatFold,source.flatFold);
  assert.notEqual(result.doc.metadata,source.metadata);assert.notEqual(result.doc.objects,source.objects);assert.deepEqual(source,before);
});

test('zero-length duplicates disappear and generated split IDs never collide with drawing objects',()=>{
  const source={...doc(s('main',[0,50],[100,50]),s('stub',[50,50],[50,100],'V'),s('zero',[10,10],[10,10])),objects:[{id:'main::split:2',kind:'mark' as const,a:[0,0] as Point,b:[1,1] as Point,color:'#112233'}]};
  const result=normalizeDiagramCP(source);assert.equal(result.removedSegments,1);assert.equal(result.doc.segments.length,3);
  assert.ok(result.doc.segments.some(segment=>segment.id==='main::split:2:2'));assert.deepEqual(result.doc.objects,source.objects);
});

test('independent material cut banks keep coincident edges and indexed identities unchanged',()=>{
  const fixture=materialSlitFixture(),source=setStartingFace(fixture.source,2),banks=fixture.banks,before=structuredClone(source),result=normalizeDiagramCP(source);
  assert.equal(result.doc,source);assert.equal(result.changed,false);assert.equal(result.materialPreserved,true);assert.equal(result.removedSegments,0);
  const material=inspectMaterialTopology(result.doc);assert.equal(material.ok,true);
  if(material.ok){assert.deepEqual(material.graph.edges_vertices[banks[0]],material.graph.edges_vertices[banks[1]]);assert.notDeepEqual(material.graph.edges_faces![banks[0]],material.graph.edges_faces![banks[1]]);}
  assert.deepEqual(source,before);
});

test('cleaning a collinear middle crease retains the verified right-hand starting face',()=>{
  const source=blankDoc('保留右面',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  const selected=setStartingFace(source,1),before=structuredClone(selected),result=normalizeDiagramCP(selected);
  assert.deepEqual(resolveStartingFace(selected,buildFold(selected).graph),{face:1,stale:false});
  assert.equal(result.mergedVertices,1);assert.deepEqual(resolveStartingFace(result.doc,buildFold(result.doc).graph),{face:1,stale:false});
  assert.equal(result.doc.flatFold!.startingFace.length,4);assert.deepEqual(selected,before);
  assert.equal(normalizeDiagramCP(result.doc).doc,result.doc);
});

test('the same selected face remains valid when cleanup moves a contour corner within epsilon',()=>{
  const source=blankDoc('微小坐标差',100,100);
  source.segments[1].a=[100.0000004,0];source.segments[1].b=[100.0000004,100];
  source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  const selected=setStartingFace(source,1);assert.ok(selected.flatFold!.startingFace.some(point=>point[0]===100.0000004&&point[1]===100));
  const result=normalizeDiagramCP(selected);
  assert.deepEqual(resolveStartingFace(result.doc,buildFold(result.doc).graph),{face:1,stale:false});
  assert.ok(result.doc.flatFold!.startingFace.some(point=>point[0]===100&&point[1]===100));
});

test('a selected face split by a new crease is retained as stale instead of choosing one descendant',()=>{
  const source=blankDoc('不能猜分面',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  const selected=setStartingFace(source,1);selected.segments.push(s('split',[50,25],[100,25],'V'));
  assert.equal(resolveStartingFace(selected,buildFold(selected).graph).stale,true);
  const setting=structuredClone(selected.flatFold),result=normalizeDiagramCP(selected);
  assert.deepEqual(result.doc.flatFold,setting);assert.equal(resolveStartingFace(result.doc,buildFold(result.doc).graph).stale,true);
});

test('an unverifiable original CP cannot authorize a new starting-face selection',()=>{
  const source=blankDoc('来源冲突',100,100);source.segments.push(s('mountain',[50,0],[50,100]));
  const selected=setStartingFace(source,1);selected.segments.push(s('valley',[50,0],[50,100],'V'),s('duplicate',[50,0],[50,100]));
  assert.throws(()=>buildFold(selected),/冲突/);
  const result=normalizeDiagramCP(selected);assert.equal(result.removedSegments,1);assert.deepEqual(result.doc.flatFold,selected.flatFold);
});

test('malformed material topology and invalid documents reject before cleanup',()=>{
  const malformed={...doc(s('a',[0,0],[100,0])),metadata:{materialTopology:{schema:'unknown'}}};
  assert.throws(()=>normalizeDiagramCP(malformed),/材料拓扑无效/);
  const invalid=doc(s('a',[0,0],[100,0]));invalid.paper.width=Infinity;
  assert.throws(()=>normalizeDiagramCP(invalid));
});

test('explicit restoration cleanup advances changed revisions and retains old pose sources intact',()=>{
  const source=blankDoc('恢复清理',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]),s('repeat',[50,100],[50,50]));
  const project=createDiagramProject(source,ids()),fold=computeFlatFold(source);assert.equal(fold.geometry.status,'ready');
  const posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,fold),before=structuredClone(posed),result=normalizeDiagramProjectCP(posed);
  assert.equal(result.changed,true);assert.deepEqual(result.changedStateIds,posed.states.map(state=>state.id));
  assert.deepEqual(result.project.states.map(state=>state.revision),[1,1]);assert.equal(result.stats.removedSegments,2);assert.equal(result.stats.mergedVertices,2);
  assert.deepEqual(result.project.steps[0].pose,posed.steps[0].pose);assert.equal(result.project.steps[0].pose!.sourceRevision,0);
  assert.deepEqual(result.project.steps[0].pose!.sourceDoc,source);assert.deepEqual(posed,before);
  assert.doesNotThrow(()=>validateDiagramProject(result.project));
  const again=normalizeDiagramProjectCP(result.project);assert.equal(again.changed,false);assert.equal(again.project,result.project);
});

test('restoration cleanup fails atomically at exhausted revisions',()=>{
  const source=doc(s('one',[0,10],[10,10]),s('two',[10,10],[20,10])),project=createDiagramProject(source,ids());
  project.states[1].revision=Number.MAX_SAFE_INTEGER;const before=structuredClone(project);
  assert.throws(()=>normalizeDiagramProjectCP(project),/修订号/);assert.deepEqual(project,before);
});

test('identical restored CP states keep separate normalized documents and all drawing metadata',()=>{
  const source=blankDoc('重复 CP',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  source.metadata={author:'原作者',nested:{note:'逐状态保留'}};source.objects=[{id:'text',kind:'text',position:[5,8],fontSize:6,text:'说明',color:'#112233'}];
  const project=createDiagramProject(source,ids()),before=structuredClone(project),cleaned=normalizeDiagramProjectCP(project);
  assert.equal(cleaned.changed,true);assert.deepEqual(cleaned.changedStateIds,project.states.map(state=>state.id));
  assert.notEqual(cleaned.project.states[0].doc,cleaned.project.states[1].doc);
  assert.notEqual(cleaned.project.states[0].doc.metadata,cleaned.project.states[1].doc.metadata);
  assert.notEqual(cleaned.project.states[0].doc.objects,cleaned.project.states[1].doc.objects);
  for(const state of cleaned.project.states)assert.deepEqual(state.doc,normalizeDiagramCP(source).doc);
  cleaned.project.states[0].doc.metadata!.nested={note:'仅改第一状态'};
  assert.deepEqual(cleaned.project.states[1].doc.metadata,source.metadata);assert.deepEqual(project,before);
});

test('normalization reuse distinguishes complete IDs, paper, angles, display, objects, background and metadata',()=>{
  const source=blankDoc('属性完整匹配',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  const variants:Doc[]=[];
  const change=(edit:(doc:Doc)=>void)=>{const next=structuredClone(source);edit(next);variants.push(next);};
  change(doc=>{doc.name='不同名称';});change(doc=>{doc.paper.width=120;});change(doc=>{doc.segments[4].id='不同来源编号';});
  change(doc=>{doc.segments[4].angle=-90;});change(doc=>{doc.segments[4].displayColor='#234567';});
  change(doc=>{doc.metadata={author:'不同作者',custom:{retained:5}};});
  change(doc=>{doc.metadata={author:undefined};});change(doc=>{doc.metadata={};});
  change(doc=>{doc.objects=[{id:'circle',kind:'circle',center:[5,8],radius:2,color:'#123456'}];});
  change(doc=>{doc.flatFold=setStartingFace(doc,1).flatFold;});
  change(doc=>{doc.background={name:'参考图.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=',width:1,height:1,opacity:.5,visible:true,placement:{origin:[0,0],axis:[1,0]}};});
  const project=createDiagramProject(source,ids());
  for(const variant of variants){project.states[1].doc=variant;const cleaned=normalizeDiagramProjectCP(project);assert.deepEqual(cleaned.project.states[1].doc,normalizeDiagramCP(variant).doc);}
});

test('equal JSON keys do not drop own undefined extension fields during reuse',()=>{
  const source=blankDoc('非持久字段区别',100,100);source.segments.push(s('one',[50,0],[50,50]),s('two',[50,50],[50,100]));
  source.metadata={author:undefined};const other=structuredClone(source);other.metadata={};assert.equal(JSON.stringify(source),JSON.stringify(other));
  const project=createDiagramProject(source,ids());project.states[1].doc=other;
  const cleaned=normalizeDiagramProjectCP(project);
  assert.equal(Object.hasOwn(cleaned.project.states[0].doc.metadata!,'author'),true);
  assert.equal(Object.hasOwn(cleaned.project.states[1].doc.metadata!,'author'),false);
});

test('reused unchanged material states retain each source bank and starting-face identity',()=>{
  const fixture=materialSlitFixture(),source=setStartingFace(fixture.source,2),project=createDiagramProject(source,ids());
  const second=structuredClone(project.states[0].doc);project.states[1].doc=second;
  const cleaned=normalizeDiagramProjectCP(project);assert.equal(cleaned.changed,false);assert.equal(cleaned.project,project);
  assert.equal(cleaned.project.states[0].doc,project.states[0].doc);assert.equal(cleaned.project.states[1].doc,second);
  assert.equal(cleaned.stats.materialStates,2);assert.deepEqual(cleaned.project.states[1].doc.flatFold,source.flatFold);
});
