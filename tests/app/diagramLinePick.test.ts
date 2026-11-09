import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold} from '../../src/core/geometry';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {diagramPresentation} from '../../src/app/diagramDrawing';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {pickTopDiagramAnnotation,topDiagramFaceAtPoint,diagramPickedSelection,selectedDiagramLineRange,diagramDeleteBoxIds} from '../../src/app/diagramLinePick';
import {diagramCreaseCPEdges} from '../../src/app/diagramCreaseSelection';
import {applyDiagramFoldSegments,mapDiagramFoldLines,projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramPose,DiagramCPState} from '../../src/app/diagramProject';
import type {Point} from '../../src/core/types';

const line=(id='all',extra:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id,kind:'line',a:[0,40],b:[50,40],style:'valley',width:.7,color:'#293d35',foldFaces:[0,1],...extra});
const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
function fixture(){
  const doc=blankDoc('点选重合纸层',100,100);doc.segments.push({id:'old',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  result.layers={...result.layers,status:'solved',faceOrder:[0,1]};
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result,view:defaultModelView()};
  return {doc,pose};
}
function unequalCoverage(pose:DiagramPose){
  const graph=buildDiagramFold(pose.sourceDoc).graph;
  graph.vertices_coords.forEach(([x],i)=>{if(x===100)pose.result.geometry.vertices[i][0]=25;});
  return pose;
}

test('a merged all-layer drawing is picked on one top material face without altering its stored range',()=>{
  const {pose}=fixture(),drawing=line(),snapshot=structuredClone({pose,drawing});
  const pick=pickTopDiagramAnnotation([drawing],[25,40],1,pose,undefined,true)!;
  assert.equal(pick.annotation,drawing);assert.equal(pick.face,1);
  const selected=diagramPickedSelection([],{},pick);
  assert.deepEqual(selected,{ids:['all'],lineFaces:{all:[1]}});
  assert.deepEqual(selectedDiagramLineRange(drawing,selected.lineFaces).foldFaces,[1]);
  assert.deepEqual({pose,drawing},snapshot);
});

test('last-added lower lines cannot intercept a visible upper crease, and a covered lower-only line is not selectable',()=>{
  const {pose}=fixture(),upper=line('upper',{foldFaces:[1]}),lower=line('lower',{foldFaces:[0]});
  assert.equal(pickTopDiagramAnnotation([upper,lower],[25,40],1,pose)?.annotation.id,'upper');
  assert.equal(pickTopDiagramAnnotation([lower],[25,40],1,pose),null);
});

test('the same long merged line resolves different top faces at different local click positions',()=>{
  const {pose}=fixture();unequalCoverage(pose);const drawing=line();
  assert.equal(topDiagramFaceAtPoint(pose,[10,40]),0);assert.equal(topDiagramFaceAtPoint(pose,[40,40]),1);
  assert.equal(pickTopDiagramAnnotation([drawing],[10,40],1,pose)?.face,0);
  assert.equal(pickTopDiagramAnnotation([drawing],[40,40],1,pose)?.face,1);
});

test('hidden upper layers reveal the lower selection while all hidden paper lines remain unselectable',()=>{
  const {pose}=fixture(),drawing=line();pose.hiddenFaces=[1];
  assert.equal(pickTopDiagramAnnotation([drawing],[25,40],1,pose)?.face,0);
  pose.hiddenFaces=[0,1];assert.equal(pickTopDiagramAnnotation([drawing],[25,40],1,pose),null);
});

test('back-side and model rotation picks agree with the visible paper paint order',()=>{
  const {pose}=fixture(),view={...defaultModelView(),side:'back' as const,rotation:37},projection=modelProjection(pose.result.geometry.vertices,true,37);
  const drawing=line('turned',{a:projection.project([0,40]),b:projection.project([50,40])});
  const point=projection.project([25,40]);
  assert.equal(topDiagramFaceAtPoint(pose,point,view),diagramPresentation(pose,view).visibleOrder.at(-1));
  assert.equal(pickTopDiagramAnnotation([drawing],point,1,pose,view)?.face,0);
});

test('a background occurrence stays below paper and carries an explicitly empty CP material selection',()=>{
  const {pose}=fixture(),bottom=line('background',{foldFaces:[]}),long=line('long',{a:[-20,40],b:[50,40]});
  assert.equal(pickTopDiagramAnnotation([bottom],[25,40],1,pose),null);
  const pick=pickTopDiagramAnnotation([long],[-10,40],1,pose,undefined,true)!;
  assert.equal(pick.face,null);assert.deepEqual(diagramPickedSelection([],{},pick).lineFaces,{long:[]});
});

test('independent symbols keep precedence over paper fold previews while independent drawings retain their own paint order',()=>{
  const {pose}=fixture(),symbol:DiagramSymbolAnnotation={id:'symbol',kind:'symbol',symbol:'paperBack',position:[25,40],size:20,rotation:0,color:'#293d35',width:.7};
  assert.equal(pickTopDiagramAnnotation([symbol,line()],[25,40],1,pose,undefined,true)?.annotation.id,'symbol');
  const artwork=line('artwork',{foldFaces:undefined,style:'auxiliary'});
  assert.equal(pickTopDiagramAnnotation([symbol,artwork],[25,40],1,pose,undefined,true)?.annotation.id,'artwork');
});

test('Shift can select two occurrences of one merged ID and subsequently toggle one occurrence without losing the other',()=>{
  const drawing=line(),first=diagramPickedSelection([],{}, {annotation:drawing,face:1});
  const both=diagramPickedSelection(first.ids,first.lineFaces,{annotation:drawing,face:0},true);
  assert.deepEqual(both,{ids:['all'],lineFaces:{all:[1,0]}});
  const single=diagramPickedSelection(both.ids,both.lineFaces,{annotation:drawing,face:1},true);
  assert.deepEqual(single,{ids:['all'],lineFaces:{all:[0]}});
  assert.deepEqual(diagramPickedSelection(single.ids,single.lineFaces,{annotation:drawing,face:0},true),{ids:[],lineFaces:{}});
  assert.deepEqual(diagramPickedSelection(['other'],{other:[0]},{annotation:drawing,face:1},true),{ids:['other','all'],lineFaces:{other:[0],all:[1]}});
});

test('ordinary picks narrow previous whole-object selections, while explicit whole-object ranges remain available for box selection',()=>{
  const drawing=line(),pick={annotation:drawing,face:1};
  assert.deepEqual(diagramPickedSelection(['all','other'],{},pick),{ids:['all'],lineFaces:{all:[1]}});
  assert.equal(selectedDiagramLineRange(drawing,{}),drawing);
  assert.deepEqual(diagramPickedSelection(['all'],{},pick,true),{ids:['all'],lineFaces:{all:[0]}});
});

test('imported line identifiers that match JavaScript object keys retain safe independent selection ranges',()=>{
  for(const id of ['__proto__','toString','hasOwnProperty']){
    const drawing=line(id),one=diagramPickedSelection([],{}, {annotation:drawing,face:1},true);
    assert.equal(Object.hasOwn(one.lineFaces,id),true);assert.deepEqual(selectedDiagramLineRange(drawing,one.lineFaces).foldFaces,[1]);
    const both=diagramPickedSelection(one.ids,one.lineFaces,{annotation:drawing,face:0},true);
    assert.deepEqual(selectedDiagramLineRange(drawing,both.lineFaces).foldFaces,[1,0]);assert.equal(Object.getPrototypeOf(both.lineFaces),Object.prototype);
  }
});

test('only the clicked material route is highlighted in CP even when the saved operation covers all layers',()=>{
  const {doc,pose}=fixture(),drawing=line(),before:DiagramCPState={id:'before',revision:0,doc};
  const mapped=mapDiagramFoldLines(pose,[drawing],settings,before),after:DiagramCPState={id:'after',revision:0,doc:applyDiagramFoldSegments(doc,mapped.segments)};
  assert.equal(diagramCreaseCPEdges(pose,[drawing],settings,after,before).length,2);
  const pick=pickTopDiagramAnnotation([drawing],[25,40],1,pose)!,range=diagramPickedSelection([],{},pick).lineFaces;
  assert.equal(diagramCreaseCPEdges(pose,[selectedDiagramLineRange(drawing,range)],settings,after,before).length,1);
  assert.deepEqual(drawing.foldFaces,[0,1]);
});

test('a right-drag rectangle deletes all enclosed drawing occurrences but retains immutable inherited CP marks',()=>{
  const {pose}=fixture(),source:DiagramAnnotation[]=[line('all'),line('lower',{foldFaces:[0]}),line('cp-existing:old',{style:'crease'}),line('outside',{a:[80,80],b:[100,80]})];
  const snapshot=structuredClone(source);
  assert.deepEqual(diagramDeleteBoxIds(source,[-1,35],[51,45],pose),['all','lower']);
  assert.deepEqual(source,snapshot);
});

test('delete rectangles honor locked pulled paper, hidden faces and screen rotation without modifying their source objects',()=>{
  const {pose}=fixture(),symbol:DiagramSymbolAnnotation={id:'symbol',kind:'symbol',symbol:'paperBack',position:[25,40],size:20,rotation:0,color:'#293d35',width:.7};
  const source:DiagramAnnotation[]=[line(),symbol];
  assert.deepEqual(diagramDeleteBoxIds(source,[-20,-20],[120,120],pose,true),['symbol']);
  pose.hiddenFaces=[0,1];assert.deepEqual(diagramDeleteBoxIds(source,[-20,-20],[120,120],pose),['symbol']);
  delete pose.hiddenFaces;assert.deepEqual(diagramDeleteBoxIds(source,[-20,-20],[120,120],pose,false,90,[50,50]),['all','symbol']);
});

function outlineFixture(third=false){
  const doc=blankDoc('纸边下的可见折痕',100,100);doc.segments.push({id:'first',a:[30,0],b:[30,100],assignment:'V',angle:180});
  if(third)doc.segments.push({id:'second',a:[70,0],b:[70,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc),pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result},graph=diagramIllustrationMesh(pose).graph,cp=graph.vertices_coords;
  const upper=graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]<=30+1e-6));
  const lower=graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]>=30-1e-6)&&row.some(v=>cp[v][0]>30+1e-6)&&(!third||row.every(v=>cp[v][0]<=70+1e-6)));
  const top=third?graph.faces_vertices!.findIndex(row=>row.every(v=>cp[v][0]>=70-1e-6)):-1;
  pose.displayOrder=third?[lower,upper,top]:[lower,upper];
  pose.result.layers={status:'unknown',message:'保存的图示顺序'};return {doc,pose,upper,lower,top};
}

test('a lower crease visible on an upper outline can be selected in every displayed direction',()=>{
  for(const side of ['front','back'] as const)for(const rotation of [0,37]){
    const {doc,pose,upper,lower}=outlineFixture();pose.view={...defaultModelView(),side,rotation};pose.displayOrder=side==='back'?[upper,lower]:[lower,upper];
    const after=applyDiagramFoldSegments(doc,[{id:'lower-crease',a:[60,10],b:[60,90],assignment:'V',angle:180}]);
    const part=projectDiagramFoldCP(pose,doc,after).preview.find(p=>p.face===lower)!;assert.equal(part.visibility,'visible');
    const lowerLine=line('lower-outline',{a:part.a,b:part.b,style:part.assignment==='M'?'mountain':'valley',foldFaces:[lower]}),point:Point=[(part.a[0]+part.b[0])/2,(part.a[1]+part.b[1])/2];
    assert.equal(topDiagramFaceAtPoint(pose,point),upper);
    assert.deepEqual(pickTopDiagramAnnotation([lowerLine],point,.1,pose),{annotation:lowerLine,face:lower});
    const upperLine={...lowerLine,id:'upper-outline',foldFaces:[upper]};
    assert.equal(pickTopDiagramAnnotation([upperLine,lowerLine],point,.1,pose)?.annotation.id,upperLine.id);
  }
});

test('outline selection still rejects true interior coverage from any higher paper face',()=>{
  for(const third of [false,true]){
    const {doc,pose,lower}=outlineFixture(third),x=third?60:59;
    const after=applyDiagramFoldSegments(doc,[{id:'covered',a:[x,10],b:[x,90],assignment:'V',angle:180}]);
    const part=projectDiagramFoldCP(pose,doc,after).preview.find(p=>p.face===lower)!;assert.equal(part.visibility,'hidden');
    const covered=line('covered',{a:part.a,b:part.b,foldFaces:[lower]}),point:Point=[(part.a[0]+part.b[0])/2,(part.a[1]+part.b[1])/2];
    assert.equal(pickTopDiagramAnnotation([covered],point,.1,pose),null);
  }
  // A shared triangulation edge lies inside paper; it is not a visible outline.
  const {pose}=fixture(),lower=line('under-seam',{a:[0,0],b:[50,100],foldFaces:[0]});
  assert.equal(pickTopDiagramAnnotation([lower],[25,50],.1,pose),null);
});
