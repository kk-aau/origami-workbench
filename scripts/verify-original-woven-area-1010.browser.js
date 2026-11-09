async page=>{
 await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1360,height:860});await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/^\d+ 线组编织$/}).click();const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const capture=async(value,file)=>{const pending=page.waitForEvent('download');await page.evaluate(({value,file})=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));const a=document.createElement('a');a.href=url;a.download=file;a.click();}, {value,file});await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/${file}`);};
 for(const degree of [12,16,32]){
  await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.graph?.vertices?.length===degree+1);
  await page.getByLabel('编织构造示例').selectOption(`scaled-even-${degree}`);const response=await pending,actual=await response.json();
  check(response.ok()&&actual.source.topologyAreaRecovery.allOriginalConstraintsRetained,`${degree}度真实公共API完成原目标与全部约束`);
  await page.getByRole('button',{name:'仅采用 CP →',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
  check((await page.locator('body').innerText()).includes('✓ 层序已解'),`${degree}度实际界面层序求解完成`);
  check(actual.source.graph.vertices.length===degree+1&&actual.source.fullEdgeInsets.entries.every(e=>e.inset===.005*1e-4),`${degree}度原点和完整原h均未替换`);
  await capture(actual,`browser-${degree}-public-response.json`);
  await page.getByRole('button',{name:/^求解详情/}).click();check((await page.getByRole('dialog').innerText()).includes('不确定的零面积面未加入'),`${degree}度求解详情说明严格正面积回读`);await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.screenshot({path:`D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/browser-${degree}-constructed.png`,fullPage:true});
  await page.getByRole('button',{name:'仅采用 CP →',exact:true}).click();await page.getByRole('button',{name:'折痕编辑',exact:true}).click();
  for(const format of ['json','fold','dxf']){
   await page.getByRole('button',{name:'导出作品',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption(format);
   const download=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'导出文件',exact:true}).click();await(await download).saveAs(`D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/browser-${degree}-cp.${format}`);
   check(true,`${degree}度采用CP后的实际${format}下载`);
   await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click();
  }
 }
 await page.setViewportSize({width:640,height:960});await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByLabel('编织构造示例').scrollIntoViewIfNeeded();
 check((await page.getByLabel('编织构造示例').boundingBox()).width<=640,'窄窗新母图构造入口可用');await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/browser-mobile.png',fullPage:true});
 check(errors.length===0,'验证期间零页面运行异常');const report={passed:checks.length,checks,errors};await capture(report,'browser-checks.json');return report;
}
