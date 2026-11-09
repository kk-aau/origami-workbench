async page=>{
 const checks=[],responses=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const foldedReady=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 page.on('pageerror',e=>errors.push(e.message));
 // CLI modal handling yields before run-code's result. Isolated web test only;
 // this stub is not evidence for the desktop native confirmation bridge.
 await page.evaluate(()=>{window.confirm=()=>true;});
 page.on('response',async response=>{if(response.url().endsWith('/api/tessellate')&&response.ok())responses.push(await response.json());});
 if(!await page.getByRole('button',{name:/^\d+ 线组编织$/}).isVisible())await button('镶嵌设计').click();
 await page.getByRole('button',{name:/^\d+ 线组编织$/}).click();await ready();
 await page.getByLabel('线组方式',{exact:true}).selectOption('graph');await ready();
 await page.getByLabel('编织构造示例',{exact:true}).selectOption('merit');await ready();
 await page.getByRole('button',{name:'求解详情 · 下界已达到',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
 check(await button('采用折痕副本 →').isEnabled(),'原目标最小褶宽示例可采用');
 const r=responses.findLast(r=>r.source.meritReport?.certificate==='feasible-lower-bound');
 check(r?.source.merit===.000004&&r.source.pleatFactors.every(x=>x===.001),'真实后台返回精确下界倍率与平方和');
 await button('求解详情 · 下界已达到').click();
 check((await page.getByRole('dialog').innerText()).includes('0.0000040000000'),'详情显示真实目标下界');
 check((await page.getByRole('dialog').innerText()).includes('无额外倍率上限'),'详情说明无人工倍率上限');
 await page.screenshot({path:'output/playwright/woven-merit-detail-1007.png'});
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 for(const width of [1280,1000,800]){
  await page.setViewportSize({width,height:720});
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${width}×720 参数面板无滚动`);
 }
 await page.setViewportSize({width:1280,height:720});
 await button('褶宽约束／周期／固定面').click();
 check(await page.getByLabel('编织优化目标',{exact:true}).inputValue()==='origamica-merit','高级参数显示原目标模式');
 await page.getByLabel('周期端点配对',{exact:true}).fill('1,1');
 await button('保存编织约束').click();
 check((await page.getByRole('alert').innerText()).includes('两个不同的顶点编号'),'错误周期端点在提交前明确拒绝');
 await page.getByLabel('周期端点配对',{exact:true}).fill('');
 await button('保存编织约束').click();await ready();
 await button('计算平折').click();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 check(true,'优化后的独立切口同画布平折层序已解');
 for(const side of ['背面','正面']){await button(side).click();await foldedReady();check(await button(side).getAttribute('aria-pressed')==='true',`${side}实际渲染切换`);}
 await page.screenshot({path:'output/playwright/woven-merit-fold-1007.png'});
 await page.getByLabel('条带基准宽',{exact:true}).fill('.08');await ready();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 check(await button('求解详情 · 下界已达到').isVisible(),'调宽保留原目标并更新详情');
 check(responses.some(r=>r.stats.parameters.width===.08&&r.source.merit===.000004),'宽度修改实际重算精确下界');
 await button('采用折痕副本 →').click();
 check(await button('折痕编辑').getAttribute('aria-pressed')==='true','采用进入折痕编辑');
 await page.getByRole('textbox',{name:'工程名称',exact:true}).fill('编织精确下界验收');
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 check(true,'实际工程保存成功');
 await button('导出作品').click();
 const select=page.getByRole('dialog').locator('select').first();
 await select.selectOption('json');
 const downloaded=page.waitForEvent('download');await button('导出文件').click();
 const download=await downloaded;await download.saveAs('output/playwright/woven-merit-adopted-1007.zhezhi.json');
 check(download.suggestedFilename().endsWith('.zhezhi.json'),'采用工程可导出完整 JSON');
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 await button('镶嵌设计').click();await ready();
 check(await page.getByLabel('线组方式',{exact:true}).inputValue()==='graph','采用返回保持有限母图方式');
 check(await button('求解详情 · 下界已达到').isEnabled(),'采用返回后求解详情可用');
 for(const width of [1000,800]){
  await page.setViewportSize({width,height:720});
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${width}×720 采用返回后无滚动`);
 }
 await page.setViewportSize({width:1280,height:720});
 await page.getByLabel('编织构造示例',{exact:true}).selectOption('merit-concave');await ready();
 await button('求解详情 · 局部数值候选').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
 check(true,'凹母面原目标示例层序通过且可采用');
 await button('求解详情 · 局部数值候选').click();
 check((await page.getByRole('dialog').innerText()).includes('没有全局最优证明'),'数值候选与下界证明明确区分');
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 if(await button('计算平折').count())await button('计算平折').click();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 check(await page.locator('.tess-flat-pane').getAttribute('data-current')==='true','凹母面同画布平折显示本次结果');
 for(const side of ['背面','正面']){await button(side).click();await foldedReady();check(await button(side).getAttribute('aria-pressed')==='true',`凹母面${side}切换`);}
 await page.screenshot({path:'output/playwright/woven-merit-concave-1007.png'});
 await button('采用折痕副本 →').click();
 check(await button('折痕编辑').getAttribute('aria-pressed')==='true','凹母面候选实际采用');
 await button('导出作品').click();await page.getByRole('dialog').locator('select').first().selectOption('json');
 const concaveDownload=page.waitForEvent('download');await button('导出文件').click();
 await (await concaveDownload).saveAs('output/playwright/woven-merit-concave-adopted-1007.zhezhi.json');
 await button('关闭窗口').click();
 check(true,'凹母面工程实际 JSON 下载');
 check(errors.length===0,'零页面异常');
 return {passed:checks.length,checks,errors,responses:responses.map(r=>({width:r.stats.parameters.width,merit:r.source.merit,certificate:r.source.meritReport?.certificate}))};
}
