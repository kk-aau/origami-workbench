async page=>{
 const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 await page.setViewportSize({width:1000,height:720});
 const requests=[];const record=request=>{if(request.url().endsWith('/api/tessellate'))requests.push(request.postDataJSON());};page.on('request',record);
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));
 const ready=()=>page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算'&&document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 try{
  await button('折痕编辑').click();let next=response();await button('镶嵌设计').click();check((await next).ok(),'进入镶嵌自动计算');await ready();await button('01 单元扭转').click();await ready();
  next=response();await page.getByLabel('旋转角度滑条',{exact:true}).focus();await page.keyboard.press('ArrowRight');const slider=await(await next).json();await ready();
  check(slider.stats.parameters.angle===37,'滑条键盘调节自动计算');check(await page.getByLabel('旋转角度',{exact:true}).inputValue()==='37','滑条同步数字框');
  next=response();await page.getByLabel('旋转角度',{exact:true}).fill('40');const numeric=await(await next).json();await ready();check(numeric.stats.parameters.angle===40,'数字框无需回车或失焦自动计算');
  check(await page.getByLabel('旋转角度滑条',{exact:true}).inputValue()==='40','数字框同步滑条');
  next=response();await page.getByLabel('旋转角度',{exact:true}).press('ArrowUp');check((await(await next).json()).stats.parameters.angle===41,'数字框步进键即时生效');await ready();
  const before=requests.length;await page.getByLabel('旋转角度',{exact:true}).fill('');await page.waitForTimeout(350);check(requests.length===before,'空数字草稿不发送错误计算');
  next=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON().angle===45);for(const value of ['42','43','44','45'])await page.getByLabel('旋转角度',{exact:true}).fill(value);const combined=await(await next).json();await ready();check(combined.stats.parameters.angle===45&&requests.length<=before+4,'连续修改持续更新并最终收敛到最新参数');
  let started=page.waitForRequest(r=>r.url().endsWith('/api/tessellate'));await page.getByLabel('旋转角度',{exact:true}).fill('46');await started;
  next=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON().angle===48);
  await page.getByLabel('旋转角度',{exact:true}).fill('48');check(await page.evaluate(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false'||Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='采用折痕副本 →')?.disabled),'计算中改参数立即阻止采用旧结果');const latest=await(await next).json();await ready();check(latest.stats.parameters.angle===48,'计算期间的修改继续自动计算最新参数');
  check(await page.locator('[data-segment]').count()===latest.stats.edges,'画布显示最新请求结果');
  for(const [i,name] of ['单元扭转','周期拼接','原始—对偶','混合平铺','非周期','自定义','环状镶嵌','铺石镶嵌','盒褶编织'].entries()){
   next=response();await button(`${String(i+1).padStart(2,'0')} ${name}`).click();check((await next).ok(),name+' 切换自动生成');await ready();
   check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),name+' 滑条布局无需滚动');
   check(await page.locator('.tess-controls input[type=range]').count()===await page.locator('.tess-controls input[type=number]').count(),name+' 数值均配滑条和数字框');
  }
  next=response();await button('08 铺石镶嵌').click();await next;await ready();await button('母结构').click();
  next=response();const range=page.getByLabel('褶宽比滑条',{exact:true}),box=await range.boundingBox();await page.mouse.move(box.x+box.width*.43,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height/2,{steps:12});await page.mouse.up();await next;await ready();check(await button('母结构').getAttribute('aria-pressed')==='true','鼠标拖动自动更新且保留参考视图');
  await button('折痕图').click();await page.screenshot({path:'output/playwright/tessellation-live.png'});
  return {passed:checks.length,checks,requests:requests.length};
 }finally{page.off('request',record);}
}
