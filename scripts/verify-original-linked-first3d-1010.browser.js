async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},dialog=()=>page.getByRole('dialog'),
  ready=()=>page.waitForFunction(()=>document.querySelector('.tess-dialog[open] .huffman-status')?.classList.contains('ready')),
  invalid=()=>page.waitForFunction(()=>document.querySelector('.tess-dialog[open] .huffman-status')?.classList.contains('error')),
  responseFor=(variant,options)=>page.waitForResponse(r=>{if(!r.url().endsWith('/api/tessellation/curved-linked-first-band'))return false;const q=r.request().postDataJSON();return (q?.variant??'saved')===variant&&(options===null?!q.ndsolveOptions:JSON.stringify(q.ndsolveOptions)===JSON.stringify(options));});
 const save=async(name,button)=>{const pending=page.waitForEvent('download');await dialog().getByRole('button',{name:button,exact:true}).click();await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/${name}.json`);},
  capture=async(name,r)=>{const pending=page.waitForEvent('download');await page.evaluate(r=>{const u=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='response.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},r);await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/${name}-response.json`);};
 await page.setViewportSize({width:1380,height:900});await ready();
 const modes=[{name:'saved-first',variant:'saved',file:'载入关联首First3D参数文件'},
  {name:'saved-chain',variant:'saved-chain',file:'载入关联首First3D参数文件'},
  {name:'common',variant:'common-parameter',file:'载入关联多带参数文件'},
  {name:'generic',variant:'generic-common-parameter',file:'载入通用关联曲线参数文件'},
  {name:'independent',variant:'generic-common-parameter',file:'载入通用关联曲线参数文件'}];
 for(const mode of modes){
  if(mode.name!=='saved-first'&&mode.name!=='independent'){const baseline=responseFor(mode.variant,null);await dialog().getByLabel('关联同心圆构造范围',{exact:true}).selectOption(mode.variant);const old=await(await baseline).json();await ready();check(!old.first3DIntegration&&!old.query.ndsolveOptions,`${mode.name}默认无opts保持旧结果字段`);}
  if(mode.name==='independent'){const loading=responseFor(mode.variant,{MaxSteps:4096,MaxStepSize:.01});await dialog().getByLabel(mode.file,{exact:true}).setInputFiles('D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/independent-raw-prefix-2-smallstep-source.json');const imported=await(await loading).json();await ready();
   check(imported.query.curve2DSystemsMode==='independent-external'&&imported.first3DIntegration.initialState[3]===2&&imported.first3DIntegration.initialState[7]===3,'独立外部系统raw T=2/L=3在真实界面保留');}
  else check(await dialog().getByLabel('关联首First3D MaxSteps',{exact:true}).inputValue()==='',`${mode.name}留空未附入步骤默认`);
  const example=responseFor(mode.variant,{MaxSteps:512,MaxStepSize:.02});await dialog().getByRole('button',{name:'采用首段步控制示例',exact:true}).click();const r=await(await example).json();await ready();
  check(r.first3DIntegration.controlledStages.length===1&&r.first3DIntegration.controlledStages[0]==='NRecoverDarboux3D'&&!r.first3DIntegration.interpolationAndRootStagesControlled,`${mode.name}仅真实First3D恢复阶段受原步选项控制`);
  check(r.first3DIntegration.stepOptions.forwardParameters.at(-1)===(r.query.parameterEnd??Math.PI),`${mode.name}完整原s终点未缩窄`);
  check(await dialog().locator('.huffman-panels svg').count()===2,`${mode.name}实际生成完整二维/三维构形`);
  check((await dialog().getByTestId('linked-first3d-step-usage').innerText()).includes(String(r.first3DIntegration.stepOptions.forwardSteps)),`${mode.name}显示实际成功步数`);
  check(r.certification.adoptableCreasePattern===false,`${mode.name}原CP/FOLD未证范围保持`);
  const input=await dialog().getByLabel('关联首First3D MaxStepSize',{exact:true}).boundingBox(),button=await dialog().getByRole('button',{name:'采用首段步控制示例',exact:true}).boundingBox();check(input&&button&&button.y>=input.y+input.height,`${mode.name}步长输入和示例按钮分行`);
  await capture(mode.name+'-example',r);await save(mode.name+'-example-source','保存参数');await save(mode.name+'-example-result','导出完整结果');
  const picture=await dialog().locator('.huffman-panels').innerHTML(),reimport=responseFor(mode.variant,{MaxSteps:512,MaxStepSize:.02});await dialog().getByLabel(mode.file,{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/${mode.name}-example-source.json`);await reimport;await ready();
  check(await dialog().locator('.huffman-panels').innerHTML()===picture,`${mode.name}实际下载来源再导入保持原图`);
  const editing=responseFor(mode.variant,{MaxSteps:512,MaxStepSize:.01});await dialog().getByLabel('关联首First3D MaxStepSize',{exact:true}).fill('.01');const changed=await(await editing).json();await ready();
  check(changed.first3DIntegration.stepOptions.forwardSteps>r.first3DIntegration.stepOptions.forwardSteps,`${mode.name}编辑原步长确实增加成功步数`);
  await capture(mode.name+'-edited',changed);await save(mode.name+'-edited-source','保存参数');await save(mode.name+'-edited-result','导出完整结果');
  const failing=responseFor(mode.variant,{MaxSteps:1,MaxStepSize:.01});await dialog().getByLabel('关联首First3D MaxSteps',{exact:true}).fill('1');const failed=await failing;await invalid();
  check(failed.status()===422&&(await failed.json()).error.includes('max-steps-exceeded'),`${mode.name}原首段预算不足真实拒绝`);
  check(await dialog().locator('.huffman-panels svg').count()===0&&await dialog().getByRole('button',{name:'导出完整结果',exact:true}).isDisabled(),`${mode.name}失败清空旧图并禁用完整结果下载`);
  const recovering=responseFor(mode.variant,{MaxSteps:512,MaxStepSize:.02});await dialog().getByRole('button',{name:'采用首段步控制示例',exact:true}).click();await recovering;await ready();
  check(await dialog().locator('.huffman-panels svg').count()===2,`${mode.name}失败后可按原数据重新构造`);
 }
 await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/desktop.png',fullPage:true});await page.setViewportSize({width:640,height:960});
 await dialog().getByLabel('关联首First3D MaxStepSize',{exact:true}).scrollIntoViewIfNeeded();const box=await dialog().getByLabel('关联首First3D MaxStepSize',{exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗真实首段步骤输入可操作');
 await dialog().getByRole('button',{name:'导出完整结果',exact:true}).scrollIntoViewIfNeeded();const exportBox=await dialog().getByRole('button',{name:'导出完整结果',exact:true}).boundingBox();check(exportBox&&exportBox.x>=0&&exportBox.x+exportBox.width<=640&&exportBox.y>=0&&exportBox.y+exportBox.height<=960,'窄窗完整结果实际导出可操作');
 await page.screenshot({path:'D:/codex/折纸工具/workbench/output/original-linked-first3d-browser-1010/mobile.png',fullPage:true});await page.setViewportSize({width:1380,height:900});
 const resetting=responseFor('generic-common-parameter',null);await dialog().getByRole('button',{name:'恢复起始函数',exact:true}).click();const old=await(await resetting).json();await ready();check(!old.first3DIntegration&&!old.query.ndsolveOptions,'恢复起始函数精确回到无opts公共结果');
 check(errors.length===0,'零页面运行异常');return {passed:checks.length,checks,errors};
}
