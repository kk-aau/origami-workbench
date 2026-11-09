async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await button('镶嵌设计').click();await button('10 Brocard 扭转').click();await page.getByLabel('Brocard 类型',{exact:true}).selectOption('cyclic-offset');
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');await ready();
 if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 await page.waitForFunction(()=>['ordered','regions'].includes(document.querySelector('.tess-flat-drawing')?.getAttribute('data-model-render-mode')));check(true,'默认偏置单元显示已验证实体');
 await button('中心边山谷').click();await button('全部谷折').click();await button('完成').click();await ready();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 check(true,'中心边全部谷折重新求得有效平折层序');
 await page.getByLabel('边缘褶宽',{exact:true}).fill('.55');await page.getByLabel('边缘偏置',{exact:true}).fill('-.08');await ready();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 await button('背面').click();check(await button('背面').getAttribute('aria-pressed')==='true','偏置结果使用同画布正背控制');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();
 check(await page.getByLabel('Brocard 类型',{exact:true}).inputValue()==='cyclic-offset','工程恢复偏置构造');
 check(Number(await page.getByLabel('边缘褶宽',{exact:true}).inputValue())===.55&&Number(await page.getByLabel('边缘偏置',{exact:true}).inputValue())===-.08,'工程恢复边缘褶宽和偏置');
 await button('中心边山谷').click();check((await page.getByRole('dialog',{name:'中心边山谷',exact:true}).locator('select').evaluateAll(es=>es.map(e=>e.value))).every(t=>t==='V'),'工程恢复每条中心边的山谷');await button('完成').click();
 return {passed:checks.length,checks};
}
