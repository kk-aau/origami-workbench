async page=>{
 const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('01 单元扭转').click();
 check(await button('临界角与山谷赋型分析').isVisible(),'单元扭转提供分析入口');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 参数栏不滚动');
 await button('临界角与山谷赋型分析').click();
 const dialog=page.getByRole('dialog',{name:'扭转临界角与山谷赋型'});
 check(await dialog.isVisible(),'分析界面可打开');
 check((await dialog.getByTestId('twist-two-cycle').innerText()).includes('45.000° ～ 135.000°'),'方形二循环角为 45° 至 135°');
 check((await dialog.getByTestId('twist-three-cycle').innerText()).includes('无适用'),'方形没有有效的三循环边组');
 check(await dialog.getByLabel('有效山谷序列').locator('code').count()===6,'默认 36° 列出六类循环赋型');
 await dialog.getByLabel('查询扭角 α',{exact:true}).fill('60');await dialog.getByLabel('查询扭角 α',{exact:true}).press('Enter');
 check(await dialog.getByLabel('有效山谷序列').locator('code').count()<6,'调高查询角会筛除无效赋型');
 await dialog.getByRole('button',{name:'关闭镶嵌窗口'}).click();
 await page.getByLabel('边数',{exact:true}).fill('3');await page.getByLabel('边数',{exact:true}).press('Enter');
 await button('临界角与山谷赋型分析').click();
 check((await dialog.getByTestId('twist-three-cycle').innerText()).includes('30.000° ～ 150.000°'),'三角形三循环角为 30° 至 150°');
 check((await dialog.getByTestId('twist-triangle').innerText()).includes('30.000° ～ 150.000°'),'三角形内角公式与边组计算一致');
 check(await dialog.getByLabel('有效山谷序列').locator('code').count()===2,'三角形默认 36° 仅列出两类有效赋型');
 await dialog.getByRole('button',{name:'关闭镶嵌窗口'}).click();
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'三角形参数栏不滚动');
 return {passed:checks.length,checks};
}
