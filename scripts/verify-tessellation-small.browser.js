async page=>{
 const button=name=>page.getByRole('button',{name,exact:true}),results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 await button('镶嵌设计').click();await button('06 自定义').click();await button('编辑网格').click();
 await page.getByLabel('网格 JSON',{exact:true}).fill(JSON.stringify({vertices:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],faces:[[0,1,4,3],[1,2,5,4]]}));await button('采用网格参数').click();
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await button('生成预览').click();const response=await pending,value=await response.json();check(response.ok(),'两面最小网格完成计算');
 await page.waitForFunction(()=>!document.querySelector('.context-toolbar .primary')?.disabled);check(value.stats.checks.local.interiorVertices===0,'检查准确报告没有内部顶点');
 check(await page.locator('.tess-checks').getByText(/无内部顶点/).isVisible(),'界面不把无内部顶点标为失败');
 await button('采用折痕副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true','最小网格可以采用为可编辑工程');
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('08 铺石镶嵌').click();await page.getByLabel('铺石类型',{exact:true}).selectOption('hexagon');
 const next=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await button('生成预览').click();await next;await page.waitForFunction(()=>!document.querySelector('.context-toolbar .primary')?.disabled);await page.screenshot({path:'output/playwright/tessellation-v011.png'});
 return {passed:results.length,results};
}
