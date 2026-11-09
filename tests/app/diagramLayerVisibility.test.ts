import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {
  createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,updateDiagramHiddenFaces,
  duplicateDiagramStep,exportDiagramProject,importDiagramProject,validateDiagramProject,
} from '../../src/app/diagramProject';
import {diagramLayerStackOrder} from '../../src/components/diagramLayerStackOrder';

const cssHook=registerHooks({load(url,context,nextLoad){
  return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);
}});
const {default:DiagramLayerStack}=await import('../../src/components/DiagramLayerStack');
cssHook.deregister();

function fixture(){
  const source=blankDoc('纸层显隐',100,100);let index=0;const ids=()=>`visibility-${++index}`;
  source.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180},
    {id:'flat-mark',a:[0,50],b:[100,50],assignment:'F',angle:0});
  const initial=createDiagramProject(source,ids),step=initial.steps[0],result=computeFlatFold(source,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  const project=adoptDiagramPose(initial,step.id,step.beforeId,result);
  return {project,id:step.id,ids};
}
const callbacks={onToggleVisible(){},onShowAll(){},onHideAll(){}};

test('visibility preserves all physical face identities, F subregions, CP states and drawing coordinates',()=>{
  const {project,id}=fixture(),before=structuredClone(project),hidden=[1,0],next=updateDiagramHiddenFaces(project,id,hidden);
  hidden.pop();assert.deepEqual(project,before);assert.deepEqual(next.steps[0].pose!.hiddenFaces,[0,1]);
  assert.deepEqual(next.states,project.states);assert.deepEqual(next.steps[0].pose!.result,project.steps[0].pose!.result);
  assert.deepEqual(next.steps[0].pose!.sourceDoc,project.steps[0].pose!.sourceDoc);
  assert.deepEqual(next.steps[0].pose!.displayOrder,project.steps[0].pose!.displayOrder);
  assert.doesNotThrow(()=>validateDiagramProject(next));
  const visible=updateDiagramHiddenFaces(next,id,[]);assert.deepEqual(visible.steps[0].pose!.hiddenFaces,[]);
  assert.deepEqual(visible.steps[0].pose!.result,project.steps[0].pose!.result);
});

test('hidden layer settings survive file round trips and both flat and pulled modes',()=>{
  const {project,id}=fixture(),previous=project.steps[0].pose!;
  const moved=moveFoldedVertices(previous.result,{group:[0],selected:[0]},[130,-10]);
  let current=recordDiagramPaperPull(updateDiagramPoseResult(project,id,moved),id,previous,[]);
  current=updateDiagramHiddenFaces(current,id,[1]);
  for(const pose of [current.steps[0].pose!,current.steps[0].paperStates!.flat,current.steps[0].paperStates!.pulled])assert.deepEqual(pose.hiddenFaces,[1]);
  const loaded=importDiagramProject(exportDiagramProject(current));
  current=loaded;
  for(const mode of ['flat','pulled','flat'] as const){
    current=switchDiagramPaperState(current,id,mode);assert.deepEqual(current.steps[0].pose!.hiddenFaces,[1]);
    assert.deepEqual(current.states,project.states);assert.equal(current.steps[0].pose!.result.geometry.faces.length,2);
  }
  const shown=updateDiagramHiddenFaces(current,id,[]);
  assert.deepEqual(shown.steps[0].paperStates!.flat.hiddenFaces,[]);assert.deepEqual(shown.steps[0].paperStates!.pulled.hiddenFaces,[]);
  assert.deepEqual(loaded.steps[0].pose!.hiddenFaces,[1]);
});

test('invalid display indexes reject atomically including hidden state in inactive snapshots',()=>{
  const {project,id}=fixture(),before=structuredClone(project);
  for(const bad of [[0,0],[-1],[2],[.1],[NaN],[Infinity],null,Array.from({length:8193},()=>0)]){
    assert.throws(()=>updateDiagramHiddenFaces(project,id,bad as number[]),/隐藏纸面/);
    const saved=JSON.parse(exportDiagramProject(project));saved.steps[0].pose.hiddenFaces=bad;
    assert.throws(()=>importDiagramProject(JSON.stringify(saved)),/隐藏纸面/);
  }
  assert.deepEqual(project,before);assert.throws(()=>updateDiagramHiddenFaces(project,'missing',[]),/不存在/);
  const missing=structuredClone(project);missing.steps[0].pose=null;assert.throws(()=>updateDiagramHiddenFaces(missing,id,[]),/请先/);
  const previous=project.steps[0].pose!,moved=moveFoldedVertices(previous.result,{group:[0],selected:[0]},[130,-10]);
  const pulled=recordDiagramPaperPull(updateDiagramPoseResult(project,id,moved),id,previous,[]);
  pulled.steps[0].paperStates!.flat.hiddenFaces=[99];assert.throws(()=>validateDiagramProject(pulled),/隐藏纸面/);
});

test('duplicated steps retain independently editable visibility and a new calculated pose resets old indexes',()=>{
  const {project,id,ids}=fixture(),hidden=updateDiagramHiddenFaces(project,id,[1]);
  const duplicated=duplicateDiagramStep(hidden,id,ids),copy=duplicated.steps[1],shown=updateDiagramHiddenFaces(duplicated,copy.id,[]);
  assert.deepEqual(shown.steps[0].pose!.hiddenFaces,[1]);assert.deepEqual(shown.steps[1].pose!.hiddenFaces,[]);
  const fresh=adoptDiagramPose(hidden,id,hidden.states[0].id,hidden.steps[0].pose!.result);
  assert.equal(fresh.steps[0].pose!.hiddenFaces,undefined);
});

test('the full sidebar retains every hidden layer and the original certified layer numbers',()=>{
  const {project,id}=fixture(),shownPose=project.steps[0].pose!,pose=updateDiagramHiddenFaces(project,id,[0]).steps[0].pose!;
  const order=diagramLayerStackOrder(shownPose);assert.equal(order.scope,'global');assert.deepEqual(diagramLayerStackOrder(pose),order);
  const html=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...callbacks}));
  assert.deepEqual([...html.matchAll(/data-diagram-stack-row="(\d+)"/g)].map(match=>Number(match[1])),order.faces);
  assert.equal([...html.matchAll(/data-diagram-layer-visibility=/g)].length,2);
  assert.match(html,/data-diagram-layer-visibility="0" aria-label="显示纸面 F1" aria-pressed="false"/);
  assert.match(html,/data-diagram-layer-visibility="1" aria-label="隐藏纸面 F2" aria-pressed="true"/);
  assert.match(html,/显示 1 \/ 2/);assert.match(html,/已隐藏/);assert.match(html,/全部显示/);assert.match(html,/全部隐藏/);
  assert.doesNotMatch(html,/展开查看全部/);assert.doesNotMatch(html,/aria-expanded=/);
});

test('unknown order still shows every face and visibility controls even when every layer is hidden',()=>{
  const {project,id}=fixture(),pose=updateDiagramHiddenFaces(project,id,[0,1]).steps[0].pose!;
  pose.result.layers={status:'unknown',message:'未确认'};
  const html=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...callbacks,onAnalyse(){}}));
  assert.match(html,/data-diagram-layer-stack="unknown"/);assert.match(html,/层序未确认/);
  assert.deepEqual([...html.matchAll(/data-diagram-stack-row="(\d+)"/g)].map(match=>Number(match[1])),[0,1]);
  assert.match(html,/显示 0 \/ 2/);assert.match(html,/重试层序分析/);
  assert.equal([...html.matchAll(/aria-label="显示纸面 F[12]"/g)].length,2);
  assert.match(html,/<button type="button" disabled="">全部隐藏<\/button>/);
});

test('automatic analysis keeps paper controls available and exposes its loading and failure states',()=>{
  const {project}=fixture(),pose=project.steps[0].pose!;
  pose.result.layers={status:'unknown',message:'尚未分析'};
  const loading=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...callbacks,analysing:true,onAnalyse(){}}));
  assert.match(loading,/aria-busy="true" data-layer-analysis="running"/);
  assert.match(loading,/正在自动分析当前纸层，无需切换/);
  assert.match(loading,/<button type="button" disabled="">正在分析…<\/button>/);
  assert.equal([...loading.matchAll(/data-diagram-stack-row=/g)].length,2);
  assert.ok([...loading.matchAll(/<button[^>]*data-diagram-layer-visibility=[^>]*>/g)].every(match=>!match[0].includes('disabled')));
  const failed=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...callbacks,analysisError:'分析线程异常，请重试。',onAnalyse(){}}));
  assert.match(failed,/data-layer-analysis="error"/);assert.match(failed,/分析线程异常，请重试/);
  assert.match(failed,/<button type="button">重试层序分析<\/button>/);
});

test('inactive or busy sidebars disable all visibility mutations while keeping layers listed',()=>{
  const {project}=fixture(),pose=project.steps[0].pose!;
  const html=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...callbacks,disabled:true}));
  const eyes=[...html.matchAll(/<button[^>]*data-diagram-layer-visibility=[^>]*>/g)].map(match=>match[0]);
  assert.equal(eyes.length,2);assert.ok(eyes.every(tag=>tag.includes('disabled=""')));
  assert.equal([...html.matchAll(/data-diagram-stack-row=/g)].length,2);
  assert.match(html,/<button type="button" disabled="">全部显示<\/button>/);
  assert.match(html,/<button type="button" disabled="">全部隐藏<\/button>/);
});
