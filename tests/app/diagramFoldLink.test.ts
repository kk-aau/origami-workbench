import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildFold,distance} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {diagramPresentation} from '../../src/app/diagramDrawing';
import {materialSlitFixture} from '../fixtures/materialModel';
import {mapDiagramFoldLines,diffDiagramFoldCP,subtractDiagramFoldSegments,applyDiagramFoldSegments,projectDiagramFoldCP,pickDiagramFoldAnchor,diagramFoldStartingFace,alignDiagramFoldResult,diagramFoldFacesAtPoint,applyDiagramFoldMatrix,type DiagramFoldLinkSettings} from '../../src/app/diagramFoldLink';

const settings:DiagramFoldLinkSettings={enabled:true,layers:'all',selectedFaces:[]};
const line=(a:Point,b:Point,id='new-fold'):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#314b3c',width:.7});
function poseOf(doc:Doc):DiagramPose {const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);return {sourceStateId:'cp0',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};}
function fixture(x=50){const doc=blankDoc('叠纸联动',100,100);doc.segments.push({id:'old-fold',a:[x,0],b:[x,100],assignment:'V',angle:180});return {doc,pose:poseOf(doc)};}
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
const length=(s:{a:Point;b:Point})=>distance(s.a,s.b);
function segment(a:Point,b:Point,assignment:Segment['assignment']='V',id='s'):Segment{return {id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:assignment==='U'?null:0};}

test('a valley across two overlapping paper layers maps to opposite CP assignments, with real hidden-layer feedback',()=>{
  const {pose}=fixture(),before=structuredClone(pose),mapped=mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings);
  assert.equal(mapped.segments.length,2);assert.deepEqual(new Set(mapped.segments.map(s=>s.assignment)),new Set(['M','V']));
  assert.ok(mapped.segments.every(s=>Math.abs(s.a[1]-30)<1e-6&&Math.abs(s.b[1]-30)<1e-6));assert.ok(mapped.segments.every(s=>Math.abs(length(s)-50)<1e-6));
  assert.deepEqual(new Set(mapped.preview.map(p=>p.visibility)),new Set(['visible','hidden']));assert.ok(mapped.preview.every(p=>p.assignment==='V'));assert.deepEqual(pose,before);
});

test('back-side and model rotation are inverted before mapping, while back-facing CP assignment reverses',()=>{
  const doc=blankDoc('背面映射',100,100),pose=poseOf(doc);pose.view={...defaultModelView(),side:'back',rotation:90};
  const p=modelProjection(pose.result.geometry.vertices,true,90),mapped=mapDiagramFoldLines(pose,[line(p.project([10,30]),p.project([90,30]))],settings);
  assert.equal(mapped.segments.length,1);assert.equal(mapped.segments[0].assignment,'M');close(mapped.segments[0].a,[10,30]);close(mapped.segments[0].b,[90,30]);
});

test('selected paper identity includes its hidden crease, and top mode excludes the hidden layer',()=>{
  const {pose}=fixture(),all=mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings),hidden=all.preview.find(p=>p.visibility==='hidden')!.face;
  const selected=mapDiagramFoldLines(pose,[line([0,30],[50,30])],{...settings,layers:'selected',selectedFaces:[hidden]});
  assert.equal(selected.segments.length,1);assert.ok(selected.preview.every(p=>p.face===hidden&&p.visibility==='hidden'));
  const top=mapDiagramFoldLines(pose,[line([0,30],[50,30])],{...settings,layers:'top'});assert.equal(top.segments.length,1);assert.ok(top.preview.every(p=>p.visibility==='visible'));
  assert.throws(()=>mapDiagramFoldLines(pose,[],{...settings,layers:'selected'}),/先选择/);
});

test('hiding the upper sheet targets the exposed sheet in top mode on either viewing side',()=>{
  for(const side of ['front','back'] as const){
    const {pose}=fixture();pose.view={...defaultModelView(),side};
    const projection=modelProjection(pose.result.geometry.vertices,side==='back',0),stroke=line(projection.project([0,30]),projection.project([50,30]));
    const all=mapDiagramFoldLines(pose,[stroke],settings),top=all.preview.find(p=>p.visibility==='visible')!.face,lower=all.preview.find(p=>p.visibility==='hidden')!.face;
    pose.hiddenFaces=[top];
    const mapped=mapDiagramFoldLines(pose,[stroke],{...settings,layers:'top'});
    assert.deepEqual([...new Set(mapped.preview.map(p=>p.face))],[lower]);
    assert.deepEqual(mapped.segments.map(s=>[s.a,s.b,s.assignment]),mapDiagramFoldLines(pose,[stroke],{...settings,layers:'selected',selectedFaces:[lower]}).segments.map(s=>[s.a,s.b,s.assignment]));
    // Saved explicit ownership must survive visibility changes. Visibility is
    // a picking filter, never a deletion of already-authored physical folds.
    assert.ok(mapDiagramFoldLines(pose,[stroke],{...settings,layers:'selected',selectedFaces:[top]}).segments.length);
    pose.hiddenFaces=[top,lower];assert.equal(mapDiagramFoldLines(pose,[stroke],{...settings,layers:'top'}).segments.length,0);
  }
});

test('line feedback splits exactly at an overlap boundary, rather than marking an entire line hidden',()=>{
  const {pose}=fixture(30),mapped=mapDiagramFoldLines(pose,[line([-40,30],[30,30])],settings);
  assert.ok(mapped.preview.some(p=>p.visibility==='visible'&&Math.abs(length(p)-40)<1e-6));
  assert.ok(mapped.preview.some(p=>p.visibility==='hidden'&&Math.abs(length(p)-30)<1e-6));
  assert.equal(mapped.segments.reduce((n,s)=>n+length(s),0),100);
});

test('uncertified top-layer drawing follows the actual front/back paint order without fabricating solver relationships',()=>{
  for(const side of ['front','back'] as const){
    const {pose}=fixture();pose.result.layers={status:'unknown',message:'尚未认证'};pose.view={...defaultModelView(),side};pose.displayOrder=[1,0];
    const before=structuredClone(pose),top=diagramPresentation(pose).order.at(-1)!;
    const mapped=mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings);assert.deepEqual(new Set(mapped.preview.map(p=>p.visibility)),new Set(['visible','hidden']));
    assert.ok(mapped.preview.every(part=>(part.visibility==='visible')===(part.face===top)));assert.match(mapped.warnings[0],/当前绘图顺序/);
    const selected=mapDiagramFoldLines(pose,[line([0,30],[50,30])],{...settings,layers:'top'});assert.equal(selected.segments.length,1);assert.ok(selected.preview.every(part=>part.face===top&&part.visibility==='visible'));
    assert.equal(diagramFoldFacesAtPoint(pose,[20,20])[0],top);assert.deepEqual(pickDiagramFoldAnchor(pose,[20,20]),pickDiagramFoldAnchor(pose,[20,20],top));
    assert.deepEqual(pose,before);assert.equal(pose.result.layers.status,'unknown');assert.equal(pose.result.layers.faceOrders,undefined);
  }
});

test('only isometry and source identity determine safety, independent of the manual-deformation label',()=>{
  const {doc,pose}=fixture();pose.result.geometry.modified=true;
  assert.doesNotThrow(()=>mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings,{id:'cp0',revision:0,doc}));
  assert.throws(()=>mapDiagramFoldLines(pose,[],settings,{id:'cp0',revision:1,doc}),/来源 CP 已变化/);
  const damaged=structuredClone(pose);damaged.result.geometry.modified=false;damaged.result.geometry.vertices[0][1]+=5;
  assert.throws(()=>mapDiagramFoldLines(damaged,[],settings),/非等距/);
});

test('drawing helpers remain independent, and line clips honor the finite endpoints',()=>{
  const doc=blankDoc('有限折线',100,100),pose=poseOf(doc),annotation=line([-10,40],[25,40]);
  const mapped=mapDiagramFoldLines(pose,[annotation,{...annotation,id:'aux',style:'auxiliary'},{...annotation,id:'crease',style:'crease'}],settings);
  assert.equal(mapped.segments.length,1);close(mapped.segments[0].a,[0,40]);close(mapped.segments[0].b,[25,40]);
});

test('finite clipping over a concave single paper face retains both arms and never draws through the missing area',()=>{
  const points:Point[]=[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]],doc:Doc={schemaVersion:2,name:'凹纸面',paper:{width:100,height:100},segments:points.map((a,i)=>segment(a,points[(i+1)%points.length],'B',`b${i}`))};
  const mapped=mapDiagramFoldLines(poseOf(doc),[line([0,80],[80,0])],settings);
  assert.equal(mapped.segments.length,2);assert.ok(mapped.preview.every(p=>p.visibility==='visible'));
  assert.ok(Math.abs(mapped.segments.reduce((n,s)=>n+length(s),0)-60*Math.SQRT2)<1e-5);
  assert.ok(mapped.segments.every(s=>s.a[0]<=30+1e-6&&s.b[0]<=30+1e-6||s.a[1]<=30+1e-6&&s.b[1]<=30+1e-6));
});

test('malformed layer relations cannot certify an otherwise geometrically valid top layer',()=>{
  const {pose}=fixture();pose.result.layers.faceOrders=[[0,1,0]];
  assert.throws(()=>mapDiagramFoldLines(pose,[line([0,30],[50,30])],{...settings,layers:'top'}),/层序证书无效/);
});

test('CP difference ignores IDs, endpoint reversal, and arbitrary line subdivision',()=>{
  const before=blankDoc('原CP',100,100);before.segments.push(segment([0,40],[100,40]));
  const after=structuredClone(before);after.segments=after.segments.filter(s=>s.id!=='s');after.segments.push(segment([40,40],[0,40],'V','a'),segment([100,40],[40,40],'V','b'));
  assert.deepEqual(diffDiagramFoldCP(before,after),[]);
  after.segments.push(segment([20,60],[80,60],'M','new'));assert.equal(diffDiagramFoldCP(before,after).length,1);
});

test('opening an existing fold to F keeps its M/V identity on each current visible paper face',()=>{
  for(const assignment of ['M','V'] as const){
    const {doc,pose}=fixture();doc.segments.find(s=>s.id==='old-fold')!.assignment=assignment;
    doc.segments.find(s=>s.id==='old-fold')!.angle=assignment==='M'?-180:180;
    const folded=poseOf(doc),after=structuredClone(doc);
    after.segments.find(s=>s.id==='old-fold')!.assignment='F';after.segments.find(s=>s.id==='old-fold')!.angle=0;
    const front=projectDiagramFoldCP(folded,doc,after).preview.filter(part=>part.unfolding);
    assert.ok(front.length>0);assert.ok(front.every(part=>part.assignment==='F'&&part.existing&&['valley','mountain'].includes(part.style!)));
    assert.ok(front.some(part=>part.style===(assignment==='M'?'mountain':'valley')));
    assert.ok(!projectDiagramFoldCP(folded,after,after).preview.some(part=>part.unfolding));
    folded.view={...folded.view,side:'back'};
    const back=projectDiagramFoldCP(folded,doc,after).preview.filter(part=>part.unfolding);
    assert.equal(back.length,front.length);
    assert.deepEqual(back.map(part=>part.style).sort(),front.map(part=>part.style==='valley'?'mountain':'valley').sort());
  }
});

test('unchanged disjoint creases do not exhaust the fold-link budget',()=>{
  const before=blankDoc('大 CP 差分',100,100);
  for(let i=0;i<1600;i++){
    const x=i%40*2.4+1,y=Math.floor(i/40)*2.4+1;
    before.segments.push(segment([x,y],[x+.7,y],'M',`isolated-${i}`));
  }
  const after=structuredClone(before);
  assert.deepEqual(diffDiagramFoldCP(before,after),[]);
  after.segments.at(-1)!.assignment='V';after.segments.at(-1)!.angle=180;
  const changed=diffDiagramFoldCP(before,after);
  assert.equal(changed.length,1);assert.equal(changed[0].id,after.segments.at(-1)!.id);
});

test('geometry difference returns only changed assignment or the uncovered extension',()=>{
  const before=blankDoc('赋型差分',100,100);before.segments.push(segment([20,40],[60,40],'V'));
  const after=structuredClone(before);after.segments.push(segment([0,40],[80,40],'V','extended'));
  const extra=diffDiagramFoldCP(before,after);assert.equal(extra.length,2);assert.deepEqual(extra.map(length),[20,20]);
  after.segments=after.segments.filter(s=>s.assignment!=='V');after.segments.push(segment([20,40],[60,40],'M','s'));const changed=diffDiagramFoldCP(before,after);
  assert.equal(changed.length,1);assert.equal(changed[0].assignment,'M');assert.equal(length(changed[0]),40);
});

test('CP-side additions map onto the previous folded picture with correct displayed valley and occlusion',()=>{
  const {doc,pose}=fixture(),mapping=mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings),after=applyDiagramFoldSegments(doc,mapping.segments);
  const projected=projectDiagramFoldCP(pose,doc,after);
  assert.equal(projected.preview.length,2);assert.ok(projected.preview.every(p=>p.assignment==='V'));
  assert.deepEqual(new Set(projected.preview.map(p=>p.visibility)),new Set(['visible','hidden']));
});

test('a pulled illustration corner carries the CP crease along both source triangles without editing the CP',()=>{
  const doc=blankDoc('纸角造型',100,100),pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]),source=structuredClone(doc),savedAfter=structuredClone(after);
  pose.result.geometry.vertices[2]=[140,120];pose.result.geometry.modified=true;
  const savedPose=structuredClone(pose),projected=projectDiagramFoldCP(pose,doc,after,{id:'cp0',revision:0,doc});
  assert.equal(projected.preview.length,2);assert.ok(projected.preview.every(p=>p.face===0&&p.assignment==='V'&&p.visibility==='visible'));
  const endpoints=projected.preview.flatMap(p=>[p.a,p.b]);
  for(const expected of [[50,0],[70,60],[70,110]] as Point[])assert.ok(endpoints.some(p=>distance(p,expected)<1e-6));
  assert.ok(Math.abs(projected.preview.reduce((sum,p)=>sum+length(p),0)-(Math.hypot(20,60)+50))<1e-6);
  assert.deepEqual(doc,source);assert.deepEqual(after,savedAfter);assert.deepEqual(pose,savedPose);
  assert.throws(()=>mapDiagramFoldLines(pose,[line([50,0],[70,110])],settings),/非等距/);
  assert.throws(()=>pickDiagramFoldAnchor(pose,[20,20],0),/非等距/);
});

test('a uniformly stretched folded illustration projects the original CP creases on every covered paper layer',()=>{
  const {doc,pose}=fixture(),after=applyDiagramFoldSegments(doc,mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings).segments);
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x*1.4+10,y*.8-5]);
  const projected=projectDiagramFoldCP(pose,doc,after),faces=new Set(projected.preview.map(p=>p.face));
  assert.equal(faces.size,2);assert.ok(projected.preview.every(p=>p.assignment==='V'&&Math.abs(p.a[1]-19)<1e-6&&Math.abs(p.b[1]-19)<1e-6));
  for(const face of faces)assert.ok(Math.abs(projected.preview.filter(p=>p.face===face).reduce((sum,p)=>sum+length(p),0)-70)<1e-6);
  assert.deepEqual(new Set(projected.preview.map(p=>p.visibility)),new Set(['visible','hidden']));
});

test('CP projection on a deformed back-facing rotated illustration uses each triangle parity and the current camera',()=>{
  const doc=blankDoc('背面造型',100,100),pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]);
  pose.result.geometry.vertices[2]=[140,120];pose.view={...defaultModelView(),side:'back',rotation:90};
  const camera=modelProjection(pose.result.geometry.vertices,true,90),preview=projectDiagramFoldCP(pose,doc,after).preview;
  assert.ok(preview.every(p=>p.assignment==='M'));const points=preview.flatMap(p=>[p.a,p.b]);
  for(const p of [[50,0],[70,60],[70,110]] as Point[])assert.ok(points.some(q=>distance(q,camera.project(p))<1e-6));
});

test('an orientation-reversed illustration reverses crease assignment, with a back-side view reversing it again',()=>{
  const doc=blankDoc('反射造型',100,100),pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([20,40],[80,40])]);
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[-x*1.5+10,y*.8+5]);
  const front=projectDiagramFoldCP(pose,doc,after).preview;assert.ok(front.length>0&&front.every(p=>p.assignment==='M'));
  assert.ok(front.every(p=>Math.abs(p.a[1]-37)<1e-6&&Math.abs(p.b[1]-37)<1e-6));
  pose.view={...defaultModelView(),side:'back'};const back=projectDiagramFoldCP(pose,doc,after).preview;
  assert.ok(back.length>0&&back.every(p=>p.assignment==='V'));
});

test('a crease along a triangulation seam is displayed once and internal triangulation edges never become CP lines',()=>{
  const doc=blankDoc('三角接缝',100,100),pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([10,10],[90,90])]),beforeAfter=structuredClone(after);
  pose.result.geometry.vertices[2]=[140,120];const preview=projectDiagramFoldCP(pose,doc,after).preview;
  assert.equal(preview.length,1);close(preview[0].a,[14,12]);close(preview[0].b,[126,108]);
  assert.equal(diffDiagramFoldCP(doc,after).length,1);assert.deepEqual(after,beforeAfter);
});

test('safe non-isometric projection of a concave face preserves the missing region and finite crease endpoints',()=>{
  const points:Point[]=[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]],doc:Doc={schemaVersion:2,name:'凹纸面造型',paper:{width:100,height:100},segments:points.map((a,i)=>segment(a,points[(i+1)%points.length],'B',`b${i}`))};
  const pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([0,80],[80,0])]);pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x*1.5,y*.8]);
  const preview=projectDiagramFoldCP(pose,doc,after).preview;
  const paperLength=Math.hypot(1.5,.8)*60;assert.ok(Math.abs(preview.reduce((sum,p)=>sum+length(p),0)-paperLength)<1e-5);
  assert.ok(preview.every(s=>s.a[0]<=45+1e-6&&s.b[0]<=45+1e-6||s.a[1]<=24+1e-6&&s.b[1]<=24+1e-6));
});

test('deformed paper projection rejects self-intersection, flipped source triangles, degeneracy and non-finite points atomically',()=>{
  const doc=blankDoc('造型安全边界',100,100),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]);
  for(const [vertices,expected] of [
    [[[0,0],[100,100],[100,0],[0,60]],/自交/],
    [[[0,0],[10,80],[100,100],[0,100]],/翻折或重叠/],
    [[[0,0],[100,0],[0,0],[0,100]],/退化/],
    [[[0,0],[100,0],[NaN,100],[0,100]],/坐标无效/]
  ] as [Point[],RegExp][]){
    const pose=poseOf(doc);pose.result.geometry.vertices=vertices;const oldPose=structuredClone(pose),oldAfter=structuredClone(after);
    assert.throws(()=>projectDiagramFoldCP(pose,doc,after),expected);assert.deepEqual(pose,oldPose);assert.deepEqual(after,oldAfter);
  }
});

test('pulled-illustration CP projection still refuses stale source identity and mismatched face numbering',()=>{
  const doc=blankDoc('来源检查',100,100),pose=poseOf(doc),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]);pose.result.geometry.vertices[2]=[140,120];
  assert.throws(()=>projectDiagramFoldCP(pose,doc,after,{id:'cp0',revision:1,doc}),/来源 CP 已变化/);
  const subdivided=applyDiagramFoldSegments(doc,[segment([0,50],[100,50])]);
  assert.throws(()=>projectDiagramFoldCP(pose,subdivided,after),/纸面不一致/);
});

test('generated geometry subtraction preserves different hand assignment and both sides of a partially removed crease',()=>{
  const doc=blankDoc('可撤联动',100,100);doc.segments.push(segment([0,40],[100,40],'V'),segment([0,40],[100,40],'M','manual'));
  const next=subtractDiagramFoldSegments(doc,[segment([20,40],[80,40],'V','generated')]);
  assert.equal(next.segments.filter(s=>s.assignment==='M').length,1);assert.deepEqual(next.segments.filter(s=>s.assignment==='V').map(length),[20,20]);
  assert.equal(next.segments.filter(s=>s.assignment==='B').length,4);assert.equal(new Set(next.segments.map(s=>s.id)).size,next.segments.length);
  const full=subtractDiagramFoldSegments(doc,[segment([0,40],[100,40],'M')],false);assert.ok(full.segments.every(s=>s.assignment==='B'));
});

test('applying a new assignment splits and replaces old overlap without duplicate CP conflicts or ID collisions',()=>{
  const doc=blankDoc('重叠赋型',100,100);doc.segments.push(segment([0,40],[100,40],'V','same'));
  const next=applyDiagramFoldSegments(doc,[segment([20,40],[80,40],'M','same')]);
  assert.deepEqual(next.segments.filter(s=>s.assignment==='V').map(length),[20,20]);assert.equal(next.segments.filter(s=>s.assignment==='M').length,1);
  assert.doesNotThrow(()=>buildFold(next));assert.equal(new Set(next.segments.map(s=>s.id)).size,next.segments.length);
  assert.deepEqual(doc.segments.find(s=>s.id==='same')!.a,[0,40]);
});

test('restoring covered U and F routes after a linked reassignment does not turn them into mountains or valleys',()=>{
  for(const kind of ['U','F'] as const){
    const doc=blankDoc('恢复旧赋型',100,100);doc.segments.push(segment([0,40],[100,40],kind,'original'));
    const owned=[segment([20,40],[80,40],'M','linked')],applied=applyDiagramFoldSegments(doc,owned),baseline=subtractDiagramFoldSegments(applied,owned),uncovered=subtractDiagramFoldSegments(doc,owned,false);
    const restored=applyDiagramFoldSegments(baseline,diffDiagramFoldCP(uncovered,doc));
    assert.deepEqual(diffDiagramFoldCP(doc,restored),[]);assert.deepEqual(diffDiagramFoldCP(restored,doc),[]);
    assert.ok(restored.segments.filter(s=>s.assignment!== 'B').every(s=>s.assignment===kind));
  }
  assert.throws(()=>applyDiagramFoldSegments(blankDoc('拒绝材料边',100,100),[segment([10,10],[90,10],'B')]),/纸边与辅助线/);
});

test('fixed CP anchor selects the correct new subface and retains the entire previous stationary face pose',()=>{
  const {doc,pose}=fixture(),anchor=pickDiagramFoldAnchor(pose,[20,10],0),after=applyDiagramFoldSegments(doc,mapDiagramFoldLines(pose,[line([0,30],[50,30])],settings).segments);
  const face=diagramFoldStartingFace(after,anchor),result=computeFlatFold(after,undefined,{startingFace:face}),old=structuredClone(result),aligned=alignDiagramFoldResult(after,result,anchor),graph=buildFold(after).graph;
  for(const v of graph.faces_vertices![face])close(aligned.geometry.vertices[v],applyDiagramFoldMatrix(anchor.matrix,graph.vertices_coords[v]));
  assert.deepEqual(result,old);assert.deepEqual(aligned.geometry.graph!.vertices_coords,aligned.geometry.vertices);
  assert.throws(()=>diagramFoldStartingFace(after,{...anchor,point:[20,30]}),/新折痕或纸面边界/);
});

test('a reflected stationary face preserves its old parity and invalidates old solver layers for reanalysis',()=>{
  const {doc,pose}=fixture(),anchor=pickDiagramFoldAnchor(pose,[20,10],1),face=diagramFoldStartingFace(doc,anchor),result=computeFlatFold(doc,undefined,{startingFace:face});
  result.layers.constraints=[{face,side:'white'}];const aligned=alignDiagramFoldResult(doc,result,anchor),graph=buildFold(doc).graph;
  assert.equal(aligned.layers.status,'unknown');assert.deepEqual(aligned.layers.constraints,result.layers.constraints);assert.equal(aligned.layers.faceOrder,undefined);assert.equal(aligned.layers.faceOrders,undefined);
  for(const v of graph.faces_vertices![face])close(aligned.geometry.vertices[v],applyDiagramFoldMatrix(anchor.matrix,graph.vertices_coords[v]));
});

test('independent material contracts are refused without any mutation',()=>{
  const f=materialSlitFixture(),pose:DiagramPose={sourceStateId:'cp',sourceRevision:0,sourceDoc:f.source,result:f.result},before=structuredClone(pose);
  assert.throws(()=>mapDiagramFoldLines(pose,[line([10,10],[90,90])],settings),/独立材料与切口/);assert.throws(()=>diffDiagramFoldCP(f.source,f.source),/独立材料与切口/);assert.deepEqual(pose,before);
});
