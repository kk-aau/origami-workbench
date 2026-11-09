async page=>{
 await page.setViewportSize({width:1380,height:920});await page.evaluate(()=>window.confirm=()=>true);
 await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
 await page.getByRole('button',{name:/线组编织$/}).click();
 await page.getByLabel('线组方式',{exact:true}).selectOption('random');
 await page.getByLabel('随机母线接受规则',{exact:true}).selectOption('original-courteous');
 const pending=page.waitForResponse(r=>r.status()===200&&r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.randomVersion==='original-courteous'&&r.request().postDataJSON()?.count===2&&r.request().postDataJSON()?.width===.02);
 await page.getByRole('button',{name:'原随机母线示例',exact:true}).click();
 const response=await(await pending).json();
 const download=page.waitForEvent('download');await page.evaluate(r=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));a.download='seed-zero-response.json';a.click();},response);
 await(await download).saveAs('output/original-ring-unsafe-courteous-browser-1010/courteous/seed-zero-response.json');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled),{},{timeout:45000});
 const text=await page.locator('body').innerText();await page.screenshot({path:'output/original-ring-unsafe-courteous-browser-1010/courteous/seed-zero-ready.png',fullPage:true});
 return {geometry:response.stats.checks.geometry.status,local:response.stats.checks.local.status,layerSolved:text.includes('✓ 层序已解'),
  source:response.source.courteousAnarchy,adoptEnabled:await page.getByRole('button',{name:'采用折痕副本 →',exact:true}).isEnabled()};
}
