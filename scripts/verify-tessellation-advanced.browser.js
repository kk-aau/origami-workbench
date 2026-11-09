async page=>{
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const close=button('关闭窗口');if(await close.count())await close.click();
 const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await page.setViewportSize({width:1000,height:720});
 const save=async()=>{await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();};
 await save();await button('镶嵌设计').click();
 const generate=async()=>{const request=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await button('重新计算').click();const response=await request;const value=await response.json();check(response.ok(),'计算成功 '+(value.stats?.parameters?.family??JSON.stringify(value)));await page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算');return value;};
 for(const [index,name] of ['单元扭转','周期拼接','原始—对偶','混合平铺','非周期','自定义','环状镶嵌','铺石镶嵌','盒褶编织','Brocard 扭转','分裂扭转','线组编织'].entries()){
  await button(`${String(index+1).padStart(2,'0')} ${name}`).click();const value=await generate();
  check(await button('采用折痕副本 →').isEnabled(),name+' 默认候选通过检查并可采用');
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),name+' 1000×720 无滚动');
  check(await page.locator('.tess-families button').count()===12,'十二类入口保持直接可见');
  if(value.dual){await button('原始与对偶').click();check(await page.locator('[data-segment]').count()>value.mother.edges_vertices.length,name+' 显示对偶叠加');await button('折痕图').click();}
 }
 await button('05 非周期').click();await generate();await button('编辑种子点').click();
 check(await page.locator('.tess-mesh-editor circle').count()===9,'种子编辑器载入实际生成点');
 await page.getByLabel('点 X',{exact:true}).fill('.18');await page.getByLabel('点 X',{exact:true}).press('Enter');
 await button('保存几何修改').click();check(await button('采用折痕副本 →').isDisabled(),'种子修改使旧候选失效');
 const edited=await generate();check(Math.abs(edited.stats.parameters.points[0][0]-.18)<1e-8,'编辑种子真正进入后端');
 await button('编辑对偶点').click();await button('保存几何修改').click();const dual=await generate();check(dual.stats.parameters.dualTargets.length===edited.mother.faces_vertices.length,'对偶目标与面一一对应');
 await button('06 自定义').click();await generate();await button('编辑网格').click();
 await page.getByLabel('网格 JSON',{exact:true}).fill('{invalid');await button('采用网格参数').click();check(await page.getByRole('alert').count()>0,'损坏网格不替换参数');await button('关闭镶嵌窗口').click();
 await page.getByRole('button',{name:/拖动母结构顶点/}).click();await page.getByLabel('选中点',{exact:true}).selectOption({value:'4'});
 await page.getByLabel('点 X',{exact:true}).fill('.55');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();
 const custom=await generate();check(custom.stats.parameters.vertices[4][0]===.55,'母结构顶点编辑传入计算');
 await button('恢复默认').click();await generate();await button('采用折痕副本 →').click();await save();
 await button('镶嵌设计').click();await button('09 盒褶编织').click();await button('读取工程参数').click();check(await button('06 自定义').getAttribute('aria-pressed')==='true','从工程元数据恢复构造类型与参数');
 await button('08 铺石镶嵌').click();await generate();await button('采用折痕副本 →').click();await save();
 await button('导出作品').click();await page.getByRole('combobox',{name:'输出格式',exact:true}).selectOption('json');const download=page.waitForEvent('download');await button('导出文件').click();await(await download).saveAs('output/playwright/tessellation-advanced-roundtrip.zhezhi.json');
 await button('关闭窗口').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/tessellation-advanced-roundtrip.zhezhi.json');await save();
 await button('镶嵌设计').click();await button('读取工程参数').click();check(await button('08 铺石镶嵌').getAttribute('aria-pressed')==='true','实际下载再导入保留铺石参数');
 await generate();await page.screenshot({path:'output/playwright/tessellation-advanced-complete.png'});
 return {passed:results.length,results};
}
