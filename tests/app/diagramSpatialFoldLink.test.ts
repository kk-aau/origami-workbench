import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Doc,Point} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {createDiagramSpatialPose,spatialFaceMatrix,projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {applyDiagramFoldMatrix,mapDiagramFoldLines,pickDiagramFoldAnchor,diagramFoldStartingFace,alignDiagramFoldResult,retainDiagramPrecreaseIntents} from '../../src/app/diagramFoldLink';
import {isDiagramPaperPoseIsometric} from '../../src/app/diagramPaperState';
import {inheritDiagramFixedAnchor} from '../../src/app/diagramStepInheritance';
import {chooseDiagramPrecreaseAnchor} from '../../src/app/diagramPrecreaseAdvance';
import {modelProjection} from '../../src/app/modelProjection';

const all={enabled:true,layers:'all' as const,selectedFaces:[]};
function fixture(angle=90){const doc=blankDoc('空间折角联动',100,100);doc.segments.push({id:'old-hinge',a:[50,0],b:[50,100],assignment:'V',angle});return spatialPose(doc);}
function spatialPose(doc:Doc,previous?:DiagramPose,camera?:{yaw:number;elevation:number}):DiagramPose{
  const value=createDiagramSpatialPose(doc,0,undefined,previous,camera??{yaw:-25,elevation:40});return {sourceStateId:'before',sourceRevision:0,sourceDoc:structuredClone(doc),...value};
}
function materialFace(pose:DiagramPose,right=false){const graph=buildDiagramFold(pose.sourceDoc).graph;return graph.faces_vertices!.findIndex(face=>face.every(v=>right?graph.vertices_coords[v][0]>=50:graph.vertices_coords[v][0]<=50));}
function shown(pose:DiagramPose,face:number,cp:Point):Point{return modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0).project(applyDiagramFoldMatrix(spatialFaceMatrix(pose.spatial!,face),cp));}
function stroke(pose:DiagramPose,face:number,a:Point,b:Point):DiagramLineAnnotation{return {id:'new',kind:'line',style:'valley',foldAngle:60,a:shown(pose,face,a),b:shown(pose,face,b),width:.7,color:'#123456'};}
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);

test('90-degree material remains isometric despite projection foreshortening and supports accurate new CP strokes',()=>{
  const pose=fixture(),old=structuredClone(pose),face=materialFace(pose,true),a:Point=[60,30],b:Point=[90,30];
  assert(isDiagramPaperPoseIsometric(pose));assert(Math.abs(distance(shown(pose,face,a),shown(pose,face,b))-distance(a,b))>1);
  const mapped=mapDiagramFoldLines(pose,[stroke(pose,face,a,b)],{...all,layers:'selected',selectedFaces:[face]});
  assert(mapped.segments.length>0);close(mapped.segments[0].a,a);close(mapped.segments.at(-1)!.b,b);
  assert(Math.abs(mapped.segments.reduce((n,s)=>n+distance(s.a,s.b),0)-distance(a,b))<1e-5);
  assert(mapped.segments.every(s=>Math.abs(s.a[1]-30)<1e-5&&Math.abs(s.b[1]-30)<1e-5&&Math.abs(s.angle!)===60));assert.deepEqual(pose,old);
});

test('an already measured 90-degree hinge is protected on either bank and under back-side camera rotation',()=>{
  for(const side of ['front','back'] as const){const pose=fixture();pose.view={side,rotation:37};const old=structuredClone(pose);
    for(const face of [materialFace(pose),materialFace(pose,true)]){const mapped=mapDiagramFoldLines(pose,[stroke(pose,face,[50,20],[50,80])],{...all,layers:'selected',selectedFaces:[face]});assert.equal(mapped.segments.length,0);assert(mapped.warnings.some(s=>s.includes('已完成折叠')));}
    assert.deepEqual(pose,old);
  }
});

test('a measured zero-degree MV route remains available for a new operation',()=>{
  const pose=fixture(0),face=materialFace(pose),mapped=mapDiagramFoldLines(pose,[stroke(pose,face,[50,20],[50,80])],{...all,layers:'selected',selectedFaces:[face]});
  assert.equal(mapped.segments.length,1);assert.equal(Math.abs(mapped.segments[0].angle!),60);close(mapped.segments[0].a,[50,20]);close(mapped.segments[0].b,[50,80]);
});

test('screen overlap with a completed hinge does not suppress a different material layer in spatial mode',()=>{
  const doc=blankDoc('空间重合不同材料',100,100);doc.segments.push({id:'left',a:[30,0],b:[30,100],assignment:'V',angle:180},{id:'middle',a:[60,0],b:[60,100],assignment:'M',angle:-180});
  const previous:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result:computeFlatFold(doc,undefined,{flatCreases:'marks'})};assert.equal(previous.result.layers.status,'solved');
  const pose=spatialPose(doc,previous,{yaw:0,elevation:40}),graph=buildDiagramFold(doc).graph,face=graph.faces_vertices!.findIndex(f=>f.every(v=>graph.vertices_coords[v][0]<=30));
  const mapped=mapDiagramFoldLines(pose,[stroke(pose,face,[30,20],[30,80])],all);
  assert.equal(mapped.segments.length,1);close(mapped.segments[0].a,[90,20]);close(mapped.segments[0].b,[90,80]);assert.equal(Math.abs(mapped.segments[0].angle!),60);
});

test('spatial fixed anchors retain the actual world frame, accept camera changes and reject a moving material face',()=>{
  const pose=fixture(),face=materialFace(pose,true),fixed=pickDiagramFoldAnchor(pose,shown(pose,face,[75,25]),face);
  assert.deepEqual(fixed.spatialTransform,pose.spatial!.faceTransforms[face]);close(fixed.point,[75,25]);assert.equal(diagramFoldStartingFace(pose.sourceDoc,fixed),face);
  const next=spatialPose(pose.sourceDoc,pose,{yaw:15,elevation:55});next.sourceStateId='next';
  const inherited=inheritDiagramFixedAnchor(pose,next,fixed);assert(inherited);assert.deepEqual(inherited.spatialTransform,fixed.spatialTransform);assert.notDeepEqual(inherited.matrix,fixed.matrix);
  const changed=structuredClone(pose.sourceDoc);changed.segments.find(s=>s.id==='old-hinge')!.angle=60;assert.equal(inheritDiagramFixedAnchor(pose,spatialPose(changed,pose),fixed),undefined);
  assert.throws(()=>alignDiagramFoldResult(pose.sourceDoc,computeFlatFold(pose.sourceDoc),fixed),/空间固定姿态/);
});

test('automatic precrease anchoring on a spatial pose preserves a real stationary frame',()=>{
  const pose=fixture(),after=structuredClone(pose.sourceDoc);after.segments.push({id:'mark',a:[60,30],b:[90,30],assignment:'F',angle:0});
  const fixed=chooseDiagramPrecreaseAnchor(pose,after);assert(fixed.spatialTransform);assert.doesNotThrow(()=>diagramFoldStartingFace(after,fixed));assert(isDiagramPaperPoseIsometric(pose));
});

test('a partial-angle return intent retains only the same explicit historical angle and never guesses null or a larger excursion',()=>{
  for(const assignment of ['M','V'] as const){
    const before=blankDoc('原角返回',100,100),angle=assignment==='M'?-90:90;
    const old={id:'old',a:[50,0] as Point,b:[50,100] as Point,assignment,angle};before.segments.push(old);
    const intent={...old,id:'return',a:[50,20] as Point,b:[50,80] as Point};
    assert.deepEqual(retainDiagramPrecreaseIntents(before,before,[intent]).map(s=>s.angle),[angle]);
    for(const other of [null,0,angle*2]){
      assert.deepEqual(retainDiagramPrecreaseIntents(before,before,[{...intent,angle:other}]),[]);
      const changed=structuredClone(before);changed.segments.at(-1)!.angle=other;
      assert.deepEqual(retainDiagramPrecreaseIntents(before,changed,[intent]),[]);
      assert.deepEqual(retainDiagramPrecreaseIntents(changed,changed,[intent]),[]);
    }
    const opposite={...intent,assignment:assignment==='M'?'V' as const:'M' as const,angle:-angle};
    assert.deepEqual(retainDiagramPrecreaseIntents(before,before,[opposite]),[]);
    assert.equal(before.segments.at(-1)!.angle,angle);
  }
});

test('side-on projection is still rigid in 3D but cannot supply an ambiguous drawing map',()=>{
  const pose=fixture();pose.spatial!.camera={yaw:0,elevation:0};pose.result.geometry.vertices=pose.spatial!.vertices.map(p=>projectDiagramSpatialPoint(p,pose.spatial!.camera).slice(0,2) as Point);pose.result.geometry.graph!.vertices_coords=structuredClone(pose.result.geometry.vertices);
  assert(isDiagramPaperPoseIsometric(pose));assert.deepEqual(mapDiagramFoldLines(pose,[],all).segments,[]);
  const face=materialFace(pose,true);assert.throws(()=>mapDiagramFoldLines(pose,[stroke(pose,face,[60,30],[90,30])],{...all,layers:'selected',selectedFaces:[face]}),/侧立/);
});

test('tampered spatial geometry and mirrored fixed frames never become accepted rigid material',()=>{
  const pose=fixture(),face=materialFace(pose),fixed=pickDiagramFoldAnchor(pose,shown(pose,face,[25,25]),face);
  fixed.spatialTransform!.rotation[0]*=-1;assert.throws(()=>diagramFoldStartingFace(pose.sourceDoc,fixed),/三维旋转|镜像/);
  pose.spatial!.vertices[0][2]+=10;assert.equal(isDiagramPaperPoseIsometric(pose),false);assert.throws(()=>mapDiagramFoldLines(pose,[],all),/空间姿态|空间纸面/);
});
