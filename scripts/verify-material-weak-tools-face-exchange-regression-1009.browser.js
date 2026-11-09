async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>{window.confirm=()=>true;});
 for(const [source,format]of [['final','dxf'],['mountain','cp'],['mountain','dxf']]){
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-weak-tools-face-regression-${source}-1009.zhezhi.json`);
  await page.getByRole('button',{name:'导出作品',exact:true}).click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);
  if(format==='cp')await d.getByLabel('CP 坐标',{exact:true}).selectOption('original');
  const saved=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saved).saveAs(`output/playwright/material-weak-tools-face-regression-${source}-1009.${format}`);await page.getByRole('button',{name:'关闭窗口',exact:true}).click();checks.push(`${source}实际普通${format.toUpperCase()}下载`);
 }
 if(errors.length)throw Error(errors.join('\n'));checks.push('零页面异常');return {passed:checks.length,checks,errors};
}
