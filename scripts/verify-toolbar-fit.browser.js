async page=>{
 const results=[];
 await page.getByRole('button',{name:'折痕编辑',exact:true}).click();
 const hide=page.getByRole('button',{name:'收起平折',exact:true});if(await hide.count())await hide.click();
 await page.getByRole('button',{name:'绘图工具',exact:true}).click();
 for(const [width,height] of [[1440,1000],[1280,800],[1000,720],[800,600]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const report=await page.locator('.dense-tools-viewport').evaluateAll(nodes=>nodes.map(node=>{
   const frame=node.getBoundingClientRect(),buttons=[...node.querySelectorAll('button[data-tool]')];
   return {count:buttons.length,overflow:node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1,clipped:buttons.filter(button=>{const r=button.getBoundingClientRect();return r.top<frame.top-1||r.left<frame.left-1||r.bottom>frame.bottom+1||r.right>frame.right+1||r.width<1||r.height<1;}).map(button=>button.dataset.tool)};
  }));
  if(report.length!==2||report.reduce((n,p)=>n+p.count,0)!==93||report.some(p=>p.overflow||p.clipped.length))throw Error(width+'×'+height+' 工具未完全显示 '+JSON.stringify(report));
  results.push(width+'×'+height+'：93 工具无滚动、无分页且全部在可见区域');
  await page.screenshot({path:'output/playwright/toolbar-final-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:1000});return {passed:results.length,results};
}
