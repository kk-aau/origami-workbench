async page=>{
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='nonperiodic');
 await button('05 非周期').click();
 const result=await(await response).json();
 check(result.stats.checks.geometry.status==='passed'&&result.stats.checks.local.status==='passed','旧局部条件对默认 Voronoi 候选通过');
 check(result.stats.checks.lff.status==='failed'&&result.stats.checks.lff.assignmentViolations.length>0,'原版四价 LFF 发现额外必要条件冲突');
 await button('详情').click();
 check(await page.getByText(/局部必要条件冲突/).isVisible(),'检查详情明确呈现 LFF 冲突');
 return {passed:checks.length,checks};
}
