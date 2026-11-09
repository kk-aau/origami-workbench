async page=>{
 const checks=[],check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);},button=name=>page.getByRole('button',{name,exact:true});
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 const requests=[];const record=r=>{if(r.url().endsWith('/api/tessellate'))requests.push(r.postDataJSON());};page.on('request',record);
 const next=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));
 const idle=()=>page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算');
 try{
  await button('折痕编辑').click();let done=next();await button('镶嵌设计').click();await done;await idle();
  done=next();await button('08 铺石镶嵌').click();await done;await idle();
  let release;const gate=new Promise(resolve=>release=resolve);
  const hold=async route=>{await gate;await route.continue().catch(()=>{});};await page.route('**/api/tessellate',hold);
  const count=requests.length;let started=page.waitForRequest(r=>r.url().endsWith('/api/tessellate'));
  await page.getByLabel('褶宽比',{exact:true}).fill('.31');await started;await page.getByLabel('褶宽比',{exact:true}).fill('.33');await button('取消本次计算').click();release();await page.unrouteAll({behavior:'wait'});await idle();await page.waitForTimeout(600);
  check(requests.length===count+1,'取消计算同时停止尚未执行的参数更新');check(await button('采用折痕副本 →').isDisabled(),'取消后不能采用旧参数结果');
  done=next();await page.getByLabel('褶宽比',{exact:true}).fill('.34');check((await done).ok(),'取消后再次修改能恢复自动预览');await idle();
  done=next();await button('01 单元扭转').click();await done;await idle();
  done=next();await page.getByLabel('旋转角度',{exact:true}).fill('0');check((await done).status()===422,'不支持的构造参数显示后端错误');await idle();const failed=requests.length;await page.waitForTimeout(500);check(requests.length===failed,'失败参数不会无限重新计算');check(await button('采用折痕副本 →').isDisabled(),'失败后不能采用旧结果');
  done=next();await page.getByLabel('旋转角度',{exact:true}).fill('36');check((await done).ok(),'纠正参数自动恢复');await idle();
  started=page.waitForRequest(r=>r.url().endsWith('/api/tessellate'));await page.getByLabel('旋转角度',{exact:true}).fill('38');await started;await button('折痕编辑').click();done=next();await button('镶嵌设计').click();check((await done).ok(),'快速离开并返回没有并发计算冲突');await idle();check(await button('采用折痕副本 →').isEnabled(),'返回工作区后最新候选可采用');
  return {passed:checks.length,checks};
 }finally{page.off('request',record);}
}
