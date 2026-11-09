async page=>{
 const checks=[],responses=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const foldedReady=async()=>{if(await button('计算平折').count())await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');};
 await page.evaluate(()=>{window.confirm=()=>true;}); // Isolated web acceptance, not native desktop confirmation evidence.
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async response=>{if(response.url().endsWith('/api/tessellate')&&response.ok())responses.push(await response.json());});
 await button('镶嵌设计').click();
 await page.getByRole('button',{name:/^\d+ 线组编织$/}).click();await ready();
 await page.getByLabel('编织构造示例',{exact:true}).selectOption('merit-periodic');await ready();
 await button('求解详情 · 局部数值候选').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
 check(true,'原版四线周期输入按原目标求解且可采用');
 const first=responses.findLast(r=>r.source.meritReport?.periodicEquationCount===15);
 check(first?.source.meritReport.periodicRawResiduals.length===16,'真实后台按8组相位建立16项原周期约束');
 check(first?.source.meritReport.droppedPeriodicEquation===15,'只丢弃整份列表最后面积项');
 check(first?.source.meritReport.kktResidual<1e-7,'非唯一乘子场景KKT诊断无假大误差');
 for(const width of [1280,1000,800]){await page.setViewportSize({width,height:720});check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${width}×720 周期原目标参数无滚动`);}
 await page.setViewportSize({width:1280,height:720});
 await button('求解详情 · 局部数值候选').click();
 const detail=await page.getByRole('dialog').innerText();
 check(detail.includes('周期有效方程')&&detail.includes('15'),'详情显示实际有效周期方程数');
 check(detail.includes('原版丢弃末项残差')&&detail.includes('没有全局最优证明'),'丢弃项残差与局部数值候选明确展示');
 await page.screenshot({path:'output/playwright/woven-independent-regression-period-detail-1008.png'});
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 await button('褶宽约束／周期／固定面').click();
 check(await page.getByLabel('编织优化目标',{exact:true}).inputValue()==='origamica-merit','高级参数保持原目标选择');
 check((await page.getByLabel('周期端点配对',{exact:true}).inputValue()).trim().split('\n').length===4,'原四对端点顺序保持');
 await page.getByLabel('固定面编号',{exact:true}).fill('2');
 const fixedReply=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.stationaryFace===1);
 await button('保存编织约束').click();const fixed=await(await fixedReply).json();await ready();
 check(fixed.stats.parameters.stationaryFace===1&&fixed.source.meritReport?.periodicEquationCount===15,'周期与原目标组合可以提交，固定面实际生效');
 if(await button('计算平折').count())await button('计算平折').click();await foldedReady();check(true,'周期原目标在同画布层序已解');
 for(const side of ['背面','正面']){await button(side).click();await foldedReady();check(await button(side).getAttribute('aria-pressed')==='true',`周期${side}当前结果渲染`);}
 const widthReply=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.width===.19);
 await page.getByLabel('条带基准宽',{exact:true}).fill('.19');const changed=await(await widthReply).json();await ready();await foldedReady();
 check(changed.stats.parameters.width===.19&&changed.source.meritReport?.periodicEquationCount===15,'调宽重算保持原周期方程');
 check(await page.locator('.tess-flat-pane').getAttribute('data-current')==='true','调宽平折显示本次结果');
 await page.screenshot({path:'output/playwright/woven-independent-regression-period-fold-1008.png'});
 await button('褶宽约束／周期／固定面').click();
 await page.getByLabel('最小褶宽倍率',{exact:true}).fill('1.1');
 await button('关闭镶嵌窗口').click();
 await button('褶宽约束／周期／固定面').click();
 check(await page.getByLabel('最小褶宽倍率',{exact:true}).inputValue()==='1','取消约束修改保留已提交参数');
 await button('关闭镶嵌窗口').click();
 await button('采用折痕副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true','周期原目标结果实际采用');
 await page.getByRole('textbox',{name:'工程名称',exact:true}).fill('周期原目标验收');
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();check(true,'采用后的周期工程实际保存');
 await button('导出作品').click();
 for(const format of ['json','fold']){
  await page.getByRole('dialog').locator('select').first().selectOption(format);
  const downloaded=page.waitForEvent('download');await button('导出文件').click();
  await (await downloaded).saveAs(`output/playwright/woven-independent-regression-period-adopted-1008.${format==='json'?'zhezhi.json':'fold'}`);
  check(true,`浏览器实际下载周期工程${format.toUpperCase()}`);
 }
 await button('关闭窗口').click();
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/woven-independent-regression-period-adopted-1008.zhezhi.json');
 await page.waitForFunction(()=>document.querySelector('input[aria-label="工程名称"]')?.value==='周期原目标验收');
 await button('镶嵌设计').click();await ready();
 await page.getByRole('button',{name:/^\d+ 单元扭转$/}).click();await ready();
 await button('读取工程参数').click();await ready();
 await button('求解详情 · 局部数值候选').waitFor();
 check(await page.getByLabel('线组方式',{exact:true}).inputValue()==='lines','实际重开JSON后读取周期原目标参数');
 check(await page.getByLabel('条带基准宽',{exact:true}).inputValue()==='0.19','重开恢复修改后的宽度');
 await button('褶宽约束／周期／固定面').click();
 check(await page.getByLabel('固定面编号',{exact:true}).inputValue()==='2','重开恢复固定面');
 check(await page.getByLabel('编织优化目标',{exact:true}).inputValue()==='origamica-merit','重开保留原目标而非静默转兼容');
 check((await page.getByLabel('周期端点配对',{exact:true}).inputValue()).trim().split('\n').length===4,'重开保留四对周期端点');
 await button('关闭镶嵌窗口').click();
 check(errors.length===0,'零页面异常');
 return {passed:checks.length,checks,errors,responses:responses.map(r=>({width:r.stats.parameters.width,stationaryFace:r.stats.parameters.stationaryFace,merit:r.source.merit,periodicEquationCount:r.source.meritReport?.periodicEquationCount,kktResidual:r.source.meritReport?.kktResidual}))};
}
