import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {flatComputationStatus} from '../../src/app/flatComputationStatus';
import {computeFlatFold} from '../../src/core/flatFold';
import {exampleDoc} from '../../src/app/state';
import {defaultModelColors} from '../../src/app/modelColors';
import {defaultModelView} from '../../src/app/modelViewState';
import type {FlatFoldResult} from '../../src/core/types';
import type {ModelOverlapReply} from '../../src/app/modelOverlapTask';

const cssHook=registerHooks({load(url,context,nextLoad){
 return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);
}});
const [{default:FlatView},{default:FoldDisplayBar}]=await Promise.all([import('../../src/components/FlatView'),import('../../src/components/FoldDisplayBar')]);
cssHook.deregister();

const solved=computeFlatFold(exampleDoc());
const controls={selection:{group:[],selected:[]},onSelect:()=>{},onMove:()=>{},disabled:false};
const props={result:solved,busy:false,stale:false,face:null,setFace:()=>{},xray:false,onRun:()=>{},source:null,vertexControls:controls};

test('the current calculation takes precedence over an older solved or stale result',()=>{
 for(const stage of ['preparing','geometry','layers'] as const){
  const state=flatComputationStatus({result:solved,busy:true,stale:true,stage});
  assert.equal(state.active,true);assert.equal(state.tone,'busy');assert.match(state.title,/计算中/);
 }
 assert.match(flatComputationStatus({result:solved,busy:true}).title,/层序求解/);
 assert.match(flatComputationStatus({result:null,busy:true}).title,/折叠几何/);
});

test('every unsuccessful layer terminal state is explicitly finished and retains its reason',()=>{
 for(const status of ['no-solution','unknown','unsupported','timeout','cancelled','error'] as const){
  const result:FlatFoldResult={...solved,layers:{status,message:'具体终止原因'}};
  const state=flatComputationStatus({result,busy:false});
  assert.equal(state.active,false);assert.equal(state.tone,'warning');assert.match(state.title,/计算已结束/);assert.match(state.detail,/具体终止原因/);assert.match(state.detail,/几何线框/);
 }
});

test('empty geometry failures and cancellations cannot look like a pending calculation',()=>{
 for(const status of ['invalid','unsupported','timeout','cancelled','error'] as const){
  const result:FlatFoldResult={...solved,geometry:{status,message:'输入阶段原因',vertices:[],faces:[]}};
  const state=flatComputationStatus({result,busy:false});
  assert.equal(state.active,false);assert.match(state.title,/计算已结束/);assert.equal(state.detail,'输入阶段原因');
 }
});

test('large concave models clearly finish at the unsupported stage instead of asking users to keep waiting',()=>{
 const result:FlatFoldResult={...solved,geometry:{...solved.geometry,faces:Array.from({length:20943},()=>[0,1,2])},layers:{status:'unsupported',message:'凹面层序构造预算为 36 个原面、80 个三角片，当前超出范围。'}};
 const state=flatComputationStatus({result,busy:false});
 assert.equal(state.active,false);assert.match(state.title,/计算已结束.*凹面求解范围/);assert.match(state.detail,/20,943/);assert.match(state.detail,/未开始层序搜索/);assert.match(state.detail,/几何线框/);
});

test('solved relations still show computing while local occlusion is running',()=>{
 const pending=flatComputationStatus({result:solved,busy:false,localRegions:true});
 assert.equal(pending.active,true);assert.match(pending.title,/纸面遮挡/);assert.match(pending.detail,/暂时显示线框/);
 for(const status of ['timeout','cancelled','error'] as const){
  const finished=flatComputationStatus({result:solved,busy:false,localRegions:true,regionReply:{status,message:'局部原因'}});
  assert.equal(finished.active,false);assert.match(finished.title,/计算已结束/);assert.match(finished.detail,/局部原因/);
 }
});

test('intentional wire and transparent displays do not falsely claim work is pending',()=>{
 assert.match(flatComputationStatus({result:solved,busy:false,wire:true}).title,/计算完成 · 线框显示/);
 assert.match(flatComputationStatus({result:solved,busy:false,xray:true}).title,/计算完成 · 透视显示/);
 assert.match(flatComputationStatus({result:solved,busy:false}).title,/计算完成 · 纸面已确认/);
 assert.match(flatComputationStatus({result:solved,busy:false,paperReady:false}).title,/纸面显示暂停/);
});

test('finished display diagnostics name thin coverage or uncertain boundaries without claiming zero unknown regions',()=>{
 const complete:Extract<ModelOverlapReply,{status:'complete'}>={status:'complete',analysis:{cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8},regions:[],boundaries:{edges:[],ambiguousEdges:0}};
 const state=(regionReply:ModelOverlapReply)=>flatComputationStatus({result:solved,busy:false,localRegions:true,regionReply});
 assert.equal(state(complete).tone,'ready');
 const thin=state({...complete,analysis:{...complete.analysis,omittedThinRegions:2}});
 assert.equal(thin.active,false);assert.equal(thin.tone,'warning');assert.match(thin.title,/计算已结束.*纸面未完整确认/);assert.match(thin.detail,/完整覆盖尚未确认/);assert.doesNotMatch(thin.detail,/0 个区域/);
 const boundary=state({...complete,boundaries:{edges:[],ambiguousEdges:3}});
 assert.equal(boundary.active,false);assert.equal(boundary.tone,'warning');assert.match(boundary.title,/纸面未完整确认/);assert.match(boundary.detail,/3 段边界/);assert.doesNotMatch(boundary.detail,/0 个区域/);
 const mixed=state({...complete,analysis:{...complete.analysis,omittedThinRegions:2},regions:[{polygon:[[0,0],[1,0],[0,1]],faces:[0],area:0.5,layers:{status:'unconfirmed',message:'层序待确认'}}],boundaries:{edges:[],ambiguousEdges:3}});
 assert.match(mixed.title,/纸面未完整确认/);assert.match(mixed.detail,/1 个区域/);assert.match(mixed.detail,/细小区域/);assert.match(mixed.detail,/3 段边界/);
});

test('legacy complete replies with missing surface data cannot claim completion or keep a stopped worker running',()=>{
 const complete:Extract<ModelOverlapReply,{status:'complete'}>={status:'complete',analysis:{cells:[],maxDepth:0,omittedThinRegions:0,epsilon:1e-8},regions:[],boundaries:{edges:[],ambiguousEdges:0}};
 const missing:[ModelOverlapReply,RegExp][]=[
  [{...complete,regions:undefined},/局部区域结果缺失/],
  [{...complete,boundaries:undefined},/可见边界结果缺失/],
  [{...complete,analysis:{...complete.analysis,cells:[{polygon:[[0,0],[1,0],[0,1]],faces:[0],area:.5}]}},/数量与重叠分析不一致/],
  [{...complete,analysis:undefined} as unknown as ModelOverlapReply,/重叠区域分析缺失/],
 ];
 for(const [regionReply,reason] of missing){
  const state=flatComputationStatus({result:solved,busy:false,localRegions:true,regionReply});
  assert.equal(state.active,false);assert.equal(state.tone,'warning');assert.match(state.title,/计算已结束.*纸面未完整确认/);assert.match(state.detail,reason);assert.match(state.detail,/保留线框/);
 }
});

test('the ready geometry canvas visibly reports ongoing calculation with a stop action',()=>{
 const markup=renderToStaticMarkup(createElement(FlatView,{...props,busy:true,onCancel:()=>{},progressStage:'layers'}));
 assert.match(markup,/data-flat-computation="running"/);assert.match(markup,/计算中 · 层序求解/);assert.match(markup,/停止计算/);assert.match(markup,/已用 0 秒/);
});

test('a controlled front/back layout overrides the initial single layout and shares one result',()=>{
 const markup=renderToStaticMarkup(createElement(FlatView,{...props,initialView:defaultModelView(),controlledView:{...defaultModelView(),layout:'both'}}));
 assert.match(markup,/data-model-pane="front-solid"/);assert.match(markup,/data-model-pane="back-solid"/);
 assert.equal((markup.match(/aria-label="选择折叠面 F1"/g)??[]).length,2);
 const single=renderToStaticMarkup(createElement(FlatView,{...props,initialView:{...defaultModelView(),layout:'both'},controlledView:defaultModelView()}));
 assert.doesNotMatch(single,/data-model-pane=/);
});

test('the permanent display bar offers simultaneous sides only for flat folding',()=>{
 const bar={xray:false,onXray:()=>{},back:false,onBack:()=>{},colors:defaultModelColors(),onColors:()=>{},onRotate:()=>{},onFit:()=>{},onLayout:()=>{},layout:'both' as const};
 const flat=renderToStaticMarkup(createElement(FoldDisplayBar,bar));
 assert.match(flat,/<button aria-pressed="true"[^>]*>正背同显<\/button>/);
 assert.doesNotMatch(renderToStaticMarkup(createElement(FoldDisplayBar,{...bar,kind:'spatial'})),/正背同显/);
});

test('a completed or stopped model keeps its measured duration through display handoff',()=>{
 const ready=renderToStaticMarkup(createElement(FlatView,{...props,result:{...solved,computationTimeMs:14567}}));
 assert.match(ready,/本次用时 14\.6 秒/);
 const stopped:FlatFoldResult={...solved,computationTimeMs:5678,layers:{status:'cancelled',message:'已停止'}};
 assert.match(renderToStaticMarkup(createElement(FlatView,{...props,result:stopped})),/本次用时 5\.7 秒/);
 const failed:FlatFoldResult={...stopped,geometry:{status:'error',message:'输入失败',vertices:[],faces:[]}};
 assert.match(renderToStaticMarkup(createElement(FlatView,{...props,result:failed})),/本次用时 5\.7 秒/);
 assert.doesNotMatch(renderToStaticMarkup(createElement(FlatView,props)),/本次用时/);
});

test('comparison views receive confirmed relation progress and share the external run start',()=>{
 const progress={stage:'search',label:'搜索纸层顺序',metric:'confirmed-relations' as const,completed:3,total:10};
 const markup=renderToStaticMarkup(createElement(FlatView,{...props,busy:true,startedAt:Date.now()-6500,computationProgress:progress,controlledView:{...defaultModelView(),layout:'both'}}));
 assert.equal((markup.match(/>已确定 3 \/ 10 组</g)??[]).length,2);
 assert.equal((markup.match(/已用 6 秒/g)??[]).length,2);
 assert.doesNotMatch(markup,/本次用时/);
 const complete=renderToStaticMarkup(createElement(FlatView,{...props,result:{...solved,computationTimeMs:2300},controlledView:{...defaultModelView(),layout:'both'}}));
 assert.equal((complete.match(/本次用时 2\.3 秒/g)??[]).length,2);
});
