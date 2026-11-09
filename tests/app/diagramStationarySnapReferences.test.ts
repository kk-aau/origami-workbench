import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {buildDiagramSnapReferences,type DiagramSnapReference} from '../../src/app/diagramSnapReferences';
import {stationaryDiagramSnapReferences,diagramPreviewSourceIds,diagramBackgroundSourceIds,diagramSourcesOnlyMoving} from '../../src/app/diagramStationarySnapReferences';
import {diagramBackgroundLinesForDrawing} from '../../src/app/diagramDrawing';
import {diagramLineIntersections,diagramMoveSnapTargets,snapDiagramTranslation} from '../../src/app/diagramDrawingTools';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import type {Point} from '../../src/core/types';

const view=defaultModelView();
const line=(id:string,a:Point,b:Point,extra:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'auxiliary',color:'#123456',width:.7,...extra});
function fixture(source:DiagramLineAnnotation,annotations:DiagramAnnotation[]=[source]){
  const before=blankDoc('移动参照',100,100),result=computeFlatFold(before);result.layers={status:'solved',message:'test',faceOrder:[0]};
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:before,result,view},after=structuredClone(before);
  after.segments.push({id:'new-fold',a:source.a,b:source.b,assignment:'V',angle:180});
  const preview=projectDiagramFoldCP(pose,before,after).preview.map((part,index)=>({id:'fold-preview-'+index,a:part.a,b:part.b,face:part.face,visibility:part.visibility,existing:part.existing,style:part.style??'valley' as const}));
  return {pose,before,after,preview,annotations};
}

test('a selected linked line moves freely instead of snapping to its own real CP projection or outside pieces',()=>{
  for(const outside of [false,true]){
    const source=line('selected',outside?[-20,50]:[20,50],outside?[120,50]:[80,50],{style:'valley',foldFaces:[0]}),input=fixture(source),saved=structuredClone(input);
    const references=buildDiagramSnapReferences({...input,pose:input.pose,view,foldLinkEnabled:true,foldLinkPreview:input.preview});
    const stored=structuredClone(references),stationary=stationaryDiagramSnapReferences(references,[source.id]);
    assert.ok(references.some(reference=>reference.id.startsWith('snap-preview:')));
    assert.ok(stationary.every(reference=>reference.id.startsWith('model-edge:')));
    if(outside)assert.ok(references.some(reference=>reference.id.startsWith('bg:')));
    const targets=diagramMoveSnapTargets([],[],[],stationary);
    assert.deepEqual(snapDiagramTranslation(source.a,[3,1],{enabled:true,radius:5,targets}),[3,1]);
    assert.deepEqual(references,stored);assert.deepEqual(input,saved);
  }
});

test('removing selected references preserves real paper edges, other lines and their remaining intersections',()=>{
  const source=line('selected',[20,50],[80,50],{style:'valley',foldFaces:[0]}),others=[line('horizontal',[10,70],[90,70]),line('vertical',[60,20],[60,90])],input=fixture(source,[source,...others]);
  const references=buildDiagramSnapReferences({...input,view,foldLinkEnabled:true,foldLinkPreview:input.preview}),stationary=stationaryDiagramSnapReferences(references,[source.id]);
  assert.equal(stationary.filter(reference=>reference.id.startsWith('model-edge:')).length,4);
  assert.ok(stationary.some(reference=>reference.id==='horizontal'));assert.ok(stationary.some(reference=>reference.id==='vertical'));
  const intersections=diagramLineIntersections(stationary);assert.ok(intersections.some(([x,y])=>x===60&&y===70));assert.ok(!intersections.some(([x,y])=>x===60&&y===50));
});

test('coincident independent line contributors remain references until every contributor is moved',()=>{
  const source=line('selected',[20,50],[80,50],{style:'valley',foldFaces:[0]}),other={...source,id:'other',a:source.b,b:source.a},input=fixture(source,[source,other]);
  const references=buildDiagramSnapReferences({...input,view,foldLinkEnabled:true,foldLinkPreview:input.preview}),preview=references.find(reference=>reference.id.startsWith('snap-preview:'))!;
  assert.deepEqual(preview.snapSourceIds,['selected','other']);assert.ok(stationaryDiagramSnapReferences(references,['selected']).includes(preview));
  assert.ok(!stationaryDiagramSnapReferences(references,['selected','other']).includes(preview));
  const direct=buildDiagramSnapReferences({pose:null,view,annotations:[line('a',[1,2],[4,8]),line('b',[4,8],[1,2])]});
  assert.equal(direct.length,1);assert.deepEqual(direct[0].snapSourceIds,['a','b']);assert.equal(stationaryDiagramSnapReferences(direct,['a']).length,1);assert.equal(stationaryDiagramSnapReferences(direct,['a','b']).length,0);
});

test('an annotation coinciding with a physical paper boundary never removes that boundary',()=>{
  const source=line('selected',[0,0],[100,0],{style:'valley',foldFaces:[0]}),input=fixture(source),references=buildDiagramSnapReferences({...input,view,foldLinkEnabled:true,foldLinkPreview:input.preview}),stationary=stationaryDiagramSnapReferences(references,[source.id]);
  assert.equal(references.length,4);assert.equal(stationary.length,4);assert.ok(stationary.every(reference=>reference.snapSourceIds?.length===0));
});

test('preview provenance respects material face and line style instead of removing unrelated coincident routes',()=>{
  const source=line('selected',[20,50],[80,50],{style:'valley',foldFaces:[0]}),input=fixture(source,[source,line('other-face',[20,50],[80,50],{style:'valley',foldFaces:[1]}),line('other-style',[20,50],[80,50],{style:'mountain',foldFaces:[0]})]);
  const references=buildDiagramSnapReferences({...input,view,foldLinkEnabled:true,foldLinkPreview:input.preview}),preview=references.find(reference=>reference.id.startsWith('snap-preview:'))!;
  assert.deepEqual(preview.snapSourceIds,['selected']);assert.ok(!stationaryDiagramSnapReferences(references,['selected']).includes(preview));
});

test('masked fragments retain provenance and legacy original/visible ids remain compatible without source metadata',()=>{
  const source=line('selected',[0,50],[100,50],{foldFaces:[0]}),input=fixture(source),annotations:DiagramAnnotation[]=[source,{id:'tear',kind:'symbol',symbol:'tearWindow',position:[50,50],size:100,rotation:0,color:'#293d35',width:.7,params:{radius:10},cutawayFaces:[0]}];
  const references=buildDiagramSnapReferences({pose:input.pose,view,annotations}),fragments=references.filter(reference=>reference.id.startsWith('selected:visible:'));
  assert.equal(fragments.length,2);assert.ok(fragments.every(reference=>reference.snapSourceIds?.[0]==='selected'));
  assert.ok(stationaryDiagramSnapReferences(references,['selected']).every(reference=>!reference.id.startsWith('selected')));
  const legacy:DiagramSnapReference[]=[source,{...source,id:'selected:visible:0'},{...source,id:'other'}];
  assert.deepEqual(stationaryDiagramSnapReferences(legacy,['selected']).map(reference=>reference.id),['other']);
});

test('raw preview ownership can hide only the moving old artwork even when reference deduplication keeps a physical paper edge',()=>{
  const source=line('selected',[0,0],[100,0],{style:'valley',foldFaces:[0]}),input=fixture(source),saved=structuredClone(input),raw=input.preview[0];assert.ok(raw);
  const references=buildDiagramSnapReferences({...input,view,foldLinkEnabled:true,foldLinkPreview:input.preview});assert.ok(references.every(reference=>reference.id.startsWith('model-edge:')));
  const sourceIds=diagramPreviewSourceIds(raw,input.annotations);assert.deepEqual(sourceIds,['selected']);assert.equal(diagramSourcesOnlyMoving(sourceIds,['selected']),true);
  const independent={...source,id:'stationary'};assert.equal(diagramSourcesOnlyMoving(diagramPreviewSourceIds(raw,[source,independent]),['selected']),false);
  const draft={...source,a:[0,3] as Point,b:[100,3] as Point};assert.deepEqual(diagramPreviewSourceIds(raw,[draft]),[],'the original drag source is required to identify the old artwork');
  assert.equal(diagramSourcesOnlyMoving([],['selected']),false);assert.deepEqual(input,saved);
});

test('raw generated background ownership follows the original line and preserves independently stored or contributed artwork',()=>{
  const source=line('selected',[-20,50],[120,50],{style:'valley',foldFaces:[0]}),input=fixture(source),raw=diagramBackgroundLinesForDrawing(input.pose,input.annotations,true,view);assert.equal(raw.length,2);
  for(const part of raw){
    assert.deepEqual(diagramBackgroundSourceIds(part,[source]),['selected']);assert.equal(diagramSourcesOnlyMoving(diagramBackgroundSourceIds(part,[source]),['selected']),true);
    const independent={...source,id:'stationary'};assert.equal(diagramSourcesOnlyMoving(diagramBackgroundSourceIds(part,[source,independent]),['selected']),false);
    const stored={...part,id:'bg:independent'};assert.equal(diagramSourcesOnlyMoving(diagramBackgroundSourceIds(stored,[source,stored]),['selected']),false);
  }
});
