async page=>{
const closing=page.getByRole('button',{name:'关闭镶嵌窗口',exact:true});if(await closing.count())await closing.click();
await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();
if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools > summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-generic-cone-flatten');
if(await page.getByLabel('通用Darboux构造范围',{exact:true}).inputValue()==='saved')await page.getByLabel('通用Darboux构造范围',{exact:true}).selectOption('general');
const cases=[{"name": "noncircular-interior", "query": {"family": "flatten-generic-native", "baseCurve": ["s", ".1*s**2", ".2*s**3"], "director": ["0", "0", "1"], "sigma": 1, "parameterStart": 0.0, "parameterEnd": 1.0, "transverseStart": -0.2, "transverseEnd": 0.2, "segments": 16, "rulingSegments": 4, "initialParameter": 0.37, "initialPoint": [2.0, -3.0], "initialTangent": [1.0, 0.0], "interpolationPoints": 8, "resample": true, "interpolationOrder": 1}}, {"name": "affine-cylinder", "query": {"family": "flatten-generic-native", "baseCurve": ["s", "0", "0"], "director": ["0", "0", "2"], "sigma": 1, "parameterStart": 0.0, "parameterEnd": 1.0, "transverseStart": -0.2, "transverseEnd": 0.2, "segments": 16, "rulingSegments": 4, "initialParameter": 0.37, "initialPoint": [2.0, -3.0], "initialTangent": [1.0, 0.0], "interpolationPoints": 7, "resample": true, "interpolationOrder": 1}}, {"name": "original-cone", "query": {"family": "flatten-generic-native", "baseCurve": ["cos(pi/6)", "-sin(pi/6)*cos(s)", "sin(pi/6)*sin(s)"], "director": ["-cos(pi/6)", "sin(pi/6)*cos(s)", "-sin(pi/6)*sin(s)"], "sigma": 1, "parameterStart": 0.0, "parameterEnd": 3.141592653589793, "transverseStart": -1.0, "transverseEnd": 1.0, "segments": 16, "rulingSegments": 4, "initialParameter": 0.0, "initialPoint": [1.0, 0.0], "initialTangent": [0.0, 1.0], "interpolationPoints": 8, "resample": true, "interpolationOrder": 1}}, {"name": "irregular-domain", "query": {"family": "flatten-generic-native", "baseCurve": ["s", ".1*s**2", ".2*s**3"], "director": ["0", "0", "1"], "sigma": 1, "parameterStart": 0.13, "parameterEnd": 0.97, "transverseStart": -0.2, "transverseEnd": 0.2, "segments": 16, "rulingSegments": 4, "initialParameter": 0.31, "initialPoint": [0.0, 0.0], "initialTangent": [1.0, 0.0], "interpolationPoints": 11, "resample": true, "interpolationOrder": 1}}];

const checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},dialog=page.getByRole('dialog',{name:'第 45 节 · 原生曲面展开',exact:true});
const ready=()=>page.waitForFunction(()=>document.querySelector('[data-testid="native-darboux-status"]')?.classList.contains('ready'));
await page.setViewportSize({width:1280,height:800});await dialog.getByRole('button',{name:'恢复非圆原式与原初值',exact:true}).click();await ready();
check(await dialog.getByLabel('通用Darboux原Resample选项',{exact:true}).inputValue()==='default','旧默认连续恢复保持原入口');
const interactiveResponse=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-flatten-generic')&&r.request().postDataJSON()?.resample===true);
await dialog.getByLabel('通用Darboux原Resample选项',{exact:true}).selectOption('true');
await interactiveResponse;await ready();check((await dialog.getByRole('status').innerText()).includes('重采样 33 点'),'原选项控件实际调用公共API并显示包含两端的33点');
for(const c of cases){
 const q=c.query,pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-flatten-generic')&&r.request().postDataJSON()?.interpolationPoints===q.interpolationPoints);
 await dialog.getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles(`output/parallel/original-resample-1010/evidence/${c.name}-input.json`);
 const response=await pending,actual=await response.json();await ready();
 const recording=page.waitForEvent('download');await page.evaluate(r=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)]));const link=document.createElement('a');link.href=url;link.download='api-response.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},actual);await(await recording).saveAs(`output/playwright/original-resample-browser-${c.name}-response.json`);
 check(response.ok()&&actual.resampling.parameters.length===q.interpolationPoints+1,`${c.name}真实公共API完成ip+1均匀采样`);
 check(actual.certification.formalIsometryCertified===false&&actual.certification.adoptableCreasePattern===false,`${c.name}实际插值没有冒充连续等距或CP采用`);
 check(actual.query.initialParameter===q.initialParameter&&JSON.stringify(actual.query.initialPoint)===JSON.stringify(q.initialPoint),`${c.name}原初值及域不移动`);
 check(await dialog.getByLabel('通用Darboux原InterpolationPoints',{exact:true}).inputValue()===String(q.interpolationPoints),`${c.name}载入完整原选项参数`);
 const path=actual.sample.rows.map((r,i)=>`${i?'L':'M'}${r.normalizedTargetBase[0].toPrecision(10)} ${(-r.normalizedTargetBase[1]).toPrecision(10)}`).join(' ');
 check(await dialog.locator('[data-testid="native-darboux-target"] .ndg-base').getAttribute('d')===path,`${c.name}预览绘制实际重采样目标几何`);
 const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'保存源 JSON',exact:true}).click();
 const filename=`output/playwright/original-resample-browser-${c.name}-source.json`;await(await downloading).saveAs(filename);
 check(true,`${c.name}真实下载源文件`);
 const reload=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-flatten-generic')&&r.request().postDataJSON()?.interpolationPoints===q.interpolationPoints);
 await dialog.getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles(filename);await reload;await ready();
 check(await dialog.locator('[data-testid="native-darboux-target"] .ndg-base').getAttribute('d')===path,`${c.name}真实下载文件重新载入恢复同一构形`);
}
await page.setViewportSize({width:640,height:960});await dialog.getByRole('button',{name:'保存源 JSON',exact:true}).scrollIntoViewIfNeeded();
const box=await dialog.getByRole('button',{name:'保存源 JSON',exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗口下源文件控件可滚动实际使用');
await page.screenshot({path:'output/playwright/original-resample-browser-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:800});
await dialog.getByRole('button',{name:'恢复非圆原式与原初值',exact:true}).click();await ready();
check(await dialog.getByLabel('通用Darboux原Resample选项',{exact:true}).inputValue()==='default','恢复原式回到连续恢复而不保留失效插值选项');
await dialog.getByLabel('通用Darboux原Resample选项',{exact:true}).selectOption('true');await ready();
await dialog.getByLabel('通用Darboux原InterpolationPoints',{exact:true}).fill('3');
check((await dialog.getByRole('alert').innerText()).includes('4–256'),'越过采样预算明确报错');
check(await dialog.locator('[data-testid="native-darboux-target"]').count()===0,'无效参数立即撤回旧几何');
await dialog.getByLabel('通用Darboux原InterpolationPoints',{exact:true}).fill('8');await ready();
await page.screenshot({path:'output/playwright/original-resample-browser-desktop.png',fullPage:true});check(errors.length===0,'零页面异常');
const report={passed:checks.length,checks,errors};return report;
}
