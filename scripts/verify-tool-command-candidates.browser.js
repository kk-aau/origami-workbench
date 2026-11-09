async page=>{
 const checks=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const command=page.getByLabel('工具命令',{exact:true});
 const canvas=page.locator('#workspace .crease-canvas');
 const options=page.getByRole('listbox',{name:'工具命令候选'});
 const tool=()=>canvas.evaluate(e=>Array.from(e.classList).find(c=>c.startsWith('tool-')).slice(5));
 const waitTool=expected=>page.waitForFunction(t=>document.querySelector('#workspace .crease-canvas').classList.contains('tool-'+t),expected);
 const choose=async text=>{await command.fill(text);await command.press('Enter');};
 await choose('L');await waitTool('line');
 await command.fill('circl');await command.press('Enter');
 check(await tool()==='line','未完成的英文前缀按Enter不会误选第一个工具');
 await command.press('Escape');await command.fill('circl');await command.press('Tab');
 check(await command.inputValue()==='C','Tab将候选补成实际主命令');
 check(await tool()==='line','补全本身不启用工具');
 await command.press('Enter');await waitTool('circle');
 check(await tool()==='circle','补全后Enter实际启用圆');
 await command.fill('c');await command.press('ArrowDown');await command.press('ArrowDown');
 check((await options.getByRole('option',{selected:true}).textContent()).includes('两点复制'),'方向键明确选中复制候选');
 check(await command.getAttribute('aria-activedescendant')===await options.getByRole('option',{selected:true}).getAttribute('id'),'输入的活动候选与辅助读取状态一致');
 await command.press('Enter');await waitTool('copyselection');
 check(await tool()==='copyselection','已选候选优先于输入C的精确圆命令');
 await command.fill('mi');await options.getByRole('option').first().getByRole('button').click();await waitTool('mirrorselection');
 check(await command.inputValue()===''&&await canvas.evaluate(e=>document.activeElement===e),'点击候选执行工具且归还画布焦点');
 await choose('L');await waitTool('line');
 const count=await canvas.locator('[data-segment]').count();
 const start=await canvas.evaluate(e=>{const b=e.getBoundingClientRect(),v=e.viewBox.baseVal;return{x:b.left+(20-v.x)/v.width*b.width,y:b.top+(20-v.y)/v.height*b.height};});
 await page.mouse.click(start.x,start.y);
 check((await page.locator('#workspace .canvas-tag').textContent()).includes('已选 1 点'),'实际开始未提交的线段草稿');
 await command.fill('L');await command.press('Enter');
 await page.waitForFunction(()=>!document.querySelector('#workspace .canvas-tag').textContent.includes('已选 1 点'));
 check(await canvas.locator('[data-segment]').count()===count,'同一工具命令重新开始，不提交或保留旧草稿');
 await page.mouse.click(start.x,start.y);await command.focus();await command.press('Enter');
 await page.waitForFunction(()=>!document.querySelector('#workspace .canvas-tag').textContent.includes('已选 1 点'));
 check(await tool()==='line'&&await canvas.locator('[data-segment]').count()===count,'命令框空Enter重复上次工具，并清除未完成草稿');
 await canvas.focus();await page.keyboard.press('2');
 check((await page.locator('.statusbar').textContent()).includes('新线：谷折'),'CAD开启时数字2仍设置新线谷折');
 await page.keyboard.press('1');
 check((await page.locator('.statusbar').textContent()).includes('新线：山折'),'CAD开启时数字1仍设置新线山折');
 check(await command.inputValue()===''&&await tool()==='line','数字预设快捷键不产生工具命令');
 const popups=[];
 for(const size of [{width:1200,height:800},{width:1000,height:720}]){
  await page.setViewportSize(size);await command.focus();await command.fill('');
  const popup=await page.getByRole('listbox',{name:'工具命令候选'}).evaluate(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,count:e.querySelectorAll('[role="option"]').length};});
  check(popup.count===6&&popup.top>=0&&popup.bottom<=size.height&&popup.left>=0&&popup.right<=size.width&&popup.scrollHeight<=popup.clientHeight+1&&popup.scrollWidth<=popup.clientWidth+1,`${size.width}×${size.height}：六项完整候选无需滚动`);
  popups.push({size,...popup});await command.press('Escape');
 }
 return {passed:checks.length,checks,popups};
}
