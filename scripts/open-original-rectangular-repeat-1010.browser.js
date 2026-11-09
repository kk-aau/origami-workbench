async page=>{
  await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
  await page.getByRole('button',{name:'空间构造'}).click();
  await page.getByLabel('空间构造类型',{exact:true}).selectOption('rectangular-pot');
  await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
  return {opened:true};
}
