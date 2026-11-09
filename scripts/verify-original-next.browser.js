async page=>{
 const checks=[],check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);},button=name=>page.getByRole('button',{name,exact:true});
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await page.setViewportSize({width:1000,height:720});
 const idle=()=>page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算');
 const changed=async action=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await action();const response=await pending,value=await response.json();check(response.ok(),'接口生成成功');await idle();return value;};
 await changed(()=>button('镶嵌设计').click());
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'普通扭转小窗口无滚动');
 const split=await changed(()=>page.getByLabel('单元结构',{exact:true}).selectOption('quad-split'));
 check(split.source.algorithm.includes('quadrilateral-split'),'独立四边形分裂算法进入实时预览');
 check(await button('采用折痕副本 →').isEnabled(),'新分裂候选通过检查可采用');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'分裂参数小窗口无滚动');
 for(const vertex of [0,1,2,3]){
  if(vertex===0)continue;
  const value=await changed(()=>page.getByLabel('分裂基点',{exact:true}).selectOption({value:String(vertex)}));check(value.source.baseVertex===vertex,'基点选择准确传入 '+(vertex+1));
 }
 const valley=await changed(()=>page.getByLabel('连接',{exact:true}).selectOption('V'));check(valley.source.connection==='V','连接折痕山谷选项传入生成器');
 await changed(()=>page.getByLabel('边缘褶宽',{exact:true}).fill('.3'));
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await idle();await changed(()=>button('04 混合平铺').click());
 for(const tiling of ['resch-3','resch-4','resch-6']){
  const value=await changed(()=>page.getByLabel('顶点构型',{exact:true}).selectOption(tiling));
  check(value.source.mesh.includes('Resch star'),'真实 Resch 星形母结构 '+tiling);
  check(await button('采用折痕副本 →').isEnabled(),'星形候选可采用 '+tiling);
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'星形参数小窗口无滚动 '+tiling);
 }
 await changed(()=>page.getByLabel('星尖角',{exact:true}).fill('30'));
 await page.screenshot({path:'output/playwright/original-next-resch.png'});
 await changed(()=>button('读取工程参数').click());check(await page.getByLabel('单元结构',{exact:true}).inputValue()==='quad-split','工程恢复分裂构造类型');check(await page.getByLabel('连接',{exact:true}).inputValue()==='V','工程恢复连接山谷');
 await page.screenshot({path:'output/playwright/original-next-split.png'});
 return {passed:checks.length,checks};
}
