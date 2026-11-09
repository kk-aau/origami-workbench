async page=>{
await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/空间构造$/}).click();
await page.locator('summary').filter({hasText:'原式工具与参考示例'}).click();await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-generic-cone-flatten');
if(await page.getByLabel('通用Darboux构造范围',{exact:true}).inputValue()==='saved')await page.getByLabel('通用Darboux构造范围',{exact:true}).selectOption('general');
await page.waitForFunction(()=>document.querySelector('.native-generic-darboux-dialog .csp-status')?.classList.contains('ready'));
return {ready:true};
}
