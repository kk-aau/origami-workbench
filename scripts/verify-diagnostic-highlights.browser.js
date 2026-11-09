async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 await page.evaluate(()=>window.confirm=()=>true);
 const doc={schemaVersion:2,name:'红色诊断高亮验收',paper:{width:200,height:200},objects:[],segments:[
  {id:'b0',a:[0,0],b:[200,0],assignment:'B',angle:0},{id:'b1',a:[200,0],b:[200,200],assignment:'B',angle:0},
  {id:'b2',a:[200,200],b:[0,200],assignment:'B',angle:0},{id:'b3',a:[0,200],b:[0,0],assignment:'B',angle:0},
  {id:'bad-left',a:[40,110],b:[80,110],assignment:'V',angle:180},
  {id:'bad-right',a:[120,160],b:[160,160],assignment:'M',angle:-180}
 ]};
 await page.evaluate(doc=>{const input=document.querySelector('input[aria-label="折痕工程文件"]'),transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify({...doc,format:'zhezhi-workbench',version:2})],'errors.zhezhi.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},doc);
 await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]').value==='红色诊断高亮验收');
 const highlights=page.locator('[data-diagnostic-highlight]'),points=page.locator('[data-diagnostic-point]');
 check(await highlights.count()===0,'检查前没有诊断高亮');
 await page.getByRole('button',{name:'检查折痕',exact:true}).click();
 check(await page.locator('.issue.error').count()>=2,'存在多项不同位置的错误');
 check(await highlights.count()===2,'完整检查默认同时高亮两处错误线');
 check(await points.count()===4,'同时高亮四个出错端点');
 check((await page.locator('.diagnostic-head>strong').boundingBox()).height<30&&(await page.locator('.diagnostic-head>.muted').boundingBox()).height<30,'窄画布检查栏标题和统计保持正常横排');
 const colors=await page.locator('[data-diagnostic-highlight] line,[data-diagnostic-point]').evaluateAll(els=>els.map(el=>getComputedStyle(el).stroke));
 check(colors.every(s=>s==='rgb(229, 57, 53)'),'所有诊断高亮统一为红色');
 await page.screenshot({path:'output/playwright/diagnostic-all-errors-20260930.png'});
 const rows=page.locator('.issue.error');await rows.nth(0).click();
 check(await highlights.count()===1&&await points.count()===1,'点击单个错误只显示对应线和顶点');
 check(await rows.nth(0).getAttribute('aria-pressed')==='true','列表标明当前查看的错误');
 const selectionColors=await page.locator('[data-segment] circle').evaluateAll(els=>els.map(el=>getComputedStyle(el).stroke));
 check(selectionColors.length===2&&selectionColors.every(s=>s==='rgb(229, 57, 53)'),'错误线的选中端点同样采用红色');
 const first=await highlights.first().getAttribute('data-diagnostic-highlight');
 await rows.nth(1).click();check(await highlights.count()===1&&await points.count()===1,'切换错误仍只显示一项');
 check(await highlights.first().getAttribute('data-diagnostic-highlight')!==first,'切换错误更新对应位置');
 await page.screenshot({path:'output/playwright/diagnostic-single-error-20260930.png'});
 await page.getByRole('button',{name:'全部错误',exact:true}).click();check(await highlights.count()===2&&await points.count()===4,'全部错误按钮恢复总览');
 await rows.first().click();await page.getByRole('button',{name:'完整检查',exact:true}).click();check(await highlights.count()===2,'重新检查恢复全部错误');
 await page.getByRole('button',{name:'局部 cAMV',exact:true}).click();check(await highlights.count()===2&&await points.count()===4,'局部检查同样默认高亮全部错误');
 await page.getByRole('button',{name:'收起检查结果',exact:true}).click();check(await highlights.count()===0&&await points.count()===0,'关闭结果清除诊断高亮');
 await page.getByRole('button',{name:'检查折痕',exact:true}).click();await page.locator('.issue.error').first().click();
 await page.keyboard.press('Delete');
 check(await page.locator('[data-segment]').count()===5,'错误行保留选中线的编辑能力');
 check(await highlights.count()===0&&await points.count()===0,'修改工程撤下过期高亮');
 check(await page.getByRole('button',{name:'全部错误',exact:true}).isDisabled(),'过期结果不能重新显示旧高亮');
 await page.getByRole('button',{name:'完整检查',exact:true}).click();check(await highlights.count()===1,'重新检查只显示尚存的错误');
 check(errors.length===0,'浏览器没有运行异常');
 return {checks:checks.length,results:checks,errors};
}
