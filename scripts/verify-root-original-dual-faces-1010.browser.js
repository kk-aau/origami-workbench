async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());await page.evaluate(()=>window.confirm=()=>true);
 await page.setViewportSize({width:1360,height:900});
 await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
 const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const capture=async(value,file)=>{const d=page.waitForEvent('download');await page.evaluate(({value,file})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));a.download=file;a.click();},{value,file});await(await d).saveAs(`output/playwright/original-topology-factors-main-1010/dual/original-topology-factors-main-1010/dual/${file}`);};
 const response=(test)=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.status()===200&&test(r.request().postDataJSON()));
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const adoptable=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled),{},{timeout:30000});
 const exported=async(name,format)=>{await button('导出作品').click();await page.getByRole('dialog').getByRole('combobox').selectOption(format);const d=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'导出文件',exact:true}).click();await(await d).saveAs(`output/playwright/original-topology-factors-main-1010/dual/original-topology-factors-main-1010/dual/${name}.${format}`);await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click();};
 let pending=response(p=>p.family==='primal-dual'&&!p.motherParams);await button('05 原始—对偶').click();
 const defaultResponse=await(await pending).json();check(defaultResponse.dual.faces_vertices.length===4&&defaultResponse.dual.zhezhi_dual_primal_vertices.length===4,'默认主App公开API补回原序4对偶面及4内点映射');await capture(defaultResponse,'browser-default-response.json');await ready();
 pending=response(p=>p.faceupFace===3&&p.motherParams?.family==='custom');await button('载入 2×2 保存例 · In[3354]').click();
 const base=await(await pending).json();check(base.dual.faces_vertices.length===1&&base.dual.zhezhi_dual_primal_vertices[0]===2,'原In3354真实公开API补回1对偶面并关联当前母点索引2');await capture(base,'browser-base-response.json');await adoptable();
 let current=base;
 for(const kind of ['base','edited']){
  if(kind==='edited'){
   await button('镶嵌设计').click();pending=response(p=>p.faceupFace===3&&p.motherParams?.family==='custom');await button('读取工程参数').click();await pending;await adoptable();
   await button('编辑对偶点').click();await page.getByRole('dialog',{name:'编辑对偶目标点'}).waitFor();
   const x=Number(await page.getByLabel('点 X',{exact:true}).inputValue());pending=response(p=>p.dualTargets?.length===4&&Math.abs(p.dualTargets[0][0]-x-.03)<1e-9);
   await page.getByLabel('点 X',{exact:true}).fill(String(x+.03));await page.getByLabel('点 X',{exact:true}).press('Enter');
   current=await(await pending).json();check(current.dual.faces_vertices.length===1&&JSON.stringify(current.dual.faces_vertices)===JSON.stringify(base.dual.faces_vertices),'对偶坐标编辑后保持原拓扑面序');
   check(JSON.stringify(current.mother)===JSON.stringify(base.mother),'实际对偶编辑保持母图点边面ID逐字段不变');
   check(JSON.stringify(current.fold.vertices_coords)!==JSON.stringify(base.fold.vertices_coords),'对偶点目标实际修改生成CP几何');await capture(current,'browser-edited-response.json');
   await page.getByRole('dialog').getByRole('button',{name:'保存几何修改',exact:true}).click();await adoptable();
  }
  await page.screenshot({path:`output/playwright/original-topology-factors-main-1010/dual/browser-${kind}-preview.png`,fullPage:true});
  await button('采用折痕副本 →').click();await button('折痕编辑').click();
  await page.getByLabel('工程名称').fill(`DualFaces1010-${kind}`);
  for(const format of ['json','fold','dxf'])await exported(`browser-${kind}`,format);
  check(true,`${kind}实际普通JSON/FOLD/LINE DXF下载`);
  for(const format of ['json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/original-topology-factors-main-1010/dual/original-topology-factors-main-1010/dual/browser-${kind}.${format}`);await page.waitForTimeout(150);await exported(`browser-${kind}-${format}-reimport`,'json');check(true,`${kind}/${format}主App实际导入再导出`);}
  const saving=page.waitForResponse(r=>r.url().includes('/api/projects')&&r.request().method()==='POST');await button('保存工程').click();const saved=await saving;check(saved.ok(),`${kind}隔离工程库保存成功`);await capture(await saved.json(),`browser-${kind}-saved-response.json`);
  await page.locator('.save-dot.saved').waitFor();await page.reload();await page.evaluate(()=>window.confirm=()=>true);if(await button('保留当前工程').count())await button('保留当前工程').click();
  await button('工程库').click();await page.locator('.project-list button').filter({hasText:`DualFaces1010-${kind}`}).first().click();
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,`DualFaces1010-${kind}`);await exported(`browser-${kind}-library-reopen`,'json');check(true,`${kind}实际重载页面并从工程库重开`);
 }
 await button('镶嵌设计').click();await button('05 原始—对偶').click();pending=response(p=>p.faceupFace===1&&p.motherParams?.sides===11);await button('载入旋转梯形诊断例 · In[3386]').click();const in3386=await(await pending).json();
 check(in3386.dual.faces_vertices.length===22&&in3386.dual.zhezhi_dual_primal_vertices.length===22,'原In3386主App实际补回22原序面及22内点映射');await capture(in3386,'browser-in3386-response.json');await ready();check(await button('采用折痕副本 →').isDisabled(),'原In3386既有无解采用门禁保留');await page.screenshot({path:'output/playwright/original-topology-factors-main-1010/dual/browser-in3386-gate.png',fullPage:true});
 check(errors.length===0,'零浏览器页面运行异常');const report={verified:true,passed:checks.length,checks,errors,bundle:await page.locator('script[type="module"]').getAttribute('src')};await capture(report,'browser-checks.json');return report;
}
