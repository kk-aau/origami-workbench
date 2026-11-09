import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FlatComputationProgress} from '../../src/core/flatComputationProgress';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:FlatComputationStatus}=await import('../../src/components/FlatComputationStatus');
cssHook.deregister();
const running={active:true,title:'计算中 · 层序求解',detail:'仍需完整认证',tone:'busy' as const};

test('confirmed relation counts fill the card without claiming overall completion',()=>{
 const progress:FlatComputationProgress={stage:'search',label:'搜索纸层顺序',metric:'confirmed-relations',completed:850,total:1000,detail:'当前分支试排 990 组'};
 const markup=renderToStaticMarkup(createElement(FlatComputationStatus,{status:running,progress}));
 assert.match(markup,/data-progress-mode="measured"/);
 assert.match(markup,/--flat-progress:0.85/);
 assert.match(markup,/已确定 850 \/ 1,000 组/);
 assert.match(markup,/关系 85%/);
 assert.match(markup,/aria-label="已确定层序关系占比"/);
 assert.match(markup,/整体计算仍在进行/);
 assert.doesNotMatch(markup,/本阶段 85%|本次计算已完成/);
 const allAssigned=renderToStaticMarkup(createElement(FlatComputationStatus,{status:running,progress:{...progress,completed:1000}}));
 assert.match(allAssigned,/data-flat-computation="running"/);
 assert.match(allAssigned,/关系 100%/);
 assert.match(allAssigned,/整体计算仍在进行/);
});

test('completed, stopped and failed calculations keep the supplied measured duration',()=>{
 for(const status of [{active:false,title:'计算完成 · 纸面已确认',detail:'完成',tone:'ready' as const},{active:false,title:'计算已结束 · 已停止',detail:'用户停止',tone:'warning' as const},{active:false,title:'计算已结束 · 层序失败',detail:'求解失败',tone:'warning' as const}]){
  const markup=renderToStaticMarkup(createElement(FlatComputationStatus,{status,elapsedMs:12345,onCancel:()=>assert.fail('terminal action must be absent'),progress:{stage:'search',label:'搜索纸层顺序',completed:1,total:2}}));
  assert.match(markup,/本次用时 12.3 秒/);
  assert.match(markup,/data-flat-computation="finished"/);
  assert.doesNotMatch(markup,/停止计算|已用|计算中 · 搜索/);
  if(status.tone==='warning')assert.doesNotMatch(markup,/role="progressbar"/);
 }
});

test('historical results without timing do not invent a duration and zero remains valid',()=>{
 const status={active:false,title:'计算完成',detail:'完成',tone:'ready' as const};
 for(const elapsedMs of [undefined,NaN,Infinity,-1])assert.doesNotMatch(renderToStaticMarkup(createElement(FlatComputationStatus,{status,elapsedMs})),/本次用时/);
 assert.match(renderToStaticMarkup(createElement(FlatComputationStatus,{status,elapsedMs:0})),/本次用时 0.0 秒/);
 const active=renderToStaticMarkup(createElement(FlatComputationStatus,{status:running,elapsedMs:12345}));
 assert.match(active,/已用 0 秒/);assert.doesNotMatch(active,/本次用时/);
});
