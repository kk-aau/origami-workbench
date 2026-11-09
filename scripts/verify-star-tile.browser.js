async page=>{
 const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.customOutput==='tiling');
 await page.setViewportSize({width:1000,height:720});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('06 自定义').click();
 await button('拼块组合').click();
 await page.getByLabel('星尖数',{exact:true}).selectOption('6');
 await page.getByLabel('星尖角',{exact:true}).fill('40');await page.getByLabel('星尖角',{exact:true}).press('Enter');
 await button('新建单位星形').click();
 check((await page.getByRole('dialog',{name:'拼块组合'}).locator('svg polygon').count())===1,'独立生成六尖星单个轮廓');
 await page.getByLabel('新增拼块边数',{exact:true}).selectOption('3');
 await button('沿选边添加').click();
 check((await page.getByRole('dialog',{name:'拼块组合'}).locator('svg polygon').count())===2,'可沿星形单位边组合三角形');
 const pending=response();await button('采用拼块组合').click();const r=await pending,body=await r.json();
 check(r.status()===200&&body.mother.faces_vertices.length===2&&body.mother.faces_vertices.some(f=>f.length===12),'保存后保留十二顶点凹面和两块拓扑');
 check(body.source.output==='tiling'&&body.stats.foldability==='not_applicable'&&body.fold.edges_assignment.filter(a=>a==='F').length===1,'接合线仅为辅助线，不冒充折痕');
 check(await button('计算平折').isDisabled(),'母结构不会误触发平折计算');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 参数栏无滚动');
 check(await page.getByLabel('自定义拼块输出',{exact:true}).locator('option[value=twist]').evaluate(e=>e.disabled),'凹面禁止切换到凸面扭转算法');
 await page.screenshot({path:'output/playwright/star-outline-original.png'});
 await button('采用母结构副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('02 周期拼接').click();
 const restored=response();await button('读取工程参数').click();const saved=await(await restored).json();
 check(saved.source.output==='tiling'&&saved.mother.faces_vertices.length===2&&saved.stats.parameters.faces.some(f=>f.length===12),'采用并保存后可恢复星形组合');
 return {passed:checks.length,checks};
}
