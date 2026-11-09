async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('06 自定义').click();await button('恢复默认').click();
 const generate=async(expected={})=>{const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&Object.entries(expected).every(([k,v])=>r.request().postDataJSON()?.[k]===v));await button('重新计算').click();const r=await wait,value=await r.json();check(r.ok(),'组合计算成功 '+(value.error??''));await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='采用折痕副本 →')?.disabled);return value;};
 await generate();await button('拼块组合').click();
 check(await page.locator('.tile-assembly-canvas polygon').count()===4,'现有网格读取为四个拼块');
 await page.getByLabel('选中拼块',{exact:true}).selectOption('0');await page.getByLabel('选中拼块边',{exact:true}).selectOption('0');await button('沿边镜像复制').click();
 check(await page.locator('.tile-assembly-canvas polygon').count()===5,'沿边镜像复制新增相邻整块');
 await button('复制拼块').click();await button('采用拼块组合').click();
 check(await page.getByRole('dialog',{name:'拼块组合',exact:true}).count()===1&&/重叠/.test(await page.locator('.tile-assembly-status').innerText()),'重叠组合在保存前拒绝');
 await button('撤销拼块修改').click();
 await page.getByLabel('自定义周期向量',{exact:true}).check();
 check(await page.getByLabel('U X',{exact:true}).inputValue()==='1','周期向量初值来自组合边界');
 check(await page.getByRole('dialog',{name:'拼块组合',exact:true}).evaluate(e=>e.scrollHeight<=e.clientHeight+1),'拼块编辑窗口一屏显示');
 await button('采用拼块组合').click();await page.getByLabel('旋转角度',{exact:true}).fill('42');const value=await generate({angle:42});
 check(value.stats.parameters.faces.length===5&&value.stats.parameters.angle===42,'整块组合保存后调整转角仍保留五个面');
 check(Array.isArray(value.stats.parameters.lattice),'自定义周期向量进入后端');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'自定义构造参数栏无滚动');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();await button('拼块组合').click();
 check(await page.locator('.tile-assembly-canvas polygon').count()===5,'工程保存后可再次编辑五个拼块');
 check(await page.getByLabel('自定义周期向量',{exact:true}).isChecked(),'工程恢复自定义周期向量');
 await page.screenshot({path:'output/playwright/tile-assembly-goal.png'});await button('关闭镶嵌窗口').click();return {passed:checks.length,checks};
}
