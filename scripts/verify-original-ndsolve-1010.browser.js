async page=>{
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
const dialog=()=>page.getByRole('dialog'),ready=()=>page.waitForFunction(()=>document.querySelector('.native-generic-darboux-dialog .csp-status')?.classList.contains('ready')),
 invalid=()=>page.waitForFunction(()=>document.querySelector('.native-generic-darboux-dialog .csp-status')?.classList.contains('error')),
 responseFor=path=>page.waitForResponse(r=>r.url().endsWith('/api/tessellation/'+path)&&r.request().postDataJSON()?.ndsolveOptions);
const capture=async(actual,name)=>{const pending=page.waitForEvent('download');await page.evaluate(r=>{const u=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)])),a=document.createElement('a');a.href=u;a.download='public-response.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},actual);await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-${name}-response.json`);};
const openSteps=async()=>{if(await dialog().locator('.ndg-step-options').getAttribute('open')===null)await dialog().locator('.ndg-step-options summary').click();};
const sourceDownload=async name=>{const pending=page.waitForEvent('download');await dialog().getByRole('button',{name:'保存源 JSON',exact:true}).click();await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-${name}-source.json`);};
await page.setViewportSize({width:1360,height:860});await ready();await openSteps();
check(await dialog().getByLabel('通用Darboux原NDSolve步选项模式',{exact:true}).inputValue()==='default','默认保持现有连续数值求解和固定容差');
for(const name of ['flatten-maxsteps','flatten-step-size','flatten-resample4','in3886-reparameterized-coarse','in3886-reparameterized-fine']){
 const pending=responseFor('curved-flatten-generic');await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/${name}-input.json`);
 const response=await pending,actual=await response.json();await ready();await openSteps();const step=actual.diagnostics.integration.stepOptions;
 check(response.ok()&&step.forwardSteps>0,`${name}真实公共API完成显式步选项求解`);
 check(step.backwardParameters[0]===actual.query.initialParameter&&step.forwardParameters.at(-1)===actual.query.parameterEnd,`${name}原域和原初值完整保留`);
 check(step.sourceInputsPreserved&&!step.wolframStepControllerReproduced&&!step.errorGoalNormReproduced,`${name}没有冒称原误差范数与内核控制器`);
 check(!actual.certification.adoptableCreasePattern&&!actual.certification.integrationErrorIntervalCertified,`${name}未伪造数值曲面CP或积分区间证书`);
 check(await dialog().locator('.csp-panels svg').count()===2,`${name}实际源与恢复双视图`);
 check((await dialog().locator('[data-testid="ndg-step-usage"]').innerText()).includes(`+ ${step.forwardSteps}`),`${name}界面显示实际成功步数`);
 await capture(actual,name);await sourceDownload(name);const picture=await dialog().locator('.csp-panels').innerHTML(),reimport=responseFor('curved-flatten-generic');
 await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-${name}-source.json`);await reimport;await ready();
 check(await dialog().locator('.csp-panels').innerHTML()===picture,`${name}真实下载源参数再导入保持同一实际构形`);
}
const failing=responseFor('curved-flatten-generic');await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/maxsteps-one-input.json');
const failResponse=await failing;await invalid();check(failResponse.status()===422&&(await failResponse.json()).error.includes('max-steps-exceeded'),'MaxSteps=1真实停止并拒绝未完成原域');
check(await dialog().locator('.csp-panels svg').count()===0,'步预算失败不返回缩域或保留旧曲面');
for(const file of ['wrong-goal','too-small-step']){
 await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/${file}-input.json`);await invalid();
 check((await dialog().getByRole('alert').innerText()).length>0,`${file}不支持选项明确拒绝`);
}
const recovering=responseFor('curved-flatten-generic');await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/flatten-step-size-input.json');await recovering;await ready();await openSteps();
const editResponse=responseFor('curved-flatten-generic');await dialog().getByLabel('通用Darboux原MaxStepSize',{exact:true}).fill('.02');const edit=await(await editResponse).json();await ready();
check(edit.query.ndsolveOptions.MaxStepSize===.02&&edit.diagnostics.integration.stepOptions.forwardSteps<100,'界面直接编辑原s步长真实改变步数');
await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-desktop.png',fullPage:true});
await page.setViewportSize({width:640,height:960});await dialog().getByRole('button',{name:'保存源 JSON',exact:true}).scrollIntoViewIfNeeded();
const box=await dialog().getByRole('button',{name:'保存源 JSON',exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗原步选项与真实下载控件可操作');
await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-mobile.png',fullPage:true});
await page.setViewportSize({width:1360,height:860});await dialog().getByRole('button',{name:'关闭',exact:true}).click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-generic-reshape');await ready();await openSteps();
const reshaping=responseFor('curved-reshape-generic');await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/reshape-both-interior-input.json');
const reshape=await(await reshaping).json();await ready();await capture(reshape,'reshape-both-interior');await sourceDownload('reshape-both-interior');
check(reshape.diagnostics.integration.stepOptions.backwardSteps===40&&reshape.diagnostics.integration.stepOptions.forwardSteps===60,'三维重塑内部原初值实际完成双向40＋60步');
check(await dialog().locator('.csp-panels svg').count()===2,'三维重塑步选项生成实际双三维曲面');
const reimport=responseFor('curved-reshape-generic');await dialog().getByLabel('载入通用Darboux源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-ndsolve-browser-1010/browser-reshape-both-interior-source.json');await reimport;await ready();
check((await dialog().locator('[data-testid="ndg-step-usage"]').innerText()).includes('40 + 60'),'三维重塑真实源下载再载入保持双向步数和原初值');
await dialog().getByRole('button',{name:'恢复非圆原式与原初值',exact:true}).click();await ready();
check(await dialog().getByLabel('通用Darboux原NDSolve步选项模式',{exact:true}).inputValue()==='default','恢复原例后没有偷偷附入显式求解选项');
check(errors.length===0,'零页面运行异常');return {passed:checks.length,checks,errors};
}
