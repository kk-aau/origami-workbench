async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>{window.confirm=()=>true;});const button=name=>page.getByRole('button',{name,exact:true});
 for(const name of ['trace-interior','insert-bridge-M']){
  if(await button('关闭工具设置').count())await button('关闭工具设置').click();await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-weak-tools-${name}-initial-1009.zhezhi.json`);await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();await button('编辑材料折痕').click();const c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});if(name==='trace-interior')await c.getByRole('button',{name:'跨面直线构造',exact:true}).click();
  for(const width of [1000,800]){await page.setViewportSize({width,height:720});if(!await c.evaluate(e=>{const r=e.getBoundingClientRect();return e.scrollHeight<=e.clientHeight+1&&[...e.querySelectorAll('input,select,footer button')].every(c=>{const q=c.getBoundingClientRect();return q.top>=r.top&&q.bottom<=r.bottom&&q.left>=r.left&&q.right<=r.right;});}))throw Error(`${name} ${width}×720 控件或CP选择被挤出窗口`);checks.push(`${name} ${width}×720 全部控件和CP选择可见，无窗口滚动`);await page.screenshot({path:`output/playwright/material-weak-tools-${name}-layout-${width}-1009.png`});}
  await c.getByRole('button',{name:'取消',exact:true}).click();
 }
 if(errors.length)throw Error(errors.join('\n'));checks.push('零页面异常');return {passed:checks.length,checks,errors};
}
