async page=>{
 await page.setViewportSize({width:1380,height:900});
 await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
 await page.getByRole('button',{name:'空间构造'}).click();
 await page.getByLabel('空间构造类型',{exact:true}).selectOption('rectangular-pot');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='rectangular-pot'&&r.request().postDataJSON()?.panels===1);
 await page.getByLabel('矩形壶体保存例',{exact:true}).selectOption('3489');
 const before=await(await response).json();
 await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const download=page.waitForEvent('download');
 await page.evaluate(before=>{const u=URL.createObjectURL(new Blob([JSON.stringify(before,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='constructor-before.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},before);
 await(await download).saveAs('output/original-helpers-browser-final-1010/pot-section/constructor-before.json');
 await page.getByRole('button',{name:'编辑剖面',exact:true}).click();
 await page.getByRole('button',{name:'原对称剖面',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.pot-cross-section-dialog .pot-cross-section-status')?.textContent?.includes('2条原Line'));
 return {opened:true,rawConstructorFirstRadius:before.stats.parameters.crossSection[0][0]};
}
