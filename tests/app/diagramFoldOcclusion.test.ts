import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import {modelProjection} from '../../src/app/modelProjection';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {diagramPiecesStrictlyCoverPoint,type DiagramOcclusionPiece} from '../../src/app/diagramFoldOcclusion';
import {applyDiagramFoldSegments,mapDiagramFoldLines,projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Point,Segment} from '../../src/core/types';

const piece=(shown:Point[]):DiagramOcclusionPiece=>({shown});
const square=[piece([[0,0],[100,0],[100,100]]),piece([[0,0],[100,100],[0,100]])];
const segment=(a:Point,b:Point,id='new-crease'):Segment=>({id,a,b,assignment:'V',angle:180});

test('triangle seams remain strictly covered while exterior edges and overlapping folds remain boundaries',()=>{
  assert.equal(diagramPiecesStrictlyCoverPoint(square,[50,50],1e-6),true);
  assert.equal(diagramPiecesStrictlyCoverPoint(square,[0,50],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint(square,[0,0],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint(square,[-10,50],1e-6),false);
  const overlapping=[piece([[0,0],[100,0],[50,100]]),piece([[0,0],[100,0],[50,50]])];
  assert.equal(diagramPiecesStrictlyCoverPoint(overlapping,[50,0],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint(overlapping,[50,25],1e-6),true);
});

test('local cell vertices require complete angular coverage and keep narrow valid regions',()=>{
  const corners:Point[]=[[-10,-10],[10,-10],[10,10],[-10,10]],fan=corners.map((p,i)=>piece([[0,0],p,corners[(i+1)%4]]));
  assert.equal(diagramPiecesStrictlyCoverPoint(fan,[0,0],1e-6),true);
  assert.equal(diagramPiecesStrictlyCoverPoint(fan.slice(1),[0,0],1e-6),false);
  const height=4.4e-6,thin=[piece([[0,0],[1000,0],[1000,height]]),piece([[0,0],[1000,height],[0,height]])];
  assert.equal(diagramPiecesStrictlyCoverPoint(thin,[500,height/2],1e-6),true);
  let operations=0;
  assert.throws(()=>diagramPiecesStrictlyCoverPoint(square,[50,50],1e-6,n=>{operations+=n??1;if(operations>3)throw Error('bounded budget');}),/bounded budget/);
});

test('hole borders and paper borders do not hide a crease, but material outside the hole does',()=>{
  const ring:DiagramOcclusionPiece={shown:[[0,0],[100,0],[100,100],[0,100]],shownHoles:[[[25,25],[75,25],[75,75],[25,75]]]};
  assert.equal(diagramPiecesStrictlyCoverPoint([ring],[25,50],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint([ring],[50,50],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint([ring],[0,50],1e-6),false);
  assert.equal(diagramPiecesStrictlyCoverPoint([ring],[10,50],1e-6),true);
});

function fixture(third=false,marks=false){
  const doc=blankDoc('纸边与下层折痕',100,100);
  doc.segments.push(segment([30,0],[30,100],'first-hinge'));
  if(third)doc.segments.push(segment([70,0],[70,100],'second-hinge'));
  if(marks)for(const y of [20,60])doc.segments.push({id:`mark-${y}`,a:[0,y],b:[30,y],assignment:'F',angle:0});
  const result=computeFlatFold(doc,undefined,marks?{flatCreases:'marks'}:{});assert.equal(result.geometry.status,'ready',result.geometry.message);
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:structuredClone(doc),result},mesh=diagramIllustrationMesh(pose),cp=mesh.graph.vertices_coords;
  const upper=mesh.graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]<=30+1e-6));
  const lower=mesh.graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]>=30-1e-6)&&row.some(v=>cp[v][0]>30+1e-6)&&(!third||row.every(v=>cp[v][0]<=70+1e-6)));
  const top=third?mesh.graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]>=70-1e-6)):-1;
  assert.ok(upper>=0&&lower>=0&&(!third||top>=0));
  pose.result.layers={status:'unknown',message:'用保存的图示顺序测试遮挡。'};pose.displayOrder=third?[lower,upper,top]:[lower,upper];
  return {doc,pose,upper,lower,top,cp};
}

test('a lower CP crease is fully visible on an upper outline while a nearby interior crease stays hidden',()=>{
  const {doc,pose,lower}=fixture(),saved=structuredClone(pose),after=applyDiagramFoldSegments(doc,[segment([60,10],[60,90])]);
  const projected=projectDiagramFoldCP(pose,doc,after).preview.filter(p=>p.face===lower);
  assert.ok(projected.length);assert.ok(projected.every(p=>p.visibility==='visible'));assert.ok(Math.abs(projected.reduce((n,p)=>n+distance(p.a,p.b),0)-80)<1e-6);
  const inside=projectDiagramFoldCP(pose,doc,applyDiagramFoldSegments(doc,[segment([59,10],[59,90])])).preview.filter(p=>p.face===lower);
  assert.ok(inside.length);assert.ok(inside.every(p=>p.visibility==='hidden'));assert.deepEqual(pose,saved);
});

test('a third actual interior cover still hides the lower crease behind the coincident middle outline',()=>{
  const {doc,pose,lower}=fixture(true),after=applyDiagramFoldSegments(doc,[segment([60,10],[60,90])]);
  const projected=projectDiagramFoldCP(pose,doc,after).preview.filter(p=>p.face===lower);
  assert.ok(projected.length);assert.ok(projected.every(p=>p.visibility==='hidden'));
});

test('new top-layer strokes skip coincident paper edges without leaking onto the lower layer',()=>{
  const {pose,upper,lower}=fixture(),source=structuredClone(pose);
  const mapped=mapDiagramFoldLines(pose,[{id:'top-only',kind:'line',a:[0,10],b:[0,90],style:'valley',color:'#293d35',width:.7}],{enabled:true,layers:'top',selectedFaces:[]});
  assert.deepEqual(mapped.segments,[]);assert.deepEqual(mapped.preview,[]);
  assert.ok(mapped.warnings.some(warning=>warning.includes('已跳过与纸张边界重合')));
  const inside=mapDiagramFoldLines(pose,[{id:'top-inside',kind:'line',a:[1,10],b:[1,90],style:'valley',color:'#293d35',width:.7}],{enabled:true,layers:'top',selectedFaces:[]});
  assert.deepEqual(new Set(inside.preview.map(p=>p.face)),new Set([upper]));assert.ok(!inside.preview.some(p=>p.face===lower));assert.deepEqual(pose,source);
});

test('boundary priority follows back-side and rotated views without changing CP or crease assignment rules',()=>{
  for(const side of ['front','back'] as const)for(const rotation of [0,37,90]){
    const {doc,pose,upper,lower}=fixture();pose.view={side,rotation,xray:false,antiAlias:true,displayNumbers:false,cameras:{}};
    pose.displayOrder=side==='back'?[upper,lower]:[lower,upper];
    const after=applyDiagramFoldSegments(doc,[segment([60,10],[60,90])]),saved=structuredClone(after),parts=projectDiagramFoldCP(pose,doc,after).preview.filter(p=>p.face===lower),camera=modelProjection(pose.result.geometry.vertices,side==='back',rotation);
    assert.ok(parts.length);assert.ok(parts.every(p=>p.visibility==='visible'));assert.ok(parts.every(p=>p.assignment===(side==='back'?'V':'M')));
    const points=parts.flatMap(p=>[p.a,p.b]);for(const target of [[0,10],[0,90]] as Point[])assert.ok(points.some(p=>distance(p,camera.project(target))<1e-6));
    assert.deepEqual(after,saved);
  }
});

function concaveIllustration(){
  const f=fixture(false,true);
  for(const y of [0,100]){const id=f.cp.findIndex(p=>distance(p,[0,y])<1e-6);assert.ok(id>=0);f.pose.result.geometry.vertices[id]=[-10,y];}
  f.pose.result.geometry.modified=true;return f;
}

test('partial outline coincidence is split from actual interior coverage on a local-cell illustration',()=>{
  const {doc,pose,lower}=concaveIllustration(),after=applyDiagramFoldSegments(doc,[segment([60,10],[60,90])]);
  const parts=projectDiagramFoldCP(pose,doc,after).preview.filter(p=>p.face===lower).map(p=>({lo:Math.min(p.a[1],p.b[1]),hi:Math.max(p.a[1],p.b[1]),visibility:p.visibility})).sort((a,b)=>a.lo-b.lo);
  assert.equal(parts.length,3);
  for(const [i,expected] of [[10,20,'hidden'],[20,60,'visible'],[60,90,'hidden']].entries()){
    assert.ok(Math.abs(parts[i].lo-Number(expected[0]))<1e-6);assert.ok(Math.abs(parts[i].hi-Number(expected[1]))<1e-6);assert.equal(parts[i].visibility,expected[2]);
  }
});

test('an upper illustration internal triangulation seam still hides the lower projected crease',()=>{
  const {doc,pose,upper,lower}=concaveIllustration(),mesh=diagramIllustrationMesh(pose),adjacency=new Map<string,{ids:number[];count:number}>();
  mesh.triangles[upper].forEach(t=>t.forEach((a,i)=>{const b=t[(i+1)%3],key=[a,b].sort((a,b)=>a-b).join(','),entry=adjacency.get(key);if(entry)entry.count++;else adjacency.set(key,{ids:[a,b],count:1});}));
  const edge=[...adjacency.values()].find(edge=>edge.count===2)!;assert.ok(edge);
  const [a,b]=edge.ids.map(v=>pose.result.geometry.vertices[v]),along=(t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],source=(p:Point):Point=>[60-p[0],p[1]];
  const after=applyDiagramFoldSegments(doc,[segment(source(along(.2)),source(along(.8)))]),parts=projectDiagramFoldCP(pose,doc,after).preview.filter(p=>p.face===lower);
  assert.ok(parts.length);assert.ok(parts.every(p=>p.visibility==='hidden'));
});
