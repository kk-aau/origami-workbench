async page=>{
 const checks=[],errors=[],responses=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/api/tessellate')&&r.ok())responses.push(await r.json());});
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},button=name=>page.getByRole('button',{name,exact:true});
 await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:720});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const solved=async()=>{if(await button('计算平折').count())await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解',null,{timeout:30000});};
 const downloadable=async(name,format)=>{await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.locator('select').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();const file=await saving;await file.saveAs(`output/playwright/woven-independent-${name}-1008.${format==='json'?'zhezhi.json':format}`);check((await file.failure())===null,`${name} ${format} 实际下载`);await button('关闭窗口').click();};
 await button('镶嵌设计').click();await page.getByRole('button',{name:/^\d+ 线组编织$/}).click();await ready();
 await page.getByLabel('编织构造示例',{exact:true}).selectOption('merit');await ready();
 const first=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.graph?.vertices?.length===10);await page.getByLabel('编织构造示例',{exact:true}).selectOption('independent');await first;await ready();await solved();check(await button('采用折痕副本 →').isEnabled(),'新增独立双部件示例真实可采用');
 for(const name of ['fixed-second','pair','full-insets','empty-period','periodic-pair','merit-cut-pair']){
  await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/woven-independent-${name}-params-1008.zhezhi.json`);
  await page.waitForFunction(value=>document.querySelector('[aria-label="工程名称"]')?.value===value,`独立母图参数-${name}`);
  await button('镶嵌设计').click();await ready();const reply=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok());await button('读取工程参数').click();const actual=await(await reply).json();await ready();await solved();
  check(actual.source.wovenIndependentMother?.vertices.length===2,`${name} 后台返回真实双母图部件`);check(await button('采用折痕副本 →').isEnabled(),`${name} 整片层序通过可采用`);
  await page.getByRole('button',{name:/^编辑母图 · \d+ 点$/}).click();const d=page.getByRole('dialog',{name:'有限母图 · 原CP与原FF',exact:true});
  check((await d.getByRole('status').innerText()).includes(`分片 ${name==='merit-cut-pair'?6:2}`),`${name} 独立原式回读与材料分片数通过`);
  for(const view of ['原CP','原FF']){await d.getByRole('button',{name:view,exact:true}).click();check(await d.locator('svg line.woven-inspect-edge').count()===(name==='merit-cut-pair'?28:64),`${name} ${view} 展示全部真实源边`);}
  for(const width of [1000,800]){await page.setViewportSize({width,height:720});check(await d.evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${name} ${width} 母图窗口无整体滚动`);}await page.setViewportSize({width:1280,height:720});await button('关闭镶嵌窗口').click();
  for(const side of ['背面','正面']){await button(side).click();await solved();check(await button(side).getAttribute('aria-pressed')==='true',`${name} ${side} 保持层序`);}
  await button('采用折痕副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true',`${name} 实际采用进入编辑`);
  if(name==='pair'){await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();check(true,'双部件实际服务保存');}
  for(const format of ['json','fold','dxf'])await downloadable(name,format);
  await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));check(true,`${name} 采用后重新平折仍可解`);
  await page.screenshot({path:`output/playwright/woven-independent-${name}-1008.png`});
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/woven-independent-${name}-1008.zhezhi.json`);await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));check(true,`${name} 实际JSON重开再次平折`);
 }
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors,responses:responses.length};
}
