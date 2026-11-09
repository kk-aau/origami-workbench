async page => {
  const checks=[],errors=[],check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
  const button=name=>page.getByRole('button',{name,exact:true}),canvas=page.locator('#workspace .crease-canvas');
  const point=coordinate=>canvas.evaluate((element,p)=>{const box=element.getBoundingClientRect(),view=element.viewBox.baseVal;return{x:box.left+(p[0]-view.x)/view.width*box.width,y:box.top+(p[1]-view.y)/view.height*box.height};},coordinate);
  const drag=async(a,b)=>{const from=await point(a),to=await point(b);await page.mouse.move(from.x,from.y);await page.mouse.down({button:'right'});await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up({button:'right'});};
  const exportDoc=async()=>{
    await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});
    await dialog.getByRole('combobox').first().selectOption('json');const pending=page.waitForEvent('download');
    await dialog.getByRole('button',{name:'导出文件',exact:true}).click();const download=await pending;
    const bytes=[];for await(const chunk of await download.createReadStream())bytes.push(...chunk);
    const result=await page.evaluate(data=>JSON.parse(new TextDecoder().decode(new Uint8Array(data))),bytes);
    await button('关闭窗口').click();return result;
  };
  const originalConfirm=await page.evaluate(()=>{window.__auxiliaryMaterialConfirm=window.confirm;window.confirm=()=>true;return true;});
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  try{
    await page.setViewportSize({width:1200,height:800});
    for(const name of ['设置并开始使用','关闭窗口','保留当前工程']){const b=button(name);if(await b.count()&&await b.isVisible())await b.click();}
    await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/auxiliary-edit-fixtures/material-with-auxiliary.zhezhi.json');
    await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='测试 · 材料辅助线编辑');
    if(await button('收起平折').count())await button('收起平折').click();
    await button('绘图工具').click();
    const protection=page.getByLabel('保护边界',{exact:true});if(!await protection.isChecked())await protection.check();
    const snap=page.getByLabel('吸附',{exact:true});if(await snap.isChecked())await snap.uncheck();
    const input=page.getByLabel('工具命令',{exact:true});await input.fill('V');await input.press('Enter');
    const before=await exportDoc();check(before.segments.some(segment=>segment.id==='guide'),'实际载入含辅助线的材料工程');
    const p=await point([100,130]);await page.mouse.click(p.x,p.y);
    check(await canvas.locator('[data-segment="guide"] > circle').count()===2,'材料工程中的辅助线可单独点击选择');
    const ids=await canvas.locator('[data-segment]').evaluateAll(elements=>elements.map(element=>element.dataset.segment).sort());
    await drag([-1,-1],[201,201]);
    check(await page.getByRole('alert').filter({hasText:'删除了材料边'}).count()===1,'混合框删明确显示材料拓扑拒绝原因');
    check(await canvas.locator('[data-segment="guide"] > circle').count()===2,'删除被拒绝后保留辅助线选区');
    check(JSON.stringify(await canvas.locator('[data-segment]').evaluateAll(elements=>elements.map(element=>element.dataset.segment).sort()))===JSON.stringify(ids),'删除被拒绝后所有工程线段仍在');
    check(!((await page.locator('.toast').allTextContents()).join('').includes('已删除')),'删除被拒绝后不误报已删除');
    const rejected=await exportDoc();check(JSON.stringify(rejected)===JSON.stringify(before),'拒绝操作后实际导出工程完全不变');
    if(await button('关闭错误提示').count())await button('关闭错误提示').click();
    await drag([20,125],[180,135]);
    await page.waitForFunction(()=>!document.querySelector('#workspace .crease-canvas [data-segment="guide"]'));
    check(await canvas.locator('[data-segment="guide"]').count()===0,'仅框住辅助线时右键删除成功');
    const deleted=await exportDoc();
    check(deleted.segments.length===before.segments.length-1,'仅删掉一条辅助线');
    check(JSON.stringify(deleted.segments)===JSON.stringify(before.segments.filter(segment=>segment.id!=='guide')),'全部材料边的身份、坐标和赋型保留');
    check(JSON.stringify(deleted.metadata)===JSON.stringify(before.metadata),'实际导出确认材料合同保留');
    await canvas.focus();await page.keyboard.press('Control+z');await page.waitForFunction(()=>!!document.querySelector('#workspace .crease-canvas [data-segment="guide"]'));
    check(JSON.stringify(await exportDoc())===JSON.stringify(before),'撤销恢复完整材料工程和辅助线');
    await canvas.focus();await page.keyboard.press('Control+y');await page.waitForFunction(()=>!document.querySelector('#workspace .crease-canvas [data-segment="guide"]'));
    check(JSON.stringify(await exportDoc())===JSON.stringify(deleted),'重做恢复仅删除辅助线的结果');
    check(errors.length===0,'材料选择、拒绝、删除、撤销、导出全流程无页面异常');
    return{passed:checks.length,checks,errors};
  }finally{page.off('pageerror',onError);if(originalConfirm)await page.evaluate(()=>{window.confirm=window.__auxiliaryMaterialConfirm;delete window.__auxiliaryMaterialConfirm;});}
}
