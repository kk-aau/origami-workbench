import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import type {FlatFoldResult} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose} from '../../src/app/diagramProject';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramLayerSolutions}=await import('../../src/components/DiagramLayerSolutions');
const {default:DiagramLayerStack}=await import('../../src/components/DiagramLayerStack');
cssHook.deregister();

const result=(layers:Partial<FlatFoldResult['layers']>={}):FlatFoldResult=>({
  geometry:{status:'ready',message:'',vertices:[[0,0],[50,0],[0,50],[50,50]],faces:[[0,1,2],[1,3,2]]},
  layers:{status:'solved',message:'已求解',solutionIndex:0,faceOrder:[0,1],...layers},warnings:[],
});
const render=(props:Partial<Parameters<typeof DiagramLayerSolutions>[0]>={})=>renderToStaticMarkup(createElement(DiagramLayerSolutions,{result:result(),adjustmentMode:true,onAdjust(){},onAdjustmentModeChange(){},...props}));
const actions=(html:string)=>[...html.matchAll(/<button[^>]*data-diagram-layer-adjust="[^"]+"[^>]*>/g)].map(match=>match[0]);
function poseFixture(){
  let next=0;const source=blankDoc('层位调整控件',50,50);
  source.segments.push({id:'fold',a:[25,0],b:[25,50],assignment:'V',angle:180});
  const project=createDiagramProject(source,()=>`solution-${++next}`),step=project.steps[0];
  return adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(source)).steps[0].pose!;
}

test('the default adjustment mode is a compact explicit action without changing paper selection',()=>{
  const html=render({adjustmentMode:false});
  assert.match(html,/data-diagram-layer-adjustment-mode="" aria-pressed="false"/);
  assert.match(html,/>调整层序<\/button>/);assert.match(html,/有效解范围内/);
  assert.equal(actions(html).length,0);assert.doesNotMatch(html,/点击上方叠片|完成调整|纸面 F/);
});

test('opening adjustment mode asks for an independent face before enabling the four moves',()=>{
  const empty=render();assert.match(empty,/点击上方叠片或下方列表选纸面/);
  assert.match(empty,/aria-pressed="true"/);assert.match(empty,/>完成调整<\/button>/);
  assert.equal(actions(empty).length,4);assert.ok(actions(empty).every(tag=>tag.includes('disabled=""')));
  for(const adjustmentFace of [99,-1,.5])assert.ok(actions(render({adjustmentFace})).every(tag=>tag.includes('disabled=""')));
});

test('a selected adjustment face exposes four moves without candidate-number navigation',()=>{
  const html=render({adjustmentFace:1});assert.match(html,/纸面 F2/);assert.match(html,/当前层位未确认/);
  assert.deepEqual(actions(html).map(tag=>tag.match(/data-diagram-layer-adjust="([^"]+)"/)![1]),['up','down','top','bottom']);
  assert.ok(actions(html).every(tag=>!tag.includes('disabled')));
  for(const label of ['上移','下移','置顶','置底'])assert.match(html,new RegExp(`>${label}</button>`));
  assert.match(html,/有效解范围内调整，主图同步/);
  assert.doesNotMatch(html,/上一解|下一解|跳转编号|当前第 \d+ 解|<input|连续可折|连续折叠可行/);
});

test('only a certified global rank or a certified unique solution disables positional bounds',()=>{
  const top=render({adjustmentFace:0,position:1}),bottom=render({adjustmentFace:1,position:2});
  assert.match(top,/当前第 1 层 \/ 共 2 层/);assert.match(bottom,/当前第 2 层 \/ 共 2 层/);
  for(const [html,disabled] of [[top,['up','top']],[bottom,['down','bottom']]] as const){
    for(const tag of actions(html))assert.equal(tag.includes('disabled=""'),disabled.includes(tag.match(/data-diagram-layer-adjust="([^"]+)"/)![1] as never));
  }
  for(const layers of [{solutionCountExact:'1'},{solutionCount:1}]){
    const html=render({adjustmentFace:0,result:result(layers)});
    assert.ok(actions(html).every(tag=>tag.includes('disabled=""')));assert.match(html,/仅有一个有效解/);
  }
  assert.ok(actions(render({adjustmentFace:0,result:result({solutionCountExact:'900719925474099312345678901234567890'})})).every(tag=>!tag.includes('disabled')));
});

test('unanalysed, busy, inactive and callback-free states keep adjustment actions unavailable',()=>{
  const unresolved=render({adjustmentFace:0,result:result({status:'unknown',message:'尚未分析'})});
  assert.match(unresolved,/层序分析完成后可调整/);assert.ok(actions(unresolved).every(tag=>tag.includes('disabled=""')));
  for(const props of [{busy:true},{disabled:true},{onAdjust:undefined}])assert.ok(actions(render({adjustmentFace:0,...props})).every(tag=>tag.includes('disabled=""')));
  assert.match(render({adjustmentFace:0,busy:true}),/正在查找符合层序的调整/);
});

test('errors and solver feedback retain the selected face and describe the unchanged result',()=>{
  const failed=render({adjustmentFace:1,error:'该方向没有符合层序的解，已保留原层位。'});
  assert.match(failed,/纸面 F2/);assert.match(failed,/role="alert">该方向没有符合层序的解，已保留原层位/);
  assert.ok(actions(failed).every(tag=>!tag.includes('disabled')));
  assert.match(render({adjustmentFace:0,feedback:'纸面 F1 已移到可用的最高层。'}),/role="status">纸面 F1 已移到可用的最高层/);
});

test('adjustment mode highlights its own face while leaving the original analysis selection intact',()=>{
  const pose=poseFixture();delete pose.result.layers.faceOrder;
  const selectedFaces=[0,1],html=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,selectedFaces,adjustmentMode:true,adjustmentFace:1,onAdjustmentModeChange(){},onAdjustLayer(){}}));
  assert.deepEqual(selectedFaces,[0,1]);assert.match(html,/data-diagram-layer-stack="local"/);
  assert.match(html,/data-diagram-stack-row="0"[^>]*aria-pressed="false"/);
  assert.match(html,/data-diagram-stack-row="1"[^>]*aria-pressed="true"/);
  assert.match(html,/当前层位未确认/);
});

test('adjustment work locks its own and analysis controls while retaining paper visibility and identity',()=>{
  const pose=poseFixture();pose.result.layers.solutionCountExact='2';pose.result.layers.solutionCount=2;
  for(const state of [{adjustingLayer:true},{analysing:true}]){
    const html=renderToStaticMarkup(createElement(DiagramLayerStack,{pose,...state,adjustmentMode:true,adjustmentFace:0,onAdjustmentModeChange(){},onAdjustLayer(){},onAnalyse(){},onToggleVisible(){},onShowAll(){},onHideAll(){}}));
    assert.ok(actions(html).every(tag=>tag.includes('disabled=""')));
    assert.ok([...html.matchAll(/<button[^>]*data-diagram-layer-visibility=[^>]*>/g)].every(match=>!match[0].includes('disabled')));
    assert.equal([...html.matchAll(/data-diagram-stack-row=/g)].length,2);
    assert.match(html,/<button type="button" data-layer-analysis-command="" disabled=""/);
  }
});
