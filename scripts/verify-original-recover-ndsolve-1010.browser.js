async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const dialog=()=>page.getByRole('dialog',{name:'曲线系统与恢复'}),
  ready=()=>page.waitForFunction(()=>document.querySelector('.native-system-helpers-dialog .nsh-status')?.getAttribute('data-status')==='ready'),
  invalid=()=>page.waitForFunction(()=>document.querySelector('.native-system-helpers-dialog .nsh-status')?.getAttribute('data-status')==='error'),
  responseFor=(mode,options)=>page.waitForResponse(r=>{if(!r.url().endsWith('/api/tessellation/curved-system-helpers-generic'))return false;const q=r.request().postDataJSON();return q?.mode===mode&&(options===null?!q.ndsolveOptions:JSON.stringify(q.ndsolveOptions)===JSON.stringify(options));});
 const save=async(name,button)=>{const pending=page.waitForEvent('download');await dialog().getByRole('button',{name:button,exact:true}).click();await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/${name}.json`);};
 const capture=async(name,response)=>{const pending=page.waitForEvent('download');await page.evaluate(r=>{const u=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='response.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},response);await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/${name}-response.json`);};
 await page.setViewportSize({width:1380,height:900});if(await dialog().getByLabel('曲线系统模式',{exact:true}).inputValue()!=='curve2'){const fresh=responseFor('curve2',null);await dialog().getByLabel('曲线系统模式',{exact:true}).selectOption('curve2');await fresh;}await ready();
 check(await dialog().getByLabel('曲线恢复 MaxSteps',{exact:true}).count()===0,'普通曲线系统没有塞入恢复步选项');
 for(const mode of ['recover2','recover3','recover-darboux']){
  const baseline=responseFor(mode,null);await dialog().getByLabel('曲线系统模式',{exact:true}).selectOption(mode);const old=await(await baseline).json();await ready();
  check(!old.diagnostics.integration.stepOptions&&!old.query.ndsolveOptions,`${mode}默认完整结果没有新增选项字段`);
  check(await dialog().getByLabel('曲线恢复 MaxSteps',{exact:true}).inputValue()==='',`${mode}未显式指定时控件留空`);
  const adopting=responseFor(mode,{MaxSteps:128,MaxStepSize:.02});await dialog().getByRole('button',{name:'采用步控制原初值示例',exact:true}).click();const r=await(await adopting).json();await ready();
  const s=r.diagnostics.integration.stepOptions;
  check(s.forwardSteps>0&&s.backwardSteps>0,`${mode}真实原s域从内部ui恢复两个方向`);
  check(r.initial.parameter===.4&&r.initial.frame[0][0]===2&&!r.initial.frameCompatible,`${mode}保留非单位raw初标架及原ui`);
  check(!r.certification.adoptableCreasePattern&&!r.source.wolframOptionsReproduced,`${mode}没有伪造CP或完整Wolfram控制器证书`);
  check(await dialog().locator('.nsh-drawing svg').count()===1,`${mode}实际显示恢复曲线及标架`);
  const inputBox=await dialog().getByLabel('曲线恢复 MaxStepSize',{exact:true}).boundingBox(),presetBox=await dialog().getByRole('button',{name:'采用步控制原初值示例',exact:true}).boundingBox();check(inputBox&&presetBox&&presetBox.y>=inputBox.y+inputBox.height,`${mode}示例按钮与原步输入分行且不重叠`);
  check((await dialog().locator('.nsh-proof').innerText()).includes(`${s.forwardSteps} / ${s.backwardSteps}`),`${mode}界面显示真实前后成功步`);
  await capture(mode+'-preset',r);await save(mode+'-preset-source','保存源');await save(mode+'-preset-rules','导出规则');
  const picture=await dialog().locator('.nsh-drawing svg').innerHTML(),reloading=responseFor(mode,{MaxSteps:128,MaxStepSize:.02});
  await dialog().getByLabel('载入曲线系统源文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/${mode}-preset-source.json`);await reloading;await ready();
  check(await dialog().locator('.nsh-drawing svg').innerHTML()===picture,`${mode}真实下载源再载入保持全部画面`);
  const editing=responseFor(mode,{MaxSteps:128,MaxStepSize:.01});await dialog().getByLabel('曲线恢复 MaxStepSize',{exact:true}).fill('.01');const edited=await(await editing).json();await ready();
  check(edited.diagnostics.integration.stepOptions.forwardSteps+edited.diagnostics.integration.stepOptions.backwardSteps>s.forwardSteps+s.backwardSteps,`${mode}直接编辑原s步长实际增加成功步数`);
  await capture(mode+'-edited',edited);await save(mode+'-edited-source','保存源');await save(mode+'-edited-rules','导出规则');
  const failing=responseFor(mode,{MaxSteps:1,MaxStepSize:.01});await dialog().getByLabel('曲线恢复 MaxSteps',{exact:true}).fill('1');const fail=await failing;await invalid();
  check(fail.status()===422&&(await fail.json()).error.includes('max-steps-exceeded'),`${mode}真实MaxSteps预算不足明确拒绝`);
  check(await dialog().locator('.nsh-drawing svg').count()===0&&await dialog().getByRole('button',{name:'导出规则',exact:true}).isDisabled(),`${mode}失败立即移除旧结果并禁用完整规则导出`);
  const restored=responseFor(mode,{MaxSteps:128,MaxStepSize:.02});await dialog().getByRole('button',{name:'采用步控制原初值示例',exact:true}).click();await restored;await ready();
  check(await dialog().locator('.nsh-drawing svg').count()===1,`${mode}预算失败后可重新完整构造`);
 }
 await dialog().getByLabel('载入曲线系统源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/wrong-goal-source.json');await invalid();
 check((await dialog().getByRole('status').innerText()).includes('显式MaxSteps')&&await dialog().getByRole('button',{name:'导出规则',exact:true}).isDisabled(),'保存源里的原未覆盖精度目标严格拒绝');
 const restore=responseFor('recover2',{MaxSteps:128,MaxStepSize:.02});await dialog().getByLabel('载入曲线系统源文件',{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/recover2-raw-interior-source.json');await restore;await ready();
 await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/desktop.png',fullPage:true});
 await page.setViewportSize({width:640,height:960});await dialog().getByLabel('曲线恢复 MaxStepSize',{exact:true}).scrollIntoViewIfNeeded();
 const box=await dialog().getByLabel('曲线恢复 MaxStepSize',{exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗真实原步输入可以操作');
 const narrowPreset=await dialog().getByRole('button',{name:'采用步控制原初值示例',exact:true}).boundingBox();check(narrowPreset&&box&&narrowPreset.y>=box.y+box.height,'窄窗原步输入和示例按钮不重叠');
 await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-recover-ndsolve-browser-1010/mobile.png',fullPage:true});await page.setViewportSize({width:1380,height:900});
 const cleared=responseFor('recover2',null);await dialog().getByRole('button',{name:'重置',exact:true}).click();const defaultAgain=await(await cleared).json();await ready();
 check(!defaultAgain.query.ndsolveOptions&&await dialog().getByLabel('曲线恢复 MaxStepSize',{exact:true}).inputValue()==='','重置后无选项旧结果和来源恢复');
 check(errors.length===0,'零页面运行异常');return {passed:checks.length,checks,errors};
}
