import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {mapDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {diagramCreaseCPEdges} from '../../src/app/diagramCreaseSelection';
import {mapDiagramFoldLines,applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import type {DiagramCPState,DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramFoldLinkSettings} from '../../src/app/diagramFoldLinkTypes';
import type {Doc,Point,Segment} from '../../src/core/types';

const settings:DiagramFoldLinkSettings={enabled:true,layers:'all',selectedFaces:[]};
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:0});
const line=(a:Point,b:Point,extra:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id:'line',kind:'line',a,b,style:'valley',color:'#293d35',width:.7,...extra});
const state=(doc:Doc,id='before'):DiagramCPState=>({id,revision:0,doc});
function poseOf(doc:Doc):DiagramPose {
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready',result.geometry.message);
  return {sourceStateId:'before',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
function stacked(){
  const before=blankDoc('重合纸层',100,100);before.segments.push(segment('old',[50,0],[50,100],'V'));
  const pose=poseOf(before),drawing=line([0,40],[50,40]),mapped=mapDiagramFoldLines(pose,[drawing],settings,state(before));
  const after=applyDiagramFoldSegments(before,mapped.segments);
  return {before,pose,after,drawing:{...drawing,foldFaces:[...new Set(mapped.preview.map(p=>p.face))]}};
}
function horizontalEdges(doc:Doc,y:number):number[]{
  const graph=buildDiagramFold(doc).graph;
  return graph.edges_vertices.flatMap((ids,index)=>ids.every(v=>Math.abs(graph.vertices_coords[v][1]-y)<1e-6)?[index]:[]);
}

test('a folded crease highlights both real source CP routes, with stored material range overriding tool defaults',()=>{
  const {before,pose,after,drawing}=stacked(),source=state(before),afterState=state(after,'after');
  const expected=horizontalEdges(after,40);assert.equal(expected.length,2);assert.equal(drawing.foldFaces.length,2);
  const snapshot=structuredClone({pose,before,after,drawing});
  assert.deepEqual(diagramCreaseCPEdges(pose,[drawing],{...settings,layers:'selected',selectedFaces:[0]},afterState,source),expected);
  assert.deepEqual(diagramCreaseCPEdges(pose,[drawing],settings,source,source),[],'the new route does not yet exist in before CP');
  const single={...drawing,foldFaces:[drawing.foldFaces[0]]};
  const edges=diagramCreaseCPEdges(pose,[single],settings,afterState,source);assert.equal(edges.length,1);
  assert.deepEqual(diagramCreaseCPEdges(pose,[single,{...drawing,id:'second',foldFaces:[drawing.foldFaces[1]]}],settings,afterState,source),expected,'multiple selected drawings share one deduplicated CP edge set');
  assert.equal(diagramCreaseCPEdges(pose,[{...drawing,foldFaces:undefined}],{...settings,layers:'top'},afterState,source).length,1,'legacy unbound lines use the actual current top-paper range');
  assert.deepEqual({pose,before,after,drawing},snapshot);
});

test('precrease F edges and inherited F routes highlight without manufacturing physical faces',()=>{
  const {before,pose,drawing}=stacked(),source=state(before),precrease={...drawing,foldAction:'precrease' as const};
  const mapped=mapDiagramFoldLines(pose,[precrease],settings,source),after=applyDiagramFoldSegments(before,mapped.segments),afterState=state(after,'after');
  assert.equal(buildDiagramFold(after).graph.faces_vertices!.length,2);
  assert.deepEqual(diagramCreaseCPEdges(pose,[precrease],settings,afterState,source),horizontalEdges(after,40));
  const nextPose=poseOf(after),nextState=state(after),graph=buildDiagramFold(after).graph;
  for(const edge of horizontalEdges(after,40)){
    assert.equal(graph.edges_assignment[edge],'F');
    const projected=mapDiagramCPSelection(nextPose,nextState,{kind:'edge',index:edge},nextState);
    const existing=projected.segments.map((part,index)=>line(part.a,part.b,{id:`cp-existing:test:${index}`,style:'crease',foldFaces:[part.face]}));
    assert.deepEqual(diagramCreaseCPEdges(nextPose,existing,settings,nextState,nextState),[edge]);
  }
});

test('all positively overlapping CP atomic pieces highlight, while endpoint-only neighbours remain clear',()=>{
  const doc=blankDoc('原子折线',100,100);doc.segments.push(segment('old',[0,50],[100,50],'F'));
  const pose=poseOf(doc),after=structuredClone(doc);after.segments.push(segment('cross',[25,0],[25,100],'F'));
  const graph=buildDiagramFold(after).graph,expected=horizontalEdges(after,50);assert.equal(expected.length,2);
  assert.deepEqual(diagramCreaseCPEdges(pose,[line([10,50],[40,50],{style:'crease',foldFaces:[0]})],settings,state(after,'after'),state(doc)),expected);
  const selected=diagramCreaseCPEdges(pose,[line([25,50],[40,50],{style:'crease',foldFaces:[0]})],settings,state(after,'after'),state(doc));
  assert.equal(selected.length,1);assert.ok(graph.edges_vertices[selected[0]].some(v=>graph.vertices_coords[v][0]===100));
});

test('background and construction lines do not accidentally select coincident CP geometry',()=>{
  const {before,pose,after,drawing}=stacked(),source=state(before),target=state(after,'after');
  assert.deepEqual(diagramCreaseCPEdges(pose,[{...drawing,foldFaces:[]}],settings,target,source),[]);
  assert.deepEqual(diagramCreaseCPEdges(pose,[{...drawing,style:'auxiliary'}],settings,target,source),[]);
  assert.deepEqual(diagramCreaseCPEdges(pose,[{...drawing,foldFaces:undefined}],{...settings,layers:'selected',selectedFaces:[]},target,source),[]);
});

test('pulled and rotated paper still maps through the original illustration triangles',()=>{
  const doc=blankDoc('扯角后的已有痕',100,100);doc.segments.push(segment('mark',[0,0],[100,100],'F'));
  const pose=poseOf(doc),source=state(doc),graph=buildDiagramFold(doc).graph,vertex=graph.vertices_coords.findIndex(p=>p[0]===100&&p[1]===0);
  pose.result.geometry.vertices[vertex]=[112,8];pose.result.geometry.modified=true;pose.view={...defaultModelView(),side:'back',rotation:37};
  const edge=graph.edges_assignment.findIndex(a=>a==='F'),projected=mapDiagramCPSelection(pose,source,{kind:'edge',index:edge},source);
  const selected=projected.segments.map((p,index)=>line(p.a,p.b,{id:`cp-existing:pulled:${index}`,style:'crease',foldFaces:[p.face]}));
  const snapshot=structuredClone(pose);
  assert.deepEqual(diagramCreaseCPEdges(pose,selected,settings,source,source),[edge]);
  pose.hiddenFaces=[0];assert.deepEqual(diagramCreaseCPEdges(pose,selected,settings,source,source),[edge],'visibility does not renumber the CP');
  delete pose.hiddenFaces;assert.deepEqual(pose,snapshot);
});

test('stale CP identity and invalid or degenerate geometry safely clear highlighting',()=>{
  const {before,pose,after,drawing}=stacked(),source=state(before),target=state(after,'after');
  for(const stale of [{...source,revision:1},{...source,id:'other'},{...source,doc:{...before,name:'changed'}}])assert.deepEqual(diagramCreaseCPEdges(pose,[drawing],settings,target,stale),[]);
  assert.deepEqual(diagramCreaseCPEdges(pose,[{...drawing,foldFaces:[99]}],settings,target,source),[]);
  const missing=structuredClone(pose);missing.result.geometry.vertices.pop();assert.deepEqual(diagramCreaseCPEdges(missing,[drawing],settings,target,source),[]);
  const degenerate=structuredClone(pose);degenerate.result.geometry.vertices=degenerate.result.geometry.vertices.map(()=>[0,0]);assert.deepEqual(diagramCreaseCPEdges(degenerate,[drawing],settings,target,source),[]);
});
