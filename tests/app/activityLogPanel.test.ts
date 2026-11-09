import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {activityLogActionLabel,activityLogDetails}=await import('../../src/components/ActivityLogPanel');
cssHook.deregister();

test('activity diagnostics show the useful file/error context and zero counts without dumping arbitrary objects',()=>{
  const text=activityLogDetails({reason:'切分后超过容量',fileName:'失败文件.cp',tool:'line',workspace:'edit',segments:0,format:'cp',payload:{private:'never-render'},nested:['never-render']});
  assert.ok(text.startsWith('切分后超过容量；文件：失败文件.cp'));
  assert.match(text,/工具：/);assert.doesNotMatch(text,/工具：line/);assert.match(text,/工作区：折痕编辑/);
  assert.match(text,/线段：0 条/);assert.match(text,/格式：CP/);assert.doesNotMatch(text,/never-render|private|payload|nested/);
  assert.equal(activityLogDetails({reason:'',message:'可重试的连接错误'}),'可重试的连接错误');
});

test('activity action labels cover common workflows while retaining unknown actions verbatim',()=>{
  assert.equal(activityLogActionLabel('document.import.error'),'导入失败');
  assert.equal(activityLogActionLabel('document.save.success'),'保存完成');
  assert.equal(activityLogActionLabel('runtime.unhandledrejection'),'后台任务异常');
  assert.equal(activityLogActionLabel('desktop.confirm.fallback'),'使用备用确认窗口');
  assert.equal(activityLogActionLabel('desktop.renderer.gone'),'应用窗口异常退出');
  assert.equal(activityLogDetails({result:'accepted'}),'结果：已确认');
  assert.equal(activityLogDetails({result:'cancelled'}),'结果：已取消');
  for(const unknown of ['custom.operation','constructor','toString'])assert.equal(activityLogActionLabel(unknown),unknown);
});

test('activity summaries stay bounded and preserve scalar text without executing or serializing it',()=>{
  const text=activityLogDetails({reason:'很长的诊断'.repeat(1000),fileName:'a'.repeat(500)+'.fold',message:'m'.repeat(500),result:'r'.repeat(500),tool:'constructor',workspace:'toString'});
  assert.ok(text.length<=421);assert.ok(text.includes('…'));
  assert.equal(activityLogDetails({fileName:'<script>alert(1)</script>'}),'文件：<script>alert(1)</script>');
  assert.equal(activityLogDetails(undefined),'');assert.equal(activityLogDetails({extra:{value:1}}),'');
});
