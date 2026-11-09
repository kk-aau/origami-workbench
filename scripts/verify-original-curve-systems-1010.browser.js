async page=>{
await page.evaluate(()=>window.confirm=()=>true);
const close=page.getByRole('button',{name:'关闭镶嵌窗口',exact:true});if(await close.count())await close.last().click();
await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();
if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools>summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-linked-first-band');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('common-parameter');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('generic-common-parameter');

const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},dialog=page.getByRole('dialog',{name:'第 45 节 · 通用原生曲线关联多带',exact:true}),
 ready=()=>page.waitForFunction(()=>document.querySelector('.generic-linked-dialog .huffman-status')?.classList.contains('ready'));
await page.setViewportSize({width:1280,height:800});await ready();await dialog.getByRole('button',{name:'恢复起始函数',exact:true}).click();await ready();
await dialog.getByLabel('载入通用关联曲线参数文件',{exact:true}).setInputFiles('output/original-function-browser-1010/curve-systems/uncached-input.json');await ready();
if(await dialog.locator('.generic-cache').getAttribute('open')===null)await dialog.locator('.generic-cache summary').click();
check(await dialog.getByLabel('通用外部系统前缀',{exact:true}).inputValue()==='none','旧入口未提供缓存选项保持连续原生计算');
const capture=async(actual,name)=>{const pending=page.waitForEvent('download');await page.evaluate(r=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)])),a=document.createElement('a');a.href=url;a.download='public-response.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},actual);await(await pending).saveAs(`output/original-function-browser-1010/curve-systems/browser-${name}-response.json`);};
let precomputing=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-curve2d-systems-native'));
await dialog.getByRole('button',{name:'预计算原曲线系统',exact:true}).click();const preparedResponse=await precomputing,prepared=await preparedResponse.json();await ready();
check(preparedResponse.ok()&&prepared.systems.length===3,'真实公共API预计算三个来源绑定系统');await capture(prepared,'precomputed');
for(const count of [1,2,3]){
 const changing=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-linked-first-band')&&r.request().postDataJSON()?.curve2DSystems?.length===count);
 await dialog.getByLabel('通用外部系统前缀',{exact:true}).selectOption(String(count));const response=await changing,actual=await response.json();await ready();await capture(actual,`prefix-${count}`);
 check(response.ok()&&actual.curve2DSystems.replacementIndices.length===count,`前${count}项原数组实际替换`);
 check(actual.curve2DSystems.evaluations.every(n=>n>0),`前${count}项外部规则实际求值`);
 check(actual.curve2DSystems.next2DThirdSystemUsed===false,`前${count}项没有捏造第三系统对原Next2D的影响`);
 check(actual.query.parameterStart===0&&actual.query.parameterEnd===.35&&actual.query.rootSeeds[0]===0,`前${count}项原域和根种子完整保留`);
 check((await dialog.locator('[data-testid="generic-cache-usage"]').innerText()).includes(`实际替换 ${count} 项`),`前${count}项界面显示真实来源使用`);
 const imageBefore=await dialog.locator('.huffman-panels').innerHTML();
 let downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出系统',exact:true}).click();const systemFile=`output/original-function-browser-1010/curve-systems/browser-prefix-${count}-systems.json`;await(await downloading).saveAs(systemFile);
 downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'保存参数',exact:true}).click();await(await downloading).saveAs(`output/original-function-browser-1010/curve-systems/browser-prefix-${count}-source.json`);
 const reimporting=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-linked-first-band')&&r.request().postDataJSON()?.curve2DSystems?.length===count);
 await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles(systemFile);await reimporting;await ready();
 check(await dialog.locator('.huffman-panels').innerHTML()===imageBefore,`前${count}项真实下载系统再导入恢复同一构形`);
 precomputing=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-curve2d-systems-native'));await dialog.getByRole('button',{name:'预计算原曲线系统',exact:true}).click();await precomputing;await ready();
}
const prior=await dialog.locator('.huffman-panels').innerHTML();await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles('output/original-function-browser-1010/curve-systems/forged-system-file.json');
check((await dialog.getByRole('alert').innerText()).includes('来源'),'伪造系统来源明确拒绝');check(await dialog.locator('.huffman-panels').innerHTML()===prior,'拒绝伪造来源时保留当前合法构形和原参数');
const poleRequest=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-linked-first-band')&&r.request().postData()?.includes('.123'));
await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles('output/original-function-browser-1010/curve-systems/pole-system-file.json');const pole=await poleRequest;
check(pole.status()===422&&(await pole.json()).error.includes('cache-domain'),'数值样点一致的隐藏极点由真实全域门禁拒绝');
await page.waitForFunction(()=>document.querySelector('.generic-linked-dialog .huffman-status')?.classList.contains('error'));
check(await dialog.locator('.huffman-panels svg').count()===0,'未证外部规则立即撤回旧几何');
const recovering=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-curve2d-systems-native'));await dialog.getByRole('button',{name:'预计算原曲线系统',exact:true}).click();await recovering;await ready();
check((await dialog.locator('[data-testid="generic-cache-usage"]').innerText()).includes('实际替换 3 项'),'明确重新预计算后恢复同源三项系统');
await page.screenshot({path:'output/original-function-browser-1010/curve-systems/browser-desktop.png',fullPage:true});
await page.setViewportSize({width:640,height:960});await dialog.getByRole('button',{name:'导出系统',exact:true}).scrollIntoViewIfNeeded();const box=await dialog.getByRole('button',{name:'导出系统',exact:true}).boundingBox();
check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗口外部系统导出控件实际可用');await page.screenshot({path:'output/original-function-browser-1010/curve-systems/browser-mobile.png',fullPage:true});
const automatic=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-linked-first-band')&&r.request().postDataJSON()?.curve2DSystems==='Automatic');
await dialog.getByLabel('通用外部系统前缀',{exact:true}).selectOption('Automatic');const auto=await(await automatic).json();await ready();
check(auto.curve2DSystems.systems==='Automatic'&&auto.curve2DSystems.evaluations.length===0,'原Automatic明确不使用外部系统');check(errors.length===0,'零页面异常');
return {passed:checks.length,checks,errors};
}
